import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GAMES } from '../src/meta/games.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://games.aiandsons.io';

const mainPages = [
  '/',
  '/shop.html',
  '/pricing.html',
  '/accessibility.html',
  '/school-license.html',
  '/teacher-onboarding.html',
  '/parent-onboarding.html'
];

const urls = [...mainPages];
GAMES.forEach(game => {
  let url = game.url.startsWith('/') ? game.url : `/${game.url}`;
  urls.push(url);
});

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

for (const url of urls) {
  xml += `  <url>\n`;
  xml += `    <loc>${BASE_URL}${url}</loc>\n`;
  xml += `    <changefreq>weekly</changefreq>\n`;
  xml += `    <priority>${url === '/' ? '1.0' : '0.8'}</priority>\n`;
  xml += `  </url>\n`;
}

xml += `</urlset>\n`;

const outputPath = path.join(__dirname, '..', 'sitemap.xml');
fs.writeFileSync(outputPath, xml);

console.log(`Generated sitemap with ${urls.length} URLs at ${outputPath}`);
