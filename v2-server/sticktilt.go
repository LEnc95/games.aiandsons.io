package main

import (
	"math"
	"sort"
)

const stickTiltGameKey = "sticktilt"
const stickTiltRoundMs = int64(30000)

// All combat timers use active simulation time, so pause and recovery freeze them.
type stickFighter struct {
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	GroundY     float64 `json:"groundY"`
	VY          float64
	Move        float64
	InputUntil  int64
	Facing      float64 `json:"facing"`
	Health      int     `json:"health"`
	PunchUntil  int64   `json:"punchUntil"`
	PunchReady  int64   `json:"punchReady"`
	GuardUntil  int64   `json:"guardUntil"`
	GuardReady  int64   `json:"guardReady"`
	RespawnAt   int64   `json:"respawnAt"`
	ShieldUntil int64   `json:"shieldUntil"`
	Hits        int     `json:"hits"`
}

type stickPlatform struct {
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Width float64 `json:"width"`
}

// The side boxes are reachable from the floor. The center box is reachable
// from either side box, which gives jump a positioning use without a new input.
var stickTiltPlatforms = []stickPlatform{
	{X: 215, Y: 74, Width: 245},
	{X: 477, Y: 148, Width: 246},
	{X: 740, Y: 74, Width: 245},
}

type stickTiltState struct {
	Round      int
	Clock      int64
	DurationMs int64
	Fighters   map[string]*stickFighter
	Headline   string
}

func (r *partyRoom) startStickTiltLocked(now int64) {
	r.stick = &stickTiltState{Round: 1, Fighters: make(map[string]*stickFighter)}
	r.endedAt = 0
	for _, p := range r.players {
		p.Points, p.HeatPoints, p.Rank = 0, 0, 0
		// Clear old racing tiebreakers before entering a fighting activity.
		p.Distance, p.TotalBarrierHits = 0, 0
	}
	r.prepareStickTiltRoundLocked(now)
}

func (r *partyRoom) prepareStickTiltRoundLocked(now int64) {
	ids := make([]string, 0, len(r.players))
	for id, p := range r.players {
		p.Active, p.Queued = p.Connected, !p.Connected
		p.HeatPoints = 0
		if p.Connected {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	r.stick.Fighters = make(map[string]*stickFighter)
	for i, id := range ids {
		// Rotate spawn order each round without changing anyone's identity.
		x := 140 + float64((i+r.stick.Round-1)%len(ids))*920/math.Max(1, float64(len(ids)-1))
		facing := 1.0
		if x > 600 {
			facing = -1
		}
		r.stick.Fighters[id] = &stickFighter{X: x, Facing: facing, Health: 100, ShieldUntil: r.stick.Clock + 1000}
	}
	r.stick.Headline = "Tilt to move · Jump onto boxes · 1 point per knockout"
	r.phase, r.phaseEndsAt = "countdown", now+r.partyDurationLocked(partyCountdownMs)
}

func (r *partyRoom) applyStickTiltHostActionLocked(action string, now int64, c *client) {
	switch action {
	case "start":
		if !containsString([]string{"lobby", "podium", "ended"}, r.phase) {
			c.sendErrorCode(r.roomID, "invalid_phase", "A match is already running.")
			return
		}
		if r.connectedPlayerCountLocked() < 2 {
			c.sendErrorCode(r.roomID, "not_enough_players", "Connect at least two fighters.")
			return
		}
		r.startStickTiltLocked(now)
	case "pause":
		if !containsString([]string{"countdown", "fighting", "intermission"}, r.phase) {
			c.sendErrorCode(r.roomID, "invalid_phase", "There is no active match to pause.")
			return
		}
		r.pauseLocked("manual", now)
	case "resume":
		r.resumeLocked(now)
	case "end":
		r.phase, r.phaseEndsAt, r.endedAt = "ended", 0, now
	default:
		c.sendErrorCode(r.roomID, "unsupported_input", "That host action is not supported.")
	}
}

func (r *partyRoom) applyStickTiltInputLocked(p *partyPlayer, input partyInput, c *client) {
	if r.phase != "fighting" || r.stick == nil || !p.Active || p.Queued || !p.Connected {
		return
	}
	f := r.stick.Fighters[p.ID]
	if f == nil || f.RespawnAt > 0 {
		return
	}
	t := r.stick.Clock
	switch input.Type {
	case "move":
		if math.IsNaN(input.Value) || math.IsInf(input.Value, 0) {
			return
		}
		f.Move = math.Max(-1, math.Min(1, input.Value))
		f.InputUntil = t + 350
	case "jump":
		if math.Abs(f.Y-f.GroundY) < .5 && f.VY == 0 {
			f.VY = 620
		}
	case "guard":
		if t >= f.GuardReady && t >= f.PunchUntil {
			f.GuardUntil = t + 650
			f.GuardReady = t + 1500
		}
	case "punch":
		if t < f.PunchReady || t < f.GuardUntil {
			return
		}
		f.PunchUntil, f.PunchReady = t+200, t+420
		f.ShieldUntil = 0
		var target *partyPlayer
		closest := 105.0
		for id, other := range r.stick.Fighters {
			p2 := r.players[id]
			if id == p.ID || p2 == nil || !p2.Connected || !p2.Active || other.RespawnAt > 0 || t < other.ShieldUntil {
				continue
			}
			dx := other.X - f.X
			if dx*f.Facing < -12 || math.Abs(other.Y-f.Y) > 65 {
				continue
			}
			distance := math.Abs(dx)
			if distance < closest || (distance == closest && target != nil && id < target.ID) {
				target = p2
				closest = distance
			}
		}
		if target == nil {
			return
		}
		other := r.stick.Fighters[target.ID]
		if t < other.GuardUntil {
			r.stick.Headline = target.Name + " blocked the punch!"
			return
		}
		other.Health -= 25
		other.X = math.Max(65, math.Min(1135, other.X+f.Facing*26))
		f.Hits++
		r.stick.Headline = p.Name + " hit " + target.Name + " · 25 damage"
		if other.Health <= 0 {
			other.Health = 0
			other.RespawnAt = t + 1200
			other.Move = 0
			p.Points++
			p.HeatPoints++
			r.stick.Headline = p.Name + " knocked out " + target.Name + " · +1 point"
		}
	default:
		c.sendErrorCode(r.roomID, "unsupported_input", "Choose move, punch, jump, or guard.")
	}
}

func (r *partyRoom) stepStickTiltLocked(now int64, dt float64) {
	if r.stick == nil {
		return
	}
	if r.phase == "countdown" && now >= r.phaseEndsAt {
		r.phase = "fighting"
		r.phaseEndsAt = now + r.partyDurationLocked(stickTiltRoundMs)
		return
	}
	if r.phase == "intermission" && now >= r.phaseEndsAt {
		r.stick.Round++
		r.prepareStickTiltRoundLocked(now)
		return
	}
	if r.phase != "fighting" {
		return
	}
	step := int64(math.Round(math.Max(0, math.Min(.15, dt)) * 1000))
	r.stick.Clock += step
	r.stick.DurationMs += step
	t := r.stick.Clock
	for id, f := range r.stick.Fighters {
		p := r.players[id]
		if p == nil || !p.Connected {
			f.Move = 0
			continue
		}
		if f.RespawnAt > 0 {
			if t < f.RespawnAt {
				continue
			}
			f.RespawnAt = 0
			f.Health = 100
			f.Y = 0
			f.GroundY = 0
			f.VY = 0
			f.ShieldUntil = t + 1000
			f.X = 140 + float64((crowdShiftSeed(id)+r.stick.Round)%9)*115
		}
		if t > f.InputUntil {
			f.Move = 0
		}
		speed := 300.0
		if t < f.GuardUntil {
			speed = 100
		}
		f.X = math.Max(65, math.Min(1135, f.X+f.Move*speed*float64(step)/1000))
		if math.Abs(f.Move) > .05 {
			f.Facing = math.Copysign(1, f.Move)
		}
		if f.VY == 0 && f.GroundY > 0 && !stickTiltSupportedAt(f.X, f.GroundY) {
			f.GroundY = 0
			f.VY = -1
		}
		if f.VY != 0 || math.Abs(f.Y-f.GroundY) >= .5 {
			previousY := f.Y
			nextY := f.Y + f.VY*float64(step)/1000
			nextVY := f.VY - 1700*float64(step)/1000
			landingY := -1.0
			if f.VY <= 0 {
				if nextY <= 0 {
					landingY = 0
				}
				for _, platform := range stickTiltPlatforms {
					if f.X >= platform.X && f.X <= platform.X+platform.Width && previousY >= platform.Y && nextY <= platform.Y && platform.Y > landingY {
						landingY = platform.Y
					}
				}
			}
			if landingY >= 0 {
				f.Y, f.GroundY, f.VY = landingY, landingY, 0
			} else {
				f.Y, f.VY = nextY, nextVY
			}
		}
	}
	if now >= r.phaseEndsAt {
		if r.stick.Round >= 3 {
			r.phase = "podium"
			r.phaseEndsAt = 0
			r.endedAt = now
			if r.sessionMode == partyRotationSessionMode {
				r.completeRotationActivityLocked(now)
			}
		} else {
			r.phase = "intermission"
			r.phaseEndsAt = now + r.partyDurationLocked(partyIntermissionMs)
		}
	}
}

func (r *partyRoom) stickTiltSnapshotLocked(selfID string) map[string]any {
	ordered := make([]*partyPlayer, 0, len(r.players))
	for _, p := range r.players {
		ordered = append(ordered, p)
	}
	sort.Slice(ordered, func(i, j int) bool {
		if ordered[i].Points != ordered[j].Points {
			return ordered[i].Points > ordered[j].Points
		}
		return ordered[i].ID < ordered[j].ID
	})
	players := make([]map[string]any, 0, len(ordered))
	rank := 0
	for i, p := range ordered {
		if i == 0 || p.Points != ordered[i-1].Points {
			rank = i + 1
		}
		p.Rank = rank
		var fighter *stickFighter
		if r.stick != nil {
			fighter = r.stick.Fighters[p.ID]
		}
		players = append(players, map[string]any{"id": p.ID, "name": p.Name, "color": p.Color, "avatar": p.Avatar, "connected": p.Connected, "active": p.Active, "queued": p.Queued, "points": p.Points, "roundPoints": p.HeatPoints, "rank": p.Rank, "fighter": fighter})
	}
	state := map[string]any{"gameKey": stickTiltGameKey, "roomId": r.roomID, "phase": r.phase, "phaseEndsAt": r.phaseEndsAt, "serverTime": nowMillis(), "pauseReason": r.pauseReason, "players": players, "displayCount": len(r.displays), "totalRounds": 3, "minPlayers": 2, "maxPlayers": 8}
	state["platforms"] = stickTiltPlatforms
	if selfID != "" {
		state["selfId"] = selfID
	}
	if r.stick != nil {
		state["round"] = r.stick.Round
		state["fightClock"] = r.stick.Clock
		state["durationMs"] = r.stick.DurationMs
		state["headline"] = r.stick.Headline
	}
	return state
}

func stickTiltSupportedAt(x, y float64) bool {
	for _, platform := range stickTiltPlatforms {
		if math.Abs(platform.Y-y) < .5 && x >= platform.X && x <= platform.X+platform.Width {
			return true
		}
	}
	return false
}
