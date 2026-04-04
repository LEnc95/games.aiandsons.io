// @ts-check

const { ensureSession } = require("../../auth/_session");
const { writeGameState } = require("./_cookie-state");
const { allowMethods, readJsonBody, sendError, sendJson } = require("./_http");
const { createFreshState, createRuntime, sanitizeResetInput, toApiPayload } = require("./_service");

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) {
    return;
  }

  try {
    const body = await readJsonBody(req);
    const session = ensureSession(req, res, { createIfMissing: true });
    const runtime = createRuntime();
    const resetInput = sanitizeResetInput(body, runtime.config);
    const nextState = createFreshState(runtime, resetInput);

    writeGameState(res, req, session.userId, nextState);
    sendJson(res, 200, toApiPayload(runtime, nextState));
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 400;
    sendError(
      res,
      statusCode,
      statusCode >= 500
        ? "Could not reset the Prisoner's Dilemma match."
        : (error?.message || "Invalid reset payload."),
      "prisoners_dilemma_reset_failed",
    );
  }
};
