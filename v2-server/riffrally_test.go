package main

import "testing"

func newRiffTestRoom() *partyRoom {
	return &partyRoom{
		gameKey: riffRallyGameKey, roomID: "RIFF", phase: "racing",
		players: map[string]*partyPlayer{
			"p1": {ID: "p1", Name: "One", Connected: true, Active: true},
			"p2": {ID: "p2", Name: "Two", Connected: true, Active: true},
		},
		riff: &riffRallyState{
			StartAt: 1000,
			Notes:   []riffNote{{ID: 0, At: 1500, Lane: 2}, {ID: 1, At: 2000, Lane: 1}},
			Results: map[string]*riffPlayerScore{"p1": {}, "p2": {}}, Played: map[string]bool{},
		},
	}
}

func TestRiffRallyAuthoritativeHitsAndDuplicateProtection(t *testing.T) {
	r := newRiffTestRoom()
	p := r.players["p1"]
	r.applyRiffRallyPlayerInputLocked(p, partyInput{Type: "riff_hit", NoteID: 0, Lane: 2}, 1500, nil)
	if got := r.riff.Results[p.ID]; got.Score != 100 || got.Hits != 1 || got.Perfect != 1 || got.Streak != 1 || got.LastBase != 100 || got.LastBonus != 0 || got.LastAward != 100 {
		t.Fatalf("perfect hit not scored: %+v", got)
	}
	r.applyRiffRallyPlayerInputLocked(p, partyInput{Type: "riff_hit", NoteID: 0, Lane: 2}, 1500, nil)
	if got := r.riff.Results[p.ID]; got.Score != 100 || got.Hits != 1 {
		t.Fatalf("duplicate hit awarded points: %+v", got)
	}
	r.applyRiffRallyPlayerInputLocked(p, partyInput{Type: "riff_hit", NoteID: 1, Lane: 3}, 2000, nil)
	if got := r.riff.Results[p.ID]; got.Score != 100 || got.Misses != 1 || got.Streak != 0 || got.LastAward != 0 || got.LastAt != 2000 {
		t.Fatalf("wrong lane did not break streak: %+v", got)
	}
}

func TestRiffRallyReportsTimingAndStreakAward(t *testing.T) {
	r := newRiffTestRoom()
	p := r.players["p1"]
	r.applyRiffRallyPlayerInputLocked(p, partyInput{Type: "riff_hit", NoteID: 0, Lane: 2}, 1500, nil)
	r.applyRiffRallyPlayerInputLocked(p, partyInput{Type: "riff_hit", NoteID: 1, Lane: 1}, 2100, nil)
	s := r.riff.Results[p.ID]
	if s.Score != 162 || s.Hits != 2 || s.LastResult != "GOOD" || s.LastBase != 60 || s.LastBonus != 2 || s.LastAward != 62 {
		t.Fatalf("score breakdown does not match awarded points: %+v", s)
	}
	self := r.riffRallySnapshotLocked("p1")["selfResult"].(map[string]any)
	if self["lastBase"] != 60 || self["lastBonus"] != 2 || self["lastAward"] != 62 {
		t.Fatalf("private snapshot lost score breakdown: %#v", self)
	}
	if _, ok := r.riffRallySnapshotLocked("")["selfResult"]; ok {
		t.Fatal("host snapshot included private score feedback")
	}
}

func TestRiffRallyRejectsEarlyLateAndInvalidInputs(t *testing.T) {
	r := newRiffTestRoom()
	p := r.players["p1"]
	r.applyRiffRallyPlayerInputLocked(p, partyInput{Type: "riff_hit", NoteID: 0, Lane: 2}, 1200, nil)
	r.applyRiffRallyPlayerInputLocked(p, partyInput{Type: "riff_hit", NoteID: 0, Lane: 2}, 1800, nil)
	r.applyRiffRallyPlayerInputLocked(p, partyInput{Type: "riff_hit", NoteID: 7, Lane: 2}, 1500, nil)
	r.applyRiffRallyPlayerInputLocked(p, partyInput{Type: "riff_hit", NoteID: 0, Lane: 4}, 1500, nil)
	if got := r.riff.Results[p.ID]; got.Score != 0 || got.Hits != 0 || len(r.riff.Played) != 0 {
		t.Fatalf("invalid timing or lane changed state: %+v, played=%v", got, r.riff.Played)
	}
}

func TestRiffRallyMissesExpiredNotesAndHidesPrivateFeedback(t *testing.T) {
	r := newRiffTestRoom()
	r.riff.NextMiss = 0
	r.stepRiffRallyLocked(1691)
	if r.riff.Results["p1"].Misses != 1 || r.riff.Results["p2"].Misses != 1 {
		t.Fatalf("expired note was not missed by both players: %+v", r.riff.Results)
	}
	if r.riff.Results["p1"].LastAt != 1691 || r.riff.Results["p1"].LastResult != "MISS" || r.riff.Results["p1"].LastAward != 0 {
		t.Fatalf("expired note did not produce timely miss feedback: %+v", r.riff.Results["p1"])
	}
	r.riff.Results["p1"].LastResult = "PERFECT"
	opponent := r.riffRallySnapshotLocked("p2")
	players := opponent["players"].([]map[string]any)
	for _, player := range players {
		if player["id"] == "p1" && player["lastResult"] != "" {
			t.Fatalf("opponent feedback leaked in snapshot: %#v", player)
		}
	}
	if _, ok := opponent["selfResult"]; !ok {
		t.Fatal("player snapshot omitted its own feedback")
	}
}

func TestRiffRallyStartsFromPartyRotationAndSharesTiedPlacement(t *testing.T) {
	r := &partyRoom{
		gameKey: partyRotationGameKey, roomID: "RIFF", sessionMode: partyRotationSessionMode,
		partyPhase: "next_up", activity: partyActivity{ID: "riffrally:classic", GameKey: riffRallyGameKey, ModeKey: "classic", Label: "Riff Rally · Setlist"},
		partyConfig: defaultPartySessionSettings(), players: map[string]*partyPlayer{
			"p1": {ID: "p1", Name: "One", Connected: true},
			"p2": {ID: "p2", Name: "Two", Connected: true},
		},
	}
	r.startRotationActivityLocked(1000)
	if r.gameKey != riffRallyGameKey || r.riff == nil || r.phase != "countdown" || r.partyPhase != "activity" {
		t.Fatalf("rotation did not enter Riff Rally: game=%s phase=%s riff=%v", r.gameKey, r.phase, r.riff)
	}
	for _, p := range r.players {
		p.Points = 500
	}
	r.completeRotationActivityLocked(2000)
	if r.players["p1"].PartyAward != r.players["p2"].PartyAward || r.players["p1"].ActivityWins != 1 || r.players["p2"].ActivityWins != 1 {
		t.Fatalf("tied activity did not share placement: %+v / %+v", r.players["p1"], r.players["p2"])
	}
}
