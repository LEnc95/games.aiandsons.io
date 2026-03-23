const { getFirebaseAuth, getFirebasePublicConfig, isFirebaseAdminConfigured } = require("../_firebase-admin");
const { clearSession, createAuthenticatedSession, createSession, ensureSession } = require("./_session");
const { upsertAuthenticatedUser } = require("./_user-store");
const { readJsonBody, sendError, sendJson } = require("../feedback/_shared");

async function handleSession(req, res) {
  if (req.method !== "GET") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const session = ensureSession(req, res, { createIfMissing: true });
  return sendJson(res, 200, {
    ok: true,
    userId: session.userId,
    expiresAt: session.expiresAt,
    authType: session.authType || "anonymous",
    firebaseUid: session.firebaseUid || "",
    email: session.email || "",
    displayName: session.displayName || "",
    photoURL: session.photoURL || "",
    isAuthenticated: Boolean(session.isAuthenticated),
    isNew: Boolean(session.isNew),
  });
}

async function handleFirebaseConfig(req, res) {
  if (req.method !== "GET") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const config = getFirebasePublicConfig();
  return sendJson(res, 200, {
    ok: true,
    enabled: Boolean(config.enabled),
    config: config.enabled ? config : null,
  });
}

async function handleGoogleLogin(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  if (!isFirebaseAdminConfigured()) {
    return sendError(res, 503, "Firebase authentication is not configured.", "firebase_not_configured");
  }

  try {
    const body = await readJsonBody(req);
    const idToken = typeof body?.idToken === "string" ? body.idToken.trim() : "";
    if (!idToken) {
      return sendError(res, 400, "Google sign-in token is required.", "missing_id_token");
    }

    const auth = getFirebaseAuth();
    const decoded = await auth.verifyIdToken(idToken);
    const userRecord = await auth.getUser(decoded.uid);
    const profile = await upsertAuthenticatedUser({
      uid: userRecord.uid,
      email: userRecord.email || decoded.email || "",
      displayName: userRecord.displayName || decoded.name || "",
      photoURL: userRecord.photoURL || decoded.picture || "",
      emailVerified: Boolean(userRecord.emailVerified || decoded.email_verified),
    });
    const session = createAuthenticatedSession(req, res, {
      userId: userRecord.uid,
      firebaseUid: userRecord.uid,
      email: profile?.email || userRecord.email || decoded.email || "",
      displayName: profile?.displayName || userRecord.displayName || decoded.name || "",
      photoURL: profile?.photoURL || userRecord.photoURL || decoded.picture || "",
    });

    return sendJson(res, 200, {
      ok: true,
      userId: session.userId,
      firebaseUid: session.firebaseUid || "",
      email: session.email || "",
      displayName: session.displayName || "",
      photoURL: session.photoURL || "",
      authType: session.authType || "google",
      isAuthenticated: true,
      expiresAt: session.expiresAt,
      isNew: Boolean(session.isNew),
    });
  } catch (error) {
    return sendError(res, 401, "Google sign-in could not be verified.", "google_sign_in_failed", {
      message: String(error?.message || error),
    });
  }
}

async function handleLogout(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  clearSession(req, res);
  const session = createSession(req, res);

  return sendJson(res, 200, {
    ok: true,
    userId: session.userId,
    authType: session.authType || "anonymous",
    isAuthenticated: Boolean(session.isAuthenticated),
    expiresAt: session.expiresAt,
  });
}

module.exports = {
  handleFirebaseConfig,
  handleGoogleLogin,
  handleLogout,
  handleSession,
};
