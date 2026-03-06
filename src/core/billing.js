import { get, set } from "./storage.js";
import { ENTITLEMENT_KEYS, getEntitlements, setEntitlements } from "./entitlements.js";

const BILLING_EMAIL_STORAGE_KEY = "billingEmail";
const KNOWN_PLAN_IDS = new Set([
  "family-monthly",
  "family-annual",
  "school-monthly",
  "school-annual",
]);
const BILLING_CONFIG_CACHE_TTL_MS = 60_000;
const BILLING_SESSION_CACHE_TTL_MS = 5 * 60_000;

export const DEFAULT_BILLING_CONFIG = Object.freeze({
  provider: "local",
  enabled: false,
  mode: "local",
  customerPortalEnabled: false,
  webhookConfigured: false,
  supportedPlans: [],
});

let cachedBillingConfig = DEFAULT_BILLING_CONFIG;
let billingConfigFetchedAt = 0;
let cachedBillingSession = null;
let billingSessionFetchedAt = 0;

const normalizeEmail = (value) => {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return "";
  return email.slice(0, 160);
};

const isLikelyEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));

const normalizeSupportedPlans = (plans) => {
  if (!Array.isArray(plans)) return [];
  const normalized = [];
  for (const rawPlan of plans) {
    if (typeof rawPlan !== "string") continue;
    const plan = rawPlan.trim();
    if (!KNOWN_PLAN_IDS.has(plan) || normalized.includes(plan)) continue;
    normalized.push(plan);
  }
  return normalized;
};

const shouldSkipRemoteBillingProbe = () => {
  if (typeof location === "undefined") return false;
  const host = String(location.hostname || "").toLowerCase();
  const isLoopback = host === "localhost" || host === "127.0.0.1";
  if (!isLoopback) return false;

  try {
    const params = new URLSearchParams(location.search || "");
    const forceProbe = params.get("stripeApiProbe");
    return forceProbe !== "1";
  } catch {
    return true;
  }
};

export const normalizeBillingConfig = (source) => {
  const raw = source && typeof source === "object" ? source : {};
  const providerRaw = typeof raw.provider === "string" ? raw.provider.trim().toLowerCase() : "local";
  const provider = providerRaw === "stripe" ? "stripe" : "local";
  const modeRaw = typeof raw.mode === "string" ? raw.mode.trim().toLowerCase() : "local";
  const mode = modeRaw === "live" || modeRaw === "test" ? modeRaw : "local";
  const supportedPlans = normalizeSupportedPlans(raw.supportedPlans);
  const enabled = provider === "stripe" && Boolean(raw.enabled) && supportedPlans.length > 0;
  return {
    provider,
    enabled,
    mode,
    customerPortalEnabled: enabled && Boolean(raw.customerPortalEnabled),
    webhookConfigured: enabled && Boolean(raw.webhookConfigured),
    supportedPlans,
  };
};

const parseApiResponse = async (response) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) return payload;
  const message = payload && typeof payload.error === "string"
    ? payload.error
    : `Request failed (${response.status})`;
  throw new Error(message);
};

export const ensureBillingSession = async ({ force = false } = {}) => {
  if (shouldSkipRemoteBillingProbe()) {
    cachedBillingSession = null;
    billingSessionFetchedAt = Date.now();
    return null;
  }

  const now = Date.now();
  if (!force && cachedBillingSession && (now - billingSessionFetchedAt) < BILLING_SESSION_CACHE_TTL_MS) {
    return cachedBillingSession;
  }

  try {
    const response = await fetch("/api/auth/session", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const payload = await parseApiResponse(response);
    if (payload && payload.ok && typeof payload.userId === "string" && payload.userId.trim()) {
      cachedBillingSession = {
        userId: payload.userId.trim(),
        expiresAt: Number(payload.expiresAt || 0),
      };
    } else {
      cachedBillingSession = null;
    }
  } catch {
    cachedBillingSession = null;
  }

  billingSessionFetchedAt = now;
  return cachedBillingSession;
};

export const fetchBillingConfig = async ({ force = false } = {}) => {
  if (shouldSkipRemoteBillingProbe()) {
    cachedBillingConfig = DEFAULT_BILLING_CONFIG;
    billingConfigFetchedAt = Date.now();
    return cachedBillingConfig;
  }

  const now = Date.now();
  if (!force && (now - billingConfigFetchedAt) < BILLING_CONFIG_CACHE_TTL_MS) {
    return cachedBillingConfig;
  }

  try {
    const response = await fetch("/api/stripe/config", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const payload = await parseApiResponse(response);
    cachedBillingConfig = normalizeBillingConfig(payload);
    if (cachedBillingConfig.enabled) {
      await ensureBillingSession({ force });
    }
  } catch {
    cachedBillingConfig = DEFAULT_BILLING_CONFIG;
  }

  billingConfigFetchedAt = now;
  return cachedBillingConfig;
};

export const isStripeBillingEnabled = (config = DEFAULT_BILLING_CONFIG) => {
  const normalized = normalizeBillingConfig(config);
  return normalized.provider === "stripe" && normalized.enabled;
};

export const getBillingEmail = () => {
  return normalizeEmail(get(BILLING_EMAIL_STORAGE_KEY, ""));
};

export const setBillingEmail = (value) => {
  const normalized = normalizeEmail(value);
  if (!normalized) return "";
  set(BILLING_EMAIL_STORAGE_KEY, normalized);
  return normalized;
};

const postJson = async (url, payload) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
  return parseApiResponse(response);
};

export const createStripeCheckoutSession = async ({
  planId,
  customerEmail,
  successUrl,
  cancelUrl,
} = {}) => {
  await ensureBillingSession();
  const payload = {
    planId: typeof planId === "string" ? planId.trim() : "",
    customerEmail: normalizeEmail(customerEmail),
    successUrl: typeof successUrl === "string" ? successUrl : "",
    cancelUrl: typeof cancelUrl === "string" ? cancelUrl : "",
  };
  if (!payload.planId) throw new Error("Choose a valid plan before starting checkout.");
  if (!isLikelyEmail(payload.customerEmail)) throw new Error("Enter a valid billing email.");
  const response = await postJson("/api/stripe/create-checkout-session", payload);
  if (!response || typeof response.url !== "string" || !response.url) {
    throw new Error("Checkout session did not return a redirect URL.");
  }
  setBillingEmail(payload.customerEmail);
  return response;
};

export const createStripePortalSession = async ({
  customerEmail,
  returnUrl,
  sessionId,
} = {}) => {
  await ensureBillingSession();
  const normalizedEmail = normalizeEmail(customerEmail);
  const payload = {
    customerEmail: normalizedEmail,
    returnUrl: typeof returnUrl === "string" ? returnUrl : "",
    sessionId: typeof sessionId === "string" ? sessionId.trim() : "",
  };
  if (payload.customerEmail && !isLikelyEmail(payload.customerEmail)) {
    throw new Error("Enter the billing email for your subscription.");
  }
  const response = await postJson("/api/stripe/create-portal-session", payload);
  if (!response || typeof response.url !== "string" || !response.url) {
    throw new Error("Billing portal did not return a redirect URL.");
  }
  if (payload.customerEmail) {
    setBillingEmail(payload.customerEmail);
  }
  return response;
};

export const fetchStripeSubscriptionStatus = async ({
  sessionId,
  customerEmail,
} = {}) => {
  await ensureBillingSession();
  const query = new URLSearchParams();
  if (typeof sessionId === "string" && sessionId.trim()) {
    query.set("sessionId", sessionId.trim());
  }
  const normalizedEmail = normalizeEmail(customerEmail);
  if (normalizedEmail) {
    query.set("customerEmail", normalizedEmail);
  }

  const suffix = query.toString();
  const endpoint = suffix ? `/api/stripe/subscription-status?${suffix}` : "/api/stripe/subscription-status";
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const payload = await parseApiResponse(response);
  if (normalizedEmail) {
    setBillingEmail(normalizedEmail);
  } else if (payload && typeof payload.customerEmail === "string" && payload.customerEmail) {
    setBillingEmail(payload.customerEmail);
  }
  return payload;
};

export const applyStripeEntitlementSnapshot = (snapshot, { fallbackPlanId = "" } = {}) => {
  if (!snapshot || snapshot.mode !== "stripe") {
    return null;
  }

  const current = getEntitlements();
  const checkout = current.checkout && typeof current.checkout === "object"
    ? current.checkout
    : { status: "idle", planId: "", token: "", startedAt: 0, completedAt: 0 };
  const familyPremium = Boolean(snapshot.entitlements?.familyPremium);
  const schoolLicense = Boolean(snapshot.entitlements?.schoolLicense);
  const nextPlanId = typeof snapshot.activePlanId === "string" && snapshot.activePlanId
    ? snapshot.activePlanId
    : (fallbackPlanId || checkout.planId);

  return setEntitlements({
    ...current,
    [ENTITLEMENT_KEYS.FAMILY_PREMIUM]: familyPremium,
    [ENTITLEMENT_KEYS.SCHOOL_LICENSE]: schoolLicense,
    checkout: {
      status: familyPremium ? "active" : "idle",
      planId: familyPremium ? nextPlanId : "",
      token: "",
      startedAt: familyPremium ? (checkout.startedAt || Date.now()) : 0,
      completedAt: familyPremium ? Date.now() : 0,
    },
  });
};

export const syncLocalEntitlementsFromStripe = async ({
  sessionId,
  customerEmail,
} = {}) => {
  const snapshot = await fetchStripeSubscriptionStatus({ sessionId, customerEmail });
  const entitlements = applyStripeEntitlementSnapshot(snapshot);
  if (!entitlements) {
    return { synced: false, snapshot };
  }
  return { synced: true, snapshot, entitlements };
};

export const syncEntitlementsWithBillingBackend = async ({
  forceConfig = false,
  sessionId,
} = {}) => {
  const config = await fetchBillingConfig({ force: forceConfig });
  if (!isStripeBillingEnabled(config)) {
    return { synced: false, mode: "local" };
  }

  const snapshot = await fetchStripeSubscriptionStatus({ sessionId });
  const entitlements = applyStripeEntitlementSnapshot(snapshot);
  if (!entitlements) {
    return { synced: false, snapshot };
  }

  return { synced: true, snapshot, entitlements };
};
