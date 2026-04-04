// @ts-check

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...options,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Request failed with status ${response.status}.`);
  }

  return payload;
}

export function fetchGameState() {
  return requestJson("/api/games/prisoners-dilemma/state");
}

export function resetGame({ strategyId, roundLimit }) {
  return requestJson("/api/games/prisoners-dilemma/reset", {
    method: "POST",
    body: JSON.stringify({
      strategyId,
      roundLimit,
    }),
  });
}

export function submitDecision(action) {
  return requestJson("/api/games/prisoners-dilemma/decision", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}
