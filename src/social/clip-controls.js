import { trackKpiEvent } from '../core/metrics.js';
import {
  armRecordingOnGameStart,
  finalizeRecording,
  getRecordingState,
  isClipSupported,
  shareClip,
} from './record.js';

const ROOT_ID = 'cadeClipControl';
const STYLE_ID = 'cadeClipControlStyles';

const injectStyles = () => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .cade-clip-control {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 62px);
      right: calc(env(safe-area-inset-right, 0px) + 12px);
      z-index: 10000;
      min-height: 38px;
      padding: 9px 13px;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 999px;
      background: rgba(6, 12, 24, 0.82);
      color: #eef5ff;
      font: 700 13px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      box-shadow: 0 10px 24px rgba(0,0,0,0.28);
      backdrop-filter: blur(10px) saturate(140%);
    }
    .cade-clip-control[data-state="recording"],
    .cade-clip-control[data-state="ready"] {
      cursor: pointer;
      border-color: rgba(251, 191, 36, 0.55);
      background: rgba(38, 25, 8, 0.9);
      color: #fef3c7;
    }
    .cade-clip-control[data-state="recording"]::before {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      margin-right: 7px;
      border-radius: 50%;
      background: #fb7185;
      box-shadow: 0 0 0 3px rgba(251,113,133,0.18);
    }
    .cade-clip-control:disabled {
      cursor: default;
      opacity: 0.72;
    }
    @media (max-width: 640px) {
      .cade-clip-control {
        top: calc(env(safe-area-inset-top, 0px) + 12px);
        right: calc(env(safe-area-inset-right, 0px) + 150px);
        min-height: 36px;
        padding: 8px 11px;
        font-size: 12px;
      }
    }
    @media (max-width: 350px) {
      .cade-clip-control {
        top: calc(env(safe-area-inset-top, 0px) + 58px);
        right: calc(env(safe-area-inset-right, 0px) + 12px);
      }
    }
  `;
  document.head.appendChild(style);
};

export function mountClipControls({ gameSlug = '', gameName = '' } = {}) {
  if (document.getElementById(ROOT_ID) || !isClipSupported()) return;
  injectStyles();
  armRecordingOnGameStart();

  const button = document.createElement('button');
  button.id = ROOT_ID;
  button.type = 'button';
  button.className = 'cade-clip-control';
  button.dataset.cadeClipControl = 'true';
  button.setAttribute('aria-live', 'polite');
  document.body.appendChild(button);

  const render = () => {
    const state = getRecordingState();
    button.dataset.state = state.phase;
    if (state.phase === 'recording') {
      button.disabled = false;
      button.textContent = 'Save clip';
      button.title = 'Stop recording and save this gameplay clip';
      return;
    }
    if (state.phase === 'ready') {
      button.disabled = false;
      button.textContent = 'Save clip';
      button.title = 'Save the finished gameplay clip';
      return;
    }
    if (state.phase === 'saving') {
      button.disabled = true;
      button.textContent = 'Saving clip…';
      return;
    }
    button.disabled = true;
    button.textContent = 'Clip starts with game';
    button.title = 'Recording begins when gameplay starts';
  };

  window.addEventListener('cade:clip-state', render);
  button.addEventListener('click', async () => {
    if (!getRecordingState().active && !getRecordingState().hasClip) return;
    button.dataset.state = 'saving';
    button.disabled = true;
    button.textContent = 'Saving clip…';
    try {
      const clip = await finalizeRecording();
      if (!clip) throw new Error('No clip data was captured.');
      await shareClip(clip, { slug: gameSlug, name: gameName });
      trackKpiEvent('social_clip_saved', { game: gameSlug });
      button.dataset.state = 'ready';
      button.textContent = 'Clip saved!';
      setTimeout(render, 2500);
    } catch {
      button.dataset.state = 'ready';
      button.disabled = false;
      button.textContent = 'Try saving again';
    }
  });

  render();
}
