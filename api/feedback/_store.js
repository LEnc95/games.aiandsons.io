const {
  getFirestore,
  getFirebaseStorageBucket,
  isFirebaseAdminConfigured,
} = require("../_firebase-admin");

const KEY_PREFIX = "cade_games:feedback:v1";
const FEEDBACK_INDEX_LIMIT = 500;
const FIRESTORE_SUBMISSIONS_COLLECTION = "feedbackSubmissions";
const FIRESTORE_ATTACHMENTS_COLLECTION = "feedbackAttachments";
const FIRESTORE_RATE_LIMITS_COLLECTION = "feedbackRateLimits";

const memoryState = (() => {
  if (!globalThis.__cadeFeedbackMemoryStore) {
    globalThis.__cadeFeedbackMemoryStore = {
      values: new Map(),
      expiresAt: new Map(),
    };
  }
  return globalThis.__cadeFeedbackMemoryStore;
})();

const {
  createFeedbackAttachmentId,
  createFeedbackSubmissionId,
  normalizeFeedbackAttachmentMeta,
  normalizeEmail,
  normalizeInteger,
  normalizeKind,
  normalizeMultiline,
  normalizePageContext,
  normalizeSeverity,
  normalizeSingleLine,
  normalizeSyncStatus,
  normalizeTriageStatus,
  normalizeViewport,
  toPlainObject,
} = require("./_shared");

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

function isFirestoreStoreEnabled() {
  return isFirebaseAdminConfigured();
}

function getFeedbackCollections() {
  const firestore = getFirestore();
  return {
    submissions: firestore.collection(FIRESTORE_SUBMISSIONS_COLLECTION),
    attachments: firestore.collection(FIRESTORE_ATTACHMENTS_COLLECTION),
    rateLimits: firestore.collection(FIRESTORE_RATE_LIMITS_COLLECTION),
  };
}

function encodeFirestoreDocId(value) {
  return encodeURIComponent(normalizeSingleLine(value, 240));
}

function buildAttachmentStoragePath(attachment) {
  const normalizedSubmissionId = normalizeSingleLine(attachment.submissionId, 80) || "unbound";
  const normalizedAttachmentId = normalizeSingleLine(attachment.id, 80) || createFeedbackAttachmentId();
  const safeName = normalizeSingleLine(String(attachment.name || "attachment")
    .replace(/^.*[\\/]/, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, ""), 120) || "attachment";
  return `feedback/attachments/${normalizedSubmissionId}/${normalizedAttachmentId}-${safeName}`;
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

function getSubmissionKey(id) {
  return `${KEY_PREFIX}:submission:${id}`;
}

function getSubmissionIndexKey() {
  return `${KEY_PREFIX}:submission:index`;
}

function getAttachmentKey(id) {
  return `${KEY_PREFIX}:attachment:${id}`;
}

function getRateLimitKey(bucketId) {
  return `${KEY_PREFIX}:ratelimit:${bucketId}`;
}

async function getSubmissionIndex() {
  const raw = await getStoredValue(getSubmissionIndexKey());
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
        .map((entry) => normalizeSingleLine(entry, 80))
        .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

async function saveSubmissionIndex(ids) {
  const next = [...new Set(
    (Array.isArray(ids) ? ids : [])
      .map((entry) => normalizeSingleLine(entry, 80))
      .filter(Boolean),
  )].slice(0, FEEDBACK_INDEX_LIMIT);
  await setStoredValue(getSubmissionIndexKey(), JSON.stringify(next));
  return next;
}

function normalizeStoredSubmission(source) {
  const raw = toPlainObject(source);
  const id = normalizeSingleLine(raw.id, 80) || createFeedbackSubmissionId();
  const submittedAt = normalizeInteger(raw.submittedAt, { min: 0, fallback: Date.now() });
  const updatedAt = normalizeInteger(raw.updatedAt, { min: 0, fallback: submittedAt });
  const authType = normalizeSingleLine(raw.authType, 24).toLowerCase() === "google"
    ? "google"
    : "anonymous";

  return {
    id,
    submittedAt,
    updatedAt,
    sessionUserId: normalizeSingleLine(raw.sessionUserId, 120),
    requestIp: normalizeSingleLine(raw.requestIp, 160),
    authType,
    firebaseUid: normalizeSingleLine(raw.firebaseUid, 160),
    sessionEmail: normalizeEmail(raw.sessionEmail),
    sessionDisplayName: normalizeSingleLine(raw.sessionDisplayName, 160),
    gameSlug: normalizeSingleLine(raw.gameSlug, 80),
    gameName: normalizeSingleLine(raw.gameName, 120),
    route: normalizeSingleLine(raw.route, 240),
    kind: normalizeKind(raw.kind) || "general",
    summary: normalizeSingleLine(raw.summary, 140),
    details: normalizeMultiline(raw.details, 4000),
    reproSteps: normalizeMultiline(raw.reproSteps, 2500),
    displayName: normalizeSingleLine(raw.displayName, 80),
    contactEmail: normalizeEmail(raw.contactEmail),
    userAgent: normalizeSingleLine(raw.userAgent, 512),
    viewport: normalizeViewport(raw.viewport),
    pageUrl: normalizeSingleLine(raw.pageUrl, 512),
    referrer: normalizeSingleLine(raw.referrer, 512),
    pageContext: normalizePageContext(raw.pageContext),
    attachments: Array.isArray(raw.attachments)
      ? raw.attachments
        .map((entry) => normalizeFeedbackAttachmentMeta(entry))
        .filter((entry) => entry.id && entry.name && entry.contentType)
      : [],
    linearIssueId: normalizeSingleLine(raw.linearIssueId, 80),
    linearIssueIdentifier: normalizeSingleLine(raw.linearIssueIdentifier, 80),
    linearIssueUrl: normalizeSingleLine(raw.linearIssueUrl, 240),
    linearParentIssueId: normalizeSingleLine(raw.linearParentIssueId, 80),
    linearParentIssueIdentifier: normalizeSingleLine(raw.linearParentIssueIdentifier, 80),
    linearParentIssueTitle: normalizeSingleLine(raw.linearParentIssueTitle, 200),
    linearParentIssueUrl: normalizeSingleLine(raw.linearParentIssueUrl, 240),
    syncStatus: normalizeSyncStatus(raw.syncStatus),
    triageStatus: normalizeTriageStatus(raw.triageStatus),
    severity: normalizeSeverity(raw.severity),
    duplicateOf: normalizeSingleLine(raw.duplicateOf, 80),
    agentBriefPreparedAt: normalizeInteger(raw.agentBriefPreparedAt, { min: 0, fallback: 0 }),
    lastSyncError: normalizeMultiline(raw.lastSyncError, 500),
    lastSlackAlertAt: normalizeInteger(raw.lastSlackAlertAt, { min: 0, fallback: 0 }),
    lastSlackAlertKey: normalizeSingleLine(raw.lastSlackAlertKey, 240),
  };
}

function normalizeStoredAttachment(source) {
  const raw = toPlainObject(source);
  const id = normalizeSingleLine(raw.id, 80) || createFeedbackAttachmentId();
  return {
    id,
    submissionId: normalizeSingleLine(raw.submissionId, 80),
    name: normalizeSingleLine(raw.name, 120),
    contentType: normalizeSingleLine(raw.contentType, 80),
    size: normalizeInteger(raw.size, { min: 0, max: 5 * 1024 * 1024, fallback: 0 }),
    previewKind: normalizeSingleLine(raw.previewKind, 24),
    previewText: normalizeMultiline(raw.previewText, 1200),
    base64Data: normalizeSingleLine(raw.base64Data, 2_000_000),
    storagePath: normalizeSingleLine(raw.storagePath, 512),
    storageBucket: normalizeSingleLine(raw.storageBucket, 240),
    createdAt: normalizeInteger(raw.createdAt, { min: 0, fallback: Date.now() }),
  };
}

async function getFeedbackSubmissionFromFirestore(submissionId) {
  const normalizedId = normalizeSingleLine(submissionId, 80);
  if (!normalizedId) return null;
  const snapshot = await getFeedbackCollections().submissions.doc(normalizedId).get();
  if (!snapshot.exists) return null;
  return normalizeStoredSubmission(snapshot.data());
}

async function saveFeedbackSubmissionToFirestore(submission) {
  const normalized = normalizeStoredSubmission(submission);
  await getFeedbackCollections().submissions.doc(normalized.id).set(normalized, { merge: true });
  return normalized;
}

async function listFeedbackSubmissionsFromFirestore(filters = {}) {
  const gameSlug = normalizeSingleLine(filters.gameSlug || filters.game, 80);
  const triageStatus = normalizeSingleLine(filters.triageStatus, 24).toLowerCase();
  const syncStatus = normalizeSingleLine(filters.syncStatus, 24).toLowerCase();
  const limit = normalizeInteger(filters.limit, { min: 1, max: FEEDBACK_INDEX_LIMIT, fallback: 200 });
  const queryLimit = (gameSlug || triageStatus || syncStatus) ? FEEDBACK_INDEX_LIMIT : limit;
  const snapshot = await getFeedbackCollections()
    .submissions
    .orderBy("submittedAt", "desc")
    .limit(queryLimit)
    .get();

  const items = snapshot.docs.map((doc) => normalizeStoredSubmission(doc.data()));
  return items
    .filter((item) => !gameSlug || item.gameSlug === gameSlug)
    .filter((item) => !triageStatus || item.triageStatus === triageStatus)
    .filter((item) => !syncStatus || item.syncStatus === syncStatus)
    .slice(0, limit);
}

async function saveFeedbackAttachmentToFirestore(attachment) {
  const normalized = normalizeStoredAttachment(attachment);
  const buffer = normalized.base64Data
    ? Buffer.from(normalized.base64Data, "base64")
    : Buffer.alloc(0);
  const bucket = getFirebaseStorageBucket();
  const storagePath = normalized.storagePath || buildAttachmentStoragePath(normalized);
  const file = bucket.file(storagePath);

  await file.save(buffer, {
    resumable: false,
    validation: false,
    metadata: {
      contentType: normalized.contentType || "application/octet-stream",
      cacheControl: "private, max-age=3600",
      metadata: {
        attachmentId: normalized.id,
        submissionId: normalized.submissionId || "",
      },
    },
  });

  const stored = normalizeStoredAttachment({
    ...normalized,
    base64Data: "",
    storagePath,
    storageBucket: bucket.name || "",
  });

  await getFeedbackCollections().attachments.doc(stored.id).set(stored, { merge: true });
  return stored;
}

async function getFeedbackAttachmentFromFirestore(attachmentId) {
  const normalizedId = normalizeSingleLine(attachmentId, 80);
  if (!normalizedId) return null;
  const snapshot = await getFeedbackCollections().attachments.doc(normalizedId).get();
  if (!snapshot.exists) return null;
  return normalizeStoredAttachment(snapshot.data());
}

async function getFeedbackAttachmentContentFromFirestore(attachmentId) {
  const attachment = await getFeedbackAttachmentFromFirestore(attachmentId);
  if (!attachment) return null;

  if (attachment.storagePath) {
    const bucket = getFirebaseStorageBucket();
    const [buffer] = await bucket.file(attachment.storagePath).download();
    return { attachment, buffer };
  }

  if (!attachment.base64Data) {
    return { attachment, buffer: null };
  }

  return {
    attachment,
    buffer: Buffer.from(attachment.base64Data, "base64"),
  };
}

async function incrementFirestoreRateLimit(bucketId, windowMs) {
  const normalizedBucketId = normalizeSingleLine(bucketId, 240);
  if (!normalizedBucketId) return 0;
  const now = Date.now();
  const docId = encodeFirestoreDocId(normalizedBucketId);
  const ref = getFeedbackCollections().rateLimits.doc(docId);
  const firestore = getFirestore();

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? toPlainObject(snapshot.data()) : {};
    const existingExpiresAt = normalizeInteger(data.expiresAt, { min: 0, fallback: 0 });
    const activeWindow = existingExpiresAt > now;
    const count = normalizeInteger(activeWindow ? data.count : 0, { min: 0, fallback: 0 }) + 1;
    const expiresAt = activeWindow ? existingExpiresAt : (now + windowMs);
    transaction.set(ref, {
      bucketId: normalizedBucketId,
      count,
      expiresAt,
      updatedAt: now,
    }, { merge: true });
    return count;
  });
}

async function getFeedbackSubmission(submissionId) {
  if (isFirestoreStoreEnabled()) {
    return getFeedbackSubmissionFromFirestore(submissionId);
  }

  const normalizedId = normalizeSingleLine(submissionId, 80);
  if (!normalizedId) return null;
  const raw = await getStoredValue(getSubmissionKey(normalizedId));
  if (!raw) return null;
  try {
    return normalizeStoredSubmission(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function saveFeedbackSubmission(submission) {
  const normalized = normalizeStoredSubmission(submission);

  if (isFirestoreStoreEnabled()) {
    return saveFeedbackSubmissionToFirestore(normalized);
  }

  await setStoredValue(getSubmissionKey(normalized.id), JSON.stringify(normalized));

  const index = await getSubmissionIndex();
  index.unshift(normalized.id);
  await saveSubmissionIndex(index);

  return normalized;
}

async function saveFeedbackAttachment(attachment) {
  const normalized = normalizeStoredAttachment(attachment);

  if (isFirestoreStoreEnabled()) {
    return saveFeedbackAttachmentToFirestore(normalized);
  }

  await setStoredValue(getAttachmentKey(normalized.id), JSON.stringify(normalized));
  return normalized;
}

async function saveFeedbackAttachments(attachments = []) {
  const items = Array.isArray(attachments) ? attachments : [];
  return Promise.all(items.map((attachment) => saveFeedbackAttachment(attachment)));
}

async function getFeedbackAttachment(attachmentId) {
  if (isFirestoreStoreEnabled()) {
    return getFeedbackAttachmentFromFirestore(attachmentId);
  }

  const normalizedId = normalizeSingleLine(attachmentId, 80);
  if (!normalizedId) return null;
  const raw = await getStoredValue(getAttachmentKey(normalizedId));
  if (!raw) return null;
  try {
    return normalizeStoredAttachment(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function getFeedbackAttachmentContent(attachmentId) {
  if (isFirestoreStoreEnabled()) {
    return getFeedbackAttachmentContentFromFirestore(attachmentId);
  }

  const attachment = await getFeedbackAttachment(attachmentId);
  if (!attachment || !attachment.base64Data) {
    return null;
  }

  return {
    attachment,
    buffer: Buffer.from(attachment.base64Data, "base64"),
  };
}

async function updateFeedbackSubmission(submissionId, patch) {
  const existing = await getFeedbackSubmission(submissionId);
  if (!existing) return null;
  return saveFeedbackSubmission({
    ...existing,
    ...(toPlainObject(patch)),
    id: existing.id,
    submittedAt: existing.submittedAt,
    updatedAt: Date.now(),
  });
}

async function listFeedbackSubmissions(filters = {}) {
  if (isFirestoreStoreEnabled()) {
    return listFeedbackSubmissionsFromFirestore(filters);
  }

  const gameSlug = normalizeSingleLine(filters.gameSlug || filters.game, 80);
  const triageStatus = normalizeSingleLine(filters.triageStatus, 24).toLowerCase();
  const syncStatus = normalizeSingleLine(filters.syncStatus, 24).toLowerCase();
  const limit = normalizeInteger(filters.limit, { min: 1, max: FEEDBACK_INDEX_LIMIT, fallback: 200 });

  const index = await getSubmissionIndex();
  const items = await Promise.all(index.slice(0, limit).map((id) => getFeedbackSubmission(id)));
  return items
    .filter(Boolean)
    .filter((item) => !gameSlug || item.gameSlug === gameSlug)
    .filter((item) => !triageStatus || item.triageStatus === triageStatus)
    .filter((item) => !syncStatus || item.syncStatus === syncStatus)
    .sort((a, b) => b.submittedAt - a.submittedAt);
}

async function enforceFeedbackRateLimit({
  sessionUserId = "",
  requestIp = "",
  maxRequests = 5,
  windowMs = 10 * 60_000,
} = {}) {
  const buckets = [];
  const normalizedSessionId = normalizeSingleLine(sessionUserId, 120);
  const normalizedIp = normalizeSingleLine(requestIp, 160);
  if (normalizedSessionId) buckets.push(`session:${normalizedSessionId}`);
  if (normalizedIp) buckets.push(`ip:${normalizedIp}`);
  if (!buckets.length) {
    return { blocked: false, retryAfterSeconds: Math.ceil(windowMs / 1000), remaining: maxRequests };
  }

  if (isFirestoreStoreEnabled()) {
    let highestCount = 0;
    for (const bucket of buckets) {
      const currentCount = await incrementFirestoreRateLimit(bucket, windowMs);
      highestCount = Math.max(highestCount, currentCount);
    }
    return {
      blocked: highestCount > maxRequests,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
      remaining: Math.max(0, maxRequests - highestCount),
    };
  }

  let highestCount = 0;
  for (const bucket of buckets) {
    const key = getRateLimitKey(bucket);
    const currentCount = Number(await getStoredValue(key) || 0) + 1;
    highestCount = Math.max(highestCount, currentCount);
    await setStoredValueWithExpiry(key, String(currentCount), Math.ceil(windowMs / 1000));
  }

  return {
    blocked: highestCount > maxRequests,
    retryAfterSeconds: Math.ceil(windowMs / 1000),
    remaining: Math.max(0, maxRequests - highestCount),
  };
}

function __resetFeedbackStoreForTests() {
  memoryState.values.clear();
  memoryState.expiresAt.clear();
}

module.exports = {
  enforceFeedbackRateLimit,
  getFeedbackAttachment,
  getFeedbackAttachmentContent,
  getFeedbackSubmission,
  listFeedbackSubmissions,
  normalizeStoredAttachment,
  normalizeStoredSubmission,
  saveFeedbackAttachment,
  saveFeedbackAttachments,
  saveFeedbackSubmission,
  updateFeedbackSubmission,
  __resetFeedbackStoreForTests,
};
