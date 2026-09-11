package main

import (
	cryptorand "crypto/rand"
	"hash/fnv"
	"math/big"
	"os"
	"sort"
	"strings"
)

const (
	partyRotationGameKey       = "party"
	partyRotationSessionMode   = "rotation"
	partyStandaloneSessionMode = "standalone"
	partyVoteMs                = int64(15000)
	partyVoteMinimumMs         = int64(5000)
	partySpinMs                = int64(6000)
	partyNextUpMs              = int64(3000)
	partyResultsMs             = int64(8000)
	partySkippedResultsMs      = int64(3000)
)

type partyActivity struct {
	ID          string `json:"id"`
	GameKey     string `json:"gameKey"`
	ModeKey     string `json:"modeKey"`
	Label       string `json:"label"`
	Description string `json:"description"`
	MinPlayers  int    `json:"minPlayers"`
	MaxPlayers  int    `json:"maxPlayers"`
}

type partySpin struct {
	SelectedIndex int   `json:"selectedIndex"`
	Turns         int   `json:"turns"`
	StartedAt     int64 `json:"startedAt"`
	EndsAt        int64 `json:"endsAt"`
}

type partyVoteState struct {
	Options          []partyActivity
	Votes            map[string]string
	StartedAt        int64
	ClosesAt         int64
	SelectedBallotID string
	WinnerOptionID   string
	Spin             partySpin
}

var partyActivityCatalog = []partyActivity{
	{ID: "turbotilt:classic", GameKey: turboTiltGameKey, ModeKey: "classic", Label: "Turbo Tilt · Classic", Description: "Three heats of pure tilt, dodge, and boost racing.", MinPlayers: 2, MaxPlayers: 8},
	{ID: "turbotilt:elimination", GameKey: turboTiltGameKey, ModeKey: "elimination", Label: "Turbo Tilt · Elimination", Description: "The last racer drops after each heat.", MinPlayers: 2, MaxPlayers: 8},
	{ID: "turbotilt:teams", GameKey: turboTiltGameKey, ModeKey: "teams", Label: "Turbo Tilt · Teams", Description: "Balanced squads race for a shared finish.", MinPlayers: 4, MaxPlayers: 8},
	{ID: "turbotilt:relay", GameKey: turboTiltGameKey, ModeKey: "relay", Label: "Turbo Tilt · Relay", Description: "Control passes between teammates during each heat.", MinPlayers: 4, MaxPlayers: 8},
	{ID: "turbotilt:survival", GameKey: turboTiltGameKey, ModeKey: "survival", Label: "Turbo Tilt · Survival", Description: "Protect the room's shared health through every hazard.", MinPlayers: 2, MaxPlayers: 8},
	{ID: "turbotilt:chaos", GameKey: turboTiltGameKey, ModeKey: "chaos", Label: "Turbo Tilt · Chaos", Description: "Wild modifiers change the race every ten seconds.", MinPlayers: 2, MaxPlayers: 8},
	{ID: "crowdshift:classic_mix", GameKey: crowdShiftGameKey, ModeKey: "classic_mix", Label: "Crowd Shift · Classic Mix", Description: "The scoring rule changes every round.", MinPlayers: 3, MaxPlayers: 8},
	{ID: "crowdshift:majority", GameKey: crowdShiftGameKey, ModeKey: "majority", Label: "Crowd Shift · Majority Rush", Description: "Read the room and stay with the biggest crowd.", MinPlayers: 3, MaxPlayers: 8},
	{ID: "crowdshift:minority", GameKey: crowdShiftGameKey, ModeKey: "minority", Label: "Crowd Shift · Underdog Hunt", Description: "Find the smaller side before everyone else does.", MinPlayers: 3, MaxPlayers: 8},
	{ID: "crowdshift:split", GameKey: crowdShiftGameKey, ModeKey: "split", Label: "Crowd Shift · Perfect Split", Description: "Work together to divide the room as evenly as possible.", MinPlayers: 3, MaxPlayers: 8},
	{ID: "crowdshift:unanimous", GameKey: crowdShiftGameKey, ModeKey: "unanimous", Label: "Crowd Shift · Unanimous", Description: "Everyone scores only when the whole room agrees.", MinPlayers: 3, MaxPlayers: 8},
	{ID: "crowdshift:duel", GameKey: crowdShiftGameKey, ModeKey: "duel", Label: "Crowd Shift · Duel Shift", Description: "Two rivals bluff, predict, and risk a Hot Take.", MinPlayers: 2, MaxPlayers: 2},
}

func (r *partyRoom) applyPartyVoteLocked(p *partyPlayer, optionID string, c *client) {
	if r.partyPhase != "voting" {
		c.sendErrorCode(r.roomID, "vote_closed", "Voting is not open right now.")
		return
	}
	optionID = strings.TrimSpace(optionID)
	if !r.partyVoteHasOptionLocked(optionID) {
		c.sendErrorCode(r.roomID, "invalid_vote", "Choose one of the activities on screen.")
		return
	}
	if !p.Connected {
		c.sendErrorCode(r.roomID, "ineligible_activity", "Reconnect before voting.")
		return
	}
	r.partyVote.Votes[p.ID] = optionID
}

func (r *partyRoom) applyRotationHostActionLocked(action string, now int64, c *client) {
	switch action {
	case "start":
		if r.partyPhase != "party_lobby" {
			c.sendErrorCode(r.roomID, "invalid_phase", "The party has already started.")
			return
		}
		if r.connectedPlayerCountLocked() < partyMinPlayers {
			c.sendErrorCode(r.roomID, "not_enough_players", "At least two players must be connected.")
			return
		}
		r.beginPartyVoteLocked(now)
	case "pause":
		if r.partyPhase == "party_lobby" || r.partyPhase == "ended" || r.partyPhase == "paused" {
			c.sendErrorCode(r.roomID, "invalid_phase", "The party cannot be paused right now.")
			return
		}
		r.pauseLocked("manual", now)
	case "resume":
		if r.partyPhase != "paused" {
			c.sendErrorCode(r.roomID, "invalid_phase", "The party is not paused.")
			return
		}
		r.resumeLocked(now)
	case "skip":
		if r.partyPhase != "activity" {
			c.sendErrorCode(r.roomID, "invalid_phase", "Only an active game can be skipped.")
			return
		}
		r.skipRotationActivityLocked(now)
	case "end":
		r.gameKey = partyRotationGameKey
		r.partyPhase = "ended"
		r.phase = "party_podium"
		r.phaseEndsAt = 0
		r.endedAt = now
		r.updatePartyRanksLocked()
	default:
		c.sendErrorCode(r.roomID, "unsupported_input", "That host action is not supported.")
	}
}

func (r *partyRoom) stepRotationLocked(now int64, dt float64) {
	if r.partyPhase == "paused" || r.partyPhase == "party_lobby" || r.partyPhase == "ended" {
		return
	}
	switch r.partyPhase {
	case "voting":
		if now >= r.partyVote.ClosesAt || (now-r.partyVote.StartedAt >= rotationPhaseDuration(partyVoteMinimumMs) && r.allConnectedPlayersVotedLocked()) {
			r.closePartyVoteLocked(now)
		}
	case "spinning":
		if now >= r.phaseEndsAt {
			r.partyPhase = "next_up"
			r.phase = "next_up"
			r.phaseEndsAt = now + rotationPhaseDuration(partyNextUpMs)
		}
	case "next_up":
		if now >= r.phaseEndsAt {
			r.startRotationActivityLocked(now)
		}
	case "results":
		if now >= r.phaseEndsAt {
			r.beginPartyVoteLocked(now)
		}
	case "activity":
		if r.gameKey == crowdShiftGameKey {
			r.stepCrowdShiftLocked(now)
		} else if r.gameKey == turboTiltGameKey {
			r.stepTurboTiltLocked(now, dt)
		}
	}
}

func (r *partyRoom) beginPartyVoteLocked(now int64) {
	connected := r.connectedPlayerCountLocked()
	r.gameKey = partyRotationGameKey
	r.partyPhase = "voting"
	r.phase = "voting"
	r.phaseEndsAt = now + rotationPhaseDuration(partyVoteMs)
	r.partyVote = partyVoteState{
		Options: r.partyOptionsLocked(connected), Votes: make(map[string]string),
		StartedAt: now, ClosesAt: now + rotationPhaseDuration(partyVoteMs),
	}
	r.activity = partyActivity{}
	r.activitySkipped = false
	for _, p := range r.players {
		p.Queued = false
		p.Active = p.Connected
		p.PartyAward = 0
	}
}

func (r *partyRoom) closePartyVoteLocked(now int64) {
	type ballot struct {
		ID       string
		OptionID string
	}
	ballots := make([]ballot, 0, len(r.players))
	ids := make([]string, 0, len(r.players))
	for id, p := range r.players {
		if p.Connected && r.partyVoteHasOptionLocked(r.partyVote.Votes[id]) {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	for _, id := range ids {
		ballots = append(ballots, ballot{ID: id, OptionID: r.partyVote.Votes[id]})
	}
	if len(ballots) == 0 {
		for _, option := range r.partyVote.Options {
			ballots = append(ballots, ballot{ID: "neutral:" + option.ID, OptionID: option.ID})
		}
	}
	selected := securePartyIndex(len(ballots))
	turns := 6 + securePartyIndex(3)
	r.partyVote.SelectedBallotID = ballots[selected].ID
	r.partyVote.WinnerOptionID = ballots[selected].OptionID
	r.partyVote.Spin = partySpin{SelectedIndex: selected, Turns: turns, StartedAt: now, EndsAt: now + rotationPhaseDuration(partySpinMs)}
	for _, option := range r.partyVote.Options {
		if option.ID == r.partyVote.WinnerOptionID {
			r.activity = option
			break
		}
	}
	r.partyPhase = "spinning"
	r.phase = "spinning"
	r.phaseEndsAt = now + rotationPhaseDuration(partySpinMs)
}

func (r *partyRoom) startRotationActivityLocked(now int64) {
	if r.activity.ID == "" || r.connectedPlayerCountLocked() < partyMinPlayers {
		r.beginPartyVoteLocked(now)
		return
	}
	r.activityIndex++
	r.partyPhase = "activity"
	r.partyAwarded = false
	r.activitySkipped = false
	r.gameKey = r.activity.GameKey
	for _, p := range r.players {
		p.PartyAward = 0
		p.Queued = !p.Connected
		p.Active = p.Connected
	}
	if r.gameKey == crowdShiftGameKey {
		r.startRotationCrowdShiftLocked(now)
		return
	}
	r.startRotationTurboTiltLocked(now)
}

func (r *partyRoom) startRotationTurboTiltLocked(now int64) {
	r.settings.Mode = r.activity.ModeKey
	r.settings.Heats = 3
	r.totalHeats = 3
	r.heat = 1
	r.totalBoosts = 0
	r.endedAt = 0
	r.awards = nil
	r.replayFrames = nil
	r.modifier = ""
	r.votes = make(map[string]string)
	r.sharedHealth = 6
	ordered := r.rankedPlayersLocked(false)
	for index, p := range ordered {
		p.Points = 0
		p.BoostsUsed = 0
		p.Queued = !p.Connected
		p.Active = p.Connected
		p.Eliminated = false
		p.Team = index % 2
		p.StartRank = index + 1
		p.TotalStylePoints = 0
		p.TotalBarrierHits = 0
	}
	r.startCountdownLocked(now)
}

func (r *partyRoom) startRotationCrowdShiftLocked(now int64) {
	r.crowd = newCrowdShiftState()
	r.crowd.Mode = r.activity.ModeKey
	connectedIDs := make([]string, 0, len(r.players))
	for id, p := range r.players {
		if p.Connected {
			connectedIDs = append(connectedIDs, id)
		}
	}
	sort.Strings(connectedIDs)
	if r.activity.ModeKey == "duel" && len(connectedIDs) == 2 {
		r.crowd.Duel = true
		r.crowd.DuelPlayerIDs = append([]string(nil), connectedIDs...)
		for _, id := range connectedIDs {
			r.crowd.HotTakeAvailable[id] = true
		}
	}
	r.crowd.Round = 1
	r.endedAt = 0
	for _, p := range r.players {
		p.Points = 0
		p.HeatPoints = 0
		p.Rank = 0
		p.Active = p.Connected && (!r.crowd.Duel || containsString(r.crowd.DuelPlayerIDs, p.ID))
		p.Queued = !p.Active
	}
	r.prepareCrowdShiftRoundLocked(now)
	r.phase = "countdown"
	r.phaseEndsAt = now + partyPhaseDuration(crowdShiftCountdownMs)
}

func (r *partyRoom) completeRotationActivityLocked(now int64) {
	if r.partyAwarded {
		return
	}
	r.partyAwarded = true
	r.activitySkipped = false
	ordered := r.activityRankingLocked()
	for index, p := range ordered {
		p.Rank = index + 1
		award := 0
		if index < len(partyPlacementPoints) {
			award = partyPlacementPoints[index]
		}
		p.PartyAward = award
		p.PartyPoints += award
		if index == 0 {
			p.ActivityWins++
		}
	}
	r.lastActivityID = r.activity.ID
	r.updatePartyRanksLocked()
	r.partyPhase = "results"
	r.phase = "podium"
	r.phaseEndsAt = now + rotationPhaseDuration(partyResultsMs)
	r.endedAt = 0
}

func (r *partyRoom) skipRotationActivityLocked(now int64) {
	r.partyAwarded = true
	r.activitySkipped = true
	r.lastActivityID = r.activity.ID
	for _, p := range r.players {
		p.PartyAward = 0
	}
	r.partyPhase = "results"
	r.phase = "podium"
	r.phaseEndsAt = now + rotationPhaseDuration(partySkippedResultsMs)
	r.endedAt = 0
}

func (r *partyRoom) activityRankingLocked() []*partyPlayer {
	players := make([]*partyPlayer, 0, len(r.players))
	for _, p := range r.players {
		if p.Active && !p.Queued {
			players = append(players, p)
		}
	}
	teamScores := []int{0, 0}
	if r.gameKey == turboTiltGameKey && (r.settings.Mode == "teams" || r.settings.Mode == "relay") {
		for _, p := range players {
			if p.Team >= 0 && p.Team < len(teamScores) {
				teamScores[p.Team] += p.Points
			}
		}
	}
	sort.Slice(players, func(i, j int) bool {
		a, b := players[i], players[j]
		if len(teamScores) > 0 && (r.settings.Mode == "teams" || r.settings.Mode == "relay") && teamScores[a.Team] != teamScores[b.Team] {
			return teamScores[a.Team] > teamScores[b.Team]
		}
		if a.Points != b.Points {
			return a.Points > b.Points
		}
		if a.Distance != b.Distance {
			return a.Distance > b.Distance
		}
		if a.TotalBarrierHits != b.TotalBarrierHits {
			return a.TotalBarrierHits < b.TotalBarrierHits
		}
		return a.ID < b.ID
	})
	return players
}

func (r *partyRoom) updatePartyRanksLocked() []*partyPlayer {
	players := make([]*partyPlayer, 0, len(r.players))
	for _, p := range r.players {
		players = append(players, p)
	}
	sort.Slice(players, func(i, j int) bool {
		if players[i].PartyPoints != players[j].PartyPoints {
			return players[i].PartyPoints > players[j].PartyPoints
		}
		if players[i].ActivityWins != players[j].ActivityWins {
			return players[i].ActivityWins > players[j].ActivityWins
		}
		return players[i].ID < players[j].ID
	})
	for index, p := range players {
		p.PartyRank = index + 1
	}
	return players
}

func (r *partyRoom) partyOptionsLocked(playerCount int) []partyActivity {
	eligible := make([]partyActivity, 0, len(partyActivityCatalog))
	for _, option := range partyActivityCatalog {
		if playerCount >= option.MinPlayers && playerCount <= option.MaxPlayers && option.ID != r.lastActivityID {
			eligible = append(eligible, option)
		}
	}
	sort.Slice(eligible, func(i, j int) bool {
		return partyOptionOrder(r.roomID, r.activityIndex, eligible[i].ID) < partyOptionOrder(r.roomID, r.activityIndex, eligible[j].ID)
	})
	options := make([]partyActivity, 0, 3)
	seenGames := make(map[string]bool)
	for _, option := range eligible {
		if seenGames[option.GameKey] {
			continue
		}
		options = append(options, option)
		seenGames[option.GameKey] = true
		if len(options) == 3 {
			return options
		}
	}
	for _, option := range eligible {
		if containsActivity(options, option.ID) {
			continue
		}
		options = append(options, option)
		if len(options) == 3 {
			break
		}
	}
	return options
}

func (r *partyRoom) allConnectedPlayersVotedLocked() bool {
	connected := 0
	for id, p := range r.players {
		if !p.Connected {
			continue
		}
		connected++
		if !r.partyVoteHasOptionLocked(r.partyVote.Votes[id]) {
			return false
		}
	}
	return connected >= partyMinPlayers
}

func (r *partyRoom) partyVoteHasOptionLocked(optionID string) bool {
	for _, option := range r.partyVote.Options {
		if option.ID == optionID {
			return true
		}
	}
	return false
}

func (r *partyRoom) rotationSnapshotLocked(selfID string) map[string]any {
	players := r.rotationPlayersLocked()
	state := map[string]any{
		"gameKey": partyRotationGameKey, "roomId": r.roomID, "phase": r.phase,
		"pauseReason": r.pauseReason, "serverTime": nowMillis(), "phaseEndsAt": r.phaseEndsAt,
		"players": players, "minPlayers": partyMinPlayers, "maxPlayers": partyMaxPlayers,
		"displayCount": len(r.displays),
	}
	if selfID != "" {
		state["selfId"] = selfID
	}
	return r.decorateRotationSnapshotLocked(state, selfID)
}

func (r *partyRoom) decorateRotationSnapshotLocked(state map[string]any, selfID string) map[string]any {
	if r.sessionMode != partyRotationSessionMode {
		return state
	}
	state["sessionMode"] = r.sessionMode
	state["partyPhase"] = r.partyPhase
	state["resumePartyPhase"] = r.resumePartyPhase
	state["activityIndex"] = r.activityIndex
	state["activity"] = r.activity
	state["activitySkipped"] = r.activitySkipped
	state["partyVote"] = r.partyVoteSnapshotLocked()
	if players, ok := state["players"].([]map[string]any); ok {
		for _, item := range players {
			if p := r.players[stringValue(item["id"])]; p != nil {
				item["partyPoints"] = p.PartyPoints
				item["partyRank"] = p.PartyRank
				item["activityWins"] = p.ActivityWins
				item["partyAward"] = p.PartyAward
			}
		}
	}
	return state
}

func (r *partyRoom) rotationPlayersLocked() []map[string]any {
	ordered := r.updatePartyRanksLocked()
	players := make([]map[string]any, 0, len(ordered))
	for _, p := range ordered {
		players = append(players, map[string]any{
			"id": p.ID, "name": p.Name, "color": p.Color, "connected": p.Connected,
			"queued": p.Queued, "active": p.Active, "points": p.Points,
			"partyPoints": p.PartyPoints, "partyRank": p.PartyRank,
			"activityWins": p.ActivityWins, "partyAward": p.PartyAward,
		})
	}
	return players
}

func (r *partyRoom) partyVoteSnapshotLocked() map[string]any {
	ballots := make([]map[string]any, 0, len(r.partyVote.Votes))
	ids := make([]string, 0, len(r.partyVote.Votes))
	for id := range r.partyVote.Votes {
		if p := r.players[id]; p != nil && p.Connected && r.partyVoteHasOptionLocked(r.partyVote.Votes[id]) {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	for _, id := range ids {
		p := r.players[id]
		ballots = append(ballots, map[string]any{"id": id, "playerId": id, "playerName": p.Name, "playerColor": p.Color, "optionId": r.partyVote.Votes[id]})
	}
	if len(ballots) == 0 && (r.partyPhase == "spinning" || r.partyPhase == "next_up") {
		for _, option := range r.partyVote.Options {
			ballots = append(ballots, map[string]any{"id": "neutral:" + option.ID, "playerName": "Mystery pick", "playerColor": "#ffcf4a", "optionId": option.ID})
		}
	}
	return map[string]any{
		"options": r.partyVote.Options, "ballots": ballots, "startedAt": r.partyVote.StartedAt,
		"closesAt": r.partyVote.ClosesAt, "selectedBallotId": r.partyVote.SelectedBallotID,
		"winnerOptionId": r.partyVote.WinnerOptionID, "spin": r.partyVote.Spin,
	}
}

func partyOptionOrder(roomID string, activityIndex int, optionID string) uint64 {
	hasher := fnv.New64a()
	_, _ = hasher.Write([]byte(roomID + ":party:" + strconvItoa(activityIndex) + ":" + optionID))
	return hasher.Sum64()
}

func securePartyIndex(length int) int {
	if length <= 1 {
		return 0
	}
	value, err := cryptorand.Int(cryptorand.Reader, big.NewInt(int64(length)))
	if err != nil {
		return 0
	}
	return int(value.Int64())
}

func containsActivity(options []partyActivity, id string) bool {
	for _, option := range options {
		if option.ID == id {
			return true
		}
	}
	return false
}

func stringValue(value any) string {
	text, _ := value.(string)
	return text
}

func rotationPhaseDuration(base int64) int64 {
	if os.Getenv("PARTY_TEST_FAST") != "1" {
		return base
	}
	switch base {
	case partyVoteMs:
		return 1600
	case partyVoteMinimumMs:
		return 450
	case partySpinMs:
		return 1000
	case partyNextUpMs:
		return 500
	case partyResultsMs:
		return 1200
	default:
		return base
	}
}
