# Contributing

[Repository overview](README.md) · [Command reference](AGENTS.md) · [Maintainer guide](docs/MAINTAINER_GUIDE.md)

Keep each change focused on a concrete problem and explain the resulting behavior. Follow [AGENTS.md](AGENTS.md) for repository workflows and the existing patterns in the area you change.

## Start here

1. Use Node.js 22.x and install dependencies with `npm ci`.
2. Create a focused branch, for example `git switch -c codex/refine-existing-surface`.
3. Start the browser files with `node scripts/qa/static-server.mjs . 4173`.
4. Open `http://127.0.0.1:4173` and reproduce the behavior before editing.

The static server does not provide serverless APIs. Account, feedback, billing, and multiplayer work also require the runtimes described in [DEPLOYMENT.md](DEPLOYMENT.md) and the [multiplayer runbook](v2-server/README.md).

## Choose the right source

| Change | Start with |
| --- | --- |
| Launcher, search, or discovery | [index.html](index.html), [src/styles](src/styles), and [src/meta/games.js](src/meta/games.js) |
| Progression, challenges, or cosmetics | [src/prog](src/prog) and the relevant game shell |
| Accounts, feedback, or billing | [src/auth](src/auth), [api](api), and their integration tests |
| Party Mode or multiplayer | [party](party), [src/net](src/net), and [v2-server](v2-server) |
| Documentation or automation | The relevant guide, [scripts](scripts), and [GitHub workflows](.github/workflows) |

The catalog and content-contract registries are the source of truth for game metadata. If those change, follow the [daily-game checklist](docs/MAINTAINER_GUIDE.md#daily-game-ship-checklist) and regenerate the related artifacts. The [weekly-pack runbook](docs/MAINTAINER_GUIDE.md#weekly-content-pack-runbook) describes the existing limits for cosmetic and challenge updates.

## Validate the change

| Area | Useful checks |
| --- | --- |
| Documentation | Verify file links, heading anchors, npm commands, and configuration claims against current source; run `npm run maintenance:validate`. |
| Browser UI | Check the changed flow at desktop and phone widths, keyboard navigation, console errors, and the relevant smoke test from [AGENTS.md](AGENTS.md). |
| Shop or billing | `npm run test:shop` |
| Auth or feedback | `npm run test:feedback` |
| Social or discovery APIs | `npm run test:social` |
| Catalog or generated metadata | `npm run game:preflight` |
| Multiplayer server | Run `go test ./...` in the changed Go package, plus the relevant client suite. |

For the aggregate QA gate, install Chromium with `npx playwright install --with-deps chromium`, then run `npm run test:qa`. Commands ending in `:raw` require a static server already running on port 4173; the classroom and launch-readiness wrappers start one themselves.

Choose checks that exercise the changed behavior. Include a regression test when a bug needs one, and screenshots when they help reviewers assess a visual change.

## Open a pull request

Describe the problem, the final change, and the checks you ran. For a behavior fix, a short before/after example helps reviewers reproduce it. Keep unrelated working changes out of the commit and explain any generated files included in the diff.

Use the [pull request template](.github/PULL_REQUEST_TEMPLATE.md). Release preparation and policy review follow [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md); weekly automation owns the normal synchronized version bump.
