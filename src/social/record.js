// Optional gameplay clip recorder for canvas games.
//
// Captures the game's <canvas> via captureStream + MediaRecorder so a player
// can save/share a short video of their run at game over. Video-only (silent)
// in v1 — the game audio paths (src/core/sfx.js) are inconsistent across games
// and silent clips with captions are the norm for socials anyway.
//
// DOM-based games (no <canvas>, e.g. 2048) are unsupported: isClipSupported()
// returns false and the caller simply hides the "Save clip" button. Everything
// is wrapped so a recording failure can never break gameplay.
import { nativeShare } from './share.js';
import { downloadBlob } from './card.js';

let recorder = null;
let chunks = [];
let stream = null;
let active = false;
let autoStopTimer = null;

const MAX_MS = 120000; // safety cap on capture length (bounds memory use)
const BITRATE = 2_500_000;

const findCanvas = () => {
  if (typeof document === 'undefined') return null;
  return document.querySelector('canvas#game') || document.querySelector('canvas');
};

const pickMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  }) || '';
};

const stopTracks = () => {
  try {
    if (stream) stream.getTracks().forEach((track) => track.stop());
  } catch {
    /* ignore */
  }
};

export const isClipSupported = () => {
  if (typeof MediaRecorder === 'undefined') return false;
  const canvas = findCanvas();
  return !!(canvas && typeof canvas.captureStream === 'function');
};

// Begin capturing the game canvas. Safe to call unconditionally — it self-gates
// on support and never throws. Returns true if recording actually started.
export const startRecording = ({ fps = 30 } = {}) => {
  try {
    if (active) return true;
    if (!isClipSupported()) return false;
    const canvas = findCanvas();
    stream = canvas.captureStream(fps);
    const mimeType = pickMimeType();
    recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType, videoBitsPerSecond: BITRATE } : { videoBitsPerSecond: BITRATE },
    );
    chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    recorder.start(1000);
    active = true;
    autoStopTimer = setTimeout(() => {
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      } catch {
        /* ignore */
      }
      stopTracks();
      active = false;
    }, MAX_MS);
    return true;
  } catch {
    recorder = null;
    stream = null;
    active = false;
    return false;
  }
};

// Stop capturing and return the finished clip as a Blob (or null if nothing was
// recorded). Idempotent and safe to call even if recording never started.
export const finalizeRecording = async () => {
  if (!recorder) return null;
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
  const current = recorder;
  const done = new Promise((resolve) => {
    if (current.state === 'inactive') {
      resolve();
      return;
    }
    current.onstop = () => resolve();
  });
  try {
    if (current.state !== 'inactive') current.stop();
  } catch {
    /* ignore */
  }
  await done;
  stopTracks();
  const type = chunks[0] && chunks[0].type ? chunks[0].type : 'video/webm';
  const blob = chunks.length ? new Blob(chunks, { type }) : null;
  recorder = null;
  stream = null;
  active = false;
  chunks = [];
  return blob && blob.size ? blob : null;
};

// Offer a finished clip via the native share sheet (with the file when the
// platform supports it) or fall back to a download.
export const shareClip = async (blob, { slug, name } = {}) => {
  if (!blob) return false;
  const filename = `${slug || 'arcade'}-run.webm`;
  let file = null;
  try {
    file = new File([blob], filename, { type: blob.type || 'video/webm' });
  } catch {
    file = null;
  }
  const shared = file
    ? await nativeShare({
        title: name ? `${name} run` : 'My run',
        text: `My ${name || 'arcade'} run — play free at games.aiandsons.io`,
        files: [file],
      })
    : false;
  if (!shared) downloadBlob(blob, filename);
  return true;
};
