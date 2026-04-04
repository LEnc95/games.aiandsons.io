// @ts-check

/**
 * @typedef {Object} PayoffMatrix
 * @property {number} temptation
 * @property {number} reward
 * @property {number} punishment
 * @property {number} sucker
 */

/**
 * @typedef {Object} PrisonersDilemmaConfig
 * @property {PayoffMatrix} payoffMatrix
 * @property {number} defaultRoundLimit
 * @property {number} maxRoundLimit
 * @property {string} defaultStrategyId
 */

const DEFAULTS = Object.freeze({
  temptation: 5,
  reward: 3,
  punishment: 1,
  sucker: 0,
  defaultRoundLimit: 10,
  maxRoundLimit: 16,
  defaultStrategyId: "tit-for-tat",
});

/** @type {Readonly<PrisonersDilemmaConfig> | null} */
let cachedConfig = null;

function readInteger(input, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

/**
 * @param {PayoffMatrix} matrix
 * @returns {Readonly<PayoffMatrix>}
 */
function validatePayoffMatrix(matrix) {
  const temptation = readInteger(matrix.temptation, DEFAULTS.temptation);
  const reward = readInteger(matrix.reward, DEFAULTS.reward);
  const punishment = readInteger(matrix.punishment, DEFAULTS.punishment);
  const sucker = readInteger(matrix.sucker, DEFAULTS.sucker);

  if (!(temptation > reward && reward > punishment && punishment > sucker)) {
    throw new Error("Invalid Prisoner's Dilemma payoff matrix. Expected T > R > P > S.");
  }

  return Object.freeze({
    temptation,
    reward,
    punishment,
    sucker,
  });
}

/**
 * @param {Partial<PrisonersDilemmaConfig>=} overrides
 * @returns {Readonly<PrisonersDilemmaConfig>}
 */
function loadGameConfig(overrides) {
  if (!overrides && cachedConfig) {
    return cachedConfig;
  }

  const source = overrides && typeof overrides === "object" ? overrides : {};
  const payoffMatrix = validatePayoffMatrix({
    temptation: source.payoffMatrix?.temptation ?? process.env.PRISONERS_DILEMMA_TEMPTATION ?? DEFAULTS.temptation,
    reward: source.payoffMatrix?.reward ?? process.env.PRISONERS_DILEMMA_REWARD ?? DEFAULTS.reward,
    punishment: source.payoffMatrix?.punishment ?? process.env.PRISONERS_DILEMMA_PUNISHMENT ?? DEFAULTS.punishment,
    sucker: source.payoffMatrix?.sucker ?? process.env.PRISONERS_DILEMMA_SUCKER ?? DEFAULTS.sucker,
  });

  const maxRoundLimit = readInteger(
    source.maxRoundLimit ?? process.env.PRISONERS_DILEMMA_MAX_ROUNDS,
    DEFAULTS.maxRoundLimit,
    { min: 2, max: 24 },
  );
  const defaultRoundLimit = readInteger(
    source.defaultRoundLimit ?? process.env.PRISONERS_DILEMMA_DEFAULT_ROUNDS,
    DEFAULTS.defaultRoundLimit,
    { min: 2, max: maxRoundLimit },
  );
  const defaultStrategyId = String(
    source.defaultStrategyId ?? process.env.PRISONERS_DILEMMA_DEFAULT_STRATEGY ?? DEFAULTS.defaultStrategyId,
  ).trim() || DEFAULTS.defaultStrategyId;

  const config = Object.freeze({
    payoffMatrix,
    defaultRoundLimit,
    maxRoundLimit,
    defaultStrategyId,
  });

  if (!overrides) {
    cachedConfig = config;
  }

  return config;
}

module.exports = {
  DEFAULTS,
  loadGameConfig,
  validatePayoffMatrix,
};
