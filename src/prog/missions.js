import { state, save } from '../core/state.js';

const DAILY_MISSION_COUNT = 3;

const toLocalDayKey = (timestamp = Date.now()) => {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const clampProgress = (value, target) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(target, Math.floor(n)));
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
];

const missionById = new Map(missionDefs.map((mission) => [mission.id, mission]));

const hashString = (input) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const pickDailyMissionIds = (dayKey, count = DAILY_MISSION_COUNT) => {
  const ids = missionDefs.map((mission) => mission.id);
  let seed = hashString(dayKey || 'missions-default-seed');

  for (let i = ids.length - 1; i > 0; i -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  return ids.slice(0, Math.min(Math.max(1, count), ids.length));
};

const resetDailyMissions = (dayKey) => {
  state.missions = {
    dayKey,
    activeIds: pickDailyMissionIds(dayKey),
    progress: {},
    completed: [],
    rewarded: [],
  };
};

export const ensureDailyMissions = (timestamp = Date.now()) => {
  const dayKey = toLocalDayKey(timestamp);
  const current = state.missions || {};
  const hasActiveIds = Array.isArray(current.activeIds) && current.activeIds.length > 0;

  if (current.dayKey === dayKey && hasActiveIds) return false;

  resetDailyMissions(dayKey);
  save();
  return true;
};

export const getActiveDailyMissions = (timestamp = Date.now()) => {
  ensureDailyMissions(timestamp);
  const completedSet = new Set(state.missions.completed || []);
  const rewardedSet = new Set(state.missions.rewarded || []);
  const progressMap = state.missions.progress && typeof state.missions.progress === 'object'
    ? state.missions.progress
    : {};

  return (state.missions.activeIds || [])
    .map((id) => missionById.get(id))
    .filter(Boolean)
    .map((mission) => {
      const progress = clampProgress(progressMap[mission.id] ?? 0, mission.target);
      const completed = completedSet.has(mission.id) || progress >= mission.target;
      const rewarded = rewardedSet.has(mission.id);
      return {
        id: mission.id,
        name: mission.name,
        desc: mission.desc,
        target: mission.target,
        progress,
        completed,
        rewarded,
        rewardCoins: mission.rewardCoins,
      };
    });
};

const addUnique = (list, value) => {
  if (!Array.isArray(list)) return [value];
  if (list.includes(value)) return list;
  return [...list, value];
};

export const recordMissionProgress = (ctx, timestamp = Date.now()) => {
  ensureDailyMissions(timestamp);
  const payload = ctx && typeof ctx === 'object' ? ctx : {};
  const activeMissions = getActiveDailyMissions(timestamp);
  const completedNow = [];
  const rewardsNow = [];
  let changed = false;

  for (const mission of activeMissions) {
    const def = missionById.get(mission.id);
    if (!def) continue;

    const previous = clampProgress(state.missions.progress?.[mission.id] ?? 0, mission.target);
    const incoming = clampProgress(def.readProgress(payload), mission.target);
    const next = Math.max(previous, incoming);

    if (next !== previous) {
      state.missions.progress[mission.id] = next;
      changed = true;
    }

    if (next >= mission.target && !state.missions.completed.includes(mission.id)) {
      state.missions.completed = addUnique(state.missions.completed, mission.id);
      completedNow.push(mission.id);
      changed = true;
    }

    if (state.missions.completed.includes(mission.id) && !state.missions.rewarded.includes(mission.id)) {
      state.missions.rewarded = addUnique(state.missions.rewarded, mission.id);
      state.coins = Math.max(0, state.coins + mission.rewardCoins);
      rewardsNow.push({ id: mission.id, coins: mission.rewardCoins });
      changed = true;
    }
  }

  if (completedNow.length > 0 && !state.badges.has('daily-mission-complete')) {
    state.badges.add('daily-mission-complete');
    changed = true;
  }

  const allCompleted = state.missions.activeIds.length > 0
    && state.missions.activeIds.every((id) => state.missions.completed.includes(id));
  if (allCompleted && !state.badges.has('daily-mission-sweep')) {
    state.badges.add('daily-mission-sweep');
    changed = true;
  }

  if (changed) {
    save();
  }

  return {
    dayKey: state.missions.dayKey,
    completedNow,
    rewardsNow,
    changed,
    missions: getActiveDailyMissions(timestamp),
  };
};

