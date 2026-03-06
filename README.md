# Cade's Games

A static browser arcade site with a homepage launcher, coin/profile progression, achievements, and a shop for cosmetics/inventory unlocks.

## What this repository contains

- `index.html`: homepage hub with launcher cards, search/filter controls, daily/weekly progression panels, coin-earning tags, profile modal, badges modal, recent games, and version badge.
- `shop.html`: in-app shop with game-tagged items, text/game filtering, cosmetics/inventory unlocks, and premium entitlement gates.
- `pricing.html`: family monthly/annual plans page with local checkout intent flow.
- `school-license.html`: school/district licensing page with local district-review request handoff flow.
- `accessibility.html`: persisted accessibility control panel for color profile, larger UI, reduced motion, and contrast preferences.
- `teacher/index.html`: classroom dashboard for session controls, whitelist presets, assignment bundles, PIN-gated active-session mutations, and licensed aggregate report exports.
- `src/core/*`: shared persistence/state helpers, entitlement gate logic, and accessibility preference helpers.
- `src/meta/games.js`: game registry used by homepage UI.
- `src/prog/*`: achievements, daily/weekly missions, premium challenge track, assignment bundles, and cosmetics logic.
- `*/index.html` game folders: standalone game pages.
- `tests/shop-items.integration.test.mjs` + `tests/entitlements.integration.test.mjs` + `tests/premium-challenges.integration.test.mjs`: integration checks for shop consistency, premium gating, and premium challenge progression logic.

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
node --test tests/shop-items.integration.test.mjs tests/entitlements.integration.test.mjs tests/premium-challenges.integration.test.mjs
```

Or via npm script:

```bash
npm run test:shop
```

Run the classroom lock/unlock smoke test (auto-starts local server):

```bash
npm run test:classroom-smoke
```

Run the discovery/search + shop filter smoke test against a pre-started server at `http://127.0.0.1:4173`:

```bash
npm run test:discovery-smoke:raw
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
3. Release-tag validation fails without required policy signoff or tracking/ad risk notes when applicable.

`npm run test:accessibility-smoke:raw` currently checks:

1. Accessibility settings persist from `accessibility.html` into local storage.
2. Home and shop pages apply color profile, larger UI, reduced motion, and high contrast classes consistently.
3. Keyboard discovery interactions work (`/` shortcuts, Tab reachability, skip-link/focus path).

`npm run test:onboarding-smoke:raw` currently checks:

1. Home shows parent and teacher onboarding path cards on fresh state.
2. Parent and teacher path clicks land on role-specific onboarding pages with expected CTAs.
3. Skip/show onboarding state persists and skip mode does not block game-card availability.

## Notes for future updates

- When adding a shop inventory item, ensure the prefix maps to a game file in `tests/shop-items.integration.test.mjs`.
- When adding a new game, update both `src/meta/games.js` and homepage/static links.
- Bump `version.json` before release if user-visible behavior changed.
