export function motionAxis(event, angle = 0) {
  const value = angle === 90 ? event.beta : angle === 270 || angle === -90 ? event.beta : event.gamma;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return angle === 90 ? -value : value;
}
export function tiltMovement(axis, neutral) {
  const delta = axis - neutral;
  return Math.abs(delta) < 3 ? 0 : Math.max(-1, Math.min(1, delta / 24));
}

export function combatFeedback(previous, current) {
  if (!previous || !current) return null;
  const before = previous.fighter;
  const after = current.fighter;
  if (!before || !after) return null;
  if ((current.points || 0) > (previous.points || 0)) {
    return { kind: "knockout", message: "Knockout! +1 point.", haptic: [35, 40, 80] };
  }
  if ((after.hits || 0) > (before.hits || 0)) {
    return { kind: "hit", message: "Hit landed — keep the pressure on!", haptic: 25 };
  }
  if ((after.health ?? 100) < (before.health ?? 100)) {
    return after.health <= 0
      ? { kind: "damage", message: "Knocked out — back in a moment!", haptic: [80, 45, 80] }
      : { kind: "damage", message: `Ouch! Health down to ${after.health}.`, haptic: 65 };
  }
  if (current.headline !== previous.headline && current.headline === `${current.name} blocked the punch!`) {
    return { kind: "block", message: "Blocked it! Counterattack now.", haptic: [20, 25, 20] };
  }
  return null;
}

export function createStickController(root, send, vibrate = pattern => navigator.vibrate?.(pattern)) {
  root.innerHTML = `
    <div class="stick-heading"><span>STICK &amp; TILT</span><b id="stickRound">READY?</b></div>
    <h2 id="stickIdentity">Your fighter</h2>
    <p id="stickMessage" role="status">Waiting for the host</p>
    <div class="stick-stats"><span>HEALTH <b id="stickHealth">100</b></span><span>KNOCKOUTS <b id="stickScore">0</b></span></div>
    <button id="stickTilt" class="stick-tilt" type="button">Enable motion controls</button>
    <p id="stickTiltHelp">Hold your phone upright. Tilt gently left or right to move. No swinging needed.</p>
    <div class="stick-meter" aria-hidden="true"><i id="stickMarker"></i></div>
    <div class="stick-movement"><button id="stickLeft" type="button" aria-label="Move left">← LEFT</button><button id="stickRight" type="button" aria-label="Move right">RIGHT →</button></div>
    <button id="stickPunch" class="stick-punch" type="button">PUNCH <small>Get close · face your rival</small></button>
    <div class="stick-movement"><button id="stickJump" type="button">JUMP <small>Dodge or climb</small></button><button id="stickGuard" type="button">GUARD <small>Block for a moment</small></button></div>
    <p class="stick-tip">Jump through boxes to take the high ground.<br>4 hits = knockout = 1 point. Ties share the win.</p>`;
  const el = id => root.querySelector(`#${id}`);
  let active=false, enabled=false, samples=null, neutral=0, tilt=0, touch=0, lastSensor=0, lastSent=0, clock=0, timer=0;
  let previousSelf=null, feedbackMessage="", feedbackKind="", feedbackUntil=0;
  const help = message => {el("stickTiltHelp").textContent=message;};
  const reset = () => {touch=0;tilt=0;send({type:"move",value:0});};
  const calibrate = () => {
    samples=[];tilt=0;help("Hold still for a moment while we find center…");el("stickTilt").textContent="Calibrating…";
    clearTimeout(timer);timer=setTimeout(()=>{if(samples){samples=null;enabled=false;help("No motion readings arrived. Use the arrow buttons, or try motion again.");el("stickTilt").textContent="Try motion again";}},4000);
  };
  const orientation = event => {
    if(!enabled)return;
    const axis=motionAxis(event,Number(screen.orientation?.angle??window.orientation??0));
    if(axis===null)return;
    lastSensor=performance.now();
    if(samples){samples.push(axis);if(samples.length>=10){neutral=samples.reduce((a,b)=>a+b,0)/samples.length;samples=null;clearTimeout(timer);help("Motion ready. Tilt to move; arrows work anytime.");el("stickTilt").textContent="Recenter motion";}return;}
    tilt=tiltMovement(axis,neutral);
  };
  window.addEventListener("deviceorientation",orientation);
  screen.orientation?.addEventListener?.("change",()=>{if(enabled)calibrate();});
  el("stickTilt").addEventListener("click",async()=>{
    try{
      if(typeof DeviceOrientationEvent==="undefined")throw new Error("Motion unavailable. Use the arrow buttons.");
      if(typeof DeviceOrientationEvent.requestPermission==="function" && await DeviceOrientationEvent.requestPermission()!=="granted")throw new Error("Motion permission denied. The arrow buttons are ready to use.");
      enabled=true;calibrate();
    }catch(error){enabled=false;tilt=0;help(error.message);el("stickTilt").textContent="Try motion again";}
  });
  for(const [id,value] of [["stickLeft",-1],["stickRight",1]]){
    const button=el(id);
    button.addEventListener("pointerdown",event=>{if(!active)return;event.preventDefault();button.setPointerCapture?.(event.pointerId);touch=value;send({type:"move",value});});
    for(const name of ["pointerup","pointercancel","lostpointercapture"])button.addEventListener(name,()=>{if(touch===value){touch=0;send({type:"move",value:0});}});
    button.addEventListener("keydown",event=>{if(active&&(event.key===" "||event.key==="Enter")){event.preventDefault();touch=value;}});
    button.addEventListener("keyup",()=>{if(touch===value){touch=0;send({type:"move",value:0});}});
  }
  for(const [id,type] of [["stickPunch","punch"],["stickJump","jump"],["stickGuard","guard"]])el(id).addEventListener("click",()=>{if(active)send({type});});
  window.addEventListener("blur",reset);
  document.addEventListener("visibilitychange",()=>{if(document.hidden)reset();});
  return {
    render(snapshot,selfId){
      const me=snapshot?.players?.find(p=>p.id===selfId),f=me?.fighter,phase=snapshot?.phase||"lobby";
      clock=snapshot?.fightClock||0;
      const currentSelf=me?{name:me.name,points:me.points,fighter:f?{health:f.health,hits:f.hits}:null,headline:snapshot?.headline||""}:null;
      const feedback=phase==="fighting"?combatFeedback(previousSelf,currentSelf):null;
      if(feedback){feedbackMessage=feedback.message;feedbackKind=feedback.kind;feedbackUntil=performance.now()+1400;vibrate(feedback.haptic);}
      previousSelf=currentSelf;
      const wasActive=active;active=!root.hidden&&phase==="fighting"&&me?.active&&!me?.queued&&f?.respawnAt===0;
      if(wasActive&&!active)reset();
      el("stickIdentity").textContent=me?.name||"Your fighter";el("stickIdentity").style.borderColor=me?.color||"#ffcf4a";
      el("stickRound").textContent=snapshot?.round?`ROUND ${snapshot.round}/3`:"READY?";
      el("stickHealth").textContent=String(f?.health??100);el("stickScore").textContent=String(me?.points||0);
      const defaultMessage=me?.queued?"You join next round":phase==="fighting"?(f?.respawnAt>clock?"Knocked out — back in a moment!":"Eyes on the big screen. Tilt and punch!"):phase==="paused"?"Paused — take a breather":phase==="podium"?(me?.rank===1?"Top score! Ready for a rematch?":`${me?.points||0} knockouts — rematch?`):phase==="countdown"?"Get ready. Find your color on screen.":phase==="intermission"?"Fresh health next round. Keep your points!":"Waiting for the host";
      const showingFeedback=phase==="fighting"&&performance.now()<feedbackUntil;
      el("stickMessage").textContent=showingFeedback?feedbackMessage:defaultMessage;
      el("stickMessage").dataset.feedback=showingFeedback?feedbackKind:"";
      for(const id of ["stickLeft","stickRight","stickPunch","stickJump","stickGuard"])el(id).disabled=!active;
      el("stickPunch").disabled=!active||clock<(f?.punchReady||0)||clock<(f?.guardUntil||0);
      el("stickGuard").disabled=!active||clock<(f?.guardReady||0);
      if(active&&!document.hidden&&performance.now()-lastSent>=80){lastSent=performance.now();const value=touch||(enabled&&!samples&&performance.now()-lastSensor<600?tilt:0);send({type:"move",value});el("stickMarker").style.left=`${50+value*43}%`;}
    }
  };
}
