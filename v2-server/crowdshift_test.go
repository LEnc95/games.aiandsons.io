package main

import "testing"

func TestCrowdShiftScoringRules(t *testing.T) {
	tests := []struct {
		name       string
		rule       string
		choices    map[string]string
		winnerSide string
		points     map[string]int
	}{
		{name: "majority", rule: "majority", choices: map[string]string{"a": "left", "b": "left", "c": "right"}, winnerSide: "left", points: map[string]int{"a": 1000, "b": 1000, "c": 0}},
		{name: "minority", rule: "minority", choices: map[string]string{"a": "left", "b": "left", "c": "right"}, winnerSide: "right", points: map[string]int{"a": 0, "b": 0, "c": 1200}},
		{name: "split", rule: "split", choices: map[string]string{"a": "left", "b": "left", "c": "right"}, winnerSide: "both", points: map[string]int{"a": 1000, "b": 1000, "c": 1000}},
		{name: "unanimous", rule: "unanimous", choices: map[string]string{"a": "right", "b": "right", "c": "right"}, winnerSide: "both", points: map[string]int{"a": 1500, "b": 1500, "c": 1500}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			r := crowdShiftTestRoom()
			r.crowd.Rule = test.rule
			r.crowd.Choices = test.choices
			r.scoreCrowdShiftRoundLocked()
			if r.crowd.WinnerSide != test.winnerSide {
				t.Fatalf("winner side = %q, want %q", r.crowd.WinnerSide, test.winnerSide)
			}
			for id, want := range test.points {
				if got := r.players[id].HeatPoints; got != want {
					t.Fatalf("player %s received %d points, want %d", id, got, want)
				}
			}
		})
	}
}

func TestCrowdShiftChoicesStaySecretUntilReveal(t *testing.T) {
	r := crowdShiftTestRoom()
	r.phase = "choosing"
	r.crowd.Choices = map[string]string{"a": "left", "b": "right"}
	host := r.crowdShiftSnapshotLocked("")
	for _, player := range host["players"].([]map[string]any) {
		if player["choice"] != "" {
			t.Fatalf("host snapshot leaked a choice before reveal: %#v", player)
		}
		if player["hasChosen"] != true && (player["id"] == "a" || player["id"] == "b") {
			t.Fatalf("host should receive submission status without the choice: %#v", player)
		}
	}
	playerState := r.crowdShiftSnapshotLocked("a")
	for _, player := range playerState["players"].([]map[string]any) {
		if player["id"] == "a" && player["choice"] != "left" {
			t.Fatalf("player did not receive their own choice: %#v", player)
		}
		if player["id"] == "b" && player["choice"] != "" {
			t.Fatalf("player saw another player's secret choice: %#v", player)
		}
	}
	r.phase = "reveal"
	reveal := r.crowdShiftSnapshotLocked("")
	for _, player := range reveal["players"].([]map[string]any) {
		if (player["id"] == "a" || player["id"] == "b") && player["choice"] == "" {
			t.Fatalf("reveal snapshot omitted a submitted choice: %#v", player)
		}
	}
}

func TestCrowdShiftHostLifecycleAndLatePlayer(t *testing.T) {
	now := int64(10000)
	r := crowdShiftTestRoom()
	host := &client{id: "host", role: "host", send: make(chan []byte, 8)}
	r.host = host
	host.partyRoom = r
	r.applyCrowdShiftHostActionLocked("start", now, host)
	if r.phase != "countdown" || r.crowd.Round != 1 {
		t.Fatalf("start did not open round one: phase=%s round=%d", r.phase, r.crowd.Round)
	}
	r.stepCrowdShiftLocked(r.phaseEndsAt)
	if r.phase != "choosing" || r.crowd.Prompt.ID == "" {
		t.Fatalf("countdown did not reveal a prompt: %#v", r.crowd)
	}
	r.crowd.Choices = map[string]string{"a": "left", "b": "right", "c": "left"}
	r.stepCrowdShiftLocked(r.crowd.RoundStartedAt + partyPhaseDuration(crowdShiftMinimumChoiceMs))
	if r.phase != "reveal" || r.crowd.LeftCount != 2 || r.crowd.RightCount != 1 {
		t.Fatalf("submitted choices did not reveal: phase=%s left=%d right=%d", r.phase, r.crowd.LeftCount, r.crowd.RightCount)
	}
	r.players["late"] = &partyPlayer{ID: "late", Name: "Late", Connected: true, Queued: true}
	r.phase = "intermission"
	r.phaseEndsAt = now
	r.stepCrowdShiftLocked(now)
	if r.crowd.Round != 2 || r.players["late"].Queued || !r.players["late"].Active {
		t.Fatalf("late player did not enter the next round: %#v", r.players["late"])
	}
	r.crowd.Round = r.crowd.TotalRounds
	r.finishCrowdShiftMatchLocked(now)
	if r.phase != "podium" || r.endedAt != now {
		t.Fatalf("final round did not reach podium: phase=%s endedAt=%d", r.phase, r.endedAt)
	}
}

func TestPartySupportsBothReleasedGames(t *testing.T) {
	if !isSupportedPartyGame(turboTiltGameKey) || !isSupportedPartyGame(crowdShiftGameKey) || isSupportedPartyGame("unknown") {
		t.Fatal("party game allowlist is incorrect")
	}
}

func TestCrowdShiftPausesUntilHostReconnects(t *testing.T) {
	r := crowdShiftTestRoom()
	r.phase = "choosing"
	r.phaseEndsAt = nowMillis() + 5000
	r.hostToken = "host-secret"
	host := &client{id: "host", role: "host", send: make(chan []byte, 8), partyRoom: r}
	r.host = host

	r.removeClient(host)
	if r.phase != "paused" || r.pauseReason != "host_disconnected" || r.resumePhase != "choosing" {
		t.Fatalf("host disconnect did not pause Crowd Shift: phase=%s reason=%s before=%s", r.phase, r.pauseReason, r.resumePhase)
	}

	reconnected := &client{id: "host-2", send: make(chan []byte, 8)}
	r.attachHost(reconnected, "host-secret")
	if r.phase != "choosing" || r.host != reconnected || r.hostDisconnectedAt != 0 {
		t.Fatalf("host reconnect did not resume Crowd Shift: phase=%s host=%v disconnectedAt=%d", r.phase, r.host == reconnected, r.hostDisconnectedAt)
	}
}

func crowdShiftTestRoom() *partyRoom {
	players := map[string]*partyPlayer{
		"a": {ID: "a", Name: "Alpha", Connected: true, Active: true},
		"b": {ID: "b", Name: "Beta", Connected: true, Active: true},
		"c": {ID: "c", Name: "Gamma", Connected: true, Active: true},
	}
	return &partyRoom{
		gameKey: crowdShiftGameKey, roomID: "TEST", phase: "lobby",
		players: players, displays: make(map[string]*client), tokenToPlayer: make(map[string]string),
		crowd: newCrowdShiftState(),
	}
}
