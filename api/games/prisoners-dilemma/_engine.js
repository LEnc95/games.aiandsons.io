// @ts-check

/**
 * @typedef {"cooperate" | "defect"} PrisonerAction
 */

/**
 * @typedef {"mutual-cooperation" | "player-exploits" | "opponent-exploits" | "mutual-defection"} RoundClassification
 */

/**
 * @typedef {Object} ResolvedRound
 * @property {PrisonerAction} playerAction
 * @property {PrisonerAction} opponentAction
 * @property {number} playerDelta
 * @property {number} opponentDelta
 * @property {RoundClassification} classification
 */

/**
 * @typedef {Object} PayoffMatrix
 * @property {number} temptation
 * @property {number} reward
 * @property {number} punishment
 * @property {number} sucker
 */

const ACTIONS = Object.freeze(["cooperate", "defect"]);

/**
 * @param {unknown} value
 * @returns {PrisonerAction}
 */
function normalizeAction(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "cooperate" || normalized === "defect") {
    return normalized;
  }
  throw new Error("Invalid Prisoner's Dilemma action.");
}

class PrisonersDilemmaEngine {
  /**
   * @param {PayoffMatrix} payoffMatrix
   */
  constructor(payoffMatrix) {
    this.payoffMatrix = Object.freeze({ ...payoffMatrix });
    Object.freeze(this);
  }

  /**
   * @param {unknown} playerAction
   * @param {unknown} opponentAction
   * @returns {ResolvedRound}
   */
  resolveRound(playerAction, opponentAction) {
    const normalizedPlayerAction = normalizeAction(playerAction);
    const normalizedOpponentAction = normalizeAction(opponentAction);

    if (normalizedPlayerAction === "cooperate" && normalizedOpponentAction === "cooperate") {
      return Object.freeze({
        playerAction: normalizedPlayerAction,
        opponentAction: normalizedOpponentAction,
        playerDelta: this.payoffMatrix.reward,
        opponentDelta: this.payoffMatrix.reward,
        classification: "mutual-cooperation",
      });
    }

    if (normalizedPlayerAction === "defect" && normalizedOpponentAction === "cooperate") {
      return Object.freeze({
        playerAction: normalizedPlayerAction,
        opponentAction: normalizedOpponentAction,
        playerDelta: this.payoffMatrix.temptation,
        opponentDelta: this.payoffMatrix.sucker,
        classification: "player-exploits",
      });
    }

    if (normalizedPlayerAction === "cooperate" && normalizedOpponentAction === "defect") {
      return Object.freeze({
        playerAction: normalizedPlayerAction,
        opponentAction: normalizedOpponentAction,
        playerDelta: this.payoffMatrix.sucker,
        opponentDelta: this.payoffMatrix.temptation,
        classification: "opponent-exploits",
      });
    }

    return Object.freeze({
      playerAction: normalizedPlayerAction,
      opponentAction: normalizedOpponentAction,
      playerDelta: this.payoffMatrix.punishment,
      opponentDelta: this.payoffMatrix.punishment,
      classification: "mutual-defection",
    });
  }

  /**
   * @param {ReadonlyArray<ResolvedRound>} rounds
   */
  summarizeRounds(rounds) {
    const summary = {
      playerTotal: 0,
      opponentTotal: 0,
      classifications: {
        "mutual-cooperation": 0,
        "player-exploits": 0,
        "opponent-exploits": 0,
        "mutual-defection": 0,
      },
    };

    for (const round of rounds) {
      summary.playerTotal += Number(round.playerDelta) || 0;
      summary.opponentTotal += Number(round.opponentDelta) || 0;
      if (round.classification in summary.classifications) {
        summary.classifications[round.classification] += 1;
      }
    }

    return Object.freeze(summary);
  }
}

module.exports = {
  ACTIONS,
  PrisonersDilemmaEngine,
  normalizeAction,
};
