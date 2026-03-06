import { get, set } from './storage.js';

const DEFAULT_COSMETICS = { paddle: 'default', snake: 'default', marioShirt: 'red', memoryCardBack: 'default' };
const DEFAULT_CLASSROOM = {
  enabled: false,
  teacherPin: '',
  shopDisabledDuringClass: true,
  gameWhitelist: [],
  session: {
    active: false,
    startsAt: 0,
    endsAt: 0,
    durationMinutes: 30,
  },
};
const DEFAULT_MISSIONS = {
  dayKey: '',
  activeIds: [],
  progress: {},
  completed: [],
  rewarded: [],
  weekly: {
    weekKey: '',
    activeIds: [],
    progress: {},
    completed: [],
    rewarded: [],
  },
};

const clampSessionDuration = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_CLASSROOM.session.durationMinutes;
  return Math.min(180, Math.max(5, Math.floor(n)));
};

const normalizeWhitelist = (value) => {
  if (!Array.isArray(value)) return [];
  const normalized = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const slug = entry.trim();
    if (!slug || normalized.includes(slug)) continue;
    normalized.push(slug);
  }
  return normalized;
};

const normalizeClassroom = (source) => {
  const raw = source && typeof source === 'object' ? source : {};
  const rawSession = raw.session && typeof raw.session === 'object' ? raw.session : {};

  return {
    enabled: Boolean(raw.enabled),
    teacherPin: typeof raw.teacherPin === 'string' ? raw.teacherPin.replace(/\D/g, '').slice(0, 8) : '',
    shopDisabledDuringClass: raw.shopDisabledDuringClass !== false,
    gameWhitelist: normalizeWhitelist(raw.gameWhitelist),
    session: {
      active: Boolean(rawSession.active),
      startsAt: Number.isFinite(rawSession.startsAt) ? Math.max(0, Math.floor(rawSession.startsAt)) : 0,
      endsAt: Number.isFinite(rawSession.endsAt) ? Math.max(0, Math.floor(rawSession.endsAt)) : 0,
      durationMinutes: clampSessionDuration(rawSession.durationMinutes),
    },
  };
};

const loadClassroom = () => {
  const stored = get('classroom', null);
  const normalized = normalizeClassroom(stored);
  let needsResave = false;

  if (!stored || typeof stored !== 'object') {
    needsResave = true;
  } else if (JSON.stringify(stored) !== JSON.stringify(normalized)) {
    needsResave = true;
  }

  const session = normalized.session;
  if (session.active && session.endsAt > 0 && session.endsAt <= Date.now()) {
    session.active = false;
    needsResave = true;
  }

  return { classroom: normalized, needsResave };
};

const loadProfile = () => {
  const stored = get('profile', null);

  if (!stored || typeof stored !== 'object') {
    return { name: '', firstRun: true };
  }

  return {
    name: typeof stored.name === 'string' ? stored.name : '',
    firstRun: typeof stored.firstRun === 'boolean' ? stored.firstRun : true,
  };
};

const loadCoins = () => {
  const stored = get('coins', 0);
  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

const loadBadges = () => {
  const stored = get('badges', []);
  if (Array.isArray(stored)) {
    return new Set(stored.filter((badge) => typeof badge === 'string' && badge.trim() !== ''));
  }

  // Backward compatibility: object map of { badgeId: true }
  if (stored && typeof stored === 'object') {
    return new Set(
      Object.entries(stored)
        .filter(([, owned]) => Boolean(owned))
        .map(([badgeId]) => badgeId)
    );
  }

  return new Set();
};

const loadRecent = () => {
  const stored = get('recent', []);
  if (!Array.isArray(stored)) return [];
  return stored.filter((slug) => typeof slug === 'string' && slug.trim() !== '').slice(0, 6);
};

const loadEquippedCosmetics = () => {
  const stored = get('cosmetics', DEFAULT_COSMETICS);
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_COSMETICS };

  return { ...DEFAULT_COSMETICS, ...stored };
};

const loadOwnedCosmetics = (equipped) => {
  const base = Object.fromEntries(
    Object.entries(DEFAULT_COSMETICS).map(([category, defaultValue]) => [category, [defaultValue]])
  );

  const stored = get('cosmeticsOwned', null);
  if (stored && typeof stored === 'object') {
    for (const [category, values] of Object.entries(stored)) {
      if (!Array.isArray(values)) continue;
      if (!base[category]) base[category] = [];
      for (const value of values) {
        if (typeof value !== 'string') continue;
        if (!base[category].includes(value)) base[category].push(value);
      }
    }
  }

  for (const [category, value] of Object.entries(equipped)) {
    if (typeof value !== 'string') continue;
    if (!base[category]) base[category] = [];
    if (!base[category].includes(value)) base[category].push(value);
  }

  return base;
};

const loadInventory = () => {
  const stored = get('inventory', []);
  let needsResave = false;
  let entries;

  if (Array.isArray(stored)) {
    entries = stored;
  } else if (stored && typeof stored === 'object') {
    entries = Object.entries(stored)
      .filter(([, value]) => value !== false && value != null)
      .map(([key]) => key);
    needsResave = true;
  } else {
    entries = [];
    if (stored != null) needsResave = true;
  }

  const normalized = [];
  for (const item of entries) {
    if (typeof item === 'string' && item.trim() !== '') {
      normalized.push(item);
    } else {
      needsResave = true;
    }
  }

  return { inventory: new Set(normalized), needsResave };
};

const normalizeMissionIds = (value) => {
  if (!Array.isArray(value)) return [];
  const ids = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (!id || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
};

const normalizeMissionProgress = (value) => {
  if (!value || typeof value !== 'object') return {};
  const progress = {};
  for (const [id, raw] of Object.entries(value)) {
    if (typeof id !== 'string' || !id.trim()) continue;
    const n = Number(raw);
    progress[id] = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  return progress;
};

const normalizeMissions = (source) => {
  const raw = source && typeof source === 'object' ? source : {};
  const rawWeekly = raw.weekly && typeof raw.weekly === 'object' ? raw.weekly : {};
  return {
    dayKey: typeof raw.dayKey === 'string' ? raw.dayKey : '',
    activeIds: normalizeMissionIds(raw.activeIds),
    progress: normalizeMissionProgress(raw.progress),
    completed: normalizeMissionIds(raw.completed),
    rewarded: normalizeMissionIds(raw.rewarded),
    weekly: {
      weekKey: typeof rawWeekly.weekKey === 'string' ? rawWeekly.weekKey : '',
      activeIds: normalizeMissionIds(rawWeekly.activeIds),
      progress: normalizeMissionProgress(rawWeekly.progress),
      completed: normalizeMissionIds(rawWeekly.completed),
      rewarded: normalizeMissionIds(rawWeekly.rewarded),
    },
  };
};

const loadMissions = () => {
  const stored = get('missions', null);
  const normalized = normalizeMissions(stored || DEFAULT_MISSIONS);
  let needsResave = false;

  if (!stored || typeof stored !== 'object') {
    needsResave = true;
  } else if (JSON.stringify(stored) !== JSON.stringify(normalized)) {
    needsResave = true;
  }

  return { missions: normalized, needsResave };
};

const cosmetics = loadEquippedCosmetics();
const cosmeticsOwned = loadOwnedCosmetics(cosmetics);
const { inventory, needsResave: inventoryNeedsResave } = loadInventory();
const { classroom, needsResave: classroomNeedsResave } = loadClassroom();
const { missions, needsResave: missionsNeedsResave } = loadMissions();

export const state = {
  profile: loadProfile(),
  coins: loadCoins(),
  badges: loadBadges(),
  inventory,
  cosmetics,
  cosmeticsOwned,
  recent: loadRecent(), // array of slugs
  classroom,
  missions,
};

if (inventoryNeedsResave) {
  set('inventory', [...state.inventory]);
}
if (classroomNeedsResave) {
  set('classroom', state.classroom);
}
if (missionsNeedsResave) {
  set('missions', state.missions);
}

export const save = () => {
  set('profile', state.profile);
  set('coins', state.coins);
  set('badges', [...state.badges]);
  set('cosmetics', state.cosmetics);
  set('inventory', [...state.inventory]);
  set('cosmeticsOwned', state.cosmeticsOwned);
  set('recent', state.recent.slice(0, 6));
  set('classroom', state.classroom);
  set('missions', state.missions);
};

export const reloadCoins = () => { state.coins = loadCoins(); };
export const addCoins = (n) => { state.coins = Math.max(0, state.coins + n); save(); };
export const spendCoins = (n) => { if (state.coins >= n) { state.coins -= n; save(); return true; } return false; };
export const rememberRecent = (slug) => {
  state.recent = [slug, ...state.recent.filter(s => s !== slug)].slice(0,6);
  save();
};

export const setClassroomConfig = (partial) => {
  if (!partial || typeof partial !== 'object') return;
  const sessionPatch = partial.session && typeof partial.session === 'object' ? partial.session : {};
  const merged = normalizeClassroom({
    ...state.classroom,
    ...partial,
    session: {
      ...state.classroom.session,
      ...sessionPatch,
    },
  });
  state.classroom = merged;
  save();
};

export const startClassroomSession = (minutes = state.classroom.session.durationMinutes) => {
  const durationMinutes = clampSessionDuration(minutes);
  const startsAt = Date.now();
  const endsAt = startsAt + (durationMinutes * 60_000);

  state.classroom = normalizeClassroom({
    ...state.classroom,
    enabled: true,
    session: {
      ...state.classroom.session,
      active: true,
      startsAt,
      endsAt,
      durationMinutes,
    },
  });
  save();
};

export const endClassroomSession = () => {
  state.classroom = normalizeClassroom({
    ...state.classroom,
    session: {
      ...state.classroom.session,
      active: false,
      endsAt: Date.now(),
    },
  });
  save();
};

export const isClassroomSessionActive = (now = Date.now()) => {
  const session = state.classroom.session;
  const active = Boolean(state.classroom.enabled && session.active && session.endsAt > now);
  if (!active && session.active && session.endsAt > 0 && session.endsAt <= now) {
    state.classroom.session.active = false;
    save();
  }
  return active;
};

export const getClassroomMinutesRemaining = (now = Date.now()) => {
  if (!isClassroomSessionActive(now)) return 0;
  return Math.max(0, Math.ceil((state.classroom.session.endsAt - now) / 60_000));
};

export const getClassroomMinutesSinceEnd = (now = Date.now()) => {
  const endsAt = Number(state.classroom.session.endsAt) || 0;
  if (endsAt <= 0 || now <= endsAt) return 0;
  return Math.max(0, Math.floor((now - endsAt) / 60_000));
};

export const wasClassroomSessionRecentlyEnded = (now = Date.now(), windowMinutes = 180) => {
  if (!state.classroom.enabled) return false;
  if (isClassroomSessionActive(now)) return false;
  const endsAt = Number(state.classroom.session.endsAt) || 0;
  if (endsAt <= 0 || now < endsAt) return false;
  const windowMs = Math.max(1, Number(windowMinutes) || 1) * 60_000;
  return (now - endsAt) <= windowMs;
};

export const isGameLockedByClassroom = (slug, now = Date.now()) => {
  if (typeof slug !== 'string' || !slug.trim()) return false;
  if (!isClassroomSessionActive(now)) return false;
  const whitelist = state.classroom.gameWhitelist;
  if (!Array.isArray(whitelist) || whitelist.length === 0) return false;
  return !whitelist.includes(slug);
};

export const hasTeacherPin = () => {
  return typeof state.classroom.teacherPin === 'string' && state.classroom.teacherPin.length > 0;
};

export const verifyTeacherPin = (pin) => {
  if (!hasTeacherPin()) return true;
  const normalized = String(pin ?? '').replace(/\D/g, '').slice(0, 8);
  return normalized === state.classroom.teacherPin;
};
