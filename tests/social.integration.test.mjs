import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const socialHandler = require("../api/social.js");
const { __resetSocialStoreForTests, getRoom, saveRoom } = require("../api/social/_store.js");
const { signPlayerToken, getPeriodKey, getWeekKey } = require("../api/social/_shared.js");
const { createAuthenticatedSession } = require("../api/auth/_session.js");

const originalEnv = {
  APP_SESSION_SECRET: process.env.APP_SESSION_SECRET,
  NODE_ENV: process.env.NODE_ENV,
  FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64,
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}

function forceMemoryStore() {
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  delete process.env.FIREBASE_PRIVATE_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  delete process.env.NODE_ENV;
  __resetSocialStoreForTests();
}

function createMockRequest({ method = "POST", url = "/", body = undefined, headers = {} } = {}) {
  const chunks = [];
  if (body !== undefined) {
    chunks.push(Buffer.from(JSON.stringify(body)));
  }
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = { ...headers };
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}

function createMockResponse() {
  const headers = new Map();
  let body = "";
  return {
    statusCode: 200,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    end(chunk = "") {
      body += String(chunk || "");
      this.body = body;
    },
    get json() {
      try {
        return JSON.parse(body);
      } catch {
        return null;
      }
    },
  };
}

async function call(route, { method = "POST", body, headers, query = "" } = {}) {
  const req = createMockRequest({
    method,
    url: `/api/social?route=${route}${query}`,
    body,
    headers,
  });
  const res = createMockResponse();
  await socialHandler(req, res);
  return res;
}

async function registerPlayer() {
  const res = await call("player-register", { body: {} });
  assert.equal(res.statusCode, 200);
  const { player, token } = res.json;
  return { ...player, token };
}

function googleSessionCookie() {
  const fakeRes = createMockResponse();
  createAuthenticatedSession({ headers: {} }, fakeRes, {
    firebaseUid: "fuid_test_1",
    userId: "fuid_test_1",
    email: "kid@example.com",
    displayName: "Test Kid",
  });
  const setCookie = fakeRes.getHeader("set-cookie");
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return String(raw).split(";")[0];
}

test("unknown route returns 404", async () => {
  forceMemoryStore();
  const res = await call("not-a-route", { body: {} });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json.code, "social_route_not_found");
  restoreEnv();
});

test("player registration issues id, handle, and stable token", async () => {
  forceMemoryStore();
  const player = await registerPlayer();
  assert.ok(player.id.startsWith("plr_"));
  assert.ok(player.handle.length >= 5);
  assert.equal(player.token, signPlayerToken(player.id));

  const again = await call("player-register", {
    body: { playerId: player.id, token: player.token },
  });
  assert.equal(again.json.player.id, player.id);
  restoreEnv();
});

test("score submit rejects bad tokens and unknown games", async () => {
  forceMemoryStore();
  const player = await registerPlayer();

  const badToken = await call("score-submit", {
    body: { playerId: player.id, token: "nope", gameSlug: "snake", score: 10 },
  });
  assert.equal(badToken.statusCode, 401);

  const badGame = await call("score-submit", {
    body: { playerId: player.id, token: player.token, gameSlug: "not-a-game", score: 10 },
  });
  assert.equal(badGame.statusCode, 400);
  assert.equal(badGame.json.code, "invalid_game");
  restoreEnv();
});

test("score submit updates daily leaderboard and rank, keeps best score", async () => {
  forceMemoryStore();
  const alice = await registerPlayer();
  const bob = await registerPlayer();

  const first = await call("score-submit", {
    body: { playerId: alice.id, token: alice.token, gameSlug: "snake", score: 50 },
  });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json.daily.rank, 1);

  const second = await call("score-submit", {
    body: { playerId: bob.id, token: bob.token, gameSlug: "snake", score: 80 },
  });
  assert.equal(second.json.daily.rank, 1);

  // Alice submits a lower score; her best (50) should remain on the board.
  await call("score-submit", {
    body: { playerId: alice.id, token: alice.token, gameSlug: "snake", score: 10 },
  });

  const board = await call("leaderboard", { method: "GET", query: "&game=snake&period=daily" });
  assert.equal(board.statusCode, 200);
  assert.equal(board.json.top.length, 2);
  assert.equal(board.json.top[0].score, 80);
  assert.equal(board.json.top[1].score, 50);
  restoreEnv();
});

test("weekly period key looks like an ISO week", () => {
  const key = getWeekKey(Date.UTC(2026, 5, 10));
  assert.match(key, /^\d{4}-W\d{2}$/);
  assert.equal(getPeriodKey("alltime"), "all");
});

test("challenge create, fetch, and beat flow", async () => {
  forceMemoryStore();
  const creator = await registerPlayer();
  const rival = await registerPlayer();

  const created = await call("challenge-create", {
    body: { playerId: creator.id, token: creator.token, gameSlug: "tetris", score: 1000 },
  });
  assert.equal(created.statusCode, 200);
  const challenge = created.json.challenge;
  assert.ok(challenge.id.startsWith("ch_"));
  assert.equal(challenge.url, `/tetris?challenge=${challenge.id}`);

  const fetched = await call("challenge-get", { method: "GET", query: `&id=${challenge.id}` });
  assert.equal(fetched.json.challenge.score, 1000);

  const losing = await call("score-submit", {
    body: { playerId: rival.id, token: rival.token, gameSlug: "tetris", score: 500, challengeId: challenge.id },
  });
  assert.equal(losing.json.challenge.beaten, false);

  const winning = await call("score-submit", {
    body: { playerId: rival.id, token: rival.token, gameSlug: "tetris", score: 2000, challengeId: challenge.id },
  });
  assert.equal(winning.json.challenge.beaten, true);

  const after = await call("challenge-get", { method: "GET", query: `&id=${challenge.id}` });
  assert.equal(after.json.challenge.attempts, 2);
  assert.equal(after.json.challenge.beatenBy.length, 1);
  restoreEnv();
});

test("room lifecycle: create, join, start, score, finish", async () => {
  forceMemoryStore();
  const host = await registerPlayer();
  const guest = await registerPlayer();

  const created = await call("room-create", {
    body: { playerId: host.id, token: host.token, gameSlug: "flappy", durationSeconds: 60 },
  });
  assert.equal(created.statusCode, 200);
  const code = created.json.room.code;
  assert.match(code, /^\d{4}$/);
  assert.equal(created.json.room.status, "lobby");

  const joined = await call("room-join", {
    body: { playerId: guest.id, token: guest.token, code },
  });
  assert.equal(joined.json.room.players.length, 2);

  const guestStart = await call("room-start", {
    body: { playerId: guest.id, token: guest.token, code },
  });
  assert.equal(guestStart.statusCode, 403);

  const started = await call("room-start", {
    body: { playerId: host.id, token: host.token, code },
  });
  assert.equal(started.json.room.status, "racing");
  assert.ok(started.json.room.endsAt > started.json.room.startedAt);

  const scored = await call("room-score", {
    body: { playerId: guest.id, token: guest.token, code, score: 42 },
  });
  const guestRow = scored.json.room.players.find((p) => p.playerId === guest.id);
  assert.equal(guestRow.score, 42);

  // Lower score does not overwrite the best.
  await call("room-score", {
    body: { playerId: guest.id, token: guest.token, code, score: 5 },
  });
  const state1 = await call("room-state", { method: "GET", query: `&code=${code}` });
  const guestRow2 = state1.json.room.players.find((p) => p.playerId === guest.id);
  assert.equal(guestRow2.score, 42);

  // Force the clock past endsAt; next state poll flips to finished.
  const room = await getRoom(code);
  await saveRoom({ ...room, endsAt: Date.now() - 1000 });
  const state2 = await call("room-state", { method: "GET", query: `&code=${code}` });
  assert.equal(state2.json.room.status, "finished");
  restoreEnv();
});

test("score submit through a racing room updates the room scoreboard", async () => {
  forceMemoryStore();
  const host = await registerPlayer();

  const created = await call("room-create", {
    body: { playerId: host.id, token: host.token, gameSlug: "snake", durationSeconds: 120 },
  });
  const code = created.json.room.code;
  await call("room-start", { body: { playerId: host.id, token: host.token, code } });

  const submitted = await call("score-submit", {
    body: { playerId: host.id, token: host.token, gameSlug: "snake", score: 77, roomCode: code },
  });
  assert.equal(submitted.statusCode, 200);
  const hostRow = submitted.json.room.players.find((p) => p.playerId === host.id);
  assert.equal(hostRow.score, 77);
  assert.equal(hostRow.finished, true);
  restoreEnv();
});

test("cloud save requires a Google session, then round-trips data", async () => {
  forceMemoryStore();

  const denied = await call("sync-pull", { method: "GET" });
  assert.equal(denied.statusCode, 401);
  assert.equal(denied.json.code, "not_signed_in");

  const cookie = googleSessionCookie();
  const emptyPull = await call("sync-pull", { method: "GET", headers: { cookie } });
  assert.equal(emptyPull.statusCode, 200);
  assert.equal(emptyPull.json.save, null);

  const pushed = await call("sync-push", {
    headers: { cookie },
    body: { data: { coins: 120, badges: ["first-run"], bestScores: { snake: 50 } } },
  });
  assert.equal(pushed.statusCode, 200);

  const pulled = await call("sync-pull", { method: "GET", headers: { cookie } });
  assert.equal(pulled.json.save.data.coins, 120);
  assert.deepEqual(pulled.json.save.data.badges, ["first-run"]);
  assert.equal(pulled.json.save.data.bestScores.snake, 50);
  restoreEnv();
});

test("oversized cloud saves are rejected", async () => {
  forceMemoryStore();
  const cookie = googleSessionCookie();
  const huge = "x".repeat(70 * 1024);
  const res = await call("sync-push", {
    headers: { cookie },
    body: { data: { blob: huge } },
  });
  assert.equal(res.statusCode, 413);
  assert.equal(res.json.code, "save_too_large");
  restoreEnv();
});

test("handle reroll returns a fresh handle for a valid player", async () => {
  forceMemoryStore();
  const player = await registerPlayer();
  const res = await call("handle-reroll", {
    body: { playerId: player.id, token: player.token },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json.player.handle.length >= 5);
  restoreEnv();
});
