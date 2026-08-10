#!/usr/bin/env node
/**
 * Build Documents/BaseballRadio and sync dist into arcade /baseballradio/.
 *
 * Usage:
 *   node scripts/sync-baseballradio.mjs
 *   npm run baseballradio:sync
 *
 * Env:
 *   BASEBALLRADIO_SRC — override source path (default: ../BaseballRadio next to repo, or Documents/BaseballRadio)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'baseballradio');

const SAMPLE_IDS = [
  'bat-solid-1', 'bat-solid-2', 'bat-weak-1', 'bat-foul-1',
  'glove-1', 'glove-2', 'glove-3', 'glove-4',
  'crowd-bed', 'crowd-cheer', 'crowd-clap', 'crowd-roar',
  'vendor-beer', 'vendor-dogs', 'vendor-programs',
  'umpire-strike', 'umpire-ball', 'umpire-out',
];

function resolveSource() {
  if (process.env.BASEBALLRADIO_SRC) return path.resolve(process.env.BASEBALLRADIO_SRC);
  const sibling = path.resolve(ROOT, '..', 'BaseballRadio');
  if (fs.existsSync(path.join(sibling, 'package.json'))) return sibling;
  const docs = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Documents', 'BaseballRadio');
  if (fs.existsSync(path.join(docs, 'package.json'))) return docs;
  throw new Error('Could not find BaseballRadio source. Set BASEBALLRADIO_SRC.');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function extractAssetRefs(html) {
  const js = html.match(/src="\.\/assets\/([^"]+\.js)"/)?.[1];
  const css = html.match(/href="\.\/assets\/([^"]+\.css)"/)?.[1];
  if (!js || !css) throw new Error('Could not find hashed assets in dist/index.html');
  return { js, css };
}

function mergeArcadeIndex(distHtml, arcadeHtml, assets) {
  // Prefer dist body (game UI); keep arcade SEO block + favicon + site-integration + back link.
  const seo = arcadeHtml.match(/<!-- SEO:BEGIN -->[\s\S]*?<!-- SEO:END -->/)?.[0] || '';
  const favicons = [...arcadeHtml.matchAll(/<link rel="icon"[^>]*>/g)].map((m) => m[0]).join('\n    ');
  const bodyInner = distHtml.match(/<body>([\s\S]*)<\/body>/)?.[1];
  if (!bodyInner) throw new Error('dist index missing body');

  let body = bodyInner
    .replace(/<script type="module" src="\/src\/main\.ts"><\/script>/, '')
    .replace(/<script type="module" crossorigin src="\.\/assets\/[^"]+"><\/script>/, '')
    .trimEnd();

  if (!body.includes('back-home')) {
    body = body.replace(
      /<header class="masthead">\s*<div class="masthead-brand">/,
      `<header class="masthead">
        <a class="back-home" href="/" aria-label="Back to all games">← Back</a>
        <div class="masthead-brand">`,
    );
  }

  if (!body.includes('site-integration.js')) {
    body += `\n\n    <script type="module" src="./site-integration.js"></script>
    <script type="module">
      import { mountGameFeedback } from '../src/feedback/embed.js';
      mountGameFeedback({ gameSlug: "baseballradio", gameName: "Bottom of the Ninth" });
    </script>\n`;
  }

  const backHomeStyle = `
    <style>
      .back-home {
        flex: 0 0 auto;
        padding: 7px 10px;
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 999px;
        background: rgba(6,12,24,.82);
        color: #eef5ff;
        font: 700 14px/1 system-ui, sans-serif;
        text-decoration: none;
        backdrop-filter: blur(10px);
      }
      @media (max-width: 640px) {
        .masthead { justify-content: flex-start; }
        /* Keep tagline available to screen readers; hide visually only. */
        .masthead .tagline {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      }
    </style>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bottom of the Ninth | AI and Sons Games</title>
    ${favicons}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Source+Sans+3:wght@400;600;700&display=swap"
      rel="stylesheet"
    />
    <script type="module" crossorigin src="./assets/${assets.js}"></script>
    <link rel="stylesheet" crossorigin href="./assets/${assets.css}">
    ${backHomeStyle}

  ${seo}
</head>
  <body>
${body}
  </body>
</html>
`;
}

function hashFile(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 12);
}

function main() {
  const src = resolveSource();
  console.log(`Source: ${src}`);
  console.log(`Dest:   ${DEST}`);

  const build = spawnSync('npm', ['run', 'build'], { cwd: src, stdio: 'inherit', shell: true });
  if (build.status !== 0) process.exit(build.status ?? 1);

  const dist = path.join(src, 'dist');
  const distHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const assets = extractAssetRefs(distHtml);

  const assetsDest = path.join(DEST, 'assets');
  fs.rmSync(assetsDest, { recursive: true, force: true });
  copyDir(path.join(dist, 'assets'), assetsDest);

  const soundsDest = path.join(DEST, 'sounds');
  fs.rmSync(soundsDest, { recursive: true, force: true });
  copyDir(path.join(dist, 'sounds'), soundsDest);

  const missing = SAMPLE_IDS.filter((id) => !fs.existsSync(path.join(soundsDest, `${id}.wav`)));
  if (missing.length) {
    console.error(`Missing sample wav(s): ${missing.join(', ')}`);
    process.exit(1);
  }

  const arcadeHtmlPath = path.join(DEST, 'index.html');
  const previous = fs.existsSync(arcadeHtmlPath) ? fs.readFileSync(arcadeHtmlPath, 'utf8') : '';
  const merged = mergeArcadeIndex(distHtml, previous, assets);
  fs.writeFileSync(arcadeHtmlPath, merged);

  const manifest = {
    syncedAt: new Date().toISOString(),
    source: src,
    assets,
    samples: Object.fromEntries(
      SAMPLE_IDS.map((id) => {
        const file = path.join(soundsDest, `${id}.wav`);
        return [id, hashFile(file)];
      }),
    ),
  };
  fs.writeFileSync(path.join(DEST, 'sync-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Synced assets ${assets.js} / ${assets.css}`);
  console.log(`Verified ${SAMPLE_IDS.length} sample files.`);
}

main();
