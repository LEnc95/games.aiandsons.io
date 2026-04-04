import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBillingOverviewModel,
  describeBillingPlan,
  formatBillingDate,
} from "../src/auth/view-models.js";

test("describeBillingPlan maps known plan ids to friendly labels", () => {
  assert.equal(describeBillingPlan("family-annual"), "Family Annual");
  assert.equal(describeBillingPlan("custom-school-plus"), "Custom School Plus");
});

test("formatBillingDate accepts Stripe seconds timestamps", () => {
  assert.equal(formatBillingDate(1772236800), "Feb 28, 2026");
});

test("buildBillingOverviewModel summarizes active renewal state", () => {
  const model = buildBillingOverviewModel({
    billingEnabled: true,
    billing: {
      activePlanId: "family-monthly",
      subscriptionId: "sub_family_123",
      subscriptionStatus: "active",
      billingInterval: "month",
      currentPeriodEnd: 1772236800,
      customerEmail: "parent@example.com",
      entitlements: {
        familyPremium: true,
        schoolLicense: false,
      },
    },
  });

  assert.equal(model.tone, "");
  assert.equal(model.canManageBilling, true);
  assert.match(model.statusMessage, /Family Monthly/);
  assert.match(model.statusMessage, /Feb 28, 2026/);
  assert.equal(model.cards[0]?.title, "Family Monthly");
});

test("buildBillingOverviewModel summarizes grace-period billing issues", () => {
  const model = buildBillingOverviewModel({
    billingEnabled: true,
    billing: {
      activePlanId: "family-monthly",
      subscriptionId: "sub_family_123",
      subscriptionStatus: "past_due",
      graceUntil: 1772323200000,
      latestInvoiceStatus: "open",
      lastPaymentFailureAt: 1771977600000,
      entitlements: {
        familyPremium: true,
        schoolLicense: false,
      },
    },
  });

  assert.equal(model.tone, "warning");
  assert.equal(model.canManageBilling, true);
  assert.match(model.statusMessage, /payment issue/i);
  assert.match(model.statusMessage, /Mar 1, 2026/);
  assert.equal(model.cards.at(-1)?.title, "Billing health");
});

test("buildBillingOverviewModel hides billing management when no paid plan exists", () => {
  const model = buildBillingOverviewModel({
    billingEnabled: true,
    billing: {
      entitlements: {
        familyPremium: false,
        schoolLicense: false,
      },
    },
  });

  assert.equal(model.canManageBilling, false);
  assert.match(model.statusMessage, /No paid plan/);
});
