# Technical Changelog

This feed records automation, validation, deployment, schema, and operational changes. Player-facing highlights remain in `CHANGELOG.md`.

## 1.15.0 — 2026-10-04

- Release week: 2026-W40
- Automated maintenance validation required before merge.
- Production verification retries at 0, 5, and 20 minutes.

### Included commits

- ab7e822 Clarify contribution workflow and release documentation
- 9672f42 Refresh GitHub repository presentation and maintainer documentation
- a471984 ⚡ Bolt: Optimize room status validation with O(1) Set lookup (#356)
- 2cc5d9b Bump firebase-admin from 13.10.0 to 14.5.0 (#354)
- 9f27811 Document Party Mode engineering runbook (#319)
- c691334 Document current deployment, telemetry, and weekly automation runbooks (#287)
- e6f06a2 feat: Add explicit label to Teacher PIN input (#214)
- 98ca4b8 Fix sitemap.xml serving with build-time generation and API fallback (#344)
- bb2f3f6 🎨 Palette: Add tooltips and ARIA labels for disabled shop buttons (#217)
- 543870b 🛡️ Sentinel: [HIGH] Fix HTML injection in email templates (#342)
- 8d8e975 Refine arcade homepage layout and accessibility
- 83e890e Prevent cached guest sessions after Google sign-in
- 26377d9 Restore Google sign-in sessions across devices
- d8ae063 Add 2026-W40 weekly content pack (#352)
- 20db1d0 Prepare weekly release 1.14.0 (#346)
- 2b90a9a Complete weekly release in the scheduled workflow (#348)
- 3ad3f32 Merge validated weekly release PRs through trusted gate (#347)
- dea6214 Fix weekly release PR creation and rerun handling (#345)

## 1.14.0 — 2026-09-27

- Release week: 2026-W39
- Automated maintenance validation required before merge.
- Production verification retries at 0, 5, and 20 minutes.

### Included commits

- dea6214 Fix weekly release PR creation and rerun handling (#345)
- 37eec39 Fix stale auth session state after Google sign-in
- ec1f09a Record September 24 sprint board activity
- 0859c7f Improve Sketch Clash guess feedback
- 11b4ec9 Fix nightly feedback readiness checks (#343)
- b60dc18 Update sprint board for 2026-09-23
- d34f3d8 Update nightly sprint board entries
- 9ae8a92 Restore Sketch Clash Party Mode rotation
- 1755513 Add 2026-W39 weekly content pack (#338)
- 642d60d Add Rune Roots daily game (#335)
- 8545459 Restore compatible Firebase Admin runtime imports (#334)
- 096e530 Restore Vercel Node 22 compatibility (#332)
- f71edb6 Add Bottlecap Curl daily game (#333)
- 92ed3d8 Fail Vercel builds without runtime dependencies (#331)
- 54c99f0 Install production function dependencies on Vercel (#330)
- 2a23e60 Add Stick & Tilt Party Mode game (#329)
- 70a6f68 Add Foxfire Trails daily game (#328)
- ea39851 Update project dependencies and runtimes (#327)
- 1394b26 Add Pollen Passage daily game (#326)
- ec561ec Add Signal Garden daily game (#325)
- 03033ce Add Crowd Shift Blitz party activity (#324)
- 039cc73 Harden Party Mode participation and diagnostics (#323)
- cec56ea Add Party Mode audio feedback (#322)
- 7b0d342 Add durable Party room recovery (#321)
- bd76b90 Add Party Mode player invites (#320)
- a2d3181 Add 2026-W38 weekly content pack (#318)
- 9d3c012 Isolate Party Mode multiplayer service (#317)
- c5a43d7 Add Paper Bridge daily game (#315)
- c79fa11 Add Party Mode play again flow (#314)
- 6f72e0f Add secure Party Mode host recovery (#313)
- 6731b28 Improve Party Mode ready and reconnect flow (#312)
- 01c9034 Add Party Mode activity and selection rules (#311)
- ed0c683 Add Party Mode setup and accessibility presets (#310)
- c59b4c9 Add Chalk Chase daily game (#309)
- 578ac1d Keep removed-player notice visible (#308)
- daf6bb5 Add Party Mode room safety controls (#307)
- 01a6d87 Persistent Party Rotation and Player Voting (#303)
- 7cdd3ed Add Pebble Parade daily game (#305)
- a82bceb Add Ribbon Reversal daily game (#304)
- 17631a8 Make Crowd Shift fun for two players (#302)
- 9874058 Add Crowd Shift party game (#301)
- 6ab43a4 Add Turbo Tilt party platform (#300)
- ffa398a Add Thimble Tide daily game (#299)
- efc1107 Add Clockwork Clover daily game (#298)
- 9339571 Add Nest Stack daily game (#297)
- ea5aac3 Add 2026-W37 weekly content pack (#295)
- 0a54b3f Add Belltower Bloom daily game (#293)
- a4089b2 Add Reed Relay daily game (#292)
- 6127e71 Add Mushroom Morse daily game (#291)
- ca85162 Add Dewdrop Drift daily game (#290)
- 4d95e0e Add Bramble Bounce daily game (#289)
- 7a37c0f Add Frost Footprints daily game (#288)
- 9de574e Add 2026-W36 weekly content pack (#286)
- 81e741c Add Moon Mender daily game (#284)
- 5b4957a Add Cloud Quilt daily game (#283)
- fe5e1c9 Add Echo Ferry daily game (#282)
- 92dded3 Add Kite Circuit daily game (#281)
- 74b4626 Add Seedskip daily game (#280)
- baff29f Redesign Prism Pulse gameplay (#279)
- 870bdb3 Add Prism Pulse daily game (#278)
- d521710 Add Cinder Compass daily game (#277)
- 56b6944 Add 2026-W35 weekly content pack (#276)
- 1d94db2 Add Aurora Accord daily game (#274)
- 1aac277 Add Tideglass Trails daily game (#273)
- aa782e9 Merge pull request #272 from LEnc95/fix/lanternloom-release-history
- 02959e9 Add Lantern Loom daily game (#271)
- f09869e Add Harbor Harmony daily game (#270)
- ff6fde3 Record Lantern Loom August 21 release
- 66592b9 Merge current main while preserving Lantern Loom history
- 4a505a3 Add Lantern Loom daily game
- e9b8980 Sync Bottom of the Ninth: play directed booth clips before live TTS.
- a6882e6 Fix Bottom of the Ninth booth saying Happily instead of batter names.
- 0ad213f Sync Bottom of the Ninth: richer booth copy and less-repeat commentary.
- 90217a0 Sync Bottom of the Ninth: lineups, intentional walks, and steals.
- ca2b1ff Sync Bottom of the Ninth: series host flip, season slash, and new challenges.
- 33e8178 Sync Bottom of the Ninth: gate polish, closer save window, and today's broadcast.
- 50bd5da Sync Bottom of the Ninth: season of series and playoff bracket.
- 217525f Sync Bottom of the Ninth: challenges, closer, and share.
- 73c86b8 Sync Bottom of the Ninth: save/resume and campaign modes.
- c10b4d0 Add Rainkeeper daily game (#268)
- bda8788 Add Magnet Meadow daily game (#267)
- a0fca64 Add Firefly Slants daily game (#266)
- b4fb4bd Add Dapple Grove daily game (#265)
- 6b09db6 Add Glass Garden daily game (#264)
- 0438c43 Raise color commentator level to match play-by-play.
- e315c7e Respect batter handedness for inside/outside booth calls.
- 4d46a99 Mount booth TTS on social API to stay within Hobby function limit.
- bb4e91f Speak live cast lines with player names via booth TTS.
- 0255ec5 Add Nectar Measure daily game (#263)
- db3fc5e Lock booth cast: more Adam/Brian clips and male-only TTS gaps.
- 769906d Fix silent booth: cache-bust sample bank and restore speech gaps.
- 803662d Make directed booth cast audible: no OS TTS fallback, clearer defaults.
- fa03e28 Merge pull request #262 from LEnc95/codex/baseball-radio
- ca0ac20 Wire Eric utility mic for station IDs and vendor calls.
- 2f1c8c5 Merge pull request #261 from LEnc95/codex/baseball-radio
- 9bf91d6 Fix booth samples falling back to system TTS for most calls.
- 5f99148 Merge pull request #260 from LEnc95/codex/baseball-radio
- 7646620 Replace Edge booth samples with ElevenLabs Adam/Brian cast.
- 173efbb Add directed booth voice seed bank for Bottom of the Ninth
- bfe23af Merge pull request #259 from LEnc95/codex/baseball-radio
- ae62fe2 Fix Bottom of the Ninth screen-reader controls and defense balance
- 5305997 Merge pull request #258 from LEnc95/codex/baseball-radio
- e4fd8be Merge origin/main into codex/baseball-radio
- fc7dddd Polish Bottom of the Ninth for mobile play and screen readers
- 9f4363d Add Bottom of the Ninth baseball broadcast game (#257)
- 3c4fae4 Merge remote-tracking branch 'origin/main' into codex/baseball-radio
- dff9152 Add Bottom of the Ninth baseball broadcast game
- 1f49998 Add Gear Grove daily game (#255)
- e98f034 Add Flock Fold daily game (#253)
- c888062 Add Shell Shift daily game (#252)
- e6f8756 Add Kite Parade daily game (#251)
- 990a43d Add shared gameplay clip recording controls (#250)
- 7ecc6d7 Add 2026-W32 weekly content pack (#249)
- de8c128 Add Chorus Current daily game (#248)
- f252ac4 Add River Riddle daily game (#247)
- 8602c2a Add Quilt Quest daily game (#246)
- 089c7de Add Shadow Bloom daily game (#243)
- a1a12c2 Add Moonscale daily game (#242)
- dc263bb Add Acorn Ascent daily game (#241)
- 6d2e2fc Add Lantern Wake daily game (#240)
- 3d65f7c Add Sumshade daily game (#239)
- a5f3f31 Add Firebreak Command daily game (#238)
- 47f1a79 Add Starwheel daily game (#237)
- ba56c73 Add Pollen Patrol daily game (#235)
- ffbfc77 Prepare weekly release 1.13.0 (#234)
- 0a3464e Add Ripple Shepherd daily game (#233)

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

