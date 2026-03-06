import test from 'node:test';
import assert from 'node:assert/strict';

import { getPremiumChallengeTrack, PREMIUM_CHALLENGE_DEFS } from '../src/prog/premium-challenges.js';

test('premium challenge track stays locked for users without family premium', () => {
  const track = getPremiumChallengeTrack({
    entitlements: { familyPremium: false, schoolLicense: false },
    missions: {
      completed: ['m1', 'm2', 'm3'],
      weekly: { completed: ['w1', 'w2'] },
    },
    classroom: {
      assignment: { completedAt: Date.now() },
    },
  });

  assert.deepEqual(
    track,
    {
      entitled: false,
      completedCount: 0,
      totalCount: PREMIUM_CHALLENGE_DEFS.length,
      challenges: [],
    },
  );
});

test('premium challenge track computes capped progress and completion for entitled users', () => {
  const track = getPremiumChallengeTrack({
    entitlements: { familyPremium: true, schoolLicense: false },
    missions: {
      completed: ['daily-1', 'daily-2', 'daily-3', 'daily-4'],
      weekly: { completed: ['weekly-1', 'weekly-2', 'weekly-3'] },
    },
    classroom: {
      assignment: { completedAt: Date.now() },
    },
  });

  assert.equal(track.entitled, true);
  assert.equal(track.totalCount, PREMIUM_CHALLENGE_DEFS.length);
  assert.equal(track.completedCount, PREMIUM_CHALLENGE_DEFS.length);
  assert.equal(track.challenges.length, PREMIUM_CHALLENGE_DEFS.length);

  const [daily, weekly, assignment] = track.challenges;
  assert.equal(daily.progress, 3);
  assert.equal(daily.target, 3);
  assert.equal(daily.completed, true);

  assert.equal(weekly.progress, 2);
  assert.equal(weekly.target, 2);
  assert.equal(weekly.completed, true);

  assert.equal(assignment.progress, 1);
  assert.equal(assignment.target, 1);
  assert.equal(assignment.completed, true);
});
