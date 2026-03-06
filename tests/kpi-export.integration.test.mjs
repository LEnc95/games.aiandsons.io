import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";

const execFile = promisify(execFileCallback);

const ROOT = process.cwd();
const SCRIPT_PATH = path.join(ROOT, "scripts", "metrics", "export-kpi-snapshot.mjs");

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

test("kpi export script writes deterministic snapshot with integrity fields", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kpi-export-"));
  const inputPath = path.join(tmpRoot, "metrics-state.json");
  const outputPath = path.join(tmpRoot, "kpi-snapshot.json");
  const fixedNow = Date.UTC(2026, 2, 6, 15, 0, 0);

  const input = {
    events: [
      { name: "launcher_view", ts: fixedNow - 2000, page: "/", meta: {} },
      { name: "game_launch_clicked", ts: fixedNow - 1500, page: "/", meta: {} },
      { name: "pricing_view", ts: fixedNow - 1200, page: "/pricing.html", meta: {} },
      { name: "checkout_started", ts: fixedNow - 1000, page: "/pricing.html", meta: {} },
      { name: "checkout_completed", ts: fixedNow - 800, page: "/pricing.html", meta: {} },
      { ts: fixedNow - 500, page: "/broken" },
    ],
  };

  await fs.writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`, "utf8");
  await execFile("node", [
    SCRIPT_PATH,
    "--input",
    inputPath,
    "--output",
    outputPath,
    "--window-days",
    "30",
    "--now",
    String(fixedNow),
  ], { cwd: ROOT });

  const output = await readJson(outputPath);
  assert.equal(output.generatedAt, new Date(fixedNow).toISOString());
  assert.equal(output.windowDays, 30);
  assert.equal(output.integrity.rawEventCount, 6);
  assert.equal(output.integrity.normalizedEventCount, 5);
  assert.equal(output.integrity.droppedEventCount, 1);
  assert.equal(output.integrity.windowedEventCount, 5);
  assert.equal(output.snapshot.retention.launcherViews, 1);
  assert.equal(output.snapshot.retention.gameLaunches, 1);
  assert.equal(output.snapshot.conversion.checkoutStarted, 1);
  assert.equal(output.snapshot.conversion.checkoutCompleted, 1);
  assert.equal(output.snapshot.conversion.checkoutCompletionRate, 1);
});

test("kpi export script handles missing input by emitting zeroed snapshot", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kpi-export-missing-"));
  const missingInputPath = path.join(tmpRoot, "does-not-exist.json");
  const outputPath = path.join(tmpRoot, "kpi-snapshot.json");
  const fixedNow = Date.UTC(2026, 2, 6, 16, 0, 0);

  await execFile("node", [
    SCRIPT_PATH,
    "--input",
    missingInputPath,
    "--output",
    outputPath,
    "--window-days",
    "14",
    "--now",
    String(fixedNow),
  ], { cwd: ROOT });

  const output = await readJson(outputPath);
  assert.equal(output.windowDays, 14);
  assert.equal(output.source.sourceMissing, true);
  assert.equal(output.integrity.rawEventCount, 0);
  assert.equal(output.integrity.normalizedEventCount, 0);
  assert.equal(output.snapshot.totalEvents, 0);
  assert.equal(output.snapshot.conversion.checkoutCompletionRate, 0);
});
