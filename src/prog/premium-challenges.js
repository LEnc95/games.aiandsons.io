import { ENTITLEMENT_KEYS, hasEntitlement } from '../core/entitlements.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toCount = (value) => {
  if (!Array.isArray(value)) return 0;
  return value.length;
};

export const PREMIUM_CHALLENGE_DEFS = Object.freeze([
  {
    id: 'premium-daily-sweep',
    name: 'Daily Sweep',
    desc: 'Complete all 3 daily missions in one day.',
    target: 3,
    rewardLabel: '+30 coins bonus',
    readProgress: ({ missions }) => clamp(toCount(missions?.completed), 0, 3),
  },
  {
    id: 'premium-weekly-commit',
    name: 'Weekly Commit',
    desc: 'Complete both weekly challenges this week.',
    target: 2,
    rewardLabel: '+40 coins bonus',
    readProgress: ({ missions }) => clamp(toCount(missions?.weekly?.completed), 0, 2),
  },
  {
    id: 'premium-assignment-helper',
    name: 'Assignment Helper',
    desc: 'Finish one classroom assignment bundle.',
    target: 1,
    rewardLabel: 'Premium helper badge',
    readProgress: ({ classroom }) => {
      const done = Number(classroom?.assignment?.completedAt) > 0;
      return done ? 1 : 0;
    },
  },
]);

export const getPremiumChallengeTrack = ({ entitlements, missions, classroom }) => {
  const entitled = hasEntitlement(ENTITLEMENT_KEYS.FAMILY_PREMIUM, entitlements);
  if (!entitled) {
    return {
      entitled: false,
      completedCount: 0,
      totalCount: PREMIUM_CHALLENGE_DEFS.length,
      challenges: [],
    };
  }

  const challenges = PREMIUM_CHALLENGE_DEFS.map((def) => {
    const progress = clamp(def.readProgress({ missions, classroom }), 0, def.target);
    return {
      id: def.id,
      name: def.name,
      desc: def.desc,
      target: def.target,
      progress,
      completed: progress >= def.target,
      rewardLabel: def.rewardLabel,
    };
  });

  return {
    entitled: true,
    completedCount: challenges.filter((challenge) => challenge.completed).length,
    totalCount: challenges.length,
    challenges,
  };
};
