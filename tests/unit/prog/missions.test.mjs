global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import { test } from 'node:test';
import assert from 'node:assert/strict';

test('missions module loading', async (t) => {
  const { ensureDailyMissions, ensureWeeklyChallenges } = await import('../../../src/prog/missions.js');
  const { state } = await import('../../../src/core/state.js');

  await t.test('missions module tests', async (t) => {
    let originalMissionsState;

    t.beforeEach(() => {
      originalMissionsState = state.missions;
      state.missions = null;
    });

    t.afterEach(() => {
      state.missions = originalMissionsState;
    });

    await t.test('ensureDailyMissions', async (t) => {
      await t.test('initializes mission containers if missing', () => {
        state.missions = undefined;
        const changed = ensureDailyMissions(new Date('2024-05-01T12:00:00Z').getTime());

        assert.equal(changed, true);
        assert.ok(state.missions);
        assert.ok(state.missions.progress);
        assert.ok(Array.isArray(state.missions.activeIds));
        assert.ok(Array.isArray(state.missions.completed));
        assert.ok(Array.isArray(state.missions.rewarded));
        assert.equal(state.missions.dayKey, '2024-05-01');
        assert.equal(state.missions.activeIds.length, 3);
      });

      await t.test('returns false if the day has not changed and there are active missions', () => {
        ensureDailyMissions(new Date('2024-05-01T12:00:00Z').getTime());

        // Call again on the same day
        const changed = ensureDailyMissions(new Date('2024-05-01T15:00:00Z').getTime());
        assert.equal(changed, false);
      });

      await t.test('returns true, picks new active IDs, clears progress if the day has changed', () => {
        ensureDailyMissions(new Date('2024-05-01T12:00:00Z').getTime());

        state.missions.progress = { 'some-mission': 5 };
        state.missions.completed = ['some-mission'];
        state.missions.rewarded = ['some-mission'];

        const changed = ensureDailyMissions(new Date('2024-05-02T12:00:00Z').getTime());
        assert.equal(changed, true);

        assert.equal(state.missions.dayKey, '2024-05-02');
        assert.deepEqual(state.missions.progress, {});
        assert.deepEqual(state.missions.completed, []);
        assert.deepEqual(state.missions.rewarded, []);
        assert.equal(state.missions.activeIds.length, 3);
      });
    });

    await t.test('ensureWeeklyChallenges', async (t) => {
      await t.test('initializes mission containers if missing', () => {
        state.missions = undefined;
        const changed = ensureWeeklyChallenges(new Date('2024-05-01T12:00:00Z').getTime());

        assert.equal(changed, true);
        assert.ok(state.missions);
        assert.ok(state.missions.weekly);
        assert.ok(state.missions.weekly.progress);
        assert.ok(Array.isArray(state.missions.weekly.activeIds));
        assert.ok(Array.isArray(state.missions.weekly.completed));
        assert.ok(Array.isArray(state.missions.weekly.rewarded));
        assert.equal(state.missions.weekly.activeIds.length, 2);
      });

      await t.test('returns false if the week has not changed and there are active challenges', () => {
        ensureWeeklyChallenges(new Date('2024-05-01T12:00:00Z').getTime());

        // Call again on same week
        const changed = ensureWeeklyChallenges(new Date('2024-05-03T12:00:00Z').getTime());
        assert.equal(changed, false);
      });

      await t.test('returns true, picks new active IDs, clears progress if the week has changed', () => {
        ensureWeeklyChallenges(new Date('2024-05-01T12:00:00Z').getTime());

        state.missions.weekly.progress = { 'some-weekly': 10 };
        state.missions.weekly.completed = ['some-weekly'];
        state.missions.weekly.rewarded = ['some-weekly'];

        const changed = ensureWeeklyChallenges(new Date('2024-05-08T12:00:00Z').getTime());
        assert.equal(changed, true);

        assert.deepEqual(state.missions.weekly.progress, {});
        assert.deepEqual(state.missions.weekly.completed, []);
        assert.deepEqual(state.missions.weekly.rewarded, []);
        assert.equal(state.missions.weekly.activeIds.length, 2);
      });
    });
  });
});
