const { isAdminAuthorized } = require("./_admin-auth");
const {
  normalizeBoolean,
  normalizeSeverity,
  normalizeSingleLine,
  normalizeTriageStatus,
  readJsonBody,
  sendError,
  sendJson,
} = require("../_shared");
const { getFeedbackSubmission, updateFeedbackSubmission } = require("../_store");
const { ensureFeedbackSubmissionSynced } = require("../_sync");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const auth = isAdminAuthorized(req);
  if (!auth.ok) {
    const status = auth.reason === "admin_token_not_configured" ? 503 : 401;
    const message = auth.reason === "admin_token_not_configured"
      ? "Feedback admin token is not configured."
      : "Admin token is required.";
    return sendError(res, status, message, auth.reason);
  }

  try {
    const body = await readJsonBody(req);
    const submissionId = normalizeSingleLine(body.submissionId, 80);
    if (!submissionId) {
      return sendError(res, 400, "submissionId is required.", "missing_submission_id");
    }

    const existing = await getFeedbackSubmission(submissionId);
    if (!existing) {
      return sendError(res, 404, "Feedback submission not found.", "submission_not_found");
    }

    const patch = {};
    if (body.triageStatus !== undefined) patch.triageStatus = normalizeTriageStatus(body.triageStatus);
    if (body.severity !== undefined) patch.severity = normalizeSeverity(body.severity);
    if (body.duplicateOf !== undefined) patch.duplicateOf = normalizeSingleLine(body.duplicateOf, 80);

    let updated = Object.keys(patch).length
      ? await updateFeedbackSubmission(submissionId, patch)
      : existing;

    if (normalizeBoolean(body.retrySync) && updated) {
      updated = await ensureFeedbackSubmissionSynced(updated, { failureStatus: "failed" });
    }

    return sendJson(res, 200, {
      ok: true,
      submission: updated,
    });
  } catch (error) {
    return sendError(res, 500, "Could not update feedback submission.", "feedback_update_failed", {
      message: String(error && error.message ? error.message : error),
    });
  }
};
