# Stripe Incident Runbook

## Purpose
Use this runbook when Stripe webhook delivery or entitlement synchronization is degraded, delayed, or inconsistent.

## Scope
Covers:
- `api/stripe/webhook`
- Durable entitlement store writes in `api/stripe/_store.js`
- Session-bound entitlement reads from `api/stripe/subscription-status`
- Admin reconciliation endpoint `api/stripe/admin/reconcile`

## Required Environment Variables
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_ADMIN_TOKEN`
- `APP_SESSION_SECRET`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

## Detection Signals
- Elevated `invalid_webhook_payload` or `webhook_secret_missing` responses on webhook route.
- Customer reports of missing premium access after successful Stripe checkout.
- Drift between Stripe subscription state and local entitlement state from `subscription-status` checks.
- KV outage alerts or repeated store write failures.

## Immediate Containment Checklist
1. Verify Stripe webhook endpoint health and signature configuration.
2. Confirm KV connectivity and auth (`KV_REST_API_URL`, `KV_REST_API_TOKEN`).
3. If webhook traffic is failing due to signature mismatch, pause release rollouts and fix `STRIPE_WEBHOOK_SECRET` first.
4. If KV is degraded, keep app online but communicate potential entitlement lag to stakeholders.

## Recovery Workflow
1. Resolve root cause (webhook secret, KV outage, Stripe API outage, deployment regression).
2. For affected accounts, run dry-run reconcile to confirm expected subscription-derived entitlements.
3. Run non-dry reconcile to persist corrected entitlements.
4. Validate corrected access by checking:
   - `GET /api/stripe/subscription-status` for the affected user.
   - UI gate behavior in `shop.html` and `teacher/index.html`.

### Reconcile API Usage
Dry run:

```bash
curl -X POST https://<your-domain>/api/stripe/admin/reconcile \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $STRIPE_ADMIN_TOKEN" \
  -d '{"userId":"usr_example","dryRun":true}'
```

Persist fix:

```bash
curl -X POST https://<your-domain>/api/stripe/admin/reconcile \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $STRIPE_ADMIN_TOKEN" \
  -d '{"userId":"usr_example","dryRun":false}'
```

Alternate targeting by Stripe customer:

```bash
curl -X POST https://<your-domain>/api/stripe/admin/reconcile \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $STRIPE_ADMIN_TOKEN" \
  -d '{"customerId":"cus_example","dryRun":false}'
```

## Validation Checklist After Recovery
1. `npm run test:shop` passes on the fix branch.
2. `npm run test:policy-gate` passes if release artifacts changed.
3. Spot-check representative users:
   - Family premium active user
   - School license active user
   - Free-tier user
4. Confirm no new webhook parsing/auth errors in logs.

## Rollback Procedure
1. If incident is caused by a new deploy, roll back to previous known-good commit.
2. Re-run reconciliation for any users updated during the faulty window.
3. Re-validate entitlement gates and Stripe status endpoint responses.
4. Keep incident channel open until at least one successful webhook event and one successful reconcile are observed post-rollback.

## Communication Template
Subject: Stripe Entitlement Incident Update

- Status: [Investigating | Mitigating | Resolved]
- Start time (UTC): [YYYY-MM-DD HH:MM]
- Impact: [who is affected and what fails]
- Root cause: [known cause or in-progress]
- Mitigation in progress: [steps currently running]
- Expected next update: [time]
- Customer action needed: [none / relog / contact support]

## Exit Criteria
- Root cause fixed in production.
- Reconcile completed for affected users.
- No recurring entitlement mismatch alerts for one monitoring window.
- Incident note added to release/risk history.
