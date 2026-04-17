const STUB_STORAGE_KEY = "cadegames:v1:feedbackStub:submissions";
const STUB_SESSION_KEY = "cadegames:v1:feedbackStub:sessionUserId";
const ADMIN_TOKEN_STORAGE_KEY = "cadegames:v1:feedbackAdminToken";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function isLoopbackHost() {
  if (typeof location === "undefined") return false;
  return LOOPBACK_HOSTS.has(String(location.hostname || "").toLowerCase());
}

export function shouldUseFeedbackStubMode() {
  if (!isLoopbackHost()) return false;
  try {
    const params = new URLSearchParams(location.search || "");
    return params.get("feedbackApiProbe") !== "1";
  } catch {
    return true;
  }
}

function normalizeString(value, maxLength = 4000) {
  return String(value || "")
    .replace(/[\u0000]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeAttachmentName(value) {
  return normalizeString(value, 120)
    .replace(/^.*[\\/]/, "")
    .replace(/[<>:"|?*]+/g, "-");
}

function normalizeAttachmentContentType(value) {
  return normalizeString(String(value || "").toLowerCase(), 80);
}

function inferAttachmentPreviewKind(contentType = "") {
  const normalized = normalizeAttachmentContentType(contentType);
  if (normalized.startsWith("image/")) return "image";
  if (normalized === "text/plain" || normalized === "application/json") return "text";
  if (normalized === "application/pdf") return "document";
  return "file";
}

function buildAttachmentPreviewText(contentType, dataUrl) {
  const previewKind = inferAttachmentPreviewKind(contentType);
  if (previewKind !== "text") return "";
  const match = String(dataUrl || "").match(/^data:[^;,]+;base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return "";
  try {
    const decoded = atob(String(match[1] || "").replace(/\s+/g, ""));
    return normalizeString(decoded, 1200);
  } catch {
    return "";
  }
}

function normalizeAttachmentPayloads(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const raw = entry && typeof entry === "object" ? entry : {};
      const name = normalizeAttachmentName(raw.name);
      const contentType = normalizeAttachmentContentType(raw.contentType);
      const dataUrl = normalizeString(raw.dataUrl, 2_000_000);
      const size = Number(raw.size) > 0 ? Math.floor(Number(raw.size)) : 0;
      if (!name || !contentType || !dataUrl) return null;
      return {
        name,
        contentType,
        size,
        dataUrl,
      };
    })
    .filter(Boolean);
}

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStubSubmissions() {
  const storage = getStorage();
  if (!storage) return [];
  const parsed = safeJsonParse(storage.getItem(STUB_STORAGE_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeStubSubmissions(submissions) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STUB_STORAGE_KEY, JSON.stringify(submissions));
}

function getStubSessionUserId() {
  const storage = getStorage();
  if (!storage) {
    return `stub_usr_${Date.now()}`;
  }
  const existing = normalizeString(storage.getItem(STUB_SESSION_KEY), 80);
  if (existing) return existing;
  const created = `stub_usr_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  storage.setItem(STUB_SESSION_KEY, created);
  return created;
}

function makeStubLinearIdentifier(submissionId) {
  const suffix = normalizeString(submissionId, 80).slice(-6).toUpperCase() || "LOCAL";
  return `LOCAL-${suffix}`;
}

function makeStubBaselineIdentifier(gameSlug) {
  const suffix = normalizeString(gameSlug, 40)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase() || "GAME";
  return `LOCAL-${suffix}-BASE`;
}

function buildStubLinearUrl(identifier) {
  const normalized = normalizeString(identifier, 80);
  return normalized ? `https://linear.app/issue/${normalized}` : "";
}

function buildStubBaselineTitle(gameName, gameSlug) {
  const label = normalizeString(gameName, 120) || normalizeString(gameSlug, 80) || "Game";
  return `${label}: Issue tracking baseline`;
}

function buildStubAgentTaskMarkdown(submission) {
  return [
    "# Agent Handoff Brief",
    "",
    `- Submission ID: ${submission.id}`,
    `- Linear issue: ${submission.linearIssueIdentifier || "LOCAL"}`,
    `- Baseline issue: ${submission.linearParentIssueIdentifier || submission.linearParentIssueTitle || "LOCAL-BASE"}`,
    `- Game: ${submission.gameName} (${submission.gameSlug})`,
    `- Kind: ${submission.kind}`,
    `- Route: ${submission.route}`,
    "",
    "## Summary",
    submission.summary,
    "",
    "## Details",
    submission.details,
    "",
    submission.reproSteps ? `## Repro Steps\n${submission.reproSteps}\n` : "",
    Array.isArray(submission.attachments) && submission.attachments.length
      ? `## Attachments\n${submission.attachments.map((entry) => `- ${entry.name} (${entry.contentType})${entry.url ? ` - ${entry.url}` : ""}`).join("\n")}\n`
      : "",
    "## Diagnostics",
    "```json",
    JSON.stringify({
      pageUrl: submission.pageUrl,
      referrer: submission.referrer,
      viewport: submission.viewport,
      userAgent: submission.userAgent,
      pageContext: submission.pageContext,
    }, null, 2),
    "```",
  ].filter(Boolean).join("\n");
}

function buildViewport() {
  if (typeof window === "undefined") return null;
  return {
    width: Math.max(0, Math.floor(window.innerWidth || 0)),
    height: Math.max(0, Math.floor(window.innerHeight || 0)),
    pixelRatio: Number(window.devicePixelRatio || 1),
  };
}

export function buildFeedbackPageContext(extraContext = {}) {
  const base = {
    route: typeof location !== "undefined" ? location.pathname : "",
    pageUrl: typeof location !== "undefined" ? location.href : "",
    referrer: typeof document !== "undefined" ? document.referrer : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    viewport: buildViewport(),
  };
  if (extraContext && typeof extraContext === "object" && !Array.isArray(extraContext)) {
    return {
      ...base,
      ...extraContext,
      viewport: extraContext.viewport && typeof extraContext.viewport === "object"
        ? extraContext.viewport
        : base.viewport,
    };
  }
  return base;
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  throw new Error(payload?.error || `Request failed (${response.status})`);
}

async function requestJson(url, {
  method = "GET",
  body,
  adminToken = "",
} = {}) {
  const headers = {
    Accept: "application/json",
  };
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
  }
  if (adminToken) {
    headers["x-admin-token"] = adminToken;
  }
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return parseResponse(response);
}

function createStubSubmission(payload) {
  const submissions = readStubSubmissions();
  const submittedAt = Date.now();
  const submission = {
    id: `stub_fb_${submittedAt}_${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`,
    submittedAt,
    updatedAt: submittedAt,
    sessionUserId: getStubSessionUserId(),
    requestIp: "127.0.0.1",
    gameSlug: normalizeString(payload.gameSlug, 80),
    gameName: normalizeString(payload.gameName, 120),
    route: normalizeString(payload.pageContext?.route || location.pathname, 240),
    kind: normalizeString(payload.kind, 24) || "general",
    summary: normalizeString(payload.summary, 140),
    details: normalizeString(payload.details, 4000),
    reproSteps: normalizeString(payload.reproSteps, 2500),
    displayName: normalizeString(payload.displayName, 80),
    contactEmail: normalizeString(payload.contactEmail, 160),
    userAgent: normalizeString(payload.pageContext?.userAgent || navigator.userAgent, 512),
    viewport: payload.pageContext?.viewport || buildViewport(),
    pageUrl: normalizeString(payload.pageContext?.pageUrl || location.href, 512),
    referrer: normalizeString(payload.pageContext?.referrer || document.referrer, 512),
    pageContext: payload.pageContext || {},
    attachments: normalizeAttachmentPayloads(payload.attachments).map((attachment, index) => ({
      id: `stub_att_${submittedAt}_${index}`,
      name: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size,
      previewKind: inferAttachmentPreviewKind(attachment.contentType),
      previewText: buildAttachmentPreviewText(attachment.contentType, attachment.dataUrl),
      url: attachment.dataUrl,
    })),
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
  };
  submissions.unshift(submission);
  writeStubSubmissions(submissions.slice(0, 200));
  return submission;
}

function filterStubSubmissions(submissions, filters = {}) {
  const game = normalizeString(filters.game || filters.gameSlug, 80);
  const triageStatus = normalizeString(filters.triageStatus, 24).toLowerCase();
  const syncStatus = normalizeString(filters.syncStatus, 24).toLowerCase();
  return submissions
    .filter((submission) => !game || submission.gameSlug === game)
    .filter((submission) => !triageStatus || submission.triageStatus === triageStatus)
    .filter((submission) => !syncStatus || submission.syncStatus === syncStatus)
    .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
}

function updateStubSubmission(submissionId, patch) {
  const submissions = readStubSubmissions();
  const index = submissions.findIndex((entry) => entry.id === submissionId);
  if (index === -1) {
    throw new Error("Feedback submission not found.");
  }
  submissions[index] = {
    ...submissions[index],
    ...patch,
    updatedAt: Date.now(),
  };
  writeStubSubmissions(submissions);
  return submissions[index];
}

export async function submitFeedback(payload = {}) {
  const requestBody = {
    gameSlug: normalizeString(payload.gameSlug, 80),
    gameName: normalizeString(payload.gameName, 120),
    kind: normalizeString(payload.kind, 24),
    summary: normalizeString(payload.summary, 140),
    details: normalizeString(payload.details, 4000),
    reproSteps: normalizeString(payload.reproSteps, 2500),
    displayName: normalizeString(payload.displayName, 80),
    contactEmail: normalizeString(payload.contactEmail, 160),
    pageContext: buildFeedbackPageContext(payload.pageContext),
    attachments: normalizeAttachmentPayloads(payload.attachments),
  };

  if (!shouldUseFeedbackStubMode()) {
    try {
      return await requestJson("/api/feedback/submit", {
        method: "POST",
        body: requestBody,
      });
    } catch (error) {
      if (!isLoopbackHost()) throw error;
    }
  }

  const submission = createStubSubmission(requestBody);
  return {
    ok: true,
    submissionId: submission.id,
    linearIssueIdentifier: submission.linearIssueIdentifier,
    linearIssueUrl: submission.linearIssueUrl,
    linearParentIssueIdentifier: submission.linearParentIssueIdentifier,
    linearParentIssueTitle: submission.linearParentIssueTitle,
    linearParentIssueUrl: submission.linearParentIssueUrl,
    attachments: submission.attachments,
    syncStatus: submission.syncStatus,
    sessionUserId: submission.sessionUserId,
  };
}

export async function listFeedbackReports({ adminToken = "", filters = {} } = {}) {
  if (!shouldUseFeedbackStubMode()) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters || {})) {
      const normalized = normalizeString(value, 80);
      if (normalized) query.set(key, normalized);
    }
    const suffix = query.toString();
    return requestJson(suffix ? `/api/feedback/admin/list?${suffix}` : "/api/feedback/admin/list", {
      method: "GET",
      adminToken,
    });
  }

  return {
    ok: true,
    submissions: filterStubSubmissions(readStubSubmissions(), filters),
  };
}

export async function updateFeedbackReport({
  adminToken = "",
  submissionId = "",
  triageStatus = "",
  severity = "",
  duplicateOf = "",
  retrySync = false,
} = {}) {
  if (!shouldUseFeedbackStubMode()) {
    return requestJson("/api/feedback/admin/update", {
      method: "POST",
      adminToken,
      body: { submissionId, triageStatus, severity, duplicateOf, retrySync },
    });
  }

  let submission = updateStubSubmission(submissionId, {
    ...(triageStatus ? { triageStatus } : {}),
    ...(severity ? { severity } : {}),
    ...(duplicateOf ? { duplicateOf } : {}),
  });

  if (retrySync && submission.syncStatus !== "synced") {
    const linearIssueIdentifier = makeStubLinearIdentifier(submissionId);
    const linearParentIssueIdentifier = makeStubBaselineIdentifier(submission.gameSlug);
    submission = updateStubSubmission(submissionId, {
      syncStatus: "synced",
      linearIssueIdentifier,
      linearIssueUrl: buildStubLinearUrl(linearIssueIdentifier),
      linearParentIssueId: `stub_parent_${normalizeString(submission.gameSlug, 40) || "game"}`,
      linearParentIssueIdentifier,
      linearParentIssueTitle: buildStubBaselineTitle(submission.gameName, submission.gameSlug),
      linearParentIssueUrl: buildStubLinearUrl(linearParentIssueIdentifier),
      lastSyncError: "",
    });
  }

  return {
    ok: true,
    submission,
  };
}

export async function prepareAgentTask({ adminToken = "", submissionId = "" } = {}) {
  if (!shouldUseFeedbackStubMode()) {
    return requestJson("/api/feedback/admin/prepare-agent-task", {
      method: "POST",
      adminToken,
      body: { submissionId },
    });
  }

  let submission = readStubSubmissions().find((entry) => entry.id === submissionId);
  if (!submission) throw new Error("Feedback submission not found.");
  if (!submission.linearIssueIdentifier) {
    const linearIssueIdentifier = makeStubLinearIdentifier(submissionId);
    const linearParentIssueIdentifier = makeStubBaselineIdentifier(submission.gameSlug);
    submission = updateStubSubmission(submissionId, {
      syncStatus: "synced",
      linearIssueIdentifier,
      linearIssueUrl: buildStubLinearUrl(linearIssueIdentifier),
      linearParentIssueId: `stub_parent_${normalizeString(submission.gameSlug, 40) || "game"}`,
      linearParentIssueIdentifier,
      linearParentIssueTitle: buildStubBaselineTitle(submission.gameName, submission.gameSlug),
      linearParentIssueUrl: buildStubLinearUrl(linearParentIssueIdentifier),
      lastSyncError: "",
    });
  }

  const agentTaskMarkdown = buildStubAgentTaskMarkdown(submission);
  const updated = updateStubSubmission(submissionId, {
    triageStatus: "agent-ready",
    agentBriefPreparedAt: Date.now(),
  });

  return {
    ok: true,
    agentTaskMarkdown,
    linearIssueIdentifier: updated.linearIssueIdentifier,
    updatedTriageStatus: updated.triageStatus,
    commentPosted: false,
  };
}

export function getStoredFeedbackAdminToken() {
  try {
    return normalizeString(sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY), 200);
  } catch {
    return "";
  }
}

export function setStoredFeedbackAdminToken(token) {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, normalizeString(token, 200));
  } catch {
    // Ignore storage errors in embedded/private contexts.
  }
}

export function clearStoredFeedbackAdminToken() {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage errors in embedded/private contexts.
  }
}
