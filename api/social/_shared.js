const crypto = require("crypto");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const SCORE_MAX = 10_000_000;

// Per-game plausibility ceilings. Scores above these are rejected as
// implausible (anti-cheat). Default applies to any game not listed.
const SCORE_CAP_DEFAULT = 1_000_000;
const SCORE_CAPS = Object.freeze({
  snake: 5_000,
  tetris: 2_000_000,
  flappy: 10_000,
  dino: 100_000,
  2048: 400_000,
  pacman: 1_000_000,
  breakout: 100_000,
  spaceinvaders: 500_000,
  doodlejump: 100_000,
  frogger: 50_000,
  pong: 1_000,
  asteroids: 500_000,
  whackamole: 50_000,
  gemswap: 500_000,
});
const LEADERBOARD_PERIODS = new Set(["daily", "weekly", "alltime"]);
const ROOM_STATUSES = new Set(["lobby", "racing", "finished"]);
const ROOM_MAX_PLAYERS = 12;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const ROOM_DEFAULT_DURATION_SECONDS = 120;
const ROOM_MIN_DURATION_SECONDS = 30;
const ROOM_MAX_DURATION_SECONDS = 600;
const CHALLENGE_BEATEN_LIMIT = 20;

const HANDLE_ADJECTIVES = [
  "Swift", "Cosmic", "Turbo", "Mighty", "Pixel", "Neon", "Lucky", "Rocket",
  "Frosty", "Blazing", "Quantum", "Zippy", "Stellar", "Hyper", "Shadow", "Solar",
  "Crystal", "Thunder", "Nimble", "Galactic", "Electric", "Brave", "Epic", "Wild",
];

const HANDLE_NOUNS = [
  "Comet", "Falcon", "Tiger", "Panda", "Dragon", "Wizard", "Ninja", "Rover",
  "Phoenix", "Otter", "Viper", "Knight", "Wolf", "Hawk", "Robot", "Yeti",
  "Fox", "Shark", "Pilot", "Racer", "Golem", "Sprite", "Meteor", "Lynx",
];

let gamesMetaPromise = null;

function toPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeSingleLine(value, maxLength = 160) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function normalizeSlug(value) {
  return normalizeSingleLine(value, 80).toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function normalizeScore(value) {
  return normalizeInteger(value, { min: 0, max: SCORE_MAX, fallback: -1 });
}

function normalizePeriod(value) {
  const normalized = normalizeSingleLine(value, 24).toLowerCase();
  return LEADERBOARD_PERIODS.has(normalized) ? normalized : "daily";
}

function normalizeHandle(value) {
  const normalized = normalizeSingleLine(value, 32).replace(/[^a-zA-Z0-9]/g, "");
  return normalized.slice(0, 24);
}

function getDayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function getWeekKey(now = Date.now()) {
  const date = new Date(now);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getPeriodKey(period, now = Date.now()) {
  if (period === "daily") return getDayKey(now);
  if (period === "weekly") return getWeekKey(now);
  return "all";
}

function getSocialSecret() {
  const configured = typeof process.env.APP_SESSION_SECRET === "string"
    ? process.env.APP_SESSION_SECRET.trim()
    : "";
  if (configured) return configured;
  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    throw new Error("Missing APP_SESSION_SECRET in production.");
  }
  return "cade-games-dev-social-secret";
}

function createPlayerId() {
  if (typeof crypto.randomUUID === "function") {
    return `plr_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `plr_${crypto.randomBytes(16).toString("hex")}`;
}

function createChallengeId() {
  return `ch_${crypto.randomBytes(6).toString("hex")}`;
}

function createRoomCode() {
  return String(crypto.randomInt(1000, 10000));
}

function signPlayerToken(playerId) {
  const normalized = normalizeSingleLine(playerId, 80);
  if (!normalized) return "";
  return crypto
    .createHmac("sha256", getSocialSecret())
    .update(`social-player:${normalized}`)
    .digest("hex")
    .slice(0, 40);
}

function verifyPlayerToken(playerId, token) {
  const expected = signPlayerToken(playerId);
  const provided = normalizeSingleLine(token, 80);
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function generateHandle() {
  const adjective = HANDLE_ADJECTIVES[crypto.randomInt(HANDLE_ADJECTIVES.length)];
  const noun = HANDLE_NOUNS[crypto.randomInt(HANDLE_NOUNS.length)];
  const digits = crypto.randomInt(10, 100);
  return `${adjective}${noun}${digits}`;
}

async function loadGamesMeta() {
  if (!gamesMetaPromise) {
    const gamesMetaPath = path.join(process.cwd(), "src", "meta", "games.js");
    gamesMetaPromise = import(pathToFileURL(gamesMetaPath).href);
  }
  return gamesMetaPromise;
}

async function isKnownGameSlug(slug) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return false;
  try {
    const module = await loadGamesMeta();
    const games = Array.isArray(module.GAMES) ? module.GAMES : [];
    return games.some((game) => game.slug === normalized);
  } catch {
    return false;
  }
}

function getScoreCap(slug) {
  const normalized = normalizeSlug(slug);
  const cap = SCORE_CAPS[normalized];
  return Number.isFinite(cap) ? cap : SCORE_CAP_DEFAULT;
}

function getRequestIp(req) {
  const forwardedFor = typeof req?.headers?.["x-forwarded-for"] === "string"
    ? req.headers["x-forwarded-for"]
    : "";
  if (forwardedFor) {
    return normalizeSingleLine(forwardedFor.split(",")[0], 160);
  }
  const realIp = typeof req?.headers?.["x-real-ip"] === "string"
    ? req.headers["x-real-ip"]
    : "";
  if (realIp) {
    return normalizeSingleLine(realIp, 160);
  }
  return normalizeSingleLine(req?.socket?.remoteAddress || "", 160);
}

function getQuery(req) {
  const requestUrl = req?.url || "/";
  const parsed = new URL(requestUrl, "http://localhost");
  const query = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    query[key] = value;
  }
  return query;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("invalid_json");
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, error, code, extra = {}) {
  sendJson(res, statusCode, { ok: false, error, code, ...extra });
}

module.exports = {
  CHALLENGE_BEATEN_LIMIT,
  LEADERBOARD_PERIODS,
  ROOM_DEFAULT_DURATION_SECONDS,
  ROOM_MAX_DURATION_SECONDS,
  ROOM_MAX_PLAYERS,
  ROOM_MIN_DURATION_SECONDS,
  ROOM_STATUSES,
  ROOM_TTL_MS,
  SCORE_MAX,
  createChallengeId,
  createPlayerId,
  createRoomCode,
  generateHandle,
  getDayKey,
  getPeriodKey,
  getQuery,
  getRequestIp,
  getScoreCap,
  getWeekKey,
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
};
