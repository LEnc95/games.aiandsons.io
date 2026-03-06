const {
  getStripeClient,
  getPublicBillingConfig,
  readJsonBody,
  sendJson,
  sendError,
  listCustomerSubscriptions,
  summarizeEntitlementsFromSubscriptions,
  summarizeEntitlementsFromProfile,
  normalizeEmail,
} = require("../_shared");
const {
  getStripeBillingProfile,
  getUserIdForStripeCustomer,
  saveStripeBillingProfile,
  bindUserToStripeCustomer,
} = require("../_store");
const { isAdminAuthorized } = require("./_admin-auth");

function normalizeId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    return lowered === "1" || lowered === "true" || lowered === "yes";
  }
  return false;
}

function summarizeShape(source) {
  const raw = source && typeof source === "object" ? source : {};
  return {
    entitlements: {
      familyPremium: Boolean(raw.entitlements && raw.entitlements.familyPremium),
      schoolLicense: Boolean(raw.entitlements && raw.entitlements.schoolLicense),
    },
    activePlanId: typeof raw.activePlanId === "string" ? raw.activePlanId : "",
    subscriptions: Array.isArray(raw.subscriptions) ? raw.subscriptions : [],
  };
}

function didSummaryChange(previousSummary, nextSummary) {
  const previous = summarizeShape(previousSummary);
  const next = summarizeShape(nextSummary);
  return JSON.stringify(previous) !== JSON.stringify(next);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const auth = isAdminAuthorized(req);
  if (!auth.ok) {
    const status = auth.reason === "admin_token_not_configured" ? 503 : 401;
    const message = auth.reason === "admin_token_not_configured"
      ? "Stripe admin token is not configured."
      : "Admin token is required.";
    return sendError(res, status, message, auth.reason);
  }

  const billingConfig = getPublicBillingConfig(req);
  if (!billingConfig.enabled) {
    return sendError(res, 503, "Stripe billing is not configured on this deployment.", "billing_not_configured");
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return sendError(res, 503, "Stripe billing is unavailable.", "stripe_unavailable");
  }

  try {
    const body = await readJsonBody(req);
    let userId = normalizeId(body.userId);
    let customerId = normalizeId(body.customerId);
    const customerEmail = normalizeEmail(body.customerEmail);
    const dryRun = toBoolean(body.dryRun);
    let previousSummary = null;

    if (userId) {
      const profile = await getStripeBillingProfile(userId);
      if (!customerId) {
        customerId = normalizeId(profile.customerId);
      }
      previousSummary = summarizeEntitlementsFromProfile(profile);
    }

    if (customerId && !userId) {
      userId = await getUserIdForStripeCustomer(customerId);
    }

    if (!customerId) {
      return sendError(
        res,
        400,
        "Customer could not be resolved. Provide customerId, or a userId already bound to Stripe.",
        "customer_resolution_failed",
      );
    }

    const subscriptions = await listCustomerSubscriptions(stripe, customerId);
    const summary = summarizeEntitlementsFromSubscriptions(subscriptions);

    if (dryRun) {
      return sendJson(res, 200, {
        ok: true,
        dryRun: true,
        customerId,
        userId: userId || "",
        customerBound: Boolean(userId),
        changed: previousSummary ? didSummaryChange(previousSummary, summary) : false,
        ...summary,
      });
    }

    if (!userId) {
      return sendJson(res, 200, {
        ok: true,
        dryRun: false,
        customerId,
        userId: "",
        customerBound: false,
        changed: false,
        ...summary,
      });
    }

    if (customerId) {
      await bindUserToStripeCustomer({ userId, customerId, customerEmail });
    }

    const savedProfile = await saveStripeBillingProfile(userId, {
      customerId,
      customerEmail,
      entitlements: summary.entitlements,
      subscriptions: summary.subscriptions,
      activePlanId: summary.activePlanId,
      lastSource: "admin_reconcile",
    });
    const savedSummary = summarizeEntitlementsFromProfile(savedProfile);

    return sendJson(res, 200, {
      ok: true,
      dryRun: false,
      customerId,
      userId,
      customerBound: true,
      changed: didSummaryChange(previousSummary, savedSummary),
      ...savedSummary,
    });
  } catch (error) {
    return sendError(
      res,
      500,
      "Stripe admin reconcile failed.",
      "admin_reconcile_failed",
      { message: String(error && error.message ? error.message : error) },
    );
  }
};
