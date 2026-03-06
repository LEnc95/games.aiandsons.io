const {
  getStripeClient,
  normalizeEmail,
  getQuery,
  sendJson,
  sendError,
  getPublicBillingConfig,
  listCustomerSubscriptions,
  summarizeEntitlementsFromProfile,
  summarizeEntitlementsFromSubscriptions,
} = require("./_shared");
const { ensureSession } = require("../auth/_session");
const {
  getStripeBillingProfile,
  bindUserToStripeCustomer,
  saveStripeBillingProfile,
} = require("./_store");

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const billingConfig = getPublicBillingConfig(req);
  if (!billingConfig.enabled) {
    return sendJson(res, 200, {
      ok: true,
      mode: "local",
      entitlements: {
        familyPremium: false,
        schoolLicense: false,
      },
      subscriptions: [],
      activePlanId: "",
      updatedAt: Date.now(),
    });
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
    const query = getQuery(req);
    const sessionId = typeof query.sessionId === "string"
      ? query.sessionId.trim()
      : (typeof query.session_id === "string" ? query.session_id.trim() : "");

    const existingProfile = await getStripeBillingProfile(session.userId);
    let customerId = typeof existingProfile.customerId === "string" ? existingProfile.customerId.trim() : "";
    let customerEmail = typeof existingProfile.customerEmail === "string" ? existingProfile.customerEmail : "";

    const requestedCustomerId = typeof query.customerId === "string" ? query.customerId.trim() : "";
    if (requestedCustomerId && customerId && requestedCustomerId !== customerId) {
      return sendError(res, 403, "Customer does not belong to this user.", "customer_mismatch");
    }

    if (sessionId) {
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
      if (checkoutCustomerId) {
        customerId = checkoutCustomerId;
      }

      const emailFromCustomer = typeof checkoutSession?.customer?.email === "string"
        ? checkoutSession.customer.email
        : "";
      const emailFromSession = typeof checkoutSession?.customer_details?.email === "string"
        ? checkoutSession.customer_details.email
        : "";
      const fallbackEmail = normalizeEmail(emailFromCustomer || emailFromSession || query.customerEmail);
      if (fallbackEmail) {
        customerEmail = fallbackEmail;
      }

      if (customerId) {
        await bindUserToStripeCustomer({
          userId: session.userId,
          customerId,
          customerEmail,
        });
      }
    }

    if (!customerId) {
      const storedSummary = summarizeEntitlementsFromProfile(existingProfile);
      return sendJson(res, 200, {
        ok: true,
        mode: "stripe",
        userId: session.userId,
        customerBound: false,
        customerId: "",
        customerEmail: customerEmail || "",
        sessionId: sessionId || "",
        ...storedSummary,
      });
    }

    const subscriptions = await listCustomerSubscriptions(stripe, customerId);
    const summary = summarizeEntitlementsFromSubscriptions(subscriptions);

    const savedProfile = await saveStripeBillingProfile(session.userId, {
      customerId,
      customerEmail,
      entitlements: summary.entitlements,
      subscriptions: summary.subscriptions,
      activePlanId: summary.activePlanId,
      checkoutSessionId: sessionId || existingProfile.checkoutSessionId,
      lastSource: "subscription_status_sync",
    });

    return sendJson(res, 200, {
      ok: true,
      mode: "stripe",
      userId: session.userId,
      customerBound: true,
      customerId,
      customerEmail: savedProfile.customerEmail || "",
      sessionId: sessionId || "",
      ...summarizeEntitlementsFromProfile(savedProfile),
    });
  } catch (error) {
    return sendError(
      res,
      500,
      "Could not load Stripe subscription status.",
      "subscription_status_failed",
      { message: String(error && error.message ? error.message : error) },
    );
  }
};
