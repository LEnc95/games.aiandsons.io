const { handleHealth, handleTts } = require("./booth/_tts");

function getRequestedRoute(req) {
  const url = new URL(req.url || "/", "http://localhost");
  const fromQuery = String(url.searchParams.get("route") || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
  if (fromQuery) return fromQuery;

  const pathname = url.pathname;
  const prefix = "/api/booth/";
  if (pathname.startsWith(prefix)) {
    return pathname.slice(prefix.length).replace(/^\/+|\/+$/g, "").toLowerCase();
  }
  if (pathname === "/api/booth") return "";
  return "";
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const route = getRequestedRoute(req);
  switch (route) {
    case "health":
      return handleHealth(req, res);
    case "tts":
      return handleTts(req, res);
    default:
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Booth route not found." }));
  }
};
