import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  getEmailConfig,
  sendBillingCancellationScheduledEmail,
  sendBillingPaymentFailedEmail,
} = require("../api/_email.js");
const {
  __resetFamilyStoreForTests,
  listEmailDeliveries,
} = require("../api/stripe/_family-store.js");
const { __resetFirebaseAdminForTests } = require("../api/_firebase-admin.js");

const originalEnv = {
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
const originalFetch = global.fetch;

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === "string") process.env[key] = value;
    else delete process.env[key];
  }
}

test.beforeEach(() => {
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
  __resetFamilyStoreForTests();
});

test.after(() => {
  restoreEnv();
  global.fetch = originalFetch;
  __resetFirebaseAdminForTests();
  __resetFamilyStoreForTests();
});

test("billing payment failed email skips cleanly when Resend is not configured", async () => {
  assert.equal(getEmailConfig().enabled, false);

  const result = await sendBillingPaymentFailedEmail({
    to: "parent@example.com",
    planId: "family-monthly",
    graceUntil: Date.now() + 86400000,
    userId: "usr_parent",
    customerId: "cus_parent",
    subscriptionId: "sub_parent",
    invoiceId: "in_parent",
    eventId: "evt_parent_failed",
  });

  assert.equal(result.skipped, true);
  const deliveries = await listEmailDeliveries({ userId: "usr_parent" });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].templateKey, "billing-payment-failed");
  assert.equal(deliveries[0].status, "skipped");
  assert.equal(deliveries[0].eventId, "evt_parent_failed");
});

test("billing cancellation scheduled email posts to Resend and records metadata", async () => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Ai and Sons <hello@aiandsons.io>";
  process.env.EMAIL_REPLY_TO = "support@aiandsons.io";

  let request = null;
  global.fetch = async (url, options = {}) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({ id: "re_mail_billing_1" }),
    };
  };

  const result = await sendBillingCancellationScheduledEmail({
    to: "parent@example.com",
    planId: "family-annual",
    currentPeriodEnd: 1775558400,
    familyAccountId: "fam_lookup",
    userId: "usr_parent",
    customerId: "cus_parent",
    subscriptionId: "sub_parent",
    eventId: "evt_subscription_updated",
  });

  assert.equal(result.ok, true);
  assert.equal(request.url, "https://api.resend.com/emails");
  const payload = JSON.parse(String(request.options.body || "{}"));
  assert.equal(payload.reply_to, "support@aiandsons.io");
  assert.match(payload.subject, /family annual/i);

  const deliveries = await listEmailDeliveries({ userId: "usr_parent" });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].templateKey, "billing-cancel-scheduled");
  assert.equal(deliveries[0].status, "sent");
  assert.equal(deliveries[0].customerId, "cus_parent");
  assert.equal(deliveries[0].subscriptionId, "sub_parent");
});
