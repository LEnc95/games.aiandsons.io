import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

import { buildShareUrls, SHARE_TARGETS } from "../src/social/share.js";

const require = createRequire(import.meta.url);
const render = require("../api/share/_render.js");
const shareHandler = require("../api/share.js");
const { __resetSocialStoreForTests, saveChallenge, saveRoom } = require("../api/social/_store.js");

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

function mockRequest(url) {
  const req = Readable.from([]);
  req.method = "GET";
  req.url = url;
  req.headers = {};
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    ended: false,
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    },
    end(body) {
      this.body = body || "";
      this.ended = true;
    },
  };
}

test("buildShareUrls encodes url + text for every social target", () => {
  const urls = buildShareUrls({ url: "https://games.aiandsons.io/g/snake", text: "Play Snake!" });
  for (const target of SHARE_TARGETS) {
    assert.ok(urls[target.key], `missing url for ${target.key}`);
  }
  assert.match(urls.x, /twitter\.com\/intent\/tweet/);
  assert.ok(urls.x.includes(encodeURIComponent("https://games.aiandsons.io/g/snake")));
  assert.ok(urls.whatsapp.includes(encodeURIComponent("Play Snake!")));
  assert.match(urls.facebook, /facebook\.com\/sharer/);
  assert.match(urls.reddit, /reddit\.com\/submit/);
});

test("buildShareUrls tolerates missing text", () => {
  const urls = buildShareUrls({ url: "https://games.aiandsons.io/" });
  assert.ok(urls.telegram.includes(encodeURIComponent("https://games.aiandsons.io/")));
});

test("challenge landing embeds per-game card, score, handle, and redirect", () => {
  const html = render.buildChallengeLanding({
    id: "ch_abc123",
    gameSlug: "snake",
    gameName: "Snake",
    handle: "CosmicFox12",
    score: 1240,
  });
  assert.match(html, /property="og:image" content="https:\/\/games\.aiandsons\.io\/assets\/og\/snake\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /1,240/);
  assert.match(html, /CosmicFox12/);
  assert.match(html, /\/snake\?challenge=ch_abc123/);
});

test("room + game + fallback landings redirect sensibly", () => {
  assert.match(
    render.buildRoomLanding({ code: "1234", gameSlug: "tetris", gameName: "Tetris" }),
    /\/rooms\?code=1234/,
  );
  assert.match(
    render.buildGameLanding({ gameSlug: "pong", gameName: "Pong", desc: "Paddle game" }),
    /url=\/pong/,
  );
  assert.match(render.buildFallbackLanding({ redirectUrl: "/" }), /assets\/social-banner\.png/);
});

test("share handler renders a challenge landing from the store", async () => {
  forceMemoryStore();
  await saveChallenge({
    id: "ch_test1",
    gameSlug: "snake",
    playerId: "plr_1",
    handle: "SwiftWolf9",
    score: 999,
    createdAt: Date.now(),
    attempts: 0,
    beatenBy: [],
  });

  const res = mockResponse();
  await shareHandler(mockRequest("/api/share?type=challenge&id=ch_test1"), res);

  assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
  assert.match(res.body, /\/assets\/og\/snake\.png/);
  assert.match(res.body, /999/);
  assert.match(res.body, /challenge=ch_test1/);
});

test("share handler renders a room landing from the store", async () => {
  forceMemoryStore();
  await saveRoom({
    code: "4321",
    gameSlug: "tetris",
    hostPlayerId: "plr_1",
    status: "lobby",
    durationSeconds: 120,
    createdAt: Date.now(),
    players: {},
  });

  const res = mockResponse();
  await shareHandler(mockRequest("/api/share?type=room&id=4321"), res);
  assert.match(res.body, /\/assets\/og\/tetris\.png/);
  assert.match(res.body, /\/rooms\?code=4321/);
});

test("share handler renders a game landing for a known slug", async () => {
  const res = mockResponse();
  await shareHandler(mockRequest("/api/share?type=game&id=2048"), res);
  assert.match(res.body, /\/assets\/og\/2048\.png/);
  assert.match(res.body, /url=\/2048/);
});

test("share handler falls back gracefully for unknown ids", async () => {
  forceMemoryStore();
  const res = mockResponse();
  await shareHandler(mockRequest("/api/share?type=challenge&id=does-not-exist"), res);
  assert.equal(res.ended, true);
  assert.match(res.body, /assets\/social-banner\.png/);
});
