# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A static browser arcade ("AI and Sons Games" / cade-games-arcade) deployed to Vercel with no build step or framework. ~126 games, each a self-contained folder with an `index.html`. Around the games sits a meta-layer: coin economy, cosmetics shop, daily/weekly missions, achievements, classroom mode for teachers, family/school premium subscriptions (Stripe), Firebase Google auth, and a feedback pipeline wired to Slack and Linear.

## Commands

There is no build, lint, or bundler. Serve the repo root statically for local dev:

```sh
python -m http.server 4173   # smoke tests expect http://127.0.0.1:4173
```

Tests use `node:test` (no framework):

```sh
npm run test:qa                  # main suite: test:shop + test:feedback + test:social + test:classroom-smoke
npm run test:shop                # billing/entitlements/stripe/metrics integration tests
npm run test:feedback            # feedback API/Slack/Linear + auth session tests
npm run test:social              # scores/challenges/rooms/cloud-save API tests
node --test tests/<file>.test.mjs   # run a single test file
```

Smoke tests (Playwright-driven, in `scripts/qa/`):
- `npm run test:classroom-smoke` and `npm run test:launch-readiness-smoke` spawn their own Python server.
- `test:*-smoke:raw` variants require a server already running on port 4173.
- Results are written to `output/web-game/<run-name>/` (state JSON, screenshots). Everything under `output/` is QA artifacts, not app code.

Go servers:

```sh
cd v2-server && go test ./...          # audioagar multiplayer backend (also: npm run test:audioagar:server)
cd clubpenguin-world && go test ./...  # Club Penguin World server (has its own go.mod, Dockerfile, DEPLOY.md)
```

Other:

```sh
npm run seo                  # regenerate sitemap + inject SEO meta (run after adding a game)
npm run og                   # render social/OG card PNGs into assets/og/<slug>.png (run after adding a game; needs `npx playwright install chromium`)
npm run game:preflight       # validate the daily add-a-game drop (registry/folder/discovery/OG/sitemap wiring) before committing to main
npm run marketing:clips      # capture bot-driven gameplay clips into output/marketing/ (Playwright; ffmpeg optional for mp4 exports)
npm run test:policy-gate     # release gate; requires approval in release/policy-signoff.json
npm run firebase:deploy:rules  # deploy firestore.rules + storage.rules
```

## Release process

See `RELEASE_CHECKLIST.md`: before tagging, review `privacy.html` / `school-privacy.html`, update `release/policy-signoff.json`, and pass `npm run test:policy-gate`. Bump `version.json` for user-visible changes (homepage fetches it for the version badge). CI workflows in `.github/workflows/` run the classroom smoke, nightly billing reconcile, nightly launch readiness, daily feedback provisioning, and the policy release gate. `main-qa.yml` runs the fast unit/integration suites plus `npm run game:preflight` on every push to main (the repo ships by committing directly to main, so this is the primary safety net).

## Architecture

### Adding or changing a game touches multiple files

1. `<slug>/index.html` — the game itself (self-contained HTML/JS/CSS).
2. `src/meta/games.js` — the `GAMES` registry array. This drives the homepage grid, discovery/search, missions, and reporting. Flags: `earnsCoins`, `scoreHint`, `category` (e.g. `'audio-only-blind-accessible'`), `accessibilityTags`.
3. `vercel.json` — **no per-game edits needed.** A generic `/:slug/index.html` header rule already applies no-cache to every game shell (the global default is 1-hour caching), and Vercel serves `/slug` from the folder's `index.html` automatically. Only touch `vercel.json` for URL aliases (e.g. `/pingpong` → `/pong`) or non-standard paths.
4. `npm run seo` to regenerate the sitemap, inject SEO meta, and resync the discovery slug allowlist (`api/discovery/_metadata.js`, generated from `GAMES` by `scripts/generate-discovery-metadata.mjs` — never hand-edit its `DISCOVERY_GAME_SLUGS`; the `CURATED_*` lists are editorial and preserved). Then `npm run og` to render the game's share/OG card (without it the new game unfurls with the default banner instead of its own per-game card). Share infra: `src/social/share.js` (share sheet), `card.js` (client score card), `record.js` (canvas clip recorder), and `api/share.js` (`/challenge/:id`, `/race/:code`, `/g/:slug` OG landing pages). `npm run test:social` guards that the allowlist stays in sync.

### Shared client modules (`src/`)

Games import these as ES modules with relative paths (e.g. `../src/core/state.js`):

- `src/core/` — `storage.js` (localStorage under namespace `cadegames:v1`), `state.js` (profile, coins, classroom mode config, missions state — the central normalized state shape), `entitlements.js` (familyPremium / schoolLicense flags + premium shop item list), `billing.js` (client for `/api/stripe/*`, plan IDs `family-monthly|family-annual|school-monthly|school-annual`), `metrics.js`, `accessibility.js`, `onboarding.js`, `sfx.js`.
- `src/prog/` — progression: `missions.js` (daily/weekly), `achievements.js`, `cosmetics.js`, `assignments.js` (teacher assignment bundles), `premium-challenges.js`.
- `src/meta/` — `games.js` registry, `feedback.js`.
- `src/auth/` + `src/feedback/` — `client.js`/`embed.js` pairs; the embeds are drop-in widgets games include.
- `src/social/` — `client.js` (player identity + `/api/social` wrappers), `embed.js` (game-over widget: games call `initSocial({slug})` once and `reportScore(score)` at game over; handles leaderboard display, `?challenge=` banners, and `?room=` race score posting), `cloudsave.js` (pull/merge/push of coins, badges, inventory, cosmetics, bestScores for signed-in users; merge takes max coins and unions unlocks). Pilot games wired: snake, tetris, flappy, dino, 2048, pacman.
- `src/vendor/firebase/` — vendored Firebase SDK (CSP only allows self + Google domains; no other CDNs).

### Serverless API (`api/`, Vercel functions, CommonJS)

Each top-level function is a router switching on a `route` query param; `vercel.json` rewrites pretty URLs into it:

- `api/billing.js` — `/api/stripe/:route` → checkout session, portal, subscription status, Stripe webhook, family plan invites/members, admin lookup/reconcile. Logic in `api/stripe/_handlers.js`, persistence in `_store.js` / `_family-store.js` (Firebase Admin).
- `api/auth.js` — `/api/auth/:route` → Firebase Google login, session cookie, firebase-config.
- `api/feedback/` — submit/attachment endpoints plus admin list/update and `prepare-agent-task`; integrates Slack (`_slack.js`) and Linear (`_linear.js`). Admin UI at `/ops/feedback/`.
- `api/games/prisoners-dilemma/` — server-authoritative game engine (state, strategies, cookie-signed state); the one game with server logic.
- `api/social.js` — `/api/social/:route` → player identity (server-generated kid-safe handles, HMAC player tokens), score submit, daily/weekly/all-time leaderboards, "beat my score" challenges, join-by-code race rooms (Firestore-polling, no WebSockets), and cloud save sync (`sync-pull`/`sync-push`, Google session required). Store in `api/social/_store.js` falls back to in-memory when Firebase Admin is not configured (local dev/tests).

Files prefixed `_` are internal helpers, not routes.

### Non-static components

- `v2-server/` — Go WebSocket server for Audio Agar (not deployed with the static site).
- `clubpenguin-world/` — Go + Phaser multiplayer social world; static client served at `/clubpenguin-world/public/`, server deployed separately via its Dockerfile.

### Top-level pages

`index.html` (homepage/launcher with search, coins, music, profile), `rooms/` (join-by-code race lobbies), `shop.html` (cosmetics), `pricing.html`, `school-license.html`, `teacher/` (teacher dashboard + classroom report), `teacher-onboarding.html`, `parent-onboarding.html`, `accessibility.html`, `audio-accessibility.html`, `privacy.html`, `school-privacy.html`, `changelog/`, `ops/feedback/`, `ops/billing/`.

### Conventions and gotchas

- Audio-only/blind-accessible games (audioagar, echolabyrinth, beatrail, branchingaudio) set `earnsCoins:false` and carry accessibility tags; keep them screen-reader and keyboard playable.
- Cosmetic shop item IDs are prefixed with the game slug (e.g. `snake-cosmic`); integration tests validate the mapping (`tests/shop-items.integration.test.mjs`).
- Classroom mode (teacher PIN, game whitelist, timed sessions, assignment bundles) lives in `src/core/state.js` defaults — changes to that shape ripple into the teacher dashboard and report generator.
- `LINEAR_ISSUES.md` holds known-issue drafts (e.g. `/shop` clean URL has no rewrite; root `index.html`/`shop.html` lack no-cache overrides).
- CSP in `vercel.json` is strict: scripts only from self + Google. Don't add third-party CDN scripts to pages.
