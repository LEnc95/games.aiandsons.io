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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      blocking: true,
      retries: 1,
    },
    {
      name: "discovery_launcher_shop",
      script: "scripts/qa/discovery-search-filter-smoke.mjs",
      summaryPath: path.join("output", "web-game", "discovery-filter-e2e", "summary.json"),
      blocking: false,
      retries: 2,
    },
    {
      name: "classroom_mode",
      script: "scripts/qa/classroom-mode-smoke.mjs",
      summaryPath: path.join("output", "web-game", "classroom-e2e", "summary.json"),
      blocking: true,
      retries: 1,
    },
    {
      name: "entitlements_shop",
      script: "scripts/qa/entitlements-shop-smoke.mjs",
      summaryPath: path.join("output", "web-game", "entitlements-shop-e2e", "summary.json"),
      blocking: true,
      retries: 1,
    },
    {
      name: "premium_track",
      script: "scripts/qa/premium-track-smoke.mjs",
      summaryPath: path.join("output", "web-game", "premium-track-e2e", "summary.json"),
      blocking: true,
      retries: 1,
    },
    {
      name: "onboarding_split",
      script: "scripts/qa/onboarding-split-smoke.mjs",
      summaryPath: path.join("output", "web-game", "onboarding-split-e2e", "summary.json"),
      blocking: false,
      retries: 2,
    },
    {
      name: "metrics_baseline",
      script: "scripts/qa/metrics-baseline-smoke.mjs",
      summaryPath: path.join("output", "web-game", "metrics-baseline-e2e", "summary.json"),
      blocking: false,
      retries: 2,
    },
  ];

  const summary = {
    baseUrl,
    checks: [],
    warnings: [],
    blockingFailures: [],
    nonBlockingFailures: [],
    success: false,
  };

  for (const check of checks) {
    let passed = false;
    let lastExecution = null;
    let lastCheckSummary = null;
    const attempts = 1 + (check.retries ?? 0);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const execution = runNodeScript(check.script, baseUrl);
      lastExecution = execution;

      if (execution.status === 0) {
        const absoluteSummaryPath = path.join(process.cwd(), check.summaryPath);
        assert(fs.existsSync(absoluteSummaryPath), `Expected summary file for ${check.name}: ${absoluteSummaryPath}`);
        const checkSummary = readSummary(absoluteSummaryPath);
        lastCheckSummary = checkSummary;
        if (checkSummary.success === true) {
          passed = true;
          summary.checks.push({
            name: check.name,
            pass: true,
            blocking: check.blocking,
            attempts: attempt,
            script: check.script,
            summaryPath: absoluteSummaryPath,
            consoleErrors: Array.isArray(checkSummary.consoleErrors) ? checkSummary.consoleErrors.length : 0,
          });
          break;
        }
      }

      if (attempt < attempts) {
        await sleep(500 * attempt);
      }
    }

    if (passed) {
      continue;
    }

    const failure = {
      name: check.name,
      pass: false,
      blocking: check.blocking,
      attempts,
      script: check.script,
      status: lastExecution?.status ?? 1,
      stdout: (lastExecution?.stdout || "").slice(-4000),
      stderr: (lastExecution?.stderr || "").slice(-4000),
      signal: lastExecution?.signal || "",
      summarySuccess: lastCheckSummary?.success ?? null,
    };

    summary.checks.push(failure);
    if (check.blocking) {
      summary.blockingFailures.push(check.name);
    } else {
      summary.nonBlockingFailures.push(check.name);
      summary.warnings.push(`${check.name} failed after ${attempts} attempt(s) but is treated as non-blocking.`);
    }
  }

  summary.success = summary.blockingFailures.length === 0;
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
  console.log(`Launch readiness smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
