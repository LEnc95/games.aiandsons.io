const Stripe = require("stripe");

const APP_TAG = "cade-games";
const PLAN_PRICE_ENV_MAP = Object.freeze({
  "family-monthly": "STRIPE_PRICE_FAMILY_MONTHLY",
  "family-annual": "STRIPE_PRICE_FAMILY_ANNUAL",
  "school-monthly": "STRIPE_PRICE_SCHOOL_MONTHLY",
  "school-annual": "STRIPE_PRICE_SCHOOL_ANNUAL",
});
const FAMILY_PLAN_IDS = new Set(["family-monthly", "family-annual"]);
const SCHOOL_PLAN_IDS = new Set(["school-monthly", "school-annual"]);
const ENTITLED_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const DEFAULT_PAST_DUE_GRACE_DAYS = 7;

let cachedStripeClient = null;

function getStripeClient() {
  const secretKey = typeof process.env.STRIPE_SECRET_KEY === "string"
    ? process.env.STRIPE_SECRET_KEY.trim()
    : "";
  if (!secretKey) return null;
  if (!cachedStripeClient) {
    cachedStripeClient = new Stripe(secretKey);
  }
  return cachedStripeClient;
}

function getConfiguredPlanPrices() {
  const configured = {};
  for (const [planId, envKey] of Object.entries(PLAN_PRICE_ENV_MAP)) {
    const priceId = typeof process.env[envKey] === "string" ? process.env[envKey].trim() : "";
    if (priceId) {
      configured[planId] = priceId;
    }
  }
  return configured;
}

function hasConfiguredSupportedPlan(planPrices = getConfiguredPlanPrices()) {
  return Object.keys(planPrices).length > 0;
}

function getRequestOrigin(req) {
  const configuredBaseUrl = typeof process.env.APP_BASE_URL === "string"
    ? process.env.APP_BASE_URL.trim()
    : "";
  if (configuredBaseUrl) {
    try {
      return new URL(configuredBaseUrl).origin;
    } catch {
      // Fall through to request-derived origin.
    }
  }

  const host = req?.headers?.host || "localhost";
  const forwardedProto = req?.headers?.["x-forwarded-proto"];
  const protocol = typeof forwardedProto === "string" ? forwardedProto.split(",")[0].trim() : "https";
  return `${protocol}://${host}`;
}

function normalizePath(value, fallbackPath) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return fallbackPath;
  try {
    const url = new URL(candidate);
    return `${url.pathname}${url.search || ""}`;
  } catch {
    if (candidate.startsWith("/")) return candidate;
    return fallbackPath;
  }
}

function sanitizeReturnUrl(urlValue, baseOrigin, fallbackPath) {
  const normalizedPath = normalizePath(urlValue, fallbackPath);
  try {
    return new URL(normalizedPath, baseOrigin).toString();
  } catch {
    return new URL(fallbackPath, baseOrigin).toString();
  }
}

function normalizePlanId(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 160);
}

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function normalizeUnixTimestampSeconds(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeUnixTimestampMillis(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  if (req.body && typeof req.body === "object") return Buffer.from(JSON.stringify(req.body));

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const raw = await readRawBody(req);
  if (!raw || raw.length === 0) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return {};
  }
}

function getQuery(req) {
  if (req.query && typeof req.query === "object") {
    return req.query;
  }

  const currentUrl = req && typeof req.url === "string" ? req.url : "/";
  const parsed = new URL(currentUrl, "http://localhost");
  const query = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    query[key] = value;
  }
  return query;
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload || {}));
}

function sendError(res, statusCode, message, code = "stripe_error", details = null) {
  return sendJson(res, statusCode, {
    ok: false,
    code,
    error: message,
    details: details || undefined,
  });
}

function getPublicBillingConfig(req) {
  const stripe = getStripeClient();
  const planPrices = getConfiguredPlanPrices();
  const enabled = Boolean(stripe) && hasConfiguredSupportedPlan(planPrices);
  const mode = !enabled
    ? "local"
    : (String(process.env.STRIPE_SECRET_KEY || "").trim().startsWith("sk_live_") ? "live" : "test");

  return {
    ok: true,
    provider: enabled ? "stripe" : "local",
    enabled,
    mode,
    customerPortalEnabled: enabled && process.env.STRIPE_BILLING_PORTAL_ENABLED !== "false",
    webhookConfigured: enabled && Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || "").trim()),
    supportedPlans: Object.keys(planPrices),
    returnOrigin: getRequestOrigin(req),
  };
}

async function findCustomerByEmail(stripe, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!isLikelyEmail(normalizedEmail)) return null;
  const customers = await stripe.customers.list({ email: normalizedEmail, limit: 1 });
  if (!Array.isArray(customers?.data) || customers.data.length === 0) return null;
  return customers.data[0];
}

function summarizeEntitlementsFromProfile(profile) {
  const safeProfile = profile && typeof profile === "object" ? profile : {};
  const rawEntitlements = safeProfile.entitlements && typeof safeProfile.entitlements === "object"
    ? safeProfile.entitlements
    : {};
  const subscriptions = Array.isArray(safeProfile.subscriptions) ? safeProfile.subscriptions : [];
  const updatedAt = Number(safeProfile.updatedAt);

  return {
    entitlements: {
      familyPremium: Boolean(rawEntitlements.familyPremium),
      schoolLicense: Boolean(rawEntitlements.schoolLicense),
    },
    subscriptions,
    activePlanId: typeof safeProfile.activePlanId === "string" ? safeProfile.activePlanId : "",
    subscriptionId: typeof safeProfile.subscriptionId === "string" ? safeProfile.subscriptionId : "",
    subscriptionStatus: typeof safeProfile.subscriptionStatus === "string" ? safeProfile.subscriptionStatus : "",
    priceId: typeof safeProfile.priceId === "string" ? safeProfile.priceId : "",
    billingInterval: typeof safeProfile.billingInterval === "string" ? safeProfile.billingInterval : "",
    currentPeriodStart: normalizeUnixTimestampSeconds(safeProfile.currentPeriodStart),
    currentPeriodEnd: normalizeUnixTimestampSeconds(safeProfile.currentPeriodEnd),
    cancelAtPeriodEnd: Boolean(safeProfile.cancelAtPeriodEnd),
    cancelAt: normalizeUnixTimestampSeconds(safeProfile.cancelAt),
    canceledAt: normalizeUnixTimestampSeconds(safeProfile.canceledAt),
    trialEnd: normalizeUnixTimestampSeconds(safeProfile.trialEnd),
    latestInvoiceId: typeof safeProfile.latestInvoiceId === "string" ? safeProfile.latestInvoiceId : "",
    latestInvoiceStatus: typeof safeProfile.latestInvoiceStatus === "string" ? safeProfile.latestInvoiceStatus : "",
    lastPaymentFailureAt: normalizeUnixTimestampMillis(safeProfile.lastPaymentFailureAt),
    graceUntil: normalizeUnixTimestampMillis(safeProfile.graceUntil),
    seatLimit: Number.isFinite(Number(safeProfile.seatLimit)) ? Math.max(0, Math.floor(Number(safeProfile.seatLimit))) : 0,
    seatCount: Number.isFinite(Number(safeProfile.seatCount)) ? Math.max(0, Math.floor(Number(safeProfile.seatCount))) : 0,
    familyAccountId: typeof safeProfile.familyAccountId === "string" ? safeProfile.familyAccountId : "",
    updatedAt: Number.isFinite(updatedAt) ? Math.max(0, Math.floor(updatedAt)) : 0,
  };
}

function findPlanIdForPriceId(priceId, planPrices = getConfiguredPlanPrices()) {
  if (!priceId) return "";
  for (const [planId, configuredPriceId] of Object.entries(planPrices)) {
    if (configuredPriceId === priceId) return planId;
  }
  return "";
}

function getPastDueGracePeriodMs() {
  const configuredDays = Number(process.env.STRIPE_PAST_DUE_GRACE_DAYS || DEFAULT_PAST_DUE_GRACE_DAYS);
  const safeDays = Number.isFinite(configuredDays) && configuredDays >= 0
    ? Math.floor(configuredDays)
    : DEFAULT_PAST_DUE_GRACE_DAYS;
  return safeDays * 24 * 60 * 60 * 1000;
}

function readPriceInterval(price) {
  const interval = typeof price?.recurring?.interval === "string"
    ? price.recurring.interval.trim().toLowerCase()
    : "";
  return interval || "";
}

function readLatestInvoiceSummary(subscription) {
  const invoice = subscription?.latest_invoice;
  if (typeof invoice === "string") {
    return {
      latestInvoiceId: invoice.trim(),
      latestInvoiceStatus: "",
    };
  }

  return {
    latestInvoiceId: typeof invoice?.id === "string" ? invoice.id.trim() : "",
    latestInvoiceStatus: typeof invoice?.status === "string" ? invoice.status.trim() : "",
  };
}

function deriveGraceUntil({
  subscriptionStatus = "",
  currentPeriodEnd = 0,
  existingGraceUntil = 0,
  paymentFailureAt = 0,
  now = Date.now(),
} = {}) {
  if (subscriptionStatus !== "past_due") return 0;

  const normalizedExisting = normalizeUnixTimestampMillis(existingGraceUntil);
  if (normalizedExisting > now) return normalizedExisting;

  const normalizedFailureAt = normalizeUnixTimestampMillis(paymentFailureAt);
  if (normalizedFailureAt > 0) {
    return normalizedFailureAt + getPastDueGracePeriodMs();
  }

  const normalizedPeriodEndSeconds = normalizeUnixTimestampSeconds(currentPeriodEnd);
  if (normalizedPeriodEndSeconds > 0) {
    return (normalizedPeriodEndSeconds * 1000) + getPastDueGracePeriodMs();
  }

  return now + getPastDueGracePeriodMs();
}

function isSubscriptionEntitled(subscriptionStatus, graceUntil = 0, now = Date.now()) {
  if (ENTITLED_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    return true;
  }
  return subscriptionStatus === "past_due" && normalizeUnixTimestampMillis(graceUntil) > now;
}

function getSubscriptionStatusRank(status) {
  switch (status) {
    case "active":
      return 7;
    case "trialing":
      return 6;
    case "past_due":
      return 5;
    case "incomplete":
      return 4;
    case "unpaid":
      return 3;
    case "paused":
      return 2;
    case "canceled":
      return 1;
    default:
      return 0;
  }
}

function summarizeEntitlementsFromSubscriptions(
  subscriptions,
  planPrices = getConfiguredPlanPrices(),
  options = {},
) {
  const list = Array.isArray(subscriptions) ? subscriptions : [];
  const now = Date.now();
  const existingGraceUntil = normalizeUnixTimestampMillis(options.graceUntil);
  const lastPaymentFailureAt = normalizeUnixTimestampMillis(options.lastPaymentFailureAt);
  let familyPremium = false;
  let schoolLicense = false;
  let activePlanId = "";
  let primarySubscription = null;

  const normalizedSubscriptions = [];
  for (const subscription of list) {
    const subscriptionStatus = typeof subscription?.status === "string" ? subscription.status : "";
    const lineItems = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
    const currentPeriodStart = normalizeUnixTimestampSeconds(subscription?.current_period_start);
    const currentPeriodEnd = normalizeUnixTimestampSeconds(subscription?.current_period_end);
    const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end);
    const cancelAt = normalizeUnixTimestampSeconds(subscription?.cancel_at);
    const canceledAt = normalizeUnixTimestampSeconds(subscription?.canceled_at);
    const trialEnd = normalizeUnixTimestampSeconds(subscription?.trial_end);
    const { latestInvoiceId, latestInvoiceStatus } = readLatestInvoiceSummary(subscription);

    const plans = [];
    const priceIds = [];
    let billingInterval = "";
    for (const item of lineItems) {
      const priceId = typeof item?.price?.id === "string" ? item.price.id : "";
      if (priceId) {
        priceIds.push(priceId);
      }
      if (!billingInterval) {
        billingInterval = readPriceInterval(item?.price);
      }
      const planId = findPlanIdForPriceId(priceId, planPrices);
      if (!planId) continue;
      plans.push(planId);
    }

    const graceUntil = deriveGraceUntil({
      subscriptionStatus,
      currentPeriodEnd,
      existingGraceUntil,
      paymentFailureAt: lastPaymentFailureAt,
      now,
    });
    const entitled = isSubscriptionEntitled(subscriptionStatus, graceUntil, now);

    for (const planId of plans) {
      if (entitled && FAMILY_PLAN_IDS.has(planId)) {
        familyPremium = true;
        if (!activePlanId) activePlanId = planId;
      }
      if (entitled && SCHOOL_PLAN_IDS.has(planId)) {
        schoolLicense = true;
        if (!activePlanId) activePlanId = planId;
      }
    }

    const normalizedSubscription = {
      id: typeof subscription?.id === "string" ? subscription.id : "",
      status: subscriptionStatus,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      cancelAt,
      canceledAt,
      trialEnd,
      latestInvoiceId,
      latestInvoiceStatus,
      collectionMethod: typeof subscription?.collection_method === "string"
        ? subscription.collection_method.trim()
        : "",
      priceIds,
      plans,
      billingInterval,
      graceUntil,
      entitled,
    };
    normalizedSubscriptions.push(normalizedSubscription);

    if (!primarySubscription) {
      primarySubscription = normalizedSubscription;
      continue;
    }

    const currentRank = getSubscriptionStatusRank(normalizedSubscription.status);
    const previousRank = getSubscriptionStatusRank(primarySubscription.status);
    if (currentRank > previousRank) {
      primarySubscription = normalizedSubscription;
      continue;
    }
    if (currentRank === previousRank && normalizedSubscription.currentPeriodEnd > primarySubscription.currentPeriodEnd) {
      primarySubscription = normalizedSubscription;
    }
  }

  return {
    entitlements: {
      familyPremium,
      schoolLicense,
    },
    subscriptions: normalizedSubscriptions,
    activePlanId,
    subscriptionId: typeof primarySubscription?.id === "string" ? primarySubscription.id : "",
    subscriptionStatus: typeof primarySubscription?.status === "string" ? primarySubscription.status : "",
    priceId: Array.isArray(primarySubscription?.priceIds) && primarySubscription.priceIds.length > 0
      ? primarySubscription.priceIds[0]
      : "",
    billingInterval: typeof primarySubscription?.billingInterval === "string"
      ? primarySubscription.billingInterval
      : "",
    currentPeriodStart: Number(primarySubscription?.currentPeriodStart || 0),
    currentPeriodEnd: Number(primarySubscription?.currentPeriodEnd || 0),
    cancelAtPeriodEnd: Boolean(primarySubscription?.cancelAtPeriodEnd),
    cancelAt: Number(primarySubscription?.cancelAt || 0),
    canceledAt: Number(primarySubscription?.canceledAt || 0),
    trialEnd: Number(primarySubscription?.trialEnd || 0),
    latestInvoiceId: typeof primarySubscription?.latestInvoiceId === "string"
      ? primarySubscription.latestInvoiceId
      : "",
    latestInvoiceStatus: typeof primarySubscription?.latestInvoiceStatus === "string"
      ? primarySubscription.latestInvoiceStatus
      : "",
    graceUntil: Number(primarySubscription?.graceUntil || 0),
    lastPaymentFailureAt,
    updatedAt: Date.now(),
  };
}

async function listCustomerSubscriptions(stripe, customerId) {
  const normalizedCustomerId = typeof customerId === "string" ? customerId.trim() : "";
  if (!normalizedCustomerId) return [];
  const response = await stripe.subscriptions.list({
    customer: normalizedCustomerId,
    status: "all",
    limit: 25,
    expand: ["data.items.data.price", "data.latest_invoice"],
  });
  return Array.isArray(response?.data) ? response.data : [];
}

async function forwardWebhookEvent(event) {
  const endpoint = typeof process.env.STRIPE_WEBHOOK_FORWARD_URL === "string"
    ? process.env.STRIPE_WEBHOOK_FORWARD_URL.trim()
    : "";
  if (!endpoint) return;

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: APP_TAG,
        type: event?.type || "",
        id: event?.id || "",
        created: Number(event?.created || 0),
      }),
    });
  } catch {
    // Non-blocking forward attempt.
  }
}

module.exports = {
  APP_TAG,
  FAMILY_PLAN_IDS,
  SCHOOL_PLAN_IDS,
  PLAN_PRICE_ENV_MAP,
  getStripeClient,
  getConfiguredPlanPrices,
  getRequestOrigin,
  normalizePlanId,
  normalizeEmail,
  isLikelyEmail,
  sanitizeReturnUrl,
  readRawBody,
  readJsonBody,
  getQuery,
  sendJson,
  sendError,
  getPublicBillingConfig,
  findCustomerByEmail,
  listCustomerSubscriptions,
  getPastDueGracePeriodMs,
  isSubscriptionEntitled,
  summarizeEntitlementsFromProfile,
  summarizeEntitlementsFromSubscriptions,
  forwardWebhookEvent,
};
