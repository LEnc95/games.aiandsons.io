import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "discovery-filter-e2e");
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
    await page.fill("#gameSearchInput", "tetris");
    const homeSearchState = await page.evaluate(() => {
      const titles = [...document.querySelectorAll("#gamesGrid .game-title")]
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      const tags = [...document.querySelectorAll("#gamesGrid .economy-tag")]
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      return { titles, tags };
    });
    assert(homeSearchState.titles.length === 1, "Expected home search for 'tetris' to show exactly one game.");
    assert(homeSearchState.titles[0] === "Tetris", "Expected filtered home result to be Tetris.");
    assert(homeSearchState.tags[0] === "Earns coins", "Expected Tetris card to show coin-earning tag.");
    summary.checks.push({ name: "home_search_tetris", pass: true, data: homeSearchState });

    await page.fill("#gameSearchInput", "");
    await page.selectOption("#gameCoinFilter", "no-coins");
    const homeNoCoinState = await page.evaluate(() => {
      const titles = [...document.querySelectorAll("#gamesGrid .game-title")]
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      const tags = [...document.querySelectorAll("#gamesGrid .economy-tag")]
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      return { titles, tags };
    });
    assert(homeNoCoinState.titles.length === 2, "Expected exactly two non-coin games on home filter.");
    assert(homeNoCoinState.titles.includes("Pocket Mini Golf"), "Expected Pocket Mini Golf in non-coin filter.");
    assert(homeNoCoinState.titles.includes("Micro RC Racer"), "Expected Micro RC Racer in non-coin filter.");
    assert(homeNoCoinState.tags.every((tag) => tag === "No coin rewards"), "Expected all non-coin filter tags to match.");
    summary.checks.push({ name: "home_non_coin_filter", pass: true, data: homeNoCoinState });
    const homeShot = path.join(OUTPUT_DIR, "home-search-filter.png");
    await page.screenshot({ path: homeShot, fullPage: true });
    summary.screenshots.push(homeShot);

    await page.goto(`${baseUrl}/shop.html`, { waitUntil: "networkidle" });
    await page.selectOption("#shopGameFilter", "Tetris");
    const shopTagState = await page.evaluate(() => {
      const titles = [...document.querySelectorAll("#shopGrid .shop-item-title")]
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      const tags = [...document.querySelectorAll("#shopGrid .shop-item-tag")]
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      return { titles, tags };
    });
    assert(shopTagState.titles.length > 0, "Expected at least one Tetris item after game filter.");
    assert(shopTagState.tags.length > 0, "Expected tags to render for filtered shop items.");
    assert(shopTagState.tags.every((tag) => tag === "Tetris"), "Expected all visible shop tags to be Tetris.");
    summary.checks.push({ name: "shop_game_filter_tetris", pass: true, data: shopTagState });

    await page.fill("#shopSearchInput", "aurora");
    const shopSearchState = await page.evaluate(() => {
      const titles = [...document.querySelectorAll("#shopGrid .shop-item-title")]
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      return { titles };
    });
    assert(shopSearchState.titles.length === 1, "Expected one Tetris+aurora shop result.");
    assert(shopSearchState.titles[0] === "Aurora Stack", "Expected Aurora Stack as filtered shop result.");
    summary.checks.push({ name: "shop_search_aurora", pass: true, data: shopSearchState });
    const shopShot = path.join(OUTPUT_DIR, "shop-search-filter.png");
    await page.screenshot({ path: shopShot, fullPage: true });
    summary.screenshots.push(shopShot);

    summary.consoleErrors = consoleErrors;
    summary.success = consoleErrors.length === 0;
    if (!summary.success) {
      throw new Error("Console errors were captured during discovery/search smoke test.");
    }
  } finally {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    await browser.close();
  }

  console.log(`Discovery/search smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
