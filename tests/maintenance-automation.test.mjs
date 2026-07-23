import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyPackBrief } from '../scripts/automation/prepare-weekly-pack.mjs';
import { validateMaintenance } from '../scripts/automation/validate-maintenance.mjs';

test('maintenance baseline has no drift', () => {
  assert.deepEqual(validateMaintenance(), []);
});

test('weekly brief contains three cosmetics and four challenges across enough games', () => {
  const brief = buildWeeklyPackBrief(new Date('2026-07-22T12:00:00Z'));
  assert.equal(brief.cosmetics.length, 3);
  assert.equal(brief.challenges.length, 4);
  assert.ok(new Set(brief.cosmetics.map((item) => item.gameSlug)).size >= 2);
  assert.ok(new Set(brief.challenges.map((item) => item.gameSlug)).size >= 3);
  assert.equal(brief.challenges.reduce((sum, item) => sum + item.rewardCoinsMaximum, 0), 80);
});

