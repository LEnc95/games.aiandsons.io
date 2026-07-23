const { getFirestore, isFirebaseAdminConfigured } = require("../_firebase-admin");

const COLLECTION = "telemetryDaily";
const memoryBuckets = globalThis.__cadeTelemetryBuckets || new Map();
globalThis.__cadeTelemetryBuckets = memoryBuckets;

function dayKey(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function bucketId(slug, timestamp = Date.now()) {
  return `${dayKey(timestamp)}_${slug}`;
}

function applyOutcome(bucket, outcome, timestamp) {
  const next = bucket && typeof bucket === "object" ? { ...bucket } : {
    dayKey: dayKey(timestamp),
    gameSlug: outcome.slug,
    outcomes: 0,
    completed: 0,
    lost: 0,
    abandoned: 0,
    durationMsSum: 0,
    metrics: {},
  };
  next.outcomes += 1;
  next[outcome.result] += 1;
  next.durationMsSum += outcome.durationMs;
  next.updatedAt = timestamp;
  next.metrics = { ...next.metrics };
  for (const [key, value] of Object.entries(outcome.metrics)) {
    const metric = next.metrics[key] || { count: 0, sum: 0, min: value, max: value };
    next.metrics[key] = {
      count: metric.count + 1,
      sum: metric.sum + value,
      min: Math.min(metric.min, value),
      max: Math.max(metric.max, value),
    };
  }
  return next;
}

async function recordAggregateOutcome(outcome, timestamp = Date.now()) {
  const id = bucketId(outcome.slug, timestamp);
  if (!isFirebaseAdminConfigured()) {
    const next = applyOutcome(memoryBuckets.get(id), outcome, timestamp);
    memoryBuckets.set(id, next);
    return next;
  }

  const firestore = getFirestore();
  const ref = firestore.collection(COLLECTION).doc(id);
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const next = applyOutcome(snapshot.exists ? snapshot.data() : null, outcome, timestamp);
    transaction.set(ref, next);
    return next;
  });
}

function __resetTelemetryStoreForTests() {
  memoryBuckets.clear();
}

module.exports = { __resetTelemetryStoreForTests, applyOutcome, recordAggregateOutcome };

