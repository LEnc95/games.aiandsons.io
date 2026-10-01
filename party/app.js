import { createStickController } from "/sticktilt/controller.js";
import { connect } from "/src/net/multiplayerClient.js";
import { SketchStrokeBuffer } from "/party/sketch-input.js";
import { AVATAR_EMOJI, DEFAULT_AVATAR_EMOJI, isAvatarEmoji } from "/src/social/avatars.js";
import { createPartyAudio } from "/party/audio.js";

const byId = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const allowedCode = /[^A-HJ-NP-Z]/g;
const partyCanvas = byId("partyStage");
const partyCtx = partyCanvas.getContext("2d");
const screenMode = params.get("host") === "1" || normalizeCode(params.get("display")).length === 4;
const displayMode = normalizeCode(params.get("display")).length === 4;
const avatarStorageKey = "aiandsons-party-avatar";
const partySettingsStorageKey = "aiandsons-party-host-settings-v1";
const hostRecoveryStorageKey = "aiandsons-party-recent-host-v1";
const hostRecoveryTtlMs = 15 * 60 * 1000;
const state = {
  connection: null,
  roomId: "",
  playerId: "",
  playerName: "",
  playerColor: "#31e6c1",
  playerAvatar: DEFAULT_AVATAR_EMOJI,
  participantRole: "player",
  audienceId: "",
  gameKey: "",
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
  removed: false,
  lastEventId: 0,
  feedbackTimer: 0,
  selectedGadget: "shield",
  selectedVote: "",
  voteSignature: "",
  selectedChoice: "",
  selectedPrediction: "",
  selectedHotTake: false,
  sessionMode: "",
  screenRole: "",
  hostToken: "",
  embeddedGame: "",
  selectedPartyVote: "",
  partyAnimationFrame: 0,
  hostPartySettings: null,
  connectionStatus: "",
  connectionDiagnostics: { latencyMs: null, quality: "unknown", lastPongAt: 0 },
  rejoinedNoticeUntil: 0,
  hostRecoverySavedAt: 0,
  hostRecoveryNoticeTimer: 0,
};
const stickController = createStickController(byId("stickController"), (input) => { if (state.gameKey === "sticktilt") state.connection?.sendInput(input); }, vibrate);
const partyAudio = createPartyAudio({ sharedScreen: screenMode });

function loadSavedAvatar() {
  try {
    const saved = localStorage.getItem(avatarStorageKey);
    return isAvatarEmoji(saved) ? saved : DEFAULT_AVATAR_EMOJI;
  } catch {
    return DEFAULT_AVATAR_EMOJI;
  }
}

function renderAvatarPicker() {
  state.playerAvatar = loadSavedAvatar();
  const target = byId("avatarOptions");
  if (!target) return;
  target.textContent = "";
  AVATAR_EMOJI.forEach((avatar, index) => {
    const label = document.createElement("label");
    label.className = "avatar-option";
    label.setAttribute("aria-label", `Avatar ${index + 1}: ${avatar}`);
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "playerAvatar";
    input.value = avatar;
    input.setAttribute("aria-label", `Avatar ${index + 1}: ${avatar}`);
    input.checked = avatar === state.playerAvatar;
    input.addEventListener("change", () => {
      state.playerAvatar = avatar;
      try { localStorage.setItem(avatarStorageKey, avatar); } catch { /* Storage is optional. */ }
    });
    const preview = document.createElement("span");
    preview.setAttribute("aria-hidden", "true");
    preview.textContent = avatar;
    label.append(input, preview);
    target.append(label);
  });
}

function defaultPartySettings() {
  return { version: 1, durationPreset: "standard", playStyle: "mixed", accessibilityPreset: "standard", extendedTimers: false, reducedMotion: false, highContrast: false, effects: true, narration: true, haptics: true, selectionMethod: "chaos", repeatAvoidance: "session", catchUp: true, teamMode: "off", enabledActivities: null };
}

function partySettingsFromControls() {
  const activityInputs = [...document.querySelectorAll("#partyActivityPool input[data-activity-id]")];
  return {
    version: 1,
    durationPreset: byId("partyDurationSelect").value,
    playStyle: byId("partyPlayStyleSelect").value,
    accessibilityPreset: byId("partyAccessibilitySelect").value,
    extendedTimers: byId("partyExtendedTimers").checked,
    reducedMotion: byId("partyReducedMotion").checked,
    highContrast: byId("partyHighContrast").checked,
    effects: byId("partyEffects").checked,
    narration: byId("partyNarration").checked,
    haptics: byId("partyHaptics").checked,
    selectionMethod: byId("partySelectionSelect").value,
    repeatAvoidance: byId("partyRepeatSelect").value,
    catchUp: byId("partyCatchUp").checked,
    teamMode: byId("partyTeamMode").value,
    enabledActivities: activityInputs.length ? activityInputs.filter((input) => input.checked).map((input) => input.dataset.activityId) : (state.hostPartySettings?.enabledActivities || null),
  };
}

function renderPartyActivityPool(catalog = [], enabledActivities = null) {
  const target = byId("partyActivityPool");
  if (!catalog.length || target.dataset.ready === "true") return;
  const enabled = new Set(enabledActivities || catalog.map((activity) => activity.id));
  target.textContent = "";
  catalog.forEach((activity) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = enabled.has(activity.id);
    input.dataset.activityId = activity.id;
    input.addEventListener("change", () => {
      if (!target.querySelector("input:checked")) {
        input.checked = true;
        byId("sessionError").textContent = "Keep at least one activity in the party pool.";
        return;
      }
      sendPartyConfiguration();
    });
    label.append(input, document.createTextNode(activity.label));
    target.append(label);
  });
  target.dataset.ready = "true";
}

function syncPartySettingsControls(settings = defaultPartySettings()) {
  const accepted = { ...defaultPartySettings(), ...settings };
  byId("partyDurationSelect").value = accepted.durationPreset;
  byId("partyPlayStyleSelect").value = accepted.playStyle;
  byId("partyAccessibilitySelect").value = accepted.accessibilityPreset;
  byId("partyExtendedTimers").checked = Boolean(accepted.extendedTimers);
  byId("partyReducedMotion").checked = Boolean(accepted.reducedMotion);
  byId("partyHighContrast").checked = Boolean(accepted.highContrast);
  byId("partyEffects").checked = accepted.effects !== false;
  byId("partyNarration").checked = accepted.narration !== false;
  byId("partyHaptics").checked = accepted.haptics !== false;
  byId("partySelectionSelect").value = accepted.selectionMethod;
  byId("partyRepeatSelect").value = accepted.repeatAvoidance;
  byId("partyCatchUp").checked = accepted.catchUp !== false;
  byId("partyTeamMode").value = accepted.teamMode || "off";
  document.querySelectorAll("#partyActivityPool input[data-activity-id]").forEach((input) => { input.checked = !accepted.enabledActivities || accepted.enabledActivities.includes(input.dataset.activityId); });
  const counts = { quick: 3, standard: 6, marathon: 10 };
  byId("partyEstimate").textContent = `About ${(counts[accepted.durationPreset] || 6) * 5} min`;
}

function loadSavedPartySettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(partySettingsStorageKey) || "null");
    state.hostPartySettings = { ...defaultPartySettings(), ...(saved || {}) };
    syncPartySettingsControls(state.hostPartySettings);
  } catch {
    state.hostPartySettings = defaultPartySettings();
    syncPartySettingsControls(state.hostPartySettings);
  }
}

function sendPartyConfiguration() {
  const settings = partySettingsFromControls();
  state.hostPartySettings = settings;
  try { localStorage.setItem(partySettingsStorageKey, JSON.stringify(settings)); } catch { /* Storage is optional. */ }
  sendPartyHost("configure_party", { partySettings: settings });
}

function applyAccessibilityPreset(preset) {
  const values = {
    standard: { extendedTimers: false, reducedMotion: false, highContrast: false },
    family: { extendedTimers: true, reducedMotion: false, highContrast: true },
    relaxed: { extendedTimers: true, reducedMotion: true, highContrast: false },
  }[preset];
  if (!values) return;
  byId("partyExtendedTimers").checked = values.extendedTimers;
  byId("partyReducedMotion").checked = values.reducedMotion;
  byId("partyHighContrast").checked = values.highContrast;
}

function applyPartyPresentation(snapshot) {
  const settings = snapshot?.partySettings;
  document.body.classList.toggle("party-reduced-motion", Boolean(settings?.reducedMotion));
  document.body.classList.toggle("party-high-contrast", Boolean(settings?.highContrast));
}

function vibrate(pattern) {
  if (state.snapshot?.partySettings?.haptics !== false) navigator.vibrate?.(pattern);
}

function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(allowedCode, "").slice(0, 4);
}

function tokenKey(roomId, role = "player") {
  return `aiandsons-party-${role}:${roomId}`;
}

function loadHostRecovery() {
  try {
    const saved = JSON.parse(localStorage.getItem(hostRecoveryStorageKey) || "null");
    const roomId = normalizeCode(saved?.roomId);
    const savedAt = Number(saved?.savedAt || 0);
    if (roomId.length === 4 && typeof saved?.token === "string" && saved.token && Date.now() - savedAt < hostRecoveryTtlMs) {
      return { roomId, token: saved.token, savedAt };
    }
    localStorage.removeItem(hostRecoveryStorageKey);
  } catch { /* Storage is optional. */ }
  return null;
}

function rememberHostRecovery(roomId, token) {
  if (normalizeCode(roomId).length !== 4 || !token) return;
  const savedAt = Date.now();
  state.hostRecoverySavedAt = savedAt;
  try {
    sessionStorage.setItem(hostTokenKey(roomId), token);
    localStorage.setItem(hostRecoveryStorageKey, JSON.stringify({ roomId, token, savedAt }));
  } catch { /* Storage is optional. */ }
}

function forgetHostRecovery(roomId = "") {
  try {
    if (roomId) sessionStorage.removeItem(hostTokenKey(roomId));
    localStorage.removeItem(hostRecoveryStorageKey);
  } catch { /* Storage is optional. */ }
}

function renderHostRecoveryCard() {
  const recovery = loadHostRecovery();
  const card = byId("resumePartyCard");
  card.hidden = !recovery;
  if (recovery) byId("resumePartyRoom").textContent = recovery.roomId;
}

function setConnectionLabel(label, kind = "") {
  const pill = byId("connectionPill");
  pill.textContent = label;
  pill.className = `connection-pill ${kind}`.trim();
}

function updateConnectionDiagnostics(connection, detail = {}) {
  if (connection !== state.connection) return;
  const diagnostics = typeof connection.getDiagnostics === "function" ? connection.getDiagnostics() : detail;
  state.connectionDiagnostics = { ...state.connectionDiagnostics, ...diagnostics, ...detail };
  const latency = Number(state.connectionDiagnostics.latencyMs);
  if (state.connectionStatus === "open" && Number.isFinite(latency) && latency >= 0) {
    const quality = state.connectionDiagnostics.quality || (latency <= 120 ? "good" : latency <= 280 ? "fair" : "poor");
    setConnectionLabel(`${displayMode ? "Following live" : "Connected"} · ${Math.round(latency)} ms`, `online quality-${quality}`);
  }
}

function showController() {
  byId("landingView").hidden = true;
  byId("controllerView").hidden = false;
  byId("removedNotice").hidden = true;
  byId("controllerRoom").textContent = state.roomId;
  const partyPhase = state.snapshot?.partyPhase || "";
  const activityControls = partyPhase === "activity" || (partyPhase === "paused" && state.snapshot?.resumePartyPhase === "activity");
  const isParty = state.sessionMode === "rotation" && !activityControls;
  const isCrowdShift = !isParty && state.gameKey === "crowdshift";
  const isSketchClash = !isParty && state.gameKey === "sketchclash";
  const isStickTilt = !isParty && state.gameKey === "sticktilt";
  byId("partyController").hidden = !isParty;
  byId("turboController").hidden = isParty || isCrowdShift || isSketchClash || isStickTilt;
  byId("crowdController").hidden = isParty || !isCrowdShift;
  byId("stickController").hidden = !isStickTilt;
  ensureSketchController().hidden = !isSketchClash;
  const label = isParty ? "Party voting" : isStickTilt ? "Stick & Tilt" : isSketchClash ? "Sketch Clash" : isCrowdShift ? "Crowd Shift" : "Turbo Tilt";
  byId("controllerView").setAttribute("aria-label", `${label} phone controller`);
}

async function joinParty({ withoutToken = false, role = "player" } = {}) {
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
  state.participantRole = role;
  const savedToken = withoutToken ? "" : localStorage.getItem(tokenKey(code, role)) || "";
  const connection = await connect({
    gameId: "party",
    roomId: code,
    role,
    playerName: name,
    playerAvatar: state.playerAvatar,
    token: savedToken,
  });
  state.connection = connection;
  connection.onStatus(({ status }) => {
    if (connection !== state.connection) return;
    state.connectionStatus = status;
    if (status === "open") setConnectionLabel("Connected", "online");
    else if (status === "reconnecting") setConnectionLabel("Reconnecting…");
    else if (status === "error" || status === "timeout") setConnectionLabel("Connection problem", "problem");
    renderController();
  });
  connection.onStateUpdate((update) => {
    if (connection !== state.connection) return;
    const previous = state.snapshot;
    state.snapshot = update.payload?.state || update.payload || null;
    partyAudio.handleSnapshot(previous, state.snapshot);
    renderController();
  });
  connection.onEvent((event) => handleEvent(connection, event));
}

function handleEvent(connection, event) {
  if (connection !== state.connection) return;
  if (event.type === "connection_quality") {
    updateConnectionDiagnostics(connection, event);
    return;
  }
  const payload = event.payload || {};
  if (event.type === "welcome") {
    state.removed = false;
    state.roomId = payload.roomId || state.roomId;
    state.playerId = payload.playerId || state.playerId;
    state.audienceId = payload.audienceId || state.audienceId;
    state.participantRole = payload.role || state.participantRole;
    state.playerName = payload.playerName || "Racer";
    state.playerColor = payload.playerColor || state.playerColor;
    state.playerAvatar = isAvatarEmoji(payload.playerAvatar) ? payload.playerAvatar : state.playerAvatar;
    state.gameKey = payload.gameKey || state.gameKey || "turbotilt";
    state.sessionMode = payload.sessionMode || state.sessionMode;
    state.connectionStatus = "open";
    state.rejoinedNoticeUntil = payload.reconnected ? Date.now() + 3500 : 0;
    if (payload.token) localStorage.setItem(tokenKey(state.roomId, payload.role || state.participantRole), payload.token);
    byId("playerLabel").textContent = state.playerName;
    byId("playerDot").style.background = state.playerColor;
    byId("playerDot").textContent = state.playerAvatar;
    document.querySelectorAll("#controllerView .controller-game, #controllerView .controller-head").forEach((element) => { element.hidden = false; });
    showController();
    window.scrollTo({ top: 0, behavior: "auto" });
    renderController();
    setConnectionLabel("Connected", "online");
    partyAudio.welcome({ reconnected: Boolean(payload.reconnected), playerName: state.playerName }, state.snapshot);
    if (payload.nameAdjusted) byId("tiltHelp").textContent = `You joined as ${state.playerName}. Touch controls always work.`;
    return;
  }
  if (event.type === "error") {
    if (payload.code === "removed_from_room") {
      state.removed = true;
      const message = payload.message || "The host removed you from this room.";
      if (state.roomId) localStorage.removeItem(tokenKey(state.roomId, state.participantRole));
      byId("landingView").hidden = true;
      byId("controllerView").hidden = false;
      document.querySelectorAll("#controllerView .controller-game, #controllerView .controller-head").forEach((element) => { element.hidden = true; });
      byId("removedNotice").hidden = false;
      byId("removedNotice").querySelector("p").textContent = `${message} You can return to the Party Mode page and join a different room.`;
      setConnectionLabel("Removed by host", "problem");
      partyAudio.cue("error", state.snapshot);
      connection.disconnect();
      return;
    }
    if (payload.code === "invalid_player_token" && !state.retryingToken) {
      state.retryingToken = true;
      localStorage.removeItem(tokenKey(state.roomId, state.participantRole));
      connection.disconnect();
      joinParty({ withoutToken: true }).finally(() => { state.retryingToken = false; });
      return;
    }
    const message = payload.message || "Unable to join that room.";
    byId("joinError").textContent = message;
    if (!byId("controllerView").hidden) byId("controllerMessage").textContent = message;
    setConnectionLabel("Could not join", "problem");
    partyAudio.cue("error", state.snapshot);
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
  if (state.removed) return;
  const snapshot = state.snapshot;
  if (snapshot?.gameKey) state.gameKey = snapshot.gameKey;
  if (snapshot?.sessionMode) state.sessionMode = snapshot.sessionMode;
  applyPartyPresentation(snapshot);
  const activityControls = snapshot?.partyPhase === "activity" || (snapshot?.partyPhase === "paused" && snapshot?.resumePartyPhase === "activity");
  if (state.sessionMode === "rotation" && !activityControls) {
    showController();
    renderPartyController(snapshot);
    return;
  }
  showController();
  if (state.gameKey === "sticktilt") { stickController.render(snapshot, snapshot?.selfId || state.playerId); return; }
  if (state.gameKey === "crowdshift") {
    renderCrowdController(snapshot);
    return;
  }
  if (state.gameKey === "sketchclash") { renderSketchController(snapshot); return; }
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

function ensureSketchController() {
  let panel = byId("sketchController");
  if (panel) return panel;
  panel = document.createElement("section"); panel.id = "sketchController"; panel.className = "controller-game";
  panel.innerHTML = `<div class="sketch-status"><p class="eyebrow" id="sketchPhase" aria-live="polite">Sketch Clash</p><strong id="sketchTimer"></strong></div><h2 id="sketchTitle">Watch the shared screen</h2><p id="sketchRule">Draw pictures only — no letters or numbers.</p><div id="sketchChoices"></div><div class="sketch-canvas-wrap"><canvas id="sketchCanvas" width="900" height="600" aria-label="Private drawing canvas"></canvas></div><div id="sketchTools" class="sketch-tools"><fieldset><legend>Ink color</legend><div class="sketch-palette"><button class="swatch" data-sketch-color="#111827" aria-label="Charcoal"></button><button class="swatch" data-sketch-color="#ef476f" aria-label="Coral red"></button><button class="swatch" data-sketch-color="#ff9f1c" aria-label="Orange"></button><button class="swatch" data-sketch-color="#ffd166" aria-label="Sun yellow"></button><button class="swatch" data-sketch-color="#06d6a0" aria-label="Mint green"></button><button class="swatch" data-sketch-color="#118ab2" aria-label="Ocean blue"></button><button class="swatch" data-sketch-color="#6c5ce7" aria-label="Violet"></button><button class="swatch" data-sketch-color="#d946ef" aria-label="Magenta"></button><label class="custom-swatch" aria-label="Custom ink color"><input id="sketchCustomColor" type="color" value="#3b82f6"><span>+</span></label></div></fieldset><fieldset><legend>Pen size <output id="sketchPenSizeValue">12</output></legend><input id="sketchPenSize" type="range" min="2" max="30" value="12" step="1"></fieldset><fieldset><legend>Eraser size <output id="sketchEraserSizeValue">28</output></legend><input id="sketchEraserSize" type="range" min="8" max="48" value="28" step="2"></fieldset><div class="sketch-tool-actions"><button id="sketchPen" class="selected" type="button">✎ Pen</button><button id="sketchErase" type="button">◯ Eraser</button><button id="sketchUndo" type="button">↶ Undo</button><button id="sketchClear" type="button">Clear</button></div></div><form id="sketchGuessForm"><label>Your guess <input id="sketchGuess" maxlength="80" autocomplete="off" placeholder="What is it?" required></label><button>Send</button></form><p id="sketchResult" aria-live="polite"></p>`;
  byId("controllerView").append(panel);
  const canvas = panel.querySelector("canvas"), ctx=canvas.getContext("2d"), strokeBuffer=new SketchStrokeBuffer(); let drawing=false, sequence=0, color=localStorage.getItem("aiandsons-sketch-color")||"#111827", penWidth=Number(localStorage.getItem("aiandsons-sketch-pen")||12), eraserWidth=Number(localStorage.getItem("aiandsons-sketch-eraser")||28), tool="pen", lastSentAt=0, strokeCounter=0, strokeId="";
  panel._sketchRedraw=(snapshot)=>{if(drawing||panel.dataset.canvasRevision===String(snapshot?.canvasRevision??""))return;ctx.clearRect(0,0,canvas.width,canvas.height);for(const stroke of snapshot?.strokes||[]){if(!stroke.points?.length)continue;ctx.strokeStyle=stroke.tool==="eraser"?"#fff":stroke.color;ctx.lineWidth=stroke.width;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(stroke.points[0].x*canvas.width,stroke.points[0].y*canvas.height);for(const p of stroke.points.slice(1))ctx.lineTo(p.x*canvas.width,p.y*canvas.height);ctx.stroke();}panel.dataset.canvasRevision=String(snapshot?.canvasRevision??"");};
  const send=(keepTail=true)=>{
    const batch=strokeBuffer.drain({keepTail});if(!batch.length)return;
    const snap=state.snapshot;
    state.connection?.sendInput({type:"stroke",roundId:snap?.roundId,stroke:{roundId:snap?.roundId,strokeId,sequence:++sequence,tool,color,width:tool==="eraser"?eraserWidth:penWidth,points:batch}});
    lastSentAt=performance.now();
  };
  const point=(event)=>{const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(event.clientY-r.top)/r.height)),t:Date.now()};};
  canvas.addEventListener("pointerdown",e=>{if(state.snapshot?.currentArtistId!==(state.snapshot?.selfId||state.playerId)||state.snapshot?.phase!=="drawing")return;e.preventDefault();drawing=true;sequence=Math.max(sequence,state.snapshot.strokeSequence||0);strokeId=`${state.playerId||"artist"}-${Date.now()}-${++strokeCounter}`;lastSentAt=performance.now();canvas.setPointerCapture(e.pointerId);strokeBuffer.begin(point(e));});
  canvas.addEventListener("pointermove",e=>{if(!drawing)return;e.preventDefault();const coalesced=e.getCoalescedEvents?.()||[],samples=coalesced.length?coalesced:[e];for(const sample of samples){const p=point(sample), q=strokeBuffer.last;if(!q){strokeBuffer.begin(p);continue;}ctx.strokeStyle=tool==="eraser"?"#fff":color;ctx.lineWidth=tool==="eraser"?eraserWidth:penWidth;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(q.x*900,q.y*600);ctx.lineTo(p.x*900,p.y*600);ctx.stroke();strokeBuffer.add(p);}if(performance.now()-lastSentAt>=25||strokeBuffer.length>=64)send(true);});
  const finishStroke=()=>{if(!drawing)return;drawing=false;send(false);strokeBuffer.clear();};
  canvas.addEventListener("pointerup",finishStroke);canvas.addEventListener("pointercancel",finishStroke);canvas.addEventListener("lostpointercapture",finishStroke);
  const selectTool=(next)=>{tool=next;byId("sketchPen").classList.toggle("selected",tool==="pen");byId("sketchErase").classList.toggle("selected",tool==="eraser");};
  const selectColor=(next)=>{color=next;localStorage.setItem("aiandsons-sketch-color",color);selectTool("pen");panel.querySelectorAll("[data-sketch-color]").forEach(b=>b.classList.toggle("selected",b.dataset.sketchColor.toLowerCase()===color.toLowerCase()));};
  panel.querySelectorAll("[data-sketch-color]").forEach(b=>{b.style.setProperty("--swatch",b.dataset.sketchColor);b.onclick=()=>selectColor(b.dataset.sketchColor);});byId("sketchCustomColor").oninput=e=>selectColor(e.target.value);byId("sketchPen").onclick=()=>selectTool("pen");byId("sketchErase").onclick=()=>selectTool("eraser");
  byId("sketchPenSize").value=String(penWidth);byId("sketchPenSizeValue").value=String(penWidth);byId("sketchPenSize").oninput=e=>{penWidth=Number(e.target.value);byId("sketchPenSizeValue").value=String(penWidth);localStorage.setItem("aiandsons-sketch-pen",String(penWidth));selectTool("pen");};
  byId("sketchEraserSize").value=String(eraserWidth);byId("sketchEraserSizeValue").value=String(eraserWidth);byId("sketchEraserSize").oninput=e=>{eraserWidth=Number(e.target.value);byId("sketchEraserSizeValue").value=String(eraserWidth);localStorage.setItem("aiandsons-sketch-eraser",String(eraserWidth));selectTool("eraser");};
  byId("sketchUndo").onclick=()=>state.connection?.sendInput({type:"canvas_action",action:"undo"});byId("sketchClear").onclick=()=>{if(confirm("Clear the canvas? You can undo this once."))state.connection?.sendInput({type:"canvas_action",action:"clear"});};selectColor(color);
  byId("sketchGuessForm").addEventListener("submit",e=>{e.preventDefault();const input=byId("sketchGuess"), guess=input.value.trim();if(!guess)return;state.connection?.sendInput({type:"guess",guess});byId("sketchResult").textContent="Guess sent — keep trying if it isn't right.";input.value="";}); return panel;
}
function renderSketchController(snapshot) {
 const panel=ensureSketchController(), me=snapshot?.selfId||state.playerId, artist=snapshot?.players?.find(p=>p.id===snapshot?.currentArtistId), isArtist=me===snapshot?.currentArtistId, phase=snapshot?.phase||"lobby", seconds=Math.max(0,Math.ceil((Number(snapshot?.phaseEndsAt||0)-Date.now())/1000));
 panel._sketchRedraw?.(snapshot);
 byId("sketchPhase").textContent=`${phase.replaceAll("_"," ")} · ${seconds}s`;byId("sketchTimer").textContent=seconds?`${seconds} seconds remaining`:"";byId("sketchChoices").textContent="";byId("sketchCanvas").hidden=!(isArtist&&phase==="drawing");byId("sketchTools").hidden=!(isArtist&&phase==="drawing");byId("sketchGuessForm").hidden=isArtist||phase!=="drawing"||Boolean(snapshot?.hasGuessedCorrectly);
 if(snapshot?.hasGuessedCorrectly)byId("sketchResult").textContent="Correct! Nice guess.";else if(phase!=="drawing")byId("sketchResult").textContent="";
 if(phase==="choosing_prompt"&&isArtist){byId("sketchTitle").textContent="Choose a secret word";(snapshot?.promptChoices||[]).forEach(p=>{const b=document.createElement("button");b.textContent=p.text;b.onclick=()=>state.connection?.sendInput({type:"choose_prompt",choice:p.id});byId("sketchChoices").append(b);});} else if(phase==="drawing"&&isArtist){byId("sketchTitle").textContent=`Draw: ${snapshot?.selectedPrompt?.text||"your word"}`;} else if(snapshot?.hasGuessedCorrectly){byId("sketchTitle").textContent="✓ Correct! Watch the display.";} else if(phase==="round_recap"||phase==="podium"){byId("sketchTitle").textContent=`Answer: ${snapshot?.answer||"—"}`;} else {byId("sketchTitle").textContent=`${artist?.name||"Artist"} is drawing — watch the shared screen`;}
}

function renderPartyController(snapshot) {
  const me = snapshot?.players?.find((player) => player.id === (snapshot?.selfId || state.playerId));
  const audience = state.participantRole === "audience";
  const phase = snapshot?.partyPhase || "party_lobby";
  const remaining = Math.max(0, (Number(snapshot?.phaseEndsAt || 0) - (Date.now() + state.testOffsetMs)) / 1000);
  const vote = snapshot?.partyVote || {};
  const winner = vote.options?.find((option) => option.id === vote.winnerOptionId);
  byId("partyPhaseLabel").textContent = phase.replaceAll("_", " ");
  byId("partyRank").textContent = me?.partyRank ? `#${me.partyRank}` : "—";
  byId("partyPoints").textContent = String(me?.partyPoints || 0);
  byId("partyWins").textContent = String(me?.activityWins || 0);
  byId("audienceBadge").hidden = !audience;
  byId("audiencePanel").hidden = !audience;
  let message = "Waiting for the host to start the party";
  if (phase === "voting") message = snapshot?.partySettings?.selectionMethod === "host" ? "The host is choosing the next game" : `${Math.ceil(remaining)} seconds to vote`;
  else if (phase === "spinning") message = "The wheel is spinning!";
  else if (phase === "next_up") message = winner?.label || snapshot?.activity?.label || "Next activity incoming";
  else if (phase === "results") message = snapshot?.activitySkipped ? "Activity skipped" : me?.partyAward ? `+${me.partyAward} party points!` : "Activity complete";
  else if (phase === "paused") message = snapshot?.pauseReason === "host_disconnected" ? "Host reconnecting…" : "Party paused";
  else if (phase === "ended") message = me?.partyRank === 1 ? "You won the party!" : `Party finished · #${me?.partyRank || "—"}`;
  if (["connecting", "reconnecting", "closed"].includes(state.connectionStatus) && state.playerId) message = "Rejoining… Your name, avatar, and score are saved.";
  else if (state.rejoinedNoticeUntil > Date.now()) message = `Welcome back, ${state.playerName}! Your spot is restored.`;
  byId("partyMessage").textContent = message;
  const inLobby = phase === "party_lobby";
  byId("partyLobbyGuide").hidden = !inLobby || audience;
  byId("partyEncorePanel").hidden = phase !== "ended";
  const ready = Boolean(me?.ready);
  byId("partyReadyButton").hidden = audience;
  byId("partyReadyButton").textContent = ready ? "Ready ✓" : "I’m ready";
  byId("partyReadyButton").setAttribute("aria-pressed", String(ready));
  updateInviteButton(byId("partyPlayerInviteButton"), snapshot, "Invite another player");
  const selectionCopy = {
    chaos: "Vote for an activity; every ballot becomes a wheel slice.",
    majority: "Vote for an activity; the most votes wins.",
    unanimous: "Agree on one activity, or the wheel breaks the tie.",
    host: "The host will choose the next activity.",
  }[snapshot?.partySettings?.selectionMethod || "chaos"];
  byId("partySelectionHelp").textContent = selectionCopy;
  const voting = phase === "voting" && snapshot?.partySettings?.selectionMethod !== "host";
  byId("partyVotePanel").hidden = !voting;
  const ownBallot = audience
    ? vote.ballots?.find((ballot) => ballot.id === "audience")
    : vote.ballots?.find((ballot) => ballot.playerId === me?.id);
  if (ownBallot) state.selectedPartyVote = ownBallot.optionId;
  const target = byId("partyVoteButtons");
  const signature = (vote.options || []).map((option) => option.id).join("|");
  if (target.dataset.signature !== signature) {
    target.dataset.signature = signature;
    target.textContent = "";
    (vote.options || []).forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.partyVote = option.id;
      const title = document.createElement("strong");
      title.textContent = option.label;
      const copy = document.createElement("span");
      copy.textContent = option.description;
      const voters = document.createElement("small");
      voters.className = "party-voters";
      button.append(title, copy, voters);
      button.addEventListener("click", () => {
        state.selectedPartyVote = option.id;
        state.connection?.sendInput({ type: "party_vote", optionId: option.id });
        renderPartyController(state.snapshot);
        partyAudio.cue("select", state.snapshot);
        vibrate(25);
      });
      target.append(button);
    });
  }
  target.querySelectorAll("[data-party-vote]").forEach((button) => {
    const optionId = button.dataset.partyVote;
    const names = (vote.ballots || []).filter((ballot) => ballot.optionId === optionId).map((ballot) => `${ballot.playerAvatar || DEFAULT_AVATAR_EMOJI} ${ballot.playerName}`);
    button.classList.toggle("selected", optionId === state.selectedPartyVote);
    button.disabled = !voting;
    button.querySelector(".party-voters").textContent = names.length ? `Voted: ${names.join(", ")}` : "No votes yet";
  });
  byId("partyVoteStatus").textContent = voting
    ? audience ? "Your audience vote updates the collective ballot." : "Your named vote appears live. Change it anytime before the spin."
    : "Watch the shared screen.";
  renderPhoneStandings(snapshot);
}

function renderPhoneStandings(snapshot) {
  const target = byId("phoneStandings");
  target.textContent = "";
  [...(snapshot?.players || [])].sort((a, b) => (a.partyRank || 99) - (b.partyRank || 99)).forEach((player) => {
    const row = document.createElement("li");
    row.style.setProperty("--player", player.color);
    const dot = document.createElement("i");
    dot.textContent = player.avatar || DEFAULT_AVATAR_EMOJI;
    const name = document.createElement("b");
    name.textContent = `#${player.partyRank || "—"} ${player.name}`;
    const points = document.createElement("span");
    points.textContent = `${player.partyPoints || 0} pts`;
    row.append(dot, name, points);
    target.append(row);
  });
}

function hostTokenKey(roomId) {
  return `aiandsons-party-host:${roomId}`;
}

const crowdRuleLabels = {
  majority: "FOLLOW THE CROWD · The bigger side scores 1,000",
  minority: "BACK THE UNDERDOG · The smaller side scores 1,200",
  split: "PERFECT SPLIT · Get the room within one vote",
  unanimous: "ALL TOGETHER · Everyone must pick the same side",
  duel_sync: "SYNC ROUND · Match choices for 400 each",
  duel_clash: "CLASH ROUND · Opposite choices for 400 each",
};

function renderCrowdController(snapshot) {
  const me = snapshot?.players?.find((player) => player.id === (snapshot?.selfId || state.playerId));
  const phase = snapshot?.phase || "lobby";
  const round = Number(snapshot?.round || 0);
  const remaining = Math.max(0, (Number(snapshot?.phaseEndsAt || 0) - (Date.now() + state.testOffsetMs)) / 1000);
  const prompt = snapshot?.prompt || {};
  const duel = Boolean(snapshot?.duel);
  const rival = snapshot?.players?.find((player) => player.id !== me?.id && player.active && !player.queued);
  if (me?.choice) state.selectedChoice = me.choice;
  if (me?.prediction) state.selectedPrediction = me.prediction;
  state.selectedHotTake = Boolean(me?.hotTake);
  if (phase === "intermission" || phase === "choosing" && !me?.choice && !me?.prediction) {
    state.selectedChoice = "";
    state.selectedPrediction = "";
    state.selectedHotTake = false;
  }
  const hasChoice = Boolean(me?.hasChosen || state.selectedChoice);
  const hasPrediction = Boolean(me?.hasPredicted || state.selectedPrediction);

  byId("crowdPhaseLabel").textContent = round ? `${phase} · Round ${round}/${snapshot?.totalRounds || 7}` : phase;
  byId("crowdRound").textContent = round ? `${round}/${snapshot?.totalRounds || 7}` : "—";
  const hasScores = snapshot?.players?.some((player) => Number(player.points) > 0);
  byId("crowdRank").textContent = hasScores && me?.rank ? `#${me.rank}` : "—";
  byId("crowdPoints").textContent = String(me?.points || 0);
  let message = "Waiting for the host";
  if (me?.queued) message = "You join next round";
  else if (phase === "countdown") message = `First choice in ${Math.max(1, Math.ceil(remaining))}`;
  else if (phase === "choosing") message = duel && (!hasChoice || !hasPrediction) ? `${Math.ceil(remaining)} seconds—pick and predict` : hasChoice ? "Locked—watch the showdown" : `${Math.ceil(remaining)} seconds to choose`;
  else if (phase === "reveal") message = me?.roundPoints ? `+${me.roundPoints.toLocaleString()} points!` : duel ? "Your rival escaped the read" : "The crowd has spoken";
  else if (phase === "intermission") message = "Next dilemma incoming";
  else if (phase === "paused") message = snapshot?.pauseReason === "host_disconnected" ? "Host reconnecting…" : "Game paused";
  else if (phase === "podium") message = me?.rank === 1 ? "You shifted the crowd!" : `You finished #${me?.rank || "—"}`;
  else if (phase === "ended") message = "Game ended";
  byId("crowdMessage").textContent = message;
  byId("crowdRule").textContent = crowdRuleLabels[snapshot?.rule] || "Watch the big screen";
  byId("crowdQuestion").textContent = prompt.question || "Get ready to pick a side.";
  byId("crowdLeftText").textContent = prompt.left || "Option A";
  byId("crowdRightText").textContent = prompt.right || "Option B";
  byId("crowdPrompt").classList.toggle("duel-active", duel);
  byId("duelPanel").hidden = !duel;
  byId("duelRival").textContent = rival?.name || "your rival";
  byId("duelPredictLeftText").textContent = prompt.left || "Option A";
  byId("duelPredictRightText").textContent = prompt.right || "Option B";

  const canChoose = phase === "choosing" && me?.active && !me?.queued;
  ["left", "right"].forEach((choice) => {
    const button = byId(choice === "left" ? "crowdLeft" : "crowdRight");
    button.disabled = !canChoose;
    button.classList.toggle("selected", state.selectedChoice === choice);
  });
  ["left", "right"].forEach((prediction) => {
    const button = byId(prediction === "left" ? "duelPredictLeft" : "duelPredictRight");
    button.disabled = !duel || !canChoose;
    button.classList.toggle("selected", state.selectedPrediction === prediction);
  });
  const hotTake = byId("duelHotTake");
  hotTake.disabled = !duel || !canChoose || !me?.hotTakeAvailable;
  hotTake.classList.toggle("selected", state.selectedHotTake);
  hotTake.classList.toggle("used", duel && !me?.hotTakeAvailable);
  hotTake.querySelector("b").textContent = me?.hotTakeAvailable ? "🔥 HOT TAKE" : "✓ HOT TAKE USED";
  let status = "Your choice stays secret until the reveal.";
  if (me?.queued) status = "Cheer this round—your first choice is next.";
  else if (phase === "choosing" && duel && (!hasChoice || !hasPrediction)) status = "Lock your own choice and your prediction. Both stay secret.";
  else if (phase === "choosing" && hasChoice) status = "Locked! You can still change your play before time runs out.";
  else if (phase === "reveal" && duel) status = `${me?.readCorrect ? `Mind read! +${(me.readPoints || 0).toLocaleString()}` : "Read missed."}${me?.stealPoints ? ` You stole ${me.stealPoints.toLocaleString()}!` : ""}`;
  else if (phase === "reveal") status = `${snapshot?.resultHeadline || "Reveal!"} ${snapshot?.leftCount || 0}–${snapshot?.rightCount || 0}`;
  else if (phase === "podium") status = `Final score: ${(me?.points || 0).toLocaleString()}`;
  byId("crowdChoiceStatus").textContent = status;
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
  vibrate(impact ? [90, 45, 90] : [28, 30, 45]);
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
  if (state.gameKey !== "turbotilt") return;
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

async function connectSessionScreen() {
  byId("landingView").hidden = true;
  byId("controllerView").hidden = true;
  byId("sessionView").hidden = false;
  state.screenRole = displayMode ? "display" : "host";
  byId("sessionRole").textContent = displayMode ? "Synchronized party screen" : "Party host";
  byId("hostControls").hidden = displayMode;
  const requestedRoom = displayMode ? normalizeCode(params.get("display")) : normalizeCode(params.get("room"));
  const recovery = !displayMode && requestedRoom ? loadHostRecovery() : null;
  const token = !displayMode && requestedRoom ? sessionStorage.getItem(hostTokenKey(requestedRoom)) || (recovery?.roomId === requestedRoom ? recovery.token : "") : "";
  const connection = await connect({
    gameId: "party", gameKey: "party", role: state.screenRole,
    roomId: requestedRoom, token,
  });
  state.connection = connection;
  connection.onStatus(({ status }) => {
    if (connection !== state.connection) return;
    if (status === "open") setConnectionLabel(displayMode ? "Following live" : "Connected", "online");
    else if (status === "reconnecting") setConnectionLabel("Reconnecting…");
    else if (status === "error" || status === "timeout") setConnectionLabel("Connection problem", "problem");
  });
  connection.onStateUpdate((update) => {
    if (connection !== state.connection) return;
    const previous = state.snapshot;
    state.snapshot = update.payload?.state || update.payload || null;
    partyAudio.handleSnapshot(previous, state.snapshot);
    state.gameKey = state.snapshot?.gameKey || state.gameKey;
    state.sessionMode = state.snapshot?.sessionMode || state.sessionMode;
    if (!displayMode && state.hostToken && Date.now() - state.hostRecoverySavedAt > 60000) rememberHostRecovery(state.roomId, state.hostToken);
    renderSessionScreen();
  });
  connection.onEvent((event) => {
    if (connection !== state.connection) return;
    if (event.type === "connection_quality") {
      updateConnectionDiagnostics(connection, event);
      return;
    }
    const payload = event.payload || {};
    if (event.type === "welcome") {
      state.roomId = payload.roomId || state.roomId;
      state.hostToken = payload.token || state.hostToken;
      state.sessionMode = payload.sessionMode || state.sessionMode;
      if (!displayMode && state.hostToken) {
        rememberHostRecovery(state.roomId, state.hostToken);
        const url = new URL(location.href);
        url.searchParams.set("host", "1");
        url.searchParams.set("room", state.roomId);
        history.replaceState({}, "", url);
        const notice = byId("hostRecoveryNotice");
        notice.hidden = !payload.reconnected;
        clearTimeout(state.hostRecoveryNoticeTimer);
        if (payload.reconnected) state.hostRecoveryNoticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
      }
      byId("sessionRoom").textContent = state.roomId || "----";
      renderSessionQr();
      renderSessionScreen();
      partyAudio.welcome({ reconnected: Boolean(payload.reconnected) }, state.snapshot);
      if (!displayMode && !requestedRoom) {
        syncPartySettingsControls(state.hostPartySettings || defaultPartySettings());
        sendPartyConfiguration();
      }
    } else if (event.type === "error") {
      byId("sessionError").textContent = payload.message || "The party server rejected that action.";
      const failedRoom = state.roomId || requestedRoom;
      if (["invalid_host_token", "room_not_found"].includes(payload.code) && failedRoom) forgetHostRecovery(failedRoom);
      partyAudio.cue("error", state.snapshot);
    }
  });
}

function renderSessionQr() {
  const target = byId("sessionQr");
  target.textContent = "";
  if (!state.roomId || typeof window.qrcode !== "function") return;
  const qr = window.qrcode(0, "M");
  qr.addData(playerInviteUrl().toString());
  qr.make();
  const qrDocument = new DOMParser().parseFromString(
    qr.createSvgTag(4, 1, "Scan to join the party", "Party room QR code"),
    "image/svg+xml",
  );
  if (!qrDocument.querySelector("parsererror") && qrDocument.documentElement.localName === "svg") {
    target.append(document.importNode(qrDocument.documentElement, true));
  }
}

function sendPartyHost(action, details = {}) {
  byId("sessionError").textContent = "";
  state.connection?.sendInput({ type: "host", action, ...details });
}

function partyUrlWithRoom(parameter) {
  const url = new URL("/party/", location.origin);
  url.searchParams.set(parameter, state.roomId);
  const endpoint = params.get("ws") || params.get("endpoint");
  if (endpoint) url.searchParams.set("ws", endpoint);
  return url;
}

function playerInviteUrl() {
  return partyUrlWithRoom("code");
}

function displayInviteUrl() {
  return partyUrlWithRoom("display");
}

function inviteAvailability(snapshot) {
  if (snapshot?.roomLocked) return { available: false, label: "Room is locked" };
  if (snapshot?.allowLateJoin === false && snapshot?.partyPhase !== "party_lobby") return { available: false, label: "Late joining is off" };
  if ((snapshot?.players?.length || 0) >= Number(snapshot?.maxPlayers || 8)) return { available: false, label: "Room is full" };
  return { available: true, label: "" };
}

function updateInviteButton(button, snapshot, availableLabel) {
  const availability = inviteAvailability(snapshot);
  button.disabled = !availability.available;
  button.textContent = availability.available ? availableLabel : availability.label;
}

async function sharePlayerInvite(button, statusElement) {
  if (!state.roomId || button.disabled) return;
  const url = playerInviteUrl().toString();
  const shareData = { title: "Join my AI and Sons party", text: `Join room ${state.roomId}`, url };
  statusElement.textContent = "";
  try {
    if (typeof navigator.share === "function") {
      await navigator.share(shareData);
      statusElement.textContent = "Invite ready to send.";
      return;
    }
    await navigator.clipboard.writeText(url);
    statusElement.textContent = "Player invite link copied.";
  } catch (error) {
    if (error?.name === "AbortError") return;
    try {
      await navigator.clipboard.writeText(url);
      statusElement.textContent = "Player invite link copied.";
    } catch {
      statusElement.textContent = `Share this link: ${url}`;
    }
  }
}

function renderSessionScreen() {
  const snapshot = state.snapshot;
  const players = snapshot?.players || [];
  const connected = players.filter((player) => player.connected).length;
  const partyPhase = snapshot?.partyPhase || "party_lobby";
  byId("sessionRoom").textContent = state.roomId || snapshot?.roomId || "----";
  const maxPlayers = Number(snapshot?.maxPlayers || 8);
  byId("sessionPlayerCount").textContent = `${connected} / ${maxPlayers} players`;
  byId("sessionAudienceCount").textContent = `${Number(snapshot?.audienceCount || 0)} audience`;
  const targetActivities = Number(snapshot?.partySettings?.targetActivities || 6);
  const completedActivities = Math.min(Number(snapshot?.activityIndex || 0), targetActivities);
  byId("sessionProgress").textContent = partyPhase === "party_lobby"
    ? `${targetActivities}-game party · about ${Number(snapshot?.estimatedMinutes || targetActivities * 5)} min`
    : partyPhase === "ended" ? `${completedActivities} games complete` : `Game ${Math.min(completedActivities + 1, targetActivities)} of ${targetActivities}`;
  byId("sessionScreenCount").textContent = `${1 + Number(snapshot?.displayCount || 0)} live screen${Number(snapshot?.displayCount || 0) ? "s" : ""}`;
  renderSessionRoster(players);
  renderPartyTeams(snapshot);
  renderPartyHighlights(snapshot);
  const host = !displayMode;
  applyPartyPresentation(snapshot);
  renderPartyActivityPool(snapshot?.activityCatalog || [], snapshot?.partySettings?.enabledActivities);
  if (host) {
    const locked = Boolean(snapshot?.roomLocked);
    const allowLateJoin = snapshot?.allowLateJoin !== false;
    const friendlyNames = Boolean(snapshot?.friendlyNames);
    const audienceEnabled = snapshot?.audienceEnabled !== false;
    byId("roomAccessStatus").textContent = locked ? "Locked" : "Open";
    byId("roomAccessStatus").classList.toggle("locked", locked);
    byId("partyLockButton").textContent = locked ? "Unlock room" : "Lock room";
    byId("partyLockButton").classList.toggle("is-active", locked);
    byId("partyLockButton").setAttribute("aria-pressed", String(locked));
    byId("partyLateJoinButton").textContent = `Late joining: ${allowLateJoin ? "On" : "Off"}`;
    byId("partyLateJoinButton").classList.toggle("is-active", !allowLateJoin);
    byId("partyLateJoinButton").setAttribute("aria-pressed", String(allowLateJoin));
    byId("partyFriendlyNamesButton").textContent = `Friendly names: ${friendlyNames ? "On" : "Off"}`;
    byId("partyFriendlyNamesButton").classList.toggle("is-active", friendlyNames);
    byId("partyFriendlyNamesButton").setAttribute("aria-pressed", String(friendlyNames));
    byId("partyAudienceButton").textContent = `Audience: ${audienceEnabled ? "On" : "Off"}`;
    byId("partyAudienceButton").classList.toggle("is-active", audienceEnabled);
    byId("partyAudienceButton").setAttribute("aria-pressed", String(audienceEnabled));
    byId("partyModerationSelect").value = snapshot?.moderationLevel || "standard";
    updateInviteButton(byId("partyInviteButton"), snapshot, "Invite players");
    byId("partyMaxPlayersSelect").value = String(maxPlayers);
    [...byId("partyMaxPlayersSelect").options].forEach((option) => { option.disabled = Number(option.value) < players.length; });
    const setupOpen = partyPhase === "party_lobby";
    syncPartySettingsControls(snapshot?.partySettings || state.hostPartySettings || partySettingsFromControls());
    byId("partyShuffleTeamsButton").hidden = !setupOpen || (snapshot?.partySettings?.teamMode || "off") !== "two";
    byId("partySetupControls").setAttribute("aria-disabled", String(!setupOpen));
    byId("partySetupControls").querySelectorAll("select,input").forEach((control) => { control.disabled = !setupOpen; });
    renderHostChoice(snapshot);
  }
  byId("partyStartButton").hidden = !host || partyPhase !== "party_lobby";
  byId("partyStartButton").disabled = connected < 2;
  const readyCount = Number(snapshot?.readyCount || 0);
  byId("partyStartButton").textContent = connected < 2 ? "Start with 2 players" : `Start Party · ${readyCount}/${connected} ready`;
  byId("partyAgainButton").hidden = !host || partyPhase !== "ended";
  const running = !["party_lobby", "ended"].includes(partyPhase);
  byId("partyPauseButton").hidden = !host || !running;
  byId("partyPauseButton").textContent = partyPhase === "paused" ? "Resume" : "Pause";
  const activityPhase = partyPhase === "activity" || (partyPhase === "paused" && snapshot?.resumePartyPhase === "activity");
  byId("partySkipButton").hidden = !host || !activityPhase;
  byId("partyEndButton").hidden = !host || !running;
  const showEmbedded = activityPhase && ["turbotilt", "crowdshift", "sticktilt", "sketchclash"].includes(snapshot?.gameKey);
  byId("partyStage").hidden = showEmbedded;
  byId("activityFrame").hidden = !showEmbedded;
  if (showEmbedded) mountEmbeddedActivity(snapshot.gameKey, snapshot);
  else drawPartyStage(snapshot);
}

function renderPartyTeams(snapshot) {
  const panel = byId("partyTeamsPanel");
  const teams = snapshot?.partyTeams || [];
  panel.hidden = !teams.length;
  const target = byId("partyTeams");
  target.textContent = "";
  teams.forEach((team) => {
    const row = document.createElement("div");
    row.className = "party-team-row";
    row.style.setProperty("--team", team.color || "#31e6c1");
    const dot = document.createElement("i");
    dot.setAttribute("aria-hidden", "true");
    const name = document.createElement("b");
    name.textContent = `${team.name || "Team"} · ${team.players || 0} players`;
    const score = document.createElement("span");
    score.textContent = `${team.partyPoints || 0} pts`;
    row.append(dot, name, score);
    target.append(row);
  });
}

function renderPartyHighlights(snapshot) {
  const highlights = snapshot?.partyHighlights || [];
  const panel = byId("partyHighlightsPanel");
  panel.hidden = !highlights.length;
  byId("partyHighlightsCount").textContent = `${highlights.length} game${highlights.length === 1 ? "" : "s"}`;
  const target = byId("partyHighlights");
  target.textContent = "";
  highlights.slice(-8).reverse().forEach((highlight) => {
    const item = document.createElement("li");
    if (highlight.skipped) item.textContent = `${highlight.activityName || "Activity"} · skipped`;
    else {
      const winner = document.createElement("b");
      winner.textContent = `${highlight.winnerAvatar || DEFAULT_AVATAR_EMOJI} ${highlight.winnerName || "Winner"}`;
      item.append(document.createTextNode(`${highlight.activityName || "Activity"} · `), winner);
      if (highlight.award) {
        const award = document.createElement("span");
        award.className = "highlight-award";
        award.textContent = ` +${highlight.award}`;
        item.append(award);
      }
    }
    target.append(item);
  });
}

function partySummaryText(snapshot = state.snapshot) {
  const highlights = snapshot?.partyHighlights || [];
  const teams = snapshot?.partyTeams || [];
  const players = [...(snapshot?.players || [])].sort((a, b) => (a.partyRank || 99) - (b.partyRank || 99));
  const lines = [`AI and Sons Party Mode · Room ${state.roomId || snapshot?.roomId || "----"}`, `${highlights.length} games played`];
  if (teams.length) teams.forEach((team) => lines.push(`${team.name}: ${team.partyPoints || 0} points`));
  players.slice(0, 3).forEach((player, index) => lines.push(`${index + 1}. ${player.avatar || DEFAULT_AVATAR_EMOJI} ${player.name} · ${player.partyPoints || 0} points`));
  highlights.slice(-3).reverse().forEach((highlight) => {
    lines.push(highlight.skipped ? `${highlight.activityName || "Activity"}: skipped` : `${highlight.activityName || "Activity"}: ${highlight.winnerAvatar || DEFAULT_AVATAR_EMOJI} ${highlight.winnerName || "Winner"}`);
  });
  return lines.join("\n");
}

function renderHostChoice(snapshot) {
  const section = byId("partyHostChoice");
  const choosing = snapshot?.partyPhase === "voting" && snapshot?.partySettings?.selectionMethod === "host";
  section.hidden = !choosing;
  const target = byId("partyHostChoiceButtons");
  const signature = (snapshot?.partyVote?.options || []).map((option) => option.id).join("|");
  if (!choosing || target.dataset.signature === signature) return;
  target.dataset.signature = signature;
  target.textContent = "";
  (snapshot.partyVote.options || []).forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option.label;
    button.addEventListener("click", () => sendPartyHost("choose_activity", { optionId: option.id }));
    target.append(button);
  });
}

function renderSessionRoster(players) {
  const target = byId("partyRoster");
  target.textContent = "";
  [...players].sort((a, b) => (a.partyRank || 99) - (b.partyRank || 99)).forEach((player) => {
    const row = document.createElement("li");
    if (!displayMode) row.classList.add("host-manageable");
    row.style.setProperty("--player", player.color);
    const dot = document.createElement("i");
    dot.textContent = player.avatar || DEFAULT_AVATAR_EMOJI;
    const name = document.createElement("b");
    name.textContent = `${player.partyRank ? `#${player.partyRank} ` : ""}${player.name}${player.connected ? "" : " · offline"}`;
    const score = document.createElement("span");
    score.textContent = state.snapshot?.partyPhase === "party_lobby" ? (player.ready ? "Ready" : "Not ready") : `${player.partyPoints || 0}`;
    row.append(dot, name, score);
    if (!displayMode) {
      const remove = document.createElement("button");
      remove.className = "roster-remove";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${player.name} from the room`);
      remove.addEventListener("click", () => {
        if (window.confirm(`Remove ${player.name} from this room?`)) sendPartyHost("kick", { playerId: player.id });
      });
      row.append(remove);
    }
    target.append(row);
  });
}

function mountEmbeddedActivity(gameKey, snapshot) {
  const frame = byId("activityFrame");
  if (state.embeddedGame !== gameKey) {
    state.embeddedGame = gameKey;
    const endpoint = params.get("ws") || params.get("endpoint");
    const url = new URL(`/${gameKey}/`, location.origin);
    url.searchParams.set("embedded", "1");
    if (endpoint) url.searchParams.set("ws", endpoint);
    frame.src = url;
    frame.onload = () => postSnapshotToActivity(state.snapshot);
  } else {
    postSnapshotToActivity(snapshot);
  }
}

function postSnapshotToActivity(snapshot) {
  byId("activityFrame").contentWindow?.postMessage({ type: "party_snapshot", roomId: state.roomId, snapshot }, location.origin);
}

function partyBackground() {
  const gradient = partyCtx.createLinearGradient(0, 0, 1200, 675);
  gradient.addColorStop(0, "#32134c"); gradient.addColorStop(.52, "#10274a"); gradient.addColorStop(1, "#063b3a");
  partyCtx.fillStyle = gradient; partyCtx.fillRect(0, 0, 1200, 675);
  for (let index = 0; index < 34; index++) {
    partyCtx.fillStyle = index % 3 === 0 ? "rgba(255,227,110,.16)" : index % 3 === 1 ? "rgba(49,230,193,.14)" : "rgba(255,107,138,.13)";
    partyCtx.beginPath(); partyCtx.arc((index * 157 + state.testOffsetMs / 35) % 1280 - 40, (index * 83) % 675, 2 + index % 5, 0, Math.PI * 2); partyCtx.fill();
  }
}

function partyFit(text, maxWidth, start = 48, min = 16) {
  let size = start;
  while (size > min) { partyCtx.font = `900 ${size}px Inter,system-ui`; if (partyCtx.measureText(text).width <= maxWidth) break; size -= 2; }
  return size;
}

function partyText(text, x, y, maxWidth, size = 48, color = "#fff") {
  partyCtx.textAlign = "center"; partyCtx.textBaseline = "middle"; partyCtx.fillStyle = color;
  partyCtx.font = `900 ${partyFit(String(text), maxWidth, size)}px Inter,system-ui`;
  partyCtx.fillText(String(text), x, y, maxWidth);
}

function partyRoundRect(x, y, w, h, radius, fill, stroke = "") {
  partyCtx.beginPath(); partyCtx.roundRect(x, y, w, h, radius); partyCtx.fillStyle = fill; partyCtx.fill();
  if (stroke) { partyCtx.strokeStyle = stroke; partyCtx.lineWidth = 3; partyCtx.stroke(); }
}

function partyAvatar(player, x, y, radius = 24, fontSize = radius * 1.25) {
  partyCtx.fillStyle = player?.color || "#31e6c1";
  partyCtx.beginPath();
  partyCtx.arc(x, y, radius, 0, Math.PI * 2);
  partyCtx.fill();
  partyCtx.textAlign = "center";
  partyCtx.textBaseline = "middle";
  partyCtx.font = `${fontSize}px "Segoe UI Emoji",sans-serif`;
  partyCtx.fillText(player?.avatar || player?.playerAvatar || DEFAULT_AVATAR_EMOJI, x, y + 1);
}

function drawPartyStage(snapshot) {
  partyBackground();
  if (!snapshot || (snapshot.partyPhase || "party_lobby") === "party_lobby") return drawPartyLobby(snapshot);
  const phase = snapshot.partyPhase;
  if (phase === "voting") drawPartyVoting(snapshot);
  else if (phase === "spinning") drawPartyWheel(snapshot);
  else if (phase === "next_up") drawPartyNextUp(snapshot);
  else if (phase === "results") drawPartyResults(snapshot);
  else if (phase === "ended") drawPartyPodium(snapshot);
  else if (phase === "paused") {
    const base = snapshot.resumePartyPhase;
    if (base === "activity") drawPartyNextUp(snapshot, "Activity paused");
    else if (base === "spinning") drawPartyWheel(snapshot);
    else if (base === "results") drawPartyResults(snapshot);
    else drawPartyVoting(snapshot);
    partyRoundRect(260, 240, 680, 190, 28, "rgba(5,10,28,.94)", "#ffe36e");
    partyText("PARTY PAUSED", 600, 302, 600, 60, "#ffe36e");
    partyText(snapshot.pauseReason === "host_disconnected" ? "Waiting for the host to reconnect" : "The host will resume soon", 600, 382, 580, 25, "#fff");
  }
}

function drawPartyLobby(snapshot) {
  partyText("ONE ROOM. ENDLESS GAMES.", 600, 105, 1080, 72, "#ffe36e");
  partyText("Everyone joins once, then votes decide what happens next.", 600, 174, 930, 28, "#d5e5ed");
  partyRoundRect(145, 230, 910, 315, 36, "rgba(8,18,43,.72)", "rgba(255,255,255,.16)");
  const players = snapshot?.players || [];
  drawPartyTeamStrip(snapshot, 600, 215);
  partyText(players.length < 2 ? "Waiting for players" : "The party is ready!", 600, 286, 760, 46, players.length < 2 ? "#fff" : "#31e6c1");
  players.slice(0, 8).forEach((player, index) => {
    const x = 255 + (index % 4) * 230, y = 370 + Math.floor(index / 4) * 100;
    partyAvatar(player, x, y, 28, 34);
    partyText(player.name, x, y + 48, 195, 18, player.connected ? "#fff" : "#8799aa");
    partyText(player.ready ? "READY" : "JOINED", x, y + 68, 150, 12, player.ready ? "#31e6c1" : "#8799aa");
  });
  const audienceCount = Number(snapshot?.audienceCount || 0);
  partyText(audienceCount ? `📣 ${audienceCount} audience watching · Host starts the opening vote` : "Host starts the opening vote", 600, 605, 1080, 22, "#c7b9db");
}

function drawPartyTeamStrip(snapshot, x = 600, y = 620) {
  const teams = snapshot?.partyTeams || [];
  if (!teams.length) return;
  const text = teams.map((team) => `${team.name} ${team.partyPoints || 0} pts`).join("   ·   ");
  partyText(`TEAMS  ${text}`, x, y, 1050, 17, "#ffe36e");
}

function drawPartyVoting(snapshot) {
  const vote = snapshot.partyVote || {}, options = vote.options || [], ballots = vote.ballots || [];
  const seconds = Math.max(0, Math.ceil((Number(vote.closesAt || 0) - (Date.now() + state.testOffsetMs)) / 1000));
  partyText("WHAT SHOULD WE PLAY NEXT?", 600, 55, 1050, 48, "#ffe36e");
  const method = snapshot?.partySettings?.selectionMethod || "chaos";
  const methodCopy = { chaos: "Every player gets one wheel slice", majority: "The activity with the most votes wins", unanimous: "Agree together or the wheel breaks the tie", host: "The host chooses from the activity pool" }[method];
  partyText(`${seconds}s · ${methodCopy}`, 600, 99, 850, 20, "#d5e5ed");
  options.forEach((option, index) => {
    const x = 55 + index * 382, accent = option.gameKey === "turbotilt" ? "#31e6c1" : option.gameKey === "sticktilt" ? "#ffd560" : option.gameKey === "sketchclash" ? "#ffe36e" : "#ff6b9f";
    partyRoundRect(x, 135, 328, 420, 28, "rgba(10,23,52,.88)", accent);
    partyText(option.gameKey === "turbotilt" ? "🏎️" : option.gameKey === "sticktilt" ? "🥊" : option.gameKey === "sketchclash" ? "✎" : "↔️", x + 164, 195, 120, 52, "#fff");
    partyText(option.label, x + 164, 264, 290, 29, accent);
    partyText(option.description, x + 164, 322, 280, 19, "#d5e5ed");
    const own = ballots.filter((ballot) => ballot.optionId === option.id);
    own.forEach((ballot, ballotIndex) => {
      const bx = x + 34 + (ballotIndex % 2) * 145, by = 385 + Math.floor(ballotIndex / 2) * 55;
      partyRoundRect(bx, by, 125, 40, 20, ballot.playerColor || "#ffcf4a");
      partyText(`${ballot.playerAvatar || DEFAULT_AVATAR_EMOJI} ${ballot.playerName}`, bx + 62, by + 21, 108, 14, "#07131d");
    });
    if (!own.length) partyText("Waiting for votes…", x + 164, 425, 270, 17, "#8097aa");
  });
  const audienceReactions = snapshot?.audienceReactions || {};
  const reactionCopy = Object.entries(audienceReactions).filter(([, count]) => Number(count) > 0).map(([emote, count]) => `${emote} ${count}`).join("   ");
  if (reactionCopy) partyText(`Audience ${reactionCopy}`, 600, 585, 1000, 17, "#bfeaff");
  drawPartyStandingsStrip(snapshot.players || []);
}

function drawPartyWheel(snapshot) {
  const vote = snapshot.partyVote || {}, ballots = vote.ballots || [], spin = vote.spin || {};
  partyText("THE PARTY WHEEL", 600, 55, 900, 48, "#ffe36e");
  const cx = 600, cy = 365, radius = 245, count = Math.max(1, ballots.length), arc = Math.PI * 2 / count;
  const duration = Math.max(1, Number(spin.endsAt || 0) - Number(spin.startedAt || 0));
  const raw = Math.max(0, Math.min(1, ((Date.now() + state.testOffsetMs) - Number(spin.startedAt || 0)) / duration));
  const eased = 1 - Math.pow(1 - raw, 4);
  const finalAngle = Number(spin.turns || 6) * Math.PI * 2 - Math.PI / 2 - (Number(spin.selectedIndex || 0) + .5) * arc;
  const rotation = finalAngle * eased;
  ballots.forEach((ballot, index) => {
    const start = rotation + index * arc, end = start + arc;
    partyCtx.beginPath(); partyCtx.moveTo(cx, cy); partyCtx.arc(cx, cy, radius, start, end); partyCtx.closePath();
    partyCtx.fillStyle = ballot.playerColor || ["#31e6c1", "#ffcf4a", "#ff6b8a"][index % 3]; partyCtx.fill();
    partyCtx.strokeStyle = "rgba(5,14,28,.55)"; partyCtx.lineWidth = 4; partyCtx.stroke();
    partyCtx.save(); partyCtx.translate(cx, cy); partyCtx.rotate(start + arc / 2); partyCtx.textAlign = "right"; partyCtx.fillStyle = "#08151f";
    partyCtx.font = `900 ${count > 6 ? 14 : 18}px Inter,system-ui`; partyCtx.fillText(`${ballot.playerAvatar || DEFAULT_AVATAR_EMOJI} ${ballot.playerName || "Mystery pick"}`, radius - 24, 5, radius - 50); partyCtx.restore();
  });
  partyCtx.fillStyle = "#fff"; partyCtx.beginPath(); partyCtx.moveTo(cx, 92); partyCtx.lineTo(cx - 24, 135); partyCtx.lineTo(cx + 24, 135); partyCtx.closePath(); partyCtx.fill();
  partyCtx.fillStyle = "#0a1830"; partyCtx.beginPath(); partyCtx.arc(cx, cy, 58, 0, Math.PI * 2); partyCtx.fill();
  partyText(raw >= 1 ? "PICKED!" : "SPIN", cx, cy, 110, 18, "#ffe36e");
}

function drawPartyNextUp(snapshot, override = "") {
  const activity = snapshot.activity || {};
  partyText(override || "NEXT UP", 600, 120, 900, 68, "#ffe36e");
  partyText(activity.gameKey === "turbotilt" ? "🏎️" : activity.gameKey === "sticktilt" ? "🥊" : activity.gameKey === "sketchclash" ? "✎" : "↔️", 600, 260, 180, 104, "#fff");
  partyText(activity.label || "Loading the next activity", 600, 390, 1000, 58, activity.gameKey === "turbotilt" ? "#31e6c1" : activity.gameKey === "sticktilt" ? "#ffd560" : activity.gameKey === "sketchclash" ? "#ffe36e" : "#ff82ad");
  partyText(activity.description || "Keep your phone ready", 600, 465, 900, 26, "#d5e5ed");
  partyText("Starting automatically…", 600, 570, 600, 22, "#b9acd0");
}

function drawPartyResults(snapshot) {
  partyText(snapshot.activitySkipped ? "ACTIVITY SKIPPED" : "ACTIVITY COMPLETE", 600, 60, 1000, 52, "#ffe36e");
  partyText(snapshot.activity?.label || "Party standings", 600, 108, 900, 24, "#d5e5ed");
  drawPartyStandings(snapshot.players || [], true);
  drawPartyTeamStrip(snapshot, 600, 580);
  partyText("Next vote starts automatically", 600, 625, 700, 20, "#b9acd0");
}

function drawPartyPodium(snapshot) {
  partyText("PARTY CHAMPION", 600, 65, 1000, 62, "#ffe36e");
  drawPartyStandings(snapshot.players || [], true);
  drawPartyTeamStrip(snapshot, 600, 580);
  partyText(`${snapshot.activityIndex || 0} activities · Host can start another party`, 600, 625, 860, 22, "#d5e5ed");
}

function drawPartyStandings(players, awards = false) {
  [...players].sort((a, b) => (a.partyRank || 99) - (b.partyRank || 99)).slice(0, 8).forEach((player, index) => {
    const col = index % 2, row = Math.floor(index / 2), x = 130 + col * 500, y = 145 + row * 105;
    partyRoundRect(x, y, 440, 82, 18, "rgba(255,255,255,.075)", index === 0 ? "#ffe36e" : "rgba(255,255,255,.1)");
    partyAvatar(player, x + 40, y + 41, 20, 24);
    partyCtx.textAlign = "left"; partyCtx.fillStyle = "#fff"; partyCtx.font = "850 23px Inter,system-ui"; partyCtx.fillText(`#${player.partyRank || index + 1} ${player.name}`, x + 75, y + 35, 245);
    partyCtx.fillStyle = "#aebdcb"; partyCtx.font = "700 14px Inter,system-ui"; partyCtx.fillText(`${player.activityWins || 0} win${player.activityWins === 1 ? "" : "s"}${awards && player.partyAward ? ` · +${player.partyAward} this game` : ""}`, x + 75, y + 59, 270);
    partyCtx.textAlign = "right"; partyCtx.fillStyle = "#ffe36e"; partyCtx.font = "950 26px Inter,system-ui"; partyCtx.fillText(`${player.partyPoints || 0} pts`, x + 415, y + 49);
  });
}

function drawPartyStandingsStrip(players) {
  const ordered = [...players].sort((a, b) => (a.partyRank || 99) - (b.partyRank || 99)).slice(0, 4);
  partyText(ordered.map((player) => `${player.avatar || DEFAULT_AVATAR_EMOJI} #${player.partyRank || "—"} ${player.name} ${player.partyPoints || 0}`).join("   ·   ") || "Standings begin after the first game", 600, 617, 1080, 19, "#d5e5ed");
}

byId("roomCode").addEventListener("input", (event) => { event.target.value = normalizeCode(event.target.value); });
byId("joinForm").addEventListener("submit", (event) => { event.preventDefault(); joinParty({ withoutToken: true, role: "player" }); });
byId("audienceJoinButton").addEventListener("click", () => joinParty({ withoutToken: true, role: "audience" }));
byId("tiltButton").addEventListener("click", enableTilt);
bindSteerButton(byId("leftButton"), -1);
bindSteerButton(byId("rightButton"), 1);
byId("boostButton").addEventListener("click", () => {
  state.connection?.sendInput({ type: "boost" });
  partyAudio.cue("select", state.snapshot);
  vibrate(35);
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
["left", "right"].forEach((choice) => byId(choice === "left" ? "crowdLeft" : "crowdRight").addEventListener("click", () => {
  state.selectedChoice = choice;
  state.connection?.sendInput({ type: "choice", choice });
  renderController();
  partyAudio.cue("select", state.snapshot);
  vibrate(30);
}));
["left", "right"].forEach((prediction) => byId(prediction === "left" ? "duelPredictLeft" : "duelPredictRight").addEventListener("click", () => {
  state.selectedPrediction = prediction;
  state.connection?.sendInput({ type: "predict", choice: prediction });
  renderController();
  partyAudio.cue("select", state.snapshot);
  vibrate(20);
}));
byId("duelHotTake").addEventListener("click", () => {
  state.selectedHotTake = !state.selectedHotTake;
  state.connection?.sendInput({ type: "hot_take" });
  renderController();
  partyAudio.cue("select", state.snapshot);
  vibrate([25, 20, 25]);
});
document.querySelectorAll("[data-crowd-emote]").forEach((button) => button.addEventListener("click", () => {
  state.connection?.sendInput({ type: "emote", emote: button.dataset.crowdEmote });
}));
document.querySelectorAll("[data-audience-reaction]").forEach((button) => button.addEventListener("click", () => {
  state.connection?.sendInput({ type: "audience_reaction", emote: button.dataset.audienceReaction });
  byId("audienceReactionStatus").textContent = "Reaction sent to the big screen!";
}));
byId("leaveButton").addEventListener("click", () => {
  state.connection?.disconnect();
  if (state.roomId) localStorage.removeItem(tokenKey(state.roomId, state.participantRole));
  location.href = "/party/";
});
byId("partyStartButton").addEventListener("click", () => {
  byId("partyActivitySettings").open = false;
  byId("partyAdvancedSettings").open = false;
  window.scrollTo({ top: 0, behavior: "auto" });
  partyAudio.cue("select", state.snapshot);
  sendPartyHost("start");
});
byId("partyAgainButton").addEventListener("click", () => sendPartyHost("play_again"));
byId("partyReadyButton").addEventListener("click", () => {
  const me = state.snapshot?.players?.find((player) => player.id === (state.snapshot?.selfId || state.playerId));
  state.connection?.sendInput({ type: "party_ready", ready: !me?.ready });
  partyAudio.cue("select", state.snapshot);
});
byId("partyInviteButton").addEventListener("click", () => sharePlayerInvite(byId("partyInviteButton"), byId("partyShareStatus")));
byId("partyPlayerInviteButton").addEventListener("click", () => sharePlayerInvite(byId("partyPlayerInviteButton"), byId("partyPlayerShareStatus")));
byId("partyLockButton").addEventListener("click", () => sendPartyHost(state.snapshot?.roomLocked ? "unlock" : "lock"));
byId("partyLateJoinButton").addEventListener("click", () => sendPartyHost(state.snapshot?.allowLateJoin === false ? "late_join_on" : "late_join_off"));
byId("partyFriendlyNamesButton").addEventListener("click", () => sendPartyHost(state.snapshot?.friendlyNames ? "friendly_names_off" : "friendly_names_on"));
byId("partyAudienceButton").addEventListener("click", () => sendPartyHost(state.snapshot?.audienceEnabled === false ? "audience_on" : "audience_off"));
byId("partyModerationSelect").addEventListener("change", (event) => sendPartyHost("set_moderation", { choice: event.target.value }));
byId("partyMaxPlayersSelect").addEventListener("change", (event) => sendPartyHost("set_max_players", { value: Number(event.target.value) }));
byId("partyShuffleTeamsButton").addEventListener("click", () => sendPartyHost("shuffle_teams"));
byId("partyDurationSelect").addEventListener("change", sendPartyConfiguration);
byId("partyPlayStyleSelect").addEventListener("change", sendPartyConfiguration);
byId("partySelectionSelect").addEventListener("change", sendPartyConfiguration);
byId("partyRepeatSelect").addEventListener("change", sendPartyConfiguration);
byId("partyCatchUp").addEventListener("change", sendPartyConfiguration);
byId("partyAccessibilitySelect").addEventListener("change", (event) => { applyAccessibilityPreset(event.target.value); sendPartyConfiguration(); });
["partyExtendedTimers", "partyReducedMotion", "partyHighContrast", "partyEffects", "partyNarration", "partyHaptics", "partyTeamMode"].forEach((id) => {
  byId(id).addEventListener("change", () => { byId("partyAccessibilitySelect").value = "custom"; sendPartyConfiguration(); });
});
byId("partyPauseButton").addEventListener("click", () => sendPartyHost(state.snapshot?.partyPhase === "paused" ? "resume" : "pause"));
byId("partySkipButton").addEventListener("click", () => sendPartyHost("skip"));
byId("partyEndButton").addEventListener("click", () => { if (window.confirm("End this party and show the final standings?")) sendPartyHost("end"); });
byId("partyFullscreenButton").addEventListener("click", () => {
  if (!document.fullscreenElement) byId("partyStageWrap").requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.().catch(() => {});
});
byId("partyShareButton").addEventListener("click", async () => {
  const url = displayInviteUrl().toString();
  try { await navigator.clipboard.writeText(url); byId("partyShareButton").textContent = "Screen link copied!"; setTimeout(() => { byId("partyShareButton").textContent = "Copy link for another screen"; }, 1600); }
  catch { byId("sessionError").textContent = url; }
});
byId("partyCopySummaryButton").addEventListener("click", async () => {
  const summary = partySummaryText();
  try {
    await navigator.clipboard.writeText(summary);
    byId("partySummaryStatus").textContent = "Summary copied!";
  } catch {
    byId("partySummaryStatus").textContent = summary;
  }
});
byId("resumePartyButton").addEventListener("click", () => {
  const recovery = loadHostRecovery();
  if (!recovery) return renderHostRecoveryCard();
  const url = new URL("/party/", location.origin);
  url.searchParams.set("host", "1");
  url.searchParams.set("room", recovery.roomId);
  const endpoint = params.get("ws") || params.get("endpoint");
  if (endpoint) url.searchParams.set("ws", endpoint);
  location.href = url;
});
byId("forgetPartyButton").addEventListener("click", () => {
  forgetHostRecovery(byId("resumePartyRoom").textContent);
  renderHostRecoveryCard();
});
window.addEventListener("keydown", (event) => { if (event.key.toLowerCase() === "f" && screenMode) byId("partyFullscreenButton").click(); });

setInterval(() => {
  if (!byId("controllerView").hidden) {
    renderController();
    if (state.gameKey === "turbotilt") {
      const me = state.snapshot?.players?.find((player) => player.id === (state.snapshot?.selfId || state.playerId));
      showRaceFeedback(me);
    }
  }
  if (!byId("sessionView").hidden && state.snapshot && state.snapshot.partyPhase !== "activity") drawPartyStage(state.snapshot);
  const rotationIdle = state.sessionMode === "rotation" && state.snapshot?.partyPhase !== "activity";
  if (state.gameKey === "turbotilt" && !rotationIdle) sendSteer();
}, 100);

const initialCode = normalizeCode(params.get("code"));
renderAvatarPicker();
if (!screenMode) renderHostRecoveryCard();
if (screenMode && !displayMode) loadSavedPartySettings();
if (!screenMode && initialCode) {
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
  if (code.length === 4) {
    location.href = `/party/?display=${encodeURIComponent(code)}`;
  }
});

window.advanceTime = (ms) => {
  state.testOffsetMs += Math.max(0, Math.min(60000, Number(ms) || 0));
  if (!byId("controllerView").hidden) renderController();
  if (!byId("sessionView").hidden) drawPartyStage(state.snapshot);
  byId("activityFrame").contentWindow?.postMessage({ type: "party_advance_time", ms }, location.origin);
};
window.render_game_to_text = () => JSON.stringify({
  view: !byId("sessionView").hidden ? state.screenRole : byId("controllerView").hidden ? "party-hub" : "controller",
  coordinate_system: { steering: "-1 left to +1 right" },
  room_id: state.roomId,
  player_id: state.playerId,
  player_avatar: state.playerAvatar,
  participant_role: state.participantRole,
  audience_id: state.audienceId,
  game_key: state.gameKey,
  tilt_enabled: state.tiltEnabled,
  effective_steer: Number(effectiveSteer().toFixed(2)),
  selected_gadget: state.selectedGadget,
  selected_vote: state.selectedVote,
  selected_choice: state.selectedChoice,
  selected_prediction: state.selectedPrediction,
  hot_take_selected: state.selectedHotTake,
  selected_party_vote: state.selectedPartyVote,
  audio: (() => {
    const debug = partyAudio.debug();
    return { enabled: debug.enabled, activated: debug.activated, last_cue: debug.lastCue };
  })(),
  connection: state.connectionDiagnostics,
  state: state.snapshot,
});
window.__partyAudioDebug = () => partyAudio.debug();
if (["127.0.0.1", "localhost"].includes(location.hostname)) {
  window.__partyTestDropConnection = () => {
    const socket = state.connection?.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.close(4001, "party reconnect test");
    return true;
  };
}
if (["127.0.0.1", "localhost"].includes(location.hostname)) {
  window.__turbotiltPreviewFeedback = (type) => showRaceFeedback({
    eventId: state.lastEventId + 1,
    lastEventType: type,
    lastEventAt: Date.now(),
  });
}
if (screenMode) connectSessionScreen().catch((error) => {
  byId("sessionError").textContent = error.message || "Unable to open the party room.";
  setConnectionLabel("Connection problem", "problem");
});

partyAudio.bind(byId("partySoundButton"));
byId("partySoundButton").addEventListener("click", () => { void partyAudio.toggle(); });
const activatePartyAudio = (event) => {
  if (event.target instanceof Element && event.target.closest("#partySoundButton")) return;
  void partyAudio.activate();
  document.removeEventListener("pointerdown", activatePartyAudio, true);
  document.removeEventListener("keydown", activatePartyAudio, true);
};
document.addEventListener("pointerdown", activatePartyAudio, true);
document.addEventListener("keydown", activatePartyAudio, true);
