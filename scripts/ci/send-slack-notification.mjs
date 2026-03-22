function normalizeString(value, maxLength = 240) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeStatus(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  if (normalized === "success") return "success";
  if (normalized === "failure" || normalized === "failed") return "failure";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  if (normalized === "skipped") return "skipped";
  return normalized || "unknown";
}

function normalizeBoolean(value) {
  const normalized = normalizeString(value, 16).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function shortSha(value) {
  return normalizeString(value, 64).slice(0, 7);
}

function getStatusMeta(status) {
  switch (status) {
    case "success":
      return { emoji: ":white_check_mark:", label: "SUCCESS", summary: "completed successfully" };
    case "failure":
      return { emoji: ":x:", label: "FAILURE", summary: "failed" };
    case "cancelled":
      return { emoji: ":warning:", label: "CANCELLED", summary: "was cancelled" };
    case "skipped":
      return { emoji: ":pause_button:", label: "SKIPPED", summary: "was skipped" };
    default:
      return { emoji: ":information_source:", label: status.toUpperCase() || "UNKNOWN", summary: `finished with status ${status || "unknown"}` };
  }
}

export function shouldSendSlackNotification({
  webhookUrl = "",
  status = "",
  notifyOnSuccess = false,
} = {}) {
  if (!normalizeString(webhookUrl, 4000)) return false;
  const normalizedStatus = normalizeStatus(status);
  if (normalizedStatus === "success") {
    return Boolean(notifyOnSuccess);
  }
  return true;
}

export function buildSlackPayload({
  workflowName = "",
  status = "",
  runUrl = "",
  repository = "",
  branch = "",
  sha = "",
  actor = "",
  eventName = "",
  runNumber = "",
} = {}) {
  const normalizedStatus = normalizeStatus(status);
  const meta = getStatusMeta(normalizedStatus);
  const workflow = normalizeString(workflowName, 120) || "GitHub workflow";
  const repo = normalizeString(repository, 160) || "unknown repository";
  const ref = normalizeString(branch, 120) || "unknown branch";
  const runLink = normalizeString(runUrl, 2000);
  const actorName = normalizeString(actor, 120) || "unknown actor";
  const eventLabel = normalizeString(eventName, 80) || "unknown event";
  const shaShort = shortSha(sha) || "unknown";
  const runLabel = normalizeString(runNumber, 32) || "n/a";
  const summaryLine = `${meta.emoji} ${workflow} ${meta.summary} in ${repo} on ${ref}.`;

  return {
    text: `${summaryLine}${runLink ? ` ${runLink}` : ""}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${workflow}* ${meta.label}\n${summaryLine}`,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Repository*\n${repo}`,
          },
          {
            type: "mrkdwn",
            text: `*Branch*\n${ref}`,
          },
          {
            type: "mrkdwn",
            text: `*Actor*\n${actorName}`,
          },
          {
            type: "mrkdwn",
            text: `*Event*\n${eventLabel}`,
          },
          {
            type: "mrkdwn",
            text: `*Run*\n#${runLabel}`,
          },
          {
            type: "mrkdwn",
            text: `*Commit*\n\`${shaShort}\``,
          },
        ],
      },
      ...(runLink
        ? [{
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Open Workflow Run",
                emoji: true,
              },
              url: runLink,
            },
          ],
        }]
        : []),
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${meta.emoji} Status detail: ${meta.summary}`,
          },
        ],
      },
    ],
  };
}

export async function sendSlackNotification(payload, {
  webhookUrl = "",
  fetchImpl = globalThis.fetch,
} = {}) {
  const target = normalizeString(webhookUrl, 4000);
  if (!target) {
    throw new Error("Slack webhook URL is required.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required to send Slack notifications.");
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
    throw new Error(`Slack webhook request failed (${response.status}): ${body || response.statusText || "unknown error"}`);
  }

  return response.text().catch(() => "ok");
}

export async function runSlackNotificationFromEnv(env = process.env) {
  const webhookUrl = normalizeString(env.SLACK_WEBHOOK_URL, 4000);
  const notifyOnSuccess = normalizeBoolean(env.SLACK_NOTIFY_ON_SUCCESS);
  const status = normalizeStatus(env.WORKFLOW_STATUS || env.JOB_STATUS || "");

  if (!shouldSendSlackNotification({ webhookUrl, status, notifyOnSuccess })) {
    if (!webhookUrl) {
      console.log("Skipped Slack notification because SLACK_WEBHOOK_URL is not configured.");
      return { ok: true, skipped: true, reason: "missing_webhook" };
    }
    console.log(`Skipped Slack notification because status ${status} does not require notification.`);
    return { ok: true, skipped: true, reason: "status_filtered" };
  }

  const payload = buildSlackPayload({
    workflowName: env.WORKFLOW_NAME || env.GITHUB_WORKFLOW || "",
    status,
    runUrl: env.WORKFLOW_RUN_URL || "",
    repository: env.GITHUB_REPOSITORY || "",
    branch: env.GITHUB_REF_NAME || "",
    sha: env.GITHUB_SHA || "",
    actor: env.GITHUB_ACTOR || "",
    eventName: env.GITHUB_EVENT_NAME || "",
    runNumber: env.GITHUB_RUN_NUMBER || "",
  });

  const responseText = await sendSlackNotification(payload, { webhookUrl });
  console.log(`Slack notification sent (${status}): ${responseText || "ok"}`);
  return {
    ok: true,
    skipped: false,
    status,
  };
}

const isDirectRun = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  runSlackNotificationFromEnv().catch((error) => {
    console.error(String(error?.stack || error?.message || error));
    process.exitCode = 1;
  });
}
import path from "node:path";
import { pathToFileURL } from "node:url";
