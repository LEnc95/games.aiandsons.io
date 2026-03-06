import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "assignment-e2e");
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
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
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
    await page.goto(`${baseUrl}/teacher/`, { waitUntil: "networkidle" });
    await resetState(page);
    await page.reload({ waitUntil: "networkidle" });

    await page.check("#enabledInput");
    await page.selectOption("#assignmentSelect", "focus-pack");
    await page.click("#assignBtn");
    await page.click("#startBtn");
    await page.waitForTimeout(250);

    const teacherState = await page.evaluate(() => {
      const raw = localStorage.getItem("cadegames:v1:classroom");
      let classroom = null;
      try {
        classroom = raw ? JSON.parse(raw) : null;
      } catch {
        classroom = null;
      }
      return {
        assignmentBundle: classroom?.assignment?.bundleId || "",
        assignmentCompletedAt: Number(classroom?.assignment?.completedAt || 0),
        sessionActive: Boolean(classroom?.session?.active),
      };
    });
    assert(teacherState.assignmentBundle === "focus-pack", "Expected focus-pack assignment to persist from teacher page.");
    assert(teacherState.assignmentCompletedAt === 0, "Expected assignment to start as incomplete.");
    assert(teacherState.sessionActive === true, "Expected classroom session to be active after start.");
    summary.checks.push({ name: "teacher_assignment_saved", pass: true, data: teacherState });

    const teacherShot = path.join(OUTPUT_DIR, "teacher-assignment.png");
    await page.screenshot({ path: teacherShot, fullPage: true });
    summary.screenshots.push(teacherShot);

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const homeBefore = await page.evaluate(() => {
      const banner = document.getElementById("assignmentBanner");
      return {
        visible: banner ? !banner.classList.contains("hidden") : false,
        text: banner?.textContent?.trim() || "",
      };
    });
    assert(homeBefore.visible, "Expected assignment banner to be visible on home.");
    assert(homeBefore.text.includes("Focus Pack"), "Expected assignment banner to reference Focus Pack.");
    summary.checks.push({ name: "home_assignment_banner_visible", pass: true, data: homeBefore });

    await page.evaluate(() => {
      if (typeof window.maybeUnlock !== "function") {
        throw new Error("maybeUnlock unavailable");
      }
      window.maybeUnlock({
        anyPlay: true,
        snake: { length: 32 },
        pong: { winMargin: 7 },
        tetris: { lines: 60, score: 5600, level: 9 },
        asteroids: { wave: 9, score: 6500, lives: 2 },
        bomberman: { level: 6, score: 5200, crates: 80 },
        dino: { dist: 2200 },
        frogger: { score: 24 },
        pokemon: { badges: 3, captures: 5 },
      });
    });

    await page.reload({ waitUntil: "networkidle" });
    const homeAfter = await page.evaluate(() => {
      const banner = document.getElementById("assignmentBanner");
      const raw = localStorage.getItem("cadegames:v1:classroom");
      let classroom = null;
      try {
        classroom = raw ? JSON.parse(raw) : null;
      } catch {
        classroom = null;
      }
      return {
        visible: banner ? !banner.classList.contains("hidden") : false,
        text: banner?.textContent?.trim() || "",
        assignmentCompletedAt: Number(classroom?.assignment?.completedAt || 0),
        reportCount: Array.isArray(classroom?.report?.assignmentCompletions)
          ? classroom.report.assignmentCompletions.length
          : 0,
      };
    });
    assert(homeAfter.visible, "Expected assignment banner to remain visible after completion.");
    assert(homeAfter.text.includes("assignment complete"), "Expected assignment banner to show completion message.");
    assert(homeAfter.assignmentCompletedAt > 0, "Expected assignment completed timestamp to be stored.");
    assert(homeAfter.reportCount >= 1, "Expected local classroom report to include assignment completion entry.");
    summary.checks.push({ name: "assignment_completion_recorded", pass: true, data: homeAfter });

    const homeShot = path.join(OUTPUT_DIR, "home-assignment-complete.png");
    await page.screenshot({ path: homeShot, fullPage: true });
    summary.screenshots.push(homeShot);

    summary.consoleErrors = consoleErrors;
    summary.success = consoleErrors.length === 0;
    if (!summary.success) {
      throw new Error("Console errors were captured during assignment bundle smoke test.");
    }
  } finally {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    await browser.close();
  }

  console.log(`Assignment bundle smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
