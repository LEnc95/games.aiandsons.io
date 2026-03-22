const crypto = require("crypto");

function getConfiguredAdminToken() {
  return typeof process.env.FEEDBACK_ADMIN_TOKEN === "string"
    ? process.env.FEEDBACK_ADMIN_TOKEN.trim()
    : "";
}

function getAdminTokenFromRequest(req) {
  const headerToken = typeof req?.headers?.["x-admin-token"] === "string"
    ? req.headers["x-admin-token"].trim()
    : "";
  if (headerToken) return headerToken;

  const authorization = typeof req?.headers?.authorization === "string"
    ? req.headers.authorization.trim()
    : "";
  if (!authorization) return "";

  const lower = authorization.toLowerCase();
  if (!lower.startsWith("bearer ")) return "";
  return authorization.slice(7).trim();
}

function isAdminAuthorized(req) {
  const configured = getConfiguredAdminToken();
  if (!configured) {
    return { ok: false, reason: "admin_token_not_configured" };
  }

  const provided = getAdminTokenFromRequest(req);
  if (!provided) {
    return { ok: false, reason: "admin_token_missing" };
  }

  const configuredBuffer = Buffer.from(configured);
  const providedBuffer = Buffer.from(provided);
  if (configuredBuffer.length !== providedBuffer.length) {
    return { ok: false, reason: "admin_token_invalid" };
  }

  const matches = crypto.timingSafeEqual(configuredBuffer, providedBuffer);
  if (!matches) {
    return { ok: false, reason: "admin_token_invalid" };
  }

  return { ok: true, reason: "ok" };
}

module.exports = {
  getConfiguredAdminToken,
  getAdminTokenFromRequest,
  isAdminAuthorized,
};
