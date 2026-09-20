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
  --set-env-vars "ALLOWED_ORIGINS=https://games.aiandsons.io,ENABLED_GAMES=party,SERVICE_NAME=party-server,PARTY_ROOM_STORE=firestore,FIRESTORE_PROJECT_ID=games-aiandsons-io"
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

The single-instance limit remains intentional because live room coordination is process-owned. The Party service checkpoints a server-only recovery snapshot to Firestore every two seconds; a valid reconnect can reload the room for 15 minutes after an instance or revision replacement. Recovered active games remain paused until the host returns. Firestore persistence does not make multiple concurrently active Party instances safe.

Deploy the server before publishing the static party pages. Verify:

```powershell
Invoke-RestMethod https://party-server-6owms56gxq-uc.a.run.app/healthz/
Invoke-RestMethod https://audioagar-server-6owms56gxq-uc.a.run.app/healthz/
```

The Party response must list only `party` (with `turbotilt` and `crowdshift` in the party game list) and report `roomRecovery: true`, while the Audio Agar response must list only `audioagar` and must not report recovery enabled. Cloud Run's current edge routes the slash-terminated health path; the application also registers `/healthz` for local and direct-container checks. Then create a rotating Party room, join it, deploy a replacement revision, and confirm the same host token, player token, room code, settings, and scores reconnect before completing the normal gameplay smoke.
