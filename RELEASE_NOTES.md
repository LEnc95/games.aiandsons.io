# Release Notes - Sprint 6 Launch Candidate

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

