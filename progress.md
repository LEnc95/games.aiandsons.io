Original prompt: Recreate pacman. The game should have multiple levels and all the features one would expect. The controls should work on Mobile and Desktop browsers.

- Initialized Pac-Man implementation task.
- Confirmed project structure uses per-game folders with `index.html` and shared metadata in `src/meta/games.js`.
- Next: add `pacman/index.html`, integrate into game list, and validate with Playwright client + screenshots.

- New request (2026-03-05): Recreate Pokemon.
- Plan: add a new /pokemon game with overworld exploration, random encounters, turn-based battles, capture mechanics, mobile + desktop controls, and deterministic test hooks (ender_game_to_text, dvanceTime).


- Pac-Man implementation completed in `pacman/index.html` with: pellets + power pellets, 4 ghosts with chase/scatter/frightened/eyes states, fruit spawns, lives, score/high score, pause/resume/restart, level progression, game over, and fullscreen toggle (`F`).
- Added deterministic test hooks: `window.advanceTime(ms)` and `window.render_game_to_text()`.
- Added desktop controls (WASD/Arrows, Space/Enter, P, R, F) and mobile controls (onscreen D-pad + swipe gestures).
- Added Pac-Man to game registry: `src/meta/games.js`.
- Added static homepage fallback card for Pac-Man in `index.html`.
- Automated test runs (Playwright client):
  - `output/web-game/pacman-run1` (movement, pause/resume input path, screenshots + state)
  - `output/web-game/pacman-run2` (longer session, ghost release, collisions/life loss)
  - `output/web-game/pacman-run3` (targeted movement path)
- Console/runtime errors from test runs: none.
- TODO for follow-up: add a dedicated automated path that reliably consumes a power pellet and verifies frightened ghost capture in the same scripted run.
- Additional verification (custom Playwright pathfinding script): power pellet consumption confirmed and frightened mode verified with all ghosts entering `frightened` state (`frightened_timer` > 0).
- Built pokemon/index.html: tile-based overworld, starter selection, random wild encounters, trainer/gym battles, capture/run/attack flow, desktop + touch controls, fullscreen toggle, and deterministic hooks (window.render_game_to_text, window.advanceTime).
- Added Pokemon to src/meta/games.js so it appears on the home list.
- Playwright validation completed using $WEB_GAME_CLIENT on http://127.0.0.1:4173/pokemon with captured artifacts in output/pokemon-run1, output/pokemon-run6, and output/pokemon-run7.
- Verified via screenshots + state-*.json: title/start flow, starter selection, overworld movement, rival interaction, turn-based battle, attack resolution, win rewards, and run-blocked trainer behavior.
- Console/page error scan: no errors-*.json emitted across runs.
- Improvement TODOs for next agent: add deterministic wild-encounter test scenario for capture success path and expand party switching (currently single active monster).
- Added deterministic test stability fix: gameplay RAF loop now pauses simulation while window.advanceTime(ms) runs, preventing double-stepping during Playwright virtual-time control.
- Final smoke test run (output/pokemon-run8) after map-tile cleanup confirmed stable startup and starter selection with expected spawn tile state.
- Polish pass started for Pac-Man (no Pokemon changes):
  - Added richer HUD status chips (pellets count, phase label, frightened timer meter) and sound toggle button.
  - Added lightweight WebAudio SFX hooks (chomp/power/ghost/fruit/life/level) with persistent on/off state.
  - Added visual feedback polish: screen shake and floating score popups.
  - Added short respawn invulnerability window after life loss to reduce immediate chain deaths.
  - Extended `render_game_to_text` with `phase_timer` and `invulnerable_timer` for clearer external state.
