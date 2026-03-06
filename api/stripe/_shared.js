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
const ENTITLED_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

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

function hasConfiguredFamilyPlan(planPrices = getConfiguredPlanPrices()) {
  for (const planId of Object.keys(planPrices)) {
    if (FAMILY_PLAN_IDS.has(planId)) return true;
  }
  return false;
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
  const enabled = Boolean(stripe) && hasConfiguredFamilyPlan(planPrices);
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

function findPlanIdForPriceId(priceId, planPrices = getConfiguredPlanPrices()) {
  if (!priceId) return "";
  for (const [planId, configuredPriceId] of Object.entries(planPrices)) {
    if (configuredPriceId === priceId) return planId;
  }
  return "";
}

function summarizeEntitlementsFromSubscriptions(subscriptions, planPrices = getConfiguredPlanPrices()) {
  const list = Array.isArray(subscriptions) ? subscriptions : [];
  let familyPremium = false;
  let schoolLicense = false;
  let activePlanId = "";

  const normalizedSubscriptions = [];
  for (const subscription of list) {
    const subscriptionStatus = typeof subscription?.status === "string" ? subscription.status : "";
    const entitled = ENTITLED_SUBSCRIPTION_STATUSES.has(subscriptionStatus);
    const lineItems = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];

    const plans = [];
    for (const item of lineItems) {
      const priceId = typeof item?.price?.id === "string" ? item.price.id : "";
      const planId = findPlanIdForPriceId(priceId, planPrices);
      if (!planId) continue;
      plans.push(planId);

      if (entitled && FAMILY_PLAN_IDS.has(planId)) {
        familyPremium = true;
        if (!activePlanId) activePlanId = planId;
      }
      if (entitled && SCHOOL_PLAN_IDS.has(planId)) {
        schoolLicense = true;
        if (!activePlanId) activePlanId = planId;
      }
    }

    normalizedSubscriptions.push({
      id: typeof subscription?.id === "string" ? subscription.id : "",
      status: subscriptionStatus,
      currentPeriodEnd: Number(subscription?.current_period_end || 0),
      plans,
    });
  }

  return {
    entitlements: {
      familyPremium,
      schoolLicense,
    },
    subscriptions: normalizedSubscriptions,
    activePlanId,
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
    expand: ["data.items.data.price"],
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
  summarizeEntitlementsFromSubscriptions,
  forwardWebhookEvent,
};
