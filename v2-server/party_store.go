package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	partyRoomSnapshotVersion    = 1
	partyRoomCollection         = "partyRoomSnapshots"
	partyRoomCheckpointInterval = int64(2000)
	partyRoomRecoveryWindowMs   = int64(15 * 60 * 1000)
)

var errPartyRoomSnapshotNotFound = errors.New("party room snapshot not found")

type partyRoomStore interface {
	Load(context.Context, string) (*partyRoomSnapshot, error)
	Save(context.Context, *partyRoomSnapshot) error
	Delete(context.Context, string) error
}

type firestorePartyRoomStore struct{ client *firestore.Client }

type firestorePartyRoomDocument struct {
	SchemaVersion int       `firestore:"schemaVersion"`
	RoomID        string    `firestore:"roomId"`
	UpdatedAt     time.Time `firestore:"updatedAt"`
	ExpiresAt     time.Time `firestore:"expiresAt"`
	Payload       []byte    `firestore:"payload"`
}

// partyRoomSnapshot excludes live sockets and synchronization state. It is
// short-lived recovery data, not a durable player-history record.
type partyRoomSnapshot struct {
	SchemaVersion    int
	SavedAt          int64
	ExpiresAt        int64
	GameKey          string
	RoomID           string
	HostToken        string
	Players          map[string]*partyPlayer
	Audience         map[string]*partyAudienceMember
	TokenToPlayer    map[string]string
	TokenToAudience  map[string]string
	BlockedTokens    map[string]bool
	Locked           bool
	AllowLateJoin    bool
	MaxPlayers       int
	FriendlyNames    bool
	AudienceEnabled  bool
	ModerationLevel  string
	PartyConfig      partySessionSettings
	Phase            string
	ResumePhase      string
	PauseReason      string
	PauseRemainingMs int64
	PhaseEndsAt      int64
	Heat             int
	TotalHeats       int
	Obstacles        []partyObstacle
	Tick             uint64
	CreatedAt        int64
	LastActive       int64
	EndedAt          int64
	TotalBoosts      int
	Settings         partySettings
	Track            string
	Modifier         string
	VoteOptions      []string
	Votes            map[string]string
	Routes           []partyRoute
	SharedHealth     int
	RaceStartedAt    int64
	NextChaosAt      int64
	ReplayFrames     []partyReplayFrame
	Awards           []map[string]any
	Crowd            *crowdShiftState
	Stick            *stickTiltState
	Sketch           *sketchClashState
	SessionMode      string
	PartyPhase       string
	ResumePartyPhase string
	ActivityIndex    int
	Activity         partyActivity
	LastActivityID   string
	ActivityHistory  []string
	PartyHighlights  []partyHighlight
	PartyVote        partyVoteState
	PartyAwarded     bool
	ActivitySkipped  bool
}

func newPartyRoomStoreFromEnv(ctx context.Context) (partyRoomStore, error) {
	if !strings.EqualFold(strings.TrimSpace(os.Getenv("PARTY_ROOM_STORE")), "firestore") {
		return nil, nil
	}
	projectID := strings.TrimSpace(os.Getenv("FIRESTORE_PROJECT_ID"))
	if projectID == "" {
		projectID = strings.TrimSpace(os.Getenv("GOOGLE_CLOUD_PROJECT"))
	}
	if projectID == "" {
		return nil, errors.New("PARTY_ROOM_STORE=firestore requires FIRESTORE_PROJECT_ID or GOOGLE_CLOUD_PROJECT")
	}
	client, err := firestore.NewClient(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("create Firestore party room store: %w", err)
	}
	return &firestorePartyRoomStore{client: client}, nil
}

func (s *firestorePartyRoomStore) Load(ctx context.Context, roomID string) (*partyRoomSnapshot, error) {
	doc, err := s.client.Collection(partyRoomCollection).Doc(roomID).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, errPartyRoomSnapshotNotFound
		}
		return nil, err
	}
	var stored firestorePartyRoomDocument
	if err := doc.DataTo(&stored); err != nil {
		return nil, err
	}
	var snapshot partyRoomSnapshot
	if err := json.Unmarshal(stored.Payload, &snapshot); err != nil {
		return nil, err
	}
	if snapshot.SchemaVersion != partyRoomSnapshotVersion || snapshot.RoomID != roomID {
		return nil, errPartyRoomSnapshotNotFound
	}
	if snapshot.ExpiresAt <= nowMillis() {
		_ = s.Delete(ctx, roomID)
		return nil, errPartyRoomSnapshotNotFound
	}
	return &snapshot, nil
}

func (s *firestorePartyRoomStore) Save(ctx context.Context, snapshot *partyRoomSnapshot) error {
	payload, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	_, err = s.client.Collection(partyRoomCollection).Doc(snapshot.RoomID).Set(ctx, firestorePartyRoomDocument{
		SchemaVersion: snapshot.SchemaVersion, RoomID: snapshot.RoomID,
		UpdatedAt: time.UnixMilli(snapshot.SavedAt), ExpiresAt: time.UnixMilli(snapshot.ExpiresAt), Payload: payload,
	})
	return err
}

func (s *firestorePartyRoomStore) Delete(ctx context.Context, roomID string) error {
	_, err := s.client.Collection(partyRoomCollection).Doc(roomID).Delete(ctx)
	return err
}

func (r *partyRoom) snapshotForPersistenceLocked(now int64) *partyRoomSnapshot {
	players := make(map[string]*partyPlayer, len(r.players))
	for id, player := range r.players {
		copy := *player
		copy.Client = nil
		copy.Connected = false
		players[id] = &copy
	}
	audience := make(map[string]*partyAudienceMember, len(r.audience))
	for id, member := range r.audience {
		copy := *member
		copy.Client = nil
		copy.Connected = false
		audience[id] = &copy
	}
	expiresAt := now + partyRoomRecoveryWindowMs
	if r.endedAt > 0 && (r.phase == "ended" || r.phase == "podium" || r.partyPhase == "ended") {
		expiresAt = maxInt64(now, r.endedAt) + partyEndedRetentionMs
	}
	snapshot := &partyRoomSnapshot{
		SchemaVersion: partyRoomSnapshotVersion, SavedAt: now, ExpiresAt: expiresAt,
		GameKey: r.gameKey, RoomID: r.roomID, HostToken: r.hostToken,
		Players: players, Audience: audience, TokenToPlayer: r.tokenToPlayer, TokenToAudience: r.tokenToAudience, BlockedTokens: r.blockedTokens,
		Locked: r.locked, AllowLateJoin: r.allowLateJoin, MaxPlayers: r.maxPlayers, FriendlyNames: r.friendlyNames,
		AudienceEnabled: r.audienceEnabled,
		ModerationLevel: r.moderationLevel,
		PartyConfig:     r.partyConfig, Phase: r.phase, ResumePhase: r.resumePhase, PauseReason: r.pauseReason,
		PauseRemainingMs: r.pauseRemainingMs, PhaseEndsAt: r.phaseEndsAt, Heat: r.heat, TotalHeats: r.totalHeats,
		Obstacles: r.obstacles, Tick: r.tick, CreatedAt: r.createdAt, LastActive: r.lastActive, EndedAt: r.endedAt,
		TotalBoosts: r.totalBoosts, Settings: r.settings, Track: r.track, Modifier: r.modifier,
		VoteOptions: r.voteOptions, Votes: r.votes, Routes: r.routes, SharedHealth: r.sharedHealth,
		RaceStartedAt: r.raceStartedAt, NextChaosAt: r.nextChaosAt, ReplayFrames: r.replayFrames, Awards: r.awards,
		Crowd: r.crowd, Stick: r.stick, Sketch: r.sketch, SessionMode: r.sessionMode, PartyPhase: r.partyPhase, ResumePartyPhase: r.resumePartyPhase,
		ActivityIndex: r.activityIndex, Activity: r.activity, LastActivityID: r.lastActivityID,
		ActivityHistory: r.activityHistory, PartyHighlights: r.partyHighlights, PartyVote: r.partyVote, PartyAwarded: r.partyAwarded, ActivitySkipped: r.activitySkipped,
	}
	// Freeze every nested map and slice while the room lock is held so the
	// asynchronous Firestore write cannot race the game loop.
	payload, err := json.Marshal(snapshot)
	if err != nil {
		log.Printf("party room %s checkpoint copy failed: %v", r.roomID, err)
		return snapshot
	}
	var frozen partyRoomSnapshot
	if err := json.Unmarshal(payload, &frozen); err != nil {
		log.Printf("party room %s checkpoint copy failed: %v", r.roomID, err)
		return snapshot
	}
	return &frozen
}

func restorePartyRoom(h *hub, snapshot *partyRoomSnapshot) *partyRoom {
	now := nowMillis()
	r := &partyRoom{
		hub: h, gameKey: snapshot.GameKey, roomID: snapshot.RoomID, hostToken: snapshot.HostToken,
		players: snapshot.Players, audience: snapshot.Audience, displays: make(map[string]*client), tokenToPlayer: snapshot.TokenToPlayer, tokenToAudience: snapshot.TokenToAudience,
		blockedTokens: snapshot.BlockedTokens, locked: snapshot.Locked, allowLateJoin: snapshot.AllowLateJoin,
		maxPlayers: snapshot.MaxPlayers, friendlyNames: snapshot.FriendlyNames, audienceEnabled: snapshot.AudienceEnabled, moderationLevel: snapshot.ModerationLevel, partyConfig: snapshot.PartyConfig,
		phase: snapshot.Phase, resumePhase: snapshot.ResumePhase, pauseReason: snapshot.PauseReason,
		pauseRemainingMs: snapshot.PauseRemainingMs, phaseEndsAt: snapshot.PhaseEndsAt,
		heat: snapshot.Heat, totalHeats: snapshot.TotalHeats, obstacles: snapshot.Obstacles, tick: snapshot.Tick,
		createdAt: snapshot.CreatedAt, lastActive: now, endedAt: snapshot.EndedAt, totalBoosts: snapshot.TotalBoosts,
		settings: snapshot.Settings, track: snapshot.Track, modifier: snapshot.Modifier, voteOptions: snapshot.VoteOptions,
		votes: snapshot.Votes, routes: snapshot.Routes, sharedHealth: snapshot.SharedHealth,
		raceStartedAt: snapshot.RaceStartedAt, nextChaosAt: snapshot.NextChaosAt, replayFrames: snapshot.ReplayFrames,
		awards: snapshot.Awards, crowd: snapshot.Crowd, stick: snapshot.Stick, sketch: snapshot.Sketch, sessionMode: snapshot.SessionMode,
		partyPhase: snapshot.PartyPhase, resumePartyPhase: snapshot.ResumePartyPhase,
		activityIndex: snapshot.ActivityIndex, activity: snapshot.Activity, lastActivityID: snapshot.LastActivityID,
		activityHistory: snapshot.ActivityHistory, partyHighlights: snapshot.PartyHighlights, partyVote: snapshot.PartyVote,
		partyAwarded: snapshot.PartyAwarded, activitySkipped: snapshot.ActivitySkipped, hostDisconnectedAt: now,
	}
	if r.players == nil {
		r.players = make(map[string]*partyPlayer)
	}
	if r.tokenToPlayer == nil {
		r.tokenToPlayer = make(map[string]string)
	}
	if r.audience == nil {
		r.audience = make(map[string]*partyAudienceMember)
	}
	if r.tokenToAudience == nil {
		r.tokenToAudience = make(map[string]string)
	}
	// Older snapshots predate the audience toggle and should retain the new default.
	if snapshot.SchemaVersion == 1 && snapshot.Audience == nil {
		r.audienceEnabled = true
	}
	if r.blockedTokens == nil {
		r.blockedTokens = make(map[string]bool)
	}
	if r.votes == nil {
		r.votes = make(map[string]string)
	}
	for _, player := range r.players {
		player.Client = nil
		player.Connected = false
		if player.HitObstacleIDs == nil {
			player.HitObstacleIDs = make(map[string]bool)
		}
		if player.HitRouteIDs == nil {
			player.HitRouteIDs = make(map[string]bool)
		}
	}
	for _, member := range r.audience {
		member.Client = nil
		member.Connected = false
	}
	rotationNeedsPause := r.sessionMode == partyRotationSessionMode && r.partyPhase != "party_lobby" && r.partyPhase != "paused" && r.partyPhase != "ended"
	standaloneNeedsPause := r.sessionMode != partyRotationSessionMode && r.phase != "paused" && r.phase != "lobby" && r.phase != "podium" && r.phase != "ended"
	if rotationNeedsPause || standaloneNeedsPause {
		r.resumePhase = r.phase
		r.pauseRemainingMs = maxInt64(0, r.phaseEndsAt-snapshot.SavedAt)
		r.phase = "paused"
		r.phaseEndsAt = 0
		r.pauseReason = "host_disconnected"
		if r.sessionMode == partyRotationSessionMode {
			r.resumePartyPhase = r.partyPhase
			r.partyPhase = "paused"
		}
	}
	return r
}

func (r *partyRoom) persistSnapshot(snapshot *partyRoomSnapshot) {
	if r.hub == nil || r.hub.partyStore == nil || snapshot == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := r.hub.partyStore.Save(ctx, snapshot); err != nil {
		log.Printf("party room %s checkpoint failed: %v", r.roomID, err)
	}
	r.mu.Lock()
	r.persistenceInFlight = false
	removed := r.removed
	r.mu.Unlock()
	if removed {
		if err := r.hub.partyStore.Delete(ctx, r.roomID); err != nil {
			log.Printf("party room %s post-checkpoint deletion failed: %v", r.roomID, err)
		}
	}
}
