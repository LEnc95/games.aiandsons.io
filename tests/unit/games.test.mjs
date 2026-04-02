import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../src/meta/games.js';

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
