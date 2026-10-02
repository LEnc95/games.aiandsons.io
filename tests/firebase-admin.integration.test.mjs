import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const backend = require("../api/_firebase-admin.js");
const { deleteApp } = require("firebase-admin/app");

test("configured Firebase clients retain signing, validation, and serialization contracts", async () => {
  const keys = ["FIREBASE_SERVICE_ACCOUNT_JSON_BASE64", "FIREBASE_STORAGE_BUCKET"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const email = "sdk-test@sdk-contract-test.iam.gserviceaccount.com";
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from(JSON.stringify({
    project_id: "sdk-contract-test", client_email: email,
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  })).toString("base64");
  process.env.FIREBASE_STORAGE_BUCKET = "sdk-contract-test.appspot.com";
  backend.__resetFirebaseAdminForTests();
  let app;
  let firestore;
  try {
    app = backend.getFirebaseAdminApp();
    assert.equal(backend.getFirebaseAdminApp(), app);
    const auth = backend.getFirebaseAuth();
    const token = await auth.createCustomToken("test-player", { role: "player" });
    const [header, payload, signature] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url"));
    assert.equal(claims.uid, "test-player");
    assert.equal(claims.iss, email);
    assert.deepEqual(claims.claims, { role: "player" });
    assert.ok(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey,
      Buffer.from(signature, "base64url")));
    await assert.rejects(auth.verifyIdToken("malformed"), { code: "auth/argument-error" });

    firestore = backend.getFirestore();
    assert.equal(backend.getFirestore(), firestore);
    const document = firestore.collection("feedback").doc("sdk-test");
    // Exercise real SDK serialization without committing or contacting a service.
    assert.doesNotThrow(() => firestore.batch().set(document, { rating: 5, optional: undefined }));

    const bucket = backend.getFirebaseStorageBucket();
    assert.equal(bucket.name, "sdk-contract-test.appspot.com");
    const [signedUrl] = await bucket.file("feedback/sdk-test.png").getSignedUrl({
      version: "v4", action: "read", expires: Date.now() + 60000,
    });
    const url = new URL(signedUrl);
    assert.equal(url.hostname, "storage.googleapis.com");
    assert.equal(url.pathname, "/sdk-contract-test.appspot.com/feedback/sdk-test.png");
    assert.ok(url.searchParams.get("X-Goog-Signature"));
  } finally {
    if (firestore) await firestore.terminate();
    if (app) await deleteApp(app);
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    backend.__resetFirebaseAdminForTests();
  }
});
