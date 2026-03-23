const { getFirebaseAuth, isFirebaseAdminConfigured } = require("../_firebase-admin");
const { createAuthenticatedSession } = require("./_session");
const { upsertAuthenticatedUser } = require("./_user-store");
const { readJsonBody, sendError, sendJson } = require("../feedback/_shared");

module.exports = async function handler(req, res) {
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
};
