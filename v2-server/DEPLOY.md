# Multiplayer Cloud Run deployment

Turbo Tilt shares the existing `audioagar-server` service so the public WebSocket endpoint remains backward compatible.

```powershell
gcloud run deploy audioagar-server `
  --source . `
  --project games-aiandsons-io `
  --region us-central1 `
  --allow-unauthenticated `
  --min 0 `
  --max 1 `
  --concurrency 1000 `
  --set-env-vars "ALLOWED_ORIGINS=https://games.aiandsons.io"
```

The single-instance limit is intentional for the small public beta because rooms are held in process memory. Active WebSocket connections keep the instance busy, but rooms do not survive a service revision or instance replacement.

Deploy the server before publishing the static party pages. Verify:

```powershell
Invoke-RestMethod https://audioagar-server-6owms56gxq-uc.a.run.app/healthz/
```

The response must list both `audioagar` and `party`. Cloud Run's current edge routes the slash-terminated health path; the application also registers `/healthz` for local and direct-container checks. Then create a Turbo Tilt room on the production site and join it from two physical phones before treating the rollout as complete.
