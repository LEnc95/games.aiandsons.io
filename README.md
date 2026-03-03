# Cade's Games

A static browser arcade site with a homepage launcher, coin/profile progression, achievements, and a shop for cosmetics/inventory unlocks.

## What this repository contains

- `index.html`: homepage hub with launcher cards, profile modal, badges modal, recent games, and version badge.
- `shop.html`: in-app shop to spend coins on cosmetics and inventory unlocks.
- `src/core/*`: shared persistence/state helpers.
- `src/meta/games.js`: game registry used by homepage UI.
- `src/prog/*`: achievements and cosmetics logic.
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

This test currently checks:

1. Shop item IDs are unique.
2. Cosmetic shop entries have matching style handlers.
3. Inventory shop entries use a known game prefix that maps to a real game file.

## Notes for future updates

- When adding a shop inventory item, ensure the prefix maps to a game file in `tests/shop-items.integration.test.mjs`.
- When adding a new game, update both `src/meta/games.js` and homepage/static links.
- Bump `version.json` before release if user-visible behavior changed.
