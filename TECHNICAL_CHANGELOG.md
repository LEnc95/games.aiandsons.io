# Technical Changelog

This feed records automation, validation, deployment, schema, and operational changes. Player-facing highlights remain in `CHANGELOG.md`.

## 1.13.0 — 2026-07-26

- Release week: 2026-W30
- Automated maintenance validation required before merge.
- Production verification retries at 0, 5, and 20 minutes.

### Included commits

- 0a3464e Add Ripple Shepherd daily game (#233)
- a5095e7 Fix feedback modal keyboard conflict with game shortcuts (#232)
- ff0eac3 Add Meteor Miner daily game
- 8c8ce9c Update changelog and sprint board
- 7b93512 Add Rebound Relay daily game (#231)
- c2fbe49 Add Morris Meadow daily game (#229)
- 28e1b30 Wait for PR checks before automation merge (#228)
- 993d541 Harden automated daily game releases (#227)
- 4eb403c Add Aquarium Logic daily game (#226)
- b707a2a Automate recurring site maintenance (#221)
- bd5b622 Set readable colors for search filter options
- 085e8fe Link daily and weekly challenges directly to their games (#220)
- 2503c07 Add Lure Line daily game
- 4e274d9 Add Neon Divide daily game
- 0eb3f8e Bump release version to 1.12.0
- a5021e8 Document release 1.12.0 and update sprint tracking
- 9afacf1 Document updated unit and integration test commands
- 12da5e7 Clarify daily game preflight workflow docs
- 8b2196a Add Knight's Tour daily game
- 3cec3e2 Add Windbow Trials daily game
- b9da411 Add Domino Mosaic daily game
- 69478a4 Add Parcel Patch daily game
- c2766bb Add Star Battle daily game
- ebe5378 Add Pearl Loop daily game

## Unreleased automation foundation

- Introduced explicit per-game engagement contracts and standardized outcome reporting.
- Added bounded daily Firestore aggregation with no player identifier, IP address, free-form metadata, or raw event history.
- Increased weekly challenge rotation to four while retaining an 80-coin weekly reward ceiling.
- Centralized generated-shop policy and premium item classification for the compatibility migration.
- Aggregate telemetry remains client-disabled pending a release-specific privacy approval.

