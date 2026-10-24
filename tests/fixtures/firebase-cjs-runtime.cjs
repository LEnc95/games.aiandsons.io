const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { createServer } = require('node:http');
const path = require('node:path');
const { Readable } = require('node:stream');
const { createRequire } = require('node:module');
// This child is intentionally launched with --no-experimental-require-module.
const authHandler = require('../../api/auth.js');
const backend = require('../../api/_firebase-admin.js');
const sdkRequire = createRequire(require.resolve('firebase-admin/auth'));
const jwks = sdkRequire('jwks-rsa');
const jwt = sdkRequire('jsonwebtoken');
const { PublicKeySignatureVerifier } = require(path.join(path.dirname(require.resolve('firebase-admin/app')), '../utils/jwt.js'));

function response() {
  const headers = new Map();
  return { statusCode: 200, headers, setHeader(k, v) { headers.set(k.toLowerCase(), v); },
    getHeader(k) { return headers.get(k.toLowerCase()); }, end(body) { this.body = JSON.parse(body); } };
}
async function main() {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from(JSON.stringify({ project_id: 'runtime-test',
    client_email: 'test@runtime-test.iam.gserviceaccount.com', private_key: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }) })).toString('base64');
  Object.assign(process.env, { FIREBASE_WEB_CONFIG_JSON: JSON.stringify({ apiKey: 'fixture-public-key', authDomain: 'runtime-test.firebaseapp.com', projectId: 'runtime-test', appId: 'fixture-app' }), APP_SESSION_SECRET: 'runtime-test-session-secret-only' });
  backend.__resetFirebaseAdminForTests();
  for (const route of ['firebase-config', 'session']) {
    const res = response();
    await authHandler({ method: 'GET', url: `/api/auth/${route}`, headers: {} }, res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.ok, true);
    if (route === 'firebase-config') assert.equal(res.body.enabled, true);
    else { assert.equal(res.body.isAuthenticated, false); assert.ok(res.headers.get('set-cookie')); }
  }
  const req = Readable.from([Buffer.from(JSON.stringify({ idToken: 'malformed-token' }))]);
  Object.assign(req, { method: 'POST', url: '/api/auth/google-login', headers: {} });
  const res = response(); await authHandler(req, res); assert.equal(res.statusCode, 401);

  const pairs = [{ ...rsa, kid: 'rsa-key', alg: 'RS256' }, { ...ec, kid: 'ec-key', alg: 'ES256' }];
  const keys = pairs.map(pair => ({ ...pair.publicKey.export({ format: 'jwk' }), kid: pair.kid, alg: pair.alg, use: 'sig' }));
  const server = createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ keys })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const jwksUri = `http://127.0.0.1:${server.address().port}/jwks`;
    const client = jwks({ jwksUri, timeout: 2000 });
    const verifier = PublicKeySignatureVerifier.withJwksUrl(jwksUri);
    const passportKey = jwks.passportJwtSecret({ jwksUri, timeout: 2000 });
    for (const pair of pairs) {
      const token = jwt.sign({ sub: 'fixture-user' }, pair.privateKey, { algorithm: pair.alg, keyid: pair.kid, expiresIn: 60 });
      const key = await client.getSigningKey(pair.kid);
      assert.equal(jwt.verify(token, key.getPublicKey(), { algorithms: [pair.alg] }).sub, 'fixture-user');
      await verifier.verify(token);
      const passportPublicKey = await new Promise((resolve, reject) => passportKey({}, token, (error, value) => error ? reject(error) : resolve(value)));
      assert.equal(jwt.verify(token, passportPublicKey, { algorithms: [pair.alg] }).sub, 'fixture-user');
      const parts = token.split('.'); parts[1] = Buffer.from(JSON.stringify({ sub: 'tampered' })).toString('base64url');
      await assert.rejects(verifier.verify(parts.join('.')), /signature/i);
      const expired = jwt.sign({ sub: 'fixture-user', exp: 1 }, pair.privateKey, { algorithm: pair.alg, keyid: pair.kid });
      await assert.rejects(verifier.verify(expired), /expired/i);
    }
    const unsupported = jwt.sign({ sub: 'fixture-user' }, 'test-secret', { algorithm: 'HS256', keyid: 'rsa-key' });
    await assert.rejects(verifier.verify(unsupported), /algorithm/i);
    const invalidPassportKey = await new Promise((resolve, reject) => passportKey({}, 'malformed', (error, value) => error ? reject(error) : resolve(value)));
    assert.equal(invalidPassportKey, null);
  } finally { await new Promise(resolve => server.close(resolve)); }
  await require('firebase-admin/app').deleteApp(backend.getFirebaseAdminApp());
  console.log('Strict CJS startup, auth handlers, RSA/EC JWKS, Passport and signature rejection passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
