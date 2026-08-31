global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import { test } from 'node:test';
import assert from 'node:assert/strict';

test('missions module loading', async (t) => {
  const {
    ensureDailyMissions,
    ensureWeeklyChallenges,
    getActiveDailyMissions,
    getActiveWeeklyChallenges,
    recordMissionProgress,
  } = await import('../../../src/prog/missions.js');
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
        assert.equal(state.missions.weekly.activeIds.length, 4);
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
        assert.equal(state.missions.weekly.activeIds.length, 4);
      });
    });

    await t.test('active daily and weekly entries identify their games', () => {
      const timestamp = new Date('2024-05-01T12:00:00Z').getTime();
      const daily = getActiveDailyMissions(timestamp);
      const weekly = getActiveWeeklyChallenges(timestamp);

      assert.ok(daily.every((entry) => typeof entry.gameSlug === 'string' && entry.gameSlug.length > 0));
      assert.ok(weekly.every((entry) => typeof entry.gameSlug === 'string' && entry.gameSlug.length > 0));
    });

    await t.test('W36 scheduled challenges complete and reward exactly once', () => {
      const timestamp = new Date('2026-08-31T12:00:00Z').getTime();
      const originalCoins = state.coins;
      const originalBadges = state.badges;
      try {
        state.coins = 0;
        state.badges = new Set();
        ensureDailyMissions(timestamp);
        ensureWeeklyChallenges(timestamp);
        state.missions.activeIds = ['tetris-lines-16'];
        state.missions.progress = {};
        state.missions.completed = [];
        state.missions.rewarded = [];
        state.missions.weekly.activeIds = [
          'weekly-w36-dapplegrove-leaves-107',
          'weekly-w36-geargrove-gears-27',
          'weekly-w36-prismpulse-pulses-25',
          'weekly-w36-snake-length-500',
        ];
        state.missions.weekly.progress = {};
        state.missions.weekly.completed = [];
        state.missions.weekly.rewarded = [];

        const payload = {
          dapplegrove: { leaves: 107 },
          geargrove: { gears: 27 },
          prismpulse: { pulses: 25 },
          snake: { length: 500 },
        };
        const first = recordMissionProgress(payload, timestamp);
        assert.equal(first.weeklyCompletedNow.length, 4);
        assert.equal(first.weeklyRewardsNow.length, 4);
        assert.equal(first.weeklyRewardsNow.reduce((sum, reward) => sum + reward.coins, 0), 80);
        assert.equal(state.coins, 80);

        const second = recordMissionProgress(payload, timestamp);
        assert.deepEqual(second.weeklyCompletedNow, []);
        assert.deepEqual(second.weeklyRewardsNow, []);
        assert.equal(state.coins, 80);
      } finally {
        state.coins = originalCoins;
        state.badges = originalBadges;
      }
    });
  });
});
