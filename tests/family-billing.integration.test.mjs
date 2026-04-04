import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const billingHandler = require("../api/billing.js");
const { createAuthenticatedSession } = require("../api/auth/_session.js");
const { __resetFirebaseAdminForTests } = require("../api/_firebase-admin.js");
const { __resetStripeStoreForTests, saveStripeBillingProfile, getStripeBillingProfile } = require("../api/stripe/_store.js");
const { __resetFamilyStoreForTests } = require("../api/stripe/_family-store.js");
const originalFetch = global.fetch;

const originalEnv = {
  APP_SESSION_SECRET: process.env.APP_SESSION_SECRET,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_PRICE_FAMILY_MONTHLY: process.env.STRIPE_PRICE_FAMILY_MONTHLY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
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

function buildAuthCookie({ userId, email, displayName }) {
  const req = createMockRequest({ headers: { "x-forwarded-proto": "https" } });
  const res = createMockResponse();
  createAuthenticatedSession(req, res, {
    userId,
    firebaseUid: userId,
    email,
    displayName,
  });
  return String(res.getHeader("set-cookie") || "").split(";")[0];
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
  process.env.APP_SESSION_SECRET = "family_billing_secret";
  process.env.STRIPE_SECRET_KEY = "sk_test_family";
  process.env.STRIPE_PRICE_FAMILY_MONTHLY = "price_family_monthly";
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.EMAIL_REPLY_TO;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  delete process.env.FIREBASE_PRIVATE_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  global.fetch = originalFetch;
  __resetFirebaseAdminForTests();
  __resetStripeStoreForTests();
  __resetFamilyStoreForTests();
});

test.after(() => {
  restoreEnv();
  global.fetch = originalFetch;
  __resetFirebaseAdminForTests();
  __resetStripeStoreForTests();
  __resetFamilyStoreForTests();
});

test("family summary requires a Google-authenticated session", async () => {
  const { res, json } = await invoke({
    method: "GET",
    url: "/api/stripe/family-summary",
  });

  assert.equal(res.statusCode, 401);
  assert.equal(json.code, "auth_required");
});

test("family summary provisions a family account for active family billing", async () => {
  await saveStripeBillingProfile("usr_owner", {
    entitlements: { familyPremium: true, schoolLicense: false },
    activePlanId: "family-monthly",
  });

  const { res, json } = await invoke({
    method: "GET",
    url: "/api/stripe/family-summary",
    headers: {
      cookie: buildAuthCookie({
        userId: "usr_owner",
        email: "parent@example.com",
        displayName: "Parent",
      }),
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.equal(json.family.ownerUserId, "usr_owner");
  assert.equal(json.family.status, "active");
  assert.equal(json.family.members.length, 1);
  assert.equal(json.family.members[0].role, "owner");
});

test("family invite, accept, and remove flow updates billing access", async () => {
  await saveStripeBillingProfile("usr_owner", {
    entitlements: { familyPremium: true, schoolLicense: false },
    activePlanId: "family-monthly",
  });

  const ownerCookie = buildAuthCookie({
    userId: "usr_owner",
    email: "parent@example.com",
    displayName: "Parent",
  });

  const inviteResponse = await invoke({
    method: "POST",
    url: "/api/stripe/family-invite",
    headers: { cookie: ownerCookie },
    body: { email: "kid@example.com" },
  });

  assert.equal(inviteResponse.res.statusCode, 200);
  assert.equal(inviteResponse.json.ok, true);
  assert.equal(inviteResponse.json.invite.email, "kid@example.com");
  assert.equal(inviteResponse.json.email.skipped, true);

  const memberCookie = buildAuthCookie({
    userId: "usr_child",
    email: "kid@example.com",
    displayName: "Kid",
  });

  const acceptResponse = await invoke({
    method: "POST",
    url: "/api/stripe/family-accept-invite",
    headers: { cookie: memberCookie },
    body: { token: inviteResponse.json.invite.id },
  });

  assert.equal(acceptResponse.res.statusCode, 200);
  assert.equal(acceptResponse.json.ok, true);
  assert.equal(acceptResponse.json.family.members.length, 2);

  const memberProfile = await getStripeBillingProfile("usr_child");
  assert.equal(memberProfile.entitlements.familyPremium, true);
  assert.equal(memberProfile.familyAccountId.length > 0, true);
  assert.equal(memberProfile.familyRole, "member");

  const removeResponse = await invoke({
    method: "POST",
    url: "/api/stripe/family-remove-member",
    headers: { cookie: ownerCookie },
    body: { memberUserId: "usr_child" },
  });

  assert.equal(removeResponse.res.statusCode, 200);
  assert.equal(removeResponse.json.ok, true);
  assert.equal(removeResponse.json.family.members.length, 1);

  const clearedProfile = await getStripeBillingProfile("usr_child");
  assert.equal(clearedProfile.entitlements.familyPremium, false);
  assert.equal(clearedProfile.familyAccountId, "");
  assert.equal(clearedProfile.familyRole, "");
});

test("family owners can resend and revoke pending invites while seat counts stay accurate", async () => {
  await saveStripeBillingProfile("usr_owner", {
    entitlements: { familyPremium: true, schoolLicense: false },
    activePlanId: "family-monthly",
  });

  const ownerCookie = buildAuthCookie({
    userId: "usr_owner",
    email: "parent@example.com",
    displayName: "Parent",
  });

  const inviteResponse = await invoke({
    method: "POST",
    url: "/api/stripe/family-invite",
    headers: { cookie: ownerCookie },
    body: { email: "sibling@example.com" },
  });

  assert.equal(inviteResponse.res.statusCode, 200);
  assert.equal(inviteResponse.json.invite.status, "pending");
  assert.equal(inviteResponse.json.family.pendingInviteCount, 1);
  assert.equal(inviteResponse.json.family.reservedSeatCount, 2);

  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Ai and Sons <hello@aiandsons.io>";
  global.fetch = async (url, options = {}) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.method, "POST");
    return {
      ok: true,
      json: async () => ({ id: "re_mail_123" }),
    };
  };

  const resendResponse = await invoke({
    method: "POST",
    url: "/api/stripe/family-resend-invite",
    headers: { cookie: ownerCookie },
    body: { inviteId: inviteResponse.json.invite.id },
  });

  assert.equal(resendResponse.res.statusCode, 200);
  assert.equal(resendResponse.json.ok, true);
  assert.equal(resendResponse.json.email.delivery.status, "sent");
  assert.equal(resendResponse.json.family.pendingInviteCount, 1);
  assert.equal(resendResponse.json.family.reservedSeatCount, 2);
  assert.equal(resendResponse.json.invite.lastEmailDelivery.status, "sent");

  const revokeResponse = await invoke({
    method: "POST",
    url: "/api/stripe/family-revoke-invite",
    headers: { cookie: ownerCookie },
    body: { inviteId: inviteResponse.json.invite.id },
  });

  assert.equal(revokeResponse.res.statusCode, 200);
  assert.equal(revokeResponse.json.ok, true);
  assert.equal(revokeResponse.json.revokedInviteId, inviteResponse.json.invite.id);
  assert.equal(revokeResponse.json.family.pendingInviteCount, 0);
  assert.equal(revokeResponse.json.family.reservedSeatCount, 1);
  assert.equal(revokeResponse.json.family.seatsRemaining, 4);
  assert.equal(
    revokeResponse.json.family.invites.find((invite) => invite.id === inviteResponse.json.invite.id)?.status,
    "revoked",
  );
});
