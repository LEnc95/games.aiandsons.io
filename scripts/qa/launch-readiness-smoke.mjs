import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "launch-readiness-e2e");
const SUMMARY_PATH = path.join(OUTPUT_DIR, "summary.json");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runNodeScript(scriptPath, baseUrl) {
  const result = spawnSync(process.execPath, [scriptPath, baseUrl], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    signal: result.signal || "",
  };
}

function readSummary(summaryPath) {
  const raw = fs.readFileSync(summaryPath, "utf8");
  return JSON.parse(raw);
}

async function main() {
  ensureDir(OUTPUT_DIR);
  const baseUrl = process.argv[2] || "http://127.0.0.1:4173";

  const checks = [
    {
      name: "feedback_inbox",
      script: "scripts/qa/feedback-smoke.mjs",
      summaryPath: path.join("output", "web-game", "feedback-e2e", "summary.json"),
    },
    {
      name: "discovery_launcher_shop",
      script: "scripts/qa/discovery-search-filter-smoke.mjs",
      summaryPath: path.join("output", "web-game", "discovery-filter-e2e", "summary.json"),
    },
    {
      name: "classroom_mode",
      script: "scripts/qa/classroom-mode-smoke.mjs",
      summaryPath: path.join("output", "web-game", "classroom-e2e", "summary.json"),
    },
    {
      name: "entitlements_shop",
      script: "scripts/qa/entitlements-shop-smoke.mjs",
      summaryPath: path.join("output", "web-game", "entitlements-shop-e2e", "summary.json"),
    },
    {
      name: "premium_track",
      script: "scripts/qa/premium-track-smoke.mjs",
      summaryPath: path.join("output", "web-game", "premium-track-e2e", "summary.json"),
    },
    {
      name: "onboarding_split",
      script: "scripts/qa/onboarding-split-smoke.mjs",
      summaryPath: path.join("output", "web-game", "onboarding-split-e2e", "summary.json"),
    },
    {
      name: "metrics_baseline",
      script: "scripts/qa/metrics-baseline-smoke.mjs",
      summaryPath: path.join("output", "web-game", "metrics-baseline-e2e", "summary.json"),
    },
  ];

  const summary = {
    baseUrl,
    checks: [],
    success: false,
  };

  for (const check of checks) {
    const execution = runNodeScript(check.script, baseUrl);
    if (execution.status !== 0) {
      summary.checks.push({
        name: check.name,
        pass: false,
        script: check.script,
        status: execution.status,
        stdout: execution.stdout.slice(-4000),
        stderr: execution.stderr.slice(-4000),
        signal: execution.signal,
      });
      fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
      throw new Error(`Launch readiness check failed: ${check.name}`);
    }

    const absoluteSummaryPath = path.join(process.cwd(), check.summaryPath);
    assert(fs.existsSync(absoluteSummaryPath), `Expected summary file for ${check.name}: ${absoluteSummaryPath}`);
    const checkSummary = readSummary(absoluteSummaryPath);
    assert(checkSummary.success === true, `Expected ${check.name} summary success=true.`);

    summary.checks.push({
      name: check.name,
      pass: true,
      script: check.script,
      summaryPath: absoluteSummaryPath,
      consoleErrors: Array.isArray(checkSummary.consoleErrors) ? checkSummary.consoleErrors.length : 0,
    });
  }

  summary.success = true;
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
  console.log(`Launch readiness smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
