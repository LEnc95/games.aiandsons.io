import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/auth/client.js", import.meta.url), "utf8");
const testSource = source
  .replace("import(source.appUrl)", "Promise.resolve(globalThis.__mockFirebaseAppSdk)")
  .replace("import(source.authUrl)", "Promise.resolve(globalThis.__mockFirebaseAuthSdk)");

async function createHarness({ persistedUser = null, retainCookie = true } = {}) {
  let serverAuthenticated = false;
  let loginCount = 0;
  let popupCount = 0;
  let redirectCount = 0;
  const user = { uid: "firebase-user", getIdToken: async () => "valid-id-token" };
  const auth = {
    currentUser: persistedUser ? user : null,
    authStateReady: async () => {},
    useDeviceLanguage() {},
  };
  globalThis.location = { hostname: "games.example", search: "" };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" },
  });
  globalThis.__mockFirebaseAppSdk = {
    getApps: () => [],
    initializeApp: () => ({}),
  };
  globalThis.__mockFirebaseAuthSdk = {
    getAuth: () => auth,
    getRedirectResult: async () => null,
    GoogleAuthProvider: class {
      addScope() {}
      setCustomParameters() {}
    },
    signInWithPopup: async () => {
      popupCount += 1;
      auth.currentUser = user;
      return { user };
    },
    signInWithRedirect: async () => { redirectCount += 1; },
  };
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/auth/firebase-config") {
      return Response.json({ ok: true, enabled: true, config: { projectId: "test" } });
    }
    if (url === "/api/auth/google-login") {
      assert.equal(options.credentials, "same-origin");
      loginCount += 1;
      if (retainCookie) serverAuthenticated = true;
      return Response.json({ ok: true, firebaseUid: user.uid, isAuthenticated: true });
    }
    if (url === "/api/auth/session") {
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      return Response.json(serverAuthenticated
        ? { ok: true, firebaseUid: user.uid, isAuthenticated: true }
        : { ok: true, userId: "guest", isAuthenticated: false });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(testSource).toString("base64")}#${Math.random()}`;
  return {
    client: await import(moduleUrl),
    counts: () => ({ loginCount, popupCount, redirectCount }),
  };
}

test("restores a persisted Firebase user when the server has a guest session", async () => {
  const { client, counts } = await createHarness({ persistedUser: true });
  const session = await client.fetchAuthSession();
  assert.equal(session.isAuthenticated, true);
  assert.equal(session.firebaseUid, "firebase-user");
  assert.equal(counts().loginCount, 1);
});

test("mobile sign-in tries the popup and confirms the app session", async () => {
  const { client, counts } = await createHarness();
  const session = await client.signInWithGoogle();
  assert.equal(session.isAuthenticated, true);
  assert.deepEqual(counts(), { loginCount: 1, popupCount: 1, redirectCount: 0 });
});

test("sign-in reports when the browser does not retain the app session", async () => {
  const { client } = await createHarness({ retainCookie: false });
  await assert.rejects(client.signInWithGoogle(), /did not retain the account session/);
});

test("API cache headers override the broad public site headers", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const broadIndex = config.headers.findIndex((rule) => rule.source === "/(.*)");
  const apiIndex = config.headers.findIndex((rule) => rule.source === "/api/(.*)");
  assert.ok(apiIndex > broadIndex);
  assert.match(config.headers[apiIndex].headers.find((header) => header.key === "Cache-Control").value, /no-store/);
});
