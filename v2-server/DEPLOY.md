# Multiplayer Cloud Run deployment

Audio Agar and Party Mode use the same versioned protocol and source package, but run as separate Cloud Run services. This prevents a Party Mode release or traffic spike from restarting or competing with Audio Agar rooms.

Deploy Party Mode:

```powershell
gcloud run deploy party-server `
  --source . `
  --project games-aiandsons-io `
  --region us-central1 `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances 1 `
  --concurrency 1000 `
  --set-env-vars "ALLOWED_ORIGINS=https://games.aiandsons.io,ENABLED_GAMES=party,SERVICE_NAME=party-server"
```

Deploy Audio Agar:

```powershell
gcloud run deploy audioagar-server `
  --source . `
  --project games-aiandsons-io `
  --region us-central1 `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances 1 `
  --concurrency 1000 `
  --set-env-vars "ALLOWED_ORIGINS=https://games.aiandsons.io,ENABLED_GAMES=audioagar,SERVICE_NAME=audioagar-server"
```

The single-instance limit is intentional for the small public beta because rooms are held in process memory. Active WebSocket connections keep the instance busy, but rooms do not survive a service revision or instance replacement.

Deploy the server before publishing the static party pages. Verify:

```powershell
Invoke-RestMethod https://party-server-6owms56gxq-uc.a.run.app/healthz/
Invoke-RestMethod https://audioagar-server-6owms56gxq-uc.a.run.app/healthz/
```

The Party response must list only `party` (with `turbotilt` and `crowdshift` in the party game list), while the Audio Agar response must list only `audioagar`. Cloud Run's current edge routes the slash-terminated health path; the application also registers `/healthz` for local and direct-container checks. Then create a rotating Party room on the production site, join it from two physical phones, complete a vote, and open the copied display link on a second computer before treating the rollout as complete.
