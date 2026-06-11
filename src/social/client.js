// Client for /api/social/* — player identity, scores, challenges, rooms.
import { get, set } from '../core/storage.js';

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
  const player = await ensurePlayer();
  const data = await postJson('handle-reroll', { playerId: player.id, token: player.token });
  const next = { ...player, handle: data.player.handle };
  storePlayer(next);
  return next;
};

export const submitScore = async ({ gameSlug, score, challengeId = '', roomCode = '' }) => {
  const player = await ensurePlayer();
  return postJson('score-submit', {
    playerId: player.id,
    token: player.token,
    gameSlug,
    score,
    challengeId,
    roomCode,
  });
};

export const fetchLeaderboard = (gameSlug, period = 'daily') =>
  getJson('leaderboard', { game: gameSlug, period });

export const createChallenge = async ({ gameSlug, score }) => {
  const player = await ensurePlayer();
  return postJson('challenge-create', {
    playerId: player.id,
    token: player.token,
    gameSlug,
    score,
  });
};

export const fetchChallenge = (challengeId) => getJson('challenge-get', { id: challengeId });

export const createRoom = async ({ gameSlug, durationSeconds }) => {
  const player = await ensurePlayer();
  return postJson('room-create', {
    playerId: player.id,
    token: player.token,
    gameSlug,
    durationSeconds,
  });
};

export const joinRoom = async (code) => {
  const player = await ensurePlayer();
  return postJson('room-join', { playerId: player.id, token: player.token, code });
};

export const startRoom = async (code) => {
  const player = await ensurePlayer();
  return postJson('room-start', { playerId: player.id, token: player.token, code });
};

export const fetchRoomState = (code) => getJson('room-state', { code });

export const submitRoomScore = async ({ code, score, finished = false }) => {
  const player = await ensurePlayer();
  return postJson('room-score', {
    playerId: player.id,
    token: player.token,
    code,
    score,
    finished,
  });
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
