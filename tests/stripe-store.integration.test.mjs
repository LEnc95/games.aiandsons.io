import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { __resetFirebaseAdminForTests } = require("../api/_firebase-admin.js");
const {
  __resetStripeStoreForTests,
  createDefaultBillingProfile,
  getStripeBillingProfile,
  saveStripeBillingProfile,
  bindUserToStripeCustomer,
  getUserIdForStripeCustomer,
  listStripeBillingProfiles,
  hasProcessedStripeWebhookEvent,
  markStripeWebhookEventProcessed,
} = require("../api/stripe/_store.js");

const originalKvUrl = process.env.KV_REST_API_URL;
const originalKvToken = process.env.KV_REST_API_TOKEN;
const originalFirebaseEnv = {
  FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64,
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
};

test.beforeEach(() => {
  process.env.KV_REST_API_URL = "";
  process.env.KV_REST_API_TOKEN = "";
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  delete process.env.FIREBASE_PRIVATE_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  __resetFirebaseAdminForTests();
  __resetStripeStoreForTests();
});

test.after(() => {
  process.env.KV_REST_API_URL = originalKvUrl;
  process.env.KV_REST_API_TOKEN = originalKvToken;
  for (const [key, value] of Object.entries(originalFirebaseEnv)) {
    if (typeof value === "string") process.env[key] = value;
    else delete process.env[key];
  }
  __resetFirebaseAdminForTests();
  __resetStripeStoreForTests();
});

test("createDefaultBillingProfile returns safe baseline", () => {
  const profile = createDefaultBillingProfile("usr_demo");
  assert.deepEqual(profile, {
    userId: "usr_demo",
    customerId: "",
    customerEmail: "",
    entitlements: {
      familyPremium: false,
      schoolLicense: false,
    },
    activePlanId: "",
    subscriptionId: "",
    subscriptionStatus: "",
    priceId: "",
    billingInterval: "",
    subscriptions: [],
    currentPeriodStart: 0,
    currentPeriodEnd: 0,
    cancelAtPeriodEnd: false,
    cancelAt: 0,
    canceledAt: 0,
    trialEnd: 0,
    latestInvoiceId: "",
    latestInvoiceStatus: "",
    lastPaymentFailureAt: 0,
    graceUntil: 0,
    checkoutSessionId: "",
    familyAccountId: "",
    familyRole: "",
    familyOwnerUserId: "",
    seatLimit: 0,
    seatCount: 0,
    notificationPrefs: {
      billingEmail: true,
      productEmail: true,
      familyInvites: true,
    },
    updatedAt: 0,
    lastSource: "",
  });
});

test("saveStripeBillingProfile persists normalized shape and customer mapping", async () => {
  const saved = await saveStripeBillingProfile("usr_demo", {
    customerId: "cus_abc123",
    customerEmail: "Parent@Example.com ",
    entitlements: {
      familyPremium: true,
      schoolLicense: false,
    },
    activePlanId: "family-monthly",
    subscriptionId: "sub_demo",
    subscriptionStatus: "active",
    priceId: "price_family_monthly",
    billingInterval: "month",
    subscriptions: [
      {
        id: "sub_demo",
        status: "active",
        currentPeriodStart: 1200.2,
        currentPeriodEnd: 1234.9,
        cancelAtPeriodEnd: 1,
        latestInvoiceId: "in_123",
        latestInvoiceStatus: "paid",
        priceIds: ["price_family_monthly"],
        plans: ["family-monthly"],
        entitled: true,
      },
    ],
    currentPeriodStart: 1200.2,
    currentPeriodEnd: 1234.9,
    cancelAtPeriodEnd: true,
    latestInvoiceId: "in_123",
    latestInvoiceStatus: "paid",
    seatLimit: 5.9,
    seatCount: 2.4,
    notificationPrefs: {
      productEmail: false,
    },
  });

  assert.equal(saved.userId, "usr_demo");
  assert.equal(saved.customerId, "cus_abc123");
  assert.equal(saved.customerEmail, "parent@example.com");
  assert.equal(saved.entitlements.familyPremium, true);
  assert.equal(saved.activePlanId, "family-monthly");
  assert.equal(saved.subscriptionId, "sub_demo");
  assert.equal(saved.subscriptionStatus, "active");
  assert.equal(saved.priceId, "price_family_monthly");
  assert.equal(saved.billingInterval, "month");
  assert.equal(saved.subscriptions.length, 1);
  assert.equal(saved.subscriptions[0].currentPeriodStart, 1200);
  assert.equal(saved.subscriptions[0].currentPeriodEnd, 1234);
  assert.equal(saved.subscriptions[0].cancelAtPeriodEnd, true);
  assert.equal(saved.subscriptions[0].latestInvoiceId, "in_123");
  assert.equal(saved.subscriptions[0].entitled, true);
  assert.equal(saved.seatLimit, 5);
  assert.equal(saved.seatCount, 2);
  assert.equal(saved.notificationPrefs.billingEmail, true);
  assert.equal(saved.notificationPrefs.productEmail, false);
  assert.ok(saved.updatedAt > 0);

  const loaded = await getStripeBillingProfile("usr_demo");
  assert.equal(loaded.customerId, "cus_abc123");
  assert.equal(loaded.latestInvoiceStatus, "paid");

  const mappedUserId = await getUserIdForStripeCustomer("cus_abc123");
  assert.equal(mappedUserId, "usr_demo");
});

test("bindUserToStripeCustomer updates profile and customer lookup", async () => {
  await bindUserToStripeCustomer({
    userId: "usr_bind",
    customerId: "cus_bind",
    customerEmail: "teacher@school.org",
  });

  const profile = await getStripeBillingProfile("usr_bind");
  assert.equal(profile.customerId, "cus_bind");
  assert.equal(profile.customerEmail, "teacher@school.org");

  const mappedUserId = await getUserIdForStripeCustomer("cus_bind");
  assert.equal(mappedUserId, "usr_bind");
});

test("listStripeBillingProfiles can focus on active customer-backed profiles", async () => {
  await saveStripeBillingProfile("usr_active", {
    customerId: "cus_active",
    customerEmail: "active@example.com",
    entitlements: {
      familyPremium: true,
      schoolLicense: false,
    },
    activePlanId: "family-monthly",
    subscriptionId: "sub_active",
    subscriptionStatus: "active",
  });
  await saveStripeBillingProfile("usr_customer_only", {
    customerId: "cus_only",
    customerEmail: "customer@example.com",
  });
  await saveStripeBillingProfile("usr_guest", {
    customerEmail: "guest@example.com",
  });

  const withCustomersOnly = await listStripeBillingProfiles({ withCustomerOnly: true });
  assert.deepEqual(
    withCustomersOnly.map((profile) => profile.userId).sort(),
    ["usr_active", "usr_customer_only"],
  );

  const activeOnly = await listStripeBillingProfiles({ withCustomerOnly: true, activeOnly: true });
  assert.deepEqual(activeOnly.map((profile) => profile.userId), ["usr_active"]);
});

test("webhook processed markers can be set and queried", async () => {
  const eventId = "evt_test_1";
  assert.equal(await hasProcessedStripeWebhookEvent(eventId), false);
  await markStripeWebhookEventProcessed(eventId);
  assert.equal(await hasProcessedStripeWebhookEvent(eventId), true);
});
