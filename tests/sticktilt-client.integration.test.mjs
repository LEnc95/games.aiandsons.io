import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { combatFeedback, motionAxis, tiltMovement } from "../sticktilt/controller.js";
import { drawArena } from "../sticktilt/renderer.js";

test("motion handles portrait, both landscapes, missing readings, dead zone, and limits",()=>{
  assert.equal(motionAxis({gamma:12,beta:7}),12);
  assert.equal(motionAxis({gamma:12,beta:7},90),-7);
  assert.equal(motionAxis({gamma:12,beta:7},270),7);
  for(const value of [null,undefined,NaN,Infinity])assert.equal(motionAxis({gamma:value}),null);
  assert.equal(tiltMovement(11,10),0);
  assert.equal(tiltMovement(22,10),.5);
  assert.equal(tiltMovement(-90,10),-1);
  assert.equal(tiltMovement(90,10),1);
});
test("authoritative combat changes become distinct phone feedback",()=>{
  const base={name:"Pencil",points:0,headline:"",fighter:{health:100,hits:0}};
  assert.deepEqual(combatFeedback(base,{...base,fighter:{health:100,hits:1}}),{kind:"hit",message:"Hit landed — keep the pressure on!",haptic:25});
  assert.equal(combatFeedback(base,{...base,fighter:{health:75,hits:0}})?.kind,"damage");
  assert.equal(combatFeedback(base,{...base,headline:"Pencil blocked the punch!"})?.kind,"block");
  assert.equal(combatFeedback(base,{...base,points:1,fighter:{health:100,hits:4}})?.kind,"knockout");
  assert.equal(combatFeedback(base,base),null);
});
test("arena renders lobby, combat, paused, and tied eight-player results",()=>{
  const labels=[];
  const ctx=new Proxy({fillText:text=>labels.push(text)},{get:(object,key)=>object[key]??(()=>{}),set:(object,key,value)=>(object[key]=value,true)});
  const players=Array.from({length:8},(_,i)=>({id:String(i),name:`Player ${i}`,color:"#abc",points:0,rank:1,connected:true,fighter:{x:100+i*130,y:0,facing:1,health:100}}));
  const platforms=[{x:215,y:74,width:245},{x:477,y:148,width:246},{x:740,y:74,width:245}];
  for(const phase of ["lobby","countdown","fighting","paused","intermission","podium"])drawArena(ctx,{phase,players,platforms,round:1},12,true);
  assert.ok(labels.includes("TIED AT THE TOP — SHARED GLORY"));
  assert.ok(labels.includes("TIME OUT"));
  assert.ok(labels.includes("Player 7"));
  assert.ok(labels.includes("12 · Jump through boxes to take the high ground."));
});
test("game registration, embedded recording, feedback, and outcome are wired",async()=>{
  const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
  const [game,html,app,config]=await Promise.all([read("sticktilt/game.js"),read("sticktilt/index.html"),read("party/app.js"),read("vercel.json")]);
  assert.match(game,/slug:"sticktilt"/);assert.match(game,/durationMs:snapshot.durationMs/);
  assert.match(game,/syncEmbeddedRecording/);assert.match(html,/gameSlug: "sticktilt"/);
  assert.match(app,/createStickController/);
  const routes=JSON.parse(config).rewrites;for(const source of ["/sticktilt","/sticktilt/"])assert.ok(routes.some(r=>r.source===source&&r.destination==="/sticktilt/index.html"));
});
