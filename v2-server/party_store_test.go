package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

type memoryPartyRoomStore struct {
	mu        sync.Mutex
	snapshots map[string]*partyRoomSnapshot
	deleted   []string
}

func (s *memoryPartyRoomStore) Load(_ context.Context, roomID string) (*partyRoomSnapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	snapshot := s.snapshots[roomID]
	if snapshot == nil || snapshot.ExpiresAt <= nowMillis() {
		return nil, errPartyRoomSnapshotNotFound
	}
	payload, _ := json.Marshal(snapshot)
	var copy partyRoomSnapshot
	_ = json.Unmarshal(payload, &copy)
	return &copy, nil
}

func (s *memoryPartyRoomStore) Save(_ context.Context, snapshot *partyRoomSnapshot) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.snapshots == nil {
		s.snapshots = make(map[string]*partyRoomSnapshot)
	}
	payload, _ := json.Marshal(snapshot)
	var copy partyRoomSnapshot
	_ = json.Unmarshal(payload, &copy)
	s.snapshots[snapshot.RoomID] = &copy
	return nil
}

func (s *memoryPartyRoomStore) Delete(_ context.Context, roomID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.snapshots, roomID)
	s.deleted = append(s.deleted, roomID)
	return nil
}

func TestPartyRoomSnapshotPreservesAuthoritativeStateWithoutSockets(t *testing.T) {
	now := nowMillis()
	connected := &client{id: "live-socket"}
	room := &partyRoom{
		gameKey: partyRotationGameKey, roomID: "SAVE", hostToken: "host-secret",
		players: map[string]*partyPlayer{
			"p1": {
				ID: "p1", Token: "player-secret", Name: "Ada", Avatar: "🐸", Color: "#abc",
				Client: connected, Connected: true, Ready: true, Points: 42, PartyPoints: 18,
				HitObstacleIDs: map[string]bool{"barrier-1": true}, HitRouteIDs: map[string]bool{"route-1": true},
			},
		},
		tokenToPlayer: map[string]string{"player-secret": "p1"}, blockedTokens: map[string]bool{"removed-secret": true},
		locked: true, allowLateJoin: false, maxPlayers: 6, friendlyNames: true,
		partyConfig: partySessionSettings{Version: 1, DurationPreset: "quick", TargetActivities: 3, EnabledActivities: []string{"turbotilt:classic"}},
		phase:       "lobby", partyPhase: "voting", phaseEndsAt: now + 9000,
		partyVote:       partyVoteState{Votes: map[string]string{"p1": "turbotilt:classic"}},
		activityHistory: []string{"crowdshift:majority"}, createdAt: now - 1000, lastActive: now,
	}

	snapshot := room.snapshotForPersistenceLocked(now)
	if snapshot.ExpiresAt != now+partyRoomRecoveryWindowMs {
		t.Fatalf("unexpected recovery expiry: %d", snapshot.ExpiresAt)
	}
	player := snapshot.Players["p1"]
	if player == nil || player.Client != nil || player.Connected {
		t.Fatalf("snapshot retained live socket state: %#v", player)
	}
	if player.Avatar != "🐸" || player.PartyPoints != 18 || snapshot.HostToken != "host-secret" {
		t.Fatalf("snapshot lost identity or score state: %#v", snapshot)
	}
	room.players["p1"].PartyPoints = 99
	room.partyVote.Votes["p1"] = "changed"
	if player.PartyPoints != 18 || snapshot.PartyVote.Votes["p1"] != "turbotilt:classic" {
		t.Fatal("snapshot changed after the live room mutated")
	}
}

func TestPartyRoomRestorePausesRotationUntilHostReturns(t *testing.T) {
	savedAt := nowMillis()
	h := newHubWithGames(map[string]bool{partyGameID: true}, "test")
	snapshot := &partyRoomSnapshot{
		SchemaVersion: partyRoomSnapshotVersion, SavedAt: savedAt, ExpiresAt: savedAt + partyRoomRecoveryWindowMs,
		GameKey: partyRotationGameKey, RoomID: "BACK", HostToken: "host-secret",
		Players:       map[string]*partyPlayer{"p1": {ID: "p1", Token: "player-secret", Connected: true, Avatar: "🦊"}},
		TokenToPlayer: map[string]string{"player-secret": "p1"}, BlockedTokens: map[string]bool{},
		Phase: "lobby", PartyPhase: "voting", PhaseEndsAt: savedAt + 7000,
		SessionMode: partyRotationSessionMode, PartyVote: partyVoteState{Votes: map[string]string{}},
	}

	restored := restorePartyRoom(h, snapshot)
	if restored.phase != "paused" || restored.partyPhase != "paused" || restored.resumePartyPhase != "voting" {
		t.Fatalf("active rotation was not safely paused: phase=%s party=%s resume=%s", restored.phase, restored.partyPhase, restored.resumePartyPhase)
	}
	if restored.players["p1"].Connected || restored.players["p1"].Client != nil {
		t.Fatal("restored player was incorrectly marked connected")
	}
	host := &client{id: "host", hub: h, send: make(chan []byte, 2)}
	restored.attachHost(host, "host-secret")
	if restored.phase != "lobby" || restored.partyPhase != "voting" || restored.host != host {
		t.Fatalf("valid host did not resume restored activity: phase=%s party=%s", restored.phase, restored.partyPhase)
	}
	remaining := restored.phaseEndsAt - nowMillis()
	if remaining < 6000 || remaining > 7500 {
		t.Fatalf("restored timer did not preserve its remaining time: %dms", remaining)
	}
}

func TestFindPartyRoomLoadsUnexpiredSnapshot(t *testing.T) {
	now := nowMillis()
	store := &memoryPartyRoomStore{snapshots: map[string]*partyRoomSnapshot{
		"FIND": {
			SchemaVersion: partyRoomSnapshotVersion, SavedAt: now, ExpiresAt: now + time.Minute.Milliseconds(),
			GameKey: partyRotationGameKey, RoomID: "FIND", HostToken: "host-secret",
			Players: map[string]*partyPlayer{}, TokenToPlayer: map[string]string{}, BlockedTokens: map[string]bool{},
			Phase: "lobby", PartyPhase: "party_lobby", SessionMode: partyRotationSessionMode,
		},
	}}
	h := newHubWithGames(map[string]bool{partyGameID: true}, "test")
	h.partyStore = store

	room := h.findPartyRoom("FIND")
	if room == nil || room.roomID != "FIND" || h.partyRooms["FIND"] != room {
		t.Fatal("snapshot was not restored into the live room registry")
	}
	if again := h.findPartyRoom("FIND"); again != room {
		t.Fatal("subsequent lookup did not reuse the restored room")
	}
}

func TestPartyRoomStoreConfigurationIsExplicit(t *testing.T) {
	t.Setenv("PARTY_ROOM_STORE", "")
	t.Setenv("FIRESTORE_PROJECT_ID", "")
	t.Setenv("GOOGLE_CLOUD_PROJECT", "")
	store, err := newPartyRoomStoreFromEnv(context.Background())
	if err != nil || store != nil {
		t.Fatalf("local default unexpectedly enabled persistence: store=%T err=%v", store, err)
	}

	t.Setenv("PARTY_ROOM_STORE", "firestore")
	if _, err := newPartyRoomStoreFromEnv(context.Background()); err == nil {
		t.Fatal("Firestore persistence accepted an empty project configuration")
	}
}

func TestPartyWebSocketReconnectsAcrossHubRestart(t *testing.T) {
	store := &memoryPartyRoomStore{snapshots: make(map[string]*partyRoomSnapshot)}
	h1 := newHubWithGames(map[string]bool{partyGameID: true}, "party-before-restart")
	mux1 := http.NewServeMux()
	mux1.HandleFunc("/ws", h1.handleWS)
	server1 := httptest.NewServer(mux1)

	host1 := dialTestWebSocket(t, server1.URL, "/ws")
	writeTestEnvelope(t, host1, outEnvelope{
		Protocol: protocolName, V: protocolVersion, Type: "join", GameID: partyGameID,
		Payload: map[string]any{"role": "host", "gameKey": partyRotationGameKey},
	})
	hostWelcome := readPartyEnvelope(t, host1, "welcome")
	roomID := stringField(hostWelcome, "roomId")
	hostToken := stringField(hostWelcome, "token")

	player1 := dialTestWebSocket(t, server1.URL, "/ws")
	writeTestEnvelope(t, player1, outEnvelope{
		Protocol: protocolName, V: protocolVersion, Type: "join", GameID: partyGameID, RoomID: roomID,
		Payload: map[string]any{"role": "player", "playerName": "Ada", "playerAvatar": "🐸"},
	})
	playerWelcome := readPartyEnvelope(t, player1, "welcome")
	playerID := stringField(playerWelcome, "playerId")
	playerToken := stringField(playerWelcome, "token")

	room := h1.findPartyRoom(roomID)
	room.mu.Lock()
	now := nowMillis()
	room.phase = "racing"
	room.partyPhase = "activity"
	room.phaseEndsAt = now + 12000
	room.activityIndex = 2
	room.activity = partyActivity{ID: "turbotilt:classic", GameKey: turboTiltGameKey, ModeKey: "classic"}
	room.players[playerID].Points = 730
	room.players[playerID].PartyPoints = 18
	room.players[playerID].Ready = true
	snapshot := room.snapshotForPersistenceLocked(now)
	room.mu.Unlock()
	if err := store.Save(context.Background(), snapshot); err != nil {
		t.Fatalf("save pre-restart room: %v", err)
	}

	_ = host1.Close()
	_ = player1.Close()
	server1.Close()

	h2 := newHubWithGames(map[string]bool{partyGameID: true}, "party-after-restart")
	h2.partyStore = store
	mux2 := http.NewServeMux()
	mux2.HandleFunc("/ws", h2.handleWS)
	server2 := httptest.NewServer(mux2)
	defer server2.Close()

	host2 := dialTestWebSocket(t, server2.URL, "/ws")
	defer host2.Close()
	writeTestEnvelope(t, host2, outEnvelope{
		Protocol: protocolName, V: protocolVersion, Type: "join", GameID: partyGameID, RoomID: roomID,
		Payload: map[string]any{"role": "host", "token": hostToken},
	})
	recoveredHost := readPartyEnvelope(t, host2, "welcome")
	if recovered, _ := recoveredHost["reconnected"].(bool); !recovered {
		t.Fatalf("host recovery was not identified after restart: %#v", recoveredHost)
	}
	hostState := readPartyState(t, host2)
	if hostState["phase"] != "racing" || hostState["partyPhase"] != "activity" || int(hostState["activityIndex"].(float64)) != 2 {
		t.Fatalf("activity did not resume from checkpoint: %#v", hostState)
	}

	player2 := dialTestWebSocket(t, server2.URL, "/ws")
	defer player2.Close()
	writeTestEnvelope(t, player2, outEnvelope{
		Protocol: protocolName, V: protocolVersion, Type: "join", GameID: partyGameID, RoomID: roomID,
		Payload: map[string]any{"role": "player", "token": playerToken, "playerName": "ignored", "playerAvatar": "🦊"},
	})
	recoveredPlayer := readPartyEnvelope(t, player2, "welcome")
	if recovered, _ := recoveredPlayer["reconnected"].(bool); !recovered {
		t.Fatalf("player recovery was not identified after restart: %#v", recoveredPlayer)
	}
	if stringField(recoveredPlayer, "playerId") != playerID || stringField(recoveredPlayer, "playerAvatar") != "🐸" {
		t.Fatalf("player identity changed after restart: %#v", recoveredPlayer)
	}
	playerState := readPartyState(t, player2)
	players := playerState["players"].([]any)
	if len(players) != 1 {
		t.Fatalf("restored roster changed: %#v", players)
	}
	entry := players[0].(map[string]any)
	if int(entry["points"].(float64)) != 730 || int(entry["partyPoints"].(float64)) != 18 || entry["avatar"] != "🐸" {
		t.Fatalf("restored score or avatar changed: %#v", entry)
	}
}
