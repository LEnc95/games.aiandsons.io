# Cade's Games

[![Nightly Launch Readiness](https://github.com/LEnc95/games.aiandsons.io/actions/workflows/nightly-launch-readiness.yml/badge.svg)](https://github.com/LEnc95/games.aiandsons.io/actions/workflows/nightly-launch-readiness.yml)
[![Daily Feedback Provisioning](https://github.com/LEnc95/games.aiandsons.io/actions/workflows/daily-feedback-provisioning.yml/badge.svg)](https://github.com/LEnc95/games.aiandsons.io/actions/workflows/daily-feedback-provisioning.yml)

A static browser arcade site with a homepage launcher, coin/profile progression, achievements, and a shop for cosmetics/inventory unlocks.

## What this repository contains

- `index.html`: homepage hub with launcher cards, search/filter controls, daily/weekly progression panels, coin-earning tags, profile modal, badges modal, recent games, and version badge.
- `shop.html`: in-app shop with game-tagged items, text/game filtering, cosmetics/inventory unlocks, and premium entitlement gates.
- `pricing.html`: family monthly/annual plans page with local checkout intent flow.
- `school-license.html`: school/district licensing page with local district-review request handoff flow.
- `accessibility.html`: persisted accessibility control panel for color profile, larger UI, reduced motion, and contrast preferences.
- `teacher/index.html`: classroom dashboard for session controls, whitelist presets, assignment bundles, PIN-gated active-session mutations, and licensed aggregate report exports.
- `ops/feedback/index.html`: protected feedback inbox for reviewing reports, retrying Linear sync, and preparing agent-ready fix briefs.
- `src/feedback/*`: shared game feedback widget, browser client, and loopback stub mode for local smoke coverage.
- `api/feedback/*`: serverless feedback submission/admin APIs backed by KV or in-memory fallback plus Linear sync.
- `src/core/*`: shared persistence/state helpers, entitlement gate logic, accessibility preference helpers, and local KPI metrics tracking.
- `src/meta/games.js`: game registry used by homepage UI.
- `src/meta/feedback.js`: feedback and Linear metadata derived from the game registry.
- `src/prog/*`: achievements, daily/weekly missions, premium challenge track, assignment bundles, and cosmetics logic.
- `*/index.html` game folders: standalone game pages.
- `tests/shop-items.integration.test.mjs` + `tests/entitlements.integration.test.mjs` + `tests/premium-challenges.integration.test.mjs` + `tests/metrics.integration.test.mjs`: integration checks for shop consistency, premium gating, premium challenge progression logic, and KPI summary behavior.

## Current games

- Pong (`/pong`)
- Snake (`/snake`)
- Tic-Tac-Toe (`/tictactoe`)
- Rock Paper Scissors (`/rps`)
- Memory (`/memory`)
- Breakout (`/breakout`)
- Connect 4 (`/connect4`)
- Minesweeper (`/minesweeper`)
- Flappy Bird (`/flappy`)
- Dino Run (`/dino`)
- Space Invaders (`/spaceinvaders`)
- Frogger (`/frogger`)
- Pocket Mini Golf (`/minigolf`)
- Micro Mario (`/mario`)
- Retro Downhill Ski (`/ski`)
- Micro RC Racer (`/microrc`)

## Running locally

Because this is a static site, any local file server works. For example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Data model (localStorage)

The shared state stores:

- profile (`name`, `firstRun`)
- coins
- badges
- cosmetics + owned cosmetics
- inventory
- recently played slugs

See `src/core/state.js` for load/normalize/persist details.

## Quality checks

Run the integration test:

```bash
node --test tests/shop-items.integration.test.mjs tests/entitlements.integration.test.mjs tests/premium-challenges.integration.test.mjs tests/metrics.integration.test.mjs
```

Or via npm script:

```bash
npm run test:shop
```

Run the feedback integration test suite:

```bash
npm run test:feedback
```

Run only the strict daily feedback metadata guard:

```bash
npm run feedback:check-daily
```

Run the classroom lock/unlock smoke test (auto-starts local server):

```bash
npm run test:classroom-smoke
```

Run the discovery/search + shop filter smoke test against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:discovery-smoke:raw
```

Run the feedback widget + inbox smoke test against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:feedback-smoke:raw
```

Run the daily missions smoke test against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:missions-smoke:raw
```

Run the weekly challenge smoke test against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:weekly-smoke:raw
```

Run the classroom assignment bundle smoke test against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:assignment-smoke:raw
```

Run the entitlements shop smoke test against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:entitlements-smoke:raw
```

Run the pricing + checkout smoke test against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:pricing-smoke:raw
```

Run the premium challenge track smoke test against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:premium-track-smoke:raw
```

Run the school license flow smoke test against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:school-license-smoke:raw
```

Run the report generator smoke test against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:report-smoke:raw
```

Run the policy release gate check (required before release tags):

```bash
npm run test:policy-gate
```

Run the accessibility pack smoke test against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:accessibility-smoke:raw
```

Run the onboarding split smoke test against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:onboarding-smoke:raw
```

Run the KPI metrics baseline smoke test against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:metrics-smoke:raw
```

Export a deterministic KPI dashboard snapshot JSON from local metrics state:

```bash
npm run metrics:export -- --input data/metrics-state.json --output output/kpi/kpi-dashboard-snapshot.json --window-days 30
```

Run a bulk Stripe reconcile/audit pass (requires admin token + target files):

```bash
npm run stripe:reconcile-audit -- --base-url https://<your-domain> --user-ids-file data/stripe/users.txt --dry-run true
```

Regenerate the Linear feedback seed files from the game registry:

```bash
npm run feedback:sync-linear
```

Regenerate only the local seed files without touching live Linear:

```bash
npm run feedback:sync-linear:files
```

Provision missing Linear labels and baseline issues directly:

```bash
npm run feedback:provision-linear
```

Run the launch-readiness aggregate smoke suite against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:launch-readiness-smoke:raw
```

Run the launch-readiness aggregate smoke suite with auto-started local server:

```bash
npm run test:launch-readiness-smoke
```

If you already have a local server running at `http://127.0.0.1:4173`, run the raw script directly:

```bash
npm run test:classroom-smoke:raw
```

`npm run test:shop` currently checks:

1. Shop item IDs are unique.
2. Cosmetic shop entries have matching style handlers.
3. Inventory shop entries use a known game prefix that maps to a real game file.
4. Game metadata uses real emoji values (no placeholder corruption).
5. Badge metadata uses real icon values (no placeholder corruption).
6. Entitlement gate helpers correctly map premium IDs and lock/unlock behavior.
7. Premium challenge track gating/progress logic is deterministic for free and entitled users.
8. KPI metrics helpers sanitize and summarize retention/conversion events deterministically.
9. KPI export script emits deterministic snapshot metadata, rolling window fields, and event-count integrity checks.
10. Stripe admin-token auth helper validates header/bearer token parsing and authorization outcomes.
11. Stripe reconcile-audit helper functions parse target inputs and classify outcomes deterministically.

`npm run test:feedback` currently checks:

1. Feedback admin-token auth helper validates header/bearer token parsing and authorization outcomes.
2. `linear/labels.md` and `linear/game-issues.csv` are not stale relative to `src/meta/feedback.js`.
3. Every game listed in `src/meta/feedback.js` mounts the shared feedback widget.
4. Linear label and baseline-issue seed files stay aligned with feedback metadata.
5. Public feedback submit normalizes payloads, captures sessions, stores attachments, and enforces rate limiting.
6. Linear sync retry/admin agent-brief flows behave deterministically with stubbed GraphQL responses.

`npm run test:classroom-smoke` currently checks:

1. Classroom lock/unlock behavior across home and shop pages.
2. Teacher dashboard PIN enforcement for active-session settings changes and session end.
3. Teacher one-click preset application and persisted whitelist updates.
4. Auto-expired session behavior (class-ended messaging + automatic lock removal across home/shop).

`npm run test:discovery-smoke:raw` currently checks:

1. Home game search and non-coin filter behavior.
2. Home game economy tag rendering.
3. Shop filtering by game tag plus text search.

`npm run test:missions-smoke:raw` currently checks:

1. Daily mission panel renders active missions on home.
2. Mission progress updates through `window.maybeUnlock(...)` and persists.
3. Mission rewards increase coins and award mission badges with no console errors.

`npm run test:weekly-smoke:raw` currently checks:

1. Weekly challenge panel renders active weekly tasks on home.
2. Weekly challenge progress updates through `window.maybeUnlock(...)` and persists.
3. Weekly rewards and badges are awarded with clean console output.

`npm run test:assignment-smoke:raw` currently checks:

1. Teacher page can save a classroom assignment bundle in local classroom state.
2. Home page shows the active assignment progress banner for students.
3. Assignment completion writes completion timestamps and report entries to local classroom report data.

`npm run test:entitlements-smoke:raw` currently checks:

1. Free tier shop shows premium tags plus locked premium purchase controls.
2. Enabling local `familyPremium` entitlement removes premium lock controls.
3. Shop summary/notice reflects the current entitlement tier without network calls.

`npm run test:pricing-smoke:raw` currently checks:

1. Pricing page renders monthly and annual plan cards.
2. Starting checkout creates a persisted pending checkout token and plan selection.
3. Completing checkout activates local `familyPremium` entitlement and active status.

`npm run test:premium-track-smoke:raw` currently checks:

1. Free tier users see a locked premium challenge panel with upgrade CTA.
2. Entitled users see active premium challenge cards with completion/progress metadata.
3. Premium track rendering path executes with no console errors.

`npm run test:school-license-smoke:raw` currently checks:

1. School license page renders clear plan cards and district review form.
2. Submitting a request stores a pending review payload with request ID handoff data.
3. Activating a request enables `schoolLicense` and unlocks licensed teacher snapshot tools.

`npm run test:report-smoke:raw` currently checks:

1. Teacher report tools unlock only when school license entitlement is active.
2. Generated aggregate report includes total sessions, top games, and assignment completion counts.
3. CSV export and print-to-PDF actions execute from the browser report tools path.

`npm run test:policy-gate` currently checks:

1. `RELEASE_CHECKLIST.md` references both `privacy.html` and `school-privacy.html`.
2. `release/policy-signoff.json` contains explicit reviewer/date approval fields.
3. `RELEASE_NOTES.md` includes both `## Risk Register` and `## Rollback Plan` sections.
4. Release-tag validation fails without required policy signoff or tracking/ad risk notes when applicable.

`npm run test:accessibility-smoke:raw` currently checks:

1. Accessibility settings persist from `accessibility.html` into local storage.
2. Home and shop pages apply color profile, larger UI, reduced motion, and high contrast classes consistently.
3. Keyboard discovery interactions work (`/` shortcuts, Tab reachability, skip-link/focus path).

`npm run test:onboarding-smoke:raw` currently checks:

1. Home shows parent and teacher onboarding path cards on fresh state.
2. Parent and teacher path clicks land on role-specific onboarding pages with expected CTAs.
3. Skip/show onboarding state persists and skip mode does not block game-card availability.

`npm run test:metrics-smoke:raw` currently checks:

1. Launcher, pricing, and shop KPI events are recorded for core retention/conversion actions.
2. Checkout and purchase conversion counters are present in the dashboard snapshot.
3. Metrics flow executes with no console errors while preserving gameplay/shop behavior.

`npm run test:feedback-smoke:raw` currently checks:

1. The shared feedback launcher is reachable on representative desktop and mobile game pages.
2. A feedback submission succeeds in loopback stub mode from a game page with no console errors.
3. The ops inbox lists the new report and can generate an agent handoff brief end-to-end.

`npm run test:launch-readiness-smoke:raw` currently checks:

1. Feedback widget/inbox smoke passes.
2. Launcher/shop discovery smoke passes.
3. Classroom mode smoke passes.
4. Entitlement and premium-track gating smokes pass.
5. Onboarding split and KPI metrics baseline smokes pass.

Nightly CI automation:

1. `.github/workflows/nightly-launch-readiness.yml` runs daily at `13:00 UTC` and on manual dispatch.
2. It runs `npm run test:shop`, `npm run test:feedback`, and `npm run test:launch-readiness-smoke`.
3. When `LINEAR_API_KEY` + `LINEAR_TEAM_ID` repository secrets are present, it also runs `npm run feedback:provision-linear` to backfill missing labels/baselines for newly added games.
4. It uploads all smoke summary/screenshot directories for feedback, launcher, classroom, entitlements, premium, onboarding, and metrics baselines.

Daily Linear provisioning automation:

1. `.github/workflows/daily-feedback-provisioning.yml` runs daily at `12:30 UTC` and on manual dispatch.
2. It runs `npm run feedback:check-daily` before provisioning, so stale feedback metadata artifacts fail fast.
3. It then runs `npm run feedback:provision-linear` with the repository secrets to create any missing labels or per-game baseline issues even if no player has submitted feedback yet.

Slack automation notifications:

1. Both GitHub workflows post to Slack through `scripts/ci/send-slack-notification.mjs`.
2. Add the GitHub Actions secret `SLACK_CI_WEBHOOK_URL` with a Slack Incoming Webhook for your ops channel.
3. Notifications default to failures/cancellations only, which keeps the channel useful instead of noisy.
4. If you also want green runs posted, add the GitHub repository variable `SLACK_NOTIFY_SUCCESS=true`.

## Daily Game Ship Checklist

1. Add the new game page and register it in `src/meta/games.js`.
2. Mount `mountGameFeedback({ gameSlug, gameName })` on the new game route.
3. Run `npm run feedback:sync-linear`.
4. Run `npm run test:feedback`.
5. If the gameplay shell or feedback surface changed, run `npm run test:feedback-smoke:raw`.
6. Confirm the game baseline issue exists in Linear, or let the daily provisioning workflow backfill it.
7. Watch the Slack CI channel for any failed `Nightly Launch Readiness` or `Daily Feedback Provisioning` alerts after the merge.

## Feedback workflow

- Players can submit bugs, ideas, and general feedback from the shared widget mounted inside each game page.
- `POST /api/feedback/submit` stores the raw submission first, then attempts to open a Linear issue using `LINEAR_API_KEY` + `LINEAR_TEAM_ID`.
- Submissions can include up to two lightweight attachments in v1. Text files are previewed in the inbox; image and PDF uploads are linked from both the ops inbox and the Linear issue body.
- Admin review happens in `ops/feedback/index.html`, which uses the protected `/api/feedback/admin/*` endpoints.
- On local loopback hosts (`localhost` / `127.0.0.1`), the feedback client falls back to local stub storage unless `?feedbackApiProbe=1` is present. This keeps raw smoke coverage deterministic under a plain static server.
- `linear/labels.md` and `linear/game-issues.csv` are generated from `src/meta/feedback.js`.
- `npm run feedback:check-daily` fails fast when those generated Linear seed artifacts drift from the game registry. That guard also runs automatically inside `npm run test:feedback`.
- `npm run feedback:sync-linear` now regenerates those files and, when `LINEAR_API_KEY` + `LINEAR_TEAM_ID` are present, also provisions missing Linear labels and baseline issues automatically.
- `npm run feedback:provision-linear` runs the live provisioning step directly.
- If `LINEAR_PROJECT_ID` is configured, new games can get their baseline issue provisioned automatically before the first player report lands.
- If the API key cannot create labels, baseline issue creation still works best-effort, but new per-game labels may need a one-time manual seed or a stronger key.
- GitHub workflow alerts can also be sent to Slack with `SLACK_CI_WEBHOOK_URL`.

## Stripe billing setup (optional)

Stripe integration is scaffolded with serverless endpoints under `api/stripe/*` and signed app-session bootstrap under `api/auth/*`.

- `GET /api/auth/session` creates/returns a signed app user session (`cade_session`) used for billing binding.
- `GET /api/stripe/config` returns Stripe availability and bootstraps session context when billing is enabled.
- `POST /api/stripe/create-checkout-session` creates a Stripe Checkout subscription session bound to the current app session user.
- `POST /api/stripe/create-portal-session` opens Stripe Customer Portal for the session-bound customer.
- `GET /api/stripe/subscription-status` returns durable entitlement snapshot for the current app session user.
- `POST /api/stripe/webhook` validates webhook signatures and persists subscription lifecycle updates to durable billing records.
- `POST /api/stripe/admin/reconcile` (admin-token protected) reconciles durable entitlement state from live Stripe subscriptions for a specific user/customer.
- `npm run stripe:reconcile-audit` runs bulk reconcile/audit over user/customer ID lists and writes summary JSON.

Required environment variables (set in Vercel project settings):

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_FAMILY_MONTHLY`
- `STRIPE_PRICE_FAMILY_ANNUAL`
- `APP_SESSION_SECRET` (HMAC secret for signed session cookie)
- `STRIPE_ADMIN_TOKEN` (required to use `/api/stripe/admin/reconcile`)

Optional environment variables:

- `STRIPE_PRICE_SCHOOL_MONTHLY`
- `STRIPE_PRICE_SCHOOL_ANNUAL`
- `STRIPE_BILLING_PORTAL_ENABLED` (`true` by default, set `false` to disable portal endpoint)
- `STRIPE_AUTOMATIC_TAX_ENABLED` (`true` to enable Stripe automatic tax in Checkout sessions)
- `APP_BASE_URL` (used for return URL origin when request-derived host is unavailable)
- `STRIPE_WEBHOOK_FORWARD_URL` (optional internal endpoint to forward compact event metadata)
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` (recommended durable Stripe entitlement store; without these, endpoints fall back to process memory for local/dev)

Frontend behavior:

- `pricing.html` auto-detects Stripe availability from `/api/stripe/config`.
- If Stripe is configured, pricing switches to secure Checkout + Customer Portal mode.
- `shop.html` and `teacher/index.html` periodically sync entitlement state from `/api/stripe/subscription-status` when Stripe billing is enabled.
- If Stripe is not configured, pricing keeps local demo checkout behavior so local QA remains deterministic.
- Incident response playbook: `STRIPE_INCIDENT_RUNBOOK.md`.

Admin reconcile usage example:

```bash
curl -X POST https://<your-domain>/api/stripe/admin/reconcile \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $STRIPE_ADMIN_TOKEN" \
  -d '{"userId":"usr_example","dryRun":true}'
```

## Notes for future updates

- When adding a shop inventory item, ensure the prefix maps to a game file in `tests/shop-items.integration.test.mjs`.
- When adding a new game, update `src/meta/games.js`, mount the feedback widget, run `npm run feedback:sync-linear`, and let `npm run test:feedback` confirm the seed artifacts stayed current.
- Bump `version.json` before release if user-visible behavior changed.
