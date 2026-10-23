// Pre-render branded social/OG card PNGs with Playwright (already a devDep).
//
// Output:
//   assets/social-banner.png        – default card (home + content pages)
//   assets/og/<slug>.png            – one per game in the registry
//
// These are referenced by scripts/inject-seo.mjs (og:image / twitter:image)
// and by api/share.js share landing pages, so every shared link unfurls with
// a real image on X, Discord, iMessage, WhatsApp, Slack, etc.
//
// Usage:
//   npm run og                 # default banner + every game card
//   npm run og -- --slug stampstudio  # only this card; keep existing cards/banner
//   node scripts/marketing/og-cards.mjs --default-only
//   node scripts/marketing/og-cards.mjs --limit 5
//
// Re-run after adding a game (same cadence as `npm run seo`). Requires the
// Chromium browser: `npx playwright install chromium`. On Linux CI an emoji
// font (e.g. fonts-noto-color-emoji) must be present for emoji to render.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../../src/meta/games.js';
import { parseGameScope, selectGame } from '../lib/game-scope.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

const CARD_W = 1200;
const CARD_H = 630;

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const cardHtml = ({ emoji, title, tagline, footer }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${CARD_W}px; height: ${CARD_H}px; }
  body { font-family: system-ui, "Segoe UI", Roboto, sans-serif; }
  .card {
    width: ${CARD_W}px; height: ${CARD_H}px; position: relative; padding: 70px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; color: #fff;
    background: radial-gradient(circle at 30% 20%, #3a1a63 0%, #1a0b2e 60%, #140821 100%);
  }
  .card::after {
    content: ""; position: absolute; inset: 26px; border: 12px solid #fbbf24;
    border-radius: 30px; opacity: 0.92;
  }
  .emoji { font-size: 196px; line-height: 1; filter: drop-shadow(0 8px 24px rgba(0,0,0,0.45)); }
  .title { font-size: 82px; font-weight: 800; margin-top: 10px; letter-spacing: -1px; }
  .tagline {
    font-size: 33px; color: #b9c6ee; margin-top: 16px; max-width: 940px; line-height: 1.3;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .footer { position: absolute; bottom: 56px; font-size: 30px; font-weight: 700; color: #fbbf24; }
</style></head><body>
  <div class="card">
    <div class="emoji">${escapeHtml(emoji)}</div>
    <div class="title">${escapeHtml(title)}</div>
    <div class="tagline">${escapeHtml(tagline)}</div>
    <div class="footer">${escapeHtml(footer)}</div>
  </div>
</body></html>`;

async function renderCard(page, html, outPath) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: outPath, type: 'png', clip: { x: 0, y: 0, width: CARD_W, height: CARD_H } });
}

export function cardJobs({ games = GAMES, slug, defaultOnly = false, limit = 0, root = ROOT } = {}) {
  if (slug && (defaultOnly || limit)) throw new Error('--slug cannot be combined with --limit or --default-only');
  const selected = slug ? [selectGame(games, slug)] : limit > 0 ? games.slice(0, limit) : games;
  const jobs = slug ? [] : [{
    outPath: path.join(root, 'assets', 'social-banner.png'),
    html: cardHtml({ emoji: '\u{1F579}️', title: 'AI & Sons Arcade',
      tagline: '130+ free browser games — no downloads, no sign-up. Play instantly.', footer: 'games.aiandsons.io' }),
  }];
  if (!defaultOnly) for (const game of selected) {
    jobs.push({ outPath: path.join(root, 'assets', 'og', `${game.slug}.png`),
      html: cardHtml({ emoji: game.emoji, title: game.name,
        tagline: game.desc || `Play ${game.name} free`, footer: 'Play free • games.aiandsons.io' }) });
  }
  return jobs;
}

export async function generateOgCards(options = {}, render) {
  const jobs = cardJobs(options);
  for (const job of jobs) {
    fs.mkdirSync(path.dirname(job.outPath), { recursive: true });
    await render(job.html, job.outPath);
  }
  return jobs.length;
}

async function main() {
  const args = process.argv.slice(2);
  let options;
  if (args.length === 1 && args[0] === '--default-only') options = { defaultOnly: true };
  else if (args.length === 2 && args[0] === '--limit' && /^[1-9]\d*$/.test(args[1])) options = { limit: Number(args[1]) };
  else options = parseGameScope(args);
  cardJobs(options); // Validate scope before launching Chromium or touching output.
  const browser = await chromium.launch({ headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: CARD_W, height: CARD_H }, deviceScaleFactor: 1 });
    const count = await generateOgCards(options, (html, output) => renderCard(page, html, output));
    console.log(`Rendered ${count} card(s)${options.slug ? ` for ${options.slug}` : ''}`);
  } finally {
    await browser.close();
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (isMain) main().catch((error) => {
  console.error(error);
  process.exit(1);
});
