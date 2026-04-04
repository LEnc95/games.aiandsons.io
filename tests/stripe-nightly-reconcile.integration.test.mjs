import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTargetsFromProfiles,
  parseArgs,
  summarizeNightlyResults,
} from "../scripts/stripe/nightly-reconcile.mjs";

test("parseArgs reads nightly reconcile flags", () => {
  const options = parseArgs([
    "--base-url", "https://games.aiandsons.io",
    "--admin-token", "tok_test",
    "--dry-run", "true",
    "--limit", "40",
    "--output", "output/custom.json",
    "--timeout-ms", "9000",
  ]);

  assert.deepEqual(options, {
    baseUrl: "https://games.aiandsons.io",
    adminToken: "tok_test",
    dryRun: true,
    limit: 40,
    output: "output/custom.json",
    timeoutMs: 9000,
    help: false,
  });
});

test("buildTargetsFromProfiles keeps unique customer-backed users only", () => {
  const targets = buildTargetsFromProfiles([
    { userId: "usr_one", customerId: "cus_one", activePlanId: "family-monthly", subscriptionStatus: "active" },
    { userId: "usr_one", customerId: "cus_one_dup", activePlanId: "family-monthly", subscriptionStatus: "active" },
    { userId: "usr_two", customerId: "", activePlanId: "school-monthly" },
    { userId: "usr_three", customerId: "cus_three", activePlanId: "school-monthly", subscriptionStatus: "past_due" },
  ], 10);

  assert.deepEqual(targets, [
    {
      kind: "user",
      id: "usr_one",
      customerId: "cus_one",
      activePlanId: "family-monthly",
      subscriptionStatus: "active",
      customerEmail: "",
      updatedAt: 0,
    },
    {
      kind: "user",
      id: "usr_three",
      customerId: "cus_three",
      activePlanId: "school-monthly",
      subscriptionStatus: "past_due",
      customerEmail: "",
      updatedAt: 0,
    },
  ]);
});

test("summarizeNightlyResults counts each reconcile bucket", () => {
  const summary = summarizeNightlyResults([
    { status: "repaired" },
    { status: "unchanged" },
    { status: "unbound" },
    { status: "failed" },
    { status: "failed" },
  ]);

  assert.deepEqual(summary, {
    processed: 5,
    repaired: 1,
    unchanged: 1,
    unbound: 1,
    failed: 2,
  });
});
