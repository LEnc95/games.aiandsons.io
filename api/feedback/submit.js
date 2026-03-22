const { ensureSession } = require("../auth/_session");
const {
  createFeedbackSubmissionRecord,
  getRequestIp,
  normalizeFeedbackPayload,
  readJsonBody,
  sendError,
  sendJson,
} = require("./_shared");
const {
  enforceFeedbackRateLimit,
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

    const submission = await saveFeedbackSubmission(
      createFeedbackSubmissionRecord(normalized.value, {
        sessionUserId: session?.userId || "",
        requestIp,
      }),
    );

    const synced = await ensureFeedbackSubmissionSynced(submission, { failureStatus: "pending" });

    return sendJson(res, 200, {
      ok: true,
      submissionId: synced.id,
      linearIssueIdentifier: synced.linearIssueIdentifier || "",
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
