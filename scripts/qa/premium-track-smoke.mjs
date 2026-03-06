import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "premium-track-e2e");
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

    const freeTierState = await page.evaluate(() => {
      const meta = document.getElementById("premiumTrackMeta")?.textContent?.trim() || "";
      const cta = document.getElementById("premiumTrackCta");
      const cards = [...document.querySelectorAll("#premiumTrackList .mission-card")];
      return {
        meta,
        ctaVisible: Boolean(cta && cta.style.display !== "none"),
        ctaText: cta?.textContent?.trim() || "",
        cardCount: cards.length,
      };
    });
    assert(freeTierState.meta === "Locked", "Expected premium track to show locked state for free tier.");
    assert(freeTierState.ctaVisible, "Expected premium track upgrade CTA to be visible for free tier.");
    assert(freeTierState.ctaText.includes("View plans"), "Expected upgrade CTA to include plans link.");
    assert(freeTierState.cardCount === 0, "Expected no premium challenge cards for free tier.");
    summary.checks.push({ name: "premium_track_locked_state", pass: true, data: freeTierState });

    const freeShot = path.join(OUTPUT_DIR, "premium-track-locked.png");
    await page.locator("#premiumTrackSection").screenshot({ path: freeShot });
    summary.screenshots.push(freeShot);

    await page.evaluate(() => {
      localStorage.setItem("cadegames:v1:entitlements", JSON.stringify({
        familyPremium: true,
        schoolLicense: false,
        checkout: {
          status: "active",
          planId: "family-monthly",
          token: "co_test",
          startedAt: Date.now(),
          completedAt: Date.now(),
        },
      }));
    });
    await page.reload({ waitUntil: "networkidle" });

    const premiumTierState = await page.evaluate(() => {
      const meta = document.getElementById("premiumTrackMeta")?.textContent?.trim() || "";
      const cta = document.getElementById("premiumTrackCta");
      const cards = [...document.querySelectorAll("#premiumTrackList .mission-card")];
      return {
        meta,
        ctaVisible: Boolean(cta && cta.style.display !== "none"),
        cardCount: cards.length,
      };
    });
    assert(premiumTierState.meta.includes("completed"), "Expected progress text for entitled premium track.");
    assert(!premiumTierState.ctaVisible, "Expected upgrade CTA to be hidden for entitled premium track.");
    assert(premiumTierState.cardCount >= 1, "Expected premium challenge cards for entitled users.");
    summary.checks.push({ name: "premium_track_entitled_state", pass: true, data: premiumTierState });

    const premiumShot = path.join(OUTPUT_DIR, "premium-track-entitled.png");
    await page.locator("#premiumTrackSection").screenshot({ path: premiumShot });
    summary.screenshots.push(premiumShot);

    summary.consoleErrors = consoleErrors;
    summary.success = consoleErrors.length === 0;
    if (!summary.success) {
      throw new Error("Console errors were captured during premium track smoke test.");
    }
  } finally {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    await browser.close();
  }

  console.log(`Premium track smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
