import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Party Mode exposes a gesture-unlocked, device-local audio engine", async () => {
  const [audio, app, html, styles] = await Promise.all([
    read("party/audio.js"),
    read("party/app.js"),
    read("party/index.html"),
    read("party/styles.css"),
  ]);
  assert.match(audio, /export function createPartyAudio/);
  assert.match(audio, /AudioContext|webkitAudioContext/);
  assert.match(audio, /speechSynthesis/);
  assert.match(audio, /aiandsons-party-audio-enabled/);
  assert.match(audio, /partySettings\?\.\[setting\] !== false/);
  assert.match(audio, /sharedScreen/);
  assert.match(app, /createPartyAudio\(\{ sharedScreen: screenMode \}\)/);
  assert.match(app, /partyAudio\.handleSnapshot/);
  assert.match(app, /partyAudio\.welcome/);
  assert.match(app, /partyAudio\.bind\(byId\("partySoundButton"\)\)/);
  assert.match(app, /window\.__partyAudioDebug/);
  assert.match(app, /audio: \(\(\) =>/);
  assert.match(html, /id="partySoundButton"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(styles, /\.sound-button/);
  assert.doesNotMatch(audio, /https?:\/\//, "audio should not fetch external assets");
});

test("audio cues cover the important Party Mode transitions", async () => {
  const audio = await read("party/audio.js");
  for (const cue of ["joined", "ready", "select", "vote_open", "wheel", "next_up", "go", "choice_open", "reveal", "results", "victory", "pause", "error"]) {
    assert.match(audio, new RegExp(`\\b${cue}:`));
  }
  assert.match(audio, /phase === "voting"/);
  assert.match(audio, /phase === "spinning"/);
  assert.match(audio, /next\.phase === "choosing"/);
  assert.match(audio, /next\.phase === "reveal"/);
});
