const { getQuery, sendError, sendJson } = require("../feedback/_shared");
const { getDiscoveryRankings } = require("./_store");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  try {
    const query = getQuery(req);
    const rankings = await getDiscoveryRankings({ limit: query.limit });
    return sendJson(res, 200, rankings);
  } catch {
    return sendError(res, 500, "Could not load discovery rankings.", "discovery_rankings_failed");
  }
};
