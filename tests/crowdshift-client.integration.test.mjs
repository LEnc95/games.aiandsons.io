import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Crowd Shift is registered as an accountless multiplayer party game", async () => {
  const [games, contracts] = await Promise.all([read("src/meta/games.js"), read("src/meta/content-contracts.js")]);
  assert.match(games, /slug:'crowdshift'[\s\S]*earnsCoins:false/);
  assert.match(games, /MULTIPLAYER_SLUGS[\s\S]*'crowdshift'/);
  assert.match(contracts, /crowdshift:[\s\S]*releasedAt: '2026-09-10'[\s\S]*unanimous/);
});

test("party hub offers persistent party rotation, watching, group choices, and Duel Shift controls", async () => {
  const [html, app] = await Promise.all([read("party/index.html"), read("party/app.js")]);
  assert.match(html, /href="\/crowdshift\/"/);
  assert.match(html, /id="startPartyLink"[\s\S]*href="\/party\/\?host=1"/);
  assert.doesNotMatch(html, /id="watchGame"/);
  assert.match(html, /id="partyStage"[\s\S]*id="activityFrame"/);
  assert.match(html, /id="partyVoteButtons"/);
  assert.match(html, /id="crowdLeft"[\s\S]*id="crowdRight"/);
  assert.match(html, /id="duelPredictLeft"[\s\S]*id="duelHotTake"/);
  assert.match(app, /sendInput\(\{ type: "choice", choice \}\)/);
  assert.match(app, /sendInput\(\{ type: "predict", choice: prediction \}\)/);
  assert.match(app, /sendInput\(\{ type: "hot_take" \}\)/);
  assert.match(app, /type: "party_vote"/);
  assert.match(app, /THE PARTY WHEEL/);
  assert.match(app, /gameKey === "crowdshift"/);
  assert.match(app, /window\.render_game_to_text/);
  assert.match(app, /window\.advanceTime/);
});

test("Crowd Shift host supports shared displays and deterministic inspection hooks", async () => {
  const [html, game] = await Promise.all([read("crowdshift/index.html"), read("crowdshift/game.js")]);
  assert.match(html, /id="game"[\s\S]*id="roomCode"[\s\S]*id="shareScreenButton"/);
  assert.match(html, /mountGameFeedback\(\{ gameSlug: "crowdshift"/);
  assert.match(game, /gameKey:"crowdshift"/);
  assert.match(game, /role:state\.displayMode\?"display":"host"/);
  assert.match(game, /reportGameOutcome\(\{slug:"crowdshift"/);
  assert.match(game, /window\.render_game_to_text/);
  assert.match(game, /window\.advanceTime/);
});

test("server keeps Crowd Shift choices and Duel Shift reads secret until reveal", async () => {
  const server = await read("v2-server/crowdshift.go");
  assert.match(server, /case "choice":/);
  assert.match(server, /case "predict":/);
  assert.match(server, /case "hot_take":/);
  assert.match(server, /p\.ID == selfID/);
  assert.match(server, /r\.phase == "reveal"/);
  assert.match(server, /"majority", "minority", "split", "unanimous"/);
  assert.match(server, /"duel_sync", "duel_clash"/);
  assert.match(server, /readPoints \+= 700/);
  assert.match(server, /StealPoints\[opponentID\] \+= 400/);
});

test("Vercel routes Crowd Shift with both slash variants", async () => {
  const config = JSON.parse(await read("vercel.json"));
  const routes = new Map(config.rewrites.map((entry) => [entry.source, entry.destination]));
  assert.equal(routes.get("/crowdshift"), "/crowdshift/index.html");
  assert.equal(routes.get("/crowdshift/"), "/crowdshift/index.html");
});
