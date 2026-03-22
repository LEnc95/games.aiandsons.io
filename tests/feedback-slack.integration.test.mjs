import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  FEEDBACK_ALERT_COOLDOWN_MS,
  buildFeedbackFailureAlertKey,
  buildFeedbackFailureSlackPayload,
  buildFeedbackOpsUrl,
  getFeedbackSlackWebhookUrl,
  sendFeedbackFailureAlert,
  shouldSendFeedbackFailureAlert,
} = require("../api/feedback/_slack.js");
const {
  __resetFeedbackStoreForTests,
  getFeedbackSubmission,
  saveFeedbackSubmission,
} = require("../api/feedback/_store.js");
const {
  createFeedbackSubmissionRecord,
} = require("../api/feedback/_shared.js");

const originalEnv = {
  APP_BASE_URL: process.env.APP_BASE_URL,
  SLACK_FEEDBACK_WEBHOOK_URL: process.env.SLACK_FEEDBACK_WEBHOOK_URL,
  SLACK_CI_WEBHOOK_URL: process.env.SLACK_CI_WEBHOOK_URL,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === "string") process.env[key] = value;
    else delete process.env[key];
  }
}

function createSubmission(overrides = {}) {
  return createFeedbackSubmissionRecord({
    gameSlug: "pong",
    gameName: "Pong",
    kind: "bug",
    summary: "Ball clips through paddle",
    details: "The ball occasionally skips collision handling.",
    reproSteps: "Play for 2 rounds and hit the top half of the paddle.",
    route: "/pong/index.html",
    pageUrl: "https://games.aiandsons.test/pong/index.html",
    referrer: "https://games.aiandsons.test/",
    userAgent: "Unit Test Agent",
    viewport: { width: 1280, height: 720, pixelRatio: 1 },
    pageContext: { route: "/pong/index.html" },
    displayName: "QA Tester",
    contactEmail: "tester@example.com",
    ...overrides,
  }, {
    sessionUserId: "usr_feedback_test",
    requestIp: "127.0.0.1",
  });
}

test.beforeEach(() => {
  process.env.APP_BASE_URL = "https://games.aiandsons.test";
  delete process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  delete process.env.SLACK_CI_WEBHOOK_URL;
  __resetFeedbackStoreForTests();
});

test.after(() => {
  restoreEnv();
  __resetFeedbackStoreForTests();
});

test("feedback Slack helper resolves ops URL and webhook fallback", () => {
  process.env.SLACK_CI_WEBHOOK_URL = "https://hooks.slack.test/services/ci";
  assert.equal(buildFeedbackOpsUrl(), "https://games.aiandsons.test/ops/feedback/index.html");
  assert.equal(getFeedbackSlackWebhookUrl(), "https://hooks.slack.test/services/ci");

  process.env.SLACK_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.test/services/feedback";
  assert.equal(getFeedbackSlackWebhookUrl(), "https://hooks.slack.test/services/feedback");
});

test("feedback Slack payload includes inbox link and error details", () => {
  const payload = buildFeedbackFailureSlackPayload({
    ...createSubmission(),
    syncStatus: "pending",
    lastSyncError: "linear_down",
  });

  assert.equal(payload.text.includes("Feedback Linear Sync Failed"), true);
  assert.equal(payload.blocks[1].fields.some((field) => field.text.includes("pending")), true);
  assert.equal(payload.blocks[2].text.text.includes("linear_down"), true);
  assert.equal(payload.blocks[3].elements[0].url, "https://games.aiandsons.test/ops/feedback/index.html");
});

test("feedback Slack alert key respects cooldown and distinct errors", () => {
  const submission = {
    ...createSubmission(),
    syncStatus: "pending",
    lastSyncError: "linear_down",
  };
  const key = buildFeedbackFailureAlertKey(submission);
  assert.equal(typeof key, "string");
  assert.equal(shouldSendFeedbackFailureAlert(submission, key), true);

  const muted = {
    ...submission,
    lastSlackAlertAt: Date.now(),
    lastSlackAlertKey: key,
  };
  assert.equal(shouldSendFeedbackFailureAlert(muted, key), false);
  assert.equal(shouldSendFeedbackFailureAlert({
    ...muted,
    lastSlackAlertAt: Date.now() - FEEDBACK_ALERT_COOLDOWN_MS - 1000,
  }, key), true);
  assert.equal(shouldSendFeedbackFailureAlert(muted, `${key}:different`), true);
});

test("feedback Slack alert posts once and stores dedupe metadata", async () => {
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.test/services/feedback";
  const saved = await saveFeedbackSubmission({
    ...createSubmission(),
    syncStatus: "pending",
    lastSyncError: "linear_down",
  });

  const requests = [];
  const first = await sendFeedbackFailureAlert(saved, {
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        async text() {
          return "ok";
        },
      };
    },
  });

  assert.equal(first.ok, true);
  assert.equal(first.skipped, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://hooks.slack.test/services/feedback");

  const updated = await getFeedbackSubmission(saved.id);
  assert.equal(updated.lastSlackAlertAt > 0, true);
  assert.equal(updated.lastSlackAlertKey.length > 0, true);

  const second = await sendFeedbackFailureAlert(updated, {
    fetchImpl: async () => {
      throw new Error("should_not_send");
    },
  });
  assert.equal(second.skipped, true);
  assert.equal(second.reason, "cooldown");
});
