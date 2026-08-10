import { rememberRecent } from '../src/core/state.js';
import { reportGameOutcome } from '../src/core/outcomes.js';

const GAME_SLUG = 'baseballradio';

rememberRecent(GAME_SLUG);

window.__CADE_FEEDBACK_CONTEXT__ = () => {
  try {
    return JSON.parse(window.render_game_to_text?.() || '{}');
  } catch {
    return {};
  }
};

window.addEventListener('baseball-radio-game-over', (event) => {
  const detail = event instanceof CustomEvent && event.detail && typeof event.detail === 'object'
    ? event.detail
    : {};
  reportGameOutcome({
    slug: GAME_SLUG,
    result: 'completed',
    durationMs: detail.durationMs,
    metrics: {
      wins: detail.won ? 1 : 0,
      runs: detail.playerRuns,
      opponentRuns: detail.opponentRuns,
      innings: detail.innings,
    },
  });
});
