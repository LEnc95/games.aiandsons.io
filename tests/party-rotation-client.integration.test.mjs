import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("party rotation keeps one room while switching voting and embedded activities", async () => {
  const [html, app, server] = await Promise.all([
    read("party/index.html"),
    read("party/app.js"),
    read("v2-server/party_rotation.go"),
  ]);
  assert.match(html, /id="startPartyLink"/);
  assert.match(html, /id="partyStage"/);
  assert.match(html, /id="activityFrame"/);
  assert.match(html, /id="partyVoteButtons"/);
  assert.match(app, /gameId: "party", gameKey: "party", role: state\.screenRole/);
  assert.match(app, /type: "party_vote", optionId/);
  assert.match(app, /postMessage\(\{ type: "party_snapshot"/);
  assert.match(app, /window\.render_game_to_text/);
  assert.match(server, /party_lobby/);
  assert.match(server, /SelectedBallotID/);
  assert.match(server, /securePartyIndex/);
  assert.match(server, /activityRankingLocked/);
});

test("party rotation exposes the bounded lifecycle and activity catalogs", async () => {
  const server = await read("v2-server/party_rotation.go");
  for (const phase of ["voting", "spinning", "next_up", "activity", "results"]) {
    assert.match(server, new RegExp(`partyPhase = "${phase}"`));
  }
  for (const mode of ["classic", "elimination", "teams", "relay", "survival", "chaos", "majority", "minority", "split", "unanimous", "duel"]) {
    assert.match(server, new RegExp(`ModeKey: "${mode}"|ModeKey:.*"${mode}"`));
  }
});

test("embedded activities start and finalize the existing clip recorder", async () => {
  const [turbo, crowd] = await Promise.all([read("turbotilt/game.js"), read("crowdshift/game.js")]);
  for (const source of [turbo, crowd]) {
    assert.match(source, /finalizeRecording/);
    assert.match(source, /startRecording/);
    assert.match(source, /partyPhase.{0,8}activity/);
    assert.match(source, /syncEmbeddedRecording/);
  }
});

test("party setup exposes persisted duration, style, and accessibility controls", async () => {
  const [html, app, server, turbo, crowd] = await Promise.all([
    read("party/index.html"),
    read("party/app.js"),
    read("v2-server/party_rotation.go"),
    read("turbotilt/game.js"),
    read("crowdshift/game.js"),
  ]);
  for (const id of ["partyDurationSelect", "partyPlayStyleSelect", "partyAccessibilitySelect", "partyExtendedTimers", "partyReducedMotion", "partyHighContrast", "partyEffects", "partyNarration", "partyHaptics", "sessionProgress"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /aiandsons-party-host-settings-v1/);
  assert.match(app, /configure_party/);
  assert.match(app, /partySettings: settings/);
  assert.match(app, /Game \$\{Math\.min\(completedActivities \+ 1, targetActivities\)\} of \$\{targetActivities\}/);
  assert.match(server, /TargetActivities/);
  assert.match(server, /PlayStyle/);
  assert.match(server, /finishPartyLocked/);
  for (const source of [app, turbo, crowd]) {
    assert.match(source, /party-reduced-motion/);
    assert.match(source, /party-high-contrast/);
  }
  assert.match(turbo, /partySettings\?\.narration/);
  assert.match(crowd, /partySettings\?\.effects/);
});

test("party setup supports activity pools, repeat rules, catch-up, and host choice", async () => {
  const [html, app, server] = await Promise.all([read("party/index.html"), read("party/app.js"), read("v2-server/party_rotation.go")]);
  for (const id of ["partySelectionSelect", "partyRepeatSelect", "partyCatchUp", "partyActivityPool", "partyHostChoice"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /enabledActivities/);
  assert.match(app, /choose_activity/);
  assert.match(server, /SelectionMethod/);
  assert.match(server, /RepeatAvoidance/);
  assert.match(server, /CatchUp/);
  assert.match(server, /activityHistory/);
});

test("party lobby explains readiness and preserves reconnect identity", async () => {
  const [html, app, client, server] = await Promise.all([
    read("party/index.html"), read("party/app.js"), read("src/net/multiplayerClient.js"), read("v2-server/party.go"),
  ]);
  for (const id of ["partyLobbyGuide", "partySelectionHelp", "partyReadyButton"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /type: "party_ready"/);
  assert.match(app, /Your name, avatar, and score are saved/);
  assert.match(app, /Welcome back/);
  assert.match(client, /this\.options\.token = payload\.token/);
  assert.match(server, /"reconnected": reconnected/);
  assert.match(server, /state\["readyCount"\]/);
});

test("party hosts can safely resume a recent room on the same device", async () => {
  const [html, app, server] = await Promise.all([
    read("party/index.html"), read("party/app.js"), read("v2-server/party.go"),
  ]);
  for (const id of ["resumePartyCard", "resumePartyRoom", "resumePartyButton", "forgetPartyButton", "hostRecoveryNotice"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /aiandsons-party-recent-host-v1/);
  assert.match(app, /hostRecoveryTtlMs = 15 \* 60 \* 1000/);
  assert.match(app, /rememberHostRecovery\(state\.roomId, state\.hostToken\)/);
  assert.match(html, /Party restored\. Players can keep using the same room code/);
  assert.match(server, /This host session cannot be resumed on this device/);
  assert.match(server, /"reconnected": wasDisconnected/);
});

test("finished parties can restart in the same room with fresh standings", async () => {
  const [html, app, server] = await Promise.all([
    read("party/index.html"), read("party/app.js"), read("v2-server/party_rotation.go"),
  ]);
  for (const id of ["partyAgainButton", "partyEncorePanel"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /sendPartyHost\("play_again"\)/);
  assert.match(app, /Host can start another party/);
  assert.match(server, /case "play_again":/);
  assert.match(server, /func \(r \*partyRoom\) restartPartyLocked/);
  assert.match(server, /p\.PartyPoints = 0/);
  assert.match(server, /p\.Ready = false/);
});

test("hosts and players can share a policy-aware player invite", async () => {
  const [html, app] = await Promise.all([read("party/index.html"), read("party/app.js")]);
  for (const id of ["partyInviteButton", "partyPlayerInviteButton", "partyShareStatus", "partyPlayerShareStatus"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /function playerInviteUrl/);
  assert.match(app, /Join my AI and Sons party/);
  assert.match(app, /navigator\.share/);
  assert.match(app, /Player invite link copied/);
  assert.match(app, /snapshot\?\.roomLocked/);
  assert.match(app, /snapshot\?\.allowLateJoin/);
  assert.match(app, /snapshot\?\.maxPlayers/);
});
