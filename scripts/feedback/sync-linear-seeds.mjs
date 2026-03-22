import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FEEDBACK_ALL_LABELS,
  FEEDBACK_COMMON_LABELS,
  FEEDBACK_GAME_LABELS,
  FEEDBACK_GAMES,
} from "../../src/meta/feedback.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const linearDir = path.join(repoRoot, "linear");
const labelsPath = path.join(linearDir, "labels.md");
const issuesPath = path.join(linearDir, "game-issues.csv");

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildLabelsMarkdown() {
  const lines = [
    "# Recommended Labels",
    "",
    "## Common Labels",
    "",
    ...FEEDBACK_COMMON_LABELS.map((label) => `- ${label}`),
    "",
    "## Per-Game Labels",
    "",
    ...FEEDBACK_GAME_LABELS.map((label) => `- ${label}`),
    "",
    "Generated from `src/meta/feedback.js`.",
    "",
  ];
  return lines.join("\n");
}

function buildIssueDescription(game) {
  return [
    `Create issue tracking baseline for ${game.name}.`,
    "Define bug, feature, and feedback workflow and keep future work linked here.",
    "Treat player feedback submissions and follow-up agent briefs as children of this baseline issue.",
  ].join(" ");
}

function buildIssuesCsv() {
  const rows = [
    ["Title", "Description", "Labels", "Priority", "Project"],
    ...FEEDBACK_GAMES.map((game) => [
      `${game.name}: Issue tracking baseline`,
      buildIssueDescription(game),
      `setup,tracking,${game.label}`,
      "3",
      "games.aiandsons.io",
    ]),
  ];

  return rows
    .map((row) => row.map((value) => csvEscape(value)).join(","))
    .join("\n");
}

function main() {
  fs.mkdirSync(linearDir, { recursive: true });
  fs.writeFileSync(labelsPath, buildLabelsMarkdown());
  fs.writeFileSync(issuesPath, buildIssuesCsv());

  console.log(`Updated ${path.relative(repoRoot, labelsPath)} with ${FEEDBACK_ALL_LABELS.length} labels.`);
  console.log(`Updated ${path.relative(repoRoot, issuesPath)} with ${FEEDBACK_GAMES.length} baseline issues.`);
}

main();
