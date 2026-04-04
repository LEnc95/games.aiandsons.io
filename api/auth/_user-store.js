const { getFirestore, isFirebaseAdminConfigured } = require("../_firebase-admin");

function normalizeSingleLine(value, maxLength = 200) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function getUsersCollection() {
  return getFirestore().collection("appUsers");
}

async function upsertAuthenticatedUser(authUser = {}) {
  if (!isFirebaseAdminConfigured()) {
    return null;
  }

  const uid = normalizeSingleLine(authUser.uid || authUser.firebaseUid, 160);
  if (!uid) return null;

  const now = Date.now();
  const ref = getUsersCollection().doc(uid);
  const existing = await ref.get().catch(() => null);
  const createdAt = existing?.exists
    ? Number(existing.data()?.createdAt || now)
    : now;

  const profile = {
    uid,
    email: normalizeSingleLine(authUser.email, 200).toLowerCase(),
    displayName: normalizeSingleLine(authUser.displayName || authUser.name, 160),
    photoURL: normalizeSingleLine(authUser.photoURL || authUser.picture, 500),
    authProvider: "google.com",
    emailVerified: Boolean(authUser.emailVerified),
    createdAt,
    updatedAt: now,
    lastLoginAt: now,
  };

  await ref.set(profile, { merge: true });
  return profile;
}

module.exports = {
  upsertAuthenticatedUser,
};
