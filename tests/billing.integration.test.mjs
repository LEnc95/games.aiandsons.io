import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_BILLING_CONFIG,
  normalizeBillingConfig,
  isStripeBillingEnabled,
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
