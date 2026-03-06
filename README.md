# Cade's Games

A static browser arcade site with a homepage launcher, coin/profile progression, achievements, and a shop for cosmetics/inventory unlocks.

## What this repository contains

- `index.html`: homepage hub with launcher cards, search/filter controls, daily/weekly progression panels, coin-earning tags, profile modal, badges modal, recent games, and version badge.
- `shop.html`: in-app shop with game-tagged items, text/game filtering, and cosmetics/inventory unlocks.
- `teacher/index.html`: classroom dashboard for session controls, whitelist presets, and PIN-gated active-session mutations.
- `src/core/*`: shared persistence/state helpers.
- `src/meta/games.js`: game registry used by homepage UI.
- `src/prog/*`: achievements, daily missions, and cosmetics logic.
- `*/index.html` game folders: standalone game pages.
- `tests/shop-items.integration.test.mjs`: integration check that validates shop item consistency.

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
node --test tests/shop-items.integration.test.mjs
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

If you already have a local server running at `http://127.0.0.1:4173`, run the raw script directly:

```bash
npm run test:classroom-smoke:raw
```

`npm run test:shop` currently checks:

1. Shop item IDs are unique.
2. Cosmetic shop entries have matching style handlers.
3. Inventory shop entries use a known game prefix that maps to a real game file.

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

## Notes for future updates

- When adding a shop inventory item, ensure the prefix maps to a game file in `tests/shop-items.integration.test.mjs`.
- When adding a new game, update both `src/meta/games.js` and homepage/static links.
- Bump `version.json` before release if user-visible behavior changed.
