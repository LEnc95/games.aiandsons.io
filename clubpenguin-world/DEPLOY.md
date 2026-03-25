# Club Penguin World Preview + Live Multiplayer

This project uses a split setup:
- Frontend (static files) on Vercel preview.
- Go WebSocket backend hosted separately (container host).

## 1) Frontend Preview URL

Share this path on your Vercel preview domain:

`https://<preview-domain>/clubpenguin-world/public/`

## 2) Deploy the Go WebSocket Backend

This folder includes a container build file: [`Dockerfile`](./Dockerfile).
The image includes an internal Docker `HEALTHCHECK` that probes `http://127.0.0.1:${PORT}/healthz`.

Deploy `clubpenguin-world/` to any container host (Render, Railway, Fly.io, etc.) and expose port `8081`.
Most hosts set `PORT` automatically; this server reads that env var.
Set `WS_ALLOWED_ORIGINS` to your frontend origins (comma-separated) for safer production websocket access.
Set `MAX_CLIENTS` to cap concurrent websocket sessions per instance.

Health check URL after deploy:

`https://<your-backend-domain>/healthz`

WebSocket endpoint:

`wss://<your-backend-domain>/ws`

Example env:

`WS_ALLOWED_ORIGINS=https://<preview-domain>,https://<production-domain>`

`MAX_CLIENTS=300`

## 3) Connect Preview to Backend

Use either:

- In-game sidebar: **Multiplayer Server** -> enter `wss://<your-backend-domain>/ws` -> click **Connect**
- Or direct share URL:
  - `https://<preview-domain>/clubpenguin-world/public/?ws=wss://<your-backend-domain>/ws`

You can also include room:

`https://<preview-domain>/clubpenguin-world/public/?room=town&ws=wss://<your-backend-domain>/ws`

## 4) Friend Invite Flow

After connecting to your backend, click **Copy Invite** in the sidebar.
It copies a link that preserves both `room` and `ws` values so friends join the same live server.

## 5) In-Game Backend Status

The Multiplayer Server panel shows a backend status pill (`checking`, `healthy`, `error`) based on `/healthz`.
If this is not healthy after connect, verify:
- backend domain is reachable
- backend is serving `/healthz` and `/ws`
- `WS_ALLOWED_ORIGINS` includes your frontend domain

## 6) Runtime Ops Notes

- Server now performs graceful shutdown on `SIGTERM`/`SIGINT` with a 15s timeout window.
- HTTP requests are logged with method/path/status/latency for quick production debugging.
- `/healthz` reports room totals, connected clients, and configured max clients.
