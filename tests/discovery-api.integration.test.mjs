import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const eventsHandler = require("../api/discovery/events.js");
const rankingsHandler = require("../api/discovery/rankings.js");
const { __resetFirebaseAdminForTests } = require("../api/_firebase-admin.js");
const { __resetDiscoveryStoreForTests } = require("../api/discovery/_store.js");

const originalEnv = {
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
  for (const key of Object.keys(originalEnv)) {
    delete process.env[key];
  }
  __resetFirebaseAdminForTests();
  __resetDiscoveryStoreForTests();
}

function createMockRequest({ method = "GET", url = "/", body = undefined } = {}) {
  const chunks = [];
  if (body !== undefined) {
    chunks.push(Buffer.from(JSON.stringify(body)));
  }
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = {};
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
    body,
  };
}

async function invoke(handler, options = {}) {
  const req = createMockRequest(options);
  const res = createMockResponse();
  await handler(req, res);
  return {
    res,
    json: res.body ? JSON.parse(res.body) : null,
  };
}

beforeEach(() => {
  forceMemoryStore();
});

afterEach(() => {
  restoreEnv();
  __resetFirebaseAdminForTests();
  __resetDiscoveryStoreForTests();
});

test("rankings endpoint returns curated fallback without Firebase", async () => {
  const { res, json } = await invoke(rankingsHandler, {
    method: "GET",
    url: "/api/discovery/rankings?limit=6",
  });

  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.equal(json.source, "curated");
  assert.ok(Array.isArray(json.trending));
  assert.ok(Array.isArray(json.topPlayed));
  assert.ok(json.trending.length > 0);
  assert.ok(json.topPlayed.length > 0);
});

test("valid launch events increment anonymous memory rankings", async () => {
  for (const slug of ["tetris", "tetris", "pacman"]) {
    const { res, json } = await invoke(eventsHandler, {
      method: "POST",
      url: "/api/discovery/events",
      body: {
        event: "game_launch_clicked",
        slug,
        source: "trending",
      },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(json.ok, true);
    assert.equal(json.source, "memory");
  }

  const { json } = await invoke(rankingsHandler, {
    method: "GET",
    url: "/api/discovery/rankings?limit=8",
  });

  assert.equal(json.source, "memory");
  assert.equal(json.topPlayed[0].slug, "tetris");
  assert.equal(json.trending[0].slug, "tetris");
  assert.ok(json.topPlayed.some((item) => item.slug === "pacman"));
});

test("launch events reject invalid slugs and event names", async () => {
  const invalidSlug = await invoke(eventsHandler, {
    method: "POST",
    url: "/api/discovery/events",
    body: {
      event: "game_launch_clicked",
      slug: "not-a-game",
      source: "trending",
    },
  });

  assert.equal(invalidSlug.res.statusCode, 400);
  assert.equal(invalidSlug.json.code, "invalid_game");

  const invalidEvent = await invoke(eventsHandler, {
    method: "POST",
    url: "/api/discovery/events",
    body: {
      event: "page_view",
      slug: "tetris",
      source: "trending",
    },
  });

  assert.equal(invalidEvent.res.statusCode, 400);
  assert.equal(invalidEvent.json.code, "invalid_event");
});

test("discovery endpoints enforce allowed methods", async () => {
  const postRankings = await invoke(rankingsHandler, {
    method: "POST",
    url: "/api/discovery/rankings",
  });
  const getEvents = await invoke(eventsHandler, {
    method: "GET",
    url: "/api/discovery/events",
  });

  assert.equal(postRankings.res.statusCode, 405);
  assert.equal(postRankings.json.code, "method_not_allowed");
  assert.equal(getEvents.res.statusCode, 405);
  assert.equal(getEvents.json.code, "method_not_allowed");
});
