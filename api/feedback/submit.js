const { ensureSession } = require("../auth/_session");
const {
  buildFeedbackAttachmentUrl,
  createFeedbackSubmissionRecord,
  getRequestOrigin,
  getRequestIp,
  normalizeFeedbackPayload,
  readJsonBody,
  sendError,
  sendJson,
} = require("./_shared");
const {
  enforceFeedbackRateLimit,
  saveFeedbackAttachments,
  saveFeedbackSubmission,
} = require("./_store");
const { ensureFeedbackSubmissionSynced } = require("./_sync");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const session = ensureSession(req, res, { createIfMissing: true });
  const requestIp = getRequestIp(req);

  try {
    const rateLimit = await enforceFeedbackRateLimit({
      sessionUserId: session?.userId || "",
      requestIp,
    });
    if (rateLimit.blocked) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      return sendError(
        res,
        429,
        "Too many feedback submissions. Please wait a few minutes and try again.",
        "rate_limited",
        { retryAfterSeconds: rateLimit.retryAfterSeconds },
      );
    }

    const body = await readJsonBody(req);
    const normalized = await normalizeFeedbackPayload(body, {
      requestUserAgent: req?.headers?.["user-agent"] || "",
    });

    if (!normalized.ok) {
      return sendError(res, 400, normalized.error, normalized.code);
    }

    const requestOrigin = getRequestOrigin(req);
    const attachmentPayloads = Array.isArray(normalized.value.attachments)
      ? normalized.value.attachments
      : [];
    const attachmentMetas = attachmentPayloads.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size,
      previewKind: attachment.previewKind,
      previewText: attachment.previewText,
      url: buildFeedbackAttachmentUrl({
        attachmentId: attachment.id,
        origin: requestOrigin,
      }),
    }));

    const submissionRecord = createFeedbackSubmissionRecord({
      ...normalized.value,
      attachments: attachmentMetas,
      authType: session?.authType || "anonymous",
      firebaseUid: session?.firebaseUid || "",
      sessionEmail: session?.email || "",
      sessionDisplayName: session?.displayName || "",
    }, {
      sessionUserId: session?.userId || "",
      requestIp,
    });

    if (attachmentPayloads.length > 0) {
      await saveFeedbackAttachments(attachmentPayloads.map((attachment) => ({
        id: attachment.id,
        submissionId: submissionRecord.id,
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.size,
        previewKind: attachment.previewKind,
        previewText: attachment.previewText,
        base64Data: attachment.base64Data,
        createdAt: submissionRecord.submittedAt,
      })));
    }

    const submission = await saveFeedbackSubmission(submissionRecord);

    const synced = await ensureFeedbackSubmissionSynced(submission, { failureStatus: "pending" });

    return sendJson(res, 200, {
      ok: true,
      submissionId: synced.id,
      linearIssueIdentifier: synced.linearIssueIdentifier || "",
      linearIssueUrl: synced.linearIssueUrl || "",
      linearParentIssueIdentifier: synced.linearParentIssueIdentifier || "",
      linearParentIssueTitle: synced.linearParentIssueTitle || "",
      linearParentIssueUrl: synced.linearParentIssueUrl || "",
      attachments: Array.isArray(synced.attachments) ? synced.attachments : [],
      syncStatus: synced.syncStatus,
      sessionUserId: synced.sessionUserId || "",
    });
  } catch (error) {
    const message = error?.message === "invalid_json"
      ? "Request body must be valid JSON."
      : "Could not submit feedback.";
    const code = error?.message === "invalid_json"
      ? "invalid_json"
      : "feedback_submit_failed";
    return sendError(res, 500, message, code, {
      message: String(error && error.message ? error.message : error),
    });
  }
};
