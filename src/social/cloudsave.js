// Cloud save: syncs local profile/coins/cosmetics to /api/social/sync-* for
// signed-in Google users so progress follows kids across devices.
//
// Merge rules (local vs remote):
//   coins            -> max
//   badges/inventory/cosmeticsOwned -> union
//   bestScores       -> per-game max
//   profile.name     -> prefer whichever is non-empty (local wins ties)
//   cosmetics (equipped), recent, classroom, missions -> local only (device/day specific)
import { get, set } from '../core/storage.js';
import { fetchAuthSession } from '../auth/client.js';

const SYNC_KEYS = ['coins', 'badges', 'inventory', 'cosmeticsOwned', 'cosmetics', 'profile', 'bestScores'];
const LAST_SYNC_KEY = 'cloudSaveLastSyncAt';
const PUSH_DEBOUNCE_MS = 4000;

let pushTimer = null;
let syncEnabled = false;

const readLocalSnapshot = () => {
  const snapshot = {};
  for (const key of SYNC_KEYS) {
    snapshot[key] = get(key, null);
  }
  return snapshot;
};

const unionArrays = (a, b) => {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  return [...new Set([...left, ...right])];
};

const mergeBestScores = (local, remote) => {
  const merged = {};
  const sources = [local, remote];
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const [slug, score] of Object.entries(source)) {
      const value = Number(score);
      if (!Number.isFinite(value)) continue;
      if (typeof merged[slug] !== 'number' || value > merged[slug]) {
        merged[slug] = Math.max(0, Math.floor(value));
      }
    }
  }
  return merged;
};

export const mergeSnapshots = (local, remote) => {
  const localData = local && typeof local === 'object' ? local : {};
  const remoteData = remote && typeof remote === 'object' ? remote : {};

  const localCoins = Number(localData.coins);
  const remoteCoins = Number(remoteData.coins);
  const coins = Math.max(
    Number.isFinite(localCoins) ? localCoins : 0,
    Number.isFinite(remoteCoins) ? remoteCoins : 0,
  );

  const localProfile = localData.profile && typeof localData.profile === 'object' ? localData.profile : {};
  const remoteProfile = remoteData.profile && typeof remoteData.profile === 'object' ? remoteData.profile : {};
  const profile = { ...remoteProfile, ...localProfile };
  if (!profile.name && remoteProfile.name) profile.name = remoteProfile.name;

  const localOwned = localData.cosmeticsOwned && typeof localData.cosmeticsOwned === 'object' ? localData.cosmeticsOwned : {};
  const remoteOwned = remoteData.cosmeticsOwned && typeof remoteData.cosmeticsOwned === 'object' ? remoteData.cosmeticsOwned : {};
  const cosmeticsOwned = {};
  for (const key of new Set([...Object.keys(localOwned), ...Object.keys(remoteOwned)])) {
    cosmeticsOwned[key] = unionArrays(localOwned[key], remoteOwned[key]);
  }

  return {
    coins,
    badges: unionArrays(localData.badges, remoteData.badges),
    inventory: unionArrays(localData.inventory, remoteData.inventory),
    cosmeticsOwned,
    cosmetics: localData.cosmetics ?? remoteData.cosmetics ?? null,
    profile,
    bestScores: mergeBestScores(localData.bestScores, remoteData.bestScores),
  };
};

const writeLocalSnapshot = (snapshot) => {
  for (const key of SYNC_KEYS) {
    if (snapshot[key] !== null && snapshot[key] !== undefined) {
      set(key, snapshot[key]);
    }
  }
};

const pushSnapshot = async () => {
  if (!syncEnabled) return;
  try {
    const response = await fetch('/api/social?route=sync-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ data: readLocalSnapshot() }),
    });
    if (response.ok) {
      set(LAST_SYNC_KEY, Date.now());
    }
  } catch {
    // Offline: try again next time.
  }
};

export const queueCloudPush = () => {
  if (!syncEnabled) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushSnapshot();
  }, PUSH_DEBOUNCE_MS);
};

export const initCloudSave = async () => {
  let session = null;
  try {
    session = await fetchAuthSession();
  } catch {
    return { enabled: false, reason: 'session_unavailable' };
  }
  if (!session || !session.isAuthenticated) {
    return { enabled: false, reason: 'not_signed_in' };
  }

  syncEnabled = true;

  try {
    const response = await fetch('/api/social?route=sync-pull', { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.ok === true && payload.save && payload.save.data) {
      const merged = mergeSnapshots(readLocalSnapshot(), payload.save.data);
      writeLocalSnapshot(merged);
    }
  } catch {
    // Pull failed; still push local going forward.
  }

  await pushSnapshot();

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') pushSnapshot();
    });
  }

  return { enabled: true };
};
