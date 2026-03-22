# AGENTS.md

## Scope
Operational command reference for contributors and automations in this repository.

## Core Workflows
- Install dependencies: `npm install`
- Run integration tests: `npm run test:shop`
- Run combined QA gate: `npm run test:qa`
- Run classroom smoke (auto-starts server): `npm run test:classroom-smoke`
- Run launch-readiness smoke (auto-starts server): `npm run test:launch-readiness-smoke`
- Run release policy gate: `npm run test:policy-gate`

## Raw Smoke Commands (require pre-started server at http://127.0.0.1:4173)
- Classroom mode: `npm run test:classroom-smoke:raw`
- Discovery/search + shop filter: `npm run test:discovery-smoke:raw`
- Daily missions: `npm run test:missions-smoke:raw`
- Weekly challenges: `npm run test:weekly-smoke:raw`
- Assignment bundle: `npm run test:assignment-smoke:raw`
- Entitlements shop: `npm run test:entitlements-smoke:raw`
- Pricing checkout: `npm run test:pricing-smoke:raw`
- Premium track: `npm run test:premium-track-smoke:raw`
- School license: `npm run test:school-license-smoke:raw`
- Report generator: `npm run test:report-smoke:raw`
- Accessibility pack: `npm run test:accessibility-smoke:raw`
- Onboarding split: `npm run test:onboarding-smoke:raw`
- Metrics baseline: `npm run test:metrics-smoke:raw`
- Launch-readiness aggregate raw run: `npm run test:launch-readiness-smoke:raw`

## Data and Audit Commands
- Export KPI snapshot: `npm run metrics:export -- --input data/metrics-state.json --output output/kpi/kpi-dashboard-snapshot.json --window-days 30`
- Stripe reconcile/audit pass: `npm run stripe:reconcile-audit -- --base-url https://<your-domain> --user-ids-file data/stripe/users.txt --dry-run true`

## Subagents
- Subagent prompts live in `subagents/*.agent.md`.
- Use one subagent per disjoint write scope to avoid merge conflicts.
- Recommended split for `clubpenguin-world/`:
  - `subagents/clubpenguin-server.agent.md` owns `clubpenguin-world/main.go` + `clubpenguin-world/main_test.go`
  - `subagents/clubpenguin-client.agent.md` owns `clubpenguin-world/public/index.html` + `clubpenguin-world/public/client.js`
  - `subagents/clubpenguin-qa.agent.md` owns validation scripts/artifacts and docs updates (`progress.md`, sprint notes)
- Always include a short handoff with:
  - changed files
  - tests run
  - known risks/follow-ups

## TODO
- Confirm whether `python -m http.server 4173` is the canonical local server command and if an explicit `127.0.0.1` bind is required for all `*:raw` smoke runs.
