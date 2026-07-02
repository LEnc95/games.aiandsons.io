const {
  ROOM_DEFAULT_DURATION_SECONDS,
  ROOM_MAX_DURATION_SECONDS,
  ROOM_MAX_PLAYERS,
  ROOM_MIN_DURATION_SECONDS,
  createChallengeId,
  createPlayerId,
  createRoomCode,
  generateHandle,
  getPeriodKey,
  getQuery,
  isKnownGameSlug,
  normalizeHandle,
  normalizeInteger,
  normalizePeriod,
  normalizeScore,
  normalizeSingleLine,
  normalizeSlug,
  readJsonBody,
  sendError,
  sendJson,
  signPlayerToken,
  toPlainObject,
  verifyPlayerToken,
} = require("./social/_shared");

const {
  getChallenge,
  getLeaderboardRank,
  getPlayer,
  getRoom,
  getSave,
  listLeaderboard,
  recordChallengeAttempt,
  roomCodeAvailable,
  saveChallenge,
  savePlayer,
  saveRoom,
  saveSave,
  submitScoreEntry,
} = require("./social/_store");

const { getSessionFromRequest } = require("./auth/_session");
const {
  handleDiscoveryEvents,
  handleDiscoveryRankings,
} = require("./discovery/_handlers");

const LEADERBOARD_LIMIT = 20;
const SAVE_MAX_BYTES = 64 * 1024;

function getRequestedRoute(req) {
  const query = getQuery(req);
  const fromQuery = typeof query.route === "string" ? query.route.trim().toLowerCase() : "";
  if (fromQuery) {
    return fromQuery.replace(/^\/+|\/+$/g, "");
  }
  const requestUrl = req?.url || "/";
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  const prefix = "/api/social/";
  if (!pathname.startsWith(prefix)) return "";
  return pathname.slice(prefix.length).replace(/^\/+|\/+$/g, "").toLowerCase();
}

async function readBody(req, res) {
  try {
    return await readJsonBody(req);
  } catch {
    sendError(res, 400, "Request body must be valid JSON.", "invalid_json");
    return null;
  }
}

async function requirePlayer(req, res, body) {
  const playerId = normalizeSingleLine(body.playerId, 80);
  const token = normalizeSingleLine(body.token, 80);
  if (!playerId || !verifyPlayerToken(playerId, token)) {
    sendError(res, 401, "Invalid or missing player credentials.", "invalid_player_token");
    return null;
  }
  const player = await getPlayer(playerId);
  if (!player) {
    sendError(res, 404, "Unknown player. Register first.", "unknown_player");
    return null;
  }
  return player;
}

async function requireKnownGame(res, slug) {
  const normalized = normalizeSlug(slug);
  if (!normalized || !(await isKnownGameSlug(normalized))) {
    sendError(res, 400, "Unknown game.", "invalid_game");
    return "";
  }
  return normalized;
}

function publicRoom(room) {
  const players = Object.values(room.players)
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
    .map((player) => ({
      playerId: player.playerId,
      handle: player.handle,
      score: player.score,
      finished: player.finished,
    }));
  return {
    code: room.code,
    gameSlug: room.gameSlug,
    hostPlayerId: room.hostPlayerId,
    status: room.status,
    durationSeconds: room.durationSeconds,
    startedAt: room.startedAt,
    endsAt: room.endsAt,
    serverNow: Date.now(),
    players,
  };
}

function maybeFinishRoom(room) {
  if (room.status === "racing" && room.endsAt && Date.now() >= room.endsAt) {
    return { ...room, status: "finished" };
  }
  return room;
}

// --- Route handlers ---

async function handlePlayerRegister(req, res) {
  const body = await readBody(req, res);
  if (!body) return;

  const existingId = normalizeSingleLine(body.playerId, 80);
  const existingToken = normalizeSingleLine(body.token, 80);
  if (existingId && verifyPlayerToken(existingId, existingToken)) {
    const existing = await getPlayer(existingId);
    if (existing) {
      return sendJson(res, 200, {
        ok: true,
        player: { id: existing.id, handle: existing.handle },
        token: existingToken,
      });
    }
  }

  const player = await savePlayer({
    id: createPlayerId(),
    handle: generateHandle(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return sendJson(res, 200, {
    ok: true,
    player: { id: player.id, handle: player.handle },
    token: signPlayerToken(player.id),
  });
}

async function handleHandleReroll(req, res) {
  const body = await readBody(req, res);
  if (!body) return;
  const player = await requirePlayer(req, res, body);
  if (!player) return;

  const updated = await savePlayer({
    ...player,
    handle: generateHandle(),
    updatedAt: Date.now(),
  });
  return sendJson(res, 200, { ok: true, player: { id: updated.id, handle: updated.handle } });
}

async function handleScoreSubmit(req, res) {
  const body = await readBody(req, res);
  if (!body) return;
  const player = await requirePlayer(req, res, body);
  if (!player) return;
  const gameSlug = await requireKnownGame(res, body.gameSlug);
  if (!gameSlug) return;

  const score = normalizeScore(body.score);
  if (score < 0) {
    return sendError(res, 400, "Score must be a non-negative number.", "invalid_score");
  }

  const now = Date.now();
  const periods = ["daily", "weekly", "alltime"];
  await Promise.all(periods.map((period) => submitScoreEntry({
    gameSlug,
    period,
    periodKey: getPeriodKey(period, now),
    playerId: player.id,
    handle: player.handle,
    score,
  })));

  const dailyKey = getPeriodKey("daily", now);
  const [rank, top] = await Promise.all([
    getLeaderboardRank({ gameSlug, periodKey: dailyKey, score }),
    listLeaderboard({ gameSlug, periodKey: dailyKey, limit: LEADERBOARD_LIMIT }),
  ]);

  let challengeResult = null;
  const challengeId = normalizeSingleLine(body.challengeId, 40);
  if (challengeId) {
    const result = await recordChallengeAttempt(challengeId, { handle: player.handle, score });
    if (result && result.challenge.gameSlug === gameSlug) {
      challengeResult = {
        id: result.challenge.id,
        beaten: result.beaten,
        targetHandle: result.challenge.handle,
        targetScore: result.challenge.score,
      };
    }
  }

  let roomResult = null;
  const roomCode = normalizeSingleLine(body.roomCode, 8);
  if (roomCode) {
    const room = await getRoom(roomCode);
    if (room && room.gameSlug === gameSlug && room.players[player.id] && room.status === "racing") {
      const existing = room.players[player.id];
      room.players[player.id] = {
        ...existing,
        score: Math.max(existing.score, score),
        finished: true,
        updatedAt: Date.now(),
      };
      const updated = await saveRoom(maybeFinishRoom(room));
      roomResult = publicRoom(updated);
    }
  }

  return sendJson(res, 200, {
    ok: true,
    score,
    daily: {
      rank,
      top: top.map((entry) => ({ handle: entry.handle, score: entry.score })),
    },
    challenge: challengeResult,
    room: roomResult,
  });
}

async function handleLeaderboard(req, res) {
  const query = getQuery(req);
  const gameSlug = await requireKnownGame(res, query.game || query.gameSlug);
  if (!gameSlug) return;
  const period = normalizePeriod(query.period);
  const periodKey = getPeriodKey(period);
  const top = await listLeaderboard({ gameSlug, periodKey, limit: LEADERBOARD_LIMIT });
  return sendJson(res, 200, {
    ok: true,
    gameSlug,
    period,
    periodKey,
    top: top.map((entry) => ({ handle: entry.handle, score: entry.score })),
  });
}

async function handleChallengeCreate(req, res) {
  const body = await readBody(req, res);
  if (!body) return;
  const player = await requirePlayer(req, res, body);
  if (!player) return;
  const gameSlug = await requireKnownGame(res, body.gameSlug);
  if (!gameSlug) return;
  const score = normalizeScore(body.score);
  if (score < 0) {
    return sendError(res, 400, "Score must be a non-negative number.", "invalid_score");
  }

  const challenge = await saveChallenge({
    id: createChallengeId(),
    gameSlug,
    playerId: player.id,
    handle: player.handle,
    score,
    createdAt: Date.now(),
    attempts: 0,
    beatenBy: [],
  });

  return sendJson(res, 200, {
    ok: true,
    challenge: {
      id: challenge.id,
      gameSlug: challenge.gameSlug,
      handle: challenge.handle,
      score: challenge.score,
      url: `/${challenge.gameSlug}?challenge=${encodeURIComponent(challenge.id)}`,
    },
  });
}

async function handleChallengeGet(req, res) {
  const query = getQuery(req);
  const challenge = await getChallenge(query.id);
  if (!challenge) {
    return sendError(res, 404, "Challenge not found.", "challenge_not_found");
  }
  return sendJson(res, 200, {
    ok: true,
    challenge: {
      id: challenge.id,
      gameSlug: challenge.gameSlug,
      handle: challenge.handle,
      score: challenge.score,
      attempts: challenge.attempts,
      beatenBy: challenge.beatenBy,
    },
  });
}

async function handleRoomCreate(req, res) {
  const body = await readBody(req, res);
  if (!body) return;
  const player = await requirePlayer(req, res, body);
  if (!player) return;
  const gameSlug = await requireKnownGame(res, body.gameSlug);
  if (!gameSlug) return;

  const durationSeconds = normalizeInteger(body.durationSeconds, {
    min: ROOM_MIN_DURATION_SECONDS,
    max: ROOM_MAX_DURATION_SECONDS,
    fallback: ROOM_DEFAULT_DURATION_SECONDS,
  });

  let code = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = createRoomCode();
    if (await roomCodeAvailable(candidate)) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    return sendError(res, 503, "Could not allocate a room code. Try again.", "room_code_unavailable");
  }

  const now = Date.now();
  const room = await saveRoom({
    code,
    gameSlug,
    hostPlayerId: player.id,
    status: "lobby",
    durationSeconds,
    createdAt: now,
    startedAt: 0,
    endsAt: 0,
    players: {
      [player.id]: {
        playerId: player.id,
        handle: player.handle,
        score: 0,
        finished: false,
        joinedAt: now,
        updatedAt: now,
      },
    },
  });

  return sendJson(res, 200, { ok: true, room: publicRoom(room) });
}

async function handleRoomJoin(req, res) {
  const body = await readBody(req, res);
  if (!body) return;
  const player = await requirePlayer(req, res, body);
  if (!player) return;

  const room = await getRoom(body.code);
  if (!room) {
    return sendError(res, 404, "Room not found. Check the code.", "room_not_found");
  }
  if (room.status === "finished") {
    return sendError(res, 409, "This race has already finished.", "room_finished");
  }
  if (!room.players[player.id] && Object.keys(room.players).length >= ROOM_MAX_PLAYERS) {
    return sendError(res, 409, "Room is full.", "room_full");
  }

  const now = Date.now();
  if (!room.players[player.id]) {
    room.players[player.id] = {
      playerId: player.id,
      handle: player.handle,
      score: 0,
      finished: false,
      joinedAt: now,
      updatedAt: now,
    };
  } else {
    room.players[player.id] = { ...room.players[player.id], handle: player.handle, updatedAt: now };
  }

  const updated = await saveRoom(maybeFinishRoom(room));
  return sendJson(res, 200, { ok: true, room: publicRoom(updated) });
}

async function handleRoomStart(req, res) {
  const body = await readBody(req, res);
  if (!body) return;
  const player = await requirePlayer(req, res, body);
  if (!player) return;

  const room = await getRoom(body.code);
  if (!room) {
    return sendError(res, 404, "Room not found.", "room_not_found");
  }
  if (room.hostPlayerId !== player.id) {
    return sendError(res, 403, "Only the host can start the race.", "not_host");
  }
  if (room.status !== "lobby") {
    return sendError(res, 409, "Race already started.", "room_already_started");
  }

  const now = Date.now();
  const updated = await saveRoom({
    ...room,
    status: "racing",
    startedAt: now,
    endsAt: now + room.durationSeconds * 1000,
  });
  return sendJson(res, 200, { ok: true, room: publicRoom(updated) });
}

async function handleRoomState(req, res) {
  const query = getQuery(req);
  const room = await getRoom(query.code);
  if (!room) {
    return sendError(res, 404, "Room not found.", "room_not_found");
  }
  const checked = maybeFinishRoom(room);
  if (checked.status !== room.status) {
    await saveRoom(checked);
  }
  return sendJson(res, 200, { ok: true, room: publicRoom(checked) });
}

async function handleRoomScore(req, res) {
  const body = await readBody(req, res);
  if (!body) return;
  const player = await requirePlayer(req, res, body);
  if (!player) return;

  const room = await getRoom(body.code);
  if (!room) {
    return sendError(res, 404, "Room not found.", "room_not_found");
  }
  if (!room.players[player.id]) {
    return sendError(res, 403, "Join the room before submitting a score.", "not_in_room");
  }
  if (room.status !== "racing") {
    return sendError(res, 409, "Race is not running.", "room_not_racing");
  }

  const score = normalizeScore(body.score);
  if (score < 0) {
    return sendError(res, 400, "Score must be a non-negative number.", "invalid_score");
  }

  const existing = room.players[player.id];
  room.players[player.id] = {
    ...existing,
    score: Math.max(existing.score, score),
    finished: body.finished === true || existing.finished,
    updatedAt: Date.now(),
  };

  const updated = await saveRoom(maybeFinishRoom(room));
  return sendJson(res, 200, { ok: true, room: publicRoom(updated) });
}

function requireGoogleSession(req, res) {
  const session = getSessionFromRequest(req);
  if (!session || !session.isAuthenticated) {
    sendError(res, 401, "Sign in with Google to sync progress.", "not_signed_in");
    return null;
  }
  return session;
}

async function handleSyncPull(req, res) {
  const session = requireGoogleSession(req, res);
  if (!session) return;
  const save = await getSave(session.firebaseUid || session.userId);
  return sendJson(res, 200, {
    ok: true,
    save: save ? { data: save.data, updatedAt: save.updatedAt } : null,
  });
}

async function handleSyncPush(req, res) {
  const session = requireGoogleSession(req, res);
  if (!session) return;
  const body = await readBody(req, res);
  if (!body) return;

  const data = toPlainObject(body.data);
  const serialized = JSON.stringify(data);
  if (serialized.length > SAVE_MAX_BYTES) {
    return sendError(res, 413, "Save data too large.", "save_too_large");
  }

  const save = await saveSave({
    userId: session.firebaseUid || session.userId,
    data,
    updatedAt: Date.now(),
  });
  return sendJson(res, 200, { ok: true, updatedAt: save.updatedAt });
}

module.exports = async function handler(req, res) {
  const route = getRequestedRoute(req);

  try {
    switch (route) {
      case "player-register":
        return await handlePlayerRegister(req, res);
      case "handle-reroll":
        return await handleHandleReroll(req, res);
      case "score-submit":
        return await handleScoreSubmit(req, res);
      case "leaderboard":
        return await handleLeaderboard(req, res);
      case "challenge-create":
        return await handleChallengeCreate(req, res);
      case "challenge-get":
        return await handleChallengeGet(req, res);
      case "room-create":
        return await handleRoomCreate(req, res);
      case "room-join":
        return await handleRoomJoin(req, res);
      case "room-start":
        return await handleRoomStart(req, res);
      case "room-state":
        return await handleRoomState(req, res);
      case "room-score":
        return await handleRoomScore(req, res);
      case "sync-pull":
        return await handleSyncPull(req, res);
      case "sync-push":
        return await handleSyncPush(req, res);
      case "discovery-events":
        return await handleDiscoveryEvents(req, res);
      case "discovery-rankings":
        return await handleDiscoveryRankings(req, res);
      default:
        return sendError(res, 404, "Social route not found.", "social_route_not_found");
    }
  } catch (error) {
    const message = error && error.message === "firebase_not_configured"
      ? "Social backend is not configured."
      : "Unexpected social API error.";
    return sendError(res, 500, message, "social_internal_error");
  }
};
