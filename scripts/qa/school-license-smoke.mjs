import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "school-license-e2e");
const SUMMARY_PATH = path.join(OUTPUT_DIR, "summary.json");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    const fallback = path.join(
      codexHome,
      "skills",
      "develop-web-game",
      "node_modules",
      "playwright",
      "index.mjs",
    );
    return import(pathToFileURL(fallback).href);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function resetState(page) {
  await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith("cadegames:v1:")) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  });
}

async function main() {
  ensureDir(OUTPUT_DIR);
  const baseUrl = process.argv[2] || "http://127.0.0.1:4173";
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", (err) => {
    consoleErrors.push({ type: "pageerror", text: String(err) });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({ type: "console.error", text: msg.text() });
    }
  });

  const summary = {
    baseUrl,
    checks: [],
    screenshots: [],
    consoleErrors: [],
    success: false,
  };

  try {
    await page.goto(`${baseUrl}/school-license.html`, { waitUntil: "networkidle" });
    await resetState(page);
    await page.reload({ waitUntil: "networkidle" });

    const plansState = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#planGrid .plan-card")];
      return {
        planCount: cards.length,
        title: document.querySelector(".hero h2")?.textContent?.trim() || "",
      };
    });
    assert(plansState.planCount >= 2, "Expected at least two school license plans.");
    assert(
      plansState.title.toLowerCase().includes("school-safe"),
      "Expected school-safe pricing headline on school license page.",
    );
    summary.checks.push({ name: "school_license_plans_rendered", pass: true, data: plansState });

    await page.locator("#planGrid .plan-card").nth(1).locator(".plan-select").click();
    await page.fill("#schoolNameInput", "Pine Hill District");
    await page.fill("#districtEmailInput", "approvals@pinehill.org");
    await page.fill("#seatCountInput", "350");
    await page.click("#submitRequestBtn");

    const pendingState = await page.evaluate(() => {
      const requestRaw = localStorage.getItem("cadegames:v1:schoolLicenseRequest");
      const entitlementsRaw = localStorage.getItem("cadegames:v1:entitlements");
      let request = null;
      let entitlements = null;
      try {
        request = requestRaw ? JSON.parse(requestRaw) : null;
      } catch {
        request = null;
      }
      try {
        entitlements = entitlementsRaw ? JSON.parse(entitlementsRaw) : null;
      } catch {
        entitlements = null;
      }
      return {
        requestStatus: request?.status || "",
        requestId: request?.requestId || "",
        requestPlan: request?.planId || "",
        schoolLicense: Boolean(entitlements?.schoolLicense),
      };
    });
    assert(pendingState.requestStatus === "pending_review", "Expected request status to become pending_review.");
    assert(Boolean(pendingState.requestId), "Expected request id to be generated for district handoff.");
    assert(pendingState.requestPlan === "school-site", "Expected selected school-site plan to persist.");
    assert(pendingState.schoolLicense === false, "School license should remain off while review is pending.");
    summary.checks.push({ name: "school_license_pending_request", pass: true, data: pendingState });

    const pendingShot = path.join(OUTPUT_DIR, "school-license-pending.png");
    await page.locator("main").screenshot({ path: pendingShot });
    summary.screenshots.push(pendingShot);

    await page.click("#approveRequestBtn");
    const activeState = await page.evaluate(() => {
      const requestRaw = localStorage.getItem("cadegames:v1:schoolLicenseRequest");
      const entitlementsRaw = localStorage.getItem("cadegames:v1:entitlements");
      let request = null;
      let entitlements = null;
      try {
        request = requestRaw ? JSON.parse(requestRaw) : null;
      } catch {
        request = null;
      }
      try {
        entitlements = entitlementsRaw ? JSON.parse(entitlementsRaw) : null;
      } catch {
        entitlements = null;
      }
      return {
        requestStatus: request?.status || "",
        approvedAt: request?.approvedAt || 0,
        schoolLicense: Boolean(entitlements?.schoolLicense),
      };
    });
    assert(activeState.requestStatus === "active", "Expected request status to become active after approval.");
    assert(activeState.approvedAt > 0, "Expected approved timestamp after activation.");
    assert(activeState.schoolLicense === true, "Expected school license entitlement to activate.");
    summary.checks.push({ name: "school_license_activation", pass: true, data: activeState });

    await page.goto(`${baseUrl}/teacher/`, { waitUntil: "networkidle" });
    const teacherGateState = await page.evaluate(() => {
      const licenseValue = document.getElementById("licenseValue")?.textContent?.trim() || "";
      const snapshotButton = document.getElementById("snapshotBtn");
      return {
        licenseValue,
        snapshotButtonDisabled: Boolean(snapshotButton?.disabled),
      };
    });
    assert(teacherGateState.licenseValue === "Active", "Expected teacher dashboard to show active school license.");
    assert(teacherGateState.snapshotButtonDisabled === false, "Expected licensed snapshot button to be enabled.");

    await page.click("#snapshotBtn");
    const snapshotState = await page.evaluate(() => {
      const preview = document.getElementById("snapshotPreview")?.textContent || "";
      const notice = document.getElementById("actionNotice")?.textContent?.trim() || "";
      return {
        snapshotReady: preview.includes("generatedAt"),
        notice,
      };
    });
    assert(snapshotState.snapshotReady, "Expected snapshot output after clicking Generate Class Snapshot.");
    assert(snapshotState.notice.includes("Class snapshot generated"), "Expected success notice after snapshot generation.");
    summary.checks.push({ name: "teacher_school_license_unlock", pass: true, data: { ...teacherGateState, ...snapshotState } });

    const teacherShot = path.join(OUTPUT_DIR, "teacher-school-license-active.png");
    await page.locator("main").screenshot({ path: teacherShot });
    summary.screenshots.push(teacherShot);

    summary.consoleErrors = consoleErrors;
    summary.success = consoleErrors.length === 0;
    if (!summary.success) {
      throw new Error("Console errors were captured during school license smoke test.");
    }
  } finally {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    await browser.close();
  }

  console.log(`School license smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
