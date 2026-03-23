import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const billingHandler = require("../api/billing.js");

const originalEnv = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_FAMILY_MONTHLY: process.env.STRIPE_PRICE_FAMILY_MONTHLY,
  STRIPE_PRICE_FAMILY_ANNUAL: process.env.STRIPE_PRICE_FAMILY_ANNUAL,
  STRIPE_PRICE_SCHOOL_MONTHLY: process.env.STRIPE_PRICE_SCHOOL_MONTHLY,
  STRIPE_ADMIN_TOKEN: process.env.STRIPE_ADMIN_TOKEN,
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

async function invoke(options = {}) {
  const req = createMockRequest(options);
  const res = createMockResponse();
  await billingHandler(req, res);
  return {
    req,
    res,
    json: res.body ? JSON.parse(res.body) : null,
  };
}

test.beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_FAMILY_MONTHLY;
  delete process.env.STRIPE_PRICE_FAMILY_ANNUAL;
  delete process.env.STRIPE_PRICE_SCHOOL_MONTHLY;
  delete process.env.STRIPE_ADMIN_TOKEN;
});

test.after(() => {
  restoreEnv();
});

test("billing router serves stripe config from legacy path", async () => {
  const { res, json } = await invoke({
    method: "GET",
    url: "/api/stripe/config",
  });

  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.equal(json.provider, "local");
});

test("billing router accepts rewrite query routing", async () => {
  const { res, json } = await invoke({
    method: "GET",
    url: "/api/billing?route=config",
  });

  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.equal(json.provider, "local");
});

test("billing config enables Stripe when only school pricing is configured", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_demo";
  process.env.STRIPE_PRICE_SCHOOL_MONTHLY = "price_school_monthly";

  const { res, json } = await invoke({
    method: "GET",
    url: "/api/stripe/config",
  });

  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.equal(json.provider, "stripe");
  assert.equal(json.enabled, true);
  assert.deepEqual(json.supportedPlans, ["school-monthly"]);
});

test("billing router routes admin reconcile requests", async () => {
  const { res, json } = await invoke({
    method: "POST",
    url: "/api/stripe/admin/reconcile",
  });

  assert.equal(res.statusCode, 503);
  assert.equal(json.code, "admin_token_not_configured");
});

test("billing router rejects unknown routes", async () => {
  const { res, json } = await invoke({
    method: "GET",
    url: "/api/stripe/not-a-real-route",
  });

  assert.equal(res.statusCode, 404);
  assert.equal(json.code, "billing_route_not_found");
});
