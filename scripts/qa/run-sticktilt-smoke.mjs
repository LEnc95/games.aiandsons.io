import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
const root=process.cwd(),port="54175",wsPort="58085";
const stop=proc=>{if(!proc||proc.killed)return;if(process.platform==="win32")spawnSync("taskkill",["/pid",String(proc.pid),"/t","/f"],{stdio:"ignore"});else proc.kill();};
const web=spawn(process.execPath,["scripts/qa/static-server.mjs",root,port],{cwd:root,stdio:"ignore"});
const server=spawn("go",["run","."],{cwd:path.join(root,"v2-server"),stdio:"ignore",env:{...process.env,PORT:wsPort,PARTY_TEST_FAST:process.argv.includes("--normal")?"":"1",ENABLED_GAMES:"party",PARTY_ROOM_STORE:"",SERVICE_NAME:"sticktilt-test"}});
const cleanup=()=>{stop(web);stop(server);};
process.on("exit",cleanup);
async function wait(url){for(let i=0;i<120;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error(`Unavailable: ${url}`);}
try{
  await Promise.all([wait(`http://127.0.0.1:${port}/sticktilt/`),wait(`http://127.0.0.1:${wsPort}/healthz`)]);
  const test=spawn(process.execPath,["scripts/qa/sticktilt-smoke.mjs",`http://127.0.0.1:${port}`,`ws://127.0.0.1:${wsPort}/ws`],{cwd:root,stdio:"inherit",env:{...process.env,STICKTILT_NORMAL:process.argv.includes("--normal")?"1":""}});
  process.exitCode=await new Promise((resolve,reject)=>{test.on("exit",resolve);test.on("error",reject);});
}finally{cleanup();}
