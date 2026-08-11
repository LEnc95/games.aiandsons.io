# Booth voice bank

Directed play-by-play / color takes for `SampledVoiceBackend`.

## Layout

- `booth-manifest.json` — maps `{clipId}__{tone}` → WAV file
- `*.wav` — self-hosted clips (mono or stereo; keep short)

Lookup order for a phrase: requested tone, then fallbacks (`hot→lift→calm`, `wry→calm`).

## Generate / regenerate

```bash
npm run booth:list-clips          # priority key table
npm run booth:generate            # Edge neural → WAV (skips existing)
npm run booth:generate -- --force # rebuild all
# With ElevenLabs:
# ELEVENLABS_API_KEY=... ELEVENLABS_PBP_VOICE_ID=... ELEVENLABS_COLOR_VOICE_ID=... \
#   npm run booth:generate -- --provider elevenlabs --force
```

Catalog of lines + prosody: `scripts/booth-clip-catalog.json`.

## Naming

`call.homer.0__hot.wav` ↔ manifest key `call.homer.0__hot`.
