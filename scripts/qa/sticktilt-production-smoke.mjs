import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const base = process.argv[2] || "https://games.aiandsons.io";
const output = "output/web-game/sticktilt-production";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const contexts = [], errors = [];
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function makePage(phone = false) {
  const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 960 }, hasTouch: phone, isMobile: phone });
  contexts.push(context);
  const page = await context.newPage();
  page.on("dialog", dialog => dialog.accept());
  page.on("pageerror", error => errors.push(String(error)));
  return page;
}
let host;
try {
  host = await makePage();
  await host.goto(`${base}/party/?host=1`);
  await host.waitForFunction(() => /^[A-HJ-NP-Z]{4}$/.test(document.getElementById("sessionRoom")?.textContent || ""), null, { timeout: 30000 });
  const room = await host.locator("#sessionRoom").textContent();
  await host.waitForFunction(() => Boolean(JSON.parse(window.render_game_to_text()).state?.activityCatalog?.length));
  const initial = (await read(host)).state;
  assert.ok(initial.activityCatalog.some(activity => activity.id === "sticktilt:rumble"), "Live server must advertise Stick & Tilt");
  assert.ok(initial.partySettings.enabledActivities.includes("sticktilt:rumble"), "New parties must enable Stick & Tilt by default");
  const phones = [];
  for (const name of ["Tilt QA One", "Tilt QA Two"]) {
    const phone = await makePage(true);
    await phone.goto(`${base}/party/?code=${room}`);
    await phone.fill("#playerName", name);
    await phone.click("#joinForm button[type=submit]");
    await phone.waitForSelector("#partyController:not([hidden])");
    phones.push(phone);
  }
  const display = await makePage();
  await display.goto(`${base}/party/?display=${room}`);
  await host.selectOption("#partySelectionSelect", "host");
  await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.partySettings?.selectionMethod === "host");
  await host.locator("#partyActivitySettings summary").click();
  const activity = host.locator('#partyActivityPool input[data-activity-id="sticktilt:rumble"]');
  assert.ok(await activity.isChecked());
  await host.locator("#partyActivityPool input").evaluateAll(inputs => {
    inputs.forEach(input => { input.checked = ["sticktilt:rumble", "crowdshift:duel"].includes(input.dataset.activityId); });
    inputs[0].dispatchEvent(new Event("change", { bubbles: true }));
  });
  await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.partySettings?.enabledActivities?.length === 2);
  await host.screenshot({ path: `${output}/activity-pool.png`, fullPage: true });
  await host.locator("#partyActivitySettings summary").click();
  await host.click("#partyStartButton");
  await host.getByRole("button", { name: /Stick & Tilt · Rumble/ }).click();
  await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.phase === "fighting", null, { timeout: 30000 });
  for (const phone of phones) await phone.waitForSelector("#stickController:not([hidden])");
  await display.waitForFunction(() => document.getElementById("activityFrame")?.contentWindow?.render_game_to_text?.().includes('"fighting"'), null, { timeout: 15000 });
  const playerID = (await read(phones[0])).player_id;
  const x = (await read(host)).state.players.find(player => player.id === playerID).fighter.x;
  const arrow = phones[0].locator(x > 600 ? "#stickLeft" : "#stickRight");
  await arrow.scrollIntoViewIfNeeded();
  const bounds = await arrow.boundingBox();
  await phones[0].mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await phones[0].mouse.down();
  await host.waitForFunction(({ playerID, x }) => Math.abs(JSON.parse(window.render_game_to_text()).state.players.find(p => p.id === playerID).fighter.x - x) > 30, { playerID, x });
  await phones[0].mouse.up();
  await phones[0].click("#stickJump");
  await host.waitForFunction(id => JSON.parse(window.render_game_to_text()).state.players.find(p => p.id === id).fighter.y > 10, playerID);
  await host.screenshot({ path: `${output}/party-fighting.png`, fullPage: true });
  await phones[0].screenshot({ path: `${output}/phone.png`, fullPage: true });
  await host.click("#partyPauseButton");
  await display.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.phase === "paused");
  await host.click("#partyPauseButton");
  await host.click("#partyEndButton");
  await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.partyPhase === "ended");
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/summary.json`, JSON.stringify({ success: true, base, room, checks: ["live catalog", "enabled by default", "activity pool", "host selection", "two phone controllers", "embedded arena", "synchronized display", "touch movement", "jump", "pause/resume", "end"], errors }, null, 2));
  console.log("Live Stick & Tilt Party smoke passed.");
} finally {
  if (host && !host.isClosed()) {
    try { if (await host.locator("#partyEndButton").isVisible()) await host.locator("#partyEndButton").click(); } catch {}
  }
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
