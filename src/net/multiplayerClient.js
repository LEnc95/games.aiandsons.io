const PROTOCOL = "aiandsons.multiplayer.v1";
const DEFAULT_PRODUCTION_ENDPOINT = "wss://audioagar-server-6owms56gxq-uc.a.run.app/ws";
const DEFAULT_LOCAL_ENDPOINT = "ws://127.0.0.1:8081/ws";
const STORAGE_KEY = "aiandsons-multiplayer-ws-endpoint";

function nowMs() {
  return Date.now();
}

function makeMessageId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
    const buffer = new Uint8Array(16);
    globalThis.crypto.getRandomValues(buffer);
    const seed = Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${nowMs().toString(36)}-${seed.slice(0, 8)}`;
  }
  throw new Error("Secure random number generation is not supported in this environment.");
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toWsProtocol(protocol) {
  if (protocol === "https:") return "wss:";
  if (protocol === "http:") return "ws:";
  return protocol;
}

export function normalizeWebSocketUrl(rawEndpoint) {
  const trimmed = String(rawEndpoint || "").trim();
  if (!trimmed) return "";

  let candidate = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    const protocol = globalThis.location && globalThis.location.protocol === "https:" ? "wss://" : "ws://";
    candidate = `${protocol}${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    parsed.protocol = toWsProtocol(parsed.protocol);
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") return "";
    if (!parsed.host) return "";
    if (!parsed.pathname || parsed.pathname === "/") parsed.pathname = "/ws";
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function getStoredEndpoint() {
  try {
    return normalizeWebSocketUrl(globalThis.localStorage?.getItem(STORAGE_KEY) || "");
  } catch {
    return "";
  }
}

function endpointFromQuery() {
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    return normalizeWebSocketUrl(params.get("ws") || params.get("endpoint") || "");
  } catch {
    return "";
  }
}

export function resolveWebSocketUrl(endpoint) {
  const explicit = normalizeWebSocketUrl(endpoint);
  if (explicit) return explicit;

  const queryEndpoint = endpointFromQuery();
  if (queryEndpoint) return queryEndpoint;

  const configured = normalizeWebSocketUrl(globalThis.__AIANDSONS_WS_ENDPOINT || "");
  if (configured) return configured;

  const stored = getStoredEndpoint();
  if (stored) return stored;

  const host = String(globalThis.location?.hostname || "");
  if (host.includes("aiandsons.io") || host.includes("vercel.app")) {
    return DEFAULT_PRODUCTION_ENDPOINT;
  }
  return DEFAULT_LOCAL_ENDPOINT;
}

function normalizeInboundMessage(data) {
  if (typeof data === "string") return safeJsonParse(data);
  if (data instanceof Blob) return null;
  if (data && typeof data === "object") return data;
  return null;
}

function createEnvelope(type, payload, options = {}) {
  return {
    protocol: PROTOCOL,
    v: 1,
    id: makeMessageId(),
    type,
    gameId: options.gameId,
    roomId: options.roomId || "",
    sentAt: nowMs(),
    payload: payload || {},
  };
}

function emit(callbacks, value) {
  for (const cb of callbacks) {
    try {
      cb(value);
    } catch (err) {
      console.error("[multiplayerClient] callback failed", err);
    }
  }
}

class MultiplayerConnection {
  constructor(options) {
    this.options = {
      endpoint: "",
      roomId: "",
      token: "",
      playerName: "",
      reconnect: true,
      reconnectBaseMs: 800,
      reconnectMaxMs: 8000,
      heartbeatMs: 12000,
      connectTimeoutMs: 7000,
      ...options,
    };
    this.gameId = String(this.options.gameId || "").trim();
    if (!this.gameId) {
      throw new Error("connect requires a gameId");
    }
    this.roomId = String(this.options.roomId || "").trim();
    this.url = resolveWebSocketUrl(this.options.endpoint);
    this.socket = null;
    this.closedByUser = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = 0;
    this.heartbeatTimer = 0;
    this.connectTimeoutTimer = 0;
    this.inputSeq = 0;
    this.pendingInputs = [];
    this.stateCallbacks = new Set();
    this.eventCallbacks = new Set();
    this.statusCallbacks = new Set();
  }

  connectSocket() {
    if (this.closedByUser) return;
    if (!this.url) {
      this.emitEvent({ type: "error", message: "No WebSocket endpoint configured." });
      return;
    }
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.emitStatus("connecting");
    let socket = null;
    try {
      socket = new WebSocket(this.url);
    } catch (err) {
      this.emitEvent({ type: "error", message: "Unable to create WebSocket.", detail: String(err?.message || err) });
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;
    this.connectTimeoutTimer = globalThis.setTimeout?.(() => {
      if (socket === this.socket && socket.readyState !== WebSocket.OPEN) {
        this.emitStatus("timeout");
        try {
          socket.close(4000, "connect timeout");
        } catch {
          // Ignore close failures.
        }
      }
    }, this.options.connectTimeoutMs);

    socket.addEventListener("open", () => {
      if (socket !== this.socket) return;
      globalThis.clearTimeout?.(this.connectTimeoutTimer);
      this.reconnectAttempt = 0;
      this.emitStatus("open");
      this.sendEnvelope("join", {
        gameId: this.gameId,
        roomId: this.roomId || undefined,
        token: this.options.token || undefined,
        playerName: this.options.playerName || undefined,
        userAgent: globalThis.navigator?.userAgent || "",
      });
      this.flushPendingInputs();
      this.startHeartbeat();
    });

    socket.addEventListener("message", (event) => {
      if (socket !== this.socket) return;
      this.handleMessage(normalizeInboundMessage(event.data));
    });

    socket.addEventListener("close", (event) => {
      if (socket !== this.socket) return;
      globalThis.clearTimeout?.(this.connectTimeoutTimer);
      this.stopHeartbeat();
      this.socket = null;
      this.emitStatus("closed", { code: event.code, reason: event.reason || "" });
      if (!this.closedByUser && this.options.reconnect !== false) {
        this.scheduleReconnect();
      }
    });

    socket.addEventListener("error", () => {
      if (socket !== this.socket) return;
      this.emitEvent({ type: "error", message: "WebSocket error", endpoint: this.url });
      this.emitStatus("error");
    });
  }

  emitStatus(status, detail = {}) {
    emit(this.statusCallbacks, {
      type: "status",
      status,
      endpoint: this.url,
      roomId: this.roomId,
      gameId: this.gameId,
      ...detail,
    });
    emit(this.eventCallbacks, {
      type: "connection_status",
      status,
      endpoint: this.url,
      roomId: this.roomId,
      gameId: this.gameId,
      ...detail,
    });
  }

  emitEvent(event) {
    emit(this.eventCallbacks, {
      gameId: this.gameId,
      roomId: this.roomId,
      ...event,
    });
  }

  sendEnvelope(type, payload) {
    const envelope = createEnvelope(type, payload, { gameId: this.gameId, roomId: this.roomId });
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      this.socket.send(JSON.stringify(envelope));
      return true;
    } catch (err) {
      this.emitEvent({ type: "error", message: "Failed to send message.", detail: String(err?.message || err) });
      return false;
    }
  }

  sendInput(input) {
    const payload = {
      seq: ++this.inputSeq,
      input,
      clientTime: nowMs(),
    };
    if (this.sendEnvelope("input", payload)) return;
    this.pendingInputs.push(payload);
    if (this.pendingInputs.length > 32) this.pendingInputs.shift();
  }

  flushPendingInputs() {
    const pending = this.pendingInputs.splice(0);
    for (const payload of pending) {
      this.sendEnvelope("input", payload);
    }
  }

  handleMessage(message) {
    if (!message || typeof message !== "object") {
      this.emitEvent({ type: "warning", message: "Ignored malformed server message." });
      return;
    }

    const type = String(message.type || "");
    const payload = message.payload && typeof message.payload === "object" ? message.payload : message;
    const inboundProtocol = String(message.protocol || payload.protocol || "");
    const inboundGameId = String(message.gameId || payload.gameId || "");
    if (inboundProtocol && inboundProtocol !== PROTOCOL) return;
    if (inboundGameId && inboundGameId !== this.gameId) return;
    if (!inboundProtocol && !inboundGameId && type.includes(":")) return;

    if (payload.roomId && typeof payload.roomId === "string") {
      this.roomId = payload.roomId;
    } else if (message.roomId && typeof message.roomId === "string") {
      this.roomId = message.roomId;
    }

    if (type === "state" || type === "snapshot" || type === "delta") {
      emit(this.stateCallbacks, {
        type,
        receivedAt: nowMs(),
        roomId: this.roomId,
        payload,
      });
      return;
    }

    if (type === "pong") {
      this.emitEvent({ type: "pong", receivedAt: nowMs(), payload });
      return;
    }

    this.emitEvent({
      type: type || "message",
      receivedAt: nowMs(),
      payload,
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = globalThis.setInterval?.(() => {
      this.sendEnvelope("ping", { clientTime: nowMs() });
    }, this.options.heartbeatMs);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      globalThis.clearInterval?.(this.heartbeatTimer);
      this.heartbeatTimer = 0;
    }
  }

  scheduleReconnect() {
    if (this.closedByUser || this.reconnectTimer) return;
    const delay = Math.min(
      this.options.reconnectMaxMs,
      this.options.reconnectBaseMs * 2 ** Math.min(6, this.reconnectAttempt)
    );
    this.reconnectAttempt += 1;
    this.emitStatus("reconnecting", { delayMs: delay, attempt: this.reconnectAttempt });
    this.reconnectTimer = globalThis.setTimeout?.(() => {
      this.reconnectTimer = 0;
      this.connectSocket();
    }, delay);
  }

  onStateUpdate(cb) {
    this.stateCallbacks.add(cb);
    return () => this.stateCallbacks.delete(cb);
  }

  onEvent(cb) {
    this.eventCallbacks.add(cb);
    return () => this.eventCallbacks.delete(cb);
  }

  onStatus(cb) {
    this.statusCallbacks.add(cb);
    return () => this.statusCallbacks.delete(cb);
  }

  disconnect() {
    this.closedByUser = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      globalThis.clearTimeout?.(this.reconnectTimer);
      this.reconnectTimer = 0;
    }
    if (this.socket) {
      try {
        this.socket.close(1000, "client disconnect");
      } catch {
        // Ignore close failures.
      }
      this.socket = null;
    }
    this.emitStatus("disconnected");
  }
}

export async function connect(options) {
  const connection = new MultiplayerConnection(options || {});
  connection.connectSocket();
  return connection;
}

export const multiplayerProtocol = Object.freeze({
  name: PROTOCOL,
  version: 1,
  defaultProductionEndpoint: DEFAULT_PRODUCTION_ENDPOINT,
  defaultLocalEndpoint: DEFAULT_LOCAL_ENDPOINT,
  storageKey: STORAGE_KEY,
});
