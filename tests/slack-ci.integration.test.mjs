import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSlackPayload,
  runSlackNotificationFromEnv,
  sendSlackNotification,
  shouldSendSlackNotification,
} from "../scripts/ci/send-slack-notification.mjs";

test("shouldSendSlackNotification only sends success when explicitly enabled", () => {
  assert.equal(shouldSendSlackNotification({
    webhookUrl: "",
    status: "failure",
    notifyOnSuccess: false,
  }), false);

  assert.equal(shouldSendSlackNotification({
    webhookUrl: "https://hooks.slack.test/services/abc",
    status: "success",
    notifyOnSuccess: false,
  }), false);

  assert.equal(shouldSendSlackNotification({
    webhookUrl: "https://hooks.slack.test/services/abc",
    status: "failure",
    notifyOnSuccess: false,
  }), true);

  assert.equal(shouldSendSlackNotification({
    webhookUrl: "https://hooks.slack.test/services/abc",
    status: "success",
    notifyOnSuccess: true,
  }), true);
});

test("buildSlackPayload includes workflow metadata and run link", () => {
  const payload = buildSlackPayload({
    workflowName: "Nightly Launch Readiness",
    status: "failure",
    runUrl: "https://github.com/org/repo/actions/runs/123",
    artifactsUrl: "https://github.com/org/repo/actions/runs/123/artifacts",
    repository: "LEnc95/games.aiandsons.io",
    branch: "main",
    sha: "1234567890abcdef",
    actor: "LEnc95",
    eventName: "workflow_dispatch",
    runNumber: "20",
    provisionSummary: "0 labels created, 38 already present, 0 warnings.",
  });

  assert.equal(typeof payload.text, "string");
  assert.equal(payload.text.includes("Nightly Launch Readiness failed"), true);
  assert.equal(Array.isArray(payload.blocks), true);
  assert.equal(payload.blocks[1].fields.some((field) => field.text.includes("LEnc95/games.aiandsons.io")), true);
  assert.equal(payload.blocks[2].text.text.includes("Provisioning Summary"), true);
  assert.equal(payload.blocks[3].elements[0].url, "https://github.com/org/repo/actions/runs/123");
  assert.equal(payload.blocks[3].elements[1].url, "https://github.com/org/repo/actions/runs/123/artifacts");
});

test("sendSlackNotification posts JSON payload to the provided webhook", async () => {
  let request = null;
  const responseText = await sendSlackNotification({ text: "hello slack" }, {
    webhookUrl: "https://hooks.slack.test/services/abc",
    fetchImpl: async (url, options = {}) => {
      request = { url, options };
      return {
        ok: true,
        async text() {
          return "ok";
        },
      };
    },
  });

  assert.equal(responseText, "ok");
  assert.equal(request.url, "https://hooks.slack.test/services/abc");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(request.options.body), { text: "hello slack" });
});

test("runSlackNotificationFromEnv skips cleanly without a webhook or filtered success", async () => {
  const missingWebhook = await runSlackNotificationFromEnv({
    WORKFLOW_STATUS: "failure",
  });
  assert.equal(missingWebhook.skipped, true);
  assert.equal(missingWebhook.reason, "missing_webhook");

  const filteredSuccess = await runSlackNotificationFromEnv({
    SLACK_WEBHOOK_URL: "https://hooks.slack.test/services/abc",
    WORKFLOW_STATUS: "success",
    SLACK_NOTIFY_ON_SUCCESS: "false",
  });
  assert.equal(filteredSuccess.skipped, true);
  assert.equal(filteredSuccess.reason, "status_filtered");
});

test("runSlackNotificationFromEnv sends failures through global fetch", async (t) => {
  const originalFetch = global.fetch;
  let request = null;
  global.fetch = async (url, options = {}) => {
    request = { url, options };
    return {
      ok: true,
      async text() {
        return "ok";
      },
    };
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await runSlackNotificationFromEnv({
    SLACK_WEBHOOK_URL: "https://hooks.slack.test/services/abc",
    WORKFLOW_NAME: "Daily Feedback Provisioning",
    WORKFLOW_STATUS: "failure",
    WORKFLOW_RUN_URL: "https://github.com/org/repo/actions/runs/456",
    WORKFLOW_ARTIFACTS_URL: "https://github.com/org/repo/actions/runs/456/artifacts",
    WORKFLOW_PROVISION_SUMMARY: "1 label created, 0 warnings, 1 baseline created.",
    GITHUB_REPOSITORY: "LEnc95/games.aiandsons.io",
    GITHUB_REF_NAME: "main",
    GITHUB_SHA: "abcdef1234567890",
    GITHUB_ACTOR: "LEnc95",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_RUN_NUMBER: "1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
  assert.equal(result.status, "failure");
  assert.equal(request.url, "https://hooks.slack.test/services/abc");
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.text.includes("Daily Feedback Provisioning failed"), true);
  assert.equal(payload.blocks[2].text.text.includes("1 label created"), true);
  assert.equal(payload.blocks[3].elements[1].url, "https://github.com/org/repo/actions/runs/456/artifacts");
});
