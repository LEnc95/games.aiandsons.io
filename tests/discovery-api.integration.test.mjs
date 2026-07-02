import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const socialHandler = require("../api/social.js");
const { __resetFirebaseAdminForTests } = require("../api/_firebase-admin.js");
const { __resetDiscoveryStoreForTests } = require("../api/discovery/_store.js");
const repoRoot = fileURLToPath(new URL("../", import.meta.url));

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

function listVercelFunctionEntrypoints(dir) {
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      entries.push(...listVercelFunctionEntrypoints(fullPath));
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name) !== ".js" || path.basename(entry.name).startsWith("_")) {
      continue;
    }
    entries.push(path.relative(repoRoot, fullPath).replace(/\\/g, "/"));
  }
  return entries.sort();
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
  const { res, json } = await invoke(socialHandler, {
    method: "GET",
    url: "/api/social?route=discovery-rankings&limit=6",
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
    const { res, json } = await invoke(socialHandler, {
      method: "POST",
      url: "/api/social?route=discovery-events",
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

  const { json } = await invoke(socialHandler, {
    method: "GET",
    url: "/api/social?route=discovery-rankings&limit=8",
  });

  assert.equal(json.source, "memory");
  assert.equal(json.topPlayed[0].slug, "tetris");
  assert.equal(json.trending[0].slug, "tetris");
  assert.ok(json.topPlayed.some((item) => item.slug === "pacman"));
});

test("launch events reject invalid slugs and event names", async () => {
  const invalidSlug = await invoke(socialHandler, {
    method: "POST",
    url: "/api/social?route=discovery-events",
    body: {
      event: "game_launch_clicked",
      slug: "not-a-game",
      source: "trending",
    },
  });

  assert.equal(invalidSlug.res.statusCode, 400);
  assert.equal(invalidSlug.json.code, "invalid_game");

  const invalidEvent = await invoke(socialHandler, {
    method: "POST",
    url: "/api/social?route=discovery-events",
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
  const postRankings = await invoke(socialHandler, {
    method: "POST",
    url: "/api/social?route=discovery-rankings",
  });
  const getEvents = await invoke(socialHandler, {
    method: "GET",
    url: "/api/social?route=discovery-events",
  });

  assert.equal(postRankings.res.statusCode, 405);
  assert.equal(postRankings.json.code, "method_not_allowed");
  assert.equal(getEvents.res.statusCode, 405);
  assert.equal(getEvents.json.code, "method_not_allowed");
});

test("Vercel function entrypoints stay within the Hobby plan limit", () => {
  const entrypoints = listVercelFunctionEntrypoints(path.join(repoRoot, "api"));
  assert.ok(
    entrypoints.length <= 12,
    `Expected at most 12 Vercel functions, found ${entrypoints.length}:\n${entrypoints.join("\n")}`,
  );
});

test("Vercel rewrites preserve public discovery API URLs", () => {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, "vercel.json"), "utf8"));
  const rewriteMap = new Map(config.rewrites.map((rewrite) => [rewrite.source, rewrite.destination]));

  assert.equal(rewriteMap.get("/api/discovery/events"), "/api/social?route=discovery-events");
  assert.equal(rewriteMap.get("/api/discovery/events/"), "/api/social?route=discovery-events");
  assert.equal(rewriteMap.get("/api/discovery/rankings"), "/api/social?route=discovery-rankings");
  assert.equal(rewriteMap.get("/api/discovery/rankings/"), "/api/social?route=discovery-rankings");
});
