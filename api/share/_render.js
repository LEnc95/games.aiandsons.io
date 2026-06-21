// Pure HTML builders for share landing pages (/challenge/:id, /race/:code,
// /g/:slug). These pages exist so that link-unfurling crawlers (X, Discord,
// iMessage, Slack, WhatsApp) — which do NOT run JavaScript and never see a
// game's query-param state — get a per-link Open Graph card. Humans are
// redirected straight to the game/room.
//
// Kept dependency-free and synchronous so it can be unit tested directly
// (see tests/share.integration.test.mjs). The handler in api/share.js resolves
// game metadata and store lookups, then calls these builders.

const BASE_URL = "https://games.aiandsons.io";
const SITE_NAME = "AI and Sons Games";

function escapeHtmlAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function ogImageForSlug(slug) {
  return `${BASE_URL}/assets/og/${encodeURIComponent(slug)}.png`;
}

// Minimal HTML shell: full OG/Twitter meta for crawlers + an instant redirect
// for humans (meta-refresh works under any CSP; the inline script is a fast
// path allowed by the site's 'unsafe-inline' script-src).
function renderShell({ title, description, canonicalUrl, ogImage, redirectUrl }) {
  const safeRedirect = escapeHtmlAttr(redirectUrl);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtmlText(title)}</title>
  <meta name="description" content="${escapeHtmlAttr(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtmlAttr(title)}">
  <meta property="og:description" content="${escapeHtmlAttr(description)}">
  <meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtmlAttr(ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtmlAttr(title)}">
  <meta name="twitter:description" content="${escapeHtmlAttr(description)}">
  <meta name="twitter:image" content="${escapeHtmlAttr(ogImage)}">
  <link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}">
  <meta http-equiv="refresh" content="0; url=${safeRedirect}">
  <script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
</head>
<body style="font-family:system-ui,sans-serif;background:#1a0b2e;color:#fff;text-align:center;padding:48px 20px">
  <p style="font-size:18px">Loading <a style="color:#fbbf24;font-weight:700" href="${safeRedirect}">${escapeHtmlText(title)}</a>…</p>
</body>
</html>`;
}

function buildChallengeLanding({ id, gameSlug, gameName, handle, score }) {
  const name = gameName || gameSlug;
  const scoreText = Number(score || 0).toLocaleString("en-US");
  const who = handle || "a player";
  const title = `⚔️ Beat ${who} — ${scoreText} in ${name}`;
  const description = `${who} scored ${scoreText} in ${name} on ${SITE_NAME}. Think you can beat it? Play free in your browser — no download, no sign-up.`;
  return renderShell({
    title,
    description,
    canonicalUrl: `${BASE_URL}/challenge/${encodeURIComponent(id)}`,
    ogImage: ogImageForSlug(gameSlug),
    redirectUrl: `/${gameSlug}?challenge=${encodeURIComponent(id)}`,
  });
}

function buildRoomLanding({ code, gameSlug, gameName }) {
  const name = gameName || gameSlug;
  const title = `\u{1F3C1} Race me in ${name}! Room ${code}`;
  const description = `Join a live ${name} race on ${SITE_NAME} with room code ${code}. Everyone races the same game and scores post to a shared scoreboard. Play free.`;
  return renderShell({
    title,
    description,
    canonicalUrl: `${BASE_URL}/race/${encodeURIComponent(code)}`,
    ogImage: ogImageForSlug(gameSlug),
    redirectUrl: `/rooms?code=${encodeURIComponent(code)}`,
  });
}

function buildGameLanding({ gameSlug, gameName, desc }) {
  const name = gameName || gameSlug;
  const title = `${name} — play free on ${SITE_NAME}`;
  const description = `${desc || `Play ${name} free`} — instant browser play on ${SITE_NAME}. No download, no sign-up.`;
  return renderShell({
    title,
    description,
    canonicalUrl: `${BASE_URL}/g/${encodeURIComponent(gameSlug)}`,
    ogImage: ogImageForSlug(gameSlug),
    redirectUrl: `/${gameSlug}`,
  });
}

// Generic fallback when a challenge/room id can't be resolved (expired, bad id,
// or store unavailable). Still gives crawlers a branded card and sends humans
// somewhere sensible rather than erroring.
function buildFallbackLanding({ redirectUrl = "/", title, description } = {}) {
  return renderShell({
    title: title || `${SITE_NAME} — free browser arcade`,
    description: description || `Play 130+ free browser games on ${SITE_NAME}. No download, no sign-up.`,
    canonicalUrl: BASE_URL,
    ogImage: `${BASE_URL}/assets/social-banner.png`,
    redirectUrl,
  });
}

module.exports = {
  BASE_URL,
  SITE_NAME,
  ogImageForSlug,
  buildChallengeLanding,
  buildRoomLanding,
  buildGameLanding,
  buildFallbackLanding,
};
