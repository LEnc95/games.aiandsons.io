package main

import (
	"hash/fnv"
)

const (
	riffRallyStepMs = int64(500)
	riffRallyNotes  = 60
	riffRallyWindow = int64(190)
)

type riffNote struct {
	ID   int   `json:"id"`
	At   int64 `json:"at"`
	Lane int   `json:"lane"`
}
type riffPlayerScore struct {
	Score      int    `json:"score"`
	Hits       int    `json:"hits"`
	Perfect    int    `json:"perfect"`
	Misses     int    `json:"misses"`
	Streak     int    `json:"streak"`
	BestStreak int    `json:"bestStreak"`
	LastResult string `json:"lastResult,omitempty"`
	LastLane   int    `json:"lastLane,omitempty"`
	LastAt     int64  `json:"lastAt,omitempty"`
	LastBase   int    `json:"lastBase"`
	LastBonus  int    `json:"lastBonus"`
	LastAward  int    `json:"lastAward"`
}
type riffRallyState struct {
	StartAt    int64                       `json:"startAt"`
	PausedAt   int64                       `json:"pausedAt,omitempty"`
	FinishedAt int64                       `json:"finishedAt,omitempty"`
	Notes      []riffNote                  `json:"notes"`
	NextMiss   int                         `json:"nextMiss"`
	Results    map[string]*riffPlayerScore `json:"results"`
	Played     map[string]bool             `json:"played"`
}

func newRiffRallyState() *riffRallyState {
	return &riffRallyState{Results: map[string]*riffPlayerScore{}, Played: map[string]bool{}}
}

func (r *partyRoom) startRiffRallyLocked(now int64) {
	r.riff = newRiffRallyState()
	s := r.riff
	s.StartAt = now + r.partyDurationLocked(partyCountdownMs)
	h := fnv.New64a()
	_, _ = h.Write([]byte(r.roomID + ":" + strconvItoa(r.activityIndex+1) + ":" + strconvItoa(int(r.tick))))
	seed := h.Sum64()
	prev := -1
	for i := 0; i < riffRallyNotes; i++ {
		seed = seed*6364136223846793005 + 1442695040888963407
		lane := int((seed >> 32) % 4)
		if lane == prev {
			lane = (lane + 1 + i%3) % 4
		}
		s.Notes = append(s.Notes, riffNote{ID: i, Lane: lane, At: s.StartAt + int64(i+1)*riffRallyStepMs})
		prev = lane
	}
	r.phase, r.phaseEndsAt, r.endedAt = "countdown", s.StartAt, 0
	for _, p := range r.players {
		p.Points, p.HeatPoints, p.Streak, p.BestStreak, p.Active = 0, 0, 0, 0, p.Connected
		p.Queued = !p.Connected
		s.Results[p.ID] = &riffPlayerScore{}
	}
}

func (r *partyRoom) applyRiffRallyHostActionLocked(action string, now int64, c *client) {
	if action == "start" {
		if r.phase != "lobby" && r.phase != "podium" && r.phase != "ended" {
			c.sendErrorCode(r.roomID, "invalid_phase", "The song is already playing.")
			return
		}
		if r.connectedPlayerCountLocked() < partyMinPlayers {
			c.sendErrorCode(r.roomID, "not_enough_players", "At least two players must be connected.")
			return
		}
		r.startRiffRallyLocked(now)
		return
	}
	switch action {
	case "pause":
		if r.phase != "countdown" && r.phase != "racing" {
			c.sendErrorCode(r.roomID, "invalid_phase", "The song cannot be paused right now.")
			return
		}
		r.pauseLocked("manual", now)
	case "resume":
		if r.phase != "paused" {
			c.sendErrorCode(r.roomID, "invalid_phase", "The song is not paused.")
			return
		}
		r.resumeLocked(now)
	case "end":
		r.finishRiffRallyLocked(now)
	default:
		c.sendErrorCode(r.roomID, "unsupported_input", "That host action is not supported.")
	}
}

func (r *partyRoom) applyRiffRallyPlayerInputLocked(p *partyPlayer, in partyInput, now int64, c *client) {
	if in.Type != "riff_hit" || r.phase != "racing" || !p.Active || in.Lane < 0 || in.Lane > 3 || in.NoteID < 0 || in.NoteID >= len(r.riff.Notes) {
		return
	}
	note := r.riff.Notes[in.NoteID]
	key := p.ID + ":" + strconvItoa(in.NoteID)
	if r.riff.Played[key] {
		return
	}
	if delta := now - note.At; delta < -riffRallyWindow || delta > riffRallyWindow {
		return
	}
	r.riff.Played[key] = true
	score := r.riff.Results[p.ID]
	score.LastLane, score.LastAt = in.Lane, now
	if in.Lane != note.Lane {
		score.Misses++
		score.Streak = 0
		score.LastResult = "MISS"
		score.LastBase, score.LastBonus, score.LastAward = 0, 0, 0
		p.Streak = 0
		return
	}
	delta := now - note.At
	if delta < 0 {
		delta = -delta
	}
	base, label := 100, "PERFECT"
	if delta > 85 {
		base, label = 60, "GOOD"
	}
	bonus := score.Streak
	if bonus > 25 {
		bonus = 25
	}
	bonus *= 2
	points := base + bonus
	score.Score += points
	score.Hits++
	score.Streak++
	if label == "PERFECT" {
		score.Perfect++
	}
	if score.Streak > score.BestStreak {
		score.BestStreak = score.Streak
	}
	score.LastResult = label
	score.LastBase, score.LastBonus, score.LastAward = base, bonus, points
	p.Points = score.Score
	p.Streak = score.Streak
	p.BestStreak = score.BestStreak
}

func (r *partyRoom) stepRiffRallyLocked(now int64) {
	if r.phase == "paused" || r.phase == "lobby" || r.phase == "podium" || r.phase == "ended" || r.riff == nil {
		return
	}
	if r.phase == "countdown" && now >= r.riff.StartAt {
		r.phase = "racing"
		r.phaseEndsAt = r.riff.StartAt + int64(riffRallyNotes+1)*riffRallyStepMs
	}
	if r.phase != "racing" {
		return
	}
	for r.riff.NextMiss < len(r.riff.Notes) && now > r.riff.Notes[r.riff.NextMiss].At+riffRallyWindow {
		n := r.riff.Notes[r.riff.NextMiss]
		for id, p := range r.players {
			if !p.Active {
				continue
			}
			key := id + ":" + strconvItoa(n.ID)
			if !r.riff.Played[key] {
				r.riff.Played[key] = true
				if s := r.riff.Results[id]; s != nil {
					s.Misses++
					s.Streak = 0
					s.LastResult = "MISS"
					s.LastAt = now
					s.LastBase, s.LastBonus, s.LastAward = 0, 0, 0
				}
				p.Streak = 0
			}
		}
		r.riff.NextMiss++
	}
	if now >= r.phaseEndsAt {
		r.finishRiffRallyLocked(now)
	}
}

func (r *partyRoom) finishRiffRallyLocked(now int64) {
	if r.phase == "podium" {
		return
	}
	r.phase = "podium"
	r.phaseEndsAt = 0
	r.endedAt = now
	r.riff.FinishedAt = now
	ordered := r.rankedPlayersLocked(false)
	for i, p := range ordered {
		p.Rank = i + 1
		if i > 0 && ordered[i-1].Points == p.Points {
			p.Rank = ordered[i-1].Rank
		}
	}
	if r.sessionMode == partyRotationSessionMode && r.partyPhase == "activity" {
		r.completeRotationActivityLocked(now)
	}
}

func (r *partyRoom) riffRallySnapshotLocked(selfID string) map[string]any {
	now := nowMillis()
	ordered := r.rankedPlayersLocked(false)
	players := make([]map[string]any, 0, len(ordered))
	for _, p := range ordered {
		s := r.riff.Results[p.ID]
		if s == nil {
			s = &riffPlayerScore{}
		}
		players = append(players, map[string]any{"id": p.ID, "name": p.Name, "avatar": p.Avatar, "color": p.Color, "connected": p.Connected, "score": s.Score, "hits": s.Hits, "perfect": s.Perfect, "misses": s.Misses, "streak": s.Streak, "bestStreak": s.BestStreak, "rank": p.Rank, "lastResult": func() string {
			if p.ID == selfID {
				return s.LastResult
			}
			return ""
		}()})
	}
	state := map[string]any{"gameKey": r.gameKey, "roomId": r.roomID, "phase": r.phase, "phaseEndsAt": r.phaseEndsAt, "serverTime": now, "songStartAt": r.riff.StartAt, "songFinishedAt": r.riff.FinishedAt, "songLengthMs": int64(riffRallyNotes) * riffRallyStepMs, "notes": r.riff.Notes, "players": players, "sessionMode": r.sessionMode, "partyPhase": r.partyPhase, "activity": r.activity, "pauseReason": r.pauseReason}
	if selfID != "" {
		state["selfId"] = selfID
		if s := r.riff.Results[selfID]; s != nil {
			state["selfResult"] = map[string]any{"lastResult": s.LastResult, "lastLane": s.LastLane, "lastAt": s.LastAt, "lastBase": s.LastBase, "lastBonus": s.LastBonus, "lastAward": s.LastAward, "streak": s.Streak}
		}
	}
	return state
}
