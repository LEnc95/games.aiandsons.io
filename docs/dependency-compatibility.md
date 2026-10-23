# Server dependency compatibility

The server supports Node 22; CI also exercises Node 24.

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

## Required regression checks

`tests/firebase-admin.integration.test.mjs` exercises native exception identity,
file-backed Blob read failures, cleanup resolved from the actual legacy clients,
Firebase signing/Firestore serialization/signed URLs, and real Storage multipart
upload/download/delete against a loopback HTTP fixture. These run in the feedback
suite and Main QA. Both clean install and audit must remain warning-free and
report zero known vulnerabilities; do not suppress npm warnings to satisfy this.
