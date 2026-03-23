const admin = require("firebase-admin");

let cachedServiceAccount = undefined;
let cachedApp = null;
let firestoreConfigured = false;

function readFirstConfiguredEnv(keys, maxLength = 400) {
  for (const key of keys) {
    const value = normalizeSingleLine(process.env[key], maxLength);
    if (value) {
      return value;
    }
  }
  return "";
}

function normalizeSingleLine(value, maxLength = 400) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function parseJsonString(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

function getFirebaseServiceAccount() {
  if (cachedServiceAccount !== undefined) {
    return cachedServiceAccount;
  }

  const base64Json = typeof process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 === "string"
    ? process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64.trim()
    : "";
  if (base64Json) {
    const parsed = parseJsonString(Buffer.from(base64Json, "base64").toString("utf8"));
    if (parsed && typeof parsed === "object") {
      cachedServiceAccount = parsed;
      return cachedServiceAccount;
    }
  }

  const rawJson = typeof process.env.FIREBASE_SERVICE_ACCOUNT_JSON === "string"
    ? process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim()
    : "";
  if (rawJson) {
    const parsed = parseJsonString(rawJson);
    if (parsed && typeof parsed === "object") {
      cachedServiceAccount = parsed;
      return cachedServiceAccount;
    }
  }

  const projectId = normalizeSingleLine(process.env.FIREBASE_PROJECT_ID, 120);
  const clientEmail = normalizeSingleLine(process.env.FIREBASE_CLIENT_EMAIL, 200);
  const privateKeyRaw = typeof process.env.FIREBASE_PRIVATE_KEY === "string"
    ? process.env.FIREBASE_PRIVATE_KEY
    : "";
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n").trim();

  if (projectId && clientEmail && privateKey) {
    cachedServiceAccount = {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey,
    };
    return cachedServiceAccount;
  }

  cachedServiceAccount = null;
  return cachedServiceAccount;
}

function getFirebaseProjectId() {
  const explicit = readFirstConfiguredEnv([
    "FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "FIREBASE_PUBLIC_PROJECT_ID",
    "VITE_FIREBASE_PROJECT_ID",
  ], 120);
  if (explicit) return explicit;
  const serviceAccount = getFirebaseServiceAccount();
  return normalizeSingleLine(serviceAccount?.project_id, 120);
}

function getFirebaseStorageBucketName() {
  const explicit = readFirstConfiguredEnv([
    "FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "FIREBASE_PUBLIC_STORAGE_BUCKET",
    "VITE_FIREBASE_STORAGE_BUCKET",
  ], 240);
  if (explicit) return explicit;
  const serviceAccount = getFirebaseServiceAccount();
  return normalizeSingleLine(serviceAccount?.storage_bucket || serviceAccount?.storageBucket, 240);
}

function getFirebasePublicConfig() {
  const projectId = getFirebaseProjectId();
  const apiKey = readFirstConfiguredEnv([
    "FIREBASE_WEB_API_KEY",
    "FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_WEB_API_KEY",
    "FIREBASE_PUBLIC_API_KEY",
    "VITE_FIREBASE_API_KEY",
  ], 200);
  const authDomain = readFirstConfiguredEnv([
    "FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "FIREBASE_PUBLIC_AUTH_DOMAIN",
    "VITE_FIREBASE_AUTH_DOMAIN",
  ], 200) || (projectId ? `${projectId}.firebaseapp.com` : "");
  const appId = readFirstConfiguredEnv([
    "FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "FIREBASE_PUBLIC_APP_ID",
    "VITE_FIREBASE_APP_ID",
  ], 200);
  const messagingSenderId = readFirstConfiguredEnv([
    "FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "FIREBASE_PUBLIC_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
  ], 80);
  const storageBucket = getFirebaseStorageBucketName();
  const enabled = Boolean(projectId && apiKey && authDomain);

  return {
    enabled,
    projectId,
    apiKey,
    authDomain,
    appId,
    messagingSenderId,
    storageBucket,
  };
}

function isFirebaseAdminConfigured() {
  return Boolean(getFirebaseServiceAccount() || normalizeSingleLine(process.env.GOOGLE_APPLICATION_CREDENTIALS, 400));
}

function getFirebaseAdminApp() {
  if (cachedApp) return cachedApp;
  if (!isFirebaseAdminConfigured()) {
    throw new Error("firebase_not_configured");
  }

  const appName = "cade-games-backend";
  const existing = admin.apps.find((entry) => entry?.name === appName);
  if (existing) {
    cachedApp = existing;
    return cachedApp;
  }

  const options = {};
  const serviceAccount = getFirebaseServiceAccount();
  if (serviceAccount) {
    options.credential = admin.credential.cert(serviceAccount);
  } else {
    options.credential = admin.credential.applicationDefault();
  }

  const projectId = getFirebaseProjectId();
  if (projectId) options.projectId = projectId;
  const storageBucket = getFirebaseStorageBucketName();
  if (storageBucket) options.storageBucket = storageBucket;

  cachedApp = admin.initializeApp(options, appName);
  return cachedApp;
}

function getFirestore() {
  const app = getFirebaseAdminApp();
  const firestore = admin.firestore(app);
  if (!firestoreConfigured) {
    firestore.settings({ ignoreUndefinedProperties: true });
    firestoreConfigured = true;
  }
  return firestore;
}

function getFirebaseAuth() {
  return admin.auth(getFirebaseAdminApp());
}

function getFirebaseStorageBucket() {
  const bucketName = getFirebaseStorageBucketName();
  if (!bucketName) {
    throw new Error("firebase_storage_not_configured");
  }
  return admin.storage(getFirebaseAdminApp()).bucket(bucketName);
}

function __resetFirebaseAdminForTests() {
  cachedServiceAccount = undefined;
  cachedApp = null;
  firestoreConfigured = false;
}

module.exports = {
  __resetFirebaseAdminForTests,
  getFirebaseAdminApp,
  getFirebaseAuth,
  getFirebaseProjectId,
  getFirebasePublicConfig,
  getFirebaseServiceAccount,
  getFirebaseStorageBucket,
  getFirebaseStorageBucketName,
  getFirestore,
  isFirebaseAdminConfigured,
};
