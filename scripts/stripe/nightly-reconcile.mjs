import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { classifyReconcileResult } from "./reconcile-audit.mjs";

const require = createRequire(import.meta.url);
const { listStripeBillingProfiles } = require("../../api/stripe/_store.js");

const DEFAULT_OUTPUT_PATH = "output/stripe/nightly-reconcile-summary.json";

export function parseArgs(argv) {
  const options = {
    baseUrl: "",
    adminToken: typeof process.env.STRIPE_ADMIN_TOKEN === "string"
      ? process.env.STRIPE_ADMIN_TOKEN.trim()
      : "",
    dryRun: false,
    limit: 250,
    output: DEFAULT_OUTPUT_PATH,
    timeoutMs: 15000,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || "").trim();
    if (!token) continue;

    if (token === "--base-url" && i + 1 < argv.length) {
      options.baseUrl = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }

    if (token === "--admin-token" && i + 1 < argv.length) {
      options.adminToken = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }

    if (token === "--dry-run" && i + 1 < argv.length) {
      const value = String(argv[i + 1] || "").trim().toLowerCase();
      options.dryRun = value === "true" || value === "1" || value === "yes";
      i += 1;
      continue;
    }

    if (token === "--limit" && i + 1 < argv.length) {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        options.limit = Math.max(1, Math.min(1000, Math.floor(value)));
      }
      i += 1;
      continue;
    }

    if (token === "--output" && i + 1 < argv.length) {
      options.output = String(argv[i + 1] || "").trim() || DEFAULT_OUTPUT_PATH;
      i += 1;
      continue;
    }

    if (token === "--timeout-ms" && i + 1 < argv.length) {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        options.timeoutMs = Math.floor(value);
      }
      i += 1;
      continue;
    }

    if (token === "--help" || token === "-h") {
      options.help = true;
    }
  }

  return options;
}

export function buildTargetsFromProfiles(profiles, limit = 250) {
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 250)));
  const targets = [];
  const seen = new Set();

  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const safeProfile = profile && typeof profile === "object" ? profile : null;
    const userId = typeof safeProfile?.userId === "string" ? safeProfile.userId.trim() : "";
    const customerId = typeof safeProfile?.customerId === "string" ? safeProfile.customerId.trim() : "";
    if (!userId || !customerId) continue;
    if (seen.has(userId)) continue;
    seen.add(userId);
    targets.push({
      kind: "user",
      id: userId,
      customerId,
      activePlanId: typeof safeProfile?.activePlanId === "string" ? safeProfile.activePlanId : "",
      subscriptionStatus: typeof safeProfile?.subscriptionStatus === "string" ? safeProfile.subscriptionStatus : "",
      customerEmail: typeof safeProfile?.customerEmail === "string" ? safeProfile.customerEmail : "",
      updatedAt: Number(safeProfile?.updatedAt || 0),
    });
    if (targets.length >= safeLimit) break;
  }

  return targets;
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

async function callReconcile({ baseUrl, adminToken, target, dryRun, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/stripe/admin/reconcile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({
        dryRun,
        userId: target.id,
      }),
      signal: controller.signal,
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok || !body || body.ok !== true) {
      return {
        ok: false,
        status: response.status,
        error: body && typeof body.error === "string" ? body.error : `HTTP ${response.status}`,
        payload: body,
      };
    }

    return {
      ok: true,
      status: response.status,
      payload: body,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error && error.name === "AbortError"
        ? "request_timeout"
        : String(error?.message || error),
      payload: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function summarizeNightlyResults(results = []) {
  const summary = {
    processed: 0,
    repaired: 0,
    unchanged: 0,
    unbound: 0,
    failed: 0,
  };

  for (const result of Array.isArray(results) ? results : []) {
    summary.processed += 1;
    const status = typeof result?.status === "string" ? result.status : "failed";
    if (Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] += 1;
    } else {
      summary.failed += 1;
    }
  }

  return summary;
}

export async function runNightlyBillingReconcile(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  if (!baseUrl) {
    throw new Error("--base-url is required.");
  }
  if (!options.adminToken) {
    throw new Error("Admin token is required. Provide --admin-token or STRIPE_ADMIN_TOKEN.");
  }

  const profiles = await listStripeBillingProfiles({
    limit: options.limit,
    withCustomerOnly: true,
  });
  const targets = buildTargetsFromProfiles(profiles, options.limit);
  const results = [];

  for (const target of targets) {
    const result = await callReconcile({
      baseUrl,
      adminToken: options.adminToken,
      target,
      dryRun: options.dryRun,
      timeoutMs: options.timeoutMs,
    });

    if (!result.ok) {
      results.push({
        target,
        status: "failed",
        httpStatus: result.status,
        error: result.error,
      });
      continue;
    }

    results.push({
      target,
      status: classifyReconcileResult(result.payload),
      httpStatus: result.status,
      changed: Boolean(result.payload.changed),
      dryRun: Boolean(result.payload.dryRun),
      customerId: result.payload.customerId || target.customerId || "",
      userId: result.payload.userId || target.id,
      activePlanId: result.payload.activePlanId || target.activePlanId || "",
      entitlements: result.payload.entitlements || { familyPremium: false, schoolLicense: false },
    });
  }

  const summary = summarizeNightlyResults(results);
  const outputPath = path.resolve(process.cwd(), options.output || DEFAULT_OUTPUT_PATH);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl,
    dryRun: Boolean(options.dryRun),
    profileCount: profiles.length,
    targetCount: targets.length,
    summary,
    results,
  }, null, 2)}\n`, "utf8");

  return {
    outputPath,
    profileCount: profiles.length,
    targetCount: targets.length,
    summary,
    results,
  };
}

function printHelp() {
  console.log([
    "Usage: node scripts/stripe/nightly-reconcile.mjs --base-url <url> [options]",
    "",
    "Options:",
    "  --admin-token <token>   Admin token (defaults to STRIPE_ADMIN_TOKEN env var)",
    "  --dry-run <true|false>  Use dry-run mode (default: false)",
    "  --limit <n>             Max customer-backed profiles to reconcile (default: 250)",
    "  --output <path>         JSON output path (default: output/stripe/nightly-reconcile-summary.json)",
    "  --timeout-ms <n>        Per-request timeout in ms (default: 15000)",
  ].join("\n"));
}

const isDirectRun = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
  } else {
    runNightlyBillingReconcile(options)
      .then((outcome) => {
        console.log(`Stripe nightly reconcile completed: ${outcome.outputPath}`);
        console.log(`Profiles scanned: ${outcome.profileCount}, targets reconciled: ${outcome.targetCount}`);
        console.log(`Repaired: ${outcome.summary.repaired}, unchanged: ${outcome.summary.unchanged}, unbound: ${outcome.summary.unbound}, failed: ${outcome.summary.failed}`);
      })
      .catch((error) => {
        console.error(`Stripe nightly reconcile failed: ${String(error?.message || error)}`);
        process.exitCode = 1;
      });
  }
}
