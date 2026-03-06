const {
  sendJson,
  sendError,
  getPublicBillingConfig,
} = require("./_shared");
const { ensureSession } = require("../auth/_session");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const payload = getPublicBillingConfig(req);
  if (payload.enabled) {
    const session = ensureSession(req, res, { createIfMissing: true });
    if (session && session.userId) {
      payload.auth = {
        userId: session.userId,
        expiresAt: session.expiresAt,
      };
    }
  }

  return sendJson(res, 200, payload);
};
