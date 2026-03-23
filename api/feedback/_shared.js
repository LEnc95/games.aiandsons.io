const crypto = require("crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const FEEDBACK_KIND_VALUES = new Set(["bug", "feature", "general"]);
const FEEDBACK_TRIAGE_STATUS_VALUES = new Set(["new", "triaged", "agent-ready", "duplicate", "closed"]);
const FEEDBACK_SYNC_STATUS_VALUES = new Set(["synced", "pending", "failed"]);
const FEEDBACK_SEVERITY_VALUES = new Set(["low", "medium", "high", "critical"]);
const FEEDBACK_ATTACHMENT_MAX_COUNT = 2;
const FEEDBACK_ATTACHMENT_MAX_BYTES = 900 * 1024;
const FEEDBACK_ATTACHMENT_TOTAL_MAX_BYTES = 1400 * 1024;
const FEEDBACK_ATTACHMENT_PREVIEW_TEXT_LIMIT = 1200;
const FEEDBACK_ATTACHMENT_ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "application/json",
  "application/pdf",
]);

let feedbackMetaPromise = null;
let agentProjectPromptCache = null;

function toPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeSingleLine(value, maxLength = 160) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeMultiline(value, maxLength = 4000) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function normalizeFileName(value, maxLength = 120) {
  const base = String(value || "")
    .replace(/^.*[\\/]/, "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[<>:"|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return base || "";
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }
  return false;
}

function normalizeInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function normalizeEmail(value) {
  const email = normalizeSingleLine(String(value || "").toLowerCase(), 160);
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeKind(value) {
  const normalized = normalizeSingleLine(value, 24).toLowerCase();
  return FEEDBACK_KIND_VALUES.has(normalized) ? normalized : "";
}

function normalizeTriageStatus(value) {
  const normalized = normalizeSingleLine(value, 24).toLowerCase();
  return FEEDBACK_TRIAGE_STATUS_VALUES.has(normalized) ? normalized : "new";
}

function normalizeSyncStatus(value) {
  const normalized = normalizeSingleLine(value, 24).toLowerCase();
  return FEEDBACK_SYNC_STATUS_VALUES.has(normalized) ? normalized : "pending";
}

function normalizeSeverity(value) {
  const normalized = normalizeSingleLine(value, 24).toLowerCase();
  return FEEDBACK_SEVERITY_VALUES.has(normalized) ? normalized : "";
}

function normalizeAttachmentContentType(value) {
  return normalizeSingleLine(String(value || "").toLowerCase(), 80);
}

function inferAttachmentPreviewKind(contentType = "") {
  const normalized = normalizeAttachmentContentType(contentType);
  if (normalized.startsWith("image/")) return "image";
  if (normalized === "text/plain" || normalized === "application/json") return "text";
  if (normalized === "application/pdf") return "document";
  return "file";
}

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  return {
    contentType: normalizeAttachmentContentType(match[1]),
    base64Data: String(match[2] || "").replace(/\s+/g, ""),
  };
}

function formatFileSize(size) {
  const bytes = normalizeInteger(size, { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 });
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.max(1, Math.round(bytes / 102.4) / 10)} KB`;
  }
  return `${bytes} B`;
}

function getFeedbackAttachmentSecret() {
  const configured = typeof process.env.FEEDBACK_ATTACHMENT_SECRET === "string"
    ? process.env.FEEDBACK_ATTACHMENT_SECRET.trim()
    : "";
  if (configured) return configured;

  const appSessionSecret = typeof process.env.APP_SESSION_SECRET === "string"
    ? process.env.APP_SESSION_SECRET.trim()
    : "";
  if (appSessionSecret) return appSessionSecret;

  return "cade-games-feedback-attachment-secret";
}

function createFeedbackAttachmentId() {
  if (typeof crypto.randomUUID === "function") {
    return `fba_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `fba_${crypto.randomBytes(16).toString("hex")}`;
}

function signFeedbackAttachmentId(attachmentId) {
  const normalizedId = normalizeSingleLine(attachmentId, 80);
  if (!normalizedId) return "";
  return crypto
    .createHmac("sha256", getFeedbackAttachmentSecret())
    .update(normalizedId)
    .digest("hex");
}

function verifyFeedbackAttachmentSignature(attachmentId, signature) {
  const expected = signFeedbackAttachmentId(attachmentId);
  const provided = normalizeSingleLine(signature, 128);
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function getRequestOrigin(req) {
  const appBaseUrl = typeof process.env.APP_BASE_URL === "string"
    ? process.env.APP_BASE_URL.trim().replace(/\/+$/, "")
    : "";

  const forwardedProto = normalizeSingleLine(req?.headers?.["x-forwarded-proto"], 32);
  const forwardedHost = normalizeSingleLine(req?.headers?.["x-forwarded-host"], 200);
  const host = forwardedHost || normalizeSingleLine(req?.headers?.host, 200);
  if (host) {
    const protocol = forwardedProto || "https";
    return `${protocol}://${host}`;
  }

  return appBaseUrl || "http://localhost";
}

function buildFeedbackAttachmentUrl({ attachmentId = "", origin = "" } = {}) {
  const normalizedId = normalizeSingleLine(attachmentId, 80);
  const normalizedOrigin = String(origin || "").trim().replace(/\/+$/, "");
  const signature = signFeedbackAttachmentId(normalizedId);
  if (!normalizedId || !normalizedOrigin || !signature) return "";
  return `${normalizedOrigin}/api/feedback/attachment?id=${encodeURIComponent(normalizedId)}&sig=${encodeURIComponent(signature)}`;
}

function normalizeFeedbackAttachmentMeta(source) {
  const raw = toPlainObject(source);
  const id = normalizeSingleLine(raw.id, 80) || createFeedbackAttachmentId();
  const name = normalizeFileName(raw.name, 120);
  const contentType = normalizeAttachmentContentType(raw.contentType);
  const size = normalizeInteger(raw.size, {
    min: 0,
    max: FEEDBACK_ATTACHMENT_MAX_BYTES,
    fallback: 0,
  });
  const previewKind = inferAttachmentPreviewKind(contentType);
  const previewText = previewKind === "text"
    ? normalizeMultiline(raw.previewText, FEEDBACK_ATTACHMENT_PREVIEW_TEXT_LIMIT)
    : "";
  const url = normalizeSingleLine(raw.url, 512);
  return {
    id,
    name,
    contentType,
    size,
    previewKind,
    previewText,
    url,
  };
}

function normalizeFeedbackAttachments(value) {
  if (value == null) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return { ok: false, error: "Attachments must be an array.", code: "invalid_attachments" };
  }

  if (value.length > FEEDBACK_ATTACHMENT_MAX_COUNT) {
    return {
      ok: false,
      error: `Please attach no more than ${FEEDBACK_ATTACHMENT_MAX_COUNT} files per report.`,
      code: "too_many_attachments",
    };
  }

  const normalized = [];
  let totalBytes = 0;

  for (const entry of value) {
    const raw = toPlainObject(entry);
    const name = normalizeFileName(raw.name, 120);
    const parsedDataUrl = parseDataUrl(raw.dataUrl || raw.dataURL || "");
    const contentType = normalizeAttachmentContentType(raw.contentType || parsedDataUrl?.contentType);
    if (!name || !parsedDataUrl || !contentType) {
      return {
        ok: false,
        error: "Each attachment must include a name, content type, and base64 data URL.",
        code: "invalid_attachment_payload",
      };
    }
    if (!FEEDBACK_ATTACHMENT_ALLOWED_TYPES.has(contentType)) {
      return {
        ok: false,
        error: `Unsupported attachment type: ${contentType}.`,
        code: "unsupported_attachment_type",
      };
    }

    let buffer = null;
    try {
      buffer = Buffer.from(parsedDataUrl.base64Data, "base64");
    } catch {
      buffer = null;
    }
    if (!buffer || !buffer.length) {
      return {
        ok: false,
        error: "Attachment data could not be decoded.",
        code: "invalid_attachment_data",
      };
    }

    const size = buffer.length;
    if (size > FEEDBACK_ATTACHMENT_MAX_BYTES) {
      return {
        ok: false,
        error: `Attachments must be ${formatFileSize(FEEDBACK_ATTACHMENT_MAX_BYTES)} or smaller.`,
        code: "attachment_too_large",
      };
    }
    totalBytes += size;
    if (totalBytes > FEEDBACK_ATTACHMENT_TOTAL_MAX_BYTES) {
      return {
        ok: false,
        error: `Total attachment size must stay under ${formatFileSize(FEEDBACK_ATTACHMENT_TOTAL_MAX_BYTES)}.`,
        code: "attachments_too_large",
      };
    }

    const previewKind = inferAttachmentPreviewKind(contentType);
    normalized.push({
      id: createFeedbackAttachmentId(),
      name,
      contentType,
      size,
      previewKind,
      previewText: previewKind === "text"
        ? normalizeMultiline(buffer.toString("utf8"), FEEDBACK_ATTACHMENT_PREVIEW_TEXT_LIMIT)
        : "",
      base64Data: buffer.toString("base64"),
    });
  }

  return { ok: true, value: normalized };
}

function sanitizeJsonValue(value, depth = 0) {
  if (depth > 3) return undefined;
  if (value == null) return undefined;
  if (typeof value === "string") return normalizeMultiline(value, 600);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, 12)
      .map((entry) => sanitizeJsonValue(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  if (typeof value === "object") {
    const next = {};
    for (const [key, entry] of Object.entries(value).slice(0, 24)) {
      const normalizedKey = normalizeSingleLine(key, 80);
      if (!normalizedKey) continue;
      const normalizedValue = sanitizeJsonValue(entry, depth + 1);
      if (normalizedValue === undefined) continue;
      next[normalizedKey] = normalizedValue;
    }
    return next;
  }
  return undefined;
}

function normalizeViewport(value) {
  const raw = toPlainObject(value);
  if (!Object.keys(raw).length) return null;
  return {
    width: normalizeInteger(raw.width, { min: 0, max: 20000, fallback: 0 }),
    height: normalizeInteger(raw.height, { min: 0, max: 20000, fallback: 0 }),
    pixelRatio: normalizeInteger(Number(raw.pixelRatio) * 100, { min: 0, max: 1000, fallback: 0 }) / 100,
  };
}

function normalizePageContext(value) {
  const raw = sanitizeJsonValue(value, 0);
  const context = toPlainObject(raw);
  const viewport = normalizeViewport(context.viewport);
  const route = normalizeSingleLine(context.route, 240);
  const pageUrl = normalizeSingleLine(context.pageUrl, 512);
  const referrer = normalizeSingleLine(context.referrer, 512);
  const userAgent = normalizeSingleLine(context.userAgent, 512);

  if (viewport) context.viewport = viewport; else delete context.viewport;
  if (route) context.route = route; else delete context.route;
  if (pageUrl) context.pageUrl = pageUrl; else delete context.pageUrl;
  if (referrer) context.referrer = referrer; else delete context.referrer;
  if (userAgent) context.userAgent = userAgent; else delete context.userAgent;

  return context;
}

function getRequestIp(req) {
  const forwardedFor = typeof req?.headers?.["x-forwarded-for"] === "string"
    ? req.headers["x-forwarded-for"]
    : "";
  if (forwardedFor) {
    return normalizeSingleLine(forwardedFor.split(",")[0], 160);
  }

  const realIp = typeof req?.headers?.["x-real-ip"] === "string"
    ? req.headers["x-real-ip"]
    : "";
  if (realIp) {
    return normalizeSingleLine(realIp, 160);
  }

  return normalizeSingleLine(req?.socket?.remoteAddress || "", 160);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("invalid_json");
  }
}

function getQuery(req) {
  const requestUrl = req?.url || "/";
  const parsed = new URL(requestUrl, "http://localhost");
  const query = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    query[key] = value;
  }
  return query;
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, error, code, extra = {}) {
  sendJson(res, statusCode, {
    ok: false,
    error,
    code,
    ...extra,
  });
}

function createFeedbackSubmissionId() {
  if (typeof crypto.randomUUID === "function") {
    return `fb_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `fb_${crypto.randomBytes(16).toString("hex")}`;
}

async function loadFeedbackMeta() {
  if (!feedbackMetaPromise) {
    const feedbackMetaPath = path.join(process.cwd(), "src", "meta", "feedback.js");
    feedbackMetaPromise = import(pathToFileURL(feedbackMetaPath).href);
  }
  return feedbackMetaPromise;
}

async function getKnownFeedbackGames() {
  const module = await loadFeedbackMeta();
  return Array.isArray(module.FEEDBACK_GAMES) ? module.FEEDBACK_GAMES : [];
}

async function getFeedbackGameBySlug(slug) {
  const module = await loadFeedbackMeta();
  return typeof module.getFeedbackGameBySlug === "function"
    ? module.getFeedbackGameBySlug(slug)
    : null;
}

async function normalizeFeedbackPayload(body, { requestUserAgent = "" } = {}) {
  const raw = toPlainObject(body);
  const gameSlug = normalizeSingleLine(raw.gameSlug, 80);
  const gameName = normalizeSingleLine(raw.gameName, 120);
  const kind = normalizeKind(raw.kind);
  const summary = normalizeSingleLine(raw.summary, 140);
  const details = normalizeMultiline(raw.details, 4000);
  const reproSteps = normalizeMultiline(raw.reproSteps, 2500);
  const displayName = normalizeSingleLine(raw.displayName, 80);
  const contactEmail = normalizeEmail(raw.contactEmail);
  const attachments = normalizeFeedbackAttachments(raw.attachments);
  const pageContext = normalizePageContext(raw.pageContext);
  const knownGame = await getFeedbackGameBySlug(gameSlug);

  if (!knownGame) {
    return { ok: false, error: "Unknown game.", code: "invalid_game" };
  }
  if (!kind) {
    return { ok: false, error: "Feedback kind must be bug, feature, or general.", code: "invalid_kind" };
  }
  if (!summary) {
    return { ok: false, error: "A short summary is required.", code: "missing_summary" };
  }
  if (!details) {
    return { ok: false, error: "Feedback details are required.", code: "missing_details" };
  }
  if (!attachments.ok) {
    return attachments;
  }

  const route = normalizeSingleLine(pageContext.route || knownGame.route, 240) || knownGame.route;
  const pageUrl = normalizeSingleLine(pageContext.pageUrl, 512);
  const referrer = normalizeSingleLine(pageContext.referrer, 512);
  const userAgent = normalizeSingleLine(pageContext.userAgent || requestUserAgent, 512);
  const viewport = normalizeViewport(pageContext.viewport);

  return {
    ok: true,
    game: knownGame,
    value: {
      gameSlug: knownGame.slug,
      gameName: gameName || knownGame.name,
      kind,
      summary,
      details,
      reproSteps,
      displayName,
      contactEmail,
      route,
      pageUrl,
      referrer,
      userAgent,
      viewport,
      pageContext,
      attachments: attachments.value,
    },
  };
}

function createFeedbackSubmissionRecord(payload, {
  sessionUserId = "",
  requestIp = "",
} = {}) {
  const now = Date.now();
  const authType = normalizeSingleLine(payload.authType, 24).toLowerCase() === "google"
    ? "google"
    : "anonymous";
  return {
    id: createFeedbackSubmissionId(),
    submittedAt: now,
    updatedAt: now,
    sessionUserId: normalizeSingleLine(sessionUserId, 120),
    requestIp: normalizeSingleLine(requestIp, 160),
    authType,
    firebaseUid: normalizeSingleLine(payload.firebaseUid, 160),
    sessionEmail: normalizeEmail(payload.sessionEmail),
    sessionDisplayName: normalizeSingleLine(payload.sessionDisplayName, 160),
    gameSlug: payload.gameSlug,
    gameName: payload.gameName,
    route: payload.route,
    kind: payload.kind,
    summary: payload.summary,
    details: payload.details,
    reproSteps: payload.reproSteps,
    displayName: payload.displayName,
    contactEmail: payload.contactEmail,
    userAgent: payload.userAgent,
    viewport: payload.viewport,
    pageUrl: payload.pageUrl,
    referrer: payload.referrer,
    pageContext: payload.pageContext,
    attachments: Array.isArray(payload.attachments)
      ? payload.attachments.map((entry) => normalizeFeedbackAttachmentMeta(entry))
      : [],
    linearIssueId: "",
    linearIssueIdentifier: "",
    linearIssueUrl: "",
    linearParentIssueId: "",
    linearParentIssueIdentifier: "",
    linearParentIssueTitle: "",
    linearParentIssueUrl: "",
    syncStatus: "pending",
    triageStatus: "new",
    severity: "",
    duplicateOf: "",
    agentBriefPreparedAt: 0,
    lastSyncError: "",
    lastSlackAlertAt: 0,
    lastSlackAlertKey: "",
  };
}

function getFeedbackLinearLabelNames(submission) {
  const names = ["source/feedback", "status/needs-triage", `game/${submission.gameSlug}`];
  if (submission.kind === "bug") {
    names.push("kind/bug");
  } else if (submission.kind === "feature") {
    names.push("kind/feature");
  }
  return [...new Set(names)];
}

function buildFeedbackBaselineIssueTitle(gameOrSubmission = {}) {
  const gameName = normalizeSingleLine(gameOrSubmission.gameName || gameOrSubmission.name, 120);
  return gameName ? `${gameName}: Issue tracking baseline` : "";
}

function buildFeedbackIssueTitle(submission) {
  return `[Feedback][${submission.gameName}] ${submission.summary}`;
}

function buildFeedbackIssueDescription(submission) {
  const lines = [
    `# ${submission.summary}`,
    "",
    `- Submission ID: ${submission.id}`,
    `- Game: ${submission.gameName} (${submission.gameSlug})`,
    `- Kind: ${submission.kind}`,
    `- Route: ${submission.route}`,
    `- Session user: ${submission.sessionUserId || "unknown"}`,
    `- Auth type: ${submission.authType || "anonymous"}`,
    `- Signed-in account: ${submission.sessionEmail || submission.sessionDisplayName || "guest session"}`,
    `- Reporter: ${submission.displayName || "anonymous"}`,
    `- Contact email: ${submission.contactEmail || "not provided"}`,
    `- Submitted at: ${new Date(submission.submittedAt).toISOString()}`,
    "",
    "## Player Details",
    "",
    submission.details,
    "",
  ];

  if (submission.reproSteps) {
    lines.push("## Repro Steps", "", submission.reproSteps, "");
  }

  if (Array.isArray(submission.attachments) && submission.attachments.length > 0) {
    lines.push("## Attachments", "");
    for (const attachment of submission.attachments) {
      const name = attachment.name || attachment.id || "Attachment";
      const link = attachment.url ? `[${name}](${attachment.url})` : name;
      lines.push(`- ${link} (${attachment.contentType || "file"}, ${formatFileSize(attachment.size)})`);
    }
    lines.push("");
  }

  lines.push(
    "## Diagnostics",
    "",
    "```json",
    JSON.stringify({
      route: submission.route,
      pageUrl: submission.pageUrl,
      referrer: submission.referrer,
      viewport: submission.viewport,
      userAgent: submission.userAgent,
      pageContext: submission.pageContext,
    }, null, 2),
    "```",
    "",
  );

  return lines.join("\n");
}

function buildAgentTaskMarkdown(submission, agentProjectPrompt = "") {
  const baselineLabel = submission.linearParentIssueIdentifier
    || submission.linearParentIssueTitle
    || "not linked";
  const lines = [
    "# Agent Handoff Brief",
    "",
    `- Submission ID: ${submission.id}`,
    `- Linear issue: ${submission.linearIssueIdentifier || "not yet synced"}`,
    `- Baseline issue: ${baselineLabel}`,
    `- Game: ${submission.gameName} (${submission.gameSlug})`,
    `- Kind: ${submission.kind}`,
    `- Severity: ${submission.severity || "not set"}`,
    `- Route: ${submission.route}`,
    `- Session user: ${submission.sessionUserId || "unknown"}`,
    "",
    "## User Report",
    "",
    "### Summary",
    submission.summary,
    "",
    "### Details",
    submission.details,
    "",
  ];

  if (submission.reproSteps) {
    lines.push("### Repro Steps", submission.reproSteps, "");
  }

  if (Array.isArray(submission.attachments) && submission.attachments.length > 0) {
    lines.push("### Attachments", "");
    for (const attachment of submission.attachments) {
      const name = attachment.name || attachment.id || "Attachment";
      const url = attachment.url || "";
      const suffix = url ? ` - ${url}` : "";
      lines.push(`- ${name} (${attachment.contentType || "file"}, ${formatFileSize(attachment.size)})${suffix}`);
    }
    lines.push("");
  }

  lines.push(
    "## Diagnostics",
    "",
    "```json",
    JSON.stringify({
      pageUrl: submission.pageUrl,
      referrer: submission.referrer,
      viewport: submission.viewport,
      userAgent: submission.userAgent,
      pageContext: submission.pageContext,
    }, null, 2),
    "```",
    "",
    "## Implementation Expectations",
    "",
    "- Reproduce the report against the relevant game route.",
    "- Fix the underlying issue or implement the request with minimal repo-consistent changes.",
    "- Add or update tests or smoke coverage when behavior changes.",
    "- Summarize the fix, verification, and any follow-up risk.",
    "",
    "## Repo Operating Prompt",
    "",
    "```md",
    agentProjectPrompt || "AGENT_PROJECT_PROMPT.md unavailable.",
    "```",
  );

  return lines.join("\n");
}

function readAgentProjectPrompt() {
  if (agentProjectPromptCache != null) return agentProjectPromptCache;
  const promptPath = path.join(process.cwd(), "AGENT_PROJECT_PROMPT.md");
  try {
    agentProjectPromptCache = fs.readFileSync(promptPath, "utf8");
  } catch {
    agentProjectPromptCache = "";
  }
  return agentProjectPromptCache;
}

module.exports = {
  FEEDBACK_KIND_VALUES,
  FEEDBACK_TRIAGE_STATUS_VALUES,
  FEEDBACK_SYNC_STATUS_VALUES,
  FEEDBACK_SEVERITY_VALUES,
  FEEDBACK_ATTACHMENT_ALLOWED_TYPES,
  FEEDBACK_ATTACHMENT_MAX_BYTES,
  FEEDBACK_ATTACHMENT_MAX_COUNT,
  FEEDBACK_ATTACHMENT_PREVIEW_TEXT_LIMIT,
  FEEDBACK_ATTACHMENT_TOTAL_MAX_BYTES,
  createFeedbackSubmissionId,
  createFeedbackAttachmentId,
  createFeedbackSubmissionRecord,
  buildFeedbackAttachmentUrl,
  normalizeBoolean,
  normalizeFeedbackAttachmentMeta,
  normalizeFeedbackAttachments,
  normalizeEmail,
  normalizeFeedbackPayload,
  normalizeInteger,
  normalizeKind,
  normalizeMultiline,
  normalizePageContext,
  normalizeSeverity,
  normalizeSingleLine,
  normalizeSyncStatus,
  normalizeTriageStatus,
  normalizeViewport,
  formatFileSize,
  getRequestOrigin,
  readAgentProjectPrompt,
  readJsonBody,
  signFeedbackAttachmentId,
  getFeedbackGameBySlug,
  getKnownFeedbackGames,
  buildFeedbackBaselineIssueTitle,
  getFeedbackLinearLabelNames,
  getQuery,
  getRequestIp,
  buildAgentTaskMarkdown,
  buildFeedbackIssueDescription,
  buildFeedbackIssueTitle,
  sendError,
  sendJson,
  toPlainObject,
  verifyFeedbackAttachmentSignature,
};
