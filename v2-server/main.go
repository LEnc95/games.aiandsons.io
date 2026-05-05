package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math"
	mathrand "math/rand"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/gorilla/websocket"
)

const (
	protocolName    = "aiandsons.multiplayer.v1"
	protocolVersion = 1
	audioAgarGameID = "audioagar"

	arenaWidth       = 4200.0
	arenaHeight      = 4200.0
	targetPellets    = 150
	targetBots       = 7
	tickRate         = 30
	writeWait        = 8 * time.Second
	pongWait         = 40 * time.Second
	pingPeriod       = 25 * time.Second
	maxMessageBytes  = 8192
	clientBufferSize = 64
)

type envelope struct {
	Protocol string          `json:"protocol,omitempty"`
	V        int             `json:"v,omitempty"`
	ID       string          `json:"id,omitempty"`
	Type     string          `json:"type"`
	GameID   string          `json:"gameId,omitempty"`
	RoomID   string          `json:"roomId,omitempty"`
	SentAt   int64           `json:"sentAt,omitempty"`
	Payload  json.RawMessage `json:"payload,omitempty"`
}

type outEnvelope struct {
	Protocol string `json:"protocol"`
	V        int    `json:"v"`
	ID       string `json:"id,omitempty"`
	Type     string `json:"type"`
	GameID   string `json:"gameId"`
	RoomID   string `json:"roomId"`
	SentAt   int64  `json:"sentAt"`
	Payload  any    `json:"payload,omitempty"`
}

type joinPayload struct {
	GameID     string `json:"gameId"`
	RoomID     string `json:"roomId"`
	Token      string `json:"token"`
	PlayerName string `json:"playerName"`
	UserAgent  string `json:"userAgent"`
}

type inputEnvelope struct {
	Seq        int       `json:"seq"`
	Input      gameInput `json:"input"`
	ClientTime int64     `json:"clientTime"`
}

type gameInput struct {
	Type      string  `json:"type"`
	Direction string  `json:"direction"`
	Vector    vector2 `json:"vector"`
}

type vector2 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type playerCell struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	VX      float64 `json:"vx"`
	VY      float64 `json:"vy"`
	Mass    float64 `json:"mass"`
	Radius  float64 `json:"radius"`
	IsSelf  bool    `json:"isSelf"`
	Bot     bool    `json:"bot,omitempty"`
	Alive   bool    `json:"alive"`
	Respawn int64   `json:"respawnAt,omitempty"`

	inputDir vector2
	boost    vector2
	lastSeq  int
}

type pellet struct {
	ID    string  `json:"id"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Value float64 `json:"value"`
}

type audioAgarState struct {
	Players     []playerCell `json:"players"`
	Pellets     []pellet     `json:"pellets"`
	ArenaWidth  float64      `json:"arenaWidth"`
	ArenaHeight float64      `json:"arenaHeight"`
	Tick        uint64       `json:"tick"`
	RoomID      string       `json:"roomId"`
	SelfID      string       `json:"selfId"`
	ServerTime  int64        `json:"serverTime"`
}

type hub struct {
	mu    sync.Mutex
	rooms map[string]*audioAgarRoom
}

type client struct {
	id        string
	name      string
	hub       *hub
	room      *audioAgarRoom
	conn      *websocket.Conn
	send      chan []byte
	closeOnce sync.Once
}

type audioAgarRoom struct {
	mu         sync.Mutex
	gameID     string
	roomID     string
	clients    map[string]*client
	players    map[string]*playerCell
	pellets    map[string]*pellet
	rng        *mathrand.Rand
	tick       uint64
	lastActive time.Time
}

func main() {
	h := newHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", h.handleHealthz)
	mux.HandleFunc("/ws", h.handleWS)
	mux.HandleFunc("/ws/game", h.handleWS)

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8081"
	}
	addr := ":" + port
	log.Printf("v2-server listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func newHub() *hub {
	return &hub{rooms: make(map[string]*audioAgarRoom)}
}

func (h *hub) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":       true,
		"service":  "v2-server",
		"games":    []string{audioAgarGameID},
		"protocol": protocolName,
	})
}

func (h *hub) handleWS(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 4096,
		CheckOrigin:     originAllowed,
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade failed: %v", err)
		return
	}
	c := &client{
		id:   "p-" + randomID(8),
		name: "Player",
		hub:  h,
		conn: conn,
		send: make(chan []byte, clientBufferSize),
	}
	go c.writePump()
	go c.readPump()
}

func originAllowed(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := parsed.Hostname()
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return true
	}
	if strings.HasSuffix(host, ".aiandsons.io") || host == "games.aiandsons.io" {
		return true
	}
	if strings.HasSuffix(host, ".vercel.app") {
		return true
	}

	extra := strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",")
	for _, allowed := range extra {
		if strings.EqualFold(strings.TrimSpace(allowed), origin) {
			return true
		}
	}
	return false
}

func (c *client) readPump() {
	defer func() {
		if c.room != nil {
			c.room.removeClient(c)
		}
		_ = c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageBytes)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				log.Printf("websocket read failed: %v", err)
			}
			return
		}
		var msg envelope
		if err := json.Unmarshal(raw, &msg); err != nil {
			c.sendError("", "Malformed JSON message.")
			continue
		}
		c.hub.handleEnvelope(c, msg)
	}
}

func (c *client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *hub) handleEnvelope(c *client, msg envelope) {
	if msg.Protocol != "" && msg.Protocol != protocolName {
		c.sendError(msg.RoomID, "Unsupported multiplayer protocol.")
		return
	}
	if msg.V != 0 && msg.V != protocolVersion {
		c.sendError(msg.RoomID, "Unsupported protocol version.")
		return
	}

	switch msg.Type {
	case "join":
		var payload joinPayload
		_ = json.Unmarshal(msg.Payload, &payload)
		gameID := firstNonEmpty(msg.GameID, payload.GameID, audioAgarGameID)
		if gameID != audioAgarGameID {
			c.sendError(msg.RoomID, "Unsupported gameId. This server currently hosts audioagar.")
			return
		}
		roomID := sanitizeRoomID(firstNonEmpty(msg.RoomID, payload.RoomID, "lobby"))
		name := sanitizeName(payload.PlayerName)
		room := h.getAudioAgarRoom(roomID)
		room.addClient(c, name)
	case "input":
		if c.room == nil {
			c.sendError(msg.RoomID, "Join a room before sending input.")
			return
		}
		var payload inputEnvelope
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			c.sendError(c.room.roomID, "Malformed input payload.")
			return
		}
		c.room.applyInput(c.id, payload)
	case "ping":
		c.sendEnvelope("pong", msg.RoomID, map[string]any{"serverTime": nowMillis(), "echo": json.RawMessage(msg.Payload)})
	default:
		c.sendError(msg.RoomID, "Unsupported message type: "+msg.Type)
	}
}

func (h *hub) getAudioAgarRoom(roomID string) *audioAgarRoom {
	h.mu.Lock()
	defer h.mu.Unlock()
	key := audioAgarGameID + ":" + roomID
	if room, ok := h.rooms[key]; ok {
		return room
	}
	seed := time.Now().UnixNano() ^ int64(len(h.rooms))*7919
	room := &audioAgarRoom{
		gameID:     audioAgarGameID,
		roomID:     roomID,
		clients:    make(map[string]*client),
		players:    make(map[string]*playerCell),
		pellets:    make(map[string]*pellet),
		rng:        mathrand.New(mathrand.NewSource(seed)),
		lastActive: time.Now(),
	}
	room.ensurePelletsLocked()
	go room.loop()
	h.rooms[key] = room
	return room
}

func (r *audioAgarRoom) loop() {
	ticker := time.NewTicker(time.Second / tickRate)
	defer ticker.Stop()
	last := time.Now()
	for now := range ticker.C {
		dt := now.Sub(last).Seconds()
		if dt <= 0 || dt > 0.15 {
			dt = 1.0 / tickRate
		}
		last = now
		r.step(dt)
		r.broadcastState()
	}
}

func (r *audioAgarRoom) addClient(c *client, name string) {
	if c.room != nil && c.room != r {
		c.room.removeClient(c)
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	c.name = name
	c.room = r
	r.clients[c.id] = c
	r.lastActive = time.Now()
	p := r.spawnPlayerLocked(c.id, name, false)
	r.players[c.id] = p
	r.ensureBotsLocked()
	r.ensurePelletsLocked()
	c.sendEnvelope("welcome", r.roomID, map[string]any{
		"selfId": p.ID,
		"roomId": r.roomID,
		"name":   p.Name,
	})
}

func (r *audioAgarRoom) removeClient(c *client) {
	r.mu.Lock()
	delete(r.clients, c.id)
	delete(r.players, c.id)
	r.lastActive = time.Now()
	r.mu.Unlock()
	c.closeSend()
}

func (c *client) closeSend() {
	c.closeOnce.Do(func() {
		close(c.send)
	})
}

func (c *client) sendError(roomID, message string) {
	if roomID == "" && c.room != nil {
		roomID = c.room.roomID
	}
	c.sendEnvelope("error", roomID, map[string]any{"message": message})
}

func (c *client) sendEnvelope(messageType, roomID string, payload any) {
	raw, err := marshalEnvelope(messageType, roomID, payload)
	if err != nil {
		log.Printf("marshal envelope failed: %v", err)
		return
	}
	select {
	case c.send <- raw:
	default:
		log.Printf("dropping slow client %s", c.id)
		if c.room != nil {
			go c.room.removeClient(c)
		}
	}
}

func marshalEnvelope(messageType, roomID string, payload any) ([]byte, error) {
	return json.Marshal(outEnvelope{
		Protocol: protocolName,
		V:        protocolVersion,
		Type:     messageType,
		GameID:   audioAgarGameID,
		RoomID:   roomID,
		SentAt:   nowMillis(),
		Payload:  payload,
	})
}

func (r *audioAgarRoom) step(dt float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tick++
	r.lastActive = time.Now()
	r.ensureBotsLocked()
	now := nowMillis()

	for _, p := range r.players {
		if !p.Alive {
			continue
		}
		if p.Bot {
			p.inputDir = r.botInputLocked(p, now)
		}
		speed := movementSpeed(p.Mass)
		p.VX = p.inputDir.X*speed + p.boost.X
		p.VY = p.inputDir.Y*speed + p.boost.Y
		p.X = clampFloat(p.X+p.VX*dt, p.Radius, arenaWidth-p.Radius)
		p.Y = clampFloat(p.Y+p.VY*dt, p.Radius, arenaHeight-p.Radius)
		p.boost.X *= math.Pow(0.12, dt)
		p.boost.Y *= math.Pow(0.12, dt)
	}

	r.resolvePelletsLocked()
	r.resolveCellsLocked()
	r.ensurePelletsLocked()
}

func (r *audioAgarRoom) applyInput(playerID string, payload inputEnvelope) {
	r.mu.Lock()
	defer r.mu.Unlock()
	p := r.players[playerID]
	if p == nil || p.Bot {
		return
	}
	if payload.Seq != 0 && payload.Seq < p.lastSeq {
		return
	}
	if payload.Seq != 0 {
		p.lastSeq = payload.Seq
	}
	input := payload.Input
	input.Type = strings.ToLower(strings.TrimSpace(input.Type))
	dir := normalizeVector(input.Vector)
	if zeroVector(dir) {
		dir = directionToVector(input.Direction)
	}
	switch input.Type {
	case "move", "":
		p.inputDir = dir
	case "split":
		p.inputDir = dirOrExisting(dir, p.inputDir)
		r.splitPlayerLocked(p, p.inputDir)
	case "eject":
		p.inputDir = dirOrExisting(dir, p.inputDir)
		r.ejectMassLocked(p, p.inputDir)
	}
}

func (r *audioAgarRoom) splitPlayerLocked(p *playerCell, dir vector2) {
	if p.Mass < 38 || !p.Alive {
		return
	}
	dir = dirOrExisting(dir, p.inputDir)
	p.Mass *= 0.82
	p.Radius = massToRadius(p.Mass)
	p.boost.X += dir.X * 520
	p.boost.Y += dir.Y * 520
	r.spawnPelletLocked(p.X-dir.X*(p.Radius+16), p.Y-dir.Y*(p.Radius+16), 3)
}

func (r *audioAgarRoom) ejectMassLocked(p *playerCell, dir vector2) {
	if p.Mass < 20 || !p.Alive {
		return
	}
	dir = dirOrExisting(dir, p.inputDir)
	p.Mass = math.Max(12, p.Mass-4)
	p.Radius = massToRadius(p.Mass)
	x := clampFloat(p.X+dir.X*(p.Radius+28), 12, arenaWidth-12)
	y := clampFloat(p.Y+dir.Y*(p.Radius+28), 12, arenaHeight-12)
	r.spawnPelletLocked(x, y, 4)
	p.boost.X -= dir.X * 50
	p.boost.Y -= dir.Y * 50
}

func (r *audioAgarRoom) resolvePelletsLocked() {
	for _, p := range r.players {
		if !p.Alive {
			continue
		}
		eaten := 0.0
		for id, food := range r.pellets {
			if distanceXY(p.X, p.Y, food.X, food.Y) <= p.Radius+7 {
				eaten += food.Value
				delete(r.pellets, id)
			}
		}
		if eaten > 0 {
			p.Mass += eaten
			p.Radius = massToRadius(p.Mass)
		}
	}
}

func (r *audioAgarRoom) resolveCellsLocked() {
	players := make([]*playerCell, 0, len(r.players))
	for _, p := range r.players {
		if p.Alive {
			players = append(players, p)
		}
	}
	sort.Slice(players, func(i, j int) bool { return players[i].Mass > players[j].Mass })
	eaten := make(map[string]bool)
	for _, eater := range players {
		if eaten[eater.ID] {
			continue
		}
		for _, victim := range players {
			if eater.ID == victim.ID || eaten[victim.ID] || !canConsume(eater, victim, nowMillis()) {
				continue
			}
			if distanceXY(eater.X, eater.Y, victim.X, victim.Y) > math.Max(eater.Radius, victim.Radius)*0.84 {
				continue
			}
			eaten[victim.ID] = true
			finalMass := victim.Mass
			eater.Mass += math.Max(8, victim.Mass*0.62)
			eater.Radius = massToRadius(eater.Mass)
			r.respawnPlayerLocked(victim)
			if !victim.Bot {
				if c := r.clients[victim.ID]; c != nil {
					c.sendEnvelope("death", r.roomID, map[string]any{
						"type":      "death",
						"selfId":    victim.ID,
						"eaterId":   eater.ID,
						"eaterName": eater.Name,
						"finalMass": math.Round(finalMass),
						"roomId":    r.roomID,
					})
				}
			}
		}
	}
}

func (r *audioAgarRoom) broadcastState() {
	r.mu.Lock()
	snapshots := make([]struct {
		client *client
		raw    []byte
	}, 0, len(r.clients))
	for id, c := range r.clients {
		state := r.snapshotLocked(id)
		raw, err := marshalEnvelope("state", r.roomID, map[string]any{"state": state})
		if err != nil {
			continue
		}
		snapshots = append(snapshots, struct {
			client *client
			raw    []byte
		}{client: c, raw: raw})
	}
	r.mu.Unlock()

	for _, snapshot := range snapshots {
		select {
		case snapshot.client.send <- snapshot.raw:
		default:
			log.Printf("state dropped for slow client %s", snapshot.client.id)
		}
	}
}

func (r *audioAgarRoom) snapshotLocked(selfID string) audioAgarState {
	players := make([]playerCell, 0, len(r.players))
	for _, p := range r.players {
		copy := *p
		copy.IsSelf = p.ID == selfID
		copy.inputDir = vector2{}
		copy.boost = vector2{}
		copy.lastSeq = 0
		players = append(players, copy)
	}
	sort.Slice(players, func(i, j int) bool {
		if players[i].IsSelf != players[j].IsSelf {
			return players[i].IsSelf
		}
		return players[i].ID < players[j].ID
	})
	pellets := make([]pellet, 0, len(r.pellets))
	for _, food := range r.pellets {
		pellets = append(pellets, *food)
	}
	sort.Slice(pellets, func(i, j int) bool { return pellets[i].ID < pellets[j].ID })
	return audioAgarState{
		Players:     players,
		Pellets:     pellets,
		ArenaWidth:  arenaWidth,
		ArenaHeight: arenaHeight,
		Tick:        r.tick,
		RoomID:      r.roomID,
		SelfID:      selfID,
		ServerTime:  nowMillis(),
	}
}

func (r *audioAgarRoom) spawnPlayerLocked(id, name string, bot bool) *playerCell {
	mass := 30 + r.rng.Float64()*12
	if bot {
		mass = 22 + r.rng.Float64()*76
	}
	x, y := r.safeSpawnPointLocked(id)
	return &playerCell{
		ID:     id,
		Name:   sanitizeName(name),
		X:      x,
		Y:      y,
		Mass:   mass,
		Radius: massToRadius(mass),
		Bot:    bot,
		Alive:  true,
		Respawn: func() int64 {
			if bot {
				return nowMillis() + 1200
			}
			return nowMillis() + 3600
		}(),
	}
}

func (r *audioAgarRoom) safeSpawnPointLocked(id string) (float64, float64) {
	const margin = 520.0
	bestX := arenaWidth / 2
	bestY := arenaHeight / 2
	bestScore := -1.0
	for attempt := 0; attempt < 36; attempt++ {
		x := margin + r.rng.Float64()*(arenaWidth-margin*2)
		y := margin + r.rng.Float64()*(arenaHeight-margin*2)
		minDistance := math.MaxFloat64
		for _, other := range r.players {
			if other.ID == id || !other.Alive {
				continue
			}
			d := distanceXY(x, y, other.X, other.Y) - other.Radius
			if d < minDistance {
				minDistance = d
			}
		}
		if minDistance == math.MaxFloat64 {
			return x, y
		}
		if minDistance > bestScore {
			bestScore = minDistance
			bestX = x
			bestY = y
		}
		if minDistance >= 760 {
			return x, y
		}
	}
	return bestX, bestY
}

func (r *audioAgarRoom) respawnPlayerLocked(p *playerCell) {
	next := r.spawnPlayerLocked(p.ID, p.Name, p.Bot)
	next.inputDir = p.inputDir
	*p = *next
}

func (r *audioAgarRoom) ensureBotsLocked() {
	liveBots := 0
	for _, p := range r.players {
		if p.Bot {
			liveBots++
		}
	}
	for liveBots < targetBots {
		id := "bot-" + randomID(6)
		names := []string{"Alto", "Bass", "Pulse", "Drift", "Echo", "Mira", "Rill", "Vega", "Chord"}
		name := names[r.rng.Intn(len(names))]
		r.players[id] = r.spawnPlayerLocked(id, name, true)
		liveBots++
	}
}

func (r *audioAgarRoom) ensurePelletsLocked() {
	for len(r.pellets) < targetPellets {
		r.spawnPelletLocked(80+r.rng.Float64()*(arenaWidth-160), 80+r.rng.Float64()*(arenaHeight-160), 1+float64(r.rng.Intn(3)))
	}
}

func (r *audioAgarRoom) spawnPelletLocked(x, y, value float64) {
	id := "pellet-" + strconv.FormatUint(r.tick, 36) + "-" + randomID(5)
	r.pellets[id] = &pellet{
		ID:    id,
		X:     clampFloat(x, 8, arenaWidth-8),
		Y:     clampFloat(y, 8, arenaHeight-8),
		Value: clampFloat(value, 1, 8),
	}
}

func (r *audioAgarRoom) botInputLocked(bot *playerCell, now int64) vector2 {
	var avoid *playerCell
	var chase *playerCell
	var food *pellet
	avoidDistance := 720.0
	chaseDistance := 980.0
	foodDistance := math.MaxFloat64

	for _, other := range r.players {
		if other.ID == bot.ID || !other.Alive {
			continue
		}
		d := distanceXY(bot.X, bot.Y, other.X, other.Y)
		if canEat(other, bot) && d < avoidDistance {
			avoidDistance = d
			avoid = other
		} else if !isProtected(other, now) && canEat(bot, other) && d < chaseDistance {
			chaseDistance = d
			chase = other
		}
	}
	if avoid != nil {
		return normalizeVector(vector2{X: bot.X - avoid.X, Y: bot.Y - avoid.Y})
	}
	if chase != nil {
		return normalizeVector(vector2{X: chase.X - bot.X, Y: chase.Y - bot.Y})
	}
	for _, pellet := range r.pellets {
		d := distanceXY(bot.X, bot.Y, pellet.X, pellet.Y)
		if d < foodDistance {
			foodDistance = d
			food = pellet
		}
	}
	if food != nil {
		return normalizeVector(vector2{X: food.X - bot.X, Y: food.Y - bot.Y})
	}
	phase := float64(r.tick)*0.035 + float64(len(bot.ID))*0.7
	return vector2{X: math.Cos(phase), Y: math.Sin(phase)}
}

func movementSpeed(mass float64) float64 {
	return 330 / math.Sqrt(math.Max(1, mass/30))
}

func massToRadius(mass float64) float64 {
	return 10 + math.Sqrt(math.Max(1, mass))*3.2
}

func canEat(a, b *playerCell) bool {
	return a.Mass >= b.Mass*1.18
}

func canConsume(a, b *playerCell, now int64) bool {
	return !isProtected(b, now) && canEat(a, b)
}

func isProtected(p *playerCell, now int64) bool {
	return p.Respawn > now
}

func distanceXY(ax, ay, bx, by float64) float64 {
	return math.Hypot(ax-bx, ay-by)
}

func normalizeVector(v vector2) vector2 {
	if !isFinite(v.X) || !isFinite(v.Y) {
		return vector2{}
	}
	length := math.Hypot(v.X, v.Y)
	if length < 0.001 {
		return vector2{}
	}
	return vector2{X: v.X / length, Y: v.Y / length}
}

func zeroVector(v vector2) bool {
	return math.Abs(v.X) < 0.001 && math.Abs(v.Y) < 0.001
}

func dirOrExisting(candidate, existing vector2) vector2 {
	if !zeroVector(candidate) {
		return candidate
	}
	if !zeroVector(existing) {
		return existing
	}
	return vector2{X: 1, Y: 0}
}

func directionToVector(direction string) vector2 {
	text := strings.ToUpper(strings.TrimSpace(direction))
	var v vector2
	if strings.Contains(text, "N") {
		v.Y -= 1
	}
	if strings.Contains(text, "S") {
		v.Y += 1
	}
	if strings.Contains(text, "W") {
		v.X -= 1
	}
	if strings.Contains(text, "E") {
		v.X += 1
	}
	return normalizeVector(v)
}

func clampFloat(value, min, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func sanitizeRoomID(value string) string {
	text := strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' || r == '-' {
			b.WriteRune(r)
		}
		if b.Len() >= 40 {
			break
		}
	}
	if b.Len() == 0 {
		return "lobby"
	}
	return b.String()
}

func sanitizeName(value string) string {
	text := strings.TrimSpace(value)
	var b strings.Builder
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == ' ' || r == '_' || r == '-' || r == '.' {
			b.WriteRune(r)
		}
		if b.Len() >= 24 {
			break
		}
	}
	if b.Len() == 0 {
		return "Player"
	}
	return b.String()
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func randomID(bytesLen int) string {
	buf := make([]byte, bytesLen)
	if _, err := rand.Read(buf); err == nil {
		return hex.EncodeToString(buf)
	}
	return fmt.Sprintf("%x", time.Now().UnixNano())
}

func nowMillis() int64 {
	return time.Now().UnixNano() / int64(time.Millisecond)
}
