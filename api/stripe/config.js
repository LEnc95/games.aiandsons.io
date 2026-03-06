const {
  sendJson,
  sendError,
  getPublicBillingConfig,
} = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  return sendJson(res, 200, getPublicBillingConfig(req));
};
