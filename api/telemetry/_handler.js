const { normalizeOutcome, readJsonBody, sendJson } = require("./_shared");
const { recordAggregateOutcome } = require("./_store");

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 300;
const limiter = globalThis.__cadeTelemetryLimiter || { startedAt: Date.now(), count: 0 };
globalThis.__cadeTelemetryLimiter = limiter;

function acceptRate(now = Date.now()) {
  if (now - limiter.startedAt >= WINDOW_MS) {
    limiter.startedAt = now;
    limiter.count = 0;
  }
  limiter.count += 1;
  return limiter.count <= MAX_PER_WINDOW;
}

async function handleTelemetryOutcome(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "method_not_allowed" });
  if (!acceptRate()) return sendJson(res, 429, { ok: false, error: "rate_limited" });
  try {
    const body = await readJsonBody(req);
    const outcome = await normalizeOutcome(body);
    if (!outcome) return sendJson(res, 400, { ok: false, error: "invalid_outcome" });
    await recordAggregateOutcome(outcome);
    return sendJson(res, 202, { ok: true });
  } catch (error) {
    const code = error?.message === "body_too_large" ? 413 : 400;
    return sendJson(res, code, { ok: false, error: code === 413 ? "body_too_large" : "invalid_request" });
  }
}

module.exports = { acceptRate, handleTelemetryOutcome };

