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

export const staticPages = [
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
    releasedAt: game.contentContract?.releasedAt || null,
  };
});

const pages = [...staticPages, ...gamePages];

export function parseExistingLastModified(xml, baseUrl = BASE_URL) {
  const lastModifiedByRoute = new Map();
  for (const match of String(xml || '').matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const block = match[1];
    const location = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
    const lastModified = block.match(/<lastmod>\s*(\d{4}-\d{2}-\d{2})\s*<\/lastmod>/i)?.[1];
    if (!location || !lastModified || !location.startsWith(baseUrl)) continue;
    const route = location.slice(baseUrl.length) || '/';
    lastModifiedByRoute.set(normalizeRoute(route), lastModified);
  }
  return lastModifiedByRoute;
}

export function buildSitemap({
  root = ROOT,
  pageDefinitions = pages,
  existingXml = '',
  baseUrl = BASE_URL,
} = {}) {
  const lineEnding = existingXml.includes('\r\n') ? '\r\n' : '\n';
  const existingLastModified = parseExistingLastModified(existingXml, baseUrl);
  const deduped = new Map();
  for (const page of pageDefinitions) {
    const route = normalizeRoute(page.route);
    if (!deduped.has(route)) {
      deduped.set(route, { ...page, route });
    }
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const page of deduped.values()) {
    const filePath = path.join(root, page.file);
    const lastmod = existingLastModified.get(page.route)
      || page.releasedAt
      || safeLastModified(filePath);
    const priority = page.route === '/' ? '1.0' : '0.8';

    lines.push(
      '  <url>',
      `    <loc>${baseUrl}${page.route}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      '    <changefreq>weekly</changefreq>',
      `    <priority>${priority}</priority>`,
      '  </url>',
    );
  }

  lines.push('</urlset>');
  return {
    xml: `${lines.join(lineEnding)}${lineEnding}`,
    urlCount: deduped.size,
  };
}

const outputPath = path.join(ROOT, 'sitemap.xml');
export function generateSitemap({
  root = ROOT,
  pageDefinitions = pages,
  outputFile = path.join(root, 'sitemap.xml'),
  baseUrl = BASE_URL,
  logger = console,
} = {}) {
  const existingXml = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8') : '';
  const result = buildSitemap({ root, pageDefinitions, existingXml, baseUrl });
  if (result.xml === existingXml) {
    logger.log(`Sitemap already current with ${result.urlCount} URLs at ${outputFile}`);
    return { ...result, changed: false };
  }

  fs.writeFileSync(outputFile, result.xml);
  logger.log(`Generated sitemap with ${result.urlCount} URLs at ${outputFile}`);
  return { ...result, changed: true };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === path.resolve(__filename).toLowerCase();

if (isMain) {
  generateSitemap({ outputFile: outputPath });
}
