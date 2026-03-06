import test from "node:test";
import assert from "node:assert/strict";

import {
  parseArgs,
  parseIdFileContent,
  buildTargets,
  classifyReconcileResult,
} from "../scripts/stripe/reconcile-audit.mjs";

test("parseIdFileContent supports newline/comma tokens and de-duplicates", () => {
  const ids = parseIdFileContent(`\n# comment\nusr_1, usr_2\nusr_1\n cus_3 \n`);
  assert.deepEqual(ids, ["usr_1", "usr_2", "cus_3"]);
});

test("buildTargets creates deterministic user then customer target list", () => {
  const targets = buildTargets(["usr_a", "usr_b", "usr_a"], ["cus_1", "", "cus_1", "cus_2"]);
  assert.deepEqual(targets, [
    { kind: "user", id: "usr_a" },
    { kind: "user", id: "usr_b" },
    { kind: "customer", id: "cus_1" },
    { kind: "customer", id: "cus_2" },
  ]);
});

test("classifyReconcileResult maps changed/bound state into summary buckets", () => {
  assert.equal(classifyReconcileResult({ customerBound: false, changed: false }), "unbound");
  assert.equal(classifyReconcileResult({ customerBound: true, changed: true }), "repaired");
  assert.equal(classifyReconcileResult({ customerBound: true, changed: false }), "unchanged");
});

test("parseArgs reads dry-run and timeout flags", () => {
  const options = parseArgs([
    "--base-url", "https://example.com",
    "--dry-run", "false",
    "--timeout-ms", "9000",
    "--output", "output/custom.json",
  ]);

  assert.equal(options.baseUrl, "https://example.com");
  assert.equal(options.dryRun, false);
  assert.equal(options.timeoutMs, 9000);
  assert.equal(options.output, "output/custom.json");
});
