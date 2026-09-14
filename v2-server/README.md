# v2-server

Authoritative WebSocket game server for multiplayer AI and Sons games.

## Current Games

- `audioagar`: real-time orb arena with server-owned movement, pellets, bots, mass growth, split/eject actions, eating, death events, and per-player snapshots.
- `party` / `turbotilt` / `crowdshift`: ephemeral four-letter rooms with a dedicated host screen, 2–8 phone controllers, up to 16 read-only synchronized displays, reconnect tokens, and role-specific authoritative game snapshots. A rotating `gameKey: "party"` room keeps the roster and standings while players vote on the next game and mode.

## Run Locally

```powershell
cd v2-server
go run .
```

The server listens on `PORT` or `8081` by default.

Endpoints:

- `GET /healthz`
- `WS /ws`
- `WS /ws/game`

The Audio Agar frontend defaults to `ws://127.0.0.1:8081/ws` on localhost. You can also override the endpoint with `?ws=ws://127.0.0.1:8081/ws`.

Production routes each game family to its own Cloud Run service:

- Audio Agar: `wss://audioagar-server-6owms56gxq-uc.a.run.app/ws`
- Party Mode: `wss://party-server-6owms56gxq-uc.a.run.app/ws`

Both deployments use this source package, with `ENABLED_GAMES` restricting each runtime to its intended game. Keeping the shared protocol implementation avoids duplicated networking code while isolating room memory, releases, and capacity.

## Party Mode engineering runbook

Party Mode is the multi-screen room system served from `/party/` and backed by the Go server in this package. Use these files when changing the flow:

- `party/app.js`: shared host/display screen, phone controller, saved settings, reconnect tokens, and embedded-activity iframe bridge.
- `turbotilt/game.js` and `crowdshift/game.js`: standalone hosts plus Party Mode embedded activity renderers.
- `src/net/multiplayerClient.js`: endpoint resolution, version-one message envelope, reconnects, heartbeats, and input sequencing.
- `v2-server/party.go`: room creation, joins, roles, safety controls, host recovery, Turbo Tilt actions, snapshots, and room expiry.
- `v2-server/party_rotation.go`: rotating party settings, activity catalog, voting/spin lifecycle, ranking, catch-up scoring, and play-again reset.

### Runtime constraints

- Rooms are process memory only. Keep Party Mode on a single Cloud Run instance while this remains true; a revision rollout or instance replacement drops active rooms.
- Room codes are four uppercase letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` so ambiguous `I` and `O` are not accepted.
- Capacity is capped at 100 rooms, 2-8 phone players per room, and 16 read-only display clients per room.
- Empty `ENABLED_GAMES` enables both `audioagar` and `party` for local compatibility. A non-empty value only enables recognized game families; typos enable nothing and joins fail with `game_unavailable`.
- `/healthz` must report the runtime's enabled family. The Party service should list `games:["party"]` and `partyGames:["turbotilt","crowdshift"]`; the Audio Agar service should list only `games:["audioagar"]`.

### Endpoint selection

Browser clients resolve WebSocket URLs in this order:

1. An explicit `endpoint` passed to `connect()`.
2. `?ws=` or `?endpoint=` in the page URL.
3. `globalThis.__AIANDSONS_WS_ENDPOINT`.
4. The `aiandsons-multiplayer-ws-endpoint` localStorage override.
5. Production defaults when the host contains `aiandsons.io` or `vercel.app`.
6. `ws://127.0.0.1:8081/ws` for local static-server testing.

Production defaults are family-specific: `gameId:"party"` goes to `party-server`, while every other game family defaults to `audioagar-server`.

### Join contract

All clients use the shared `aiandsons.multiplayer.v1` envelope. Rotating Party Mode hosts create a room by joining with `gameId:"party"`, `role:"host"`, `gameKey:"party"`, and no room ID:

```json
{
  "protocol": "aiandsons.multiplayer.v1",
  "v": 1,
  "type": "join",
  "gameId": "party",
  "payload": { "role": "host", "gameKey": "party" }
}
```

Phone controllers join the returned room with `role:"player"`, `playerName`, `playerAvatar`, and an optional saved `token`. Extra TVs or computers join the same room with `role:"display"`; displays receive host snapshots at 15 Hz, do not consume player capacity, and any attempted input is rejected as `display_read_only`.

The Party page stores player reconnect tokens in localStorage under `aiandsons-party-player:<room>` and host tokens in sessionStorage under `aiandsons-party-host:<room>`. It also stores the latest host recovery card in localStorage for 15 minutes, but server-side recovery still depends on the room process being alive and the host token matching.

### Lifecycle, settings, and host controls

Rotating rooms move through `party_lobby`, `voting`, `spinning`, `next_up`, `activity`, `results`, and `ended`. The host can `start`, `pause`, `resume`, `skip`, `end`, and, after `ended`, `play_again`. Active rooms pause when the host disconnects; if the host does not reconnect within 60 seconds the server marks the room ended. Lobby rooms expire after 15 minutes of inactivity, and ended/podium rooms are retained for 2 minutes.

`configure_party` is accepted only before the party starts. Supported settings are:

- `durationPreset`: `quick` (3 activities), `standard` (6), or `marathon` (10).
- `playStyle`: `mixed`, `competitive`, or `cooperative`; activity options are filtered by style and player count.
- `accessibilityPreset`: `standard`, `family`, `relaxed`, or `custom`. The first three presets normalize extended timers, reduced motion, and high contrast on the server.
- `selectionMethod`: `chaos`, `majority`, `unanimous`, or `host`. `host` exposes the host-only `choose_activity` action during voting.
- `repeatAvoidance`: `off`, `immediate`, or `session`. When the session pool is exhausted, history resets and selection continues.
- `enabledActivities`: non-empty list of IDs from `partyActivityCatalog`.
- `catchUp`: when enabled, activity awards add 2 points for players at least 8 party points behind the leader.

Room safety controls are host-only: `lock`/`unlock`, `late_join_on`/`late_join_off`, `friendly_names_on`/`friendly_names_off`, `set_max_players`, and `kick`. Kicked player tokens are blocked from reconnecting to that room.

## Protocol

Client messages use the versioned envelope:

```json
{
  "protocol": "aiandsons.multiplayer.v1",
  "v": 1,
  "type": "join",
  "gameId": "audioagar",
  "roomId": "lobby",
  "payload": { "playerName": "Player" }
}
```

Inputs are sent as:

```json
{
  "protocol": "aiandsons.multiplayer.v1",
  "v": 1,
  "type": "input",
  "gameId": "audioagar",
  "roomId": "lobby",
  "payload": {
    "seq": 1,
    "input": { "type": "move", "direction": "NE", "vector": { "x": 0.7, "y": -0.7 } }
  }
}
```

The server broadcasts personalized `state` messages with `payload.state.selfId`, `players`, `pellets`, `arenaWidth`, `arenaHeight`, `tick`, and `roomId`.

Party hosts join with `gameId: "party"`, `role: "host"`, `gameKey: "party"` (or a standalone game key), and an empty room ID. Phone controllers join the returned room ID with `role: "player"`; rotating rooms accept `{type:"party_vote", optionId}` during the voting phase and keep the same reconnect token across activities. Additional TVs or computers use `role: "display"`; they receive the full host snapshot at 15 Hz, do not consume player capacity, and cannot send game or host input. The existing version-one envelope is unchanged; game-specific input data is decoded only after dispatching to the selected game.

Rotating rooms progress through `party_lobby`, `voting`, `spinning`, `next_up`, `activity`, and `results` until the host sends `{type:"host", action:"end"}`. Three deterministic game+mode cards are generated for each vote; connected players' named ballots become weighted wheel slices, and normalized placement points persist in `partyPoints` across activities.

Turbo Tilt party input also supports validated `gadget`, `vote`, `customize`, `emote`, and `horn` messages. Host `configure` actions select Classic, Elimination, Teams, Relay, Survival, or Chaos Cup; two to five heats; track rotation; obstacle density; and reduced-motion presentation. All selections, modifiers, events, route rewards, team state, and the bounded photo-finish buffer remain ephemeral in the room process.

Crowd Shift accepts secret `choice` inputs during seven server-timed rounds. Rooms that start with exactly two connected players enter Duel Shift: both players also submit a secret `predict` input, build individual mind-read streaks, and may risk one `hot_take` per match for a larger correct-read bonus or a 400-point steal by their rival. Three-to-eight-player rooms retain majority, minority, near-even split, and unanimity scoring. Prompts, reveals, scores, and reconnect state are authoritative and ephemeral; host/display snapshots expose readiness but hide choices, predictions, and Hot Takes until reveal.

See `DEPLOY.md` for the single-instance Cloud Run beta configuration and rollout order.

## Test

```powershell
cd v2-server
go test ./...
```

Focused client and smoke coverage for Party Mode lives outside this package:

```powershell
npm run test:turbotilt
npm run test:crowdshift
node --test tests/party-rotation-client.integration.test.mjs tests/party-avatar.integration.test.mjs
npm run test:party-rotation-smoke
```

When changing endpoint selection or service isolation, also run `npm run test:audioagar` because Audio Agar and Party Mode share `src/net/multiplayerClient.js`.
