import { get, set } from './storage.js';

const DEFAULT_COSMETICS = { paddle: 'default', snake: 'default', marioShirt: 'red', memoryCardBack: 'default' };

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

const cosmetics = loadEquippedCosmetics();
const cosmeticsOwned = loadOwnedCosmetics(cosmetics);
const { inventory, needsResave: inventoryNeedsResave } = loadInventory();

export const state = {
  profile: loadProfile(),
  coins: loadCoins(),
  badges: loadBadges(),
  inventory,
  cosmetics,
  cosmeticsOwned,
  recent: loadRecent(), // array of slugs
};

if (inventoryNeedsResave) {
  set('inventory', [...state.inventory]);
}

export const save = () => {
  set('profile', state.profile);
  set('coins', state.coins);
  set('badges', [...state.badges]);
  set('cosmetics', state.cosmetics);
  set('inventory', [...state.inventory]);
  set('cosmeticsOwned', state.cosmeticsOwned);
  set('recent', state.recent.slice(0, 6));
};

export const reloadCoins = () => { state.coins = loadCoins(); };
export const addCoins = (n) => { state.coins = Math.max(0, state.coins + n); save(); };
export const spendCoins = (n) => { if (state.coins >= n) { state.coins -= n; save(); return true; } return false; };
export const rememberRecent = (slug) => {
  state.recent = [slug, ...state.recent.filter(s => s !== slug)].slice(0,6);
  save();
};
