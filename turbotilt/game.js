import { connect } from "/src/net/multiplayerClient.js";
import { rememberRecent } from "/src/core/state.js";
import { reportGameOutcome } from "/src/core/outcomes.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const byId = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const displayCode = String(params.get("display") || "").toUpperCase().replace(/[^A-HJ-NP-Z]/g, "").slice(0, 4);
const isDisplay = displayCode.length === 4;
if (!isDisplay) rememberRecent("turbotilt");
const state = {
  connection: null,
  roomId: "",
  hostToken: "",
  snapshot: null,
  testOffsetMs: 0,
  reported: false,
  lastFrame: performance.now(),
  stripeOffset: 0,
  eventSeen: new Map(),
  effects: [],
  shakeUntil: 0,
  displayMode: isDisplay,
  audioEnabled: false,
  audioContext: null,
  lastPhase: "",
  lastLeaderId: "",
  lastAnnounceAt: 0,
  finalTenAnnounced: false,
  podiumStartedAt: 0,
  lastUiPhase: "",
};

function hostTokenKey(roomId) { return `aiandsons-party-host:${roomId}`; }
function setServerStatus(label, kind = "") {
  byId("serverStatus").textContent = label;
  byId("serverStatus").className = `server-status ${kind}`.trim();
}

async function connectScreen() {
  if (state.displayMode) {
    const connection = await connect({
      gameId: "party",
      gameKey: "turbotilt",
      role: "display",
      roomId: displayCode,
    });
    bindConnection(connection);
    return;
  }
  let requestedRoom = String(params.get("room") || "").toUpperCase();
  let token = requestedRoom ? sessionStorage.getItem(hostTokenKey(requestedRoom)) || "" : "";
  if (requestedRoom && !token) {
    params.delete("room");
    history.replaceState({}, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
    requestedRoom = "";
  }
  const connection = await connect({
    gameId: "party",
    gameKey: "turbotilt",
    role: "host",
    roomId: requestedRoom,
    token,
  });
  bindConnection(connection);
}

function bindConnection(connection) {
  state.connection = connection;
  connection.onStatus(({ status }) => {
    if (connection !== state.connection) return;
    if (status === "open") setServerStatus("Connected", "online");
    else if (status === "connecting") setServerStatus("Connecting…");
    else if (status === "reconnecting") setServerStatus("Reconnecting…");
    else if (status === "error" || status === "timeout") setServerStatus("Connection problem", "problem");
  });
  connection.onStateUpdate((update) => {
    if (connection !== state.connection) return;
    const previous = state.snapshot;
    state.snapshot = update.payload?.state || update.payload || null;
    consumeRaceEvents();
    processRaceAudio(previous, state.snapshot);
    syncUi();
  });
  connection.onEvent((event) => handleEvent(connection, event));
}

function handleEvent(connection, event) {
  if (connection !== state.connection) return;
  const payload = event.payload || {};
  if (event.type === "welcome") {
    state.roomId = payload.roomId || "";
    if (payload.role === "display") {
      byId("roomCode").textContent = state.roomId || "----";
      byId("screenRole").textContent = "Synchronized screen";
      document.body.classList.add("display-mode");
      renderQr();
      setServerStatus("Following host live", "online");
      syncUi();
      return;
    }
    state.hostToken = payload.token || "";
    if (state.roomId && state.hostToken) sessionStorage.setItem(hostTokenKey(state.roomId), state.hostToken);
    byId("roomCode").textContent = state.roomId || "----";
    const next = new URL(location.href);
    next.searchParams.set("room", state.roomId);
    history.replaceState({}, "", next);
    renderQr();
    setServerStatus("Room ready", "online");
    syncUi();
    return;
  }
  if (event.type === "error") {
    byId("hostError").textContent = payload.message || "The multiplayer server rejected that action.";
    if (payload.code === "invalid_host_token" || payload.code === "room_not_found") {
      if (state.roomId) sessionStorage.removeItem(hostTokenKey(state.roomId));
      setServerStatus("Room expired", "problem");
    }
  }
}

function renderQr() {
  const target = byId("qrCode");
  target.textContent = "";
  if (!state.roomId || typeof window.qrcode !== "function") return;
  const joinUrl = `https://games.aiandsons.io/party?code=${encodeURIComponent(state.roomId)}`;
  const qr = window.qrcode(0, "M");
  qr.addData(joinUrl);
  qr.make();
  target.innerHTML = qr.createSvgTag(5, 1, "Scan to join Turbo Tilt", "Turbo Tilt room QR code");
}

function displayUrl() {
  if (!state.roomId) return "";
  const url = new URL("/turbotilt/", location.origin);
  url.searchParams.set("display", state.roomId);
  const endpoint = params.get("ws") || params.get("endpoint");
  if (endpoint) url.searchParams.set("ws", endpoint);
  return url.toString();
}

function remainingSeconds() {
  if (!state.snapshot?.phaseEndsAt) return 0;
  return Math.max(0, (state.snapshot.phaseEndsAt - (Date.now() + state.testOffsetMs)) / 1000);
}

function overlayCopy(snapshot) {
  const connected = snapshot?.players?.filter((player) => player.connected).length || 0;
  if (!state.roomId) return ["Opening a room…", "Keep this screen open while the multiplayer server wakes up."];
  if (!snapshot || snapshot.phase === "lobby") {
    return connected < 2
      ? ["Phones at the ready", `Ask ${2 - connected} more racer${2 - connected === 1 ? "" : "s"} to join with ${state.roomId}.`]
      : ["Ready to race", "Everyone should calibrate their phone, then start the first heat."];
  }
  if (snapshot.phase === "paused") return ["Race paused", snapshot.pauseReason === "host_disconnected" ? "The host is reconnecting." : "Resume whenever everyone is ready."];
  if (snapshot.phase === "ended") return ["Game ended", "Return to Party Games to create another room."];
  return ["", ""];
}

function syncUi() {
  const snapshot = state.snapshot;
  const players = snapshot?.players || [];
  const connected = players.filter((player) => player.connected).length;
  byId("playerCount").textContent = `${players.length} / 8`;
  byId("screenCount").textContent = `${1 + Number(snapshot?.displayCount || 0)} live screen${1 + Number(snapshot?.displayCount || 0) === 1 ? "" : "s"}`;
  byId("shareScreenButton").disabled = !state.roomId;
  const roster = byId("roster");
  roster.textContent = "";
  players.forEach((player) => {
    const item = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.color = player.color;
    dot.style.background = player.color;
    const name = document.createElement("strong");
    name.textContent = player.name;
    item.append(dot, name);
    if (!player.connected) {
      const offline = document.createElement("span");
      offline.className = "offline";
      offline.textContent = "offline";
      item.append(offline);
    } else if (player.queued) {
      const queued = document.createElement("span");
      queued.className = "queued";
      queued.textContent = "next heat";
      item.append(queued);
    }
    const score = document.createElement("span");
    score.className = "score";
    score.textContent = snapshot?.phase === "lobby" ? "✓" : String(player.points || 0);
    item.append(score);
    roster.append(item);
  });

  const phase = snapshot?.phase || "connecting";
  if (phase !== state.lastUiPhase) {
    if (phase === "podium") byId("setupPanel").open = false;
    state.lastUiPhase = phase;
  }
  const settings = snapshot?.settings || {};
  if (!state.displayMode && ["lobby", "podium", "ended"].includes(phase)) {
    if (settings.mode) byId("modeSelect").value = settings.mode;
    if (settings.heats) byId("heatsSelect").value = String(settings.heats);
    if (settings.chaos) byId("chaosSelect").value = settings.chaos;
    if (settings.trackRotation) byId("trackSelect").value = settings.trackRotation;
    byId("accessibilityToggle").checked = Boolean(settings.accessibility);
    byId("modeHelp").textContent = modeHelpText[settings.mode] || modeHelpText.classic;
  }
  byId("setupPanel").hidden = state.displayMode || !["lobby", "podium", "ended"].includes(phase);
  const active = ["countdown", "racing", "intermission", "paused"].includes(phase);
  const canStartRound = !state.displayMode && ["lobby", "podium", "ended"].includes(phase);
  byId("startButton").hidden = !canStartRound;
  byId("startButton").disabled = connected < 2;
  byId("startButton").textContent = phase === "lobby"
    ? (connected < 2 ? "Start with 2 racers" : `Start with ${connected} racer${connected === 1 ? "" : "s"}`)
    : (connected < 2 ? "Rematch needs 2 racers" : `Rematch with ${connected}`);
  byId("pauseButton").hidden = !active;
  byId("pauseButton").textContent = phase === "paused" ? "Resume" : "Pause";
  byId("endButton").hidden = !active;

  const [title, copy] = overlayCopy(snapshot);
  const showOverlay = !snapshot || phase === "lobby" || phase === "paused" || phase === "ended";
  byId("stageOverlay").hidden = !showOverlay;
  if (showOverlay) {
    byId("overlayTitle").textContent = title;
    byId("overlayCopy").textContent = copy;
  }
  if (phase === "podium" && !state.reported && !state.displayMode) {
    state.reported = true;
    reportGameOutcome({
      slug: "turbotilt",
      result: "completed",
      durationMs: 3 * 45000,
      metrics: { players: players.length, heats: snapshot.heat || 3, boosts: snapshot.totalBoosts || 0 },
    });
  }
}

function audioContext() {
  if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  state.audioContext.resume?.();
  return state.audioContext;
}

function playTone(kind) {
  if (!state.audioEnabled) return;
  const audio = audioContext();
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const frequencies = { countdown: 520, go: 880, energy: 740, barrier: 130, boost: 420, jump: 980, horn: 260, finish: 660 };
  oscillator.frequency.setValueAtTime(frequencies[kind] || 440, now);
  if (kind === "barrier") oscillator.type = "sawtooth";
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === "barrier" ? .16 : .1, now + .015);
  gain.gain.exponentialRampToValueAtTime(.0001, now + (kind === "finish" ? .65 : .25));
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + .7);
}

function announce(text) {
  if (!state.audioEnabled || !text || !window.speechSynthesis || performance.now() - state.lastAnnounceAt < 1800) return;
  state.lastAnnounceAt = performance.now();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.12;
  utterance.pitch = 1.08;
  utterance.volume = .82;
  window.speechSynthesis.speak(utterance);
}

function processRaceAudio(previous, snapshot) {
  if (!snapshot) return;
  if (snapshot.phase !== state.lastPhase) {
    if (snapshot.phase === "countdown") { playTone("countdown"); announce(`Heat ${snapshot.heat}. ${trackLabel(snapshot.track)}.`); }
    if (snapshot.phase === "racing") { playTone("go"); announce("Go!"); state.finalTenAnnounced = false; }
    if (snapshot.phase === "intermission") { playTone("finish"); announce(`Heat ${snapshot.heat} complete.`); }
    if (snapshot.phase === "podium") { playTone("finish"); announce(`${snapshot.players?.[0]?.name || "Our racer"} wins Turbo Tilt!`); state.podiumStartedAt = performance.now(); }
    state.lastPhase = snapshot.phase;
  }
  const leader = snapshot.players?.[0];
  if (snapshot.phase === "racing" && leader?.id && state.lastLeaderId && leader.id !== state.lastLeaderId) announce(`${leader.name} takes the lead!`);
  if (leader?.id) state.lastLeaderId = leader.id;
  const remaining = Math.max(0, Number(snapshot.phaseEndsAt || 0) - Date.now());
  if (snapshot.phase === "racing" && remaining <= 10000 && !state.finalTenAnnounced) {
    state.finalTenAnnounced = true;
    announce("Final ten seconds!");
  }
}

function toggleAudio() {
  state.audioEnabled = !state.audioEnabled;
  if (state.audioEnabled) {
    audioContext();
    playTone("go");
  } else {
    window.speechSynthesis?.cancel();
  }
  byId("soundButton").textContent = `Sound & announcer: ${state.audioEnabled ? "On" : "Off"}`;
}

function consumeRaceEvents() {
  const now = Date.now() + state.testOffsetMs;
  for (const player of state.snapshot?.players || []) {
    const eventId = Number(player.eventId || 0);
    const previous = state.eventSeen.get(player.id);
    state.eventSeen.set(player.id, eventId);
    if (!eventId || eventId === previous || now - Number(player.lastEventAt || 0) > 2200) continue;
    const impact = player.lastEventType === "barrier";
    state.effects.push({
      id: `${player.id}:${eventId}`,
      playerId: player.id,
      type: player.lastEventType,
      startedAt: performance.now(),
      duration: impact ? 1100 : 1250,
    });
    if (impact && !state.snapshot?.settings?.accessibility) state.shakeUntil = performance.now() + 420;
    if (impact) playTone("barrier");
    else if (player.lastEventType === "energy" || player.lastEventType === "energy_full") playTone("energy");
    else if (player.lastEventType === "jump" || player.lastEventType === "risk_route") playTone("jump");
    else if (player.lastEventType === "horn") playTone("horn");
    else playTone("boost");
  }
  state.effects = state.effects.slice(-18);
}

function sendHostAction(action) {
  byId("hostError").textContent = "";
  state.connection?.sendInput({ type: "host", action });
}

function sendSettings() {
  if (state.displayMode) return;
  state.connection?.sendInput({
    type: "host",
    action: "configure",
    settings: {
      mode: byId("modeSelect").value,
      heats: Number(byId("heatsSelect").value),
      chaos: byId("chaosSelect").value,
      trackRotation: byId("trackSelect").value,
      accessibility: byId("accessibilityToggle").checked,
    },
  });
}

const trackNames = { neon: "Neon City", glacier: "Glacier Run", volcano: "Volcano Rush", space: "Spaceway" };
const modeNames = { classic: "Classic Cup", elimination: "Elimination", teams: "Teams", relay: "Team Relay", survival: "Co-op Survival", chaos: "Chaos Cup" };
const modifierNames = { double_energy: "Double Energy", moving_barriers: "Moving Barriers", mirror: "Mirror Steering", super_boost: "Super Boosts", fog: "Fog", sudden_death: "Sudden Death" };
const modeHelpText = {
  classic: "Placement plus up to 3 style points per heat.", elimination: "Last racer drops out after each heat.",
  teams: "Two teams combine their points.", relay: "Team drivers hand off every 8 seconds.",
  survival: "Everyone protects six shared team hearts.", chaos: "A new global modifier arrives every 10 seconds.",
};
function trackLabel(track) { return trackNames[track] || "Turbo Circuit"; }

function drawBackdrop() {
  const track = state.snapshot?.track || "neon";
  const palettes = {
    neon: ["#154b63", "#092838", "#04141e"], glacier: ["#6fa7c2", "#234e68", "#071c2b"],
    volcano: ["#6b241d", "#321a21", "#120c15"], space: ["#251d55", "#111936", "#050817"],
  };
  const palette = palettes[track] || palettes.neon;
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(.55, palette[1]);
  gradient.addColorStop(1, palette[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = .3;
  for (let i = 0; i < 55; i++) {
    const x = (i * 173) % canvas.width;
    const y = (i * 97 + state.stripeOffset * .12) % canvas.height;
    ctx.fillStyle = i % 3 ? "#8de9df" : "#ffd65a";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(49,230,193,.08)";
  for (let y = -80 + (state.stripeOffset * .55) % 80; y < canvas.height; y += 80) {
    ctx.fillRect(0, y, 240, 2);
    ctx.fillRect(960, y, 240, 2);
  }
}

function drawRoad() {
  ctx.fillStyle = "#102d39";
  ctx.beginPath();
  ctx.moveTo(275, canvas.height);
  ctx.lineTo(440, 0);
  ctx.lineTo(760, 0);
  ctx.lineTo(925, canvas.height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(49,230,193,.7)";
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(275, canvas.height); ctx.lineTo(440, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(925, canvas.height); ctx.lineTo(760, 0); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.28)";
  ctx.lineWidth = 3;
  ctx.setLineDash([25, 24]);
  const offset = state.stripeOffset % 49;
  ctx.lineDashOffset = offset;
  ctx.beginPath(); ctx.moveTo(600, canvas.height); ctx.lineTo(600, 0); ctx.stroke();
  ctx.setLineDash([]);
}

function roadX(normalized, y) {
  const progress = 1 - y / canvas.height;
  const half = 160 + (1 - progress) * 165;
  return 600 + normalized * half;
}

function obstacleRenderX(obstacle) {
  const serverNow = Number(state.snapshot?.serverTime || Date.now()) + state.testOffsetMs;
  const extraMotion = state.snapshot?.modifier === "moving_barriers" && obstacle.kind === "barrier" ? .22 : 0;
  const motion = Number(obstacle.motion || 0) || extraMotion;
  return Math.max(-.82, Math.min(.82, Number(obstacle.x || 0) + Math.sin(serverNow / 520 + obstacle.distance) * motion));
}

function drawObstacle(obstacle, leaderDistance) {
  const delta = obstacle.distance - leaderDistance;
  const y = 300 - delta * .48;
  if (y < -30 || y > canvas.height + 30) return;
  const x = roadX(obstacleRenderX(obstacle), y);
  if (obstacle.kind === "energy") {
    const pulse = 1 + Math.sin(performance.now() / 120 + obstacle.distance) * .12;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = "#ffcf4a";
    ctx.shadowBlur = 25;
    ctx.fillStyle = "#ffcf4a";
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#fff1a6";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#6c4600";
    ctx.font = "1000 22px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚡", 0, 1);
    ctx.restore();
  } else if (obstacle.kind === "jump") {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#c28cff";
    ctx.shadowColor = "#c28cff";
    ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.moveTo(-38, 14); ctx.lineTo(-25, -12); ctx.lineTo(25, -12); ctx.lineTo(38, 14); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = "1000 22px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("JUMP", 0, 8);
    ctx.restore();
  } else {
    const track = state.snapshot?.track || "neon";
    const barrierColor = track === "volcano" ? "#ff6a28" : track === "glacier" ? "#bdefff" : track === "space" ? "#c28cff" : "#ff6b8a";
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = barrierColor;
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#2b0f1a";
    ctx.fillRect(-35, -12, 70, 24);
    ctx.shadowBlur = 0;
    ctx.fillStyle = barrierColor;
    for (let stripe = -31; stripe < 32; stripe += 20) {
      ctx.beginPath();
      ctx.moveTo(stripe, -10); ctx.lineTo(stripe + 13, -10); ctx.lineTo(stripe + 25, 10); ctx.lineTo(stripe + 12, 10); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = "#ffc3cf";
    ctx.lineWidth = 2;
    ctx.strokeRect(-35, -12, 70, 24);
    ctx.restore();
  }
}

function drawRoutes(snapshot, leaderDistance) {
  for (const route of snapshot.routes || []) {
    const middle = (route.start + route.end) / 2;
    const y = 300 - (middle - leaderDistance) * .48;
    if (y < -160 || y > canvas.height + 160) continue;
    const riskX = roadX(route.riskSide * .58, y);
    const safeX = roadX(route.riskSide * -.58, y);
    ctx.save();
    ctx.globalAlpha = .75;
    ctx.textAlign = "center";
    ctx.font = "1000 16px Trebuchet MS";
    ctx.fillStyle = "rgba(255,107,138,.2)";
    ctx.fillRect(riskX - 80, y - 28, 160, 48);
    ctx.fillStyle = "#ffcf4a";
    ctx.fillText("RISK  +2 STYLE", riskX, y + 3);
    ctx.fillStyle = "rgba(49,230,193,.16)";
    ctx.fillRect(safeX - 60, y - 28, 120, 48);
    ctx.fillStyle = "#9ff6e6";
    ctx.fillText("SAFE", safeX, y + 3);
    ctx.restore();
  }
}

function racerPosition(player, leaderDistance, index = 0) {
  const y = 300 + (leaderDistance - player.distance) * .48 + index * 2;
  return { x: roadX(player.x, y), y };
}

function drawRacer(player, leaderDistance, index) {
  const { x, y } = racerPosition(player, leaderDistance, index);
  if (y > canvas.height + 50) return;
  ctx.save();
  ctx.translate(x, y);
  if (player.slowed) ctx.rotate(Math.sin(performance.now() / 45 + index) * .08);
  if (!player.connected) ctx.globalAlpha = .56;
  if (player.trail === "rainbow" || player.trail === "bubbles" || player.trail === "sparks") {
    for (let trail = 0; trail < 5; trail++) {
      const trailY = 38 + trail * 11;
      ctx.globalAlpha = Math.max(.15, .75 - trail * .13);
      ctx.fillStyle = player.trail === "rainbow" ? ["#ff6b8a", "#ffcf4a", "#31e6c1", "#75a7ff", "#c28cff"][trail] : player.trail === "bubbles" ? "#bfefff" : "#ffcf4a";
      ctx.beginPath(); ctx.arc(Math.sin(trail * 2.1) * 8, trailY, player.trail === "bubbles" ? 5 : 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = player.connected ? 1 : .56;
  }
  ctx.shadowColor = player.color;
  ctx.shadowBlur = player.boosting ? 28 : 12;
  ctx.fillStyle = player.color;
  ctx.beginPath();
  if (player.car === "rocket") {
    ctx.moveTo(0, -39); ctx.lineTo(24, 26); ctx.lineTo(0, 34); ctx.lineTo(-24, 26); ctx.closePath();
  } else if (player.car === "buggy") {
    ctx.roundRect(-27, -29, 54, 59, 9);
  } else {
    ctx.roundRect(-22, -34, 44, 68, 14);
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#08151d";
  ctx.fillRect(-14, -19, 28, 20);
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.fillRect(-16, 12, 7, 14); ctx.fillRect(9, 12, 7, 14);
  if (player.slowed) {
    ctx.strokeStyle = "#ff6b8a";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-30, -12); ctx.lineTo(-43, -20); ctx.moveTo(30, 4); ctx.lineTo(45, 12); ctx.stroke();
  }
  if (player.boosting) {
    ctx.fillStyle = "#ffcf4a";
    ctx.beginPath(); ctx.moveTo(-11, 35); ctx.lineTo(0, 58); ctx.lineTo(11, 35); ctx.fill();
  }
  if (player.shieldActive) {
    ctx.strokeStyle = "#75a7ff";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.font = "800 15px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.fillText(player.name, 0, -46);
  if (state.snapshot?.settings?.mode === "relay" && player.driving) {
    ctx.fillStyle = "#ffcf4a";
    ctx.font = "900 11px Trebuchet MS";
    ctx.fillText("DRIVING", 0, -61);
  }
  if (Number(player.streak || 0) >= 3) {
    ctx.fillStyle = "#ffcf4a";
    ctx.font = "900 12px Trebuchet MS";
    ctx.fillText(`🔥 ${player.streak} streak`, 0, 66);
  }
  if (player.emote && Date.now() - Number(player.emoteAt || 0) < 2200) {
    const emotes = { fire: "🔥", wow: "😱", laugh: "😂", clap: "👏" };
    ctx.font = "34px sans-serif";
    ctx.fillText(emotes[player.emote] || "", 35, -42);
  }
  for (let charge = 0; charge < 3; charge++) {
    ctx.fillStyle = charge < Number(player.boostCharges || 0) ? "#ffcf4a" : "rgba(255,255,255,.18)";
    ctx.beginPath(); ctx.arc(-12 + charge * 12, 47, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawRaceEffects(players, leaderDistance) {
  const now = performance.now();
  state.effects = state.effects.filter((effect) => now - effect.startedAt < effect.duration);
  for (const effect of state.effects) {
    const player = players.find((item) => item.id === effect.playerId);
    if (!player) continue;
    const { x, y } = racerPosition(player, leaderDistance);
    const progress = Math.min(1, (now - effect.startedAt) / effect.duration);
    const impact = effect.type === "barrier";
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = impact ? "#ff6b8a" : "#ffcf4a";
    ctx.lineWidth = 8 * (1 - progress) + 2;
    ctx.beginPath(); ctx.arc(x, y, 28 + progress * 92, 0, Math.PI * 2); ctx.stroke();
    const particleCount = state.snapshot?.settings?.accessibility ? 4 : 12;
    for (let particle = 0; particle < particleCount; particle++) {
      const angle = (particle / particleCount) * Math.PI * 2 + effect.id.length;
      const radius = 18 + progress * (55 + (particle % 4) * 8);
      ctx.fillStyle = impact && particle % 2 ? "#fff" : impact ? "#ff6b8a" : "#ffcf4a";
      ctx.beginPath(); ctx.arc(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 5 - progress * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, (1 - progress) * 2.5);
    ctx.font = "1000 24px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(3,16,24,.9)";
    ctx.lineWidth = 7;
    const labels = {
      barrier: "BARRIER!  -40%", energy: "+1 BOOST!", energy_full: "BOOSTS FULL!",
      shield_ready: "SHIELD ARMED", shield_block: "BLOCKED!", magnet: "MAGNET ON",
      overcharge: "OVERCHARGE!", repair: "REPAIRED!", jump: "PERFECT JUMP!",
      risk_route: "+2 STYLE!", turbo_chain: "TURBO CHAIN!", horn: "BEEP!",
    };
    const label = labels[effect.type] || "NICE!";
    ctx.strokeText(label, x, y - 82 - progress * 35);
    ctx.fillText(label, x, y - 82 - progress * 35);
    ctx.restore();
  }
}

function drawLeaderboard(players) {
  const leaders = players.slice(0, 4);
  ctx.save();
  ctx.fillStyle = "rgba(3,16,24,.78)";
  ctx.beginPath(); ctx.roundRect(24, 22, 270, 48 + leaders.length * 42, 18); ctx.fill();
  ctx.fillStyle = "#31e6c1";
  ctx.font = "900 14px Trebuchet MS";
  ctx.textAlign = "left";
  ctx.fillText("LIVE ORDER", 46, 52);
  leaders.forEach((player, index) => {
    const y = 84 + index * 42;
    ctx.fillStyle = player.color;
    ctx.beginPath(); ctx.arc(48, y - 5, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "900 18px Trebuchet MS";
    ctx.fillText(`${index + 1}. ${player.name}`, 64, y);
    ctx.textAlign = "right";
    ctx.fillStyle = player.slowed ? "#ff9aaa" : player.boosting ? "#ffcf4a" : "#9cb6c8";
    ctx.font = "800 13px Trebuchet MS";
    ctx.fillText(player.slowed ? "SLOWED" : player.boosting ? "BOOSTING" : `${player.points} pts`, 272, y);
    ctx.textAlign = "left";
  });
  ctx.restore();
}

function drawLobby(snapshot) {
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,.07)";
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(600 + Math.cos(angle) * 235, 345 + Math.sin(angle) * 170, 42, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "#f6fbff";
  ctx.font = "900 54px Trebuchet MS";
  ctx.fillText(snapshot?.players?.length ? "Racers are joining" : "Your track is ready", 600, 320);
  ctx.fillStyle = "#9cb6c8";
  ctx.font = "700 24px Trebuchet MS";
  ctx.fillText("Use the room code or scan the QR code", 600, 362);
}

function drawRace(snapshot) {
  drawRoad();
  const players = snapshot.players || [];
  const leaderDistance = Math.max(0, ...players.map((player) => player.distance || 0));
  drawRoutes(snapshot, leaderDistance);
  for (const obstacle of snapshot.obstacles || []) drawObstacle(obstacle, leaderDistance);
  [...players].reverse().forEach((player, index) => drawRacer(player, leaderDistance, index));
  drawRaceEffects(players, leaderDistance);
  drawLeaderboard(players);
  const remaining = remainingSeconds();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(3,16,24,.75)";
  ctx.beginPath(); ctx.roundRect(390, 22, 420, 78, 18); ctx.fill();
  ctx.fillStyle = "#31e6c1";
  ctx.font = "900 18px Trebuchet MS";
  ctx.fillText(`HEAT ${snapshot.heat} OF ${snapshot.totalHeats}`, 600, 49);
  ctx.fillStyle = "#fff";
  ctx.font = "1000 38px Trebuchet MS";
  const label = snapshot.phase === "countdown" ? `READY · ${Math.max(1, Math.ceil(remaining))}` : snapshot.phase === "intermission" ? `NEXT HEAT IN ${Math.ceil(remaining)}` : `${Math.ceil(remaining)}s`;
  ctx.fillText(label, 600, 84);

  ctx.save();
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(3,16,24,.78)";
  ctx.beginPath(); ctx.roundRect(900, 22, 276, 92, 18); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "900 18px Trebuchet MS";
  ctx.fillText(modeNames[snapshot.settings?.mode] || "Classic Cup", 1154, 51);
  ctx.fillStyle = "#9cb6c8";
  ctx.font = "800 14px Trebuchet MS";
  ctx.fillText(trackLabel(snapshot.track), 1154, 76);
  if (snapshot.modifier) {
    ctx.fillStyle = "#ffcf4a";
    ctx.fillText(modifierNames[snapshot.modifier] || snapshot.modifier, 1154, 99);
  }
  ctx.restore();

  if (snapshot.settings?.mode === "survival") {
    ctx.fillStyle = "rgba(3,16,24,.82)";
    ctx.beginPath(); ctx.roundRect(930, 132, 220, 54, 16); ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = snapshot.sharedHealth <= 2 ? "#ff6b8a" : "#31e6c1";
    ctx.font = "1000 22px Trebuchet MS";
    ctx.fillText(`TEAM HEALTH  ${snapshot.sharedHealth}/6`, 1040, 166);
  }

  if (snapshot.phase === "countdown") {
    ctx.fillStyle = "rgba(3,16,24,.72)";
    ctx.beginPath(); ctx.arc(600, 340, 96, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffcf4a";
    ctx.font = "1000 126px Trebuchet MS";
    ctx.fillText(String(Math.max(1, Math.ceil(remaining))), 600, 383);
  }
  if (snapshot.phase === "intermission") drawIntermission(snapshot);
  if (snapshot.modifier === "fog" && snapshot.phase === "racing") {
    const fog = ctx.createLinearGradient(0, 0, canvas.width, 0);
    fog.addColorStop(0, "rgba(220,238,242,.62)"); fog.addColorStop(.5, "rgba(220,238,242,.15)"); fog.addColorStop(1, "rgba(220,238,242,.62)");
    ctx.fillStyle = fog;
    ctx.fillRect(0, 120, canvas.width, canvas.height - 120);
  }
}

function drawIntermission(snapshot) {
  const players = snapshot.players || [];
  ctx.fillStyle = "rgba(2,12,18,.88)";
  ctx.beginPath(); ctx.roundRect(330, 132, 540, 430, 28); ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#31e6c1";
  ctx.font = "900 18px Trebuchet MS";
  ctx.fillText(`HEAT ${snapshot.heat} RESULTS`, 600, 176);
  ctx.fillStyle = "#fff";
  ctx.font = "1000 42px Trebuchet MS";
  ctx.fillText("Points on the board", 600, 220);
  players.slice(0, 6).forEach((player, index) => {
    const y = 268 + index * 43;
    ctx.textAlign = "left";
    ctx.fillStyle = player.color;
    ctx.beginPath(); ctx.arc(402, y - 5, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "900 20px Trebuchet MS";
    ctx.fillText(`${index + 1}. ${player.name}`, 424, y);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffcf4a";
    ctx.fillText(`+${player.heatPoints}  ·  ${player.points} pts`, 798, y);
  });
  if (snapshot.voteOptions?.length) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#9cb6c8";
    ctx.font = "800 13px Trebuchet MS";
    const voteLine = snapshot.voteOptions.map((option) => `${modifierNames[option] || option} ${snapshot.voteCounts?.[option] || 0}`).join("   ·   ");
    ctx.fillText(`PHONE VOTE:  ${voteLine}`, 600, 536);
  }
}

function drawPhotoFinish(snapshot) {
  drawRoad();
  const frames = snapshot.replayFrames || [];
  if (!frames.length) { drawPodium(snapshot); return; }
  const elapsed = Math.max(0, performance.now() - state.podiumStartedAt);
  const frame = frames[Math.min(frames.length - 1, Math.floor((elapsed / 3000) * frames.length))];
  const replayPlayers = frame.players.map((replay, index) => ({
    ...snapshot.players.find((player) => player.id === replay.id),
    ...replay,
    x: Math.max(-.9, Math.min(.9, replay.x + (index - (frame.players.length - 1) / 2) * .24)),
  }));
  const leaderDistance = Math.max(0, ...replayPlayers.map((player) => player.distance || 0));
  [...replayPlayers].reverse().forEach((player, index) => drawRacer(player, leaderDistance, index));
  ctx.fillStyle = "rgba(3,16,24,.86)";
  ctx.beginPath(); ctx.roundRect(380, 32, 440, 88, 20); ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffcf4a";
  ctx.font = "1000 38px Trebuchet MS";
  ctx.fillText("PHOTO FINISH REPLAY", 600, 88);
}

function drawPodium(snapshot) {
  const players = snapshot.players || [];
  ctx.textAlign = "center";
  ctx.fillStyle = "#31e6c1";
  ctx.font = "900 20px Trebuchet MS";
  ctx.fillText("FINAL RESULTS", 600, 78);
  ctx.fillStyle = "#fff";
  ctx.font = "1000 62px Trebuchet MS";
  ctx.fillText("Turbo Tilt Champions", 600, 142);
  if (["teams", "relay"].includes(snapshot.settings?.mode)) {
    const winner = Number(snapshot.teamScores?.[1] || 0) > Number(snapshot.teamScores?.[0] || 0) ? 2 : 1;
    ctx.fillStyle = "#ffcf4a";
    ctx.font = "900 24px Trebuchet MS";
    ctx.fillText(`TEAM ${winner} WINS · ${snapshot.teamScores?.[winner - 1] || 0} PTS`, 600, 178);
  }
  const top = players.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const heights = order.map((_, index) => index === 1 ? 250 : index === 0 ? 190 : 150);
  order.forEach((player, index) => {
    const x = 405 + index * 195;
    const h = heights[index];
    const rank = players.indexOf(player) + 1;
    ctx.fillStyle = player.color;
    ctx.fillRect(x - 82, 560 - h, 164, h);
    ctx.fillStyle = "#ffcf4a";
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = 8;
    ctx.font = "1000 52px Trebuchet MS";
    ctx.fillText(String(rank), x, 535 - h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = "900 21px Trebuchet MS";
    ctx.fillText(player.name, x, 590 - h);
    ctx.fillStyle = "#07141d";
    ctx.font = "900 17px Trebuchet MS";
    ctx.fillText(`${player.points} pts`, x, 618 - h);
  });
  const awards = snapshot.awards || [];
  awards.slice(0, 4).forEach((award, index) => {
    const player = players.find((item) => item.id === award.playerId);
    const x = 180 + index * 280;
    ctx.fillStyle = "rgba(3,16,24,.82)";
    ctx.beginPath(); ctx.roundRect(x - 118, 610, 236, 46, 13); ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffcf4a";
    ctx.font = "900 11px Trebuchet MS";
    ctx.fillText(String(award.title).toUpperCase(), x, 627);
    ctx.fillStyle = "#fff";
    ctx.font = "900 16px Trebuchet MS";
    ctx.fillText(player?.name || "Racer", x, 648);
  });
}

function draw() {
  ctx.save();
  if (performance.now() < state.shakeUntil) {
    const amount = (state.shakeUntil - performance.now()) / 420 * 9;
    ctx.translate(Math.sin(performance.now() * .13) * amount, Math.cos(performance.now() * .17) * amount);
  }
  drawBackdrop();
  const snapshot = state.snapshot;
  if (!snapshot || snapshot.phase === "lobby") drawLobby(snapshot);
  else if (snapshot.phase === "podium" && performance.now() - state.podiumStartedAt < 3200) drawPhotoFinish(snapshot);
  else if (snapshot.phase === "podium") drawPodium(snapshot);
  else drawRace(snapshot);
  ctx.restore();
}

function frame(now) {
  const dt = Math.min(.05, Math.max(0, (now - state.lastFrame) / 1000));
  state.lastFrame = now;
  if (state.snapshot?.phase === "racing") state.stripeOffset += dt * 190;
  draw();
  requestAnimationFrame(frame);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) byId("stageWrap").requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.().catch(() => {});
}

byId("startButton").addEventListener("click", () => {
  if (!state.audioEnabled) toggleAudio();
  sendHostAction("start");
});
byId("pauseButton").addEventListener("click", () => sendHostAction(state.snapshot?.phase === "paused" ? "resume" : "pause"));
byId("endButton").addEventListener("click", () => sendHostAction("end"));
byId("fullscreenButton").addEventListener("click", toggleFullscreen);
byId("soundButton").addEventListener("click", toggleAudio);
["modeSelect", "heatsSelect", "chaosSelect", "trackSelect", "accessibilityToggle"].forEach((id) => byId(id).addEventListener("change", sendSettings));
byId("quickStartButton").addEventListener("click", () => {
  byId("modeSelect").value = "classic";
  byId("heatsSelect").value = "3";
  byId("chaosSelect").value = "standard";
  byId("trackSelect").value = "all";
  byId("accessibilityToggle").checked = false;
  sendSettings();
});
byId("shareScreenButton").addEventListener("click", async () => {
  const url = displayUrl();
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    byId("shareScreenButton").textContent = "Link copied — open it on any TV";
  } catch {
    window.prompt("Copy this synchronized-screen link:", url);
  }
});
window.addEventListener("keydown", (event) => { if (event.key.toLowerCase() === "f") toggleFullscreen(); });
window.addEventListener("beforeunload", () => state.connection?.disconnect());

window.advanceTime = (ms) => {
  const amount = Math.max(0, Math.min(60000, Number(ms) || 0));
  state.testOffsetMs += amount;
  state.stripeOffset += amount * .19;
  draw();
};
window.render_game_to_text = () => JSON.stringify({
  coordinate_system: { origin: "top-left", x_axis: "right", y_axis: "down", canvas: { width: canvas.width, height: canvas.height }, track_x: "-1 left to +1 right", distance: "increases toward finish" },
  room_id: state.roomId,
  screen_role: state.displayMode ? "display" : "host",
  audio_enabled: state.audioEnabled,
  synchronized_display_count: Number(state.snapshot?.displayCount || 0),
  total_boosts_used: Number(state.snapshot?.totalBoosts || 0),
  phase: state.snapshot?.phase || "connecting",
  heat: state.snapshot?.heat || 0,
  mode: state.snapshot?.settings?.mode || "classic",
  settings: state.snapshot?.settings || {},
  track: state.snapshot?.track || "",
  modifier: state.snapshot?.modifier || "",
  vote_options: state.snapshot?.voteOptions || [],
  vote_counts: state.snapshot?.voteCounts || {},
  risk_routes: state.snapshot?.routes || [],
  shared_health: Number(state.snapshot?.sharedHealth || 0),
  awards: state.snapshot?.awards || [],
  replay_frame_count: state.snapshot?.replayFrames?.length || 0,
  seconds_remaining: Number(remainingSeconds().toFixed(1)),
  players: state.snapshot?.players || [],
  active_feedback: state.effects.map((effect) => ({ player_id: effect.playerId, type: effect.type })),
  visible_obstacles: state.snapshot?.obstacles?.filter((item) => {
    const leader = Math.max(0, ...(state.snapshot?.players || []).map((player) => player.distance || 0));
    return item.distance >= leader - 600 && item.distance <= leader + 600;
  }) || [],
});
if (["127.0.0.1", "localhost"].includes(location.hostname)) {
  window.__turbotiltPreviewEffect = (type, playerId = state.snapshot?.players?.[0]?.id) => {
    if (!playerId) return false;
    state.effects.push({ id: `preview:${type}:${performance.now()}`, playerId, type, startedAt: performance.now(), duration: 1250 });
    if (type === "barrier") state.shakeUntil = performance.now() + 420;
    return true;
  };
}

connectScreen().catch((error) => {
  byId("hostError").textContent = error.message || "Unable to start a room.";
  setServerStatus("Connection problem", "problem");
});
syncUi();
draw();
requestAnimationFrame(frame);
