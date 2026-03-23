const { getFirebasePublicConfig } = require("../_firebase-admin");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
    return;
  }

  const config = getFirebasePublicConfig();
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    ok: true,
    enabled: Boolean(config.enabled),
    config: config.enabled ? config : null,
  }));
};
