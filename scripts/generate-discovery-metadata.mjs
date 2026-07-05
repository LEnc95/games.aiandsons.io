import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { GAMES } from '../src/meta/games.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'api', 'discovery', '_metadata.js');

const require = createRequire(import.meta.url);
// Read the current file to preserve the editorial (hand-curated) lists.
const existing = require(OUTPUT);

const discoverySlugs = GAMES.map((game) => game.slug);
const seen = new Set();
for (const slug of discoverySlugs) {
  if (seen.has(slug)) {
    throw new Error(`Duplicate slug in src/meta/games.js: ${slug}`);
  }
  seen.add(slug);
}

const curatedTrending = existing.CURATED_TRENDING_SLUGS || [];
const curatedTopPlayed = existing.CURATED_TOP_PLAYED_SLUGS || [];

// Fail loudly if an editorial pick no longer maps to a real game.
for (const slug of [...curatedTrending, ...curatedTopPlayed]) {
  if (!seen.has(slug)) {
    throw new Error(`Curated slug "${slug}" is not in the GAMES registry`);
  }
}

function formatArray(slugs, perLine = 6) {
  const lines = [];
  for (let i = 0; i < slugs.length; i += perLine) {
    const chunk = slugs.slice(i, i + perLine).map((slug) => JSON.stringify(slug));
    lines.push(`  ${chunk.join(', ')},`);
  }
  return lines.join('\n');
}

const file = `// AUTO-GENERATED — DISCOVERY_GAME_SLUGS mirrors src/meta/games.js.
// Do not edit the slug list by hand; run \`npm run seo\` (or
// \`npm run discovery:meta\`) after changing the GAMES registry.
// The CURATED_* lists below are editorial — edit them here and they are
// preserved across regeneration. Kept as CommonJS so Vercel functions can
// require it without pulling the ESM registry into the serverless bundle.

const DISCOVERY_GAME_SLUGS = Object.freeze([
${formatArray(discoverySlugs)}
]);

const CURATED_TRENDING_SLUGS = Object.freeze([
${formatArray(curatedTrending)}
]);

const CURATED_TOP_PLAYED_SLUGS = Object.freeze([
${formatArray(curatedTopPlayed)}
]);

module.exports = {
  CURATED_TOP_PLAYED_SLUGS,
  CURATED_TRENDING_SLUGS,
  DISCOVERY_GAME_SLUGS,
};
`;

fs.writeFileSync(OUTPUT, file);
console.log(
  `Generated discovery metadata: ${discoverySlugs.length} game slugs, ` +
  `${curatedTrending.length} trending, ${curatedTopPlayed.length} top-played -> ${path.relative(ROOT, OUTPUT)}`,
);
