import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GAMES } from '../src/meta/games.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const BASE_URL = 'https://games.aiandsons.io';

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

function formatDate(value) {
  return value.toISOString().slice(0, 10);
}

function safeLastModified(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return formatDate(stat.mtime);
  } catch {
    return formatDate(new Date());
  }
}

const staticPages = [
  { route: '/', file: 'index.html' },
  { route: '/changelog', file: 'changelog/index.html' },
  { route: '/shop.html', file: 'shop.html' },
  { route: '/pricing.html', file: 'pricing.html' },
  { route: '/accessibility.html', file: 'accessibility.html' },
  { route: '/school-license.html', file: 'school-license.html' },
  { route: '/teacher-onboarding.html', file: 'teacher-onboarding.html' },
  { route: '/parent-onboarding.html', file: 'parent-onboarding.html' },
];

const gamePages = GAMES.map((game) => {
  const sourceRoute = game.url.startsWith('/') ? game.url : `/${game.url}`;
  const normalizedSource = sourceRoute.length > 1 && sourceRoute.endsWith('/')
    ? sourceRoute.slice(0, -1)
    : sourceRoute;
  const relativeSource = normalizedSource.replace(/^\/+/, '');

  return {
    route: normalizeRoute(sourceRoute),
    file: path.join(relativeSource, 'index.html'),
  };
});

const pages = [...staticPages, ...gamePages];
const deduped = new Map();
for (const page of pages) {
  if (!deduped.has(page.route)) {
    deduped.set(page.route, page);
  }
}

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

for (const page of deduped.values()) {
  const filePath = path.join(ROOT, page.file);
  const lastmod = safeLastModified(filePath);
  const priority = page.route === '/' ? '1.0' : '0.8';

  xml += `  <url>\n`;
  xml += `    <loc>${BASE_URL}${page.route}</loc>\n`;
  xml += `    <lastmod>${lastmod}</lastmod>\n`;
  xml += `    <changefreq>weekly</changefreq>\n`;
  xml += `    <priority>${priority}</priority>\n`;
  xml += `  </url>\n`;
}

xml += `</urlset>\n`;

const outputPath = path.join(ROOT, 'sitemap.xml');
fs.writeFileSync(outputPath, xml);

console.log(`Generated sitemap with ${deduped.size} URLs at ${outputPath}`);
