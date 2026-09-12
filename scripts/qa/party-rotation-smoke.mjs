import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const baseUrl = process.argv[2] || "http://127.0.0.1:4173";
const ws = process.argv[3] || "ws://127.0.0.1:8081/ws";
const outputDir = path.join(process.cwd(), "output", "web-game", "party-rotation-e2e");

async function loadPlaywright() {
  try { return await import("playwright"); } catch {
    return import(pathToFileURL(path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills", "develop-web-game", "node_modules", "playwright", "index.mjs")).href);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stateOf = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()));

async function main() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const contexts = [];
  const errors = [];
  const makePage = async (viewport, label) => {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
    contexts.push(context);
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.accept());
    page.on("pageerror", (error) => errors.push(`${label}: ${error}`));
    page.on("console", (message) => { if (message.type() === "error") errors.push(`${label}: ${message.text()}`); });
    return page;
  };
  try {
    await fsMkdir(outputDir);
    const host = await makePage({ width: 1280, height: 720 }, "host");
    await host.goto(`${baseUrl}/party/?host=1&ws=${encodeURIComponent(ws)}`);
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).view === "host", null, { timeout: 15000 });
    await host.waitForFunction(() => /^[A-HJ-NP-Z]{4}$/.test(document.getElementById("sessionRoom")?.textContent || ""), null, { timeout: 15000 });
    const room = await host.locator("#sessionRoom").textContent();
    const join = async (name) => {
      const page = await makePage({ width: 390, height: 844 }, name);
      await page.goto(`${baseUrl}/party/?code=${room}&ws=${encodeURIComponent(ws)}`);
      await page.fill("#playerName", name);
      await page.click("#joinForm button[type=submit]");
      await page.waitForSelector("#partyController:not([hidden])", { timeout: 15000 });
      return page;
    };
    const alpha = await join("Alpha");
    const beta = await join("Beta");
    const display = await makePage({ width: 1280, height: 720 }, "display");
    await display.goto(`${baseUrl}/party/?display=${room}&ws=${encodeURIComponent(ws)}`);
    await display.waitForFunction(() => JSON.parse(window.render_game_to_text()).view === "display", null, { timeout: 15000 });
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.players.filter((player) => player.connected).length === 2, null, { timeout: 15000 });
    await host.screenshot({ path: path.join(outputDir, "party-lobby.png") });
    await host.click("#partyStartButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "voting", null, { timeout: 8000 });
    await alpha.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "voting", null, { timeout: 8000 });
    const buttons = alpha.locator("[data-party-vote]");
    await buttons.nth(0).click();
    await beta.locator("[data-party-vote]").nth(1).click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "spinning", null, { timeout: 8000 });
    const spinning = await stateOf(host);
    if (!spinning.state.partyVote.ballots || spinning.state.partyVote.ballots.length !== 2) throw new Error("Wheel did not receive two named ballots");
    await host.screenshot({ path: path.join(outputDir, "party-wheel.png") });
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "activity", null, { timeout: 8000 });
    const firstActivity = (await stateOf(host)).state.activity;
    if (!firstActivity?.gameKey || !firstActivity?.modeKey) throw new Error("First activity missing game and mode");
    await host.click("#partySkipButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "voting", null, { timeout: 10000 });
    await alpha.locator("[data-party-vote]").nth(0).click();
    await beta.locator("[data-party-vote]").nth(0).click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "spinning", null, { timeout: 8000 });
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "activity", null, { timeout: 8000 });
    const secondActivity = (await stateOf(host)).state.activity;
    if (secondActivity.id === firstActivity.id) throw new Error("Repeat activity was not excluded");
    await host.screenshot({ path: path.join(outputDir, "party-activity.png") });
    await host.click("#partyEndButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "ended", null, { timeout: 8000 });
    const ended = await stateOf(host);
    if (!ended.state.players.every((player) => Number.isInteger(player.partyPoints))) throw new Error("Party standings missing");
    await host.screenshot({ path: path.join(outputDir, "party-podium.png") });
    if (errors.length) throw new Error(errors.join(" | "));
    console.log(JSON.stringify({ checks: ["opening_vote", "named_ballots", "weighted_wheel", "auto_activity", "repeat_exclusion", "cross_activity", "persistent_standings", "party_end"], firstActivity: firstActivity.id, secondActivity: secondActivity.id }));
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    await browser.close();
  }
}

async function fsMkdir(directory) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(directory, { recursive: true });
}

main().catch((error) => { console.error(error); process.exit(1); });
