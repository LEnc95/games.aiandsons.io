import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  getConfiguredAdminToken,
  getAdminTokenFromRequest,
  isAdminAuthorized,
} = require("../api/stripe/admin/_admin-auth.js");

const originalAdminToken = process.env.STRIPE_ADMIN_TOKEN;

function restoreEnv() {
  if (typeof originalAdminToken === "string") {
    process.env.STRIPE_ADMIN_TOKEN = originalAdminToken;
  } else {
    delete process.env.STRIPE_ADMIN_TOKEN;
  }
}

test.after(() => {
  restoreEnv();
});

test("getAdminTokenFromRequest reads x-admin-token then bearer token", () => {
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

test("isAdminAuthorized fails when token is missing or invalid", () => {
  process.env.STRIPE_ADMIN_TOKEN = "admin_secret";
  assert.equal(getConfiguredAdminToken(), "admin_secret");

  const missing = isAdminAuthorized({ headers: {} });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "admin_token_missing");

  const invalid = isAdminAuthorized({ headers: { "x-admin-token": "wrong" } });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, "admin_token_invalid");
});

test("isAdminAuthorized succeeds with matching token", () => {
  process.env.STRIPE_ADMIN_TOKEN = "admin_secret";
  const authorized = isAdminAuthorized({ headers: { "x-admin-token": "admin_secret" } });
  assert.equal(authorized.ok, true);
  assert.equal(authorized.reason, "ok");
});

test("isAdminAuthorized reports not configured when env token is absent", () => {
  delete process.env.STRIPE_ADMIN_TOKEN;
  const result = isAdminAuthorized({ headers: { "x-admin-token": "anything" } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "admin_token_not_configured");
});
