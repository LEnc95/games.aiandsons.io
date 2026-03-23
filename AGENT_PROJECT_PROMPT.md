# Agent Prompt: Cade's Games Project Guide

You are working in **Cade's Games**, a static web arcade that ships as plain HTML/CSS/JS with no build step.

## 1) Project mission and product shape

- This repo hosts a browser-based mini-game portal with:
  - a **homepage launcher** (`index.html`),
  - a **shop** (`shop.html`) where coins unlock cosmetics/inventory,
  - many standalone game pages under `<game>/index.html`.
- Shared progression (coins, badges, cosmetics, inventory, recent games, profile) is persisted in `localStorage` through `src/core/*`.
- Deployment is static (Vercel rewrites/headers in `vercel.json`).
- Feedback collection uses a shared in-game widget (`src/feedback/*`), serverless APIs under `api/feedback/*`, and an internal review surface at `ops/feedback/index.html`.
- Authenticated accounts use Firebase Auth on the client plus the repo's signed session cookie exchange under `api/auth/*`.

## 2) Core architecture (read this first before editing)

- **Homepage app shell:** `index.html`
  - Renders game cards, recent games, profile + badges modals, topbar coin display, and version badge.
- **Shop app shell:** `shop.html`
  - Defines an inline `items` catalog with cosmetic + inventory unlocks.
  - Purchases consume shared coins and mutate shared ownership state.
- **Shared state/storage:**
  - `src/core/storage.js` -> namespaced `localStorage` get/set/remove helpers.
  - `src/core/state.js` -> canonical state object, migration/normalization, persistence API (`save`, `addCoins`, `spendCoins`, `rememberRecent`).
  - `src/core/sfx.js` -> optional audio with graceful fallback.
- **Progression logic:**
  - `src/prog/achievements.js` -> badge/reward definitions and unlock evaluation (`maybeUnlock`).
  - `src/prog/cosmetics.js` -> runtime style mapping helpers (paddle/snake/mario/memory card back).
- **Game and feedback metadata registry:**
  - `src/meta/games.js` is the central launcher list (slug, name, emoji, route, description).
  - `src/meta/feedback.js` derives feedback coverage, Linear labels, and per-game baseline issue metadata from the game registry.
- **Feedback flow:**
  - `src/feedback/client.js` -> browser-side submission/admin client with loopback stub mode.
  - `src/feedback/embed.js` -> reusable fixed-position widget mounted into each game page.
  - `api/feedback/*` -> public submission endpoint, protected admin endpoints, Firestore/Storage-backed persistence when Firebase is configured, and Linear sync helpers.
- **Account/auth flow:**
  - `src/auth/client.js` -> Firebase web config fetch, Google popup sign-in, and signed app-session refresh helpers.
  - `src/auth/embed.js` -> floating account widget for homepage and commerce pages.
  - `api/auth/*` -> session bootstrap, Firebase config exposure, Google login exchange, and logout.

## 3) Game catalog and route model

Current playable routes are mostly clean routes like `/pong`, `/snake`, etc., mapped by `vercel.json` rewrites to each folder's `index.html`.

Games currently present in the repo include:
- 2048, Pong, Snake, Tic-Tac-Toe, Rock Paper Scissors, Memory, Breakout, Connect 4, Minesweeper, Flappy, Dino, Space Invaders, Frogger, Pocket Mini Golf, Micro Mario, Retro Ski, Home Run Derby, and Micro RC Racer.

Important nuance:
- `src/meta/games.js` is the homepage source of truth for listed cards.
- Some game folders may exist without being wired into all progression systems.
- `src/meta/feedback.js` should stay aligned with the game registry through `npm run feedback:sync-linear`.
- When `LINEAR_API_KEY` + `LINEAR_TEAM_ID` are present, `npm run feedback:sync-linear` also provisions missing Linear labels and baseline issues; `npm run feedback:sync-linear:files` keeps it local-only.
- `npm run feedback:check-daily` is the strict guard that fails when generated Linear seed artifacts drift from repo metadata, and it already runs inside `npm run test:feedback`.

## 4) Progression and data model details

State keys (under namespaced localStorage) include:
- `profile`: `{ name, firstRun }`
- `coins`: integer
- `badges`: array persisted, loaded as `Set`
- `cosmetics`: equipped selections by category
- `cosmeticsOwned`: category -> list of owned values
- `inventory`: persisted as array, loaded as `Set` with backward-compat normalization
- `recent`: recent game slugs (capped to 6)

Agent guidance when adding/modifying progression:
- Use APIs in `src/core/state.js` instead of ad-hoc localStorage writes.
- Keep inventory item IDs stable (used as unlock flags and style toggles in games).
- If you add a cosmetic option, update both:
  1) shop item definition (`shop.html`), and
  2) style mapping switch in `src/prog/cosmetics.js`.
- If a game should unlock rewards, call `maybeUnlock(ctx)` with game-specific metrics.

## 5) Editing workflows (common tasks)

### Add a new game
1. Create `<slug>/index.html` (self-contained game page).
2. Add entry to `src/meta/games.js`.
3. Mount the shared feedback widget with `mountGameFeedback({ gameSlug, gameName })`.
4. Run `npm run feedback:sync-linear` so feedback labels/baseline issues stay aligned and live Linear provisioning runs when env vars are configured.
5. Run `npm run test:feedback` so the strict seed-artifact guard and widget coverage checks fail early if anything drifted.
6. Add rewrites for `/<slug>` and `/<slug>/` in `vercel.json`.
7. Add no-cache header override for the new game HTML in `vercel.json`.
8. If shop inventory should reference this game prefix, update test mapping in `tests/shop-items.integration.test.mjs`.

### Add a new shop item
1. Add item object in `shop.html` `items` array.
2. For cosmetic items, ensure `src/prog/cosmetics.js` supports its `value`.
3. For inventory items, use an `id` prefix that maps to a known game in `tests/shop-items.integration.test.mjs`.
4. Run shop integration tests.

### Add or update feedback flow
1. Keep `src/feedback/*` and `api/feedback/*` behavior aligned.
2. If feedback metadata changes, regenerate `linear/labels.md` and `linear/game-issues.csv` with `npm run feedback:sync-linear` or `npm run feedback:sync-linear:files`.
3. Verify `ops/feedback/index.html` still loads, filters, retries sync, previews attachments, and prepares agent briefs.
4. Run `npm run test:feedback` and `npm run test:feedback-smoke:raw` when the feedback surface changes.

### Add a new achievement/reward
1. Add a definition in `src/prog/achievements.js`.
2. Ensure corresponding game emits `maybeUnlock` with required context fields.
3. Ensure reward IDs/categories align with existing state schema and shop conventions.

## 6) Testing and validation expectations

Primary automated checks:
- `npm run test:shop`
- `npm run test:feedback`

What these tests protect:
- uniqueness of shop item IDs,
- cosmetic item -> style-handler coverage,
- inventory ID prefix -> known game mapping,
- feedback widget coverage across every game,
- feedback API/admin workflow determinism.

Manual smoke checklist after edits:
- homepage loads and cards navigate,
- shop purchase flow updates coins/ownership,
- modified game route loads from clean URL,
- progression persists after refresh,
- feedback submit works from the impacted game,
- `ops/feedback/index.html` can see and prepare the related report when applicable.

## 7) Deployment notes

- App is static; local run can be any static server (`python3 -m http.server 8080`).
- `version.json` stores displayed version badge value for homepage.
- `vercel.json` controls rewrites and cache/security headers.
- Feedback API deployment expects `FEEDBACK_ADMIN_TOKEN`, `LINEAR_API_KEY`, `LINEAR_TEAM_ID`, and optionally `LINEAR_PROJECT_ID` plus `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
- Firebase-backed deployment expects `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID`, and `FIREBASE_MESSAGING_SENDER_ID`.
- Google sign-in still requires the Google provider + authorized domains to be configured in Firebase/Identity Platform for the project `games-aiandsons-io`.
- Automatic baseline provisioning only needs issue-creation access, but automatic label creation may require label-management permission for the configured team/workspace.
- Nightly CI can also run `npm run feedback:provision-linear` when `LINEAR_API_KEY`, `LINEAR_TEAM_ID`, and optional `LINEAR_PROJECT_ID` are configured as repository secrets.
- `.github/workflows/daily-feedback-provisioning.yml` exists as the lightweight daily backfill path for missing Linear labels and baseline issues.
- GitHub workflow alerts can be forwarded to Slack with the `SLACK_CI_WEBHOOK_URL` Actions secret; success notifications remain opt-in through `SLACK_NOTIFY_SUCCESS=true`.
- Production feedback sync failures can also alert Slack when the runtime environment exposes `SLACK_FEEDBACK_WEBHOOK_URL`.
- On loopback hosts, the browser feedback client intentionally falls back to stub mode unless `?feedbackApiProbe=1` is present.

## 8) Known pitfalls to avoid

- Forgetting route rewrites in `vercel.json` after adding a game.
- Adding cosmetic shop items without updating `src/prog/cosmetics.js` switch cases.
- Using new inventory prefixes without updating test mapping.
- Adding a game without mounting the shared feedback widget, running `npm run feedback:sync-linear`, or checking `npm run test:feedback`.
- Updating only UI text but not progression/state logic (or vice versa).

## 9) Practical coding style in this repo

- Prefer lightweight, dependency-free JS.
- Keep pages self-contained when editing game-specific logic.
- Reuse shared core/progression modules when possible.
- Preserve mobile/touch affordances already used across pages.

## 10) Agent operating prompt (copy/paste)

Use this instruction block when assigning a task to another coding agent:

> You are modifying the Cade's Games static arcade repo. Before coding, inspect `index.html`, `shop.html`, `src/core/*`, `src/prog/*`, `src/meta/games.js`, `src/meta/feedback.js`, `src/feedback/*`, `api/feedback/*`, and `vercel.json` for impacted flows. Keep changes minimal and consistent with existing vanilla HTML/CSS/JS patterns. If you add/rename game routes, update rewrites and cache headers in `vercel.json`. If you add a game, mount the shared feedback widget, run `npm run feedback:sync-linear`, and then run `npm run test:feedback` so stale seed artifacts are caught. If you add shop cosmetics, also update `src/prog/cosmetics.js`. If you add shop inventory prefixes, ensure `tests/shop-items.integration.test.mjs` maps them to real game files. Run `npm run test:shop` and `npm run test:feedback` before finishing. Summarize what changed, why, and any follow-up risks. Call out if live Linear provisioning was skipped because env vars or label-management permissions were unavailable.
