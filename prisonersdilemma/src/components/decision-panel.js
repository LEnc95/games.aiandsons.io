// @ts-check

// @ts-check

export class DecisionPanel {
  #element;
  #title;
  #copy;
  #status;
  #error;
  #cooperateButton;
  #defectButton;

  constructor({ onDecision }) {
    this.#element = document.createElement("section");
    this.#element.className = "pd-card pd-decision-card";

    this.#title = document.createElement("h2");
    this.#title.className = "pd-section-title";
    this.#title.textContent = "Connecting...";

    this.#copy = document.createElement("p");
    this.#copy.className = "pd-section-copy";
    this.#copy.textContent = "Loading the current secure match snapshot.";

    this.#status = document.createElement("div");
    this.#status.className = "pd-badge-row";

    this.#error = document.createElement("p");
    this.#error.className = "pd-inline-note pd-error";
    this.#error.hidden = true;

    const actionGrid = document.createElement("div");
    actionGrid.className = "pd-action-grid";

    this.#cooperateButton = this.#createActionButton(
      "cooperate",
      "Cooperate",
      "Seek the stable mutual reward and signal reciprocal intent.",
      onDecision,
    );
    this.#cooperateButton.classList.add("cooperate");

    this.#defectButton = this.#createActionButton(
      "defect",
      "Defect",
      "Take the temptation payoff now, at the risk of retaliation later.",
      onDecision,
    );
    this.#defectButton.classList.add("defect");

    actionGrid.append(this.#cooperateButton, this.#defectButton);
    this.#element.append(this.#title, this.#copy, this.#status, actionGrid, this.#error);
  }

  #createActionButton(action, label, description, onDecision) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pd-button pd-action-button";
    button.addEventListener("click", () => onDecision(action));
    button.innerHTML = `<strong>${label}</strong><span>${description}</span>`;
    return button;
  }

  mount(target) {
    target.replaceChildren(this.#element);
  }

  render(state) {
    const snapshot = state.snapshot;
    const game = snapshot?.game;
    const pending = state.pending;
    const hasSnapshot = Boolean(game);

    this.#cooperateButton.disabled = pending || !hasSnapshot || game.status === "completed";
    this.#defectButton.disabled = pending || !hasSnapshot || game.status === "completed";

    if (state.errorMessage) {
      this.#error.hidden = false;
      this.#error.textContent = state.errorMessage;
    } else {
      this.#error.hidden = true;
      this.#error.textContent = "";
    }

    if (!game) {
      this.#title.textContent = pending ? "Connecting..." : "Match Unavailable";
      this.#copy.textContent = pending
        ? "Hydrating the server-authoritative match state."
        : "The game session could not be loaded yet.";
      this.#status.replaceChildren();
      return;
    }

    const badges = [];
    badges.push(this.#createBadge(`Strategy: ${game.strategy.name}`));
    badges.push(this.#createBadge(`${game.remainingRounds} rounds left`, game.remainingRounds <= 2 ? "warn" : ""));

    if (game.status === "completed") {
      const resultLabel = game.leader === "player"
        ? "You finished ahead"
        : game.leader === "opponent"
          ? "Opponent finished ahead"
          : "Match finished tied";
      badges.push(this.#createBadge(resultLabel, game.leader === "player" ? "success" : "warn"));
      this.#title.textContent = "Match Complete";
      this.#copy.textContent = `Final spread: ${game.totals.spread > 0 ? "+" : ""}${game.totals.spread}. Reset to run another configuration.`;
    } else {
      badges.push(this.#createBadge(`Round ${game.nextRoundNumber} of ${game.roundLimit}`));
      if (game.lastRound) {
        this.#title.textContent = "Choose Your Next Move";
        this.#copy.textContent = `Last round resolved as ${this.#humanizeOutcome(game.lastRound.classification)}. Submit the next action when ready.`;
      } else {
        this.#title.textContent = "Open the Match";
        this.#copy.textContent = "The opponent has not seen a move yet. Choose whether to cooperate or defect.";
      }
    }

    this.#status.replaceChildren(...badges);
  }

  #createBadge(text, modifier = "") {
    const badge = document.createElement("span");
    badge.className = `pd-badge${modifier ? ` ${modifier}` : ""}`;
    badge.textContent = text;
    return badge;
  }

  #humanizeOutcome(classification) {
    switch (classification) {
      case "mutual-cooperation":
        return "mutual cooperation";
      case "player-exploits":
        return "player exploitation";
      case "opponent-exploits":
        return "opponent exploitation";
      default:
        return "mutual defection";
    }
  }
}
