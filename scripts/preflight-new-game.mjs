// Preflight for the daily add-a-game flow (codex drops a game, a human
// commits it to main). Validates that everything a new game needs is
// wired before the commit ships to prod:
//
//   node scripts/preflight-new-game.mjs   (or: npm run game:preflight)
//
// Exits non-zero with remediation hints when something is missing.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { GAMES } from '../src/meta/games.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

// Top-level folders that contain an index.html but are not games.
const NON_GAME_DIRS = new Set([
  'rooms', 'teacher', 'changelog', 'ops', 'output', 'node_modules',
  'clubpenguin-world', 'public', 'docs', 'assets',
]);

const failures = [];
const ok = (msg) => console.log(`  OK  ${msg}`);
const fail = (msg, hint) => {
  failures.push({ msg, hint });
  console.error(`FAIL  ${msg}${hint ? `\n      -> ${hint}` : ''}`);
};

function gameFolder(game) {
  // '/2048' -> '2048', '/homerunderby/' -> 'homerunderby',
  // '/clubpenguin-world/public/' -> 'clubpenguin-world/public'
  return game.url.replace(/^\/+|\/+$/g, '');
}

console.log(`Preflight: ${GAMES.length} games in src/meta/games.js\n`);

// 1. Every registered game has its index.html on disk.
{
  const missing = GAMES.filter((g) => !fs.existsSync(path.join(ROOT, gameFolder(g), 'index.html')));
  if (missing.length) {
    fail(
      `registry entries without a game folder: ${missing.map((g) => g.slug).join(', ')}`,
      'the games.js entry points at a folder that does not exist',
    );
  } else ok('every registry entry has <folder>/index.html');
}

// 2. Every top-level game folder is registered (catches a dropped folder
//    that never made it into games.js).
{
  const registered = new Set(GAMES.map((g) => gameFolder(g).split('/')[0]));
  const orphans = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !NON_GAME_DIRS.has(e.name))
    .filter((e) => fs.existsSync(path.join(ROOT, e.name, 'index.html')))
    .filter((e) => !registered.has(e.name))
    .map((e) => e.name);
  if (orphans.length) {
    fail(
      `game folders not in the registry: ${orphans.join(', ')}`,
      'add them to src/meta/games.js, then run `npm run seo`',
    );
  } else ok('every game folder is registered in games.js');
}

// 3. Discovery slug allowlist is in sync (mirrors tests/discovery-metadata-sync).
{
  const { DISCOVERY_GAME_SLUGS } = require('../api/discovery/_metadata.js');
  const expected = JSON.stringify(GAMES.map((g) => g.slug));
  if (JSON.stringify([...DISCOVERY_GAME_SLUGS]) !== expected) {
    fail('api/discovery/_metadata.js is out of sync with games.js', 'run `npm run seo` (or `npm run discovery:meta`)');
  } else ok('discovery slug allowlist in sync');
}

// 4. Every game has an OG share card.
{
  const missing = GAMES.filter((g) => !fs.existsSync(path.join(ROOT, 'assets', 'og', `${g.slug}.png`)));
  if (missing.length) {
    fail(`games missing assets/og/<slug>.png: ${missing.map((g) => g.slug).join(', ')}`, 'run `npm run og`');
  } else ok('every game has an OG card');
}

// 5. Sitemap includes every game route.
{
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const missing = GAMES.filter((g) => {
    let route = `/${gameFolder(g)}`;
    if (route === '/clubpenguin-world/public') route = '/clubpenguin-world';
    return !sitemap.includes(`<loc>https://games.aiandsons.io${route}</loc>`);
  });
  if (missing.length) {
    fail(`sitemap.xml missing routes for: ${missing.map((g) => g.slug).join(', ')}`, 'run `npm run seo`');
  } else ok('sitemap covers every game');
}

// 6. vercel.json parses and the generic no-cache rule for game shells exists.
//    NOTE: Vercel matches header `source` against the request path the
//    client actually sends, BEFORE rewrites apply -- so the rule must
//    target "/:slug" and "/:slug/" (the clean URLs games/pages are linked
//    with), not "/:slug/index.html" (the rewrite destination, which real
//    traffic never requests directly and therefore never matches).
{
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const sources = new Set(cfg.headers.map((h) => h.source));
    const hasGeneric = sources.has('/:slug') && sources.has('/:slug/');
    if (!hasGeneric) {
      fail(
        'vercel.json lost the generic /:slug + /:slug/ no-cache header rules',
        'game shells would fall back to 1-hour caching for their real (clean) URLs',
      );
    } else ok('vercel.json valid; generic game no-cache header present');
  } catch (err) {
    fail(`vercel.json does not parse: ${err.message}`);
  }
}

console.log('');
if (failures.length) {
  console.error(`Preflight failed with ${failures.length} problem(s).`);
  process.exit(1);
}
console.log('Preflight passed - safe to commit.');
