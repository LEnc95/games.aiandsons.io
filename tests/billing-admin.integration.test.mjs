import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const billingHandler = require("../api/billing.js");
const { saveStripeBillingProfile, __resetStripeStoreForTests } = require("../api/stripe/_store.js");
const {
  __resetFamilyStoreForTests,
  ensureFamilyAccountForOwner,
  createFamilyInvite,
  createEmailDeliveryRecord,
} = require("../api/stripe/_family-store.js");
const { __resetFirebaseAdminForTests } = require("../api/_firebase-admin.js");

const originalEnv = {
  STRIPE_ADMIN_TOKEN: process.env.STRIPE_ADMIN_TOKEN,
  FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64,
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === "string") process.env[key] = value;
    else delete process.env[key];
  }
}

function createMockRequest({ method = "GET", url = "/", headers = {}, body = undefined } = {}) {
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
    res,
    json: res.body ? JSON.parse(res.body) : null,
  };
}

test.beforeEach(() => {
  process.env.STRIPE_ADMIN_TOKEN = "billing_admin_secret";
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  delete process.env.FIREBASE_PRIVATE_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  __resetFirebaseAdminForTests();
  __resetStripeStoreForTests();
  __resetFamilyStoreForTests();
});

test.after(() => {
  restoreEnv();
  __resetFirebaseAdminForTests();
  __resetStripeStoreForTests();
  __resetFamilyStoreForTests();
});

test("billing admin lookup returns billing, family, invites, and email deliveries", async () => {
  await saveStripeBillingProfile("usr_owner", {
    customerId: "cus_lookup_1",
    customerEmail: "owner@example.com",
    entitlements: { familyPremium: true, schoolLicense: false },
    activePlanId: "family-monthly",
    subscriptionId: "sub_lookup_1",
    subscriptionStatus: "active",
    latestInvoiceId: "in_lookup_1",
  });

  const account = await ensureFamilyAccountForOwner({
    ownerUserId: "usr_owner",
    ownerEmail: "owner@example.com",
    ownerDisplayName: "Owner",
    planId: "family-monthly",
    status: "active",
    seatLimit: 5,
  });

  const invite = await createFamilyInvite({
    familyAccountId: account.id,
    createdByUserId: "usr_owner",
    email: "kid@example.com",
    baseOrigin: "https://games.aiandsons.test",
  });

  await createEmailDeliveryRecord({
    templateKey: "family-invite",
    familyAccountId: account.id,
    inviteId: invite.id,
    userId: "usr_owner",
    customerId: "cus_lookup_1",
    to: "kid@example.com",
    subject: "Invite",
    status: "sent",
  });

  const { res, json } = await invoke({
    method: "GET",
    url: "/api/stripe/admin/lookup?userId=usr_owner",
    headers: {
      "x-admin-token": "billing_admin_secret",
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.equal(json.resultCount, 1);
  assert.equal(json.matches[0].profile.customerId, "cus_lookup_1");
  assert.equal(json.matches[0].family.id, account.id);
  assert.equal(json.matches[0].family.invites.length, 1);
  assert.equal(json.matches[0].emailDeliveries[0].templateKey, "family-invite");
});

test("billing admin lookup requires a lookup query", async () => {
  const { res, json } = await invoke({
    method: "GET",
    url: "/api/stripe/admin/lookup",
    headers: {
      "x-admin-token": "billing_admin_secret",
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(json.code, "billing_lookup_query_required");
});

test("billing ops page exists", () => {
  assert.equal(fs.existsSync("C:/Users/Luke/Documents/GitHub/games.aiandsons.io/ops/billing/index.html"), true);
});
