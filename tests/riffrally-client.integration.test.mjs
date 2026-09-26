import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES } from "../src/meta/games.js";
import { getGameContentContract } from "../src/meta/content-contracts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("Riff Rally is discoverable and registered for Party multiplayer", () => {
  const game = GAMES.find((item) => item.slug === "riffrally");
  assert.equal(game?.url, "/riffrally/");
  assert.ok(game.modes.includes("multiplayer"));
  const contract = getGameContentContract("riffrally");
  assert.equal(contract?.outcomes.score.max, 12000);
  assert.equal(contract?.cosmeticSlots[0].key, "riffrally-stage");
  const routes = new Map(JSON.parse(read("vercel.json")).rewrites.map((route) => [route.source, route.destination]));
  assert.equal(routes.get("/riffrally"), "/riffrally/index.html");
  assert.equal(routes.get("/riffrally/"), "/riffrally/index.html");
});

test("Riff Rally host and phone surfaces use the shared chart and server hit protocol", () => {
  const host = read("riffrally/game.js");
  const phone = read("party/app.js");
  const server = read("v2-server/riffrally.go");
  assert.match(host, /gameKey:"riffrally"/);
  assert.match(host, /reportGameOutcome\(\{slug:"riffrally"/);
  assert.match(host, /party_snapshot/);
  assert.match(phone, /type:"riff_hit",noteId:note\.id,lane/);
  assert.match(server, /r\.riff\.Played\[key\]/);
  assert.match(server, /riffRallyWindow/);
  assert.match(server, /completeRotationActivityLocked\(now\)/);
});
