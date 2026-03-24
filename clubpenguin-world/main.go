package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

const (
	defaultPort         = "8081"
	defaultRoomID       = "town"
	simulationTickHz    = 20
	simulationDelta     = 1.0 / simulationTickHz
	avatarRadius        = 14.0
	defaultPlayerSpeed  = 220.0
	collectibleRadius   = 11.0
	maxPlayerNameRunes  = 28
	maxChatLengthRunes  = 180
	maxIncomingMessage  = 4096
	targetCooldown      = 40 * time.Millisecond
	chatCooldown        = 700 * time.Millisecond
	emoteCooldown       = 500 * time.Millisecond
	noticeCooldown      = 2 * time.Second
	npcHintCooldown     = 1500 * time.Millisecond
	collectibleRespawn  = 7 * time.Second
	wsWriteTimeout      = 5 * time.Second
	wsPongTimeout       = 60 * time.Second
	wsPingInterval      = (wsPongTimeout * 9) / 10
	defaultReadTimeout  = 10 * time.Second
	defaultWriteTimeout = 10 * time.Second
	defaultIdleTimeout  = 120 * time.Second
	shutdownTimeout     = 15 * time.Second
	wsAllowedOriginsEnv = "WS_ALLOWED_ORIGINS"
	maxClientsEnv       = "MAX_CLIENTS"
	defaultMaxClients   = 300
)

var (
	wsOriginAllowed = func(_ *http.Request) bool {
		return true
	}

	upgrader = websocket.Upgrader{
		ReadBufferSize:  2048,
		WriteBufferSize: 2048,
		CheckOrigin: func(r *http.Request) bool {
			return wsOriginAllowed(r)
		},
	}

	roomTemplates = []RoomTemplate{
		{
			ID:   "town",
			Name: "Town",
			World: WorldMap{
				Width:  1200,
				Height: 720,
				Blocked: []Rect{
					{X: 320, Y: 220, Width: 130, Height: 220},
					{X: 560, Y: 100, Width: 160, Height: 140},
					{X: 820, Y: 320, Width: 190, Height: 180},
				},
				Portals: []Portal{
					{ID: "town-plaza", Label: "To Plaza", X: 1020, Y: 28, Width: 154, Height: 74, ToRoom: "plaza"},
					{ID: "town-snow", Label: "To Snow Forts", X: 28, Y: 28, Width: 176, Height: 74, ToRoom: "snow-forts"},
				},
				NPCs: []NPC{
					{ID: "town-greeter", Name: "Rory", X: 598, Y: 176, Radius: 58},
				},
			},
			SpawnPoints: []Point{
				{X: 120, Y: 120},
				{X: 1080, Y: 120},
				{X: 120, Y: 600},
				{X: 1080, Y: 600},
				{X: 600, Y: 140},
				{X: 600, Y: 580},
			},
			CollectibleSpawns: []Point{
				{X: 232, Y: 165},
				{X: 730, Y: 560},
				{X: 1040, Y: 220},
				{X: 165, Y: 555},
			},
		},
		{
			ID:   "plaza",
			Name: "Plaza",
			World: WorldMap{
				Width:  1200,
				Height: 720,
				Blocked: []Rect{
					{X: 220, Y: 160, Width: 180, Height: 120},
					{X: 500, Y: 290, Width: 190, Height: 150},
					{X: 810, Y: 170, Width: 170, Height: 220},
				},
				Portals: []Portal{
					{ID: "plaza-town", Label: "To Town", X: 28, Y: 28, Width: 154, Height: 74, ToRoom: "town"},
					{ID: "plaza-snow", Label: "To Snow Forts", X: 1020, Y: 28, Width: 176, Height: 74, ToRoom: "snow-forts"},
				},
			},
			SpawnPoints: []Point{
				{X: 100, Y: 360},
				{X: 600, Y: 620},
				{X: 1100, Y: 360},
				{X: 600, Y: 100},
			},
			CollectibleSpawns: []Point{
				{X: 142, Y: 580},
				{X: 458, Y: 110},
				{X: 764, Y: 570},
				{X: 1035, Y: 510},
			},
		},
		{
			ID:   "snow-forts",
			Name: "Snow Forts",
			World: WorldMap{
				Width:  1200,
				Height: 720,
				Blocked: []Rect{
					{X: 280, Y: 250, Width: 150, Height: 170},
					{X: 510, Y: 120, Width: 180, Height: 150},
					{X: 760, Y: 260, Width: 170, Height: 200},
				},
				Portals: []Portal{
					{ID: "snow-town", Label: "To Town", X: 28, Y: 28, Width: 154, Height: 74, ToRoom: "town"},
					{ID: "snow-plaza", Label: "To Plaza", X: 1020, Y: 28, Width: 154, Height: 74, ToRoom: "plaza"},
				},
			},
			SpawnPoints: []Point{
				{X: 130, Y: 130},
				{X: 1060, Y: 130},
				{X: 130, Y: 590},
				{X: 1060, Y: 590},
				{X: 600, Y: 360},
			},
			CollectibleSpawns: []Point{
				{X: 156, Y: 520},
				{X: 424, Y: 102},
				{X: 736, Y: 584},
				{X: 1022, Y: 502},
			},
		},
	}

	playerColors = []string{
		"#ffcc33",
		"#2dd4bf",
		"#60a5fa",
		"#f472b6",
		"#a78bfa",
		"#fb7185",
		"#f97316",
		"#22c55e",
	}

	starterObjectives = []ObjectiveDef{
		{ID: "starter:set-name", Label: "Set your penguin name", Reward: 15},
		{ID: "starter:chat-once", Label: "Send your first chat message", Reward: 20},
		{ID: "starter:visit-plaza", Label: "Visit Plaza", Reward: 30},
		{ID: "starter:visit-snow-forts", Label: "Visit Snow Forts", Reward: 30},
		{ID: "starter:emote-once", Label: "Use an emote", Reward: 20},
	}

	allowedEmotes = map[string]string{
		"wave":     "wave",
		"dance":    "dance",
		"cheer":    "cheer",
		"laugh":    "laugh",
		"snowball": "snowball",
	}

	quickChatOptions = []QuickChatOption{
		{ID: "hello", Text: "Hello everyone!", Tags: []string{"hi", "hey", "hello"}},
		{ID: "need-help", Text: "Can someone help me?", Tags: []string{"help", "assist"}},
		{ID: "follow-me", Text: "Follow me!", Tags: []string{"follow", "come"}},
		{ID: "thanks", Text: "Thanks!", Tags: []string{"ty", "thank you"}},
		{ID: "sorry", Text: "Sorry!", Tags: []string{"apologies"}},
		{ID: "great-job", Text: "Great job!", Tags: []string{"nice", "good"}},
		{ID: "wait-here", Text: "Wait here.", Tags: []string{"wait", "hold"}},
		{ID: "yes", Text: "Yes.", Tags: []string{"yeah", "yep"}},
		{ID: "no", Text: "No.", Tags: []string{"nope"}},
		{ID: "brb", Text: "Be right back.", Tags: []string{"brb", "back"}},
		{ID: "go-plaza", Text: "Let's go to Plaza.", Tags: []string{"plaza", "portal"}},
		{ID: "go-snow-forts", Text: "Let's go to Snow Forts.", Tags: []string{"snow", "forts", "portal"}},
		{ID: "go-town", Text: "Let's go to Town.", Tags: []string{"town", "portal"}},
		{ID: "wanna-emote", Text: "Want to emote?", Tags: []string{"emote", "dance", "wave"}},
		{ID: "nice-outfit", Text: "Nice outfit!", Tags: []string{"style", "look"}},
		{ID: "good-game", Text: "Good game!", Tags: []string{"gg", "game"}},
		{ID: "ready-to-play", Text: "Ready to play?", Tags: []string{"ready", "start"}},
		{ID: "meet-portal", Text: "Meet me at the portal.", Tags: []string{"meet", "portal"}},
		{ID: "collecting-coins", Text: "I'm collecting coin puffs.", Tags: []string{"coin", "collect"}},
	}

	quickChatByID = buildQuickChatMap(quickChatOptions)
)

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Rect struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type Portal struct {
	ID     string  `json:"id"`
	Label  string  `json:"label"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	ToRoom string  `json:"toRoom"`
}

type NPC struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Radius float64 `json:"radius"`
}

type Collectible struct {
	ID     string  `json:"id"`
	Label  string  `json:"label"`
	Kind   string  `json:"kind"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Radius float64 `json:"radius"`
	Value  int     `json:"value"`
}

type WorldMap struct {
	Width   float64  `json:"width"`
	Height  float64  `json:"height"`
	Blocked []Rect   `json:"blocked"`
	Portals []Portal `json:"portals"`
	NPCs    []NPC    `json:"npcs"`
}

type Player struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	TargetX float64 `json:"targetX"`
	TargetY float64 `json:"targetY"`
	Speed   float64 `json:"speed"`
	Color   string  `json:"color"`
}

type RoomInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Room struct {
	ID                string
	Name              string
	World             WorldMap
	SpawnPoints       []Point
	CollectibleSpawns []Point
	Players           map[string]*Player
	Collectible       *Collectible
	collectibleCursor int
	collectibleSeq    int
	nextCollectibleAt time.Time
}

type RoomTemplate struct {
	ID                string
	Name              string
	World             WorldMap
	SpawnPoints       []Point
	CollectibleSpawns []Point
}

type ObjectiveDef struct {
	ID     string
	Label  string
	Reward int
}

type ObjectiveState struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Reward    int    `json:"reward"`
	Completed bool   `json:"completed"`
}

type QuickChatOption struct {
	ID   string   `json:"id"`
	Text string   `json:"text"`
	Tags []string `json:"tags,omitempty"`
}

type InboundEnvelope struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type OutboundEnvelope struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

type SetTargetPayload struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type ChatSendPayload struct {
	OptionID string `json:"optionId"`
	Text     string `json:"text"`
}

type EmoteSendPayload struct {
	Emote string `json:"emote"`
}

type SetNamePayload struct {
	Name string `json:"name"`
}

type RoomJoinPayload struct {
	RoomID string `json:"roomId"`
}

type Client struct {
	id                  string
	name                string
	roomID              string
	color               string
	conn                *websocket.Conn
	send                chan []byte
	server              *Server
	coins               int
	hasNamed            bool
	hasChatted          bool
	hasEmoted           bool
	visitedRooms        map[string]bool
	completedObjectives map[string]bool
	seenHintStages      map[string]bool
	lastTargetAt        time.Time
	lastChatAt          time.Time
	lastEmoteAt         time.Time
	lastNoticeAt        time.Time
	lastHintAt          time.Time
}

type roomSnapshot struct {
	roomID       string
	timeMs       int64
	items        []Player
	collectibles []Collectible
}

type npcHintDispatch struct {
	clientID string
	payload  map[string]any
}

type collectibleDispatch struct {
	roomID      string
	collectorID string
	payload     map[string]any
}

type simulationBatch struct {
	snapshots         []roomSnapshot
	hints             []npcHintDispatch
	collectibleEvents []collectibleDispatch
	progressClientIDs []string
}

type roomHealth struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Players int    `json:"players"`
}

type healthPayload struct {
	Status      string       `json:"status"`
	ServerTime  int64        `json:"serverTime"`
	UptimeSec   int64        `json:"uptimeSec"`
	TotalRooms  int          `json:"totalRooms"`
	TotalPlayer int          `json:"totalPlayers"`
	ActiveUsers int          `json:"activeClients"`
	MaxUsers    int          `json:"maxClients"`
	Rooms       []roomHealth `json:"rooms"`
}

type Server struct {
	mu         sync.RWMutex
	clients    map[string]*Client
	rooms      map[string]*Room
	roomOrder  []string
	startedAt  time.Time
	maxClients int
	nextID     atomic.Uint64
}

func newServer() *Server {
	return newServerWithMaxClients(defaultMaxClients)
}

func newServerWithMaxClients(maxClients int) *Server {
	if maxClients < 1 {
		maxClients = defaultMaxClients
	}

	s := &Server{
		clients:    make(map[string]*Client),
		rooms:      make(map[string]*Room),
		roomOrder:  make([]string, 0, len(roomTemplates)),
		startedAt:  time.Now().UTC(),
		maxClients: maxClients,
	}

	for _, tmpl := range roomTemplates {
		room := &Room{
			ID:                tmpl.ID,
			Name:              tmpl.Name,
			World:             copyWorldMap(tmpl.World),
			SpawnPoints:       copyPoints(tmpl.SpawnPoints),
			CollectibleSpawns: copyPoints(tmpl.CollectibleSpawns),
			Players:           make(map[string]*Player),
			nextCollectibleAt: time.Now(),
		}
		s.rooms[room.ID] = room
		s.roomOrder = append(s.roomOrder, room.ID)
	}
	return s
}

func (s *Server) healthSnapshot(serverTime int64) healthPayload {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rooms := make([]roomHealth, 0, len(s.roomOrder))
	totalPlayers := 0
	for _, roomID := range s.roomOrder {
		room := s.rooms[roomID]
		if room == nil {
			continue
		}
		playerCount := len(room.Players)
		totalPlayers += playerCount
		rooms = append(rooms, roomHealth{
			ID:      room.ID,
			Name:    room.Name,
			Players: playerCount,
		})
	}

	uptimeSec := int64(0)
	if !s.startedAt.IsZero() {
		uptimeSec = int64(time.Since(s.startedAt).Seconds())
		if uptimeSec < 0 {
			uptimeSec = 0
		}
	}

	return healthPayload{
		Status:      "ok",
		ServerTime:  serverTime,
		UptimeSec:   uptimeSec,
		TotalRooms:  len(rooms),
		TotalPlayer: totalPlayers,
		ActiveUsers: len(s.clients),
		MaxUsers:    s.maxClients,
		Rooms:       rooms,
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	payload := s.healthSnapshot(time.Now().UnixMilli())
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Vary", "Origin")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(payload)
}

func copyWorldMap(src WorldMap) WorldMap {
	out := WorldMap{
		Width:   src.Width,
		Height:  src.Height,
		Blocked: make([]Rect, len(src.Blocked)),
		Portals: make([]Portal, len(src.Portals)),
		NPCs:    make([]NPC, len(src.NPCs)),
	}
	copy(out.Blocked, src.Blocked)
	copy(out.Portals, src.Portals)
	copy(out.NPCs, src.NPCs)
	return out
}

func copyPoints(src []Point) []Point {
	out := make([]Point, len(src))
	copy(out, src)
	return out
}

func (s *Server) newPlayerID() string {
	id := s.nextID.Add(1)
	return fmt.Sprintf("p-%06d", id)
}

func defaultPlayerName(id string) string {
	suffix := strings.TrimPrefix(id, "p-")
	if suffix == "" {
		suffix = id
	}
	return "Penguin-" + suffix
}

func sanitizePlayerName(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	fields := strings.Fields(raw)
	if len(fields) == 0 {
		return ""
	}
	normalized := strings.Join(fields, " ")
	runes := []rune(normalized)
	if len(runes) > maxPlayerNameRunes {
		runes = runes[:maxPlayerNameRunes]
	}
	return strings.TrimSpace(string(runes))
}

func sanitizeEmote(raw string) string {
	normalized := normalizeRoomID(raw)
	if emote, ok := allowedEmotes[normalized]; ok {
		return emote
	}
	return ""
}

func buildQuickChatMap(options []QuickChatOption) map[string]QuickChatOption {
	out := make(map[string]QuickChatOption, len(options))
	for _, option := range options {
		id := normalizeRoomID(option.ID)
		if id == "" || strings.TrimSpace(option.Text) == "" {
			continue
		}
		normalized := QuickChatOption{
			ID:   id,
			Text: sanitizeChat(option.Text),
			Tags: make([]string, 0, len(option.Tags)),
		}
		for _, tag := range option.Tags {
			tagClean := strings.ToLower(sanitizeChat(tag))
			if tagClean != "" {
				normalized.Tags = append(normalized.Tags, tagClean)
			}
		}
		out[id] = normalized
	}
	return out
}

func quickChatCatalog() []QuickChatOption {
	catalog := make([]QuickChatOption, 0, len(quickChatOptions))
	for _, option := range quickChatOptions {
		id := normalizeRoomID(option.ID)
		normalized, ok := quickChatByID[id]
		if !ok {
			continue
		}
		catalog = append(catalog, normalized)
	}
	return catalog
}

func normalizeChatQuery(raw string) string {
	return strings.ToLower(sanitizeChat(raw))
}

func quickChatScore(option QuickChatOption, query string) int {
	if query == "" {
		return 0
	}
	text := normalizeChatQuery(option.Text)
	if text == "" {
		return 0
	}
	if query == text || query == normalizeRoomID(option.ID) {
		return 1200
	}
	if strings.Contains(text, query) {
		return 900 - (len(text) - len(query))
	}

	fields := strings.Fields(query)
	if len(fields) == 0 {
		return 0
	}
	searchSpace := text + " " + strings.Join(option.Tags, " ")
	matches := 0
	for _, field := range fields {
		if strings.Contains(searchSpace, field) {
			matches++
		}
	}
	if matches == 0 {
		return 0
	}
	return matches*120 - (len(fields)-matches)*45
}

func resolveQuickChatOption(payload ChatSendPayload) (QuickChatOption, bool) {
	optionID := normalizeRoomID(payload.OptionID)
	if optionID != "" {
		if option, ok := quickChatByID[optionID]; ok {
			return option, true
		}
	}

	query := normalizeChatQuery(payload.Text)
	if query == "" {
		return QuickChatOption{}, false
	}

	best := QuickChatOption{}
	bestScore := 0
	for _, option := range quickChatOptions {
		candidate, ok := quickChatByID[normalizeRoomID(option.ID)]
		if !ok {
			continue
		}
		score := quickChatScore(candidate, query)
		if score > bestScore || (score == bestScore && bestScore > 0 && len(candidate.Text) < len(best.Text)) {
			bestScore = score
			best = candidate
		}
	}
	if bestScore <= 0 {
		return QuickChatOption{}, false
	}
	return best, true
}

func (s *Server) objectiveCompletedLocked(client *Client, objectiveID string) bool {
	switch objectiveID {
	case "starter:set-name":
		return client.hasNamed
	case "starter:chat-once":
		return client.hasChatted
	case "starter:visit-plaza":
		return client.visitedRooms["plaza"]
	case "starter:visit-snow-forts":
		return client.visitedRooms["snow-forts"]
	case "starter:emote-once":
		return client.hasEmoted
	default:
		return false
	}
}

func (s *Server) recomputeProgressLocked(client *Client) bool {
	changed := false
	for _, objective := range starterObjectives {
		if client.completedObjectives[objective.ID] {
			continue
		}
		if !s.objectiveCompletedLocked(client, objective.ID) {
			continue
		}
		client.completedObjectives[objective.ID] = true
		client.coins += objective.Reward
		changed = true
	}
	return changed
}

func (s *Server) progressPayloadLocked(client *Client) map[string]any {
	objectives := make([]ObjectiveState, 0, len(starterObjectives))
	completedCount := 0
	for _, objective := range starterObjectives {
		completed := client.completedObjectives[objective.ID]
		if completed {
			completedCount++
		}
		objectives = append(objectives, ObjectiveState{
			ID:        objective.ID,
			Label:     objective.Label,
			Reward:    objective.Reward,
			Completed: completed,
		})
	}

	return map[string]any{
		"coins":          client.coins,
		"objectives":     objectives,
		"completedCount": completedCount,
		"totalCount":     len(starterObjectives),
	}
}

func (s *Server) sendProgress(clientID string) {
	s.mu.RLock()
	client := s.clients[clientID]
	if client == nil {
		s.mu.RUnlock()
		return
	}
	payload := s.progressPayloadLocked(client)
	s.mu.RUnlock()
	s.sendToClient(clientID, "player:progress", payload)
}

func collectibleValueForRoom(roomID string) int {
	switch normalizeRoomID(roomID) {
	case "plaza":
		return 8
	case "snow-forts":
		return 10
	default:
		return 6
	}
}

func (s *Server) collectiblesSnapshotLocked(room *Room) []Collectible {
	if room == nil || room.Collectible == nil {
		return []Collectible{}
	}
	return []Collectible{*room.Collectible}
}

func (s *Server) resetProgress(clientID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	client := s.clients[clientID]
	if client == nil {
		return false
	}

	client.coins = 0
	client.hasNamed = false
	client.hasChatted = false
	client.hasEmoted = false
	client.completedObjectives = make(map[string]bool)
	client.seenHintStages = make(map[string]bool)
	client.lastHintAt = time.Time{}
	client.visitedRooms = map[string]bool{}
	if client.roomID != "" {
		client.visitedRooms[client.roomID] = true
	}
	_ = s.recomputeProgressLocked(client)
	return true
}

func (s *Server) guideHintStageLocked(client *Client) (string, string) {
	if client == nil {
		return "", ""
	}
	if !client.hasNamed {
		return "guide:set-name", "Rory: Welcome! Set your penguin name in the right panel first."
	}
	if !client.hasChatted {
		return "guide:chat", "Rory: Great name. Send one chat message to greet the room."
	}
	if !client.visitedRooms["plaza"] {
		return "guide:visit-plaza", "Rory: Walk into the glowing 'To Plaza' portal pad to visit Plaza."
	}
	if !client.visitedRooms["snow-forts"] {
		return "guide:visit-snow-forts", "Rory: Nice. Next, step into a portal and reach Snow Forts."
	}
	if !client.hasEmoted {
		return "guide:emote", "Rory: Finish the tour by using an emote button (or keys 1-5)."
	}
	return "guide:complete", "Rory: Tour complete. Keep collecting floating coins in each room."
}

func sortedRoomPlayerIDs(room *Room) []string {
	playerIDs := make([]string, 0, len(room.Players))
	for playerID := range room.Players {
		playerIDs = append(playerIDs, playerID)
	}
	sort.Strings(playerIDs)
	return playerIDs
}

func (s *Server) processNPCHintsLocked(room *Room, now time.Time) []npcHintDispatch {
	if room == nil || len(room.World.NPCs) == 0 || len(room.Players) == 0 {
		return nil
	}

	playerIDs := sortedRoomPlayerIDs(room)
	hints := make([]npcHintDispatch, 0, len(playerIDs))
	for _, playerID := range playerIDs {
		player := room.Players[playerID]
		client := s.clients[playerID]
		if player == nil || client == nil {
			continue
		}
		for _, npc := range room.World.NPCs {
			if math.Hypot(player.X-npc.X, player.Y-npc.Y) > npc.Radius+avatarRadius {
				continue
			}
			stageID, text := s.guideHintStageLocked(client)
			if stageID == "" || text == "" || client.seenHintStages[stageID] {
				continue
			}
			if !consumeCooldown(now, &client.lastHintAt, npcHintCooldown) {
				continue
			}
			client.seenHintStages[stageID] = true
			hints = append(hints, npcHintDispatch{
				clientID: playerID,
				payload: map[string]any{
					"id":   npc.ID,
					"name": npc.Name,
					"text": text,
					"ts":   now.UnixMilli(),
				},
			})
			break
		}
	}
	return hints
}

func (s *Server) spawnCollectibleLocked(room *Room, now time.Time) {
	if room == nil || len(room.CollectibleSpawns) == 0 {
		return
	}

	for i := 0; i < len(room.CollectibleSpawns); i++ {
		idx := room.collectibleCursor % len(room.CollectibleSpawns)
		room.collectibleCursor++
		spawn := room.CollectibleSpawns[idx]
		x, y := s.clampToWorld(room, spawn.X, spawn.Y)
		if !s.isWalkable(room, x, y) {
			continue
		}
		room.collectibleSeq++
		room.Collectible = &Collectible{
			ID:     fmt.Sprintf("%s-collect-%d", room.ID, room.collectibleSeq),
			Label:  "Coin Puff",
			Kind:   "coin",
			X:      x,
			Y:      y,
			Radius: collectibleRadius,
			Value:  collectibleValueForRoom(room.ID),
		}
		room.nextCollectibleAt = time.Time{}
		return
	}

	// No valid spawn in this pass; retry later.
	room.nextCollectibleAt = now.Add(collectibleRespawn)
}

func (s *Server) processCollectibleLocked(room *Room, now time.Time) (*collectibleDispatch, string) {
	if room == nil {
		return nil, ""
	}
	if room.Collectible == nil {
		if room.nextCollectibleAt.IsZero() || !now.Before(room.nextCollectibleAt) {
			s.spawnCollectibleLocked(room, now)
		}
		return nil, ""
	}

	playerIDs := sortedRoomPlayerIDs(room)
	collectorID := ""
	for _, playerID := range playerIDs {
		player := room.Players[playerID]
		if player == nil {
			continue
		}
		if math.Hypot(player.X-room.Collectible.X, player.Y-room.Collectible.Y) <= avatarRadius+room.Collectible.Radius {
			collectorID = playerID
			break
		}
	}
	if collectorID == "" {
		return nil, ""
	}

	collectorName := collectorID
	if player := room.Players[collectorID]; player != nil && strings.TrimSpace(player.Name) != "" {
		collectorName = player.Name
	}

	value := room.Collectible.Value
	if value < 1 {
		value = 1
	}
	if client := s.clients[collectorID]; client != nil {
		client.coins += value
	}

	collectedID := room.Collectible.ID
	room.Collectible = nil
	room.nextCollectibleAt = now.Add(collectibleRespawn)

	dispatch := &collectibleDispatch{
		roomID:      room.ID,
		collectorID: collectorID,
		payload: map[string]any{
			"id":          collectedID,
			"roomId":      room.ID,
			"byId":        collectorID,
			"byName":      collectorName,
			"value":       value,
			"nextSpawnMs": room.nextCollectibleAt.UnixMilli(),
			"ts":          now.UnixMilli(),
		},
	}
	return dispatch, collectorID
}

func (s *Server) addClient(conn *websocket.Conn) (*Client, Player, string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.maxClients > 0 && len(s.clients) >= s.maxClients {
		return nil, Player{}, ""
	}

	id := s.newPlayerID()
	color := playerColors[(int(s.nextID.Load())-1)%len(playerColors)]
	name := defaultPlayerName(id)

	client := &Client{
		id:                  id,
		name:                name,
		roomID:              defaultRoomID,
		color:               color,
		conn:                conn,
		send:                make(chan []byte, 64),
		server:              s,
		visitedRooms:        make(map[string]bool),
		completedObjectives: make(map[string]bool),
		seenHintStages:      make(map[string]bool),
	}
	client.visitedRooms[defaultRoomID] = true
	s.clients[id] = client

	room := s.rooms[defaultRoomID]
	if room == nil {
		panic("default room missing")
	}
	spawn := s.pickSpawnLocked(room)
	player := &Player{
		ID:      id,
		Name:    name,
		X:       spawn.X,
		Y:       spawn.Y,
		TargetX: spawn.X,
		TargetY: spawn.Y,
		Speed:   defaultPlayerSpeed,
		Color:   color,
	}
	room.Players[id] = player
	s.recomputeProgressLocked(client)

	return client, *player, room.ID
}

func (s *Server) pickSpawnLocked(room *Room) Point {
	if len(room.SpawnPoints) == 0 {
		return Point{X: avatarRadius, Y: avatarRadius}
	}
	index := len(room.Players) % len(room.SpawnPoints)
	spawn := room.SpawnPoints[index]
	if s.isWalkable(room, spawn.X, spawn.Y) {
		return spawn
	}

	for y := avatarRadius; y <= room.World.Height-avatarRadius; y += 36 {
		for x := avatarRadius; x <= room.World.Width-avatarRadius; x += 36 {
			if s.isWalkable(room, x, y) {
				return Point{X: x, Y: y}
			}
		}
	}
	return Point{X: avatarRadius, Y: avatarRadius}
}

func (s *Server) removeClient(id string) {
	var client *Client
	var roomID string
	removed := false

	s.mu.Lock()
	client = s.clients[id]
	if client != nil {
		roomID = client.roomID
		delete(s.clients, id)
		if room := s.rooms[roomID]; room != nil {
			delete(room.Players, id)
		}
		close(client.send)
		removed = true
	}
	s.mu.Unlock()

	if removed && roomID != "" {
		s.broadcastToRoom("player:left", map[string]any{"id": id}, roomID, "")
	}
}

func (s *Server) sendWorldInit(clientID string) {
	s.mu.RLock()
	client := s.clients[clientID]
	if client == nil {
		s.mu.RUnlock()
		return
	}
	room := s.rooms[client.roomID]
	if room == nil {
		s.mu.RUnlock()
		return
	}

	payload := map[string]any{
		"selfId":       clientID,
		"roomId":       room.ID,
		"rooms":        s.roomInfosLocked(),
		"map":          copyWorldMap(room.World),
		"players":      s.playersSnapshotLocked(room),
		"collectibles": s.collectiblesSnapshotLocked(room),
		"chatOptions":  quickChatCatalog(),
		"progress":     s.progressPayloadLocked(client),
	}
	s.mu.RUnlock()
	s.sendToClient(clientID, "world:init", payload)
}

func (s *Server) roomInfosLocked() []RoomInfo {
	rooms := make([]RoomInfo, 0, len(s.roomOrder))
	for _, roomID := range s.roomOrder {
		room := s.rooms[roomID]
		if room != nil {
			rooms = append(rooms, RoomInfo{ID: room.ID, Name: room.Name})
		}
	}
	return rooms
}

func (s *Server) playersSnapshotLocked(room *Room) []Player {
	players := make([]Player, 0, len(room.Players))
	for _, p := range room.Players {
		players = append(players, *p)
	}
	sort.Slice(players, func(i, j int) bool {
		return players[i].ID < players[j].ID
	})
	return players
}

func (s *Server) sendToClient(clientID string, eventType string, payload any) {
	msg, err := marshalEvent(eventType, payload)
	if err != nil {
		log.Printf("marshal sendToClient %s failed: %v", eventType, err)
		return
	}

	s.mu.RLock()
	client := s.clients[clientID]
	s.mu.RUnlock()
	if client == nil {
		return
	}

	select {
	case client.send <- msg:
	default:
		s.removeClient(client.id)
	}
}

func (s *Server) broadcastToRoom(eventType string, payload any, roomID string, exceptID string) {
	msg, err := marshalEvent(eventType, payload)
	if err != nil {
		log.Printf("marshal broadcast %s failed: %v", eventType, err)
		return
	}
	s.mu.RLock()
	recipients := make([]*Client, 0, len(s.clients))
	for id, client := range s.clients {
		if id == exceptID || client.roomID != roomID {
			continue
		}
		recipients = append(recipients, client)
	}
	s.mu.RUnlock()

	for _, client := range recipients {
		select {
		case client.send <- msg:
		default:
			s.removeClient(client.id)
		}
	}
}

func marshalEvent(eventType string, payload any) ([]byte, error) {
	envelope := OutboundEnvelope{
		Type:    eventType,
		Payload: payload,
	}
	return json.Marshal(envelope)
}

func normalizeRoomID(raw string) string {
	id := strings.TrimSpace(strings.ToLower(raw))
	id = strings.ReplaceAll(id, " ", "-")
	return id
}

func consumeCooldown(now time.Time, last *time.Time, cooldown time.Duration) bool {
	if last.IsZero() || now.Sub(*last) >= cooldown {
		*last = now
		return true
	}
	return false
}

func (s *Server) roomExists(roomID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.rooms[roomID]
	return ok
}

func (s *Server) atCapacity() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.maxClients < 1 {
		return false
	}
	return len(s.clients) >= s.maxClients
}

func (s *Server) closeAllConnections(reason string) {
	s.mu.RLock()
	clients := make([]*Client, 0, len(s.clients))
	for _, client := range s.clients {
		clients = append(clients, client)
	}
	s.mu.RUnlock()

	closeMessage := websocket.FormatCloseMessage(websocket.CloseGoingAway, reason)
	deadline := time.Now().Add(wsWriteTimeout)
	for _, client := range clients {
		if client == nil || client.conn == nil {
			continue
		}
		_ = client.conn.WriteControl(websocket.CloseMessage, closeMessage, deadline)
		_ = client.conn.Close()
	}
}

func pointInPortal(x float64, y float64, portal Portal) bool {
	return x >= portal.X && x <= portal.X+portal.Width && y >= portal.Y && y <= portal.Y+portal.Height
}

func (s *Server) canJoinRoomFromPortal(clientID string, targetRoomID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	client := s.clients[clientID]
	if client == nil {
		return false
	}
	room := s.rooms[client.roomID]
	if room == nil {
		return false
	}
	player := room.Players[clientID]
	if player == nil {
		return false
	}
	for _, portal := range room.World.Portals {
		if normalizeRoomID(portal.ToRoom) != targetRoomID {
			continue
		}
		if pointInPortal(player.X, player.Y, portal) {
			return true
		}
	}
	return false
}

func (c *Client) sendNotice(level string, text string) {
	now := time.Now()
	if !consumeCooldown(now, &c.lastNoticeAt, noticeCooldown) {
		return
	}
	c.server.sendToClient(c.id, "system:notice", map[string]any{
		"level": level,
		"text":  text,
		"ts":    now.UnixMilli(),
	})
}

func (s *Server) joinRoom(clientID string, requestedRoomID string) {
	targetRoomID := normalizeRoomID(requestedRoomID)
	if targetRoomID == "" {
		targetRoomID = defaultRoomID
	}

	s.mu.Lock()
	client := s.clients[clientID]
	if client == nil {
		s.mu.Unlock()
		return
	}

	targetRoom := s.rooms[targetRoomID]
	if targetRoom == nil {
		s.mu.Unlock()
		return
	}

	oldRoomID := client.roomID
	if oldRoomID == targetRoomID {
		s.mu.Unlock()
		return
	}

	if oldRoom := s.rooms[oldRoomID]; oldRoom != nil {
		delete(oldRoom.Players, clientID)
	}

	spawn := s.pickSpawnLocked(targetRoom)
	player := &Player{
		ID:      clientID,
		Name:    client.name,
		X:       spawn.X,
		Y:       spawn.Y,
		TargetX: spawn.X,
		TargetY: spawn.Y,
		Speed:   defaultPlayerSpeed,
		Color:   client.color,
	}
	targetRoom.Players[clientID] = player
	client.roomID = targetRoomID
	client.visitedRooms[targetRoomID] = true
	s.recomputeProgressLocked(client)

	initPayload := map[string]any{
		"selfId":       clientID,
		"roomId":       targetRoom.ID,
		"rooms":        s.roomInfosLocked(),
		"map":          copyWorldMap(targetRoom.World),
		"players":      s.playersSnapshotLocked(targetRoom),
		"collectibles": s.collectiblesSnapshotLocked(targetRoom),
		"chatOptions":  quickChatCatalog(),
		"progress":     s.progressPayloadLocked(client),
	}
	joinedPlayer := *player
	s.mu.Unlock()

	if oldRoomID != "" {
		s.broadcastToRoom("player:left", map[string]any{"id": clientID}, oldRoomID, "")
	}
	s.sendToClient(clientID, "world:init", initPayload)
	s.broadcastToRoom("player:joined", map[string]any{"player": joinedPlayer}, targetRoomID, clientID)
}

func (s *Server) setPlayerName(clientID string, requestedName string) (string, string, bool, bool) {
	cleanName := sanitizePlayerName(requestedName)
	if cleanName == "" {
		return "", "", false, false
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	client := s.clients[clientID]
	if client == nil {
		return "", "", false, false
	}
	room := s.rooms[client.roomID]
	if room == nil {
		return "", "", false, false
	}
	player := room.Players[clientID]
	if player == nil {
		return "", "", false, false
	}

	nameChanged := false
	if player.Name != cleanName {
		client.name = cleanName
		player.Name = cleanName
		nameChanged = true
	}

	client.hasNamed = true
	progressChanged := s.recomputeProgressLocked(client)
	return client.roomID, cleanName, nameChanged, progressChanged
}

func (s *Server) setTarget(clientID string, targetX float64, targetY float64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	client := s.clients[clientID]
	if client == nil {
		return
	}
	room := s.rooms[client.roomID]
	if room == nil {
		return
	}
	player := room.Players[clientID]
	if player == nil {
		return
	}

	resolvedX, resolvedY := s.resolveTargetLocked(room, player, targetX, targetY)
	player.TargetX = resolvedX
	player.TargetY = resolvedY
}

func (s *Server) resolveTargetLocked(room *Room, player *Player, targetX float64, targetY float64) (float64, float64) {
	clampedX, clampedY := s.clampToWorld(room, targetX, targetY)
	if s.isWalkable(room, clampedX, clampedY) {
		return clampedX, clampedY
	}

	// If the click lands inside a blocked area, walk toward it and keep the
	// farthest reachable point so movement still feels responsive.
	startX, startY := player.X, player.Y
	dx := clampedX - startX
	dy := clampedY - startY
	dist := math.Hypot(dx, dy)
	if dist < 0.01 {
		return startX, startY
	}

	steps := int(dist / 4.0)
	if steps < 1 {
		steps = 1
	}

	bestX, bestY := startX, startY
	for i := 1; i <= steps; i++ {
		t := float64(i) / float64(steps)
		candidateX := startX + dx*t
		candidateY := startY + dy*t
		candidateX, candidateY = s.clampToWorld(room, candidateX, candidateY)
		if !s.isWalkable(room, candidateX, candidateY) {
			break
		}
		bestX, bestY = candidateX, candidateY
	}

	return bestX, bestY
}

func (s *Server) clampToWorld(room *Room, x float64, y float64) (float64, float64) {
	minX, maxX := avatarRadius, room.World.Width-avatarRadius
	minY, maxY := avatarRadius, room.World.Height-avatarRadius
	if x < minX {
		x = minX
	}
	if x > maxX {
		x = maxX
	}
	if y < minY {
		y = minY
	}
	if y > maxY {
		y = maxY
	}
	return x, y
}

func (s *Server) isWalkable(room *Room, x float64, y float64) bool {
	if x < avatarRadius || y < avatarRadius || x > room.World.Width-avatarRadius || y > room.World.Height-avatarRadius {
		return false
	}

	for _, rect := range room.World.Blocked {
		if circleIntersectsRect(x, y, avatarRadius, rect) {
			return false
		}
	}
	return true
}

func circleIntersectsRect(cx float64, cy float64, radius float64, rect Rect) bool {
	closestX := clampFloat(cx, rect.X, rect.X+rect.Width)
	closestY := clampFloat(cy, rect.Y, rect.Y+rect.Height)
	dx := cx - closestX
	dy := cy - closestY
	return dx*dx+dy*dy < radius*radius
}

func clampFloat(v float64, minVal float64, maxVal float64) float64 {
	if v < minVal {
		return minVal
	}
	if v > maxVal {
		return maxVal
	}
	return v
}

func (s *Server) runSimulationLoop(stop <-chan struct{}) {
	ticker := time.NewTicker(time.Second / simulationTickHz)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			batch := s.stepAndCollectSnapshots(simulationDelta, time.Now().UnixMilli())
			for _, snap := range batch.snapshots {
				s.broadcastToRoom("world:snapshot", map[string]any{
					"roomId":       snap.roomID,
					"serverTime":   snap.timeMs,
					"players":      snap.items,
					"collectibles": snap.collectibles,
				}, snap.roomID, "")
			}
			for _, hint := range batch.hints {
				s.sendToClient(hint.clientID, "npc:hint", hint.payload)
			}
			for _, event := range batch.collectibleEvents {
				s.broadcastToRoom("collectible:collected", event.payload, event.roomID, "")
			}
			for _, clientID := range batch.progressClientIDs {
				s.sendProgress(clientID)
			}
		}
	}
}

func (s *Server) stepAndCollectSnapshots(dt float64, nowMs int64) simulationBatch {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.UnixMilli(nowMs)
	batch := simulationBatch{
		snapshots:         make([]roomSnapshot, 0, len(s.roomOrder)),
		hints:             make([]npcHintDispatch, 0, 4),
		collectibleEvents: make([]collectibleDispatch, 0, 2),
		progressClientIDs: make([]string, 0, 2),
	}
	progressSet := make(map[string]bool)
	for _, roomID := range s.roomOrder {
		room := s.rooms[roomID]
		if room == nil {
			continue
		}
		hints, collectibleEvent, progressClientID := s.simulateRoomLocked(room, dt, now)
		batch.hints = append(batch.hints, hints...)
		if collectibleEvent != nil {
			batch.collectibleEvents = append(batch.collectibleEvents, *collectibleEvent)
		}
		if progressClientID != "" && !progressSet[progressClientID] {
			progressSet[progressClientID] = true
			batch.progressClientIDs = append(batch.progressClientIDs, progressClientID)
		}
		batch.snapshots = append(batch.snapshots, roomSnapshot{
			roomID:       roomID,
			timeMs:       nowMs,
			items:        s.playersSnapshotLocked(room),
			collectibles: s.collectiblesSnapshotLocked(room),
		})
	}
	return batch
}

func (s *Server) simulateRoomLocked(room *Room, dt float64, now time.Time) ([]npcHintDispatch, *collectibleDispatch, string) {
	for _, player := range room.Players {
		dx := player.TargetX - player.X
		dy := player.TargetY - player.Y
		dist := math.Hypot(dx, dy)
		if dist < 0.01 {
			player.X = player.TargetX
			player.Y = player.TargetY
			continue
		}

		step := player.Speed * dt
		nextX := player.X
		nextY := player.Y
		if dist <= step {
			nextX = player.TargetX
			nextY = player.TargetY
		} else {
			nextX += (dx / dist) * step
			nextY += (dy / dist) * step
		}

		nextX, nextY = s.clampToWorld(room, nextX, nextY)

		resolvedX := nextX
		resolvedY := nextY

		if !s.isWalkable(room, resolvedX, player.Y) {
			resolvedX = player.X
		}
		if !s.isWalkable(room, resolvedX, resolvedY) {
			resolvedY = player.Y
		}
		if !s.isWalkable(room, resolvedX, resolvedY) {
			resolvedX = player.X
			resolvedY = player.Y
		}

		player.X = resolvedX
		player.Y = resolvedY
	}

	hints := s.processNPCHintsLocked(room, now)
	collectibleEvent, progressClientID := s.processCollectibleLocked(room, now)
	return hints, collectibleEvent, progressClientID
}

func sanitizeChat(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	fields := strings.Fields(raw)
	if len(fields) == 0 {
		return ""
	}

	normalized := strings.Join(fields, " ")
	runes := []rune(normalized)
	if len(runes) > maxChatLengthRunes {
		runes = runes[:maxChatLengthRunes]
	}
	return strings.TrimSpace(string(runes))
}

func (c *Client) readPump() {
	defer func() {
		c.server.removeClient(c.id)
		_ = c.conn.Close()
	}()

	c.conn.SetReadLimit(maxIncomingMessage)
	_ = c.conn.SetReadDeadline(time.Now().Add(wsPongTimeout))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(wsPongTimeout))
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				return
			}
			log.Printf("websocket read error (%s): %v", c.id, err)
			return
		}

		var envelope InboundEnvelope
		if err := json.Unmarshal(message, &envelope); err != nil {
			continue
		}

		switch envelope.Type {
		case "player:setTarget":
			var payload SetTargetPayload
			if err := json.Unmarshal(envelope.Payload, &payload); err != nil {
				continue
			}
			if !consumeCooldown(time.Now(), &c.lastTargetAt, targetCooldown) {
				continue
			}
			c.server.setTarget(c.id, payload.X, payload.Y)

		case "chat:send":
			var payload ChatSendPayload
			if err := json.Unmarshal(envelope.Payload, &payload); err != nil {
				continue
			}
			selectedOption, ok := resolveQuickChatOption(payload)
			if !ok {
				c.sendNotice("warn", "Quick chat only: pick one of the suggested phrases.")
				continue
			}
			if !consumeCooldown(time.Now(), &c.lastChatAt, chatCooldown) {
				c.sendNotice("warn", "You're chatting too fast. Please wait a second.")
				continue
			}
			c.server.mu.RLock()
			roomID := ""
			senderName := c.name
			client := c.server.clients[c.id]
			if client != nil {
				roomID = client.roomID
				senderName = client.name
				if room := c.server.rooms[roomID]; room != nil {
					if player := room.Players[c.id]; player != nil && player.Name != "" {
						senderName = player.Name
					}
				}
			}
			c.server.mu.RUnlock()
			if roomID != "" {
				c.server.broadcastToRoom("chat:message", map[string]any{
					"id":       c.id,
					"name":     senderName,
					"text":     selectedOption.Text,
					"optionId": selectedOption.ID,
					"ts":       time.Now().UnixMilli(),
				}, roomID, "")
			}
			progressChanged := false
			c.server.mu.Lock()
			if client := c.server.clients[c.id]; client != nil {
				client.hasChatted = true
				progressChanged = c.server.recomputeProgressLocked(client)
			}
			c.server.mu.Unlock()
			if progressChanged {
				c.server.sendProgress(c.id)
			}

		case "player:emote":
			var payload EmoteSendPayload
			if err := json.Unmarshal(envelope.Payload, &payload); err != nil {
				continue
			}
			emote := sanitizeEmote(payload.Emote)
			if emote == "" {
				c.sendNotice("warn", "Unknown emote.")
				continue
			}
			if !consumeCooldown(time.Now(), &c.lastEmoteAt, emoteCooldown) {
				c.sendNotice("warn", "You're emoting too fast.")
				continue
			}

			roomID := ""
			senderName := c.name
			progressChanged := false

			c.server.mu.Lock()
			if client := c.server.clients[c.id]; client != nil {
				roomID = client.roomID
				senderName = client.name
				if room := c.server.rooms[roomID]; room != nil {
					if player := room.Players[c.id]; player != nil && player.Name != "" {
						senderName = player.Name
					}
				}
				client.hasEmoted = true
				progressChanged = c.server.recomputeProgressLocked(client)
			}
			c.server.mu.Unlock()

			if roomID != "" {
				c.server.broadcastToRoom("player:emote", map[string]any{
					"id":    c.id,
					"name":  senderName,
					"emote": emote,
					"ts":    time.Now().UnixMilli(),
				}, roomID, "")
			}
			if progressChanged {
				c.server.sendProgress(c.id)
			}

		case "player:setName":
			var payload SetNamePayload
			if err := json.Unmarshal(envelope.Payload, &payload); err != nil {
				continue
			}
			roomID, nextName, changed, progressChanged := c.server.setPlayerName(c.id, payload.Name)
			if nextName == "" {
				c.sendNotice("warn", "Name cannot be empty.")
				continue
			}
			if changed {
				c.server.broadcastToRoom("player:renamed", map[string]any{
					"id":   c.id,
					"name": nextName,
				}, roomID, "")
			}
			if progressChanged {
				c.server.sendProgress(c.id)
			}

		case "qa:resetProgress":
			if !c.server.resetProgress(c.id) {
				continue
			}
			c.server.sendProgress(c.id)
			c.sendNotice("notice", "Starter progress reset.")

		case "room:join":
			var payload RoomJoinPayload
			if err := json.Unmarshal(envelope.Payload, &payload); err != nil {
				continue
			}
			targetRoomID := normalizeRoomID(payload.RoomID)
			if targetRoomID == "" {
				targetRoomID = defaultRoomID
			}
			if !c.server.roomExists(targetRoomID) {
				c.sendNotice("warn", "Room not found.")
				continue
			}
			if !c.server.canJoinRoomFromPortal(c.id, targetRoomID) {
				c.sendNotice("warn", "Walk into the portal zone to travel.")
				continue
			}
			c.server.joinRoom(c.id, targetRoomID)
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(wsPingInterval)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	if s.atCapacity() {
		http.Error(w, "server is at capacity", http.StatusServiceUnavailable)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade failed: %v", err)
		return
	}

	client, player, roomID := s.addClient(conn)
	if client == nil {
		_ = conn.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "server is at capacity"),
			time.Now().Add(wsWriteTimeout),
		)
		_ = conn.Close()
		return
	}

	s.sendWorldInit(client.id)
	s.broadcastToRoom("player:joined", map[string]any{"player": player}, roomID, client.id)

	go client.writePump()
	client.readPump()
}

func normalizeOriginToken(raw string) (full string, host string, ok bool) {
	candidate := strings.TrimSpace(raw)
	if candidate == "" {
		return "", "", false
	}

	if !strings.Contains(candidate, "://") {
		host = strings.ToLower(strings.Trim(candidate, "/"))
		if host == "" {
			return "", "", false
		}
		return "", host, true
	}

	parsed, err := url.Parse(candidate)
	if err != nil || parsed.Host == "" {
		return "", "", false
	}

	scheme := strings.ToLower(parsed.Scheme)
	switch scheme {
	case "ws":
		scheme = "http"
	case "wss":
		scheme = "https"
	}
	if scheme != "http" && scheme != "https" {
		return "", "", false
	}
	host = strings.ToLower(parsed.Host)
	return scheme + "://" + host, host, true
}

func buildWSOriginChecker(raw string) func(*http.Request) bool {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return func(_ *http.Request) bool { return true }
	}

	allowedFull := make(map[string]struct{})
	allowedHost := make(map[string]struct{})
	allowAll := false

	for _, token := range strings.Split(trimmed, ",") {
		token = strings.TrimSpace(token)
		if token == "" {
			continue
		}
		if token == "*" {
			allowAll = true
			break
		}
		full, host, ok := normalizeOriginToken(token)
		if !ok {
			continue
		}
		if full != "" {
			allowedFull[full] = struct{}{}
		}
		if host != "" {
			allowedHost[host] = struct{}{}
		}
	}

	if allowAll {
		return func(_ *http.Request) bool { return true }
	}

	return func(r *http.Request) bool {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin == "" {
			// Non-browser clients may omit Origin.
			return true
		}
		full, host, ok := normalizeOriginToken(origin)
		if !ok {
			return false
		}
		if _, allowed := allowedFull[full]; allowed {
			return true
		}
		if _, allowed := allowedHost[host]; allowed {
			return true
		}
		return false
	}
}

type loggingResponseWriter struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (w *loggingResponseWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *loggingResponseWriter) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(data)
	w.bytes += n
	return n, err
}

func requestRemoteHost(r *http.Request) string {
	if r == nil {
		return ""
	}

	forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For"))
	if forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if len(parts) > 0 {
			host := strings.TrimSpace(parts[0])
			if host != "" {
				return host
			}
		}
	}

	realIP := strings.TrimSpace(r.Header.Get("X-Real-IP"))
	if realIP != "" {
		return realIP
	}

	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil && host != "" {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

func withRequestLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		remoteHost := requestRemoteHost(r)
		path := r.URL.Path

		// WebSocket upgrades need the original writer type.
		if strings.HasPrefix(path, "/ws") {
			next.ServeHTTP(w, r)
			log.Printf(
				"http method=%s path=%s status=%s duration_ms=%d remote=%s user_agent=%q",
				r.Method,
				path,
				"upgrade_or_close",
				time.Since(started).Milliseconds(),
				remoteHost,
				r.UserAgent(),
			)
			return
		}

		recorder := &loggingResponseWriter{ResponseWriter: w}
		next.ServeHTTP(recorder, r)
		if recorder.status == 0 {
			recorder.status = http.StatusOK
		}
		log.Printf(
			"http method=%s path=%s status=%d bytes=%d duration_ms=%d remote=%s user_agent=%q",
			r.Method,
			path,
			recorder.status,
			recorder.bytes,
			time.Since(started).Milliseconds(),
			remoteHost,
			r.UserAgent(),
		)
	})
}

func getPort() string {
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		return defaultPort
	}
	if _, err := strconv.Atoi(port); err != nil {
		return defaultPort
	}
	return port
}

func getMaxClients() int {
	raw := strings.TrimSpace(os.Getenv(maxClientsEnv))
	if raw == "" {
		return defaultMaxClients
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed < 1 {
		return defaultMaxClients
	}
	return parsed
}

func main() {
	// Room note:
	// This prototype already runs independent per-room state loops under one process.
	// To scale horizontally, keep sticky sessions and add Redis pub/sub for room fanout.
	wsOriginAllowed = buildWSOriginChecker(os.Getenv(wsAllowedOriginsEnv))
	maxClients := getMaxClients()

	serverState := newServerWithMaxClients(maxClients)
	stopSimulation := make(chan struct{})
	var stopSimulationOnce sync.Once
	stopSimulationLoop := func() {
		stopSimulationOnce.Do(func() {
			close(stopSimulation)
		})
	}
	defer stopSimulationLoop()
	go serverState.runSimulationLoop(stopSimulation)

	fileServer := http.FileServer(http.Dir("./public"))
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", serverState.handleHealth)
	mux.HandleFunc("/ws", serverState.handleWebSocket)
	mux.Handle("/vendor/", http.StripPrefix("/vendor/", http.FileServer(http.Dir("./public/vendor"))))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.ServeFile(w, r, "./public/index.html")
			return
		}
		fileServer.ServeHTTP(w, r)
	}))

	server := &http.Server{
		Addr:         ":" + getPort(),
		Handler:      withRequestLogging(mux),
		ReadTimeout:  defaultReadTimeout,
		WriteTimeout: defaultWriteTimeout,
		IdleTimeout:  defaultIdleTimeout,
	}

	log.Printf("%s=%q", wsAllowedOriginsEnv, strings.TrimSpace(os.Getenv(wsAllowedOriginsEnv)))
	log.Printf("%s=%d", maxClientsEnv, maxClients)
	log.Printf("clubpenguin-world server listening on http://127.0.0.1%s", server.Addr)
	serverErrCh := make(chan error, 1)
	go func() {
		serverErrCh <- server.ListenAndServe()
	}()

	signalCtx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	select {
	case err := <-serverErrCh:
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("server failed: %v", err)
		}
		return
	case <-signalCtx.Done():
		log.Printf("shutdown signal received: %v", signalCtx.Err())
	}

	stopSimulationLoop()
	serverState.closeAllConnections("server shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
		_ = server.Close()
	}

	if err := <-serverErrCh; err != nil && err != http.ErrServerClosed {
		log.Printf("server exit error: %v", err)
	}
}
