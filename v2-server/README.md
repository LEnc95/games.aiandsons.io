# v2-server

Authoritative WebSocket game server for multiplayer AI and Sons games.

## Current Game

- `audioagar`: real-time orb arena with server-owned movement, pellets, bots, mass growth, split/eject actions, eating, death events, and per-player snapshots.

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

## Test

```powershell
cd v2-server
go test ./...
```
