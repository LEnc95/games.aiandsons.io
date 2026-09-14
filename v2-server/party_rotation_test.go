package main

import (
	"encoding/json"
	"testing"
)

func rotationTestRoom(playerCount int) *partyRoom {
	r := &partyRoom{
		roomID: "VOTE", gameKey: partyRotationGameKey, sessionMode: partyRotationSessionMode,
		partyPhase: "party_lobby", phase: "lobby", players: make(map[string]*partyPlayer),
		displays: make(map[string]*client), tokenToPlayer: make(map[string]string), votes: make(map[string]string),
		settings: partySettings{Mode: "classic", Heats: 3, Chaos: "standard", TrackRotation: "all"},
	}
	for index := 0; index < playerCount; index++ {
		id := "p" + strconvItoa(index+1)
		r.players[id] = &partyPlayer{ID: id, Name: "Player " + strconvItoa(index+1), Color: partyPlayerColor(index), Avatar: partyPlayerAvatar("", index), Connected: true, Active: true, Team: index % 2}
	}
	return r
}

func TestPartyRotationOptionsRespectCountsAndAvoidRepeat(t *testing.T) {
	two := rotationTestRoom(2)
	options := two.partyOptionsLocked(2)
	if len(options) != 3 {
		t.Fatalf("two-player slate has %d options, want 3", len(options))
	}
	for _, option := range options {
		if option.GameKey == crowdShiftGameKey && option.ModeKey != "duel" {
			t.Fatalf("two-player slate included ineligible crowd mode: %#v", option)
		}
	}
	four := rotationTestRoom(4)
	first := four.partyOptionsLocked(4)
	if len(first) != 3 {
		t.Fatalf("four-player slate has %d options, want 3", len(first))
	}
	four.lastActivityID = first[0].ID
	second := four.partyOptionsLocked(4)
	for _, option := range second {
		if option.ID == four.lastActivityID || option.ModeKey == "duel" {
			t.Fatalf("slate included repeat or duel for four players: %#v", option)
		}
	}
}

func TestPartyRotationVisibleBallotsAndWeightedSlices(t *testing.T) {
	r := rotationTestRoom(3)
	now := int64(1000)
	r.beginPartyVoteLocked(now)
	optionA, optionB := r.partyVote.Options[0].ID, r.partyVote.Options[1].ID
	r.partyVote.Votes["p1"] = optionA
	r.partyVote.Votes["p2"] = optionA
	r.partyVote.Votes["p3"] = optionB
	snapshot := r.partyVoteSnapshotLocked()
	ballots := snapshot["ballots"].([]map[string]any)
	if len(ballots) != 3 || ballots[0]["playerName"] == "" || ballots[0]["playerAvatar"] == "" {
		t.Fatalf("expected three named visible ballots, got %#v", ballots)
	}
	rotation := r.rotationSnapshotLocked("p1")
	if rotation["players"].([]map[string]any)[0]["avatar"] == "" {
		t.Fatalf("rotation snapshot omitted player avatar: %#v", rotation["players"])
	}
	r.closePartyVoteLocked(now + partyVoteMinimumMs)
	if r.partyPhase != "spinning" || r.activity.ID == "" {
		t.Fatalf("vote did not select an activity: phase=%s activity=%#v", r.partyPhase, r.activity)
	}
	if r.partyVote.WinnerOptionID != optionA && r.partyVote.WinnerOptionID != optionB {
		t.Fatalf("wheel selected outside player ballot slices: %s", r.partyVote.WinnerOptionID)
	}
}

func TestPartyRotationNoVoteFallbackAndActivityStart(t *testing.T) {
	r := rotationTestRoom(2)
	now := int64(2000)
	r.beginPartyVoteLocked(now)
	r.closePartyVoteLocked(now + partyVoteMs)
	if r.partyVote.WinnerOptionID == "" || r.partyVote.SelectedBallotID[:8] != "neutral:" {
		t.Fatalf("no-vote fallback was not neutral: %#v", r.partyVote)
	}
	r.partyPhase = "next_up"
	r.startRotationActivityLocked(now + partySpinMs + partyNextUpMs)
	if r.partyPhase != "activity" || (r.gameKey != turboTiltGameKey && r.gameKey != crowdShiftGameKey) || r.phase != "countdown" {
		t.Fatalf("selected activity did not start: party=%s game=%s phase=%s", r.partyPhase, r.gameKey, r.phase)
	}
	if r.gameKey == crowdShiftGameKey && !r.crowd.Duel {
		t.Fatal("two-player Crowd Shift activity did not start Duel Shift")
	}
}

func TestPartyRotationAwardsNormalizedPersistentStandings(t *testing.T) {
	r := rotationTestRoom(3)
	r.partyPhase = "activity"
	r.gameKey = turboTiltGameKey
	r.activity = partyActivityCatalog[0]
	r.players["p1"].Points, r.players["p2"].Points, r.players["p3"].Points = 8, 20, 12
	r.completeRotationActivityLocked(5000)
	if r.players["p2"].PartyPoints != 10 || r.players["p3"].PartyPoints != 8 || r.players["p1"].PartyPoints != 6 {
		t.Fatalf("unexpected normalized awards: %d/%d/%d", r.players["p1"].PartyPoints, r.players["p2"].PartyPoints, r.players["p3"].PartyPoints)
	}
	if r.players["p2"].ActivityWins != 1 || r.players["p2"].PartyRank != 1 || r.partyPhase != "results" {
		t.Fatalf("persistent standings were not finalized: %#v", r.players["p2"])
	}
	r.beginPartyVoteLocked(6000)
	if r.players["p2"].PartyPoints != 10 || r.players["p2"].PartyAward != 0 {
		t.Fatal("new vote reset persistent points or retained the old award")
	}
}

func TestPartyRotationSkipAndEnd(t *testing.T) {
	r := rotationTestRoom(2)
	r.activity = partyActivityCatalog[0]
	r.partyPhase = "activity"
	r.skipRotationActivityLocked(7000)
	if !r.activitySkipped || r.partyPhase != "results" || r.players["p1"].PartyPoints != 0 {
		t.Fatal("skip should show results without awarding points")
	}
	r.partyPhase = "voting"
	r.applyRotationHostActionLocked("end", 8000, &client{})
	if r.partyPhase != "ended" || r.phase != "party_podium" || r.endedAt != 8000 {
		t.Fatalf("end did not produce final party podium: %#v", r)
	}
}

func TestPartyPlayAgainKeepsRoomAndResetsSession(t *testing.T) {
	r := rotationTestRoom(2)
	r.partyConfig = defaultPartySessionSettings()
	r.partyConfig.DurationPreset = "quick"
	r.partyConfig.TargetActivities = 3
	r.locked = true
	r.activityIndex = 3
	r.activityHistory = []string{"turbotilt:classic", "crowdshift:duel"}
	r.lastActivityID = "crowdshift:duel"
	for _, p := range r.players {
		p.Ready = true
		p.PartyPoints = 18
		p.ActivityWins = 2
		p.PartyAward = 8
	}
	r.finishPartyLocked(1000)
	r.applyRotationHostActionLocked("play_again", 2000, &client{})
	if r.partyPhase != "party_lobby" || r.phase != "lobby" || r.gameKey != partyRotationGameKey || r.endedAt != 0 {
		t.Fatalf("play again did not restore the party lobby: %#v", r)
	}
	if r.activityIndex != 0 || len(r.activityHistory) != 0 || r.lastActivityID != "" || !r.locked || r.partyConfig.DurationPreset != "quick" {
		t.Fatalf("play again reset room settings or kept old activity progress: %#v", r)
	}
	for _, p := range r.players {
		if p.Ready || p.PartyPoints != 0 || p.ActivityWins != 0 || p.PartyAward != 0 || !p.Active {
			t.Fatalf("play again did not reset player session state: %#v", p)
		}
	}
	r.applyRotationHostActionLocked("start", 3000, &client{})
	if r.partyPhase != "voting" {
		t.Fatalf("reused room could not start another party: %#v", r)
	}
}

func TestPartyPlayAgainCannotInterruptActiveSession(t *testing.T) {
	r := rotationTestRoom(2)
	r.partyPhase = "voting"
	r.phase = "voting"
	r.activityIndex = 1
	r.players["p1"].PartyPoints = 10
	c := &client{send: make(chan []byte, 1)}
	r.applyRotationHostActionLocked("play_again", 2000, c)
	if r.partyPhase != "voting" || r.activityIndex != 1 || r.players["p1"].PartyPoints != 10 {
		t.Fatalf("play again interrupted an active session: %#v", r)
	}
}

func TestPartySessionSettingsValidateFilterAndExtendTimers(t *testing.T) {
	settings, ok := validatePartySessionSettings(partySessionSettings{
		Version: 1, DurationPreset: "quick", PlayStyle: "cooperative", AccessibilityPreset: "family",
		ExtendedTimers: true, Effects: true, Narration: true, Haptics: true,
	})
	if !ok || settings.TargetActivities != 3 {
		t.Fatalf("quick preset did not validate with a three-activity target: %#v, %v", settings, ok)
	}
	if !settings.ExtendedTimers || !settings.HighContrast || settings.ReducedMotion {
		t.Fatalf("family accessibility preset was not normalized server-side: %#v", settings)
	}
	if _, ok := validatePartySessionSettings(partySessionSettings{Version: 1, DurationPreset: "forever", PlayStyle: "mixed", AccessibilityPreset: "standard"}); ok {
		t.Fatal("unsupported duration preset should be rejected")
	}

	r := rotationTestRoom(4)
	r.partyConfig = settings
	for _, option := range r.partyOptionsLocked(4) {
		if option.Style != "cooperative" {
			t.Fatalf("cooperative party included %q activity: %#v", option.Style, option)
		}
	}
	if got := r.rotationDurationLocked(100); got != 150 {
		t.Fatalf("extended rotation timer = %d, want 150", got)
	}
	if got := r.partyDurationLocked(100); got != 150 {
		t.Fatalf("extended activity timer = %d, want 150", got)
	}
}

func TestPartyDurationPresetFinishesAtTarget(t *testing.T) {
	r := rotationTestRoom(2)
	r.partyConfig = partySessionSettings{Version: 1, DurationPreset: "quick", PlayStyle: "mixed", AccessibilityPreset: "standard", Effects: true, Narration: true, Haptics: true}
	r.partyPhase = "results"
	r.phase = "podium"
	r.activityIndex = 3
	r.phaseEndsAt = 1000
	r.stepRotationLocked(1000, 0)
	if r.partyPhase != "ended" || r.phase != "party_podium" || r.endedAt != 1000 {
		t.Fatalf("quick party did not end after three activities: phase=%s gamePhase=%s endedAt=%d", r.partyPhase, r.phase, r.endedAt)
	}
}

func TestPartyActivityPoolRepeatRulesAndCatchUp(t *testing.T) {
	r := rotationTestRoom(2)
	r.partyConfig = defaultPartySessionSettings()
	r.partyConfig.EnabledActivities = []string{"turbotilt:classic", "turbotilt:survival"}
	r.partyConfig.RepeatAvoidance = "session"
	r.activityHistory = []string{"turbotilt:classic"}
	options := r.partyOptionsLocked(2)
	if len(options) != 1 || options[0].ID != "turbotilt:survival" {
		t.Fatalf("activity pool or session repeat rule was ignored: %#v", options)
	}

	r.activity = partyActivityCatalog[0]
	r.gameKey = turboTiltGameKey
	r.partyPhase = "activity"
	r.players["p1"].PartyPoints = 10
	r.players["p1"].Points = 5
	r.players["p2"].Points = 10
	r.completeRotationActivityLocked(9000)
	if r.players["p2"].PartyAward != 12 {
		t.Fatalf("trailing winner did not receive gentle catch-up bonus: %#v", r.players["p2"])
	}
}

func TestPartySelectionMethodsAndHostChoice(t *testing.T) {
	r := rotationTestRoom(3)
	r.partyConfig = defaultPartySessionSettings()
	r.partyConfig.SelectionMethod = "majority"
	r.beginPartyVoteLocked(1000)
	first, second := r.partyVote.Options[0].ID, r.partyVote.Options[1].ID
	r.partyVote.Votes["p1"], r.partyVote.Votes["p2"], r.partyVote.Votes["p3"] = first, first, second
	r.closePartyVoteLocked(2000)
	if r.partyVote.WinnerOptionID != first {
		t.Fatalf("majority selection chose %q, want %q", r.partyVote.WinnerOptionID, first)
	}

	r = rotationTestRoom(2)
	r.partyConfig = defaultPartySessionSettings()
	r.partyConfig.SelectionMethod = "host"
	r.beginPartyVoteLocked(3000)
	choice := r.partyVote.Options[1].ID
	if !r.selectPartyActivityLocked(choice, 4000, "host") || r.partyVote.WinnerOptionID != choice || r.partyPhase != "spinning" {
		t.Fatalf("host selection did not start the wheel: %#v", r.partyVote)
	}
}

func TestPartyLobbyReadyStateIsAuthoritative(t *testing.T) {
	r := rotationTestRoom(2)
	p := r.players["p1"]
	c := &client{id: "ready", role: "player", playerID: p.ID, partyRoom: r, send: make(chan []byte, 4)}
	p.Client = c
	r.applyInput(c, inputEnvelope{Seq: 1, Input: json.RawMessage(`{"type":"party_ready","ready":true}`)})
	if !p.Ready {
		t.Fatal("player ready input did not update server state")
	}
	state := r.decorateRoomControlsLocked(r.rotationSnapshotLocked(p.ID))
	if state["readyCount"] != 1 {
		t.Fatalf("ready count missing from snapshot: %#v", state)
	}
	players := state["players"].([]map[string]any)
	found := false
	for _, player := range players {
		if player["id"] == p.ID {
			found = player["ready"] == true
		}
	}
	if !found {
		t.Fatalf("player ready state missing from snapshot: %#v", players)
	}
}
