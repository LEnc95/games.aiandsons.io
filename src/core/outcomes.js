import { recordMissionProgress } from '../prog/missions.js';
import { getGameContentContract } from '../meta/content-contracts.js';

const OUTCOME_ENDPOINT = '/api/telemetry/outcome';
const RESULT_VALUES = new Set(['completed', 'lost', 'abandoned']);

const clampMetric = (value, definition) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(definition.min, Math.min(definition.max, Math.floor(numeric)));
};

export const normalizeGameOutcome = (source) => {
  const raw = source && typeof source === 'object' ? source : {};
  const slug = typeof raw.slug === 'string' ? raw.slug.trim().toLowerCase() : '';
  const contract = getGameContentContract(slug);
  if (!contract) return null;

  const result = RESULT_VALUES.has(raw.result) ? raw.result : 'completed';
  const metrics = {};
  const supplied = raw.metrics && typeof raw.metrics === 'object' ? raw.metrics : {};
  for (const [key, definition] of Object.entries(contract.outcomes)) {
    const normalized = clampMetric(supplied[key], definition);
    if (normalized !== null) metrics[key] = normalized;
  }
  if (!Object.keys(metrics).length) return null;

  const durationMs = Math.max(0, Math.min(4 * 60 * 60 * 1000, Math.floor(Number(raw.durationMs) || 0)));
  return { slug, result, durationMs, metrics };
};

const sendAggregateOutcome = (outcome) => {
  if (typeof fetch !== 'function' || typeof location === 'undefined') return;
  if (globalThis.CADE_AGGREGATE_TELEMETRY_ENABLED !== true) return;
  fetch(OUTCOME_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(outcome),
    credentials: 'omit',
    keepalive: true,
  }).catch(() => {});
};

export const reportGameOutcome = (source) => {
  const outcome = normalizeGameOutcome(source);
  if (!outcome) return { accepted: false, missionUpdate: null };

  const missionUpdate = recordMissionProgress({ [outcome.slug]: outcome.metrics });
  sendAggregateOutcome(outcome);
  return { accepted: true, outcome, missionUpdate };
};
