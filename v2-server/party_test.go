package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestPartyWebSocketCreateJoinStartAndReconnect(t *testing.T) {
	h := newHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", h.handleWS)
	server := httptest.NewServer(mux)
	defer server.Close()

	host := dialTestWebSocket(t, server.URL, "/ws")
	defer host.Close()
	writeTestEnvelope(t, host, outEnvelope{
		Protocol: protocolName, V: protocolVersion, Type: "join", GameID: partyGameID,
		Payload: map[string]any{"role": "host", "gameKey": turboTiltGameKey},
	})
	hostWelcome := readPartyEnvelope(t, host, "welcome")
	roomID := stringField(hostWelcome, "roomId")
	hostToken := stringField(hostWelcome, "token")
	if len(roomID) != 4 || hostToken == "" {
		t.Fatalf("expected room code and token, got %#v", hostWelcome)
	}

	players := make([]*websocket.Conn, 0, 2)
	for _, name := range []string{"Alpha", "Beta"} {
		conn := dialTestWebSocket(t, server.URL, "/ws")
		players = append(players, conn)
		writeTestEnvelope(t, conn, outEnvelope{
			Protocol: protocolName, V: protocolVersion, Type: "join", GameID: partyGameID, RoomID: roomID,
			Payload: map[string]any{"role": "player", "playerName": name},
		})
		welcome := readPartyEnvelope(t, conn, "welcome")
		if stringField(welcome, "playerId") == "" || stringField(welcome, "token") == "" {
			t.Fatalf("player welcome missing identity: %#v", welcome)
		}
	}
	for index := range players {
		defer players[index].Close()
	}

	writeTestEnvelope(t, host, outEnvelope{
		Protocol: protocolName, V: protocolVersion, Type: "input", GameID: partyGameID, RoomID: roomID,
		Payload: map[string]any{"seq": 1, "input": map[string]any{"type": "host", "action": "start"}},
	})
	state := readPartyState(t, host)
	if state["phase"] != "countdown" || int(state["heat"].(float64)) != 1 {
		t.Fatalf("expected first countdown, got %#v", state)
	}

	_ = host.Close()
	room := h.findPartyRoom(roomID)
	waitFor(t, time.Second, func() bool {
		room.mu.Lock()
		defer room.mu.Unlock()
		return room.hostDisconnectedAt > 0 && room.phase == "paused"
	})

	resumed := dialTestWebSocket(t, server.URL, "/ws")
	defer resumed.Close()
	writeTestEnvelope(t, resumed, outEnvelope{
		Protocol: protocolName, V: protocolVersion, Type: "join", GameID: partyGameID, RoomID: roomID,
		Payload: map[string]any{"role": "host", "token": hostToken},
	})
	_ = readPartyEnvelope(t, resumed, "welcome")
	state = readPartyState(t, resumed)
	if state["phase"] != "countdown" {
		t.Fatalf("expected host reconnect to resume countdown, got %#v", state)
	}
}

func TestPartyNameFilteringAndRoomRules(t *testing.T) {
	for _, testCase := range []struct {
		raw      string
		expected string
		adjusted bool
	}{
		{"  Ada Racer  ", "Ada Racer", false},
		{"A<script>", "Ascript", true},
		{"admin", "", true},
		{"x", "", true},
	} {
		actual, adjusted := sanitizePartyName(testCase.raw)
		if actual != testCase.expected || adjusted != testCase.adjusted {
			t.Fatalf("sanitizePartyName(%q) = %q/%v, want %q/%v", testCase.raw, actual, adjusted, testCase.expected, testCase.adjusted)
		}
	}
	if sanitizePartyRoomID("ABIO") != "" || sanitizePartyRoomID("ABCD") != "ABCD" {
		t.Fatal("room code normalization accepted ambiguous letters or rejected a valid code")
	}
}

func TestPartyDisplayJoinsReadOnlyWithoutTakingRacerSlot(t *testing.T) {
	h := newHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", h.handleWS)
	server := httptest.NewServer(mux)
	defer server.Close()

	host := dialTestWebSocket(t, server.URL, "/ws")
	defer host.Close()
	writeTestEnvelope(t, host, outEnvelope{
		Protocol: protocolName, V: protocolVersion, Type: "join", GameID: partyGameID,
		Payload: map[string]any{"role": "host", "gameKey": turboTiltGameKey},
	})
	welcome := readPartyEnvelope(t, host, "welcome")
	roomID := stringField(welcome, "roomId")

	display := dialTestWebSocket(t, server.URL, "/ws")
	writeTestEnvelope(t, display, outEnvelope{
		Protocol: protocolName, V: protocolVersion, Type: "join", GameID: partyGameID, RoomID: roomID,
		Payload: map[string]any{"role": "display", "gameKey": turboTiltGameKey},
	})
	displayWelcome := readPartyEnvelope(t, display, "welcome")
	if stringField(displayWelcome, "role") != "display" {
		t.Fatalf("expected display welcome, got %#v", displayWelcome)
	}
	state := readPartyState(t, display)
	if int(state["displayCount"].(float64)) != 1 || len(state["players"].([]any)) != 0 {
		t.Fatalf("display should not consume a racer slot: %#v", state)
	}

	writeTestEnvelope(t, display, outEnvelope{
		Protocol: protocolName, V: protocolVersion, Type: "input", GameID: partyGameID, RoomID: roomID,
		Payload: map[string]any{"seq": 1, "input": map[string]any{"type": "host", "action": "start"}},
	})
	errPayload := readPartyEnvelope(t, display, "error")
	if stringField(errPayload, "code") != "display_read_only" {
		t.Fatalf("expected display_read_only, got %#v", errPayload)
	}
	_ = display.Close()
	room := h.findPartyRoom(roomID)
	waitFor(t, time.Second, func() bool {
		room.mu.Lock()
		defer room.mu.Unlock()
		return len(room.displays) == 0 && room.phase == "lobby" && room.host != nil
	})
}

func TestTurboTiltPhysicsBoostBarrierAndEnergy(t *testing.T) {
	now := int64(100000)
	p := &partyPlayer{
		ID: "r-one", Active: true, Connected: true, BoostCharges: 1,
		HitObstacleIDs: make(map[string]bool),
	}
	r := &partyRoom{
		roomID: "TEST", gameKey: turboTiltGameKey, phase: "racing", heat: 1, totalHeats: 3,
		phaseEndsAt: now + partyHeatMs, players: map[string]*partyPlayer{p.ID: p},
		obstacles: []partyObstacle{
			{ID: "barrier", Kind: "barrier", Distance: 5, X: 0, Width: .2},
			{ID: "energy", Kind: "energy", Distance: 10, X: 0, Width: .2},
		},
	}
	p.BoostUntil = now + 1250
	r.step(now, .1)
	if p.Distance < 13 || p.BarrierHits != 1 || p.BoostCharges != 2 || p.SlowUntil <= now {
		t.Fatalf("expected boost movement and both obstacle effects, got distance %.2f hits %d charges %d slow %d", p.Distance, p.BarrierHits, p.BoostCharges, p.SlowUntil)
	}
	if p.EnergyPickups != 1 || p.LastEventID != 2 || p.LastEventType != "energy" || p.LastEventAt != now {
		t.Fatalf("expected explicit collision feedback events, got pickups %d event %d/%s at %d", p.EnergyPickups, p.LastEventID, p.LastEventType, p.LastEventAt)
	}
	before := p.Distance
	p.Connected = false
	r.step(now+100, .1)
	if gained := p.Distance - before; gained >= 10 {
		t.Fatalf("disconnected racer should continue at reduced speed, gained %.2f", gained)
	}
}

func TestTurboTiltExpandedSettingsGadgetsRoutesAndVoting(t *testing.T) {
	now := int64(300000)
	p := &partyPlayer{
		ID: "r-one", Active: true, Connected: true, NextGadget: "shield", Gadget: "shield",
		GadgetAvailable: true, HitObstacleIDs: make(map[string]bool), HitRouteIDs: make(map[string]bool),
	}
	r := &partyRoom{
		roomID: "PLAY", phase: "lobby", players: map[string]*partyPlayer{p.ID: p}, votes: make(map[string]string),
		settings: partySettings{Mode: "classic", Heats: 3, Chaos: "standard", TrackRotation: "all"},
	}
	r.configureLocked(partySettings{Mode: "survival", Heats: 9, Chaos: "wild", TrackRotation: "space", Accessibility: true}, &client{})
	if r.settings.Mode != "survival" || r.settings.Heats != 5 || r.settings.TrackRotation != "space" || !r.settings.Accessibility {
		t.Fatalf("settings were not validated: %#v", r.settings)
	}
	r.phase = "racing"
	r.applyGadgetInputLocked(p, "use", "", now)
	if !p.ShieldActive || p.GadgetAvailable {
		t.Fatal("shield gadget did not arm and consume its use")
	}
	r.obstacles = []partyObstacle{{ID: "wall", Kind: "barrier", Distance: 5, X: 0, Width: .2}}
	p.Distance = 6
	r.resolveObstaclesLocked(p, 0, now)
	if p.BarrierHits != 0 || p.ShieldActive || p.LastEventType != "shield_block" {
		t.Fatalf("shield did not block barrier: %#v", p)
	}
	r.routes = []partyRoute{{ID: "risk", End: 10, RiskSide: 1}}
	p.X = .6
	p.Distance = 11
	r.resolveRoutesLocked(p, 0, now)
	if p.StylePoints != 2 || p.BoostCharges != 1 || p.LastEventType != "risk_route" {
		t.Fatalf("risk route did not award style and energy: %#v", p)
	}
	r.phase = "intermission"
	r.voteOptions = []string{"fog", "mirror", "super_boost"}
	r.votes[p.ID] = "mirror"
	if winner := r.winningVoteLocked(); winner != "mirror" {
		t.Fatalf("expected mirror to win vote, got %s", winner)
	}
}

func TestTurboTiltTracksEliminationAndReplayAreBounded(t *testing.T) {
	for _, track := range []string{"neon", "glacier", "volcano", "space"} {
		obstacles := buildTurboTiltObstacles("RACE", 2, track, "wild")
		if len(obstacles) < 20 {
			t.Fatalf("track %s generated too few obstacles", track)
		}
	}
	r := &partyRoom{phase: "racing", heat: 1, totalHeats: 5, settings: partySettings{Mode: "elimination"}, players: make(map[string]*partyPlayer)}
	for index, distance := range []float64{300, 200, 100} {
		id := "r-" + strconvItoa(index)
		r.players[id] = &partyPlayer{ID: id, Active: true, Distance: distance}
	}
	r.finishHeatLocked(500000)
	if r.remainingRacersLocked() != 2 || r.phase != "intermission" {
		t.Fatalf("elimination should remove one racer per heat: %#v", r.snapshotLocked(""))
	}
	for index := 0; index < 45; index++ {
		r.captureReplayLocked(int64(index))
	}
	if len(r.replayFrames) != 30 {
		t.Fatalf("photo finish replay grew beyond bound: %d", len(r.replayFrames))
	}
}

func TestTurboTiltSurvivalRelayTeamsAndOvercharge(t *testing.T) {
	now := int64(90000)
	p1 := &partyPlayer{ID: "r-a", Name: "Alpha", Active: true, Connected: true, Team: 0, X: 0, Distance: 6, HitObstacleIDs: make(map[string]bool), HitRouteIDs: make(map[string]bool), Gadget: "overcharge", GadgetAvailable: true}
	p2 := &partyPlayer{ID: "r-b", Name: "Beta", Active: true, Connected: true, Team: 0, HitObstacleIDs: make(map[string]bool), HitRouteIDs: make(map[string]bool)}
	p3 := &partyPlayer{ID: "r-c", Name: "Gamma", Active: true, Connected: true, Team: 1, HitObstacleIDs: make(map[string]bool), HitRouteIDs: make(map[string]bool)}
	r := &partyRoom{
		phase: "racing", raceStartedAt: now, phaseEndsAt: now + 45000, sharedHealth: 2,
		settings: partySettings{Mode: "survival"}, track: "neon",
		players:   map[string]*partyPlayer{p1.ID: p1, p2.ID: p2, p3.ID: p3},
		obstacles: []partyObstacle{{ID: "barrier-1", Kind: "barrier", X: 0, Width: 0.4, Distance: 5}},
	}
	r.resolveObstaclesLocked(p1, 0, now)
	if r.sharedHealth != 1 || p1.BarrierHits != 1 {
		t.Fatalf("survival barrier should consume shared health: health=%d hits=%d", r.sharedHealth, p1.BarrierHits)
	}

	r.settings.Mode = "relay"
	r.updateRelayDriversLocked(now)
	if !p1.Driving || p2.Driving || !p3.Driving {
		t.Fatalf("relay should choose the stable first connected driver per team: a=%v b=%v c=%v", p1.Driving, p2.Driving, p3.Driving)
	}
	r.updateRelayDriversLocked(now + 8000)
	if p1.Driving || !p2.Driving || !p3.Driving {
		t.Fatalf("relay should hand team zero to its next driver: a=%v b=%v c=%v", p1.Driving, p2.Driving, p3.Driving)
	}

	r.settings.Mode = "teams"
	p1.Points, p2.Points, p3.Points = 10, 6, 8
	snapshot := r.snapshotLocked("")
	teamScores, ok := snapshot["teamScores"].([]int)
	if !ok || len(teamScores) != 2 || teamScores[0] != 16 || teamScores[1] != 8 {
		t.Fatalf("team score aggregation was incorrect: %#v", snapshot["teamScores"])
	}

	r.applyGadgetInputLocked(p1, "use", "", now)
	if p1.OverchargeUntil != now+1750 || p1.BoostsUsed != 1 || r.totalBoosts != 1 || p1.GadgetAvailable {
		t.Fatalf("overcharge should be a counted one-use boost: %#v", p1)
	}
}

func TestTurboTiltThreeHeatScoringAndLateJoin(t *testing.T) {
	now := int64(200000)
	r := &partyRoom{
		roomID: "RACE", gameKey: turboTiltGameKey, phase: "racing", heat: 1, totalHeats: 3,
		players: make(map[string]*partyPlayer), tokenToPlayer: make(map[string]string),
	}
	for index, distance := range []float64{500, 450, 400} {
		id := "r-" + strconvItoa(index+1)
		r.players[id] = &partyPlayer{ID: id, Name: id, Active: true, Connected: true, Distance: distance, HitObstacleIDs: make(map[string]bool)}
	}
	r.finishHeatLocked(now)
	if r.phase != "intermission" || r.players["r-1"].Points != 10 || r.players["r-3"].Points != 6 {
		t.Fatalf("unexpected first heat scoring: %#v", r.snapshotLocked(""))
	}
	late := &partyPlayer{ID: "r-late", Name: "Late", Connected: true, Active: true, Points: 0, HitObstacleIDs: make(map[string]bool)}
	r.players[late.ID] = late
	r.heat = 2
	r.startCountdownLocked(now)
	if !late.Active || late.Points != 0 {
		t.Fatal("late player did not enter the next heat at zero cumulative points")
	}
	for heat := 2; heat <= 3; heat++ {
		r.heat = heat
		r.phase = "racing"
		for index, p := range r.rankedPlayersLocked(false) {
			p.Distance = float64(1000 - index*50)
			p.Active = true
		}
		r.finishHeatLocked(now + int64(heat)*partyHeatMs)
	}
	if r.phase != "podium" || r.heat != 3 {
		t.Fatalf("expected final podium after three heats, got %s heat %d", r.phase, r.heat)
	}
}

func TestPartyCapacityAndExpiration(t *testing.T) {
	now := nowMillis()
	r := &partyRoom{phase: "lobby", lastActive: now - partyLobbyExpirationMs - 1}
	if !r.shouldExpire(now) {
		t.Fatal("stale lobby should expire")
	}
	r.phase = "podium"
	r.endedAt = now - partyEndedRetentionMs - 1
	if !r.shouldExpire(now) {
		t.Fatal("old podium should expire")
	}
}

func TestPartyRoomCapacityCodesAndRematch(t *testing.T) {
	h := newHub()
	for index := 0; index < partyMaxRooms; index++ {
		h.partyRooms["room-"+strconvItoa(index)] = &partyRoom{}
	}
	if _, ok := h.createPartyRoom(turboTiltGameKey); ok {
		t.Fatal("server should reject room creation at capacity")
	}

	seen := make(map[string]bool)
	for index := 0; index < 512; index++ {
		code := randomPartyCode()
		if sanitizePartyRoomID(code) != code {
			t.Fatalf("generated invalid room code %q", code)
		}
		seen[code] = true
	}
	if len(seen) < 500 {
		t.Fatalf("room code generator produced too many collisions: %d unique", len(seen))
	}

	now := nowMillis()
	host := &client{id: "host", role: "host", send: make(chan []byte, 8)}
	r := &partyRoom{
		roomID: "RACE", gameKey: turboTiltGameKey, phase: "podium", heat: 3, totalHeats: 3,
		host: host, players: make(map[string]*partyPlayer), tokenToPlayer: make(map[string]string), endedAt: now,
	}
	host.partyRoom = r
	for index := 0; index < 2; index++ {
		id := "r-" + strconvItoa(index)
		r.players[id] = &partyPlayer{ID: id, Connected: true, Points: 20, BoostsUsed: 4, HitObstacleIDs: make(map[string]bool)}
	}
	r.applyHostActionLocked("start", now, host)
	if r.phase != "countdown" || r.heat != 1 || r.endedAt != 0 {
		t.Fatalf("rematch did not restart the room: phase=%s heat=%d endedAt=%d", r.phase, r.heat, r.endedAt)
	}
	for _, player := range r.players {
		if player.Points != 0 || player.BoostsUsed != 0 {
			t.Fatal("rematch did not reset cumulative round state")
		}
	}
}

func TestPartyReconnectResetsSequenceAndRateLimitsSteering(t *testing.T) {
	now := nowMillis()
	c := &client{id: "player", role: "player", playerID: "r-one", send: make(chan []byte, 8)}
	p := &partyPlayer{
		ID: "r-one", Token: "secret", Client: c, Connected: true, Active: true,
		LastSeq: 40, LastSteerAt: now, HitObstacleIDs: make(map[string]bool),
	}
	r := &partyRoom{
		roomID: "RACE", gameKey: turboTiltGameKey, phase: "racing", players: map[string]*partyPlayer{p.ID: p},
		tokenToPlayer: map[string]string{p.Token: p.ID},
	}
	c.partyRoom = r
	reconnected := &client{id: "replacement", send: make(chan []byte, 8)}
	r.attachPlayer(reconnected, "", p.Token)
	if p.LastSeq != 0 || p.LastSteerAt != 0 || p.Client != reconnected {
		t.Fatal("reconnect did not reset connection-scoped input sequence state")
	}

	r.applyInput(reconnected, inputEnvelope{Seq: 1, Input: json.RawMessage(`{"type":"steer","value":0.5}`)})
	r.applyInput(reconnected, inputEnvelope{Seq: 2, Input: json.RawMessage(`{"type":"steer","value":1}`)})
	errorPayload := readQueuedEnvelope(t, reconnected.send)
	if stringField(errorPayload, "code") != "rate_limited" {
		t.Fatalf("expected stable rate_limited error, got %#v", errorPayload)
	}
}

func readQueuedEnvelope(t *testing.T, queue <-chan []byte) map[string]any {
	t.Helper()
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	for {
		select {
		case raw := <-queue:
			var message struct {
				Type    string         `json:"type"`
				Payload map[string]any `json:"payload"`
			}
			if err := json.Unmarshal(raw, &message); err != nil {
				t.Fatal(err)
			}
			if message.Type == "error" {
				return message.Payload
			}
		case <-deadline.C:
			t.Fatal("timed out waiting for queued envelope")
		}
	}
}

func readPartyEnvelope(t *testing.T, conn *websocket.Conn, wanted string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		_ = conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
		_, raw, err := conn.ReadMessage()
		if err != nil {
			continue
		}
		var msg struct {
			Type    string         `json:"type"`
			GameID  string         `json:"gameId"`
			Payload map[string]any `json:"payload"`
		}
		if err := json.Unmarshal(raw, &msg); err != nil {
			t.Fatal(err)
		}
		if msg.Type == wanted {
			if msg.GameID != partyGameID {
				t.Fatalf("party response used gameId %q", msg.GameID)
			}
			return msg.Payload
		}
	}
	t.Fatalf("timed out waiting for %s", wanted)
	return nil
}

func readPartyState(t *testing.T, conn *websocket.Conn) map[string]any {
	payload := readPartyEnvelope(t, conn, "state")
	state, ok := payload["state"].(map[string]any)
	if !ok {
		t.Fatalf("state payload missing state object: %#v", payload)
	}
	return state
}

func stringField(source map[string]any, key string) string {
	value, _ := source[key].(string)
	return value
}

func waitFor(t *testing.T, timeout time.Duration, predicate func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if predicate() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for condition")
}
