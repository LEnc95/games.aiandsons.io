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
