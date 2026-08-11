# Booth voice bank

Directed play-by-play / color takes for `SampledVoiceBackend`.

## Locked cast

| Role | Voice | ElevenLabs |
|------|-------|------------|
| Play-by-play | Adam | `ELEVENLABS_PBP_VOICE_ID` |
| Color | Brian | `ELEVENLABS_COLOR_VOICE_ID` |
| Utility / third mic | Eric | `ELEVENLABS_UTILITY_VOICE_ID` |

Use **Eric** for any additional booth voice (vendor shouts, fill, extra mic). Do not introduce a fourth house voice without a new casting pass.

## Layout

- `booth-manifest.json` — maps `{clipId}__{tone}` → WAV file
- `*.wav` — self-hosted clips (mono or stereo; keep short)

Lookup order for a phrase: requested tone, then fallbacks (`hot→lift→calm`, `wry→calm`). Rolled variants like `call.foul.2` fall back to `call.foul.0`.

## Generate / regenerate

```bash
npm run booth:list-clips          # priority key table
npm run booth:generate            # Edge neural → WAV (skips existing)
npm run booth:generate -- --force # rebuild all
# With ElevenLabs:
# ELEVENLABS_API_KEY=... ELEVENLABS_PBP_VOICE_ID=... ELEVENLABS_COLOR_VOICE_ID=... \
#   ELEVENLABS_UTILITY_VOICE_ID=... \
#   npm run booth:generate -- --provider elevenlabs --force
```

Catalog of lines + prosody: `scripts/booth-clip-catalog.json` (`speaker`: `announcer` | `color` | `utility`).

## Naming

`call.homer.0__hot.wav` ↔ manifest key `call.homer.0__hot`.
