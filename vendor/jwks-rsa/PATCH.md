# Temporary async-import patch for jwks-rsa 4.1.0

This directory contains the published MIT-licensed jwks-rsa 4.1.0 package,
including its LICENSE and types. The root file dependency satisfies
firebase-admin 14.5.0's existing `^4.0.1` dependency range.

Published tarball integrity:
`sha512-sbkByqyATKYJP5F4RXj03N5TUNC0QLTjCAZvwTzC4BwJZ8e0/cWxN8YROnyUth2g1/ONWi4eSFHeu6oYalrc3Q==`

Changes from the published package:

- `src/utils.js`: load jose with `await import('jose')` inside the existing async
  `retrieveSigningKeys` function.
- `src/integrations/passport.js`: load jose inside the secret-provider callback's
  existing try/catch; make that callback async while retaining callback results.
- `package.json`: add `private: true` and omit upstream development-only
  dependencies and scripts so npm does not install the upstream test toolchain.
- `src/integrations/hapi.js`: remove two upstream trailing spaces for the repository diff check.
- Add this patch record.

No cryptography, algorithm lists, key validation, token validation, caching,
networking, or public exports are replaced. The supported jose 6 dependency stays
in place. This fixes Vercel's strict CommonJS runtime failing at function startup
with `ERR_REQUIRE_ESM`; it does not change Firebase credentials or session policy.

Upstream issue: https://github.com/auth0/node-jwks-rsa/issues/507

Remove the local dependency and this directory once an upstream release uses
async imports for both consumers. Re-run the strict CommonJS startup and RSA/EC
signature tests before removing it. Review source changes against upstream when
updating either package; do not carry this patch silently across major versions.
