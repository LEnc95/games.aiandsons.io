import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildStaticOutput } from '../scripts/build-vercel.mjs';

test('deployment output preserves browser routes and assets without shipping development files', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-output-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const publicFiles = [
    'index.html', 'sitemap.xml', 'robots.txt', 'version.json', 'CHANGELOG.md', 'SPRINT_BOARD.md',
    'future-daily-game/index.html', 'future-daily-game/game.js', 'future-daily-game/styles.css',
    'src/meta/games.js', 'assets/og/future-daily-game.png', 'assets/discovery/slugs.json',
    'baseballradio/sounds/crowd.wav', 'public/mp3/Overclocked_Playthrough.mp4',
    'clubpenguin-world/public/index.html', 'clubpenguin-world/public/vendor/phaser.min.js',
    'ops/feedback/index.html', 'teacher/index.html',
  ];
  const developmentFiles = [
    '.env.local', '.github/workflows/main-qa.yml', '.vercel/project.json',
    'api/auth.js', 'api/package.json', 'scripts/generate-sitemap.mjs', 'tests/fixture.json',
    'test-results/report.json', 'output/clip.mp4', 'docs/internal.html', 'linear/seed.json',
    'release/policy-signoff.json', 'subagents/task.json', 'node_modules/sdk/index.js',
    'v2-server/main.go', 'clubpenguin-world/clubpenguin-world.exe',
    'clubpenguin-world/main.go', 'baseballradio/assets/bundle.js.map',
    'baseballradio/sounds/booth/_casting-cache/audio.wav', 'progress.md',
    'package.json', 'package-lock.json', 'vercel.json', 'firebase.json', 'test-ws.js',
  ];
  for (const file of [...publicFiles, ...developmentFiles]) {
    const filename = path.join(root, file);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, file);
  }
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/stale.html'), 'stale output');
  const result = buildStaticOutput({ root, logger: { log() {} } });
  assert.equal(result.files, publicFiles.length);
  for (const file of publicFiles) assert.equal(fs.readFileSync(path.join(root, 'dist', file), 'utf8'), file);
  for (const file of developmentFiles) {
    assert.equal(fs.existsSync(path.join(root, 'dist', file)), false, file);
    assert.equal(fs.existsSync(path.join(root, file)), true, `source preserved: ${file}`);
  }
  assert.equal(fs.existsSync(path.join(root, 'dist/stale.html')), false);
  const second = buildStaticOutput({ root, logger: { log() {} } });
  assert.equal(second.files, result.files);
  assert.equal(second.bytes, result.bytes);
});
