// @ts-check

const crypto = require("crypto");
const { normalizeAction } = require("./_engine");

/**
 * @typedef {"cooperate" | "defect"} PrisonerAction
 */

/**
 * @typedef {Object} StrategyContext
 * @property {ReadonlyArray<{ playerAction: PrisonerAction, opponentAction: PrisonerAction }>} rounds
 * @property {number} roundNumber
 * @property {() => number} randomBit
 */

/**
 * @typedef {Object} OpponentStrategy
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {(context: StrategyContext) => PrisonerAction} decide
 */

/**
 * @returns {0 | 1}
 */
function secureRandomBit() {
  return /** @type {0 | 1} */ (crypto.randomInt(0, 2));
}

/** @type {ReadonlyArray<OpponentStrategy>} */
const STRATEGIES = Object.freeze([
  Object.freeze({
    id: "tit-for-tat",
    name: "Tit for Tat",
    description: "Opens with cooperation, then mirrors your previous action.",
    decide(context) {
      const previousRound = context.rounds[context.rounds.length - 1];
      if (!previousRound) {
        return "cooperate";
      }
      return normalizeAction(previousRound.playerAction);
    },
  }),
  Object.freeze({
    id: "always-defect",
    name: "Always Defect",
    description: "Optimizes for short-term gain by defecting every round.",
    decide() {
      return "defect";
    },
  }),
  Object.freeze({
    id: "random",
    name: "Cryptographic Random",
    description: "Uses a secure random branch to choose between cooperation and defection.",
    decide(context) {
      return context.randomBit() === 0 ? "cooperate" : "defect";
    },
  }),
]);

const STRATEGY_MAP = new Map(STRATEGIES.map((strategy) => [strategy.id, strategy]));

/**
 * @param {unknown} strategyId
 * @returns {OpponentStrategy}
 */
function getStrategy(strategyId) {
  const normalizedId = String(strategyId ?? "").trim();
  const strategy = STRATEGY_MAP.get(normalizedId);
  if (!strategy) {
    throw new Error(`Unknown Prisoner's Dilemma strategy: ${normalizedId || "(empty)"}`);
  }
  return strategy;
}

function listStrategies() {
  return STRATEGIES.map((strategy) => ({
    id: strategy.id,
    name: strategy.name,
    description: strategy.description,
  }));
}

/**
 * @param {unknown} strategyId
 * @param {Omit<StrategyContext, "randomBit"> & { randomBit?: () => number }} context
 * @returns {PrisonerAction}
 */
function decideOpponentAction(strategyId, context) {
  const strategy = getStrategy(strategyId);
  const decision = strategy.decide({
    rounds: Array.isArray(context.rounds) ? context.rounds : [],
    roundNumber: Number.isFinite(context.roundNumber) ? Math.max(1, Math.floor(context.roundNumber)) : 1,
    randomBit: typeof context.randomBit === "function" ? context.randomBit : secureRandomBit,
  });
  return normalizeAction(decision);
}

module.exports = {
  decideOpponentAction,
  getStrategy,
  listStrategies,
  secureRandomBit,
  STRATEGIES,
};
