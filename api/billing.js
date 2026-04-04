const { getQuery, sendError } = require("./stripe/_shared");
const {
  handleAdminLookup,
  handleAdminReconcile,
  handleConfig,
  handleCreateCheckoutSession,
  handleCreatePortalSession,
  handleFamilyAcceptInvite,
  handleFamilyInvite,
  handleFamilyRemoveMember,
  handleFamilyResendInvite,
  handleFamilyRevokeInvite,
  handleFamilySummary,
  handleSubscriptionStatus,
  handleWebhook,
} = require("./stripe/_handlers");

function getRequestedRoute(req) {
  const query = getQuery(req);
  const fromQuery = typeof query.route === "string" ? query.route.trim().toLowerCase() : "";
  if (fromQuery) {
    return fromQuery.replace(/^\/+|\/+$/g, "");
  }

  const requestUrl = req?.url || "/";
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  const prefixes = ["/api/stripe/", "/api/billing/"];
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix)) {
      return pathname.slice(prefix.length).replace(/^\/+|\/+$/g, "").toLowerCase();
    }
  }
  return "";
}

module.exports = async function handler(req, res) {
  const route = getRequestedRoute(req);

  switch (route) {
    case "config":
      return handleConfig(req, res);
    case "create-checkout-session":
      return handleCreateCheckoutSession(req, res);
    case "create-portal-session":
      return handleCreatePortalSession(req, res);
    case "family-summary":
      return handleFamilySummary(req, res);
    case "family-invite":
      return handleFamilyInvite(req, res);
    case "family-accept-invite":
      return handleFamilyAcceptInvite(req, res);
    case "family-remove-member":
      return handleFamilyRemoveMember(req, res);
    case "family-resend-invite":
      return handleFamilyResendInvite(req, res);
    case "family-revoke-invite":
      return handleFamilyRevokeInvite(req, res);
    case "subscription-status":
      return handleSubscriptionStatus(req, res);
    case "webhook":
      return handleWebhook(req, res);
    case "admin/reconcile":
      return handleAdminReconcile(req, res);
    case "admin/lookup":
      return handleAdminLookup(req, res);
    default:
      return sendError(res, 404, "Billing route not found.", "billing_route_not_found");
  }
};
