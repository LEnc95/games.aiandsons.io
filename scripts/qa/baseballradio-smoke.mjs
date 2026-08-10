import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "baseballradio-e2e");

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
  if (!condition) throw new Error(message);
}

async function main() {
  ensureDir(OUTPUT_DIR);
  const baseUrl = process.argv[2] || "http://127.0.0.1:4173";
  const summary = {
    baseUrl,
    checks: [],
    screenshots: [],
    consoleErrors: [],
    success: false,
  };

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });

  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto(`${baseUrl}/baseballradio/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("#play-ball", { timeout: 15000 });
    summary.checks.push("gate-visible");

    assert(await page.locator(".skip-link").count() > 0, "Skip link should be present for keyboard/SR users");
    summary.checks.push("skip-link");

    const tagline = await page.locator(".tagline").innerText();
    assert(/Tap/i.test(tagline), "Tagline should mention Tap");
    summary.checks.push("tagline-tap");

    await page.selectOption("#session-length", "3");
    await page.click("#play-ball");
    await page.waitForSelector("#booth:not([hidden])", { timeout: 15000 });
    summary.checks.push("booth-open");

    await page.waitForSelector("#live-score", { timeout: 5000 });
    assert(await page.locator("#announce-mode").count() > 0, "Announce mode control should exist");
    await page.selectOption("#announce-mode", "screen-reader");
    summary.checks.push("announce-mode-sr");

    await page.waitForSelector("#action-fab", { timeout: 5000 });
    const fabLabel = await page.locator("#action-fab").innerText();
    assert(/Swing|Release/i.test(fabLabel), "Action FAB should show Swing or Release");
    summary.checks.push("action-fab");

    // Soft-gate: Start at-bat is locked until calibrate/skip — Space must activate Skip.
    const skipVisible = await page.locator("#skip-cal").isVisible().catch(() => false);
    if (skipVisible) {
      await page.focus("#skip-cal");
      await page.keyboard.press("Space");
      await page.waitForFunction(() => !document.getElementById("next-pitch")?.disabled, null, {
        timeout: 5000,
      });
      summary.checks.push("skip-calibration-space");
    }

    assert(await page.locator("#timing-action").count() > 0, "Rail Swing/Release control should exist for SR");
    summary.checks.push("timing-action-rail");

    await page.click("#calibrate");
    await page.waitForSelector("#cal-tap-zone:not([hidden])", { timeout: 10000 });
    summary.checks.push("cal-tap-zone");
    // Let a couple of taps register, then wait for calibration to finish / disarm.
    for (let i = 0; i < 4; i++) {
      await page.locator("#cal-tap-target").click({ force: true });
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(2500);

    await page.click("#next-pitch");
    summary.checks.push("start-transport");
    await page.waitForFunction(
      () => /pause/i.test(document.getElementById("next-pitch")?.textContent || ""),
      null,
      { timeout: 10000 },
    );
    await page.click("#next-pitch"); // Pause
    await page.waitForFunction(
      () => /resume|new game|start|ready/i.test(document.getElementById("next-pitch")?.textContent || ""),
      null,
      { timeout: 10000 },
    );
    summary.checks.push("pause-resume");

    await page.click("#announce-situation");
    summary.checks.push("announce-situation");

    const feedBox = await page.locator(".gd-feed").boundingBox();
    assert(feedBox && feedBox.height >= 80, "Play-by-play feed should be visible with usable height");
    summary.checks.push("play-by-play-visible");

    const liveScoreText = (await page.locator("#live-score").innerText()).trim();
    assert(liveScoreText.length > 0, "Live score region should have spoken score text");
    summary.checks.push("live-score-text");

    // With fold closed on mobile, feed/score must remain outside the optional visual board.
    const feedInFold = await page.locator("#gameday-fold .gd-feed").count();
    assert(feedInFold === 0, "Play-by-play must stay outside the visual-board fold for SR users");
    summary.checks.push("feed-outside-fold");

    const batter = page.locator(".gd-batter");
    assert(await batter.count() > 0, "Pitch tracker should show a batter stance");
    summary.checks.push("batter-stance");

    const shot = path.join(OUTPUT_DIR, "mobile-booth.png");
    await page.screenshot({ path: shot, fullPage: true });
    summary.screenshots.push(shot);

    summary.consoleErrors = consoleErrors.filter(
      (text) => !/favicon|SpeechSynthesis|AudioContext/i.test(text),
    );
    summary.success = true;
    fs.writeFileSync(path.join(OUTPUT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
