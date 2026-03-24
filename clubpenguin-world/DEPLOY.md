# Club Penguin World Preview + Live Multiplayer

This project uses a split setup:
- Frontend (static files) on Vercel preview.
- Go WebSocket backend hosted separately (container host).

## 1) Frontend Preview URL

Share this path on your Vercel preview domain:

`https://<preview-domain>/clubpenguin-world/public/`

## 2) Deploy the Go WebSocket Backend

This folder includes a container build file: [`Dockerfile`](./Dockerfile).

Deploy `clubpenguin-world/` to any container host (Render, Railway, Fly.io, etc.) and expose port `8081`.
Most hosts set `PORT` automatically; this server reads that env var.

Health check URL after deploy:

`https://<your-backend-domain>/`

WebSocket endpoint:

`wss://<your-backend-domain>/ws`

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
