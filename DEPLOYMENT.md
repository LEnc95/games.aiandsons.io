# Deployment

This repository deploys as a static browser arcade on Vercel. There is no framework, bundler, or build
step: Vercel serves the repository root and the serverless functions under `api/`.

## Vercel project settings

Use the static-site settings encoded in `vercel.json`:

- `buildCommand`: `null`
- `outputDirectory`: `.`
- `installCommand`: `null`
- `framework`: `null`

Deployment is triggered by pushing the branch that backs the Vercel project. Production currently expects
the `games.aiandsons.io` domain; previews use Vercel preview URLs.

## Route shape

- `/`: launcher (`index.html`).
- `/<slug>` and `/<slug>/`: a standard game folder with `<slug>/index.html`.
- `/rooms`, `/teacher`, `/ops/feedback`, and similar top-level pages: static HTML entrypoints with explicit
  rewrites when clean URLs are needed.
- `/api/stripe/*`, `/api/auth/*`, `/api/feedback/*`, `/api/social/*`: serverless API routes.
- `/api/discovery/events` and `/api/discovery/rankings`: public discovery URLs rewritten to
  `api/social.js` routes (`discovery-events` and `discovery-rankings`) to keep the function count small.
- `/challenge/:id`, `/race/:code`, and `/g/:slug`: share landing pages served by `api/share.js`.

Do not add `vercel.json` rewrites for normal new game folders. Vercel can serve a folder's `index.html`
from the clean folder URL, and `npm run game:preflight` verifies the cache headers that protect those
clean URLs. Add rewrites only for aliases or non-standard paths; for example, `/pingpong` remains an alias
to `/pong/index.html`.

## Cache and security headers

`vercel.json` applies these deployment constraints:

- `/api/(.*)`: private `no-store` cache headers for serverless API responses.
- `/(.*)`: one-hour public default cache plus baseline security headers.
- `/`, `/:slug`, and `/:slug/`: no-cache shell headers so the launcher and game entry HTML are revalidated.
- `/src/(.*)`: no-cache headers for shared ES modules imported by games.
- Selected standalone assets such as `audioagar/game.js` and `audioagar/styles.css`: no-cache headers where
  the game shell imports mutable support files.

Vercel matches header `source` values against the request path before rewrites. Keep the `/:slug` and
`/:slug/` rules in place; `/:slug/index.html` would not protect the clean URLs users actually open.

## Game release checks

Before deploying a new or changed game:

```bash
npm run seo
npm run og
npm run feedback:sync-linear:files
npm run game:preflight
npm run test:feedback
npm run test:social
```

Use `npm run feedback:sync-linear` instead of `:files` when live Linear credentials are available and live
provisioning is intended. `npm run game:preflight` checks that registered game folders exist, the discovery
allowlist mirrors `src/meta/games.js`, every game has an OG card, the sitemap covers every game route, and
the clean-URL no-cache headers are present.

## Versioning

- The homepage displays the version badge from `version.json`.
- Bump `version.json` for user-visible releases.
- Documentation-only changes do not need a version bump.

## Local smoke

Serve the repo root statically for browser smoke tests:

```bash
python -m http.server 4173
```

Then open `http://127.0.0.1:4173`. Raw smoke scripts use the same base URL. Discovery ranking fetches are
intentionally skipped on this static server because it does not run Vercel functions.

