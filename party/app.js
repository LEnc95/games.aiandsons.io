import { connect } from "/src/net/multiplayerClient.js";

const byId = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const allowedCode = /[^A-HJ-NP-Z]/g;
const state = {
  connection: null,
  roomId: "",
  playerId: "",
  playerName: "",
  playerColor: "#31e6c1",
  snapshot: null,
  tiltEnabled: false,
  calibrating: false,
  calibration: [],
  neutral: 0,
  tiltSteer: 0,
  buttonSteer: 0,
  sentSteer: 99,
  lastSentAt: 0,
  testOffsetMs: 0,
  retryingToken: false,
  lastEventId: 0,
  feedbackTimer: 0,
  selectedGadget: "shield",
  selectedVote: "",
  voteSignature: "",
};

function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(allowedCode, "").slice(0, 4);
}

function tokenKey(roomId) {
  return `aiandsons-party-player:${roomId}`;
}

function setConnectionLabel(label, kind = "") {
  const pill = byId("connectionPill");
  pill.textContent = label;
  pill.className = `connection-pill ${kind}`.trim();
}

function showController() {
  byId("landingView").hidden = true;
  byId("controllerView").hidden = false;
  window.scrollTo({ top: 0, behavior: "auto" });
  byId("controllerRoom").textContent = state.roomId;
  renderController();
}

async function joinParty({ withoutToken = false } = {}) {
  const code = normalizeCode(byId("roomCode").value || params.get("code"));
  const name = byId("playerName").value.trim();
  byId("joinError").textContent = "";
  if (code.length !== 4) {
    byId("joinError").textContent = "Enter the four letters shown on the big screen.";
    return;
  }
  if (name.length < 2 && withoutToken) {
    byId("joinError").textContent = "Enter a nickname with at least two characters.";
    return;
  }
  state.roomId = code;
  setConnectionLabel("Connecting…");
  state.connection?.disconnect();
  const savedToken = withoutToken ? "" : localStorage.getItem(tokenKey(code)) || "";
  const connection = await connect({
    gameId: "party",
    roomId: code,
    role: "player",
    playerName: name,
    token: savedToken,
  });
  state.connection = connection;
  connection.onStatus(({ status }) => {
    if (connection !== state.connection) return;
    if (status === "open") setConnectionLabel("Connected", "online");
    else if (status === "reconnecting") setConnectionLabel("Reconnecting…");
    else if (status === "error" || status === "timeout") setConnectionLabel("Connection problem", "problem");
  });
  connection.onStateUpdate((update) => {
    if (connection !== state.connection) return;
    state.snapshot = update.payload?.state || update.payload || null;
    renderController();
  });
  connection.onEvent((event) => handleEvent(connection, event));
}

function handleEvent(connection, event) {
  if (connection !== state.connection) return;
  const payload = event.payload || {};
  if (event.type === "welcome") {
    state.roomId = payload.roomId || state.roomId;
    state.playerId = payload.playerId || state.playerId;
    state.playerName = payload.playerName || "Racer";
    state.playerColor = payload.playerColor || state.playerColor;
    if (payload.token) localStorage.setItem(tokenKey(state.roomId), payload.token);
    byId("playerLabel").textContent = state.playerName;
    byId("playerDot").style.background = state.playerColor;
    showController();
    setConnectionLabel("Connected", "online");
    if (payload.nameAdjusted) byId("tiltHelp").textContent = `You joined as ${state.playerName}. Touch controls always work.`;
    return;
  }
  if (event.type === "error") {
    if (payload.code === "invalid_player_token" && !state.retryingToken) {
      state.retryingToken = true;
      localStorage.removeItem(tokenKey(state.roomId));
      connection.disconnect();
      joinParty({ withoutToken: true }).finally(() => { state.retryingToken = false; });
      return;
    }
    const message = payload.message || "Unable to join that room.";
    byId("joinError").textContent = message;
    if (!byId("controllerView").hidden) byId("controllerMessage").textContent = message;
    setConnectionLabel("Could not join", "problem");
  }
}

function phaseMessage(snapshot, me) {
  if (!snapshot) return "Waiting for room state";
  const remaining = Math.max(0, (Number(snapshot.phaseEndsAt) - (Date.now() + state.testOffsetMs)) / 1000);
  if (me?.queued) return "You’re in next heat";
  if (me?.eliminated) return "Eliminated — cheer on the finalists!";
  if (snapshot.phase === "lobby") return "Waiting for the host";
  if (snapshot.phase === "countdown") return `Get ready — ${Math.max(1, Math.ceil(remaining))}`;
  if (snapshot.phase === "racing" && snapshot.settings?.mode === "relay" && !me?.driving) return "Teammate driving — your turn is coming";
  if (snapshot.phase === "racing" && snapshot.settings?.mode === "survival") return `${Math.ceil(remaining)}s · Team health ${snapshot.sharedHealth}/6`;
  if (snapshot.phase === "racing") return `${Math.ceil(remaining)} seconds — tilt to steer!`;
  if (snapshot.phase === "intermission") return `Heat ${snapshot.heat} complete`;
  if (snapshot.phase === "paused") return snapshot.pauseReason === "host_disconnected" ? "Host reconnecting…" : "Game paused";
  if (snapshot.phase === "podium") return me?.rank === 1 ? "You won Turbo Tilt!" : `You finished #${me?.rank || "—"}`;
  return "Game ended";
}

function renderController() {
  const snapshot = state.snapshot;
  const me = snapshot?.players?.find((player) => player.id === (snapshot.selfId || state.playerId));
  const phase = snapshot?.phase || "lobby";
  const mode = String(snapshot?.settings?.mode || "classic").replaceAll("_", " ");
  byId("phaseLabel").textContent = `${mode} · ${phase}${snapshot?.heat ? ` · Heat ${snapshot.heat}/${snapshot.totalHeats}` : ""}`;
  byId("controllerMessage").textContent = phaseMessage(snapshot, me);
  byId("rankValue").textContent = me?.rank ? `#${me.rank}` : "—";
  byId("pointsValue").textContent = String(me?.points || 0);
  byId("boostValue").textContent = String(me?.boostCharges ?? 1);
  const canDrive = phase === "racing" && me?.active && !me?.eliminated && (snapshot?.settings?.mode !== "relay" || me?.driving);
  byId("boostButton").disabled = !canDrive || (me?.boostCharges ?? 0) < 1;
  byId("leftButton").disabled = !canDrive;
  byId("rightButton").disabled = !canDrive;
  byId("gadgetButton").disabled = !canDrive || !me?.gadgetAvailable;
  byId("gadgetButton").textContent = phase === "racing"
    ? (me?.gadgetAvailable ? `USE ${String(me?.gadget || state.selectedGadget).toUpperCase()}` : "GADGET USED")
    : `READY: ${state.selectedGadget.toUpperCase()}`;
  const choosing = ["lobby", "intermission", "countdown"].includes(phase);
  byId("choicePanel").hidden = !choosing;
  byId("gadgetPicker").hidden = !choosing;
  byId("garagePanel").hidden = phase !== "lobby";
  state.selectedGadget = me?.nextGadget || state.selectedGadget;
  document.querySelectorAll("[data-gadget]").forEach((button) => button.classList.toggle("selected", button.dataset.gadget === state.selectedGadget));
  renderVotes(snapshot);
}

const modifierLabels = {
  double_energy: "⚡ Double energy", moving_barriers: "↔ Moving barriers", mirror: "🪞 Mirror steering",
  super_boost: "🚀 Super boosts", fog: "🌫 Fog", sudden_death: "💀 Sudden death",
};

function renderVotes(snapshot) {
  const options = snapshot?.voteOptions || [];
  const show = snapshot?.phase === "intermission" && options.length > 0;
  byId("votePicker").hidden = !show;
  const signature = options.join("|");
  if (signature !== state.voteSignature) {
    state.voteSignature = signature;
    const target = byId("voteButtons");
    target.textContent = "";
    options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.vote = option;
      button.textContent = modifierLabels[option] || option;
      button.addEventListener("click", () => {
        state.selectedVote = option;
        state.connection?.sendInput({ type: "vote", choice: option });
        renderVotes(state.snapshot);
      });
      target.append(button);
    });
  }
  document.querySelectorAll("[data-vote]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.vote === state.selectedVote);
    const count = Number(snapshot?.voteCounts?.[button.dataset.vote] || 0);
    button.textContent = `${modifierLabels[button.dataset.vote] || button.dataset.vote}${count ? ` · ${count}` : ""}`;
  });
}

function showRaceFeedback(player) {
  const eventId = Number(player?.eventId || 0);
  if (!eventId || eventId === state.lastEventId) return;
  state.lastEventId = eventId;
  if (Date.now() - Number(player.lastEventAt || 0) > 2500) return;
  const feedback = byId("raceFeedback");
  const impact = player.lastEventType === "barrier";
  const messages = {
    barrier: "💥 Barrier hit — slowed for 1 second", energy: "⚡ Energy collected — +1 boost",
    energy_full: "⚡ Energy collected — boosts already full", shield_ready: "🛡 Shield armed",
    shield_block: "🛡 Barrier blocked!", magnet: "🧲 Energy magnet active",
    overcharge: "🚀 Overcharge!", repair: "🔧 Repaired and recharged",
    jump: "🌟 Perfect jump!", risk_route: "🔥 Risk route bonus!", turbo_chain: "⚡ Turbo chain!",
    horn: "📣 Horn!",
  };
  feedback.textContent = messages[player.lastEventType] || "Nice move!";
  feedback.className = `race-feedback${impact ? " impact" : ""}`;
  feedback.hidden = false;
  navigator.vibrate?.(impact ? [90, 45, 90] : [28, 30, 45]);
  clearTimeout(state.feedbackTimer);
  state.feedbackTimer = setTimeout(() => { feedback.hidden = true; }, 1800);
}

function orientationAxis(event) {
  const angle = Number(screen.orientation?.angle ?? window.orientation ?? 0);
  if (angle === 90) return -Number(event.beta || 0);
  if (angle === 270 || angle === -90) return Number(event.beta || 0);
  return Number(event.gamma || 0);
}

function onOrientation(event) {
  if (!state.tiltEnabled) return;
  const axis = orientationAxis(event);
  if (!Number.isFinite(axis)) return;
  if (state.calibrating) {
    state.calibration.push(axis);
    if (state.calibration.length >= 12) {
      state.neutral = state.calibration.reduce((sum, value) => sum + value, 0) / state.calibration.length;
      state.calibrating = false;
      byId("tiltHelp").textContent = "Tilt is calibrated. Buttons remain available anytime.";
      byId("tiltButton").textContent = "Recalibrate tilt";
    }
    return;
  }
  const delta = axis - state.neutral;
  state.tiltSteer = Math.abs(delta) < 2.5 ? 0 : Math.max(-1, Math.min(1, delta / 24));
  sendSteer();
  updateTiltMarker();
}

async function enableTilt() {
  try {
    if (typeof DeviceOrientationEvent === "undefined") throw new Error("Motion controls are not available on this phone.");
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") throw new Error("Motion permission was not granted. Use the left and right buttons.");
    }
    if (!state.tiltEnabled) window.addEventListener("deviceorientation", onOrientation, true);
    state.tiltEnabled = true;
    state.calibrating = true;
    state.calibration = [];
    byId("tiltHelp").textContent = "Hold still for a moment while we find center…";
    byId("tiltButton").textContent = "Calibrating…";
  } catch (error) {
    state.tiltEnabled = false;
    byId("tiltHelp").textContent = error.message || "Tilt unavailable. Use the left and right buttons.";
    byId("tiltButton").textContent = "Try tilt again";
  }
}

function effectiveSteer() {
  return state.buttonSteer || state.tiltSteer;
}

function sendSteer(force = false) {
  const now = performance.now();
  const value = effectiveSteer();
  if (!force && now - state.lastSentAt < 68) return;
  if (!force && Math.abs(value - state.sentSteer) < .04) return;
  state.lastSentAt = now;
  state.sentSteer = value;
  state.connection?.sendInput({ type: "steer", value });
}

function updateTiltMarker() {
  byId("tiltMarker").style.left = `${50 + effectiveSteer() * 43}%`;
}

function bindSteerButton(button, value) {
  const press = (event) => {
    event.preventDefault();
    try { button.setPointerCapture?.(event.pointerId); } catch {}
    button.classList.add("pressed");
    state.buttonSteer = value;
    sendSteer(true);
    updateTiltMarker();
  };
  const release = (event) => {
    try {
      if (event?.pointerId != null && button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
    } catch {}
    button.classList.remove("pressed");
    if (state.buttonSteer === value) state.buttonSteer = 0;
    sendSteer(true);
    updateTiltMarker();
  };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

byId("roomCode").addEventListener("input", (event) => { event.target.value = normalizeCode(event.target.value); });
byId("joinForm").addEventListener("submit", (event) => { event.preventDefault(); joinParty({ withoutToken: true }); });
byId("tiltButton").addEventListener("click", enableTilt);
bindSteerButton(byId("leftButton"), -1);
bindSteerButton(byId("rightButton"), 1);
byId("boostButton").addEventListener("click", () => {
  state.connection?.sendInput({ type: "boost" });
  navigator.vibrate?.(35);
});
byId("gadgetButton").addEventListener("click", () => state.connection?.sendInput({ type: "gadget", action: "use" }));
document.querySelectorAll("[data-gadget]").forEach((button) => button.addEventListener("click", () => {
  state.selectedGadget = button.dataset.gadget;
  state.connection?.sendInput({ type: "gadget", action: "select", choice: state.selectedGadget });
  renderController();
}));
function sendCustomization() {
  state.connection?.sendInput({ type: "customize", customization: {
    car: byId("carSelect").value, trail: byId("trailSelect").value, horn: byId("hornSelect").value,
  } });
}
["carSelect", "trailSelect", "hornSelect"].forEach((id) => byId(id).addEventListener("change", sendCustomization));
document.querySelectorAll("[data-emote]").forEach((button) => button.addEventListener("click", () => {
  state.connection?.sendInput({ type: "emote", emote: button.dataset.emote });
}));
byId("hornButton").addEventListener("click", () => state.connection?.sendInput({ type: "horn" }));
byId("leaveButton").addEventListener("click", () => {
  state.connection?.disconnect();
  if (state.roomId) localStorage.removeItem(tokenKey(state.roomId));
  location.href = "/party/";
});

setInterval(() => {
  if (!byId("controllerView").hidden) {
    renderController();
    const me = state.snapshot?.players?.find((player) => player.id === (state.snapshot?.selfId || state.playerId));
    showRaceFeedback(me);
  }
  sendSteer();
}, 100);

const initialCode = normalizeCode(params.get("code"));
if (initialCode) {
  byId("roomCode").value = initialCode;
  if (localStorage.getItem(tokenKey(initialCode))) {
    joinParty();
  } else {
    byId("playerName").focus();
  }
}

byId("watchCode").addEventListener("input", (event) => { event.target.value = normalizeCode(event.target.value); });
byId("watchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const code = normalizeCode(byId("watchCode").value);
  byId("watchError").textContent = code.length === 4 ? "" : "Enter the four letters shown by the host.";
  if (code.length === 4) location.href = `/turbotilt/?display=${encodeURIComponent(code)}`;
});

window.advanceTime = (ms) => {
  state.testOffsetMs += Math.max(0, Math.min(60000, Number(ms) || 0));
  renderController();
};
window.render_game_to_text = () => JSON.stringify({
  view: byId("controllerView").hidden ? "party-hub" : "controller",
  coordinate_system: { steering: "-1 left to +1 right" },
  room_id: state.roomId,
  player_id: state.playerId,
  tilt_enabled: state.tiltEnabled,
  effective_steer: Number(effectiveSteer().toFixed(2)),
  selected_gadget: state.selectedGadget,
  selected_vote: state.selectedVote,
  state: state.snapshot,
});
if (["127.0.0.1", "localhost"].includes(location.hostname)) {
  window.__turbotiltPreviewFeedback = (type) => showRaceFeedback({
    eventId: state.lastEventId + 1,
    lastEventType: type,
    lastEventAt: Date.now(),
  });
}
