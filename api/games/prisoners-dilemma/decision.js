// @ts-check

const { ensureSession } = require("../../auth/_session");
const { readGameState, writeGameState } = require("./_cookie-state");
const { allowMethods, readJsonBody, sendError, sendJson } = require("./_http");
const {
  advanceWithPlayerAction,
  createFreshState,
  createRuntime,
  normalizePersistedState,
  toApiPayload,
} = require("./_service");

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) {
    return;
  }

  try {
    const body = await readJsonBody(req);
    const session = ensureSession(req, res, { createIfMissing: true });
    const runtime = createRuntime();
    const storedState = readGameState(req, session.userId);
    const currentState = storedState
      ? normalizePersistedState(runtime, storedState)
      : createFreshState(runtime, {
        strategyId: runtime.config.defaultStrategyId,
        roundLimit: runtime.config.defaultRoundLimit,
      });

    if (currentState.rounds.length >= currentState.roundLimit) {
      sendError(res, 409, "Match already completed. Reset to start a new session.", "match_completed");
      return;
    }

    const nextState = advanceWithPlayerAction(runtime, currentState, body?.action);
    writeGameState(res, req, session.userId, nextState);
    sendJson(res, 200, toApiPayload(runtime, nextState));
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 400;
    sendError(
      res,
      statusCode,
      statusCode >= 500
        ? "Could not resolve the submitted decision."
        : (error?.message || "Invalid Prisoner's Dilemma decision."),
      "prisoners_dilemma_decision_failed",
    );
  }
};
