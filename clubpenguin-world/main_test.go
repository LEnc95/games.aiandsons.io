package main

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"net"
	"net/http"
	"net/http/httptest"

	"github.com/gorilla/websocket"
)

func TestSanitizeChat(t *testing.T) {
	got := sanitizeChat("   hello    world   ")
	if got != "hello world" {
		t.Fatalf("expected normalized whitespace, got %q", got)
	}

	got = sanitizeChat("   ")
	if got != "" {
		t.Fatalf("expected empty chat to sanitize to empty string, got %q", got)
	}

	longInput := strings.Repeat("x", maxChatLengthRunes+25)
	got = sanitizeChat(longInput)
	if len([]rune(got)) != maxChatLengthRunes {
		t.Fatalf("expected chat to be clamped to %d runes, got %d", maxChatLengthRunes, len([]rune(got)))
	}
}

func TestSanitizePlayerName(t *testing.T) {
	got := sanitizePlayerName("   Captain    Waddles   ")
	if got != "Captain Waddles" {
		t.Fatalf("expected normalized player name, got %q", got)
	}

	got = sanitizePlayerName("   ")
	if got != "" {
		t.Fatalf("expected empty name to sanitize to empty string, got %q", got)
	}

	longInput := strings.Repeat("a", maxPlayerNameRunes+12)
	got = sanitizePlayerName(longInput)
	if len([]rune(got)) != maxPlayerNameRunes {
		t.Fatalf("expected name to be clamped to %d runes, got %d", maxPlayerNameRunes, len([]rune(got)))
	}
}

func TestNormalizeRoomID(t *testing.T) {
	got := normalizeRoomID("  Snow Forts ")
	if got != "snow-forts" {
		t.Fatalf("expected room id to normalize to snow-forts, got %q", got)
	}
}

func TestCopyWorldMapCopiesPortals(t *testing.T) {
	src := WorldMap{
		Width:  1200,
		Height: 720,
		Blocked: []Rect{
			{X: 10, Y: 10, Width: 20, Height: 20},
		},
		Portals: []Portal{
			{ID: "a", Label: "To B", X: 30, Y: 40, Width: 50, Height: 60, ToRoom: "b"},
		},
	}
	out := copyWorldMap(src)
	if len(out.Portals) != 1 {
		t.Fatalf("expected portal copy length 1, got %d", len(out.Portals))
	}
	src.Portals[0].ToRoom = "changed"
	if out.Portals[0].ToRoom != "b" {
		t.Fatalf("expected copied portal to remain unchanged, got %q", out.Portals[0].ToRoom)
	}
}

func TestCanJoinRoomFromPortal(t *testing.T) {
	server := newServer()
	client, _, _ := server.addClient(nil)

	if server.canJoinRoomFromPortal(client.id, "plaza") {
		t.Fatal("expected join to plaza to be blocked when not inside plaza portal")
	}

	server.mu.Lock()
	room := server.rooms[defaultRoomID]
	player := room.Players[client.id]
	player.X = 1040
	player.Y = 60
	server.mu.Unlock()

	if !server.canJoinRoomFromPortal(client.id, "plaza") {
		t.Fatal("expected join to plaza to be allowed when player is inside plaza portal")
	}
	if server.canJoinRoomFromPortal(client.id, "snow-forts") {
		t.Fatal("expected join to snow-forts to be blocked from plaza portal zone")
	}
}

func TestConsumeCooldown(t *testing.T) {
	now := time.Now()
	last := time.Time{}

	if !consumeCooldown(now, &last, 500*time.Millisecond) {
		t.Fatal("expected first call to pass cooldown")
	}
	if consumeCooldown(now.Add(100*time.Millisecond), &last, 500*time.Millisecond) {
		t.Fatal("expected second call inside cooldown to be blocked")
	}
	if !consumeCooldown(now.Add(700*time.Millisecond), &last, 500*time.Millisecond) {
		t.Fatal("expected call after cooldown to pass")
	}
}

func TestSetPlayerName(t *testing.T) {
	server := newServer()
	client, _, _ := server.addClient(nil)

	roomID, name, changed := server.setPlayerName(client.id, "  Snow   Hero ")
	if roomID != defaultRoomID {
		t.Fatalf("expected room %q, got %q", defaultRoomID, roomID)
	}
	if name != "Snow Hero" {
		t.Fatalf("expected sanitized name Snow Hero, got %q", name)
	}
	if !changed {
		t.Fatal("expected name change to be reported")
	}

	server.mu.RLock()
	room := server.rooms[defaultRoomID]
	player := room.Players[client.id]
	server.mu.RUnlock()

	if player == nil {
		t.Fatal("expected player to exist after rename")
	}
	if player.Name != "Snow Hero" {
		t.Fatalf("expected player record to be updated, got %q", player.Name)
	}

	_, _, changed = server.setPlayerName(client.id, "Snow Hero")
	if changed {
		t.Fatal("expected unchanged name to report changed=false")
	}
}

func TestSetTargetBlockedClickResolvesToWalkablePoint(t *testing.T) {
	server := newServer()
	client, _, _ := server.addClient(nil)

	server.mu.RLock()
	room := server.rooms[defaultRoomID]
	player := room.Players[client.id]
	if room == nil || player == nil {
		server.mu.RUnlock()
		t.Fatal("expected default room/player to exist")
	}
	startX := player.X
	startY := player.Y
	server.mu.RUnlock()

	// This point is inside a blocked rectangle in town.
	server.setTarget(client.id, 360, 300)

	server.mu.RLock()
	room = server.rooms[defaultRoomID]
	player = room.Players[client.id]
	targetX := player.TargetX
	targetY := player.TargetY
	server.mu.RUnlock()

	if targetX == startX && targetY == startY {
		t.Fatal("expected blocked click to resolve to a reachable target, got no-op target")
	}
	if !server.isWalkable(room, targetX, targetY) {
		t.Fatalf("expected resolved target to be walkable, got (%f,%f)", targetX, targetY)
	}
}

func TestRenameBroadcastAndChatName(t *testing.T) {
	serverState := newServer()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", serverState.handleWebSocket)
	testServer := httptest.NewServer(mux)
	defer testServer.Close()

	wsURL := "ws" + strings.TrimPrefix(testServer.URL, "http") + "/ws"

	dial := func() *websocket.Conn {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			t.Fatalf("failed to dial websocket: %v", err)
		}
		return conn
	}

	readEvent := func(conn *websocket.Conn, eventType string, timeout time.Duration) map[string]any {
		deadline := time.Now().Add(timeout)
		for time.Now().Before(deadline) {
			_ = conn.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
			_, msg, err := conn.ReadMessage()
			if err != nil {
				var netErr net.Error
				if ok := errors.As(err, &netErr); ok && netErr.Timeout() {
					continue
				}
				t.Fatalf("failed reading websocket event %q: %v", eventType, err)
			}

			var envelope struct {
				Type    string         `json:"type"`
				Payload map[string]any `json:"payload"`
			}
			if err := json.Unmarshal(msg, &envelope); err != nil {
				continue
			}
			if envelope.Type == eventType {
				return envelope.Payload
			}
		}
		t.Fatalf("timed out waiting for event %q", eventType)
		return nil
	}

	sendEvent := func(conn *websocket.Conn, eventType string, payload map[string]any) {
		err := conn.WriteJSON(map[string]any{
			"type":    eventType,
			"payload": payload,
		})
		if err != nil {
			t.Fatalf("failed writing websocket event %q: %v", eventType, err)
		}
	}

	c1 := dial()
	defer c1.Close()
	init1 := readEvent(c1, "world:init", 2*time.Second)
	selfID, _ := init1["selfId"].(string)
	if selfID == "" {
		t.Fatal("expected first client to receive selfId")
	}

	c2 := dial()
	defer c2.Close()
	_ = readEvent(c2, "world:init", 2*time.Second)
	_ = readEvent(c1, "player:joined", 2*time.Second)

	sendEvent(c1, "player:setName", map[string]any{"name": "Captain Waddles"})
	renamed := readEvent(c2, "player:renamed", 2*time.Second)
	if renamed["id"] != selfID {
		t.Fatalf("expected renamed id %q, got %v", selfID, renamed["id"])
	}
	if renamed["name"] != "Captain Waddles" {
		t.Fatalf("expected renamed name Captain Waddles, got %v", renamed["name"])
	}

	sendEvent(c1, "chat:send", map[string]any{"text": "  hello   room  "})
	chat := readEvent(c2, "chat:message", 2*time.Second)
	if chat["id"] != selfID {
		t.Fatalf("expected chat id %q, got %v", selfID, chat["id"])
	}
	if chat["name"] != "Captain Waddles" {
		t.Fatalf("expected chat name Captain Waddles, got %v", chat["name"])
	}
	if chat["text"] != "hello room" {
		t.Fatalf("expected chat text to be normalized, got %v", chat["text"])
	}
}
