import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_BILLING_CONFIG,
  normalizeBillingConfig,
  isStripeBillingEnabled,
  applyStripeEntitlementSnapshot,
} from "../src/core/billing.js";

test("normalizeBillingConfig falls back to local mode for invalid payloads", () => {
  assert.deepEqual(normalizeBillingConfig(null), DEFAULT_BILLING_CONFIG);
  assert.deepEqual(
    normalizeBillingConfig({ provider: "stripe", enabled: true, supportedPlans: [] }),
    {
      provider: "stripe",
      enabled: false,
      mode: "local",
      customerPortalEnabled: false,
      webhookConfigured: false,
      supportedPlans: [],
    },
  );
});

test("normalizeBillingConfig accepts configured stripe payload", () => {
  const normalized = normalizeBillingConfig({
    provider: "stripe",
    enabled: true,
    mode: "test",
    customerPortalEnabled: true,
    webhookConfigured: true,
    supportedPlans: ["family-monthly", "family-annual", "unknown-plan", "family-monthly"],
  });

  assert.deepEqual(normalized, {
    provider: "stripe",
    enabled: true,
    mode: "test",
    customerPortalEnabled: true,
    webhookConfigured: true,
    supportedPlans: ["family-monthly", "family-annual"],
  });
});

test("isStripeBillingEnabled follows normalized config state", () => {
  assert.equal(isStripeBillingEnabled({ provider: "local", enabled: true }), false);
  assert.equal(isStripeBillingEnabled({
    provider: "stripe",
    enabled: true,
    supportedPlans: ["family-monthly"],
  }), true);
});

test("applyStripeEntitlementSnapshot maps stripe summary to local entitlement shape", () => {
  const previousStorage = globalThis.localStorage;
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };

  try {
    const next = applyStripeEntitlementSnapshot({
      mode: "stripe",
      entitlements: {
        familyPremium: true,
        schoolLicense: true,
      },
      activePlanId: "school-monthly",
    });

    assert.equal(next.familyPremium, true);
    assert.equal(next.schoolLicense, true);
    assert.equal(next.checkout.status, "active");
    assert.equal(next.checkout.planId, "school-monthly");
  } finally {
    if (previousStorage) {
      globalThis.localStorage = previousStorage;
    } else {
      delete globalThis.localStorage;
    }
  }
});
