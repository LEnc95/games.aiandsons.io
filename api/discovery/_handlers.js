const { getQuery, readJsonBody, sendError, sendJson } = require("../feedback/_shared");
const { getDiscoveryRankings, recordDiscoveryLaunch } = require("./_store");

async function handleDiscoveryEvents(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendError(res, 400, "Request body must be valid JSON.", "invalid_json");
  }

  try {
    const result = await recordDiscoveryLaunch(body);
    if (!result.ok) {
      return sendError(res, result.status || 400, result.error, result.code);
    }
    return sendJson(res, 200, {
      ok: true,
      source: result.source,
    });
  } catch {
    return sendError(res, 500, "Could not record discovery event.", "discovery_event_failed");
  }
}

async function handleDiscoveryRankings(req, res) {
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
}

module.exports = {
  handleDiscoveryEvents,
  handleDiscoveryRankings,
};
