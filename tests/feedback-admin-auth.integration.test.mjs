import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  getConfiguredAdminToken,
  getAdminTokenFromRequest,
  isAdminAuthorized,
} = require("../api/feedback/admin/_admin-auth.js");

const originalAdminToken = process.env.FEEDBACK_ADMIN_TOKEN;

function restoreEnv() {
  if (typeof originalAdminToken === "string") {
    process.env.FEEDBACK_ADMIN_TOKEN = originalAdminToken;
  } else {
    delete process.env.FEEDBACK_ADMIN_TOKEN;
  }
}

test.after(() => {
  restoreEnv();
});

test("feedback admin auth reads x-admin-token then bearer token", () => {
  const fromHeader = getAdminTokenFromRequest({
    headers: {
      "x-admin-token": "header_token",
      authorization: "Bearer bearer_token",
    },
  });
  assert.equal(fromHeader, "header_token");

  const fromBearer = getAdminTokenFromRequest({
    headers: {
      authorization: "Bearer bearer_token",
    },
  });
  assert.equal(fromBearer, "bearer_token");

  const empty = getAdminTokenFromRequest({ headers: {} });
  assert.equal(empty, "");
});

test("feedback admin auth rejects missing or invalid token", () => {
  process.env.FEEDBACK_ADMIN_TOKEN = "feedback_secret";
  assert.equal(getConfiguredAdminToken(), "feedback_secret");

  const missing = isAdminAuthorized({ headers: {} });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "admin_token_missing");

  const invalid = isAdminAuthorized({ headers: { "x-admin-token": "wrong" } });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, "admin_token_invalid");
});

test("feedback admin auth succeeds with matching token", () => {
  process.env.FEEDBACK_ADMIN_TOKEN = "feedback_secret";
  const authorized = isAdminAuthorized({ headers: { "x-admin-token": "feedback_secret" } });
  assert.equal(authorized.ok, true);
  assert.equal(authorized.reason, "ok");
});

test("feedback admin auth reports missing configuration", () => {
  delete process.env.FEEDBACK_ADMIN_TOKEN;
  const result = isAdminAuthorized({ headers: { "x-admin-token": "anything" } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "admin_token_not_configured");
});
