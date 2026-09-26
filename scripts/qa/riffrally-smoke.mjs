import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const output = path.join(root, "output", "web-game", "riffrally-e2e");
const base = process.argv[2] || "http://127.0.0.1:4173";
const ws = encodeURIComponent("ws://127.0.0.1:18081/ws");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function loadPlaywright() {
  try { return await import("playwright"); }
  catch {
    const fallback = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills", "develop-web-game", "node_modules", "playwright", "index.mjs");
    return import(pathToFileURL(fallback).href);
  }
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const contexts = [], errors = [], shots = [];
  const makePage = async (viewport, label, options = {}) => {
    const context = await browser.newContext({ viewport, ...options });
    contexts.push(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${label}: ${error}`));
    page.on("console", (message) => { if (message.type() === "error") errors.push(`${label}: ${message.text()}`); });
    return page;
  };
  const shot = async (page, name) => {
    const file = path.join(output, name);
    await page.screenshot({ path: file });
    shots.push(file);
  };
  try {
    const host = await makePage({ width: 1280, height: 800 }, "host");
    await host.goto(`${base}/riffrally/?ws=${ws}`);
    await host.waitForFunction(() => /^[A-HJ-NP-Z]{4}$/.test(document.querySelector("#code")?.textContent || ""));
    const room = await host.locator("#code").textContent();
    const display = await makePage({ width: 1280, height: 800 }, "display");
    await display.goto(`${base}/riffrally/?display=${room}&ws=${ws}`);
    await display.waitForFunction(() => window.__riffrallySnapshot()?.roomId === document.querySelector("#code")?.textContent);
    assert(await display.locator("#start").isHidden(), "Read-only display exposed the host start control");
    assert(await display.locator("#cadeFeedbackOpenBtn, #cadeClipControl").count() === 0, "Read-only display mounted host feedback or clip controls");

    await host.waitForSelector("#cadeFeedbackOpenBtn");
    assert(await host.locator("#gameTools > #cadeFeedbackRoot").count() === 1, "Feedback control was not placed in the host sidebar");
    assert(await host.locator("#cadeFeedbackOpenBtn").evaluate((button) => getComputedStyle(button).position === "static"), "Feedback control still floats over the join code");
    assert(await host.evaluate(() => {
      const code = document.querySelector("#code").getBoundingClientRect();
      const title = document.querySelector("h1").getBoundingClientRect();
      const controls = [...document.querySelectorAll("#cadeFeedbackOpenBtn, #cadeClipControl")].map((element) => element.getBoundingClientRect());
      const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return controls.every((control) => !overlap(control, code) && !overlap(control, title));
    }), "Host controls obscure the title or join code");
    await host.click("#cadeFeedbackOpenBtn");
    assert(await host.locator("#cadeFeedbackBackdrop").evaluate((backdrop) => backdrop.classList.contains("active")), "Feedback dialog did not open");
    await host.click("#cadeFeedbackCancelBtn");

    const join = async (name) => {
      const phone = await makePage({ width: 390, height: 844 }, name, { isMobile: true, hasTouch: true });
      await phone.goto(`${base}/party/?code=${room}&ws=${ws}`);
      await phone.fill("#playerName", name);
      await phone.click('#joinForm button[type="submit"]');
      await phone.waitForSelector("#riffController:not([hidden])");
      return phone;
    };
    const first = await join("Riff One"), second = await join("Riff Two");
    await host.waitForFunction(() => window.__riffrallySnapshot()?.players?.filter((player) => player.connected).length === 2);
    await shot(host, "host-lobby.png");
    await shot(first, "phone-lobby.png");
    await host.click("#start");
    await host.waitForFunction(() => window.__riffrallySnapshot()?.phase === "racing", null, { timeout: 5000 });
    const notes = await host.evaluate(() => window.__riffrallySnapshot().notes);
    assert(notes.length === 60, "The chart did not contain 60 notes");
    const schedule = (items) => items.forEach((note) => {
      setTimeout(() => document.querySelectorAll(".riff-lane")[note.lane]?.click(), Math.max(0, note.at - Date.now() + 15));
    });
    await first.evaluate(schedule, notes);
    await second.evaluate(schedule, notes.filter((note) => note.id % 2 === 0));

    await host.waitForFunction(() => window.__riffrallySnapshot()?.players?.some((player) => player.hits >= 7), null, { timeout: 7000 });
    await first.waitForFunction(() => {
      const result = JSON.parse(window.render_game_to_text()).state?.selfResult;
      const feedback = document.querySelector("#riffFeedback")?.textContent || "";
      return result?.lastAward > 0 && result.lastAward === result.lastBase + result.lastBonus && feedback.includes(`+${result.lastAward} (${result.lastBase} timing + ${result.lastBonus} streak)`);
    });
    assert(await host.locator("#scores").evaluate((list) => getComputedStyle(list).listStyleType === "none"), "TV leaderboard still duplicates rank markers");
    await shot(host, "host-live.png");
    await shot(display, "display-live.png");
    await shot(first, "phone-live.png");
    await host.waitForFunction(() => window.__riffrallySnapshot()?.phase === "podium", null, { timeout: 38000 });
    await display.waitForFunction(() => window.__riffrallySnapshot()?.phase === "podium");
    await first.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.phase === "podium");
    const final = await host.evaluate(() => window.__riffrallySnapshot());
    const displayFinal = await display.evaluate(() => window.__riffrallySnapshot());
    assert(final.players[0].hits >= 45, `First phone registered only ${final.players[0].hits} hits`);
    assert(final.players[0].score > final.players[1].score, "The player who hit more notes did not lead");
    assert(displayFinal.players[0].score === final.players[0].score, "Display score diverged from the host");
    assert((await first.locator("#riffFeedback").textContent()).includes("perfect ·"), "Phone did not summarize the final result");
    assert((await first.locator("#riffPoints").textContent()).replaceAll(",", "") === String(final.players[0].score), "Phone total diverged from leaderboard");
    await shot(host, "host-results.png");
    await shot(first, "phone-results.png");

    await host.click("#start");
    await host.waitForFunction(() => window.__riffrallySnapshot()?.phase === "countdown");
    assert((await host.evaluate(() => window.__riffrallySnapshot())).players.every((player) => player.score === 0), "Rematch retained prior scores");
    await host.click("#end");
    assert(errors.length === 0, `Browser errors: ${errors.join(" | ")}`);
    fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify({ success: true, room, scores: final.players.map(({ id, score, hits, misses }) => ({ id, score, hits, misses })), shots, errors }, null, 2));
    console.log(`Riff Rally smoke passed. Summary: ${path.join(output, "summary.json")}`);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
