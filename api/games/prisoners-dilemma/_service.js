// @ts-check

const { loadGameConfig } = require("./_config");
const { PrisonersDilemmaEngine, normalizeAction } = require("./_engine");
const { listStrategies, decideOpponentAction, getStrategy } = require("./_strategies");
const {
  appendRound,
  buildPublicSnapshot,
  clampRoundLimit,
  createInitialGameState,
  normalizeGameState,
} = require("./_state");

function createRuntime() {
  const config = loadGameConfig();
  const engine = new PrisonersDilemmaEngine(config.payoffMatrix);
  const strategies = listStrategies();
  return {
    config,
    engine,
    strategies,
  };
}

function sanitizeResetInput(body, config) {
  const source = body && typeof body === "object" ? body : {};
  const strategyId = typeof source.strategyId === "string" ? source.strategyId.trim() : config.defaultStrategyId;
  getStrategy(strategyId);
  const roundLimit = clampRoundLimit(source.roundLimit, config.maxRoundLimit, config.defaultRoundLimit);
  return {
    strategyId,
    roundLimit,
  };
}

function createFreshState(runtime, resetInput, now = Date.now()) {
  return createInitialGameState({
    strategyId: resetInput.strategyId,
    roundLimit: resetInput.roundLimit,
    now,
  });
}

function normalizePersistedState(runtime, rawState) {
  return normalizeGameState(rawState, {
    config: runtime.config,
    engine: runtime.engine,
  });
}

function advanceWithPlayerAction(runtime, currentState, action, now = Date.now()) {
  const playerAction = normalizeAction(action);
  const opponentAction = decideOpponentAction(currentState.strategyId, {
    rounds: currentState.rounds,
    roundNumber: currentState.rounds.length + 1,
  });

  return appendRound(currentState, {
    playerAction,
    opponentAction,
    engine: runtime.engine,
    now,
  });
}

function toApiPayload(runtime, state) {
  return {
    ok: true,
    game: buildPublicSnapshot(state, {
      config: runtime.config,
      strategies: runtime.strategies,
      engine: runtime.engine,
    }),
    options: {
      strategies: runtime.strategies,
      roundLimits: [6, 10, 12, runtime.config.maxRoundLimit]
        .filter((value, index, array) => value <= runtime.config.maxRoundLimit && array.indexOf(value) === index)
        .sort((left, right) => left - right),
      actions: [
        { id: "cooperate", label: "Cooperate" },
        { id: "defect", label: "Defect" },
      ],
    },
    config: {
      defaultRoundLimit: runtime.config.defaultRoundLimit,
      maxRoundLimit: runtime.config.maxRoundLimit,
      payoffMatrix: runtime.config.payoffMatrix,
    },
  };
}

module.exports = {
  advanceWithPlayerAction,
  createFreshState,
  createRuntime,
  normalizePersistedState,
  sanitizeResetInput,
  toApiPayload,
};
