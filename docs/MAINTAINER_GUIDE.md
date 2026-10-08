# Maintainer guide

[Back to the repository overview](../README.md) · [Deployment](../DEPLOYMENT.md) · [Command reference](../AGENTS.md)

Operational details below are checked against repository configuration. Run commands from the repository root. Cloud resource location and provider-console settings must be confirmed in the relevant deployment environment.

## Find what you need

| Task | Section |
| --- | --- |
| Set up locally | [Quick start](#quick-start) · [Core commands](#core-commands) |
| Configure backend services | [Firebase](#firebase-backend-configuration) · [Account sessions](#account-sessions-and-google-sign-in) · [Stripe billing](#stripe-billing-optional) |
| Understand outcome reporting | [Engagement contracts and telemetry](#engagement-contracts-and-outcome-telemetry) |
| Triage player feedback | [Feedback and Linear](#feedback-and-linear-workflow) |
| Maintain releases | [Daily-game checklist](#daily-game-ship-checklist) · [Release train](#self-maintaining-release-train) |
| Prepare weekly work | [Content packs](#weekly-content-pack-runbook) · [Release automation](#weekly-release-automation-runbook) |

For contribution workflow and review expectations, see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Engagement contracts and outcome telemetry

New daily games also need an explicit content contract in `src/meta/content-contracts.js`.
The contract is separate from launcher copy so automation can safely pick challenge metrics and cosmetic slots without guessing at game-specific behavior.

Each contract entry includes:

- `releasedAt`: explicit release date used by sitemap/SEO maintenance.
- `outcomes`: bounded numeric metrics with `min`, `max`, and `direction` (`higher` or `lower`).
- `cosmeticSlots`: renderable theme or cosmetic slots with token names the game can actually apply.

Games report terminal outcomes through `src/core/outcomes.js`:

```js
import { reportGameOutcome } from '/src/core/outcomes.js';

reportGameOutcome({
  slug: 'shadowbloom',
  result: 'completed', // completed | lost | abandoned
  durationMs: elapsedMs,
  metrics: { blooms: 40, gardens: 5, casts: 72 },
});
```

Important constraints:

- Only games with a registered content contract are accepted.
- Metric values are floored and clamped to the contract bounds; unregistered metric keys are ignored.
- `durationMs` is clamped to a maximum of four hours.
- Reporting always updates local mission progress for accepted outcomes.
- Browser aggregate telemetry is off unless `globalThis.CADE_AGGREGATE_TELEMETRY_ENABLED === true`.
- When enabled, aggregate posts go to `/api/telemetry/outcome`, which rewrites to the shared `/api/social?route=telemetry-outcome` Vercel function.
- The telemetry API stores daily aggregate counters and metric summaries in `telemetryDaily` (or in memory for local tests), not raw events, player identifiers, cookies, IP addresses, or free-form metadata.

Automation that depends on these contracts:

- `npm run maintenance:validate` checks package/version parity, the newest game's explicit contract, bounded outcomes, cosmetic slot, `reportGameOutcome` usage, changelog mention, weekly challenge reward cap, and premium shop catalog coverage.
- `npm run game:preflight` runs the maintenance validation plus registry/folder/discovery/OG/sitemap/routing checks before daily game commits.
- `npm run automation:weekly-brief` selects contract-ready games for the Monday content pack: three cosmetics and four bounded challenges, with no new dependencies, network calls, storage keys, billing changes, or free-form telemetry.

## Quick start

Use Node.js 22.x from `package.json` (GitHub QA runs Node 24). Optional Go servers use the toolchain declared in their `go.mod` files. From the repository root:

1. Install dependencies with lockfile parity:

```bash
npm ci
```

2. Run static server locally (recommended for raw smoke tests):

```bash
python -m http.server 4173
```

3. Open:

```text
http://127.0.0.1:4173
```

## Core commands

Install and setup:

- `npm install`
- `npm ci`
- `npx playwright install --with-deps chromium`
- `npm run seo`

Integration and QA:

- `npm run test:shop`
- `npm run test:feedback`
- `npm run test:qa`
- `npm run test:classroom-smoke`
- `npm run test:launch-readiness-smoke`
- `npm run test:policy-gate`

Raw smoke commands (requires pre-started server at `http://127.0.0.1:4173`):

- `npm run test:classroom-smoke:raw`
- `npm run test:feedback-smoke:raw`
- `npm run test:discovery-smoke:raw`
- `npm run test:missions-smoke:raw`
- `npm run test:weekly-smoke:raw`
- `npm run test:assignment-smoke:raw`
- `npm run test:entitlements-smoke:raw`
- `npm run test:pricing-smoke:raw`
- `npm run test:premium-track-smoke:raw`
- `npm run test:school-license-smoke:raw`
- `npm run test:report-smoke:raw`
- `npm run test:accessibility-smoke:raw`
- `npm run test:onboarding-smoke:raw`
- `npm run test:metrics-smoke:raw`
- `npm run test:launch-readiness-smoke:raw`

Data/audit ops:

- `npm run metrics:export -- --input data/metrics-state.json --output output/kpi/kpi-dashboard-snapshot.json --window-days 30`
- `npm run stripe:reconcile-audit -- --base-url https://<your-domain> --user-ids-file data/stripe/users.txt --dry-run true`
- `npm run stripe:nightly-reconcile -- --base-url https://<your-domain> --dry-run false`
- `npm run firebase:deploy:rules`
- `npm run feedback:check-daily`
- `npm run feedback:sync-linear`
- `npm run feedback:sync-linear:files`
- `npm run feedback:provision-linear`

## CI workflows

- `.github/workflows/main-qa.yml`
- `.github/workflows/automation-premerge.yml`
- `.github/workflows/automation-auto-merge.yml`
- `.github/workflows/weekly-content-pack.yml`
- `.github/workflows/weekly-release.yml`
- `.github/workflows/classroom-smoke.yml`
- `.github/workflows/nightly-launch-readiness.yml`
- `.github/workflows/daily-feedback-provisioning.yml`
- `.github/workflows/nightly-billing-reconcile.yml`
- `.github/workflows/policy-release-gate.yml`

Slack notifications:

- Set Actions secret `SLACK_CI_WEBHOOK_URL` to post workflow alerts.
- Failures/cancellations notify by default.
- Set repo variable `SLACK_NOTIFY_SUCCESS=true` to also post successful runs.
- Set Vercel env `SLACK_FEEDBACK_WEBHOOK_URL` to post production feedback-sync failures from app runtime.

## Firebase backend configuration

Repository deployment identifiers (confirm live resources in the deployment environment):

- Project: `games-aiandsons-io`
- Firestore database: `(default)`; the deployment runbook records region `nam5`
- Storage bucket: `games-aiandsons-io-storage`

Tracked Firebase config files:

- `.firebaserc`
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `storage.rules`

Production account sessions require `APP_SESSION_SECRET`. For server-side Firebase credentials, use one of the credential formats below, or the three-field service-account configuration:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Storage operations additionally need:

- `FIREBASE_STORAGE_BUCKET`

Google sign-in requires public client configuration:

- `FIREBASE_WEB_API_KEY`
- `FIREBASE_AUTH_DOMAIN`

The public config also accepts these optional values:

- `FIREBASE_APP_ID`
- `FIREBASE_MESSAGING_SENDER_ID`

Alternative server credential formats:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`

Google sign-in still requires provider setup and authorized domains in Firebase/Google Cloud.

## Account sessions and Google sign-in

Intent: keep anonymous play, Google profiles, cloud save, and billing tied to
one server-issued app session instead of trusting client-only Firebase state.

Key codepaths:

- `api/auth.js` routes `/api/auth/:route` into `api/auth/_handlers.js`.
- `api/auth/_session.js` signs the `cade_session` cookie.
- `src/auth/client.js` owns Firebase web SDK loading, sign-in, sign-out, and
  browser-side session caching.
- `src/core/billing.js` calls `GET /api/auth/session` before Stripe/family-plan
  APIs so billing requests share the same app user.

Session contract:

- `GET /api/auth/session` returns the current session or creates an anonymous
  one when the cookie is missing.
- `POST /api/auth/google-login` accepts a Firebase ID token, verifies it with
  Firebase Admin, upserts the authenticated profile, and replaces the anonymous
  cookie with a Google-authenticated session.
- `POST /api/auth/logout` clears the current cookie and returns a fresh
  anonymous session.
- Cookies are `HttpOnly`, `SameSite=Lax`, path-scoped to `/`, valid for 180
  days, and marked `Secure` on HTTPS/production requests.
- Production must set `APP_SESSION_SECRET`; local development falls back to a
  deterministic dev secret.

Client behavior to preserve:

- Auth session reads use `credentials: "same-origin"` and `cache: "no-store"`.
  Keep `/api/(.*)` response headers no-store in `vercel.json`; a cached guest
  session can hide a successful Google login.
- `fetchAuthSession()` caches normalized session data for 60 seconds. Pass
  `{ force: true }` after account-changing actions that need immediate state.
- After `signInWithGoogle()`, the client exchanges the Firebase user, then
  immediately re-reads `/api/auth/session` and verifies the server retained the
  cookie for the same Firebase UID. Failure means the browser blocked or dropped
  the app cookie.
- If Firebase still has a persisted Google user while the app session is
  anonymous, `fetchAuthSession()` exchanges that Firebase user again to restore
  the server session.
- Local static servers skip auth API probes on `localhost` and `127.0.0.1`.
  Add `?authApiProbe=1` when intentionally testing live auth APIs from a
  loopback URL.

Troubleshooting checks:

1. Confirm `/api/auth/firebase-config` reports `enabled: true` and no missing
   public Firebase fields.
2. Confirm `APP_SESSION_SECRET` is set in production and Firebase Admin
   credentials are configured for `/api/auth/google-login`.
3. In browser devtools, verify `POST /api/auth/google-login` is followed by a
   no-store `GET /api/auth/session` that returns `isAuthenticated: true`.
4. If checkout or family-plan calls act anonymous after sign-in, force-refresh
   the auth/billing session and check that `/api/(.*)` cache headers still
   override the broad public static-site cache rule.

## Stripe billing (optional)

Key routes:

- `GET /api/auth/session`
- `GET /api/stripe/config`
- `POST /api/stripe/create-checkout-session`
- `POST /api/stripe/create-portal-session`
- `GET /api/stripe/subscription-status`
- `POST /api/stripe/webhook`
- `POST /api/stripe/admin/reconcile`

Checkout requires the Stripe secret and price ID for each enabled plan; webhooks require the webhook secret. Production account sessions require the app-session secret:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_FAMILY_MONTHLY`
- `STRIPE_PRICE_FAMILY_ANNUAL`
- `APP_SESSION_SECRET`

Protected admin reconciliation additionally requires `STRIPE_ADMIN_TOKEN`. Durable billing/family state uses the Firebase credentials described above; the storage bucket is needed for attachment storage, not basic checkout.

Optional env vars:

- `STRIPE_PRICE_SCHOOL_MONTHLY`
- `STRIPE_PRICE_SCHOOL_ANNUAL`
- `STRIPE_BILLING_PORTAL_ENABLED`
- `STRIPE_AUTOMATIC_TAX_ENABLED`
- `APP_BASE_URL`
- `STRIPE_WEBHOOK_FORWARD_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

## Feedback and Linear workflow

- Players submit feedback from shared in-game widget surfaces.
- `POST /api/feedback/submit` stores submissions durably and optionally provisions Linear issues when creds are present.
- Admin triage runs from `ops/feedback/index.html` against protected `/api/feedback/admin/*` APIs.
- `linear/labels.md` and `linear/game-issues.csv` are generated artifacts from `src/meta/feedback.js`.
- `npm run feedback:check-daily` is the strict drift guard for those artifacts.

## Daily game ship checklist

1. Add the game route and update `src/meta/games.js`.
2. Add an explicit `src/meta/content-contracts.js` entry with a release date, bounded outcome metrics, and at least one cosmetic slot.
3. Report completion through `reportGameOutcome({ slug, result, durationMs, metrics })`.
4. Mount `mountGameFeedback({ gameSlug, gameName })`.
5. Add the game to the `CHANGELOG.md` Unreleased section.
6. Run `npm run seo`, `npm run og`, and `npm run feedback:sync-linear:files`.
7. Run `npm run maintenance:validate`, `npm run game:preflight`, `npm run test:telemetry`, `npm run test:feedback`, `npm run test:shop`, and `npm run test:social`.
8. Run `npm run test:feedback-smoke:raw` when gameplay shell or feedback surface changed.
9. Commit one game as `Add <Game Name> daily game` on `automation/daily-game/YYYY-MM-DD`, then open a guarded pull request. Unattended releases never push directly to `main`.
10. Let the required premerge checks and trusted squash auto-merge update `main`, then verify Main QA and the production game route.

## Self-maintaining release train

- Every new daily game declares bounded outcomes and cosmetic slots in the engagement contract registry and reports results through the shared outcome API.
- Monday automation produces a deterministic brief for three agent-designed cosmetics and four challenges. Automation PRs receive the full premerge gate and enable auto-merge after required checks.
- Sunday automation promotes `CHANGELOG.md` for players and parents, updates `TECHNICAL_CHANGELOG.md` for maintainers, and synchronizes package/runtime versions.
- Production verification runs after Main QA and retries after 5 and 15 minutes before alerting. It does not automatically revert a failed deployment.
- Aggregate gameplay telemetry stores only daily counters and bounded numeric summaries. Client transmission remains disabled until privacy approval is recorded and the runtime flag is enabled.

### Weekly content pack runbook

Intent: keep the live arcade fresh without expanding the release surface. A
weekly pack adds up to three inventory-backed cosmetics and four bounded weekly
challenges that pay at most 80 coins total.

Source of truth:

- `scripts/automation/prepare-weekly-pack.mjs` builds the brief from games that
  have both `contentContract.cosmeticSlots` and bounded `contentContract.outcomes`.
- `src/prog/shop-catalog.js` holds pack policy constants: 3 cosmetics, prices
  between 20 and 90 coins, and at least 2 contract-ready games.
- `src/prog/challenge-catalog.js` defines challenge metadata and the weekly
  reward ceiling. Dated weekly drops use local-Monday `weekKey` values such as
  `2026-08-31`; undated legacy challenges remain eligible for fallback rotation.
- `src/prog/missions.js` chooses exactly 4 active weekly challenges, preferring
  a scheduled 4-item pack for the current local week before falling back to the
  deterministic rotation.

Implementation checklist:

1. Generate or inspect the brief with `npm run automation:weekly-brief`.
2. Add shop entries to `shop.html` using stable inventory IDs prefixed by the
   game slug, for example `dapplegrove-starlit-moss`.
3. Wire each inventory item into its game shell and expose enough deterministic
   state for screenshots/text-state checks to prove the cosmetic renders.
4. Add four `WEEKLY_CHALLENGE_DEFS` entries with the current local-Monday
   `weekKey`, bounded metrics from the game content contracts, and rewards that
   sum to no more than 80 coins.
5. Update `CHANGELOG.md` and `progress.md` with the pack contents and validation.

Constraints:

- Do not add dependencies, billing changes, new storage keys, network calls, or
  free-form telemetry in a weekly pack.
- Weekly-pack diffs may touch at most three top-level game shells; the
  `weekly-pack` audit lane enforces this separately from the daily-game allowlist.
- Normal new game folders do not need per-game `vercel.json` edits; the generic
  clean-URL header rules are checked by `npm run game:preflight`.

Validation:

- Focused logic: `node --test tests/unit/prog/missions.test.mjs`
- Shop/game wiring: `npm run test:shop`
- Automation contracts: `npm run maintenance:validate` and `npm run test:telemetry`
- Release surface: `AUTOMATION_LANE=weekly-pack npm run automation:audit-diff`
- Browser smoke: start `python -m http.server 4173`, then run
  `npm run test:weekly-smoke:raw`


### Weekly release automation runbook

The Sunday release workflow keeps public and technical release feeds in sync
without hand-editing the version files:

1. `.github/workflows/weekly-release.yml` checks out full history, installs with
   `npm ci`, and runs `npm run release:prepare-weekly`.
2. `scripts/release/prepare-weekly-release.mjs` exits cleanly when
   `release/weekly-state.json` already matches the current ISO week. Otherwise
   it publishes the `CHANGELOG.md` Unreleased section, prepends a
   `TECHNICAL_CHANGELOG.md` entry from git history since the previous release
   date, bumps `package.json` / `package-lock.json` / `version.json`, and records
   the released week in `release/weekly-state.json`.
3. When files changed, the workflow validates the generated release with
   `npm run game:preflight`, `npm run test:policy-gate`, `npm run test:telemetry`,
   `npm run test:shop`, `npm run test:social`, `npm run test:feedback`, and
   `npm run test:launch-readiness-smoke`.
4. The release PR is limited to exactly `CHANGELOG.md`,
   `TECHNICAL_CHANGELOG.md`, `package.json`, `package-lock.json`,
   `version.json`, and `release/weekly-state.json`. That allowlist is enforced
   both in the workflow and by `scripts/automation/audit-release-diff.mjs`.
5. If an open `automation/weekly-release/*` PR already exists, the workflow
   reuses it only when its release files match the just-validated output. If an
   orphaned branch exists without a PR, it updates the branch with
   `--force-with-lease` before creating the PR.
6. The weekly workflow merges with `--match-head-commit` after commit and
   file-list checks pass, then dispatches Main QA and production maintenance
   verification on `main`. The trusted merge path in
   `.github/workflows/automation-auto-merge.yml` keeps the same SHA and
   file-list guards for workflow-dispatched premerge runs.

Manual reruns should use the workflow dispatch button on `weekly-release.yml`.
Do not add product code, generated game assets, or dependency changes beyond
the synchronized package metadata to a weekly release PR; use a separate PR and
let the next release run pick it up through the changelogs.

