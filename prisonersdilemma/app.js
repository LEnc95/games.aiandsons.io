// @ts-check

import { rememberRecent } from "../src/core/state.js";
import { fetchGameState, resetGame, submitDecision } from "./src/api-client.js";
import { GameClientStore } from "./src/client-store.js";
import { DecisionPanel } from "./src/components/decision-panel.js";
import { ResultsDashboard } from "./src/components/results-dashboard.js";
import { SessionToolbar } from "./src/components/session-toolbar.js";

const toolbarMount = document.getElementById("toolbarMount");
const decisionMount = document.getElementById("decisionMount");
const dashboardMount = document.getElementById("dashboardMount");

const store = new GameClientStore();

const toolbar = new SessionToolbar({
  onReset: (settings) => {
    void runMutation(() => resetGame(settings));
  },
});
const decisionPanel = new DecisionPanel({
  onDecision: (action) => {
    void runMutation(() => submitDecision(action));
  },
});
const dashboard = new ResultsDashboard();

toolbar.mount(toolbarMount);
decisionPanel.mount(decisionMount);
dashboard.mount(dashboardMount);

store.subscribe((state) => {
  toolbar.render(state);
  decisionPanel.render(state);
  dashboard.render(state);
});

async function runMutation(task) {
  if (store.getState().pending) {
    return;
  }

  store.setPending(true);
  store.setError("");
  try {
    const snapshot = await task();
    store.replaceSnapshot(snapshot);
  } catch (error) {
    store.setPending(false);
    store.setError(error instanceof Error ? error.message : "Unexpected request failure.");
  }
}

async function bootstrap() {
  rememberRecent("prisonersdilemma");
  store.setPending(true);
  try {
    const snapshot = await fetchGameState();
    store.replaceSnapshot(snapshot);
  } catch (error) {
    store.setPending(false);
    store.setError(error instanceof Error ? error.message : "Could not initialize the game.");
  }
}

void bootstrap();
