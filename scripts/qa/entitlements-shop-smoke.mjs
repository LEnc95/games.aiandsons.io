import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "entitlements-shop-e2e");
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
    await page.goto(`${baseUrl}/shop.html`, { waitUntil: "networkidle" });
    await resetState(page);
    await page.reload({ waitUntil: "networkidle" });

    const freeTierState = await page.evaluate(() => {
      const premiumButtons = [...document.querySelectorAll(".shop-item-btn")]
        .filter((button) => button.textContent?.trim() === "Family Premium required");
      const premiumTags = [...document.querySelectorAll(".shop-item-tag.premium")];
      const notice = document.getElementById("shopNotice");
      return {
        premiumLockedButtons: premiumButtons.length,
        premiumTags: premiumTags.length,
        noticeText: notice?.textContent?.trim() || "",
      };
    });

    assert(freeTierState.premiumTags > 0, "Expected premium tags to render in free tier shop view.");
    assert(freeTierState.premiumLockedButtons > 0, "Expected premium-locked buttons in free tier shop view.");
    assert(
      freeTierState.noticeText.includes("Family Premium"),
      "Expected shop notice to explain Family Premium gating.",
    );
    summary.checks.push({ name: "free_tier_premium_locks", pass: true, data: freeTierState });

    const freeShot = path.join(OUTPUT_DIR, "shop-free-tier.png");
    await page.screenshot({ path: freeShot, fullPage: true });
    summary.screenshots.push(freeShot);

    await page.evaluate(() => {
      localStorage.setItem("cadegames:v1:entitlements", JSON.stringify({
        familyPremium: true,
        schoolLicense: false,
      }));
    });
    await page.reload({ waitUntil: "networkidle" });

    const premiumState = await page.evaluate(() => {
      const premiumButtons = [...document.querySelectorAll(".shop-item-btn")]
        .filter((button) => button.textContent?.trim() === "Family Premium required");
      const summaryText = document.getElementById("shopFilterSummary")?.textContent?.trim() || "";
      const noticeText = document.getElementById("shopNotice")?.textContent?.trim() || "";
      return {
        premiumLockedButtons: premiumButtons.length,
        summaryText,
        noticeText,
      };
    });

    assert(premiumState.premiumLockedButtons === 0, "Expected premium lock buttons to disappear when Family Premium is active.");
    assert(
      premiumState.summaryText.includes("Family Premium active"),
      "Expected filter summary to show Family Premium active state.",
    );
    summary.checks.push({ name: "premium_tier_unlocks", pass: true, data: premiumState });

    const premiumShot = path.join(OUTPUT_DIR, "shop-premium-tier.png");
    await page.screenshot({ path: premiumShot, fullPage: true });
    summary.screenshots.push(premiumShot);

    summary.consoleErrors = consoleErrors;
    summary.success = consoleErrors.length === 0;
    if (!summary.success) {
      throw new Error("Console errors were captured during entitlements shop smoke test.");
    }
  } finally {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    await browser.close();
  }

  console.log(`Entitlements shop smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
