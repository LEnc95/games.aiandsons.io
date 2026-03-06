const { ensureSession } = require("./_session");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
    return;
  }

  const session = ensureSession(req, res, { createIfMissing: true });
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    ok: true,
    userId: session.userId,
    expiresAt: session.expiresAt,
    isNew: Boolean(session.isNew),
  }));
};
