import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  multiplayerProtocol,
  normalizeWebSocketUrl,
  resolveWebSocketUrl,
} from "../src/net/multiplayerClient.js";

const ROOT = process.cwd();

test("multiplayer client normalizes versioned WebSocket endpoints", () => {
  assert.equal(multiplayerProtocol.name, "aiandsons.multiplayer.v1");
  assert.equal(multiplayerProtocol.defaultProductionEndpoint, "wss://audioagar-server-6owms56gxq-uc.a.run.app/ws");
  assert.ok(!multiplayerProtocol.defaultProductionEndpoint.includes("clubpenguin-world"));
  assert.equal(normalizeWebSocketUrl("example.test"), "ws://example.test/ws");
  assert.equal(normalizeWebSocketUrl("https://example.test/ws/game"), "wss://example.test/ws/game");
  assert.equal(normalizeWebSocketUrl("http://127.0.0.1:8081"), "ws://127.0.0.1:8081/ws");
  assert.equal(resolveWebSocketUrl("wss://arena.example/ws/custom"), "wss://arena.example/ws/custom");
});

test("audioagar page exposes blind-play and deterministic hooks", () => {
  const html = fs.readFileSync(path.join(ROOT, "audioagar", "index.html"), "utf8");
  const js = fs.readFileSync(path.join(ROOT, "audioagar", "game.js"), "utf8");

  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-live="assertive"/);
  assert.match(html, /<canvas id="arena"/);
  assert.match(html, /href="\/audioagar\/styles\.css"/);
  assert.match(html, /src="\/audioagar\/game\.js"/);
  assert.match(html, /from "\/src\/feedback\/embed\.js"/);
  assert.match(html, /id="scanBtn"/);
  assert.match(html, /aria-keyshortcuts="R"/);
  assert.match(html, /id="speechBtn"/);
  assert.match(html, /id="sonarValue"/);
  assert.match(html, /id="guideValue"/);
  assert.match(html, /id="moveValue"/);
  assert.match(html, /id="positionValue"/);
  assert.match(html, /mountGameFeedback\(\{ gameSlug: "audioagar"/);
  assert.match(js, /connect\(\{\s*gameId: GAME_ID/m);
  assert.match(js, /window\.advanceTime/);
  assert.match(js, /window\.render_game_to_text/);
  assert.match(js, /performTacticalScan/);
  assert.match(js, /buildTacticalScan/);
  assert.match(js, /type: "move"/);
  assert.match(js, /movementLabelFor/);
  assert.match(js, /drawMovementCue/);
  assert.match(js, /sendAction\("split"\)/);
  assert.match(js, /sendAction\("eject"\)/);
  assert.match(js, /KeyR/);
  assert.match(js, /KeyV/);

  const net = fs.readFileSync(path.join(ROOT, "src", "net", "multiplayerClient.js"), "utf8");
  assert.match(net, /type\.includes\(":"\)/);
});

test("audioagar is routed and allowed to open WebSocket connections", () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  const rewrites = vercel.rewrites || [];
  assert.ok(rewrites.some((entry) => entry.source === "/audioagar" && entry.destination === "/audioagar/index.html"));
  assert.ok(rewrites.some((entry) => entry.source === "/audioagar/" && entry.destination === "/audioagar/index.html"));

  const cspHeader = (vercel.headers || [])
    .flatMap((entry) => entry.headers || [])
    .find((header) => header.key === "Content-Security-Policy");
  assert.ok(cspHeader?.value.includes("wss:"), "Expected CSP connect-src to allow secure WebSocket endpoints.");
  assert.ok(cspHeader?.value.includes("ws:"), "Expected CSP connect-src to allow local WebSocket endpoints.");
  assert.ok((vercel.headers || []).some((entry) => entry.source === "/audioagar/game.js"));
  assert.ok((vercel.headers || []).some((entry) => entry.source === "/audioagar/styles.css"));
});
