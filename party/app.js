import { connect } from "/src/net/multiplayerClient.js";

const byId = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const allowedCode = /[^A-HJ-NP-Z]/g;
const partyCanvas = byId("partyStage");
const partyCtx = partyCanvas.getContext("2d");
const screenMode = params.get("host") === "1" || normalizeCode(params.get("display")).length === 4;
const displayMode = normalizeCode(params.get("display")).length === 4;
const state = {
  connection: null,
  roomId: "",
  playerId: "",
  playerName: "",
  playerColor: "#31e6c1",
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
  byId("controllerRoom").textContent = state.roomId;
  const partyPhase = state.snapshot?.partyPhase || "";
  const activityControls = partyPhase === "activity" || (partyPhase === "paused" && state.snapshot?.resumePartyPhase === "activity");
  const isParty = state.sessionMode === "rotation" && !activityControls;
  const isCrowdShift = !isParty && state.gameKey === "crowdshift";
  byId("partyController").hidden = !isParty;
  byId("turboController").hidden = isParty || isCrowdShift;
  byId("crowdController").hidden = isParty || !isCrowdShift;
  const label = isParty ? "Party voting" : isCrowdShift ? "Crowd Shift" : "Turbo Tilt";
  byId("controllerView").setAttribute("aria-label", `${label} phone controller`);
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
    state.gameKey = payload.gameKey || state.gameKey || "turbotilt";
    state.sessionMode = payload.sessionMode || state.sessionMode;
    if (payload.token) localStorage.setItem(tokenKey(state.roomId), payload.token);
    byId("playerLabel").textContent = state.playerName;
    byId("playerDot").style.background = state.playerColor;
    showController();
    window.scrollTo({ top: 0, behavior: "auto" });
    renderController();
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
  if (snapshot?.gameKey) state.gameKey = snapshot.gameKey;
  if (snapshot?.sessionMode) state.sessionMode = snapshot.sessionMode;
  const activityControls = snapshot?.partyPhase === "activity" || (snapshot?.partyPhase === "paused" && snapshot?.resumePartyPhase === "activity");
  if (state.sessionMode === "rotation" && !activityControls) {
    showController();
    renderPartyController(snapshot);
    return;
  }
  showController();
  if (state.gameKey === "crowdshift") {
    renderCrowdController(snapshot);
    return;
  }
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

function renderPartyController(snapshot) {
  const me = snapshot?.players?.find((player) => player.id === (snapshot?.selfId || state.playerId));
  const phase = snapshot?.partyPhase || "party_lobby";
  const remaining = Math.max(0, (Number(snapshot?.phaseEndsAt || 0) - (Date.now() + state.testOffsetMs)) / 1000);
  const vote = snapshot?.partyVote || {};
  const winner = vote.options?.find((option) => option.id === vote.winnerOptionId);
  byId("partyPhaseLabel").textContent = phase.replaceAll("_", " ");
  byId("partyRank").textContent = me?.partyRank ? `#${me.partyRank}` : "—";
  byId("partyPoints").textContent = String(me?.partyPoints || 0);
  byId("partyWins").textContent = String(me?.activityWins || 0);
  let message = "Waiting for the host to start the party";
  if (phase === "voting") message = `${Math.ceil(remaining)} seconds to vote`;
  else if (phase === "spinning") message = "The wheel is spinning!";
  else if (phase === "next_up") message = winner?.label || snapshot?.activity?.label || "Next activity incoming";
  else if (phase === "results") message = snapshot?.activitySkipped ? "Activity skipped" : me?.partyAward ? `+${me.partyAward} party points!` : "Activity complete";
  else if (phase === "paused") message = snapshot?.pauseReason === "host_disconnected" ? "Host reconnecting…" : "Party paused";
  else if (phase === "ended") message = me?.partyRank === 1 ? "You won the party!" : `Party finished · #${me?.partyRank || "—"}`;
  byId("partyMessage").textContent = message;
  const voting = phase === "voting";
  byId("partyVotePanel").hidden = !voting;
  const ownBallot = vote.ballots?.find((ballot) => ballot.playerId === me?.id);
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
        navigator.vibrate?.(25);
      });
      target.append(button);
    });
  }
  target.querySelectorAll("[data-party-vote]").forEach((button) => {
    const optionId = button.dataset.partyVote;
    const names = (vote.ballots || []).filter((ballot) => ballot.optionId === optionId).map((ballot) => ballot.playerName);
    button.classList.toggle("selected", optionId === state.selectedPartyVote);
    button.disabled = !voting;
    button.querySelector(".party-voters").textContent = names.length ? `Voted: ${names.join(", ")}` : "No votes yet";
  });
  byId("partyVoteStatus").textContent = voting ? "Your named vote appears live. Change it anytime before the spin." : "Watch the shared screen.";
  renderPhoneStandings(snapshot);
}

function renderPhoneStandings(snapshot) {
  const target = byId("phoneStandings");
  target.textContent = "";
  [...(snapshot?.players || [])].sort((a, b) => (a.partyRank || 99) - (b.partyRank || 99)).forEach((player) => {
    const row = document.createElement("li");
    row.style.setProperty("--player", player.color);
    const dot = document.createElement("i");
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

async function connectSessionScreen() {
  byId("landingView").hidden = true;
  byId("controllerView").hidden = true;
  byId("sessionView").hidden = false;
  state.screenRole = displayMode ? "display" : "host";
  byId("sessionRole").textContent = displayMode ? "Synchronized party screen" : "Party host";
  byId("hostControls").hidden = displayMode;
  const requestedRoom = displayMode ? normalizeCode(params.get("display")) : normalizeCode(params.get("room"));
  const token = !displayMode && requestedRoom ? sessionStorage.getItem(hostTokenKey(requestedRoom)) || "" : "";
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
    state.snapshot = update.payload?.state || update.payload || null;
    state.gameKey = state.snapshot?.gameKey || state.gameKey;
    state.sessionMode = state.snapshot?.sessionMode || state.sessionMode;
    renderSessionScreen();
  });
  connection.onEvent((event) => {
    if (connection !== state.connection) return;
    const payload = event.payload || {};
    if (event.type === "welcome") {
      state.roomId = payload.roomId || state.roomId;
      state.hostToken = payload.token || state.hostToken;
      state.sessionMode = payload.sessionMode || state.sessionMode;
      if (!displayMode && state.hostToken) {
        sessionStorage.setItem(hostTokenKey(state.roomId), state.hostToken);
        const url = new URL(location.href);
        url.searchParams.set("host", "1");
        url.searchParams.set("room", state.roomId);
        history.replaceState({}, "", url);
      }
      byId("sessionRoom").textContent = state.roomId || "----";
      renderSessionQr();
      renderSessionScreen();
    } else if (event.type === "error") {
      byId("sessionError").textContent = payload.message || "The party server rejected that action.";
      if (["invalid_host_token", "room_not_found"].includes(payload.code) && state.roomId) sessionStorage.removeItem(hostTokenKey(state.roomId));
    }
  });
}

function renderSessionQr() {
  const target = byId("sessionQr");
  target.textContent = "";
  if (!state.roomId || typeof window.qrcode !== "function") return;
  const qr = window.qrcode(0, "M");
  qr.addData(`https://games.aiandsons.io/party?code=${encodeURIComponent(state.roomId)}`);
  qr.make();
  target.innerHTML = qr.createSvgTag(4, 1, "Scan to join the party", "Party room QR code");
}

function sendPartyHost(action) {
  byId("sessionError").textContent = "";
  state.connection?.sendInput({ type: "host", action });
}

function renderSessionScreen() {
  const snapshot = state.snapshot;
  const players = snapshot?.players || [];
  const connected = players.filter((player) => player.connected).length;
  const partyPhase = snapshot?.partyPhase || "party_lobby";
  byId("sessionRoom").textContent = state.roomId || snapshot?.roomId || "----";
  byId("sessionPlayerCount").textContent = `${connected} / 8 players`;
  byId("sessionScreenCount").textContent = `${1 + Number(snapshot?.displayCount || 0)} live screen${Number(snapshot?.displayCount || 0) ? "s" : ""}`;
  renderSessionRoster(players);
  const host = !displayMode;
  byId("partyStartButton").hidden = !host || partyPhase !== "party_lobby";
  byId("partyStartButton").disabled = connected < 2;
  byId("partyStartButton").textContent = connected < 2 ? "Start with 2 players" : `Start Party with ${connected}`;
  const running = !["party_lobby", "ended"].includes(partyPhase);
  byId("partyPauseButton").hidden = !host || !running;
  byId("partyPauseButton").textContent = partyPhase === "paused" ? "Resume" : "Pause";
  const activityPhase = partyPhase === "activity" || (partyPhase === "paused" && snapshot?.resumePartyPhase === "activity");
  byId("partySkipButton").hidden = !host || !activityPhase;
  byId("partyEndButton").hidden = !host || !running;
  const showEmbedded = activityPhase && ["turbotilt", "crowdshift"].includes(snapshot?.gameKey);
  byId("partyStage").hidden = showEmbedded;
  byId("activityFrame").hidden = !showEmbedded;
  if (showEmbedded) mountEmbeddedActivity(snapshot.gameKey, snapshot);
  else drawPartyStage(snapshot);
}

function renderSessionRoster(players) {
  const target = byId("partyRoster");
  target.textContent = "";
  [...players].sort((a, b) => (a.partyRank || 99) - (b.partyRank || 99)).forEach((player) => {
    const row = document.createElement("li");
    row.style.setProperty("--player", player.color);
    const dot = document.createElement("i");
    const name = document.createElement("b");
    name.textContent = `${player.partyRank ? `#${player.partyRank} ` : ""}${player.name}${player.connected ? "" : " · offline"}`;
    const score = document.createElement("span");
    score.textContent = `${player.partyPoints || 0}`;
    row.append(dot, name, score);
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
  partyText(players.length < 2 ? "Waiting for players" : "The party is ready!", 600, 286, 760, 46, players.length < 2 ? "#fff" : "#31e6c1");
  players.slice(0, 8).forEach((player, index) => {
    const x = 255 + (index % 4) * 230, y = 370 + Math.floor(index / 4) * 100;
    partyCtx.fillStyle = player.color; partyCtx.beginPath(); partyCtx.arc(x, y, 28, 0, Math.PI * 2); partyCtx.fill();
    partyText(player.name, x, y + 48, 195, 18, player.connected ? "#fff" : "#8799aa");
  });
  partyText("Host starts the opening vote", 600, 605, 800, 25, "#c7b9db");
}

function drawPartyVoting(snapshot) {
  const vote = snapshot.partyVote || {}, options = vote.options || [], ballots = vote.ballots || [];
  const seconds = Math.max(0, Math.ceil((Number(vote.closesAt || 0) - (Date.now() + state.testOffsetMs)) / 1000));
  partyText("WHAT SHOULD WE PLAY NEXT?", 600, 55, 1050, 48, "#ffe36e");
  partyText(`${seconds}s · Every player gets one wheel slice`, 600, 99, 850, 20, "#d5e5ed");
  options.forEach((option, index) => {
    const x = 55 + index * 382, accent = option.gameKey === "turbotilt" ? "#31e6c1" : "#ff6b9f";
    partyRoundRect(x, 135, 328, 420, 28, "rgba(10,23,52,.88)", accent);
    partyText(option.gameKey === "turbotilt" ? "🏎️" : "↔️", x + 164, 195, 120, 52, "#fff");
    partyText(option.label, x + 164, 264, 290, 29, accent);
    partyText(option.description, x + 164, 322, 280, 19, "#d5e5ed");
    const own = ballots.filter((ballot) => ballot.optionId === option.id);
    own.forEach((ballot, ballotIndex) => {
      const bx = x + 34 + (ballotIndex % 2) * 145, by = 385 + Math.floor(ballotIndex / 2) * 55;
      partyRoundRect(bx, by, 125, 40, 20, ballot.playerColor || "#ffcf4a");
      partyText(ballot.playerName, bx + 62, by + 21, 108, 14, "#07131d");
    });
    if (!own.length) partyText("Waiting for votes…", x + 164, 425, 270, 17, "#8097aa");
  });
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
    partyCtx.font = `900 ${count > 6 ? 14 : 18}px Inter,system-ui`; partyCtx.fillText(ballot.playerName || "Mystery pick", radius - 24, 5, radius - 50); partyCtx.restore();
  });
  partyCtx.fillStyle = "#fff"; partyCtx.beginPath(); partyCtx.moveTo(cx, 92); partyCtx.lineTo(cx - 24, 135); partyCtx.lineTo(cx + 24, 135); partyCtx.closePath(); partyCtx.fill();
  partyCtx.fillStyle = "#0a1830"; partyCtx.beginPath(); partyCtx.arc(cx, cy, 58, 0, Math.PI * 2); partyCtx.fill();
  partyText(raw >= 1 ? "PICKED!" : "SPIN", cx, cy, 110, 18, "#ffe36e");
}

function drawPartyNextUp(snapshot, override = "") {
  const activity = snapshot.activity || {};
  partyText(override || "NEXT UP", 600, 120, 900, 68, "#ffe36e");
  partyText(activity.gameKey === "turbotilt" ? "🏎️" : "↔️", 600, 260, 180, 104, "#fff");
  partyText(activity.label || "Loading the next activity", 600, 390, 1000, 58, activity.gameKey === "turbotilt" ? "#31e6c1" : "#ff82ad");
  partyText(activity.description || "Keep your phone ready", 600, 465, 900, 26, "#d5e5ed");
  partyText("Starting automatically…", 600, 570, 600, 22, "#b9acd0");
}

function drawPartyResults(snapshot) {
  partyText(snapshot.activitySkipped ? "ACTIVITY SKIPPED" : "ACTIVITY COMPLETE", 600, 60, 1000, 52, "#ffe36e");
  partyText(snapshot.activity?.label || "Party standings", 600, 108, 900, 24, "#d5e5ed");
  drawPartyStandings(snapshot.players || [], true);
  partyText("Next vote starts automatically", 600, 625, 700, 20, "#b9acd0");
}

function drawPartyPodium(snapshot) {
  partyText("PARTY CHAMPION", 600, 65, 1000, 62, "#ffe36e");
  drawPartyStandings(snapshot.players || [], true);
  partyText(`${snapshot.activityIndex || 0} activities · Thanks for playing!`, 600, 625, 800, 22, "#d5e5ed");
}

function drawPartyStandings(players, awards = false) {
  [...players].sort((a, b) => (a.partyRank || 99) - (b.partyRank || 99)).slice(0, 8).forEach((player, index) => {
    const col = index % 2, row = Math.floor(index / 2), x = 130 + col * 500, y = 145 + row * 105;
    partyRoundRect(x, y, 440, 82, 18, "rgba(255,255,255,.075)", index === 0 ? "#ffe36e" : "rgba(255,255,255,.1)");
    partyCtx.fillStyle = player.color; partyCtx.beginPath(); partyCtx.arc(x + 40, y + 41, 20, 0, Math.PI * 2); partyCtx.fill();
    partyCtx.textAlign = "left"; partyCtx.fillStyle = "#fff"; partyCtx.font = "850 23px Inter,system-ui"; partyCtx.fillText(`#${player.partyRank || index + 1} ${player.name}`, x + 75, y + 35, 245);
    partyCtx.fillStyle = "#aebdcb"; partyCtx.font = "700 14px Inter,system-ui"; partyCtx.fillText(`${player.activityWins || 0} win${player.activityWins === 1 ? "" : "s"}${awards && player.partyAward ? ` · +${player.partyAward} this game` : ""}`, x + 75, y + 59, 270);
    partyCtx.textAlign = "right"; partyCtx.fillStyle = "#ffe36e"; partyCtx.font = "950 26px Inter,system-ui"; partyCtx.fillText(`${player.partyPoints || 0} pts`, x + 415, y + 49);
  });
}

function drawPartyStandingsStrip(players) {
  const ordered = [...players].sort((a, b) => (a.partyRank || 99) - (b.partyRank || 99)).slice(0, 4);
  partyText(ordered.map((player) => `#${player.partyRank || "—"} ${player.name} ${player.partyPoints || 0}`).join("   ·   ") || "Standings begin after the first game", 600, 617, 1080, 19, "#d5e5ed");
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
["left", "right"].forEach((choice) => byId(choice === "left" ? "crowdLeft" : "crowdRight").addEventListener("click", () => {
  state.selectedChoice = choice;
  state.connection?.sendInput({ type: "choice", choice });
  renderController();
  navigator.vibrate?.(30);
}));
["left", "right"].forEach((prediction) => byId(prediction === "left" ? "duelPredictLeft" : "duelPredictRight").addEventListener("click", () => {
  state.selectedPrediction = prediction;
  state.connection?.sendInput({ type: "predict", choice: prediction });
  renderController();
  navigator.vibrate?.(20);
}));
byId("duelHotTake").addEventListener("click", () => {
  state.selectedHotTake = !state.selectedHotTake;
  state.connection?.sendInput({ type: "hot_take" });
  renderController();
  navigator.vibrate?.([25, 20, 25]);
});
document.querySelectorAll("[data-crowd-emote]").forEach((button) => button.addEventListener("click", () => {
  state.connection?.sendInput({ type: "emote", emote: button.dataset.crowdEmote });
}));
byId("leaveButton").addEventListener("click", () => {
  state.connection?.disconnect();
  if (state.roomId) localStorage.removeItem(tokenKey(state.roomId));
  location.href = "/party/";
});
byId("partyStartButton").addEventListener("click", () => sendPartyHost("start"));
byId("partyPauseButton").addEventListener("click", () => sendPartyHost(state.snapshot?.partyPhase === "paused" ? "resume" : "pause"));
byId("partySkipButton").addEventListener("click", () => sendPartyHost("skip"));
byId("partyEndButton").addEventListener("click", () => { if (window.confirm("End this party and show the final standings?")) sendPartyHost("end"); });
byId("partyFullscreenButton").addEventListener("click", () => {
  if (!document.fullscreenElement) byId("partyStageWrap").requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.().catch(() => {});
});
byId("partyShareButton").addEventListener("click", async () => {
  const url = new URL("/party/", location.origin); url.searchParams.set("display", state.roomId);
  const endpoint = params.get("ws") || params.get("endpoint"); if (endpoint) url.searchParams.set("ws", endpoint);
  try { await navigator.clipboard.writeText(url); byId("partyShareButton").textContent = "Screen link copied!"; setTimeout(() => { byId("partyShareButton").textContent = "Copy link for another screen"; }, 1600); }
  catch { byId("sessionError").textContent = url; }
});
window.addEventListener("keydown", (event) => { if (event.key.toLowerCase() === "f" && screenMode) byId("partyFullscreenButton").click(); });

setInterval(() => {
  if (!byId("controllerView").hidden) {
    renderController();
    if (state.gameKey !== "crowdshift") {
      const me = state.snapshot?.players?.find((player) => player.id === (state.snapshot?.selfId || state.playerId));
      showRaceFeedback(me);
    }
  }
  if (!byId("sessionView").hidden && state.snapshot && state.snapshot.partyPhase !== "activity") drawPartyStage(state.snapshot);
  const rotationIdle = state.sessionMode === "rotation" && state.snapshot?.partyPhase !== "activity";
  if (state.gameKey !== "crowdshift" && !rotationIdle) sendSteer();
}, 100);

const initialCode = normalizeCode(params.get("code"));
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
  game_key: state.gameKey,
  tilt_enabled: state.tiltEnabled,
  effective_steer: Number(effectiveSteer().toFixed(2)),
  selected_gadget: state.selectedGadget,
  selected_vote: state.selectedVote,
  selected_choice: state.selectedChoice,
  selected_prediction: state.selectedPrediction,
  hot_take_selected: state.selectedHotTake,
  selected_party_vote: state.selectedPartyVote,
  state: state.snapshot,
});
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
