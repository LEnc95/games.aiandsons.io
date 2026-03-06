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

### CG-502 Report Generator (Status: TODO)
- Description: Add lightweight aggregate class report summaries.
- Acceptance criteria:
  - Report includes total play sessions, top games, assignment completion.
  - Report excludes sensitive personal detail by default.
  - Report export supports PDF or CSV from browser.

### CG-503 Policy Update Gate (Status: TODO)
- Description: Add release checklist step requiring policy review for data/monetization changes.
- Acceptance criteria:
  - Release checklist references `privacy.html` and `school-privacy.html`.
  - Any new tracking/ad dependency requires explicit checklist signoff.
  - Missing signoff blocks release tag.

## Sprint 6 - Accessibility + Launch Readiness

### CG-601 Accessibility Pack (Status: TODO)
- Description: Add colorblind palettes, larger UI mode, reduced motion option.
- Acceptance criteria:
  - Setting toggles persist across pages.
  - Major launcher and shop interactions are keyboard reachable.
  - Visual contrast meets target baseline for core text elements.

### CG-602 Parent/Teacher Onboarding Split (Status: TODO)
- Description: Add clear role-based onboarding from homepage.
- Acceptance criteria:
  - Home offers "Parent" and "Teacher" paths.
  - Each path lands on role-specific guidance and CTA.
  - Onboarding can be skipped without blocking gameplay.

### CG-603 Launch QA + Metrics Baseline (Status: TODO)
- Description: Finalize release candidate quality and KPI instrumentation.
- Acceptance criteria:
  - Smoke checks pass for launcher, shop, classroom mode, and premium gating.
  - KPI events available for retention/conversion dashboards.
  - Release notes include risk register and rollback plan.

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
- Next highest-value work item is CG-502 report generator.
