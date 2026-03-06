const {
  getStripeClient,
  getConfiguredPlanPrices,
  getRequestOrigin,
  normalizePlanId,
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
  saveStripeBillingProfile,
  bindUserToStripeCustomer,
} = require("./_store");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const billingConfig = getPublicBillingConfig(req);
  if (!billingConfig.enabled) {
    return sendError(res, 503, "Stripe billing is not configured on this deployment.", "billing_not_configured");
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
    const planId = normalizePlanId(body.planId);
    const planPrices = getConfiguredPlanPrices();
    const priceId = planPrices[planId];
    if (!priceId) {
      return sendError(res, 400, "Unknown or unsupported plan.", "invalid_plan", { planId });
    }

    const customerEmail = normalizeEmail(body.customerEmail);
    if (!isLikelyEmail(customerEmail)) {
      return sendError(res, 400, "A valid billing email is required.", "invalid_customer_email");
    }

    const profile = await getStripeBillingProfile(session.userId);
    const existingCustomerId = typeof profile.customerId === "string" ? profile.customerId.trim() : "";

    const baseOrigin = getRequestOrigin(req);
    const defaultSuccessPath = planId.startsWith("school-")
      ? "/school-license.html?checkout=success&session_id={CHECKOUT_SESSION_ID}"
      : "/pricing.html?checkout=success&session_id={CHECKOUT_SESSION_ID}";
    const defaultCancelPath = planId.startsWith("school-")
      ? "/school-license.html?checkout=canceled"
      : "/pricing.html?checkout=canceled";

    const successUrl = sanitizeReturnUrl(body.successUrl, baseOrigin, defaultSuccessPath);
    const cancelUrl = sanitizeReturnUrl(body.cancelUrl, baseOrigin, defaultCancelPath);

    const params = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        app: "cade-games",
        planId,
        appUserId: session.userId,
      },
      subscription_data: {
        metadata: {
          app: "cade-games",
          planId,
          appUserId: session.userId,
        },
      },
    };

    if (process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true") {
      params.automatic_tax = { enabled: true };
    }

    if (existingCustomerId) {
      params.customer = existingCustomerId;
    } else {
      params.customer_email = customerEmail;
    }

    const checkoutSession = await stripe.checkout.sessions.create(params);
    const sessionCustomerId = typeof checkoutSession.customer === "string"
      ? checkoutSession.customer.trim()
      : "";
    const resolvedCustomerId = sessionCustomerId || existingCustomerId;

    await saveStripeBillingProfile(session.userId, {
      customerId: resolvedCustomerId,
      customerEmail,
      checkoutSessionId: checkoutSession.id,
      lastSource: "checkout_session_created",
    });

    if (resolvedCustomerId) {
      await bindUserToStripeCustomer({
        userId: session.userId,
        customerId: resolvedCustomerId,
        customerEmail,
      });
    }

    return sendJson(res, 200, {
      ok: true,
      mode: "stripe",
      id: checkoutSession.id,
      url: checkoutSession.url,
      customerId: resolvedCustomerId,
      userId: session.userId,
      planId,
    });
  } catch (error) {
    return sendError(
      res,
      500,
      "Could not create Stripe checkout session.",
      "checkout_session_failed",
      { message: String(error && error.message ? error.message : error) },
    );
  }
};
