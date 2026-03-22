import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const submitHandler = require("../api/feedback/submit.js");
const listHandler = require("../api/feedback/admin/list.js");
const updateHandler = require("../api/feedback/admin/update.js");
const prepareAgentTaskHandler = require("../api/feedback/admin/prepare-agent-task.js");
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
};
const originalFetch = global.fetch;

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

async function invoke(handler, options) {
  const req = createMockRequest(options);
  const res = createMockResponse();
  await handler(req, res);
  return {
    req,
    res,
    json: res.body ? JSON.parse(res.body) : null,
  };
}

function installLinearFetchStub() {
  global.fetch = async (url, options = {}) => {
    const requestBody = JSON.parse(String(options.body || "{}"));
    const query = String(requestBody.query || "");

    if (query.includes("issueLabels")) {
      return {
        ok: true,
        async json() {
          return {
            data: {
              issueLabels: {
                nodes: [
                  { id: "lbl_source", name: "source/feedback" },
                  { id: "lbl_triage", name: "status/needs-triage" },
                  { id: "lbl_bug", name: "kind/bug" },
                  { id: "lbl_game", name: "game/pong" },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          };
        },
      };
    }

    if (query.includes("issueCreate")) {
      return {
        ok: true,
        async json() {
          return {
            data: {
              issueCreate: {
                success: true,
                issue: { id: "lin_issue_1", identifier: "CG-123" },
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
  global.fetch = originalFetch;
  __resetFeedbackStoreForTests();
});

test.after(() => {
  restoreEnv();
  global.fetch = originalFetch;
  __resetFeedbackStoreForTests();
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

test("feedback admin update can retry Linear sync for a pending submission", async () => {
  process.env.LINEAR_API_KEY = "linear_token";
  process.env.LINEAR_TEAM_ID = "team_123";
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
    syncStatus: "synced",
    triageStatus: "new",
    severity: "medium",
    duplicateOf: "",
    agentBriefPreparedAt: 0,
    lastSyncError: "",
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
  assert.equal(json.agentTaskMarkdown.includes("## Repo Operating Prompt"), true);

  const updated = await getFeedbackSubmission(saved.id);
  assert.equal(updated.triageStatus, "agent-ready");
  assert.equal(updated.agentBriefPreparedAt > 0, true);
});
