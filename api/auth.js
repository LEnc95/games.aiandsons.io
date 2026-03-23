const { getQuery, sendError } = require("./feedback/_shared");
const {
  handleFirebaseConfig,
  handleGoogleLogin,
  handleLogout,
  handleSession,
} = require("./auth/_handlers");

function getRequestedRoute(req) {
  const query = getQuery(req);
  const fromQuery = typeof query.route === "string" ? query.route.trim().toLowerCase() : "";
  if (fromQuery) {
    return fromQuery.replace(/^\/+|\/+$/g, "");
  }

  const requestUrl = req?.url || "/";
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  const authPrefix = "/api/auth/";
  if (!pathname.startsWith(authPrefix)) return "";
  return pathname.slice(authPrefix.length).replace(/^\/+|\/+$/g, "").toLowerCase();
}

module.exports = async function handler(req, res) {
  const route = getRequestedRoute(req);

  switch (route) {
    case "session":
      return handleSession(req, res);
    case "firebase-config":
      return handleFirebaseConfig(req, res);
    case "google-login":
      return handleGoogleLogin(req, res);
    case "logout":
      return handleLogout(req, res);
    default:
      return sendError(res, 404, "Auth route not found.", "auth_route_not_found");
  }
};
