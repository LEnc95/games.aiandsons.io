import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outputDir = path.join(process.cwd(), "output", "web-game", "turbotilt-e2e");
const summaryPath = path.join(outputDir, "summary.json");
const baseUrl = process.argv[2] || "http://127.0.0.1:4173";
const wsParam = encodeURIComponent("ws://127.0.0.1:8081/ws");

async function loadPlaywright() {
  try { return await import("playwright"); }
  catch {
    const fallback = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills", "develop-web-game", "node_modules", "playwright", "index.mjs");
    return import(pathToFileURL(fallback).href);
  }
}

function assert(condition, message) { if (!condition) throw new Error(message); }
async function stateOf(page) { return JSON.parse(await page.evaluate(() => window.render_game_to_text())); }

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const summary = { success: false, checks: [], screenshots: [], consoleErrors: [] };
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
  const contexts = [];

  const watch = (page, label) => {
    page.on("pageerror", (error) => summary.consoleErrors.push({ label, type: "pageerror", text: String(error) }));
    page.on("console", (message) => { if (message.type() === "error") summary.consoleErrors.push({ label, type: "console", text: message.text() }); });
  };
  const shot = async (page, name) => {
    const target = path.join(outputDir, name);
    await page.screenshot({ path: target, animations: "disabled" });
    summary.screenshots.push(target);
  };
  const createController = async (name, suffix, motionPermission = "granted") => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    contexts.push(context);
    await context.addInitScript((permission) => {
      class MockOrientation extends Event {
        static async requestPermission() { return permission; }
        constructor(type, init = {}) { super(type); this.gamma = init.gamma || 0; this.beta = init.beta || 0; }
      }
      Object.defineProperty(window, "DeviceOrientationEvent", { configurable: true, value: MockOrientation });
    }, motionPermission);
    const page = await context.newPage();
    watch(page, name);
    await page.goto(`${baseUrl}/party/?code=${roomCode}&ws=${wsParam}`);
    await page.fill("#playerName", name);
    await page.click("#joinForm button[type=submit]");
    await page.waitForSelector("#controllerView:not([hidden])");
    await page.waitForFunction(() => document.getElementById("connectionPill")?.textContent.includes("Connected"));
    summary.checks.push(`controller_${suffix}_joined`);
    return { context, page };
  };
  let roomCode = "";
  try {
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(hostContext);
    const host = await hostContext.newPage();
    watch(host, "host");
    await host.goto(`${baseUrl}/turbotilt/?ws=${wsParam}`);
    await host.waitForFunction(() => /^[A-HJ-NP-Z]{4}$/.test(document.getElementById("roomCode")?.textContent || ""));
    roomCode = await host.locator("#roomCode").textContent();
    const qrPaths = await host.locator("#qrCode svg path").count();
    assert(qrPaths === 1, "Expected a locally rendered QR code");
    summary.checks.push("host_room_and_qr_created");

    const displayContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(displayContext);
    const display = await displayContext.newPage();
    watch(display, "synchronized-display");
    await display.goto(`${baseUrl}/turbotilt/?display=${roomCode}&ws=${wsParam}`);
    await display.waitForFunction(() => JSON.parse(window.render_game_to_text()).screen_role === "display");
    await display.waitForFunction((expected) => JSON.parse(window.render_game_to_text()).room_id === expected, roomCode);
    assert(!(await display.locator("#startButton").isVisible()), "Synchronized display must not expose host actions");
    assert(await display.locator("#soundButton").isVisible(), "Synchronized display should offer local sound opt-in");
    await display.click("#soundButton");
    await display.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio_enabled === true);
    summary.checks.push("read_only_synchronized_display_joined");
    await shot(display, "display-lobby.png");

    const first = await createController("Alpha", "one");
    const second = await createController("Beta", "two");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).players.length === 2);
    assert(await host.locator("#modeSelect option").count() === 6, "Expected all six party modes");
    await host.click("#setupPanel summary");
    await host.selectOption("#modeSelect", "teams");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === "teams");
    await host.click("#quickStartButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === "classic");
    await host.selectOption("#trackSelect", "space");
    await host.selectOption("#chaosSelect", "wild");
    await host.waitForFunction(() => {
      const settings = JSON.parse(window.render_game_to_text()).settings;
      return settings.trackRotation === "space" && settings.chaos === "wild";
    });
    summary.checks.push("host_modes_settings_and_quick_start");

    await first.page.click('[data-gadget="overcharge"]');
    await first.page.click("#garagePanel summary");
    await first.page.selectOption("#carSelect", "rocket");
    await first.page.selectOption("#trailSelect", "rainbow");
    await first.page.selectOption("#hornSelect", "chime");
    await first.page.click('[data-emote="fire"]');
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).players.some((player) => player.name === "Alpha" && player.nextGadget === "overcharge" && player.car === "rocket" && player.trail === "rainbow" && player.emote === "fire"));
    summary.checks.push("gadget_customization_and_emote_selection");
    await shot(host, "host-lobby.png");
    await shot(first.page, "controller-portrait.png");

    await first.page.click("#tiltButton");
    await first.page.evaluate(() => {
      for (let index = 0; index < 12; index++) window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { gamma: 2 }));
      window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { gamma: -18 }));
    });
    await first.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).tilt_enabled === true);
    const tilted = await stateOf(first.page);
    assert(tilted.effective_steer < -0.5, "Expected calibrated tilt to steer left");
    summary.checks.push("tilt_permission_calibration_and_input");

    await host.click("#startButton");
    try {
      await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "racing", null, { timeout: 8000 });
    } catch (error) {
      throw new Error(`Race did not start: ${JSON.stringify(await stateOf(host))}; host error: ${await host.locator("#hostError").textContent()}`, { cause: error });
    }
    await display.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "racing");
    summary.checks.push("display_followed_host_start");

    const late = await createController("Late Racer", "late");
    await late.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.players?.some((player) => player.name === "Late Racer" && player.queued));
    summary.checks.push("late_join_queued");
    await first.page.click("#gadgetButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).players.some((player) => player.name === "Alpha" && player.lastEventType === "overcharge"));
    summary.checks.push("gadget_use_and_overcharge_effect");

    const betaId = (await stateOf(host)).players.find((player) => player.name === "Beta")?.id;
    assert(betaId, "Expected Beta in the race state");
    await host.evaluate((playerId) => window.__turbotiltPreviewEffect("barrier", playerId), betaId);
    await second.page.evaluate(() => window.__turbotiltPreviewFeedback("barrier"));
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).active_feedback.some((event) => event.type === "barrier"));
    summary.checks.push("barrier_feedback_rendering");
    await shot(host, "host-barrier-impact.png");
    await shot(second.page, "controller-barrier-impact.png");

    await host.evaluate((playerId) => window.__turbotiltPreviewEffect("energy", playerId), betaId);
    await second.page.evaluate(() => window.__turbotiltPreviewFeedback("energy"));
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).active_feedback.some((event) => event.type.startsWith("energy")));
    summary.checks.push("energy_pickup_feedback_rendering");
    await shot(host, "host-energy-pickup.png");
    await shot(second.page, "controller-energy-pickup.png");
    await host.click("#pauseButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "paused");
    await host.click("#pauseButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "racing");
    summary.checks.push("host_pause_and_resume");
    await first.page.click("#boostButton");
    await second.page.dispatchEvent("#rightButton", "pointerdown", { pointerId: 7 });
    await new Promise((resolve) => setTimeout(resolve, 180));
    await second.page.dispatchEvent("#rightButton", "pointerup", { pointerId: 7 });
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).total_boosts_used > 0);
    summary.checks.push("boost_and_touch_steering");

    await shot(host, "host-racing.png");
    await shot(display, "display-racing.png");

    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "intermission", null, { timeout: 12000 });
    const voteOption = (await stateOf(host)).vote_options[0];
    await first.page.click(`[data-vote="${voteOption}"]`);
    await host.waitForFunction((option) => Number(JSON.parse(window.render_game_to_text()).vote_counts?.[option] || 0) > 0, voteOption);
    await host.waitForFunction((option) => {
      const view = JSON.parse(window.render_game_to_text());
      return view.heat === 2 && ["countdown", "racing"].includes(view.phase) && view.modifier === option;
    }, voteOption, { timeout: 5000 });
    summary.checks.push("between_heat_modifier_vote_applied");

    await second.page.close();
    const rejoined = await second.context.newPage();
    watch(rejoined, "Beta-rejoined");
    await rejoined.goto(`${baseUrl}/party/?code=${roomCode}&ws=${wsParam}`);
    await rejoined.waitForSelector("#controllerView:not([hidden])", { timeout: 5000 });
    summary.checks.push("player_reconnected_with_token");
    const boostsBeforeReconnectInput = (await stateOf(host)).total_boosts_used;
    await rejoined.click("#boostButton");
    await host.waitForFunction((before) => JSON.parse(window.render_game_to_text()).total_boosts_used > before, boostsBeforeReconnectInput);
    summary.checks.push("reconnected_player_input_accepted");

    await rejoined.setViewportSize({ width: 844, height: 390 });
    await shot(rejoined, "controller-landscape.png");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "podium", null, { timeout: 30000 });
    await display.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "podium", null, { timeout: 5000 });
    const finalState = await stateOf(host);
    assert(finalState.heat === 3, "Expected three completed heats");
    assert(finalState.players.length === 3, "Expected late racer in the final standings");
    assert(finalState.players.every((player) => Number.isFinite(player.points)), "Expected cumulative points for every racer");
    assert(finalState.awards.length === 4 && finalState.replay_frame_count > 0, "Expected awards and bounded photo-finish replay");
    summary.checks.push("three_heats_and_final_podium");
    summary.checks.push("display_followed_all_three_heats");
    await shot(host, "host-photo-finish.png");
    await host.waitForTimeout(3400);
    await shot(host, "host-podium.png");

    await host.click("#startButton");
    await host.waitForFunction(() => ["countdown", "racing"].includes(JSON.parse(window.render_game_to_text()).phase));
    summary.checks.push("rematch_started");
    const denied = await createController("Touch Only", "denied", "denied");
    await denied.page.click("#tiltButton");
    await denied.page.waitForFunction(() => document.getElementById("tiltHelp")?.textContent.includes("left and right buttons"));
    summary.checks.push("motion_denied_touch_fallback");
    await host.click("#endButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "ended");
    summary.checks.push("host_end_game");

    const badContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    contexts.push(badContext);
    const bad = await badContext.newPage();
    watch(bad, "invalid-code");
    await bad.goto(`${baseUrl}/party/?ws=${wsParam}`);
    await bad.fill("#roomCode", "IIII");
    await bad.fill("#playerName", "Tester");
    await bad.click("#joinForm button[type=submit]");
    await bad.waitForFunction(() => document.getElementById("joinError")?.textContent.includes("Enter the four letters"));
    summary.checks.push("invalid_room_error");

    summary.success = summary.consoleErrors.length === 0;
    if (!summary.success) throw new Error(`Browser console errors: ${JSON.stringify(summary.consoleErrors)}`);
  } finally {
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    await browser.close();
  }
  console.log(`Turbo Tilt smoke passed. Summary: ${summaryPath}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
