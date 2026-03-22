(function () {
  "use strict";

  const DEFAULT_WORLD = {
    width: 1200,
    height: 720,
    blocked: [
      { x: 320, y: 220, width: 130, height: 220 },
      { x: 560, y: 100, width: 160, height: 140 },
      { x: 820, y: 320, width: 190, height: 180 },
    ],
  };

  const DEFAULT_ROOMS = [{ id: "town", name: "Town" }];
  const ROOM_PREF_KEY = "clubpenguin-world-preferred-room";
  const PLAYER_RADIUS = 14;
  const REMOTE_LERP = 0.18;
  const SELF_LERP = 0.26;
  const PORTAL_FILL = 0x0f3a54;
  const PORTAL_OUTLINE = 0xbde8ff;
  const PORTAL_ALPHA = 0.5;
  const ROOM_THEMES = {
    town: {
      sky: 0xd5efff,
      ground: 0x5bbf80,
      border: 0x2d5b47,
      obstacleFill: 0x76889a,
      obstacleLine: 0x435364,
      decorA: 0x89d7a6,
      decorB: 0x4ea174,
    },
    plaza: {
      sky: 0xffedd8,
      ground: 0xf3b989,
      border: 0x8b542f,
      obstacleFill: 0x9a755b,
      obstacleLine: 0x6d4a35,
      decorA: 0xffd8ad,
      decorB: 0xe39d62,
    },
    "snow-forts": {
      sky: 0xc7e9ff,
      ground: 0xeaf7ff,
      border: 0x58779a,
      obstacleFill: 0x9db2c4,
      obstacleLine: 0x667c92,
      decorA: 0xd4edff,
      decorB: 0xbbdaf0,
    },
  };

  const statusEl = document.getElementById("status");
  const playerCountEl = document.getElementById("player-count");
  const roomSelectEl = document.getElementById("room-select");
  const nameFormEl = document.getElementById("name-form");
  const nameInputEl = document.getElementById("name-input");
  const nameSaveEl = document.getElementById("name-save");
  const rosterEl = document.getElementById("player-roster");
  const chatLogEl = document.getElementById("chat-log");
  const chatFormEl = document.getElementById("chat-form");
  const chatInputEl = document.getElementById("chat-input");

  const state = {
    connected: false,
    selfId: null,
    roomId: "town",
    preferredRoomId: "town",
    pendingPortalRoomId: null,
    pendingPortalAt: 0,
    rooms: DEFAULT_ROOMS.slice(),
    world: DEFAULT_WORLD,
    players: new Map(),
    chatTail: [],
  };

  let ws = null;
  let reconnectTimer = null;
  let worldScene = null;

  function normalizeRoomId(raw) {
    if (typeof raw !== "string") {
      return "";
    }
    return raw.trim().toLowerCase().replace(/\s+/g, "-");
  }

  try {
    const preferred = normalizeRoomId(window.localStorage.getItem(ROOM_PREF_KEY) || "");
    if (preferred) {
      state.preferredRoomId = preferred;
      state.roomId = preferred;
    }
  } catch {
    // Ignore storage availability issues.
  }

  const roomFromUrl = normalizeRoomId(new URLSearchParams(window.location.search).get("room") || "");
  if (roomFromUrl) {
    state.preferredRoomId = roomFromUrl;
    state.roomId = roomFromUrl;
  }

  function wsUrl() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
  }

  function roomNameById(roomId) {
    const match = state.rooms.find((room) => room.id === roomId);
    return match ? match.name : roomId;
  }

  function pointInRect(x, y, rect) {
    if (!rect) {
      return false;
    }
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  function portalAt(x, y) {
    const portals = Array.isArray(state.world.portals) ? state.world.portals : [];
    for (const portal of portals) {
      if (portal && pointInRect(x, y, portal)) {
        return portal;
      }
    }
    return null;
  }

  function themeForRoom(roomId) {
    return ROOM_THEMES[roomId] || ROOM_THEMES.town;
  }

  function maybeTriggerPortalTransition() {
    if (!state.connected || !state.selfId) {
      return;
    }
    const self = state.players.get(state.selfId);
    if (!self) {
      return;
    }
    const activePortal = portalAt(self.x, self.y);
    if (!activePortal || !activePortal.toRoom) {
      state.pendingPortalRoomId = null;
      return;
    }
    const nextRoom = normalizeRoomId(activePortal.toRoom);
    if (!nextRoom || nextRoom === state.roomId) {
      state.pendingPortalRoomId = null;
      return;
    }
    const now = Date.now();
    if (state.pendingPortalRoomId === nextRoom && now - state.pendingPortalAt < 1800) {
      return;
    }
    state.pendingPortalRoomId = nextRoom;
    state.pendingPortalAt = now;
    setPreferredRoom(nextRoom);
    appendChat("system", `Entering ${roomNameById(nextRoom)}...`);
    sendEvent("room:join", { roomId: nextRoom });
  }

  function setPreferredRoom(roomId) {
    const normalized = normalizeRoomId(roomId);
    if (!normalized) {
      return;
    }
    state.preferredRoomId = normalized;
    try {
      window.localStorage.setItem(ROOM_PREF_KEY, normalized);
    } catch {
      // Ignore storage availability issues.
    }
  }

  function syncRoomQuery(roomId) {
    try {
      const url = new URL(window.location.href);
      if (roomId) {
        url.searchParams.set("room", roomId);
      } else {
        url.searchParams.delete("room");
      }
      window.history.replaceState(null, "", url.toString());
    } catch {
      // Ignore URL update issues.
    }
  }

  function refreshStatus() {
    if (!state.connected) {
      statusEl.textContent = "Disconnected";
      return;
    }
    statusEl.textContent = `Connected - ${roomNameById(state.roomId)}`;
  }

  function displayName(playerLike) {
    if (playerLike && typeof playerLike.name === "string") {
      const clean = playerLike.name.trim();
      if (clean) {
        return clean;
      }
    }
    if (playerLike && typeof playerLike.id === "string" && playerLike.id) {
      return playerLike.id;
    }
    return "unknown";
  }

  function updateIdentityControls() {
    const connected = state.connected;
    nameInputEl.disabled = !connected;
    nameSaveEl.disabled = !connected;
  }

  function syncNameInputFromSelf() {
    if (!state.selfId) {
      return;
    }
    const self = state.players.get(state.selfId);
    if (!self || document.activeElement === nameInputEl) {
      return;
    }
    nameInputEl.value = displayName(self);
  }

  function updateRoster() {
    const players = Array.from(state.players.values());
    players.sort((a, b) => {
      const left = displayName(a).toLowerCase();
      const right = displayName(b).toLowerCase();
      if (left === right) {
        return a.id.localeCompare(b.id);
      }
      return left.localeCompare(right);
    });

    rosterEl.innerHTML = "";
    for (const player of players) {
      const li = document.createElement("li");
      const selfMark = player.id === state.selfId ? " (you)" : "";
      li.textContent = `${displayName(player)}${selfMark}`;
      li.style.borderColor = player.color || "#b8d7ea";
      rosterEl.appendChild(li);
    }
  }

  function updatePlayerCount() {
    const count = state.players.size;
    playerCountEl.textContent = `${count} player${count === 1 ? "" : "s"}`;
    updateRoster();
  }

  function updateRoomSelect() {
    const rooms = Array.isArray(state.rooms) && state.rooms.length > 0 ? state.rooms : DEFAULT_ROOMS;
    roomSelectEl.innerHTML = "";

    for (const room of rooms) {
      if (!room || typeof room.id !== "string") {
        continue;
      }
      const option = document.createElement("option");
      option.value = room.id;
      option.textContent = room.name || room.id;
      roomSelectEl.appendChild(option);
    }

    if (!rooms.some((room) => room.id === state.roomId) && rooms.length > 0) {
      state.roomId = rooms[0].id;
    }

    roomSelectEl.value = state.roomId;
    roomSelectEl.disabled = !state.connected || rooms.length === 0;
  }

  function appendChat(metaText, messageText) {
    const li = document.createElement("li");

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = metaText;

    const body = document.createElement("div");
    body.textContent = messageText;

    li.appendChild(meta);
    li.appendChild(body);
    chatLogEl.appendChild(li);
    chatLogEl.scrollTop = chatLogEl.scrollHeight;

    state.chatTail.push({ meta: metaText, text: messageText });
    if (state.chatTail.length > 8) {
      state.chatTail.shift();
    }
  }

  function sendEvent(type, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(JSON.stringify({ type, payload }));
  }

  function normalizePlayer(serverPlayer) {
    const prev = state.players.get(serverPlayer.id);
    const cleanName = typeof serverPlayer.name === "string" ? serverPlayer.name.trim() : "";
    const next = {
      id: serverPlayer.id,
      name: cleanName || serverPlayer.id || "unknown",
      x: Number(serverPlayer.x) || 0,
      y: Number(serverPlayer.y) || 0,
      targetX: Number(serverPlayer.targetX) || 0,
      targetY: Number(serverPlayer.targetY) || 0,
      speed: Number(serverPlayer.speed) || 220,
      color: serverPlayer.color || "#ffffff",
      renderX: prev ? prev.renderX : Number(serverPlayer.x) || 0,
      renderY: prev ? prev.renderY : Number(serverPlayer.y) || 0,
    };
    state.players.set(next.id, next);
  }

  function handleWorldInit(payload) {
    const previousRoom = state.roomId;

    state.selfId = payload.selfId || null;
    state.roomId = payload.roomId || state.roomId;
    state.pendingPortalRoomId = null;
    state.pendingPortalAt = 0;
    syncRoomQuery(state.roomId);
    state.world = payload.map || DEFAULT_WORLD;

    if (Array.isArray(payload.rooms) && payload.rooms.length > 0) {
      state.rooms = payload.rooms
        .filter((room) => room && typeof room.id === "string")
        .map((room) => ({ id: normalizeRoomId(room.id), name: room.name || room.id }));
    }

    if (!state.preferredRoomId || !state.rooms.some((room) => room.id === state.preferredRoomId)) {
      setPreferredRoom(state.roomId);
    }

    state.players.clear();
    const players = Array.isArray(payload.players) ? payload.players : [];
    players.forEach(normalizePlayer);
    updatePlayerCount();
    syncNameInputFromSelf();
    updateRoomSelect();
    refreshStatus();
    if (worldScene) {
      worldScene.rebuildWorld();
    }

    if (previousRoom && previousRoom !== state.roomId && state.connected) {
      appendChat("system", `Entered ${roomNameById(state.roomId)}.`);
    }
  }

  function handleSnapshot(payload) {
    if (payload.roomId && state.roomId && payload.roomId !== state.roomId) {
      return;
    }

    const incoming = Array.isArray(payload.players) ? payload.players : [];
    const seenIds = new Set();
    for (const player of incoming) {
      seenIds.add(player.id);
      normalizePlayer(player);
    }
    for (const id of state.players.keys()) {
      if (!seenIds.has(id)) {
        state.players.delete(id);
      }
    }
    updatePlayerCount();
    syncNameInputFromSelf();
    maybeTriggerPortalTransition();
  }

  function handlePlayerJoined(payload) {
    if (!payload || !payload.player) {
      return;
    }
    normalizePlayer(payload.player);
    updatePlayerCount();
    syncNameInputFromSelf();
  }

  function handlePlayerLeft(payload) {
    if (!payload || !payload.id) {
      return;
    }
    state.players.delete(payload.id);
    updatePlayerCount();
    syncNameInputFromSelf();
  }

  function handlePlayerRenamed(payload) {
    if (!payload || !payload.id) {
      return;
    }
    const existing = state.players.get(payload.id);
    if (!existing) {
      return;
    }
    if (typeof payload.name === "string" && payload.name.trim()) {
      existing.name = payload.name.trim();
      updatePlayerCount();
      syncNameInputFromSelf();
    }
  }

  function handleChatMessage(payload) {
    if (!payload) {
      return;
    }
    const userId = payload.id || "unknown";
    const senderName = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : userId;
    const text = payload.text || "";
    const stamp = Number(payload.ts) || Date.now();
    const time = new Date(stamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const identity = senderName === userId ? userId : `${senderName} (${userId})`;
    appendChat(`${identity} - ${time}`, text);
  }

  function handleSystemNotice(payload) {
    if (!payload || !payload.text) {
      return;
    }
    const level = typeof payload.level === "string" ? payload.level : "notice";
    appendChat(level, payload.text);
  }

  function handleMessage(data) {
    let envelope = null;
    try {
      envelope = JSON.parse(data);
    } catch {
      return;
    }
    if (!envelope || typeof envelope.type !== "string") {
      return;
    }

    switch (envelope.type) {
      case "world:init":
        handleWorldInit(envelope.payload || {});
        break;
      case "world:snapshot":
        handleSnapshot(envelope.payload || {});
        break;
      case "player:joined":
        handlePlayerJoined(envelope.payload || {});
        break;
      case "player:left":
        handlePlayerLeft(envelope.payload || {});
        break;
      case "player:renamed":
        handlePlayerRenamed(envelope.payload || {});
        break;
      case "chat:message":
        handleChatMessage(envelope.payload || {});
        break;
      case "system:notice":
        handleSystemNotice(envelope.payload || {});
        break;
      default:
        break;
    }
  }

  function connectSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    ws = new WebSocket(wsUrl());

    ws.addEventListener("open", () => {
      state.connected = true;
      refreshStatus();
      updateRoomSelect();
      updateIdentityControls();
      appendChat("system", "Connected to world server.");
    });

    ws.addEventListener("message", (event) => {
      handleMessage(event.data);
    });

    ws.addEventListener("close", () => {
      state.connected = false;
      refreshStatus();
      updateRoomSelect();
      updateIdentityControls();
      if (!reconnectTimer) {
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connectSocket();
        }, 1500);
      }
    });

    ws.addEventListener("error", () => {
      statusEl.textContent = "Connection error";
    });
  }

  class WorldScene extends Phaser.Scene {
    constructor() {
      super("WorldScene");
      this.worldGraphics = null;
      this.playerSprites = new Map();
      this.moveMarker = null;
      this.portalLabels = [];
    }

    create() {
      worldScene = this;
      this.worldGraphics = this.add.graphics();
      this.moveMarker = this.add.circle(0, 0, 6, 0xffffff, 0.9).setVisible(false);
      const canvas = this.game && this.game.canvas;
      if (canvas) {
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
      }
      this.rebuildWorld();

      this.input.on("pointerdown", (pointer) => {
        const coords = this.pointerToWorld(pointer);
        const x = coords.x;
        const y = coords.y;
        const portalByPointer = this.portalAtPointer(pointer);
        const portalByWorld = portalAt(x, y);
        const portal = portalByPointer || portalByWorld;
        if (portal && portal.toRoom) {
          const nextRoom = normalizeRoomId(portal.toRoom);
          if (nextRoom && nextRoom !== state.roomId) {
            // Clicking a portal only sets movement; actual room transfer is
            // triggered when authoritative position enters the portal zone.
            this.moveMarker.setPosition(x, y).setVisible(true);
            sendEvent("player:setTarget", { x, y });
            return;
          }
        }
        this.moveMarker.setPosition(x, y).setVisible(true);
        sendEvent("player:setTarget", { x, y });
      });
    }

    pointerClientPosition(pointer, rect) {
      const rawEvent = pointer.event || null;
      if (rawEvent && Number.isFinite(rawEvent.clientX) && Number.isFinite(rawEvent.clientY)) {
        return { x: rawEvent.clientX, y: rawEvent.clientY };
      }
      const px = Number(pointer.x || 0);
      const py = Number(pointer.y || 0);
      if (px >= rect.left - 1 && px <= rect.left + rect.width + 1 && py >= rect.top - 1 && py <= rect.top + rect.height + 1) {
        return { x: px, y: py };
      }
      return {
        x: rect.left + px,
        y: rect.top + py,
      };
    }

    portalAtPointer(pointer) {
      const world = state.world || DEFAULT_WORLD;
      const portals = Array.isArray(world.portals) ? world.portals : [];
      if (portals.length === 0) {
        return null;
      }
      const canvas = this.game && this.game.canvas;
      if (!canvas) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      const pos = this.pointerClientPosition(pointer, rect);
      for (const portal of portals) {
        const left = rect.left + (portal.x / world.width) * rect.width;
        const top = rect.top + (portal.y / world.height) * rect.height;
        const width = (portal.width / world.width) * rect.width;
        const height = (portal.height / world.height) * rect.height;
        if (pos.x >= left && pos.x <= left + width && pos.y >= top && pos.y <= top + height) {
          return portal;
        }
      }
      return null;
    }

    pointerToWorld(pointer) {
      const world = state.world || DEFAULT_WORLD;
      const canvas = this.game && this.game.canvas;
      if (!canvas) {
        return {
          x: Number(pointer.worldX ?? pointer.x ?? 0),
          y: Number(pointer.worldY ?? pointer.y ?? 0),
        };
      }

      const rect = canvas.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return {
          x: Number(pointer.worldX ?? pointer.x ?? 0),
          y: Number(pointer.worldY ?? pointer.y ?? 0),
        };
      }

      const pos = this.pointerClientPosition(pointer, rect);
      const clientX = pos.x;
      const clientY = pos.y;

      const normalizedX = (clientX - rect.left) / rect.width;
      const normalizedY = (clientY - rect.top) / rect.height;
      const x = Phaser.Math.Clamp(normalizedX * world.width, 0, world.width);
      const y = Phaser.Math.Clamp(normalizedY * world.height, 0, world.height);
      return { x, y };
    }

    rebuildWorld() {
      const world = state.world || DEFAULT_WORLD;
      this.scale.resize(world.width, world.height);
      this.cameras.main.setBounds(0, 0, world.width, world.height);
      this.drawWorld();
    }

    drawWorld() {
      const world = state.world || DEFAULT_WORLD;
      const theme = themeForRoom(state.roomId);
      this.worldGraphics.clear();
      for (const label of this.portalLabels) {
        label.destroy();
      }
      this.portalLabels = [];
      this.worldGraphics.fillStyle(theme.ground, 1);
      this.worldGraphics.fillRect(0, 0, world.width, world.height);
      this.worldGraphics.fillStyle(theme.sky, 1);
      this.worldGraphics.fillRect(0, 0, world.width, 120);
      this.worldGraphics.lineStyle(3, theme.border, 0.55);
      this.worldGraphics.strokeRect(2, 2, world.width - 4, world.height - 4);

      if (state.roomId === "plaza") {
        this.worldGraphics.lineStyle(1, theme.decorB, 0.35);
        for (let x = 0; x < world.width; x += 70) {
          this.worldGraphics.lineBetween(x, 120, x + 40, world.height);
        }
      } else if (state.roomId === "snow-forts") {
        this.worldGraphics.fillStyle(theme.decorA, 0.8);
        for (let i = 0; i < 26; i += 1) {
          const x = (i * 97) % world.width;
          const y = 130 + ((i * 61) % (world.height - 150));
          const r = 8 + (i % 4);
          this.worldGraphics.fillCircle(x, y, r);
        }
      } else {
        this.worldGraphics.fillStyle(theme.decorA, 0.45);
        for (let i = 0; i < 18; i += 1) {
          const x = 40 + (i * 63) % (world.width - 80);
          const y = 145 + (i * 47) % (world.height - 180);
          this.worldGraphics.fillCircle(x, y, 5 + (i % 3));
        }
      }

      for (const rect of world.blocked || []) {
        this.worldGraphics.fillStyle(theme.obstacleFill, 0.95);
        this.worldGraphics.fillRect(rect.x, rect.y, rect.width, rect.height);
        this.worldGraphics.lineStyle(2, theme.obstacleLine, 0.8);
        this.worldGraphics.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }

      for (const portal of world.portals || []) {
        this.worldGraphics.fillStyle(PORTAL_FILL, PORTAL_ALPHA);
        this.worldGraphics.fillRect(portal.x, portal.y, portal.width, portal.height);
        this.worldGraphics.lineStyle(2, PORTAL_OUTLINE, 0.95);
        this.worldGraphics.strokeRect(portal.x, portal.y, portal.width, portal.height);
        const label = portal.label || `To ${roomNameById(portal.toRoom || "")}`;
        const labelX = portal.x + portal.width / 2;
        const labelY = portal.y + portal.height / 2;
        const labelNode = this.add.text(labelX, labelY, label, {
          fontFamily: "monospace",
          fontSize: "13px",
          color: "#e6f8ff",
          backgroundColor: "rgba(8,35,52,0.55)",
          padding: { left: 4, right: 4, top: 2, bottom: 2 },
        }).setOrigin(0.5, 0.5);
        this.portalLabels.push(labelNode);
      }
    }

    ensureSprite(player) {
      const existing = this.playerSprites.get(player.id);
      if (existing) {
        return existing;
      }

      const colorInt = Phaser.Display.Color.HexStringToColor(player.color).color;
      const body = this.add.circle(0, 0, PLAYER_RADIUS, colorInt, 1);
      const borderColor = player.id === state.selfId ? 0xffffff : 0x0b2435;
      body.setStrokeStyle(2, borderColor, 1);

      const label = this.add.text(0, -PLAYER_RADIUS - 10, displayName(player), {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#0b2536",
        backgroundColor: "rgba(255,255,255,0.65)",
        padding: { left: 3, right: 3, top: 1, bottom: 1 },
      });
      label.setOrigin(0.5, 1);

      const container = this.add.container(player.renderX, player.renderY, [body, label]);
      const sprite = { container, body, label };
      this.playerSprites.set(player.id, sprite);
      return sprite;
    }

    syncSpritesFromState() {
      const liveIds = new Set(state.players.keys());
      for (const [id, sprite] of this.playerSprites.entries()) {
        if (!liveIds.has(id)) {
          sprite.container.destroy(true);
          this.playerSprites.delete(id);
        }
      }
      for (const player of state.players.values()) {
        this.ensureSprite(player);
      }
    }

    stepInterpolation(deltaMs) {
      const delta = Math.max(0, deltaMs || 16.7);
      const factorBase = Math.min(1, (delta / 1000) * 10);

      this.syncSpritesFromState();
      for (const player of state.players.values()) {
        const sprite = this.ensureSprite(player);
        const follow = player.id === state.selfId ? SELF_LERP : REMOTE_LERP;
        const alpha = Math.min(1, factorBase + follow);
        player.renderX += (player.x - player.renderX) * alpha;
        player.renderY += (player.y - player.renderY) * alpha;
        const labelText = displayName(player);
        if (sprite.label.text !== labelText) {
          sprite.label.setText(labelText);
        }
        sprite.container.setPosition(player.renderX, player.renderY);
      }
    }

    update(_time, delta) {
      this.stepInterpolation(delta);
    }
  }

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: "game-container",
    width: DEFAULT_WORLD.width,
    height: DEFAULT_WORLD.height,
    scene: [WorldScene],
    backgroundColor: "#5bbf80",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });

  roomSelectEl.addEventListener("change", () => {
    const nextRoom = normalizeRoomId(roomSelectEl.value);
    if (!nextRoom || nextRoom === state.roomId) {
      return;
    }
    setPreferredRoom(nextRoom);
    appendChat("system", `Switching to ${roomNameById(nextRoom)}...`);
    sendEvent("room:join", { roomId: nextRoom });
  });

  nameFormEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const normalized = nameInputEl.value.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return;
    }
    sendEvent("player:setName", { name: normalized });
  });

  chatFormEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = chatInputEl.value.trim();
    if (!text) {
      return;
    }
    sendEvent("chat:send", { text });
    chatInputEl.value = "";
    chatInputEl.focus();
  });

  window.render_game_to_text = function renderGameToText() {
    const players = Array.from(state.players.values()).map((player) => ({
      id: player.id,
      name: player.name,
      x: Number(player.x.toFixed(2)),
      y: Number(player.y.toFixed(2)),
      targetX: Number(player.targetX.toFixed(2)),
      targetY: Number(player.targetY.toFixed(2)),
      color: player.color,
      isSelf: player.id === state.selfId,
    }));

    return JSON.stringify({
      mode: state.connected ? "connected" : "connecting",
      coordinate_system: "origin: top-left, +x: right, +y: down, units: pixels",
      selfId: state.selfId,
      roomId: state.roomId,
      preferredRoomId: state.preferredRoomId,
      rooms: state.rooms,
      world: {
        width: state.world.width,
        height: state.world.height,
        blocked: state.world.blocked,
        portals: state.world.portals || [],
      },
      players,
      roster: Array.from(state.players.values()).map((player) => ({
        id: player.id,
        name: displayName(player),
      })),
      chat_tail: state.chatTail,
    });
  };

  window.advanceTime = function advanceTime(ms) {
    const total = Math.max(0, Number(ms) || 0);
    if (!worldScene || total === 0) {
      return;
    }
    const steps = Math.max(1, Math.round(total / (1000 / 60)));
    const dt = total / steps;
    for (let i = 0; i < steps; i += 1) {
      worldScene.stepInterpolation(dt);
    }
  };

  window.__club_penguin_world = {
    getSnapshot: () => JSON.parse(window.render_game_to_text()),
    sendEvent,
    game,
  };

  updateIdentityControls();
  connectSocket();
})();
