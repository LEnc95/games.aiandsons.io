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
  findCustomerByEmail,
} = require("./_shared");

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

  try {
    const body = await readJsonBody(req);
    let customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
    const customerEmail = normalizeEmail(body.customerEmail);

    if (!customerId) {
      if (!isLikelyEmail(customerEmail)) {
        return sendError(res, 400, "A valid billing email is required.", "invalid_customer_email");
      }
      const customer = await findCustomerByEmail(stripe, customerEmail);
      if (!customer || !customer.id) {
        return sendError(res, 404, "No Stripe customer found for that email.", "customer_not_found");
      }
      customerId = customer.id;
    }

    const baseOrigin = getRequestOrigin(req);
    const returnUrl = sanitizeReturnUrl(body.returnUrl, baseOrigin, "/pricing.html");
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return sendJson(res, 200, {
      ok: true,
      mode: "stripe",
      url: session.url,
      customerId,
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
