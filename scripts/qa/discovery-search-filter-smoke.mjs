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

function assertJsonEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
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
    await page.waitForFunction(() => document.querySelector("#homepageMusicToggle")?.textContent?.trim() === "Music Off");
    const musicInitialState = await page.evaluate(() => {
      const media = document.querySelector("#homepageMusic");
      const source = media?.querySelector("source");
      const toggle = document.querySelector("#homepageMusicToggle");
      const volume = document.querySelector("#homepageMusicVolume");
      const status = document.querySelector("#homepageMusicStatus");
      return {
        mediaTag: media?.tagName || "",
        source: source?.getAttribute("src") || "",
        loop: Boolean(media?.loop),
        preload: media?.getAttribute("preload") || "",
        paused: Boolean(media?.paused),
        toggleText: (toggle?.textContent || "").trim(),
        pressed: toggle?.getAttribute("aria-pressed") || "",
        volumeValue: volume?.value || "",
        statusAriaLive: status?.getAttribute("aria-live") || "",
        stored: localStorage.getItem("cadegames:v1:homepageMusic"),
      };
    });
    assert(musicInitialState.mediaTag === "VIDEO", "Expected homepage music media element to render.");
    assert(
      musicInitialState.source === "/public/mp3/Overclocked_Playthrough.mp4",
      "Expected homepage music source to use the Overclocked MP4.",
    );
    assert(musicInitialState.loop === true, "Expected homepage music media to loop.");
    assert(musicInitialState.preload === "none", "Expected homepage music media to avoid preloading.");
    assert(musicInitialState.paused === true, "Expected homepage music to start paused.");
    assert(musicInitialState.toggleText === "Music Off", "Expected homepage music toggle to default to Music Off.");
    assert(musicInitialState.pressed === "false", "Expected homepage music toggle to default to aria-pressed=false.");
    assert(musicInitialState.volumeValue === "35", "Expected homepage music volume to default to 35.");
    assert(musicInitialState.statusAriaLive === "polite", "Expected homepage music status to be polite.");
    assert(musicInitialState.stored === null, "Expected homepage music to avoid storing enabled state on first load.");

    await page.locator("#homepageMusicVolume").evaluate((input) => {
      input.value = "58";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() => {
      try {
        const stored = JSON.parse(localStorage.getItem("cadegames:v1:homepageMusic") || "{}");
        return stored.volume === 58 && !("enabled" in stored);
      } catch {
        return false;
      }
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelector("#homepageMusicToggle")?.textContent?.trim() === "Music Off");
    const musicReloadedState = await page.evaluate(() => {
      const media = document.querySelector("#homepageMusic");
      const toggle = document.querySelector("#homepageMusicToggle");
      const volume = document.querySelector("#homepageMusicVolume");
      const stored = JSON.parse(localStorage.getItem("cadegames:v1:homepageMusic") || "{}");
      return {
        paused: Boolean(media?.paused),
        toggleText: (toggle?.textContent || "").trim(),
        pressed: toggle?.getAttribute("aria-pressed") || "",
        volumeValue: volume?.value || "",
        mediaVolume: media?.volume,
        stored,
      };
    });
    assert(musicReloadedState.paused === true, "Expected homepage music to stay paused after reload.");
    assert(musicReloadedState.toggleText === "Music Off", "Expected homepage music to remain off after reload.");
    assert(musicReloadedState.pressed === "false", "Expected homepage music aria-pressed to remain false after reload.");
    assert(musicReloadedState.volumeValue === "58", "Expected homepage music slider to restore saved volume.");
    assert(musicReloadedState.mediaVolume === 0.58, "Expected homepage music element volume to restore saved volume.");
    assertJsonEqual(musicReloadedState.stored, { volume: 58 }, "Expected homepage music storage to persist volume only.");

    await page.evaluate(() => {
      const media = document.querySelector("#homepageMusic");
      window.__homepageMusicPlaying = false;
      Object.defineProperty(media, "play", {
        configurable: true,
        value: () => {
          window.__homepageMusicPlaying = true;
          return Promise.resolve();
        },
      });
      Object.defineProperty(media, "pause", {
        configurable: true,
        value: () => {
          window.__homepageMusicPlaying = false;
        },
      });
    });
    await page.click("#homepageMusicToggle");
    await page.waitForFunction(() => document.querySelector("#homepageMusicToggle")?.getAttribute("aria-pressed") === "true");
    const musicEnabledState = await page.evaluate(() => ({
      playing: Boolean(window.__homepageMusicPlaying),
      toggleText: (document.querySelector("#homepageMusicToggle")?.textContent || "").trim(),
      pressed: document.querySelector("#homepageMusicToggle")?.getAttribute("aria-pressed") || "",
      stored: JSON.parse(localStorage.getItem("cadegames:v1:homepageMusic") || "{}"),
    }));
    assert(musicEnabledState.playing === true, "Expected homepage music play() to run after toggle.");
    assert(musicEnabledState.toggleText === "Music On", "Expected homepage music toggle to show Music On.");
    assert(musicEnabledState.pressed === "true", "Expected homepage music toggle to set aria-pressed=true.");
    assertJsonEqual(musicEnabledState.stored, { volume: 58 }, "Expected enabling music not to persist enabled state.");

    await page.click("#homepageMusicToggle");
    await page.waitForFunction(() => document.querySelector("#homepageMusicToggle")?.getAttribute("aria-pressed") === "false");
    const musicDisabledState = await page.evaluate(() => ({
      playing: Boolean(window.__homepageMusicPlaying),
      toggleText: (document.querySelector("#homepageMusicToggle")?.textContent || "").trim(),
      pressed: document.querySelector("#homepageMusicToggle")?.getAttribute("aria-pressed") || "",
      stored: JSON.parse(localStorage.getItem("cadegames:v1:homepageMusic") || "{}"),
    }));
    assert(musicDisabledState.playing === false, "Expected homepage music pause() to run after disabling.");
    assert(musicDisabledState.toggleText === "Music Off", "Expected homepage music toggle to return to Music Off.");
    assert(musicDisabledState.pressed === "false", "Expected homepage music toggle to set aria-pressed=false.");
    assertJsonEqual(musicDisabledState.stored, { volume: 58 }, "Expected disabling music not to persist enabled state.");
    summary.checks.push({
      name: "home_music_controls",
      pass: true,
      data: { musicInitialState, musicReloadedState, musicEnabledState, musicDisabledState },
    });

    await page.fill("#gameSearchInput", "tetris");
    await page.waitForFunction(() => {
      try {
        const raw = localStorage.getItem("cadegames:v1:metrics");
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.events) && parsed.events.some((event) => event?.name === "launcher_search_changed");
      } catch {
        return false;
      }
    });
    await page.waitForFunction(() => document.querySelectorAll("#gamesGrid .game-title").length === 1);
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
    await page.waitForFunction(() => document.querySelectorAll("#gamesGrid .game-title").length >= 20);
    await page.selectOption("#gameCoinFilter", "no-coins");
    await page.waitForFunction(() => {
      try {
        const raw = localStorage.getItem("cadegames:v1:metrics");
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.events) && parsed.events.some((event) => event?.name === "launcher_coin_filter_changed");
      } catch {
        return false;
      }
    });
    await page.waitForFunction(() => document.querySelectorAll("#gamesGrid .game-title").length >= 4);
    const homeNoCoinState = await page.evaluate(() => {
      const titles = [...document.querySelectorAll("#gamesGrid .game-title")]
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      const tags = [...document.querySelectorAll("#gamesGrid .economy-tag")]
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      return { titles, tags };
    });
    assert(homeNoCoinState.titles.length >= 4, "Expected at least four non-coin games on home filter.");
    assert(homeNoCoinState.titles.includes("Prisoner's Dilemma Lab"), "Expected Prisoner's Dilemma Lab in non-coin filter.");
    assert(homeNoCoinState.titles.includes("Pocket Mini Golf"), "Expected Pocket Mini Golf in non-coin filter.");
    assert(homeNoCoinState.titles.includes("Micro RC Racer"), "Expected Micro RC Racer in non-coin filter.");
    assert(homeNoCoinState.titles.includes("Oregon Trail"), "Expected Oregon Trail in non-coin filter.");
    assert(homeNoCoinState.tags.every((tag) => tag === "No coin rewards"), "Expected all non-coin filter tags to match.");
    summary.checks.push({ name: "home_non_coin_filter", pass: true, data: homeNoCoinState });
    const homeShot = path.join(OUTPUT_DIR, "home-search-filter.png");
    await page.screenshot({ path: homeShot, fullPage: true });
    summary.screenshots.push(homeShot);

    await page.goto(`${baseUrl}/shop.html`, { waitUntil: "networkidle" });
    await page.selectOption("#shopGameFilter", "Tetris");
    await page.waitForFunction(() => {
      try {
        const raw = localStorage.getItem("cadegames:v1:metrics");
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.events) && parsed.events.some((event) => event?.name === "shop_game_filter_changed");
      } catch {
        return false;
      }
    });
    await page.waitForFunction(() => document.querySelectorAll("#shopGrid .shop-item").length >= 1);
    const shopTagState = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#shopGrid .shop-item")].map((card) => ({
        title: (card.querySelector(".shop-item-title")?.textContent || "").trim(),
        tags: [...card.querySelectorAll(".shop-item-tag")]
          .map((node) => (node.textContent || "").trim())
          .filter(Boolean),
      }));
      return {
        titles: cards.map((card) => card.title).filter(Boolean),
        cards,
      };
    });
    assert(shopTagState.titles.length > 0, "Expected at least one Tetris item after game filter.");
    assert(shopTagState.cards.every((card) => card.tags.length > 0), "Expected tags to render for filtered shop items.");
    assert(
      shopTagState.cards.every((card) => card.tags.includes("Tetris")),
      "Expected each visible shop card to include a Tetris game tag.",
    );
    assert(
      shopTagState.cards.every((card) => card.tags.every((tag) => tag === "Tetris" || tag === "Family Premium")),
      "Expected filtered shop tags to be only Tetris and optional Family Premium tags.",
    );
    summary.checks.push({ name: "shop_game_filter_tetris", pass: true, data: shopTagState });

    await page.fill("#shopSearchInput", "aurora");
    await page.waitForFunction(() => {
      try {
        const raw = localStorage.getItem("cadegames:v1:metrics");
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.events) && parsed.events.some((event) => event?.name === "shop_search_changed");
      } catch {
        return false;
      }
    });
    await page.waitForFunction(() => document.querySelectorAll("#shopGrid .shop-item-title").length >= 1);
    const shopSearchState = await page.evaluate(() => {
      const titles = [...document.querySelectorAll("#shopGrid .shop-item-title")]
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      return { titles };
    });
    assert(shopSearchState.titles.length >= 1, "Expected at least one Tetris+aurora shop result.");
    assert(shopSearchState.titles.includes("Aurora Stack"), "Expected Aurora Stack as filtered shop result.");
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
