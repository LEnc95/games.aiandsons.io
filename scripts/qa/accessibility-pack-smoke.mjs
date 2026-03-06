import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "accessibility-pack-e2e");
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

async function getKeyboardFocusState(page) {
  await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const active = document.activeElement;
    return {
      tagName: active?.tagName || "",
      id: active?.id || "",
      className: typeof active?.className === "string" ? active.className : "",
    };
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
    await page.goto(`${baseUrl}/accessibility.html`, { waitUntil: "networkidle" });
    await resetState(page);
    await page.reload({ waitUntil: "networkidle" });

    await page.selectOption("#colorProfileSelect", "deuteranopia");
    await page.check("#largeUiToggle");
    await page.check("#reducedMotionToggle");
    await page.check("#highContrastToggle");
    await page.click("#saveBtn");

    const storedSettings = await page.evaluate(() => {
      const raw = localStorage.getItem("cadegames:v1:accessibility");
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    });
    assert(storedSettings?.colorProfile === "deuteranopia", "Expected deuteranopia profile to persist.");
    assert(storedSettings?.largeUi === true, "Expected largeUi setting to persist.");
    assert(storedSettings?.reducedMotion === true, "Expected reducedMotion setting to persist.");
    assert(storedSettings?.highContrast === true, "Expected highContrast setting to persist.");
    summary.checks.push({ name: "accessibility_settings_persisted", pass: true, data: storedSettings });

    const settingsShot = path.join(OUTPUT_DIR, "settings-page.png");
    await page.screenshot({ path: settingsShot, fullPage: true });
    summary.screenshots.push(settingsShot);

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const homeState = await page.evaluate(() => {
      const root = document.documentElement;
      const firstCard = document.querySelector(".game-card");
      const transitionDuration = firstCard ? getComputedStyle(firstCard).transitionDuration : "";
      return {
        colorProfile: root.dataset.a11yColorProfile || "",
        largeUi: root.classList.contains("a11y-large-ui"),
        reducedMotion: root.classList.contains("a11y-reduced-motion"),
        highContrast: root.classList.contains("a11y-high-contrast"),
        rootFontSize: parseFloat(getComputedStyle(root).fontSize) || 0,
        transitionDuration,
      };
    });
    assert(homeState.colorProfile === "deuteranopia", "Expected color profile class on home.");
    assert(homeState.largeUi, "Expected large UI class on home.");
    assert(homeState.reducedMotion, "Expected reduced motion class on home.");
    assert(homeState.highContrast, "Expected high contrast class on home.");
    assert(homeState.rootFontSize >= 17, "Expected increased root font size on home.");
    assert(homeState.transitionDuration === "0s", "Expected reduced motion transition duration on home cards.");
    summary.checks.push({ name: "home_accessibility_applied", pass: true, data: homeState });

    await page.keyboard.press("/");
    const homeSearchFocus = await page.evaluate(() => document.activeElement?.id || "");
    assert(homeSearchFocus === "gameSearchInput", "Expected '/' shortcut to focus home game search.");

    const homeTabFocus = await getKeyboardFocusState(page);
    assert(homeTabFocus.tagName !== "BODY", "Expected keyboard Tab to reach a focusable home element.");
    summary.checks.push({ name: "home_keyboard_reachability", pass: true, data: { homeSearchFocus, homeTabFocus } });

    const homeShot = path.join(OUTPUT_DIR, "home-accessibility.png");
    await page.screenshot({ path: homeShot, fullPage: true });
    summary.screenshots.push(homeShot);

    await page.goto(`${baseUrl}/shop.html`, { waitUntil: "networkidle" });
    const shopState = await page.evaluate(() => {
      const root = document.documentElement;
      const firstItem = document.querySelector(".shop-item");
      const transitionDuration = firstItem ? getComputedStyle(firstItem).transitionDuration : "";
      return {
        colorProfile: root.dataset.a11yColorProfile || "",
        largeUi: root.classList.contains("a11y-large-ui"),
        reducedMotion: root.classList.contains("a11y-reduced-motion"),
        highContrast: root.classList.contains("a11y-high-contrast"),
        summaryAriaLive: document.getElementById("shopFilterSummary")?.getAttribute("aria-live") || "",
        noticeAriaLive: document.getElementById("shopNotice")?.getAttribute("aria-live") || "",
        transitionDuration,
      };
    });
    assert(shopState.colorProfile === "deuteranopia", "Expected color profile class on shop.");
    assert(shopState.largeUi, "Expected large UI class on shop.");
    assert(shopState.reducedMotion, "Expected reduced motion class on shop.");
    assert(shopState.highContrast, "Expected high contrast class on shop.");
    assert(shopState.summaryAriaLive === "polite", "Expected aria-live on shop filter summary.");
    assert(shopState.noticeAriaLive === "polite", "Expected aria-live on shop notice.");
    assert(shopState.transitionDuration === "0s", "Expected reduced motion transition duration on shop cards.");
    summary.checks.push({ name: "shop_accessibility_applied", pass: true, data: shopState });

    await page.keyboard.press("/");
    const shopSearchFocus = await page.evaluate(() => document.activeElement?.id || "");
    assert(shopSearchFocus === "shopSearchInput", "Expected '/' shortcut to focus shop search.");

    const shopTabFocus = await getKeyboardFocusState(page);
    assert(shopTabFocus.tagName !== "BODY", "Expected keyboard Tab to reach a focusable shop element.");
    summary.checks.push({ name: "shop_keyboard_reachability", pass: true, data: { shopSearchFocus, shopTabFocus } });

    const shopShot = path.join(OUTPUT_DIR, "shop-accessibility.png");
    await page.screenshot({ path: shopShot, fullPage: true });
    summary.screenshots.push(shopShot);

    summary.consoleErrors = consoleErrors;
    summary.success = consoleErrors.length === 0;
    if (!summary.success) {
      throw new Error("Console errors were captured during accessibility pack smoke test.");
    }
  } finally {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    await browser.close();
  }

  console.log(`Accessibility pack smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
