import { get, set } from './storage.js';

export const state = {
  profile: get('profile', { name: '', firstRun: true }),
  coins: get('coins', 0),
  badges: new Set(get('badges', [])),
  cosmetics: get('cosmetics', { paddle: 'default', snake: 'default', marioShirt: 'red' }),
  recent: get('recent', []), // array of slugs
};

export const save = () => {
  set('profile', state.profile);
  set('coins', state.coins);
  set('badges', [...state.badges]);
  set('cosmetics', state.cosmetics);
  set('recent', state.recent.slice(0, 6));
};

export const addCoins = (n) => { state.coins = Math.max(0, state.coins + n); save(); };
export const spendCoins = (n) => { if (state.coins >= n) { state.coins -= n; save(); return true; } return false; };
export const rememberRecent = (slug) => {
  state.recent = [slug, ...state.recent.filter(s => s !== slug)].slice(0,6);
  save();
};

