import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { getFirestore, isFirebaseAdminConfigured } = require('../../api/_firebase-admin.js');

const DAY_MS = 86400000;
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const dryRun = String(args.get('--dry-run') ?? 'true').toLowerCase() !== 'false';
const now = Number(args.get('--now')) || Date.now();
const dailyCutoff = new Date(now - 90 * DAY_MS).toISOString().slice(0, 10);
const monthlyCutoff = new Date(Date.UTC(new Date(now).getUTCFullYear() - 2, new Date(now).getUTCMonth(), 1)).toISOString().slice(0, 7);

export function mergeMonthlyBucket(current, daily) {
  const next = current && typeof current === 'object' ? structuredClone(current) : {
    monthKey: String(daily.dayKey).slice(0, 7), gameSlug: daily.gameSlug,
    outcomes: 0, completed: 0, lost: 0, abandoned: 0, durationMsSum: 0, metrics: {},
  };
  for (const key of ['outcomes', 'completed', 'lost', 'abandoned', 'durationMsSum']) next[key] += Number(daily[key]) || 0;
  for (const [key, metric] of Object.entries(daily.metrics || {})) {
    const existing = next.metrics[key] || { count: 0, sum: 0, min: metric.min, max: metric.max };
    next.metrics[key] = {
      count: existing.count + (Number(metric.count) || 0),
      sum: existing.sum + (Number(metric.sum) || 0),
      min: Math.min(existing.min, metric.min),
      max: Math.max(existing.max, metric.max),
    };
  }
  next.updatedAt = now;
  return next;
}

export async function runRetention() {
  if (!isFirebaseAdminConfigured()) {
    return { ok: true, skipped: true, reason: 'firebase_not_configured', dryRun, dailyCutoff, monthlyCutoff };
  }
  const db = getFirestore();
  const dailySnapshot = await db.collection('telemetryDaily').where('dayKey', '<', dailyCutoff).limit(500).get();
  const monthlySnapshot = await db.collection('telemetryMonthly').where('monthKey', '<', monthlyCutoff).limit(500).get();
  if (!dryRun) {
    for (const doc of dailySnapshot.docs) {
      const daily = doc.data();
      const id = `${String(daily.dayKey).slice(0, 7)}_${daily.gameSlug}`;
      const monthlyRef = db.collection('telemetryMonthly').doc(id);
      await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(monthlyRef);
        transaction.set(monthlyRef, mergeMonthlyBucket(existing.exists ? existing.data() : null, daily));
        transaction.delete(doc.ref);
      });
    }
    const batch = db.batch();
    monthlySnapshot.docs.forEach((doc) => batch.delete(doc.ref));
    if (monthlySnapshot.size) await batch.commit();
  }
  return { ok: true, dryRun, dailyCutoff, monthlyCutoff, dailyRolledUp: dailySnapshot.size, monthlyDeleted: monthlySnapshot.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await runRetention()));
}
