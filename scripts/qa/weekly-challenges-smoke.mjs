import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "weekly-challenges-e2e");
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
      const cards = [...document.querySelectorAll("#weeklyChallengesList [data-challenge-id]")];
      return {
        challengeCount: cards.length,
        metaText: document.getElementById("weeklyChallengesMeta")?.textContent?.trim() || "",
      };
    });
    assert(initialState.challengeCount >= 2, "Expected at least two weekly challenges to be visible on home.");
    summary.checks.push({ name: "weekly_challenges_rendered", pass: true, data: initialState });

    const beforeCoins = await page.evaluate(() => Number(document.getElementById("coins")?.textContent || "0"));
    const result = await page.evaluate(() => {
      if (typeof window.maybeUnlock !== "function") {
        return { error: "maybeUnlock unavailable" };
      }
      const update = window.maybeUnlock({
        anyPlay: true,
        snake: { length: 32 },
        pong: { winMargin: 7 },
        tetris: { lines: 60, score: 5200, level: 9 },
        asteroids: { wave: 9, score: 6500, lives: 3 },
        bomberman: { level: 6, score: 5200, crates: 80 },
        dino: { dist: 2200 },
        frogger: { score: 24 },
        pokemon: { badges: 3, captures: 5 },
      });
      return {
        weeklyCompletedNow: Array.isArray(update?.missions?.weeklyCompletedNow) ? update.missions.weeklyCompletedNow : [],
        weeklyRewardsNow: Array.isArray(update?.missions?.weeklyRewardsNow) ? update.missions.weeklyRewardsNow : [],
      };
    });

    assert(!result.error, "Expected maybeUnlock to be available in home runtime.");
    assert(result.weeklyRewardsNow.length >= 1, "Expected weekly challenge reward payout from progress update.");

    await page.reload({ waitUntil: "networkidle" });
    const afterState = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#weeklyChallengesList [data-challenge-id]")];
      const completed = cards.filter((card) => card.classList.contains("completed")).length;
      const metaText = document.getElementById("weeklyChallengesMeta")?.textContent?.trim() || "";
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

    assert(afterState.completed >= 1, "Expected at least one weekly challenge card marked complete after progress update.");
    assert(afterState.coins > beforeCoins, "Expected coins to increase after weekly challenge reward.");
    assert(Array.isArray(afterState.badges), "Expected badges to be persisted as an array.");
    assert(afterState.badges.includes("weekly-challenge-complete"), "Expected weekly challenge completion badge to be awarded.");
    assert(Boolean(afterState.missions?.weekly?.weekKey), "Expected weekly challenge state to persist with current week key.");
    summary.checks.push({
      name: "weekly_progress_persisted",
      pass: true,
      data: {
        completed: afterState.completed,
        coinsBefore: beforeCoins,
        coinsAfter: afterState.coins,
        weekKey: afterState.missions?.weekly?.weekKey || "",
      },
    });

    const shot = path.join(OUTPUT_DIR, "weekly-challenges-home.png");
    await page.screenshot({ path: shot, fullPage: true });
    summary.screenshots.push(shot);

    summary.consoleErrors = consoleErrors;
    summary.success = consoleErrors.length === 0;
    if (!summary.success) {
      throw new Error("Console errors were captured during weekly challenges smoke test.");
    }
  } finally {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    await browser.close();
  }

  console.log(`Weekly challenges smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
