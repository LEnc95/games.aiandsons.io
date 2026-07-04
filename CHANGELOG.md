# Changelog

All notable changes to this project will be documented in this file.

## [1.10.0] - 2026-07-03

### Added
- Added and wired four new games: `looptrail`, `crazyeights`, `pyramidhopper`, and `samegame`.
- Added discovery API storage/handler coverage, homepage carousel rankings, and SameGame feedback metadata.

### Improved
- Refreshed the homepage with space-themed navigation, ranked discovery carousels, carousel pagination, and expanded discovery rows.
- Kept discovery API routes within Vercel Hobby limits while preserving integration coverage.
- Improved internal ops accessibility, school license Enter-key submission, default achievement lookups, and Stripe profile lookup performance.

### Operations
- Refreshed SEO metadata, sitemap entries, OG card assets, Linear seed files, sprint notes, and launch-readiness smoke coverage for the new game surfaces.
- Key PRs: [#202](https://github.com/LEnc95/games.aiandsons.io/pull/202), [#201](https://github.com/LEnc95/games.aiandsons.io/pull/201), [#200](https://github.com/LEnc95/games.aiandsons.io/pull/200), [#198](https://github.com/LEnc95/games.aiandsons.io/pull/198).

## [1.9.0] - 2026-06-26

### Added
- Added and wired seven new games: `pool`, `mushroommarch`, `dominodraw`, `nimgrove`, `tenttrail`, `plinko`, and `glowgrid`.
- Added social share routes, reusable share-card rendering, generated OG card assets, and integration coverage for share flows.

### Improved
- Refreshed game SEO metadata, sitemap entries, and homepage directory coverage for newly added games.
- Added per-game social card metadata across the catalog and refreshed the changelog, pricing, onboarding, accessibility, and room pages with share-card metadata.

### Operations
- Added marketing/OG card generation scripts and documented the SEO/social card generation workflow.
- Key PRs: not recorded in the local repo history for this release window.

## [1.8.0] - 2026-06-19

### Added
- Added and wired six new games: `skeeball`, `towerdefense`, `backgammon`, `darts`, `chess`, and `wordladder`.
- Added social gameplay telemetry, locally persisted challenge history, and player handle emojis in leaderboard lists.

### Improved
- Added Enter-key submission support to billing, feedback, and teacher inputs, plus clearer disabled states for feedback controls.
- Reduced redundant normalization during in-memory family-account lookups.

### Security
- Added social score plausibility caps and rate-limit storage support, and hardened social embed rendering against DOM-based XSS.

### Operations
- Added the Club Penguin World server test command to the contributor runbook and refreshed game directory SEO metadata.
- Key PRs: [#191](https://github.com/LEnc95/games.aiandsons.io/pull/191), [#190](https://github.com/LEnc95/games.aiandsons.io/pull/190).

## [1.7.0] - 2026-06-12

### Added
- Added and wired five new games: `missilecommand`, `calccages`, `caverncrush`, `airhockey`, and `skyjoust`.
- Added social score reporting, cloud-save support, and embedded leaderboards for supported game surfaces.

### Improved
- Improved Race Friends multiplayer stability by recovering stale players more reliably.
- Clarified Race Friends score-update messaging and refreshed site metadata coverage for newly added games.

### Operations
- Added the `npm run test:social` command to the contributor runbook in `AGENTS.md`.
- Key PRs: not recorded in the local repo history for this release window.

## [1.6.0] - 2026-06-05

### Added
- Added and wired seven new games: `rushhour`, `jigsaw`, `kakuro`, `letterlock`, `setmatch`, `flowlines`, and `tripeaks`.
- Expanded the badge catalog and added shop metadata coverage checks.

### Improved
- Improved accessibility across classroom and game UI surfaces by adding visible labels, ARIA labels, and Enter-key submission support for modal inputs.
- Improved state-normalizer and Stripe family-account lookup performance by replacing repeated O(N) membership checks with O(1) set-based lookups and a faster account-member fast path.

### Operations
- Key PRs: [#171](https://github.com/LEnc95/games.aiandsons.io/pull/171), [#170](https://github.com/LEnc95/games.aiandsons.io/pull/170), [#169](https://github.com/LEnc95/games.aiandsons.io/pull/169), [#168](https://github.com/LEnc95/games.aiandsons.io/pull/168), [#167](https://github.com/LEnc95/games.aiandsons.io/pull/167), [#166](https://github.com/LEnc95/games.aiandsons.io/pull/166).

## [1.5.0] - 2026-05-30

### Added
- Added and wired three new games: `yacht-dice`, `nonogram`, and `word-search`.

### Improved
- Improved account lookup performance in the in-memory store by moving account-member checks to O(1) lookups.
- Improved accessibility across key surfaces by adding explicit required indicators for billing email fields, adding accessible labels to coin displays, and adding ARIA labeling plus Enter-key support for family invite input.
- Refreshed site metadata to include newly added games.

### Security
- Replaced remaining DOM-clearing patterns with `.textContent = ''` across game surfaces.

### Operations
- Key PRs: [#164](https://github.com/LEnc95/games.aiandsons.io/pull/164), [#162](https://github.com/LEnc95/games.aiandsons.io/pull/162), [#161](https://github.com/LEnc95/games.aiandsons.io/pull/161).

## [1.4.0] - 2026-05-22

### Added
- Added and wired six new games: `gomoku-grid`, `mancala`, `peg-solitaire`, `tower-of-hanoi`, `checkers`, and `reversi`.

### Improved
- Improved game shell interaction stability by fixing start-modal and overlay click handling and stabilizing overlays during animation frames.
- Improved homepage accessibility compliance by aligning music controls with WCAG 2.5.3 label-in-name requirements.

### Operations
- Optimized nightly Stripe reconcile processing with batched concurrency.
- Key PRs: [#160](https://github.com/LEnc95/games.aiandsons.io/pull/160), [#158](https://github.com/LEnc95/games.aiandsons.io/pull/158), [#157](https://github.com/LEnc95/games.aiandsons.io/pull/157).

## [1.3.0] - 2026-05-15

### Added
- Added and wired four new games: `sundial-sprint`, `bubble-shooter`, `mosaic-match`, and `sudoku-sprint`.
- Added homepage background music controls and smoke-test coverage for that surface.

### Improved
- Improved classroom lock gating performance by optimizing `isGameLockedByClassroom` lookups to O(1).
- Improved mission progress lookup scaling by replacing repeated array membership checks with set-based checks.

### Security
- Removed insecure `Math.random` fallback paths for identifier/token generation and now require secure random support.

### Operations
- Key PRs: [#156](https://github.com/LEnc95/games.aiandsons.io/pull/156), [#154](https://github.com/LEnc95/games.aiandsons.io/pull/154), [#153](https://github.com/LEnc95/games.aiandsons.io/pull/153).

## [1.2.0] - 2026-05-08

### Added
- Added and wired seven new games: `canal-lock`, `skyline-stacker`, `crane-cargo`, `audio-agar`, `aero-courier`, `ribbon-capture`, and `tangle-tuner`.
- Added an authoritative Audio Agar multiplayer server path and deployment documentation.

### Improved
- Improved accessibility with blind-mode support for Dino/Flappy, stronger 2048 audio cues, accessible button/icon palette updates, and aria-label text alignment for WCAG 2.5.3.
- Improved Audio Agar gameplay with expanded tactical blind guidance, movement feedback tuning, and live-route/health-check fixes.
- Refreshed site metadata and launch-related SEO surfaces for newly added games.

### Operations
- Key PRs: [#151](https://github.com/LEnc95/games.aiandsons.io/pull/151), [#150](https://github.com/LEnc95/games.aiandsons.io/pull/150), [#149](https://github.com/LEnc95/games.aiandsons.io/pull/149), [#148](https://github.com/LEnc95/games.aiandsons.io/pull/148), [#147](https://github.com/LEnc95/games.aiandsons.io/pull/147).

## [1.1.0] - 2026-05-01

### Added
- Added and wired seven new games: `orbit-orchard`, `echo-labyrinth`, `beat-rail`, `ember-watch`, `cloud-climber`, `reef-runner`, `codebreaker-grid`, and `marble-circuit`.
- Added audio accessibility surfaces and game lifecycle analytics instrumentation.

### Improved
- Improved SEO metadata, structured data, and sitemap generation.
- Improved launcher/search UX with keyboard shortcut hints and test hardening for debounced discovery, metrics, and launch-readiness flows.
- Improved mission progress performance by switching nested membership checks to `Set.has`.

### Security
- Replaced unsafe DOM-clearing `innerHTML` patterns with safer text rendering approaches.
- Updated Firebase auth/CSP handling and added fallback behavior for internal auth errors.

### Operations
- Key PRs: [#141](https://github.com/LEnc95/games.aiandsons.io/pull/141), [#140](https://github.com/LEnc95/games.aiandsons.io/pull/140), [#139](https://github.com/LEnc95/games.aiandsons.io/pull/139), [#138](https://github.com/LEnc95/games.aiandsons.io/pull/138), [#137](https://github.com/LEnc95/games.aiandsons.io/pull/137), [#136](https://github.com/LEnc95/games.aiandsons.io/pull/136), [#135](https://github.com/LEnc95/games.aiandsons.io/pull/135).

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
