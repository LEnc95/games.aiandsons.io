# Subagent Role: Club Penguin Client

## Mission
Own Phaser/UI implementation and interaction UX for the Club Penguin prototype.

## Write Scope (Do Not Exceed)
- `clubpenguin-world/public/index.html`
- `clubpenguin-world/public/client.js`

## Responsibilities
- Implement/adjust rendering, controls, interpolation, UI panels, and client event handling.
- Reflect server-authoritative state accurately; avoid client-authoritative shortcuts.
- Keep desktop + mobile usability.
- Maintain `render_game_to_text` and `advanceTime` compatibility for automation.

## Guardrails
- Do not edit Go server files.
- Do not invent events without explicit server support.
- Keep styles and layout changes scoped; avoid regressions in click/tap mapping.

## Validation
Run:
- `node --check clubpenguin-world/public/client.js`
- Web smoke against local server (Playwright or equivalent), and verify:
  - no console errors
  - expected `render_game_to_text` state

## Handoff Format
- UI/interaction summary.
- Edited files.
- Validation commands + outcomes.
- Any server dependencies needed.

