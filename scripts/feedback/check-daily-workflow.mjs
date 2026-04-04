import fs from "node:fs";
import path from "node:path";

import { buildIssuesCsv, buildLabelsMarkdown } from "./sync-linear-seeds.mjs";

const repoRoot = process.cwd();
const labelsPath = path.join(repoRoot, "linear", "labels.md");
const issuesPath = path.join(repoRoot, "linear", "game-issues.csv");

function normalizeForCompare(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function assertFileMatches(filePath, expected, label) {
  const actual = fs.readFileSync(filePath, "utf8");
  if (normalizeForCompare(actual) !== normalizeForCompare(expected)) {
    throw new Error(`${label} is stale. Run npm run feedback:sync-linear and commit the updated artifact.`);
  }
}

async function main() {
  assertFileMatches(labelsPath, buildLabelsMarkdown(), "linear/labels.md");
  assertFileMatches(issuesPath, buildIssuesCsv(), "linear/game-issues.csv");
  console.log("Feedback daily workflow check passed. Linear seed artifacts are up to date.");
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
