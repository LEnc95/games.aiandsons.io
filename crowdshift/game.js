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
if (!state.displayMode) rememberRecent("crowdshift");

const rules = {
  majority:{title:"FOLLOW THE CROWD",copy:"The bigger side scores 1,000",color:"#ffe36e"},
  minority:{title:"BACK THE UNDERDOG",copy:"The smaller side scores 1,200",color:"#58edcb"},
  split:{title:"PERFECT SPLIT",copy:"Get the room within one vote",color:"#c99cff"},
  unanimous:{title:"ALL TOGETHER",copy:"Everyone must choose the same side",color:"#ff9dbc"},
  duel_sync:{title:"DUEL SHIFT · SYNC",copy:"Match choices for 400 · mind reads score individually",color:"#ffe36e"},
  duel_clash:{title:"DUEL SHIFT · CLASH",copy:"Opposite choices for 400 · mind reads score individually",color:"#ff9dbc"},
};
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
    window.addEventListener("message",(event)=>{if(event.origin!==location.origin||event.data?.type!=="party_snapshot")return;const previous=state.snapshot;state.roomId=event.data.roomId||state.roomId;state.snapshot=event.data.snapshot||null;syncEmbeddedRecording(previous,state.snapshot);syncUi();soundFor(previous,state.snapshot);});
    return;
  }
  let roomId=state.displayMode?displayCode:String(params.get("room")||"").toUpperCase();
  let token=!state.displayMode&&roomId?sessionStorage.getItem(tokenKey(roomId))||"":"";
  if(roomId&&!state.displayMode&&!token){roomId="";params.delete("room");history.replaceState({},"",location.pathname);}
  bind(await connect({gameId:"party",gameKey:"crowdshift",role:state.displayMode?"display":"host",roomId,token}));
}
function syncEmbeddedRecording(previous,next){if(!embedded||!next)return;const active=next.partyPhase==="activity",wasActive=previous?.partyPhase==="activity";if(active&&!wasActive){embeddedRecording=startRecording()||embeddedRecording;}else if(!active&&wasActive&&embeddedRecording){embeddedRecording=false;void finalizeRecording();}}
function bind(connection){
  state.connection=connection;
  connection.onStatus(({status:s})=>{if(connection!==state.connection)return;if(s==="open")status("Connected","online");else if(s==="reconnecting")status("Reconnecting…");else if(s==="error"||s==="timeout")status("Connection problem","problem");});
  connection.onStateUpdate((update)=>{if(connection!==state.connection)return;const previous=state.snapshot;state.snapshot=update.payload?.state||update.payload||null;syncUi();soundFor(previous,state.snapshot);});
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
function renderQr(){const target=byId("qrCode");target.textContent="";if(!state.roomId||typeof window.qrcode!=="function")return;const qr=window.qrcode(0,"M");qr.addData(`https://games.aiandsons.io/party?code=${encodeURIComponent(state.roomId)}`);qr.make();target.innerHTML=qr.createSvgTag(5,1,"Scan to join Crowd Shift","Crowd Shift room QR code");}
function displayUrl(){const url=new URL("/crowdshift/",location.origin);url.searchParams.set("display",state.roomId);const endpoint=params.get("ws")||params.get("endpoint");if(endpoint)url.searchParams.set("ws",endpoint);return url.toString();}
function sendHost(action){byId("hostError").textContent="";state.connection?.sendInput({type:"host",action});}
function syncUi(){
  const snapshot=state.snapshot;const players=snapshot?.players||[];const connected=players.filter((p)=>p.connected).length;const phase=snapshot?.phase||"lobby";
  byId("playerCount").textContent=`${players.length} / 8`;byId("screenCount").textContent=`${1+(snapshot?.displayCount||0)} live screen${snapshot?.displayCount?"s":""}`;byId("shareScreenButton").disabled=!state.roomId;
  const roster=byId("roster");roster.textContent="";players.forEach((p)=>{const li=document.createElement("li");li.style.setProperty("--player",p.color);li.innerHTML=`<i></i><b></b><span></span>`;li.querySelector("b").textContent=p.name+(p.connected?"":" · reconnecting");li.querySelector("span").textContent=(p.points||0).toLocaleString();roster.append(li);});
  const active=["countdown","choosing","reveal","intermission","paused"].includes(phase);const canStart=!state.displayMode&&["lobby","podium","ended"].includes(phase);
  byId("startButton").hidden=!canStart;byId("startButton").disabled=connected<2;byId("startButton").textContent=phase==="lobby"?(connected<2?"Start with 2 players":`Start with ${connected} players`):(connected<2?"Rematch needs 2 players":`Rematch with ${connected}`);
  byId("pauseButton").hidden=!active||state.displayMode;byId("pauseButton").textContent=phase==="paused"?"Resume":"Pause";byId("endButton").hidden=!active||state.displayMode;
  if(phase==="podium"&&!state.reported&&!state.displayMode){state.reported=true;reportGameOutcome({slug:"crowdshift",result:"completed",durationMs:7*24000,metrics:{players:players.length,rounds:snapshot.round||7,unanimous:snapshot.unanimousRounds||0}});}
  if(phase==="countdown"&&state.lastPhase!=="countdown")state.reported=false;state.lastPhase=phase;
}
function rounded(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=3;ctx.stroke();}}
function fit(text,maxWidth,start=46,min=18){let size=start;do{ctx.font=`900 ${size}px Inter,system-ui`;if(ctx.measureText(text).width<=maxWidth)return size;size-=2;}while(size>min);return min;}
function centerText(text,x,y,maxWidth,start=46,color="#fff"){ctx.fillStyle=color;ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=`900 ${fit(text,maxWidth,start)}px Inter,system-ui`;ctx.fillText(text,x,y,maxWidth);}
function background(){const gradient=ctx.createLinearGradient(0,0,1200,675);gradient.addColorStop(0,"#29143c");gradient.addColorStop(.5,"#111536");gradient.addColorStop(1,"#102b4a");ctx.fillStyle=gradient;ctx.fillRect(0,0,1200,675);for(let i=0;i<30;i++){ctx.globalAlpha=.12+((i*17)%10)/100;ctx.fillStyle=i%2?"#f15f91":"#579feb";ctx.beginPath();ctx.arc((i*137+now()/55)%1300-50,(i*83)%675,2+(i%4),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
function drawLobby(snapshot){centerText("CROWD SHIFT",600,115,1050,88,"#ffe36e");centerText("Secret picks. Sudden reveals. The scoring rule changes every round.",600,190,1000,30,"#d8cbea");rounded(135,245,930,290,34,"rgba(14,12,38,.72)","rgba(255,255,255,.16)");const players=snapshot?.players||[],connected=players.filter((p)=>p.connected).length,duelReady=connected===2;centerText(connected<2?"Waiting for at least 2 players":duelReady?"DUEL SHIFT READY!":"The room is ready!",600,305,800,42,duelReady?"#ffe36e":"#fff");if(duelReady)centerText("Pick your side, read your rival, risk one Hot Take.",600,350,800,21,"#d8cbea");players.forEach((p,i)=>{const x=duelReady?420+i*360:230+(i%4)*245,y=(duelReady?410:385)+Math.floor(i/4)*88;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(x,y,25,0,Math.PI*2);ctx.fill();centerText(p.name,x,y+43,190,20,"#fff");});centerText("Join at games.aiandsons.io/party",600,595,900,28,"#b9acd0");}
function drawHeader(snapshot){const rule=rules[snapshot.rule]||rules.majority;ctx.textAlign="left";ctx.fillStyle=rule.color;ctx.font="950 22px Inter,system-ui";ctx.fillText(rule.title,55,48);ctx.fillStyle="#cfc4df";ctx.font="700 18px Inter,system-ui";ctx.fillText(rule.copy,55,76);ctx.textAlign="right";ctx.fillStyle="#fff";ctx.font="900 20px Inter,system-ui";ctx.fillText(`ROUND ${snapshot.round||1} / ${snapshot.totalRounds||7}`,1145,52);}
function drawChoiceScene(snapshot){drawHeader(snapshot);const prompt=snapshot.prompt||{};centerText(prompt.question||"Get ready…",600,145,1050,48,"#fff");const reveal=["reveal","intermission","podium"].includes(snapshot.phase);const winner=snapshot.winnerSide;drawSide(55,220,520,310,"LEFT",prompt.left||"Option A","#e65a89",reveal?snapshot.leftCount:null,winner==="left"||winner==="both");drawSide(625,220,520,310,"RIGHT",prompt.right||"Option B","#579feb",reveal?snapshot.rightCount:null,winner==="right"||winner==="both");if(reveal){drawRevealPlayers(snapshot);}else{const submitted=snapshot.duel?(snapshot.readyCount||0):(snapshot.submittedCount||0),total=(snapshot.players||[]).filter((p)=>p.connected&&!p.queued).length;centerText(`${submitted} / ${total} ${snapshot.duel?"duelists ready":"choices locked"}`,600,580,650,28,"#d6c9e9");const seconds=Math.max(0,Math.ceil(remaining()));centerText(`${seconds}`,600,625,150,38,"#ffe36e");}}
function drawSide(x,y,w,h,label,text,color,count,winner){rounded(x,y,w,h,30,color,winner?"#fff7ad":"rgba(255,255,255,.18)");ctx.textAlign="center";ctx.fillStyle="rgba(255,255,255,.72)";ctx.font="950 15px Inter,system-ui";ctx.fillText(label,x+w/2,y+42);centerText(text,x+w/2,y+132,w-60,42,"#fff");if(count!==null){centerText(String(count),x+w/2,y+235,180,76,"#fff");ctx.font="800 15px Inter,system-ui";ctx.fillStyle="rgba(255,255,255,.82)";ctx.fillText(`${count===1?"PLAYER":"PLAYERS"}`,x+w/2,y+285);}}
function drawRevealPlayers(snapshot){const left=(snapshot.players||[]).filter((p)=>p.choice==="left"),right=(snapshot.players||[]).filter((p)=>p.choice==="right");[[left,315],[right,885]].forEach(([list,cx])=>list.forEach((p,i)=>{const spacing=snapshot.duel&&list.length===2?160:76,x=cx+(i-(list.length-1)/2)*spacing,y=snapshot.duel?540:555;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(x,y,21,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=p.roundPoints?4:1;ctx.stroke();if(snapshot.duel){centerText(p.name,x,y+31,145,13,"#fff");centerText(`Read ${String(p.prediction||"—").toUpperCase()} ${p.readCorrect?"✓":"×"}`,x,y+49,145,12,p.readCorrect?"#58edcb":"#ffb0c2");centerText(`+${(p.roundPoints||0).toLocaleString()}${p.hotTake?" 🔥":""}`,x,y+68,145,13,"#ffe36e");}else{centerText(p.name,x,y+31,72,12,"#fff");if(p.roundPoints)centerText(`+${p.roundPoints}`,x,y+50,74,12,"#ffe36e");}}));centerText(snapshot.resultHeadline||"The crowd has spoken!",600,650,1050,26,"#ffe36e");}
function drawScoreboard(snapshot,title="SCOREBOARD"){centerText(title,600,90,1000,66,"#ffe36e");const players=snapshot.players||[];players.slice(0,8).forEach((p,i)=>{const col=i%2,row=Math.floor(i/2),x=145+col*500,y=160+row*95;rounded(x,y,410,70,18,"rgba(255,255,255,.07)",i===0?"#ffe36e":"rgba(255,255,255,.1)");ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(x+38,y+35,18,0,Math.PI*2);ctx.fill();ctx.textAlign="left";ctx.fillStyle="#fff";ctx.font="850 23px Inter,system-ui";ctx.fillText(`${i+1}. ${p.name}`,x+72,y+31);ctx.fillStyle="#b9acd0";ctx.font="700 14px Inter,system-ui";ctx.fillText(p.roundPoints?`+${p.roundPoints.toLocaleString()} this round`:"No points this round",x+72,y+53);ctx.textAlign="right";ctx.fillStyle="#ffe36e";ctx.font="950 24px Inter,system-ui";ctx.fillText((p.points||0).toLocaleString(),x+385,y+43);});}
function drawPodium(snapshot){centerText(snapshot.duel?"DUEL SHIFT CHAMPION":"FINAL CROWD",600,80,1000,62,"#ffe36e");const top=(snapshot.players||[]).filter((p)=>p.rank>0).slice(0,3);const spots=[{p:top[0],x:600,y:205,h:300},{p:top[1],x:330,y:275,h:230},{p:top[2],x:870,y:320,h:185}];spots.forEach((spot,index)=>{const p=spot.p;if(!p)return;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(spot.x,spot.y-35,38,0,Math.PI*2);ctx.fill();rounded(spot.x-105,spot.y,210,spot.h,22,index===0?"#9c7533":"rgba(255,255,255,.1)",index===0?"#ffe36e":"rgba(255,255,255,.2)");centerText(p.name,spot.x,spot.y+48,180,25,"#fff");centerText(String(p.rank),spot.x,spot.y+105,100,64,"#ffe36e");centerText((p.points||0).toLocaleString(),spot.x,spot.y+spot.h-30,160,22,"#fff");});centerText(snapshot.duel?"Seven rounds of reads, risks, and rivalry":`${snapshot.unanimousRounds||0} unanimous round${snapshot.unanimousRounds===1?"":"s"}`,600,640,800,24,"#b9acd0");}
function draw(){background();const snapshot=state.snapshot;if(!snapshot||snapshot.phase==="lobby"){drawLobby(snapshot);return;}if(snapshot.phase==="countdown"){centerText("FIRST SHIFT IN",600,245,900,48,"#d8cbea");centerText(String(Math.max(1,Math.ceil(remaining()))),600,385,300,150,"#ffe36e");return;}if(snapshot.phase==="choosing"||snapshot.phase==="reveal")drawChoiceScene(snapshot);else if(snapshot.phase==="intermission")drawScoreboard(snapshot,`ROUND ${snapshot.round} RESULTS`);else if(snapshot.phase==="podium")drawPodium(snapshot);else if(snapshot.phase==="paused"){drawChoiceScene(snapshot);rounded(250,245,700,180,28,"rgba(8,7,24,.92)","#ffe36e");centerText("GAME PAUSED",600,310,600,58,"#ffe36e");centerText(snapshot.pauseReason==="host_disconnected"?"Waiting for the host to reconnect":"The host will resume soon",600,385,600,24,"#fff");}else{centerText("GAME ENDED",600,320,900,80,"#ffe36e");}}
function ensureAudio(){if(!state.audio){const AudioCtor=window.AudioContext||window.webkitAudioContext;if(AudioCtor)state.audio=new AudioCtor();}state.audio?.resume?.();}
function tone(freq,duration=.12){if(!state.sound)return;ensureAudio();if(!state.audio)return;const osc=state.audio.createOscillator(),gain=state.audio.createGain();osc.frequency.value=freq;gain.gain.setValueAtTime(.08,state.audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,state.audio.currentTime+duration);osc.connect(gain).connect(state.audio.destination);osc.start();osc.stop(state.audio.currentTime+duration);}
function soundFor(previous,next){if(!next||previous?.phase===next.phase&&previous?.round===next.round)return;if(next.phase==="choosing")tone(620,.18);if(next.phase==="reveal")tone(880,.28);if(next.phase==="podium")tone(1040,.5);}
function toggleSound(){state.sound=!state.sound;if(state.sound){ensureAudio();tone(720,.1);}byId("soundButton").textContent=`Sound: ${state.sound?"On":"Off"}`;}
function toggleFullscreen(){if(!document.fullscreenElement)byId("stageWrap").requestFullscreen?.().catch(()=>{});else document.exitFullscreen?.().catch(()=>{});}
byId("startButton").addEventListener("click",()=>sendHost("start"));byId("pauseButton").addEventListener("click",()=>sendHost(state.snapshot?.phase==="paused"?"resume":"pause"));byId("endButton").addEventListener("click",()=>sendHost("end"));byId("fullscreenButton").addEventListener("click",toggleFullscreen);byId("soundButton").addEventListener("click",toggleSound);byId("shareScreenButton").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(displayUrl());byId("shareScreenButton").textContent="Screen link copied!";setTimeout(()=>byId("shareScreenButton").textContent="Copy link for another screen",1600);}catch{byId("hostError").textContent=displayUrl();}});window.addEventListener("keydown",(event)=>{if(event.key.toLowerCase()==="f")toggleFullscreen();});window.addEventListener("beforeunload",()=>state.connection?.disconnect());
function loop(){draw();requestAnimationFrame(loop);}window.advanceTime=(ms)=>{state.testOffsetMs+=Math.max(0,Math.min(60000,Number(ms)||0));draw();};window.addEventListener("message",(event)=>{if(event.origin===location.origin&&event.data?.type==="party_advance_time")window.advanceTime(event.data.ms);});window.render_game_to_text=()=>JSON.stringify({screen_role:state.displayMode?"display":"host",coordinate_system:"Canvas 1200x675; origin top-left; x right, y down",room_id:state.roomId,phase:state.snapshot?.phase||"connecting",seconds_remaining:Number(remaining().toFixed(1)),round:state.snapshot?.round||0,total_rounds:state.snapshot?.totalRounds||7,rule:state.snapshot?.rule||"",duel:Boolean(state.snapshot?.duel),ready_count:state.snapshot?.readyCount||0,duel_objective_met:Boolean(state.snapshot?.duelObjectiveMet),prompt:state.snapshot?.prompt||null,submitted_count:state.snapshot?.submittedCount||0,left_count:state.snapshot?.leftCount||0,right_count:state.snapshot?.rightCount||0,result:state.snapshot?.resultHeadline||"",players:state.snapshot?.players||[]});
connectScreen().catch(()=>status("Unable to connect","problem"));loop();
