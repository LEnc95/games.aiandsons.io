import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "onboarding-split-e2e");
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

async function readOnboardingState(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("cadegames:v1:onboarding");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
}

async function safeScreenshot(page, outputPath, options = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150 * attempt);
      await page.screenshot({ path: outputPath, fullPage: true, ...options });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(200 * attempt);
    }
  }
  throw lastError;
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
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await resetState(page);
    await page.reload({ waitUntil: "networkidle" });

    const initialHome = await page.evaluate(() => {
      const skipBtn = document.getElementById("skipOnboardingBtn");
      const showBtn = document.getElementById("showOnboardingBtn");
      return {
        hasParentPath: Boolean(document.getElementById("parentPathLink")),
        hasTeacherPath: Boolean(document.getElementById("teacherPathLink")),
        skipVisible: Boolean(skipBtn) && getComputedStyle(skipBtn).display !== "none",
        showVisible: Boolean(showBtn) && getComputedStyle(showBtn).display !== "none",
      };
    });
    assert(initialHome.hasParentPath, "Expected parent onboarding path card on home.");
    assert(initialHome.hasTeacherPath, "Expected teacher onboarding path card on home.");
    assert(initialHome.skipVisible, "Expected skip onboarding button to be visible on first load.");
    assert(!initialHome.showVisible, "Expected show onboarding button to be hidden on first load.");
    summary.checks.push({ name: "home_onboarding_paths_visible", pass: true, data: initialHome });

    const homeInitialShot = path.join(OUTPUT_DIR, "home-onboarding-initial.png");
    await safeScreenshot(page, homeInitialShot);
    summary.screenshots.push(homeInitialShot);

    await Promise.all([
      page.waitForURL("**/parent-onboarding.html"),
      page.click("#parentPathLink"),
    ]);
    const parentPage = await page.evaluate(() => ({
      heading: (document.querySelector("h1")?.textContent || "").trim(),
      hasPlansCta: Boolean(document.querySelector('a[href="/pricing.html"]')),
      hasAccessibilityCta: Boolean(document.querySelector('a[href="/accessibility.html"]')),
    }));
    assert(parentPage.heading === "Parent Onboarding", "Expected parent onboarding heading.");
    assert(parentPage.hasPlansCta, "Expected plans CTA on parent onboarding page.");
    assert(parentPage.hasAccessibilityCta, "Expected accessibility CTA on parent onboarding page.");

    const parentStorage = await readOnboardingState(page);
    assert(parentStorage?.selectedRole === "parent", "Expected onboarding selectedRole to persist as parent.");
    assert(parentStorage?.skipped === false, "Expected onboarding skipped to be false after parent path select.");
    summary.checks.push({ name: "parent_path_role_state", pass: true, data: { parentPage, parentStorage } });

    const parentShot = path.join(OUTPUT_DIR, "parent-onboarding.png");
    await safeScreenshot(page, parentShot);
    summary.screenshots.push(parentShot);

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await Promise.all([
      page.waitForURL("**/teacher-onboarding.html"),
      page.click("#teacherPathLink"),
    ]);
    const teacherPage = await page.evaluate(() => ({
      heading: (document.querySelector("h1")?.textContent || "").trim(),
      hasDashboardCta: Boolean(document.querySelector('a[href="/teacher/"]')),
      hasLicenseCta: Boolean(document.querySelector('a[href="/school-license.html"]')),
    }));
    assert(teacherPage.heading === "Teacher Onboarding", "Expected teacher onboarding heading.");
    assert(teacherPage.hasDashboardCta, "Expected teacher dashboard CTA on teacher onboarding page.");
    assert(teacherPage.hasLicenseCta, "Expected school license CTA on teacher onboarding page.");

    const teacherStorage = await readOnboardingState(page);
    assert(teacherStorage?.selectedRole === "teacher", "Expected onboarding selectedRole to persist as teacher.");
    assert(teacherStorage?.skipped === false, "Expected onboarding skipped to remain false after teacher path select.");
    summary.checks.push({ name: "teacher_path_role_state", pass: true, data: { teacherPage, teacherStorage } });

    const teacherShot = path.join(OUTPUT_DIR, "teacher-onboarding.png");
    await safeScreenshot(page, teacherShot);
    summary.screenshots.push(teacherShot);

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.click("#skipOnboardingBtn");
    const skippedHome = await page.evaluate(() => {
      const skipBtn = document.getElementById("skipOnboardingBtn");
      const showBtn = document.getElementById("showOnboardingBtn");
      const grid = document.getElementById("onboardingGrid");
      const activeGameCards = [...document.querySelectorAll("#gamesGrid .game-card")].filter((card) => {
        return !card.classList.contains("locked");
      });
      let stored = null;
      try {
        stored = JSON.parse(localStorage.getItem("cadegames:v1:onboarding") || "null");
      } catch {
        stored = null;
      }
      return {
        skipVisible: Boolean(skipBtn) && getComputedStyle(skipBtn).display !== "none",
        showVisible: Boolean(showBtn) && getComputedStyle(showBtn).display !== "none",
        gridVisible: Boolean(grid) && getComputedStyle(grid).display !== "none",
        activeGameCards: activeGameCards.length,
        stored,
      };
    });
    assert(skippedHome.showVisible, "Expected show onboarding button after skipping onboarding.");
    assert(!skippedHome.skipVisible, "Expected skip onboarding button hidden after skipping.");
    assert(!skippedHome.gridVisible, "Expected onboarding cards hidden after skipping.");
    assert(skippedHome.activeGameCards > 0, "Expected gameplay cards to remain available after skipping onboarding.");
    assert(skippedHome.stored?.skipped === true, "Expected skipped onboarding state to persist.");
    summary.checks.push({ name: "skip_onboarding_non_blocking", pass: true, data: skippedHome });

    const skipShot = path.join(OUTPUT_DIR, "home-onboarding-skipped.png");
    await safeScreenshot(page, skipShot);
    summary.screenshots.push(skipShot);

    await page.click("#showOnboardingBtn");
    const restoredHome = await page.evaluate(() => {
      const skipBtn = document.getElementById("skipOnboardingBtn");
      const showBtn = document.getElementById("showOnboardingBtn");
      const grid = document.getElementById("onboardingGrid");
      let stored = null;
      try {
        stored = JSON.parse(localStorage.getItem("cadegames:v1:onboarding") || "null");
      } catch {
        stored = null;
      }
      return {
        skipVisible: Boolean(skipBtn) && getComputedStyle(skipBtn).display !== "none",
        showVisible: Boolean(showBtn) && getComputedStyle(showBtn).display !== "none",
        gridVisible: Boolean(grid) && getComputedStyle(grid).display !== "none",
        stored,
      };
    });
    assert(restoredHome.skipVisible, "Expected skip onboarding button visible after restoring onboarding.");
    assert(!restoredHome.showVisible, "Expected show onboarding button hidden after restoring onboarding.");
    assert(restoredHome.gridVisible, "Expected onboarding cards visible after restoring onboarding.");
    assert(restoredHome.stored?.skipped === false, "Expected skipped onboarding state to clear after restore.");
    summary.checks.push({ name: "show_onboarding_restore", pass: true, data: restoredHome });

    const restoredShot = path.join(OUTPUT_DIR, "home-onboarding-restored.png");
    await safeScreenshot(page, restoredShot);
    summary.screenshots.push(restoredShot);

    summary.consoleErrors = consoleErrors;
    summary.success = consoleErrors.length === 0;
    if (!summary.success) {
      throw new Error("Console errors were captured during onboarding split smoke test.");
    }
  } finally {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    await browser.close();
  }

  console.log(`Onboarding split smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
