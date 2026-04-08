import { del, get, set } from "./storage.js";

export const METRICS_STORAGE_KEY = "metrics";
export const MAX_METRIC_EVENTS = 1000;
export const MAX_META_FIELDS = 12;
export const MAX_META_ARRAY_ITEMS = 6;

export const DEFAULT_METRICS_STATE = Object.freeze({
  events: [],
});

const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeEventName = (value) => {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  return normalized.slice(0, 64);
};

const normalizeEventPage = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 120);
};

const normalizeEventTimestamp = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
};

const normalizeMetaPrimitive = (value) => {
  if (typeof value === "string") {
    return value.slice(0, 80);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 1000) / 1000;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
};

export const sanitizeMetricMeta = (meta) => {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return {};
  }

  const next = {};
  let count = 0;
  for (const [key, raw] of Object.entries(meta)) {
    if (count >= MAX_META_FIELDS) break;
    const normalizedKey = String(key || "").trim().slice(0, 64);
    if (!normalizedKey) continue;

    if (Array.isArray(raw)) {
      const arr = raw
        .map((item) => normalizeMetaPrimitive(item))
        .filter((item) => item !== undefined)
        .slice(0, MAX_META_ARRAY_ITEMS);
      if (arr.length > 0) {
        next[normalizedKey] = arr;
        count += 1;
      }
      continue;
    }

    const primitive = normalizeMetaPrimitive(raw);
    if (primitive !== undefined) {
      next[normalizedKey] = primitive;
      count += 1;
    }
  }

  return next;
};

export const normalizeMetricEvent = (source) => {
  const raw = source && typeof source === "object" ? source : {};
  const name = normalizeEventName(raw.name);
  if (!name) return null;

  return {
    name,
    ts: normalizeEventTimestamp(raw.ts),
    page: normalizeEventPage(raw.page),
    meta: sanitizeMetricMeta(raw.meta),
  };
};

export const normalizeMetricsState = (source) => {
  const raw = source && typeof source === "object" ? source : {};
  const events = Array.isArray(raw.events)
    ? raw.events
        .map((event) => normalizeMetricEvent(event))
        .filter(Boolean)
        .slice(-MAX_METRIC_EVENTS)
    : [];
  return { events };
};

let memoryState = null;
let saveQueued = false;

const flushMetricsSave = () => {
  saveQueued = false;
  if (memoryState) {
    set(METRICS_STORAGE_KEY, memoryState);
  }
};

export const getMetricsState = () => {
  if (!memoryState) {
    memoryState = normalizeMetricsState(get(METRICS_STORAGE_KEY, DEFAULT_METRICS_STATE));
  }
  return memoryState;
};

export const setMetricsState = (nextState) => {
  const normalized = normalizeMetricsState(nextState);
  memoryState = normalized;
  if (!saveQueued) {
    saveQueued = true;
    Promise.resolve().then(flushMetricsSave);
  }
  return normalized;
};

export const clearMetricsState = () => {
  memoryState = null;
  del(METRICS_STORAGE_KEY);
};

export const trackKpiEvent = (name, meta = {}, timestamp = Date.now()) => {
  const event = normalizeMetricEvent({
    name,
    ts: timestamp,
    page: typeof location !== "undefined" ? location.pathname : "",
    meta,
  });

  if (!event) return getMetricsState();

  const current = getMetricsState();

  // ⚡ Bolt Optimization: Use in-memory cache and slice to avoid O(N) re-normalization of the entire events array
  memoryState = {
    events: [...current.events, event].slice(-MAX_METRIC_EVENTS),
  };

  // ⚡ Bolt Optimization: Batch localStorage saves to prevent main thread blocking during high frequency events
  if (!saveQueued) {
    saveQueued = true;
    Promise.resolve().then(flushMetricsSave);
  }

  return memoryState;
};

export const summarizeKpiEvents = (events, options = {}) => {
  const source = Array.isArray(events) ? events : [];
  const windowDays = Math.max(1, Math.floor(Number(options.windowDays) || 30));
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const cutoff = now - windowDays * DAY_MS;

  const counts = {};
  const pages = {};
  const activeDays = new Set();
  let totalEvents = 0;

  for (const event of source) {
    const normalized = normalizeMetricEvent(event);
    if (!normalized) continue;
    if (normalized.ts < cutoff) continue;
    totalEvents += 1;
    counts[normalized.name] = (counts[normalized.name] || 0) + 1;
    if (normalized.page) {
      pages[normalized.page] = (pages[normalized.page] || 0) + 1;
    }
    const dayKey = normalized.ts > 0
      ? new Date(normalized.ts).toISOString().slice(0, 10)
      : "unknown";
    activeDays.add(dayKey);
  }

  return {
    windowDays,
    totalEvents,
    activeDays: activeDays.size,
    counts,
    pages,
  };
};

const safeRate = (numerator, denominator) => {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 1000;
};

export const buildKpiDashboardSnapshot = (summary) => {
  const source = summary && typeof summary === "object" ? summary : {};
  const counts = source.counts && typeof source.counts === "object" ? source.counts : {};
  const launcherViews = Number(counts.launcher_view || 0);
  const gameLaunches = Number(counts.game_launch_clicked || 0);
  const pricingViews = Number(counts.pricing_view || 0);
  const checkoutStarted = Number(counts.checkout_started || 0);
  const checkoutCompleted = Number(counts.checkout_completed || 0);
  const purchaseAttempts = Number(counts.shop_purchase_attempt || 0);
  const purchaseSuccesses = Number(counts.shop_purchase_success || 0);

  return {
    windowDays: Number(source.windowDays) || 30,
    totalEvents: Number(source.totalEvents) || 0,
    activeDays: Number(source.activeDays) || 0,
    counts,
    pages: source.pages && typeof source.pages === "object" ? source.pages : {},
    retention: {
      launcherViews,
      gameLaunches,
      launchPerViewRate: safeRate(gameLaunches, launcherViews),
      activeDays: Number(source.activeDays) || 0,
    },
    conversion: {
      pricingViews,
      checkoutStarted,
      checkoutCompleted,
      checkoutCompletionRate: safeRate(checkoutCompleted, checkoutStarted),
      purchaseAttempts,
      purchaseSuccesses,
      purchaseSuccessRate: safeRate(purchaseSuccesses, purchaseAttempts),
    },
  };
};

export const getKpiDashboardSnapshot = (options = {}) => {
  const state = getMetricsState();
  const summary = summarizeKpiEvents(state.events, options);
  return buildKpiDashboardSnapshot(summary);
};
