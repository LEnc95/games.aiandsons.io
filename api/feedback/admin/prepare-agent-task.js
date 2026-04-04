const { isAdminAuthorized } = require("./_admin-auth");
const {
  buildAgentTaskMarkdown,
  readAgentProjectPrompt,
  normalizeSingleLine,
  readJsonBody,
  sendError,
  sendJson,
} = require("../_shared");
const { getFeedbackSubmission, updateFeedbackSubmission } = require("../_store");
const { attachAgentBriefToLinear, ensureFeedbackSubmissionSynced } = require("../_sync");

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

    const synced = await ensureFeedbackSubmissionSynced(existing, { failureStatus: "failed" });
    const agentTaskMarkdown = buildAgentTaskMarkdown(synced, readAgentProjectPrompt());
    const commentPosted = await attachAgentBriefToLinear(synced, agentTaskMarkdown);
    const updated = await updateFeedbackSubmission(submissionId, {
      triageStatus: "agent-ready",
      agentBriefPreparedAt: Date.now(),
    });

    return sendJson(res, 200, {
      ok: true,
      agentTaskMarkdown,
      linearIssueIdentifier: updated?.linearIssueIdentifier || synced.linearIssueIdentifier || "",
      updatedTriageStatus: updated?.triageStatus || "agent-ready",
      commentPosted,
    });
  } catch (error) {
    return sendError(res, 500, "Could not prepare agent task.", "feedback_agent_task_failed", {
      message: String(error && error.message ? error.message : error),
    });
  }
};
