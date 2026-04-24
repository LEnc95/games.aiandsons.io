import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "metrics-baseline-e2e");
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
  page.on("dialog", async (dialog) => {
    await dialog.dismiss();
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

    await page.fill("#gameSearchInput", "tetris");
    await page.selectOption("#gameCoinFilter", "no-coins");
    await Promise.all([
      page.waitForURL("**/pricing.html"),
      page.click("#premiumTrackCta a"),
    ]);
    summary.checks.push({ name: "launcher_to_pricing_upgrade_flow", pass: true });
    const pricingShot = path.join(OUTPUT_DIR, "pricing-flow.png");
    await page.screenshot({ path: pricingShot, fullPage: true });
    summary.screenshots.push(pricingShot);

    await page.click("button:has-text('Select Family Annual')");
    await page.click("#startCheckoutBtn");
    await page.click("#completeCheckoutBtn");

    await page.evaluate(() => {
      localStorage.setItem("cadegames:v1:coins", JSON.stringify(1000));
    });

    await page.goto(`${baseUrl}/shop.html`, { waitUntil: "networkidle" });
    await page.fill("#shopSearchInput", "sky");
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
    await page.waitForFunction(() => {
      const cards = Array.from(document.querySelectorAll("#shopGrid .shop-item"));
      return cards.some((card) => {
        const title = card.querySelector(".shop-item-title")?.textContent?.trim();
        return title === "Sky Paddle";
      });
    });
    const skyPaddleCard = page.locator("#shopGrid .shop-item").filter({
      has: page.locator(".shop-item-title", { hasText: "Sky Paddle" }),
    }).first();
    const cardCount = await skyPaddleCard.count();
    assert(cardCount >= 1, "Expected Sky Paddle card to render in shop metrics flow.");
    const skyPaddleButton = skyPaddleCard.locator(".shop-item-btn").first();
    const buttonText = ((await skyPaddleButton.textContent()) || "").trim();
    if (buttonText.includes("Buy")) {
      await skyPaddleButton.click();
    } else {
      const anyBuyButton = page.locator("#shopGrid .shop-item-btn").filter({ hasText: "Buy" }).first();
      if (await anyBuyButton.count()) {
        await anyBuyButton.click();
      } else {
        throw new Error(`Expected a purchasable shop item during metrics flow, found Sky Paddle button text: '${buttonText}'.`);
      }
    }

    const metricsState = await page.evaluate(async () => {
      let state = null;
      try {
        state = JSON.parse(localStorage.getItem("cadegames:v1:metrics") || "null");
      } catch {
        state = null;
      }

      const metricsModule = await import("/src/core/metrics.js");
      const snapshot = metricsModule.getKpiDashboardSnapshot({ windowDays: 30 });
      return { state, snapshot };
    });

    const events = Array.isArray(metricsState?.state?.events) ? metricsState.state.events : [];
    const names = new Set(events.map((event) => event?.name).filter(Boolean));
    const requiredEvents = [
      "launcher_view",
      "launcher_search_changed",
      "launcher_coin_filter_changed",
      "premium_upgrade_cta_clicked",
      "pricing_view",
      "pricing_plan_selected",
      "checkout_started",
      "checkout_completed",
      "shop_view",
      "shop_search_changed",
      "shop_purchase_attempt",
      "shop_purchase_success",
    ];

    for (const eventName of requiredEvents) {
      assert(names.has(eventName), `Expected KPI event '${eventName}' in metrics state.`);
    }

    const snapshot = metricsState?.snapshot || {};
    assert(snapshot?.conversion?.checkoutStarted >= 1, "Expected checkoutStarted conversion metric.");
    assert(snapshot?.conversion?.checkoutCompleted >= 1, "Expected checkoutCompleted conversion metric.");
    assert(snapshot?.conversion?.purchaseAttempts >= 1, "Expected purchaseAttempts conversion metric.");
    assert(snapshot?.conversion?.purchaseSuccesses >= 1, "Expected purchaseSuccesses conversion metric.");
    summary.checks.push({
      name: "kpi_events_recorded",
      pass: true,
      data: {
        eventCount: events.length,
        requiredEvents,
        dashboardSnapshot: snapshot,
      },
    });

    const shopShot = path.join(OUTPUT_DIR, "shop-metrics-flow.png");
    await page.screenshot({ path: shopShot, fullPage: true });
    summary.screenshots.push(shopShot);

    summary.consoleErrors = consoleErrors;
    summary.success = consoleErrors.length === 0;
    if (!summary.success) {
      throw new Error("Console errors were captured during metrics baseline smoke test.");
    }
  } finally {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    await browser.close();
  }

  console.log(`Metrics baseline smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
