// @ts-check

// @ts-check

export class SessionToolbar {
  #element;
  #strategySelect;
  #roundLimitSelect;
  #resetButton;
  #copy;

  constructor({ onReset }) {
    this.#element = document.createElement("section");
    this.#element.className = "pd-card pd-toolbar";

    this.#copy = document.createElement("p");
    this.#copy.className = "pd-toolbar-copy";
    this.#copy.textContent = "Server-side resolution keeps the payoff engine, opponent decisions, and match state out of the browser console.";

    const strategyField = this.#createField("Opponent Strategy");
    this.#strategySelect = strategyField.querySelector("select");

    const roundsField = this.#createField("Round Budget");
    this.#roundLimitSelect = roundsField.querySelector("select");

    const actionField = document.createElement("div");
    actionField.className = "pd-field";
    const actionLabel = document.createElement("span");
    actionLabel.textContent = "Session Control";
    this.#resetButton = document.createElement("button");
    this.#resetButton.type = "button";
    this.#resetButton.className = "pd-button primary";
    this.#resetButton.textContent = "Start New Match";
    this.#resetButton.addEventListener("click", () => {
      onReset({
        strategyId: this.#strategySelect.value,
        roundLimit: Number(this.#roundLimitSelect.value),
      });
    });

    actionField.append(actionLabel, this.#resetButton);
    this.#element.append(this.#copy, strategyField, roundsField, actionField);
  }

  #createField(label) {
    const field = document.createElement("label");
    field.className = "pd-field";
    const title = document.createElement("span");
    title.textContent = label;
    const select = document.createElement("select");
    field.append(title, select);
    return field;
  }

  mount(target) {
    target.replaceChildren(this.#element);
  }

  render(state) {
    const snapshot = state.snapshot;
    const pending = state.pending;
    const options = snapshot?.options;

    this.#strategySelect.disabled = pending || !options;
    this.#roundLimitSelect.disabled = pending || !options;
    this.#resetButton.disabled = pending || !options;
    this.#resetButton.textContent = pending ? "Working..." : "Start New Match";

    if (!options) {
      return;
    }

    this.#syncOptions(
      this.#strategySelect,
      options.strategies.map((strategy) => ({
        value: strategy.id,
        label: strategy.name,
      })),
      snapshot.game.strategy.id,
    );
    this.#syncOptions(
      this.#roundLimitSelect,
      options.roundLimits.map((limit) => ({
        value: String(limit),
        label: `${limit} rounds`,
      })),
      String(snapshot.game.roundLimit),
    );
  }

  #syncOptions(select, items, selectedValue) {
    const currentValues = [...select.options].map((option) => option.value);
    const nextValues = items.map((item) => item.value);

    if (currentValues.join("|") !== nextValues.join("|")) {
      select.replaceChildren();
      for (const item of items) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        select.append(option);
      }
    }

    if (selectedValue) {
      select.value = selectedValue;
    }
  }
}
