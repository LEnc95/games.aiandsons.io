const {
  getStripeClient,
  normalizeEmail,
  isLikelyEmail,
  getQuery,
  sendJson,
  sendError,
  getPublicBillingConfig,
  findCustomerByEmail,
  listCustomerSubscriptions,
  summarizeEntitlementsFromSubscriptions,
} = require("./_shared");

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

  try {
    const query = getQuery(req);
    const sessionId = typeof query.sessionId === "string"
      ? query.sessionId.trim()
      : (typeof query.session_id === "string" ? query.session_id.trim() : "");
    let customerId = typeof query.customerId === "string" ? query.customerId.trim() : "";
    let customerEmail = normalizeEmail(query.customerEmail);

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["customer"],
      });
      const customer = session && session.customer;
      if (!customerId) {
        customerId = typeof customer === "string" ? customer : (customer && customer.id ? customer.id : "");
      }
      if (!customerEmail) {
        const fromCustomer = customer && typeof customer === "object" && typeof customer.email === "string"
          ? customer.email
          : "";
        const fromSession = session && session.customer_details && typeof session.customer_details.email === "string"
          ? session.customer_details.email
          : "";
        customerEmail = normalizeEmail(fromCustomer || fromSession);
      }
    }

    if (!customerId && isLikelyEmail(customerEmail)) {
      const customer = await findCustomerByEmail(stripe, customerEmail);
      if (customer && customer.id) {
        customerId = customer.id;
      }
    }

    if (!customerId) {
      return sendError(
        res,
        404,
        "No Stripe customer found. Provide a checkout session or billing email.",
        "customer_not_found",
      );
    }

    const subscriptions = await listCustomerSubscriptions(stripe, customerId);
    const summary = summarizeEntitlementsFromSubscriptions(subscriptions);

    return sendJson(res, 200, {
      ok: true,
      mode: "stripe",
      customerId,
      customerEmail: customerEmail || "",
      sessionId: sessionId || "",
      ...summary,
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
