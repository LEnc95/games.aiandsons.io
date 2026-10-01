const audioStorageKey = "aiandsons-party-audio-enabled";

const cuePatterns = Object.freeze({
  enabled: [[660, .07], [880, .11]],
  joined: [[520, .07], [700, .09]],
  ready: [[620, .06], [820, .08]],
  select: [[720, .06]],
  vote_open: [[440, .08], [560, .08], [720, .12]],
  vote_cast: [[760, .07]],
  wheel: [[260, .05], [330, .05], [420, .05], [540, .1]],
  next_up: [[520, .08], [660, .08], [820, .14]],
  countdown: [[440, .11]],
  go: [[520, .06], [780, .06], [1040, .16]],
  choice_open: [[580, .08], [740, .1]],
  reveal: [[420, .08], [630, .08], [880, .16]],
  results: [[520, .08], [650, .08], [780, .13]],
  victory: [[440, .09], [554, .09], [659, .09], [880, .2]],
  pause: [[360, .12], [280, .18]],
  error: [[220, .1], [170, .16]],
});

function savedEnabled() {
  try { return localStorage.getItem(audioStorageKey) !== "false"; }
  catch { return true; }
}

function partyLeader(snapshot) {
  return [...(snapshot?.players || [])].sort((a, b) => (a.partyRank || 99) - (b.partyRank || 99))[0] || null;
}

export function createPartyAudio({ sharedScreen = false } = {}) {
  let enabled = savedEnabled();
  let activated = false;
  let context = null;
  let button = null;
  let lastAnnouncement = "";
  const history = [];

  function settingsAllow(snapshot, setting) {
    return snapshot?.partySettings?.[setting] !== false;
  }

  function syncButton() {
    if (!button) return;
    const label = !enabled ? "Sound off" : activated ? "Sound on" : "Enable sound";
    button.textContent = label;
    button.setAttribute("aria-pressed", String(enabled && activated));
    button.setAttribute("aria-label", !enabled ? "Turn Party Mode sound on" : activated ? "Turn Party Mode sound off" : "Enable Party Mode sound");
    button.classList.toggle("is-active", enabled && activated);
  }

  function ensureContext() {
    if (context) return context;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    try { context = new AudioCtor(); } catch { context = null; }
    return context;
  }

  async function activate({ confirm = false } = {}) {
    if (!enabled) return false;
    activated = true;
    const audioContext = ensureContext();
    try { await audioContext?.resume?.(); } catch { /* Speech and visual play remain available. */ }
    syncButton();
    if (confirm) cue("enabled", null, { force: true });
    return true;
  }

  function remember(type, detail = "") {
    history.push({ type, detail, at: Date.now() });
    if (history.length > 32) history.splice(0, history.length - 32);
  }

  function cue(name, snapshot, { force = false } = {}) {
    if (!enabled || !activated || (!force && !settingsAllow(snapshot, "effects"))) return false;
    const pattern = cuePatterns[name];
    if (!pattern) return false;
    remember(name);
    const audioContext = ensureContext();
    if (!audioContext) return true;
    const start = audioContext.currentTime + .01;
    try {
      pattern.forEach(([frequency, duration], index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const beginsAt = start + index * .075;
        oscillator.type = name === "error" || name === "pause" ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(frequency, beginsAt);
        gain.gain.setValueAtTime(.0001, beginsAt);
        gain.gain.exponentialRampToValueAtTime(name === "victory" ? .075 : .05, beginsAt + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, beginsAt + duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(beginsAt);
        oscillator.stop(beginsAt + duration + .02);
      });
    } catch {
      // Audio is an enhancement; a browser/device can revoke the context at any time.
    }
    return true;
  }

  function speak(text, snapshot) {
    if (!sharedScreen || !enabled || !activated || !settingsAllow(snapshot, "narration") || !text || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") return false;
    if (text === lastAnnouncement) return false;
    lastAnnouncement = text;
    remember("narration", text);
    try {
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.rate = .98;
      utterance.pitch = 1.04;
      utterance.volume = .9;
      window.speechSynthesis.speak(utterance);
      return true;
    } catch { return false; }
  }

  function handleRotation(previous, next) {
    const before = previous?.partyPhase;
    const phase = next?.partyPhase;
    if (before !== phase) {
      if (phase === "voting") { cue("vote_open", next); speak("Voting is open. Choose the next activity.", next); }
      else if (phase === "spinning") { cue("wheel", next); speak("The wheel is spinning.", next); }
      else if (phase === "next_up") { cue("next_up", next); speak(`Next up: ${next.activity?.label || "the next activity"}.`, next); }
      else if (phase === "activity") { cue("go", next); speak("Go!", next); }
      else if (phase === "results") {
        cue("results", next);
        const leader = partyLeader(next);
        speak(leader ? `Activity complete. ${leader.name} leads with ${leader.partyPoints || 0} party points.` : "Activity complete.", next);
      } else if (phase === "ended") {
        cue("victory", next);
        const winner = partyLeader(next);
        speak(winner ? `${winner.name} wins the party with ${winner.partyPoints || 0} points!` : "The party is complete!", next);
      } else if (phase === "paused") { cue("pause", next); speak("Party paused.", next); }
    }
    if (sharedScreen && previous) {
      const playersBefore = previous.players?.length || 0;
      const playersNow = next.players?.length || 0;
      if (playersNow > playersBefore) cue("joined", next);
      if ((next.readyCount || 0) > (previous.readyCount || 0)) cue("ready", next);
      const ballotsBefore = previous.partyVote?.ballots?.length || 0;
      const ballotsNow = next.partyVote?.ballots?.length || 0;
      if (ballotsNow > ballotsBefore) cue("vote_cast", next);
    }
  }

  function handleActivity(previous, next) {
    if (previous?.phase === next?.phase && previous?.round === next?.round && previous?.heat === next?.heat) return;
    if (next.phase === "countdown") { cue("countdown", next); speak("Get ready.", next); }
    else if (next.phase === "racing") { cue("go", next); speak("Go!", next); }
    else if (next.phase === "choosing") {
      cue("choice_open", next);
      const prompt = next.prompt;
      speak(prompt ? `${prompt.question}. Left: ${prompt.left}. Right: ${prompt.right}.` : "Choose a side.", next);
    } else if (next.phase === "reveal") { cue("reveal", next); speak(next.resultHeadline || "Choices revealed.", next); }
    else if (next.phase === "intermission") { cue("results", next); speak("Round complete.", next); }
    else if (next.phase === "podium") { cue("victory", next); speak("Final results.", next); }
    else if (next.phase === "paused") { cue("pause", next); speak("Game paused.", next); }
  }

  function handleSnapshot(previous, next) {
    if (!next || !previous) return;
    if (next.sessionMode === "rotation" && next.partyPhase !== "activity" && !(next.partyPhase === "paused" && next.resumePartyPhase === "activity")) handleRotation(previous, next);
    else handleActivity(previous, next);
  }

  function welcome({ reconnected = false, playerName = "" } = {}, snapshot = null) {
    cue(reconnected ? "ready" : "joined", snapshot, { force: true });
    if (sharedScreen && reconnected) speak("Party restored.", snapshot);
    else if (!sharedScreen && playerName) remember("welcome", playerName);
  }

  function toggle() {
    if (enabled && !activated) return activate({ confirm: true });
    enabled = !enabled;
    try { localStorage.setItem(audioStorageKey, String(enabled)); } catch { /* Storage is optional. */ }
    if (!enabled) {
      try { window.speechSynthesis?.cancel(); } catch { /* Optional API. */ }
      syncButton();
      return false;
    }
    return activate({ confirm: true });
  }

  function bind(nextButton) { button = nextButton; syncButton(); }
  function debug() { return { enabled, activated, available: Boolean(window.AudioContext || window.webkitAudioContext), lastCue: history.at(-1)?.type || "", history: history.slice() }; }

  return { activate, bind, cue, debug, handleSnapshot, speak, toggle, welcome };
}
