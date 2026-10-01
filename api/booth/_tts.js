/**
 * ElevenLabs proxy for Bottom of the Ninth cast voices.
 * Speaks the live phrase text (names, count, field) as Adam / Brian / Eric.
 */

const DEFAULT_VOICES = {
  announcer: "pNInz6obpgDQGcFmaJgB", // Adam
  color: "nPczCjzI2devNBz1zQrb", // Brian
  utility: "cjVigY5qzO86Huf0OWal", // Eric
};

const MAX_TEXT = 360;
const ALLOWED_SPEAKERS = new Set(["announcer", "color", "utility"]);
const AUDIO_TAG = /\[(?:happily|excited|sighs|whispers|sadly|angry|laughs)\]\s*/gi;
const NAME_PRONUNCIATIONS = [
  [/\bHorwitz\b/g, "Hor-witz"],
  [/\bArraez\b/g, "Arry-ez"],
  [/\bRodríguez\b/g, "Rodriguez"],
  [/\bRealmuto\b/g, "Real-moo-toe"],
  [/\bSkenes\b/g, "Skeens"],
  [/\bBohm\b/g, "Bome"],
];

/** Strip v3 direction tags and respell names so TTS does not say "Happily". */
function prepareBoothText(text) {
  let out = String(text || "").replace(AUDIO_TAG, "");
  for (const [pattern, spoken] of NAME_PRONUNCIATIONS) {
    out = out.replace(pattern, spoken);
  }
  return out.replace(/\s+/g, " ").trim();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body"), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function voiceIdFor(speaker) {
  if (speaker === "color") {
    return process.env.ELEVENLABS_COLOR_VOICE_ID || DEFAULT_VOICES.color;
  }
  if (speaker === "utility") {
    return process.env.ELEVENLABS_UTILITY_VOICE_ID || DEFAULT_VOICES.utility;
  }
  return process.env.ELEVENLABS_PBP_VOICE_ID || DEFAULT_VOICES.announcer;
}

function toneSettings(tone) {
  switch (tone) {
    case "hot":
      return { stability: 0.32, similarity_boost: 0.78, style: 0.65, use_speaker_boost: true };
    case "lift":
      return { stability: 0.4, similarity_boost: 0.75, style: 0.5, use_speaker_boost: true };
    case "wry":
      return { stability: 0.55, similarity_boost: 0.72, style: 0.35, use_speaker_boost: true };
    default:
      return { stability: 0.48, similarity_boost: 0.74, style: 0.25, use_speaker_boost: true };
  }
}

async function handleHealth(_req, res) {
  const configured = Boolean(process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(
    JSON.stringify({
      ok: configured,
      cast: {
        announcer: "Adam",
        color: "Brian",
        utility: "Eric",
      },
    }),
  );
}

async function handleTts(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end("Method not allowed");
    return;
  }

  const key = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY;
  if (!key) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Booth TTS is not configured." }));
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    res.statusCode = error.statusCode || 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: error.message || "Bad request" }));
    return;
  }

  const speaker = String(body.speaker || "announcer");
  if (!ALLOWED_SPEAKERS.has(speaker)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid speaker." }));
    return;
  }

  const text = prepareBoothText(body.text);
  if (!text || text.length > MAX_TEXT) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Text missing or too long." }));
    return;
  }

  const tone = typeof body.tone === "string" ? body.tone : "calm";
  const voiceId = voiceIdFor(speaker);
  const model = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";

  const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: toneSettings(tone),
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    res.statusCode = upstream.status === 401 || upstream.status === 402 ? upstream.status : 502;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "ElevenLabs TTS failed.",
        status: upstream.status,
        detail: detail.slice(0, 240),
      }),
    );
    return;
  }

  const audio = Buffer.from(await upstream.arrayBuffer());
  res.statusCode = 200;
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Booth-Speaker", speaker);
  res.setHeader("X-Booth-Voice", speaker === "color" ? "Brian" : speaker === "utility" ? "Eric" : "Adam");
  res.end(audio);
}

module.exports = {
  handleHealth,
  handleTts,
  prepareBoothText,
  DEFAULT_VOICES,
  MAX_TEXT,
  ALLOWED_SPEAKERS,
};
