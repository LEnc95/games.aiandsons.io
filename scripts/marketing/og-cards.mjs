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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const ASSETS_DIR = path.join(ROOT, 'assets');
const OG_DIR = path.join(ASSETS_DIR, 'og');

const CARD_W = 1200;
const CARD_H = 630;

const args = process.argv.slice(2);
const defaultOnly = args.includes('--default-only');
const limitArg = args.indexOf('--limit');
const limit = limitArg !== -1 ? Number(args[limitArg + 1]) || 0 : 0;

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
  await page.screenshot({ path: outPath, type: 'png', clip: { x: 0, y: 0, width: CARD_W, height: CARD_H } });
}

async function main() {
  fs.mkdirSync(OG_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({
    viewport: { width: CARD_W, height: CARD_H },
    deviceScaleFactor: 1,
  });

  const bannerPath = path.join(ASSETS_DIR, 'social-banner.png');
  await renderCard(page, cardHtml({
    emoji: '\u{1F579}️',
    title: 'AI & Sons Arcade',
    tagline: '130+ free browser games — no downloads, no sign-up. Play instantly.',
    footer: 'games.aiandsons.io',
  }), bannerPath);
  console.log(`Rendered ${path.relative(ROOT, bannerPath)}`);

  if (!defaultOnly) {
    const games = limit > 0 ? GAMES.slice(0, limit) : GAMES;
    let count = 0;
    for (const game of games) {
      const outPath = path.join(OG_DIR, `${game.slug}.png`);
      await renderCard(page, cardHtml({
        emoji: game.emoji,
        title: game.name,
        tagline: game.desc || `Play ${game.name} free`,
        footer: 'Play free • games.aiandsons.io',
      }), outPath);
      count += 1;
    }
    console.log(`Rendered ${count} game cards into ${path.relative(ROOT, OG_DIR)}/`);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
