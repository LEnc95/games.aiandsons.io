import { get, set } from './storage.js';

const DEFAULT_COSMETICS = { paddle: 'default', snake: 'default', marioShirt: 'red' };

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

const cosmetics = loadEquippedCosmetics();
const cosmeticsOwned = loadOwnedCosmetics(cosmetics);

export const state = {
  profile: get('profile', { name: '', firstRun: true }),
  coins: get('coins', 0),
  badges: new Set(get('badges', [])),
  cosmetics,
  cosmeticsOwned,
  recent: get('recent', []), // array of slugs
};

export const save = () => {
  set('profile', state.profile);
  set('coins', state.coins);
  set('badges', [...state.badges]);
  set('cosmetics', state.cosmetics);
  set('cosmeticsOwned', state.cosmeticsOwned);
  set('recent', state.recent.slice(0, 6));
};

export const addCoins = (n) => { state.coins = Math.max(0, state.coins + n); save(); };
export const spendCoins = (n) => { if (state.coins >= n) { state.coins -= n; save(); return true; } return false; };
export const rememberRecent = (slug) => {
  state.recent = [slug, ...state.recent.filter(s => s !== slug)].slice(0,6);
  save();
};

