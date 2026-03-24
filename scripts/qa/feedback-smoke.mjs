import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "feedback-e2e");
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

  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const desktopPage = await desktopContext.newPage();
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();

  const consoleErrors = [];
  const recordConsole = (pageName, page) => {
    page.on("pageerror", (err) => {
      consoleErrors.push({ page: pageName, type: "pageerror", text: String(err) });
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push({ page: pageName, type: "console.error", text: msg.text() });
      }
    });
  };
  recordConsole("desktop", desktopPage);
  recordConsole("mobile", mobilePage);

  try {
    const submissionSummary = `Arcade feedback smoke ${Date.now()}`;
    await desktopPage.goto(`${baseUrl}/pong/index.html`, { waitUntil: "networkidle" });
    await desktopPage.waitForSelector("#cadeFeedbackOpenBtn");
    await desktopPage.click("#cadeFeedbackOpenBtn");
    await desktopPage.fill("#cadeFeedbackSummary", submissionSummary);
    await desktopPage.fill("#cadeFeedbackDetails", "Testing the shared feedback flow from the Pong page.");
    await desktopPage.fill("#cadeFeedbackRepro", "Open the feedback widget and submit this form.");
    await desktopPage.setInputFiles("#cadeFeedbackAttachmentInput", {
      name: "feedback-note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("feedback smoke attachment", "utf8"),
    });
    await desktopPage.click("#cadeFeedbackSubmitBtn");
    await desktopPage.waitForFunction(() => {
      const status = document.getElementById("cadeFeedbackStatus");
      if (!status) return false;
      const text = String(status.textContent || "");
      return text.includes("Feedback sent") || text.includes("Feedback saved");
    });
    summary.checks.push({ name: "desktop_submit", pass: true });
    const pongShot = path.join(OUTPUT_DIR, "pong-feedback.png");
    await desktopPage.screenshot({ path: pongShot, fullPage: true });
    summary.screenshots.push(pongShot);

    await mobilePage.goto(`${baseUrl}/tetris/index.html`, { waitUntil: "networkidle" });
    await mobilePage.waitForSelector("#cadeFeedbackOpenBtn");
    const mobileBox = await mobilePage.locator("#cadeFeedbackOpenBtn").boundingBox();
    assert(mobileBox && mobileBox.width > 0 && mobileBox.height > 0, "Expected feedback button visible on mobile game page.");
    summary.checks.push({ name: "mobile_button_visible", pass: true, data: mobileBox });
    const mobileShot = path.join(OUTPUT_DIR, "tetris-feedback-mobile.png");
    await mobilePage.screenshot({ path: mobileShot, fullPage: true });
    summary.screenshots.push(mobileShot);

    await desktopPage.goto(`${baseUrl}/ops/feedback/index.html`, { waitUntil: "networkidle" });
    await desktopPage.waitForFunction(() => {
      const list = document.getElementById("submissionList");
      return !!list && list.textContent.includes("Arcade feedback smoke");
    }, { timeout: 20_000 });
    summary.checks.push({ name: "ops_list_shows_submission", pass: true });
    await desktopPage.locator(".submission-card", { hasText: submissionSummary }).first().click();
    await desktopPage.waitForFunction((summaryText) => {
      const pane = document.getElementById("detailPane");
      return !!pane
        && pane.textContent.includes("feedback-note.txt")
        && pane.textContent.includes(summaryText);
    }, submissionSummary, { timeout: 20_000 });
    summary.checks.push({ name: "ops_shows_attachment", pass: true });

    await desktopPage.click("#prepareAgentBtn");
    await desktopPage.waitForFunction(() => {
      const output = document.getElementById("agentTaskOutput");
      return !!output && output.value.includes("# Agent Handoff Brief") && output.value.includes("feedback-note.txt");
    });
    summary.checks.push({ name: "ops_prepare_agent_brief", pass: true });
    const opsShot = path.join(OUTPUT_DIR, "ops-feedback-inbox.png");
    await desktopPage.screenshot({ path: opsShot, fullPage: true });
    summary.screenshots.push(opsShot);

    summary.consoleErrors = consoleErrors;
    summary.success = consoleErrors.length === 0;
    if (!summary.success) {
      throw new Error("Console errors were captured during feedback smoke test.");
    }
  } finally {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    await desktopContext.close();
    await mobileContext.close();
    await browser.close();
  }

  console.log(`Feedback smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
