const MAX_BODY_BYTES = 8 * 1024;
const RESULT_VALUES = new Set(["completed", "lost", "abandoned"]);

let contractsPromise = null;
function loadContracts() {
  if (!contractsPromise) {
    contractsPromise = import("../../src/meta/content-contracts.js");
  }
  return contractsPromise;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new Error("body_too_large");
  }
  return raw ? JSON.parse(raw) : {};
}

function clampMetric(value, definition) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(definition.min, Math.min(definition.max, Math.floor(numeric)));
}

async function normalizeOutcome(source) {
  const raw = source && typeof source === "object" ? source : {};
  const slug = String(raw.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  const { getGameContentContract } = await loadContracts();
  const contract = getGameContentContract(slug);
  if (!contract) return null;

  const supplied = raw.metrics && typeof raw.metrics === "object" && !Array.isArray(raw.metrics) ? raw.metrics : {};
  const metrics = {};
  for (const [key, definition] of Object.entries(contract.outcomes)) {
    const value = clampMetric(supplied[key], definition);
    if (value !== null) metrics[key] = value;
  }
  if (!Object.keys(metrics).length) return null;

  return {
    slug,
    result: RESULT_VALUES.has(raw.result) ? raw.result : "completed",
    durationMs: Math.max(0, Math.min(4 * 60 * 60 * 1000, Math.floor(Number(raw.durationMs) || 0))),
    metrics,
  };
}

module.exports = { normalizeOutcome, readJsonBody, sendJson };

