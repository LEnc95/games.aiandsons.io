package main

import (
	"hash/fnv"
	"math"
	"sort"
	"strings"
)

const (
	crowdShiftGameKey         = "crowdshift"
	crowdShiftRounds          = 7
	crowdShiftCountdownMs     = int64(3000)
	crowdShiftChoiceMs        = int64(15000)
	crowdShiftRevealMs        = int64(6000)
	crowdShiftIntermissionMs  = int64(3000)
	crowdShiftMinimumChoiceMs = int64(1800)
)

type crowdShiftPrompt struct {
	ID       string `json:"id"`
	Question string `json:"question"`
	Left     string `json:"left"`
	Right    string `json:"right"`
}

type crowdShiftState struct {
	Round           int
	TotalRounds     int
	Prompt          crowdShiftPrompt
	Rule            string
	Choices         map[string]string
	LeftCount       int
	RightCount      int
	WinnerSide      string
	ResultHeadline  string
	RoundStartedAt  int64
	UnanimousRounds int
}

var crowdShiftPrompts = []crowdShiftPrompt{
	{ID: "pet", Question: "Your new pet has to be one of these", Left: "Pocket dragon", Right: "Giant hamster"},
	{ID: "snack", Question: "The only snack at movie night", Left: "Bottomless popcorn", Right: "Bottomless ice cream"},
	{ID: "travel", Question: "Best ridiculous way to travel", Left: "Rocket-powered sofa", Right: "Teleporting bathtub"},
	{ID: "weather", Question: "This weather happens every Saturday", Left: "Bubble rain", Right: "Marshmallow snow"},
	{ID: "talent", Question: "Instantly master one talent", Left: "Every instrument", Right: "Every sport"},
	{ID: "school", Question: "Add this room to every school", Left: "Indoor water park", Right: "Robot kitchen"},
	{ID: "tiny", Question: "Spend a day at this size", Left: "Ant-sized", Right: "Building-sized"},
	{ID: "voice", Question: "Your voice now sounds like", Left: "Movie trailer narrator", Right: "Cartoon squeak"},
	{ID: "sidekick", Question: "Choose your adventure sidekick", Left: "Very brave duck", Right: "Very clever goat"},
	{ID: "door", Question: "A mystery door appears. It leads to", Left: "A cloud city", Right: "An underwater town"},
	{ID: "breakfast", Question: "Breakfast gets one magical upgrade", Left: "Flying pancakes", Right: "Singing cereal"},
	{ID: "weekend", Question: "Your weekend headquarters", Left: "Treehouse castle", Right: "Secret moon base"},
	{ID: "power", Question: "Pick a mildly inconvenient superpower", Left: "Fly, but only backward", Right: "Invisible, but you glow"},
	{ID: "game", Question: "Every game must include", Left: "A surprise dance break", Right: "A dramatic narrator"},
	{ID: "house", Question: "Your house gets this upgrade", Left: "Room-sized trampoline", Right: "Indoor lazy river"},
	{ID: "language", Question: "You can suddenly understand", Left: "Every animal", Right: "Every machine"},
	{ID: "holiday", Question: "Invent a new holiday for", Left: "Wearing costumes", Right: "Eating breakfast twice"},
	{ID: "ride", Question: "Build this in the backyard", Left: "Mini roller coaster", Right: "Zero-gravity room"},
	{ID: "planet", Question: "Visit a planet made entirely of", Left: "LEGO bricks", Right: "Pillows"},
	{ID: "helper", Question: "Your chores are handled by", Left: "One huge robot", Right: "One hundred tiny robots"},
}

func isSupportedPartyGame(gameKey string) bool {
	return gameKey == turboTiltGameKey || gameKey == crowdShiftGameKey
}

func newCrowdShiftState() *crowdShiftState {
	return &crowdShiftState{TotalRounds: crowdShiftRounds, Choices: make(map[string]string)}
}

func (r *partyRoom) applyCrowdShiftHostActionLocked(action string, now int64, c *client) {
	switch action {
	case "start":
		if r.phase != "lobby" && r.phase != "podium" && r.phase != "ended" {
			c.sendErrorCode(r.roomID, "invalid_phase", "The session has already started.")
			return
		}
		if r.connectedPlayerCountLocked() < partyMinPlayers {
			c.sendErrorCode(r.roomID, "not_enough_players", "At least two players must be connected.")
			return
		}
		if r.crowd == nil {
			r.crowd = newCrowdShiftState()
		}
		r.crowd.Round = 1
		r.crowd.UnanimousRounds = 0
		r.endedAt = 0
		for _, p := range r.players {
			p.Points = 0
			p.HeatPoints = 0
			p.Rank = 0
			p.Queued = false
			p.Active = true
		}
		r.prepareCrowdShiftRoundLocked(now)
		r.phase = "countdown"
		r.phaseEndsAt = now + partyPhaseDuration(crowdShiftCountdownMs)
	case "pause":
		if !containsString([]string{"countdown", "choosing", "reveal", "intermission"}, r.phase) {
			c.sendErrorCode(r.roomID, "invalid_phase", "The game cannot be paused right now.")
			return
		}
		r.pauseLocked("manual", now)
	case "resume":
		if r.phase != "paused" {
			c.sendErrorCode(r.roomID, "invalid_phase", "The game is not paused.")
			return
		}
		r.resumeLocked(now)
	case "end":
		r.phase = "ended"
		r.phaseEndsAt = 0
		r.endedAt = now
	default:
		c.sendErrorCode(r.roomID, "unsupported_input", "That host action is not supported.")
	}
}

func (r *partyRoom) applyCrowdShiftPlayerInputLocked(p *partyPlayer, input partyInput, now int64, c *client) {
	switch input.Type {
	case "choice":
		choice := strings.ToLower(strings.TrimSpace(input.Choice))
		if r.phase != "choosing" || p.Queued || !p.Active {
			return
		}
		if choice != "left" && choice != "right" {
			c.sendErrorCode(r.roomID, "invalid_choice", "Choose one of the two answers.")
			return
		}
		r.crowd.Choices[p.ID] = choice
	case "emote":
		if now-p.EmoteAt >= 1000 && containsString([]string{"fire", "wow", "laugh", "clap"}, input.Emote) {
			p.Emote = input.Emote
			p.EmoteAt = now
		}
	default:
		c.sendErrorCode(r.roomID, "unsupported_input", "That controller action is not supported.")
	}
}

func (r *partyRoom) stepCrowdShiftLocked(now int64) {
	if r.phase == "paused" || r.phase == "lobby" || r.phase == "podium" || r.phase == "ended" {
		return
	}
	if r.phase == "countdown" && now >= r.phaseEndsAt {
		r.phase = "choosing"
		r.crowd.RoundStartedAt = now
		r.phaseEndsAt = now + partyPhaseDuration(crowdShiftChoiceMs)
		return
	}
	if r.phase == "choosing" {
		allChosen := r.crowdShiftAllConnectedChosenLocked()
		minimumRevealAt := r.crowd.RoundStartedAt + partyPhaseDuration(crowdShiftMinimumChoiceMs)
		if now >= r.phaseEndsAt || (allChosen && now >= minimumRevealAt) {
			r.scoreCrowdShiftRoundLocked()
			r.phase = "reveal"
			r.phaseEndsAt = now + partyPhaseDuration(crowdShiftRevealMs)
		}
		return
	}
	if r.phase == "reveal" && now >= r.phaseEndsAt {
		if r.crowd.Round >= r.crowd.TotalRounds {
			r.finishCrowdShiftMatchLocked(now)
			return
		}
		r.phase = "intermission"
		r.phaseEndsAt = now + partyPhaseDuration(crowdShiftIntermissionMs)
		return
	}
	if r.phase == "intermission" && now >= r.phaseEndsAt {
		r.crowd.Round++
		r.prepareCrowdShiftRoundLocked(now)
		r.phase = "choosing"
		r.crowd.RoundStartedAt = now
		r.phaseEndsAt = now + partyPhaseDuration(crowdShiftChoiceMs)
	}
}

func (r *partyRoom) prepareCrowdShiftRoundLocked(now int64) {
	seed := crowdShiftSeed(r.roomID)
	promptIndex := (seed + r.crowd.Round - 1) % len(crowdShiftPrompts)
	r.crowd.Prompt = crowdShiftPrompts[promptIndex]
	rules := []string{"majority", "minority", "split", "unanimous"}
	r.crowd.Rule = rules[(seed+r.crowd.Round-1)%len(rules)]
	r.crowd.Choices = make(map[string]string)
	r.crowd.LeftCount = 0
	r.crowd.RightCount = 0
	r.crowd.WinnerSide = ""
	r.crowd.ResultHeadline = ""
	r.crowd.RoundStartedAt = now
	for _, p := range r.players {
		p.HeatPoints = 0
		p.Queued = false
		p.Active = true
	}
}

func (r *partyRoom) crowdShiftAllConnectedChosenLocked() bool {
	connected := 0
	for _, p := range r.players {
		if p.Connected && p.Active && !p.Queued {
			connected++
			if r.crowd.Choices[p.ID] == "" {
				return false
			}
		}
	}
	return connected >= partyMinPlayers
}

func (r *partyRoom) scoreCrowdShiftRoundLocked() {
	left, right := 0, 0
	for playerID, choice := range r.crowd.Choices {
		if r.players[playerID] == nil || !r.players[playerID].Active {
			continue
		}
		if choice == "left" {
			left++
		} else if choice == "right" {
			right++
		}
	}
	r.crowd.LeftCount, r.crowd.RightCount = left, right
	r.crowd.WinnerSide = "none"
	award := 0
	switch r.crowd.Rule {
	case "majority":
		award = 1000
		if left == right {
			r.crowd.WinnerSide, award = "both", 600
			r.crowd.ResultHeadline = "Perfect tie — everybody scores!"
		} else if left > right {
			r.crowd.WinnerSide = "left"
			r.crowd.ResultHeadline = "The crowd went left!"
		} else {
			r.crowd.WinnerSide = "right"
			r.crowd.ResultHeadline = "The crowd went right!"
		}
	case "minority":
		award = 1200
		if left == right {
			r.crowd.WinnerSide, award = "both", 500
			r.crowd.ResultHeadline = "No underdog — split decision!"
		} else if left == 0 || right == 0 {
			r.crowd.ResultHeadline = "No underdog survived this one."
		} else if left < right {
			r.crowd.WinnerSide = "left"
			r.crowd.ResultHeadline = "Left was the clever underdog!"
		} else {
			r.crowd.WinnerSide = "right"
			r.crowd.ResultHeadline = "Right was the clever underdog!"
		}
	case "split":
		if int(math.Abs(float64(left-right))) <= 1 && left+right >= partyMinPlayers {
			r.crowd.WinnerSide, award = "both", 1000
			r.crowd.ResultHeadline = "Near-perfect split — everybody scores!"
		} else {
			r.crowd.ResultHeadline = "The room needed a closer split."
		}
	case "unanimous":
		if left+right >= partyMinPlayers && (left == 0 || right == 0) {
			r.crowd.WinnerSide, award = "both", 1500
			r.crowd.UnanimousRounds++
			r.crowd.ResultHeadline = "Unanimous! Huge points for everyone!"
		} else {
			r.crowd.ResultHeadline = "The room did not agree this time."
		}
	}
	for id, p := range r.players {
		choice := r.crowd.Choices[id]
		winner := r.crowd.WinnerSide == "both" || choice == r.crowd.WinnerSide
		if choice == "" || !winner {
			p.HeatPoints = 0
			continue
		}
		p.HeatPoints = award
		p.Points += award
	}
	r.updateCrowdShiftRanksLocked()
}

func (r *partyRoom) finishCrowdShiftMatchLocked(now int64) {
	r.updateCrowdShiftRanksLocked()
	r.phase = "podium"
	r.phaseEndsAt = 0
	r.endedAt = now
}

func (r *partyRoom) updateCrowdShiftRanksLocked() []*partyPlayer {
	players := make([]*partyPlayer, 0, len(r.players))
	for _, p := range r.players {
		players = append(players, p)
	}
	sort.Slice(players, func(i, j int) bool {
		if players[i].Points != players[j].Points {
			return players[i].Points > players[j].Points
		}
		return players[i].ID < players[j].ID
	})
	for index, p := range players {
		p.Rank = index + 1
	}
	return players
}

func (r *partyRoom) crowdShiftSnapshotLocked(selfID string) map[string]any {
	now := nowMillis()
	if r.crowd == nil {
		r.crowd = newCrowdShiftState()
	}
	ordered := r.updateCrowdShiftRanksLocked()
	players := make([]map[string]any, 0, len(ordered))
	for _, p := range ordered {
		choice := ""
		if r.phase == "reveal" || r.phase == "intermission" || r.phase == "podium" || p.ID == selfID {
			choice = r.crowd.Choices[p.ID]
		}
		players = append(players, map[string]any{
			"id": p.ID, "name": p.Name, "color": p.Color, "connected": p.Connected,
			"queued": p.Queued, "active": p.Active, "points": p.Points,
			"roundPoints": p.HeatPoints, "rank": p.Rank, "choice": choice,
			"hasChosen": r.crowd.Choices[p.ID] != "", "emote": p.Emote, "emoteAt": p.EmoteAt,
		})
	}
	state := map[string]any{
		"gameKey": r.gameKey, "roomId": r.roomID, "phase": r.phase,
		"pauseReason": r.pauseReason, "serverTime": now, "phaseEndsAt": r.phaseEndsAt,
		"round": r.crowd.Round, "totalRounds": r.crowd.TotalRounds,
		"prompt": r.crowd.Prompt, "rule": r.crowd.Rule,
		"players": players, "minPlayers": partyMinPlayers, "maxPlayers": partyMaxPlayers,
		"submittedCount": len(r.crowd.Choices), "leftCount": r.crowd.LeftCount,
		"rightCount": r.crowd.RightCount, "winnerSide": r.crowd.WinnerSide,
		"resultHeadline": r.crowd.ResultHeadline, "unanimousRounds": r.crowd.UnanimousRounds,
		"displayCount": len(r.displays),
	}
	if selfID != "" {
		state["selfId"] = selfID
	}
	return state
}

func crowdShiftSeed(roomID string) int {
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(roomID))
	return int(hash.Sum32() & 0x7fffffff)
}
