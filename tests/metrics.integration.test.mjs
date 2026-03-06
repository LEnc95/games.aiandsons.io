import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeMetricsState,
  sanitizeMetricMeta,
  summarizeKpiEvents,
  buildKpiDashboardSnapshot,
} from "../src/core/metrics.js";

test("sanitizeMetricMeta keeps only primitive fields and bounded arrays", () => {
  const meta = sanitizeMetricMeta({
    keepString: "x".repeat(100),
    keepNumber: 12.34567,
    keepBoolean: true,
    keepArray: [1, "two", false, { bad: true }, null],
    dropObject: { nested: "value" },
    dropNull: null,
  });

  assert.equal(meta.keepString.length, 80);
  assert.equal(meta.keepNumber, 12.346);
  assert.equal(meta.keepBoolean, true);
  assert.deepEqual(meta.keepArray, [1, "two", false]);
  assert.equal("dropObject" in meta, false);
  assert.equal("dropNull" in meta, false);
});

test("normalizeMetricsState removes invalid events and caps list size", () => {
  const events = [];
  for (let i = 0; i < 1105; i += 1) {
    events.push({
      name: `event_${i}`,
      ts: 1700000000000 + i,
      page: "/",
      meta: { index: i },
    });
  }
  events.push({ name: "", ts: 0 });

  const normalized = normalizeMetricsState({ events });
  assert.equal(normalized.events.length, 1000);
  assert.equal(normalized.events[0].name, "event_105");
  assert.equal(normalized.events[normalized.events.length - 1].name, "event_1104");
});

test("summarizeKpiEvents and buildKpiDashboardSnapshot compute retention and conversion rates", () => {
  const now = Date.UTC(2026, 2, 6, 12, 0, 0);
  const events = [
    { name: "launcher_view", ts: now - 1000, page: "/" },
    { name: "launcher_view", ts: now - 2000, page: "/" },
    { name: "game_launch_clicked", ts: now - 1500, page: "/" },
    { name: "pricing_view", ts: now - 500, page: "/pricing.html" },
    { name: "checkout_started", ts: now - 400, page: "/pricing.html" },
    { name: "checkout_completed", ts: now - 300, page: "/pricing.html" },
    { name: "shop_purchase_attempt", ts: now - 250, page: "/shop.html" },
    { name: "shop_purchase_success", ts: now - 200, page: "/shop.html" },
    { name: "shop_purchase_attempt", ts: now - 150, page: "/shop.html" },
  ];

  const summary = summarizeKpiEvents(events, { now, windowDays: 30 });
  const snapshot = buildKpiDashboardSnapshot(summary);

  assert.equal(summary.totalEvents, events.length);
  assert.equal(summary.counts.launcher_view, 2);
  assert.equal(summary.counts.game_launch_clicked, 1);
  assert.equal(summary.pages["/shop.html"], 3);

  assert.equal(snapshot.retention.launcherViews, 2);
  assert.equal(snapshot.retention.gameLaunches, 1);
  assert.equal(snapshot.retention.launchPerViewRate, 0.5);

  assert.equal(snapshot.conversion.checkoutStarted, 1);
  assert.equal(snapshot.conversion.checkoutCompleted, 1);
  assert.equal(snapshot.conversion.checkoutCompletionRate, 1);
  assert.equal(snapshot.conversion.purchaseAttempts, 2);
  assert.equal(snapshot.conversion.purchaseSuccesses, 1);
  assert.equal(snapshot.conversion.purchaseSuccessRate, 0.5);
});
