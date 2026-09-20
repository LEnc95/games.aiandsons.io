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
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value) => { window.__partyCopiedText = String(value); } } });
    });
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
    await host.waitForFunction(() => typeof window.__partyAudioDebug === "function");
    await host.click("#partySoundButton");
    await host.waitForFunction(() => window.__partyAudioDebug().activated === true);
    const audioState = await host.evaluate(() => window.__partyAudioDebug());
    if (!audioState.enabled || !audioState.activated || audioState.lastCue !== "enabled") throw new Error("Party audio did not unlock from the sound control");
    await host.click("#partyInviteButton");
    await host.waitForFunction(() => /copied/i.test(document.getElementById("partyShareStatus")?.textContent || ""));
    const hostInvite = new URL(await host.evaluate(() => window.__partyCopiedText));
    if (hostInvite.searchParams.get("code") !== room || hostInvite.searchParams.get("ws") !== ws) throw new Error(`Host player invite was incorrect: ${hostInvite}`);
    await host.selectOption("#partyDurationSelect", "quick");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.partySettings?.targetActivities === 3);
    await host.selectOption("#partyAccessibilitySelect", "relaxed");
    await host.waitForFunction(() => {
      const settings = JSON.parse(window.render_game_to_text()).state?.partySettings;
      return settings?.accessibilityPreset === "relaxed" && settings.extendedTimers === true && settings.reducedMotion === true;
    });
    const savedSettings = await host.evaluate(() => JSON.parse(localStorage.getItem("aiandsons-party-host-settings-v1")));
    if (savedSettings?.durationPreset !== "quick" || savedSettings?.accessibilityPreset !== "relaxed") throw new Error("Host party settings did not persist locally");
    if (!await host.locator("body").evaluate((body) => body.classList.contains("party-reduced-motion"))) throw new Error("Reduced-motion presentation was not applied");
    await host.locator("#partyActivitySettings summary").click();
    await host.locator("#partyActivityPool input[data-activity-id]").evaluateAll((inputs) => {
      inputs.forEach((input) => { input.checked = ["turbotilt:classic", "turbotilt:survival"].includes(input.dataset.activityId); });
      inputs[0]?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.partySettings?.enabledActivities?.length === 2);
    await host.locator("#partyActivitySettings summary").click();
    await host.selectOption("#partySelectionSelect", "majority");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.partySettings?.selectionMethod === "majority");
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
    if (!await host.locator("#partyInviteButton").isDisabled() || !/locked/i.test(await host.locator("#partyInviteButton").textContent())) throw new Error("Locked room did not close host invitations");
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
    await alpha.click("#partyPlayerInviteButton");
    await alpha.waitForFunction(() => /copied/i.test(document.getElementById("partyPlayerShareStatus")?.textContent || ""));
    const playerInvite = new URL(await alpha.evaluate(() => window.__partyCopiedText));
    if (playerInvite.searchParams.get("code") !== room || playerInvite.searchParams.get("ws") !== ws) throw new Error(`Player invite was incorrect: ${playerInvite}`);
    await alpha.screenshot({ path: path.join(outputDir, "player-invite-mobile.png"), fullPage: true });
    const beta = await join("Beta", "🦉");
    await alpha.click("#partyReadyButton");
    await beta.click("#partyReadyButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.readyCount === 2);
    const alphaBeforeReconnect = await stateOf(alpha);
    if (!await alpha.evaluate(() => window.__partyTestDropConnection())) throw new Error("Could not trigger player reconnect test");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.players?.some((player) => player.name === "Alpha" && !player.connected), null, { timeout: 8000 });
    await alpha.waitForFunction(() => /Welcome back/.test(document.getElementById("partyMessage")?.textContent || ""), null, { timeout: 12000 });
    await alpha.waitForFunction((playerId) => {
      const state = JSON.parse(window.render_game_to_text());
      return state.player_id === playerId && state.state?.players?.find((player) => player.id === playerId)?.connected;
    }, alphaBeforeReconnect.player_id, { timeout: 12000 });
    const alphaAfterReconnect = await stateOf(alpha);
    if (alphaAfterReconnect.state.players.length !== 2 || !alphaAfterReconnect.state.players.find((player) => player.id === alphaBeforeReconnect.player_id)?.ready) throw new Error(`Reconnect did not preserve identity and ready state: ${JSON.stringify(alphaAfterReconnect.state.players)}`);
    await alpha.screenshot({ path: path.join(outputDir, "rejoined-player-mobile.png"), fullPage: true });
    const unauthorizedHost = await makePage({ width: 900, height: 700 }, "unauthorized-host");
    await unauthorizedHost.goto(`${baseUrl}/party/?ws=${encodeURIComponent(ws)}`);
    await unauthorizedHost.evaluate((roomId) => localStorage.setItem("aiandsons-party-recent-host-v1", JSON.stringify({ roomId, token: "invalid-token", savedAt: Date.now() })), room);
    await unauthorizedHost.goto(`${baseUrl}/party/?host=1&room=${room}&ws=${encodeURIComponent(ws)}`);
    await unauthorizedHost.waitForFunction(() => /cannot be resumed/i.test(document.getElementById("sessionError")?.textContent || ""), null, { timeout: 8000 });
    if ((await stateOf(unauthorizedHost)).state) throw new Error("Host with an invalid recovery token received party state");
    if (await unauthorizedHost.evaluate(() => localStorage.getItem("aiandsons-party-recent-host-v1")) !== null) throw new Error("Rejected host recovery record was not cleared");
    const recovery = await host.evaluate(() => JSON.parse(localStorage.getItem("aiandsons-party-recent-host-v1")));
    if (recovery?.roomId !== room || !recovery.token) throw new Error("Host recovery was not saved on the device");
    await host.goto(`${baseUrl}/party/?ws=${encodeURIComponent(ws)}`);
    await host.waitForSelector("#resumePartyCard:not([hidden])");
    if (await host.locator("#resumePartyRoom").textContent() !== room) throw new Error("Recent-party card showed the wrong room");
    await host.click("#forgetPartyButton");
    if (!await host.locator("#resumePartyCard").isHidden() || await host.evaluate(() => localStorage.getItem("aiandsons-party-recent-host-v1")) !== null) throw new Error("Forget recent party did not clear the recovery record");
    await host.evaluate((saved) => localStorage.setItem("aiandsons-party-recent-host-v1", JSON.stringify(saved)), recovery);
    await host.reload();
    await host.waitForSelector("#resumePartyCard:not([hidden])");
    await host.evaluate(() => sessionStorage.clear());
    await assertNoHorizontalOverflow(host, "Recent-party landing view");
    await host.screenshot({ path: path.join(outputDir, "resume-party-host.png"), fullPage: true });
    await host.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(host, "Recent-party mobile landing view");
    await host.screenshot({ path: path.join(outputDir, "resume-party-mobile.png"), fullPage: true });
    await host.setViewportSize({ width: 1280, height: 720 });
    await host.click("#resumePartyButton");
    await host.waitForFunction((roomId) => typeof window.render_game_to_text === "function" && JSON.parse(window.render_game_to_text()).room_id === roomId && JSON.parse(window.render_game_to_text()).state?.players?.length === 2, room, { timeout: 12000 });
    await host.waitForSelector("#hostRecoveryNotice:not([hidden])", { timeout: 4000 });
    await host.screenshot({ path: path.join(outputDir, "restored-party-host.png"), fullPage: true });
    const display = await makePage({ width: 1280, height: 720 }, "display");
    await display.goto(`${baseUrl}/party/?display=${room}&ws=${encodeURIComponent(ws)}`);
    await display.waitForFunction(() => JSON.parse(window.render_game_to_text()).view === "display", null, { timeout: 15000 });
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.players.filter((player) => player.connected).length === 2, null, { timeout: 15000 });
    const lobby = await stateOf(host);
    if (lobby.state.players.find((player) => player.name === "Alpha")?.avatar !== "🐸" || lobby.state.players.find((player) => player.name === "Beta")?.avatar !== "🦉") throw new Error("Host snapshot did not preserve distinct player avatars");
    await host.selectOption("#partyMaxPlayersSelect", "2");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.maxPlayers === 2);
    if (!await host.locator("#partyInviteButton").isDisabled() || !/full/i.test(await host.locator("#partyInviteButton").textContent())) throw new Error("Full room did not close host invitations");
    const fullPlayer = await openJoinPage("full-player");
    await submitJoin(fullPlayer, "Gamma", "🦁");
    await fullPlayer.waitForFunction(() => /player limit/i.test(document.getElementById("joinError")?.textContent || ""));
    const audience = await openJoinPage("audience");
    await audience.locator(`.avatar-option:has(input[value="🐼"])`).click();
    await audience.fill("#playerName", "Crowd");
    await audience.click("#audienceJoinButton");
    await audience.waitForSelector("#partyController:not([hidden])", { timeout: 15000 });
    const audienceState = await stateOf(audience);
    if (audienceState.participant_role !== "audience" || audienceState.player_avatar !== "🐼" || !audienceState.audience_id) throw new Error("Audience join did not preserve the audience identity");
    await audience.click('[data-audience-reaction="clap"]');
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.audienceCount === 1);
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.audienceReactions?.clap === 1);
    await audience.screenshot({ path: path.join(outputDir, "audience-mobile.png"), fullPage: true });
    await host.selectOption("#partyMaxPlayersSelect", "8");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.maxPlayers === 8);
    await assertNoHorizontalOverflow(host, "Host lobby");
    await host.screenshot({ path: path.join(outputDir, "party-lobby.png") });
    await host.click("#partyLateJoinButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.allowLateJoin === false);
    await host.click("#partyStartButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "voting", null, { timeout: 8000 });
    if (!await host.locator("#partyInviteButton").isDisabled() || !/late joining/i.test(await host.locator("#partyInviteButton").textContent())) throw new Error("Late-join policy did not close host invitations during play");
    const latePlayer = await openJoinPage("late-player");
    await submitJoin(latePlayer, "Late", "🐙");
    await latePlayer.waitForFunction(() => /late joining/i.test(document.getElementById("joinError")?.textContent || ""));
    await host.click("#partyLateJoinButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.allowLateJoin === true);
    await alpha.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "voting", null, { timeout: 8000 });
    const buttons = alpha.locator("[data-party-vote]");
    await buttons.nth(0).click();
    await beta.locator("[data-party-vote]").nth(0).click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "spinning", null, { timeout: 8000 });
    const spinning = await stateOf(host);
    if (!spinning.state.partyVote.ballots || spinning.state.partyVote.ballots.length !== 2) throw new Error("Wheel did not receive two named ballots");
    if (!spinning.state.partyVote.ballots.every((ballot) => ballot.playerAvatar)) throw new Error("Named ballots omitted player avatars");
    if (spinning.state.partyVote.winnerOptionId !== spinning.state.partyVote.ballots[0].optionId && spinning.state.partyVote.ballots[0].optionId === spinning.state.partyVote.ballots[1].optionId) throw new Error("Majority selection did not honor matching ballots");
    await host.screenshot({ path: path.join(outputDir, "party-wheel.png") });
    try {
      await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "activity", null, { timeout: 18000 });
    } catch {
      throw new Error(`Opening activity did not start after host recovery: ${JSON.stringify((await stateOf(host)).state)}`);
    }
    const firstActivity = (await stateOf(host)).state.activity;
    if (!firstActivity?.gameKey || !firstActivity?.modeKey) throw new Error("First activity missing game and mode");
    await waitForEmbeddedAvatars(host);
    const embeddedReducedMotion = await host.locator("#activityFrame").evaluate((frame) => frame.contentDocument.body.classList.contains("party-reduced-motion"));
    if (!embeddedReducedMotion) throw new Error("Embedded activity did not receive reduced-motion party settings");
    await host.screenshot({ path: path.join(outputDir, "party-activity-first.png") });
    await host.click("#partySkipButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "voting", null, { timeout: 10000 });
    await alpha.locator("[data-party-vote]").nth(0).click();
    await beta.locator("[data-party-vote]").nth(0).click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "spinning", null, { timeout: 8000 });
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "activity", null, { timeout: 18000 });
    const secondActivity = (await stateOf(host)).state.activity;
    if (secondActivity.id === firstActivity.id) throw new Error("Repeat activity was not excluded");
    await waitForEmbeddedAvatars(host);
    await host.screenshot({ path: path.join(outputDir, "party-activity.png") });
    await host.click("#partyEndButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.partyPhase === "ended", null, { timeout: 8000 });
    const ended = await stateOf(host);
    if (!ended.state.players.every((player) => Number.isInteger(player.partyPoints))) throw new Error("Party standings missing");
    await host.screenshot({ path: path.join(outputDir, "party-podium.png") });
    await alpha.waitForSelector("#partyEncorePanel:not([hidden])", { timeout: 8000 });
    await alpha.screenshot({ path: path.join(outputDir, "party-encore-mobile.png"), fullPage: true });
    await host.click("#partyAgainButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.partyPhase === "party_lobby", null, { timeout: 8000 });
    const restarted = await stateOf(host);
    if (restarted.room_id !== room || restarted.state.activityIndex !== 0) throw new Error("Play again did not keep the room and reset activity progress");
    if (!restarted.state.players.every((player) => player.partyPoints === 0 && player.activityWins === 0 && player.ready === false)) throw new Error("Play again did not reset standings and readiness");
    if (restarted.state.partySettings.durationPreset !== "quick" || restarted.state.partySettings.accessibilityPreset !== "relaxed" || restarted.state.partySettings.enabledActivities?.length !== 2) throw new Error("Play again did not preserve party settings");
    await alpha.waitForSelector("#partyLobbyGuide:not([hidden])", { timeout: 8000 });
    if (!await alpha.locator("#partyEncorePanel").isHidden()) throw new Error("Encore prompt remained visible in the new lobby");
    await alpha.click("#partyReadyButton");
    await beta.click("#partyReadyButton");
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.readyCount === 2);
    await host.screenshot({ path: path.join(outputDir, "party-play-again-lobby.png") });

    const choiceHost = await makePage({ width: 1280, height: 720 }, "host-choice");
    await choiceHost.goto(`${baseUrl}/party/?host=1&ws=${encodeURIComponent(ws)}`);
    await choiceHost.waitForFunction(() => /^[A-HJ-NP-Z]{4}$/.test(document.getElementById("sessionRoom")?.textContent || ""), null, { timeout: 15000 });
    const choiceRoom = await choiceHost.locator("#sessionRoom").textContent();
    await choiceHost.selectOption("#partySelectionSelect", "host");
    await choiceHost.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.partySettings?.selectionMethod === "host");
    const choicePlayers = [];
    for (const [name, avatar] of [["Chooser One", "🦊"], ["Chooser Two", "🐼"]]) {
      const page = await makePage({ width: 390, height: 844 }, name);
      choicePlayers.push(page);
      await page.goto(`${baseUrl}/party/?code=${choiceRoom}&ws=${encodeURIComponent(ws)}`);
      await submitJoin(page, name, avatar);
      await page.waitForSelector("#partyController:not([hidden])", { timeout: 15000 });
    }
    await choiceHost.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.players?.length === 2);
    await choiceHost.click("#partyStartButton");
    await choiceHost.waitForSelector("#partyHostChoice:not([hidden])", { timeout: 8000 });
    await choiceHost.screenshot({ path: path.join(outputDir, "party-host-choice.png") });
    const chosenActivity = await choiceHost.locator("#partyHostChoiceButtons button").first().textContent();
    await choiceHost.locator("#partyHostChoiceButtons button").first().click();
    await choiceHost.waitForFunction(() => JSON.parse(window.render_game_to_text()).state?.partyPhase === "spinning", null, { timeout: 8000 });
    if ((await stateOf(choiceHost)).state.activity.label !== chosenActivity) throw new Error("Host choice did not select the requested activity");
    if (errors.length) throw new Error(errors.join(" | "));
    console.log(JSON.stringify({ checks: ["party_audio", "party_settings", "settings_persistence", "activity_pool", "majority_selection", "host_choice", "ready_check", "automatic_rejoin", "rejoin_identity", "host_takeover_blocked", "host_recovery", "host_recovery_identity", "host_recovery_forget", "accessibility_propagation", "room_lock", "friendly_names", "remove_player", "blocked_reconnect", "player_limit", "audience_participation", "late_join_policy", "host_player_invite", "phone_player_invite", "invite_policy_states", "avatar_picker", "avatar_persistence", "avatar_snapshots", "opening_vote", "named_ballots", "weighted_wheel", "auto_activity", "repeat_exclusion", "cross_activity", "persistent_standings", "party_end", "play_again", "same_room_restart", "score_reset", "settings_preserved"], firstActivity: firstActivity.id, secondActivity: secondActivity.id }));
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
