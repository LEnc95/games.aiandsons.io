# Security Best Practices Report

Date: 2026-03-13  
Repository: `games.aiandsons.io`

## Executive Summary
The codebase is generally careful about Stripe signature checks and admin token comparison, but I found two high-severity authorization/session-hardening gaps and two medium-severity deployment hardening gaps. The highest-risk issue is a fail-open ownership check around `sessionId` handling that can bind a Stripe customer to the wrong app session when expected metadata is missing. The second high-risk issue is session signing secret fallback behavior that can run with an unsafe static key in misconfigured deployments.

## High Severity Findings

### [SBP-001] Fail-open ownership check for checkout-session-to-user binding
- Rule ID: `EXPRESS-INPUT-001` / authorization validation
- Severity: High
- Location:
  - `api/stripe/create-portal-session.js:54-59`
  - `api/stripe/create-portal-session.js:61-77`
  - `api/stripe/subscription-status.js:69-74`
  - `api/stripe/subscription-status.js:76-100`
- Evidence:
  - `if (metadataUserId && metadataUserId !== session.userId) { ... }`
  - Binding and customer assignment proceed even when `metadataUserId` is empty.
- Impact: If an attacker obtains a valid Stripe Checkout Session ID that lacks `metadata.appUserId`, they can bind that Stripe customer to their own app session and access customer-linked billing behavior (including portal/session-linked entitlement sync).
- Fix:
  1. Fail closed when `sessionId` is supplied but `metadata.appUserId` is missing.
  2. Require exact equality: `metadataUserId === session.userId`.
  3. Optionally enforce an additional invariant (for example, `checkoutSession.mode === "subscription"` and expected app tag).
- Mitigation:
  - Short term: disable `sessionId`-based binding unless metadata is present and valid.
  - Add audit logging for rejected `session_user_mismatch` and missing-metadata attempts.
- False positive notes:
  - If all historical and future checkout sessions are guaranteed to include immutable `metadata.appUserId`, practical exploitability is lower. Current code still fails open when that assumption is broken.

### [SBP-002] Session signing secret fails open to weak/default behavior
- Rule ID: session management hardening
- Severity: High
- Location:
  - `api/auth/_session.js:27-44`
- Evidence:
  - Falls back to `stripe_seed_${STRIPE_SECRET_KEY}` if `APP_SESSION_SECRET` is missing.
  - Falls back to a static literal `"cade-games-dev-session-secret"` if both are missing.
- Impact: Misconfigured deployments can silently run with predictable or over-coupled session-signing secrets, enabling session forgery risk and weakening key isolation.
- Fix:
  1. Require `APP_SESSION_SECRET` in production and fail startup/request when absent.
  2. Remove static default secret from production paths.
  3. Keep secret domains separate (do not derive session signing from Stripe API secret).
- Mitigation:
  - Enforce environment validation in CI/CD for required secrets before deploy.
  - Rotate session secret and invalidate old sessions after remediation.
- False positive notes:
  - If production always sets a strong `APP_SESSION_SECRET`, current risk is mostly latent; however, the fail-open behavior remains dangerous under config drift.

## Medium Severity Findings

### [SBP-003] Host header / forwarded proto trust in return-origin construction
- Rule ID: `EXPRESS-REDIRECT-001` / origin validation
- Severity: Medium
- Location:
  - `api/stripe/_shared.js:57-60`
  - `api/stripe/create-checkout-session.js:58-67`
  - `api/stripe/create-portal-session.js:89-93`
- Evidence:
  - `getRequestOrigin()` derives origin from request `host` and `x-forwarded-proto` when `APP_BASE_URL` is unset.
  - This derived origin is then used to build Stripe success/cancel/return URLs.
- Impact: If edge/proxy host normalization is incomplete and `APP_BASE_URL` is not set, attacker-controlled headers can influence return URLs and redirect targets in billing flows.
- Fix:
  1. Require `APP_BASE_URL` in production and reject requests if invalid/missing.
  2. Ignore request `host` for security-sensitive return URL generation in production.
  3. Keep URL allowlist enforcement at origin + path.
- Mitigation:
  - Ensure edge layer rewrites/normalizes host headers and drops spoofed forwarding headers.
- False positive notes:
  - If deployment always sets `APP_BASE_URL` and ingress sanitizes forwarded headers, exploitability is significantly reduced.

### [SBP-004] Missing CSP baseline across app responses
- Rule ID: `JS-CSP-001`
- Severity: Medium
- Location:
  - `vercel.json:186-203` (headers set include `X-Content-Type-Options` and `X-Frame-Options`, but no CSP)
  - No `Content-Security-Policy` response header configuration observed in repo
  - No `<meta http-equiv="Content-Security-Policy"...>` found in HTML entry points
- Evidence:
  - Security headers are configured globally, but CSP is absent.
- Impact: In case of any DOM injection/XSS bug, there is no CSP defense-in-depth layer to reduce script execution risk.
- Fix:
  1. Add a CSP header at edge/server level (`vercel.json` headers or platform config).
  2. Start with a compatible baseline and tighten iteratively (especially `script-src`).
  3. Avoid introducing `unsafe-eval`; keep allowances minimal and explicit.
- Mitigation:
  - If strict CSP rollout is large, begin with report-only in staging and enforce once violations are addressed.
- False positive notes:
  - CSP might be injected by an external edge/gateway not represented in this repository; verify runtime response headers before final prioritization.

## Notes
- I did not find evidence of missing Stripe webhook signature validation; webhook signature verification is present in `api/stripe/webhook.js:126-133`.
- Admin token comparison uses `crypto.timingSafeEqual` in `api/stripe/admin/_admin-auth.js:36-44`, which is good practice.
