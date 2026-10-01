import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outputDir=path.join(process.cwd(),"output","web-game","crowdshift-e2e");
const baseUrl=process.argv[2]||"http://127.0.0.1:4173";
const wsParam=encodeURIComponent("ws://127.0.0.1:8081/ws");
async function loadPlaywright(){try{return await import("playwright");}catch{const fallback=path.join(process.env.CODEX_HOME||path.join(os.homedir(),".codex"),"skills","develop-web-game","node_modules","playwright","index.mjs");return import(pathToFileURL(fallback).href);}}
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const stateOf=async(page)=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));

async function main(){
  fs.mkdirSync(outputDir,{recursive:true});const summary={success:false,checks:[],screenshots:[],consoleErrors:[]};const {chromium}=await loadPlaywright();const browser=await chromium.launch({headless:true});const contexts=[];let room="";
  const makePage=async(viewport,label,options={})=>{const context=await browser.newContext({viewport,...options});contexts.push(context);const page=await context.newPage();page.on("pageerror",(error)=>summary.consoleErrors.push(`${label}: ${error}`));page.on("console",(message)=>{if(message.type()==="error")summary.consoleErrors.push(`${label}: ${message.text()}`);});return page;};
  const shot=async(page,name)=>{const target=path.join(outputDir,name);await page.screenshot({path:target,animations:"disabled"});summary.screenshots.push(target);};
  const join=async(name)=>{const page=await makePage({width:390,height:844},name,{isMobile:true,hasTouch:true});await page.goto(`${baseUrl}/party/?code=${room}&ws=${wsParam}`);await page.fill("#playerName",name);await page.click("#joinForm button[type=submit]");await page.waitForSelector("#crowdController:not([hidden])");await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).game_key==="crowdshift");return page;};
  try{
    const host=await makePage({width:1280,height:720},"host");await host.goto(`${baseUrl}/crowdshift/?ws=${wsParam}`);await host.waitForFunction(()=>/^[A-HJ-NP-Z]{4}$/.test(document.getElementById("roomCode")?.textContent||""));room=await host.locator("#roomCode").textContent();assert(await host.locator("#qrCode svg path").count()===1,"QR was not rendered locally");
    const display=await makePage({width:1280,height:720},"display");await display.goto(`${baseUrl}/crowdshift/?display=${room}&ws=${wsParam}`);await display.waitForFunction(()=>JSON.parse(window.render_game_to_text()).screen_role==="display");assert(!(await display.locator("#startButton").isVisible()),"Display exposed host start");
    const alpha=await join("Alpha");const beta=await join("Beta");const gamma=await join("Gamma");await host.waitForFunction(()=>JSON.parse(window.render_game_to_text()).players.length===3);await shot(host,"host-lobby.png");await shot(alpha,"controller-lobby.png");summary.checks.push("room_qr_display_and_three_players");
    await host.click("#startButton");await host.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==="choosing",null,{timeout:5000});await shot(host,"host-choosing.png");
    await alpha.setViewportSize({width:844,height:390});await shot(alpha,"controller-landscape.png");await alpha.setViewportSize({width:390,height:844});
    for(let round=1;round<=7;round++){
      if(round>1)await host.waitForFunction((wanted)=>{const state=JSON.parse(window.render_game_to_text());return state.phase==="choosing"&&state.round===wanted;},round,{timeout:6000});
      const current=await stateOf(host);assert(current.prompt?.question,"Round prompt missing");
      if(round===2){
        const resumeUrl=host.url();await host.goto("about:blank");await display.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==="paused");await host.goto(resumeUrl);await host.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==="choosing");summary.checks.push("host_disconnect_reconnect_synced");
        await host.click("#pauseButton");await display.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==="paused");await host.click("#pauseButton");await host.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==="choosing");summary.checks.push("host_pause_resume_synced");
      }
      let choices=["left","left","right"];
      if(current.rule==="unanimous")choices=["right","right","right"];
      await alpha.click(choices[0]==="left"?"#crowdLeft":"#crowdRight");
      await host.waitForFunction(()=>JSON.parse(window.render_game_to_text()).submitted_count===1);
      const secret=await stateOf(host);assert(secret.players.every((player)=>player.choice===""),"Host saw a secret choice before reveal");
      await Promise.all([[beta,choices[1]],[gamma,choices[2]]].map(([page,choice])=>page.click(choice==="left"?"#crowdLeft":"#crowdRight")));
      await host.waitForFunction((wanted)=>{const state=JSON.parse(window.render_game_to_text());return state.phase==="reveal"&&state.round===wanted;},round,{timeout:5000});
      const reveal=await stateOf(host);assert(reveal.left_count+reveal.right_count===3,"Reveal count did not match submissions");assert(reveal.players.every((player)=>player.choice),"Reveal omitted player choices");
      if(round===1){await shot(host,"host-reveal.png");await shot(alpha,"controller-reveal.png");}
    }
    await host.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==="podium",null,{timeout:6000});const final=await stateOf(host);assert(final.players.length===3&&final.players[0].rank===1,"Final ranking missing");await display.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==="podium");await shot(host,"host-podium.png");summary.checks.push("seven_rules_reveals_scoring_and_podium");
    await host.click("#startButton");await host.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==="countdown");await host.click("#endButton");await display.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==="ended");summary.checks.push("rematch_and_host_end");
    assert(summary.consoleErrors.length===0,`Browser errors: ${summary.consoleErrors.join(" | ")}`);summary.success=true;fs.writeFileSync(path.join(outputDir,"summary.json"),JSON.stringify(summary,null,2));console.log(`Crowd Shift smoke passed. Summary: ${path.join(outputDir,"summary.json")}`);
  }finally{await Promise.all(contexts.map((context)=>context.close().catch(()=>{})));await browser.close();}
}
main().catch((error)=>{console.error(error);process.exit(1);});
