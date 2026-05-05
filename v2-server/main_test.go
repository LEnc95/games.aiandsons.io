package main

import (
	"encoding/json"
	mathrand "math/rand"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestAudioAgarWebSocketJoinMoveAndAction(t *testing.T) {
	h := newHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", h.handleWS)
	server := httptest.NewServer(mux)
	defer server.Close()

	conn := dialTestWebSocket(t, server.URL, "/ws")
	defer conn.Close()

	writeTestEnvelope(t, conn, outEnvelope{
		Protocol: protocolName,
		V:        protocolVersion,
		Type:     "join",
		GameID:   audioAgarGameID,
		RoomID:   "screen-reader-room",
		Payload: map[string]any{
			"playerName": "Tester",
		},
	})

	state := readStateEnvelope(t, conn)
	if state.SelfID == "" {
		t.Fatal("state did not include selfId")
	}
	if len(state.Players) < 2 {
		t.Fatalf("expected human plus bots, got %d players", len(state.Players))
	}
	if len(state.Pellets) == 0 {
		t.Fatal("expected pellets in authoritative state")
	}
	self := findSelf(t, state)
	startX := self.X

	writeTestEnvelope(t, conn, outEnvelope{
		Protocol: protocolName,
		V:        protocolVersion,
		Type:     "input",
		GameID:   audioAgarGameID,
		RoomID:   "screen-reader-room",
		Payload: inputEnvelope{
			Seq: 1,
			Input: gameInput{
				Type:      "move",
				Direction: "E",
				Vector:    vector2{X: 1, Y: 0},
			},
		},
	})

	moved := false
	for i := 0; i < 20; i++ {
		state = readStateEnvelope(t, conn)
		self = findSelf(t, state)
		if self.X > startX+8 {
			moved = true
			break
		}
	}
	if !moved {
		t.Fatalf("expected authoritative movement east; start %.2f current %.2f", startX, self.X)
	}

	massBefore := self.Mass
	writeTestEnvelope(t, conn, outEnvelope{
		Protocol: protocolName,
		V:        protocolVersion,
		Type:     "input",
		GameID:   audioAgarGameID,
		RoomID:   "screen-reader-room",
		Payload: inputEnvelope{
			Seq: 2,
			Input: gameInput{
				Type:      "eject",
				Direction: "E",
				Vector:    vector2{X: 1, Y: 0},
			},
		},
	})
	state = readStateEnvelope(t, conn)
	self = findSelf(t, state)
	if self.Mass >= massBefore {
		t.Fatalf("expected eject to reduce mass, before %.2f after %.2f", massBefore, self.Mass)
	}
}

func TestAudioAgarTwoHumansShareRoom(t *testing.T) {
	h := newHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws/game", h.handleWS)
	server := httptest.NewServer(mux)
	defer server.Close()

	first := dialTestWebSocket(t, server.URL, "/ws/game")
	defer first.Close()
	second := dialTestWebSocket(t, server.URL, "/ws/game")
	defer second.Close()

	writeTestEnvelope(t, first, outEnvelope{
		Protocol: protocolName,
		V:        protocolVersion,
		Type:     "join",
		GameID:   audioAgarGameID,
		RoomID:   "shared",
		Payload:  map[string]any{"playerName": "Alpha"},
	})
	writeTestEnvelope(t, second, outEnvelope{
		Protocol: protocolName,
		V:        protocolVersion,
		Type:     "join",
		GameID:   audioAgarGameID,
		RoomID:   "shared",
		Payload:  map[string]any{"playerName": "Beta"},
	})

	firstState := readStateEnvelope(t, first)
	secondState := readStateEnvelope(t, second)
	if firstState.SelfID == "" || secondState.SelfID == "" || firstState.SelfID == secondState.SelfID {
		t.Fatalf("expected distinct self ids, got %q and %q", firstState.SelfID, secondState.SelfID)
	}
	if !stateHasPlayer(firstState, secondState.SelfID) {
		t.Fatalf("first player state does not include second player %q", secondState.SelfID)
	}
	if !stateHasPlayer(secondState, firstState.SelfID) {
		t.Fatalf("second player state does not include first player %q", firstState.SelfID)
	}
}

func TestAudioAgarRoomPelletConsumption(t *testing.T) {
	room := &audioAgarRoom{
		gameID:     audioAgarGameID,
		roomID:     "unit",
		clients:    make(map[string]*client),
		players:    make(map[string]*playerCell),
		pellets:    make(map[string]*pellet),
		rng:        newDeterministicRand(),
		lastActive: time.Now(),
	}
	player := &playerCell{
		ID:       "p-test",
		Name:     "Tester",
		X:        100,
		Y:        100,
		Mass:     30,
		Radius:   massToRadius(30),
		Alive:    true,
		inputDir: vector2{X: 1, Y: 0},
	}
	room.players[player.ID] = player
	room.pellets["near"] = &pellet{ID: "near", X: 105, Y: 100, Value: 3}
	room.step(1.0 / tickRate)

	if player.Mass <= 30 {
		t.Fatalf("expected pellet to grow player, got mass %.2f", player.Mass)
	}
	if _, ok := room.pellets["near"]; ok {
		t.Fatal("expected consumed pellet to be removed")
	}
}

func stateHasPlayer(state audioAgarState, id string) bool {
	for _, player := range state.Players {
		if player.ID == id {
			return true
		}
	}
	return false
}

func dialTestWebSocket(t *testing.T, serverURL, path string) *websocket.Conn {
	t.Helper()
	parsed, err := url.Parse(serverURL)
	if err != nil {
		t.Fatal(err)
	}
	parsed.Scheme = strings.Replace(parsed.Scheme, "http", "ws", 1)
	parsed.Path = path
	conn, _, err := websocket.DefaultDialer.Dial(parsed.String(), http.Header{"Origin": []string{"http://127.0.0.1"}})
	if err != nil {
		t.Fatal(err)
	}
	return conn
}

func writeTestEnvelope(t *testing.T, conn *websocket.Conn, msg outEnvelope) {
	t.Helper()
	msg.SentAt = nowMillis()
	if msg.GameID == "" {
		msg.GameID = audioAgarGameID
	}
	raw, err := json.Marshal(msg)
	if err != nil {
		t.Fatal(err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, raw); err != nil {
		t.Fatal(err)
	}
}

func readStateEnvelope(t *testing.T, conn *websocket.Conn) audioAgarState {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		_ = conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
		_, raw, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
				t.Fatal(err)
			}
			continue
		}
		var msg envelope
		if err := json.Unmarshal(raw, &msg); err != nil {
			t.Fatal(err)
		}
		if msg.Type != "state" {
			continue
		}
		var payload struct {
			State audioAgarState `json:"state"`
		}
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			t.Fatal(err)
		}
		return payload.State
	}
	t.Fatal("timed out waiting for state message")
	return audioAgarState{}
}

func findSelf(t *testing.T, state audioAgarState) playerCell {
	t.Helper()
	for _, player := range state.Players {
		if player.IsSelf || player.ID == state.SelfID {
			return player
		}
	}
	t.Fatalf("self %q not found in %d players", state.SelfID, len(state.Players))
	return playerCell{}
}

func newDeterministicRand() *mathrand.Rand {
	return mathrand.New(mathrand.NewSource(42))
}
