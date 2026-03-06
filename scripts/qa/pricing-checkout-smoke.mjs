import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "pricing-checkout-e2e");
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
    await page.goto(`${baseUrl}/pricing.html`, { waitUntil: "networkidle" });
    await resetState(page);
    await page.reload({ waitUntil: "networkidle" });

    const initialState = await page.evaluate(() => {
      const plans = [...document.querySelectorAll("#planGrid .plan-card")];
      const selected = plans.find((plan) => plan.classList.contains("selected"));
      return {
        planCount: plans.length,
        selectedPlanTitle: selected?.querySelector("h3")?.textContent?.trim() || "",
      };
    });
    assert(initialState.planCount >= 2, "Expected monthly and annual plans to render.");
    summary.checks.push({ name: "pricing_plans_rendered", pass: true, data: initialState });

    await page.click("button:has-text('Select Family Annual')");
    await page.click("#startCheckoutBtn");
    const pendingState = await page.evaluate(() => {
      const statusText = document.getElementById("checkoutStatus")?.textContent?.trim() || "";
      const tokenText = document.getElementById("checkoutToken")?.textContent?.trim() || "";
      const entitlementsRaw = localStorage.getItem("cadegames:v1:entitlements");
      let entitlements = null;
      try {
        entitlements = entitlementsRaw ? JSON.parse(entitlementsRaw) : null;
      } catch {
        entitlements = null;
      }
      return {
        statusText,
        tokenText,
        checkoutStatus: entitlements?.checkout?.status || "",
        checkoutPlanId: entitlements?.checkout?.planId || "",
        familyPremium: Boolean(entitlements?.familyPremium),
      };
    });
    assert(pendingState.checkoutStatus === "pending", "Expected checkout status to become pending.");
    assert(pendingState.checkoutPlanId === "family-annual", "Expected annual plan to be persisted in checkout state.");
    assert(pendingState.tokenText.includes("Checkout token:"), "Expected checkout token to be shown.");
    assert(pendingState.familyPremium === false, "Family premium should remain disabled while checkout is pending.");
    summary.checks.push({ name: "checkout_pending_state", pass: true, data: pendingState });

    const pendingShot = path.join(OUTPUT_DIR, "pricing-pending.png");
    await page.screenshot({ path: pendingShot, fullPage: true });
    summary.screenshots.push(pendingShot);

    await page.click("#completeCheckoutBtn");
    const activeState = await page.evaluate(() => {
      const statusText = document.getElementById("checkoutStatus")?.textContent?.trim() || "";
      const entitlementsRaw = localStorage.getItem("cadegames:v1:entitlements");
      let entitlements = null;
      try {
        entitlements = entitlementsRaw ? JSON.parse(entitlementsRaw) : null;
      } catch {
        entitlements = null;
      }
      return {
        statusText,
        familyPremium: Boolean(entitlements?.familyPremium),
        checkoutStatus: entitlements?.checkout?.status || "",
      };
    });
    assert(activeState.familyPremium === true, "Expected checkout completion to activate family premium.");
    assert(activeState.checkoutStatus === "active", "Expected checkout status to be active after completion.");
    assert(activeState.statusText.includes("Family Premium is active."), "Expected active checkout message after completion.");
    summary.checks.push({ name: "checkout_completed_state", pass: true, data: activeState });

    const activeShot = path.join(OUTPUT_DIR, "pricing-active.png");
    await page.screenshot({ path: activeShot, fullPage: true });
    summary.screenshots.push(activeShot);

    summary.consoleErrors = consoleErrors;
    summary.success = consoleErrors.length === 0;
    if (!summary.success) {
      throw new Error("Console errors were captured during pricing checkout smoke test.");
    }
  } finally {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    await browser.close();
  }

  console.log(`Pricing checkout smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
