# Cade's Games

[![Nightly Launch Readiness](https://github.com/LEnc95/games.aiandsons.io/actions/workflows/nightly-launch-readiness.yml/badge.svg)](https://github.com/LEnc95/games.aiandsons.io/actions/workflows/nightly-launch-readiness.yml)
[![Daily Feedback Provisioning](https://github.com/LEnc95/games.aiandsons.io/actions/workflows/daily-feedback-provisioning.yml/badge.svg)](https://github.com/LEnc95/games.aiandsons.io/actions/workflows/daily-feedback-provisioning.yml)

Static browser arcade platform with:

- Home launcher, discovery, progression, and profile state
- Shop + premium entitlements
- Classroom mode + teacher dashboard + assignment/report tools
- Player feedback widget + ops inbox + Linear provisioning
- Firebase-backed auth/storage/state and optional Stripe billing

## Repository overview

- `index.html`: launcher, missions/challenges, profile, progression surfaces.
- `shop.html`: cosmetics/inventory/premium-gated shop.
- `teacher/index.html`: classroom controls, assignment bundles, report tools.
- `pricing.html`: family plan billing UI.
- `school-license.html`: school/district licensing flow.
- `ops/feedback/index.html`: feedback inbox and admin actions.
- `src/meta/games.js`: source of truth for game catalog.
- `src/meta/feedback.js`: feedback/Linear metadata mapped from game catalog.
- `src/discovery/rankings.js`: client helpers for launch telemetry and ranked discovery rows.
- `src/auth/*`: Firebase client account helpers + floating account widget.
- `api/auth/*`: app session bootstrap + Google login exchange/logout.
- `api/discovery/*`: discovery ranking handlers, storage, and generated metadata used by `api/social.js`.
- `api/feedback/*`: feedback submit/admin/attachments APIs.
- `api/stripe/*`: Stripe checkout, portal, status, webhook, and reconcile routes.
- `scripts/qa/*`: smoke coverage for classroom, discovery, feedback, pricing, entitlement, onboarding, and launch-readiness flows.

## Game catalog

The catalog is maintained in `src/meta/games.js`. Use that file as the source of truth for game names,
routes, categories, search metadata, coin eligibility, score hints, and accessibility tags. To inspect
the current count without adding a stale number to docs:

```bash
node --input-type=module -e "import { GAMES } from './src/meta/games.js'; console.log(GAMES.length)"
```

When adding or changing a game, keep these generated artifacts in sync:

- `api/discovery/_metadata.js`: server-side discovery slug allowlist. `DISCOVERY_GAME_SLUGS` is generated
  from `GAMES`; do not edit it by hand. The `CURATED_TRENDING_SLUGS` and `CURATED_TOP_PLAYED_SLUGS`
  lists are editorial and are preserved by the generator.
- `sitemap.xml` and injected SEO blocks in game pages.
- `assets/og/<slug>.png`: share/Open Graph card for each game.
- `linear/labels.md` and `linear/game-issues.csv`: generated feedback/Linear seed files from
  `src/meta/feedback.js`.

Useful commands:

```bash
npm run seo                  # sitemap + SEO injection + discovery metadata
npm run discovery:meta       # discovery metadata only
npm run og                   # per-game OG cards
npm run feedback:sync-linear # generated Linear seeds + live provisioning when envs are present
npm run feedback:sync-linear:files # generated Linear seeds only
npm run game:preflight       # registry/folder/discovery/OG/sitemap/cache-header guard
```

Common preflight failures:

| Failure | Fix |
| --- | --- |
| `registry entries without a game folder` | Create `<slug>/index.html` or correct the `url` in `src/meta/games.js`. |
| `game folders not in the registry` | Add the folder to `src/meta/games.js`, then run `npm run seo`. |
| `api/discovery/_metadata.js is out of sync` | Run `npm run seo` or `npm run discovery:meta`. |
| `games missing assets/og/<slug>.png` | Run `npm run og` after installing Playwright Chromium if needed. |
| `sitemap.xml missing routes` | Run `npm run seo`. |
| `vercel.json lost the generic /:slug + /:slug/ no-cache header rules` | Restore the clean-URL no-cache headers before shipping. |

Normal one-folder games do not need new `vercel.json` rewrites or headers. Add rewrites only for aliases
or non-standard paths, such as `/pingpong` pointing at `/pong`.

## Discovery launch telemetry and rankings

The homepage combines local catalog metadata with ranked discovery rows:

1. `index.html` imports `GAMES` and `src/discovery/rankings.js`.
2. Game tile clicks call `sendDiscoveryLaunchEvent({ slug, source })`, which sends a non-blocking
   `POST /api/discovery/events` using `sendBeacon` when available and falls back to `fetch(..., keepalive)`.
3. `loadDiscoveryRankings()` fetches `GET /api/discovery/rankings`, normalizes duplicate or malformed
   rank items, and caches the payload in namespaced local storage for up to three minutes.
4. On the raw static smoke server (`127.0.0.1:4173`), the client skips discovery ranking fetches because
   Python's static server cannot serve the serverless API routes.

Public discovery API URLs are rewired through `api/social.js`:

- `/api/discovery/events` -> `api/social?route=discovery-events`
- `/api/discovery/rankings` -> `api/social?route=discovery-rankings`

That consolidation keeps Vercel function entrypoints within the Hobby plan limit. The handlers live in
`api/discovery/_handlers.js`, validate methods and payloads, and delegate storage to `api/discovery/_store.js`.
When Firebase Admin is configured, launches are counted in Firestore collections
`discoveryGameAggregates` and `discoveryDailyLaunches`. Tests and previews fall back to in-memory counts,
and empty or failed backends fall back to the curated lists from `api/discovery/_metadata.js`.

Coverage map:

- `tests/unit/discovery-rankings.test.mjs`: client normalization, cache TTL, static-server skip, event send.
- `tests/discovery-api.integration.test.mjs`: API methods, payload validation, memory fallback, Vercel rewrites,
  and function-entrypoint budget.
- `tests/discovery-metadata-sync.test.mjs`: generated discovery slug allowlist and curated slug validity.
- `npm run test:discovery-smoke:raw`: homepage discovery/search and shop filtering against a static server.

## Quick start

1. Install dependencies:

```bash
npm install
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
- `npm run discovery:meta`
- `npm run og`
- `npm run game:preflight`

Integration and QA:

- `npm run test:shop`
- `npm run test:feedback`
- `npm run test:social`
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

## Firebase backend

Provisioned resources:

- Project: `games-aiandsons-io`
- Firestore database: `(default)` in `nam5`
- Storage bucket: `games-aiandsons-io-storage`

Tracked Firebase config files:

- `.firebaserc`
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `storage.rules`

Required Vercel env vars:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_WEB_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_APP_ID`
- `FIREBASE_MESSAGING_SENDER_ID`

Optional credential formats:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`

Google sign-in still requires provider setup and authorized domains in Firebase/Google Cloud.

## Stripe billing (optional)

Key routes:

- `GET /api/auth/session`
- `GET /api/stripe/config`
- `POST /api/stripe/create-checkout-session`
- `POST /api/stripe/create-portal-session`
- `GET /api/stripe/subscription-status`
- `POST /api/stripe/webhook`
- `POST /api/stripe/admin/reconcile`

Required env vars:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_FAMILY_MONTHLY`
- `STRIPE_PRICE_FAMILY_ANNUAL`
- `APP_SESSION_SECRET`
- `STRIPE_ADMIN_TOKEN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`

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

1. Add `<slug>/index.html` and a matching `src/meta/games.js` entry.
2. Mount `mountGameFeedback({ gameSlug, gameName })` from the shared feedback embed.
3. Run `npm run seo` to refresh sitemap, SEO metadata, and discovery metadata.
4. Run `npm run og` so `/g/:slug` and shared links have a game-specific card.
5. Run `npm run feedback:sync-linear` or `npm run feedback:sync-linear:files` to refresh Linear seed artifacts.
6. Run `npm run game:preflight`.
7. Run `npm run test:feedback` and `npm run test:social`.
8. Run `npm run test:feedback-smoke:raw` when the game shell or feedback surface changed.
9. Confirm Linear baseline issue coverage or let daily provisioning backfill it.

