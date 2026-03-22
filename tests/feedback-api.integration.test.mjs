import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const submitHandler = require("../api/feedback/submit.js");
const attachmentHandler = require("../api/feedback/attachment.js");
const listHandler = require("../api/feedback/admin/list.js");
const updateHandler = require("../api/feedback/admin/update.js");
const prepareAgentTaskHandler = require("../api/feedback/admin/prepare-agent-task.js");
const {
  __resetLinearCacheForTests,
  provisionFeedbackLinearResources,
} = require("../api/feedback/_linear.js");
const {
  __resetFeedbackStoreForTests,
  getFeedbackSubmission,
  saveFeedbackSubmission,
} = require("../api/feedback/_store.js");
const {
  createFeedbackSubmissionRecord,
} = require("../api/feedback/_shared.js");

const originalEnv = {
  KV_REST_API_URL: process.env.KV_REST_API_URL,
  KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
  FEEDBACK_ADMIN_TOKEN: process.env.FEEDBACK_ADMIN_TOKEN,
  LINEAR_API_KEY: process.env.LINEAR_API_KEY,
  LINEAR_TEAM_ID: process.env.LINEAR_TEAM_ID,
  LINEAR_PROJECT_ID: process.env.LINEAR_PROJECT_ID,
  APP_SESSION_SECRET: process.env.APP_SESSION_SECRET,
  APP_BASE_URL: process.env.APP_BASE_URL,
  SLACK_FEEDBACK_WEBHOOK_URL: process.env.SLACK_FEEDBACK_WEBHOOK_URL,
};
const originalFetch = global.fetch;
let lastLinearIssueCreateInput = null;
let lastLinearIssueUpdateInput = null;
let createdLinearLabelNames = [];

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}

function createMockRequest({
  method = "POST",
  url = "/",
  body = undefined,
  headers = {},
  remoteAddress = "127.0.0.1",
} = {}) {
  const chunks = [];
  if (body !== undefined) {
    chunks.push(Buffer.from(JSON.stringify(body)));
  }
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = { ...headers };
  req.socket = { remoteAddress };
  return req;
}

function createMockResponse() {
  const headers = new Map();
  let body = "";
  return {
    statusCode: 200,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    end(chunk = "") {
      body += String(chunk || "");
      this.body = body;
    },
    body,
  };
}

async function invoke(handler, options = {}) {
  const req = createMockRequest(options);
  const res = createMockResponse();
  await handler(req, res);
  return {
    req,
    res,
    json: options.parseJson === false ? null : (res.body ? JSON.parse(res.body) : null),
  };
}

function installLinearFetchStub({
  includeBaseline = true,
  baselineTitle = "Pong: Issue tracking baseline",
  baselineIdentifier = "CG-BASE-1",
  existingLabels = null,
} = {}) {
  global.fetch = async (url, options = {}) => {
    const requestBody = JSON.parse(String(options.body || "{}"));
    const query = String(requestBody.query || "");

    if (query.includes("issueLabels")) {
      const labels = Array.isArray(existingLabels) && existingLabels.length > 0
        ? existingLabels
        : [
          { id: "lbl_setup", name: "setup" },
          { id: "lbl_tracking", name: "tracking" },
          { id: "lbl_source", name: "source/feedback" },
          { id: "lbl_triage", name: "status/needs-triage" },
          { id: "lbl_agent_ready", name: "status/agent-ready" },
          { id: "lbl_duplicate", name: "status/duplicate" },
          { id: "lbl_bug", name: "kind/bug" },
          { id: "lbl_feature", name: "kind/feature" },
          { id: "lbl_chore", name: "kind/chore" },
          { id: "lbl_blocked", name: "blocked" },
          { id: "lbl_game", name: "game/pong" },
        ];
      return {
        ok: true,
        async json() {
          return {
            data: {
              issueLabels: {
                nodes: labels,
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          };
        },
      };
    }

    if (query.includes("issueLabelCreate")) {
      const name = requestBody.variables?.input?.name || "unknown";
      createdLinearLabelNames.push(String(name));
      return {
        ok: true,
        async json() {
          return {
            data: {
              issueLabelCreate: {
                success: true,
                issueLabel: {
                  id: `lbl_created_${String(name).replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
                  name,
                },
              },
            },
          };
        },
      };
    }

    if (query.includes("project(id: $projectId)")) {
      return {
        ok: true,
        async json() {
          return {
            data: {
              project: {
                issues: {
                  nodes: includeBaseline
                    ? [{ id: "baseline_issue_1", title: baselineTitle, identifier: baselineIdentifier }]
                    : [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          };
        },
      };
    }

    if (query.includes("issueCreate")) {
      lastLinearIssueCreateInput = requestBody.variables?.input || null;
      const title = requestBody.variables?.input?.title || "Untitled";
      return {
        ok: true,
        async json() {
          return {
            data: {
              issueCreate: {
                success: true,
                issue: {
                  id: "lin_issue_1",
                  identifier: title.includes("Issue tracking baseline") ? "CG-BASE-CREATED" : "CG-123",
                  title,
                },
              },
            },
          };
        },
      };
    }

    if (query.includes("issueUpdate")) {
      lastLinearIssueUpdateInput = requestBody.variables?.input || null;
      return {
        ok: true,
        async json() {
          return {
            data: {
              issueUpdate: {
                success: true,
                issue: { id: requestBody.variables?.input?.id || "lin_issue_1" },
              },
            },
          };
        },
      };
    }

    if (query.includes("commentCreate")) {
      return {
        ok: true,
        async json() {
          return {
            data: {
              commentCreate: {
                success: true,
                comment: { id: "comment_1" },
              },
            },
          };
        },
      };
    }

    throw new Error(`Unexpected fetch call to ${url}`);
  };
}

test.beforeEach(() => {
  process.env.KV_REST_API_URL = "";
  process.env.KV_REST_API_TOKEN = "";
  process.env.FEEDBACK_ADMIN_TOKEN = "feedback_secret";
  process.env.LINEAR_API_KEY = "";
  process.env.LINEAR_TEAM_ID = "";
  process.env.LINEAR_PROJECT_ID = "";
  process.env.APP_SESSION_SECRET = "feedback_test_secret";
  process.env.APP_BASE_URL = "https://games.aiandsons.test";
  delete process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  global.fetch = originalFetch;
  lastLinearIssueCreateInput = null;
  lastLinearIssueUpdateInput = null;
  createdLinearLabelNames = [];
  __resetFeedbackStoreForTests();
  __resetLinearCacheForTests();
});

test.after(() => {
  restoreEnv();
  global.fetch = originalFetch;
  __resetFeedbackStoreForTests();
  __resetLinearCacheForTests();
});

test("feedback submit persists sanitized payload with session capture", async () => {
  const { res, json } = await invoke(submitHandler, {
    method: "POST",
    url: "/api/feedback/submit",
    body: {
      gameSlug: "pong",
      kind: "bug",
      summary: "  Ball sticks to wall   ",
      details: "\nThe ball sticks after a corner hit.\n",
      reproSteps: "Serve fast into the top edge.",
      displayName: " Tester ",
      contactEmail: "PLAYER@Example.com ",
      pageContext: {
        route: "/pong/index.html",
        pageUrl: "http://127.0.0.1:4173/pong/index.html",
        referrer: "http://127.0.0.1:4173/",
        userAgent: "Playwright Test Agent",
        viewport: { width: 1280, height: 720, pixelRatio: 1 },
        extraContext: { score: 12, mode: "hard" },
      },
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.ok(json.submissionId.startsWith("fb_"));
  assert.equal(typeof res.getHeader("set-cookie"), "string");

  const saved = await getFeedbackSubmission(json.submissionId);
  assert.equal(saved.gameSlug, "pong");
  assert.equal(saved.summary, "Ball sticks to wall");
  assert.equal(saved.details, "The ball sticks after a corner hit.");
  assert.equal(saved.contactEmail, "player@example.com");
  assert.equal(saved.route, "/pong/index.html");
  assert.equal(saved.syncStatus, "pending");
  assert.equal(saved.sessionUserId.startsWith("usr_"), true);
  assert.deepEqual(saved.viewport, { width: 1280, height: 720, pixelRatio: 1 });
  assert.equal(saved.pageContext.extraContext.score, 12);
});

test("feedback submit stores attachment metadata and signed attachment route returns content", async () => {
  const attachmentData = Buffer.from("corner case log", "utf8").toString("base64");
  const { res, json } = await invoke(submitHandler, {
    method: "POST",
    url: "/api/feedback/submit",
    body: {
      gameSlug: "pong",
      kind: "bug",
      summary: "Attachment report",
      details: "This report carries a log file.",
      attachments: [
        {
          name: "corner-log.txt",
          contentType: "text/plain",
          dataUrl: `data:text/plain;base64,${attachmentData}`,
        },
      ],
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.equal(Array.isArray(json.attachments), true);
  assert.equal(json.attachments.length, 1);
  assert.equal(json.attachments[0].name, "corner-log.txt");
  assert.equal(json.attachments[0].previewKind, "text");
  assert.equal(json.attachments[0].previewText.includes("corner case log"), true);
  assert.equal(json.attachments[0].url.startsWith("https://games.aiandsons.test/api/feedback/attachment?id="), true);

  const saved = await getFeedbackSubmission(json.submissionId);
  assert.equal(saved.attachments.length, 1);

  const attachmentUrl = new URL(json.attachments[0].url);
  const fetched = await invoke(attachmentHandler, {
    method: "GET",
    url: `${attachmentUrl.pathname}${attachmentUrl.search}`,
    parseJson: false,
  });

  assert.equal(fetched.res.statusCode, 200);
  assert.equal(fetched.res.getHeader("content-type"), "text/plain");
  assert.equal(fetched.res.body, "corner case log");
});

test("feedback submit rate limits repeated reports from the same IP", async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { res } = await invoke(submitHandler, {
      method: "POST",
      url: "/api/feedback/submit",
      remoteAddress: "127.0.0.44",
      body: {
        gameSlug: "pong",
        kind: "general",
        summary: `Report ${attempt}`,
        details: "Still trying things out.",
      },
    });
    assert.equal(res.statusCode, 200);
  }

  const blocked = await invoke(submitHandler, {
    method: "POST",
    url: "/api/feedback/submit",
    remoteAddress: "127.0.0.44",
    body: {
      gameSlug: "pong",
      kind: "general",
      summary: "One more report",
      details: "This should be rate limited.",
    },
  });

  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.json.code, "rate_limited");
});

test("feedback submit falls back to pending sync when Linear issue creation fails", async () => {
  process.env.LINEAR_API_KEY = "linear_token";
  process.env.LINEAR_TEAM_ID = "team_123";
  global.fetch = async () => {
    throw new Error("linear_down");
  };

  const { json } = await invoke(submitHandler, {
    method: "POST",
    url: "/api/feedback/submit",
    body: {
      gameSlug: "pong",
      kind: "bug",
      summary: "Sync failure report",
      details: "This report should still be stored locally.",
    },
  });

  const saved = await getFeedbackSubmission(json.submissionId);
  assert.equal(saved.syncStatus, "pending");
  assert.equal(saved.lastSyncError.includes("linear_down"), true);
  assert.equal(saved.linearIssueIdentifier, "");
});

test("feedback submit sends a Slack ops alert when Linear sync fails", async () => {
  process.env.LINEAR_API_KEY = "linear_token";
  process.env.LINEAR_TEAM_ID = "team_123";
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.test/services/feedback";

  const slackRequests = [];
  global.fetch = async (url, options = {}) => {
    if (String(url).includes("hooks.slack.test")) {
      slackRequests.push({ url, options });
      return {
        ok: true,
        async text() {
          return "ok";
        },
      };
    }
    throw new Error("linear_down");
  };

  const { json } = await invoke(submitHandler, {
    method: "POST",
    url: "/api/feedback/submit",
    body: {
      gameSlug: "pong",
      kind: "bug",
      summary: "Slack failure report",
      details: "This report should send an ops alert.",
    },
  });

  const saved = await getFeedbackSubmission(json.submissionId);
  assert.equal(saved.syncStatus, "pending");
  assert.equal(saved.lastSlackAlertAt > 0, true);
  assert.equal(slackRequests.length, 1);
  const payload = JSON.parse(slackRequests[0].options.body);
  assert.equal(payload.text.includes("Feedback Linear Sync Failed"), true);
  assert.equal(payload.blocks[3].elements[0].url, "https://games.aiandsons.test/ops/feedback/index.html");
});

test("feedback submit parents new issues under the matching game baseline when available", async () => {
  process.env.LINEAR_API_KEY = "linear_token";
  process.env.LINEAR_TEAM_ID = "team_123";
  process.env.LINEAR_PROJECT_ID = "project_123";
  installLinearFetchStub();

  const { res, json } = await invoke(submitHandler, {
    method: "POST",
    url: "/api/feedback/submit",
    body: {
      gameSlug: "pong",
      kind: "bug",
      summary: "Baseline parent test",
      details: "This submission should attach to the Pong baseline issue.",
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.equal(json.syncStatus, "synced");
  assert.equal(json.linearIssueIdentifier, "CG-123");
  assert.equal(json.linearParentIssueIdentifier, "CG-BASE-1");
  assert.equal(json.linearParentIssueTitle, "Pong: Issue tracking baseline");
  assert.deepEqual(
    [...(lastLinearIssueCreateInput?.labelIds || [])].sort(),
    ["lbl_bug", "lbl_game", "lbl_source", "lbl_triage"],
  );
  assert.equal(lastLinearIssueUpdateInput?.id, "lin_issue_1");
  assert.equal(lastLinearIssueUpdateInput?.parentId, "baseline_issue_1");

  const saved = await getFeedbackSubmission(json.submissionId);
  assert.equal(saved.linearParentIssueId, "baseline_issue_1");
  assert.equal(saved.linearParentIssueIdentifier, "CG-BASE-1");
  assert.equal(saved.linearParentIssueTitle, "Pong: Issue tracking baseline");
  assert.equal(saved.linearParentIssueUrl, "https://linear.app/issue/CG-BASE-1");
});

test("feedback Linear provisioning creates missing labels and baselines for newly added games", async () => {
  process.env.LINEAR_API_KEY = "linear_token";
  process.env.LINEAR_TEAM_ID = "team_123";
  process.env.LINEAR_PROJECT_ID = "project_123";
  installLinearFetchStub({
    includeBaseline: false,
    existingLabels: [
      { id: "lbl_source", name: "source/feedback" },
      { id: "lbl_triage", name: "status/needs-triage" },
    ],
  });

  const result = await provisionFeedbackLinearResources({
    commonLabels: ["setup", "tracking", "source/feedback", "status/needs-triage"],
    games: [{ slug: "new-game", name: "New Game", label: "game/new-game" }],
    teamId: "team_123",
    projectId: "project_123",
  });

  assert.deepEqual(createdLinearLabelNames.sort(), ["game/new-game", "setup", "tracking"]);
  assert.equal(result.createdLabels.length, 3);
  assert.equal(result.baselineResults.length, 1);
  assert.equal(result.baselineResults[0].created, true);
  assert.equal(result.baselineResults[0].issue?.title, "New Game: Issue tracking baseline");
});

test("feedback admin update can retry Linear sync for a pending submission", async () => {
  process.env.LINEAR_API_KEY = "linear_token";
  process.env.LINEAR_TEAM_ID = "team_123";
  process.env.LINEAR_PROJECT_ID = "project_123";
  installLinearFetchStub();

  const pending = await saveFeedbackSubmission(
    createFeedbackSubmissionRecord({
      gameSlug: "pong",
      gameName: "Pong",
      kind: "bug",
      summary: "Ball stuck in wall",
      details: "It gets trapped in the corner.",
      reproSteps: "Aim for the upper edge.",
      route: "/pong",
      pageUrl: "http://example.com/pong",
      referrer: "http://example.com/",
      userAgent: "Unit Test Agent",
      viewport: { width: 1280, height: 720, pixelRatio: 1 },
      pageContext: { route: "/pong", extraContext: { score: 3 } },
      displayName: "",
      contactEmail: "",
    }, {
      sessionUserId: "usr_feedback_test",
      requestIp: "127.0.0.1",
    }),
  );

  const { res, json } = await invoke(updateHandler, {
    method: "POST",
    url: "/api/feedback/admin/update",
    headers: { "x-admin-token": "feedback_secret" },
    body: {
      submissionId: pending.id,
      triageStatus: "triaged",
      severity: "high",
      retrySync: true,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.equal(json.submission.syncStatus, "synced");
  assert.equal(json.submission.linearIssueIdentifier, "CG-123");
  assert.equal(json.submission.linearParentIssueIdentifier, "CG-BASE-1");
  assert.equal(json.submission.triageStatus, "triaged");
  assert.equal(json.submission.severity, "high");
});

test("feedback admin prepare-agent-task returns markdown and updates triage state", async () => {
  process.env.LINEAR_API_KEY = "linear_token";
  process.env.LINEAR_TEAM_ID = "team_123";
  installLinearFetchStub();

  const saved = await saveFeedbackSubmission({
    id: "fb_existing",
    submittedAt: Date.now(),
    updatedAt: Date.now(),
    sessionUserId: "usr_feedback_test",
    requestIp: "127.0.0.1",
    gameSlug: "pong",
    gameName: "Pong",
    route: "/pong",
    kind: "bug",
    summary: "Prepare agent brief",
    details: "We need a rich handoff for this bug.",
    reproSteps: "Open Pong and wait 10 seconds.",
    displayName: "Tester",
    contactEmail: "tester@example.com",
    userAgent: "Unit Test Agent",
    viewport: { width: 1280, height: 720, pixelRatio: 1 },
    pageUrl: "http://example.com/pong",
    referrer: "http://example.com/",
    pageContext: { route: "/pong", extraContext: { score: 4 } },
    linearIssueId: "lin_issue_1",
    linearIssueIdentifier: "CG-123",
    linearIssueUrl: "https://linear.app/issue/CG-123",
    linearParentIssueId: "baseline_issue_1",
    linearParentIssueIdentifier: "CG-BASE-1",
    linearParentIssueTitle: "Pong: Issue tracking baseline",
    linearParentIssueUrl: "https://linear.app/issue/CG-BASE-1",
    syncStatus: "synced",
    triageStatus: "new",
    severity: "medium",
    duplicateOf: "",
    agentBriefPreparedAt: 0,
    lastSyncError: "",
    lastSlackAlertAt: 0,
    lastSlackAlertKey: "",
  });

  const listed = await invoke(listHandler, {
    method: "GET",
    url: "/api/feedback/admin/list?game=pong",
    headers: { "x-admin-token": "feedback_secret" },
  });
  assert.equal(listed.res.statusCode, 200);
  assert.equal(listed.json.submissions.length, 1);

  const { res, json } = await invoke(prepareAgentTaskHandler, {
    method: "POST",
    url: "/api/feedback/admin/prepare-agent-task",
    headers: { "x-admin-token": "feedback_secret" },
    body: {
      submissionId: saved.id,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.equal(json.updatedTriageStatus, "agent-ready");
  assert.equal(json.linearIssueIdentifier, "CG-123");
  assert.equal(json.commentPosted, true);
  assert.equal(json.agentTaskMarkdown.includes("# Agent Handoff Brief"), true);
  assert.equal(json.agentTaskMarkdown.includes("- Baseline issue: CG-BASE-1"), true);
  assert.equal(json.agentTaskMarkdown.includes("## Repo Operating Prompt"), true);

  const updated = await getFeedbackSubmission(saved.id);
  assert.equal(updated.triageStatus, "agent-ready");
  assert.equal(updated.agentBriefPreparedAt > 0, true);
});
