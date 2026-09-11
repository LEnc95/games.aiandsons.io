package main

import "testing"

func rotationTestRoom(playerCount int) *partyRoom {
	r := &partyRoom{
		roomID: "VOTE", gameKey: partyRotationGameKey, sessionMode: partyRotationSessionMode,
		partyPhase: "party_lobby", phase: "lobby", players: make(map[string]*partyPlayer),
		displays: make(map[string]*client), tokenToPlayer: make(map[string]string), votes: make(map[string]string),
		settings: partySettings{Mode: "classic", Heats: 3, Chaos: "standard", TrackRotation: "all"},
	}
	for index := 0; index < playerCount; index++ {
		id := "p" + strconvItoa(index+1)
		r.players[id] = &partyPlayer{ID: id, Name: "Player " + strconvItoa(index+1), Color: partyPlayerColor(index), Connected: true, Active: true, Team: index % 2}
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
	if len(ballots) != 3 || ballots[0]["playerName"] == "" {
		t.Fatalf("expected three named visible ballots, got %#v", ballots)
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
