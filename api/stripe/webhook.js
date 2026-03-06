const {
  getStripeClient,
  readRawBody,
  sendJson,
  sendError,
  getPublicBillingConfig,
  forwardWebhookEvent,
} = require("./_shared");

const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

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
    if (HANDLED_EVENT_TYPES.has(event.type)) {
      await forwardWebhookEvent(event);
    }

    return sendJson(res, 200, {
      ok: true,
      received: true,
      type: event.type,
      id: event.id,
      handled: HANDLED_EVENT_TYPES.has(event.type),
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
