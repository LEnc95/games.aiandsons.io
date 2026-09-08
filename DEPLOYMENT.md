# Deployment Instructions

## Vercel static deployment

This repository deploys as a static arcade plus Vercel serverless functions. It
does not use a framework build step: `vercel.json` sets `buildCommand`,
`devCommand`, and `installCommand` to `null`, uses `"framework": null`, and
serves the repository root as the output directory.

## Project shape

```text
/
|- index.html                 # Launcher, missions, discovery, profile
|- <game-slug>/index.html     # Self-contained game shells
|- shop.html                  # Cosmetics and premium inventory
|- teacher/                   # Classroom mode pages
|- ops/feedback/              # Feedback triage UI
|- api/                       # Vercel functions and routers
|- src/                       # Shared browser modules and metadata
|- assets/og/                 # Per-game share cards
`- vercel.json                # Rewrites, headers, and static hosting config
```

`v2-server/` and `clubpenguin-world/` include separate Go server code and are
not deployed by the static Vercel site unless their own deployment instructions
are followed.

## Routing model

- The launcher lives at `/`.
- Standard games live in `<slug>/index.html` and are linked as `/<slug>` from
  `src/meta/games.js`.
- Existing `vercel.json` rewrites keep legacy clean URLs and aliases working,
  including `/pingpong` -> `/pong/index.html`.
- API clean URLs are rewritten into router functions, for example
  `/api/stripe/:route` -> `/api/billing?route=:route`,
  `/api/social/:route` -> `/api/social?route=:route`, and
  `/api/discovery/events` -> `/api/social?route=discovery-events`.
- Share landing routes use `/challenge/:id`, `/race/:code`, and `/g/:slug`.

For normal new game folders, update `src/meta/games.js`, run the generated
asset/metadata commands, and avoid adding a `vercel.json` route unless the URL
is an alias or does not match the folder path. `npm run game:preflight` checks
that registered game folders, discovery metadata, sitemap entries, OG cards,
and clean-URL cache headers are in sync.

## Cache and security headers

The header rules in `vercel.json` intentionally split static asset caching from
runtime shells:

- `/api/(.*)` is `private, no-store` and disables Vercel CDN caching.
- `/(.*)` defaults to one-hour public caching and carries common security
  headers, including `X-Content-Type-Options`, `X-Frame-Options`,
  `Strict-Transport-Security`, and the site CSP.
- `/`, `/:slug`, `/:slug/`, and `/:slug/index.html` are
  `public, max-age=0, must-revalidate` so launcher and game shell updates are
  visible immediately.
- `/src/(.*)` and selected runtime assets such as `audioagar/game.js` also use
  no-cache headers because games import shared browser modules directly.

Pitfall: Vercel matches header `source` values against the request URL before
rewrites. Keep the clean-URL `/:slug` and `/:slug/` rules when changing headers;
an `/:slug/index.html` rule alone does not cover user traffic to `/<slug>`.

## Environment variables

The static shell can load without backend credentials, but production account,
feedback, billing, and cloud-save features depend on the Firebase, Stripe, and
app-session variables listed in `README.md`.

Notable groups:

- Firebase Admin and client config for auth, Firestore, and Storage.
- Stripe price/webhook/admin variables for checkout, portal, webhooks, and
  reconcile jobs.
- `APP_SESSION_SECRET` for signed app sessions.
- Optional Slack/Linear variables for feedback and CI notifications.

## Versioning

- `package.json` and `version.json` both currently use the runtime version.
- The homepage fetches `version.json` and displays the version badge.
- Bump version files for user-visible releases as described in
  `RELEASE_CHECKLIST.md`.

## Local smoke test

Serve the repository root statically:

```bash
python -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173
```

Useful checks before or after deployment:

- `npm run maintenance:validate`
- `npm run game:preflight`
- `npm run test:qa`
- `npm run test:launch-readiness-smoke`

For a specific changed game, verify both `/<slug>` and `/<slug>/` load, shared
widgets initialize, and any score, feedback, challenge, or shop cosmetic wiring
matches the relevant smoke test in `scripts/qa/`.

