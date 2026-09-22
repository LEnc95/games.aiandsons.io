package main

import (
	"regexp"
	"strings"
	"unicode"
)

const sketchChooseMs int64 = 10000
const sketchRoundMs int64 = 60000
const sketchRecapMs int64 = 7000

type sketchPrompt struct {
	ID         string   `json:"id"`
	Text       string   `json:"text"`
	Category   string   `json:"category"`
	Difficulty string   `json:"difficulty"`
	Aliases    []string `json:"-"`
}
type sketchPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	T int64   `json:"t"`
}
type sketchStroke struct {
	RoundID  string        `json:"roundId"`
	StrokeID string        `json:"strokeId"`
	Sequence int           `json:"sequence"`
	Tool     string        `json:"tool"`
	Color    string        `json:"color"`
	Width    int           `json:"width"`
	Points   []sketchPoint `json:"points"`
}
type sketchClashState struct {
	Round          int
	TotalRounds    int
	ArtistID       string
	RoundID        string
	Choices        []sketchPrompt
	Selected       *sketchPrompt
	Used           map[string]bool
	Solved         map[string]bool
	Strokes        []sketchStroke
	GuessFeed      []map[string]any
	LastGuessAt    map[string]int64
	LastSequence   int
	CanvasRevision int
	ClearedStrokes []sketchStroke
	StartedAt      int64
}

var sketchColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

var sketchPrompts = []sketchPrompt{
	{"pizza", "Pizza", "food", "easy", []string{}}, {"skateboard", "Skateboard", "objects", "easy", []string{"skate board"}}, {"volcano", "Volcano", "places", "easy", []string{}}, {"bicycle", "Bicycle", "objects", "easy", []string{"bike"}}, {"octopus", "Octopus", "animals", "easy", []string{}}, {"rainbow", "Rainbow", "places", "easy", []string{}}, {"popcorn", "Popcorn", "food", "easy", []string{}}, {"campfire", "Campfire", "activities", "mixed", []string{"bonfire"}}, {"roller coaster", "Roller Coaster", "places", "mixed", []string{}}, {"robot", "Robot", "internet culture", "mixed", []string{}}, {"unicorn", "Unicorn", "silly party", "mixed", []string{}}, {"treasure map", "Treasure Map", "games", "hard", []string{}},
}

func newSketchClashState() *sketchClashState {
	return &sketchClashState{Used: map[string]bool{}, Solved: map[string]bool{}, LastGuessAt: map[string]int64{}}
}
func normalizeSketchGuess(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(s)) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsSpace(r) {
			b.WriteRune(r)
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}
func (r *partyRoom) startRotationSketchClashLocked(now int64) { r.startSketchClashLocked(now) }
func (r *partyRoom) startSketchClashLocked(now int64) {
	r.sketch = newSketchClashState()
	r.sketch.TotalRounds = r.connectedPlayerCountLocked()
	r.sketch.Round = 1
	for _, p := range r.players {
		p.Points = 0
		p.HeatPoints = 0
		p.Active = p.Connected
		p.Queued = !p.Connected
	}
	r.beginSketchRoundLocked(now)
}
func (r *partyRoom) beginSketchRoundLocked(now int64) {
	s := r.sketch
	active := r.rankedPlayersLocked(false)
	if len(active) < 2 {
		return
	}
	s.ArtistID = active[(s.Round-1)%len(active)].ID
	s.RoundID = r.roomID + "-" + string(rune('a'+s.Round))
	s.Solved = map[string]bool{}
	s.Strokes = nil
	s.GuessFeed = nil
	s.LastSequence = 0
	s.CanvasRevision = 0
	s.ClearedStrokes = nil
	s.Selected = nil
	s.Choices = nil
	for i := 0; len(s.Choices) < 3 && i < len(sketchPrompts)*2; i++ {
		p := sketchPrompts[(s.Round*3+i)%len(sketchPrompts)]
		if !s.Used[p.ID] {
			s.Choices = append(s.Choices, p)
		}
	}
	r.phase = "choosing_prompt"
	r.phaseEndsAt = now + sketchChooseMs
}
func (r *partyRoom) selectSketchPromptLocked(id string, now int64) {
	s := r.sketch
	if s == nil || r.phase != "choosing_prompt" || s.Selected != nil {
		return
	}
	for _, p := range s.Choices {
		if id == "" || p.ID == id {
			s.Selected = &p
			break
		}
	}
	if s.Selected == nil {
		s.Selected = &s.Choices[0]
	}
	s.Used[s.Selected.ID] = true
	s.StartedAt = now
	r.phase = "drawing"
	r.phaseEndsAt = now + sketchRoundMs
}
func (r *partyRoom) applySketchClashHostActionLocked(action string, now int64, c *client) {
	if action == "start" {
		if r.phase != "lobby" && r.phase != "podium" && r.phase != "ended" {
			c.sendErrorCode(r.roomID, "invalid_phase", "The game has already started.")
			return
		}
		if r.connectedPlayerCountLocked() < 2 {
			c.sendErrorCode(r.roomID, "not_enough_players", "At least two players must be connected.")
			return
		}
		r.startSketchClashLocked(now)
		return
	}
	if action == "end_round" && r.phase == "drawing" {
		r.endSketchRoundLocked(now)
		return
	}
	c.sendErrorCode(r.roomID, "unsupported_input", "That host action is not supported.")
}
func (r *partyRoom) applySketchClashPlayerInputLocked(p *partyPlayer, in partyInput, now int64, c *client) {
	s := r.sketch
	if s == nil {
		return
	}
	switch in.Type {
	case "choose_prompt":
		if p.ID != s.ArtistID || r.phase != "choosing_prompt" {
			c.sendErrorCode(r.roomID, "unauthorized_prompt", "Only the active artist can choose.")
			return
		}
		r.selectSketchPromptLocked(in.Choice, now)
	case "stroke":
		if p.ID != s.ArtistID || r.phase != "drawing" || in.Stroke.RoundID != s.RoundID || in.Stroke.Sequence != s.LastSequence+1 || strings.TrimSpace(in.Stroke.StrokeID) == "" || len(in.Stroke.StrokeID) > 48 || len(in.Stroke.Points) < 2 || len(in.Stroke.Points) > 128 || in.Stroke.Width < 2 || in.Stroke.Width > 48 || !containsString([]string{"pen", "eraser"}, in.Stroke.Tool) || (in.Stroke.Tool == "pen" && !sketchColorPattern.MatchString(in.Stroke.Color)) {
			c.sendErrorCode(r.roomID, "invalid_stroke", "That drawing update was rejected.")
			return
		}
		for _, pt := range in.Stroke.Points {
			if pt.X < 0 || pt.X > 1 || pt.Y < 0 || pt.Y > 1 {
				c.sendErrorCode(r.roomID, "invalid_stroke", "Points must be normalized.")
				return
			}
		}
		s.LastSequence++
		s.CanvasRevision++
		s.ClearedStrokes = nil
		s.Strokes = append(s.Strokes, in.Stroke)
	case "canvas_action":
		if p.ID != s.ArtistID || r.phase != "drawing" {
			c.sendErrorCode(r.roomID, "unauthorized_canvas_action", "Only the active artist can change the canvas.")
			return
		}
		switch in.Action {
		case "undo":
			if len(s.Strokes) == 0 && len(s.ClearedStrokes) > 0 {
				s.Strokes, s.ClearedStrokes = s.ClearedStrokes, nil
				s.CanvasRevision++
				return
			}
			if len(s.Strokes) == 0 {
				return
			}
			strokeID := s.Strokes[len(s.Strokes)-1].StrokeID
			for len(s.Strokes) > 0 && s.Strokes[len(s.Strokes)-1].StrokeID == strokeID {
				s.Strokes = s.Strokes[:len(s.Strokes)-1]
			}
			s.CanvasRevision++
		case "clear":
			if len(s.Strokes) == 0 {
				return
			}
			s.ClearedStrokes = append([]sketchStroke(nil), s.Strokes...)
			s.Strokes = nil
			s.CanvasRevision++
		default:
			c.sendErrorCode(r.roomID, "invalid_canvas_action", "That canvas action is not supported.")
		}
	case "guess":
		if r.phase != "drawing" || p.ID == s.ArtistID || s.Solved[p.ID] {
			return
		}
		if now-s.LastGuessAt[p.ID] < 700 {
			c.sendErrorCode(r.roomID, "rate_limited", "Please wait before another guess.")
			return
		}
		s.LastGuessAt[p.ID] = now
		g := normalizeSketchGuess(in.Guess)
		correct := g == normalizeSketchGuess(s.Selected.Text)
		for _, a := range s.Selected.Aliases {
			correct = correct || g == normalizeSketchGuess(a)
		}
		if correct {
			s.Solved[p.ID] = true
			remaining := maxInt64(0, r.phaseEndsAt-now)
			p.HeatPoints = 100 + int(400*remaining/sketchRoundMs)
			p.Points += p.HeatPoints
			if r.sketchAllSolvedLocked() {
				r.endSketchRoundLocked(now)
			}
		} else if len(g) > 0 {
			s.GuessFeed = append(s.GuessFeed, map[string]any{"playerName": p.Name, "guess": g})
			if len(s.GuessFeed) > 8 {
				s.GuessFeed = s.GuessFeed[len(s.GuessFeed)-8:]
			}
		}
	default:
		c.sendErrorCode(r.roomID, "unsupported_input", "That controller action is not supported.")
	}
}
func (r *partyRoom) sketchAllSolvedLocked() bool {
	eligible := 0
	for id, p := range r.players {
		if p.Connected && id != r.sketch.ArtistID {
			eligible++
			if !r.sketch.Solved[id] {
				return false
			}
		}
	}
	return eligible > 0
}
func (r *partyRoom) endSketchRoundLocked(now int64) {
	s := r.sketch
	if s == nil || s.Selected == nil {
		return
	}
	artist := r.players[s.ArtistID]
	solved := len(s.Solved)
	if artist != nil {
		artist.HeatPoints = solved * 50
		if r.sketchAllSolvedLocked() {
			artist.HeatPoints += 100
		}
		artist.Points += artist.HeatPoints
	}
	r.phase = "round_recap"
	r.phaseEndsAt = now + sketchRecapMs
}
func (r *partyRoom) stepSketchClashLocked(now int64) {
	if r.phase == "choosing_prompt" && now >= r.phaseEndsAt {
		r.selectSketchPromptLocked("", now)
	}
	if r.phase == "drawing" && now >= r.phaseEndsAt {
		r.endSketchRoundLocked(now)
	}
	if r.phase == "round_recap" && now >= r.phaseEndsAt {
		if r.sketch.Round >= r.sketch.TotalRounds {
			if r.sessionMode == partyRotationSessionMode {
				r.completeRotationActivityLocked(now)
			} else {
				r.phase = "podium"
			}
			return
		}
		r.sketch.Round++
		r.beginSketchRoundLocked(now)
	}
}
func (r *partyRoom) sketchClashSnapshotLocked(selfID string) map[string]any {
	s := r.sketch
	if s == nil {
		s = newSketchClashState()
		r.sketch = s
	}
	players := r.rotationPlayersLocked()
	state := map[string]any{"gameKey": r.gameKey, "roomId": r.roomID, "phase": r.phase, "serverTime": nowMillis(), "phaseEndsAt": r.phaseEndsAt, "players": players, "selfId": selfID, "round": s.Round, "totalRounds": s.TotalRounds, "currentArtistId": s.ArtistID, "roundId": s.RoundID, "solvedPlayerIds": keysSketch(s.Solved), "canvasRevision": s.CanvasRevision, "strokeSequence": s.LastSequence, "strokes": s.Strokes, "guessFeed": s.GuessFeed, "minPlayers": 2, "maxPlayers": 8}
	if r.phase == "round_recap" || r.phase == "podium" {
		if s.Selected != nil {
			state["answer"] = s.Selected.Text
		}
	}
	if selfID == s.ArtistID && r.phase == "choosing_prompt" {
		state["promptChoices"] = s.Choices
	}
	if selfID == s.ArtistID && r.phase == "drawing" && s.Selected != nil {
		state["selectedPrompt"] = map[string]string{"id": s.Selected.ID, "text": s.Selected.Text, "category": s.Selected.Category}
	}
	state["hasGuessedCorrectly"] = s.Solved[selfID]
	return state
}
func keysSketch(m map[string]bool) []string {
	out := []string{}
	for id := range m {
		out = append(out, id)
	}
	return out
}
