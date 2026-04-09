# Release Notes - Sprint 6 Launch Candidate
## Weekly Highlights (2026-03-29 to 2026-04-03)
- Added and wired multiple new games in the launcher during the week, including `riftdrifter`, `circuitpath`, `signalstack`, `linerider`, `vaultrunner`, `chromeshift`, and `trailblazergrid`.
- Reworked `chromeshift` from its initial launch into a distinct color-flood puzzle and recorded the rewrite delivery status.
- Landed a broad security hardening pass with high-severity XSS fixes across upload, premium track, challenge properties, feedback/embed surfaces, and index search rendering, plus a production session-secret fallback fix.
- Improved feedback/billing and provisioning performance by debouncing search and localStorage writes, optimizing feedback and Firestore rate limiting, parallelizing Linear baseline/label provisioning, and reducing redundant Stripe family-summary lookups.
- Expanded quality coverage with new tests for storage getters, onboarding normalization, games list integrity, and receipt verification, while also stabilizing nightly launch-readiness smoke screenshots.

## Key PR Links (2026-03-29 to 2026-04-03)
- [#78](https://github.com/LEnc95/games.aiandsons.io/pull/78) - Debounce localStorage save operations for client-state persistence (merged 2026-04-02).
- [#77](https://github.com/LEnc95/games.aiandsons.io/pull/77) - Add Escape key modal-close accessibility support (merged 2026-04-02).
- [#76](https://github.com/LEnc95/games.aiandsons.io/pull/76) - Fix production session secret fallback behavior (merged 2026-04-02).
- [#73](https://github.com/LEnc95/games.aiandsons.io/pull/73) - Optimize Stripe family summary lookups in invite handlers (merged 2026-04-01).
- [#63](https://github.com/LEnc95/games.aiandsons.io/pull/63) - Fix index.html XSS vulnerability in search rendering flow (merged 2026-04-01).
- [#53](https://github.com/LEnc95/games.aiandsons.io/pull/53) - Add Signal Stack game and launcher wiring (merged 2026-03-31).

## Release Scope
- Onboarding split from home launcher with dedicated parent and teacher onboarding pages.
- Persisted onboarding role and skip/show controls.
- KPI instrumentation for launcher, pricing checkout, and shop conversion actions.
- Launch-readiness aggregate smoke suite covering launcher/shop discovery, classroom mode, entitlement gating, premium track gating, onboarding, and metrics baseline.

## Validation Baseline
- `npm run test:shop`
- `npm run test:classroom-smoke`
- `npm run test:launch-readiness-smoke:raw` (against local server at `http://127.0.0.1:4173`)

## KPI Baseline Events
- `launcher_view`
- `launcher_search_changed`
- `launcher_coin_filter_changed`
- `game_launch_clicked`
- `onboarding_role_selected`
- `onboarding_skipped`
- `onboarding_restored`
- `premium_upgrade_cta_clicked`
- `pricing_view`
- `pricing_plan_selected`
- `checkout_started`
- `checkout_completed`
- `checkout_cleared`
- `shop_view`
- `shop_search_changed`
- `shop_game_filter_changed`
- `shop_purchase_attempt`
- `shop_purchase_success`
- `shop_purchase_blocked`
- `shop_item_equipped`
- `shop_item_unequipped`

## Risk Register
| ID | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | Local KPI event volume grows too large in browser storage | Medium | Metrics state caps event history to last 1000 records and sanitizes metadata fields. |
| R2 | KPI event hooks introduce launcher/shop regressions | High | Covered by existing integration tests + launch-readiness smoke suite and manual screenshot review. |
| R3 | Checkout conversion events drift from pricing flow behavior | Medium | `metrics-baseline-smoke` exercises pricing select/start/complete path and asserts dashboard counters. |
| R4 | Onboarding skip could hide key guidance unexpectedly | Low | Skip/show controls are reversible and smoke-tested for non-blocking gameplay availability. |

## Rollback Plan
1. Revert the KPI instrumentation and onboarding split commit from `main` if smoke or production sanity checks fail.
2. Re-run `npm run test:shop` and `npm run test:classroom-smoke` on the rollback commit.
3. Deploy the rollback commit and verify home, shop, pricing, and teacher pages load without console errors.
4. Keep policy gate and release checklist in place; do not tag release until launch-readiness smoke passes again.


