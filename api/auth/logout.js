const { clearSession, createSession } = require("./_session");
const { sendError, sendJson } = require("../feedback/_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  clearSession(req, res);
  const session = createSession(req, res);

  return sendJson(res, 200, {
    ok: true,
    userId: session.userId,
    authType: session.authType || "anonymous",
    isAuthenticated: Boolean(session.isAuthenticated),
    expiresAt: session.expiresAt,
  });
};
