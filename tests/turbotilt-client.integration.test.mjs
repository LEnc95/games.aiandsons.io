import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { GAMES } from "../src/meta/games.js";
import { getGameContentContract } from "../src/meta/content-contracts.js";

const ROOT = process.cwd();
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");

test("Turbo Tilt is registered as an accountless multiplayer game", () => {
  const game = GAMES.find((entry) => entry.slug === "turbotilt");
  assert.ok(game);
  assert.equal(game.url, "/turbotilt/");
  assert.equal(game.earnsCoins, false);
  assert.ok(game.categories.includes("racing"));
  assert.ok(game.modes.includes("multiplayer"));
  const contract = getGameContentContract("turbotilt");
  assert.equal(contract.releasedAt, "2026-09-09");
  assert.deepEqual(Object.keys(contract.outcomes), ["players", "heats", "boosts"]);
});

test("party hub exposes code join, tilt permission, and accessible fallback controls", () => {
  const html = read("party", "index.html");
  const js = read("party", "app.js");
  assert.match(html, /id="roomCode"/);
  assert.match(html, /id="playerName"/);
  assert.match(html, /id="tiltButton"/);
  assert.match(html, /id="leftButton"/);
  assert.match(html, /id="rightButton"/);
  assert.match(html, /id="boostButton"/);
  assert.match(html, /data-gadget="shield"/);
  assert.match(html, /id="voteButtons"/);
  assert.match(html, /id="carSelect"/);
  assert.match(html, /data-emote="fire"/);
  assert.match(html, /id="watchForm"/);
  assert.match(html, /Open synchronized screen/);
  assert.match(js, /DeviceOrientationEvent\.requestPermission/);
  assert.match(js, /screen\.orientation/);
  assert.match(js, /type: "steer"/);
  assert.match(js, /type: "boost"/);
  assert.match(js, /type: "gadget"/);
  assert.match(js, /type: "vote"/);
  assert.match(js, /type: "customize"/);
  assert.match(js, /Barrier hit — slowed for 1 second/);
  assert.match(js, /window\.advanceTime/);
  assert.match(js, /window\.render_game_to_text/);
});

test("host screen uses local QR generation and server-authoritative party input", () => {
  const html = read("turbotilt", "index.html");
  const js = read("turbotilt", "game.js");
  const qr = read("party", "vendor", "qrcode.js");
  assert.match(html, /<canvas id="game"/);
  assert.match(html, /\/party\/vendor\/qrcode\.js/);
  assert.match(html, /mountGameFeedback\(\{ gameSlug: "turbotilt"/);
  assert.match(html, /value="elimination"/);
  assert.match(html, /value="relay"/);
  assert.match(html, /value="survival"/);
  assert.match(html, /value="chaos"/);
  assert.match(html, /id="soundButton"/);
  assert.match(js, /gameId: "party"/);
  assert.match(js, /gameKey: "turbotilt"/);
  assert.match(js, /role: "host"/);
  assert.match(js, /role: "display"/);
  assert.match(js, /screen_role/);
  assert.match(js, /display_read_only|Synchronized screen/);
  assert.match(js, /\+1 BOOST!/);
  assert.match(js, /PHOTO FINISH REPLAY/);
  assert.match(js, /risk_routes/);
  assert.match(js, /speechSynthesis/);
  assert.match(js, /type: "host"/);
  assert.match(js, /reportGameOutcome/);
  assert.match(js, /window\.advanceTime/);
  assert.match(js, /window\.render_game_to_text/);
  assert.match(qr, /Copyright \(c\) 2009 Kazuhiko Arase/);
  assert.doesNotMatch(html + js, /api\.qrserver|chart\.googleapis|quickchart/i);
});

test("Vercel routes both party surfaces without weakening WebSocket CSP", () => {
  const vercel = JSON.parse(read("vercel.json"));
  assert.ok(vercel.rewrites.some((entry) => entry.source === "/party" && entry.destination === "/party/index.html"));
  assert.ok(vercel.rewrites.some((entry) => entry.source === "/turbotilt" && entry.destination === "/turbotilt/index.html"));
  const csp = vercel.headers.flatMap((entry) => entry.headers || []).find((header) => header.key === "Content-Security-Policy");
  assert.match(csp.value, /connect-src[^;]*wss:/);
  assert.match(csp.value, /connect-src[^;]*ws:/);
});

test("shared multiplayer client sends optional party join metadata", () => {
  const client = read("src", "net", "multiplayerClient.js");
  assert.match(client, /role: this\.options\.role \|\| undefined/);
  assert.match(client, /gameKey: this\.options\.gameKey \|\| undefined/);
  assert.match(client, /gameId: this\.gameId/);
});
