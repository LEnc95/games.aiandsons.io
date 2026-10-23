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
    addEventListener(type, handler, capture) {
      listeners.set(`${type}:${capture ? 'capture' : 'bubble'}`, handler);
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

    listeners.get('pointerdown:capture')({
      type: 'pointerdown',
      target: target({ buttonLabel: 'Fullscreen' }),
    });
    assert.equal(recorderStarts, 0, 'utility controls must not start a clip');

    listeners.get('keydown:capture')({
      type: 'keydown',
      target: target(),
      key: 'ArrowLeft',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    });
    assert.equal(recorderStarts, 0, 'movement before an explicit Start action must not record menu time');

    const canvasTap = { type: 'pointerdown', target: target({ canvasTarget: true }) };
    fakeWindow.render_game_to_text = () => JSON.stringify({ mode: 'menu' });
    listeners.get('pointerdown:capture')(canvasTap);
    listeners.get('pointerdown:bubble')(canvasTap);
    assert.equal(recorderStarts, 0, 'menu canvas input alone must not record');
    // Target game handler runs between capture and bubble, with Start still visible.
    listeners.get('pointerdown:capture')(canvasTap);
    fakeWindow.render_game_to_text = () => JSON.stringify({ mode: 'playing' });
    listeners.get('pointerdown:bubble')(canvasTap);
    assert.equal(recorderStarts, 1);
    assert.equal(recorder.getRecordingState().phase, 'recording');

    const clip = await recorder.finalizeRecording();
    assert.ok(clip instanceof Blob);
    assert.ok(clip.size > 0);
    assert.equal(recorder.getRecordingState().phase, 'ready');
    assert.equal(track.stopped, true);
    listeners.get('pointerdown:bubble')(canvasTap);
    assert.equal(recorderStarts, 1, 'gameplay must preserve a finished clip');
    listeners.get('pointerdown:capture')({ type: 'pointerdown', target: startTarget });
    assert.equal(recorderStarts, 2, 'explicit Start begins a new clip');
    await recorder.finalizeRecording();
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.MediaRecorder = originalMediaRecorder;
    globalThis.CustomEvent = originalCustomEvent;
  }
});

test('MP4-only recording preserves its format and downloads when file sharing is unsupported', async () => {
  const originals = Object.fromEntries(['document', 'window', 'MediaRecorder', 'navigator', 'setTimeout']
    .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const track = { stopped: false, stop() { this.stopped = true; } };
  let sharedFile;
  let downloadName;
  let clicked = false;
  let recorderInstance;
  const link = { click() { clicked = true; downloadName = this.download; }, remove() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    canShare: () => true,
    share: async ({ files }) => { sharedFile = files[0]; },
  } });
  globalThis.document = {
    querySelector: () => ({ captureStream: () => ({ getTracks: () => [track] }) }),
    createElement: () => link,
    body: { appendChild() {} },
  };
  globalThis.window = new EventTarget();
  globalThis.MediaRecorder = class {
    static isTypeSupported(type) { return type === 'video/mp4'; }
    constructor(stream, options) {
      assert.equal(options.mimeType, 'video/mp4');
      this.mimeType = options.mimeType;
      this.state = 'inactive';
      recorderInstance = this;
    }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable({ data: new Blob(['mp4-video']) });
      queueMicrotask(() => this.onstop());
    }
  };
  try {
    const recorder = await import(`../src/social/record.js?mp4-test=${Date.now()}`);
    assert.equal(recorder.startRecording(), true);
    const clip = await recorder.finalizeRecording();
    assert.equal(clip.type, 'video/mp4');
    assert.equal(recorder.getFinishedClip(), clip);
    await recorder.shareClip(clip, { slug: 'teapotpour', name: 'Teapot Pour' });
    assert.equal(sharedFile.name, 'teapotpour-run.mp4');
    assert.equal(sharedFile.type, 'video/mp4');
    assert.equal(clicked, false);
    navigator.canShare = () => false;
    navigator.share = async () => assert.fail('must not silently share text without the clip');
    // Avoid keeping the test alive for delayed object URL cleanup.
    globalThis.setTimeout = (fn) => { fn(); return 1; };
    await recorder.shareClip(clip, { slug: 'teapotpour' });
    assert.equal(clicked, true);
    assert.equal(downloadName, 'teapotpour-run.mp4');
    globalThis.setTimeout = originals.setTimeout.value;
    assert.equal(recorder.startRecording(), true);
    const pending = recorder.finalizeRecording();
    recorderInstance.onerror();
    await pending;
    assert.equal(track.stopped, true);
    assert.equal(recorder.getRecordingState().active, false);
    globalThis.MediaRecorder = class { constructor() { throw new Error('encoder unavailable'); } };
    track.stopped = false;
    assert.equal(recorder.startRecording(), false);
    assert.equal(track.stopped, true, 'failed encoder initialization releases capture tracks');
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
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
