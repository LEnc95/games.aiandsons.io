#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

import {
  MAX_METRIC_EVENTS,
  normalizeMetricsState,
  summarizeKpiEvents,
  buildKpiDashboardSnapshot,
} from "../../src/core/metrics.js";

function parseArgs(argv) {
  const options = {
    input: "data/metrics-state.json",
    output: "output/kpi/kpi-dashboard-snapshot.json",
    windowDays: 30,
    now: Date.now(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || "").trim();
    if (!token) continue;

    if (token === "--input" && i + 1 < argv.length) {
      options.input = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === "--output" && i + 1 < argv.length) {
      options.output = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === "--window-days" && i + 1 < argv.length) {
      const candidate = Number(argv[i + 1]);
      if (Number.isFinite(candidate) && candidate > 0) {
        options.windowDays = Math.max(1, Math.floor(candidate));
      }
      i += 1;
      continue;
    }

    if (token === "--now" && i + 1 < argv.length) {
      const raw = String(argv[i + 1] || "").trim();
      const asNumber = Number(raw);
      if (Number.isFinite(asNumber) && asNumber > 0) {
        options.now = Math.floor(asNumber);
      } else {
        const asDate = Date.parse(raw);
        if (Number.isFinite(asDate) && asDate > 0) {
          options.now = Math.floor(asDate);
        }
      }
      i += 1;
      continue;
    }

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
  }

  return options;
}

function printHelp() {
  const lines = [
    "Usage: node scripts/metrics/export-kpi-snapshot.mjs [options]",
    "",
    "Options:",
    "  --input <path>        Metrics state JSON input (default: data/metrics-state.json)",
    "  --output <path>       Snapshot output JSON path (default: output/kpi/kpi-dashboard-snapshot.json)",
    "  --window-days <n>     Rolling window days for summary (default: 30)",
    "  --now <ms|iso-date>   Fixed timestamp for deterministic exports (default: Date.now())",
  ];
  console.log(lines.join("\n"));
}

async function loadMetricsInput(absoluteInputPath) {
  try {
    const rawText = await fs.readFile(absoluteInputPath, "utf8");
    const parsed = JSON.parse(rawText);
    return { parsed, sourceMissing: false };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { parsed: {}, sourceMissing: true };
    }
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const now = Number.isFinite(Number(options.now)) ? Math.floor(Number(options.now)) : Date.now();
  const cwd = process.cwd();
  const inputPath = path.resolve(cwd, String(options.input || "data/metrics-state.json"));
  const outputPath = path.resolve(cwd, String(options.output || "output/kpi/kpi-dashboard-snapshot.json"));
  const outputDir = path.dirname(outputPath);

  const { parsed, sourceMissing } = await loadMetricsInput(inputPath);
  const rawEvents = Array.isArray(parsed?.events) ? parsed.events : [];
  const normalizedState = normalizeMetricsState(parsed);
  const summary = summarizeKpiEvents(normalizedState.events, {
    windowDays: options.windowDays,
    now,
  });
  const dashboard = buildKpiDashboardSnapshot(summary);

  const payload = {
    generatedAt: new Date(now).toISOString(),
    windowDays: summary.windowDays,
    source: {
      inputPath: path.relative(cwd, inputPath).replace(/\\/g, "/"),
      sourceMissing,
    },
    integrity: {
      rawEventCount: rawEvents.length,
      normalizedEventCount: normalizedState.events.length,
      droppedEventCount: Math.max(0, rawEvents.length - normalizedState.events.length),
      windowedEventCount: summary.totalEvents,
      maxEventCapacity: MAX_METRIC_EVENTS,
    },
    snapshot: dashboard,
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`KPI snapshot exported: ${outputPath}`);
  console.log(`Window days: ${summary.windowDays}`);
  console.log(`Events: raw=${rawEvents.length}, normalized=${normalizedState.events.length}, windowed=${summary.totalEvents}`);
}

main().catch((error) => {
  const message = error && error.message ? error.message : String(error);
  console.error(`KPI export failed: ${message}`);
  process.exitCode = 1;
});
