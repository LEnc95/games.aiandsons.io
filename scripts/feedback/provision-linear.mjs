import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import {
  FEEDBACK_COMMON_LABELS,
  FEEDBACK_GAMES,
} from "../../src/meta/feedback.js";

const require = createRequire(import.meta.url);
const {
  getLinearConfig,
  isLinearConfigured,
  provisionFeedbackLinearResources,
} = require("../../api/feedback/_linear.js");

function formatLabelSummary(result) {
  const createdCount = Array.isArray(result.createdLabels) ? result.createdLabels.length : 0;
  const errorCount = Array.isArray(result.labelErrors) ? result.labelErrors.length : 0;
  return `Labels: ${createdCount} created, ${errorCount} warnings.`;
}

function formatBaselineSummary(result) {
  const baselineResults = Array.isArray(result.baselineResults) ? result.baselineResults : [];
  const createdCount = baselineResults.filter((entry) => entry.created).length;
  const existingCount = baselineResults.filter((entry) => entry.issue && !entry.created).length;
  const errorCount = baselineResults.filter((entry) => entry.error).length;
  return `Baselines: ${createdCount} created, ${existingCount} already present, ${errorCount} warnings.`;
}

export async function runFeedbackLinearProvision({
  silentWhenNotConfigured = false,
} = {}) {
  const config = getLinearConfig();
  if (!isLinearConfigured()) {
    if (!silentWhenNotConfigured) {
      console.log("Skipped live Linear provisioning. Set LINEAR_API_KEY and LINEAR_TEAM_ID to enable it.");
    }
    return {
      ok: false,
      skipped: true,
      reason: "linear_not_configured",
      config,
    };
  }

  const result = await provisionFeedbackLinearResources({
    commonLabels: FEEDBACK_COMMON_LABELS,
    games: FEEDBACK_GAMES,
    projectId: config.projectId,
    teamId: config.teamId,
  });

  console.log(formatLabelSummary(result));
  if (config.projectId) {
    console.log(formatBaselineSummary(result));
  } else {
    console.log("Baselines: skipped because LINEAR_PROJECT_ID is not configured.");
  }

  for (const warning of result.labelErrors || []) {
    console.warn(`Label warning for ${warning.name}: ${warning.error}`);
  }
  for (const baseline of result.baselineResults || []) {
    if (baseline.error) {
      console.warn(`Baseline warning for ${baseline.gameName}: ${baseline.error}`);
    }
  }

  return {
    ok: true,
    skipped: false,
    config,
    result,
  };
}

async function main() {
  await runFeedbackLinearProvision();
}

const isDirectRun = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(String(error?.stack || error?.message || error));
    process.exitCode = 1;
  });
}
