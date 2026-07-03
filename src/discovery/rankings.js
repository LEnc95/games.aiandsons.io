import { get, set } from '../core/storage.js';

export const DISCOVERY_RANKINGS_CACHE_KEY = 'discoveryRankings';
export const DEFAULT_DISCOVERY_RANKINGS_TTL_MS = 3 * 60 * 1000;

const normalizeSlug = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().slice(0, 90);
};

const normalizeSource = (value) => {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  return normalized.slice(0, 64) || 'unknown';
};

const normalizeRankItem = (item, index) => {
  const raw = typeof item === 'string' ? { slug: item } : (item && typeof item === 'object' ? item : {});
  const slug = normalizeSlug(raw.slug);
  if (!slug) return null;
  return {
    slug,
    score: Math.max(0, Math.floor(Number(raw.score) || 0)),
    rank: Math.max(1, Math.floor(Number(raw.rank) || index + 1)),
  };
};

const normalizeRankList = (items) => {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  return items
    .map((item, index) => normalizeRankItem(item, index))
    .filter((item) => {
      if (!item || seen.has(item.slug)) return false;
      seen.add(item.slug);
      return true;
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));
};

export const normalizeDiscoveryRankings = (payload) => {
  const raw = payload && typeof payload === 'object' ? payload : {};
  return {
    ok: raw.ok !== false,
    source: normalizeSource(raw.source || 'curated'),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    ttlSeconds: Math.max(30, Math.min(900, Math.floor(Number(raw.ttlSeconds) || 180))),
    trending: normalizeRankList(raw.trending),
    topPlayed: normalizeRankList(raw.topPlayed),
  };
};

export const getCachedDiscoveryRankings = (now = Date.now()) => {
  const cached = get(DISCOVERY_RANKINGS_CACHE_KEY, null);
  if (!cached || typeof cached !== 'object') return null;
  const expiresAt = Number(cached.expiresAt || 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  return normalizeDiscoveryRankings(cached.payload);
};

export const shouldSkipDiscoveryRankingsFetch = (locationRef = globalThis.location) => {
  if (!locationRef || typeof locationRef !== 'object') return false;
  const hostname = String(locationRef.hostname || '').toLowerCase();
  const port = String(locationRef.port || '');
  return port === '4173' && (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1');
};

export const loadDiscoveryRankings = async ({
  fetchImpl = globalThis.fetch,
  locationRef = globalThis.location,
  now = Date.now(),
  limit = 0,
} = {}) => {
  const cached = getCachedDiscoveryRankings(now);
  if (cached) return cached;
  if (shouldSkipDiscoveryRankingsFetch(locationRef)) return null;

  if (typeof fetchImpl !== 'function') return null;
  try {
    const normalizedLimit = Math.max(0, Math.min(50, Math.floor(Number(limit) || 0)));
    const endpoint = normalizedLimit > 0
      ? `/api/discovery/rankings?limit=${encodeURIComponent(String(normalizedLimit))}`
      : '/api/discovery/rankings';
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response?.ok) return null;
    const payload = normalizeDiscoveryRankings(await response.json());
    set(DISCOVERY_RANKINGS_CACHE_KEY, {
      expiresAt: now + Math.min(payload.ttlSeconds * 1000, DEFAULT_DISCOVERY_RANKINGS_TTL_MS),
      payload,
    });
    return payload;
  } catch {
    return null;
  }
};

export const sendDiscoveryLaunchEvent = ({ slug, source }, options = {}) => {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return false;

  const payload = JSON.stringify({
    event: 'game_launch_clicked',
    slug: normalizedSlug,
    source: normalizeSource(source),
  });

  const endpoint = options.endpoint || '/api/discovery/events';
  const navigatorRef = options.navigatorRef || globalThis.navigator;
  if (navigatorRef && typeof navigatorRef.sendBeacon === 'function') {
    try {
      const blob = new Blob([payload], { type: 'application/json' });
      if (navigatorRef.sendBeacon(endpoint, blob)) return true;
    } catch {
      // Fall back to fetch below.
    }
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return false;
  try {
    fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
};
