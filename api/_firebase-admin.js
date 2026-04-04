const admin = require("firebase-admin");

let cachedServiceAccount = undefined;
let cachedApp = null;
let firestoreConfigured = false;
let cachedWebConfig = undefined;

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

function tryParseBase64Json(value) {
  const encoded = typeof value === "string" ? value.trim() : "";
  if (!encoded) return null;
  try {
    return parseJsonString(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function getFirebaseWebConfigObject() {
  if (cachedWebConfig !== undefined) {
    return cachedWebConfig;
  }

  const base64EnvKeys = [
    "FIREBASE_WEB_CONFIG_JSON_BASE64",
    "NEXT_PUBLIC_FIREBASE_CONFIG_BASE64",
    "VITE_FIREBASE_CONFIG_BASE64",
  ];
  for (const key of base64EnvKeys) {
    const parsed = tryParseBase64Json(process.env[key]);
    if (parsed && typeof parsed === "object") {
      cachedWebConfig = parsed;
      return cachedWebConfig;
    }
  }

  const jsonEnvKeys = [
    "FIREBASE_WEB_CONFIG_JSON",
    "FIREBASE_WEB_CONFIG",
    "NEXT_PUBLIC_FIREBASE_CONFIG",
    "VITE_FIREBASE_CONFIG",
    "FIREBASE_CONFIG",
  ];
  for (const key of jsonEnvKeys) {
    const raw = typeof process.env[key] === "string" ? process.env[key].trim() : "";
    if (!raw || !raw.includes("{")) continue;
    const parsed = parseJsonString(raw);
    if (parsed && typeof parsed === "object") {
      cachedWebConfig = parsed;
      return cachedWebConfig;
    }
  }

  cachedWebConfig = null;
  return cachedWebConfig;
}

function readConfigValue(config, keys, maxLength = 200) {
  const source = config && typeof config === "object" ? config : {};
  for (const key of keys) {
    const value = normalizeSingleLine(source[key], maxLength);
    if (value) {
      return value;
    }
  }
  return "";
}

function deriveProjectIdFromAuthDomain(authDomain) {
  const normalized = normalizeSingleLine(authDomain, 200).toLowerCase();
  if (!normalized.endsWith(".firebaseapp.com")) return "";
  return normalized.slice(0, normalized.length - ".firebaseapp.com".length);
}

function deriveProjectIdFromStorageBucket(bucketName) {
  const normalized = normalizeSingleLine(bucketName, 240).toLowerCase();
  if (normalized.endsWith(".appspot.com")) {
    return normalized.slice(0, normalized.length - ".appspot.com".length);
  }
  if (normalized.endsWith(".firebasestorage.app")) {
    return normalized.slice(0, normalized.length - ".firebasestorage.app".length);
  }
  return "";
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
  const webConfig = getFirebaseWebConfigObject();
  const explicit = readFirstConfiguredEnv([
    "FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "FIREBASE_PUBLIC_PROJECT_ID",
    "VITE_FIREBASE_PROJECT_ID",
  ], 120);
  if (explicit) return explicit;
  const projectIdFromConfig = readConfigValue(webConfig, ["projectId", "project_id"], 120);
  if (projectIdFromConfig) return projectIdFromConfig;
  const projectIdFromAuthDomain = deriveProjectIdFromAuthDomain(
    readConfigValue(webConfig, ["authDomain", "auth_domain"], 200),
  );
  if (projectIdFromAuthDomain) return projectIdFromAuthDomain;
  const projectIdFromBucket = deriveProjectIdFromStorageBucket(
    readConfigValue(webConfig, ["storageBucket", "storage_bucket"], 240),
  );
  if (projectIdFromBucket) return projectIdFromBucket;
  const serviceAccount = getFirebaseServiceAccount();
  return normalizeSingleLine(serviceAccount?.project_id, 120);
}

function getFirebaseStorageBucketName() {
  const webConfig = getFirebaseWebConfigObject();
  const explicit = readFirstConfiguredEnv([
    "FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "FIREBASE_PUBLIC_STORAGE_BUCKET",
    "VITE_FIREBASE_STORAGE_BUCKET",
  ], 240);
  if (explicit) return explicit;
  const storageBucketFromConfig = readConfigValue(webConfig, ["storageBucket", "storage_bucket"], 240);
  if (storageBucketFromConfig) return storageBucketFromConfig;
  const serviceAccount = getFirebaseServiceAccount();
  return normalizeSingleLine(serviceAccount?.storage_bucket || serviceAccount?.storageBucket, 240);
}

function getFirebasePublicConfig() {
  const webConfig = getFirebaseWebConfigObject();
  const projectId = getFirebaseProjectId();
  const apiKey = readFirstConfiguredEnv([
    "FIREBASE_WEB_API_KEY",
    "FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_WEB_API_KEY",
    "FIREBASE_PUBLIC_API_KEY",
    "VITE_FIREBASE_API_KEY",
  ], 200) || readConfigValue(webConfig, ["apiKey", "api_key"], 200);
  const authDomain = readFirstConfiguredEnv([
    "FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "FIREBASE_PUBLIC_AUTH_DOMAIN",
    "VITE_FIREBASE_AUTH_DOMAIN",
  ], 200) || readConfigValue(webConfig, ["authDomain", "auth_domain"], 200) || (projectId ? `${projectId}.firebaseapp.com` : "");
  const appId = readFirstConfiguredEnv([
    "FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "FIREBASE_PUBLIC_APP_ID",
    "VITE_FIREBASE_APP_ID",
  ], 200) || readConfigValue(webConfig, ["appId", "app_id"], 200);
  const messagingSenderId = readFirstConfiguredEnv([
    "FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "FIREBASE_PUBLIC_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
  ], 80) || readConfigValue(webConfig, ["messagingSenderId", "messaging_sender_id"], 80);
  const storageBucket = getFirebaseStorageBucketName();
  const missingFields = [];
  if (!projectId) missingFields.push("projectId");
  if (!apiKey) missingFields.push("apiKey");
  if (!authDomain) missingFields.push("authDomain");
  const enabled = Boolean(projectId && apiKey && authDomain);

  return {
    enabled,
    source: webConfig ? "web-config-json" : "env-vars",
    missingFields,
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
  cachedWebConfig = undefined;
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
