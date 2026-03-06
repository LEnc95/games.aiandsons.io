const {
  getStripeClient,
  getRequestOrigin,
  normalizeEmail,
  isLikelyEmail,
  sanitizeReturnUrl,
  readJsonBody,
  sendJson,
  sendError,
  getPublicBillingConfig,
} = require("./_shared");
const { ensureSession } = require("../auth/_session");
const {
  getStripeBillingProfile,
  bindUserToStripeCustomer,
  saveStripeBillingProfile,
} = require("./_store");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const billingConfig = getPublicBillingConfig(req);
  if (!billingConfig.enabled) {
    return sendError(res, 503, "Stripe billing is not configured on this deployment.", "billing_not_configured");
  }
  if (!billingConfig.customerPortalEnabled) {
    return sendError(res, 400, "Stripe customer portal is disabled.", "customer_portal_disabled");
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return sendError(res, 503, "Stripe billing is unavailable.", "stripe_unavailable");
  }

  const session = ensureSession(req, res, { createIfMissing: true });
  if (!session || !session.userId) {
    return sendError(res, 401, "Authenticated billing session is required.", "auth_required");
  }

  try {
    const body = await readJsonBody(req);
    const profile = await getStripeBillingProfile(session.userId);

    let customerId = typeof profile.customerId === "string" ? profile.customerId.trim() : "";
    const customerEmail = normalizeEmail(body.customerEmail);

    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (!customerId && sessionId) {
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["customer"],
      });
      const metadataUserId = typeof checkoutSession?.metadata?.appUserId === "string"
        ? checkoutSession.metadata.appUserId.trim()
        : "";
      if (metadataUserId && metadataUserId !== session.userId) {
        return sendError(res, 403, "Checkout session does not belong to this user.", "session_user_mismatch");
      }

      const checkoutCustomerId = typeof checkoutSession.customer === "string"
        ? checkoutSession.customer
        : (typeof checkoutSession?.customer?.id === "string" ? checkoutSession.customer.id : "");
      customerId = checkoutCustomerId || "";
      if (customerId) {
        const emailFromCustomer = typeof checkoutSession?.customer?.email === "string"
          ? checkoutSession.customer.email
          : "";
        const emailFromSession = typeof checkoutSession?.customer_details?.email === "string"
          ? checkoutSession.customer_details.email
          : "";
        await bindUserToStripeCustomer({
          userId: session.userId,
          customerId,
          customerEmail: emailFromCustomer || emailFromSession || customerEmail,
        });
      }
    }

    if (!customerId) {
      return sendError(
        res,
        409,
        "No Stripe customer is linked to this account yet. Complete checkout first.",
        "customer_binding_missing",
      );
    }

    const baseOrigin = getRequestOrigin(req);
    const returnUrl = sanitizeReturnUrl(body.returnUrl, baseOrigin, "/pricing.html");
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    await saveStripeBillingProfile(session.userId, {
      customerId,
      customerEmail: isLikelyEmail(customerEmail) ? customerEmail : profile.customerEmail,
      lastSource: "portal_session_created",
    });

    return sendJson(res, 200, {
      ok: true,
      mode: "stripe",
      url: portalSession.url,
      customerId,
      userId: session.userId,
    });
  } catch (error) {
    return sendError(
      res,
      500,
      "Could not create Stripe customer portal session.",
      "portal_session_failed",
      { message: String(error && error.message ? error.message : error) },
    );
  }
};
