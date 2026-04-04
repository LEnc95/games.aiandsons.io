// @ts-check

// @ts-check

export class ResultsDashboard {
  #element;
  #metrics;
  #strategyCopy;
  #matrixBody;
  #historyBody;
  #historyEmpty;

  constructor() {
    this.#element = document.createElement("section");
    this.#element.className = "pd-card pd-dashboard";

    const title = document.createElement("h2");
    title.className = "pd-section-title";
    title.textContent = "Results Dashboard";

    this.#strategyCopy = document.createElement("p");
    this.#strategyCopy.className = "pd-section-copy";
    this.#strategyCopy.textContent = "Waiting for match data.";

    this.#metrics = document.createElement("div");
    this.#metrics.className = "pd-metrics";

    const subgrid = document.createElement("div");
    subgrid.className = "pd-subgrid";

    const matrixPanel = document.createElement("section");
    matrixPanel.className = "pd-panel";
    matrixPanel.innerHTML = `
      <h3>Payoff Matrix</h3>
      <table class="pd-matrix">
        <thead>
          <tr>
            <th>Decision Pair</th>
            <th>Player / Opponent</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    this.#matrixBody = matrixPanel.querySelector("tbody");

    const historyPanel = document.createElement("section");
    historyPanel.className = "pd-panel";
    historyPanel.innerHTML = `
      <h3>Round Ledger</h3>
      <div class="pd-history-wrap">
        <table class="pd-history">
          <thead>
            <tr>
              <th>Round</th>
              <th>You</th>
              <th>Opponent</th>
              <th>Delta</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <p class="pd-empty">No rounds resolved yet.</p>
    `;
    this.#historyBody = historyPanel.querySelector("tbody");
    this.#historyEmpty = historyPanel.querySelector(".pd-empty");

    subgrid.append(matrixPanel, historyPanel);
    this.#element.append(title, this.#strategyCopy, this.#metrics, subgrid);
  }

  mount(target) {
    target.replaceChildren(this.#element);
  }

  render(state) {
    const snapshot = state.snapshot;
    const game = snapshot?.game;
    if (!game) {
      this.#strategyCopy.textContent = "Waiting for match data.";
      this.#metrics.replaceChildren();
      this.#matrixBody.replaceChildren();
      this.#historyBody.replaceChildren();
      this.#historyEmpty.hidden = false;
      return;
    }

    this.#strategyCopy.textContent = game.strategy.description || "Configured strategy ready.";
    this.#renderMetrics(game);
    this.#renderMatrix(game.matrix);
    this.#renderHistory(game.history);
  }

  #renderMetrics(game) {
    const cards = [
      { label: "Player Total", value: String(game.totals.player) },
      { label: "Opponent Total", value: String(game.totals.opponent) },
      { label: "Leader", value: game.leader === "tie" ? "Tie" : game.leader === "player" ? "Player" : "Opponent" },
      { label: "Rounds Left", value: String(game.remainingRounds) },
    ];

    this.#metrics.replaceChildren(
      ...cards.map((card) => {
        const element = document.createElement("article");
        element.className = "pd-metric";
        element.innerHTML = `
          <span class="pd-metric-label">${card.label}</span>
          <span class="pd-metric-value">${card.value}</span>
        `;
        return element;
      }),
    );
  }

  #renderMatrix(matrix) {
    const rows = [
      ["C / C", `${matrix.reward} / ${matrix.reward}`],
      ["C / D", `${matrix.sucker} / ${matrix.temptation}`],
      ["D / C", `${matrix.temptation} / ${matrix.sucker}`],
      ["D / D", `${matrix.punishment} / ${matrix.punishment}`],
    ];

    this.#matrixBody.replaceChildren(
      ...rows.map(([pair, value]) => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${pair}</td><td>${value}</td>`;
        return row;
      }),
    );
  }

  #renderHistory(history) {
    if (!Array.isArray(history) || history.length === 0) {
      this.#historyBody.replaceChildren();
      this.#historyEmpty.hidden = false;
      return;
    }

    this.#historyEmpty.hidden = true;
    const rows = [...history].reverse().map((round) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${round.roundNumber}</td>
        <td>${this.#shortAction(round.playerAction)}</td>
        <td>${this.#shortAction(round.opponentAction)}</td>
        <td>${round.playerDelta} / ${round.opponentDelta}</td>
        <td>${this.#humanizeOutcome(round.classification)}</td>
      `;
      return row;
    });
    this.#historyBody.replaceChildren(...rows);
  }

  #shortAction(action) {
    return action === "cooperate" ? "Cooperate" : "Defect";
  }

  #humanizeOutcome(classification) {
    switch (classification) {
      case "mutual-cooperation":
        return "Mutual cooperation";
      case "player-exploits":
        return "Player exploits";
      case "opponent-exploits":
        return "Opponent exploits";
      default:
        return "Mutual defection";
    }
  }
}
