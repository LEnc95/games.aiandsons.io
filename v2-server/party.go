package main

import (
	"context"
	cryptorand "crypto/rand"
	"encoding/json"
	"errors"
	"hash/fnv"
	"log"
	"math"
	mathrand "math/rand"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
)

const (
	turboTiltGameKey       = "turbotilt"
	sketchClashGameKey     = "sketchclash"
	partyTickRate          = 30
	partyMaxRooms          = 100
	partyMaxPlayers        = 8
	partyMaxDisplays       = 16
	partyMaxAudience       = 64
	partyMinPlayers        = 2
	partyCountdownMs       = int64(3000)
	partyHeatMs            = int64(45000)
	partyIntermissionMs    = int64(8000)
	partyHostReconnectMs   = int64(60000)
	partyEndedRetentionMs  = int64(120000)
	partyLobbyExpirationMs = int64(900000)
)

var partyPlacementPoints = []int{10, 8, 6, 5, 4, 3, 2, 1}

type partyInput struct {
	Type          string               `json:"type"`
	Value         float64              `json:"value,omitempty"`
	Action        string               `json:"action,omitempty"`
	PlayerID      string               `json:"playerId,omitempty"`
	PartySettings partySessionSettings `json:"partySettings,omitempty"`
	Choice        string               `json:"choice,omitempty"`
	Emote         string               `json:"emote,omitempty"`
	Settings      partySettings        `json:"settings,omitempty"`
	Customization partyCustomization   `json:"customization,omitempty"`
	OptionID      string               `json:"optionId,omitempty"`
	Ready         bool                 `json:"ready,omitempty"`
	RoundID       string               `json:"roundId,omitempty"`
	Guess         string               `json:"guess,omitempty"`
	Stroke        sketchStroke         `json:"stroke,omitempty"`
}

type partySettings struct {
	Mode          string `json:"mode,omitempty"`
	Heats         int    `json:"heats,omitempty"`
	Chaos         string `json:"chaos,omitempty"`
	TrackRotation string `json:"trackRotation,omitempty"`
	Accessibility bool   `json:"accessibility,omitempty"`
}

type partyCustomization struct {
	Car   string `json:"car,omitempty"`
	Trail string `json:"trail,omitempty"`
	Horn  string `json:"horn,omitempty"`
}

type partyObstacle struct {
	ID       string  `json:"id"`
	Kind     string  `json:"kind"`
	Distance float64 `json:"distance"`
	X        float64 `json:"x"`
	Width    float64 `json:"width"`
	Motion   float64 `json:"motion,omitempty"`
	Reward   int     `json:"reward,omitempty"`
}

type partyRoute struct {
	ID       string  `json:"id"`
	Start    float64 `json:"start"`
	End      float64 `json:"end"`
	RiskSide int     `json:"riskSide"`
}

type partyReplayFrame struct {
	At      int64              `json:"at"`
	Players []partyReplayRacer `json:"players"`
}

type partyReplayRacer struct {
	ID       string  `json:"id"`
	X        float64 `json:"x"`
	Distance float64 `json:"distance"`
}

type partyPlayer struct {
	ID               string
	Token            string
	Name             string
	Color            string
	Avatar           string
	Client           *client
	Connected        bool
	Ready            bool
	Queued           bool
	Active           bool
	X                float64
	Steer            float64
	Distance         float64
	Points           int
	HeatPoints       int
	Rank             int
	BarrierHits      int
	TotalBarrierHits int
	BoostCharges     int
	BoostsUsed       int
	BoostUntil       int64
	SlowUntil        int64
	LastSeq          int
	LastSteerAt      int64
	LastRateErrorAt  int64
	HitObstacleIDs   map[string]bool
	HitRouteIDs      map[string]bool
	EnergyPickups    int
	LastEventID      uint64
	LastEventType    string
	LastEventAt      int64
	LastEventObject  string
	Gadget           string
	NextGadget       string
	GadgetAvailable  bool
	ShieldActive     bool
	MagnetUntil      int64
	OverchargeUntil  int64
	Streak           int
	BestStreak       int
	StylePoints      int
	TotalStylePoints int
	Car              string
	Trail            string
	Horn             string
	Emote            string
	EmoteAt          int64
	Team             int
	Eliminated       bool
	Driving          bool
	StartRank        int
	PartyPoints      int
	PartyRank        int
	ActivityWins     int
	PartyAward       int
}

type partyAudienceMember struct {
	ID        string
	Token     string
	Name      string
	Avatar    string
	Client    *client
	Connected bool
	LastSeq   int
	Vote      string
	Reaction  string
	ReactedAt int64
}

type partyRoom struct {
	mu                  sync.Mutex
	hub                 *hub
	gameKey             string
	roomID              string
	host                *client
	hostToken           string
	hostDisconnectedAt  int64
	players             map[string]*partyPlayer
	audience            map[string]*partyAudienceMember
	displays            map[string]*client
	tokenToPlayer       map[string]string
	tokenToAudience     map[string]string
	blockedTokens       map[string]bool
	locked              bool
	allowLateJoin       bool
	maxPlayers          int
	friendlyNames       bool
	audienceEnabled     bool
	moderationLevel     string
	partyConfig         partySessionSettings
	phase               string
	resumePhase         string
	pauseReason         string
	pauseRemainingMs    int64
	phaseEndsAt         int64
	heat                int
	totalHeats          int
	obstacles           []partyObstacle
	tick                uint64
	createdAt           int64
	lastActive          int64
	endedAt             int64
	totalBoosts         int
	settings            partySettings
	track               string
	modifier            string
	voteOptions         []string
	votes               map[string]string
	routes              []partyRoute
	sharedHealth        int
	raceStartedAt       int64
	nextChaosAt         int64
	replayFrames        []partyReplayFrame
	awards              []map[string]any
	crowd               *crowdShiftState
	stick               *stickTiltState
	sketch              *sketchClashState
	sessionMode         string
	partyPhase          string
	resumePartyPhase    string
	activityIndex       int
	activity            partyActivity
	lastActivityID      string
	activityHistory     []string
	partyHighlights     []partyHighlight
	partyVote           partyVoteState
	partyAwarded        bool
	activitySkipped     bool
	lastPersistedAt     int64
	persistenceInFlight bool
	removed             bool
}

func (c *client) currentRoomID() string {
	if c.partyRoom != nil {
		return c.partyRoom.roomID
	}
	if c.audioRoom != nil {
		return c.audioRoom.roomID
	}
	return ""
}

func (c *client) leaveCurrentRoom() {
	if room := c.partyRoom; room != nil {
		room.removeClient(c)
		return
	}
	if room := c.audioRoom; room != nil {
		room.removeClient(c)
	}
}

func (h *hub) handlePartyJoin(c *client, msg envelope, payload joinPayload) {
	c.gameID = partyGameID
	role := strings.ToLower(strings.TrimSpace(payload.Role))
	roomID := sanitizePartyRoomID(firstNonEmpty(msg.RoomID, payload.RoomID))

	if role == "host" {
		if roomID == "" {
			gameKey := strings.ToLower(strings.TrimSpace(payload.GameKey))
			if !isSupportedPartyGame(gameKey) && gameKey != partyRotationGameKey {
				c.sendErrorCode("", "unsupported_game", "That party game is not available.")
				return
			}
			room, ok := h.createPartyRoom(gameKey)
			if !ok {
				c.sendErrorCode("", "server_busy", "All party rooms are currently in use.")
				return
			}
			room.attachHost(c, "")
			return
		}

		room := h.findPartyRoom(roomID)
		if room == nil {
			c.sendErrorCode(roomID, "room_not_found", "That room is no longer available.")
			return
		}
		if payload.Token == "" {
			c.sendErrorCode(roomID, "invalid_host_token", "This host session cannot be resumed on this device.")
			return
		}
		room.attachHost(c, payload.Token)
		return
	}

	if role != "player" && role != "display" && role != "audience" {
		c.sendErrorCode(roomID, "invalid_role", "Choose host, player, audience, or display before joining.")
		return
	}
	if roomID == "" {
		c.sendErrorCode("", "invalid_room", "Enter a four-letter room code.")
		return
	}
	room := h.findPartyRoom(roomID)
	if room == nil {
		c.sendErrorCode(roomID, "room_not_found", "Room not found. Check the four-letter code.")
		return
	}
	if role == "display" {
		room.attachDisplay(c)
		return
	}
	if role == "audience" {
		room.attachAudience(c, payload.PlayerName, payload.PlayerAvatar, payload.Token)
		return
	}
	room.attachPlayer(c, payload.PlayerName, payload.PlayerAvatar, payload.Token)
}

func (h *hub) createPartyRoom(gameKey string) (*partyRoom, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.partyRooms) >= partyMaxRooms {
		return nil, false
	}
	roomID := ""
	for attempts := 0; attempts < 64; attempts++ {
		candidate := randomPartyCode()
		if _, exists := h.partyRooms[candidate]; !exists {
			roomID = candidate
			break
		}
	}
	if roomID == "" {
		return nil, false
	}
	now := nowMillis()
	room := &partyRoom{
		hub:             h,
		gameKey:         gameKey,
		roomID:          roomID,
		hostToken:       randomID(16),
		players:         make(map[string]*partyPlayer),
		audience:        make(map[string]*partyAudienceMember),
		displays:        make(map[string]*client),
		tokenToPlayer:   make(map[string]string),
		tokenToAudience: make(map[string]string),
		blockedTokens:   make(map[string]bool),
		allowLateJoin:   true,
		maxPlayers:      partyMaxPlayers,
		audienceEnabled: true,
		moderationLevel: "standard",
		partyConfig:     defaultPartySessionSettings(),
		phase:           "lobby",
		totalHeats:      3,
		createdAt:       now,
		lastActive:      now,
		settings: partySettings{
			Mode: "classic", Heats: 3, Chaos: "standard", TrackRotation: "all",
		},
		votes: make(map[string]string),
	}
	if gameKey == partyRotationGameKey {
		room.sessionMode = partyRotationSessionMode
		room.partyPhase = "party_lobby"
	} else {
		room.sessionMode = partyStandaloneSessionMode
		room.partyPhase = "activity"
	}
	if gameKey == crowdShiftGameKey {
		room.crowd = newCrowdShiftState()
	} else if gameKey == sketchClashGameKey {
		room.sketch = newSketchClashState()
	}
	h.partyRooms[roomID] = room
	var initialSnapshot *partyRoomSnapshot
	if h.partyStore != nil {
		room.persistenceInFlight = true
		room.lastPersistedAt = now
		initialSnapshot = room.snapshotForPersistenceLocked(now)
	}
	go room.loop()
	if initialSnapshot != nil {
		go room.persistSnapshot(initialSnapshot)
	}
	return room, true
}

func (r *partyRoom) attachDisplay(c *client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.displays) >= partyMaxDisplays {
		c.sendErrorCode(r.roomID, "display_full", "This room already has the maximum number of shared screens.")
		return
	}
	if c.partyRoom != r {
		c.leaveCurrentRoom()
	}
	c.gameID = partyGameID
	c.role = "display"
	c.playerID = ""
	c.partyRoom = r
	r.displays[c.id] = c
	r.lastActive = nowMillis()
	c.sendEnvelope("welcome", r.roomID, map[string]any{
		"role": "display", "roomId": r.roomID, "gameKey": r.gameKey,
		"sessionMode": r.sessionMode,
	})
}

func (h *hub) findPartyRoom(roomID string) *partyRoom {
	h.mu.Lock()
	room := h.partyRooms[roomID]
	h.mu.Unlock()
	if room != nil || h.partyStore == nil {
		return room
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	snapshot, err := h.partyStore.Load(ctx, roomID)
	if err != nil {
		if !errors.Is(err, errPartyRoomSnapshotNotFound) {
			log.Printf("party room %s recovery failed: %v", roomID, err)
		}
		return nil
	}
	restored := restorePartyRoom(h, snapshot)
	h.mu.Lock()
	if existing := h.partyRooms[roomID]; existing != nil {
		h.mu.Unlock()
		return existing
	}
	if len(h.partyRooms) >= partyMaxRooms {
		h.mu.Unlock()
		return nil
	}
	h.partyRooms[roomID] = restored
	h.mu.Unlock()
	go restored.loop()
	return restored
}

func (h *hub) removePartyRoom(roomID string, expected *partyRoom) {
	h.mu.Lock()
	removed := false
	if h.partyRooms[roomID] == expected {
		delete(h.partyRooms, roomID)
		removed = true
	}
	h.mu.Unlock()
	if !removed {
		return
	}
	expected.mu.Lock()
	expected.removed = true
	expected.mu.Unlock()
	if h.partyStore != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := h.partyStore.Delete(ctx, roomID); err != nil {
				log.Printf("party room %s snapshot deletion failed: %v", roomID, err)
			}
		}()
	}
}

func (r *partyRoom) attachHost(c *client, token string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if token != "" && token != r.hostToken {
		c.sendErrorCode(r.roomID, "invalid_host_token", "This host session cannot be resumed.")
		return
	}
	if r.host != nil && r.host != c {
		c.sendErrorCode(r.roomID, "host_exists", "This room already has a host.")
		return
	}
	if c.partyRoom != r {
		c.leaveCurrentRoom()
	}
	c.gameID = partyGameID
	c.role = "host"
	c.playerID = ""
	c.partyRoom = r
	r.host = c
	r.lastActive = nowMillis()
	wasDisconnected := r.hostDisconnectedAt > 0
	r.hostDisconnectedAt = 0
	if wasDisconnected && r.phase == "paused" && r.pauseReason == "host_disconnected" {
		r.resumeLocked(nowMillis())
	}
	c.sendEnvelope("welcome", r.roomID, map[string]any{
		"role": "host", "roomId": r.roomID, "gameKey": r.gameKey,
		"token": r.hostToken, "sessionMode": r.sessionMode, "reconnected": wasDisconnected,
	})
}

func (r *partyRoom) attachPlayer(c *client, requestedName, requestedAvatar, token string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if token != "" {
		if r.blockedTokens[token] {
			c.sendErrorCode(r.roomID, "removed_from_room", "The host removed you from this room.")
			return
		}
		if playerID := r.tokenToPlayer[token]; playerID != "" {
			if p := r.players[playerID]; p != nil {
				if p.Client != nil && p.Client != c {
					p.Client.partyRoom = nil
				}
				if c.partyRoom != r {
					c.leaveCurrentRoom()
				}
				c.gameID = partyGameID
				c.role = "player"
				c.playerID = p.ID
				c.partyRoom = r
				p.Client = c
				p.Connected = true
				p.LastSeq = 0
				p.LastSteerAt = 0
				p.LastRateErrorAt = 0
				r.lastActive = nowMillis()
				r.sendPlayerWelcomeLocked(c, p, false, true)
				return
			}
		}
		c.sendErrorCode(r.roomID, "invalid_player_token", "Your saved player session has expired.")
		return
	}
	if r.locked {
		c.sendErrorCode(r.roomID, "room_locked", "This room is locked by the host.")
		return
	}
	if !r.allowLateJoin && r.partyHasStartedLocked() {
		c.sendErrorCode(r.roomID, "late_join_disabled", "The host has turned off late joining.")
		return
	}
	if (r.sessionMode == partyRotationSessionMode && r.partyPhase == "ended") ||
		(r.sessionMode != partyRotationSessionMode && (r.phase == "ended" || r.phase == "podium")) {
		c.sendErrorCode(r.roomID, "room_expired", "That game has already ended.")
		return
	}

	if len(r.players) >= r.maxPlayerCountLocked() {
		c.sendErrorCode(r.roomID, "room_full", "This room has reached its player limit.")
		return
	}
	if c.partyRoom != r {
		c.leaveCurrentRoom()
	}
	name, adjusted := r.uniquePlayerNameLocked(requestedName)
	id := "r-" + randomID(6)
	playerToken := randomID(16)
	queued := r.phase != "lobby" && r.phase != "intermission"
	active := r.phase == "intermission"
	if r.sessionMode == partyRotationSessionMode {
		queued = r.partyPhase == "activity" || r.partyPhase == "spinning" || r.partyPhase == "next_up"
		active = r.partyPhase == "party_lobby" || r.partyPhase == "voting"
	}
	p := &partyPlayer{
		ID:             id,
		Token:          playerToken,
		Name:           name,
		Color:          partyPlayerColor(len(r.players)),
		Avatar:         partyPlayerAvatar(requestedAvatar, len(r.players)),
		Client:         c,
		Connected:      true,
		Queued:         queued,
		Active:         active,
		BoostCharges:   1,
		HitObstacleIDs: make(map[string]bool),
		HitRouteIDs:    make(map[string]bool),
		NextGadget:     "shield",
		Gadget:         "shield",
		Car:            "comet",
		Trail:          "sparks",
		Horn:           "beep",
		Team:           len(r.players) % 2,
	}
	r.players[id] = p
	r.tokenToPlayer[playerToken] = id
	c.gameID = partyGameID
	c.role = "player"
	c.playerID = id
	c.partyRoom = r
	r.lastActive = nowMillis()
	r.sendPlayerWelcomeLocked(c, p, adjusted, false)
}

func (r *partyRoom) sendPlayerWelcomeLocked(c *client, p *partyPlayer, adjusted, reconnected bool) {
	c.sendEnvelope("welcome", r.roomID, map[string]any{
		"role": "player", "roomId": r.roomID, "gameKey": r.gameKey,
		"playerId": p.ID, "playerName": p.Name, "playerColor": p.Color, "playerAvatar": p.Avatar,
		"token": p.Token, "queued": p.Queued, "nameAdjusted": adjusted, "reconnected": reconnected,
		"sessionMode": r.sessionMode,
	})
}

func (r *partyRoom) attachAudience(c *client, requestedName, requestedAvatar, token string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if !r.audienceEnabled {
		c.sendErrorCode(r.roomID, "audience_disabled", "The host has closed the audience for this room.")
		return
	}
	if token != "" {
		if memberID := r.tokenToAudience[token]; memberID != "" {
			if member := r.audience[memberID]; member != nil {
				if member.Client != nil && member.Client != c {
					member.Client.partyRoom = nil
					member.Client.audienceID = ""
				}
				if c.partyRoom != r {
					c.leaveCurrentRoom()
				}
				c.gameID, c.role, c.playerID, c.audienceID, c.partyRoom = partyGameID, "audience", "", member.ID, r
				member.Client, member.Connected, member.LastSeq = c, true, 0
				r.lastActive = nowMillis()
				r.sendAudienceWelcomeLocked(c, member, false, true)
				return
			}
		}
		c.sendErrorCode(r.roomID, "invalid_audience_token", "Your saved audience session has expired.")
		return
	}
	connected := 0
	for _, member := range r.audience {
		if member.Connected {
			connected++
		}
	}
	if connected >= partyMaxAudience {
		c.sendErrorCode(r.roomID, "audience_full", "This room's audience is full.")
		return
	}
	if c.partyRoom != r {
		c.leaveCurrentRoom()
	}
	name, adjusted := r.uniqueAudienceNameLocked(requestedName)
	member := &partyAudienceMember{
		ID: "a-" + randomID(6), Token: randomID(16), Name: name,
		Avatar: partyPlayerAvatar(requestedAvatar, len(r.audience)), Client: c, Connected: true,
	}
	r.audience[member.ID] = member
	r.tokenToAudience[member.Token] = member.ID
	c.gameID, c.role, c.playerID, c.audienceID, c.partyRoom = partyGameID, "audience", "", member.ID, r
	r.lastActive = nowMillis()
	r.sendAudienceWelcomeLocked(c, member, adjusted, false)
}

func (r *partyRoom) sendAudienceWelcomeLocked(c *client, member *partyAudienceMember, adjusted, reconnected bool) {
	c.sendEnvelope("welcome", r.roomID, map[string]any{
		"role": "audience", "roomId": r.roomID, "gameKey": r.gameKey,
		"audienceId": member.ID, "playerName": member.Name, "playerAvatar": member.Avatar,
		"token": member.Token, "nameAdjusted": adjusted, "reconnected": reconnected,
		"sessionMode": r.sessionMode,
	})
}

func (r *partyRoom) removeClient(c *client) {
	r.mu.Lock()
	now := nowMillis()
	if c.role == "host" && r.host == c {
		r.host = nil
		r.hostDisconnectedAt = now
		if r.sessionMode == partyRotationSessionMode && r.partyPhase != "party_lobby" && r.partyPhase != "ended" ||
			containsString([]string{"countdown", "racing", "fighting", "choosing", "reveal", "intermission"}, r.phase) {
			r.pauseLocked("host_disconnected", now)
		}
	} else if c.role == "display" {
		delete(r.displays, c.id)
	} else if c.role == "audience" && c.audienceID != "" {
		if member := r.audience[c.audienceID]; member != nil && member.Client == c {
			member.Client = nil
			member.Connected = false
		}
	} else if c.playerID != "" {
		if p := r.players[c.playerID]; p != nil && p.Client == c {
			p.Client = nil
			p.Connected = false
			p.Steer = 0
			delete(r.partyVote.Votes, p.ID)
		}
	}
	r.lastActive = now
	r.mu.Unlock()
	if c.partyRoom == r {
		c.partyRoom = nil
		c.audienceID = ""
	}
}

func (r *partyRoom) applyInput(c *client, payload inputEnvelope) {
	var input partyInput
	if err := json.Unmarshal(payload.Input, &input); err != nil {
		c.sendErrorCode(r.roomID, "malformed_input", "The controller input was not understood.")
		return
	}
	input.Type = strings.ToLower(strings.TrimSpace(input.Type))
	now := nowMillis()
	r.mu.Lock()
	defer r.mu.Unlock()
	r.lastActive = now
	if c.role == "display" {
		c.sendErrorCode(r.roomID, "display_read_only", "Shared screens follow the host and cannot control the game.")
		return
	}
	if c.role == "audience" {
		member := r.audience[c.audienceID]
		if member == nil || member.Client != c {
			c.sendErrorCode(r.roomID, "invalid_audience_token", "Rejoin the audience before participating.")
			return
		}
		if payload.Seq <= member.LastSeq {
			return
		}
		member.LastSeq = payload.Seq
		switch input.Type {
		case "party_vote":
			if r.partyPhase != "voting" || !r.partyVoteHasOptionLocked(strings.TrimSpace(input.OptionID)) {
				c.sendErrorCode(r.roomID, "vote_closed", "Audience voting is not open right now.")
				return
			}
			member.Vote = strings.TrimSpace(input.OptionID)
		case "audience_reaction":
			if now-member.ReactedAt < 750 || !containsString([]string{"clap", "laugh", "wow", "heart"}, input.Emote) {
				return
			}
			member.Reaction, member.ReactedAt = input.Emote, now
		default:
			c.sendErrorCode(r.roomID, "audience_read_only", "Audience members can vote and react.")
		}
		return
	}

	if c.role == "host" {
		if r.host != c || input.Type != "host" {
			c.sendErrorCode(r.roomID, "unauthorized_host_action", "Only the room host can do that.")
			return
		}
		if r.applyRoomHostActionLocked(input, c) {
			return
		}
		if r.gameKey == turboTiltGameKey && strings.EqualFold(strings.TrimSpace(input.Action), "configure") {
			r.configureLocked(input.Settings, c)
		} else {
			r.applyHostActionLocked(strings.ToLower(strings.TrimSpace(input.Action)), now, c)
		}
		return
	}
	p := r.players[c.playerID]
	if p == nil || p.Client != c {
		c.sendErrorCode(r.roomID, "invalid_player_token", "Rejoin the room before sending input.")
		return
	}
	if payload.Seq <= p.LastSeq {
		return
	}
	p.LastSeq = payload.Seq
	if r.sessionMode == partyRotationSessionMode && input.Type == "party_vote" {
		r.applyPartyVoteLocked(p, input.OptionID, c)
		return
	}
	if r.sessionMode == partyRotationSessionMode && input.Type == "party_ready" {
		if r.partyPhase != "party_lobby" {
			c.sendErrorCode(r.roomID, "invalid_phase", "Ready status only changes in the party lobby.")
			return
		}
		p.Ready = input.Ready
		return
	}
	if r.gameKey == stickTiltGameKey {
		r.applyStickTiltInputLocked(p, input, c)
		return
	}
	if r.gameKey == crowdShiftGameKey {
		r.applyCrowdShiftPlayerInputLocked(p, input, now, c)
		return
	}
	if r.gameKey == sketchClashGameKey {
		r.applySketchClashPlayerInputLocked(p, input, now, c)
		return
	}
	switch input.Type {
	case "steer":
		if now-p.LastSteerAt < 60 {
			if now-p.LastRateErrorAt >= 1000 {
				p.LastRateErrorAt = now
				c.sendErrorCode(r.roomID, "rate_limited", "Steering updates are limited to 15 per second.")
			}
			return
		}
		p.LastSteerAt = now
		if math.IsNaN(input.Value) || math.IsInf(input.Value, 0) {
			return
		}
		p.Steer = clampFloat(input.Value, -1, 1)
	case "boost":
		if r.phase != "racing" || !p.Active || p.BoostCharges <= 0 || now < p.BoostUntil {
			return
		}
		p.BoostCharges--
		p.BoostUntil = now + 1250
		p.BoostsUsed++
		r.totalBoosts++
		if p.Streak >= 3 {
			p.StylePoints++
			p.TotalStylePoints++
			r.recordPlayerEventLocked(p, "turbo_chain", "boost", now)
		}
	case "gadget":
		r.applyGadgetInputLocked(p, input.Action, input.Choice, now)
	case "vote":
		if r.phase == "intermission" && containsString(r.voteOptions, input.Choice) {
			r.votes[p.ID] = input.Choice
		}
	case "customize":
		p.Car = allowedChoice(input.Customization.Car, []string{"comet", "buggy", "rocket"}, p.Car)
		p.Trail = allowedChoice(input.Customization.Trail, []string{"sparks", "rainbow", "bubbles"}, p.Trail)
		p.Horn = allowedChoice(input.Customization.Horn, []string{"beep", "airhorn", "chime"}, p.Horn)
	case "emote":
		if now-p.EmoteAt >= 1000 && containsString([]string{"fire", "wow", "laugh", "clap"}, input.Emote) {
			p.Emote = input.Emote
			p.EmoteAt = now
		}
	case "horn":
		if now-p.EmoteAt >= 1000 {
			p.EmoteAt = now
			r.recordPlayerEventLocked(p, "horn", p.Horn, now)
		}
	default:
		c.sendErrorCode(r.roomID, "unsupported_input", "That controller action is not supported.")
	}
}

func (r *partyRoom) applyRoomHostActionLocked(input partyInput, c *client) bool {
	action := strings.ToLower(strings.TrimSpace(input.Action))
	switch action {
	case "lock":
		r.locked = true
	case "unlock":
		r.locked = false
	case "late_join_on":
		r.allowLateJoin = true
	case "late_join_off":
		r.allowLateJoin = false
	case "friendly_names_on":
		r.friendlyNames = true
	case "friendly_names_off":
		r.friendlyNames = false
	case "audience_on":
		r.audienceEnabled = true
	case "audience_off":
		r.audienceEnabled = false
	case "set_moderation":
		level := strings.ToLower(strings.TrimSpace(input.Choice))
		if !containsString([]string{"standard", "family"}, level) {
			c.sendErrorCode(r.roomID, "invalid_moderation", "Choose standard or family-safe moderation.")
			return true
		}
		r.moderationLevel = level
	case "set_max_players":
		limit := int(input.Value)
		if math.Trunc(input.Value) != input.Value || limit < partyMinPlayers || limit > partyMaxPlayers {
			c.sendErrorCode(r.roomID, "invalid_player_limit", "Choose a player limit from 2 to 8.")
			return true
		}
		if limit < len(r.players) {
			c.sendErrorCode(r.roomID, "invalid_player_limit", "The player limit cannot be lower than the current roster.")
			return true
		}
		r.maxPlayers = limit
	case "configure_party":
		if r.sessionMode != partyRotationSessionMode {
			c.sendErrorCode(r.roomID, "unsupported_input", "Party presets are available in Party Mode rooms.")
			return true
		}
		if r.partyPhase != "party_lobby" {
			c.sendErrorCode(r.roomID, "invalid_phase", "Party setup can only change before the party starts.")
			return true
		}
		settings, ok := validatePartySessionSettings(input.PartySettings)
		if !ok {
			c.sendErrorCode(r.roomID, "invalid_party_settings", "Choose supported party and accessibility settings.")
			return true
		}
		r.partyConfig = settings
		if settings.TeamMode == "two" {
			r.balancePartyTeamsLocked(false)
		}
	case "shuffle_teams":
		if r.sessionMode != partyRotationSessionMode || r.partyPhase != "party_lobby" || r.partySessionSettingsLocked().TeamMode != "two" {
			c.sendErrorCode(r.roomID, "invalid_phase", "Teams can only be shuffled in a team party lobby.")
			return true
		}
		r.balancePartyTeamsLocked(true)
	case "choose_activity":
		if r.sessionMode != partyRotationSessionMode || r.partyPhase != "voting" || r.partySessionSettingsLocked().SelectionMethod != "host" {
			c.sendErrorCode(r.roomID, "invalid_phase", "Host choice is not available right now.")
			return true
		}
		if !r.selectPartyActivityLocked(strings.TrimSpace(input.OptionID), nowMillis(), "host") {
			c.sendErrorCode(r.roomID, "invalid_vote", "Choose one of the available activities.")
		}
	case "kick":
		playerID := strings.TrimSpace(input.PlayerID)
		p := r.players[playerID]
		if p == nil {
			c.sendErrorCode(r.roomID, "player_not_found", "That player is no longer in the room.")
			return true
		}
		delete(r.tokenToPlayer, p.Token)
		if r.blockedTokens == nil {
			r.blockedTokens = make(map[string]bool)
		}
		r.blockedTokens[p.Token] = true
		delete(r.players, playerID)
		delete(r.votes, playerID)
		delete(r.partyVote.Votes, playerID)
		r.removeCrowdShiftPlayerLocked(playerID)
		victim := p.Client
		p.Client = nil
		p.Connected = false
		if victim != nil {
			victim.sendErrorCode(r.roomID, "removed_from_room", "The host removed you from this room.")
			victim.partyRoom = nil
			victim.playerID = ""
		}
	default:
		return false
	}
	return true
}

func (r *partyRoom) removeCrowdShiftPlayerLocked(playerID string) {
	if r.crowd == nil {
		return
	}
	delete(r.crowd.Choices, playerID)
	delete(r.crowd.Predictions, playerID)
	delete(r.crowd.HotTakes, playerID)
	delete(r.crowd.HotTakeAvailable, playerID)
	delete(r.crowd.ReadStreaks, playerID)
	delete(r.crowd.ReadCorrect, playerID)
	delete(r.crowd.ReadPoints, playerID)
	delete(r.crowd.ObjectivePoints, playerID)
	delete(r.crowd.StealPoints, playerID)
}

func (r *partyRoom) configureLocked(settings partySettings, c *client) {
	if r.phase != "lobby" && r.phase != "podium" && r.phase != "ended" {
		c.sendErrorCode(r.roomID, "invalid_phase", "Game settings can only change between matches.")
		return
	}
	r.settings.Mode = allowedChoice(settings.Mode, []string{"classic", "elimination", "teams", "relay", "survival", "chaos"}, "classic")
	if settings.Heats < 2 {
		settings.Heats = 2
	}
	if settings.Heats > 5 {
		settings.Heats = 5
	}
	r.settings.Heats = settings.Heats
	r.settings.Chaos = allowedChoice(settings.Chaos, []string{"low", "standard", "wild"}, "standard")
	r.settings.TrackRotation = allowedChoice(settings.TrackRotation, []string{"all", "random", "neon", "glacier", "volcano", "space"}, "all")
	r.settings.Accessibility = settings.Accessibility
	r.totalHeats = r.settings.Heats
}

func (r *partyRoom) applyGadgetInputLocked(p *partyPlayer, action, choice string, now int64) {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "select":
		if r.phase == "lobby" || r.phase == "intermission" || r.phase == "countdown" {
			p.NextGadget = allowedChoice(choice, []string{"shield", "magnet", "overcharge", "repair"}, p.NextGadget)
			if r.phase == "countdown" {
				p.Gadget = p.NextGadget
			}
		}
	case "use":
		if r.phase != "racing" || !p.Active || !p.GadgetAvailable {
			return
		}
		p.GadgetAvailable = false
		switch p.Gadget {
		case "shield":
			p.ShieldActive = true
			r.recordPlayerEventLocked(p, "shield_ready", "shield", now)
		case "magnet":
			p.MagnetUntil = now + 4000
			r.recordPlayerEventLocked(p, "magnet", "magnet", now)
		case "overcharge":
			p.OverchargeUntil = now + 1750
			p.BoostUntil = p.OverchargeUntil
			p.BoostsUsed++
			r.totalBoosts++
			r.recordPlayerEventLocked(p, "overcharge", "overcharge", now)
		case "repair":
			p.SlowUntil = 0
			if p.BoostCharges < 3 {
				p.BoostCharges++
			}
			r.recordPlayerEventLocked(p, "repair", "repair", now)
		}
	}
}

func (r *partyRoom) recordPlayerEventLocked(p *partyPlayer, eventType, object string, now int64) {
	p.LastEventID++
	p.LastEventType = eventType
	p.LastEventAt = now
	p.LastEventObject = object
}

func (r *partyRoom) applyHostActionLocked(action string, now int64, c *client) {
	if r.sessionMode == partyRotationSessionMode {
		r.applyRotationHostActionLocked(action, now, c)
		return
	}
	if r.gameKey == stickTiltGameKey {
		r.applyStickTiltHostActionLocked(action, now, c)
		return
	}
	if r.gameKey == crowdShiftGameKey {
		r.applyCrowdShiftHostActionLocked(action, now, c)
		return
	}
	if r.gameKey == sketchClashGameKey {
		r.applySketchClashHostActionLocked(action, now, c)
		return
	}
	switch action {
	case "start":
		if r.phase != "lobby" && r.phase != "podium" && r.phase != "ended" {
			c.sendErrorCode(r.roomID, "invalid_phase", "The session has already started.")
			return
		}
		if r.connectedPlayerCountLocked() < partyMinPlayers {
			c.sendErrorCode(r.roomID, "not_enough_players", "At least two racers must be connected.")
			return
		}
		r.heat = 1
		r.totalHeats = r.settings.Heats
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
			p.Queued = false
			p.Eliminated = false
			p.Team = index % 2
			p.StartRank = index + 1
			p.TotalStylePoints = 0
			p.TotalBarrierHits = 0
		}
		r.startCountdownLocked(now)
	case "pause":
		if r.phase != "countdown" && r.phase != "racing" && r.phase != "intermission" {
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

func (r *partyRoom) pauseLocked(reason string, now int64) {
	if r.phase == "paused" {
		return
	}
	r.resumePhase = r.phase
	if r.sessionMode == partyRotationSessionMode {
		r.resumePartyPhase = r.partyPhase
		r.partyPhase = "paused"
	}
	r.pauseRemainingMs = maxInt64(0, r.phaseEndsAt-now)
	r.pauseReason = reason
	r.phase = "paused"
	r.phaseEndsAt = 0
}

func (r *partyRoom) resumeLocked(now int64) {
	if r.phase != "paused" {
		return
	}
	r.phase = r.resumePhase
	if r.sessionMode == partyRotationSessionMode {
		r.partyPhase = r.resumePartyPhase
		r.resumePartyPhase = ""
	}
	r.phaseEndsAt = now + r.pauseRemainingMs
	r.resumePhase = ""
	r.pauseReason = ""
	r.pauseRemainingMs = 0
}

func (r *partyRoom) loop() {
	ticker := time.NewTicker(time.Second / partyTickRate)
	defer ticker.Stop()
	last := time.Now()
	for nowTime := range ticker.C {
		now := nowTime.UnixMilli()
		dt := nowTime.Sub(last).Seconds()
		if dt <= 0 || dt > 0.15 {
			dt = 1.0 / partyTickRate
		}
		last = nowTime
		r.step(now, dt)
		r.broadcastState()
		if r.shouldExpire(now) {
			r.hub.removePartyRoom(r.roomID, r)
			return
		}
	}
}

func (r *partyRoom) step(now int64, dt float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tick++
	if r.hostDisconnectedAt > 0 && now-r.hostDisconnectedAt >= partyHostReconnectMs {
		r.phase = "ended"
		r.partyPhase = "ended"
		r.endedAt = now - partyEndedRetentionMs
		return
	}
	if r.sessionMode == partyRotationSessionMode {
		r.stepRotationLocked(now, dt)
		return
	}
	if r.gameKey == stickTiltGameKey {
		r.stepStickTiltLocked(now, dt)
		return
	}
	if r.gameKey == crowdShiftGameKey {
		r.stepCrowdShiftLocked(now)
		return
	}
	if r.gameKey == sketchClashGameKey {
		r.stepSketchClashLocked(now)
		return
	}
	r.stepTurboTiltLocked(now, dt)
}

func (r *partyRoom) stepTurboTiltLocked(now int64, dt float64) {
	if r.phase == "paused" || r.phase == "lobby" || r.phase == "podium" || r.phase == "ended" {
		return
	}
	if r.phase == "countdown" && now >= r.phaseEndsAt {
		r.phase = "racing"
		r.phaseEndsAt = now + r.partyDurationLocked(partyHeatMs)
		r.raceStartedAt = now
		r.nextChaosAt = now + 10000
	}
	if r.phase == "intermission" && now >= r.phaseEndsAt {
		r.heat++
		r.startCountdownLocked(now)
	}
	if r.phase != "racing" {
		return
	}
	if r.settings.Mode == "chaos" && now >= r.nextChaosAt {
		modifiers := []string{"double_energy", "moving_barriers", "mirror", "super_boost", "fog", "sudden_death"}
		r.modifier = modifiers[int(r.tick/300)%len(modifiers)]
		r.nextChaosAt = now + 10000
	}
	if r.settings.Mode == "relay" {
		r.updateRelayDriversLocked(now)
	}
	for _, p := range r.players {
		if !p.Active {
			continue
		}
		steer := p.Steer
		if r.settings.Mode == "relay" && !p.Driving {
			steer = 0
		}
		if r.modifier == "mirror" {
			steer *= -1
		}
		steerFactor := 1.55
		if r.track == "glacier" {
			steerFactor = 1.9
			steer += math.Sin(float64(now)/420+float64(len(p.ID))) * 0.08
		}
		p.X = clampFloat(p.X+steer*steerFactor*dt, -0.92, 0.92)
		speed := 100.0
		if !p.Connected {
			speed *= 0.6
		}
		if now < p.OverchargeUntil {
			speed *= 1.5
		} else if now < p.BoostUntil {
			if r.modifier == "super_boost" {
				speed *= 1.55
			} else {
				speed *= 1.35
			}
		}
		if now < p.SlowUntil {
			speed *= 0.6
		}
		previousDistance := p.Distance
		p.Distance += speed * dt
		r.resolveObstaclesLocked(p, previousDistance, now)
		r.resolveRoutesLocked(p, previousDistance, now)
	}
	if r.tick%3 == 0 {
		r.captureReplayLocked(now)
	}
	if r.settings.Mode == "survival" && r.sharedHealth <= 0 {
		r.finishHeatLocked(now)
		return
	}
	if now >= r.phaseEndsAt {
		r.finishHeatLocked(now)
	}
}

func (r *partyRoom) startCountdownLocked(now int64) {
	if r.heat > 1 {
		r.modifier = r.winningVoteLocked()
	}
	r.votes = make(map[string]string)
	r.voteOptions = nil
	r.phase = "countdown"
	r.phaseEndsAt = now + r.partyDurationLocked(partyCountdownMs)
	r.track = r.trackForHeatLocked()
	r.obstacles = buildTurboTiltObstacles(r.roomID, r.heat, r.track, r.settings.Chaos)
	r.routes = buildTurboTiltRoutes(r.roomID, r.heat)
	r.replayFrames = nil
	if r.settings.Mode == "survival" {
		r.sharedHealth = 6
	}
	for _, p := range r.players {
		if p.Queued {
			p.Queued = false
		}
		p.Active = !p.Eliminated
		p.Driving = r.settings.Mode != "relay"
		p.X = 0
		p.Steer = 0
		p.Distance = 0
		p.HeatPoints = 0
		p.Rank = 0
		p.BarrierHits = 0
		p.EnergyPickups = 0
		p.Streak = 0
		p.BestStreak = 0
		p.StylePoints = 0
		p.BoostCharges = 1
		p.BoostUntil = 0
		p.SlowUntil = 0
		p.OverchargeUntil = 0
		p.MagnetUntil = 0
		p.Gadget = p.NextGadget
		p.GadgetAvailable = true
		p.ShieldActive = false
		p.HitObstacleIDs = make(map[string]bool)
		p.HitRouteIDs = make(map[string]bool)
	}
}

func (r *partyRoom) finishHeatLocked(now int64) {
	ordered := r.rankedPlayersLocked(true)
	for index, p := range ordered {
		points := 0
		if index < len(partyPlacementPoints) {
			points = partyPlacementPoints[index]
		}
		p.Rank = index + 1
		styleBonus := p.StylePoints
		if styleBonus > 3 {
			styleBonus = 3
		}
		p.HeatPoints = points + styleBonus
		p.Points += points
		p.Points += styleBonus
	}
	if r.settings.Mode == "elimination" && len(ordered) > 2 {
		ordered[len(ordered)-1].Eliminated = true
		ordered[len(ordered)-1].Active = false
	}
	if r.heat >= r.totalHeats || (r.settings.Mode == "elimination" && r.remainingRacersLocked() <= 1) {
		r.phase = "podium"
		r.phaseEndsAt = 0
		r.endedAt = now
		r.computeAwardsLocked()
		if r.sessionMode == partyRotationSessionMode {
			r.completeRotationActivityLocked(now)
		}
		return
	}
	r.phase = "intermission"
	r.phaseEndsAt = now + r.partyDurationLocked(partyIntermissionMs)
	r.voteOptions = voteOptionsForHeat(r.roomID, r.heat)
}

func (r *partyRoom) resolveObstaclesLocked(p *partyPlayer, previousDistance float64, now int64) {
	for _, obstacle := range r.obstacles {
		if obstacle.Distance <= previousDistance || obstacle.Distance > p.Distance || p.HitObstacleIDs[obstacle.ID] {
			continue
		}
		p.HitObstacleIDs[obstacle.ID] = true
		obstacleX := obstacle.X
		if obstacle.Motion != 0 || r.modifier == "moving_barriers" {
			motion := obstacle.Motion
			if motion == 0 && obstacle.Kind == "barrier" {
				motion = 0.22
			}
			obstacleX = clampFloat(obstacle.X+math.Sin(float64(now)/520+obstacle.Distance)*motion, -0.82, 0.82)
		}
		width := obstacle.Width
		if obstacle.Kind == "energy" && now < p.MagnetUntil {
			width += 0.5
		}
		if math.Abs(p.X-obstacleX) > width {
			p.Streak++
			if p.Streak > p.BestStreak {
				p.BestStreak = p.Streak
			}
			continue
		}
		if obstacle.Kind == "barrier" {
			if p.ShieldActive {
				p.ShieldActive = false
				p.Streak++
				r.recordPlayerEventLocked(p, "shield_block", obstacle.ID, now)
				continue
			}
			p.BarrierHits++
			p.TotalBarrierHits++
			slowMs := int64(1000)
			if r.track == "volcano" {
				slowMs = 1250
			}
			if r.modifier == "sudden_death" && r.phaseEndsAt-now <= 10000 {
				slowMs = 1800
			}
			p.SlowUntil = now + slowMs
			p.Streak = 0
			if r.settings.Mode == "survival" && r.sharedHealth > 0 {
				r.sharedHealth--
			}
			r.recordPlayerEventLocked(p, "barrier", obstacle.ID, now)
		} else if obstacle.Kind == "energy" {
			p.EnergyPickups++
			p.Streak++
			if p.Streak > p.BestStreak {
				p.BestStreak = p.Streak
			}
			gain := 1
			if r.modifier == "double_energy" {
				gain = 2
			}
			if p.BoostCharges < 3 {
				p.BoostCharges += gain
				if p.BoostCharges > 3 {
					p.BoostCharges = 3
				}
				r.recordPlayerEventLocked(p, "energy", obstacle.ID, now)
			} else {
				r.recordPlayerEventLocked(p, "energy_full", obstacle.ID, now)
			}
		} else if obstacle.Kind == "jump" {
			p.StylePoints++
			p.TotalStylePoints++
			p.Streak += 2
			p.BoostUntil = now + 700
			r.recordPlayerEventLocked(p, "jump", obstacle.ID, now)
		}
	}
}

func (r *partyRoom) resolveRoutesLocked(p *partyPlayer, previousDistance float64, now int64) {
	for _, route := range r.routes {
		if route.End <= previousDistance || route.End > p.Distance || p.HitRouteIDs[route.ID] {
			continue
		}
		p.HitRouteIDs[route.ID] = true
		if (route.RiskSide < 0 && p.X < -0.18) || (route.RiskSide > 0 && p.X > 0.18) {
			p.StylePoints += 2
			p.TotalStylePoints += 2
			if p.BoostCharges < 3 {
				p.BoostCharges++
			}
			r.recordPlayerEventLocked(p, "risk_route", route.ID, now)
		}
	}
}

func (r *partyRoom) broadcastState() {
	r.mu.Lock()
	now := nowMillis()
	tick := r.tick
	host := r.host
	displayClients := make([]*client, 0, len(r.displays))
	for _, display := range r.displays {
		displayClients = append(displayClients, display)
	}
	playerClients := make([]*client, 0, len(r.players))
	for _, p := range r.players {
		if p.Client != nil {
			playerClients = append(playerClients, p.Client)
		}
	}
	audienceClients := make([]*client, 0, len(r.audience))
	for _, member := range r.audience {
		if member.Client != nil {
			audienceClients = append(audienceClients, member.Client)
		}
	}
	hostState := r.snapshotLocked("")
	playerStates := make(map[string]map[string]any, len(playerClients))
	for _, c := range playerClients {
		playerStates[c.id] = r.snapshotLocked(c.playerID)
	}
	audienceState := r.snapshotLocked("")
	audienceState["audienceView"] = true
	var checkpoint *partyRoomSnapshot
	if r.hub != nil && r.hub.partyStore != nil && !r.removed && !r.persistenceInFlight && now-r.lastPersistedAt >= partyRoomCheckpointInterval {
		r.persistenceInFlight = true
		r.lastPersistedAt = now
		checkpoint = r.snapshotForPersistenceLocked(now)
	}
	r.mu.Unlock()
	if checkpoint != nil {
		go r.persistSnapshot(checkpoint)
	}
	if host != nil && tick%2 == 0 {
		host.sendEnvelope("state", r.roomID, map[string]any{"state": hostState})
	}
	if tick%2 == 0 {
		for _, display := range displayClients {
			display.sendEnvelope("state", r.roomID, map[string]any{"state": hostState})
		}
	}
	if tick%3 == 0 {
		for _, c := range playerClients {
			c.sendEnvelope("state", r.roomID, map[string]any{"state": playerStates[c.id]})
		}
		for _, c := range audienceClients {
			c.sendEnvelope("state", r.roomID, map[string]any{"state": audienceState})
		}
	}
}

func (r *partyRoom) balancePartyTeamsLocked(shuffle bool) {
	players := make([]*partyPlayer, 0, len(r.players))
	for _, player := range r.players {
		players = append(players, player)
	}
	sort.Slice(players, func(i, j int) bool { return players[i].ID < players[j].ID })
	if shuffle && len(players) > 1 {
		offset := securePartyIndex(len(players))
		players = append(players[offset:], players[:offset]...)
	}
	for index, player := range players {
		player.Team = index % 2
	}
}

func (r *partyRoom) snapshotLocked(selfID string) map[string]any {
	if r.gameKey == stickTiltGameKey {
		return r.decorateRoomControlsLocked(r.decorateRotationSnapshotLocked(r.stickTiltSnapshotLocked(selfID), selfID))
	}
	if r.gameKey == crowdShiftGameKey {
		return r.decorateRoomControlsLocked(r.decorateRotationSnapshotLocked(r.crowdShiftSnapshotLocked(selfID), selfID))
	}
	if r.gameKey == sketchClashGameKey {
		return r.decorateRoomControlsLocked(r.decorateRotationSnapshotLocked(r.sketchClashSnapshotLocked(selfID), selfID))
	}
	if r.gameKey == partyRotationGameKey {
		return r.decorateRoomControlsLocked(r.rotationSnapshotLocked(selfID))
	}
	now := nowMillis()
	ordered := r.rankedPlayersLocked(false)
	players := make([]map[string]any, 0, len(ordered))
	for index, p := range ordered {
		rank := p.Rank
		if r.phase == "racing" || r.phase == "countdown" {
			rank = index + 1
		}
		players = append(players, map[string]any{
			"id": p.ID, "name": p.Name, "color": p.Color, "avatar": p.Avatar,
			"connected": p.Connected, "ready": p.Ready, "queued": p.Queued, "active": p.Active,
			"x": roundTo(p.X, 3), "distance": roundTo(p.Distance, 1),
			"points": p.Points, "heatPoints": p.HeatPoints, "rank": rank,
			"barrierHits": p.BarrierHits, "totalBarrierHits": p.TotalBarrierHits, "boostCharges": p.BoostCharges,
			"energyPickups": p.EnergyPickups, "eventId": p.LastEventID,
			"lastEventType": p.LastEventType, "lastEventAt": p.LastEventAt,
			"lastEventObject": p.LastEventObject,
			"boosting":        now < p.BoostUntil, "slowed": now < p.SlowUntil,
			"gadget": p.Gadget, "nextGadget": p.NextGadget,
			"gadgetAvailable": p.GadgetAvailable, "shieldActive": p.ShieldActive,
			"magnetActive": now < p.MagnetUntil, "overcharging": now < p.OverchargeUntil,
			"streak": p.Streak, "bestStreak": p.BestStreak, "stylePoints": p.StylePoints,
			"car": p.Car, "trail": p.Trail, "horn": p.Horn,
			"emote": p.Emote, "emoteAt": p.EmoteAt,
			"team": p.Team, "eliminated": p.Eliminated, "driving": p.Driving,
		})
	}
	teamScores := []int{0, 0}
	for _, p := range r.players {
		if p.Team >= 0 && p.Team < len(teamScores) {
			teamScores[p.Team] += p.Points
		}
	}
	voteCounts := make(map[string]int)
	for _, vote := range r.votes {
		voteCounts[vote]++
	}
	state := map[string]any{
		"gameKey": r.gameKey, "roomId": r.roomID, "phase": r.phase,
		"pauseReason": r.pauseReason, "serverTime": now,
		"phaseEndsAt": r.phaseEndsAt, "heat": r.heat, "totalHeats": r.totalHeats,
		"players": players, "minPlayers": partyMinPlayers, "maxPlayers": r.maxPlayerCountLocked(),
		"totalBoosts":  r.totalBoosts,
		"displayCount": len(r.displays),
		"settings":     r.settings, "track": r.track, "modifier": r.modifier,
		"voteOptions": r.voteOptions, "voteCounts": voteCounts,
		"routes": r.routes, "sharedHealth": r.sharedHealth, "teamScores": teamScores,
		"awards": r.awards,
	}
	if selfID == "" {
		state["obstacles"] = r.obstacles
		if r.phase == "podium" {
			state["replayFrames"] = r.replayFrames
		}
	} else {
		state["selfId"] = selfID
	}
	return r.decorateRoomControlsLocked(r.decorateRotationSnapshotLocked(state, selfID))
}

func (r *partyRoom) decorateRoomControlsLocked(state map[string]any) map[string]any {
	state["roomLocked"] = r.locked
	state["allowLateJoin"] = r.allowLateJoin
	state["friendlyNames"] = r.friendlyNames
	state["audienceEnabled"] = r.audienceEnabled
	state["moderationLevel"] = r.partyModerationLevelLocked()
	state["audienceCount"] = r.connectedAudienceCountLocked()
	state["audienceCapacity"] = partyMaxAudience
	state["audienceReactions"] = r.audienceReactionCountsLocked()
	state["maxPlayers"] = r.maxPlayerCountLocked()
	readyCount := 0
	for _, p := range r.players {
		if p.Connected && p.Ready {
			readyCount++
		}
	}
	state["readyCount"] = readyCount
	settings := r.partySessionSettingsLocked()
	state["partySettings"] = settings
	state["estimatedMinutes"] = settings.TargetActivities * 5
	remaining := settings.TargetActivities - r.activityIndex
	if remaining < 0 {
		remaining = 0
	}
	state["activitiesRemaining"] = remaining
	return state
}

func (r *partyRoom) partySessionSettingsLocked() partySessionSettings {
	settings, ok := validatePartySessionSettings(r.partyConfig)
	if !ok {
		settings = defaultPartySessionSettings()
	}
	return settings
}

func (r *partyRoom) partyDurationLocked(base int64) int64 {
	duration := partyPhaseDuration(base)
	if r.sessionMode == partyRotationSessionMode && r.partySessionSettingsLocked().ExtendedTimers {
		return duration * 3 / 2
	}
	return duration
}

func (r *partyRoom) maxPlayerCountLocked() int {
	if r.maxPlayers < partyMinPlayers || r.maxPlayers > partyMaxPlayers {
		return partyMaxPlayers
	}
	return r.maxPlayers
}

func (r *partyRoom) partyHasStartedLocked() bool {
	if r.sessionMode == partyRotationSessionMode {
		return r.partyPhase != "party_lobby" && r.partyPhase != "ended"
	}
	return r.phase != "lobby" && r.phase != "podium" && r.phase != "ended"
}

func (r *partyRoom) rankedPlayersLocked(activeOnly bool) []*partyPlayer {
	players := make([]*partyPlayer, 0, len(r.players))
	for _, p := range r.players {
		if activeOnly && !p.Active {
			continue
		}
		players = append(players, p)
	}
	sort.Slice(players, func(i, j int) bool {
		a, b := players[i], players[j]
		if r.phase == "podium" || r.phase == "intermission" {
			if a.Points != b.Points {
				return a.Points > b.Points
			}
		}
		if a.Distance != b.Distance {
			return a.Distance > b.Distance
		}
		if a.BarrierHits != b.BarrierHits {
			return a.BarrierHits < b.BarrierHits
		}
		return a.ID < b.ID
	})
	return players
}

func (r *partyRoom) shouldExpire(now int64) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessionMode == partyRotationSessionMode {
		if r.partyPhase == "ended" {
			return r.endedAt == 0 || now-r.endedAt >= partyEndedRetentionMs
		}
		if r.partyPhase == "party_lobby" {
			return now-r.lastActive >= partyLobbyExpirationMs
		}
		return false
	}
	if r.phase == "ended" {
		return r.endedAt == 0 || now-r.endedAt >= partyEndedRetentionMs
	}
	if r.phase == "podium" {
		return r.endedAt > 0 && now-r.endedAt >= partyEndedRetentionMs
	}
	if r.phase == "lobby" {
		return now-r.lastActive >= partyLobbyExpirationMs
	}
	return false
}

func (r *partyRoom) connectedPlayerCountLocked() int {
	count := 0
	for _, p := range r.players {
		if p.Connected {
			count++
		}
	}
	return count
}

func (r *partyRoom) remainingRacersLocked() int {
	count := 0
	for _, p := range r.players {
		if !p.Eliminated {
			count++
		}
	}
	return count
}

func (r *partyRoom) trackForHeatLocked() string {
	tracks := []string{"neon", "glacier", "volcano", "space"}
	if containsString(tracks, r.settings.TrackRotation) {
		return r.settings.TrackRotation
	}
	if r.settings.TrackRotation == "random" {
		hasher := fnv.New64a()
		_, _ = hasher.Write([]byte(r.roomID + ":track:" + strconvItoa(r.heat)))
		return tracks[int(hasher.Sum64()%uint64(len(tracks)))]
	}
	return tracks[(r.heat-1)%len(tracks)]
}

func (r *partyRoom) winningVoteLocked() string {
	if len(r.voteOptions) == 0 {
		return ""
	}
	counts := make(map[string]int)
	for _, vote := range r.votes {
		if containsString(r.voteOptions, vote) {
			counts[vote]++
		}
	}
	winner := r.voteOptions[0]
	for _, option := range r.voteOptions[1:] {
		if counts[option] > counts[winner] {
			winner = option
		}
	}
	return winner
}

func (r *partyRoom) updateRelayDriversLocked(now int64) {
	for _, p := range r.players {
		p.Driving = false
	}
	for team := 0; team < 2; team++ {
		members := make([]*partyPlayer, 0, 4)
		for _, p := range r.players {
			if p.Team == team && p.Active && p.Connected {
				members = append(members, p)
			}
		}
		sort.Slice(members, func(i, j int) bool { return members[i].ID < members[j].ID })
		if len(members) > 0 {
			index := int((now-r.raceStartedAt)/8000) % len(members)
			members[index].Driving = true
		}
	}
}

func (r *partyRoom) captureReplayLocked(now int64) {
	frame := partyReplayFrame{At: now, Players: make([]partyReplayRacer, 0, len(r.players))}
	for _, p := range r.players {
		if p.Active {
			frame.Players = append(frame.Players, partyReplayRacer{ID: p.ID, X: roundTo(p.X, 3), Distance: roundTo(p.Distance, 1)})
		}
	}
	r.replayFrames = append(r.replayFrames, frame)
	if len(r.replayFrames) > 30 {
		r.replayFrames = r.replayFrames[len(r.replayFrames)-30:]
	}
}

func (r *partyRoom) computeAwardsLocked() {
	players := r.rankedPlayersLocked(false)
	if len(players) == 0 {
		return
	}
	mostBoosts, cleanest, magnet, comeback := players[0], players[0], players[0], players[0]
	for index, p := range players {
		if p.BoostsUsed > mostBoosts.BoostsUsed {
			mostBoosts = p
		}
		if p.TotalBarrierHits < cleanest.TotalBarrierHits {
			cleanest = p
		}
		if p.TotalBarrierHits > magnet.TotalBarrierHits {
			magnet = p
		}
		gain := p.StartRank - (index + 1)
		bestGain := comeback.StartRank - (indexOfPlayer(players, comeback) + 1)
		if gain > bestGain {
			comeback = p
		}
	}
	r.awards = []map[string]any{
		{"title": "Most Boosts", "playerId": mostBoosts.ID, "value": mostBoosts.BoostsUsed},
		{"title": "Cleanest Racer", "playerId": cleanest.ID, "value": cleanest.TotalBarrierHits},
		{"title": "Barrier Magnet", "playerId": magnet.ID, "value": magnet.TotalBarrierHits},
		{"title": "Biggest Comeback", "playerId": comeback.ID, "value": comeback.StartRank - (indexOfPlayer(players, comeback) + 1)},
	}
}

func indexOfPlayer(players []*partyPlayer, target *partyPlayer) int {
	for index, player := range players {
		if player == target {
			return index
		}
	}
	return 0
}

func voteOptionsForHeat(roomID string, heat int) []string {
	options := []string{"double_energy", "moving_barriers", "mirror", "super_boost", "fog", "sudden_death"}
	hasher := fnv.New64a()
	_, _ = hasher.Write([]byte(roomID + ":vote:" + strconvItoa(heat)))
	start := int(hasher.Sum64() % uint64(len(options)))
	return []string{options[start], options[(start+2)%len(options)], options[(start+4)%len(options)]}
}

func buildTurboTiltRoutes(roomID string, heat int) []partyRoute {
	hasher := fnv.New64a()
	_, _ = hasher.Write([]byte(roomID + ":routes:" + strconvItoa(heat)))
	firstSide := 1
	if hasher.Sum64()%2 == 0 {
		firstSide = -1
	}
	return []partyRoute{
		{ID: "route-" + strconvItoa(heat) + "-1", Start: 900, End: 1450, RiskSide: firstSide},
		{ID: "route-" + strconvItoa(heat) + "-2", Start: 2600, End: 3200, RiskSide: -firstSide},
	}
}

func (r *partyRoom) uniquePlayerNameLocked(raw string) (string, bool) {
	forcedFriendlyName := r.friendlyNames
	if forcedFriendlyName {
		raw = friendlyPartyName()
	}
	name, adjusted := sanitizePartyNameForLevel(raw, r.partyModerationLevelLocked())
	adjusted = adjusted || forcedFriendlyName
	if name == "" {
		name = "Racer " + strings.ToUpper(randomID(2))
		adjusted = true
	}
	used := make(map[string]bool, len(r.players))
	for _, p := range r.players {
		used[strings.ToLower(p.Name)] = true
	}
	base := name
	for suffix := 2; used[strings.ToLower(name)]; suffix++ {
		trimmed := truncateRunes(base, 13)
		name = trimmed + " " + strconvItoa(suffix)
		adjusted = true
	}
	return name, adjusted
}

func (r *partyRoom) connectedAudienceCountLocked() int {
	count := 0
	for _, member := range r.audience {
		if member.Connected {
			count++
		}
	}
	return count
}

func (r *partyRoom) audienceReactionCountsLocked() map[string]int {
	counts := map[string]int{"clap": 0, "laugh": 0, "wow": 0, "heart": 0}
	cutoff := nowMillis() - 5000
	for _, member := range r.audience {
		if member.Connected && member.ReactedAt >= cutoff {
			counts[member.Reaction]++
		}
	}
	return counts
}

func (r *partyRoom) uniqueAudienceNameLocked(raw string) (string, bool) {
	name, adjusted := sanitizePartyNameForLevel(raw, r.partyModerationLevelLocked())
	if name == "" {
		name = friendlyPartyName()
		adjusted = true
	}
	used := make(map[string]bool, len(r.players)+len(r.audience))
	for _, player := range r.players {
		used[strings.ToLower(player.Name)] = true
	}
	for _, member := range r.audience {
		used[strings.ToLower(member.Name)] = true
	}
	base := name
	for suffix := 2; used[strings.ToLower(name)]; suffix++ {
		name = truncateRunes(base, 13) + " " + strconvItoa(suffix)
		adjusted = true
	}
	return name, adjusted
}

func friendlyPartyName() string {
	adjectives := []string{"Brave", "Bright", "Calm", "Clever", "Cosmic", "Happy", "Lucky", "Mighty", "Quick", "Sunny"}
	animals := []string{"Bear", "Fox", "Frog", "Koala", "Otter", "Owl", "Panda", "Tiger", "Turtle", "Wolf"}
	return adjectives[securePartyIndex(len(adjectives))] + " " + animals[securePartyIndex(len(animals))]
}

func sanitizePartyRoomID(raw string) string {
	runes := []rune(strings.ToUpper(strings.TrimSpace(raw)))
	if len(runes) != 4 {
		return ""
	}
	for _, r := range runes {
		if !strings.ContainsRune("ABCDEFGHJKLMNPQRSTUVWXYZ", r) {
			return ""
		}
	}
	return string(runes)
}

func sanitizePartyName(raw string) (string, bool) {
	return sanitizePartyNameForLevel(raw, "standard")
}

func sanitizePartyNameForLevel(raw, level string) (string, bool) {
	original := strings.TrimSpace(raw)
	var out []rune
	lastSpace := false
	for _, r := range original {
		allowed := unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' || unicode.IsSpace(r)
		if !allowed {
			continue
		}
		if unicode.IsSpace(r) {
			if lastSpace {
				continue
			}
			r = ' '
			lastSpace = true
		} else {
			lastSpace = false
		}
		out = append(out, r)
		if len(out) == 16 {
			break
		}
	}
	name := strings.TrimSpace(string(out))
	compact := strings.ToLower(strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return r
		}
		return -1
	}, name))
	blocked := []string{"admin", "moderator", "system", "fuck", "shit", "bitch", "nigger", "nigga", "cunt", "porn", "sex"}
	if level == "family" {
		blocked = append(blocked, "idiot", "stupid", "hate", "kill", "loser", "dumb")
	}
	for _, term := range blocked {
		if strings.Contains(compact, term) {
			return "", true
		}
	}
	if len([]rune(name)) < 2 {
		return "", true
	}
	return name, name != original
}

func (r *partyRoom) partyModerationLevelLocked() string {
	if r.moderationLevel == "family" {
		return "family"
	}
	return "standard"
}

func buildTurboTiltObstacles(roomID string, heat int, track, chaos string) []partyObstacle {
	hasher := fnv.New64a()
	_, _ = hasher.Write([]byte(roomID + ":" + strconvItoa(heat) + ":" + track + ":" + chaos))
	rng := mathrand.New(mathrand.NewSource(int64(hasher.Sum64())))
	spacing := 155.0
	if chaos == "low" {
		spacing = 195
	} else if chaos == "wild" {
		spacing = 125
	}
	items := make([]partyObstacle, 0, 36)
	for index, distance := 0, 260.0; distance < 5000; index, distance = index+1, distance+spacing+rng.Float64()*42 {
		kind := "barrier"
		width := 0.18
		motion := 0.0
		if index%3 == 1 {
			kind = "energy"
			width = 0.15
		} else if (track == "space" && index%5 == 3) || (track == "volcano" && index%7 == 5) {
			kind = "jump"
			width = 0.32
		}
		if track == "neon" && kind == "barrier" && index%2 == 1 {
			motion = 0.28
		}
		if track == "glacier" && kind == "barrier" {
			width = 0.22
		}
		items = append(items, partyObstacle{
			ID: "h" + strconvItoa(heat) + "-" + strconvItoa(index), Kind: kind,
			Distance: roundTo(distance, 1), X: roundTo(-0.72+rng.Float64()*1.44, 3), Width: width, Motion: motion,
		})
	}
	return items
}

func containsString(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

func allowedChoice(value string, allowed []string, fallback string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if containsString(allowed, value) {
		return value
	}
	return fallback
}

func randomPartyCode() string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ"
	code := make([]byte, 4)
	for i := range code {
		for {
			var sample [1]byte
			if _, err := cryptorand.Read(sample[:]); err != nil {
				raw := randomID(4)
				code[i] = alphabet[int(raw[i])%len(alphabet)]
				break
			}
			limit := 256 - (256 % len(alphabet))
			if int(sample[0]) >= limit {
				continue
			}
			code[i] = alphabet[int(sample[0])%len(alphabet)]
			break
		}
	}
	return string(code)
}

func partyPlayerColor(index int) string {
	colors := []string{"#31e6c1", "#ffcf4a", "#ff6b8a", "#75a7ff", "#c28cff", "#ff914d", "#7ee35d", "#f06ee8"}
	return colors[index%len(colors)]
}

func partyPlayerAvatar(requested string, index int) string {
	avatars := []string{"🦊", "🐼", "🐸", "🦖", "🐙", "🦉", "🐯", "🐧", "🦄", "🐲", "🦈", "🐺", "🦜", "🐢", "🦁", "🐹"}
	for _, avatar := range avatars {
		if requested == avatar {
			return requested
		}
	}
	return avatars[index%len(avatars)]
}

func truncateRunes(value string, max int) string {
	runes := []rune(value)
	if len(runes) > max {
		runes = runes[:max]
	}
	return strings.TrimSpace(string(runes))
}

func strconvItoa(value int) string {
	if value == 0 {
		return "0"
	}
	digits := make([]byte, 0, 10)
	for value > 0 {
		digits = append(digits, byte('0'+value%10))
		value /= 10
	}
	for left, right := 0, len(digits)-1; left < right; left, right = left+1, right-1 {
		digits[left], digits[right] = digits[right], digits[left]
	}
	return string(digits)
}

func roundTo(value float64, places int) float64 {
	power := math.Pow10(places)
	return math.Round(value*power) / power
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func partyPhaseDuration(base int64) int64 {
	if os.Getenv("PARTY_TEST_FAST") != "1" {
		return base
	}
	switch base {
	case partyCountdownMs:
		return 300
	case partyHeatMs:
		return 8000
	case stickTiltRoundMs:
		return 6000
	case partyIntermissionMs:
		return 1200
	case crowdShiftChoiceMs:
		return 2000
	case crowdShiftRevealMs:
		return 800
	case crowdShiftMinimumChoiceMs:
		return 250
	case crowdShiftDuelGraceMs:
		return 350
	default:
		return base
	}
}
