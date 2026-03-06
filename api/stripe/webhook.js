const {
  getStripeClient,
  readRawBody,
  sendJson,
  sendError,
  getPublicBillingConfig,
  forwardWebhookEvent,
  listCustomerSubscriptions,
  summarizeEntitlementsFromSubscriptions,
  summarizeEntitlementsFromProfile,
} = require("./_shared");
const {
  bindUserToStripeCustomer,
  getUserIdForStripeCustomer,
  saveStripeBillingProfile,
  hasProcessedStripeWebhookEvent,
  markStripeWebhookEventProcessed,
} = require("./_store");

const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

function readCustomerIdFromEventObject(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.customer === "string") return payload.customer.trim();
  if (payload.customer && typeof payload.customer === "object" && typeof payload.customer.id === "string") {
    return payload.customer.id.trim();
  }
  return "";
}

function readUserIdFromCheckoutSession(sessionPayload) {
  if (!sessionPayload || typeof sessionPayload !== "object") return "";
  const metadataUserId = typeof sessionPayload?.metadata?.appUserId === "string"
    ? sessionPayload.metadata.appUserId.trim()
    : "";
  return metadataUserId;
}

function readCustomerEmailFromCheckoutSession(sessionPayload) {
  if (!sessionPayload || typeof sessionPayload !== "object") return "";
  const emailFromDetails = typeof sessionPayload?.customer_details?.email === "string"
    ? sessionPayload.customer_details.email
    : "";
  const emailFromSession = typeof sessionPayload?.customer_email === "string"
    ? sessionPayload.customer_email
    : "";
  return String(emailFromDetails || emailFromSession || "").trim().toLowerCase().slice(0, 160);
}

async function processHandledEvent(stripe, event) {
  const payload = event && event.data ? event.data.object : null;
  const customerId = readCustomerIdFromEventObject(payload);
  let userId = "";
  let customerEmail = "";

  if (event.type === "checkout.session.completed") {
    userId = readUserIdFromCheckoutSession(payload);
    customerEmail = readCustomerEmailFromCheckoutSession(payload);
    if (userId && customerId) {
      await bindUserToStripeCustomer({ userId, customerId, customerEmail });
    }
  }

  if (!userId && customerId) {
    userId = await getUserIdForStripeCustomer(customerId);
  }

  if (!customerId || !userId) {
    return {
      customerId,
      userId,
      customerBound: false,
      summary: null,
    };
  }

  const subscriptions = await listCustomerSubscriptions(stripe, customerId);
  const summary = summarizeEntitlementsFromSubscriptions(subscriptions);
  const profile = await saveStripeBillingProfile(userId, {
    customerId,
    customerEmail,
    entitlements: summary.entitlements,
    subscriptions: summary.subscriptions,
    activePlanId: summary.activePlanId,
    lastSource: `webhook:${event.type}`,
  });

  return {
    customerId,
    userId,
    customerBound: true,
    summary: summarizeEntitlementsFromProfile(profile),
  };
}

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

  const webhookSecret = typeof process.env.STRIPE_WEBHOOK_SECRET === "string"
    ? process.env.STRIPE_WEBHOOK_SECRET.trim()
    : "";
  if (!webhookSecret) {
    return sendError(res, 503, "Stripe webhook secret is not configured.", "webhook_secret_missing");
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      return sendError(res, 400, "Missing Stripe webhook signature.", "missing_signature");
    }

    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    const handled = HANDLED_EVENT_TYPES.has(event.type);

    let customerBound = false;
    let userId = "";
    let customerId = "";

    if (handled) {
      const alreadyProcessed = await hasProcessedStripeWebhookEvent(event.id);
      if (alreadyProcessed) {
        return sendJson(res, 200, {
          ok: true,
          received: true,
          type: event.type,
          id: event.id,
          handled: true,
          duplicate: true,
        });
      }

      const result = await processHandledEvent(stripe, event);
      customerBound = Boolean(result.customerBound);
      userId = result.userId || "";
      customerId = result.customerId || "";

      await markStripeWebhookEventProcessed(event.id);
      await forwardWebhookEvent(event);
    }

    return sendJson(res, 200, {
      ok: true,
      received: true,
      type: event.type,
      id: event.id,
      handled,
      customerBound,
      customerId,
      userId,
    });
  } catch (error) {
    return sendError(
      res,
      400,
      "Invalid Stripe webhook payload.",
      "invalid_webhook_payload",
      { message: String(error && error.message ? error.message : error) },
    );
  }
};
