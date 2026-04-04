// @ts-check

const crypto = require("crypto");

const GAME_COOKIE_NAME = "cade_pd_state";
const GAME_COOKIE_VERSION = 1;
const GAME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

let cachedSecret = "";

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const normalized = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + "=".repeat(padding), "base64");
}

function getSigningSecret() {
  if (cachedSecret) {
    return cachedSecret;
  }

  const configured = typeof process.env.APP_SESSION_SECRET === "string"
    ? process.env.APP_SESSION_SECRET.trim()
    : "";
  if (configured) {
    cachedSecret = configured;
    return cachedSecret;
  }

  const stripeSeed = typeof process.env.STRIPE_SECRET_KEY === "string"
    ? process.env.STRIPE_SECRET_KEY.trim()
    : "";
  if (stripeSeed) {
    cachedSecret = `stripe_seed_${stripeSeed}`;
    return cachedSecret;
  }

  cachedSecret = "cade-games-dev-session-secret";
  return cachedSecret;
}

function signValue(encodedPayload) {
  return base64UrlEncode(
    crypto.createHmac("sha256", getSigningSecret()).update(encodedPayload).digest(),
  );
}

function parseCookies(req) {
  const raw = req?.headers?.cookie;
  if (typeof raw !== "string" || !raw) {
    return {};
  }

  const cookies = {};
  for (const part of raw.split(";")) {
    const [nameRaw, ...rest] = part.split("=");
    const name = String(nameRaw || "").trim();
    if (!name) {
      continue;
    }
    cookies[name] = rest.join("=").trim();
  }
  return cookies;
}

function isSecureRequest(req) {
  const forwardedProto = req?.headers?.["x-forwarded-proto"];
  if (typeof forwardedProto === "string") {
    return forwardedProto.split(",")[0].trim() === "https";
  }
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function appendSetCookieHeader(res, cookieValue) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }

  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookieValue]);
    return;
  }

  res.setHeader("Set-Cookie", [existing, cookieValue]);
}

function serializeCookie(name, value, req, maxAgeSeconds) {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (isSecureRequest(req)) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/**
 * @param {import("./_state").GameState} state
 * @param {string} userId
 * @returns {string}
 */
function encodeGameState(state, userId) {
  const payload = {
    version: GAME_COOKIE_VERSION,
    uid: userId,
    state,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signValue(encodedPayload);
  const token = `${encodedPayload}.${signature}`;
  if (token.length > 3800) {
    throw new Error("Prisoner's Dilemma state cookie exceeds safe size limits.");
  }
  return token;
}

/**
 * @param {string} token
 * @returns {{ version: number, uid: string, state: unknown } | null}
 */
function decodeGameState(token) {
  if (typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const [encodedPayload, encodedSignature] = token.split(".", 2);
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const expectedSignature = signValue(encodedPayload);
  const actualBuffer = Buffer.from(encodedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (actualBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const uid = typeof payload.uid === "string" ? payload.uid.trim() : "";
    if (!uid) {
      return null;
    }

    return {
      version: Number(payload.version) || 0,
      uid,
      state: payload.state,
    };
  } catch {
    return null;
  }
}

/**
 * @param {import("http").IncomingMessage & { headers: Record<string, string | string[] | undefined> }} req
 * @param {string} userId
 */
function readGameState(req, userId) {
  const cookies = parseCookies(req);
  const rawCookie = cookies[GAME_COOKIE_NAME];
  const decoded = decodeGameState(rawCookie);
  if (!decoded || decoded.uid !== userId || decoded.version !== GAME_COOKIE_VERSION) {
    return null;
  }
  return decoded.state;
}

/**
 * @param {import("http").ServerResponse} res
 * @param {import("http").IncomingMessage} req
 * @param {string} userId
 * @param {import("./_state").GameState} state
 */
function writeGameState(res, req, userId, state) {
  const token = encodeGameState(state, userId);
  appendSetCookieHeader(res, serializeCookie(GAME_COOKIE_NAME, token, req, GAME_COOKIE_MAX_AGE_SECONDS));
}

/**
 * @param {import("http").ServerResponse} res
 * @param {import("http").IncomingMessage} req
 */
function clearGameState(res, req) {
  appendSetCookieHeader(res, serializeCookie(GAME_COOKIE_NAME, "", req, 0));
}

module.exports = {
  clearGameState,
  GAME_COOKIE_NAME,
  readGameState,
  writeGameState,
};
