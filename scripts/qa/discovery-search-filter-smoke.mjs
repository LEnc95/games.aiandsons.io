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
    await page.evaluate(() => {
      localStorage.setItem("cadegames:v1:discoveryRankings", JSON.stringify({
        expiresAt: Date.now() + 60_000,
        payload: {
          ok: true,
          source: "firebase",
          updatedAt: new Date().toISOString(),
          ttlSeconds: 180,
          trending: [
            { slug: "caverncrush", score: 99 },
            { slug: "tetris", score: 88 },
          ],
          topPlayed: [
            { slug: "audioagar", score: 120 },
            { slug: "snake", score: 90 },
          ],
        },
      }));
    });
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

    await page.waitForFunction(() => (
      document.querySelectorAll("#gameOfDaySpotlight .spotlight-card").length === 1 &&
      document.querySelectorAll("#gameOfWeekSpotlight .spotlight-card").length === 1 &&
      document.querySelectorAll("#discoveryRows [data-discovery-row]").length >= 4 &&
      document.querySelectorAll("#categoryHub [data-category-key]").length >= 6 &&
      document.querySelectorAll("#todayPanel [data-today-kind]").length >= 3
    ));
    const discoveryInitialState = await page.evaluate(() => ({
      todayRows: [...document.querySelectorAll("#todayPanel [data-today-kind]")]
        .map((node) => node.getAttribute("data-today-kind") || "")
        .filter(Boolean),
      todayCta: (document.querySelector("#todayChallengeCta")?.textContent || "").trim(),
      onboardingVisible: Boolean(document.querySelector("#onboardingSection")) &&
        window.getComputedStyle(document.querySelector("#onboardingSection")).display !== "none",
      dayTitle: (document.querySelector("#gameOfDaySpotlight .spotlight-title")?.textContent || "").trim(),
      weekTitle: (document.querySelector("#gameOfWeekSpotlight .spotlight-title")?.textContent || "").trim(),
      categoryChips: [...document.querySelectorAll("#categoryRail [data-category-chip]")]
        .map((node) => node.getAttribute("data-category-chip") || "")
        .filter(Boolean),
      categoryHubCards: document.querySelectorAll("#categoryHub [data-category-key]").length,
      categoryHubPuzzlePreviewCount: document.querySelectorAll('#categoryHub [data-category-key="puzzle"] .category-preview-icons span').length,
      trendingTiles: document.querySelectorAll('[data-discovery-row="trending"] .game-tile').length,
      topPlayedTiles: document.querySelectorAll('[data-discovery-row="top-played"] .game-tile').length,
      newTiles: document.querySelectorAll('[data-discovery-row="new-this-week"] .game-tile').length,
      friendsTiles: document.querySelectorAll('[data-discovery-row="play-with-friends"] .game-tile').length,
      forYouTitle: (document.querySelector("#recentTitle")?.textContent || "").trim(),
      trendingFirstTitle: (document.querySelector('[data-discovery-row="trending"] .tile-title')?.textContent || "").trim(),
      topPlayedFirstTitle: (document.querySelector('[data-discovery-row="top-played"] .tile-title')?.textContent || "").trim(),
      posterTiles: document.querySelectorAll(".poster-tile").length,
      trendingCarouselButtons: document.querySelectorAll('[data-discovery-row="trending"] .carousel-btn').length,
      trendingDotCount: document.querySelectorAll('[data-discovery-row="trending"] .carousel-dot').length,
      trendingPageText: (document.querySelector('[data-discovery-row="trending"] .carousel-count')?.textContent || "").trim(),
      trendingPreviousDisabled: Boolean(document.querySelector('[data-discovery-row="trending"] [data-carousel-prev]')?.disabled),
      trendingNextDisabled: Boolean(document.querySelector('[data-discovery-row="trending"] [data-carousel-next]')?.disabled),
    }));
    assert(discoveryInitialState.todayRows.includes("daily"), "Expected Today panel to include daily mission progress.");
    assert(discoveryInitialState.todayRows.includes("weekly"), "Expected Today panel to include weekly challenge progress.");
    assert(discoveryInitialState.todayCta.startsWith("Play "), "Expected Today panel to expose a direct game challenge CTA.");
    assert(discoveryInitialState.onboardingVisible === false, "Expected onboarding section to stay out of the main home feed.");
    assert(discoveryInitialState.dayTitle.length > 0, "Expected Game of the Day to render a title.");
    assert(discoveryInitialState.weekTitle.length > 0, "Expected Game of the Week to render a title.");
    assert(discoveryInitialState.categoryChips.includes("puzzle"), "Expected Puzzle category chip to render.");
    assert(discoveryInitialState.categoryChips.includes("audio-accessible"), "Expected Audio Accessible category chip to render.");
    assert(discoveryInitialState.categoryHubCards >= 6, "Expected Browse by Category hub to render category cards.");
    assert(discoveryInitialState.categoryHubPuzzlePreviewCount >= 3, "Expected Puzzle hub card to render preview icons.");
    assert(discoveryInitialState.trendingTiles >= 12, "Expected Trending Now row to render a larger set of games.");
    assert(discoveryInitialState.topPlayedTiles >= 12, "Expected Top Played row to render a larger set of games.");
    assert(discoveryInitialState.newTiles >= 6, "Expected New This Week row to render multiple games.");
    assert(discoveryInitialState.friendsTiles >= 4, "Expected Play With Friends row to render multiple games.");
    assert(discoveryInitialState.forYouTitle === "For You", "Expected empty recent shelf to become For You.");
    assert(discoveryInitialState.trendingFirstTitle === "Cavern Crush", "Expected cached live trending ranking to lead with Cavern Crush.");
    assert(discoveryInitialState.topPlayedFirstTitle === "Audio Agar", "Expected cached live top-played ranking to lead with Audio Agar.");
    assert(discoveryInitialState.posterTiles >= 3, "Expected featured poster tiles to render for top discovery rows.");
    assert(discoveryInitialState.trendingCarouselButtons === 2, "Expected Trending carousel to render previous/next buttons.");
    assert(discoveryInitialState.trendingDotCount >= 3, "Expected Trending carousel to expose multiple pages.");
    assert(discoveryInitialState.trendingPageText.startsWith("1/"), "Expected Trending carousel page count to start on page 1.");
    assert(discoveryInitialState.trendingPreviousDisabled === true, "Expected Trending carousel previous button to start disabled.");
    assert(discoveryInitialState.trendingNextDisabled === false, "Expected Trending carousel next button to be enabled.");
    summary.checks.push({ name: "home_discovery_sections", pass: true, data: discoveryInitialState });

    const carouselBeforeScroll = await page.$eval('[data-discovery-row="trending"] .discovery-row', (row) => Math.round(row.scrollLeft));
    let carouselClicks = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const disabled = await page.$eval('[data-discovery-row="trending"] [data-carousel-next]', (button) => button.disabled);
      if (disabled) break;
      await page.click('[data-discovery-row="trending"] [data-carousel-next]');
      carouselClicks += 1;
      await page.waitForTimeout(360);
    }
    const carouselState = await page.evaluate((beforeScroll) => {
      const row = document.querySelector('[data-discovery-row="trending"] .discovery-row');
      const dots = [...document.querySelectorAll('[data-discovery-row="trending"] .carousel-dot')];
      const activeDotIndex = dots.findIndex((dot) => dot.classList.contains("active"));
      return {
        beforeScroll,
        afterScroll: Math.round(row?.scrollLeft || 0),
        pageText: (document.querySelector('[data-discovery-row="trending"] .carousel-count')?.textContent || "").trim(),
        pageCount: dots.length,
        activeDotIndex,
        previousDisabled: Boolean(document.querySelector('[data-discovery-row="trending"] [data-carousel-prev]')?.disabled),
        nextDisabled: Boolean(document.querySelector('[data-discovery-row="trending"] [data-carousel-next]')?.disabled),
      };
    }, carouselBeforeScroll);
    assert(carouselState.afterScroll > carouselState.beforeScroll, "Expected Trending carousel next button to advance the row.");
    assert(carouselState.previousDisabled === false, "Expected Trending carousel previous button to enable after advancing.");
    assert(carouselState.pageCount >= 3, "Expected Trending carousel to have at least three pages.");
    assert(carouselClicks >= Math.min(3, carouselState.pageCount - 1), "Expected Trending carousel to advance beyond the old three-click cap when enough pages exist.");
    assert(carouselState.nextDisabled === true, "Expected Trending carousel next button to disable only at the true final page.");
    assert(carouselState.activeDotIndex === carouselState.pageCount - 1, "Expected Trending carousel active dot to reach the final page.");
    summary.checks.push({ name: "home_discovery_carousel_controls", pass: true, data: carouselState });

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
      const discoveryStyle = window.getComputedStyle(document.querySelector("#discoveryRows"));
      const spotlightStyle = window.getComputedStyle(document.querySelector(".spotlight-grid"));
      const todayStyle = window.getComputedStyle(document.querySelector("#todayPanel"));
      const categoryHubStyle = window.getComputedStyle(document.querySelector("#categoryHub"));
      return {
        titles,
        tags,
        allGamesTitle: (document.querySelector("#allGamesTitle")?.textContent || "").trim(),
        discoveryHidden: discoveryStyle.display === "none",
        spotlightHidden: spotlightStyle.display === "none",
        todayHidden: todayStyle.display === "none",
        categoryHubHidden: categoryHubStyle.display === "none",
      };
    });
    assert(homeSearchState.titles.length === 1, "Expected home search for 'tetris' to show exactly one game.");
    assert(homeSearchState.titles[0] === "Tetris", "Expected filtered home result to be Tetris.");
    assert(homeSearchState.tags[0] === "Earns coins", "Expected Tetris card to show coin-earning tag.");
    assert(homeSearchState.allGamesTitle === "Search Results", "Expected search mode to rename All Games to Search Results.");
    assert(homeSearchState.discoveryHidden === true, "Expected discovery shelves to hide while searching.");
    assert(homeSearchState.spotlightHidden === true, "Expected spotlights to hide while searching.");
    assert(homeSearchState.todayHidden === true, "Expected Today panel to hide while searching.");
    assert(homeSearchState.categoryHubHidden === true, "Expected category hub to hide while searching.");
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

    await page.selectOption("#gameCoinFilter", "all");
    await page.click('#categoryHub [data-category-key="puzzle"] .category-hub-action');
    await page.waitForFunction(() => document.querySelector("#gameCategoryFilter")?.value === "puzzle");
    await page.waitForFunction(() => document.querySelectorAll("#gamesGrid .game-title").length >= 5);
    const categoryHubState = await page.evaluate(() => {
      const titles = [...document.querySelectorAll("#gamesGrid .game-title")]
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      const metrics = JSON.parse(localStorage.getItem("cadegames:v1:metrics") || "{}");
      return {
        selectedValue: document.querySelector("#gameCategoryFilter")?.value || "",
        titles,
        viewAllEvent: Array.isArray(metrics.events)
          ? metrics.events.some((event) => (
            event?.name === "launcher_shelf_view_all_clicked" &&
            event?.meta?.source === "category_hub" &&
            event?.meta?.category === "puzzle"
          ))
          : false,
      };
    });
    assert(categoryHubState.selectedValue === "puzzle", "Expected Puzzle category hub View all to set All Games filter.");
    assert(categoryHubState.titles.includes("2048"), "Expected Puzzle hub View all to show 2048.");
    assert(categoryHubState.viewAllEvent === true, "Expected category hub View all KPI event.");
    summary.checks.push({ name: "home_category_hub_view_all_puzzle", pass: true, data: categoryHubState });

    await page.selectOption("#gameCategoryFilter", "all");
    await page.waitForFunction(() => document.querySelector("#gameCategoryFilter")?.value === "all");
    await page.click('[data-category-chip="puzzle"]');
    await page.waitForFunction(() => document.querySelector("#gameCategoryFilter")?.value === "puzzle");
    await page.waitForFunction(() => document.querySelectorAll("#gamesGrid .game-title").length >= 5);
    const categoryState = await page.evaluate(() => {
      const titles = [...document.querySelectorAll("#gamesGrid .game-title")]
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      const selectedChip = document.querySelector('[data-category-chip="puzzle"]');
      const metrics = JSON.parse(localStorage.getItem("cadegames:v1:metrics") || "{}");
      return {
        selectedValue: document.querySelector("#gameCategoryFilter")?.value || "",
        selectedChipPressed: selectedChip?.getAttribute("aria-pressed") || "",
        selectedChipActive: Boolean(selectedChip?.classList.contains("active")),
        titles,
        categoryEvent: Array.isArray(metrics.events)
          ? metrics.events.some((event) => event?.name === "launcher_category_selected" && event?.meta?.category === "puzzle")
          : false,
      };
    });
    assert(categoryState.selectedValue === "puzzle", "Expected category select to mirror Puzzle chip.");
    assert(categoryState.selectedChipPressed === "true", "Expected Puzzle chip aria-pressed state.");
    assert(categoryState.selectedChipActive === true, "Expected Puzzle chip active class.");
    assert(categoryState.titles.includes("2048"), "Expected Puzzle filter to include 2048.");
    assert(categoryState.categoryEvent === true, "Expected category selection KPI event.");
    summary.checks.push({ name: "home_category_chip_puzzle", pass: true, data: categoryState });

    await page.fill("#gameSearchInput", "Cavern");
    await page.waitForFunction(() => (
      document.querySelector("#gameCategoryFilter")?.value === "all" &&
      document.querySelector("#gameCoinFilter")?.value === "all"
    ));
    await page.waitForFunction(() => {
      const titles = [...document.querySelectorAll("#gamesGrid .game-title")]
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      return titles.length === 1 && titles[0] === "Cavern Crush";
    });
    const cavernSearchState = await page.evaluate(() => {
      const titles = [...document.querySelectorAll("#gamesGrid .game-title")]
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      const allChip = document.querySelector('[data-category-chip="all"]');
      const discoveryStyle = window.getComputedStyle(document.querySelector("#discoveryRows"));
      return {
        query: document.querySelector("#gameSearchInput")?.value || "",
        coinFilter: document.querySelector("#gameCoinFilter")?.value || "",
        categoryFilter: document.querySelector("#gameCategoryFilter")?.value || "",
        allChipPressed: allChip?.getAttribute("aria-pressed") || "",
        allGamesTitle: (document.querySelector("#allGamesTitle")?.textContent || "").trim(),
        discoveryHidden: discoveryStyle.display === "none",
        titles,
      };
    });
    assert(cavernSearchState.titles.length === 1, "Expected Cavern search to show exactly one game.");
    assert(cavernSearchState.titles[0] === "Cavern Crush", "Expected Cavern search to show Cavern Crush.");
    assert(cavernSearchState.coinFilter === "all", "Expected Cavern search to clear the coin filter.");
    assert(cavernSearchState.categoryFilter === "all", "Expected Cavern search to clear the category filter.");
    assert(cavernSearchState.allChipPressed === "true", "Expected All category chip to activate after search.");
    assert(cavernSearchState.allGamesTitle === "Search Results", "Expected Cavern search to stay in focused search mode.");
    assert(cavernSearchState.discoveryHidden === true, "Expected discovery shelves to stay hidden during Cavern search.");
    summary.checks.push({ name: "home_search_cavern_global", pass: true, data: cavernSearchState });

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => (
      document.querySelectorAll("#discoveryRows [data-discovery-row]").length >= 4 &&
      document.querySelectorAll("#todayPanel [data-today-kind]").length >= 3
    ));
    await page.waitForTimeout(100);
    await page.click("#launcherMenuBtn");
    await page.waitForFunction(() => document.querySelector("#launcherNav")?.classList.contains("open"));
    const mobileState = await page.evaluate(() => {
      const controls = document.querySelector(".discovery-controls");
      const rail = document.querySelector("#categoryRail");
      const today = document.querySelector("#todayPanel");
      const tile = document.querySelector("#discoveryRows .game-tile");
      const carousel = document.querySelector('[data-discovery-row="trending"] .carousel-shell');
      const menuButton = document.querySelector("#launcherMenuBtn");
      const nav = document.querySelector("#launcherNav");
      const bottomNav = document.querySelector(".mobile-bottom-nav");
      const controlsRect = controls?.getBoundingClientRect();
      const todayRect = today?.getBoundingClientRect();
      const tileRect = tile?.getBoundingClientRect();
      const carouselRect = carousel?.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        controlsWithinViewport: Boolean(controlsRect && controlsRect.left >= -2 && controlsRect.right <= window.innerWidth + 2),
        todayWithinViewport: Boolean(todayRect && todayRect.left >= -2 && todayRect.right <= window.innerWidth + 2 && todayRect.top < window.innerHeight),
        carouselWithinViewport: Boolean(carouselRect && carouselRect.left >= -2 && carouselRect.right <= window.innerWidth + 2),
        carouselButtons: document.querySelectorAll('[data-discovery-row="trending"] .carousel-btn').length,
        railScrollable: Boolean(rail && rail.scrollWidth > rail.clientWidth),
        tileWidth: Math.round(tileRect?.width || 0),
        tileHeight: Math.round(tileRect?.height || 0),
        bottomNavVisible: Boolean(bottomNav && window.getComputedStyle(bottomNav).display !== "none"),
        bottomNavItems: document.querySelectorAll(".mobile-bottom-nav a, .mobile-bottom-nav button").length,
        onboardingVisible: Boolean(document.querySelector("#onboardingSection")) &&
          window.getComputedStyle(document.querySelector("#onboardingSection")).display !== "none",
        menuButtonVisible: window.getComputedStyle(menuButton).display !== "none",
        navOpen: Boolean(nav?.classList.contains("open")),
        menuExpanded: menuButton?.getAttribute("aria-expanded") || "",
        visibleMenuItems: [...document.querySelectorAll("#launcherNav a, #launcherNav button")]
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }).length,
      };
    });
    assert(mobileState.documentWidth <= mobileState.viewportWidth + 2, "Expected no page-level horizontal overflow on mobile.");
    assert(mobileState.controlsWithinViewport === true, "Expected discovery controls to fit mobile viewport.");
    assert(mobileState.todayWithinViewport === true, "Expected Today panel to fit inside the mobile first viewport.");
    assert(mobileState.carouselWithinViewport === true, "Expected discovery carousel controls to fit mobile viewport.");
    assert(mobileState.carouselButtons === 2, "Expected mobile discovery carousel to keep previous/next buttons.");
    assert(mobileState.railScrollable === true, "Expected category rail to scroll horizontally on mobile.");
    assert(mobileState.tileWidth >= 120 && mobileState.tileHeight >= 120, "Expected mobile discovery tiles to remain tappable.");
    assert(mobileState.bottomNavVisible === true, "Expected mobile bottom nav to render.");
    assert(mobileState.bottomNavItems === 5, "Expected mobile bottom nav to expose five primary actions.");
    assert(mobileState.onboardingVisible === false, "Expected onboarding to stay hidden from mobile main feed.");
    assert(mobileState.menuButtonVisible === true, "Expected compact menu button to show on mobile.");
    assert(mobileState.navOpen === true, "Expected mobile site menu to open.");
    assert(mobileState.menuExpanded === "true", "Expected mobile menu button aria-expanded to update.");
    assert(mobileState.visibleMenuItems >= 6, "Expected mobile menu to expose secondary links.");
    summary.checks.push({ name: "home_mobile_discovery_layout", pass: true, data: mobileState });
    const mobileShot = path.join(OUTPUT_DIR, "home-mobile-discovery.png");
    await page.screenshot({ path: mobileShot, fullPage: false });
    summary.screenshots.push(mobileShot);
    await page.setViewportSize({ width: 1280, height: 720 });

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
