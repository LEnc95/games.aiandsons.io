import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const { __resetFirebaseAdminForTests } = require("../api/_firebase-admin.js");
const authHandler = require("../api/auth.js");

const originalEnv = {
  APP_SESSION_SECRET: process.env.APP_SESSION_SECRET,
  FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64,
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
  FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
  FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
  FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === "string") process.env[key] = value;
    else delete process.env[key];
  }
}

function createMockRequest({
  method = "GET",
  url = "/",
  headers = {},
  body = undefined,
} = {}) {
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
    body,
  };
}

async function invoke(handler, options = {}) {
  const req = createMockRequest(options);
  const res = createMockResponse();
  await handler(req, res);
  return {
    req,
    res,
    json: res.body ? JSON.parse(res.body) : null,
  };
}

test.beforeEach(() => {
  process.env.APP_SESSION_SECRET = "auth_session_test_secret";
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  delete process.env.FIREBASE_PRIVATE_KEY;
  delete process.env.FIREBASE_WEB_API_KEY;
  delete process.env.FIREBASE_API_KEY;
  delete process.env.FIREBASE_AUTH_DOMAIN;
  delete process.env.FIREBASE_APP_ID;
  delete process.env.FIREBASE_MESSAGING_SENDER_ID;
  delete process.env.FIREBASE_STORAGE_BUCKET;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  __resetFirebaseAdminForTests();
});

test.after(() => {
  restoreEnv();
  __resetFirebaseAdminForTests();
});

test("auth session bootstraps an anonymous signed session", async () => {
  const { res, json } = await invoke(authHandler, {
    method: "GET",
    url: "/api/auth/session",
  });

  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.equal(json.authType, "anonymous");
  assert.equal(json.isAuthenticated, false);
  assert.equal(json.userId.startsWith("usr_"), true);
  assert.equal(typeof res.getHeader("set-cookie"), "string");
});

test("logout rotates back to a fresh anonymous session", async () => {
  const first = await invoke(authHandler, {
    method: "GET",
    url: "/api/auth/session",
  });
  const firstCookie = String(first.res.getHeader("set-cookie") || "").split(";")[0];

  const second = await invoke(authHandler, {
    method: "POST",
    url: "/api/auth/logout",
    headers: {
      cookie: firstCookie,
    },
  });

  assert.equal(second.res.statusCode, 200);
  assert.equal(second.json.ok, true);
  assert.equal(second.json.authType, "anonymous");
  assert.equal(second.json.isAuthenticated, false);
  assert.equal(second.json.userId.startsWith("usr_"), true);
  assert.notEqual(second.json.userId, first.json.userId);
});

test("firebase config endpoint reports disabled when public config is missing", async () => {
  const { res, json } = await invoke(authHandler, {
    method: "GET",
    url: "/api/auth/firebase-config",
  });

  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.equal(json.enabled, false);
  assert.equal(json.config, null);
});
