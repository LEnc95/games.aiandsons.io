# Server dependency compatibility

The server declares Node 22 in package.json. CI reads that declaration with
setup-node node-version-file so installs use the same major as production.

## Native DOMException export

The local `node-domexception` dependency in `vendor/node-domexception` satisfies
fetch-blob 3's existing dependency range and replaces its deprecated runtime shim.
It exports the identical global constructor through CommonJS (also usable as an
ESM default import). It has no external dependencies or install scripts. Remove
the local dependency and directory when the upstream Blob stack drops that import.

## Rimraf 6 override

The legacy google-gax 5 and gaxios 7.1.3 dependency trees request Rimraf 5, which
pulls deprecated Glob 10. The root override selects Rimraf 6.1.3 and supported
Glob 13. The documented v5-to-v6 changes are a higher Node floor (20 or >=22)
and a CLI version flag; the named async/sync cleanup API stays the same.

This is an intentional major-version compatibility override, not a security
exception. Remove it when the upstream clients no longer request Rimraf 5.
Review it whenever the Firebase/Google SDK dependency tree changes.
Upstream reference: https://github.com/isaacs/rimraf#v5-to-v6

## jwks-rsa asynchronous ESM loading

Vercel's production auth functions failed at startup because jwks-rsa 4.1.0
uses CommonJS `require('jose')`, while jose 6 is ESM-only. Local Node 22's
`require(esm)` support masked the error. The production runtime log showed
`ERR_REQUIRE_ESM` in jwks-rsa/src/utils.js before any auth handler executed.

The local dependency in `vendor/jwks-rsa` preserves the published 4.1.0 source
and MIT license with two async-import changes, documented in its PATCH.md.
Both key retrieval and the Passport callback load jose with native `import()`.
Firebase Admin 14.5.0, jose 6, all verification algorithms, and application auth
and session logic remain unchanged. No downgrade, loader hook, install-time
patching, or replacement cryptography is used. Upstream's dev-only toolchain is
omitted from the local package metadata so it is not installed in this app.

Remove this local dependency after an upstream release fixes both imports.
Upstream issue: https://github.com/auth0/node-jwks-rsa/issues/507

The feedback suite launches a child with `--no-experimental-require-module` to
reproduce a strict CommonJS runtime. It checks both auth handler readiness paths,
malformed Google tokens, actual Firebase JWKS verification of RSA/EC signatures,
Passport key retrieval, and rejection of tampered, expired, and unsupported
algorithm tokens against a loopback JWKS endpoint, with no cloud credentials.

## Required regression checks

`tests/firebase-admin.integration.test.mjs` exercises native exception identity,
file-backed Blob read failures, cleanup resolved from the actual legacy clients,
Firebase signing/Firestore serialization/signed URLs, and real Storage multipart
upload/download/delete against a loopback HTTP fixture. These run in the feedback
suite and Main QA. Both clean install and audit must remain warning-free and
report zero known vulnerabilities; do not suppress npm warnings to satisfy this.

## Reviewed install scripts

npm 11 approvals are pinned to @firebase/util 1.15.3 and protobufjs 7.6.6.
The former generates Firebase default-config exports (and only reads/fetches
configuration when FIREBASE_WEBAPP_CONFIG is supplied); the latter validates
protobufjs dependency version schemes. Both scripts ran under the existing
npm 10 installation behavior. Review their source again when either pinned
version changes; do not replace these entries with blanket script approval.
