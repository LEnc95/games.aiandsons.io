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
    portals: [],
    npcs: [],
  };

  const DEFAULT_ROOMS = [{ id: "town", name: "Town" }];
  const ROOM_PREF_KEY = "clubpenguin-world-preferred-room";
  const WS_PREF_KEY = "clubpenguin-world-ws-endpoint";
  const MOTION_PREF_KEY = "clubpenguin-world-reduce-motion";
  const PLAYER_RADIUS = 14;
  const REMOTE_LERP = 0.18;
  const SELF_LERP = 0.26;
  const PORTAL_FILL = 0x0f3a54;
  const PORTAL_OUTLINE = 0xbde8ff;
  const PORTAL_ALPHA = 0.5;
  const NPC_BODY = 0xa8572f;
  const NPC_RING = 0xfff0db;
  const COLLECTIBLE_FILL = 0xfedb55;
  const COLLECTIBLE_RING = 0x8b6508;
  const EMOTE_DURATION_MS = 1800;
  const EMOTE_LABELS = {
    wave: "wave",
    dance: "dance",
    cheer: "cheer",
    laugh: "laugh",
    snowball: "snowball",
  };
  const NAMEPLATE_BASE_Y = -PLAYER_RADIUS - 10;
  const NAMEPLATE_STACK_STEP = 14;
  const NAMEPLATE_CLUSTER_X = 86;
  const NAMEPLATE_CLUSTER_Y = 54;
  const MOVE_MARKER_HIDE_DISTANCE = 18;
  const ROOM_TRANSITION_MS = 560;
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
  const serverFormEl = document.getElementById("server-form");
  const serverInputEl = document.getElementById("server-input");
  const serverSaveEl = document.getElementById("server-save");
  const serverResetEl = document.getElementById("server-reset");
  const serverCopyEl = document.getElementById("server-copy");
  const backendStatusEl = document.getElementById("backend-status");
  const reduceMotionToggleEl = document.getElementById("reduce-motion-toggle");
  const rosterEl = document.getElementById("player-roster");
  const coinCountEl = document.getElementById("coin-count");
  const questListEl = document.getElementById("quest-list");
  const qaResetEl = document.getElementById("qa-reset-progress");
  const emoteButtons = Array.from(document.querySelectorAll(".emote-btn[data-emote]"));
  const toastStackEl = document.getElementById("toast-stack");
  const chatLogEl = document.getElementById("chat-log");
  const chatFormEl = document.getElementById("chat-form");
  const chatInputEl = document.getElementById("chat-input");
  const chatSubmitEl = document.getElementById("chat-submit");
  const chatSuggestionsEl = document.getElementById("chat-suggestions");
  const roomTransitionEl = document.getElementById("room-transition");

  const state = {
    connected: false,
    selfId: null,
    roomId: "town",
    preferredRoomId: "town",
    pendingPortalRoomId: null,
    pendingPortalAt: 0,
    wsEndpoint: "",
    activeWsUrl: "",
    awaitingManualEndpoint: false,
    backendHintShown: false,
    backendHealth: {
      state: "checking",
      text: "Backend: checking...",
    },
    reduceMotion: false,
    rooms: DEFAULT_ROOMS.slice(),
    world: DEFAULT_WORLD,
    collectibles: [],
    players: new Map(),
    progress: {
      coins: 0,
      objectives: [],
      completedCount: 0,
      totalCount: 0,
    },
    progressLoaded: false,
    chatOptions: [],
    chatCatalogLoaded: false,
    chatSuggestions: [],
    selectedChatOptionId: "",
    chatTail: [],
  };

  let ws = null;
  let reconnectTimer = null;
  let suppressNextCloseReconnect = false;
  let backendHealthTimer = null;
  let backendHealthSeq = 0;
  let worldScene = null;
  let audioCtx = null;
  let roomTransitionTimer = null;

  function seededPhaseFromString(value) {
    const text = String(value || "");
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return ((hash % 360) * Math.PI) / 180;
  }

  function normalizeRoomId(raw) {
    if (typeof raw !== "string") {
      return "";
    }
    return raw.trim().toLowerCase().replace(/\s+/g, "-");
  }

  function normalizeWsEndpoint(raw) {
    if (typeof raw !== "string") {
      return "";
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return "";
    }

    let candidate = trimmed;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
      const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
      candidate = `${protocol}${candidate}`;
    }

    let parsed = null;
    try {
      parsed = new URL(candidate);
    } catch {
      return "";
    }

    if (parsed.protocol === "http:") {
      parsed.protocol = "ws:";
    } else if (parsed.protocol === "https:") {
      parsed.protocol = "wss:";
    }
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
      return "";
    }
    if (!parsed.host) {
      return "";
    }
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/ws";
    }
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }
    parsed.hash = "";
    return parsed.toString();
  }

  function defaultWsUrl() {
    const host = window.location.hostname;
    if (host.includes("vercel.app") || host.includes("aiandsons.io")) {
      return "wss://clubpenguin-world-6owms56gxq-uc.a.run.app/ws";
    }
    return "ws://127.0.0.1:8081/ws";
  }

  function currentWsUrl() {
    return state.wsEndpoint || defaultWsUrl();
  }

  function wsLabel(url) {
    if (typeof url !== "string" || !url.trim()) {
      return "default /ws";
    }
    try {
      const parsed = new URL(url);
      return `${parsed.host}${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  function readStoredReducedMotion(rawValue) {
    const value = String(rawValue || "").trim().toLowerCase();
    if (value === "1" || value === "true" || value === "yes" || value === "on") {
      return true;
    }
    if (value === "0" || value === "false" || value === "no" || value === "off") {
      return false;
    }
    return null;
  }

  function applyReducedMotion(enabled, persist) {
    state.reduceMotion = Boolean(enabled);
    document.body.dataset.reducedMotion = state.reduceMotion ? "true" : "false";
    if (reduceMotionToggleEl) {
      reduceMotionToggleEl.checked = state.reduceMotion;
    }
    if (!persist) {
      return;
    }
    try {
      window.localStorage.setItem(MOTION_PREF_KEY, state.reduceMotion ? "1" : "0");
    } catch {
      // Ignore storage availability issues.
    }
  }

  const systemPrefersReducedMotion = Boolean(
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  applyReducedMotion(systemPrefersReducedMotion, false);

  try {
    const preferred = normalizeRoomId(window.localStorage.getItem(ROOM_PREF_KEY) || "");
    if (preferred) {
      state.preferredRoomId = preferred;
      state.roomId = preferred;
    }
  } catch {
    // Ignore storage availability issues.
  }
  try {
    const storedMotion = readStoredReducedMotion(window.localStorage.getItem(MOTION_PREF_KEY));
    if (storedMotion !== null) {
      applyReducedMotion(storedMotion, false);
    }
  } catch {
    // Ignore storage availability issues.
  }
  try {
    const preferredWs = normalizeWsEndpoint(window.localStorage.getItem(WS_PREF_KEY) || "");
    if (preferredWs) {
      state.wsEndpoint = preferredWs;
    }
  } catch {
    // Ignore storage availability issues.
  }

  const searchParams = new URLSearchParams(window.location.search);
  const roomFromUrl = normalizeRoomId(searchParams.get("room") || "");
  if (roomFromUrl) {
    state.preferredRoomId = roomFromUrl;
    state.roomId = roomFromUrl;
  }
  const wsFromUrl = normalizeWsEndpoint(searchParams.get("ws") || "");
  if (wsFromUrl) {
    state.wsEndpoint = wsFromUrl;
  }

  function roomNameById(roomId) {
    const match = state.rooms.find((room) => room.id === roomId);
    return match ? match.name : roomId;
  }

  function normalizeChatQuery(raw) {
    if (typeof raw !== "string") {
      return "";
    }
    return raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function normalizeChatOption(option) {
    if (!option || typeof option !== "object") {
      return null;
    }
    const id = normalizeRoomId(option.id || "");
    const text = typeof option.text === "string" ? option.text.trim() : "";
    if (!id || !text) {
      return null;
    }
    const tags = Array.isArray(option.tags)
      ? option.tags.map((tag) => normalizeChatQuery(String(tag || ""))).filter(Boolean)
      : [];
    return { id, text, tags };
  }

  function scoreQuickChatOption(option, query) {
    if (!option || !query) {
      return 0;
    }
    const normalizedText = normalizeChatQuery(option.text);
    if (!normalizedText) {
      return 0;
    }
    if (query === normalizedText || query === option.id) {
      return 1200;
    }
    if (normalizedText.includes(query)) {
      return 900 - (normalizedText.length - query.length);
    }
    const tokens = query.split(" ").filter(Boolean);
    if (tokens.length === 0) {
      return 0;
    }
    const haystack = `${normalizedText} ${option.tags.join(" ")}`;
    let matched = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) {
        matched += 1;
      }
    }
    if (matched === 0) {
      return 0;
    }
    return matched * 120 - (tokens.length - matched) * 45;
  }

  function findQuickChatMatches(query, limit = 6) {
    const normalizedQuery = normalizeChatQuery(query);
    const options = state.chatOptions || [];
    if (!normalizedQuery) {
      return options.slice(0, limit);
    }
    const scored = [];
    for (const option of options) {
      const score = scoreQuickChatOption(option, normalizedQuery);
      if (score <= 0) {
        continue;
      }
      scored.push({ option, score });
    }
    scored.sort((a, b) => {
      if (a.score === b.score) {
        return a.option.text.length - b.option.text.length;
      }
      return b.score - a.score;
    });
    return scored.slice(0, limit).map((entry) => entry.option);
  }

  function chooseQuickChatOption(option, focusInput) {
    if (!option) {
      return;
    }
    state.selectedChatOptionId = option.id;
    chatInputEl.value = option.text;
    state.chatSuggestions = findQuickChatMatches(option.text, 6);
    renderQuickChatSuggestions();
    if (focusInput) {
      chatInputEl.focus();
    }
  }

  function setStatus(text, statusState) {
    statusEl.textContent = text;
    statusEl.dataset.state = statusState;
  }

  function setBackendStatus(text, statusState) {
    state.backendHealth = {
      state: statusState,
      text,
    };
    if (!backendStatusEl) {
      return;
    }
    backendStatusEl.textContent = text;
    backendStatusEl.dataset.state = statusState;
  }

  function healthUrlForEndpoint(endpoint) {
    if (!endpoint) {
      return `${window.location.origin}/healthz`;
    }
    let parsed = null;
    try {
      parsed = new URL(endpoint);
    } catch {
      return "";
    }
    if (parsed.protocol === "ws:") {
      parsed.protocol = "http:";
    } else if (parsed.protocol === "wss:") {
      parsed.protocol = "https:";
    }
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/healthz";
    } else if (/\/ws$/i.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\/ws$/i, "/healthz");
    } else if (!/\/healthz$/i.test(parsed.pathname)) {
      parsed.pathname = "/healthz";
    }
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  }

  function stopBackendHealthMonitor() {
    if (backendHealthTimer) {
      window.clearInterval(backendHealthTimer);
      backendHealthTimer = null;
    }
  }

  async function checkBackendHealth() {
    const seq = ++backendHealthSeq;
    const target = healthUrlForEndpoint(state.activeWsUrl || currentWsUrl());
    if (!target) {
      setBackendStatus("Backend: unknown endpoint", "warn");
      return;
    }
    setBackendStatus("Backend: checking...", "checking");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3800);
    try {
      const response = await fetch(target, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (seq !== backendHealthSeq) {
        return;
      }
      if (!response.ok) {
        setBackendStatus(`Backend: HTTP ${response.status}`, "warn");
        return;
      }
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      const players = payload && Number.isFinite(payload.totalPlayers) ? payload.totalPlayers : null;
      const suffix = players === null ? "" : ` (${players} online)`;
      setBackendStatus(`Backend: healthy${suffix}`, "ok");
    } catch {
      if (seq !== backendHealthSeq) {
        return;
      }
      setBackendStatus("Backend: unreachable", "error");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function startBackendHealthMonitor() {
    stopBackendHealthMonitor();
    void checkBackendHealth();
    backendHealthTimer = window.setInterval(() => {
      void checkBackendHealth();
    }, 30000);
  }

  function renderQuickChatSuggestions() {
    if (!chatSuggestionsEl) {
      return;
    }
    chatSuggestionsEl.textContent = "";

    if (!state.chatCatalogLoaded) {
      chatSuggestionsEl.appendChild(createEmptyListItem("Loading quick chat phrases..."));
      return;
    }

    if (!Array.isArray(state.chatOptions) || state.chatOptions.length === 0) {
      chatSuggestionsEl.appendChild(createEmptyListItem("Quick chat is temporarily unavailable."));
      return;
    }

    if (!Array.isArray(state.chatSuggestions) || state.chatSuggestions.length === 0) {
      chatSuggestionsEl.appendChild(createEmptyListItem("No quick chat matches. Try another keyword."));
      return;
    }
    for (const option of state.chatSuggestions) {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option.text;
      button.dataset.optionId = option.id;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", () => {
        chooseQuickChatOption(option, true);
      });
      li.appendChild(button);
      chatSuggestionsEl.appendChild(li);
    }
  }

  function refreshQuickChatSuggestions() {
    if (!state.chatCatalogLoaded) {
      renderQuickChatSuggestions();
      return;
    }
    const query = chatInputEl.value || "";
    state.selectedChatOptionId = "";
    state.chatSuggestions = findQuickChatMatches(query, 6);
    renderQuickChatSuggestions();
  }

  function resolveOutgoingQuickChat() {
    if (!Array.isArray(state.chatOptions) || state.chatOptions.length === 0) {
      return null;
    }
    const selectedID = normalizeRoomId(state.selectedChatOptionId || "");
    if (selectedID) {
      const selected = state.chatOptions.find((option) => option.id === selectedID);
      if (selected) {
        return selected;
      }
    }

    const query = chatInputEl.value || "";
    const matches = findQuickChatMatches(query, 1);
    if (matches.length === 0) {
      return null;
    }
    return matches[0];
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

  function setPreferredWsEndpoint(endpoint) {
    const normalized = normalizeWsEndpoint(endpoint);
    state.wsEndpoint = normalized;
    try {
      if (normalized) {
        window.localStorage.setItem(WS_PREF_KEY, normalized);
      } else {
        window.localStorage.removeItem(WS_PREF_KEY);
      }
    } catch {
      // Ignore storage availability issues.
    }
    syncWsQuery(normalized);
    if (serverInputEl && document.activeElement !== serverInputEl) {
      serverInputEl.value = normalized;
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

  function syncWsQuery(endpoint) {
    try {
      const url = new URL(window.location.href);
      if (endpoint) {
        url.searchParams.set("ws", endpoint);
      } else {
        url.searchParams.delete("ws");
      }
      window.history.replaceState(null, "", url.toString());
    } catch {
      // Ignore URL update issues.
    }
  }

  function buildInviteUrl() {
    try {
      const url = new URL(window.location.href);
      if (state.roomId) {
        url.searchParams.set("room", state.roomId);
      } else {
        url.searchParams.delete("room");
      }
      const endpoint = state.wsEndpoint || "";
      if (endpoint) {
        url.searchParams.set("ws", endpoint);
      } else {
        url.searchParams.delete("ws");
      }
      url.hash = "";
      return url.toString();
    } catch {
      return window.location.href;
    }
  }

  async function writeTextToClipboard(text) {
    if (!text) {
      return false;
    }
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fallback below.
      }
    }
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(el);
      return Boolean(copied);
    } catch {
      return false;
    }
  }

  async function copyInviteLink() {
    const inviteUrl = buildInviteUrl();
    const copied = await writeTextToClipboard(inviteUrl);
    if (copied) {
      pushToast("Invite link copied.");
      appendChat("system", "Invite link copied to clipboard.");
      return;
    }
    appendChat("system", `Invite link: ${inviteUrl}`);
    pushToast("Clipboard blocked. Link was added to chat.");
  }

  function createEmptyListItem(text) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = text;
    return li;
  }

  function flashRoomTransition(label) {
    if (!roomTransitionEl || !label) {
      return;
    }
    roomTransitionEl.textContent = label;
    roomTransitionEl.classList.remove("active");
    // Restart animation for repeated room changes.
    void roomTransitionEl.offsetWidth;
    roomTransitionEl.classList.add("active");
    if (roomTransitionTimer) {
      window.clearTimeout(roomTransitionTimer);
      roomTransitionTimer = null;
    }
    roomTransitionTimer = window.setTimeout(() => {
      roomTransitionEl.classList.remove("active");
      roomTransitionTimer = null;
    }, state.reduceMotion ? 380 : ROOM_TRANSITION_MS);
  }

  function refreshStatus() {
    if (!state.connected) {
      setStatus("Disconnected", "disconnected");
      return;
    }
    setStatus(`Connected - ${roomNameById(state.roomId)}`, "connected");
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
    if (qaResetEl) {
      qaResetEl.disabled = !connected;
    }
    for (const button of emoteButtons) {
      button.disabled = !connected;
    }

    const chatCatalogReady = state.chatCatalogLoaded;
    const chatHasOptions = Array.isArray(state.chatOptions) && state.chatOptions.length > 0;
    const canTypeChat = connected && chatCatalogReady;
    const canSendChat = canTypeChat && chatHasOptions;

    chatInputEl.disabled = !canTypeChat;
    if (chatSubmitEl) {
      chatSubmitEl.disabled = !canSendChat;
    }

    if (!connected) {
      chatInputEl.placeholder = "Connect to search quick chat...";
    } else if (!chatCatalogReady) {
      chatInputEl.placeholder = "Loading quick chat...";
    } else if (!chatHasOptions) {
      chatInputEl.placeholder = "Quick chat unavailable";
    } else {
      chatInputEl.placeholder = "Type to search quick chat...";
    }
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

    rosterEl.textContent = "";
    if (players.length === 0) {
      rosterEl.appendChild(
        createEmptyListItem(state.connected ? "No penguins in this room yet." : "Connect to see room roster.")
      );
      return;
    }

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

  function playRewardChime() {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) {
          return;
        }
        audioCtx = new Ctx();
      }
      const now = audioCtx.currentTime;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

      const osc = audioCtx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(622.25, now);
      osc.frequency.exponentialRampToValueAtTime(830.61, now + 0.18);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    } catch {
      // Audio is optional.
    }
  }

  function pushToast(message) {
    if (!toastStackEl || !message) {
      return;
    }
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastStackEl.appendChild(toast);
    window.setTimeout(() => {
      toast.remove();
    }, 2600);
  }

  function renderQuestPanel() {
    const progress = state.progress || { coins: 0, objectives: [] };
    const coins = Number(progress.coins) || 0;
    coinCountEl.textContent = `${coins} coin${coins === 1 ? "" : "s"}`;

    questListEl.textContent = "";
    if (!state.progressLoaded) {
      questListEl.appendChild(createEmptyListItem("Loading starter tasks..."));
      return;
    }

    const objectives = Array.isArray(progress.objectives) ? progress.objectives : [];
    if (objectives.length === 0) {
      questListEl.appendChild(createEmptyListItem("No starter tasks available."));
      return;
    }

    for (const objective of objectives) {
      const li = document.createElement("li");
      if (objective.completed) {
        li.classList.add("completed");
      }
      const label = document.createElement("span");
      label.textContent = objective.label || objective.id || "Task";
      const reward = document.createElement("span");
      reward.textContent = `+${Number(objective.reward) || 0}`;
      li.appendChild(label);
      li.appendChild(reward);
      questListEl.appendChild(li);
    }
  }

  function handleProgress(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const previousObjectives = new Map(
      (state.progress.objectives || []).map((objective) => [objective.id, Boolean(objective.completed)])
    );
    const previousCoins = Number(state.progress.coins) || 0;

    state.progress = {
      coins: Number(payload.coins) || 0,
      objectives: Array.isArray(payload.objectives) ? payload.objectives : [],
      completedCount: Number(payload.completedCount) || 0,
      totalCount: Number(payload.totalCount) || 0,
    };
    state.progressLoaded = true;
    renderQuestPanel();

    const completedNow = [];
    for (const objective of state.progress.objectives) {
      const wasDone = previousObjectives.get(objective.id) || false;
      if (!wasDone && objective.completed) {
        completedNow.push(objective);
      }
    }
    if (completedNow.length > 0) {
      for (const objective of completedNow) {
        pushToast(`Task Complete: ${objective.label} (+${objective.reward})`);
      }
      playRewardChime();
    } else if ((Number(state.progress.coins) || 0) > previousCoins) {
      pushToast(`Coins increased to ${state.progress.coins}.`);
    }
  }

  function updateRoomSelect() {
    const rooms = Array.isArray(state.rooms) && state.rooms.length > 0 ? state.rooms : DEFAULT_ROOMS;
    roomSelectEl.textContent = "";

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

  function renderChatEmptyState(text) {
    chatLogEl.textContent = "";
    chatLogEl.appendChild(createEmptyListItem(text));
  }

  function appendChat(metaText, messageText) {
    if (chatLogEl.children.length === 1) {
      const onlyChild = chatLogEl.children[0];
      if (onlyChild && onlyChild.classList.contains("empty")) {
        chatLogEl.textContent = "";
      }
    }

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
      emote: prev ? prev.emote : "",
      emoteUntil: prev ? prev.emoteUntil : 0,
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
    state.collectibles = Array.isArray(payload.collectibles) ? payload.collectibles : [];

    if (Array.isArray(payload.rooms) && payload.rooms.length > 0) {
      state.rooms = payload.rooms
        .filter((room) => room && typeof room.id === "string")
        .map((room) => ({ id: normalizeRoomId(room.id), name: room.name || room.id }));
    }
    if (Array.isArray(payload.chatOptions) && payload.chatOptions.length > 0) {
      state.chatOptions = payload.chatOptions
        .map(normalizeChatOption)
        .filter(Boolean);
    }
    if (!Array.isArray(state.chatOptions) || state.chatOptions.length === 0) {
      state.chatOptions = [];
    }
    state.chatCatalogLoaded = true;
    state.chatSuggestions = findQuickChatMatches(chatInputEl.value || "", 6);
    renderQuickChatSuggestions();
    updateIdentityControls();

    if (!state.preferredRoomId || !state.rooms.some((room) => room.id === state.preferredRoomId)) {
      setPreferredRoom(state.roomId);
    }

    state.players.clear();
    const players = Array.isArray(payload.players) ? payload.players : [];
    players.forEach(normalizePlayer);
    handleProgress(payload.progress || {});
    updatePlayerCount();
    syncNameInputFromSelf();
    updateRoomSelect();
    refreshStatus();
    if (worldScene) {
      worldScene.rebuildWorld();
    }

    if (previousRoom && previousRoom !== state.roomId && state.connected) {
      appendChat("system", `Entered ${roomNameById(state.roomId)}.`);
      flashRoomTransition(`Now entering ${roomNameById(state.roomId)}`);
    }
  }

  function handleSnapshot(payload) {
    if (payload.roomId && state.roomId && payload.roomId !== state.roomId) {
      return;
    }

    const incoming = Array.isArray(payload.players) ? payload.players : [];
    state.collectibles = Array.isArray(payload.collectibles) ? payload.collectibles : [];
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

  function handlePlayerEmote(payload) {
    if (!payload || !payload.id || typeof payload.emote !== "string") {
      return;
    }
    const player = state.players.get(payload.id);
    if (!player) {
      return;
    }
    const emote = normalizeRoomId(payload.emote);
    if (!emote) {
      return;
    }
    player.emote = emote;
    player.emoteUntil = Date.now() + EMOTE_DURATION_MS;
    const who = payload.name && payload.name !== payload.id ? `${payload.name}` : payload.id;
    appendChat("emote", `${who} used ${EMOTE_LABELS[emote] || emote}`);
  }

  function handleNPCHint(payload) {
    if (!payload || typeof payload.text !== "string" || !payload.text.trim()) {
      return;
    }
    const who = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "Guide";
    appendChat(`${who} (guide)`, payload.text.trim());
    pushToast(payload.text.trim());
  }

  function handleCollectibleCollected(payload) {
    if (!payload || !payload.id) {
      return;
    }
    const value = Number(payload.value) || 0;
    const byId = payload.byId || "unknown";
    const byName = typeof payload.byName === "string" && payload.byName.trim() ? payload.byName.trim() : byId;
    appendChat("event", `${byName} collected a coin puff (+${value}).`);
    if (byId === state.selfId) {
      pushToast(`Collected coin puff (+${value})`);
      playRewardChime();
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
      case "player:emote":
        handlePlayerEmote(envelope.payload || {});
        break;
      case "player:progress":
        handleProgress(envelope.payload || {});
        break;
      case "npc:hint":
        handleNPCHint(envelope.payload || {});
        break;
      case "collectible:collected":
        handleCollectibleCollected(envelope.payload || {});
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

    const endpoint = currentWsUrl();
    state.activeWsUrl = endpoint;
    state.progressLoaded = false;
    state.chatCatalogLoaded = false;
    state.chatOptions = [];
    state.chatSuggestions = [];
    setStatus("Connecting...", "disconnected");
    setBackendStatus("Backend: checking socket...", "checking");
    renderQuestPanel();
    renderQuickChatSuggestions();
    updateIdentityControls();
    if (chatLogEl.children.length === 0) {
      renderChatEmptyState("Connecting to world server...");
    }

    const connectTimeout = window.setTimeout(() => {
      if (!state.connected && ws && ws.readyState !== WebSocket.OPEN) {
        setStatus("stuck on Connecting...", "error");
        setBackendStatus("Backend: connection taking too long", "error");
        pushToast("Ensure backend is reachable.");
      }
    }, 5000);

    const socket = new WebSocket(endpoint);
    let opened = false;
    ws = socket;

    socket.addEventListener("open", () => {
      window.clearTimeout(connectTimeout);
      if (socket !== ws) {
        return;
      }
      opened = true;
      state.connected = true;
      state.awaitingManualEndpoint = false;
      refreshStatus();
      updateRoomSelect();
      updateIdentityControls();
      appendChat("system", `Connected to world server (${wsLabel(endpoint)}).`);
      startBackendHealthMonitor();
    });

    socket.addEventListener("message", (event) => {
      if (socket !== ws) {
        return;
      }
      handleMessage(event.data);
    });

    socket.addEventListener("close", () => {
      if (socket !== ws) {
        return;
      }
      stopBackendHealthMonitor();
      state.connected = false;
      refreshStatus();
      updateRoomSelect();
      updateIdentityControls();
      ws = null;
      if (suppressNextCloseReconnect) {
        suppressNextCloseReconnect = false;
        setBackendStatus("Backend: switching connection...", "checking");
        return;
      }

      if (!opened && !state.wsEndpoint) {
        const urlToTry = currentWsUrl();
        // If we are using the local fallback and it fails immediately, give up and prompt the user.
        // But if it's the production/preview URL, keep retrying because Cloud Run may be cold starting.
        if (urlToTry.includes("127.0.0.1") || urlToTry.includes("localhost")) {
          state.awaitingManualEndpoint = true;
          setStatus("Backend endpoint required", "error");
          setBackendStatus("Backend: no WebSocket server at same origin /ws", "error");
          updateIdentityControls();
          if (!state.backendHintShown) {
            state.backendHintShown = true;
            appendChat(
              "system",
              "No multiplayer backend was found at this site. Set a server URL (wss://.../ws) in Multiplayer Server, then click Connect."
            );
            pushToast("Set backend URL in Multiplayer Server.");
          }
          return;
        }
      }

      setBackendStatus("Backend: socket disconnected", "warn");
      if (chatLogEl.children.length === 0) {
        renderChatEmptyState("Connection lost. Reconnecting...");
      }
      if (!reconnectTimer) {
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connectSocket();
        }, 1500);
      }
    });

    socket.addEventListener("error", () => {
      window.clearTimeout(connectTimeout);
      if (socket !== ws) {
        return;
      }
      setStatus("Connection error", "error");
      setBackendStatus("Backend: socket error", "error");
    });
  }

  function forceReconnectSocket() {
    stopBackendHealthMonitor();
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      suppressNextCloseReconnect = true;
      try {
        ws.close(1000, "reconnect");
      } catch {
        // Ignore close failures.
      }
      ws = null;
    }
    state.connected = false;
    state.awaitingManualEndpoint = false;
    state.progressLoaded = false;
    state.chatCatalogLoaded = false;
    state.chatOptions = [];
    state.chatSuggestions = [];
    refreshStatus();
    updateRoomSelect();
    renderQuestPanel();
    renderQuickChatSuggestions();
    updateIdentityControls();
    setBackendStatus("Backend: reconnecting...", "checking");
    connectSocket();
  }

  function switchServerEndpoint(rawInput) {
    const trimmed = typeof rawInput === "string" ? rawInput.trim() : "";
    if (!trimmed) {
      setPreferredWsEndpoint("");
      appendChat("system", "Switched to default same-origin world server (/ws).");
      setBackendStatus("Backend: switching...", "checking");
      forceReconnectSocket();
      return true;
    }
    const normalized = normalizeWsEndpoint(trimmed);
    if (!normalized) {
      appendChat("system", "Invalid server endpoint. Use ws:// or wss:// URL.");
      pushToast("Invalid server endpoint.");
      return false;
    }
    setPreferredWsEndpoint(normalized);
    appendChat("system", `Switching server to ${wsLabel(normalized)}...`);
    setBackendStatus("Backend: switching...", "checking");
    forceReconnectSocket();
    return true;
  }

  class WorldScene extends Phaser.Scene {
    constructor() {
      super("WorldScene");
      this.worldGraphics = null;
      this.interactionGraphics = null;
      this.playerSprites = new Map();
      this.collectibleSprites = new Map();
      this.moveMarker = null;
      this.portalLabels = [];
    }

    create() {
      worldScene = this;
      this.worldGraphics = this.add.graphics();
      this.interactionGraphics = this.add.graphics();
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
      this.interactionGraphics.clear();
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

      for (const npc of world.npcs || []) {
        const x = Number(npc.x) || 0;
        const y = Number(npc.y) || 0;
        const radius = Math.max(18, Number(npc.radius) || 26);
        this.worldGraphics.fillStyle(NPC_BODY, 1);
        this.worldGraphics.fillCircle(x, y, 16);
        this.worldGraphics.lineStyle(3, NPC_RING, 0.92);
        this.worldGraphics.strokeCircle(x, y, radius);
        const label = this.add.text(x, y - radius - 6, npc.name || "Guide", {
          fontFamily: "\"Sora\", \"Trebuchet MS\", sans-serif",
          fontSize: "12px",
          color: "#fff7e8",
          backgroundColor: "rgba(72,35,16,0.72)",
          padding: { left: 5, right: 5, top: 2, bottom: 2 },
        }).setOrigin(0.5, 1);
        label.setStroke("#2f1407", 2);
        this.portalLabels.push(label);
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
          fontFamily: "\"Sora\", \"Trebuchet MS\", sans-serif",
          fontSize: "12px",
          color: "#e9faff",
          backgroundColor: "rgba(8,35,52,0.62)",
          padding: { left: 5, right: 5, top: 2, bottom: 2 },
        }).setOrigin(0.5, 0.5);
        labelNode.setStroke("#052032", 2);
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
      const isSelf = player.id === state.selfId;
      const borderColor = isSelf ? 0xf8fbff : 0x0b2435;
      body.setStrokeStyle(isSelf ? 3 : 2, borderColor, 1);

      const label = this.add.text(0, NAMEPLATE_BASE_Y, displayName(player), {
        fontFamily: "\"Sora\", \"Trebuchet MS\", sans-serif",
        fontSize: isSelf ? "12px" : "11px",
        color: isSelf ? "#fffae4" : "#f2fbff",
        backgroundColor: isSelf ? "rgba(8,41,67,0.84)" : "rgba(16,55,79,0.75)",
        padding: { left: 5, right: 5, top: 2, bottom: 2 },
      });
      label.setOrigin(0.5, 1);
      label.setStroke("#0b2435", 2);
      label.setShadow(0, 1, "rgba(0,0,0,0.34)", 2, true, true);

      const emote = this.add.text(0, NAMEPLATE_BASE_Y - 18, "", {
        fontFamily: "\"Sora\", \"Trebuchet MS\", sans-serif",
        fontSize: "11px",
        color: "#fef9c3",
        backgroundColor: "rgba(13,37,54,0.72)",
        padding: { left: 4, right: 4, top: 1, bottom: 1 },
      });
      emote.setOrigin(0.5, 1);
      emote.setStroke("#05131d", 2);

      const container = this.add.container(player.renderX, player.renderY, [body, emote, label]);
      const sprite = { container, body, label, emote };
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

    resolveNameplateOverlaps() {
      const entries = [];
      for (const player of state.players.values()) {
        const sprite = this.playerSprites.get(player.id);
        if (!sprite) {
          continue;
        }
        entries.push({
          id: player.id,
          x: sprite.container.x,
          y: sprite.container.y,
          sprite,
        });
      }

      entries.sort((a, b) => {
        if (a.y === b.y) {
          if (a.x === b.x) {
            return a.id.localeCompare(b.id);
          }
          return a.x - b.x;
        }
        return a.y - b.y;
      });

      const occupied = [];
      for (const entry of entries) {
        let lane = 0;
        while (
          occupied.some(
            (other) =>
              other.lane === lane &&
              Math.abs(other.x - entry.x) < NAMEPLATE_CLUSTER_X &&
              Math.abs(other.y - entry.y) < NAMEPLATE_CLUSTER_Y
          )
        ) {
          lane += 1;
        }
        occupied.push({ x: entry.x, y: entry.y, lane });
        const labelY = NAMEPLATE_BASE_Y - lane * NAMEPLATE_STACK_STEP;
        entry.sprite.label.y = labelY;
        entry.sprite.emote.y = labelY - 18;
      }
    }

    syncCollectiblesFromState() {
      const liveCollectibles = Array.isArray(state.collectibles) ? state.collectibles : [];
      const liveIds = new Set(liveCollectibles.map((collectible) => collectible.id));

      for (const [id, sprite] of this.collectibleSprites.entries()) {
        if (!liveIds.has(id)) {
          sprite.container.destroy(true);
          this.collectibleSprites.delete(id);
        }
      }

      for (const collectible of liveCollectibles) {
        if (!collectible || !collectible.id) {
          continue;
        }
        const x = Number(collectible.x) || 0;
        const y = Number(collectible.y) || 0;
        const radius = Math.max(6, Number(collectible.radius) || 10);
        const label = collectible.label || "Coin Puff";

        let sprite = this.collectibleSprites.get(collectible.id);
        if (!sprite) {
          const halo = this.add.circle(0, 0, radius + 7, COLLECTIBLE_FILL, 0.24);
          halo.setStrokeStyle(2, COLLECTIBLE_RING, 0.58);
          const body = this.add.circle(0, 0, radius, COLLECTIBLE_FILL, 0.98);
          body.setStrokeStyle(2, COLLECTIBLE_RING, 1);
          const text = this.add.text(0, -radius - 8, label, {
            fontFamily: "\"Sora\", \"Trebuchet MS\", sans-serif",
            fontSize: "11px",
            color: "#473108",
            backgroundColor: "rgba(255,244,200,0.85)",
            padding: { left: 3, right: 3, top: 1, bottom: 1 },
          }).setOrigin(0.5, 1);
          text.setStroke("#2f2102", 2);
          const container = this.add.container(x, y, [halo, body, text]);
          sprite = {
            container,
            halo,
            body,
            text,
            baseX: x,
            baseY: y,
            radius,
            phase: seededPhaseFromString(collectible.id),
          };
          this.collectibleSprites.set(collectible.id, sprite);
        } else {
          sprite.baseX = x;
          sprite.baseY = y;
          sprite.radius = radius;
          sprite.body.setRadius(radius);
          sprite.text.setText(label);
        }
        if (!Number.isFinite(sprite.baseX)) {
          sprite.baseX = x;
        }
        if (!Number.isFinite(sprite.baseY)) {
          sprite.baseY = y;
        }
      }
    }

    animateCollectibles(timeMs) {
      const t = (Number(timeMs) || Date.now()) / 1000;
      for (const sprite of this.collectibleSprites.values()) {
        if (state.reduceMotion) {
          sprite.halo.setRadius(sprite.radius + 7);
          sprite.halo.setAlpha(0.28);
          sprite.container.setPosition(sprite.baseX, sprite.baseY);
          continue;
        }

        const bob = Math.sin(t * 2.8 + sprite.phase) * 3.1;
        const pulse = 0.16 + 0.12 * (1 + Math.sin(t * 4.3 + sprite.phase));
        const haloRadius = sprite.radius + 7 + Math.sin(t * 3.4 + sprite.phase) * 1.5;
        sprite.halo.setRadius(haloRadius);
        sprite.halo.setAlpha(pulse);
        sprite.container.setPosition(sprite.baseX, sprite.baseY + bob);
      }
    }

    drawInteractionAffordances(timeMs) {
      if (!this.interactionGraphics) {
        return;
      }
      const world = state.world || DEFAULT_WORLD;
      const portals = Array.isArray(world.portals) ? world.portals : [];
      const npcs = Array.isArray(world.npcs) ? world.npcs : [];
      const phase = state.reduceMotion ? 0 : (Number(timeMs) || Date.now()) * 0.0045;
      const self = state.selfId ? state.players.get(state.selfId) : null;
      const selfX = self ? self.renderX : null;
      const selfY = self ? self.renderY : null;

      this.interactionGraphics.clear();

      portals.forEach((portal, index) => {
        const pulse = state.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(phase * 1.4 + index * 0.8);
        const selfInside = Number.isFinite(selfX) && Number.isFinite(selfY) && pointInRect(selfX, selfY, portal);
        const glowAlpha = selfInside ? 0.32 + pulse * 0.2 : 0.14 + pulse * 0.12;
        const strokeAlpha = selfInside ? 0.95 : 0.72;
        const inset = selfInside ? 2 : 4;

        this.interactionGraphics.fillStyle(0x5ce0ff, glowAlpha);
        this.interactionGraphics.fillRoundedRect(
          portal.x + inset,
          portal.y + inset,
          Math.max(4, portal.width - inset * 2),
          Math.max(4, portal.height - inset * 2),
          9
        );
        this.interactionGraphics.lineStyle(selfInside ? 3 : 2, 0xeefcff, strokeAlpha);
        this.interactionGraphics.strokeRoundedRect(
          portal.x + inset,
          portal.y + inset,
          Math.max(4, portal.width - inset * 2),
          Math.max(4, portal.height - inset * 2),
          9
        );

        const centerX = portal.x + portal.width / 2;
        const centerY = portal.y + portal.height / 2;
        const chevronW = Math.min(18, Math.max(10, portal.width * 0.12));
        const chevronH = Math.min(9, Math.max(5, portal.height * 0.15));
        const drift = state.reduceMotion ? 0 : Math.sin(phase * 2.3 + index) * 3;
        const chevronY = centerY + portal.height * 0.18 + drift;

        this.interactionGraphics.lineStyle(3, 0xf2feff, 0.82);
        this.interactionGraphics.beginPath();
        this.interactionGraphics.moveTo(centerX - chevronW, chevronY - chevronH);
        this.interactionGraphics.lineTo(centerX, chevronY + chevronH);
        this.interactionGraphics.lineTo(centerX + chevronW, chevronY - chevronH);
        this.interactionGraphics.strokePath();
      });

      npcs.forEach((npc, index) => {
        const x = Number(npc.x) || 0;
        const y = Number(npc.y) || 0;
        const radius = Math.max(18, Number(npc.radius) || 26);
        const pulseRadius = state.reduceMotion ? radius + 4 : radius + 4 + Math.sin(phase * 1.6 + index * 0.7) * 2.2;
        const alpha = state.reduceMotion ? 0.45 : 0.35 + 0.2 * (0.5 + 0.5 * Math.sin(phase * 1.8 + index));
        this.interactionGraphics.lineStyle(2, 0xfff1d2, alpha);
        this.interactionGraphics.strokeCircle(x, y, pulseRadius);
      });
    }

    stepInterpolation(deltaMs, timeMs) {
      const delta = Math.max(0, deltaMs || 16.7);
      const factorBase = Math.min(1, (delta / 1000) * 10);
      const frameTime = Number(timeMs) || Date.now();

      this.syncCollectiblesFromState();
      this.animateCollectibles(frameTime);
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
        const showEmote = Date.now() < (player.emoteUntil || 0);
        const emoteText = showEmote ? `[${EMOTE_LABELS[player.emote] || player.emote || ""}]` : "";
        if (sprite.emote.text !== emoteText) {
          sprite.emote.setText(emoteText);
        }
        sprite.container.setPosition(player.renderX, player.renderY);
      }

      this.resolveNameplateOverlaps();
      this.drawInteractionAffordances(frameTime);

      if (this.moveMarker && this.moveMarker.visible) {
        const pulse = state.reduceMotion ? 0 : Math.sin(frameTime * 0.012);
        this.moveMarker.setFillStyle(0xffffff, 0.62 + pulse * 0.22);
        this.moveMarker.setRadius(6 + pulse * 1.5);
        if (state.selfId) {
          const self = state.players.get(state.selfId);
          if (self) {
            const distanceToMarker = Phaser.Math.Distance.Between(
              self.renderX,
              self.renderY,
              this.moveMarker.x,
              this.moveMarker.y
            );
            if (distanceToMarker <= MOVE_MARKER_HIDE_DISTANCE) {
              this.moveMarker.setVisible(false);
            }
          }
        }
      }
    }

    update(time, delta) {
      this.stepInterpolation(delta, time);
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

  if (serverFormEl) {
    serverFormEl.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = serverInputEl ? serverInputEl.value : "";
      switchServerEndpoint(value);
    });
  }

  if (serverResetEl) {
    serverResetEl.addEventListener("click", () => {
      if (serverInputEl) {
        serverInputEl.value = "";
      }
      switchServerEndpoint("");
    });
  }

  if (serverCopyEl) {
    serverCopyEl.addEventListener("click", async () => {
      await copyInviteLink();
    });
  }

  if (reduceMotionToggleEl) {
    reduceMotionToggleEl.addEventListener("change", () => {
      applyReducedMotion(Boolean(reduceMotionToggleEl.checked), true);
    });
  }

  if (qaResetEl) {
    qaResetEl.addEventListener("click", () => {
      sendEvent("qa:resetProgress", {});
      pushToast("Progress reset requested.");
    });
  }

  for (const button of emoteButtons) {
    button.addEventListener("click", () => {
      const emote = normalizeRoomId(button.dataset.emote || "");
      if (!emote) {
        return;
      }
      sendEvent("player:emote", { emote });
    });
  }

  const emoteHotkeys = ["wave", "dance", "cheer", "laugh", "snowball"];
  window.addEventListener("keydown", (event) => {
    const key = String(event.key || "");
    if (!/^[1-5]$/.test(key)) {
      return;
    }
    if (document.activeElement === chatInputEl || document.activeElement === nameInputEl) {
      return;
    }
    const index = Number(key) - 1;
    const emote = emoteHotkeys[index];
    if (!emote) {
      return;
    }
    sendEvent("player:emote", { emote });
  });

  window.addEventListener("beforeunload", () => {
    stopBackendHealthMonitor();
  });

  chatFormEl.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.chatCatalogLoaded) {
      appendChat("system", "Quick chat is still loading.");
      return;
    }
    if (!Array.isArray(state.chatOptions) || state.chatOptions.length === 0) {
      appendChat("system", "Quick chat is unavailable right now.");
      return;
    }
    const query = chatInputEl.value.trim();
    if (!query) {
      return;
    }
    const chosen = resolveOutgoingQuickChat();
    if (!chosen) {
      appendChat("system", "Quick chat only: choose one of the suggested phrases.");
      pushToast("Pick a quick chat suggestion first.");
      refreshQuickChatSuggestions();
      return;
    }
    sendEvent("chat:send", { optionId: chosen.id, text: query });
    chatInputEl.value = "";
    state.selectedChatOptionId = "";
    state.chatSuggestions = findQuickChatMatches("", 6);
    renderQuickChatSuggestions();
    chatInputEl.focus();
  });

  chatInputEl.addEventListener("input", () => {
    refreshQuickChatSuggestions();
  });

  chatInputEl.addEventListener("focus", () => {
    if (!state.chatCatalogLoaded) {
      renderQuickChatSuggestions();
      return;
    }
    if (!chatInputEl.value.trim()) {
      state.chatSuggestions = findQuickChatMatches("", 6);
      renderQuickChatSuggestions();
    }
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
      emote: Date.now() < (player.emoteUntil || 0) ? player.emote : "",
      isSelf: player.id === state.selfId,
    }));

    return JSON.stringify({
      mode: state.connected ? "connected" : "connecting",
      ws_endpoint: state.wsEndpoint || "",
      active_ws_url: state.activeWsUrl || currentWsUrl(),
      invite_url: buildInviteUrl(),
      backend_health: state.backendHealth,
      awaiting_manual_endpoint: state.awaitingManualEndpoint,
      reduce_motion: state.reduceMotion,
      room_transition_active: Boolean(roomTransitionEl && roomTransitionEl.classList.contains("active")),
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
        npcs: state.world.npcs || [],
      },
      collectibles: state.collectibles || [],
      players,
      roster: Array.from(state.players.values()).map((player) => ({
        id: player.id,
        name: displayName(player),
      })),
      progress_loaded: state.progressLoaded,
      progress: state.progress,
      quick_chat: {
        loaded: state.chatCatalogLoaded,
        options_count: state.chatOptions.length,
        selected_option_id: state.selectedChatOptionId || "",
        suggestions: state.chatSuggestions.map((option) => ({
          id: option.id,
          text: option.text,
        })),
      },
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

  setPreferredWsEndpoint(state.wsEndpoint || "");
  setBackendStatus("Backend: checking...", "checking");
  renderChatEmptyState("Connect to start chatting.");
  updatePlayerCount();
  renderQuestPanel();
  renderQuickChatSuggestions();
  updateIdentityControls();
  connectSocket();
})();
