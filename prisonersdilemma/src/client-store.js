// @ts-check

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

export class GameClientStore {
  #listeners = new Set();

  #state = deepFreeze({
    initialized: false,
    pending: false,
    errorMessage: "",
    snapshot: null,
  });

  getState() {
    return this.#state;
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  setPending(pending) {
    this.#commit({
      ...this.#state,
      pending: Boolean(pending),
    });
  }

  setError(errorMessage) {
    this.#commit({
      ...this.#state,
      errorMessage: String(errorMessage || ""),
    });
  }

  replaceSnapshot(snapshot) {
    this.#commit({
      initialized: true,
      pending: false,
      errorMessage: "",
      snapshot,
    });
  }

  #commit(nextState) {
    this.#state = deepFreeze(nextState);
    for (const listener of this.#listeners) {
      listener(this.#state);
    }
  }
}
