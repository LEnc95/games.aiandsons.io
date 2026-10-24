import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const backend = require("../api/_firebase-admin.js");
const { deleteApp } = require("firebase-admin/app");

test("strict CommonJS runtime starts auth and preserves real JWKS signature verification", () => {
  const child = spawnSync(process.execPath, ["--no-experimental-require-module", fileURLToPath(new URL("./fixtures/firebase-cjs-runtime.cjs", import.meta.url))], {
    encoding: "utf8", timeout: 20000, windowsHide: true, shell: false,
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  assert.match(child.stdout, /Strict CJS startup.*signature rejection passed/);
});

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


test("file-backed Blob errors retain native DOMException identity", async () => {
  const { default: NativeException } = await import("node-domexception");
  assert.equal(NativeException, globalThis.DOMException);
  assert.equal(require("node-domexception"), globalThis.DOMException);
  const { blobFrom } = await import("fetch-blob/from.js");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "native-blob-contract-"));
  try {
    const file = path.join(directory, "attachment.txt");
    fs.writeFileSync(file, "feedback attachment");
    const blob = await blobFrom(file, "text/plain");
    assert.equal(await blob.text(), "feedback attachment");
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
    await assert.rejects(blob.text(), (error) => {
      assert.ok(error instanceof globalThis.DOMException);
      assert.equal(error.name, "NotReadableError");
      return true;
    });
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy Google clients resolve compatible async and sync cleanup APIs", async () => {
  const firestoreApi = createRequire(require.resolve("@google-cloud/firestore-api"));
  const gax = createRequire(firestoreApi.resolve("google-gax"));
  const auth = createRequire(gax.resolve("google-auth-library"));
  const metadata = createRequire(auth.resolve("gcp-metadata"));
  const transport = createRequire(metadata.resolve("gaxios"));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sdk-cleanup-contract-"));
  try {
    for (const [index, consumer] of [gax, transport].entries()) {
      const { rimraf, rimrafSync } = consumer("rimraf");
      for (const [name, remove] of [["async", rimraf], ["sync", rimrafSync]]) {
        const target = path.join(directory, `${index}-${name}`);
        fs.mkdirSync(path.join(target, "nested"), { recursive: true });
        fs.writeFileSync(path.join(target, "nested", "temporary.txt"), "temporary SDK data");
        assert.ok(path.resolve(target).startsWith(`${path.resolve(directory)}${path.sep}`));
        assert.equal(await remove(target), true);
        assert.equal(fs.existsSync(target), false);
      }
    }
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Storage transport preserves multipart upload, download and delete", async () => {
  const { Storage } = require("@google-cloud/storage");
  const payload = Buffer.from("feedback attachment transport contract");
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ method: req.method, contentType: req.headers["content-type"], body: Buffer.concat(chunks) });
    if (req.method === "POST") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ bucket: "sdk-contract-test", name: "feedback/test.txt", size: String(payload.length) }));
    } else if (req.method === "GET") {
      res.setHeader("content-type", "text/plain");
      res.end(payload);
    } else {
      res.statusCode = req.method === "DELETE" ? 204 : 400;
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const storage = new Storage({ projectId: "sdk-contract-test",
      apiEndpoint: `http://127.0.0.1:${server.address().port}`, useAuthWithCustomEndpoint: false,
      retryOptions: { autoRetry: false } });
    const file = storage.bucket("sdk-contract-test").file("feedback/test.txt");
    await file.save(payload, { resumable: false, validation: false, metadata: { contentType: "text/plain" } });
    const [download] = await file.download({ validation: false });
    assert.deepEqual(download, payload);
    await file.delete();
    assert.deepEqual(requests.map((entry) => entry.method), ["POST", "GET", "DELETE"]);
    assert.match(requests[0].contentType, /multipart\/related/);
    assert.ok(requests[0].body.includes(payload));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
