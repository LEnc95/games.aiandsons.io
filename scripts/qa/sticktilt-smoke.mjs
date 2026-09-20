import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base=process.argv[2],ws=encodeURIComponent(process.argv[3]),out="output/web-game/sticktilt-e2e";
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),contexts=[],errors=[],checks=[];
const state=page=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
async function page(phone=false){const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1440,height:960},hasTouch:phone,isMobile:phone});contexts.push(context);await context.addInitScript(()=>{window.__motionPermission="denied";if(typeof DeviceOrientationEvent!=="undefined")Object.defineProperty(DeviceOrientationEvent,"requestPermission",{configurable:true,value:async()=>window.__motionPermission});});const p=await context.newPage();p.on("pageerror",e=>errors.push(String(e)));p.on("console",m=>{if(m.type()==="error")errors.push(m.text());});return p;}
async function join(room,name){const p=await page(true);await p.goto(`${base}/party/?code=${room}&ws=${ws}`);await p.fill("#playerName",name);await p.click("#joinForm button[type=submit]");await p.waitForSelector("#controllerView:not([hidden])");return p;}
const shot=(p,name)=>p.screenshot({path:`${out}/${name}.png`,fullPage:true});
const waitPhase=(p,phase)=>p.waitForFunction(phase=>JSON.parse(window.render_game_to_text()).phase===phase,phase,{timeout:45000});
async function bot(p){await p.evaluate(()=>{
  window.__stickBot=setInterval(()=>{
    const s=JSON.parse(window.render_game_to_text()),me=s.state?.players?.find(p=>p.id===s.player_id),f=me?.fighter;
    if(s.state?.phase!=="fighting"||!f)return;
    const enemy=s.state.players.filter(p=>p.id!==me.id&&p.fighter&&p.fighter.respawnAt===0).sort((a,b)=>Math.abs(a.fighter.x-f.x)-Math.abs(b.fighter.x-f.x))[0];
    if(!enemy)return;const dx=enemy.fighter.x-f.x;
    const direction=Math.abs(dx)>65||dx*f.facing<0?Math.sign(dx):0;
    for(const [id,dir] of [["stickLeft",-1],["stickRight",1]])document.getElementById(id).dispatchEvent(new KeyboardEvent(direction===dir?"keydown":"keyup",{key:"Enter",bubbles:true}));
    document.getElementById("stickPunch").click();
  },110);
});}
async function run(){
try{
 const host=await page();await host.goto(`${base}/sticktilt/?ws=${ws}`);await host.waitForFunction(()=>/^[A-HJ-NP-Z]{4}$/.test(document.getElementById("roomCode").textContent));const room=await host.locator("#roomCode").textContent();
 const a=await join(room,"Pencil"),b=await join(room,"Doodle");
 const display=await page();await display.goto(`${base}/sticktilt/?display=${room}&ws=${ws}`);await display.waitForFunction(()=>JSON.parse(window.render_game_to_text()).players?.length===2);assert.equal(await display.locator("#startButton").isVisible(),false);
 await shot(host,"lobby");await a.click("#stickTilt");await a.waitForFunction(()=>document.getElementById("stickTiltHelp").textContent.includes("denied"));
 await a.evaluate(()=>window.__motionPermission="granted");await a.click("#stickTilt");await a.evaluate(()=>{for(let i=0;i<12;i++)window.dispatchEvent(new DeviceOrientationEvent("deviceorientation",{gamma:0,beta:0}));});await a.waitForFunction(()=>document.getElementById("stickTiltHelp").textContent.includes("Motion ready"));
 await host.click("#startButton");await waitPhase(host,"fighting");const aid=(await state(a)).player_id;const x=(await state(host)).players.find(p=>p.id===aid).fighter.x;const delta=x>600?-24:24;
 await a.evaluate(delta=>{window.__sensor=setInterval(()=>window.dispatchEvent(new DeviceOrientationEvent("deviceorientation",{gamma:delta,beta:0})),40);},delta);
 await host.waitForFunction(({aid,x})=>Math.abs(JSON.parse(window.render_game_to_text()).players.find(p=>p.id===aid).fighter.x-x)>40,{aid,x});
 await a.evaluate(()=>{clearInterval(window.__sensor);window.dispatchEvent(new DeviceOrientationEvent("deviceorientation",{gamma:0,beta:0}));});checks.push("motion permission denial, calibration, sensor-driven movement");
 const climbButton=x>600?"stickLeft":"stickRight";await a.evaluate(id=>document.getElementById(id).dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})),climbButton);await a.click("#stickJump");await host.waitForFunction(id=>JSON.parse(window.render_game_to_text()).players.find(p=>p.id===id).fighter.y>10,aid);await host.waitForFunction(id=>{const s=JSON.parse(window.render_game_to_text()),fighter=s.players.find(p=>p.id===id).fighter;return s.platforms?.length===3&&fighter.groundY>0&&fighter.y===fighter.groundY;},aid,{timeout:5000});await a.evaluate(id=>document.getElementById(id).dispatchEvent(new KeyboardEvent("keyup",{key:"Enter",bubbles:true})),climbButton);checks.push("authoritative one-way platforms, landing, and platform jump state");
 await a.click("#stickGuard");await host.waitForFunction(id=>{const s=JSON.parse(window.render_game_to_text());return s.players.find(p=>p.id===id).fighter.guardUntil>s.fightClock;},aid);
 await shot(host,"fighting");await shot(a,"phone");await shot(display,"display");
 if(process.env.STICKTILT_NORMAL==="1"){
   assert.ok((await state(host)).seconds_remaining>24,"normal round should last 30 seconds");
   await a.setViewportSize({width:844,height:390});await shot(a,"phone-landscape-normal");
   await bot(a);await bot(b);await waitPhase(host,"intermission");const result=await state(host);
   assert.ok(result.durationMs>=29000&&result.durationMs<=31000);assert.ok(result.players.some(p=>p.points>0));
   await shot(host,"normal-round-result");await fs.writeFile(`${out}/normal-pacing.json`,JSON.stringify({success:true,result,errors},null,2));assert.deepEqual(errors,[]);console.log("Normal pacing passed: 30-second round with phone combat and scoring");return;
 }
 await host.click("#pauseButton");await waitPhase(display,"paused");const clock=(await state(host)).fightClock;await host.waitForTimeout(250);assert.equal((await state(host)).fightClock,clock);await host.click("#pauseButton");await waitPhase(host,"fighting");
 const hostUrl=host.url();await host.goto("about:blank");await waitPhase(display,"paused");await host.goto(hostUrl);await waitPhase(host,"fighting");
 await a.reload();await a.waitForSelector("#stickController:not([hidden])");assert.equal((await state(a)).player_id,aid);checks.push("jump, guard, pause, host recovery, phone identity recovery, synchronized display");
 await bot(a);await bot(b);await a.waitForFunction(()=>Boolean(document.getElementById("stickMessage")?.dataset.feedback),null,{timeout:10000});await shot(a,"phone-combat-feedback");checks.push("authoritative hit, damage, block, or knockout feedback reaches the phone");await waitPhase(host,"podium");const final=await state(host);assert.ok(final.players.some(p=>p.points>0),"real phone combat must score a knockout");await shot(host,"results");await shot(a,"phone-results");checks.push("three-round match, combat knockouts, results");
 await host.click("#startButton");await waitPhase(host,"fighting");assert.ok((await state(host)).players.every(p=>p.points===0));await host.click("#endButton");await waitPhase(host,"ended");
 // A new lobby verifies eight phones and rejection of a ninth player.
 await host.goto(`${base}/sticktilt/?ws=${ws}`);await host.waitForFunction(()=>/^[A-HJ-NP-Z]{4}$/.test(document.getElementById("roomCode").textContent));const room8=await host.locator("#roomCode").textContent();
 const phones=[];for(let i=0;i<8;i++)phones.push(await join(room8,`Fighter ${i+1}`));
 const extra=await page(true);await extra.goto(`${base}/party/?code=${room8}&ws=${ws}`);await extra.fill("#playerName","Ninth");await extra.click("#joinForm button[type=submit]");await extra.waitForFunction(()=>document.getElementById("joinError").textContent.includes("limit"));
 await host.click("#startButton");await waitPhase(host,"fighting");await shot(host,"eight-fighters");await host.click("#pauseButton");await phones[0].setViewportSize({width:844,height:390});await shot(phones[0],"phone-landscape");assert.ok(await phones[0].evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await host.click("#pauseButton");await waitPhase(host,"podium");checks.push("eight-player match, ninth-player rejection, landscape, rematch");
 // Rotating Party entry, with host-chosen fighting then a different activity.
 const party=await page();await party.goto(`${base}/party/?host=1&ws=${ws}`);await party.waitForFunction(()=>/^[A-HJ-NP-Z]{4}$/.test(document.getElementById("sessionRoom").textContent));const pr=await party.locator("#sessionRoom").textContent();const pa=await join(pr,"Ink"),pb=await join(pr,"Paper");
 await party.selectOption("#partySelectionSelect","host");await party.locator("#partyActivitySettings summary").click();await party.locator("#partyActivityPool input").evaluateAll(inputs=>{inputs.forEach(i=>i.checked=["sticktilt:rumble","crowdshift:duel"].includes(i.dataset.activityId));inputs[0].dispatchEvent(new Event("change",{bubbles:true}));});await party.locator("#partyActivitySettings summary").click();
 await party.click("#partyStartButton");await party.getByRole("button",{name:/Stick & Tilt · Rumble/}).click();await pa.waitForSelector("#stickController:not([hidden])");await party.waitForFunction(()=>document.getElementById("activityFrame").contentWindow?.render_game_to_text?.().includes('"fighting"'));
 await shot(party,"party-embedded");await bot(pa);await bot(pb);
 await party.waitForFunction(()=>JSON.parse(window.render_game_to_text()).state?.partyPhase==="results",null,{timeout:45000});const standings=(await state(party)).state.players;assert.ok(standings.every(p=>p.partyPoints>0));await shot(party,"party-results");
 await party.getByRole("button",{name:/Crowd Shift · Duel Shift/}).click();await pa.waitForSelector("#crowdController:not([hidden])");const next=(await state(party)).state;assert.ok(next.players.every(p=>standings.find(old=>old.id===p.id)?.partyPoints===p.partyPoints));checks.push("Party teaching, embedded activity, normalized awards, transition to Crowd Shift with standings retained");
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/summary.json`,JSON.stringify({success:true,checks,errors,final},null,2));console.log(`Stick & Tilt smoke passed: ${checks.join("; ")}`);
}catch(error){await fs.writeFile(`${out}/failure.json`,JSON.stringify({message:String(error),errors,checks},null,2));throw error;}
finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();}

}
await run();
