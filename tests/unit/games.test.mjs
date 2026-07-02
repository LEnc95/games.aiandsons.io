import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_DISCOVERY_CATEGORIES, GAMES } from '../../src/meta/games.js';

const VALID_DURATIONS = new Set(['quick', 'medium', 'long']);
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const VALID_MODES = new Set(['solo', 'two-player', 'multiplayer']);
const VALID_CATEGORIES = new Set(GAME_DISCOVERY_CATEGORIES.map((category) => category.key));
const VALID_ART_EXTENSIONS = /\.(png|webp|jpe?g)$/i;

test('GAMES list integrity', async (t) => {
  await t.test('is an array and not empty', () => {
    assert.ok(Array.isArray(GAMES), 'GAMES should be an array');
    assert.ok(GAMES.length > 0, 'GAMES array should not be empty');
  });

  await t.test('each game has valid required properties', () => {
    for (const game of GAMES) {
      assert.strictEqual(typeof game.slug, 'string', `Game ${game.name || 'unknown'} missing or invalid slug`);
      assert.strictEqual(typeof game.name, 'string', `Game ${game.slug || 'unknown'} missing or invalid name`);
      assert.strictEqual(typeof game.emoji, 'string', `Game ${game.slug} missing or invalid emoji`);
      assert.strictEqual(typeof game.scoreHint, 'string', `Game ${game.slug} missing or invalid scoreHint`);
      assert.strictEqual(typeof game.url, 'string', `Game ${game.slug} missing or invalid url`);
      assert.strictEqual(typeof game.desc, 'string', `Game ${game.slug} missing or invalid desc`);
      assert.strictEqual(typeof game.earnsCoins, 'boolean', `Game ${game.slug} missing or invalid earnsCoins`);
    }
  });

  await t.test('each game has valid discovery metadata', () => {
    for (const game of GAMES) {
      assert.ok(Array.isArray(game.categories), `Game ${game.slug} missing categories array`);
      assert.ok(game.categories.length > 0, `Game ${game.slug} must have at least one category`);
      for (const category of game.categories) {
        assert.ok(VALID_CATEGORIES.has(category), `Game ${game.slug} has invalid category ${category}`);
      }

      assert.ok(Array.isArray(game.modes), `Game ${game.slug} missing modes array`);
      assert.ok(game.modes.includes('solo'), `Game ${game.slug} must include solo mode`);
      for (const mode of game.modes) {
        assert.ok(VALID_MODES.has(mode), `Game ${game.slug} has invalid mode ${mode}`);
      }

      assert.ok(VALID_DURATIONS.has(game.duration), `Game ${game.slug} has invalid duration`);
      assert.ok(VALID_DIFFICULTIES.has(game.difficulty), `Game ${game.slug} has invalid difficulty`);
      assert.ok(!Number.isNaN(Date.parse(game.releasedAt)), `Game ${game.slug} has invalid releasedAt`);
      assert.strictEqual(typeof game.featured, 'object', `Game ${game.slug} missing featured metadata`);
      assert.strictEqual(game.featured.dailyEligible, true, `Game ${game.slug} must be eligible for daily spotlight`);
      assert.strictEqual(typeof game.featured.weeklyEligible, 'boolean', `Game ${game.slug} missing weekly eligibility`);

      if (game.art !== undefined) {
        assert.strictEqual(typeof game.art, 'object', `Game ${game.slug} art must be an object when present`);
        assert.ok(game.art.poster || game.art.thumb, `Game ${game.slug} art must include poster or thumb`);
        for (const [key, value] of Object.entries(game.art)) {
          assert.ok(key === 'poster' || key === 'thumb', `Game ${game.slug} has unsupported art key ${key}`);
          assert.strictEqual(typeof value, 'string', `Game ${game.slug} art.${key} must be a string`);
          assert.ok(value.startsWith('/assets/'), `Game ${game.slug} art.${key} must be under /assets/`);
          assert.ok(!/\s/.test(value), `Game ${game.slug} art.${key} must not contain whitespace`);
          assert.ok(VALID_ART_EXTENSIONS.test(value), `Game ${game.slug} art.${key} must be a browser image path`);
        }
      }
    }
  });

  await t.test('slugs are unique', () => {
    const slugs = GAMES.map(g => g.slug);
    const uniqueSlugs = new Set(slugs);
    assert.strictEqual(slugs.length, uniqueSlugs.size, 'All game slugs must be unique');
  });

  await t.test('urls are unique', () => {
    const urls = GAMES.map(g => g.url);
    const uniqueUrls = new Set(urls);
    assert.strictEqual(urls.length, uniqueUrls.size, 'All game urls must be unique');
  });
});
