const { isLinearConfigured, createFeedbackIssue, createIssueComment } = require("./_linear");
const { sendFeedbackFailureAlert } = require("./_slack");
const { updateFeedbackSubmission } = require("./_store");

async function ensureFeedbackSubmissionSynced(submission, { failureStatus = "failed" } = {}) {
  if (!submission || !submission.id) return submission;
  if (!isLinearConfigured()) return submission;
  if (submission.linearIssueId || submission.linearIssueIdentifier || submission.syncStatus === "synced") {
    return submission;
  }

  try {
    const issue = await createFeedbackIssue({ submission });
    return updateFeedbackSubmission(submission.id, {
      syncStatus: "synced",
      linearIssueId: issue.id,
      linearIssueIdentifier: issue.identifier,
      linearIssueUrl: issue.url,
      linearParentIssueId: issue.parentId,
      linearParentIssueIdentifier: issue.parentIdentifier,
      linearParentIssueTitle: issue.parentTitle,
      linearParentIssueUrl: issue.parentUrl,
      lastSyncError: "",
    });
  } catch (error) {
    const updated = await updateFeedbackSubmission(submission.id, {
      syncStatus: failureStatus,
      lastSyncError: String(error && error.message ? error.message : error).slice(0, 500),
    });
    try {
      await sendFeedbackFailureAlert(updated, {
        eventType: "feedback_linear_sync_failed",
      });
    } catch {
      // Best effort only; feedback submission handling should not fail because Slack alerting is unavailable.
    }
    return updated;
  }
}

async function attachAgentBriefToLinear(submission, markdown) {
  if (!submission?.linearIssueId || !isLinearConfigured()) {
    return false;
  }

  try {
    await createIssueComment({
      issueId: submission.linearIssueId,
      body: markdown,
    });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  attachAgentBriefToLinear,
  ensureFeedbackSubmissionSynced,
};
