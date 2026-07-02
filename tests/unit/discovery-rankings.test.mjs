import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DISCOVERY_RANKINGS_TTL_MS,
  DISCOVERY_RANKINGS_CACHE_KEY,
  getCachedDiscoveryRankings,
  loadDiscoveryRankings,
  normalizeDiscoveryRankings,
  sendDiscoveryLaunchEvent,
  shouldSkipDiscoveryRankingsFetch,
} from '../../src/discovery/rankings.js';

const storage = new Map();
const storageKey = `cadegames:v1:${DISCOVERY_RANKINGS_CACHE_KEY}`;

globalThis.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

beforeEach(() => {
  storage.clear();
});

test('normalizes discovery rankings and removes duplicate slugs', () => {
  const rankings = normalizeDiscoveryRankings({
    ok: true,
    source: 'Firebase Preview',
    ttlSeconds: 1200,
    trending: ['Tetris', { slug: 'tetris', score: 5 }, { slug: 'CavernCrush', score: 9 }],
    topPlayed: [{ slug: 'snake', score: 3, rank: 99 }],
  });

  assert.equal(rankings.source, 'firebase_preview');
  assert.equal(rankings.ttlSeconds, 900);
  assert.deepEqual(rankings.trending.map((item) => item.slug), ['tetris', 'caverncrush']);
  assert.deepEqual(rankings.trending.map((item) => item.rank), [1, 2]);
  assert.deepEqual(rankings.topPlayed, [{ slug: 'snake', score: 3, rank: 1 }]);
});

test('uses valid cached rankings before fetching', async () => {
  localStorage.setItem(storageKey, JSON.stringify({
    expiresAt: 2_000,
    payload: {
      ok: true,
      source: 'memory',
      ttlSeconds: 180,
      trending: [{ slug: 'pacman', score: 7 }],
      topPlayed: [],
    },
  }));

  let fetched = false;
  const rankings = await loadDiscoveryRankings({
    now: 1_000,
    fetchImpl: async () => {
      fetched = true;
      throw new Error('should not fetch');
    },
  });

  assert.equal(fetched, false);
  assert.equal(rankings.source, 'memory');
  assert.deepEqual(rankings.trending.map((item) => item.slug), ['pacman']);
});

test('fetches and briefly caches backend rankings', async () => {
  const rankings = await loadDiscoveryRankings({
    now: 1_000,
    fetchImpl: async (url, options) => {
      assert.equal(url, '/api/discovery/rankings');
      assert.equal(options.method, 'GET');
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            source: 'firebase',
            ttlSeconds: 700,
            trending: [{ slug: 'caverncrush', score: 12 }],
            topPlayed: [{ slug: 'audioagar', score: 8 }],
          };
        },
      };
    },
  });

  assert.equal(rankings.source, 'firebase');
  assert.deepEqual(rankings.trending.map((item) => item.slug), ['caverncrush']);

  const cached = JSON.parse(localStorage.getItem(storageKey));
  assert.equal(cached.expiresAt, 1_000 + DEFAULT_DISCOVERY_RANKINGS_TTL_MS);
  assert.equal(getCachedDiscoveryRankings(2_000).topPlayed[0].slug, 'audioagar');
});

test('returns null when rankings fetch is unavailable', async () => {
  const rankings = await loadDiscoveryRankings({
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });

  assert.equal(rankings, null);
});

test('skips backend ranking fetches on the raw static smoke server', async () => {
  let fetched = false;
  const staticLocation = { hostname: '127.0.0.1', port: '4173' };
  const rankings = await loadDiscoveryRankings({
    locationRef: staticLocation,
    fetchImpl: async () => {
      fetched = true;
      return { ok: true, async json() { return {}; } };
    },
  });

  assert.equal(shouldSkipDiscoveryRankingsFetch(staticLocation), true);
  assert.equal(rankings, null);
  assert.equal(fetched, false);
});

test('keeps backend ranking fetches enabled away from the raw static server', () => {
  assert.equal(shouldSkipDiscoveryRankingsFetch({ hostname: 'games.aiandsons.io', port: '' }), false);
  assert.equal(shouldSkipDiscoveryRankingsFetch({ hostname: 'localhost', port: '3000' }), false);
});

test('sends launch events without blocking navigation', () => {
  const calls = [];
  const sent = sendDiscoveryLaunchEvent({
    slug: 'Tetris',
    source: 'Game Of Day',
  }, {
    navigatorRef: {},
    fetchImpl: (url, options) => {
      calls.push({ url, options });
      return Promise.resolve({ ok: true });
    },
  });

  assert.equal(sent, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/discovery/events');
  assert.equal(calls[0].options.keepalive, true);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    event: 'game_launch_clicked',
    slug: 'tetris',
    source: 'game_of_day',
  });
});
