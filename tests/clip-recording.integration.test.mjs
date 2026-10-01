import test from 'node:test';
import assert from 'node:assert/strict';

test('canvas recording waits for gameplay and finalizes a playable clip', async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalMediaRecorder = globalThis.MediaRecorder;
  const originalCustomEvent = globalThis.CustomEvent;

  const listeners = new Map();
  const track = { stopped: false, stop() { this.stopped = true; } };
  const canvas = {
    captureStream() {
      return { getTracks: () => [track] };
    },
  };
  const fakeWindow = new EventTarget();
  globalThis.window = fakeWindow;
  globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent extends Event {
    constructor(type, options = {}) {
      super(type);
      this.detail = options.detail;
    }
  };
  globalThis.document = {
    querySelector(selector) {
      return selector.includes('canvas') ? canvas : null;
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    querySelectorAll() {
      return [startTarget];
    },
  };

  let recorderStarts = 0;
  globalThis.MediaRecorder = class FakeMediaRecorder {
    static isTypeSupported() { return true; }
    constructor() {
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onstop = null;
    }
    start() {
      recorderStarts += 1;
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['gameplay'], { type: 'video/webm' }) });
      queueMicrotask(() => this.onstop?.());
    }
  };

  const target = ({ canvasTarget = false, buttonLabel = '' } = {}) => ({
    id: buttonLabel ? 'startBtn' : '',
    textContent: buttonLabel,
    value: '',
    getAttribute() { return ''; },
    closest(selector) {
      if (selector.includes('#cadeFeedbackRoot') || selector.includes('a[href]')) return null;
      if (selector === 'canvas') return canvasTarget ? this : null;
      if (selector.startsWith('button')) return buttonLabel ? this : null;
      if (selector.includes('main')) return this;
      return null;
    },
  });
  const startTarget = target({ buttonLabel: 'Start' });

  try {
    const recorder = await import(`../src/social/record.js?clip-test=${Date.now()}`);
    recorder.armRecordingOnGameStart();
    assert.equal(recorderStarts, 0, 'arming must not start the recorder');
    assert.equal(recorder.getRecordingState().phase, 'idle');

    listeners.get('pointerdown')({
      type: 'pointerdown',
      target: target({ buttonLabel: 'Fullscreen' }),
    });
    assert.equal(recorderStarts, 0, 'utility controls must not start a clip');

    listeners.get('keydown')({
      type: 'keydown',
      target: target(),
      key: 'ArrowLeft',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    });
    assert.equal(recorderStarts, 0, 'movement before an explicit Start action must not record menu time');

    listeners.get('pointerdown')({
      type: 'pointerdown',
      target: startTarget,
    });
    assert.equal(recorderStarts, 1);
    assert.equal(recorder.getRecordingState().phase, 'recording');

    const clip = await recorder.finalizeRecording();
    assert.ok(clip instanceof Blob);
    assert.ok(clip.size > 0);
    assert.equal(recorder.getRecordingState().phase, 'ready');
    assert.equal(track.stopped, true);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.MediaRecorder = originalMediaRecorder;
    globalThis.CustomEvent = originalCustomEvent;
  }
});

test('every catalog game reaches the shared clip controls through feedback', async () => {
  const [{ GAMES }, fs] = await Promise.all([
    import('../src/meta/games.js'),
    import('node:fs/promises'),
  ]);
  const feedbackSource = await fs.readFile(new URL('../src/feedback/embed.js', import.meta.url), 'utf8');
  assert.match(feedbackSource, /mountClipControls\(\{ gameSlug, gameName \}\)/);

  for (const game of GAMES) {
    const relativePath = game.slug === 'clubpenguin-world'
      ? '../clubpenguin-world/public/index.html'
      : `../${game.slug}/index.html`;
    let html;
    try {
      html = await fs.readFile(new URL(relativePath, import.meta.url), 'utf8');
    } catch {
      // Two legacy slugs use branded folders; their URL still mounts feedback.
      const branded = game.slug === 'micro-mario' ? '../mario/index.html' : '../microrc/index.html';
      html = await fs.readFile(new URL(branded, import.meta.url), 'utf8');
    }
    assert.match(html, /mountGameFeedback\(/, `${game.slug} must mount shared game controls`);
  }
});
