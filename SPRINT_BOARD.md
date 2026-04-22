# Sprint Board (Q2 2026)

## Product Goal
Build a school-safe arcade platform with classroom controls, parent/school monetization, and privacy-first defaults.

## Timeline
- Sprint 1: Mar 9, 2026 to Mar 20, 2026
- Sprint 2: Mar 23, 2026 to Apr 3, 2026
- Sprint 3: Apr 6, 2026 to Apr 17, 2026
- Sprint 4: Apr 20, 2026 to May 1, 2026
- Sprint 5: May 4, 2026 to May 15, 2026
- Sprint 6: May 18, 2026 to Jun 5, 2026
- Sprint 7: Jun 8, 2026 to Jun 19, 2026

## Sprint 1 - Compliance + Classroom Foundation

### CG-101 Privacy Policy Page (Status: DONE)
- Description: Publish plain-language privacy policy for kid/school audience.
- Acceptance criteria:
  - `privacy.html` exists and is linked from home.
  - Policy includes effective date and local storage data categories.
  - Policy states no targeted profiling by default.

### CG-102 School Data Policy Page (Status: DONE)
- Description: Publish school-facing data commitments and change-control expectations.
- Acceptance criteria:
  - `school-privacy.html` exists and is linked from home.
  - Page includes school-safe defaults, data scope, and FERPA/COPPA readiness note.
  - Page includes explicit requirement to revise policy for new data flows.

### CG-103 Classroom State Scaffolding (Status: DONE)
- Description: Add normalized classroom settings/session state in shared core state.
- Acceptance criteria:
  - Shared state includes `classroom.enabled`, `teacherPin`, `shopDisabledDuringClass`, `gameWhitelist`, and session timing fields.
  - Expired sessions auto-normalize to inactive.
  - Helper APIs exist for save/start/end/session checks.

### CG-104 Homepage Classroom Controls (Status: DONE)
- Description: Add classroom modal, status banner, and game whitelist enforcement on launcher cards.
- Acceptance criteria:
  - Home topbar includes Classroom button.
  - Modal supports enable toggle, duration, PIN, whitelist, and session start/end.
  - Non-whitelisted games are visibly locked when classroom session is active.

### CG-105 Shop Lock During Class (Status: DONE)
- Description: Disable shop actions while a class session is active and lock flag is enabled.
- Acceptance criteria:
  - Shop reads classroom session state.
  - Purchase/equip/unequip actions are blocked while lock is active.
  - User sees clear locked notice in shop UI.

### CG-106 Sprint 1 QA Smoke (Status: DONE)
- Description: Validate home + shop classroom behavior in browser automation.
- Acceptance criteria:
  - Local smoke run verifies home modal save/start/end and game locking behavior.
  - Local smoke run verifies shop lock and unlock behavior.
  - No console errors in smoke scenario.
  - Implemented with `scripts/qa/classroom-mode-smoke.mjs` and artifacts in `output/web-game/classroom-e2e`.

## Sprint 2 - Teacher Dashboard MVP

### CG-201 Teacher Session View (Status: DONE)
- Description: Add dedicated `teacher/index.html` with class session controls.
- Acceptance criteria:
  - Teacher page can start/end sessions and edit whitelist.
  - Teacher page displays active timer and current lock state.
  - PIN prompt is required before changing active session settings.

### CG-202 Classroom Presets (Status: DONE)
- Description: Add reusable game preset packs (Logic, Reflex, Strategy).
- Acceptance criteria:
  - Teacher can apply a preset in one click.
  - Presets map to existing game slugs and update whitelist.
  - Preset application persists in shared state.

### CG-203 Classroom Timer UX (Status: DONE)
- Description: Improve countdown visibility and auto-end messaging.
- Acceptance criteria:
  - Active countdown updates across home and shop.
  - Expired session surfaces a clear "class ended" state.
  - Lock restrictions are removed automatically at session end.

### CG-204 Launcher Search + Coin Tags (Status: DONE)
- Description: Add game discovery search and economy tagging on home launcher.
- Acceptance criteria:
  - Home includes game search input and coin-earning filter.
  - Game cards clearly tag whether they earn coins.
  - Empty search states are handled with user feedback.

### CG-205 Shop Item Tags + Filtering (Status: DONE)
- Description: Add game-tagged shop items and filter controls.
- Acceptance criteria:
  - Shop items display game tags.
  - Shop supports filtering by game and text search.
  - Filtered empty states are shown clearly.

## Sprint 3 - Engagement + Assignment Layer

### CG-301 Daily Missions Framework (Status: DONE)
- Description: Add mission definitions and completion tracking.
- Acceptance criteria:
  - Mission definitions stored in `src/prog/missions.js`.
  - Mission completion grants coins/badges through shared progression.
  - Mission state survives refresh and day boundaries.

### CG-302 Weekly Challenge Board (Status: DONE)
- Description: Add weekly challenge panel on home.
- Acceptance criteria:
  - Users can view active weekly tasks and progress.
  - Weekly board resets cleanly on schedule.
  - Challenge rewards do not break existing shop economy.

### CG-303 Classroom Assignment Bundle (Status: DONE)
- Description: Teacher can assign mission/challenge packs to class sessions.
- Acceptance criteria:
  - Assignment selection is persisted in classroom state.
  - Students see assignment banner in launch UI.
  - Assignment completion is reflected in local report data.

## Sprint 4 - Family Premium + Payments

### CG-401 Entitlements Core (Status: DONE)
- Description: Add entitlement flags for free vs premium content.
- Acceptance criteria:
  - `src/core/entitlements.js` defines gate checks.
  - Locked premium items render explanatory messaging.
  - Feature gates are testable without network dependency.

### CG-402 Family Pricing Page + Checkout Flow (Status: DONE)
- Description: Build parent-friendly plans page and payment entry point.
- Acceptance criteria:
  - Plans page includes monthly/annual options.
  - Checkout flow creates entitlement token or pending state.
  - No dark patterns or manipulative upsells.

### CG-403 Premium Content Pack 1 (Status: DONE)
- Description: Ship first premium cosmetics/challenge bundle.
- Acceptance criteria:
  - At least one premium cosmetic set is gated correctly.
  - Premium challenge track appears only for entitled users.
  - Non-entitled users see upgrade CTA without blocked gameplay.

## Sprint 5 - School Monetization + Reporting

### CG-501 Classroom License Flow (Status: DONE)
- Description: Add school/teacher license purchase entry point.
- Acceptance criteria:
  - Pricing and benefits are published in clear language.
  - License state can unlock classroom admin features.
  - Purchase flow supports district review handoff.

### CG-502 Report Generator (Status: DONE)
- Description: Add lightweight aggregate class report summaries.
- Acceptance criteria:
  - Report includes total play sessions, top games, assignment completion.
  - Report excludes sensitive personal detail by default.
  - Report export supports PDF or CSV from browser.

### CG-503 Policy Update Gate (Status: DONE)
- Description: Add release checklist step requiring policy review for data/monetization changes.
- Acceptance criteria:
  - Release checklist references `privacy.html` and `school-privacy.html`.
  - Any new tracking/ad dependency requires explicit checklist signoff.
  - Missing signoff blocks release tag.

## Sprint 6 - Accessibility + Launch Readiness

### CG-601 Accessibility Pack (Status: DONE)
- Description: Add colorblind palettes, larger UI mode, reduced motion option.
- Acceptance criteria:
  - Setting toggles persist across pages.
  - Major launcher and shop interactions are keyboard reachable.
  - Visual contrast meets target baseline for core text elements.

### CG-602 Parent/Teacher Onboarding Split (Status: DONE)
- Description: Add clear role-based onboarding from homepage.
- Acceptance criteria:
  - Home offers "Parent" and "Teacher" paths.
  - Each path lands on role-specific guidance and CTA.
  - Onboarding can be skipped without blocking gameplay.

### CG-603 Launch QA + Metrics Baseline (Status: DONE)
- Description: Finalize release candidate quality and KPI instrumentation.
- Acceptance criteria:
  - Smoke checks pass for launcher, shop, classroom mode, and premium gating.
  - KPI events available for retention/conversion dashboards.
  - Release notes include risk register and rollback plan.

## Sprint 7 - Operational Reliability

### CG-701 Nightly Launch Readiness CI (Status: DONE)
- Description: Run launch-readiness smoke coverage automatically each day and retain artifacts for triage.
- Acceptance criteria:
  - GitHub Actions workflow runs on daily schedule and manual dispatch.
  - Workflow runs integration checks plus aggregate launch-readiness smoke suite.
  - Artifacts for each smoke surface are uploaded even on failures.

### CG-702 KPI Dashboard Export Baseline (Status: DONE)
- Description: Provide a deterministic local export for KPI snapshots to support reporting and audits.
- Acceptance criteria:
  - CLI/script writes retention and conversion snapshot JSON from local metrics state.
  - Export includes timestamp, rolling window days, and event count integrity fields.
  - Export path is documented in README and covered by deterministic test.

### CG-703 Release Tag Checklist Automation (Status: DONE)
- Description: Add automated verification that release notes and launch-risk sections exist before tagging.
- Acceptance criteria:
  - Release automation checks `RELEASE_NOTES.md` for risk register and rollback sections.
  - Missing sections fail validation before release tag workflows continue.
  - Workflow links failures directly to expected checklist fields.

### CG-704 Stripe Billing Foundation (Status: DONE)
- Description: Add Stripe-backed checkout and subscription-management foundation while preserving local demo fallback.
- Acceptance criteria:
  - Pricing page supports Stripe Checkout and Stripe Customer Portal when configured.
  - Serverless endpoints exist for checkout session, portal session, webhook intake, and subscription-status sync.
  - Local demo checkout continues to work when Stripe env vars are not configured.

### CG-705 Stripe Entitlement Persistence + Auth Binding (Status: DONE)
- Description: Bind Stripe customers to authenticated app users and persist webhook-driven entitlement state in durable storage.
- Acceptance criteria:
  - Webhook handler writes subscription lifecycle changes to durable entitlement records.
  - Checkout and portal endpoints require authenticated user context instead of raw email-only access.
  - Shop/teacher feature gates read entitlement state from durable backend source.

## Sprint 8 - Stripe Production Hardening

### CG-801 Stripe Admin Reconcile Endpoint (Status: DONE)
- Description: Add admin-token-protected reconciliation endpoint to repair durable entitlement state from live Stripe subscriptions.
- Acceptance criteria:
  - `POST /api/stripe/admin/reconcile` supports `userId` and/or `customerId` targeting.
  - Endpoint requires `STRIPE_ADMIN_TOKEN` and rejects unauthenticated calls.
  - Reconcile path writes refreshed entitlements/subscriptions to durable store and supports `dryRun`.

### CG-802 Stripe Incident Runbook (Status: DONE)
- Description: Publish an operational runbook for webhook outages, replay strategy, and entitlement mismatch triage.
- Acceptance criteria:
  - Runbook documents detection, immediate containment, and recovery checklist.
  - Runbook references reconcile endpoint usage and required env vars.
  - Runbook includes rollback + communication template.

### CG-803 Stripe Replay + Audit Automation (Status: DONE)
- Description: Add scripted workflow for bulk reconcile/audit to validate account bindings after incidents.
- Acceptance criteria:
  - Script can process a list of customer IDs or user IDs.
  - Script outputs summary counts for repaired, unchanged, and unbound records.
  - Script is documented and included in release/ops validation checks.

## Risks and Dependencies
- External payment/legal integration for premium and school licensing.
- Policy review before enabling any remote tracking or ad stack.
- Classroom mode PIN is currently local-only and not hard security.

## Current Sprint Notes
- Sprint 1 (CG-101 through CG-106) is complete, including deterministic home/shop smoke automation.
- Sprint 2 (CG-201 through CG-203) is complete with teacher controls, preset packs, and expiry UX behavior.
- Added follow-up delivery items: CG-204 launcher search/coin tags and CG-205 shop tag filtering (both complete).
- Sprint 3 kickoff item CG-301 is complete (daily missions state, rewards, and smoke coverage).
- Sprint 3 follow-up item CG-302 is complete (weekly challenge state, rewards, launcher UI, and smoke coverage).
- Sprint 3 closing item CG-303 is complete (teacher assignment bundles, home assignment banner, and local report completion logging).
- Sprint 4 kickoff item CG-401 is complete (local entitlement gates, premium lock messaging, and deterministic tests/smoke coverage).
- Sprint 4 follow-up item CG-402 is complete (family plans page, local checkout intents, and checkout smoke coverage).
- Sprint 4 content item CG-403 is complete (premium challenge track UI + free-tier CTA behavior + deterministic premium track smoke coverage).
- Sprint 5 kickoff item CG-501 is complete (school license page, district review handoff flow, and teacher licensed-tool unlock behavior).
- Sprint 5 follow-up item CG-502 is complete (aggregate report generation, CSV export, print-to-PDF flow, and deterministic browser smoke coverage).
- Sprint 5 closing item CG-503 is complete (release checklist + policy signoff gate + tag-blocking workflow).
- Sprint 6 kickoff item CG-601 is complete (persisted accessibility settings, keyboard reachability improvements, and deterministic accessibility smoke coverage).
- Sprint 6 follow-up item CG-602 is complete (home role-based onboarding paths, skip/show persistence, and deterministic onboarding smoke coverage).
- Sprint 6 closing item CG-603 is complete (aggregated launch-readiness smoke suite, local KPI metrics baseline, and release notes with risk/rollback plan).
- Sprint 7 kickoff item CG-701 is complete (nightly launch-readiness CI workflow with artifact upload for all smoke surfaces).
- Sprint 7 Stripe item CG-704 is complete (Stripe checkout/portal/webhook endpoint scaffolding with local checkout fallback).
- Sprint 7 follow-up item CG-705 is complete (session-bound Stripe endpoints, durable user/customer entitlement records, and webhook persistence flow).
- Sprint 7 KPI item CG-702 is complete (deterministic KPI export CLI, integrity metadata, and integration coverage).
- Sprint 7 release item CG-703 is complete (`test:policy-gate` now validates `RELEASE_NOTES.md` required sections for risk register + rollback plan before tag workflows continue).
- Sprint 7 operational reliability scope (CG-701 through CG-705, plus CG-702/CG-703 follow-ups) is complete.
- Sprint 8 kickoff item CG-801 is complete (admin-token-protected Stripe entitlement reconcile endpoint with dry-run and durable-store refresh support).
- Sprint 8 follow-up item CG-802 is complete (`STRIPE_INCIDENT_RUNBOOK.md` added with outage detection, reconcile recovery, rollback, and comms template).
- Sprint 8 closing item CG-803 is complete (`scripts/stripe/reconcile-audit.mjs` bulk reconcile/audit CLI with deterministic helper tests and summary output).
- Sprint 8 Stripe production-hardening scope (CG-801 through CG-803) is complete.
- [nightly 2026-03-13] Tracked changes: 2 commit(s) - c593230 Add new game without emoji changes; 7fe8a6c Add favicon links across pages.
- [nightly 2026-03-13] Key PR links: none merged for this date.
- [nightly 2026-03-28] No repository commits found for this date.
- [nightly 2026-03-28] Key PR links: none merged for this date.
- [nightly 2026-03-30] Tracked changes: 1 commit(s) - Add Circuit Path game and wire routing metadata.
- [nightly 2026-03-30] Key PR links: none merged for this date.
- [nightly 2026-03-31] No repository commits found for this date.
- [nightly 2026-03-31] Key PR links: none merged for this date.
- [nightly 2026-04-01] Tracked changes: 9 commit(s) - Add Vault Runner game and wire site routing metadata; update sprint board.; Merge pull request #57 from LEnc95/sentinel-fix-xss-15606326905744107900; Merge pull request #56 from LEnc95/bolt-debounce-search-2662894813776952574; Merge pull request #55 from LEnc95/palette-a11y-inputs-418373600541951323; Merge pull request #54 from LEnc95/add-line-rider-6796471402573778864; Sentinel: [HIGH] Fix XSS vulnerability in file upload; Bolt: Debounce game search input; Palette: Add ARIA labels to profile and classroom inputs.
- [nightly 2026-04-01] Key PR links: #57, #56, #55, #54.
- [nightly 2026-04-02] Tracked changes: 17 commit(s) - e8f8263 Append clean progress handoff note; 7a70e05 Rework duplicate game slugs into distinct mechanics; 9cf272e Record Chrome Shift rewrite delivery status; 12edc03 Rework Chrome Shift into distinct color-flood puzzle; b87a25c Add Chrome Shift game and update sprint board notes (+12 more).
- [nightly 2026-04-02] Key PR links: [#68](https://github.com/LEnc95/games.aiandsons.io/pull/68), [#70](https://github.com/LEnc95/games.aiandsons.io/pull/70), [#75](https://github.com/LEnc95/games.aiandsons.io/pull/75), [#76](https://github.com/LEnc95/games.aiandsons.io/pull/76), [#77](https://github.com/LEnc95/games.aiandsons.io/pull/77), [#78](https://github.com/LEnc95/games.aiandsons.io/pull/78).
- [nightly 2026-04-03] Tracked changes: 1 commit(s) - Add Trailblazer Grid game and wire launcher routes.
- [nightly 2026-04-03] Key PR links: none merged for this date.
- [nightly 2026-04-04] No repository commits found for this date.
- [nightly 2026-04-04] Key PR links: none merged for this date.
- [nightly 2026-04-05] Tracked changes: 2 commit(s) - Add Port Pilot game and wire launcher routing; Update release notes and append nightly sprint board entries.
- [nightly 2026-04-05] Key PR links: none merged for this date.
- [nightly 2026-04-06] No repository commits found for this date.
- [nightly 2026-04-06] Key PR links: none merged for this date.
- [nightly 2026-04-08] No repository commits found for this date.
- [nightly 2026-04-08] Key PR links: none merged for this date.
- [nightly 2026-04-09] Tracked changes: 19 commit(s) - adc8951 Merge remote-tracking branch 'origin/main' into sentinel/add-csp-header-14817471579450243982; 5e73ba1 Merge pull request #94 from LEnc95/sentinel/add-csp-baseline-476433402941297954; fb93e64 Merge pull request #93 from LEnc95/bolt-family-invite-promise-all-1051630550031134487; 3951aef Merge pull request #95 from LEnc95/palette-empty-search-cta-16147478040835265385; 693d9df Merge pull request #96 from LEnc95/bolt/metrics-optimization-5801853543080981932 (+14 more).
- [nightly 2026-04-09] Key PR links: [#90](https://github.com/LEnc95/games.aiandsons.io/pull/90), [#91](https://github.com/LEnc95/games.aiandsons.io/pull/91), [#92](https://github.com/LEnc95/games.aiandsons.io/pull/92), [#93](https://github.com/LEnc95/games.aiandsons.io/pull/93), [#94](https://github.com/LEnc95/games.aiandsons.io/pull/94), [#95](https://github.com/LEnc95/games.aiandsons.io/pull/95), [#96](https://github.com/LEnc95/games.aiandsons.io/pull/96), [#97](https://github.com/LEnc95/games.aiandsons.io/pull/97), [#99](https://github.com/LEnc95/games.aiandsons.io/pull/99), [#100](https://github.com/LEnc95/games.aiandsons.io/pull/100).
- [nightly 2026-04-10] Tracked changes: 1 commit(s) - Add Word Weave game and wire catalog, routes, and tracking.
- [nightly 2026-04-10] Key PR links: none merged for this date.
- [nightly 2026-04-11] Tracked changes: 3 commit(s) - Refresh README with current workflows and backend setup; Add Dice Forge game and wire launcher routes and metadata; Add Word Weave game and wire catalog, routes, and tracking.
- [nightly 2026-04-11] Key PR links: none merged for this date.
- [nightly 2026-04-12] No repository commits found for this date.
- [nightly 2026-04-12] Key PR links: none merged for this date.
- [nightly 2026-04-13] No repository commits found for this date.
- [nightly 2026-04-13] Key PR links: none merged for this date.
- [nightly 2026-04-14] Tracked changes: 4 commit(s) - Add SAIL blog featured image asset; Add feedback widget mounts to legacy game pages; Add Magnet Rail game and wire routing metadata; Add Pulse Parry game and wire site metadata.
- [nightly 2026-04-14] Key PR links: none merged for this date.
- [nightly 2026-04-15] Tracked changes: 1 commit(s) - Add Loom Lock game and wire site metadata and routing.
- [nightly 2026-04-15] Key PR links: none merged for this date.
- [nightly 2026-04-16] Tracked changes: 5 commit(s) - e7a857b Add Tide Tower game and wire site metadata and routing; 1fb6edf Add Loom Lock game and wire site metadata and routing; 8a8e45c Merge pull request #114 from LEnc95/sentinel-security-headers-9041407985542366875; 704498a Merge pull request #113 from LEnc95/fix/launch-readiness-discovery-smoke; df0f140 Add Strict-Transport-Security header.
- [nightly 2026-04-16] Key PR links: [#113](https://github.com/LEnc95/games.aiandsons.io/pull/113), [#114](https://github.com/LEnc95/games.aiandsons.io/pull/114).
- [nightly 2026-04-17] Tracked changes: 1 commit(s) - 2fe4bf7 Add Star Lattice game and wire routing metadata.
- [nightly 2026-04-17] Key PR links: none merged for this date.
- [nightly 2026-04-18] No repository commits found for this date.
- [nightly 2026-04-18] Key PR links: none merged for this date.
- [nightly 2026-04-19] Tracked changes: 5 commit(s) - Bump project version to 1.0.0 and update changelog; Add styled changelog page and link it in footer and sitemap; Differentiate Reactor Relay and Prism Pipeline visual themes; Differentiate Reactor Relay and Prism Pipeline gameplay loops; Add Prism Pipeline game and wire it into site.
- [nightly 2026-04-19] Key PR links: none merged for this date.
- [nightly 2026-04-20] Tracked changes: 1 commit(s) - 662f787 Add Glacier Guard game and wire it into site.
- [nightly 2026-04-20] Key PR links: none merged for this date.
- [nightly 2026-04-22] No repository commits found for this date.
- [nightly 2026-04-22] Key PR links: none merged for this date.
