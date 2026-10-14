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

    const matrixHeader = document.createElement("h3");
    matrixHeader.textContent = "Payoff Matrix";

    const matrixTable = document.createElement("table");
    matrixTable.className = "pd-matrix";
    const matrixThead = document.createElement("thead");
    const matrixTr = document.createElement("tr");
    const thPair = document.createElement("th");
    thPair.textContent = "Decision Pair";
    const thOpponent = document.createElement("th");
    thOpponent.textContent = "Player / Opponent";
    matrixTr.append(thPair, thOpponent);
    matrixThead.append(matrixTr);

    this.#matrixBody = document.createElement("tbody");
    matrixTable.append(matrixThead, this.#matrixBody);
    matrixPanel.append(matrixHeader, matrixTable);

    const historyPanel = document.createElement("section");
    historyPanel.className = "pd-panel";

    const historyHeader = document.createElement("h3");
    historyHeader.textContent = "Round Ledger";

    const historyWrap = document.createElement("div");
    historyWrap.className = "pd-history-wrap";

    const historyTable = document.createElement("table");
    historyTable.className = "pd-history";

    const historyThead = document.createElement("thead");
    const historyTr = document.createElement("tr");
    const thRound = document.createElement("th");
    thRound.textContent = "Round";
    const thYou = document.createElement("th");
    thYou.textContent = "You";
    const thOpp = document.createElement("th");
    thOpp.textContent = "Opponent";
    const thDelta = document.createElement("th");
    thDelta.textContent = "Delta";
    const thOutcome = document.createElement("th");
    thOutcome.textContent = "Outcome";
    historyTr.append(thRound, thYou, thOpp, thDelta, thOutcome);
    historyThead.append(historyTr);

    this.#historyBody = document.createElement("tbody");
    historyTable.append(historyThead, this.#historyBody);
    historyWrap.append(historyTable);

    this.#historyEmpty = document.createElement("p");
    this.#historyEmpty.className = "pd-empty";
    this.#historyEmpty.textContent = "No rounds resolved yet.";

    historyPanel.append(historyHeader, historyWrap, this.#historyEmpty);

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

        const labelEl = document.createElement("span");
        labelEl.className = "pd-metric-label";
        labelEl.textContent = card.label;

        const valueEl = document.createElement("span");
        valueEl.className = "pd-metric-value";
        valueEl.textContent = card.value;

        element.append(labelEl, valueEl);
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

        const tdPair = document.createElement("td");
        tdPair.textContent = pair;

        const tdValue = document.createElement("td");
        tdValue.textContent = value;

        row.append(tdPair, tdValue);
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

      const tdRound = document.createElement("td");
      tdRound.textContent = String(round.roundNumber);

      const tdPlayer = document.createElement("td");
      tdPlayer.textContent = this.#shortAction(round.playerAction);

      const tdOpponent = document.createElement("td");
      tdOpponent.textContent = this.#shortAction(round.opponentAction);

      const tdDelta = document.createElement("td");
      tdDelta.textContent = `${round.playerDelta} / ${round.opponentDelta}`;

      const tdOutcome = document.createElement("td");
      tdOutcome.textContent = this.#humanizeOutcome(round.classification);

      row.append(tdRound, tdPlayer, tdOpponent, tdDelta, tdOutcome);
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
