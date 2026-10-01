import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const baseUrl = process.argv[2] || "https://games.aiandsons.io";
const errors = [];

async function loadPlaywright() {
  try { return await import("playwright"); }
  catch {
    const fallback = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills", "develop-web-game", "node_modules", "playwright", "index.mjs");
    return import(pathToFileURL(fallback).href);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const contexts = [];
  const makePage = async (viewport, label) => {
    const context = await browser.newContext({ viewport });
    contexts.push(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${label}: ${error}`));
    page.on("console", (message) => { if (message.type() === "error") errors.push(`${label}: ${message.text()}`); });
    return page;
  };
  let host;
  try {
    host = await makePage({ width: 1280, height: 720 }, "host");
    await host.goto(`${baseUrl}/turbotilt/`);
    await host.waitForFunction(() => /^[A-HJ-NP-Z]{4}$/.test(document.getElementById("roomCode")?.textContent || ""), null, { timeout: 20000 });
    const room = await host.locator("#roomCode").textContent();
    const join = async (name) => {
      const page = await makePage({ width: 390, height: 844 }, name);
      await page.goto(`${baseUrl}/party/?code=${room}`);
      await page.fill("#playerName", name);
      await page.click("#joinForm button[type=submit]");
      await page.waitForSelector("#controllerView:not([hidden])", { timeout: 15000 });
      return page;
    };
    const first = await join("Live Alpha");
    await join("Live Beta");
    const display = await makePage({ width: 1280, height: 720 }, "display");
    await display.goto(`${baseUrl}/turbotilt/?display=${room}`);
    await display.waitForFunction(() => JSON.parse(window.render_game_to_text()).screen_role === "display", null, { timeout: 15000 });
    assert(!(await display.locator("#startButton").isVisible()), "Remote display exposed host controls");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).players.length === 2, null, { timeout: 15000 });
	await host.click("#setupPanel summary");
	await host.selectOption("#trackSelect", "space");
	await host.selectOption("#chaosSelect", "wild");
	await host.waitForFunction(() => {
	  const settings = JSON.parse(window.render_game_to_text()).settings;
	  return settings.trackRotation === "space" && settings.chaos === "wild";
	}, null, { timeout: 10000 });
	await first.click('[data-gadget="overcharge"]');
	await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).players.some((player) => player.name === "Live Alpha" && player.nextGadget === "overcharge"), null, { timeout: 10000 });
    await host.click("#startButton");
    await display.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "countdown", null, { timeout: 10000 });
    await first.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.phase === "racing", null, { timeout: 10000 });
	await first.click("#gadgetButton");
	await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).players.some((player) => player.name === "Live Alpha" && player.lastEventType === "overcharge"), null, { timeout: 10000 });
    await first.click("#boostButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).total_boosts_used > 0, null, { timeout: 10000 });
    await host.click("#endButton");
    await display.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "ended", null, { timeout: 10000 });
    assert(errors.length === 0, `Browser errors: ${errors.join(" | ")}`);
	console.log(`Turbo Tilt production smoke passed for room ${room}: host, two phones, synchronized display, Space/Wild settings, overcharge gadget, boost, and host end.`);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
