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
const assertNoHorizontalOverflow = async (page, label) => {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, content: document.documentElement.scrollWidth }));
  if (dimensions.content > dimensions.viewport + 1) throw new Error(`${label} overflowed horizontally: ${dimensions.content}px > ${dimensions.viewport}px`);
};
const waitForEmbeddedAvatars = (page) => page.waitForFunction(() => {
  const frame = document.getElementById("activityFrame");
  if (!frame || frame.hidden || typeof frame.contentWindow?.render_game_to_text !== "function") return false;
  try {
    const embeddedState = JSON.parse(frame.contentWindow.render_game_to_text());
    return embeddedState.phase !== "connecting" && embeddedState.players?.length === 2 && embeddedState.players.every((player) => player.avatar);
  } catch {
    return false;
  }
}, null, { timeout: 8000 });

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
    const openJoinPage = async (label) => {
      const page = await makePage({ width: 390, height: 844 }, label);
      await page.goto(`${baseUrl}/party/?code=${room}&ws=${encodeURIComponent(ws)}`);
      return page;
    };
    const submitJoin = async (page, name, avatar) => {
      await page.locator(`.avatar-option:has(input[value="${avatar}"])`).click();
      await page.fill("#playerName", name);
      await page.click("#joinForm button[type=submit]");
    };
    const join = async (name, avatar, { verifyPersistence = false } = {}) => {
      const page = await openJoinPage(name);
      if (await page.locator("#avatarOptions input").count() !== 16) throw new Error("Avatar picker did not expose all 16 choices");
      await page.locator(`.avatar-option:has(input[value="${avatar}"])`).click();
      if (verifyPersistence) {
        await page.screenshot({ path: path.join(outputDir, "avatar-picker-mobile.png"), fullPage: true });
        await page.reload();
        if (!await page.locator(`#avatarOptions input[value="${avatar}"]`).isChecked()) throw new Error("Avatar choice did not persist across reload");
      }
      await page.fill("#playerName", name);
      await page.click("#joinForm button[type=submit]");
      await page.waitForSelector("#partyController:not([hidden])", { timeout: 15000 });
      const joined = await stateOf(page);
      if (joined.player_avatar !== avatar || await page.locator("#playerDot").textContent() !== avatar) throw new Error(`${name} did not retain selected avatar`);
      return page;
    };

    await host.click("#partyLockButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.roomLocked === true);
    const lockedPlayer = await openJoinPage("locked-player");
    await submitJoin(lockedPlayer, "Locked", "🐢");
    await lockedPlayer.waitForFunction(() => /locked/i.test(document.getElementById("joinError")?.textContent || ""));
    await host.click("#partyLockButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.roomLocked === false);

    await host.click("#partyFriendlyNamesButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.friendlyNames === true);
    const friendly = await join("Custom Name", "🐼");
    const friendlyToken = await friendly.evaluate((roomId) => localStorage.getItem(`aiandsons-party-player:${roomId}`), room);
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.players.length === 1);
    const friendlyPlayer = (await stateOf(host)).state.players[0];
    if (!friendlyPlayer || friendlyPlayer.name === "Custom Name") throw new Error("Friendly-name mode did not replace the supplied name");
    await host.getByRole("button", { name: `Remove ${friendlyPlayer.name} from the room` }).click();
    await friendly.waitForSelector("#removedNotice:not([hidden])", { timeout: 8000 });
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.players.length === 0);
    await friendly.evaluate(({ roomId, token }) => localStorage.setItem(`aiandsons-party-player:${roomId}`, token), { roomId: room, token: friendlyToken });
    await friendly.reload();
    await friendly.waitForSelector("#removedNotice:not([hidden])", { timeout: 8000 });
    await assertNoHorizontalOverflow(friendly, "Removed-player phone view");
    await friendly.screenshot({ path: path.join(outputDir, "removed-player-mobile.png"), fullPage: true });
    await host.click("#partyFriendlyNamesButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.friendlyNames === false);

    const alpha = await join("Alpha", "🐸", { verifyPersistence: true });
    const beta = await join("Beta", "🦉");
    const display = await makePage({ width: 1280, height: 720 }, "display");
    await display.goto(`${baseUrl}/party/?display=${room}&ws=${encodeURIComponent(ws)}`);
    await display.waitForFunction(() => JSON.parse(window.render_game_to_text()).view === "display", null, { timeout: 15000 });
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.players.filter((player) => player.connected).length === 2, null, { timeout: 15000 });
    const lobby = await stateOf(host);
    if (lobby.state.players.find((player) => player.name === "Alpha")?.avatar !== "🐸" || lobby.state.players.find((player) => player.name === "Beta")?.avatar !== "🦉") throw new Error("Host snapshot did not preserve distinct player avatars");
    await host.selectOption("#partyMaxPlayersSelect", "2");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.maxPlayers === 2);
    const fullPlayer = await openJoinPage("full-player");
    await submitJoin(fullPlayer, "Gamma", "🦁");
    await fullPlayer.waitForFunction(() => /player limit/i.test(document.getElementById("joinError")?.textContent || ""));
    await host.selectOption("#partyMaxPlayersSelect", "8");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.maxPlayers === 8);
    await assertNoHorizontalOverflow(host, "Host lobby");
    await host.screenshot({ path: path.join(outputDir, "party-lobby.png") });
    await host.click("#partyLateJoinButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.allowLateJoin === false);
    await host.click("#partyStartButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "voting", null, { timeout: 8000 });
    const latePlayer = await openJoinPage("late-player");
    await submitJoin(latePlayer, "Late", "🐙");
    await latePlayer.waitForFunction(() => /late joining/i.test(document.getElementById("joinError")?.textContent || ""));
    await host.click("#partyLateJoinButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.allowLateJoin === true);
    await alpha.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "voting", null, { timeout: 8000 });
    const buttons = alpha.locator("[data-party-vote]");
    await buttons.nth(0).click();
    await beta.locator("[data-party-vote]").nth(1).click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "spinning", null, { timeout: 8000 });
    const spinning = await stateOf(host);
    if (!spinning.state.partyVote.ballots || spinning.state.partyVote.ballots.length !== 2) throw new Error("Wheel did not receive two named ballots");
    if (!spinning.state.partyVote.ballots.every((ballot) => ballot.playerAvatar)) throw new Error("Named ballots omitted player avatars");
    await host.screenshot({ path: path.join(outputDir, "party-wheel.png") });
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "activity", null, { timeout: 8000 });
    const firstActivity = (await stateOf(host)).state.activity;
    if (!firstActivity?.gameKey || !firstActivity?.modeKey) throw new Error("First activity missing game and mode");
    await waitForEmbeddedAvatars(host);
    await host.screenshot({ path: path.join(outputDir, "party-activity-first.png") });
    await host.click("#partySkipButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "voting", null, { timeout: 10000 });
    await alpha.locator("[data-party-vote]").nth(0).click();
    await beta.locator("[data-party-vote]").nth(0).click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "spinning", null, { timeout: 8000 });
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "activity", null, { timeout: 8000 });
    const secondActivity = (await stateOf(host)).state.activity;
    if (secondActivity.id === firstActivity.id) throw new Error("Repeat activity was not excluded");
    await waitForEmbeddedAvatars(host);
    await host.screenshot({ path: path.join(outputDir, "party-activity.png") });
    await host.click("#partyEndButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "ended", null, { timeout: 8000 });
    const ended = await stateOf(host);
    if (!ended.state.players.every((player) => Number.isInteger(player.partyPoints))) throw new Error("Party standings missing");
    await host.screenshot({ path: path.join(outputDir, "party-podium.png") });
    if (errors.length) throw new Error(errors.join(" | "));
    console.log(JSON.stringify({ checks: ["room_lock", "friendly_names", "remove_player", "blocked_reconnect", "player_limit", "late_join_policy", "avatar_picker", "avatar_persistence", "avatar_snapshots", "opening_vote", "named_ballots", "weighted_wheel", "auto_activity", "repeat_exclusion", "cross_activity", "persistent_standings", "party_end"], firstActivity: firstActivity.id, secondActivity: secondActivity.id }));
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
