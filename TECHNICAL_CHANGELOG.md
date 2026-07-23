# Technical Changelog

This feed records automation, validation, deployment, schema, and operational changes. Player-facing highlights remain in `CHANGELOG.md`.

## Unreleased automation foundation

- Introduced explicit per-game engagement contracts and standardized outcome reporting.
- Added bounded daily Firestore aggregation with no player identifier, IP address, free-form metadata, or raw event history.
- Increased weekly challenge rotation to four while retaining an 80-coin weekly reward ceiling.
- Centralized generated-shop policy and premium item classification for the compatibility migration.
- Aggregate telemetry remains client-disabled pending a release-specific privacy approval.

