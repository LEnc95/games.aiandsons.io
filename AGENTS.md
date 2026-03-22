# AGENTS.md

## Scope
Operational command reference for contributors and automations in this repository.

## Core Workflows
- Install dependencies: `npm install`
- Run integration tests: `npm run test:shop`
- Run feedback integration tests: `npm run test:feedback`
- Run combined QA gate: `npm run test:qa`
- Run classroom smoke (auto-starts server): `npm run test:classroom-smoke`
- Run launch-readiness smoke (auto-starts server): `npm run test:launch-readiness-smoke`
- Run release policy gate: `npm run test:policy-gate`

## Raw Smoke Commands (require pre-started server at http://127.0.0.1:4173)
- Classroom mode: `npm run test:classroom-smoke:raw`
- Feedback widget + inbox: `npm run test:feedback-smoke:raw`
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
- Run the strict daily feedback metadata guard: `npm run feedback:check-daily`
- Regenerate Linear feedback seed files and live-provision Linear when envs are present: `npm run feedback:sync-linear`
- Regenerate only the local Linear seed artifacts: `npm run feedback:sync-linear:files`
- Live-provision missing Linear labels and baseline issues: `npm run feedback:provision-linear`

## GitHub Automations
- Nightly launch gate: `.github/workflows/nightly-launch-readiness.yml`
- Daily lightweight Linear provisioning: `.github/workflows/daily-feedback-provisioning.yml`

## TODO
- Confirm whether `python -m http.server 4173` is the canonical local server command and if an explicit `127.0.0.1` bind is required for all `*:raw` smoke runs.
