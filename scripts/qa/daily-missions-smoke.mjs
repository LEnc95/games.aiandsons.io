import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "daily-missions-e2e");
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
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await resetState(page);
    await page.reload({ waitUntil: "networkidle" });

    const initialState = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#dailyMissionsList [data-mission-id]")];
      return {
        missionCount: cards.length,
        metaText: document.getElementById("dailyMissionsMeta")?.textContent?.trim() || "",
      };
    });
    assert(initialState.missionCount >= 3, "Expected at least three daily missions to be visible on home.");
    summary.checks.push({ name: "missions_rendered", pass: true, data: initialState });

    const beforeCoins = await page.evaluate(() => Number(document.getElementById("coins")?.textContent || "0"));
    const missionResult = await page.evaluate(() => {
      if (typeof window.maybeUnlock !== "function") {
        return { error: "maybeUnlock unavailable" };
      }
      const result = window.maybeUnlock({
        anyPlay: true,
        snake: { length: 30 },
        pong: { winMargin: 6 },
        tetris: { lines: 30, score: 4200, level: 6 },
        asteroids: { wave: 6, score: 4200, lives: 2 },
        bomberman: { level: 5, score: 4000, crates: 50 },
        dino: { dist: 1200 },
        frogger: { score: 20 },
        pokemon: { badges: 2, captures: 3 },
      });
      return {
        completedNow: Array.isArray(result?.missions?.completedNow) ? result.missions.completedNow : [],
        rewardsNow: Array.isArray(result?.missions?.rewardsNow) ? result.missions.rewardsNow : [],
      };
    });
    assert(!missionResult.error, "Expected maybeUnlock to be available in home runtime.");
    assert(missionResult.rewardsNow.length >= 1, "Expected daily mission reward payout from mission progress.");

    await page.reload({ waitUntil: "networkidle" });
    const afterState = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#dailyMissionsList [data-mission-id]")];
      const completed = cards.filter((card) => card.classList.contains("completed")).length;
      const metaText = document.getElementById("dailyMissionsMeta")?.textContent?.trim() || "";
      const coins = Number(document.getElementById("coins")?.textContent || "0");
      const badgesRaw = localStorage.getItem("cadegames:v1:badges");
      let badges = [];
      try {
        badges = badgesRaw ? JSON.parse(badgesRaw) : [];
      } catch {
        badges = [];
      }
      const missionsRaw = localStorage.getItem("cadegames:v1:missions");
      let missions = null;
      try {
        missions = missionsRaw ? JSON.parse(missionsRaw) : null;
      } catch {
        missions = null;
      }
      return { completed, metaText, coins, badges, missions };
    });
    assert(afterState.completed >= 1, "Expected at least one mission card marked complete after progress update.");
    assert(afterState.coins > beforeCoins, "Expected coins to increase after mission reward.");
    assert(Array.isArray(afterState.badges), "Expected badges to be persisted as an array.");
    assert(afterState.badges.includes("daily-mission-complete"), "Expected daily mission completion badge to be awarded.");
    assert(Boolean(afterState.missions?.dayKey), "Expected mission state to persist with current day key.");
    summary.checks.push({
      name: "missions_progress_persisted",
      pass: true,
      data: {
        completed: afterState.completed,
        coinsBefore: beforeCoins,
        coinsAfter: afterState.coins,
        missionDayKey: afterState.missions?.dayKey || "",
      },
    });

    const shot = path.join(OUTPUT_DIR, "daily-missions-home.png");
    await page.screenshot({ path: shot, fullPage: true });
    summary.screenshots.push(shot);

    summary.consoleErrors = consoleErrors;
    summary.success = consoleErrors.length === 0;
    if (!summary.success) {
      throw new Error("Console errors were captured during daily missions smoke test.");
    }
  } finally {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    await browser.close();
  }

  console.log(`Daily missions smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

