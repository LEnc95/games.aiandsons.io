// Client for /api/social/* — player identity, scores, challenges, rooms.
import { del, get, set } from '../core/storage.js';

const PLAYER_STORAGE_KEY = 'socialPlayer';

let cachedPlayer = null;
let registerPromise = null;

const apiUrl = (route, params = {}) => {
  const search = new URLSearchParams({ route, ...params });
  return `/api/social?${search.toString()}`;
};

const postJson = async (route, payload) => {
  const response = await fetch(apiUrl(route), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) {
    const error = new Error(data.error || `Social API error (${response.status})`);
    error.code = data.code || 'social_error';
    throw error;
  }
  return data;
};

const getJson = async (route, params) => {
  const response = await fetch(apiUrl(route, params), { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) {
    const error = new Error(data.error || `Social API error (${response.status})`);
    error.code = data.code || 'social_error';
    throw error;
  }
  return data;
};

const loadStoredPlayer = () => {
  const raw = get(PLAYER_STORAGE_KEY, null);
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id : '';
  const token = typeof raw.token === 'string' ? raw.token : '';
  const handle = typeof raw.handle === 'string' ? raw.handle : '';
  if (!id || !token) return null;
  return { id, token, handle };
};

const storePlayer = (player) => {
  set(PLAYER_STORAGE_KEY, player);
  cachedPlayer = player;
};

const clearStoredPlayer = () => {
  del(PLAYER_STORAGE_KEY);
  cachedPlayer = null;
  registerPromise = null;
};

const isStalePlayerError = (error) =>
  error && ['invalid_player_token', 'unknown_player'].includes(error.code);

const postJsonWithPlayer = async (route, buildPayload) => {
  let player = await ensurePlayer();
  try {
    return { data: await postJson(route, buildPayload(player)), player };
  } catch (error) {
    if (!isStalePlayerError(error)) throw error;
  }

  clearStoredPlayer();
  player = await ensurePlayer();
  return { data: await postJson(route, buildPayload(player)), player };
};

export const getLocalPlayer = () => {
  if (!cachedPlayer) cachedPlayer = loadStoredPlayer();
  return cachedPlayer;
};

export const ensurePlayer = async () => {
  const existing = getLocalPlayer();
  if (existing) return existing;
  if (!registerPromise) {
    registerPromise = (async () => {
      const data = await postJson('player-register', {});
      const player = { id: data.player.id, handle: data.player.handle, token: data.token };
      storePlayer(player);
      registerPromise = null;
      return player;
    })().catch((error) => {
      registerPromise = null;
      throw error;
    });
  }
  return registerPromise;
};

export const rerollHandle = async () => {
  const { data, player } = await postJsonWithPlayer('handle-reroll', (current) => ({
    playerId: current.id,
    token: current.token,
  }));
  const next = { ...player, handle: data.player.handle };
  storePlayer(next);
  return next;
};

export const submitScore = async ({ gameSlug, score, challengeId = '', roomCode = '' }) => {
  const { data } = await postJsonWithPlayer('score-submit', (player) => ({
    playerId: player.id,
    token: player.token,
    gameSlug,
    score,
    challengeId,
    roomCode,
  }));
  return data;
};

export const fetchLeaderboard = (gameSlug, period = 'daily') =>
  getJson('leaderboard', { game: gameSlug, period });

export const createChallenge = async ({ gameSlug, score }) => {
  const { data } = await postJsonWithPlayer('challenge-create', (player) => ({
    playerId: player.id,
    token: player.token,
    gameSlug,
    score,
  }));
  return data;
};

export const fetchChallenge = (challengeId) => getJson('challenge-get', { id: challengeId });

export const createRoom = async ({ gameSlug, durationSeconds }) => {
  const { data } = await postJsonWithPlayer('room-create', (player) => ({
    playerId: player.id,
    token: player.token,
    gameSlug,
    durationSeconds,
  }));
  return data;
};

export const joinRoom = async (code) => {
  const { data } = await postJsonWithPlayer('room-join', (player) => ({
    playerId: player.id,
    token: player.token,
    code,
  }));
  return data;
};

export const startRoom = async (code) => {
  const { data } = await postJsonWithPlayer('room-start', (player) => ({
    playerId: player.id,
    token: player.token,
    code,
  }));
  return data;
};

export const fetchRoomState = (code) => getJson('room-state', { code });

export const submitRoomScore = async ({ code, score, finished = false }) => {
  const { data } = await postJsonWithPlayer('room-score', (player) => ({
    playerId: player.id,
    token: player.token,
    code,
    score,
    finished,
  }));
  return data;
};

export const getChallengeIdFromUrl = () => {
  try {
    return new URLSearchParams(window.location.search).get('challenge') || '';
  } catch {
    return '';
  }
};

export const getRoomCodeFromUrl = () => {
  try {
    return new URLSearchParams(window.location.search).get('room') || '';
  } catch {
    return '';
  }
};

// Deterministic emoji avatar derived from a handle, so the same player
// always shows the same face on leaderboards and scoreboards.
const AVATAR_EMOJI = [
  '🦊', '🐼', '🐸', '🦖', '🐙', '🦉', '🐯', '🐧',
  '🦄', '🐲', '🦈', '🐺', '🦜', '🐢', '🦁', '🐹',
];

export const handleEmoji = (handle) => {
  const text = String(handle || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return AVATAR_EMOJI[Math.abs(hash) % AVATAR_EMOJI.length];
};

export const fetchChampions = (slugs) =>
  getJson('champions', { games: Array.isArray(slugs) ? slugs.join(',') : String(slugs || '') });

export const getMyChallenges = () => {
  const stored = get('myChallenges', []);
  return Array.isArray(stored) ? stored : [];
};

export const setMyChallenges = (list) => {
  set('myChallenges', Array.isArray(list) ? list : []);
};
