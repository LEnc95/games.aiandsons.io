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
      const onboardingSection = document.getElementById("onboardingSection");
      const parentPath = document.getElementById("parentPathLink");
      const teacherPath = document.getElementById("teacherPathLink");
      return {
        hasParentPath: Boolean(parentPath),
        hasTeacherPath: Boolean(teacherPath),
        parentHref: parentPath?.getAttribute("href") || "",
        teacherHref: teacherPath?.getAttribute("href") || "",
        onboardingVisible: Boolean(onboardingSection) && getComputedStyle(onboardingSection).display !== "none",
        skipVisible: Boolean(skipBtn) && getComputedStyle(skipBtn).display !== "none",
        showVisible: Boolean(showBtn) && getComputedStyle(showBtn).display !== "none",
        activeGameCards: [...document.querySelectorAll("#gamesGrid .game-card")].filter((card) => {
          return !card.classList.contains("locked");
        }).length,
      };
    });
    assert(initialHome.hasParentPath, "Expected parent guide link on home.");
    assert(initialHome.hasTeacherPath, "Expected teacher guide link on home.");
    assert(initialHome.parentHref === "/parent-onboarding.html", "Expected parent guide link to target parent onboarding.");
    assert(initialHome.teacherHref === "/teacher-onboarding.html", "Expected teacher guide link to target teacher onboarding.");
    assert(!initialHome.onboardingVisible, "Expected old onboarding section to stay out of the main home feed.");
    assert(!initialHome.skipVisible, "Expected old skip onboarding button to stay hidden from home.");
    assert(!initialHome.showVisible, "Expected old show onboarding button to stay hidden from home.");
    assert(initialHome.activeGameCards > 0, "Expected game cards to remain available without onboarding cards.");
    summary.checks.push({ name: "home_onboarding_guides_in_menu", pass: true, data: initialHome });

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
    const parentGuideMetric = await page.evaluate(() => {
      try {
        const metrics = JSON.parse(localStorage.getItem("cadegames:v1:metrics") || "{}");
        return Array.isArray(metrics.events) && metrics.events.some((event) => (
          event?.name === "launcher_onboarding_guide_opened" &&
          event?.meta?.role === "parent"
        ));
      } catch {
        return false;
      }
    });
    assert(parentStorage?.selectedRole === "parent", "Expected onboarding selectedRole to persist as parent.");
    assert(parentStorage?.skipped === false, "Expected onboarding skipped to be false after parent path select.");
    assert(parentGuideMetric, "Expected parent guide KPI event to be recorded.");
    summary.checks.push({ name: "parent_path_role_state", pass: true, data: { parentPage, parentStorage, parentGuideMetric } });

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
    const teacherGuideMetric = await page.evaluate(() => {
      try {
        const metrics = JSON.parse(localStorage.getItem("cadegames:v1:metrics") || "{}");
        return Array.isArray(metrics.events) && metrics.events.some((event) => (
          event?.name === "launcher_onboarding_guide_opened" &&
          event?.meta?.role === "teacher"
        ));
      } catch {
        return false;
      }
    });
    assert(teacherStorage?.selectedRole === "teacher", "Expected onboarding selectedRole to persist as teacher.");
    assert(teacherStorage?.skipped === false, "Expected onboarding skipped to remain false after teacher path select.");
    assert(teacherGuideMetric, "Expected teacher guide KPI event to be recorded.");
    summary.checks.push({ name: "teacher_path_role_state", pass: true, data: { teacherPage, teacherStorage, teacherGuideMetric } });

    const teacherShot = path.join(OUTPUT_DIR, "teacher-onboarding.png");
    await safeScreenshot(page, teacherShot);
    summary.screenshots.push(teacherShot);

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const finalHome = await page.evaluate(() => {
      const skipBtn = document.getElementById("skipOnboardingBtn");
      const showBtn = document.getElementById("showOnboardingBtn");
      const onboardingSection = document.getElementById("onboardingSection");
      let stored = null;
      try {
        stored = JSON.parse(localStorage.getItem("cadegames:v1:onboarding") || "null");
      } catch {
        stored = null;
      }
      return {
        skipVisible: Boolean(skipBtn) && getComputedStyle(skipBtn).display !== "none",
        showVisible: Boolean(showBtn) && getComputedStyle(showBtn).display !== "none",
        onboardingVisible: Boolean(onboardingSection) && getComputedStyle(onboardingSection).display !== "none",
        guideLinks: document.querySelectorAll("#parentPathLink, #teacherPathLink").length,
        activeGameCards: [...document.querySelectorAll("#gamesGrid .game-card")].filter((card) => {
          return !card.classList.contains("locked");
        }).length,
        stored,
      };
    });
    assert(!finalHome.skipVisible, "Expected old skip onboarding control to remain hidden.");
    assert(!finalHome.showVisible, "Expected old show onboarding control to remain hidden.");
    assert(!finalHome.onboardingVisible, "Expected old onboarding section to remain hidden from final home view.");
    assert(finalHome.guideLinks === 2, "Expected guide links to remain accessible from home.");
    assert(finalHome.activeGameCards > 0, "Expected game feed to remain playable after visiting guides.");
    assert(finalHome.stored?.selectedRole === "teacher", "Expected latest selected guide role to persist.");
    summary.checks.push({ name: "home_guides_non_blocking", pass: true, data: finalHome });

    const finalShot = path.join(OUTPUT_DIR, "home-guides-non-blocking.png");
    await safeScreenshot(page, finalShot);
    summary.screenshots.push(finalShot);

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
