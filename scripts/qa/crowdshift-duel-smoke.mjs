import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outputDir = path.join(process.cwd(), "output", "web-game", "crowdshift-duel-e2e");
const baseUrl = process.argv[2] || "http://127.0.0.1:4173";
const wsParam = encodeURIComponent("ws://127.0.0.1:8081/ws");
async function loadPlaywright() { try { return await import("playwright"); } catch { return import(pathToFileURL(path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills", "develop-web-game", "node_modules", "playwright", "index.mjs")).href); } }
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const stateOf = async (page) => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const opposite = (choice) => choice === "left" ? "right" : "left";

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const summary = { success: false, checks: [], screenshots: [], consoleErrors: [] };
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const contexts = [];
  const makePage = async (viewport, label, options = {}) => {
    const context = await browser.newContext({ viewport, ...options }); contexts.push(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => summary.consoleErrors.push(`${label}: ${error}`));
    page.on("console", (message) => { if (message.type() === "error") summary.consoleErrors.push(`${label}: ${message.text()}`); });
    return page;
  };
  const shot = async (page, name) => { const target = path.join(outputDir, name); await page.screenshot({ path: target, animations: "disabled" }); summary.screenshots.push(target); };
  try {
    const host = await makePage({ width: 1280, height: 720 }, "host");
    await host.goto(`${baseUrl}/crowdshift/?ws=${wsParam}`);
    await host.waitForFunction(() => /^[A-HJ-NP-Z]{4}$/.test(document.getElementById("roomCode")?.textContent || ""));
    const room = await host.locator("#roomCode").textContent();
    const join = async (name) => {
      const page = await makePage({ width: 390, height: 844 }, name, { isMobile: true, hasTouch: true });
      await page.goto(`${baseUrl}/party/?code=${room}&ws=${wsParam}`);
      await page.fill("#playerName", name);
      await page.click("#joinForm button[type=submit]");
      await page.waitForSelector("#crowdController:not([hidden])");
      return page;
    };
    const alpha = await join("Alpha");
    const beta = await join("Beta");
    const display = await makePage({ width: 1280, height: 720 }, "display");
    await display.goto(`${baseUrl}/crowdshift/?display=${room}&ws=${wsParam}`);
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).players.length === 2);
    await shot(host, "duel-lobby.png");
    assert((await host.locator("canvas").screenshot()).length > 0, "Duel lobby canvas was empty");

    await host.click("#startButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "choosing", null, { timeout: 5000 });
    let current = await stateOf(host);
    assert(current.duel && current.rule.startsWith("duel_"), "Two-player room did not enter Duel Shift");
    await shot(host, "duel-choosing.png");

    for (let round = 1; round <= 7; round++) {
      if (round > 1) await host.waitForFunction((wanted) => { const value = JSON.parse(window.render_game_to_text()); return value.phase === "choosing" && value.round === wanted; }, round, { timeout: 6000 });
      current = await stateOf(host);
      if (round === 2) {
        await alpha.waitForFunction(() => { const value = JSON.parse(window.render_game_to_text()).state; return value.phase === "choosing" && value.round === 2; });
        assert(!(await alpha.locator("#duelHotTake").isEnabled()), "Hot Take was reusable after being spent");
        await alpha.setViewportSize({ width: 844, height: 390 }); await shot(alpha, "duel-controller-landscape.png"); await alpha.setViewportSize({ width: 390, height: 844 });
      }
      const sync = current.rule === "duel_sync";
      const alphaChoice = "left";
      const betaChoice = sync ? "left" : "right";
      await alpha.click(alphaChoice === "left" ? "#crowdLeft" : "#crowdRight");
      if (round === 1) await alpha.click("#duelHotTake");
      await alpha.click(betaChoice === "left" ? "#duelPredictLeft" : "#duelPredictRight");
      await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).ready_count === 1);
      const secret = await stateOf(host);
      assert(secret.players.every((player) => !player.choice && !player.prediction && !player.hotTake), "Host saw a secret duel play before reveal");
      if (round === 1) await shot(alpha, "duel-controller-locked.png");

      await beta.click(betaChoice === "left" ? "#crowdLeft" : "#crowdRight");
      const betaPrediction = round === 1 || round % 2 === 0 ? opposite(alphaChoice) : alphaChoice;
      if (round === 1) await beta.click("#duelHotTake");
      await beta.click(betaPrediction === "left" ? "#duelPredictLeft" : "#duelPredictRight");
      try {
        await host.waitForFunction((wanted) => { const value = JSON.parse(window.render_game_to_text()); return value.phase === "reveal" && value.round === wanted; }, round, { timeout: 5000 });
      } catch (error) {
        throw new Error(`Round ${round} did not reveal. Host=${JSON.stringify(await stateOf(host))} Alpha=${JSON.stringify(await stateOf(alpha))} Beta=${JSON.stringify(await stateOf(beta))}`, { cause: error });
      }
      const reveal = await stateOf(host);
      assert(reveal.duel_objective_met, `Round ${round} missed its intended duel objective`);
      assert(reveal.players.filter((player) => player.rank > 0).every((player) => player.prediction), "Reveal omitted a duel prediction");
      if (round === 1) {
        const alphaResult = reveal.players.find((player) => player.name === "Alpha");
        const betaResult = reveal.players.find((player) => player.name === "Beta");
        assert(alphaResult.readCorrect && alphaResult.roundPoints === 2100, `Alpha's Hot Take did not pay out: ${JSON.stringify(alphaResult)}`);
        assert(!betaResult.readCorrect && betaResult.roundPoints === 400 && alphaResult.stealPoints === 400, `Failed Hot Take did not transfer the steal: ${JSON.stringify(betaResult)}`);
        await shot(host, "duel-reveal.png");
        await shot(alpha, "duel-controller-reveal.png");
      }
    }
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "podium", null, { timeout: 6000 });
    const final = await stateOf(host);
    assert(final.players.filter((player) => player.rank > 0).length === 2 && final.players[0].name === "Alpha", "Duel did not produce the expected head-to-head champion");
    await display.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "podium");
    await shot(host, "duel-podium.png");
    summary.checks.push("two_player_duel_mode", "secret_choice_prediction_and_hot_take", "read_streaks_and_hot_take_steal", "seven_round_duel_podium");
    assert(summary.consoleErrors.length === 0, `Browser errors: ${summary.consoleErrors.join(" | ")}`);
    summary.success = true;
    fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(`Crowd Shift Duel smoke passed. Summary: ${path.join(outputDir, "summary.json")}`);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
