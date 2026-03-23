const { getFirestore, isFirebaseAdminConfigured } = require("../_firebase-admin");

const KEY_PREFIX = "cade_games:stripe:v2";
const WEBHOOK_EVENT_TTL_SECONDS = 60 * 60 * 24 * 60;
const FIRESTORE_PROFILES_COLLECTION = "stripeBillingProfiles";
const FIRESTORE_CUSTOMERS_COLLECTION = "stripeCustomerUsers";
const FIRESTORE_EVENTS_COLLECTION = "stripeWebhookEvents";

const memoryState = (() => {
  if (!globalThis.__cadeStripeMemoryStore) {
    globalThis.__cadeStripeMemoryStore = {
      values: new Map(),
      expiresAt: new Map(),
    };
  }
  return globalThis.__cadeStripeMemoryStore;
})();

function normalizeUserId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCustomerId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 160);
}

function normalizeText(value, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeTimestampSeconds(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeTimestampMillis(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeCount(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeNotificationPrefs(source) {
  const raw = source && typeof source === "object" ? source : {};
  return {
    billingEmail: raw.billingEmail !== false,
    productEmail: raw.productEmail !== false,
    familyInvites: raw.familyInvites !== false,
  };
}

function normalizeSubscriptions(source) {
  if (!Array.isArray(source)) return [];
  const out = [];
  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue;
    const id = normalizeText(entry.id, 120);
    const status = normalizeText(entry.status, 80);
    const currentPeriodStart = normalizeTimestampSeconds(entry.currentPeriodStart);
    const currentPeriodEnd = normalizeTimestampSeconds(entry.currentPeriodEnd);
    const cancelAtPeriodEnd = Boolean(entry.cancelAtPeriodEnd);
    const cancelAt = normalizeTimestampSeconds(entry.cancelAt);
    const canceledAt = normalizeTimestampSeconds(entry.canceledAt);
    const trialEnd = normalizeTimestampSeconds(entry.trialEnd);
    const latestInvoiceId = normalizeText(entry.latestInvoiceId, 120);
    const latestInvoiceStatus = normalizeText(entry.latestInvoiceStatus, 80);
    const collectionMethod = normalizeText(entry.collectionMethod, 80);
    const billingInterval = normalizeText(entry.billingInterval, 40);
    const graceUntil = normalizeTimestampMillis(entry.graceUntil);
    const entitled = Boolean(entry.entitled);
    const priceIds = Array.isArray(entry.priceIds)
      ? entry.priceIds.map((value) => normalizeText(value, 120)).filter(Boolean)
      : [];
    const plans = Array.isArray(entry.plans)
      ? entry.plans.map((plan) => normalizeText(plan, 80)).filter(Boolean)
      : [];

    out.push({
      id,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      cancelAt,
      canceledAt,
      trialEnd,
      latestInvoiceId,
      latestInvoiceStatus,
      collectionMethod,
      priceIds,
      plans,
      billingInterval,
      graceUntil,
      entitled,
    });
  }
  return out;
}

function createDefaultBillingProfile(userId = "") {
  return {
    userId: normalizeUserId(userId),
    customerId: "",
    customerEmail: "",
    entitlements: {
      familyPremium: false,
      schoolLicense: false,
    },
    activePlanId: "",
    subscriptionId: "",
    subscriptionStatus: "",
    priceId: "",
    billingInterval: "",
    subscriptions: [],
    currentPeriodStart: 0,
    currentPeriodEnd: 0,
    cancelAtPeriodEnd: false,
    cancelAt: 0,
    canceledAt: 0,
    trialEnd: 0,
    latestInvoiceId: "",
    latestInvoiceStatus: "",
    lastPaymentFailureAt: 0,
    graceUntil: 0,
    checkoutSessionId: "",
    familyAccountId: "",
    familyRole: "",
    familyOwnerUserId: "",
    seatLimit: 0,
    seatCount: 0,
    notificationPrefs: {
      billingEmail: true,
      productEmail: true,
      familyInvites: true,
    },
    updatedAt: 0,
    lastSource: "",
  };
}

function normalizeBillingProfile(source, fallbackUserId = "") {
  const raw = source && typeof source === "object" ? source : {};
  const fallback = createDefaultBillingProfile(fallbackUserId);
  const entitlements = raw.entitlements && typeof raw.entitlements === "object"
    ? raw.entitlements
    : {};
  const updatedAt = Number(raw.updatedAt);

  return {
    userId: normalizeUserId(raw.userId || fallback.userId),
    customerId: normalizeCustomerId(raw.customerId),
    customerEmail: normalizeEmail(raw.customerEmail),
    entitlements: {
      familyPremium: Boolean(entitlements.familyPremium),
      schoolLicense: Boolean(entitlements.schoolLicense),
    },
    activePlanId: normalizeText(raw.activePlanId, 80),
    subscriptionId: normalizeText(raw.subscriptionId, 120),
    subscriptionStatus: normalizeText(raw.subscriptionStatus, 80),
    priceId: normalizeText(raw.priceId, 120),
    billingInterval: normalizeText(raw.billingInterval, 40),
    subscriptions: normalizeSubscriptions(raw.subscriptions),
    currentPeriodStart: normalizeTimestampSeconds(raw.currentPeriodStart),
    currentPeriodEnd: normalizeTimestampSeconds(raw.currentPeriodEnd),
    cancelAtPeriodEnd: Boolean(raw.cancelAtPeriodEnd),
    cancelAt: normalizeTimestampSeconds(raw.cancelAt),
    canceledAt: normalizeTimestampSeconds(raw.canceledAt),
    trialEnd: normalizeTimestampSeconds(raw.trialEnd),
    latestInvoiceId: normalizeText(raw.latestInvoiceId, 120),
    latestInvoiceStatus: normalizeText(raw.latestInvoiceStatus, 80),
    lastPaymentFailureAt: normalizeTimestampMillis(raw.lastPaymentFailureAt),
    graceUntil: normalizeTimestampMillis(raw.graceUntil),
    checkoutSessionId: normalizeText(raw.checkoutSessionId, 120),
    familyAccountId: normalizeText(raw.familyAccountId, 120),
    familyRole: normalizeText(raw.familyRole, 40),
    familyOwnerUserId: normalizeText(raw.familyOwnerUserId, 160),
    seatLimit: normalizeCount(raw.seatLimit),
    seatCount: normalizeCount(raw.seatCount),
    notificationPrefs: normalizeNotificationPrefs(raw.notificationPrefs),
    updatedAt: Number.isFinite(updatedAt) ? Math.max(0, Math.floor(updatedAt)) : 0,
    lastSource: normalizeText(raw.lastSource, 80),
  };
}

function getKvConfig() {
  const baseUrl = typeof process.env.KV_REST_API_URL === "string"
    ? process.env.KV_REST_API_URL.trim().replace(/\/+$/, "")
    : "";
  const token = typeof process.env.KV_REST_API_TOKEN === "string"
    ? process.env.KV_REST_API_TOKEN.trim()
    : "";
  return {
    baseUrl,
    token,
    enabled: Boolean(baseUrl && token),
  };
}

function isFirestoreStripeStoreEnabled() {
  return isFirebaseAdminConfigured();
}

function getStripeCollections() {
  const firestore = getFirestore();
  return {
    profiles: firestore.collection(FIRESTORE_PROFILES_COLLECTION),
    customers: firestore.collection(FIRESTORE_CUSTOMERS_COLLECTION),
    events: firestore.collection(FIRESTORE_EVENTS_COLLECTION),
  };
}

async function runKvCommand(command, ...args) {
  const kv = getKvConfig();
  if (!kv.enabled) {
    throw new Error("kv_not_configured");
  }

  const response = await fetch(kv.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kv.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([String(command || "").toUpperCase(), ...args]),
  });

  if (!response.ok) {
    throw new Error(`kv_http_${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  if (payload && payload.error) {
    throw new Error(String(payload.error));
  }

  return payload ? payload.result : null;
}

function getMemoryValue(key) {
  const expiresAt = Number(memoryState.expiresAt.get(key) || 0);
  if (expiresAt > 0 && Date.now() >= expiresAt) {
    memoryState.expiresAt.delete(key);
    memoryState.values.delete(key);
    return null;
  }
  const value = memoryState.values.get(key);
  return typeof value === "string" ? value : null;
}

function setMemoryValue(key, value, ttlSeconds = 0) {
  memoryState.values.set(key, String(value));
  if (Number(ttlSeconds) > 0) {
    memoryState.expiresAt.set(key, Date.now() + Math.floor(Number(ttlSeconds) * 1000));
  } else {
    memoryState.expiresAt.delete(key);
  }
}

async function getStoredValue(key) {
  try {
    const result = await runKvCommand("GET", key);
    if (typeof result === "string") return result;
    if (result == null) return null;
    return String(result);
  } catch {
    return getMemoryValue(key);
  }
}

async function setStoredValue(key, value) {
  const serialized = String(value);
  try {
    await runKvCommand("SET", key, serialized);
  } catch {
    setMemoryValue(key, serialized);
  }
}

async function setStoredValueWithExpiry(key, value, ttlSeconds) {
  const serialized = String(value);
  const ttl = Math.max(1, Math.floor(Number(ttlSeconds) || 0));
  try {
    await runKvCommand("SET", key, serialized, "EX", String(ttl));
  } catch {
    setMemoryValue(key, serialized, ttl);
  }
}

function getUserProfileKey(userId) {
  return `${KEY_PREFIX}:user:${userId}`;
}

function getCustomerUserKey(customerId) {
  return `${KEY_PREFIX}:customer:${customerId}:user`;
}

function getWebhookEventKey(eventId) {
  return `${KEY_PREFIX}:event:${eventId}`;
}

async function getStripeBillingProfileFromFirestore(userId) {
  const normalizedUserId = normalizeUserId(userId);
  const fallback = createDefaultBillingProfile(normalizedUserId);
  if (!normalizedUserId) return fallback;

  const snapshot = await getStripeCollections().profiles.doc(normalizedUserId).get();
  if (!snapshot.exists) return fallback;
  return normalizeBillingProfile(snapshot.data(), normalizedUserId);
}

async function saveStripeBillingProfileToFirestore(userId, patch) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return createDefaultBillingProfile("");
  }

  const existing = await getStripeBillingProfileFromFirestore(normalizedUserId);
  const next = normalizeBillingProfile(
    {
      ...existing,
      ...(patch && typeof patch === "object" ? patch : {}),
      notificationPrefs: {
        ...existing.notificationPrefs,
        ...((patch && patch.notificationPrefs && typeof patch.notificationPrefs === "object") ? patch.notificationPrefs : {}),
      },
      userId: normalizedUserId,
      updatedAt: Date.now(),
    },
    normalizedUserId,
  );

  await getStripeCollections().profiles.doc(normalizedUserId).set(next, { merge: true });
  if (next.customerId) {
    await getStripeCollections().customers.doc(next.customerId).set({
      customerId: next.customerId,
      userId: normalizedUserId,
      customerEmail: next.customerEmail,
      updatedAt: next.updatedAt,
    }, { merge: true });
  }
  return next;
}

async function getUserIdForStripeCustomerFromFirestore(customerId) {
  const normalizedCustomerId = normalizeCustomerId(customerId);
  if (!normalizedCustomerId) return "";
  const snapshot = await getStripeCollections().customers.doc(normalizedCustomerId).get();
  if (!snapshot.exists) return "";
  return normalizeUserId(snapshot.data()?.userId);
}

async function hasProcessedStripeWebhookEventFromFirestore(eventId) {
  const normalizedEventId = typeof eventId === "string" ? eventId.trim() : "";
  if (!normalizedEventId) return false;
  const snapshot = await getStripeCollections().events.doc(normalizedEventId).get();
  if (!snapshot.exists) return false;
  const expiresAt = Number(snapshot.data()?.expiresAt || 0);
  return !expiresAt || expiresAt > Date.now();
}

async function markStripeWebhookEventProcessedInFirestore(eventId) {
  const normalizedEventId = typeof eventId === "string" ? eventId.trim() : "";
  if (!normalizedEventId) return;
  await getStripeCollections().events.doc(normalizedEventId).set({
    eventId: normalizedEventId,
    processedAt: Date.now(),
    expiresAt: Date.now() + (WEBHOOK_EVENT_TTL_SECONDS * 1000),
  }, { merge: true });
}

async function getStripeBillingProfile(userId) {
  const normalizedUserId = normalizeUserId(userId);
  const fallback = createDefaultBillingProfile(normalizedUserId);
  if (!normalizedUserId) return fallback;

  if (isFirestoreStripeStoreEnabled()) {
    return getStripeBillingProfileFromFirestore(normalizedUserId);
  }

  const raw = await getStoredValue(getUserProfileKey(normalizedUserId));
  if (!raw) return fallback;

  try {
    return normalizeBillingProfile(JSON.parse(raw), normalizedUserId);
  } catch {
    return fallback;
  }
}

async function saveStripeBillingProfile(userId, patch) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return createDefaultBillingProfile("");
  }

  if (isFirestoreStripeStoreEnabled()) {
    return saveStripeBillingProfileToFirestore(normalizedUserId, patch);
  }

  const existing = await getStripeBillingProfile(normalizedUserId);
  const next = normalizeBillingProfile(
    {
      ...existing,
      ...(patch && typeof patch === "object" ? patch : {}),
      notificationPrefs: {
        ...existing.notificationPrefs,
        ...((patch && patch.notificationPrefs && typeof patch.notificationPrefs === "object") ? patch.notificationPrefs : {}),
      },
      userId: normalizedUserId,
      updatedAt: Date.now(),
    },
    normalizedUserId,
  );

  await setStoredValue(getUserProfileKey(normalizedUserId), JSON.stringify(next));
  if (next.customerId) {
    await setStoredValue(getCustomerUserKey(next.customerId), normalizedUserId);
  }
  return next;
}

async function bindUserToStripeCustomer({ userId, customerId, customerEmail = "" } = {}) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedCustomerId = normalizeCustomerId(customerId);
  if (!normalizedUserId || !normalizedCustomerId) return null;

  return saveStripeBillingProfile(normalizedUserId, {
    customerId: normalizedCustomerId,
    customerEmail: normalizeEmail(customerEmail),
  });
}

async function getUserIdForStripeCustomer(customerId) {
  const normalizedCustomerId = normalizeCustomerId(customerId);
  if (!normalizedCustomerId) return "";

  if (isFirestoreStripeStoreEnabled()) {
    return getUserIdForStripeCustomerFromFirestore(normalizedCustomerId);
  }

  const value = await getStoredValue(getCustomerUserKey(normalizedCustomerId));
  return normalizeUserId(value);
}

async function hasProcessedStripeWebhookEvent(eventId) {
  const normalizedEventId = typeof eventId === "string" ? eventId.trim() : "";
  if (!normalizedEventId) return false;

  if (isFirestoreStripeStoreEnabled()) {
    return hasProcessedStripeWebhookEventFromFirestore(normalizedEventId);
  }

  const value = await getStoredValue(getWebhookEventKey(normalizedEventId));
  return Boolean(value);
}

async function markStripeWebhookEventProcessed(eventId) {
  const normalizedEventId = typeof eventId === "string" ? eventId.trim() : "";
  if (!normalizedEventId) return;

  if (isFirestoreStripeStoreEnabled()) {
    await markStripeWebhookEventProcessedInFirestore(normalizedEventId);
    return;
  }

  await setStoredValueWithExpiry(
    getWebhookEventKey(normalizedEventId),
    JSON.stringify({ processedAt: Date.now() }),
    WEBHOOK_EVENT_TTL_SECONDS,
  );
}

function __resetStripeStoreForTests() {
  memoryState.values.clear();
  memoryState.expiresAt.clear();
}

module.exports = {
  WEBHOOK_EVENT_TTL_SECONDS,
  createDefaultBillingProfile,
  normalizeBillingProfile,
  getStripeBillingProfile,
  saveStripeBillingProfile,
  bindUserToStripeCustomer,
  getUserIdForStripeCustomer,
  hasProcessedStripeWebhookEvent,
  markStripeWebhookEventProcessed,
  __resetStripeStoreForTests,
};
