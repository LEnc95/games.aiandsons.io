# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-04-19

### Changed
- Bumped product version to `1.0.0`.
- Standardized version tracking across `version.json` (runtime badge) and `package.json` (project metadata).
- Established the release practice: each changelog update should be paired with a version increment.

## [0.2.0] - 2026-04-19

### Added
- Added and wired seven new games in the launcher: `diceforge`, `keystrike-command`, `pulse-parry`, `magnet-rail`, `loom-lock`, `tide-tower`, and `star-lattice`.
- Added an onboarding split with dedicated parent and teacher pathways.
- Added this changelog surface and published it at `/changelog`.

### Improved
- Improved accessibility with better modal focus restoration and cleaner decorative icon screen-reader behavior.
- Improved launch-readiness smoke stability for discovery and search flows.
- Improved backend and admin route performance by parallelizing independent operations with `Promise.all`.

### Security
- Mitigated potential DOM-based XSS in element-clearing paths by switching to safer text rendering.
- Added Strict-Transport-Security response headers.

### Operations
- Expanded feedback coverage to additional legacy game pages.
- Continued rollout of launch-readiness and policy gate workflows for release safety.

## [0.1.0] - 2026-03-06

### Added
- Initial public browser arcade experience with a core game catalog.
- Local-first progression systems including coins, badges, inventory, cosmetics, and recent games.
- Classroom mode with game restrictions, teacher controls, and optional shop locking during active sessions.
- Privacy and school data policy pages.
