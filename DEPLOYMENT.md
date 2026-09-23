# Deployment Runbook

## Platform shape

This repository deploys the arcade as a static Vercel project with serverless
functions in `api/`. There is no frontend build step: Vercel serves the repo
root (`outputDirectory: "."`) and each game folder exposes its own
`index.html`.

Runtime API code depends on the root package install, so deployment must run
`npm ci` before Vercel packages functions. The configured `buildCommand` is a
smoke guard, not an asset build:

```sh
node --no-experimental-require-module -e "require('firebase-admin/app'); require('firebase-admin/auth'); require('stripe')"
```

It intentionally fails the deployment if production dependencies such as
`firebase-admin` or `stripe` cannot be loaded under the configured Node runtime.

## Vercel settings

The authoritative settings live in `vercel.json`:

| Setting | Current value | Intent |
| --- | --- | --- |
| `framework` | `null` | Keep framework auto-detection from adding a build pipeline. |
| `installCommand` | `npm ci` | Install exact runtime dependencies from `package-lock.json`. |
| `buildCommand` | dependency import check | Catch missing or incompatible API dependencies before deploy. |
| `outputDirectory` | `.` | Serve static pages directly from the repository root. |
| Node engine | `22.x` in `package.json` | Match the Vercel serverless runtime expected by API code. |

Keep serverless dependencies in root `dependencies`, not only
`devDependencies`. The `api/package.json` file sets `type: "commonjs"` so Vercel
loads API handlers with CommonJS even though the root package is ESM.

## Routes and public interfaces

`vercel.json` rewrites friendly URLs to static pages or API routers:

- `/api/auth/:route` -> `api/auth.js`
- `/api/stripe/:route` and `/api/stripe/admin/:route` -> `api/billing.js`
- `/api/social/:route` -> `api/social.js`
- `/api/discovery/events` and `/api/discovery/rankings` -> discovery routes in
  `api/social.js`
- `/challenge/:id`, `/race/:code`, and `/g/:slug` -> `api/share.js`
- `/rooms`, `/party`, `/ops/feedback`, and selected game aliases -> static
  `index.html` files

Most game folders do not need custom rewrites. Vercel serves `/slug` from
`/slug/index.html`; only add explicit rewrites for aliases or non-standard
entrypoints.

## Cache and security headers

The global static default is a one-hour browser/CDN cache plus baseline security
headers. Specific routes override that default when freshness is required:

- `/api/(.*)` is private and no-store.
- `/`, `/:slug`, `/:slug/`, and `/:slug/index.html` are `max-age=0,
  must-revalidate` so launcher and game shells update quickly.
- `/src/(.*)`, selected multiplayer assets, and ops pages also revalidate on
  each request.

The Content Security Policy is strict and centralized in `vercel.json`. Do not
add new third-party script, style, frame, or connection origins without updating
the policy and running the relevant smoke tests.

## Environment variables

Set only the groups needed for the features enabled in the deployment.

### Firebase-backed auth, storage, and feedback

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_WEB_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_APP_ID`
- `FIREBASE_MESSAGING_SENDER_ID`

Supported alternatives for Admin credentials:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`

### Stripe billing

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_FAMILY_MONTHLY`
- `STRIPE_PRICE_FAMILY_ANNUAL`
- `APP_SESSION_SECRET`
- `STRIPE_ADMIN_TOKEN`

Optional billing envs include `STRIPE_PRICE_SCHOOL_MONTHLY`,
`STRIPE_PRICE_SCHOOL_ANNUAL`, `STRIPE_BILLING_PORTAL_ENABLED`,
`STRIPE_AUTOMATIC_TAX_ENABLED`, `APP_BASE_URL`, and
`STRIPE_WEBHOOK_FORWARD_URL`.

### Notifications

- `SLACK_FEEDBACK_WEBHOOK_URL` posts production feedback-sync failures from app
  runtime.
- GitHub Actions uses `SLACK_CI_WEBHOOK_URL` for workflow alerts.

## Verification checklist

Before promoting a deployment-oriented change, run the narrow checks that match
the touched surface:

```sh
npm ci
npm run maintenance:validate
npm run game:preflight
npm run test:feedback
npm run test:social
npm run test:shop
```

For browser-facing changes, start the static server and run raw smoke tests:

```sh
python -m http.server 4173
npm run test:launch-readiness-smoke:raw
```

Production maintenance verification is available when checking the live site:

```sh
npm run test:production-maintenance
```

## Troubleshooting

- **Vercel build fails on `firebase-admin` or `stripe`:** run `npm ci` locally,
  confirm the package is in root `dependencies`, commit the lockfile, and rerun
  the dependency import check from `vercel.json`.
- **Firebase Admin import fails under Node 22:** keep Firebase Admin on the
  Node-22-compatible major/version recorded in `package.json` and preserve the
  `--no-experimental-require-module` flag in the build guard.
- **API handlers load as ESM by accident:** confirm `api/package.json` still
  declares `{ "type": "commonjs" }`.
- **A new game works locally but not as a clean URL:** standard `/slug` routes
  should work from folder structure alone. Add `vercel.json` rewrites only for
  aliases or non-standard paths, then run `npm run game:preflight`.
- **Stale launcher or game shell after deploy:** check the no-cache header
  overrides for `/`, `/:slug`, `/:slug/`, and `/:slug/index.html`.

