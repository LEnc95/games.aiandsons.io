import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  summarizeEntitlementsFromSubscriptions,
} = require("../api/stripe/_shared.js");

const originalEnv = {
  STRIPE_PRICE_FAMILY_MONTHLY: process.env.STRIPE_PRICE_FAMILY_MONTHLY,
  STRIPE_PAST_DUE_GRACE_DAYS: process.env.STRIPE_PAST_DUE_GRACE_DAYS,
};

test.beforeEach(() => {
  delete process.env.STRIPE_PRICE_FAMILY_MONTHLY;
  delete process.env.STRIPE_PAST_DUE_GRACE_DAYS;
});

test.after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === "string") process.env[key] = value;
    else delete process.env[key];
  }
});

function createSubscription({
  status = "active",
  currentPeriodStart = 1_700_000_000,
  currentPeriodEnd = 1_700_086_400,
} = {}) {
  return {
    id: "sub_demo",
    status,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: false,
    items: {
      data: [
        {
          price: {
            id: "price_family_monthly",
            recurring: { interval: "month" },
          },
        },
      ],
    },
    latest_invoice: {
      id: "in_demo",
      status: status === "past_due" ? "open" : "paid",
    },
  };
}

test("summarizeEntitlementsFromSubscriptions keeps past_due family access during grace period", () => {
  process.env.STRIPE_PRICE_FAMILY_MONTHLY = "price_family_monthly";

  const summary = summarizeEntitlementsFromSubscriptions(
    [createSubscription({ status: "past_due", currentPeriodEnd: Math.floor(Date.now() / 1000) })],
    undefined,
    {
      graceUntil: Date.now() + 60_000,
      lastPaymentFailureAt: Date.now() - 5_000,
    },
  );

  assert.equal(summary.entitlements.familyPremium, true);
  assert.equal(summary.activePlanId, "family-monthly");
  assert.equal(summary.subscriptionStatus, "past_due");
  assert.ok(summary.graceUntil > Date.now());
  assert.equal(summary.priceId, "price_family_monthly");
  assert.equal(summary.billingInterval, "month");
});

test("summarizeEntitlementsFromSubscriptions expires past_due access after grace window", () => {
  process.env.STRIPE_PRICE_FAMILY_MONTHLY = "price_family_monthly";
  process.env.STRIPE_PAST_DUE_GRACE_DAYS = "7";
  const tenDaysAgoSeconds = Math.floor((Date.now() - (10 * 24 * 60 * 60 * 1000)) / 1000);

  const summary = summarizeEntitlementsFromSubscriptions(
    [createSubscription({ status: "past_due", currentPeriodEnd: tenDaysAgoSeconds })],
  );

  assert.equal(summary.entitlements.familyPremium, false);
  assert.equal(summary.activePlanId, "");
  assert.equal(summary.subscriptionStatus, "past_due");
  assert.ok(summary.graceUntil < Date.now());
});
