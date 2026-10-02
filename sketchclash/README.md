# Sketch Clash

Open `/sketchclash/` to host a room and `/party/?code=ROOM` on each phone. The shared screen uses the existing Party WebSocket room; it can be mirrored at `/sketchclash/?display=ROOM`.

The Go Party server owns phases, artist rotation, prompts, timer timestamps, guesses, scoring, and stroke history. Public snapshots contain only progress, scores, and validated normalized vector strokes. During a round the selected prompt is projected only when the authenticated `selfId` is the active artist; host displays and guessers never receive it. Strokes are validated for artist, phase, round ID, strictly increasing sequence, bounded points, normalized coordinates, tool, and width before being retained for refreshed displays.

For LAN testing, run the Party server and static site on reachable local addresses, pass the Party WebSocket endpoint through the existing `ws` URL parameter, then join the host's four-letter code from separate browser/device sessions.
