import { rememberRecent } from "../src/core/state.js";
import { connect } from "../src/net/multiplayerClient.js";

const GAME_ID = "audioagar";
const ARENA_DEFAULT = { width: 4200, height: 4200 };
const VIEW = { width: 960, height: 640 };
const SERVER_INTERPOLATION_MS = 130;
const MOVE_RESEND_MS = 120;
const CRITICAL_THREAT_RADIUS = 520;
const NEARBY_RADIUS = 1100;
const SCAN_RADIUS = 1500;
const AUTO_SCAN_MS = 6500;
const BOUNDARY_WARN_DISTANCE = 320;
const MASS_GAIN_STEP = 5;

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
const arenaPanel = document.getElementById("arenaPanel");
const menuEl = document.getElementById("menu");
const menuCopyEl = document.getElementById("menuCopy");
const joinBtn = document.getElementById("joinBtn");
const audioBtn = document.getElementById("audioBtn");
const splitBtn = document.getElementById("splitBtn");
const ejectBtn = document.getElementById("ejectBtn");
const scanBtn = document.getElementById("scanBtn");
const helpBtn = document.getElementById("helpBtn");
const speechBtn = document.getElementById("speechBtn");
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
  move: document.getElementById("moveValue"),
  position: document.getElementById("positionValue"),
  room: document.getElementById("roomValue"),
  audio: document.getElementById("audioValue"),
  sonar: document.getElementById("sonarValue"),
  guide: document.getElementById("guideValue"),
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
  lastTacticalScanAt: 0,
  lastBoundaryAlertAt: 0,
  lastMassCheckpoint: 0,
  lastThreatLock: "",
  lastScanText: "",
  lastGuideText: "-",
  lastSonarText: "Quiet",
  lastMoveCue: "Idle",
  lastMovementStatusAt: 0,
  speechEnabled: false,
  autoScanEnabled: true,
  previewSeed: 92821,
};

class AudioScene {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambience = null;
    this.enabled = false;
    this.nextByKey = new Map();
    this.scanSerial = 0;
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

  playScanSequence(items, self, nowMs) {
    if (!this.enabled || !this.ctx || !this.master || !self) return;
    const serial = this.scanSerial += 1;
    items.slice(0, 5).forEach((item, index) => {
      const delayMs = 110 + index * 165;
      window.setTimeout(() => {
        const pan = spatialPan(self, item.entity);
        const closeness = clamp(1 - item.distance / SCAN_RADIUS, 0, 1);
        if (item.kind === "threat") {
          this.playTone({
            key: `scan:${serial}:threat:${index}`,
            frequency: 96 + closeness * 38,
            duration: 0.2,
            gain: 0.08 + closeness * 0.12,
            pan,
            type: "sawtooth",
            nowMs: performance.now(),
            intervalMs: 1,
          });
          window.setTimeout(() => this.playTone({
            key: `scan:${serial}:threat-repeat:${index}`,
            frequency: 74 + closeness * 32,
            duration: 0.18,
            gain: 0.06 + closeness * 0.1,
            pan,
            type: "square",
            nowMs: performance.now(),
            intervalMs: 1,
          }), 92);
        } else if (item.kind === "edible") {
          this.playTone({
            key: `scan:${serial}:edible:${index}`,
            frequency: 520 + closeness * 230,
            duration: 0.12,
            gain: 0.07 + closeness * 0.07,
            pan,
            type: "triangle",
            nowMs: performance.now(),
            intervalMs: 1,
          });
          window.setTimeout(() => this.playTone({
            key: `scan:${serial}:edible-rise:${index}`,
            frequency: 680 + closeness * 260,
            duration: 0.11,
            gain: 0.05 + closeness * 0.06,
            pan,
            type: "triangle",
            nowMs: performance.now(),
            intervalMs: 1,
          }), 86);
        } else if (item.kind === "food") {
          for (let tick = 0; tick < 3; tick += 1) {
            window.setTimeout(() => this.playTone({
              key: `scan:${serial}:food:${index}:${tick}`,
              frequency: 920 + tick * 130 + closeness * 180,
              duration: 0.05,
              gain: 0.035 + closeness * 0.055,
              pan,
              type: "sine",
              nowMs: performance.now(),
              intervalMs: 1,
            }), tick * 58);
          }
        } else if (item.kind === "boundary") {
          this.playTone({
            key: `scan:${serial}:boundary:${index}`,
            frequency: 150,
            duration: 0.22,
            gain: 0.06,
            pan,
            type: "square",
            nowMs: performance.now(),
            intervalMs: 1,
          });
        }
      }, delayMs);
    });
  }

  playMassGain(amount, nowMs) {
    if (!this.enabled) return;
    const steps = clamp(Math.round(amount), 1, 5);
    for (let i = 0; i < steps; i += 1) {
      window.setTimeout(() => this.playTone({
        key: `mass:${Math.round(nowMs)}:${i}`,
        frequency: 440 + i * 84,
        duration: 0.08,
        gain: 0.055,
        pan: 0,
        type: "triangle",
        nowMs: performance.now(),
        intervalMs: 1,
      }), i * 62);
    }
  }

  playBoundaryWarning(boundary, nowMs) {
    if (!this.enabled || !boundary) return;
    this.playTone({
      key: `boundary:${boundary.wall}`,
      frequency: 132,
      duration: 0.18,
      gain: 0.07,
      pan: boundary.pan,
      type: "square",
      nowMs,
      intervalMs: 1400,
    });
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
  if (game.mode === "playing") {
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

function movementVectorFor(self) {
  if (input.direction !== "STOP" && Math.hypot(input.vector.x, input.vector.y) > 0.01) {
    return { ...input.vector };
  }
  const serverVector = self ? { x: Number(self.vx) || 0, y: Number(self.vy) || 0 } : { x: 0, y: 0 };
  if (Math.hypot(serverVector.x, serverVector.y) > 8) return serverVector;
  return { ...input.vector };
}

function movementSpeedFor(self) {
  if (!self) return 0;
  return Math.round(Math.hypot(Number(self.vx) || 0, Number(self.vy) || 0));
}

function movementLabelFor(self) {
  const vector = movementVectorFor(self);
  if (Math.hypot(vector.x, vector.y) <= 0.01) return "Idle";
  return capitalize(vectorWords(vector.x, vector.y));
}

function positionLabelFor(self) {
  if (!self) return "-";
  return `${Math.round(self.x)}, ${Math.round(self.y)}`;
}

function directionWordsFromDelta(dx, dy) {
  const vertical = dy < -24 ? "north" : dy > 24 ? "south" : "";
  const horizontal = dx < -24 ? "west" : dx > 24 ? "east" : "";
  if (vertical && horizontal) return `${vertical} ${horizontal}`;
  return vertical || horizontal || "nearby";
}

function spatialPan(self, entity) {
  if (!self || !entity) return 0;
  const dx = entity.x - self.x;
  const d = Math.max(1, Math.hypot(dx, entity.y - self.y));
  return clamp(dx / d, -1, 1);
}

function vectorWords(x, y) {
  if (Math.abs(x) < 0.12 && Math.abs(y) < 0.12) return "hold";
  return directionWordsFromDelta(x * 100, y * 100);
}

function clockDirectionFromDelta(dx, dy) {
  if (Math.hypot(dx, dy) < 24) return "on top of you";
  const angle = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
  const hour = Math.round(angle / (Math.PI * 2) * 12) || 12;
  return `${hour} o'clock`;
}

function describeBearing(self, entity) {
  const dx = entity.x - self.x;
  const dy = entity.y - self.y;
  const words = directionWordsFromDelta(dx, dy);
  const clock = clockDirectionFromDelta(dx, dy);
  return clock === "on top of you" ? words : `${words}, ${clock}`;
}

function getBoundaryAlert(self, state) {
  if (!self || !state) return null;
  const options = [
    { wall: "west", distance: self.x - self.radius, pan: -1, away: { x: 1, y: 0 } },
    { wall: "east", distance: state.arenaWidth - self.x - self.radius, pan: 1, away: { x: -1, y: 0 } },
    { wall: "north", distance: self.y - self.radius, pan: 0, away: { x: 0, y: 1 } },
    { wall: "south", distance: state.arenaHeight - self.y - self.radius, pan: 0, away: { x: 0, y: -1 } },
  ].sort((a, b) => a.distance - b.distance);
  const nearest = options[0];
  if (!nearest || nearest.distance > BOUNDARY_WARN_DISTANCE) return null;
  return {
    ...nearest,
    units: distanceUnits(nearest.distance),
    entity: {
      id: `wall-${nearest.wall}`,
      x: self.x - nearest.away.x * 260,
      y: self.y - nearest.away.y * 260,
    },
    kind: "boundary",
  };
}

function splitNearby(self, sceneState, radius = SCAN_RADIUS) {
  const nearby = self ? collectNearby(sceneState, self).filter((item) => item.distance <= radius) : [];
  return {
    all: nearby,
    threats: nearby.filter((item) => item.kind === "threat").sort((a, b) => a.distance - b.distance),
    edible: nearby.filter((item) => item.kind === "edible").sort((a, b) => a.distance - b.distance),
    pellets: nearby.filter((item) => item.kind === "pellet").sort((a, b) => a.distance - b.distance),
  };
}

function findFoodCluster(self, pellets) {
  if (!self || !pellets.length) return null;
  const sample = pellets.slice(0, 18);
  let weightTotal = 0;
  let xTotal = 0;
  let yTotal = 0;
  let valueTotal = 0;
  for (const item of sample) {
    const weight = (Number(item.entity.value) || 1) / Math.max(80, item.distance);
    weightTotal += weight;
    xTotal += item.entity.x * weight;
    yTotal += item.entity.y * weight;
    valueTotal += Number(item.entity.value) || 1;
  }
  if (!weightTotal) return null;
  const entity = {
    id: "food-cluster",
    name: "food cluster",
    x: xTotal / weightTotal,
    y: yTotal / weightTotal,
    value: valueTotal,
  };
  return {
    kind: "food",
    entity,
    distance: distance(self, entity),
    count: sample.length,
    value: Math.round(valueTotal),
  };
}

function chooseGuide(self, sceneState, groups, boundary) {
  const nearestThreat = groups.threats[0];
  const critical = nearestThreat && nearestThreat.distance <= CRITICAL_THREAT_RADIUS;
  if (critical) {
    let x = self.x - nearestThreat.entity.x;
    let y = self.y - nearestThreat.entity.y;
    if (boundary) {
      x += boundary.away.x * 320;
      y += boundary.away.y * 320;
    }
    const length = Math.hypot(x, y) || 1;
    return {
      kind: "escape",
      direction: vectorWords(x / length, y / length),
      text: `Escape ${vectorWords(x / length, y / length)}`,
    };
  }
  const target = groups.edible[0];
  if (target) {
    const direction = describeBearing(self, target.entity);
    return {
      kind: "hunt",
      direction,
      text: `Hunt ${target.entity.name || "orb"} ${direction}`,
    };
  }
  const food = findFoodCluster(self, groups.pellets);
  if (food) {
    const direction = describeBearing(self, food.entity);
    return {
      kind: "feed",
      direction,
      text: `Feed ${direction}`,
      food,
    };
  }
  const center = { x: sceneState.arenaWidth / 2, y: sceneState.arenaHeight / 2 };
  const direction = describeBearing(self, center);
  return { kind: "center", direction, text: `Return ${direction}` };
}

function buildTacticalScan() {
  const state = game.renderState;
  const self = getSelf(state);
  if (!self) return null;
  const groups = splitNearby(self, state, SCAN_RADIUS);
  const boundary = getBoundaryAlert(self, state);
  const guide = chooseGuide(self, state, groups, boundary);
  const nearestThreat = groups.threats[0];
  const nearestTarget = groups.edible[0];
  const food = guide.food || findFoodCluster(self, groups.pellets);
  const parts = [`Mass ${Math.round(self.mass)}, ${sizeTier(self.mass)}`];
  const audioItems = [];

  if (nearestThreat) {
    const threatText = `${nearestThreat.entity.name || "larger orb"} ${describeBearing(self, nearestThreat.entity)}, distance ${distanceUnits(nearestThreat.distance)}`;
    parts.push(nearestThreat.distance <= CRITICAL_THREAT_RADIUS ? `Danger ${threatText}` : `Threat ${threatText}`);
    audioItems.push(nearestThreat);
  } else {
    parts.push("No threats in scan range");
  }

  if (nearestTarget) {
    parts.push(`Edible ${nearestTarget.entity.name || "orb"} ${describeBearing(self, nearestTarget.entity)}, distance ${distanceUnits(nearestTarget.distance)}`);
    audioItems.push(nearestTarget);
  }

  if (food) {
    parts.push(`Food cluster ${describeBearing(self, food.entity)}, distance ${distanceUnits(food.distance)}, ${food.count || 1} pellets`);
    audioItems.push(food);
  }

  if (boundary) {
    parts.push(`${capitalize(boundary.wall)} wall distance ${boundary.units}`);
    audioItems.push(boundary);
  }

  parts.push(`Guide: ${guide.text}`);
  const text = parts.join(". ") + ".";
  return {
    text,
    status: `${guide.text}. ${nearestThreat ? `Threat ${distanceUnits(nearestThreat.distance)} away.` : "No close threat."}`,
    sonar: nearestThreat && nearestThreat.distance <= CRITICAL_THREAT_RADIUS ? "Danger" : nearestThreat ? "Threat" : food ? "Food" : "Quiet",
    guide: guide.text,
    critical: Boolean(nearestThreat && nearestThreat.distance <= CRITICAL_THREAT_RADIUS),
    audioItems,
    boundary,
    groups,
  };
}

function performTacticalScan(force = false, source = "auto") {
  const scan = buildTacticalScan();
  if (!scan) return null;
  const gap = force ? 500 : AUTO_SCAN_MS;
  if (!force && game.nowMs - game.lastTacticalScanAt < gap) return scan;
  game.lastTacticalScanAt = game.nowMs;
  game.lastScanText = scan.text;
  game.lastGuideText = scan.guide;
  game.lastSonarText = scan.sonar;
  setStatus(scan.status);
  audio.playScanSequence(scan.audioItems, getSelf(game.renderState), game.nowMs);
  if (scan.critical) {
    announceAssertive(scan.text, "tactical-critical", force ? 500 : 2400);
  } else {
    announcePolite(scan.text, source === "manual" ? "manual-scan" : "tactical-scan", force ? 500 : 5200);
  }
  speakCue(scan.text, scan.critical || source === "manual");
  return scan;
}

function speakCue(message, interrupt = false) {
  if (!game.speechEnabled || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
  if (interrupt) window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 1.08;
  utterance.pitch = 1;
  utterance.volume = 0.88;
  window.speechSynthesis.speak(utterance);
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
  if (ok) {
    announcePolite("Audio enabled. Threats pulse low, food ticks high, edible orbs chime, and scans describe the safest route.");
    performTacticalScan(true, "audio");
  }
  return ok;
}

function setSpeechUi() {
  const available = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  speechBtn.disabled = !available;
  speechBtn.setAttribute("aria-pressed", game.speechEnabled ? "true" : "false");
  speechBtn.textContent = available ? (game.speechEnabled ? "Speech On" : "Speech") : "Speech N/A";
}

function toggleSpeech() {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    announcePolite("Browser speech is unavailable. Screen reader live regions are still active.", "speech-unavailable", 500);
    return;
  }
  game.speechEnabled = !game.speechEnabled;
  setSpeechUi();
  const message = game.speechEnabled
    ? "Browser speech cues on. Press R for a spoken tactical scan. Press V again to turn speech off."
    : "Browser speech cues off. Screen reader live regions remain active.";
  announcePolite(message, "speech-toggle", 500);
  speakCue(message, true);
}

async function joinGame() {
  hideMenu();
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
  arenaPanel?.focus?.({ preventScroll: true });
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
  } else if (forcePreview) {
    activatePreview("Preview arena active from URL option.");
  } else {
    if (game.lastServerStateAt) {
      setStatus(`Connected to room ${game.roomId}. Server-authoritative arena active.`);
      announcePolite(`Joined server-authoritative room ${game.roomId}. Press R for a tactical scan.`, "server-joined", 700);
      performTacticalScan(true, "join");
    } else {
      activatePreview("Connecting to the multiplayer room. Sensory preview is active until authoritative state arrives.");
      if (!game.connection) startConnection();
    }
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
      if (game.mode !== "playing") {
        setStatus(`Connected to room ${nextState.roomId}. Press Join Arena to play.`);
      }
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
    game.lastTacticalScanAt = 0;
    game.lastMassCheckpoint = 0;
  }
  setStatus(reason);
  performTacticalScan(true, "spawn");
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
  const beforeMass = self.mass;
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
    audio.playMassGain(self.mass - beforeMass, game.nowMs);
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
  const groups = self ? splitNearby(self, game.renderState, NEARBY_RADIUS) : { threats: [], edible: [], pellets: [] };
  const threats = groups.threats;
  const edible = groups.edible;
  const pellets = groups.pellets;
  const tier = self ? sizeTier(self.mass) : game.lastTier;
  const moveLabel = self ? movementLabelFor(self) : "Idle";
  const speed = movementSpeedFor(self);

  hud.mode.textContent = game.usingPreview ? "Preview" : game.connectionStatus || game.mode;
  hud.mass.textContent = self ? String(Math.round(self.mass)) : "0";
  hud.tier.textContent = capitalize(tier);
  hud.threats.textContent = String(threats.length);
  hud.targets.textContent = String(edible.length);
  hud.pellets.textContent = String(pellets.length);
  hud.move.textContent = speed > 8 ? `${moveLabel} ${speed}` : moveLabel;
  hud.position.textContent = self ? positionLabelFor(self) : "-";
  hud.room.textContent = game.roomId || "-";
  hud.audio.textContent = audio.enabled ? "On" : "Off";
  hud.sonar.textContent = game.lastSonarText || "Quiet";
  hud.guide.textContent = game.lastGuideText || "-";

  if (!self) return;
  updateMovementFeedback(self, moveLabel, speed);
  if (!game.spawnAnnounced) {
    game.spawnAnnounced = true;
    announcePolite(`Spawned ${tier} size. Nearby: ${threats.length} threats, ${edible.length} edible orbs, ${pellets.length} pellets.`);
  }
  if (tier !== game.lastTier) {
    game.lastTier = tier;
    announcePolite(`You are now ${tier} size. Mass ${Math.round(self.mass)}.`, `tier-${tier}`, 800);
  }

  const massCheckpoint = Math.floor(self.mass / MASS_GAIN_STEP);
  if (!game.lastMassCheckpoint) {
    game.lastMassCheckpoint = massCheckpoint;
  } else if (massCheckpoint > game.lastMassCheckpoint) {
    game.lastMassCheckpoint = massCheckpoint;
    const message = `Mass ${Math.round(self.mass)}. You are ${tier}.`;
    announcePolite(message, "mass-gain", 1400);
    speakCue(message);
  }

  const boundary = getBoundaryAlert(self, game.renderState);
  if (boundary && game.nowMs - game.lastBoundaryAlertAt > 2200) {
    game.lastBoundaryAlertAt = game.nowMs;
    audio.playBoundaryWarning(boundary, game.nowMs);
    announcePolite(`${capitalize(boundary.wall)} wall close, distance ${boundary.units}. Move ${vectorWords(boundary.away.x, boundary.away.y)}.`, `boundary-${boundary.wall}`, 1600);
  }

  const criticalThreat = threats[0];
  if (criticalThreat && criticalThreat.distance <= CRITICAL_THREAT_RADIUS) {
    const dir = directionWordsFromDelta(criticalThreat.entity.x - self.x, criticalThreat.entity.y - self.y);
    if (game.lastThreatLock !== criticalThreat.entity.id) {
      game.lastThreatLock = criticalThreat.entity.id;
      performTacticalScan(true, "threat-lock");
    }
    announceAssertive(
      `Warning: larger cell ${dir}, distance ${distanceUnits(criticalThreat.distance)}.`,
      `critical-${criticalThreat.entity.id}`,
      3600
    );
  } else if (!criticalThreat || criticalThreat.distance > CRITICAL_THREAT_RADIUS * 1.35) {
    game.lastThreatLock = "";
  }

  if (game.autoScanEnabled && game.nowMs - game.lastTacticalScanAt > AUTO_SCAN_MS) {
    performTacticalScan(false, "auto");
  } else if (game.nowMs - game.lastSummaryAt > 12000) {
    game.lastSummaryAt = game.nowMs;
    const nearest = nearestUsefulSummary(self, groups.all);
    if (nearest) announcePolite(nearest, "summary", 7000);
  }
}

function updateMovementFeedback(self, moveLabel, speed) {
  if (game.mode !== "playing" || !self) return;
  const moving = moveLabel !== "Idle";
  const cue = moving ? `Moving ${moveLabel.toLowerCase()}` : "Idle";
  const position = positionLabelFor(self);
  if (cue !== game.lastMoveCue) {
    game.lastMoveCue = cue;
    const message = moving
      ? `${cue}. Position ${position}.`
      : `Stopped. Position ${position}.`;
    announcePolite(message, `move-${cue}`, 700);
  }
  const statusGap = moving ? 320 : 1400;
  if (game.nowMs - game.lastMovementStatusAt < statusGap) return;
  game.lastMovementStatusAt = game.nowMs;
  setStatus(moving
    ? `${cue}. Position ${position}. Speed ${speed}.`
    : `Idle at ${position}. Hold WASD or arrow keys to move.`);
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
  const groups = self ? splitNearby(self, game.renderState, NEARBY_RADIUS) : { all: [], threats: [], edible: [], pellets: [] };
  const tier = self ? sizeTier(self.mass) : "unknown";
  const nearest = self ? nearestUsefulSummary(self, groups.all) : "No arena state yet.";
  const scan = self ? buildTacticalScan() : null;
  announcePolite(
    `Controls: WASD or arrows move in eight directions. R scans the arena. Space splits. E ejects mass. H repeats help. V toggles optional browser speech. F toggles fullscreen. You are ${tier}. ${groups.threats.length} threats, ${groups.edible.length} edible orbs, ${groups.pellets.length} pellets nearby. ${nearest} ${scan ? scan.status : ""}`,
    "help",
    500
  );
  if (scan) performTacticalScan(true, "manual");
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
  const moveVector = movementVectorFor(self);
  const moveLength = Math.hypot(moveVector.x, moveVector.y);
  const cameraLead = moveLength > 0.01
    ? { x: (moveVector.x / moveLength) * 38, y: (moveVector.y / moveLength) * 38 }
    : { x: 0, y: 0 };
  const focus = { x: VIEW.width / 2 + cameraLead.x, y: VIEW.height / 2 + cameraLead.y };
  const toScreen = (entity) => ({
    x: focus.x + (entity.x - self.x) * zoom,
    y: focus.y + (entity.y - self.y) * zoom,
  });

  drawMovementCue(self, focus);

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
  if (self) {
    const moveLabel = movementLabelFor(self);
    const speed = movementSpeedFor(self);
    ctx.textAlign = "right";
    ctx.fillStyle = moveLabel === "Idle" ? "rgba(255, 255, 255, 0.68)" : "rgba(142, 242, 194, 0.92)";
    ctx.fillText(`${moveLabel} | ${positionLabelFor(self)} | ${speed}`, VIEW.width - 14, 24);
  }
}

function drawMovementCue(self, center = { x: VIEW.width / 2, y: VIEW.height / 2 }) {
  const vector = movementVectorFor(self);
  const length = Math.hypot(vector.x, vector.y);
  const intentActive = input.direction !== "STOP";
  if (length <= 0.01 && !intentActive) return;

  const dir = length > 0.01 ? { x: vector.x / length, y: vector.y / length } : vectorFromDirection(input.lastDirection);
  const baseRadius = clamp(self.radius * 0.72, 18, 46);

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(142, 242, 194, 0.72)";
  ctx.fillStyle = "rgba(142, 242, 194, 0.18)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(center.x - dir.x * (baseRadius + 6), center.y - dir.y * (baseRadius + 6));
  ctx.lineTo(center.x - dir.x * (baseRadius + 78), center.y - dir.y * (baseRadius + 78));
  ctx.stroke();

  for (let i = 0; i < 4; i += 1) {
    const distance = baseRadius + 22 + i * 20;
    const size = 12 - i * 2;
    const x = center.x - dir.x * distance;
    const y = center.y - dir.y * distance;
    ctx.globalAlpha = 0.34 - i * 0.055;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.94;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.76)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(center.x + dir.x * (baseRadius + 12), center.y + dir.y * (baseRadius + 12));
  ctx.lineTo(center.x + dir.x * (baseRadius + 42), center.y + dir.y * (baseRadius + 42));
  ctx.stroke();
  ctx.restore();
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
  } else if (event.code === "KeyR" && !isFormControl(event.target)) {
    event.preventDefault();
    performTacticalScan(true, "manual");
  } else if (event.code === "KeyH" && !isFormControl(event.target)) {
    event.preventDefault();
    announceHelp();
  } else if (event.code === "KeyV" && !isFormControl(event.target)) {
    event.preventDefault();
    toggleSpeech();
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
  const tactical = self ? buildTacticalScan() : null;
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
    tick: game.renderState.tick,
    audio_enabled: audio.enabled,
    browser_speech_enabled: game.speechEnabled,
    input: {
      direction: input.direction,
      last_direction: input.lastDirection,
      vector: {
        x: Number(input.vector.x.toFixed(2)),
        y: Number(input.vector.y.toFixed(2)),
      },
    },
    self: self ? {
      id: self.id,
      x: Math.round(self.x),
      y: Math.round(self.y),
      vx: Math.round(self.vx || 0),
      vy: Math.round(self.vy || 0),
      speed: movementSpeedFor(self),
      movement: movementLabelFor(self),
      mass: Math.round(self.mass),
      radius: Math.round(self.radius),
      tier: sizeTier(self.mass),
    } : null,
    nearby: self ? {
      threats: summarize("threat"),
      edible: summarize("edible"),
      pellets: summarize("pellet"),
    } : { threats: [], edible: [], pellets: [] },
    tactical: tactical ? {
      sonar: tactical.sonar,
      guide: tactical.guide,
      scan_text: tactical.text,
      critical: tactical.critical,
      boundary: tactical.boundary ? {
        wall: tactical.boundary.wall,
        distance: tactical.boundary.units,
        move: vectorWords(tactical.boundary.away.x, tactical.boundary.away.y),
      } : null,
    } : null,
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
scanBtn.addEventListener("click", () => performTacticalScan(true, "manual"));
helpBtn.addEventListener("click", announceHelp);
speechBtn.addEventListener("click", toggleSpeech);
fullscreenBtn.addEventListener("click", toggleFullscreen);
reconnectBtn.addEventListener("click", reconnect);
document.addEventListener("keydown", handleKeyDown, { capture: true });
document.addEventListener("keyup", handleKeyUp, { capture: true });
window.addEventListener("beforeunload", () => game.connection?.disconnect());

showMenu();
setSpeechUi();
setStatus("Ready. Press Join Arena, then use WASD or arrow keys to move.");
if (offlinePreview) {
  game.connectionStatus = "offline";
} else {
  startConnection();
}
render();
requestAnimationFrame(frame);
