const crypto = require("crypto");

const SESSION_COOKIE_NAME = "cade_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 180;
const SESSION_VERSION = 2;

let cachedSecret = "";

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const padded = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const neededPadding = (4 - (padded.length % 4)) % 4;
  const normalized = padded + "=".repeat(neededPadding);
  return Buffer.from(normalized, "base64");
}

function getSessionSecret() {
  if (cachedSecret) return cachedSecret;

  const configured = typeof process.env.APP_SESSION_SECRET === "string"
    ? process.env.APP_SESSION_SECRET.trim()
    : "";
  if (configured) {
    cachedSecret = configured;
    return cachedSecret;
  }

  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    throw new Error("Missing APP_SESSION_SECRET in production.");
  }

  cachedSecret = "cade-games-dev-session-secret";
  return cachedSecret;
}

function signPayload(encodedPayload) {
  return base64UrlEncode(
    crypto.createHmac("sha256", getSessionSecret()).update(encodedPayload).digest(),
  );
}

function parseCookies(req) {
  const raw = req && req.headers ? req.headers.cookie : "";
  const cookies = {};
  if (!raw || typeof raw !== "string") return cookies;

  const parts = raw.split(";");
  for (const part of parts) {
    const [nameRaw, ...rest] = part.split("=");
    const name = String(nameRaw || "").trim();
    if (!name) continue;
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

function serializeCookie(name, value, req) {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isSecureRequest(req)) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function serializeExpiredCookie(name, req) {
  const parts = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (isSecureRequest(req)) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function generateUserId() {
  if (typeof crypto.randomUUID === "function") {
    return `usr_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `usr_${crypto.randomBytes(16).toString("hex")}`;
}

function createPayload() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    v: SESSION_VERSION,
    uid: generateUserId(),
    iat: nowSeconds,
    exp: nowSeconds + SESSION_TTL_SECONDS,
    authType: "anonymous",
  };
}

function createAuthenticatedPayload(authUser = {}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const firebaseUid = typeof authUser.firebaseUid === "string" && authUser.firebaseUid.trim()
    ? authUser.firebaseUid.trim()
    : (typeof authUser.uid === "string" ? authUser.uid.trim() : "");
  const userId = typeof authUser.userId === "string" && authUser.userId.trim()
    ? authUser.userId.trim()
    : firebaseUid;
  if (!userId) {
    return createPayload();
  }
  return {
    v: SESSION_VERSION,
    uid: userId,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_TTL_SECONDS,
    authType: "google",
    fuid: firebaseUid || userId,
    email: typeof authUser.email === "string" ? authUser.email.trim().slice(0, 160) : "",
    name: typeof authUser.displayName === "string"
      ? authUser.displayName.trim().slice(0, 160)
      : (typeof authUser.name === "string" ? authUser.name.trim().slice(0, 160) : ""),
    picture: typeof authUser.photoURL === "string"
      ? authUser.photoURL.trim().slice(0, 400)
      : (typeof authUser.picture === "string" ? authUser.picture.trim().slice(0, 400) : ""),
  };
}

function encodeSession(payload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseSessionCookie(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.includes(".")) return null;
  const [encodedPayload, encodedSignature] = rawValue.split(".", 2);
  if (!encodedPayload || !encodedSignature) return null;

  const expected = signPayload(encodedPayload);
  const actualBuffer = Buffer.from(encodedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== "object") return null;
  const uid = typeof payload.uid === "string" ? payload.uid.trim() : "";
  const exp = Number(payload.exp);
  if (!uid || !Number.isFinite(exp)) return null;
  if (Math.floor(Date.now() / 1000) >= exp) return null;
  const authType = payload.authType === "google" ? "google" : "anonymous";
  const firebaseUid = authType === "google" && typeof payload.fuid === "string"
    ? payload.fuid.trim()
    : "";
  return {
    userId: uid,
    expiresAt: exp * 1000,
    issuedAt: Number(payload.iat || 0) * 1000,
    version: Number(payload.v || 0),
    authType,
    firebaseUid,
    email: typeof payload.email === "string" ? payload.email.trim() : "",
    displayName: typeof payload.name === "string" ? payload.name.trim() : "",
    photoURL: typeof payload.picture === "string" ? payload.picture.trim() : "",
    isAuthenticated: authType === "google",
  };
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

function createSession(req, res, options = {}) {
  const payload = options && options.payload && typeof options.payload === "object"
    ? options.payload
    : createPayload();
  const token = encodeSession(payload);
  appendSetCookieHeader(res, serializeCookie(SESSION_COOKIE_NAME, token, req));
  return {
    userId: payload.uid,
    expiresAt: payload.exp * 1000,
    issuedAt: payload.iat * 1000,
    version: payload.v,
    authType: payload.authType === "google" ? "google" : "anonymous",
    firebaseUid: typeof payload.fuid === "string" ? payload.fuid : "",
    email: typeof payload.email === "string" ? payload.email : "",
    displayName: typeof payload.name === "string" ? payload.name : "",
    photoURL: typeof payload.picture === "string" ? payload.picture : "",
    isAuthenticated: payload.authType === "google",
    isNew: true,
  };
}

function createAuthenticatedSession(req, res, authUser = {}) {
  return createSession(req, res, { payload: createAuthenticatedPayload(authUser) });
}

function clearSession(req, res) {
  appendSetCookieHeader(res, serializeExpiredCookie(SESSION_COOKIE_NAME, req));
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  return parseSessionCookie(token);
}

function ensureSession(req, res, options = {}) {
  const allowCreate = options && options.createIfMissing !== false;
  const current = getSessionFromRequest(req);
  if (current) {
    return { ...current, isNew: false };
  }
  if (!allowCreate) return null;
  return createSession(req, res);
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  clearSession,
  createSession,
  createAuthenticatedSession,
  ensureSession,
  getSessionFromRequest,
};
