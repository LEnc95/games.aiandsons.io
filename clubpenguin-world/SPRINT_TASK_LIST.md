# Club Penguin World - 3 Week Sprint Task List

Last updated: 2026-03-22
Goal: move from movement/chat prototype to a playable social world with short-session objectives, progression, and repeatable activities.

## Production Design Overhaul Track (3 Weeks)

### Week 1 - Visual Foundation + UX Cleanup
- [x] Define production visual direction (type scale, color tokens, panel language).
- [x] Replace prototype shell with polished responsive layout (desktop + mobile).
- [x] Improve chat panel hierarchy and quick-chat discoverability.
- [x] Add explicit connection state visuals (`connecting`, `connected`, `error`).
- [x] Add avatar/nameplate readability pass (contrast, sizing, overlap handling).
- [x] Add interaction affordance pass for portals, NPCs, and collectibles.

### Week 2 - Productized UI Systems
- [ ] Build reusable component CSS patterns for buttons/inputs/chips/lists.
- [ ] Add accessibility pass (focus rings, contrast checks, reduced-motion support).
- [ ] Add empty/loading/error states for all side-panel modules.
- [ ] Add lightweight animation system for room transitions + notifications.
- [ ] Add settings panel (audio, UI scale, chat filtering preferences).

### Week 3 - Content Polish + Release Readiness
- [ ] Add room-specific art polish pass (Town, Plaza, Snow Forts) with consistent brand.
- [ ] Add UX copy pass for onboarding hints, notices, and quick-chat prompts.
- [ ] Add production QA checklist for layout/input parity across desktop and mobile.
- [ ] Capture launch screenshots and create visual regression baselines.
- [ ] Finalize release-ready UI acceptance criteria and sign-off checklist.

## Sprint 1 (Week 1) - Core Playability

### Theme
Give players immediate things to do in-session.

### Tasks
- [x] Add starter objective system (server-authoritative completion + rewards).
- [x] Add visible objective tracker UI with coin counter.
- [x] Add emote actions and multiplayer emote broadcast.
- [x] Add room portal pads with enter-zone gating (no instant click teleport).
- [x] Enforce room travel rules on server so client cannot bypass portal checks.
- [x] Keep movement responsive around blocked zones (resolve blocked click to nearest walkable point).
- [x] Add NPC greeter in Town with first guided hint flow.
- [x] Add objective completion toast + sound cue.
- [x] Add objective reset path for QA and demos.
- [x] Add one extra interaction loop (collectible or timed event) per room.

## Sprint 2 (Week 2) - Economy + Persistence

### Theme
Turn short activities into progression players care about.

### Tasks
- [ ] Add persistent player profile storage (name, coins, completed objectives) using SQLite.
- [ ] Add inventory model (`ownedItems`, `equipped`) and wire to profile persistence.
- [ ] Add basic cosmetic shop UI + server purchase validation.
- [ ] Add equip/unequip flow for at least 3 starter cosmetics.
- [ ] Add daily rotating objective set with server date boundaries.
- [ ] Add anti-abuse limits for objective farming (cooldowns and one-time claims).
- [ ] Add reconnect/resume flow so players keep session progress after refresh.
- [ ] Add migration/versioning for saved player data.

## Sprint 3 (Week 3) - Social Retention + Content Loop

### Theme
Make the world feel social and worth returning to.

### Tasks
- [ ] Add friend request + presence list (room + online status).
- [ ] Add private whispers with moderation constraints.
- [ ] Add party/minigame room prototype (single queue + match start).
- [ ] Add achievement badges and profile showcase panel.
- [ ] Add room event scheduler (top-of-hour micro event in one room).
- [ ] Add admin/mod controls for mute/kick in active room.
- [ ] Add analytics events for onboarding funnel and retention checkpoints.
- [ ] Prepare release candidate checklist (load test, reconnect chaos test, exploit pass).

## Started Today (Execution Log)

- [x] Started production design overhaul pass (fonts, tokenized color system, polished panel shell).
- [x] Added explicit status-state visuals and quick-chat no-match empty state.
- [x] Improved avatar readability with stronger nameplates and overlap-aware label stacking.
- [x] Added animated interaction affordances for portals, NPCs, and collectibles.
- [x] Implemented server-authoritative starter objectives with coin rewards.
- [x] Implemented objective UI and coin tracker.
- [x] Implemented emote actions (`wave`, `dance`, `cheer`, `laugh`, `snowball`) with room broadcast.
- [x] Implemented portal travel gating: player must physically enter portal area before transfer.
- [x] Added/updated tests for progress rewards, portal travel rules, and movement/portal map copies.
- [x] Implemented Town NPC greeter (`Rory`) with stage-based guided hints tied to starter progression.
- [x] Added server-authoritative room collectible loop (`Coin Puff`) with per-room coin rewards and respawn.
- [x] Added QA reset control + `qa:resetProgress` server event to restart starter tasks instantly.

## Next Immediate Build Order (tomorrow queue)

1. NPC greeter + guided hint flow in Town.
2. Objective completion toast/sound feedback.
3. One additional room interaction loop (collectible/timed interaction).
