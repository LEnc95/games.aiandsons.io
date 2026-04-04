// @ts-check

const { normalizeAction } = require("./_engine");
const { getStrategy } = require("./_strategies");

/**
 * @typedef {"cooperate" | "defect"} PrisonerAction
 */

/**
 * @typedef {"mutual-cooperation" | "player-exploits" | "opponent-exploits" | "mutual-defection"} RoundClassification
 */

/**
 * @typedef {Object} RoundRecord
 * @property {number} roundNumber
 * @property {PrisonerAction} playerAction
 * @property {PrisonerAction} opponentAction
 * @property {number} playerDelta
 * @property {number} opponentDelta
 * @property {RoundClassification} classification
 */

/**
 * @typedef {Object} GameState
 * @property {number} version
 * @property {string} strategyId
 * @property {number} roundLimit
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {ReadonlyArray<RoundRecord>} rounds
 */

const STATE_VERSION = 1;

function toTimestamp(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.floor(parsed));
}

function clampRoundLimit(value, maxRoundLimit, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(maxRoundLimit, Math.max(2, parsed));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

/**
 * @param {{ strategyId: string, roundLimit: number, now?: number }} options
 * @returns {Readonly<GameState>}
 */
function createInitialGameState({ strategyId, roundLimit, now = Date.now() }) {
  getStrategy(strategyId);
  return deepFreeze({
    version: STATE_VERSION,
    strategyId,
    roundLimit: Math.max(2, Math.floor(roundLimit)),
    createdAt: toTimestamp(now, Date.now()),
    updatedAt: toTimestamp(now, Date.now()),
    rounds: [],
  });
}

/**
 * @param {unknown} rawState
 * @param {{
 *   config: { defaultStrategyId: string, defaultRoundLimit: number, maxRoundLimit: number },
 *   engine: { resolveRound(playerAction: PrisonerAction, opponentAction: PrisonerAction): RoundRecord },
 * }} options
 * @returns {Readonly<GameState>}
 */
function normalizeGameState(rawState, { config, engine }) {
  const source = rawState && typeof rawState === "object" ? rawState : {};
  const strategyIdCandidate = typeof source.strategyId === "string" ? source.strategyId.trim() : "";
  const strategyId = strategyIdCandidate || config.defaultStrategyId;
  getStrategy(strategyId);

  const roundLimit = clampRoundLimit(source.roundLimit, config.maxRoundLimit, config.defaultRoundLimit);
  const createdAt = toTimestamp(source.createdAt, Date.now());
  const updatedAt = toTimestamp(source.updatedAt, createdAt);
  const rawRounds = Array.isArray(source.rounds) ? source.rounds.slice(0, roundLimit) : [];

  /** @type {RoundRecord[]} */
  const rounds = [];
  for (const rawRound of rawRounds) {
    if (!rawRound || typeof rawRound !== "object") {
      continue;
    }

    try {
      const resolvedRound = engine.resolveRound(
        normalizeAction(rawRound.playerAction),
        normalizeAction(rawRound.opponentAction),
      );
      rounds.push({
        roundNumber: rounds.length + 1,
        playerAction: resolvedRound.playerAction,
        opponentAction: resolvedRound.opponentAction,
        playerDelta: resolvedRound.playerDelta,
        opponentDelta: resolvedRound.opponentDelta,
        classification: resolvedRound.classification,
      });
    } catch {
      continue;
    }
  }

  return deepFreeze({
    version: STATE_VERSION,
    strategyId,
    roundLimit,
    createdAt,
    updatedAt,
    rounds,
  });
}

/**
 * @param {Readonly<GameState>} state
 * @param {{
 *   playerAction: PrisonerAction,
 *   opponentAction: PrisonerAction,
 *   engine: { resolveRound(playerAction: PrisonerAction, opponentAction: PrisonerAction): RoundRecord },
 *   now?: number,
 * }} options
 * @returns {Readonly<GameState>}
 */
function appendRound(state, { playerAction, opponentAction, engine, now = Date.now() }) {
  if (state.rounds.length >= state.roundLimit) {
    throw new Error("Match is already complete.");
  }

  const resolvedRound = engine.resolveRound(playerAction, opponentAction);
  const nextRound = {
    roundNumber: state.rounds.length + 1,
    playerAction: resolvedRound.playerAction,
    opponentAction: resolvedRound.opponentAction,
    playerDelta: resolvedRound.playerDelta,
    opponentDelta: resolvedRound.opponentDelta,
    classification: resolvedRound.classification,
  };

  return deepFreeze({
    version: STATE_VERSION,
    strategyId: state.strategyId,
    roundLimit: state.roundLimit,
    createdAt: state.createdAt,
    updatedAt: toTimestamp(now, Date.now()),
    rounds: [...state.rounds, nextRound],
  });
}

function determineLeader(playerTotal, opponentTotal) {
  if (playerTotal === opponentTotal) {
    return "tie";
  }
  return playerTotal > opponentTotal ? "player" : "opponent";
}

/**
 * @param {Readonly<GameState>} state
 * @param {{
 *   config: { payoffMatrix: Record<string, number> },
 *   strategies: ReadonlyArray<{ id: string, name: string, description: string }>,
 *   engine: { summarizeRounds(rounds: ReadonlyArray<RoundRecord>): { playerTotal: number, opponentTotal: number, classifications: Record<string, number> } },
 * }} options
 */
function buildPublicSnapshot(state, { config, strategies, engine }) {
  const summary = engine.summarizeRounds(state.rounds);
  const roundsPlayed = state.rounds.length;
  const remainingRounds = Math.max(0, state.roundLimit - roundsPlayed);
  const status = remainingRounds === 0 ? "completed" : "active";
  const strategy = strategies.find((entry) => entry.id === state.strategyId) || {
    id: state.strategyId,
    name: state.strategyId,
    description: "",
  };
  const leader = determineLeader(summary.playerTotal, summary.opponentTotal);

  return deepFreeze({
    strategy,
    roundLimit: state.roundLimit,
    roundsPlayed,
    nextRoundNumber: Math.min(state.roundLimit, roundsPlayed + 1),
    remainingRounds,
    status,
    leader,
    totals: {
      player: summary.playerTotal,
      opponent: summary.opponentTotal,
      spread: summary.playerTotal - summary.opponentTotal,
    },
    outcomes: {
      mutualCooperation: summary.classifications["mutual-cooperation"] || 0,
      playerExploits: summary.classifications["player-exploits"] || 0,
      opponentExploits: summary.classifications["opponent-exploits"] || 0,
      mutualDefection: summary.classifications["mutual-defection"] || 0,
    },
    lastRound: state.rounds[state.rounds.length - 1] || null,
    history: state.rounds,
    matrix: {
      temptation: config.payoffMatrix.temptation,
      reward: config.payoffMatrix.reward,
      punishment: config.payoffMatrix.punishment,
      sucker: config.payoffMatrix.sucker,
    },
  });
}

module.exports = {
  STATE_VERSION,
  appendRound,
  buildPublicSnapshot,
  clampRoundLimit,
  createInitialGameState,
  normalizeGameState,
};
