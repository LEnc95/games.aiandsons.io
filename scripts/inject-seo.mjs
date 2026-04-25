import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GAMES } from '../src/meta/games.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const BASE_URL = 'https://games.aiandsons.io';
const SITE_NAME = 'AI and Sons Games';
const LEGACY_SITE_NAME = "Cade's Games";
const ORG_NAME = 'AI and Sons';
const DEFAULT_IMAGE = `${BASE_URL}/assets/social-banner.png`;
const DEFAULT_DESC =
  "Play AI and Sons Games (formerly Cade's Games): a free browser arcade with family-friendly and classroom-ready HTML5 games.";

function normalizeRoute(route) {
  let normalized = route.startsWith('/') ? route : `/${route}`;
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  if (normalized === '/clubpenguin-world/public') {
    return '/clubpenguin-world';
  }
  return normalized;
}

function resolveGameHtmlPath(route) {
  const normalized = route.endsWith('/') && route.length > 1 ? route.slice(0, -1) : route;
  const relativeRoute = normalized.replace(/^\/+/, '');
  return path.join(ROOT, relativeRoute, 'index.html');
}

function escapeHtmlAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeHtmlText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

const staticPages = [
  {
    kind: 'home',
    file: 'index.html',
    url: '/',
    title: `${SITE_NAME} | Free Browser Arcade`,
    desc: `${SITE_NAME} is the free browser arcade from ${ORG_NAME}. Play kid-friendly and classroom-ready games like Pong, Snake, 2048, and more.`,
  },
  {
    kind: 'content',
    file: 'changelog/index.html',
    url: '/changelog',
    title: `Changelog | ${SITE_NAME}`,
    desc: `Track game additions, feature updates, and release notes for ${SITE_NAME}.`,
  },
  {
    kind: 'content',
    file: 'shop.html',
    url: '/shop.html',
    title: `Shop | ${SITE_NAME}`,
    desc: `Unlock premium cosmetics, player icons, and rewards in ${SITE_NAME}.`,
  },
  {
    kind: 'content',
    file: 'pricing.html',
    url: '/pricing.html',
    title: `Pricing | ${SITE_NAME}`,
    desc: `View family and classroom subscription options for ${SITE_NAME}.`,
  },
  {
    kind: 'content',
    file: 'accessibility.html',
    url: '/accessibility.html',
    title: `Accessibility | ${SITE_NAME}`,
    desc: `Learn about accessibility support and inclusive gameplay options in ${SITE_NAME}.`,
  },
  {
    kind: 'content',
    file: 'school-license.html',
    url: '/school-license.html',
    title: `School License | ${SITE_NAME}`,
    desc: `Explore classroom licensing, teacher controls, and school onboarding for ${SITE_NAME}.`,
  },
  {
    kind: 'content',
    file: 'teacher-onboarding.html',
    url: '/teacher-onboarding.html',
    title: `Teacher Onboarding | ${SITE_NAME}`,
    desc: `Set up ${SITE_NAME} in your classroom with teacher onboarding and classroom controls.`,
  },
  {
    kind: 'content',
    file: 'parent-onboarding.html',
    url: '/parent-onboarding.html',
    title: `Parent Onboarding | ${SITE_NAME}`,
    desc: `Set up ${SITE_NAME} for your family with guided parent onboarding.`,
  },
];

const gamePages = GAMES.map((game) => {
  const sourceRoute = game.url.startsWith('/') ? game.url : `/${game.url}`;
  const canonicalUrl = normalizeRoute(sourceRoute);
  return {
    kind: 'game',
    file: path.relative(ROOT, resolveGameHtmlPath(sourceRoute)),
    url: canonicalUrl,
    title: `${game.name} | ${SITE_NAME}`,
    desc: `${game.desc || DEFAULT_DESC} Play for free on ${SITE_NAME}.`,
    gameName: game.name,
  };
});

const allPages = [...staticPages, ...gamePages];

const homepageGameList = gamePages.map((page, index) => ({
  '@type': 'ListItem',
  position: index + 1,
  name: page.gameName,
  url: `${BASE_URL}${page.url}`,
}));

function buildStructuredData(page) {
  if (page.kind === 'home') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${BASE_URL}#organization`,
          name: ORG_NAME,
          alternateName: [SITE_NAME, LEGACY_SITE_NAME],
          url: BASE_URL,
        },
        {
          '@type': 'WebSite',
          '@id': `${BASE_URL}#website`,
          name: SITE_NAME,
          alternateName: LEGACY_SITE_NAME,
          url: BASE_URL,
          inLanguage: 'en-US',
          publisher: { '@id': `${BASE_URL}#organization` },
        },
        {
          '@type': 'ItemList',
          '@id': `${BASE_URL}#games`,
          name: `${SITE_NAME} Game Directory`,
          numberOfItems: homepageGameList.length,
          itemListElement: homepageGameList,
        },
      ],
    };
  }

  if (page.kind === 'game') {
    return {
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name: page.gameName,
      description: page.desc,
      url: `${BASE_URL}${page.url}`,
      gamePlatform: 'Web Browser',
      genre: 'Arcade',
      applicationCategory: 'Game',
      inLanguage: 'en-US',
      isAccessibleForFree: true,
      publisher: {
        '@id': `${BASE_URL}#organization`,
      },
      isPartOf: {
        '@id': `${BASE_URL}#games`,
      },
    };
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.title,
    description: page.desc,
    url: `${BASE_URL}${page.url}`,
    isPartOf: {
      '@id': `${BASE_URL}#website`,
    },
    inLanguage: 'en-US',
  };
}

function renderSeoBlock(page) {
  const description = escapeHtmlAttr(page.desc);
  const title = escapeHtmlAttr(page.title);
  const canonicalUrl = `${BASE_URL}${page.url}`;
  const structuredData = JSON.stringify(buildStructuredData(page));

  return `
  <!-- SEO:BEGIN -->
  <meta name="description" content="${description}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${DEFAULT_IMAGE}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="en_US">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${DEFAULT_IMAGE}">
  <link rel="canonical" href="${canonicalUrl}">
  <script type="application/ld+json" data-seo-managed="true">${structuredData}</script>
  <!-- SEO:END -->
`;
}

function injectSeoTags(filePath, page) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Remove previously generated SEO block and legacy tags that this script manages.
  content = content.replace(/<!-- SEO:BEGIN -->[\s\S]*?<!-- SEO:END -->\s*/gi, '');
  content = content.replace(/<meta name="description"[\s\S]*?>/gi, '');
  content = content.replace(/<meta name="robots"[\s\S]*?>/gi, '');
  content = content.replace(/<meta property="og:[\s\S]*?>/gi, '');
  content = content.replace(/<meta name="twitter:[\s\S]*?>/gi, '');
  content = content.replace(/<link rel="canonical"[\s\S]*?>/gi, '');
  content = content.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*data-seo-managed=["']true["'][^>]*>[\s\S]*?<\/script>/gi, '');

  const seoBlock = renderSeoBlock(page);
  if (content.includes('</head>')) {
    content = content.replace('</head>', `${seoBlock}</head>`);
  }

  const safeTitle = escapeHtmlText(page.title);
  if (/<title>[\s\S]*?<\/title>/i.test(content)) {
    content = content.replace(/<title>[\s\S]*?<\/title>/gi, `<title>${safeTitle}</title>`);
  } else {
    content = content.replace('<head>', `<head>\n  <title>${safeTitle}</title>`);
  }

  content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
  fs.writeFileSync(filePath, content);
  console.log(`Injected SEO into ${filePath}`);
}

for (const page of allPages) {
  const fullPath = path.join(ROOT, page.file);
  injectSeoTags(fullPath, page);
}
