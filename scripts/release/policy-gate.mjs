import fs from "node:fs";
import path from "node:path";

const CHECKLIST_PATH = path.join(process.cwd(), "RELEASE_CHECKLIST.md");
const RELEASE_NOTES_PATH = path.join(process.cwd(), "RELEASE_NOTES.md");
const SIGNOFF_PATH = path.join(process.cwd(), "release", "policy-signoff.json");
const PACKAGE_PATH = path.join(process.cwd(), "package.json");

const TRACKING_DEP_PATTERN = /(analytics|segment|mixpanel|amplitude|gtag|pixel|adsense|admob|doubleclick|telemetry)/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_RELEASE_NOTE_SECTIONS = Object.freeze([
  {
    id: "risk_register",
    heading: "## Risk Register",
  },
  {
    id: "rollback_plan",
    heading: "## Rollback Plan",
  },
]);

function fail(errors) {
  console.error("Policy release gate failed:");
  for (const message of errors) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readSignoff() {
  if (!fs.existsSync(SIGNOFF_PATH)) {
    fail([
      `Missing signoff file: ${SIGNOFF_PATH}`,
      "Create release/policy-signoff.json and add explicit policy review approval.",
    ]);
  }
  try {
    return readJson(SIGNOFF_PATH);
  } catch (err) {
    fail([`Signoff file is not valid JSON: ${err.message}`]);
  }
}

function findTrackingDependencies() {
  const pkg = readJson(PACKAGE_PATH);
  const deps = Object.keys({
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  });
  return deps.filter((dep) => TRACKING_DEP_PATTERN.test(dep));
}

function hasHeading(documentText, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}\\s*$`, "im");
  return pattern.test(documentText);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const requireApproval = args.has("--require-approval");
  const errors = [];

  if (!fs.existsSync(CHECKLIST_PATH)) {
    errors.push(`Missing release checklist: ${CHECKLIST_PATH}`);
  } else {
    const checklist = fs.readFileSync(CHECKLIST_PATH, "utf8");
    if (!checklist.includes("privacy.html")) {
      errors.push("Release checklist must reference privacy.html.");
    }
    if (!checklist.includes("school-privacy.html")) {
      errors.push("Release checklist must reference school-privacy.html.");
    }
  }

  if (!fs.existsSync(RELEASE_NOTES_PATH)) {
    errors.push(`Missing release notes file: ${RELEASE_NOTES_PATH}`);
  } else {
    const releaseNotes = fs.readFileSync(RELEASE_NOTES_PATH, "utf8");
    for (const section of REQUIRED_RELEASE_NOTE_SECTIONS) {
      if (!hasHeading(releaseNotes, section.heading)) {
        errors.push(
          `RELEASE_NOTES.md is missing required section "${section.heading}" (expected field: ${section.id}).`,
        );
      }
    }
  }

  const signoff = readSignoff();
  if (signoff.privacyPolicyReviewed !== true) {
    errors.push("privacyPolicyReviewed must be true in release/policy-signoff.json.");
  }
  if (signoff.schoolPolicyReviewed !== true) {
    errors.push("schoolPolicyReviewed must be true in release/policy-signoff.json.");
  }

  const reviewedBy = typeof signoff.reviewedBy === "string" ? signoff.reviewedBy.trim() : "";
  if (!reviewedBy) {
    errors.push("reviewedBy is required in release/policy-signoff.json.");
  }

  const reviewedAt = typeof signoff.reviewedAt === "string" ? signoff.reviewedAt.trim() : "";
  if (!DATE_PATTERN.test(reviewedAt)) {
    errors.push("reviewedAt must be an ISO date string (YYYY-MM-DD).");
  }

  if (requireApproval && signoff.approvedForRelease !== true) {
    errors.push("approvedForRelease must be true for release-tag validation.");
  }

  const trackingDeps = findTrackingDependencies();
  if (trackingDeps.length > 0 && signoff.trackingOrAdsAdded !== true) {
    errors.push(
      `Tracking/ad dependencies detected (${trackingDeps.join(", ")}). Set trackingOrAdsAdded=true and add trackingRiskReview signoff.`,
    );
  }

  if (signoff.trackingOrAdsAdded === true) {
    const reviewText = typeof signoff.trackingRiskReview === "string" ? signoff.trackingRiskReview.trim() : "";
    if (!reviewText) {
      errors.push("trackingRiskReview is required when trackingOrAdsAdded is true.");
    }
  }

  if (errors.length > 0) {
    fail(errors);
  }

  console.log("Policy release gate passed.");
  console.log(`Checklist: ${CHECKLIST_PATH}`);
  console.log(`Release notes: ${RELEASE_NOTES_PATH}`);
  console.log(`Signoff: ${SIGNOFF_PATH}`);
  console.log(`Reviewed by: ${reviewedBy} on ${reviewedAt}`);
}

main();
