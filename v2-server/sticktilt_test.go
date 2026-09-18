package main

import (
	"encoding/json"
	"math"
	"testing"
)

func stickTestRoom(n int) *partyRoom {
	r := rotationTestRoom(n)
	r.gameKey = stickTiltGameKey
	r.sessionMode = partyStandaloneSessionMode
	r.startStickTiltLocked(1000)
	r.phase = "fighting"
	r.phaseEndsAt = 999999
	r.stick.Clock = 2000
	return r
}
func stickPair(r *partyRoom) (*partyPlayer, *partyPlayer) {
	var a, b *partyPlayer
	for _, p := range r.players {
		if a == nil {
			a = p
		} else if b == nil {
			b = p
		}
	}
	r.stick.Fighters[a.ID].X = 500
	r.stick.Fighters[a.ID].Facing = 1
	r.stick.Fighters[b.ID].X = 550
	return a, b
}
func TestStickTiltCombatAndRespawn(t *testing.T) {
	r := stickTestRoom(2)
	a, b := stickPair(r)
	f, g := r.stick.Fighters[a.ID], r.stick.Fighters[b.ID]
	input := func(p *partyPlayer, kind string) { r.applyStickTiltInputLocked(p, partyInput{Type: kind}, nil) }
	input(b, "guard")
	input(a, "punch")
	if g.Health != 100 {
		t.Fatal("guard failed")
	}
	r.stick.Clock += 1600
	g.Y = 100
	input(a, "punch")
	if g.Health != 100 {
		t.Fatal("jump failed to avoid grounded punch")
	}
	g.Y = 0
	for i := 0; i < 4; i++ {
		r.stick.Clock += 500
		g.X = f.X + 50
		input(a, "punch")
		input(a, "punch")
	}
	if a.Points != 1 || g.Health != 0 || g.RespawnAt == 0 || f.Hits != 4 {
		t.Fatalf("incorrect authoritative knockout: %+v %+v %+v", a, f, g)
	}
	r.stick.Clock += 500
	input(a, "punch")
	if a.Points != 1 {
		t.Fatal("duplicate knockout award")
	}
	r.stick.Clock = g.RespawnAt
	r.stepStickTiltLocked(3000, .033)
	if g.Health != 100 || g.RespawnAt != 0 || g.ShieldUntil <= r.stick.Clock {
		t.Fatal("protected respawn missing")
	}
	g.X = f.X + 50
	input(a, "punch")
	if g.Health != 100 {
		t.Fatal("spawn protection missing")
	}
}
func TestStickTiltInputBoundsPauseAndDisconnect(t *testing.T) {
	r := stickTestRoom(2)
	a, _ := stickPair(r)
	f := r.stick.Fighters[a.ID]
	r.applyStickTiltInputLocked(a, partyInput{Type: "move", Value: 900}, nil)
	if f.Move != 1 {
		t.Fatal("unbounded movement")
	}
	r.applyStickTiltInputLocked(a, partyInput{Type: "move", Value: math.NaN()}, nil)
	if f.Move != 1 {
		t.Fatal("NaN movement")
	}
	r.applyStickTiltInputLocked(a, partyInput{Type: "jump"}, nil)
	r.stepStickTiltLocked(2000, .1)
	if f.Y <= 0 {
		t.Fatal("jump did not move")
	}
	x, clock := f.X, r.stick.Clock
	r.pauseLocked("manual", 2000)
	r.stepStickTiltLocked(9999, .1)
	r.applyStickTiltInputLocked(a, partyInput{Type: "punch"}, nil)
	if f.X != x || r.stick.Clock != clock || f.PunchUntil != 0 {
		t.Fatal("paused combat advanced")
	}
	r.resumeLocked(10000)
	a.Connected = false
	r.stepStickTiltLocked(10001, .1)
	if f.X != x || f.Move != 0 {
		t.Fatal("disconnected fighter moved")
	}
	a.Connected = true
	r.stick.Clock += 400
	r.stepStickTiltLocked(10002, .1)
	if f.Move != 0 {
		t.Fatal("stale input remained active")
	}
}
func TestStickTiltPlatformLandingJumpAndFall(t *testing.T) {
	r := stickTestRoom(2)
	a, _ := stickPair(r)
	f := r.stick.Fighters[a.ID]
	platform := stickTiltPlatforms[0]
	f.X, f.Y, f.GroundY, f.VY = platform.X+platform.Width/2, platform.Y+4, 0, -100
	r.stepStickTiltLocked(2000, .1)
	if f.Y != platform.Y || f.GroundY != platform.Y || f.VY != 0 {
		t.Fatalf("fighter did not land on platform: %+v", f)
	}
	r.applyStickTiltInputLocked(a, partyInput{Type: "jump"}, nil)
	if f.VY <= 0 {
		t.Fatal("fighter could not jump from platform")
	}
	f.Y, f.GroundY, f.VY = platform.Y, platform.Y, 0
	now := nowMillis()
	r.phaseEndsAt = now + 9000
	persisted := r.snapshotForPersistenceLocked(now)
	restored := restorePartyRoom(newHubWithGames(map[string]bool{partyGameID: true}, "test"), persisted)
	if restored.stick.Fighters[a.ID].GroundY != platform.Y {
		t.Fatal("platform landing was lost during room recovery")
	}
	f.X, f.Move, f.InputUntil = platform.X+platform.Width-2, 1, r.stick.Clock+1000
	r.stepStickTiltLocked(2100, .1)
	if f.GroundY != 0 || f.VY >= 0 {
		t.Fatalf("fighter did not start falling after leaving platform: %+v", f)
	}
	snapshot := r.stickTiltSnapshotLocked(a.ID)
	platforms, ok := snapshot["platforms"].([]stickPlatform)
	if !ok || len(platforms) != 3 {
		t.Fatalf("authoritative platform layout missing from snapshot: %#v", snapshot["platforms"])
	}
}
func TestStickTiltCountsRoundsRematchAndRecovery(t *testing.T) {
	for _, n := range []int{2, 8} {
		r := stickTestRoom(n)
		if len(r.stick.Fighters) != n {
			t.Fatal("wrong fighter count")
		}
		now := nowMillis()
		r.phaseEndsAt = now + 9000
		snap := r.snapshotForPersistenceLocked(now)
		if snap == nil || snap.Stick == nil {
			t.Fatal("combat recovery missing")
		}
		restored := restorePartyRoom(newHubWithGames(map[string]bool{partyGameID: true}, "test"), snap)
		if restored.stick.Clock != r.stick.Clock || restored.resumePhase != "fighting" {
			t.Fatal("combat recovery lost phase or clock")
		}
		for id := range r.stick.Fighters {
			r.stick.Fighters[id].Health = 25
			if snap.Stick.Fighters[id].Health != 100 {
				t.Fatal("recovery snapshot aliases live fighter")
			}
		}
		for round := 1; round <= 3; round++ {
			r.phase = "fighting"
			r.phaseEndsAt = 1
			r.stepStickTiltLocked(now, .033)
			if round < 3 {
				r.stepStickTiltLocked(r.phaseEndsAt, .033)
				if r.stick.Round != round+1 {
					t.Fatal("round did not advance")
				}
			}
		}
		if r.phase != "podium" {
			t.Fatal("match did not complete")
		}
		r.startStickTiltLocked(now)
		if r.stick.Round != 1 || r.stick.DurationMs != 0 {
			t.Fatal("rematch did not reset")
		}
	}
}
func TestStickTiltRotationTiesAwardOnce(t *testing.T) {
	r := stickTestRoom(8)
	r.sessionMode = partyRotationSessionMode
	r.partyPhase = "activity"
	r.activity = partyActivityCatalog[0]
	r.stick.Round = 3
	r.phaseEndsAt = 1
	r.stepStickTiltLocked(10000, .033)
	for _, p := range r.players {
		if p.PartyAward != 10 || p.ActivityWins != 1 {
			t.Fatal("equal knockout scores must share placement")
		}
	}
	r.completeRotationActivityLocked(10001)
	for _, p := range r.players {
		if p.PartyPoints != 10 {
			t.Fatal("activity awarded twice")
		}
	}
	r.beginPartyVoteLocked(11000)
	if len(r.players) != 8 {
		t.Fatal("rotation lost roster")
	}
}
func TestStickTiltRolesAndLateInputs(t *testing.T) {
	r := stickTestRoom(2)
	a, _ := stickPair(r)
	for _, role := range []string{"display", "host"} {
		c := &client{role: role, send: make(chan []byte, 8)}
		if role == "host" {
			r.host = c
		}
		raw, _ := json.Marshal(partyInput{Type: "punch"})
		r.applyInput(c, inputEnvelope{Seq: 1, Input: raw})
		if r.stick.Fighters[a.ID].PunchUntil != 0 {
			t.Fatal("non-player attacked")
		}
	}
	a.Queued = true
	r.applyStickTiltInputLocked(a, partyInput{Type: "punch"}, nil)
	if r.stick.Fighters[a.ID].PunchUntil != 0 {
		t.Fatal("queued player attacked")
	}
}

func TestStickTiltRejectsSoloStartDuplicateAndFinishedInputs(t *testing.T) {
	r := rotationTestRoom(1)
	r.sessionMode, r.gameKey, r.phase = partyStandaloneSessionMode, stickTiltGameKey, "lobby"
	c := &client{role: "host", send: make(chan []byte, 8)}
	r.applyStickTiltHostActionLocked("start", 1000, c)
	if r.stick != nil || r.phase != "lobby" {
		t.Fatal("one player started a match")
	}
	r = stickTestRoom(2)
	a, b := stickPair(r)
	c = &client{role: "player", playerID: a.ID, send: make(chan []byte, 8)}
	a.Client = c
	raw, _ := json.Marshal(partyInput{Type: "punch"})
	r.applyInput(c, inputEnvelope{Seq: 1, Input: raw})
	health := r.stick.Fighters[b.ID].Health
	r.stick.Clock += 500
	r.applyInput(c, inputEnvelope{Seq: 1, Input: raw})
	if r.stick.Fighters[b.ID].Health != health {
		t.Fatal("duplicate input sequence dealt damage again")
	}
	r.phase = "podium"
	r.applyInput(c, inputEnvelope{Seq: 2, Input: raw})
	if r.stick.Fighters[b.ID].Health != health {
		t.Fatal("input after match completion dealt damage")
	}
}
