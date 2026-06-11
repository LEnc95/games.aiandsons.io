const { getFirestore, isFirebaseAdminConfigured } = require("../_firebase-admin");
const {
  CHALLENGE_BEATEN_LIMIT,
  ROOM_MAX_PLAYERS,
  ROOM_TTL_MS,
  normalizeHandle,
  normalizeInteger,
  normalizeScore,
  normalizeSingleLine,
  normalizeSlug,
  toPlainObject,
} = require("./_shared");

const PLAYERS_COLLECTION = "socialPlayers";
const SCORES_COLLECTION = "socialScores";
const CHALLENGES_COLLECTION = "socialChallenges";
const ROOMS_COLLECTION = "socialRooms";
const SAVES_COLLECTION = "socialSaves";
const LEADERBOARD_SCAN_LIMIT = 500;

const memoryState = (() => {
  if (!globalThis.__cadeSocialMemoryStore) {
    globalThis.__cadeSocialMemoryStore = {
      players: new Map(),
      scores: new Map(),
      challenges: new Map(),
      rooms: new Map(),
      saves: new Map(),
    };
  }
  return globalThis.__cadeSocialMemoryStore;
})();

function isFirestoreStoreEnabled() {
  return isFirebaseAdminConfigured();
}

function getCollections() {
  const firestore = getFirestore();
  return {
    players: firestore.collection(PLAYERS_COLLECTION),
    scores: firestore.collection(SCORES_COLLECTION),
    challenges: firestore.collection(CHALLENGES_COLLECTION),
    rooms: firestore.collection(ROOMS_COLLECTION),
    saves: firestore.collection(SAVES_COLLECTION),
  };
}

function normalizeStoredPlayer(source) {
  const raw = toPlainObject(source);
  return {
    id: normalizeSingleLine(raw.id, 80),
    handle: normalizeHandle(raw.handle),
    createdAt: normalizeInteger(raw.createdAt, { min: 0, fallback: Date.now() }),
    updatedAt: normalizeInteger(raw.updatedAt, { min: 0, fallback: Date.now() }),
  };
}

function normalizeStoredScore(source) {
  const raw = toPlainObject(source);
  return {
    gameSlug: normalizeSlug(raw.gameSlug),
    periodKey: normalizeSingleLine(raw.periodKey, 24),
    period: normalizeSingleLine(raw.period, 24),
    playerId: normalizeSingleLine(raw.playerId, 80),
    handle: normalizeHandle(raw.handle),
    score: Math.max(0, normalizeScore(raw.score)),
    updatedAt: normalizeInteger(raw.updatedAt, { min: 0, fallback: Date.now() }),
  };
}

function normalizeStoredChallenge(source) {
  const raw = toPlainObject(source);
  const beatenBy = Array.isArray(raw.beatenBy) ? raw.beatenBy : [];
  return {
    id: normalizeSingleLine(raw.id, 40),
    gameSlug: normalizeSlug(raw.gameSlug),
    playerId: normalizeSingleLine(raw.playerId, 80),
    handle: normalizeHandle(raw.handle),
    score: Math.max(0, normalizeScore(raw.score)),
    createdAt: normalizeInteger(raw.createdAt, { min: 0, fallback: Date.now() }),
    attempts: normalizeInteger(raw.attempts, { min: 0, fallback: 0 }),
    beatenBy: beatenBy
      .map((entry) => {
        const item = toPlainObject(entry);
        return {
          handle: normalizeHandle(item.handle),
          score: Math.max(0, normalizeScore(item.score)),
          at: normalizeInteger(item.at, { min: 0, fallback: 0 }),
        };
      })
      .filter((entry) => entry.handle)
      .slice(0, CHALLENGE_BEATEN_LIMIT),
  };
}

function normalizeStoredRoomPlayer(source) {
  const raw = toPlainObject(source);
  return {
    playerId: normalizeSingleLine(raw.playerId, 80),
    handle: normalizeHandle(raw.handle),
    score: Math.max(0, normalizeScore(raw.score)),
    finished: raw.finished === true,
    joinedAt: normalizeInteger(raw.joinedAt, { min: 0, fallback: Date.now() }),
    updatedAt: normalizeInteger(raw.updatedAt, { min: 0, fallback: Date.now() }),
  };
}

function normalizeStoredRoom(source) {
  const raw = toPlainObject(source);
  const playersRaw = toPlainObject(raw.players);
  const players = {};
  for (const [key, value] of Object.entries(playersRaw).slice(0, ROOM_MAX_PLAYERS)) {
    const normalizedKey = normalizeSingleLine(key, 80);
    if (!normalizedKey) continue;
    players[normalizedKey] = normalizeStoredRoomPlayer(value);
  }
  const status = ["lobby", "racing", "finished"].includes(raw.status) ? raw.status : "lobby";
  return {
    code: normalizeSingleLine(raw.code, 8),
    gameSlug: normalizeSlug(raw.gameSlug),
    hostPlayerId: normalizeSingleLine(raw.hostPlayerId, 80),
    status,
    durationSeconds: normalizeInteger(raw.durationSeconds, { min: 30, max: 600, fallback: 120 }),
    createdAt: normalizeInteger(raw.createdAt, { min: 0, fallback: Date.now() }),
    startedAt: normalizeInteger(raw.startedAt, { min: 0, fallback: 0 }),
    endsAt: normalizeInteger(raw.endsAt, { min: 0, fallback: 0 }),
    players,
  };
}

function normalizeStoredSave(source) {
  const raw = toPlainObject(source);
  return {
    userId: normalizeSingleLine(raw.userId, 160),
    updatedAt: normalizeInteger(raw.updatedAt, { min: 0, fallback: Date.now() }),
    data: toPlainObject(raw.data),
  };
}

function isRoomExpired(room, now = Date.now()) {
  return !room.createdAt || now - room.createdAt > ROOM_TTL_MS;
}

// --- Players ---

async function getPlayer(playerId) {
  const id = normalizeSingleLine(playerId, 80);
  if (!id) return null;
  if (isFirestoreStoreEnabled()) {
    const snapshot = await getCollections().players.doc(id).get();
    if (!snapshot.exists) return null;
    return normalizeStoredPlayer(snapshot.data());
  }
  const stored = memoryState.players.get(id);
  return stored ? normalizeStoredPlayer(stored) : null;
}

async function savePlayer(player) {
  const normalized = normalizeStoredPlayer(player);
  if (!normalized.id) return null;
  if (isFirestoreStoreEnabled()) {
    await getCollections().players.doc(normalized.id).set(normalized, { merge: true });
    return normalized;
  }
  memoryState.players.set(normalized.id, normalized);
  return normalized;
}

// --- Scores / leaderboards ---

function getScoreDocId(gameSlug, periodKey, playerId) {
  return `${gameSlug}__${periodKey}__${playerId}`;
}

async function submitScoreEntry({ gameSlug, period, periodKey, playerId, handle, score }) {
  const entry = normalizeStoredScore({ gameSlug, period, periodKey, playerId, handle, score, updatedAt: Date.now() });
  if (!entry.gameSlug || !entry.periodKey || !entry.playerId) return null;
  const docId = getScoreDocId(entry.gameSlug, entry.periodKey, entry.playerId);

  if (isFirestoreStoreEnabled()) {
    const ref = getCollections().scores.doc(docId);
    const firestore = getFirestore();
    return firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const existing = snapshot.exists ? normalizeStoredScore(snapshot.data()) : null;
      if (existing && existing.score >= entry.score) {
        if (existing.handle !== entry.handle && entry.handle) {
          transaction.set(ref, { handle: entry.handle }, { merge: true });
        }
        return existing;
      }
      transaction.set(ref, entry, { merge: true });
      return entry;
    });
  }

  const existing = memoryState.scores.get(docId);
  if (existing && normalizeStoredScore(existing).score >= entry.score) {
    const kept = normalizeStoredScore(existing);
    if (entry.handle && kept.handle !== entry.handle) {
      kept.handle = entry.handle;
      memoryState.scores.set(docId, kept);
    }
    return kept;
  }
  memoryState.scores.set(docId, entry);
  return entry;
}

async function listLeaderboard({ gameSlug, periodKey, limit = 20 }) {
  const slug = normalizeSlug(gameSlug);
  const period = normalizeSingleLine(periodKey, 24);
  const max = normalizeInteger(limit, { min: 1, max: 100, fallback: 20 });
  if (!slug || !period) return [];
  const prefix = `${slug}__${period}__`;

  let entries = [];
  if (isFirestoreStoreEnabled()) {
    const { FieldPath } = require("firebase-admin").firestore;
    const snapshot = await getCollections().scores
      .where(FieldPath.documentId(), ">=", prefix)
      .where(FieldPath.documentId(), "<", `${prefix}`)
      .limit(LEADERBOARD_SCAN_LIMIT)
      .get();
    entries = snapshot.docs.map((doc) => normalizeStoredScore(doc.data()));
  } else {
    for (const [key, value] of memoryState.scores.entries()) {
      if (key.startsWith(prefix)) entries.push(normalizeStoredScore(value));
    }
  }

  return entries
    .sort((a, b) => b.score - a.score || a.updatedAt - b.updatedAt)
    .slice(0, max);
}

async function getLeaderboardRank({ gameSlug, periodKey, score }) {
  const entries = await listLeaderboard({ gameSlug, periodKey, limit: 100 });
  const better = entries.filter((entry) => entry.score > score).length;
  return better + 1;
}

// --- Challenges ---

async function getChallenge(challengeId) {
  const id = normalizeSingleLine(challengeId, 40);
  if (!id) return null;
  if (isFirestoreStoreEnabled()) {
    const snapshot = await getCollections().challenges.doc(id).get();
    if (!snapshot.exists) return null;
    return normalizeStoredChallenge(snapshot.data());
  }
  const stored = memoryState.challenges.get(id);
  return stored ? normalizeStoredChallenge(stored) : null;
}

async function saveChallenge(challenge) {
  const normalized = normalizeStoredChallenge(challenge);
  if (!normalized.id) return null;
  if (isFirestoreStoreEnabled()) {
    await getCollections().challenges.doc(normalized.id).set(normalized, { merge: true });
    return normalized;
  }
  memoryState.challenges.set(normalized.id, normalized);
  return normalized;
}

async function recordChallengeAttempt(challengeId, { handle, score }) {
  const challenge = await getChallenge(challengeId);
  if (!challenge) return null;
  const attemptScore = Math.max(0, normalizeScore(score));
  const beaten = attemptScore > challenge.score;
  const next = {
    ...challenge,
    attempts: challenge.attempts + 1,
    beatenBy: beaten
      ? [
        { handle: normalizeHandle(handle), score: attemptScore, at: Date.now() },
        ...challenge.beatenBy,
      ].slice(0, CHALLENGE_BEATEN_LIMIT)
      : challenge.beatenBy,
  };
  await saveChallenge(next);
  return { challenge: next, beaten };
}

// --- Rooms ---

async function getRoom(code) {
  const normalizedCode = normalizeSingleLine(code, 8);
  if (!normalizedCode) return null;
  let room = null;
  if (isFirestoreStoreEnabled()) {
    const snapshot = await getCollections().rooms.doc(normalizedCode).get();
    if (snapshot.exists) room = normalizeStoredRoom(snapshot.data());
  } else {
    const stored = memoryState.rooms.get(normalizedCode);
    if (stored) room = normalizeStoredRoom(stored);
  }
  if (!room || isRoomExpired(room)) return null;
  return room;
}

async function saveRoom(room) {
  const normalized = normalizeStoredRoom(room);
  if (!normalized.code) return null;
  if (isFirestoreStoreEnabled()) {
    await getCollections().rooms.doc(normalized.code).set(normalized);
    return normalized;
  }
  memoryState.rooms.set(normalized.code, normalized);
  return normalized;
}

async function roomCodeAvailable(code) {
  const existing = await getRoom(code);
  return !existing;
}

// --- Cloud saves ---

async function getSave(userId) {
  const id = normalizeSingleLine(userId, 160);
  if (!id) return null;
  if (isFirestoreStoreEnabled()) {
    const snapshot = await getCollections().saves.doc(encodeURIComponent(id)).get();
    if (!snapshot.exists) return null;
    return normalizeStoredSave(snapshot.data());
  }
  const stored = memoryState.saves.get(id);
  return stored ? normalizeStoredSave(stored) : null;
}

async function saveSave(save) {
  const normalized = normalizeStoredSave(save);
  if (!normalized.userId) return null;
  if (isFirestoreStoreEnabled()) {
    await getCollections().saves.doc(encodeURIComponent(normalized.userId)).set(normalized);
    return normalized;
  }
  memoryState.saves.set(normalized.userId, normalized);
  return normalized;
}

function __resetSocialStoreForTests() {
  memoryState.players.clear();
  memoryState.scores.clear();
  memoryState.challenges.clear();
  memoryState.rooms.clear();
  memoryState.saves.clear();
}

module.exports = {
  __resetSocialStoreForTests,
  getChallenge,
  getLeaderboardRank,
  getPlayer,
  getRoom,
  getSave,
  isRoomExpired,
  listLeaderboard,
  normalizeStoredChallenge,
  normalizeStoredPlayer,
  normalizeStoredRoom,
  normalizeStoredSave,
  normalizeStoredScore,
  recordChallengeAttempt,
  roomCodeAvailable,
  saveChallenge,
  savePlayer,
  saveRoom,
  saveSave,
  submitScoreEntry,
};
