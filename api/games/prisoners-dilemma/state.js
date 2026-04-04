// @ts-check

const { ensureSession } = require("../../auth/_session");
const { readGameState, writeGameState } = require("./_cookie-state");
const { allowMethods, sendError, sendJson } = require("./_http");
const { createRuntime, createFreshState, normalizePersistedState, toApiPayload } = require("./_service");

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) {
    return;
  }

  try {
    const session = ensureSession(req, res, { createIfMissing: true });
    const runtime = createRuntime();
    const storedState = readGameState(req, session.userId);
    const nextState = storedState
      ? normalizePersistedState(runtime, storedState)
      : createFreshState(runtime, {
        strategyId: runtime.config.defaultStrategyId,
        roundLimit: runtime.config.defaultRoundLimit,
      });

    writeGameState(res, req, session.userId, nextState);
    sendJson(res, 200, toApiPayload(runtime, nextState));
  } catch (error) {
    sendError(
      res,
      500,
      "Could not load the Prisoner's Dilemma session.",
      "prisoners_dilemma_state_failed",
    );
  }
};
