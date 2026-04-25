const FIREBASE_WEB_SDK_VERSION = "12.11.0";
const FIREBASE_WEB_SDK_BASE_PATH = `/src/vendor/firebase/${FIREBASE_WEB_SDK_VERSION}`;
const FIREBASE_WEB_SDK_SOURCES = [
  {
    name: "self-hosted",
    appUrl: `${FIREBASE_WEB_SDK_BASE_PATH}/firebase-app.js`,
    authUrl: `${FIREBASE_WEB_SDK_BASE_PATH}/firebase-auth.js`,
  },
  {
    name: "gstatic",
    appUrl: `https://www.gstatic.com/firebasejs/${FIREBASE_WEB_SDK_VERSION}/firebase-app.js`,
    authUrl: `https://www.gstatic.com/firebasejs/${FIREBASE_WEB_SDK_VERSION}/firebase-auth.js`,
  },
  {
    name: "esm.sh",
    appUrl: `https://esm.sh/firebase@${FIREBASE_WEB_SDK_VERSION}/app`,
    authUrl: `https://esm.sh/firebase@${FIREBASE_WEB_SDK_VERSION}/auth`,
  },
];

let firebaseConfigPromise = null;
let firebaseSdkPromise = null;
let firebaseAuthPromise = null;
let redirectResultPromise = null;
let cachedSession = null;
let cachedSessionFetchedAt = 0;
const SESSION_CACHE_TTL_MS = 60_000;
const listeners = new Set();
const LOOPBACK_AUTH_SESSION = Object.freeze({
  ok: true,
  userId: "local_guest",
  firebaseUid: "",
  email: "",
  displayName: "",
  photoURL: "",
  authType: "anonymous",
  isAuthenticated: false,
  expiresAt: 0,
  isNew: false,
  stubbed: true,
});

function normalizeSessionPayload(payload) {
  const raw = payload && typeof payload === "object" ? payload : {};
  return {
    ok: Boolean(raw.ok),
    userId: typeof raw.userId === "string" ? raw.userId.trim() : "",
    firebaseUid: typeof raw.firebaseUid === "string" ? raw.firebaseUid.trim() : "",
    email: typeof raw.email === "string" ? raw.email.trim() : "",
    displayName: typeof raw.displayName === "string" ? raw.displayName.trim() : "",
    photoURL: typeof raw.photoURL === "string" ? raw.photoURL.trim() : "",
    authType: typeof raw.authType === "string" ? raw.authType.trim() : "anonymous",
    isAuthenticated: Boolean(raw.isAuthenticated),
    expiresAt: Number(raw.expiresAt || 0),
    isNew: Boolean(raw.isNew),
    stubbed: Boolean(raw.stubbed),
  };
}

function shouldSkipAuthApiProbe() {
  if (typeof location === "undefined") return false;
  const host = String(location.hostname || "").toLowerCase();
  const isLoopback = host === "localhost" || host === "127.0.0.1";
  if (!isLoopback) return false;

  try {
    const params = new URLSearchParams(location.search || "");
    return params.get("authApiProbe") !== "1";
  } catch {
    return true;
  }
}

function emitSession(session) {
  cachedSession = session;
  cachedSessionFetchedAt = Date.now();
  for (const listener of listeners) {
    try {
      listener(session);
    } catch {
      // Ignore listener errors to keep auth updates resilient.
    }
  }
}

function isProbablyMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(String(navigator.userAgent || ""));
}

function shouldUseRedirectFallback(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  return (
    code === "auth/popup-blocked" ||
    code === "auth/cancelled-popup-request" ||
    code === "auth/operation-not-supported-in-this-environment"
  );
}

function describeSignInError(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code === "auth/popup-closed-by-user") {
    return "Google sign-in was closed before it finished.";
  }
  if (code === "auth/unauthorized-domain") {
    return "This site domain is not authorized for Firebase Google sign-in yet.";
  }
  if (code === "auth/network-request-failed") {
    return "Google sign-in could not reach Firebase. Check your connection and try again.";
  }
  return String(error?.message || error || "Google sign-in failed.");
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  throw new Error(payload?.error || `Request failed (${response.status})`);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  return parseResponse(response);
}

export async function getFirebaseWebConfig() {
  if (shouldSkipAuthApiProbe()) {
    return { ok: true, enabled: false, config: null, stubbed: true };
  }
  if (!firebaseConfigPromise) {
    firebaseConfigPromise = fetch("/api/auth/firebase-config", {
      method: "GET",
      headers: { Accept: "application/json" },
    }).then(parseResponse);
  }
  return firebaseConfigPromise;
}

async function loadFirebaseSdk() {
  if (!firebaseSdkPromise) {
    firebaseSdkPromise = (async () => {
      const sourceErrors = [];

      for (const source of FIREBASE_WEB_SDK_SOURCES) {
        try {
          const [appSdk, authSdk] = await Promise.all([
            import(source.appUrl),
            import(source.authUrl),
          ]);
          return {
            ...appSdk,
            ...authSdk,
          };
        } catch (error) {
          sourceErrors.push({
            name: source.name,
            message: String(error?.message || error || "unknown error"),
          });
        }
      }

      const details = sourceErrors
        .map((entry) => `${entry.name}: ${entry.message}`)
        .join(" | ");
      throw new Error(`Google sign-in could not load Firebase SDK modules. ${details}`);
    })();

    firebaseSdkPromise.catch(() => {
      // Let users retry sign-in if an earlier SDK import attempt failed.
      firebaseSdkPromise = null;
    });
  }
  return firebaseSdkPromise;
}

async function ensureFirebaseAuth() {
  if (!firebaseAuthPromise) {
    firebaseAuthPromise = (async () => {
      const configPayload = await getFirebaseWebConfig();
      if (!configPayload?.enabled || !configPayload?.config) {
        throw new Error("Google sign-in is not configured yet.");
      }
      const sdk = await loadFirebaseSdk();
      const config = configPayload.config;
      const app = sdk.getApps().length
        ? sdk.getApp()
        : sdk.initializeApp(config);
      const auth = sdk.getAuth(app);
      auth.useDeviceLanguage();
      return {
        sdk,
        auth,
      };
    })();

    firebaseAuthPromise.catch(() => {
      // Allow retries after transient initialization failures.
      firebaseAuthPromise = null;
    });
  }
  return firebaseAuthPromise;
}

async function finalizeRedirectSignIn() {
  if (redirectResultPromise) {
    return redirectResultPromise;
  }

  redirectResultPromise = (async () => {
    try {
      const { sdk, auth } = await ensureFirebaseAuth();
      const result = await sdk.getRedirectResult(auth);
      if (!result?.user) {
        return null;
      }
      const idToken = await result.user.getIdToken();
      const payload = await postJson("/api/auth/google-login", { idToken });
      const session = normalizeSessionPayload(payload);
      emitSession(session);
      return session;
    } catch (error) {
      if (String(error?.message || "").includes("not configured yet")) {
        return null;
      }
      throw error;
    }
  })();

  return redirectResultPromise;
}

export async function fetchAuthSession({ force = false } = {}) {
  if (shouldSkipAuthApiProbe()) {
    const session = normalizeSessionPayload(LOOPBACK_AUTH_SESSION);
    emitSession(session);
    return session;
  }

  const now = Date.now();
  if (!force && cachedSession && (now - cachedSessionFetchedAt) < SESSION_CACHE_TTL_MS) {
    return cachedSession;
  }

  const redirectedSession = await finalizeRedirectSignIn().catch(() => null);
  if (redirectedSession) {
    return redirectedSession;
  }

  const response = await fetch("/api/auth/session", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const payload = await parseResponse(response);
  const session = normalizeSessionPayload(payload);
  emitSession(session);
  return session;
}

export function getCachedAuthSession() {
  return cachedSession;
}

export function onAuthSessionChanged(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  listeners.add(listener);
  if (cachedSession) {
    listener(cachedSession);
  }
  return () => listeners.delete(listener);
}

export async function signInWithGoogle() {
  if (shouldSkipAuthApiProbe()) {
    throw new Error("Google sign-in is disabled on loopback static servers. Add ?authApiProbe=1 to test live auth APIs.");
  }
  const { sdk, auth } = await ensureFirebaseAuth();
  const provider = new sdk.GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    if (isProbablyMobileBrowser()) {
      await sdk.signInWithRedirect(auth, provider);
      return cachedSession || normalizeSessionPayload({ ok: true, pendingRedirect: true });
    }

    const result = await sdk.signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken();
    const payload = await postJson("/api/auth/google-login", { idToken });
    const session = normalizeSessionPayload(payload);
    emitSession(session);
    return session;
  } catch (error) {
    if (shouldUseRedirectFallback(error)) {
      await sdk.signInWithRedirect(auth, provider);
      return cachedSession || normalizeSessionPayload({ ok: true, pendingRedirect: true });
    }
    throw new Error(describeSignInError(error));
  }
}

export async function signOutFromApp() {
  if (shouldSkipAuthApiProbe()) {
    const session = normalizeSessionPayload(LOOPBACK_AUTH_SESSION);
    emitSession(session);
    return session;
  }

  try {
    const { sdk, auth } = await ensureFirebaseAuth();
    await sdk.signOut(auth);
  } catch {
    // Even if Firebase web auth is unavailable, still clear the app session.
  }

  const payload = await postJson("/api/auth/logout", {});
  const session = normalizeSessionPayload(payload);
  emitSession(session);
  return session;
}
