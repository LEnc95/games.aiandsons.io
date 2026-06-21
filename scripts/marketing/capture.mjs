// Automated gameplay video capture for marketing clips (asset-generation only).
//
// Drives a game in headless Chromium with a simple per-game "bot" and records
// the viewport via Playwright's recordVideo. Optionally post-processes each raw
// .webm into social-ready 9:16 and 1:1 .mp4s plus a poster frame when ffmpeg is
// available. Nothing is posted anywhere — outputs land in output/marketing/ for
// you to review and post manually.
//
// Usage:
//   npm run marketing:clips                       # default pilot set, self-hosted
//   node scripts/marketing/capture.mjs snake flappy --duration 14
//   node scripts/marketing/capture.mjs snake --base http://127.0.0.1:4173
//
// Flags:
//   --duration <seconds>   capture length per game (default 12)
//   --base <url>           use an already-running server instead of spawning one
//   --port <n>             port for the spawned static server (default 4178)
//
// Requires: `npx playwright install chromium`. ffmpeg is optional (raw .webm is
// always produced); install it to get the branded mp4 exports.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../../src/meta/games.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const OUT_ROOT = path.join(ROOT, 'output', 'marketing');

const SIZE = { width: 1080, height: 1080 }; // square base; padded to 9:16 in post
const BRAND_BG = '0x1a0b2e';
const PILOT = ['snake', 'flappy', 'dino', '2048', 'pacman', 'tetris'];

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const durationMs = Math.max(3, Number(flag('--duration', 12))) * 1000;
const port = Number(flag('--port', 4178));
const explicitBase = flag('--base', '');
const slugs = args.filter((arg) => !arg.startsWith('--') && args[args.indexOf(arg) - 1] !== '--duration'
  && args[args.indexOf(arg) - 1] !== '--base' && args[args.indexOf(arg) - 1] !== '--port');
const targets = (slugs.length ? slugs : PILOT)
  .map((slug) => GAMES.find((game) => game.slug === slug))
  .filter(Boolean);

const ffmpegAvailable = (() => {
  try {
    return spawnSync('ffmpeg', ['-version']).status === 0;
  } catch {
    return false;
  }
})();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- per-game bot drivers (simple, heuristic, "good enough to look alive") ---

async function keyLoop(page, keys, ms, interval) {
  const end = Date.now() + ms;
  let i = 0;
  while (Date.now() < end) {
    try {
      await page.keyboard.press(keys[i % keys.length]);
    } catch {
      break;
    }
    i += 1;
    await sleep(interval);
  }
}

const DRIVERS = {
  snake: (page, ms) => keyLoop(page, ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'], ms, 380),
  pacman: (page, ms) => keyLoop(page, ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'], ms, 460),
  flappy: (page, ms) => keyLoop(page, ['Space'], ms, 460),
  dino: (page, ms) => keyLoop(page, ['Space'], ms, 950),
  tetris: (page, ms) => keyLoop(page, ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'], ms, 260),
  2048: (page, ms) => keyLoop(page, ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'], ms, 320),
};

const genericDriver = (page, ms) =>
  keyLoop(page, ['ArrowRight', 'Space', 'ArrowLeft', 'ArrowUp', 'ArrowDown'], ms, 420);

// --- static server (spawned unless --base is given) ---

async function waitForServer(base, timeoutMs = 8000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch(base);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  return false;
}

async function startServer() {
  const proc = spawn('python', ['-m', 'http.server', String(port)], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  const ok = await waitForServer(base);
  if (!ok) {
    proc.kill();
    throw new Error(`Static server did not start on ${base}`);
  }
  return { proc, base };
}

// --- ffmpeg post-processing (optional) ---

function runFfmpeg(ffArgs) {
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...ffArgs]);
  return result.status === 0;
}

function postProcess(rawPath, outDir, slug) {
  const square = path.join(outDir, `${slug}-1x1.mp4`);
  const vertical = path.join(outDir, `${slug}-9x16.mp4`);
  const poster = path.join(outDir, `${slug}-poster.png`);

  runFfmpeg(['-i', rawPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', square]);
  runFfmpeg([
    '-i', rawPath,
    '-vf', `pad=1080:1920:0:420:color=${BRAND_BG}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', vertical,
  ]);
  runFfmpeg(['-ss', '2', '-i', rawPath, '-frames:v', '1', poster]);
  return { square, vertical, poster };
}

// --- main ---

async function captureGame(browser, game, base, dateDir) {
  const outDir = path.join(dateDir, game.slug);
  fs.mkdirSync(outDir, { recursive: true });

  const context = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: outDir, size: SIZE },
  });
  const page = await context.newPage();
  const gameUrl = `${base}${game.url.startsWith('/') ? game.url : `/${game.url}`}`;

  try {
    await page.goto(gameUrl, { waitUntil: 'load', timeout: 20000 });
    await sleep(800);
    // Nudge games that wait for a key/click to begin.
    try {
      await page.mouse.click(SIZE.width / 2, SIZE.height / 2);
      await page.keyboard.press('Space');
    } catch {
      /* ignore */
    }
    const driver = DRIVERS[game.slug] || genericDriver;
    await driver(page, durationMs);
  } finally {
    await context.close(); // flushes the video file
  }

  const rawPath = path.join(outDir, `${game.slug}.webm`);
  try {
    await page.video().saveAs(rawPath);
    await page.video().delete();
  } catch {
    /* video helper unavailable; Playwright already wrote a *.webm in outDir */
  }

  let exports = null;
  if (ffmpegAvailable && fs.existsSync(rawPath)) {
    exports = postProcess(rawPath, outDir, game.slug);
  }
  return { rawPath, exports, outDir };
}

async function main() {
  if (!targets.length) {
    console.error('No matching games. Pass slugs from src/meta/games.js or run with no args for the pilot set.');
    process.exit(1);
  }

  let server = null;
  let base = explicitBase;
  if (!base) {
    server = await startServer();
    base = server.base;
  }

  const dateDir = path.join(OUT_ROOT, new Date().toISOString().slice(0, 10));
  fs.mkdirSync(dateDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });

  console.log(`Capturing ${targets.length} game(s) @ ${durationMs / 1000}s from ${base}`);
  console.log(ffmpegAvailable ? 'ffmpeg found — mp4 exports enabled.' : 'ffmpeg not found — keeping raw .webm only.');

  for (const game of targets) {
    process.stdout.write(`  • ${game.slug} … `);
    try {
      const { rawPath, exports } = await captureGame(browser, game, base, dateDir);
      console.log(exports ? 'recorded + exported mp4s' : `recorded ${path.relative(ROOT, rawPath)}`);
    } catch (error) {
      console.log(`failed: ${error.message}`);
    }
  }

  await browser.close();
  if (server) server.proc.kill();
  console.log(`Done. Assets in ${path.relative(ROOT, dateDir)}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
