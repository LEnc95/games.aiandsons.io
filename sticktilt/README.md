# Stick & Tilt

A shared-screen stick-figure fighter for 2–8 phones. Host at `/sticktilt/`, join
at `/party/` with the room code, or select **Stick & Tilt · Rumble** in a rotating
Party session. Extra screens use `/sticktilt/?display=CODE`.

Tilt gently left/right to move; tap Punch, Jump, or Guard. Jump through the two
low doodle boxes to land on them, then use either one to reach the high center
box. Motion permission is
requested only after tapping Enable motion controls. Hold still to calibrate;
recenter after changing grip. Touch arrows are always available, including when
permission is denied or sensors are unavailable. Real phones need a secure
browser context for motion access.

Three 30-second rounds; four hits cause a knockout worth one point. Knocked-out
fighters respawn after 1.2 seconds with one second of protection (attacking ends
that protection). Guard lasts 650 ms and recharges in 1.5 seconds. Jump evades
grounded punches. Tied knockout totals share rank and Party placement awards.
Late arrivals enter next round. No elimination downtime beyond respawn.

The Go Party server owns movement, one-way platform collision, combat, cooldowns,
scores, and phase timing.
Combat time freezes on pause and persists through the existing room recovery
snapshot. Embedded screens follow the Party host and never create rooms or
report duplicate outcomes. Aggregate telemetry remains disabled by default.

## Local verification

- `npm run test:sticktilt`: client tests and the full Go server suite.
- `npm run test:sticktilt-smoke`: isolated local server, host, phones, display,
  motion emulation, scoring, recovery, rematch, eight players, capacity rejection,
  and cross-game Party rotation. No production room store is used.
- `npm run test:sticktilt-smoke -- --normal`: a normal 30-second round, including
  combat scoring and portrait/landscape screenshots.
- Browser artifacts: `output/web-game/sticktilt-e2e/`.

Browser automation cannot establish physical sensor feel or whether a group
finds the balance fun. Check calibration on iOS/Android, Wi-Fi latency, and
guard/punch balance with a real group before release. Deployment requires the
updated Party server before the static route is published; see
`v2-server/DEPLOY.md`.

## Verification record

Passed: full Go suite; new and existing Party client integration tests;
Stick & Tilt multiplayer and normal-speed browser smokes; Party rotation,
Turbo Tilt, Crowd Shift group, and feedback browser smokes; game preflight,
maintenance validation, feedback integration, and telemetry tests. Gameplay,
results, eight-player, display, and phone screenshots were visually inspected.

Remaining regression limitation: the existing Crowd Shift **duel** browser smoke
times out waiting for `ready_count === 1`. This also reproduced with the original
Party phone UI restored. Its group smoke and Go/client tests pass. Physical-device
motion feel still needs a hands-on playtest.

Deployed on September 17, 2026: Cloud Run `party-server-00008-k4t` and Vercel
production deployment `dpl_3dcsM4PSZtqhmpN4iniyDP4u5uFt`, serving
`https://games.aiandsons.io`. The live Party smoke passed: activity catalog,
default enablement, host selection, two phone controllers, embedded arena,
synchronized display, touch movement, jump, pause/resume, and session end.
Repeat with `node scripts/qa/sticktilt-production-smoke.mjs`.
