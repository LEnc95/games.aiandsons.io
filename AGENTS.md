# AGENTS.md

## Scope
Operational command reference for contributors and automations in this repository.

## Core Workflows
- Install dependencies: `npm install`
- Install dependencies with lockfile parity (CI): `npm ci`
- Install Playwright browser runtime for smoke tests: `npx playwright install --with-deps chromium`
- Run local static server for raw smoke tests: `python -m http.server 4173`
- Regenerate sitemap and inject SEO metadata: `npm run seo`
- Regenerate only discovery slug metadata from `src/meta/games.js`: `npm run discovery:meta`
- Render social/OG card PNGs: `npm run og`
- Capture marketing gameplay clips: `npm run marketing:clips`
- Validate daily new-game wiring before commit: `npm run game:preflight`
- Validate self-maintenance contracts and release feeds: `npm run maintenance:validate`
- Audit an automation branch diff: `npm run automation:audit-diff`
- Generate the current weekly agent content brief: `npm run automation:weekly-brief`
- Prepare synchronized weekly release files: `npm run release:prepare-weekly`
- Verify the production maintenance surface: `npm run test:production-maintenance`
- Roll up and enforce aggregate telemetry retention: `npm run telemetry:retention -- --dry-run false`
- Run aggregate telemetry and maintenance automation tests: `npm run test:telemetry`
- Run integration tests: `npm run test:shop`
- Run feedback integration tests: `npm run test:feedback`
- Run social API integration tests: `npm run test:social`
- Run share landing integration tests: `node --test tests/share.integration.test.mjs`
- Run discovery API integration tests: `node --test tests/discovery-api.integration.test.mjs`
- Run standalone unit tests: `node --test tests/unit/games.test.mjs tests/unit/discovery-rankings.test.mjs tests/unit/storage.test.mjs tests/unit/core/billing.test.mjs tests/unit/core/onboarding.test.mjs tests/unit/prog/missions.test.mjs`
- Run Audioagar client integration tests: `npm run test:audioagar`
- Run Audioagar server Go tests: `npm run test:audioagar:server`
- Run Club Penguin World server Go tests: `cd clubpenguin-world && go test ./...`
- Run combined QA gate: `npm run test:qa`
- Run classroom smoke (auto-starts server): `npm run test:classroom-smoke`
- Run launch-readiness smoke (auto-starts server): `npm run test:launch-readiness-smoke`
- Run release policy gate: `npm run test:policy-gate`

## Raw Smoke Commands (require pre-started server at http://127.0.0.1:4173)
- Classroom mode: `npm run test:classroom-smoke:raw`
- Feedback widget + inbox: `npm run test:feedback-smoke:raw`
- Discovery/search + shop filter: `npm run test:discovery-smoke:raw`
- Daily missions: `npm run test:missions-smoke:raw`
- Weekly challenges: `npm run test:weekly-smoke:raw`
- Assignment bundle: `npm run test:assignment-smoke:raw`
- Entitlements shop: `npm run test:entitlements-smoke:raw`
- Pricing checkout: `npm run test:pricing-smoke:raw`
- Premium track: `npm run test:premium-track-smoke:raw`
- School license: `npm run test:school-license-smoke:raw`
- Report generator: `npm run test:report-smoke:raw`
- Accessibility pack: `npm run test:accessibility-smoke:raw`
- Onboarding split: `npm run test:onboarding-smoke:raw`
- Metrics baseline: `npm run test:metrics-smoke:raw`
- Launch-readiness aggregate raw run: `npm run test:launch-readiness-smoke:raw`

## Data and Audit Commands
- Export KPI snapshot: `npm run metrics:export -- --input data/metrics-state.json --output output/kpi/kpi-dashboard-snapshot.json --window-days 30`
- Stripe reconcile/audit pass: `npm run stripe:reconcile-audit -- --base-url https://<your-domain> --user-ids-file data/stripe/users.txt --dry-run true`
- Stripe nightly reconcile sweep: `npm run stripe:nightly-reconcile -- --base-url https://<your-domain> --dry-run false`
- Stripe nightly reconcile sweep with JSON summary output (matches CI artifact export): `npm run stripe:nightly-reconcile -- --base-url https://<your-domain> --dry-run false --output output/stripe/nightly-reconcile-summary.json`
- Deploy tracked Firebase rules: `npm run firebase:deploy:rules`
- Run the strict daily feedback metadata guard: `npm run feedback:check-daily`
- Regenerate Linear feedback seed files and live-provision Linear when envs are present: `npm run feedback:sync-linear`
- Regenerate only the local Linear seed artifacts: `npm run feedback:sync-linear:files`
- Live-provision missing Linear labels and baseline issues: `npm run feedback:provision-linear`

## GitHub Automations
- The Codex `create-a-new-game` scheduler runs daily at 07:00 in an isolated worktree. A successful run commits one game and pushes `HEAD:main`; any pre-push failure must leave `main` unchanged.
- Main branch fast QA and new-game preflight: `.github/workflows/main-qa.yml`
- Automation PR full premerge gate and auto-merge: `.github/workflows/automation-premerge.yml`
- Trusted post-gate auto-merge authority: `.github/workflows/automation-auto-merge.yml`
- Monday three-cosmetic/four-challenge agent brief: `.github/workflows/weekly-content-pack.yml`
- Sunday synchronized public/technical release PR: `.github/workflows/weekly-release.yml`
- Sunday aggregate telemetry rollup and retention: `.github/workflows/telemetry-retention.yml`
- Post-Main-QA production verification with 5/15-minute retries: `.github/workflows/production-maintenance-verify.yml`
- PR classroom smoke gate: `.github/workflows/classroom-smoke.yml`
- Nightly launch gate: `.github/workflows/nightly-launch-readiness.yml`
- Daily lightweight Linear provisioning: `.github/workflows/daily-feedback-provisioning.yml`
- Nightly billing drift reconcile: `.github/workflows/nightly-billing-reconcile.yml`
- Tagged release policy gate: `.github/workflows/policy-release-gate.yml`
- Slack notifications for those workflows use the `SLACK_CI_WEBHOOK_URL` Actions secret and notify on failures by default.
- Set repository variable `SLACK_NOTIFY_SUCCESS=true` to enable success notifications for those workflows.
- Production feedback sync failures can post to Slack from the deployed app when `SLACK_FEEDBACK_WEBHOOK_URL` is set in Vercel.
- Billing reconcile additionally needs GitHub repository secrets `STRIPE_ADMIN_TOKEN` and either `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` so it can enumerate customer-backed billing profiles from Firestore before calling the admin reconcile route.

## Firebase Backend
- Firebase project: `games-aiandsons-io`
- Firestore database: `(default)` in `nam5`
- Backend attachment bucket: `games-aiandsons-io-storage`
- Public account flow uses Firebase Auth + Google sign-in, but the app still exchanges that for the repo's signed `cade_session` cookie via `api/auth/google-login`
- Durable feedback and Stripe state now prefer Firestore/Storage over KV or process memory
- Required Vercel envs for the Firebase backend: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID`
- Google sign-in still requires the Firebase/Auth provider setup and authorized domains in the Firebase or Google Cloud console

## Daily Game Checklist
- Add the game route and update `src/meta/games.js`
- Add an explicit entry to `src/meta/content-contracts.js` with release date, bounded outcome metrics, and at least one cosmetic slot
- Report completion through `reportGameOutcome({ slug, result, durationMs, metrics })`
- Run `npm run seo` and `npm run og` after metadata/content changes
- Run `npm run game:preflight` before committing a new game
- Mount `mountGameFeedback({ gameSlug, gameName })`
- Scheduled runs use `npm run feedback:sync-linear:files`; the daily provisioning workflow handles live Linear resources
- Run `npm run test:feedback`
- Run `npm run test:feedback-smoke:raw` when the game shell or feedback surface changed
- Confirm Linear baseline coverage or let the daily provisioning workflow backfill it
- After every required gate passes, commit as `Add <Game Name> daily game`, push without force to `main`, and verify both Main QA and the production game route
- Scheduled automation instead opens `automation/daily-game/YYYY-MM-DD`; passing automation PRs enable squash auto-merge and then run production verification

## Self-Maintenance Privacy Boundary
- Aggregate outcome collection is disabled in the browser until `CADE_AGGREGATE_TELEMETRY_ENABLED` is explicitly enabled after a release-specific privacy review.
- The telemetry endpoint accepts only registered numeric metrics and persists daily counts/sums/min/max values. Do not add player identifiers, IP addresses, cookies, free-form fields, or raw event histories.
- Weekly content automation may change up to three game shells and must not add dependencies, billing changes, network calls, new storage keys, or free-form telemetry.

