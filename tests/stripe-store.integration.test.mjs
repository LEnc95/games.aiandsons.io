import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  __resetStripeStoreForTests,
  createDefaultBillingProfile,
  getStripeBillingProfile,
  saveStripeBillingProfile,
  bindUserToStripeCustomer,
  getUserIdForStripeCustomer,
  hasProcessedStripeWebhookEvent,
  markStripeWebhookEventProcessed,
} = require("../api/stripe/_store.js");

const originalKvUrl = process.env.KV_REST_API_URL;
const originalKvToken = process.env.KV_REST_API_TOKEN;

test.beforeEach(() => {
  process.env.KV_REST_API_URL = "";
  process.env.KV_REST_API_TOKEN = "";
  __resetStripeStoreForTests();
});

test.after(() => {
  process.env.KV_REST_API_URL = originalKvUrl;
  process.env.KV_REST_API_TOKEN = originalKvToken;
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
    subscriptions: [],
    checkoutSessionId: "",
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
    subscriptions: [
      {
        id: "sub_demo",
        status: "active",
        currentPeriodEnd: 1234.9,
        plans: ["family-monthly"],
      },
    ],
  });

  assert.equal(saved.userId, "usr_demo");
  assert.equal(saved.customerId, "cus_abc123");
  assert.equal(saved.customerEmail, "parent@example.com");
  assert.equal(saved.entitlements.familyPremium, true);
  assert.equal(saved.activePlanId, "family-monthly");
  assert.equal(saved.subscriptions.length, 1);
  assert.ok(saved.updatedAt > 0);

  const loaded = await getStripeBillingProfile("usr_demo");
  assert.equal(loaded.customerId, "cus_abc123");

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

test("webhook processed markers can be set and queried", async () => {
  const eventId = "evt_test_1";
  assert.equal(await hasProcessedStripeWebhookEvent(eventId), false);
  await markStripeWebhookEventProcessed(eventId);
  assert.equal(await hasProcessedStripeWebhookEvent(eventId), true);
});
