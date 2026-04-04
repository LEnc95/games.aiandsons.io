import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const { loadGameConfig } = require("../api/games/prisoners-dilemma/_config.js");
const { PrisonersDilemmaEngine } = require("../api/games/prisoners-dilemma/_engine.js");
const { decideOpponentAction } = require("../api/games/prisoners-dilemma/_strategies.js");
const {
  appendRound,
  buildPublicSnapshot,
  createInitialGameState,
  normalizeGameState,
} = require("../api/games/prisoners-dilemma/_state.js");

test("engine resolves the canonical Prisoner's Dilemma payoff matrix", () => {
  const config = loadGameConfig({
    payoffMatrix: {
      temptation: 7,
      reward: 5,
      punishment: 2,
      sucker: -1,
    },
  });
  const engine = new PrisonersDilemmaEngine(config.payoffMatrix);

  assert.deepEqual(engine.resolveRound("cooperate", "cooperate"), {
    playerAction: "cooperate",
    opponentAction: "cooperate",
    playerDelta: 5,
    opponentDelta: 5,
    classification: "mutual-cooperation",
  });
  assert.deepEqual(engine.resolveRound("defect", "cooperate"), {
    playerAction: "defect",
    opponentAction: "cooperate",
    playerDelta: 7,
    opponentDelta: -1,
    classification: "player-exploits",
  });
  assert.deepEqual(engine.resolveRound("cooperate", "defect"), {
    playerAction: "cooperate",
    opponentAction: "defect",
    playerDelta: -1,
    opponentDelta: 7,
    classification: "opponent-exploits",
  });
  assert.deepEqual(engine.resolveRound("defect", "defect"), {
    playerAction: "defect",
    opponentAction: "defect",
    playerDelta: 2,
    opponentDelta: 2,
    classification: "mutual-defection",
  });
});

test("tit-for-tat mirrors the player's previous move", () => {
  const firstMove = decideOpponentAction("tit-for-tat", {
    rounds: [],
    roundNumber: 1,
    randomBit: () => 0,
  });
  const secondMove = decideOpponentAction("tit-for-tat", {
    rounds: [
      {
        roundNumber: 1,
        playerAction: "defect",
        opponentAction: "cooperate",
        playerDelta: 5,
        opponentDelta: 0,
        classification: "player-exploits",
      },
    ],
    roundNumber: 2,
    randomBit: () => 0,
  });

  assert.equal(firstMove, "cooperate");
  assert.equal(secondMove, "defect");
});

test("state normalization and snapshots recompute totals from stored actions", () => {
  const config = loadGameConfig();
  const engine = new PrisonersDilemmaEngine(config.payoffMatrix);
  const initialState = createInitialGameState({
    strategyId: "always-defect",
    roundLimit: 2,
    now: 100,
  });
  const oneRoundState = appendRound(initialState, {
    playerAction: "cooperate",
    opponentAction: "defect",
    engine,
    now: 150,
  });

  const normalizedState = normalizeGameState({
    ...oneRoundState,
    rounds: [
      {
        roundNumber: 1,
        playerAction: "cooperate",
        opponentAction: "defect",
        playerDelta: 9999,
        opponentDelta: 9999,
        classification: "mutual-cooperation",
      },
    ],
  }, {
    config,
    engine,
  });

  const snapshot = buildPublicSnapshot(normalizedState, {
    config,
    engine,
    strategies: [
      {
        id: "always-defect",
        name: "Always Defect",
        description: "Always defects.",
      },
    ],
  });

  assert.equal(snapshot.totals.player, config.payoffMatrix.sucker);
  assert.equal(snapshot.totals.opponent, config.payoffMatrix.temptation);
  assert.equal(snapshot.history.length, 1);
  assert.equal(snapshot.status, "active");
  assert.equal(snapshot.leader, "opponent");
});
