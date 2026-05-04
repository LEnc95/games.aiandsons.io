import { rememberRecent } from "../src/core/state.js";
import { connect } from "../src/net/multiplayerClient.js";

const GAME_ID = "audioagar";
const ARENA_DEFAULT = { width: 4200, height: 4200 };
const VIEW = { width: 960, height: 640 };
const SERVER_INTERPOLATION_MS = 130;
const MOVE_RESEND_MS = 120;
const PREVIEW_AFTER_MS = 3600;
const CRITICAL_THREAT_RADIUS = 520;
const NEARBY_RADIUS = 1100;

const DIR_KEYS = new Map([
  ["ArrowUp", { x: 0, y: -1 }],
  ["KeyW", { x: 0, y: -1 }],
  ["ArrowDown", { x: 0, y: 1 }],
  ["KeyS", { x: 0, y: 1 }],
  ["ArrowLeft", { x: -1, y: 0 }],
  ["KeyA", { x: -1, y: 0 }],
  ["ArrowRight", { x: 1, y: 0 }],
  ["KeyD", { x: 1, y: 0 }],
]);

const COLORS = {
  self: "#8ef2c2",
  threat: "#ff7c75",
  edible: "#ffd36e",
  neutral: "#82b7ff",
  pelletA: "#f7fbff",
  pelletB: "#78d5ff",
  grid: "rgba(170, 212, 255, 0.10)",
};

/**
 * @typedef {Object} PlayerCell
 * @property {string} id
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} mass
 * @property {number} radius
 * @property {boolean} isSelf
 */

/**
 * @typedef {Object} Pellet
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} value
 */

/**
 * @typedef {Object} GameState
 * @property {PlayerCell[]} players
 * @property {Pellet[]} pellets
 * @property {number} arenaWidth
 * @property {number} arenaHeight
 * @property {number} tick
 * @property {string} roomId
 */

const canvas = document.getElementById("arena");
const ctx = canvas.getContext("2d");
const menuEl = document.getElementById("menu");
const menuCopyEl = document.getElementById("menuCopy");
const joinBtn = document.getElementById("joinBtn");
const audioBtn = document.getElementById("audioBtn");
const splitBtn = document.getElementById("splitBtn");
const ejectBtn = document.getElementById("ejectBtn");
const helpBtn = document.getElementById("helpBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const reconnectBtn = document.getElementById("reconnectBtn");
const statusLineEl = document.getElementById("statusLine");
const politeLiveEl = document.getElementById("politeLive");
const assertiveLiveEl = document.getElementById("assertiveLive");
const hud = {
  mode: document.getElementById("modeValue"),
  mass: document.getElementById("massValue"),
  tier: document.getElementById("tierValue"),
  threats: document.getElementById("threatValue"),
  targets: document.getElementById("targetValue"),
  pellets: document.getElementById("pelletValue"),
  room: document.getElementById("roomValue"),
  audio: document.getElementById("audioValue"),
};

const params = new URLSearchParams(window.location.search);
const requestedRoomId = sanitizeRoomId(params.get("room") || "") || "lobby";
const requestedName = sanitizeName(params.get("name") || loadProfileName() || "Player");
const forcePreview = params.has("preview") || params.has("demo");
const offlinePreview = params.has("offline") || params.has("noSocket");

const input = {
  pressed: new Set(),
  vector: { x: 0, y: 0 },
  direction: "STOP",
  lastDirection: "E",
  lastSentAt: 0,
};

const game = {
  mode: "menu",
  connection: null,
  connectionStatus: "idle",
  roomId: requestedRoomId,
  selfId: "",
  usingPreview: false,
  previewStartedAt: 0,
  previousState: createEmptyState(requestedRoomId),
  targetState: createEmptyState(requestedRoomId),
  renderState: createEmptyState(requestedRoomId),
  interpolationStart: performance.now(),
  lastServerStateAt: 0,
  lastFrameAt: performance.now(),
  manualStepping: false,
  nowMs: performance.now(),
  lastTier: "small",
  spawnAnnounced: false,
  deathPrompt: false,
  lastSummaryAt: 0,
  previewSeed: 92821,
};

class AudioScene {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambience = null;
    this.enabled = false;
    this.nextByKey = new Map();
  }

  async enable() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.38;
      this.master.connect(this.ctx.destination);
      this.startAmbience();
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    this.enabled = true;
    return true;
  }

  startAmbience() {
    if (!this.ctx || !this.master || this.ambience) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 54;
    gain.gain.value = 0.018;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.ambience = { osc, gain };
  }

  setMuted(muted) {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.38, this.ctx.currentTime, 0.025);
    this.enabled = !muted;
  }

  playTone({ key, frequency, duration, gain, pan, type, nowMs, intervalMs }) {
    if (!this.enabled || !this.ctx || !this.master) return;
    const nextAt = this.nextByKey.get(key) || 0;
    if (nowMs < nextAt) return;
    this.nextByKey.set(key, nowMs + intervalMs);

    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    const panner = typeof this.ctx.createStereoPanner === "function" ? this.ctx.createStereoPanner() : null;
    const t = this.ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    if (panner) {
      panner.pan.value = clamp(pan, -1, 1);
      osc.connect(amp);
      amp.connect(panner);
      panner.connect(this.master);
    } else {
      osc.connect(amp);
      amp.connect(this.master);
    }
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  update(sceneState, nowMs) {
    if (!this.enabled) return;
    const self = getSelf(sceneState);
    if (!self) return;

    const candidates = collectNearby(sceneState, self)
      .filter((item) => item.distance <= NEARBY_RADIUS)
      .sort((a, b) => priorityOf(a.kind) - priorityOf(b.kind) || a.distance - b.distance)
      .slice(0, 6);

    for (const item of candidates) {
      const pan = clamp((item.entity.x - self.x) / 620, -1, 1);
      const closeness = clamp(1 - item.distance / NEARBY_RADIUS, 0, 1);
      if (item.kind === "threat") {
        this.playTone({
          key: `threat:${item.entity.id}`,
          frequency: 82 + closeness * 42,
          duration: 0.16,
          gain: 0.045 + closeness * 0.11,
          pan,
          type: "sawtooth",
          nowMs,
          intervalMs: 720 - closeness * 480,
        });
      } else if (item.kind === "edible") {
        this.playTone({
          key: `edible:${item.entity.id}`,
          frequency: 520 + closeness * 210,
          duration: 0.11,
          gain: 0.035 + closeness * 0.075,
          pan,
          type: "triangle",
          nowMs,
          intervalMs: 620 - closeness * 360,
        });
      } else if (item.kind === "pellet") {
        this.playTone({
          key: `pellet:${item.entity.id}`,
          frequency: 900 + closeness * 380,
          duration: 0.045,
          gain: 0.018 + closeness * 0.055,
          pan,
          type: "sine",
          nowMs,
          intervalMs: 780 - closeness * 420,
        });
      }
    }
  }
}

const audio = new AudioScene();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function sanitizeRoomId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}

function sanitizeName(value) {
  const clean = String(value || "").trim().replace(/[^\w .-]/g, "").slice(0, 24);
  return clean || "Player";
}

function loadProfileName() {
  try {
    const raw = window.localStorage.getItem("cadegames:v1");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed?.profile?.name || "";
  } catch {
    return "";
  }
}

function createEmptyState(roomId) {
  return {
    players: [],
    pellets: [],
    arenaWidth: ARENA_DEFAULT.width,
    arenaHeight: ARENA_DEFAULT.height,
    tick: 0,
    roomId,
  };
}

function cloneState(source) {
  return {
    players: source.players.map((p) => ({ ...p })),
    pellets: source.pellets.map((p) => ({ ...p })),
    arenaWidth: source.arenaWidth,
    arenaHeight: source.arenaHeight,
    tick: source.tick,
    roomId: source.roomId,
  };
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function createPreviewState() {
  const random = seededRandom(game.previewSeed);
  const players = [
    makeCell({ id: "self", name: requestedName, x: 2100, y: 2100, mass: 38, isSelf: true }),
    makeCell({ id: "alto", name: "Alto", x: 1640, y: 1880, mass: 23 }),
    makeCell({ id: "bass", name: "Bass", x: 2570, y: 2440, mass: 68 }),
    makeCell({ id: "pulse", name: "Pulse", x: 2450, y: 1760, mass: 31 }),
    makeCell({ id: "drift", name: "Drift", x: 1800, y: 2480, mass: 55 }),
  ];
  const pellets = [];
  for (let i = 0; i < 95; i += 1) {
    pellets.push({
      id: `pellet-${i}`,
      x: 260 + random() * (ARENA_DEFAULT.width - 520),
      y: 260 + random() * (ARENA_DEFAULT.height - 520),
      value: 1 + Math.floor(random() * 3),
    });
  }
  return {
    players,
    pellets,
    arenaWidth: ARENA_DEFAULT.width,
    arenaHeight: ARENA_DEFAULT.height,
    tick: 0,
    roomId: requestedRoomId,
  };
}

function makeCell(source) {
  const mass = Number.isFinite(source.mass) ? source.mass : 24;
  const radius = Number.isFinite(source.radius) ? source.radius : massToRadius(mass);
  return {
    id: String(source.id || makeLocalId()),
    name: sanitizeName(source.name || "Orb"),
    x: Number.isFinite(source.x) ? source.x : 0,
    y: Number.isFinite(source.y) ? source.y : 0,
    vx: Number.isFinite(source.vx) ? source.vx : 0,
    vy: Number.isFinite(source.vy) ? source.vy : 0,
    mass,
    radius,
    isSelf: Boolean(source.isSelf),
  };
}

function makeLocalId() {
  return `local-${Math.random().toString(36).slice(2, 9)}`;
}

function massToRadius(mass) {
  return 10 + Math.sqrt(Math.max(1, mass)) * 3.2;
}

function sizeTier(mass) {
  if (mass >= 150) return "giant";
  if (mass >= 85) return "large";
  if (mass >= 42) return "medium";
  return "small";
}

function collectionFrom(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function normalizeServerState(update) {
  const payload = update?.payload?.state || update?.payload || update || {};
  const rawPlayers = collectionFrom(payload.players || payload.cells || payload.orbs);
  const rawPellets = collectionFrom(payload.pellets || payload.food);
  const selfId = String(payload.selfId || payload.playerId || game.selfId || "");

  const players = rawPlayers.map((raw) => {
    const id = String(raw.id || raw.playerId || raw.cellId || makeLocalId());
    return makeCell({
      id,
      name: raw.name || raw.displayName || (id === selfId ? requestedName : "Orb"),
      x: Number(raw.x),
      y: Number(raw.y),
      vx: Number(raw.vx),
      vy: Number(raw.vy),
      mass: Number(raw.mass),
      radius: Number(raw.radius),
      isSelf: Boolean(raw.isSelf || raw.self || id === selfId),
    });
  });

  let nextSelfId = selfId;
  const explicitSelf = players.find((player) => player.isSelf);
  if (explicitSelf) nextSelfId = explicitSelf.id;
  if (nextSelfId) {
    game.selfId = nextSelfId;
    for (const player of players) player.isSelf = player.id === nextSelfId || player.isSelf;
  }

  const pellets = rawPellets
    .map((raw, index) => ({
      id: String(raw.id || raw.pelletId || `pellet-${index}`),
      x: Number(raw.x),
      y: Number(raw.y),
      value: Number.isFinite(Number(raw.value)) ? Number(raw.value) : 1,
    }))
    .filter((pellet) => Number.isFinite(pellet.x) && Number.isFinite(pellet.y));

  if (!players.length && !pellets.length) return null;
  return {
    players,
    pellets,
    arenaWidth: Number.isFinite(Number(payload.arenaWidth || payload.width))
      ? Number(payload.arenaWidth || payload.width)
      : ARENA_DEFAULT.width,
    arenaHeight: Number.isFinite(Number(payload.arenaHeight || payload.height))
      ? Number(payload.arenaHeight || payload.height)
      : ARENA_DEFAULT.height,
    tick: Number.isFinite(Number(payload.tick)) ? Number(payload.tick) : game.targetState.tick + 1,
    roomId: sanitizeRoomId(payload.roomId || update.roomId || game.roomId) || game.roomId,
  };
}

function applyAuthoritativeState(nextState, receivedAt) {
  game.usingPreview = false;
  game.previousState = cloneState(game.renderState.players.length ? game.renderState : nextState);
  game.targetState = cloneState(nextState);
  game.renderState = sampleInterpolatedState(receivedAt);
  game.interpolationStart = receivedAt;
  game.lastServerStateAt = receivedAt;
  game.roomId = nextState.roomId || game.roomId;
  if (game.mode !== "playing") {
    game.mode = "playing";
    hideMenu();
  }
}

function sampleInterpolatedState(nowMs) {
  const t = clamp((nowMs - game.interpolationStart) / SERVER_INTERPOLATION_MS, 0, 1);
  const previousPlayers = new Map(game.previousState.players.map((player) => [player.id, player]));
  const previousPellets = new Map(game.previousState.pellets.map((pellet) => [pellet.id, pellet]));

  return {
    players: game.targetState.players.map((target) => {
      const prev = previousPlayers.get(target.id) || target;
      return {
        ...target,
        x: lerp(prev.x, target.x, t),
        y: lerp(prev.y, target.y, t),
        vx: lerp(prev.vx, target.vx, t),
        vy: lerp(prev.vy, target.vy, t),
        mass: lerp(prev.mass, target.mass, t),
        radius: lerp(prev.radius, target.radius, t),
      };
    }),
    pellets: game.targetState.pellets.map((target) => {
      const prev = previousPellets.get(target.id) || target;
      return {
        ...target,
        x: lerp(prev.x, target.x, t),
        y: lerp(prev.y, target.y, t),
      };
    }),
    arenaWidth: game.targetState.arenaWidth,
    arenaHeight: game.targetState.arenaHeight,
    tick: game.targetState.tick,
    roomId: game.targetState.roomId,
  };
}

function getSelf(sceneState = game.renderState) {
  return sceneState.players.find((player) => player.isSelf) || sceneState.players.find((player) => player.id === game.selfId) || null;
}

function canEat(a, b) {
  return a.mass >= b.mass * 1.18;
}

function collectNearby(sceneState, self) {
  const nearby = [];
  for (const player of sceneState.players) {
    if (player.id === self.id) continue;
    const d = distance(self, player);
    let kind = "neutral";
    if (canEat(player, self)) kind = "threat";
    else if (canEat(self, player)) kind = "edible";
    nearby.push({ kind, entity: player, distance: d });
  }
  for (const pellet of sceneState.pellets) {
    nearby.push({ kind: "pellet", entity: pellet, distance: distance(self, pellet) });
  }
  return nearby;
}

function priorityOf(kind) {
  if (kind === "threat") return 0;
  if (kind === "edible") return 1;
  if (kind === "pellet") return 2;
  return 3;
}

function directionCodeFromVector(vector) {
  if (!vector || (Math.abs(vector.x) < 0.01 && Math.abs(vector.y) < 0.01)) return "STOP";
  const vertical = vector.y < -0.2 ? "N" : vector.y > 0.2 ? "S" : "";
  const horizontal = vector.x < -0.2 ? "W" : vector.x > 0.2 ? "E" : "";
  return `${vertical}${horizontal}` || "STOP";
}

function directionWordsFromDelta(dx, dy) {
  const vertical = dy < -24 ? "north" : dy > 24 ? "south" : "";
  const horizontal = dx < -24 ? "west" : dx > 24 ? "east" : "";
  if (vertical && horizontal) return `${vertical} ${horizontal}`;
  return vertical || horizontal || "nearby";
}

function updateInputVector() {
  let x = 0;
  let y = 0;
  for (const code of input.pressed) {
    const dir = DIR_KEYS.get(code);
    if (!dir) continue;
    x += dir.x;
    y += dir.y;
  }
  const length = Math.hypot(x, y);
  input.vector = length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
  input.direction = directionCodeFromVector(input.vector);
  if (input.direction !== "STOP") input.lastDirection = input.direction;
}

function sendMove(force = false) {
  if (game.mode !== "playing") return;
  const now = game.nowMs;
  if (!force && now - input.lastSentAt < MOVE_RESEND_MS) return;
  input.lastSentAt = now;
  game.connection?.sendInput({
    type: "move",
    direction: input.direction,
    vector: { ...input.vector },
  });
}

function sendAction(type) {
  if (game.mode === "menu") return;
  const vector = input.direction === "STOP" ? vectorFromDirection(input.lastDirection) : { ...input.vector };
  game.connection?.sendInput({
    type,
    direction: directionCodeFromVector(vector),
    vector,
  });
  if (game.usingPreview) applyPreviewAction(type, vector);
}

function vectorFromDirection(direction) {
  const x = direction.includes("W") ? -1 : direction.includes("E") ? 1 : 0;
  const y = direction.includes("N") ? -1 : direction.includes("S") ? 1 : 0;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function showMenu(copy) {
  if (copy) menuCopyEl.textContent = copy;
  menuEl.classList.add("show");
}

function hideMenu() {
  menuEl.classList.remove("show");
}

function setStatus(text) {
  statusLineEl.textContent = text;
}

function announcePolite(message, key = message, gapMs = 2200) {
  announce(politeLiveEl, message, key, gapMs);
}

function announceAssertive(message, key = message, gapMs = 5000) {
  announce(assertiveLiveEl, message, key, gapMs);
}

const lastAnnouncementAt = new Map();

function announce(element, message, key, gapMs) {
  const now = game.nowMs;
  const lastAt = lastAnnouncementAt.get(key) || 0;
  if (now - lastAt < gapMs) return;
  lastAnnouncementAt.set(key, now);
  element.textContent = "";
  window.requestAnimationFrame(() => {
    element.textContent = message;
  });
}

async function enableAudio() {
  const ok = await audio.enable();
  hud.audio.textContent = ok ? "On" : "Unavailable";
  audioBtn.textContent = ok ? "Audio On" : "Audio Unavailable";
  if (ok) announcePolite("Audio enabled. Pellets tick, edible orbs chime, and threats pulse low.");
  return ok;
}

async function joinGame() {
  hideMenu();
  game.mode = "playing";
  game.deathPrompt = false;
  setStatus("Joining multiplayer arena...");
  announcePolite("Joining Audio Agar. Use WASD or arrow keys to move. Press H for help.");
  try {
    rememberRecent(GAME_ID);
  } catch {
    // Ignore storage issues.
  }
  await enableAudio();
  if (offlinePreview) {
    game.connectionStatus = "offline";
    activatePreview("Offline sensory preview active for local testing.");
  } else if (!game.connection) {
    startConnection();
  }
  if (forcePreview) {
    activatePreview("Preview arena active from URL option.");
  } else {
    window.setTimeout(() => {
      if (!game.lastServerStateAt && game.mode === "playing") {
        activatePreview("No authoritative arena state received yet. Sensory preview is active until the server sends a room snapshot.");
      }
    }, PREVIEW_AFTER_MS);
  }
}

async function startConnection() {
  if (offlinePreview) {
    game.connectionStatus = "offline";
    return;
  }
  try {
    const connection = await connect({
      gameId: GAME_ID,
      roomId: requestedRoomId,
      playerName: requestedName,
    });
    game.connection = connection;
    connection.onStateUpdate((update) => {
      const nextState = normalizeServerState(update);
      if (!nextState) return;
      applyAuthoritativeState(nextState, update.receivedAt || performance.now());
      setStatus(`Connected to room ${nextState.roomId}. Server tick ${nextState.tick}.`);
      updateHudAndAccessibility();
    });
    connection.onEvent(handleConnectionEvent);
  } catch (err) {
    game.connectionStatus = "error";
    setStatus(`Connection setup failed: ${String(err?.message || err)}`);
    activatePreview("Connection setup failed. Sensory preview is active.");
  }
}

function handleConnectionEvent(event) {
  if (!event || typeof event !== "object") return;
  if (event.status) {
    game.connectionStatus = event.status;
    if (event.status === "open") {
      setStatus("Connected. Waiting for authoritative arena state.");
      announcePolite("Connected to multiplayer server. Waiting for arena state.", "connected");
    } else if (event.status === "reconnecting") {
      setStatus(`Connection lost. Reconnecting in ${Math.round((event.delayMs || 0) / 1000)} seconds.`);
    } else if (event.status === "error") {
      setStatus("WebSocket error. Reconnect is active.");
    } else if (event.status === "closed") {
      setStatus("WebSocket closed. Reconnect is active.");
    }
  }

  const payload = event.payload || {};
  if (payload.selfId || payload.playerId) {
    game.selfId = String(payload.selfId || payload.playerId);
  }
  if (payload.roomId || event.roomId) {
    game.roomId = sanitizeRoomId(payload.roomId || event.roomId) || game.roomId;
  }

  if (event.type === "death" || payload.type === "death") {
    game.deathPrompt = true;
    const eater = sanitizeName(payload.eaterName || payload.by || "another orb");
    const mass = Math.round(Number(payload.finalMass || payload.mass || 0));
    announceAssertive(`You were eaten by ${eater}. Final mass ${mass}. Press Enter to rejoin.`, "death", 1200);
    showMenu(`You were eaten by ${eater}. Press Join Arena or Enter to respawn.`);
  } else if (event.type === "joined" || event.type === "welcome") {
    announcePolite(`Joined room ${game.roomId}.`, "joined");
  } else if (event.type === "error") {
    announcePolite(`Connection warning: ${event.message || "server error"}`, "connection-warning", 6000);
  }
}

function activatePreview(reason) {
  if (game.lastServerStateAt && !forcePreview) return;
  if (!game.usingPreview) {
    const preview = createPreviewState();
    game.selfId = "self";
    game.previousState = cloneState(preview);
    game.targetState = cloneState(preview);
    game.renderState = cloneState(preview);
    game.interpolationStart = game.nowMs;
    game.previewStartedAt = game.nowMs;
    game.usingPreview = true;
    announcePolite("Sensory preview active. Multiplayer will take over when the server sends state.", "preview");
  }
  setStatus(reason);
}

function updatePreview(dt) {
  if (!game.usingPreview) return;
  const state = game.targetState;
  const self = getSelf(state);
  if (!self) return;

  const speed = 315 / Math.sqrt(Math.max(1, self.mass / 30));
  self.vx = input.vector.x * speed;
  self.vy = input.vector.y * speed;
  self.x = clamp(self.x + self.vx * dt, self.radius, state.arenaWidth - self.radius);
  self.y = clamp(self.y + self.vy * dt, self.radius, state.arenaHeight - self.radius);

  for (const bot of state.players) {
    if (bot.id === self.id) continue;
    const phase = (state.tick * 0.018 + hashText(bot.id) * 0.001) % (Math.PI * 2);
    const driftX = Math.cos(phase) * 0.8;
    const driftY = Math.sin(phase * 0.7) * 0.8;
    const botSpeed = 118 / Math.sqrt(Math.max(1, bot.mass / 35));
    bot.vx = driftX * botSpeed;
    bot.vy = driftY * botSpeed;
    bot.x = clamp(bot.x + bot.vx * dt, bot.radius, state.arenaWidth - bot.radius);
    bot.y = clamp(bot.y + bot.vy * dt, bot.radius, state.arenaHeight - bot.radius);
  }

  eatPreviewPellets(state, self);
  resolvePreviewCells(state, self);
  state.tick += 1;
  game.renderState = cloneState(state);
}

function eatPreviewPellets(state, self) {
  const remaining = [];
  let eaten = 0;
  for (const pellet of state.pellets) {
    if (distance(self, pellet) <= self.radius + 7) {
      self.mass += pellet.value;
      eaten += 1;
    } else {
      remaining.push(pellet);
    }
  }
  if (eaten) {
    self.radius = massToRadius(self.mass);
    const random = seededRandom(game.previewSeed + state.tick + eaten);
    while (remaining.length < 95) {
      remaining.push({
        id: `pellet-${state.tick}-${remaining.length}`,
        x: 260 + random() * (state.arenaWidth - 520),
        y: 260 + random() * (state.arenaHeight - 520),
        value: 1 + Math.floor(random() * 3),
      });
    }
  }
  state.pellets = remaining;
}

function resolvePreviewCells(state, self) {
  for (const bot of state.players) {
    if (bot.id === self.id) continue;
    const overlap = distance(self, bot) <= Math.max(self.radius, bot.radius) * 0.82;
    if (!overlap) continue;
    if (canEat(self, bot)) {
      self.mass += Math.floor(bot.mass * 0.62);
      self.radius = massToRadius(self.mass);
      respawnBot(bot, state.tick);
      announcePolite(`You absorbed ${bot.name}. Mass ${Math.round(self.mass)}.`, `ate-${bot.id}`, 1200);
    } else if (canEat(bot, self)) {
      const finalMass = Math.round(self.mass);
      self.mass = 32;
      self.radius = massToRadius(self.mass);
      self.x = state.arenaWidth / 2;
      self.y = state.arenaHeight / 2;
      announceAssertive(`You were eaten by ${bot.name}. Final mass ${finalMass}. Preview respawned you at center.`, "preview-death", 1200);
    }
  }
}

function respawnBot(bot, tick) {
  const random = seededRandom(hashText(bot.id) + tick + 19);
  bot.mass = 24 + Math.floor(random() * 70);
  bot.radius = massToRadius(bot.mass);
  bot.x = 320 + random() * (ARENA_DEFAULT.width - 640);
  bot.y = 320 + random() * (ARENA_DEFAULT.height - 640);
}

function applyPreviewAction(type, vector) {
  const self = getSelf(game.targetState);
  if (!self) return;
  if (type === "split" && self.mass > 36) {
    self.mass *= 0.82;
    self.vx += vector.x * 420;
    self.vy += vector.y * 420;
    self.radius = massToRadius(self.mass);
    announcePolite("Split burst sent forward.", "preview-split", 900);
  } else if (type === "eject" && self.mass > 18) {
    self.mass = Math.max(12, self.mass - 4);
    self.radius = massToRadius(self.mass);
    announcePolite("Mass ejected forward.", "preview-eject", 900);
  }
}

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function updateHudAndAccessibility() {
  const self = getSelf(game.renderState);
  const nearby = self ? collectNearby(game.renderState, self) : [];
  const threats = nearby.filter((item) => item.kind === "threat" && item.distance < NEARBY_RADIUS);
  const edible = nearby.filter((item) => item.kind === "edible" && item.distance < NEARBY_RADIUS);
  const pellets = nearby.filter((item) => item.kind === "pellet" && item.distance < NEARBY_RADIUS);
  const tier = self ? sizeTier(self.mass) : game.lastTier;

  hud.mode.textContent = game.usingPreview ? "Preview" : game.connectionStatus || game.mode;
  hud.mass.textContent = self ? String(Math.round(self.mass)) : "0";
  hud.tier.textContent = capitalize(tier);
  hud.threats.textContent = String(threats.length);
  hud.targets.textContent = String(edible.length);
  hud.pellets.textContent = String(pellets.length);
  hud.room.textContent = game.roomId || "-";
  hud.audio.textContent = audio.enabled ? "On" : "Off";

  if (!self) return;
  if (!game.spawnAnnounced) {
    game.spawnAnnounced = true;
    announcePolite(`Spawned ${tier} size. Nearby: ${threats.length} threats, ${edible.length} edible orbs, ${pellets.length} pellets.`);
  }
  if (tier !== game.lastTier) {
    game.lastTier = tier;
    announcePolite(`You are now ${tier} size. Mass ${Math.round(self.mass)}.`, `tier-${tier}`, 800);
  }

  const criticalThreat = threats.sort((a, b) => a.distance - b.distance)[0];
  if (criticalThreat && criticalThreat.distance <= CRITICAL_THREAT_RADIUS) {
    const dir = directionWordsFromDelta(criticalThreat.entity.x - self.x, criticalThreat.entity.y - self.y);
    announceAssertive(
      `Warning: larger cell ${dir}, distance ${distanceUnits(criticalThreat.distance)}.`,
      `critical-${criticalThreat.entity.id}`,
      3600
    );
  }

  if (game.nowMs - game.lastSummaryAt > 9000) {
    game.lastSummaryAt = game.nowMs;
    const nearest = nearestUsefulSummary(self, nearby);
    if (nearest) announcePolite(nearest, "summary", 7000);
  }
}

function nearestUsefulSummary(self, nearby) {
  const sorted = nearby.filter((item) => item.distance < NEARBY_RADIUS).sort((a, b) => priorityOf(a.kind) - priorityOf(b.kind) || a.distance - b.distance);
  const item = sorted[0];
  if (!item) return `Mass ${Math.round(self.mass)}. No nearby entities.`;
  const dir = directionWordsFromDelta(item.entity.x - self.x, item.entity.y - self.y);
  if (item.kind === "threat") return `Nearest threat ${dir}, distance ${distanceUnits(item.distance)}.`;
  if (item.kind === "edible") return `Nearest edible orb ${dir}, distance ${distanceUnits(item.distance)}.`;
  return `Nearest pellet ${dir}, distance ${distanceUnits(item.distance)}.`;
}

function distanceUnits(value) {
  return Math.max(1, Math.round(value / 100));
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

function announceHelp() {
  const self = getSelf(game.renderState);
  const nearby = self ? collectNearby(game.renderState, self) : [];
  const threats = nearby.filter((item) => item.kind === "threat" && item.distance < NEARBY_RADIUS);
  const edible = nearby.filter((item) => item.kind === "edible" && item.distance < NEARBY_RADIUS);
  const pellets = nearby.filter((item) => item.kind === "pellet" && item.distance < NEARBY_RADIUS);
  const tier = self ? sizeTier(self.mass) : "unknown";
  const nearest = self ? nearestUsefulSummary(self, nearby) : "No arena state yet.";
  announcePolite(
    `Controls: WASD or arrows move in eight directions. Space splits. E ejects mass. F toggles fullscreen. You are ${tier}. ${threats.length} threats, ${edible.length} edible orbs, ${pellets.length} pellets nearby. ${nearest}`,
    "help",
    500
  );
  setStatus("Help announced to screen reader.");
}

function render() {
  const state = game.renderState;
  const self = getSelf(state);
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  drawBackground(state, self);
  if (!self) {
    drawCenterText("Waiting for arena state");
    return;
  }

  const zoom = clamp(1.04 - self.radius / 220, 0.46, 1.0);
  const toScreen = (entity) => ({
    x: VIEW.width / 2 + (entity.x - self.x) * zoom,
    y: VIEW.height / 2 + (entity.y - self.y) * zoom,
  });

  for (const pellet of state.pellets) {
    const point = toScreen(pellet);
    if (!isOnScreen(point, 12)) continue;
    ctx.beginPath();
    ctx.fillStyle = pellet.value > 1 ? COLORS.pelletB : COLORS.pelletA;
    ctx.globalAlpha = 0.86;
    ctx.arc(point.x, point.y, 2.5 + pellet.value * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const players = [...state.players].sort((a, b) => a.radius - b.radius);
  for (const player of players) {
    const point = toScreen(player);
    if (!isOnScreen(point, player.radius * zoom + 28)) continue;
    const kind = player.isSelf ? "self" : canEat(player, self) ? "threat" : canEat(self, player) ? "edible" : "neutral";
    drawOrb(point, player.radius * zoom, kind, player.name, player.mass, player.isSelf);
  }

  drawCompass(self, state);
}

function drawBackground(state, self) {
  const gradient = ctx.createLinearGradient(0, 0, VIEW.width, VIEW.height);
  gradient.addColorStop(0, "#121d26");
  gradient.addColorStop(0.52, "#171b23");
  gradient.addColorStop(1, "#211816");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  const grid = 80;
  const offsetX = self ? ((-self.x * 0.62) % grid) : 0;
  const offsetY = self ? ((-self.y * 0.62) % grid) : 0;
  for (let x = offsetX; x < VIEW.width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, VIEW.height);
    ctx.stroke();
  }
  for (let y = offsetY; y < VIEW.height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.font = "700 13px Trebuchet MS, Segoe UI, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(game.usingPreview ? "Sensory preview" : `Room ${state.roomId || game.roomId}`, 14, 24);
}

function drawOrb(point, radius, kind, name, mass, isSelf) {
  const fill = COLORS[kind] || COLORS.neutral;
  ctx.save();
  ctx.shadowColor = fill;
  ctx.shadowBlur = isSelf ? 18 : 10;
  ctx.beginPath();
  ctx.fillStyle = fill;
  ctx.globalAlpha = isSelf ? 0.95 : 0.82;
  ctx.arc(point.x, point.y, Math.max(5, radius), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = isSelf ? 4 : 2;
  ctx.strokeStyle = isSelf ? "#ffffff" : "rgba(255, 255, 255, 0.58)";
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#071015";
  ctx.font = `${clamp(radius * 0.32, 10, 18)}px Trebuchet MS, Segoe UI, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(isSelf ? "You" : name.slice(0, 10), point.x, point.y - 3);
  ctx.font = "700 11px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText(String(Math.round(mass)), point.x, point.y + 13);
  ctx.restore();
}

function drawCompass(self, state) {
  const nearby = collectNearby(state, self).filter((item) => item.distance < NEARBY_RADIUS);
  const nearestThreat = nearby.filter((item) => item.kind === "threat").sort((a, b) => a.distance - b.distance)[0];
  if (!nearestThreat) return;
  const angle = Math.atan2(nearestThreat.entity.y - self.y, nearestThreat.entity.x - self.x);
  const x = VIEW.width - 44 + Math.cos(angle) * 16;
  const y = 44 + Math.sin(angle) * 16;
  ctx.save();
  ctx.strokeStyle = COLORS.threat;
  ctx.fillStyle = COLORS.threat;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(VIEW.width - 44, 44, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.cos(angle - 0.55) * 13, y - Math.sin(angle - 0.55) * 13);
  ctx.lineTo(x - Math.cos(angle + 0.55) * 13, y - Math.sin(angle + 0.55) * 13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCenterText(text) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
  ctx.font = "800 24px Trebuchet MS, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, VIEW.width / 2, VIEW.height / 2);
}

function isOnScreen(point, padding) {
  return point.x >= -padding && point.x <= VIEW.width + padding && point.y >= -padding && point.y <= VIEW.height + padding;
}

function update(dt, nowMs) {
  game.nowMs = nowMs;
  if (game.mode === "playing") {
    if (!game.lastServerStateAt && !game.usingPreview && nowMs - game.lastFrameAt > PREVIEW_AFTER_MS && forcePreview) {
      activatePreview("Preview arena active.");
    }
    sendMove(false);
    updatePreview(dt);
    if (!game.usingPreview) {
      game.renderState = sampleInterpolatedState(nowMs);
    }
    audio.update(game.renderState, nowMs);
    updateHudAndAccessibility();
  }
}

function frame(now) {
  if (!game.manualStepping) {
    const dt = clamp((now - game.lastFrameAt) / 1000, 0, 0.05);
    update(dt, now);
    render();
    game.lastFrameAt = now;
  }
  requestAnimationFrame(frame);
}

function reconnect() {
  if (game.connection) {
    game.connection.disconnect();
    game.connection = null;
  }
  game.connectionStatus = "connecting";
  game.lastServerStateAt = 0;
  startConnection();
  setStatus("Reconnecting to multiplayer server...");
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function handleKeyDown(event) {
  if (event.repeat && !DIR_KEYS.has(event.code)) return;
  if (DIR_KEYS.has(event.code)) {
    event.preventDefault();
    input.pressed.add(event.code);
    updateInputVector();
    sendMove(true);
    return;
  }
  if (event.code === "Space" && !isFormControl(event.target)) {
    event.preventDefault();
    sendAction("split");
  } else if (event.code === "KeyE" && !isFormControl(event.target)) {
    event.preventDefault();
    sendAction("eject");
  } else if (event.code === "KeyH" && !isFormControl(event.target)) {
    event.preventDefault();
    announceHelp();
  } else if (event.code === "KeyF" && !isFormControl(event.target)) {
    event.preventDefault();
    toggleFullscreen();
  } else if (event.code === "Enter" && (game.mode === "menu" || game.deathPrompt)) {
    event.preventDefault();
    joinGame();
  }
}

function handleKeyUp(event) {
  if (!DIR_KEYS.has(event.code)) return;
  event.preventDefault();
  input.pressed.delete(event.code);
  updateInputVector();
  sendMove(true);
}

function isFormControl(target) {
  const tag = String(target?.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || Boolean(target?.isContentEditable);
}

window.advanceTime = (ms) => {
  game.manualStepping = true;
  const steps = Math.max(1, Math.round(Number(ms || 0) / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) {
    game.nowMs += 1000 / 60;
    update(1 / 60, game.nowMs);
  }
  render();
  game.lastFrameAt = game.nowMs;
  game.manualStepping = false;
};

window.render_game_to_text = () => {
  const self = getSelf(game.renderState);
  const nearby = self ? collectNearby(game.renderState, self) : [];
  const summarize = (kind) => nearby
    .filter((item) => item.kind === kind)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((item) => ({
      id: item.entity.id,
      name: item.entity.name || item.entity.id,
      direction: directionWordsFromDelta(item.entity.x - self.x, item.entity.y - self.y),
      distance: distanceUnits(item.distance),
      mass: Number.isFinite(item.entity.mass) ? Math.round(item.entity.mass) : undefined,
    }));

  return JSON.stringify({
    coordinate_system: "Arena origin is top-left. X increases east/right. Y increases south/down. Directions are relative to your orb.",
    mode: game.mode,
    connection_status: game.connectionStatus,
    server_authoritative: !game.usingPreview && !offlinePreview,
    room_id: game.roomId,
    audio_enabled: audio.enabled,
    input: {
      direction: input.direction,
      last_direction: input.lastDirection,
    },
    self: self ? {
      id: self.id,
      x: Math.round(self.x),
      y: Math.round(self.y),
      mass: Math.round(self.mass),
      radius: Math.round(self.radius),
      tier: sizeTier(self.mass),
    } : null,
    nearby: self ? {
      threats: summarize("threat"),
      edible: summarize("edible"),
      pellets: summarize("pellet"),
    } : { threats: [], edible: [], pellets: [] },
    counts: {
      players: game.renderState.players.length,
      pellets: game.renderState.pellets.length,
    },
  });
};

joinBtn.addEventListener("click", joinGame);
audioBtn.addEventListener("click", enableAudio);
splitBtn.addEventListener("click", () => sendAction("split"));
ejectBtn.addEventListener("click", () => sendAction("eject"));
helpBtn.addEventListener("click", announceHelp);
fullscreenBtn.addEventListener("click", toggleFullscreen);
reconnectBtn.addEventListener("click", reconnect);
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("beforeunload", () => game.connection?.disconnect());

showMenu();
setStatus("Ready. Press Join Arena, then use WASD or arrow keys to move.");
if (offlinePreview) {
  game.connectionStatus = "offline";
} else {
  startConnection();
}
render();
requestAnimationFrame(frame);
