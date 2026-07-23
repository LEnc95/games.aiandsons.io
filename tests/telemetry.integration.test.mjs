import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { normalizeOutcome } = require('../api/telemetry/_shared.js');
const { applyOutcome } = require('../api/telemetry/_store.js');
const { mergeMonthlyBucket } = await import('../scripts/metrics/telemetry-retention.mjs');

test('telemetry accepts only registered bounded outcome fields', async () => {
  const outcome = await normalizeOutcome({
    slug: 'lureline',
    result: 'completed',
    durationMs: 99_999_999,
    metrics: { score: 9999, caught: 4, ponds: 2, playerName: 'not allowed' },
    userId: 'not retained',
  });
  assert.deepEqual(outcome, {
    slug: 'lureline',
    result: 'completed',
    durationMs: 14_400_000,
    metrics: { score: 500, caught: 4, ponds: 2 },
  });
});

test('telemetry rejects games without an explicit content contract', async () => {
  assert.equal(await normalizeOutcome({ slug: 'unknown', metrics: { score: 10 } }), null);
});

test('aggregate buckets retain counters and summaries, not raw events', () => {
  const first = applyOutcome(null, {
    slug: 'lureline', result: 'completed', durationMs: 1000, metrics: { score: 20, caught: 2 },
  }, Date.parse('2026-07-22T12:00:00Z'));
  const second = applyOutcome(first, {
    slug: 'lureline', result: 'lost', durationMs: 500, metrics: { score: 10, caught: 1 },
  }, Date.parse('2026-07-22T13:00:00Z'));
  assert.equal(second.outcomes, 2);
  assert.equal(second.completed, 1);
  assert.equal(second.lost, 1);
  assert.deepEqual(second.metrics.score, { count: 2, sum: 30, min: 10, max: 20 });
  assert.equal('events' in second, false);
  assert.equal('userId' in second, false);
});

test('telemetry reuses the social Vercel function entrypoint', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rewrite = config.rewrites.find((entry) => entry.source === '/api/telemetry/outcome');
  assert.deepEqual(rewrite, {
    source: '/api/telemetry/outcome',
    destination: '/api/social?route=telemetry-outcome',
  });
});

test('daily aggregates roll into bounded monthly summaries', () => {
  const daily = { dayKey: '2026-01-02', gameSlug: 'lureline', outcomes: 2, completed: 1, lost: 1, abandoned: 0, durationMsSum: 1500, metrics: { score: { count: 2, sum: 30, min: 10, max: 20 } } };
  const monthly = mergeMonthlyBucket(null, daily);
  assert.equal(monthly.monthKey, '2026-01');
  assert.equal(monthly.outcomes, 2);
  assert.deepEqual(monthly.metrics.score, { count: 2, sum: 30, min: 10, max: 20 });
  assert.equal('events' in monthly, false);
});
