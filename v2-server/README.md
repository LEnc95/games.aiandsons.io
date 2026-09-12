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

Production uses the dedicated Cloud Run endpoint:

`wss://audioagar-server-6owms56gxq-uc.a.run.app/ws`

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
