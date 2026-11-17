import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSitemap } from './generate-sitemap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEVELOPMENT_DIRECTORIES = new Set([
  'api', 'build', 'dist', 'docs', 'linear', 'node_modules', 'output',
  'release', 'scripts', 'subagents', 'test-results', 'tests', 'v2-server',
]);
const ASSET_EXTENSIONS = new Set([
  '.html', '.js', '.mjs', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg',
  '.webp', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.wav',
  '.ogg', '.m4a', '.mp4', '.webm', '.txt', '.xml', '.wasm', '.glb', '.gltf', '.bin',
]);
const PUBLIC_MARKDOWN = new Set(['CHANGELOG.md', 'SPRINT_BOARD.md']);

// API sources stay in the repository root for Vercel's function builder. Only
// browser files go into dist; new game directories are discovered automatically.
export function isPublicFile(relativePath) {
  const parts = relativePath.split('/');
  if (parts.some(part => part.startsWith('.'))) return false;
  if (DEVELOPMENT_DIRECTORIES.has(parts[0])) return false;
  if (parts[0] === 'clubpenguin-world' && parts[1] !== 'public') return false;
  if (parts.some(part => part === 'node_modules' || part === '_casting-cache')) return false;
  if (parts.at(-1) === 'package.json' || parts.at(-1) === 'package-lock.json') return false;
  if (relativePath === 'vercel.json' || relativePath === 'firebase.json' || relativePath === 'test-ws.js') return false;
  return PUBLIC_MARKDOWN.has(relativePath) || ASSET_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

export function buildStaticOutput({ root = ROOT, logger = console } = {}) {
  const output = path.join(root, 'dist');
  // Never follow a replaced output directory into another part of the workspace.
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
    throw new Error('Refusing to replace a symlink at dist');
  }
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  let files = 0;
  let bytes = 0;
  function visit(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.name.startsWith('.')) continue;
      if (!prefix && DEVELOPMENT_DIRECTORIES.has(entry.name)) continue;
      if (relative.startsWith('clubpenguin-world/') && relative !== 'clubpenguin-world/public' && !relative.startsWith('clubpenguin-world/public/')) continue;
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '_casting-cache') visit(path.join(directory, entry.name), relative);
      } else if (entry.isFile() && isPublicFile(relative)) {
        const source = path.join(root, relative);
        const destination = path.join(output, relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
        files += 1;
        bytes += fs.statSync(source).size;
      }
    }
  }
  visit(root);
  logger.log(`Prepared ${files} static files (${(bytes / 1e6).toFixed(2)} MB) in dist`);
  return { files, bytes, output };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateSitemap();
  buildStaticOutput();
}
