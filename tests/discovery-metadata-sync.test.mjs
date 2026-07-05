import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { GAMES } from '../src/meta/games.js';

const require = createRequire(import.meta.url);
const {
  DISCOVERY_GAME_SLUGS,
  CURATED_TRENDING_SLUGS,
  CURATED_TOP_PLAYED_SLUGS,
} = require('../api/discovery/_metadata.js');

test('DISCOVERY_GAME_SLUGS mirrors the GAMES registry (run `npm run seo` if this fails)', () => {
  const expected = GAMES.map((game) => game.slug);
  assert.deepEqual(
    [...DISCOVERY_GAME_SLUGS],
    expected,
    'api/discovery/_metadata.js is stale — regenerate with `npm run discovery:meta`',
  );
});

test('DISCOVERY_GAME_SLUGS has no duplicates', () => {
  assert.equal(new Set(DISCOVERY_GAME_SLUGS).size, DISCOVERY_GAME_SLUGS.length);
});

test('curated trending and top-played slugs reference real games', () => {
  const registry = new Set(DISCOVERY_GAME_SLUGS);
  for (const slug of [...CURATED_TRENDING_SLUGS, ...CURATED_TOP_PLAYED_SLUGS]) {
    assert.ok(registry.has(slug), `curated slug not in registry: ${slug}`);
  }
});
