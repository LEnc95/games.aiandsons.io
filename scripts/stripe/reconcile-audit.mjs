import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_OUTPUT_PATH = "output/stripe/reconcile-audit-summary.json";

export function parseArgs(argv) {
  const options = {
    baseUrl: "",
    adminToken: typeof process.env.STRIPE_ADMIN_TOKEN === "string"
      ? process.env.STRIPE_ADMIN_TOKEN.trim()
      : "",
    userIdsFile: "",
    customerIdsFile: "",
    dryRun: true,
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

    if (token === "--user-ids-file" && i + 1 < argv.length) {
      options.userIdsFile = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }

    if (token === "--customer-ids-file" && i + 1 < argv.length) {
      options.customerIdsFile = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }

    if (token === "--dry-run" && i + 1 < argv.length) {
      const value = String(argv[i + 1] || "").trim().toLowerCase();
      options.dryRun = value !== "false" && value !== "0" && value !== "no";
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
      continue;
    }
  }

  return options;
}

function splitTokens(content) {
  return String(content || "")
    .replace(/\r/g, "\n")
    .split(/[\n,]/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !entry.startsWith("#"));
}

export function parseIdFileContent(content) {
  const seen = new Set();
  const ids = [];
  for (const token of splitTokens(content)) {
    if (seen.has(token)) continue;
    seen.add(token);
    ids.push(token);
  }
  return ids;
}

async function readIdFile(filePath) {
  if (!filePath) return [];
  const absolute = path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(absolute, "utf8");
  return parseIdFileContent(raw);
}

export function buildTargets(userIds, customerIds) {
  const targets = [];
  const seen = new Set();

  for (const userId of Array.isArray(userIds) ? userIds : []) {
    const normalized = typeof userId === "string" ? userId.trim() : "";
    if (!normalized) continue;
    const key = `user:${normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ kind: "user", id: normalized });
  }

  for (const customerId of Array.isArray(customerIds) ? customerIds : []) {
    const normalized = typeof customerId === "string" ? customerId.trim() : "";
    if (!normalized) continue;
    const key = `customer:${normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ kind: "customer", id: normalized });
  }

  return targets;
}

export function classifyReconcileResult(payload) {
  const response = payload && typeof payload === "object" ? payload : {};
  if (!response.customerBound) return "unbound";
  return response.changed ? "repaired" : "unchanged";
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim();
  return trimmed.replace(/\/+$/, "");
}

function printHelp() {
  console.log([
    "Usage: node scripts/stripe/reconcile-audit.mjs --base-url <url> [options]",
    "",
    "Options:",
    "  --admin-token <token>         Admin token (defaults to STRIPE_ADMIN_TOKEN env var)",
    "  --user-ids-file <path>        Newline/comma-separated user IDs",
    "  --customer-ids-file <path>    Newline/comma-separated customer IDs",
    "  --dry-run <true|false>        Use dry-run mode (default: true)",
    "  --output <path>               JSON output path (default: output/stripe/reconcile-audit-summary.json)",
    "  --timeout-ms <n>              Per-request timeout in ms (default: 15000)",
  ].join("\n"));
}

async function callReconcile({ baseUrl, adminToken, target, dryRun, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const payload = {
    dryRun,
    ...(target.kind === "user" ? { userId: target.id } : { customerId: target.id }),
  };

  try {
    const response = await fetch(`${baseUrl}/api/stripe/admin/reconcile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok || !body || body.ok !== true) {
      const errorMessage = body && typeof body.error === "string"
        ? body.error
        : `HTTP ${response.status}`;
      return {
        ok: false,
        status: response.status,
        error: errorMessage,
        payload: body,
      };
    }

    return {
      ok: true,
      status: response.status,
      payload: body,
    };
  } catch (error) {
    const reason = error && error.name === "AbortError"
      ? "request_timeout"
      : String(error && error.message ? error.message : error);
    return {
      ok: false,
      status: 0,
      error: reason,
      payload: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  if (!baseUrl) {
    throw new Error("--base-url is required.");
  }
  if (!options.adminToken) {
    throw new Error("Admin token is required. Provide --admin-token or STRIPE_ADMIN_TOKEN.");
  }

  const userIds = await readIdFile(options.userIdsFile);
  const customerIds = await readIdFile(options.customerIdsFile);
  const targets = buildTargets(userIds, customerIds);
  if (targets.length === 0) {
    throw new Error("No targets provided. Supply --user-ids-file and/or --customer-ids-file.");
  }

  const results = [];
  const summary = {
    processed: 0,
    repaired: 0,
    unchanged: 0,
    unbound: 0,
    failed: 0,
  };

  for (const target of targets) {
    const result = await callReconcile({
      baseUrl,
      adminToken: options.adminToken,
      target,
      dryRun: options.dryRun,
      timeoutMs: options.timeoutMs,
    });

    summary.processed += 1;

    if (!result.ok) {
      summary.failed += 1;
      results.push({
        target,
        status: "failed",
        httpStatus: result.status,
        error: result.error,
      });
      continue;
    }

    const classification = classifyReconcileResult(result.payload);
    summary[classification] += 1;
    results.push({
      target,
      status: classification,
      httpStatus: result.status,
      customerId: result.payload.customerId || "",
      userId: result.payload.userId || "",
      changed: Boolean(result.payload.changed),
      dryRun: Boolean(result.payload.dryRun),
      entitlements: result.payload.entitlements || { familyPremium: false, schoolLicense: false },
      activePlanId: result.payload.activePlanId || "",
    });
  }

  const outputPath = path.resolve(process.cwd(), options.output || DEFAULT_OUTPUT_PATH);
  const outputDir = path.dirname(outputPath);
  const output = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    dryRun: options.dryRun,
    input: {
      userIdsFile: options.userIdsFile || "",
      customerIdsFile: options.customerIdsFile || "",
      targetCount: targets.length,
    },
    summary,
    results,
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Stripe reconcile audit completed: ${outputPath}`);
  console.log(`Processed: ${summary.processed}`);
  console.log(`Repaired: ${summary.repaired}, unchanged: ${summary.unchanged}, unbound: ${summary.unbound}, failed: ${summary.failed}`);
}

const isDirectExecution = (() => {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
})();

if (isDirectExecution) {
  run().catch((error) => {
    const message = error && error.message ? error.message : String(error);
    console.error(`Stripe reconcile audit failed: ${message}`);
    process.exitCode = 1;
  });
}
