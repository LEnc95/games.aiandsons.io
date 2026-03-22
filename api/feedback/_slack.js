const {
  getRequestOrigin,
  normalizeMultiline,
  normalizeSingleLine,
} = require("./_shared");
const { updateFeedbackSubmission } = require("./_store");

const FEEDBACK_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function getFeedbackSlackWebhookUrl() {
  const feedbackWebhook = typeof process.env.SLACK_FEEDBACK_WEBHOOK_URL === "string"
    ? process.env.SLACK_FEEDBACK_WEBHOOK_URL.trim()
    : "";
  if (feedbackWebhook) return feedbackWebhook;

  const ciWebhook = typeof process.env.SLACK_CI_WEBHOOK_URL === "string"
    ? process.env.SLACK_CI_WEBHOOK_URL.trim()
    : "";
  return ciWebhook;
}

function getFeedbackOpsBaseUrl() {
  return typeof process.env.APP_BASE_URL === "string"
    ? process.env.APP_BASE_URL.trim().replace(/\/+$/, "")
    : "";
}

function buildFeedbackOpsUrl() {
  const origin = getFeedbackOpsBaseUrl();
  return origin ? `${origin}/ops/feedback/index.html` : "";
}

function normalizeSlackText(value, maxLength = 280) {
  return normalizeSingleLine(value, maxLength);
}

function buildFeedbackFailureAlertKey(submission, {
  eventType = "feedback_linear_sync_failed",
  errorMessage = "",
} = {}) {
  const status = normalizeSingleLine(submission?.syncStatus, 32) || "unknown";
  const issue = normalizeSingleLine(submission?.linearIssueIdentifier, 80);
  const errorDetail = normalizeSlackText(errorMessage || submission?.lastSyncError, 180);
  return [eventType, submission?.id || "", status, issue, errorDetail].join(":");
}

function shouldSendFeedbackFailureAlert(submission, alertKey) {
  if (!submission?.id || !alertKey) return false;
  const lastAlertKey = normalizeSingleLine(submission.lastSlackAlertKey, 240);
  const lastAlertAt = Number(submission.lastSlackAlertAt || 0);
  if (lastAlertKey !== alertKey) return true;
  return !lastAlertAt || (Date.now() - lastAlertAt) >= FEEDBACK_ALERT_COOLDOWN_MS;
}

function buildFeedbackFailureSlackPayload(submission, {
  errorMessage = "",
  eventType = "feedback_linear_sync_failed",
} = {}) {
  const normalizedError = normalizeMultiline(errorMessage || submission?.lastSyncError || "", 500)
    || "No error detail was captured.";
  const issueUrl = normalizeSingleLine(submission?.linearIssueUrl, 240);
  const baselineUrl = normalizeSingleLine(submission?.linearParentIssueUrl, 240);
  const opsUrl = buildFeedbackOpsUrl();
  const submissionId = normalizeSingleLine(submission?.id, 80) || "unknown";
  const gameName = normalizeSlackText(submission?.gameName || submission?.gameSlug || "Unknown game", 120);
  const summary = normalizeSlackText(submission?.summary || "Feedback submission", 140);
  const syncStatus = normalizeSlackText(submission?.syncStatus || "pending", 32);
  const triageStatus = normalizeSlackText(submission?.triageStatus || "new", 32);
  const route = normalizeSlackText(submission?.route || "unknown route", 160);
  const submissionTime = Number(submission?.submittedAt || 0) > 0
    ? new Date(Number(submission.submittedAt)).toISOString()
    : "unknown";
  const eventLabel = eventType === "feedback_linear_sync_failed"
    ? "Feedback Linear Sync Failed"
    : "Feedback Alert";
  const actionElements = [];

  if (opsUrl) {
    actionElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Open Feedback Inbox",
        emoji: true,
      },
      url: opsUrl,
    });
  }
  if (issueUrl) {
    actionElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Open Linear Issue",
        emoji: true,
      },
      url: issueUrl,
    });
  }
  if (baselineUrl) {
    actionElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Open Baseline",
        emoji: true,
      },
      url: baselineUrl,
    });
  }

  return {
    text: `:rotating_light: ${eventLabel}: ${gameName} - ${summary}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:rotating_light: *${eventLabel}*\n*${gameName}* - ${summary}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Submission*\n\`${submissionId}\`` },
          { type: "mrkdwn", text: `*Sync Status*\n${syncStatus}` },
          { type: "mrkdwn", text: `*Triage*\n${triageStatus}` },
          { type: "mrkdwn", text: `*Route*\n${route}` },
          { type: "mrkdwn", text: `*Submitted*\n${submissionTime}` },
          {
            type: "mrkdwn",
            text: `*Linear Issue*\n${normalizeSlackText(submission?.linearIssueIdentifier || "not created", 80)}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Error*\n\`\`\`${normalizedError}\`\`\``,
        },
      },
      ...(actionElements.length > 0
        ? [{
          type: "actions",
          elements: actionElements,
        }]
        : []),
    ],
  };
}

async function sendSlackWebhook(payload, { webhookUrl = "", fetchImpl = globalThis.fetch } = {}) {
  const target = normalizeSingleLine(webhookUrl, 4000);
  if (!target) {
    return { ok: false, skipped: true, reason: "missing_webhook" };
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("feedback_slack_fetch_missing");
  }

  const response = await fetchImpl(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`feedback_slack_http_${response.status}:${body || response.statusText || "unknown error"}`);
  }

  return {
    ok: true,
    skipped: false,
    responseText: await response.text().catch(() => "ok"),
  };
}

async function sendFeedbackFailureAlert(submission, {
  eventType = "feedback_linear_sync_failed",
  errorMessage = "",
  fetchImpl = globalThis.fetch,
} = {}) {
  const webhookUrl = getFeedbackSlackWebhookUrl();
  if (!submission?.id || !webhookUrl) {
    return { ok: true, skipped: true, reason: "missing_submission_or_webhook" };
  }

  const alertKey = buildFeedbackFailureAlertKey(submission, { eventType, errorMessage });
  if (!shouldSendFeedbackFailureAlert(submission, alertKey)) {
    return { ok: true, skipped: true, reason: "cooldown" };
  }

  const payload = buildFeedbackFailureSlackPayload(submission, { eventType, errorMessage });
  const sent = await sendSlackWebhook(payload, { webhookUrl, fetchImpl });
  if (!sent.ok || sent.skipped) {
    return sent;
  }

  const updated = await updateFeedbackSubmission(submission.id, {
    lastSlackAlertAt: Date.now(),
    lastSlackAlertKey: alertKey,
  });

  return {
    ok: true,
    skipped: false,
    submission: updated || submission,
  };
}

module.exports = {
  FEEDBACK_ALERT_COOLDOWN_MS,
  buildFeedbackFailureAlertKey,
  buildFeedbackFailureSlackPayload,
  buildFeedbackOpsUrl,
  getFeedbackSlackWebhookUrl,
  sendFeedbackFailureAlert,
  shouldSendFeedbackFailureAlert,
  __sendSlackWebhookForTests: sendSlackWebhook,
};
