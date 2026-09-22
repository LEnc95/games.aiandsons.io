package main

import "testing"

func sketchTestRoom() *partyRoom {
	return &partyRoom{gameKey: sketchClashGameKey, roomID: "TEST", phase: "drawing", players: map[string]*partyPlayer{"a": {ID: "a", Name: "Artist", Connected: true, Active: true}, "b": {ID: "b", Name: "Guesser", Connected: true, Active: true}}, displays: map[string]*client{}, tokenToPlayer: map[string]string{}, sketch: &sketchClashState{ArtistID: "a", RoundID: "TEST-a", Selected: &sketchPrompts[0], Solved: map[string]bool{}, Used: map[string]bool{}, LastGuessAt: map[string]int64{}, Choices: []sketchPrompt{sketchPrompts[0]}, Strokes: []sketchStroke{}}}
}
func TestSketchClashSecretsAndScoring(t *testing.T) {
	r := sketchTestRoom()
	r.phaseEndsAt = 100000
	host := r.sketchClashSnapshotLocked("")
	if _, ok := host["selectedPrompt"]; ok {
		t.Fatal("host received private answer")
	}
	guesser := r.sketchClashSnapshotLocked("b")
	if _, ok := guesser["selectedPrompt"]; ok {
		t.Fatal("guesser received private answer")
	}
	artist := r.sketchClashSnapshotLocked("a")
	if artist["selectedPrompt"].(map[string]string)["text"] != "Pizza" {
		t.Fatal("artist missing prompt")
	}
	r.applySketchClashPlayerInputLocked(r.players["b"], partyInput{Type: "guess", Guess: "PIZZA!"}, 50000, &client{send: make(chan []byte, 1)})
	if !r.sketch.Solved["b"] || r.players["b"].Points != 433 {
		t.Fatalf("normalized guess was not scored once: %#v", r.players["b"])
	}
}
func TestSketchClashRejectsUnauthorizedStroke(t *testing.T) {
	r := sketchTestRoom()
	r.applySketchClashPlayerInputLocked(r.players["b"], partyInput{Type: "stroke", Stroke: sketchStroke{RoundID: "TEST-a", Sequence: 1, Tool: "pen", Width: 4, Points: []sketchPoint{{X: .5, Y: .5}}}}, 1, &client{send: make(chan []byte, 1)})
	if len(r.sketch.Strokes) != 0 {
		t.Fatal("guesser stroke accepted")
	}
}

func TestSketchClashUndoRemovesWholeBatchedStrokeAndRestoresClear(t *testing.T) {
	r := sketchTestRoom()
	artist := r.players["a"]
	client := &client{send: make(chan []byte, 4)}
	for sequence := 1; sequence <= 2; sequence++ {
		r.applySketchClashPlayerInputLocked(artist, partyInput{Type: "stroke", Stroke: sketchStroke{RoundID: "TEST-a", StrokeID: "gesture-1", Sequence: sequence, Tool: "pen", Color: "#123abc", Width: 30, Points: []sketchPoint{{X: .1, Y: .1}, {X: .2, Y: .2}}}}, int64(sequence), client)
	}
	if len(r.sketch.Strokes) != 2 {
		t.Fatalf("batched stroke was not accepted: %#v", r.sketch.Strokes)
	}
	r.applySketchClashPlayerInputLocked(artist, partyInput{Type: "canvas_action", Action: "undo"}, 3, client)
	if len(r.sketch.Strokes) != 0 {
		t.Fatalf("undo left part of one gesture: %#v", r.sketch.Strokes)
	}
	r.applySketchClashPlayerInputLocked(artist, partyInput{Type: "stroke", Stroke: sketchStroke{RoundID: "TEST-a", StrokeID: "gesture-2", Sequence: 3, Tool: "eraser", Color: "#ffffff", Width: 48, Points: []sketchPoint{{X: .2, Y: .2}, {X: .3, Y: .3}}}}, 4, client)
	r.applySketchClashPlayerInputLocked(artist, partyInput{Type: "canvas_action", Action: "clear"}, 5, client)
	if len(r.sketch.Strokes) != 0 {
		t.Fatal("clear did not empty canvas")
	}
	r.applySketchClashPlayerInputLocked(artist, partyInput{Type: "canvas_action", Action: "undo"}, 6, client)
	if len(r.sketch.Strokes) != 1 || r.sketch.Strokes[0].Tool != "eraser" {
		t.Fatalf("undo did not restore clear: %#v", r.sketch.Strokes)
	}
}
