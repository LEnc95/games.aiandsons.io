import { drawArena } from "./renderer.js";
import { connect } from "/src/net/multiplayerClient.js";
import { rememberRecent } from "/src/core/state.js";
import { reportGameOutcome } from "/src/core/outcomes.js";
import { finalizeRecording, startRecording } from "/src/social/record.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const byId = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const displayCode = String(params.get("display") || "").toUpperCase().replace(/[^A-HJ-NP-Z]/g, "").slice(0, 4);
const embedded=params.get("embedded")==="1";
const state = { connection:null,roomId:"",hostToken:"",snapshot:null,displayMode:embedded||displayCode.length===4,testOffsetMs:0,reported:false,sound:false,audio:null,lastPhase:"",lastRound:0 };
let embeddedRecording=false;
if (!state.displayMode) rememberRecent("sticktilt");

const tokenKey = (room) => `aiandsons-party-host:${room}`;
const now = () => Date.now()+state.testOffsetMs;
const remaining = () => Math.max(0,(Number(state.snapshot?.phaseEndsAt||0)-now())/1000);

function status(text,kind=""){byId("serverStatus").textContent=text;byId("serverStatus").className=kind;}
async function connectScreen(){
  if(embedded){
    document.body.classList.add("display-mode","embedded-mode");byId("screenRole").textContent="Party activity";
    const style=document.createElement("style");
    style.textContent=".embedded-mode{padding:0;overflow:hidden}.embedded-mode .back,.embedded-mode .host-header,.embedded-mode .host-panel{display:none}.embedded-mode .host-shell,.embedded-mode .game-layout,.embedded-mode .stage-wrap{width:100vw;height:100vh;max-width:none;margin:0;display:block;border:0;border-radius:0;box-shadow:none;aspect-ratio:auto}.embedded-mode canvas{width:100%;height:100%;object-fit:contain}";
    document.head.appendChild(style);
    window.addEventListener("message",(event)=>{if(event.origin!==location.origin||event.data?.type!=="party_snapshot")return;const previous=state.snapshot;state.roomId=event.data.roomId||state.roomId;state.snapshot=event.data.snapshot||null;applyPartyPresentation(state.snapshot);syncEmbeddedRecording(previous,state.snapshot);syncUi();soundFor(previous,state.snapshot);});
    return;
  }
  let roomId=state.displayMode?displayCode:String(params.get("room")||"").toUpperCase();
  let token=!state.displayMode&&roomId?sessionStorage.getItem(tokenKey(roomId))||"":"";
  if(roomId&&!state.displayMode&&!token){roomId="";params.delete("room");history.replaceState({},"",location.pathname);}
  bind(await connect({gameId:"party",gameKey:"sticktilt",role:state.displayMode?"display":"host",roomId,token}));
}
function syncEmbeddedRecording(previous,next){if(!embedded||!next)return;const active=next.partyPhase==="activity",wasActive=previous?.partyPhase==="activity";if(active&&!wasActive){embeddedRecording=startRecording()||embeddedRecording;}else if(!active&&wasActive&&embeddedRecording){embeddedRecording=false;void finalizeRecording();}}
function bind(connection){
  state.connection=connection;
  connection.onStatus(({status:s})=>{if(connection!==state.connection)return;if(s==="open")status("Connected","online");else if(s==="reconnecting")status("Reconnecting…");else if(s==="error"||s==="timeout")status("Connection problem","problem");});
  connection.onStateUpdate((update)=>{if(connection!==state.connection)return;const previous=state.snapshot;state.snapshot=update.payload?.state||update.payload||null;applyPartyPresentation(state.snapshot);syncUi();soundFor(previous,state.snapshot);});
  connection.onEvent((event)=>handleEvent(connection,event));
}
function handleEvent(connection,event){
  if(connection!==state.connection)return;const payload=event.payload||{};
  if(event.type==="welcome"){
    state.roomId=payload.roomId||"";byId("roomCode").textContent=state.roomId||"----";
    if(payload.role==="display"){state.displayMode=true;document.body.classList.add("display-mode");byId("screenRole").textContent="Synchronized screen";status("Following host live","online");}
    else{state.hostToken=payload.token||"";if(state.roomId&&state.hostToken)sessionStorage.setItem(tokenKey(state.roomId),state.hostToken);const url=new URL(location.href);url.searchParams.set("room",state.roomId);history.replaceState({},"",url);status("Room ready","online");}
    renderQr();syncUi();return;
  }
  if(event.type==="error"){byId("hostError").textContent=payload.message||"The server rejected that action.";if(["invalid_host_token","room_not_found"].includes(payload.code)){if(state.roomId)sessionStorage.removeItem(tokenKey(state.roomId));status("Room expired","problem");}}
}
function renderQr(){const target=byId("qrCode");target.textContent="";if(!state.roomId||typeof window.qrcode!=="function")return;const qr=window.qrcode(0,"M");qr.addData(joinUrl());qr.make();const image=document.createElement("img");image.src=qr.createDataURL(5,1);image.alt="Stick & Tilt room QR code";image.width=108;image.height=108;target.append(image);}
function displayUrl(){const url=new URL("/sticktilt/",location.origin);url.searchParams.set("display",state.roomId);const endpoint=params.get("ws")||params.get("endpoint");if(endpoint)url.searchParams.set("ws",endpoint);return url.toString();}
function sendHost(action){byId("hostError").textContent="";state.connection?.sendInput({type:"host",action});}
function syncUi(){
  const snapshot=state.snapshot;const players=snapshot?.players||[];const connected=players.filter((p)=>p.connected).length;const phase=snapshot?.phase||"lobby";
  byId("playerCount").textContent=`${players.length} / 8`;byId("screenCount").textContent=`${1+(snapshot?.displayCount||0)} live screen${snapshot?.displayCount?"s":""}`;byId("shareScreenButton").disabled=!state.roomId;
  const roster=byId("roster");roster.textContent="";players.forEach((p)=>{const li=document.createElement("li");li.style.setProperty("--player",p.color);li.innerHTML=`<i></i><b></b><span></span>`;li.querySelector("i").textContent=p.avatar||"🦊";li.querySelector("b").textContent=p.name+(p.connected?"":" · reconnecting");li.querySelector("span").textContent=(p.points||0).toLocaleString();roster.append(li);});
  const active=["countdown","fighting","intermission","paused"].includes(phase);const canStart=!state.displayMode&&["lobby","podium","ended"].includes(phase);
  byId("startButton").hidden=!canStart;byId("startButton").disabled=connected<2;byId("startButton").textContent=phase==="lobby"?(connected<2?"Start with 2 players":`Start with ${connected} players`):(connected<2?"Rematch needs 2 players":`Rematch with ${connected}`);
  byId("pauseButton").hidden=!active||state.displayMode;byId("pauseButton").textContent=phase==="paused"?"Resume":"Pause";byId("endButton").hidden=!active||state.displayMode;
  if(phase==="podium"&&!state.reported&&!state.displayMode){state.reported=true;reportGameOutcome({slug:"sticktilt",result:"completed",durationMs:snapshot.durationMs||0,metrics:{players:players.length,rounds:snapshot.round||3,knockouts:Math.min(300,players.reduce((n,p)=>n+(p.points||0),0))}});}
  if(phase==="countdown"&&state.lastPhase!=="countdown")state.reported=false;state.lastPhase=phase;
}

function joinUrl(){const url=new URL("/party/",location.origin);url.searchParams.set("code",state.roomId);const ws=params.get("ws");if(ws)url.searchParams.set("ws",ws);return url.href;}

function draw(){drawArena(ctx,state.snapshot,remaining(),Boolean(state.snapshot?.partySettings?.reducedMotion)||matchMedia("(prefers-reduced-motion: reduce)").matches);}
function ensureAudio(){if(!state.audio){const AudioCtor=window.AudioContext||window.webkitAudioContext;if(AudioCtor)state.audio=new AudioCtor();}state.audio?.resume?.();}
function tone(freq,duration=.12){if(!state.sound||state.snapshot?.partySettings?.effects===false)return;ensureAudio();if(!state.audio)return;const osc=state.audio.createOscillator(),gain=state.audio.createGain();osc.frequency.value=freq;gain.gain.setValueAtTime(.08,state.audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,state.audio.currentTime+duration);osc.connect(gain).connect(state.audio.destination);osc.start();osc.stop(state.audio.currentTime+duration);}
function applyPartyPresentation(snapshot){document.body.classList.toggle("party-reduced-motion",Boolean(snapshot?.partySettings?.reducedMotion));document.body.classList.toggle("party-high-contrast",Boolean(snapshot?.partySettings?.highContrast));}
function soundFor(previous,next){if(!next||previous?.phase===next.phase&&previous?.round===next.round)return;if(next.phase==="fighting")tone(620,.18);if(next.phase==="intermission")tone(880,.28);if(next.phase==="podium")tone(1040,.5);}
function toggleSound(){state.sound=!state.sound;if(state.sound){ensureAudio();tone(720,.1);}byId("soundButton").textContent=`Sound: ${state.sound?"On":"Off"}`;}
function toggleFullscreen(){if(!document.fullscreenElement)byId("stageWrap").requestFullscreen?.().catch(()=>{});else document.exitFullscreen?.().catch(()=>{});}
byId("startButton").addEventListener("click",()=>sendHost("start"));byId("pauseButton").addEventListener("click",()=>sendHost(state.snapshot?.phase==="paused"?"resume":"pause"));byId("endButton").addEventListener("click",()=>sendHost("end"));byId("fullscreenButton").addEventListener("click",toggleFullscreen);byId("soundButton").addEventListener("click",toggleSound);byId("shareScreenButton").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(displayUrl());byId("shareScreenButton").textContent="Screen link copied!";setTimeout(()=>byId("shareScreenButton").textContent="Copy link for another screen",1600);}catch{byId("hostError").textContent=displayUrl();}});window.addEventListener("keydown",(event)=>{if(event.key.toLowerCase()==="f")toggleFullscreen();});window.addEventListener("beforeunload",()=>state.connection?.disconnect());

function loop(){draw();requestAnimationFrame(loop);}
window.advanceTime=(ms)=>{state.testOffsetMs+=Math.max(0,Math.min(60000,Number(ms)||0));draw();};
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.data?.type==="party_advance_time")window.advanceTime(event.data.ms);});
window.render_game_to_text=()=>JSON.stringify({screen_role:state.displayMode?"display":"host",coordinate_system:"1200x675, x right; fighter y is height above floor",room_id:state.roomId,phase:state.snapshot?.phase||"connecting",seconds_remaining:Number(remaining().toFixed(1)),...state.snapshot});
connectScreen().catch(()=>status("Unable to connect","problem"));loop();
