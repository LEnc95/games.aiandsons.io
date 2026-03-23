import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GAMES } from '../src/meta/games.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const BASE_URL = 'https://games.aiandsons.io';
const SITE_NAME = "Cade's Games";
const DEFAULT_IMAGE = `${BASE_URL}/assets/social-banner.png`;
const DEFAULT_DESC = "Play classic and custom HTML5 arcade games directly in your browser. Fun, ad-free, and cross-platform!";

const mainPages = [
  { file: 'index.html', url: '/', title: "Cade's Games - Browser Arcade", desc: DEFAULT_DESC },
  { file: 'shop.html', url: '/shop.html', title: "Shop - Cade's Games", desc: "Unlock premium items, player icons, and themes." },
  { file: 'pricing.html', url: '/pricing.html', title: "Pricing & Plans - Cade's Games", desc: "View subscription options for Cade's Games premium features." },
  { file: 'accessibility.html', url: '/accessibility.html', title: "Accessibility - Cade's Games", desc: "Learn about accessibility features in Cade's Games." },
  { file: 'school-license.html', url: '/school-license.html', title: "School License - Cade's Games", desc: "Classroom accounts and educational tools for Cade's Games." },
  { file: 'teacher-onboarding.html', url: '/teacher-onboarding.html', title: "Teacher Setup - Cade's Games", desc: "Set up Cade's Games for your classroom." },
  { file: 'parent-onboarding.html', url: '/parent-onboarding.html', title: "Parent Setup - Cade's Games", desc: "Set up Cade's Games for your family." }
];

GAMES.forEach(g => {
  let url = g.url.startsWith('/') ? g.url : `/${g.url}`;
  // Remove trailing slashes to avoid issues
  url = url.endsWith('/') ? url.slice(0, -1) : url;
  let dir = path.join(ROOT, url);
  let htmlPath = path.join(dir, 'index.html');
  mainPages.push({
    file: path.relative(ROOT, htmlPath),
    url: url,
    title: `${g.name} - Play on Cade's Games`,
    desc: g.desc || DEFAULT_DESC
  });
});

function injectSeoTags(filePath, url, title, desc) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');

  // Remove existing relevant meta tags to replace them safely
  content = content.replace(/<meta name="description"[\s\S]*?>/gi, '');
  content = content.replace(/<meta property="og:[\s\S]*?>/gi, '');
  content = content.replace(/<meta name="twitter:[\s\S]*?>/gi, '');
  content = content.replace(/<link rel="canonical"[\s\S]*?>/gi, '');

  const tags = `
  <meta name="description" content="${desc}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${BASE_URL}${url}">
  <meta property="og:image" content="${DEFAULT_IMAGE}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${DEFAULT_IMAGE}">
  <link rel="canonical" href="${BASE_URL}${url}">
`;

  // Insert just before </head>
  if (content.includes('</head>')) {
    content = content.replace('</head>', `${tags}</head>`);
  }
  
  // Replace <title>
  if (content.includes('<title>')) {
    content = content.replace(/<title>[\s\S]*?<\/title>/gi, `<title>${title}</title>`);
  } else {
    content = content.replace('<head>', `<head>\n  <title>${title}</title>`);
  }

  // Remove possible duplicate blank lines created during replace
  content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

  fs.writeFileSync(filePath, content);
  console.log(`Injected SEO into ${filePath}`);
}

for (const page of mainPages) {
  const fullPath = path.join(ROOT, page.file);
  injectSeoTags(fullPath, page.url, page.title, page.desc);
}
