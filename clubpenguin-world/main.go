package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
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
	maxPlayerNameRunes  = 28
	maxChatLengthRunes  = 180
	maxIncomingMessage  = 4096
	targetCooldown      = 40 * time.Millisecond
	chatCooldown        = 700 * time.Millisecond
	noticeCooldown      = 2 * time.Second
	wsWriteTimeout      = 5 * time.Second
	wsPongTimeout       = 60 * time.Second
	wsPingInterval      = (wsPongTimeout * 9) / 10
	defaultReadTimeout  = 10 * time.Second
	defaultWriteTimeout = 10 * time.Second
	defaultIdleTimeout  = 120 * time.Second
)

var (
	upgrader = websocket.Upgrader{
		ReadBufferSize:  2048,
		WriteBufferSize: 2048,
		CheckOrigin: func(_ *http.Request) bool {
			return true
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
			},
			SpawnPoints: []Point{
				{X: 120, Y: 120},
				{X: 1080, Y: 120},
				{X: 120, Y: 600},
				{X: 1080, Y: 600},
				{X: 600, Y: 140},
				{X: 600, Y: 580},
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

type WorldMap struct {
	Width   float64  `json:"width"`
	Height  float64  `json:"height"`
	Blocked []Rect   `json:"blocked"`
	Portals []Portal `json:"portals"`
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
	ID          string
	Name        string
	World       WorldMap
	SpawnPoints []Point
	Players     map[string]*Player
}

type RoomTemplate struct {
	ID          string
	Name        string
	World       WorldMap
	SpawnPoints []Point
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
	Text string `json:"text"`
}

type SetNamePayload struct {
	Name string `json:"name"`
}

type RoomJoinPayload struct {
	RoomID string `json:"roomId"`
}

type Client struct {
	id           string
	name         string
	roomID       string
	color        string
	conn         *websocket.Conn
	send         chan []byte
	server       *Server
	lastTargetAt time.Time
	lastChatAt   time.Time
	lastNoticeAt time.Time
}

type roomSnapshot struct {
	roomID string
	timeMs int64
	items  []Player
}

type Server struct {
	mu        sync.RWMutex
	clients   map[string]*Client
	rooms     map[string]*Room
	roomOrder []string
	nextID    atomic.Uint64
}

func newServer() *Server {
	s := &Server{
		clients:   make(map[string]*Client),
		rooms:     make(map[string]*Room),
		roomOrder: make([]string, 0, len(roomTemplates)),
	}

	for _, tmpl := range roomTemplates {
		room := &Room{
			ID:          tmpl.ID,
			Name:        tmpl.Name,
			World:       copyWorldMap(tmpl.World),
			SpawnPoints: copyPoints(tmpl.SpawnPoints),
			Players:     make(map[string]*Player),
		}
		s.rooms[room.ID] = room
		s.roomOrder = append(s.roomOrder, room.ID)
	}
	return s
}

func copyWorldMap(src WorldMap) WorldMap {
	out := WorldMap{
		Width:   src.Width,
		Height:  src.Height,
		Blocked: make([]Rect, len(src.Blocked)),
		Portals: make([]Portal, len(src.Portals)),
	}
	copy(out.Blocked, src.Blocked)
	copy(out.Portals, src.Portals)
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

func (s *Server) addClient(conn *websocket.Conn) (*Client, Player, string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := s.newPlayerID()
	color := playerColors[(int(s.nextID.Load())-1)%len(playerColors)]
	name := defaultPlayerName(id)

	client := &Client{
		id:     id,
		name:   name,
		roomID: defaultRoomID,
		color:  color,
		conn:   conn,
		send:   make(chan []byte, 64),
		server: s,
	}
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
		"selfId":  clientID,
		"roomId":  room.ID,
		"rooms":   s.roomInfosLocked(),
		"map":     copyWorldMap(room.World),
		"players": s.playersSnapshotLocked(room),
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

	initPayload := map[string]any{
		"selfId":  clientID,
		"roomId":  targetRoom.ID,
		"rooms":   s.roomInfosLocked(),
		"map":     copyWorldMap(targetRoom.World),
		"players": s.playersSnapshotLocked(targetRoom),
	}
	joinedPlayer := *player
	s.mu.Unlock()

	if oldRoomID != "" {
		s.broadcastToRoom("player:left", map[string]any{"id": clientID}, oldRoomID, "")
	}
	s.sendToClient(clientID, "world:init", initPayload)
	s.broadcastToRoom("player:joined", map[string]any{"player": joinedPlayer}, targetRoomID, clientID)
}

func (s *Server) setPlayerName(clientID string, requestedName string) (string, string, bool) {
	cleanName := sanitizePlayerName(requestedName)
	if cleanName == "" {
		return "", "", false
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	client := s.clients[clientID]
	if client == nil {
		return "", "", false
	}
	room := s.rooms[client.roomID]
	if room == nil {
		return "", "", false
	}
	player := room.Players[clientID]
	if player == nil {
		return "", "", false
	}

	if player.Name == cleanName {
		return client.roomID, cleanName, false
	}

	client.name = cleanName
	player.Name = cleanName
	return client.roomID, cleanName, true
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
			snapshots := s.stepAndCollectSnapshots(simulationDelta, time.Now().UnixMilli())
			for _, snap := range snapshots {
				s.broadcastToRoom("world:snapshot", map[string]any{
					"roomId":     snap.roomID,
					"serverTime": snap.timeMs,
					"players":    snap.items,
				}, snap.roomID, "")
			}
		}
	}
}

func (s *Server) stepAndCollectSnapshots(dt float64, nowMs int64) []roomSnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()

	snapshots := make([]roomSnapshot, 0, len(s.roomOrder))
	for _, roomID := range s.roomOrder {
		room := s.rooms[roomID]
		if room == nil {
			continue
		}
		s.simulateRoomLocked(room, dt)
		snapshots = append(snapshots, roomSnapshot{
			roomID: roomID,
			timeMs: nowMs,
			items:  s.playersSnapshotLocked(room),
		})
	}
	return snapshots
}

func (s *Server) simulateRoomLocked(room *Room, dt float64) {
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
			text := sanitizeChat(payload.Text)
			if text == "" {
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
					"id":   c.id,
					"name": senderName,
					"text": text,
					"ts":   time.Now().UnixMilli(),
				}, roomID, "")
			}

		case "player:setName":
			var payload SetNamePayload
			if err := json.Unmarshal(envelope.Payload, &payload); err != nil {
				continue
			}
			roomID, nextName, changed := c.server.setPlayerName(c.id, payload.Name)
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
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade failed: %v", err)
		return
	}

	client, player, roomID := s.addClient(conn)
	s.sendWorldInit(client.id)
	s.broadcastToRoom("player:joined", map[string]any{"player": player}, roomID, client.id)

	go client.writePump()
	client.readPump()
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

func main() {
	// Room note:
	// This prototype already runs independent per-room state loops under one process.
	// To scale horizontally, keep sticky sessions and add Redis pub/sub for room fanout.
	serverState := newServer()
	stopSimulation := make(chan struct{})
	defer close(stopSimulation)
	go serverState.runSimulationLoop(stopSimulation)

	fileServer := http.FileServer(http.Dir("./public"))
	mux := http.NewServeMux()
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
		Handler:      mux,
		ReadTimeout:  defaultReadTimeout,
		WriteTimeout: defaultWriteTimeout,
		IdleTimeout:  defaultIdleTimeout,
	}

	log.Printf("clubpenguin-world server listening on http://127.0.0.1%s", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server failed: %v", err)
	}
}
