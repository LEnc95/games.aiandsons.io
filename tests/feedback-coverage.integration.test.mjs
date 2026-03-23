import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  FEEDBACK_COMMON_LABELS,
  FEEDBACK_GAME_LABELS,
  FEEDBACK_GAMES,
} from "../src/meta/feedback.js";

const ROOT = process.cwd();
const LABELS_PATH = path.join(ROOT, "linear", "labels.md");
const ISSUES_PATH = path.join(ROOT, "linear", "game-issues.csv");
const OPS_FEEDBACK_PATH = path.join(ROOT, "ops", "feedback", "index.html");

test("every feedback game page mounts the shared feedback widget", () => {
  const missing = [];

  for (const game of FEEDBACK_GAMES) {
    const filePath = path.join(ROOT, game.filePath);
    assert.ok(fs.existsSync(filePath), `Expected game file for feedback coverage: ${game.filePath}`);
    const source = fs.readFileSync(filePath, "utf8");
    const slugPattern = new RegExp(
      `mountGameFeedback\\(\\{\\s*gameSlug:\\s*["']${game.slug}["']`,
      "m",
    );
    if (!slugPattern.test(source)) {
      missing.push(game.filePath);
    }
  }

  assert.deepEqual(missing, [], `Game pages missing feedback widget mount: ${missing.join(", ")}`);
});

test("Linear label seed file includes feedback and per-game labels", () => {
  const labelsSource = fs.readFileSync(LABELS_PATH, "utf8");

  for (const label of [...FEEDBACK_COMMON_LABELS, ...FEEDBACK_GAME_LABELS]) {
    assert.equal(
      labelsSource.includes(`- ${label}`),
      true,
      `Expected linear/labels.md to include ${label}`,
    );
  }
});

test("Linear baseline CSV stays aligned with feedback game metadata", () => {
  const csvSource = fs.readFileSync(ISSUES_PATH, "utf8").trim();
  const rows = csvSource.split(/\r?\n/);
  assert.equal(rows[0], "Title,Description,Labels,Priority,Project");
  assert.equal(rows.length, FEEDBACK_GAMES.length + 1, "Expected one baseline issue row per feedback game.");

  for (const game of FEEDBACK_GAMES) {
    assert.equal(
      csvSource.includes(`${game.name}: Issue tracking baseline`),
      true,
      `Expected baseline CSV row for ${game.name}`,
    );
    assert.equal(
      csvSource.includes(`setup,tracking,${game.label}`),
      true,
      `Expected baseline CSV labels for ${game.slug}`,
    );
  }
});

test("ops feedback inbox page exists with agent handoff controls", () => {
  const source = fs.readFileSync(OPS_FEEDBACK_PATH, "utf8");
  assert.equal(source.includes("Feedback Inbox"), true);
  assert.equal(source.includes("Prepare Agent Brief"), true);
  assert.equal(source.includes("Retry Linear Sync"), true);
  assert.equal(source.includes("Copy Codex Command"), true);
  assert.equal(source.includes("Open Baseline"), true);
  assert.equal(source.includes("Attachments"), true);
});
