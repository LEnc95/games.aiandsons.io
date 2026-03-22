const KEY_PREFIX = "cade_games:feedback:v1";
const FEEDBACK_INDEX_LIMIT = 500;

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

  return {
    id,
    submittedAt,
    updatedAt,
    sessionUserId: normalizeSingleLine(raw.sessionUserId, 120),
    requestIp: normalizeSingleLine(raw.requestIp, 160),
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
    createdAt: normalizeInteger(raw.createdAt, { min: 0, fallback: Date.now() }),
  };
}

async function getFeedbackSubmission(submissionId) {
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
  await setStoredValue(getSubmissionKey(normalized.id), JSON.stringify(normalized));

  const index = await getSubmissionIndex();
  index.unshift(normalized.id);
  await saveSubmissionIndex(index);

  return normalized;
}

async function saveFeedbackAttachment(attachment) {
  const normalized = normalizeStoredAttachment(attachment);
  await setStoredValue(getAttachmentKey(normalized.id), JSON.stringify(normalized));
  return normalized;
}

async function saveFeedbackAttachments(attachments = []) {
  const items = Array.isArray(attachments) ? attachments : [];
  return Promise.all(items.map((attachment) => saveFeedbackAttachment(attachment)));
}

async function getFeedbackAttachment(attachmentId) {
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
