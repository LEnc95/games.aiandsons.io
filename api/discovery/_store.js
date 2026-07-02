const {
  getFirestore,
  isFirebaseAdminConfigured,
} = require("../_firebase-admin");
const {
  CURATED_TOP_PLAYED_SLUGS,
  CURATED_TRENDING_SLUGS,
  DISCOVERY_GAME_SLUGS,
} = require("./_metadata");

const TOTAL_COLLECTION = "discoveryGameAggregates";
const DAILY_COLLECTION = "discoveryDailyLaunches";
const DEFAULT_TTL_SECONDS = 180;
const DEFAULT_LIMIT = 24;
const TRENDING_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

let memoryTotals = new Map();
let memoryDaily = new Map();
const validGameSlugs = new Set(DISCOVERY_GAME_SLUGS);

function normalizeSlug(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().slice(0, 90);
}

function normalizeSource(value) {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  return normalized.slice(0, 64) || "unknown";
}

function dayKeyForTime(now = Date.now()) {
  const numeric = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  return new Date(numeric).toISOString().slice(0, 10);
}

function recentDayKeys(now = Date.now(), days = TRENDING_WINDOW_DAYS) {
  const numeric = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  return Array.from({ length: Math.max(1, days) }, (_, index) => (
    dayKeyForTime(numeric - index * DAY_MS)
  ));
}

function rankedItem(slug, score, rank) {
  return {
    slug,
    score: Math.max(0, Math.floor(Number(score) || 0)),
    rank,
  };
}

function rankEntries(entries, limit = DEFAULT_LIMIT) {
  return [...entries]
    .filter(([, score]) => Number(score) > 0)
    .sort((a, b) => (
      Number(b[1] || 0) - Number(a[1] || 0) ||
      String(a[0]).localeCompare(String(b[0]))
    ))
    .slice(0, limit)
    .map(([slug, score], index) => rankedItem(slug, score, index + 1));
}

function mergeRankings(primary, fallback, limit = DEFAULT_LIMIT) {
  const seen = new Set();
  const merged = [];
  for (const item of [...primary, ...fallback]) {
    const slug = normalizeSlug(item?.slug);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    merged.push({
      slug,
      score: Math.max(0, Math.floor(Number(item?.score) || 0)),
      rank: merged.length + 1,
    });
    if (merged.length >= limit) break;
  }
  return merged;
}

function getCuratedRankings(limit = DEFAULT_LIMIT) {
  const toRankedList = (slugs) => slugs
    .slice(0, limit)
    .map((slug, index) => rankedItem(slug, limit - index, index + 1));

  return {
    trending: toRankedList(CURATED_TRENDING_SLUGS),
    topPlayed: toRankedList(CURATED_TOP_PLAYED_SLUGS),
  };
}

function recordMemoryLaunch(slug, now = Date.now()) {
  const day = dayKeyForTime(now);
  memoryTotals.set(slug, (memoryTotals.get(slug) || 0) + 1);
  const dayCounts = memoryDaily.get(day) || new Map();
  dayCounts.set(slug, (dayCounts.get(slug) || 0) + 1);
  memoryDaily.set(day, dayCounts);
}

function getMemoryRankings(now = Date.now(), limit = DEFAULT_LIMIT) {
  const trendingCounts = new Map();
  for (const day of recentDayKeys(now)) {
    const dayCounts = memoryDaily.get(day);
    if (!dayCounts) continue;
    for (const [slug, count] of dayCounts.entries()) {
      trendingCounts.set(slug, (trendingCounts.get(slug) || 0) + count);
    }
  }

  return {
    trending: rankEntries(trendingCounts.entries(), limit),
    topPlayed: rankEntries(memoryTotals.entries(), limit),
  };
}

async function recordFirebaseLaunch(slug, now = Date.now()) {
  const { FieldValue } = require("firebase-admin").firestore;
  const firestore = getFirestore();
  const day = dayKeyForTime(now);
  const updatedAt = FieldValue.serverTimestamp();

  await Promise.all([
    firestore.collection(TOTAL_COLLECTION).doc(slug).set({
      slug,
      launches: FieldValue.increment(1),
      updatedAt,
    }, { merge: true }),
    firestore.collection(DAILY_COLLECTION).doc(`${day}_${slug}`).set({
      day,
      slug,
      launches: FieldValue.increment(1),
      updatedAt,
    }, { merge: true }),
  ]);
}

async function getFirebaseTopPlayed(limit = DEFAULT_LIMIT) {
  const snapshot = await getFirestore()
    .collection(TOTAL_COLLECTION)
    .orderBy("launches", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc, index) => {
    const data = doc.data() || {};
    return rankedItem(normalizeSlug(data.slug || doc.id), data.launches, index + 1);
  });
}

async function getFirebaseTrending(now = Date.now(), limit = DEFAULT_LIMIT) {
  const counts = new Map();
  const firestore = getFirestore();
  const snapshots = await Promise.all(recentDayKeys(now).map((day) => (
    firestore.collection(DAILY_COLLECTION).where("day", "==", day).get()
  )));

  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      const data = doc.data() || {};
      const slug = normalizeSlug(data.slug || "");
      if (!slug) continue;
      counts.set(slug, (counts.get(slug) || 0) + Number(data.launches || 0));
    }
  }

  return rankEntries(counts.entries(), limit);
}

async function validateLaunchPayload(payload) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const event = typeof raw.event === "string" ? raw.event.trim().toLowerCase() : "";
  if (event !== "game_launch_clicked") {
    return { ok: false, status: 400, code: "invalid_event", error: "Unsupported discovery event." };
  }

  const slug = normalizeSlug(raw.slug);
  if (!slug || !validGameSlugs.has(slug)) {
    return { ok: false, status: 400, code: "invalid_game", error: "Unknown game slug." };
  }

  return {
    ok: true,
    event,
    slug,
    source: normalizeSource(raw.source),
  };
}

async function recordDiscoveryLaunch(payload, options = {}) {
  const normalized = await validateLaunchPayload(payload);
  if (!normalized.ok) return normalized;

  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  if (isFirebaseAdminConfigured()) {
    try {
      await recordFirebaseLaunch(normalized.slug, now);
      return { ok: true, source: "firebase", slug: normalized.slug };
    } catch {
      // Fall through to memory so previews/tests never lose ranking behavior.
    }
  }

  recordMemoryLaunch(normalized.slug, now);
  return { ok: true, source: "memory", slug: normalized.slug };
}

async function getDiscoveryRankings(options = {}) {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(options.limit) || DEFAULT_LIMIT)));
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const curated = await getCuratedRankings(limit);

  if (isFirebaseAdminConfigured()) {
    try {
      const [trending, topPlayed] = await Promise.all([
        getFirebaseTrending(now, limit),
        getFirebaseTopPlayed(limit),
      ]);
      if (trending.length || topPlayed.length) {
        return {
          ok: true,
          source: "firebase",
          updatedAt: new Date(now).toISOString(),
          ttlSeconds: DEFAULT_TTL_SECONDS,
          trending: mergeRankings(trending, curated.trending, limit),
          topPlayed: mergeRankings(topPlayed, curated.topPlayed, limit),
        };
      }
    } catch {
      // If Firebase is misconfigured at runtime, return local/curated rankings.
    }
  }

  const memory = getMemoryRankings(now, limit);
  const hasMemory = memory.trending.length || memory.topPlayed.length;
  return {
    ok: true,
    source: hasMemory ? "memory" : "curated",
    updatedAt: new Date(now).toISOString(),
    ttlSeconds: DEFAULT_TTL_SECONDS,
    trending: mergeRankings(memory.trending, curated.trending, limit),
    topPlayed: mergeRankings(memory.topPlayed, curated.topPlayed, limit),
  };
}

function __resetDiscoveryStoreForTests() {
  memoryTotals = new Map();
  memoryDaily = new Map();
}

module.exports = {
  __resetDiscoveryStoreForTests,
  getCuratedRankings,
  getDiscoveryRankings,
  recordDiscoveryLaunch,
  validateLaunchPayload,
};
