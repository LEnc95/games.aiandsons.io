const { isAdminAuthorized } = require("./_admin-auth");
const { getQuery, sendError, sendJson } = require("../_shared");
const { listFeedbackSubmissions } = require("../_store");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const auth = isAdminAuthorized(req);
  if (!auth.ok) {
    const status = auth.reason === "admin_token_not_configured" ? 503 : 401;
    const message = auth.reason === "admin_token_not_configured"
      ? "Feedback admin token is not configured."
      : "Admin token is required.";
    return sendError(res, status, message, auth.reason);
  }

  try {
    const query = getQuery(req);
    const submissions = await listFeedbackSubmissions(query);
    return sendJson(res, 200, {
      ok: true,
      submissions,
    });
  } catch (error) {
    return sendError(res, 500, "Could not load feedback submissions.", "feedback_list_failed", {
      message: String(error && error.message ? error.message : error),
    });
  }
};
