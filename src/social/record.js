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
let finishedClip = null;
let finishPromise = null;
let resolveFinish = null;
let startIntentArmed = false;
let phase = 'idle';

const MAX_MS = 120000; // safety cap on capture length (bounds memory use)
const BITRATE = 2_500_000;

const emitState = () => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent('cade:clip-state', {
      detail: getRecordingState(),
    }));
  } catch {
    /* ignore */
  }
};

const setPhase = (next) => {
  phase = next;
  emitState();
};

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

const clearAutoStop = () => {
  if (!autoStopTimer) return;
  clearTimeout(autoStopTimer);
  autoStopTimer = null;
};

const completeRecording = () => {
  clearAutoStop();
  stopTracks();
  const type = chunks[0] && chunks[0].type ? chunks[0].type : 'video/webm';
  const blob = chunks.length ? new Blob(chunks, { type }) : null;
  finishedClip = blob && blob.size ? blob : null;
  recorder = null;
  stream = null;
  active = false;
  chunks = [];
  setPhase(finishedClip ? 'ready' : 'idle');
  if (resolveFinish) resolveFinish(finishedClip);
  finishPromise = null;
  resolveFinish = null;
};

export const isClipSupported = () => {
  if (typeof MediaRecorder === 'undefined') return false;
  const canvas = findCanvas();
  return !!(canvas && typeof canvas.captureStream === 'function');
};

export const getRecordingState = () => ({
  phase,
  active,
  supported: isClipSupported(),
  hasClip: !!finishedClip,
});

// Begin capturing the game canvas. Safe to call unconditionally — it self-gates
// on support and never throws. Returns true if recording actually started.
export const startRecording = ({ fps = 30 } = {}) => {
  try {
    if (active) return true;
    if (!isClipSupported()) return false;
    clearAutoStop();
    stopTracks();
    recorder = null;
    stream = null;
    finishedClip = null;
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
    recorder.onstop = completeRecording;
    recorder.start(1000);
    active = true;
    setPhase('recording');
    autoStopTimer = setTimeout(() => {
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      } catch {
        completeRecording();
      }
    }, MAX_MS);
    return true;
  } catch {
    recorder = null;
    stream = null;
    active = false;
    setPhase('idle');
    return false;
  }
};

const closest = (target, selector) => {
  try {
    return target && typeof target.closest === 'function' ? target.closest(selector) : null;
  } catch {
    return null;
  }
};

const eventTargetLabel = (target) => {
  const control = closest(target, 'button, [role="button"], input[type="button"], input[type="submit"]');
  if (!control) return '';
  return [
    control.id,
    control.getAttribute?.('data-action'),
    control.getAttribute?.('data-command'),
    control.getAttribute?.('aria-label'),
    control.textContent,
    control.value,
  ].filter(Boolean).join(' ').trim().toLowerCase();
};

const isSharedUi = (target) => !!closest(
  target,
  '#cadeFeedbackRoot, [data-cade-clip-control], #cade-social-dock, #cade-social-panel, a[href]',
);

const isExplicitStartIntent = (event) => {
  if (event.type === 'keydown') {
    return event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar';
  }
  const label = eventTargetLabel(event.target);
  return /(^|\s)(start|play|begin|new game|play again|restart|retry|deal|serve|launch|roll)(\s|$)/i.test(label);
};

const hasPendingStartControl = () => {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return false;
  const controls = document.querySelectorAll(
    'button, [role="button"], input[type="button"], input[type="submit"]',
  );
  return Array.from(controls).some((control) => {
    if (control.disabled || control.getAttribute?.('aria-hidden') === 'true') return false;
    if (typeof control.getClientRects === 'function' && control.getClientRects().length === 0) return false;
    const label = eventTargetLabel(control);
    const looksLikeStart = /(^|\s)start(\s|$)/i.test(label)
      || /(^|\s)begin(\s|$)/i.test(label)
      || /(^|\s)play again(\s|$)/i.test(label)
      || /(^|\s)play now(\s|$)/i.test(label)
      || /(^|\s)play-btn(\s|$)/i.test(label);
    return looksLikeStart;
  });
};

const isGameplayIntent = (event) => {
  if (isSharedUi(event.target)) return false;
  if (event.type === 'keydown') {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;
    return /^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|w|a|s|d|W|A|S|D|Enter| |Spacebar)$/
      .test(event.key);
  }
  if (closest(event.target, 'canvas')) return true;
  if (closest(event.target, 'button, [role="button"], input[type="button"], input[type="submit"]')) {
    const label = eventTargetLabel(event.target);
    if (/feedback|leaderboard|race friends|full(screen)?|sound|mute|pause|settings|help|hint|undo/i.test(label)) {
      return false;
    }
    return true;
  }
  return !!closest(event.target, 'main, [role="main"], .game, .board, .stage, .app');
};

// Arm recording without capturing menu or loading-screen time. The first real
// gameplay gesture starts the canvas stream in the capture phase, immediately
// before the game handles that same input. After a finished clip, only an
// explicit Start/Play/Restart action begins a new recording.
export const armRecordingOnGameStart = () => {
  if (typeof document === 'undefined' || startIntentArmed) return;
  startIntentArmed = true;
  const handleIntent = (event) => {
    if (active || !isGameplayIntent(event)) return;
    if (hasPendingStartControl() && !isExplicitStartIntent(event)) return;
    if (finishedClip && !isExplicitStartIntent(event)) return;
    startRecording();
  };
  document.addEventListener('pointerdown', handleIntent, true);
  document.addEventListener('keydown', handleIntent, true);
};

// Stop capturing and return the finished clip as a Blob (or null if nothing was
// recorded). Idempotent and safe to call even if recording never started.
export const finalizeRecording = async () => {
  if (finishedClip && !recorder) return finishedClip;
  if (!recorder) return null;
  if (finishPromise) return finishPromise;
  clearAutoStop();
  const current = recorder;
  const pending = new Promise((resolve) => {
    resolveFinish = resolve;
  });
  finishPromise = pending;
  try {
    if (current.state !== 'inactive') {
      current.stop();
    } else {
      completeRecording();
    }
  } catch {
    completeRecording();
  }
  return pending;
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
