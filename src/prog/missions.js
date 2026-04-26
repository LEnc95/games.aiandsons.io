import { state, save, recordClassroomAssignmentCompletion } from '../core/state.js';
import { getAssignmentBundleById } from './assignments.js';

const DAILY_MISSION_COUNT = 3;
const WEEKLY_CHALLENGE_COUNT = 2;

const toLocalDayKey = (timestamp = Date.now()) => {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toLocalWeekKey = (timestamp = Date.now()) => {
  const date = new Date(timestamp);
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = midnight.getDay();
  const mondayOffset = (day + 6) % 7;
  midnight.setDate(midnight.getDate() - mondayOffset);
  return toLocalDayKey(midnight.getTime());
};

const clampProgress = (value, target) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(target, Math.floor(n)));
};

const addUnique = (list, value) => {
  if (!Array.isArray(list)) return [value];
  if (list.includes(value)) return list;
  return [...list, value];
};

const hashString = (input) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const pickRotatingIds = (definitions, seedKey, count) => {
  const ids = definitions.map((entry) => entry.id);
  let seed = hashString(seedKey);

  for (let i = ids.length - 1; i > 0; i -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  return ids.slice(0, Math.min(Math.max(1, count), ids.length));
};

const missionDefs = [
  {
    id: 'snake-length-14',
    name: 'Stretch Goal',
    desc: 'Reach length 14 in Snake.',
    target: 14,
    rewardCoins: 8,
    readProgress: (ctx) => ctx?.snake?.length ?? 0,
  },
  {
    id: 'pong-margin-3',
    name: 'Paddle Power',
    desc: 'Win Pong by at least 3 points.',
    target: 3,
    rewardCoins: 7,
    readProgress: (ctx) => ctx?.pong?.winMargin ?? 0,
  },
  {
    id: 'tetris-lines-16',
    name: 'Line Cleaner',
    desc: 'Clear 16 lines in Tetris.',
    target: 16,
    rewardCoins: 10,
    readProgress: (ctx) => ctx?.tetris?.lines ?? 0,
  },
  {
    id: 'asteroids-wave-4',
    name: 'Field Survivor',
    desc: 'Reach wave 4 in Asteroids.',
    target: 4,
    rewardCoins: 9,
    readProgress: (ctx) => ctx?.asteroids?.wave ?? 0,
  },
  {
    id: 'bomberman-level-3',
    name: 'Maze Breaker',
    desc: 'Reach level 3 in Bomberman Lite.',
    target: 3,
    rewardCoins: 9,
    readProgress: (ctx) => ctx?.bomberman?.level ?? 0,
  },
  {
    id: 'dino-distance-700',
    name: 'Long Sprint',
    desc: 'Reach 700 distance in Dino Run.',
    target: 700,
    rewardCoins: 8,
    readProgress: (ctx) => ctx?.dino?.dist ?? 0,
  },
  {
    id: 'frogger-score-12',
    name: 'River Champ',
    desc: 'Score 12 in Frogger.',
    target: 12,
    rewardCoins: 8,
    readProgress: (ctx) => ctx?.frogger?.score ?? 0,
  },
  {
    id: 'pokemon-badge-1',
    name: 'Trainer Badge',
    desc: 'Earn at least 1 badge in Pokemon.',
    target: 1,
    rewardCoins: 12,
    readProgress: (ctx) => ctx?.pokemon?.badges ?? 0,
  },
  {
    id: 'tetris-score-2500',
    name: 'Stack Scorer',
    desc: 'Reach 2500 score in Tetris.',
    target: 2500,
    rewardCoins: 11,
    readProgress: (ctx) => ctx?.tetris?.score ?? 0,
  },
  {
    id: 'colorcatch-score-1200',
    name: 'Color Chain',
    desc: 'Reach 1200 score in Color Catch Arcade.',
    target: 1200,
    rewardCoins: 10,
    readProgress: (ctx) => ctx?.colorcatch?.score ?? 0,
  },
  {
    id: 'colorcatch-stage-2',
    name: 'Stage Sprint',
    desc: 'Reach stage 2 in Color Catch Arcade.',
    target: 2,
    rewardCoins: 9,
    readProgress: (ctx) => ctx?.colorcatch?.stage ?? 0,
  },
];

const weeklyDefs = [
  {
    id: 'weekly-snake-length-22',
    name: 'Weekly Snake Master',
    desc: 'Reach length 22 in Snake.',
    target: 22,
    rewardCoins: 14,
    readProgress: (ctx) => ctx?.snake?.length ?? 0,
  },
  {
    id: 'weekly-pong-margin-6',
    name: 'Weekly Pong Ace',
    desc: 'Win Pong by at least 6 points.',
    target: 6,
    rewardCoins: 14,
    readProgress: (ctx) => ctx?.pong?.winMargin ?? 0,
  },
  {
    id: 'weekly-tetris-lines-40',
    name: 'Weekly Line Boss',
    desc: 'Clear 40 lines in Tetris.',
    target: 40,
    rewardCoins: 18,
    readProgress: (ctx) => ctx?.tetris?.lines ?? 0,
  },
  {
    id: 'weekly-asteroids-wave-7',
    name: 'Weekly Deep Space',
    desc: 'Reach wave 7 in Asteroids.',
    target: 7,
    rewardCoins: 18,
    readProgress: (ctx) => ctx?.asteroids?.wave ?? 0,
  },
  {
    id: 'weekly-bomberman-level-5',
    name: 'Weekly Blast Route',
    desc: 'Reach level 5 in Bomberman Lite.',
    target: 5,
    rewardCoins: 17,
    readProgress: (ctx) => ctx?.bomberman?.level ?? 0,
  },
  {
    id: 'weekly-dino-distance-1800',
    name: 'Weekly Dino Dash',
    desc: 'Reach 1800 distance in Dino Run.',
    target: 1800,
    rewardCoins: 15,
    readProgress: (ctx) => ctx?.dino?.dist ?? 0,
  },
  {
    id: 'weekly-frogger-score-20',
    name: 'Weekly River Captain',
    desc: 'Score 20 in Frogger.',
    target: 20,
    rewardCoins: 14,
    readProgress: (ctx) => ctx?.frogger?.score ?? 0,
  },
  {
    id: 'weekly-pokemon-badges-2',
    name: 'Weekly Gym Push',
    desc: 'Earn 2 badges in Pokemon.',
    target: 2,
    rewardCoins: 20,
    readProgress: (ctx) => ctx?.pokemon?.badges ?? 0,
  },
  {
    id: 'weekly-colorcatch-score-2400',
    name: 'Weekly Spectrum Rush',
    desc: 'Reach 2400 score in Color Catch Arcade.',
    target: 2400,
    rewardCoins: 18,
    readProgress: (ctx) => ctx?.colorcatch?.score ?? 0,
  },
  {
    id: 'weekly-colorcatch-stage-3',
    name: 'Weekly Full Prism',
    desc: 'Reach stage 3 in Color Catch Arcade.',
    target: 3,
    rewardCoins: 17,
    readProgress: (ctx) => ctx?.colorcatch?.stage ?? 0,
  },
];

const missionById = new Map(missionDefs.map((entry) => [entry.id, entry]));
const weeklyById = new Map(weeklyDefs.map((entry) => [entry.id, entry]));

const ensureMissionContainers = () => {
  if (!state.missions || typeof state.missions !== 'object') {
    state.missions = {};
  }
  if (!state.missions.progress || typeof state.missions.progress !== 'object') {
    state.missions.progress = {};
  }
  if (!Array.isArray(state.missions.activeIds)) {
    state.missions.activeIds = [];
  }
  if (!Array.isArray(state.missions.completed)) {
    state.missions.completed = [];
  }
  if (!Array.isArray(state.missions.rewarded)) {
    state.missions.rewarded = [];
  }
  if (!state.missions.weekly || typeof state.missions.weekly !== 'object') {
    state.missions.weekly = {
      weekKey: '',
      activeIds: [],
      progress: {},
      completed: [],
      rewarded: [],
    };
  }

  const weekly = state.missions.weekly;
  if (!weekly.progress || typeof weekly.progress !== 'object') {
    weekly.progress = {};
  }
  if (!Array.isArray(weekly.activeIds)) {
    weekly.activeIds = [];
  }
  if (!Array.isArray(weekly.completed)) {
    weekly.completed = [];
  }
  if (!Array.isArray(weekly.rewarded)) {
    weekly.rewarded = [];
  }
};

const resetDailyMissions = (dayKey) => {
  state.missions.dayKey = dayKey;
  state.missions.activeIds = pickRotatingIds(missionDefs, `daily:${dayKey}`, DAILY_MISSION_COUNT);
  state.missions.progress = {};
  state.missions.completed = [];
  state.missions.rewarded = [];
};

const resetWeeklyChallenges = (weekKey) => {
  state.missions.weekly = {
    weekKey,
    activeIds: pickRotatingIds(weeklyDefs, `weekly:${weekKey}`, WEEKLY_CHALLENGE_COUNT),
    progress: {},
    completed: [],
    rewarded: [],
  };
};

export const ensureDailyMissions = (timestamp = Date.now()) => {
  ensureMissionContainers();
  const dayKey = toLocalDayKey(timestamp);
  const hasActiveIds = state.missions.activeIds.length > 0;

  if (state.missions.dayKey === dayKey && hasActiveIds) return false;

  resetDailyMissions(dayKey);
  save();
  return true;
};

export const ensureWeeklyChallenges = (timestamp = Date.now()) => {
  ensureMissionContainers();
  const weekKey = toLocalWeekKey(timestamp);
  const weekly = state.missions.weekly;
  const hasActiveIds = weekly.activeIds.length > 0;

  if (weekly.weekKey === weekKey && hasActiveIds) return false;

  resetWeeklyChallenges(weekKey);
  save();
  return true;
};

const materializeEntries = (ids, byId, progressMap, completedIds, rewardedIds) => {
  const completedSet = new Set(completedIds || []);
  const rewardedSet = new Set(rewardedIds || []);
  return (ids || [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((entry) => {
      const progress = clampProgress(progressMap?.[entry.id] ?? 0, entry.target);
      const completed = completedSet.has(entry.id) || progress >= entry.target;
      const rewarded = rewardedSet.has(entry.id);
      return {
        id: entry.id,
        name: entry.name,
        desc: entry.desc,
        target: entry.target,
        progress,
        completed,
        rewarded,
        rewardCoins: entry.rewardCoins,
      };
    });
};

const applyProgress = (bucket, entries, byId, payload) => {
  const completedNow = [];
  const rewardsNow = [];
  let changed = false;

  for (const entry of entries) {
    const def = byId.get(entry.id);
    if (!def) continue;

    const previous = clampProgress(bucket.progress?.[entry.id] ?? 0, entry.target);
    const incoming = clampProgress(def.readProgress(payload), entry.target);
    const next = Math.max(previous, incoming);

    if (next !== previous) {
      bucket.progress[entry.id] = next;
      changed = true;
    }

    if (next >= entry.target && !bucket.completed.includes(entry.id)) {
      bucket.completed = addUnique(bucket.completed, entry.id);
      completedNow.push(entry.id);
      changed = true;
    }

    if (bucket.completed.includes(entry.id) && !bucket.rewarded.includes(entry.id)) {
      bucket.rewarded = addUnique(bucket.rewarded, entry.id);
      state.coins = Math.max(0, state.coins + entry.rewardCoins);
      rewardsNow.push({ id: entry.id, coins: entry.rewardCoins });
      changed = true;
    }
  }

  return { changed, completedNow, rewardsNow };
};

export const getActiveDailyMissions = (timestamp = Date.now()) => {
  ensureDailyMissions(timestamp);
  return materializeEntries(
    state.missions.activeIds,
    missionById,
    state.missions.progress,
    state.missions.completed,
    state.missions.rewarded
  );
};

export const getActiveWeeklyChallenges = (timestamp = Date.now()) => {
  ensureWeeklyChallenges(timestamp);
  const weekly = state.missions.weekly;
  const entries = materializeEntries(
    weekly.activeIds,
    weeklyById,
    weekly.progress,
    weekly.completed,
    weekly.rewarded
  );
  return entries.map((entry) => ({ ...entry, weekKey: weekly.weekKey }));
};

export const recordMissionProgress = (ctx, timestamp = Date.now()) => {
  ensureDailyMissions(timestamp);
  ensureWeeklyChallenges(timestamp);
  ensureMissionContainers();

  const payload = ctx && typeof ctx === 'object' ? ctx : {};
  const dailyEntries = getActiveDailyMissions(timestamp);
  const weeklyEntries = getActiveWeeklyChallenges(timestamp);

  const daily = applyProgress(state.missions, dailyEntries, missionById, payload);
  const weekly = applyProgress(state.missions.weekly, weeklyEntries, weeklyById, payload);
  let changed = daily.changed || weekly.changed;

  if (daily.completedNow.length > 0 && !state.badges.has('daily-mission-complete')) {
    state.badges.add('daily-mission-complete');
    changed = true;
  }

  const allDailyCompleted = state.missions.activeIds.length > 0 && (() => {
    // ⚡ Bolt: Convert lookup array to a Set to reduce nested array membership check complexity from O(N*M) to O(N)
    const dailyCompletedSet = new Set(state.missions.completed);
    return state.missions.activeIds.every((id) => dailyCompletedSet.has(id));
  })();
  if (allDailyCompleted && !state.badges.has('daily-mission-sweep')) {
    state.badges.add('daily-mission-sweep');
    changed = true;
  }

  if (weekly.completedNow.length > 0 && !state.badges.has('weekly-challenge-complete')) {
    state.badges.add('weekly-challenge-complete');
    changed = true;
  }

  const weeklyBucket = state.missions.weekly;
  const allWeeklyCompleted = weeklyBucket.activeIds.length > 0 && (() => {
    // ⚡ Bolt: Convert lookup array to a Set to reduce nested array membership check complexity from O(N*M) to O(N)
    const weeklyCompletedSet = new Set(weeklyBucket.completed);
    return weeklyBucket.activeIds.every((id) => weeklyCompletedSet.has(id));
  })();
  if (allWeeklyCompleted && !state.badges.has('weekly-challenge-sweep')) {
    state.badges.add('weekly-challenge-sweep');
    changed = true;
  }

  let assignmentProgress = null;
  const assignment = state.classroom?.assignment;
  const bundle = getAssignmentBundleById(assignment?.bundleId);
  if (bundle) {
    const dailyCompleted = Math.min(bundle.dailyRequired, state.missions.completed.length);
    const weeklyCompleted = Math.min(bundle.weeklyRequired, state.missions.weekly.completed.length);
    const isComplete = dailyCompleted >= bundle.dailyRequired && weeklyCompleted >= bundle.weeklyRequired;
    assignmentProgress = {
      bundleId: bundle.id,
      dailyCompleted,
      dailyRequired: bundle.dailyRequired,
      weeklyCompleted,
      weeklyRequired: bundle.weeklyRequired,
      complete: isComplete,
    };

    if (isComplete && (!assignment.completedAt || assignment.completedAt <= 0)) {
      const wasRecorded = recordClassroomAssignmentCompletion({
        bundleId: bundle.id,
        dayKey: state.missions.dayKey,
        weekKey: state.missions.weekly.weekKey,
        completedAt: timestamp,
      });
      if (wasRecorded) {
        changed = true;
        if (!state.badges.has('assignment-complete')) {
          state.badges.add('assignment-complete');
        }
      }
    }
  }

  if (changed) {
    save();
  }

  return {
    dayKey: state.missions.dayKey,
    weekKey: state.missions.weekly.weekKey,
    completedNow: daily.completedNow,
    rewardsNow: daily.rewardsNow,
    weeklyCompletedNow: weekly.completedNow,
    weeklyRewardsNow: weekly.rewardsNow,
    assignmentProgress,
    changed,
    missions: getActiveDailyMissions(timestamp),
    weeklyChallenges: getActiveWeeklyChallenges(timestamp),
  };
};
