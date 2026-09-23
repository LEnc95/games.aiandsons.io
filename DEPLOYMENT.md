# Deployment Runbook

This repository deploys as a static browser arcade on Vercel at
`https://games.aiandsons.io`. There is no framework, bundler, or build output
directory: Vercel serves the repository root directly and runs CommonJS files in
`api/` as serverless functions.

## Deployment model

- `vercel.json` sets `"buildCommand": null`, `"installCommand": null`,
  `"outputDirectory": "."`, and `"framework": null`.
- Each game is a self-contained folder with an `index.html`, for example
  `snake/index.html` or `belltowerbloom/index.html`.
- The launcher and discovery surfaces use `src/meta/games.js` as the source of
  truth for game names, slugs, URLs, categories, score hints, and content
  contracts.
- Vercel serves standard game folders from clean URLs such as `/snake` and
  `/belltowerbloom`. Do not add per-game rewrites for normal new game folders.
- `v2-server/` and `clubpenguin-world/` contain separate Go services/prototypes;
  they are not deployed by the root static-site build.

## Routes and rewrites

`vercel.json` only needs explicit rewrites for shared app routes, API aliases,
social landing pages, and legacy aliases:

| Source | Destination | Purpose |
| --- | --- | --- |
| `/api/stripe/:route` | `/api/billing?route=:route` | Stripe checkout, portal, subscriptions, webhooks, and billing admin routes. |
| `/api/social/:route` | `/api/social?route=:route` | Player identity, scores, leaderboards, challenges, rooms, and cloud-save routes. |
| `/api/discovery/events` | `/api/social?route=discovery-events` | Discovery event ingestion through the social API router. |
| `/api/discovery/rankings` | `/api/social?route=discovery-rankings` | Discovery ranking API through the social API router. |
| `/api/auth/:route` | `/api/auth?route=:route` | Session, Firebase config, Google login exchange, and logout routes. |
| `/api/booth/:route` | `/api/social?route=booth-:route` | Bottom of the Ninth booth TTS/health routes. |
| `/challenge/:id`, `/race/:code`, `/g/:slug` | `/api/share?...` | Open Graph landing pages before redirecting players. |
| `/rooms`, `/ops/feedback` | Static `index.html` pages | Clean URLs for lobby and operations pages. |
| `/pingpong` | `/pong/index.html` | Legacy alias for the Pong route. |

When adding a new game, update `src/meta/games.js` and let the platform serve
the folder directly. Only touch `vercel.json` for a non-standard path or an
intentional alias.

## Cache and security headers

The header policy in `vercel.json` is part of the deployment contract:

- `/api/(.*)` is `private, no-store` with CDN no-store headers so dynamic
  responses, auth state, score submissions, and billing results are never
  cached.
- `/(.*)` gets the global one-hour static cache plus security headers
  (`X-Content-Type-Options`, `X-Frame-Options`, CSP, and HSTS).
- `/`, `/:slug`, `/:slug/`, and `/:slug/index.html` override the global cache to
  `public, max-age=0, must-revalidate` so launcher and game shells update
  promptly after deploys.
- `/src/(.*)`, selected audio assets, and selected game client files also opt out
  of the global one-hour cache when stale JavaScript or generated manifests would
  break gameplay.

`npm run game:preflight` verifies that the generic `/:slug` and `/:slug/`
no-cache header rules still exist.

## Required metadata after game changes

After changing the game registry or adding a game folder:

```sh
npm run seo
npm run og
npm run feedback:sync-linear:files
```

These commands keep generated deployment artifacts aligned:

- `sitemap.xml` includes every route from `src/meta/games.js`.
- `api/discovery/_metadata.js` mirrors the registry for serverless discovery
  routes while preserving curated editorial lists.
- Game HTML files receive current SEO/Open Graph metadata.
- `assets/og/<slug>.png` gets a per-game share card.
- `linear/game-issues.csv` and `linear/labels.md` stay in sync with feedback
  metadata.

## Local smoke checks

Serve the repo root statically:

```sh
python -m http.server 4173
```

Then run raw smoke checks against `http://127.0.0.1:4173`:

```sh
npm run test:discovery-smoke:raw
npm run test:feedback-smoke:raw
npm run test:weekly-smoke:raw
npm run test:launch-readiness-smoke:raw
```

The wrapper commands, such as `npm run test:classroom-smoke` and
`npm run test:launch-readiness-smoke`, start their own local static server.

## Release and deployment verification

Before merging user-visible deployment changes:

```sh
npm run maintenance:validate
npm run game:preflight
npm run test:qa
```

For a narrow docs-only change, inspect the changed Markdown and run no app tests
unless the docs describe generated command output that should be revalidated.

After production deploys, the `production-maintenance-verify` GitHub workflow
checks the live site with retries. If it fails, inspect the workflow logs before
rerunning or reverting; the workflow does not automatically roll back.

