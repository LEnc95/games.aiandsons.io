// The arena uses plain canvas strokes so fighters remain crisp on a shared TV.
export function drawArena(ctx, snapshot, seconds, reducedMotion = false) {
  const ink = "#253349", paper = "#faf4e7", gold = "#f3bb3e";
  const s = snapshot || {}, players = s.players || [], clock = s.fightClock || 0;
  const text = (value, x, y, size = 24, color = ink, align = "center", max = 1100) => {
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle";
    ctx.font = `800 ${size}px 'Trebuchet MS', system-ui`; ctx.fillText(value, x, y, max);
  };
  const box = (x,y,w,h,color) => { ctx.fillStyle=color; ctx.beginPath();ctx.roundRect(x,y,w,h,16);ctx.fill(); };
  ctx.fillStyle=paper;ctx.fillRect(0,0,1200,675);
  ctx.strokeStyle="#e8e0d1";ctx.lineWidth=1;
  for(let y=20;y<675;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1200,y);ctx.stroke();}
  ctx.strokeStyle="#efd0bf";ctx.beginPath();ctx.moveTo(48,0);ctx.lineTo(48,675);ctx.stroke();
  text("STICK & TILT",65,44,31,ink,"left");
  text(s.phase === "lobby" || !s.phase ? "PHONE-POWERED FIGHT CLUB" : `ROUND ${s.round || 1} / 3`,1135,44,20,ink,"right");
  const fighter = (p,x,y,scale=1,index=0) => {
    const f=p.fighter||{facing:index%2?-1:1,health:100}, facing=f.facing||1;
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    if(f.respawnAt>clock)ctx.globalAlpha=.25;
    ctx.fillStyle="#26334818";ctx.beginPath();ctx.ellipse(0,0,30,6,0,0,Math.PI*2);ctx.fill();
    const walk = reducedMotion ? 0 : Math.sin(clock/95+index)*Math.min(12,Math.abs(f.Move||0)*12);
    ctx.strokeStyle=ink;ctx.lineWidth=7;ctx.lineCap="round";ctx.lineJoin="round";
    ctx.beginPath();ctx.arc(0,-91,17,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-74);ctx.lineTo(0,-39);ctx.lineTo(-19-walk,0);ctx.moveTo(0,-39);ctx.lineTo(20+walk,0);
    ctx.moveTo(0,-65);ctx.lineTo(-facing*22,-49);ctx.lineTo(-facing*29,-61);
    ctx.moveTo(0,-65);ctx.lineTo(facing*23,-59);ctx.lineTo(facing*(f.punchUntil>clock?76:32),f.punchUntil>clock?-65:-76);ctx.stroke();
    ctx.strokeStyle=p.color||"#008b80";ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(-12,-96);ctx.lineTo(13,-96);ctx.moveTo(0,-69);ctx.lineTo(0,-48);ctx.stroke();
    if(f.guardUntil>clock || f.shieldUntil>clock){ctx.strokeStyle=f.guardUntil>clock?"#278eaa":"#c29531";ctx.lineWidth=3;ctx.setLineDash(f.guardUntil>clock?[]:[5,7]);ctx.beginPath();ctx.ellipse(0,-56,48,66,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    ctx.restore();
  };
  if(!s.phase || s.phase === "lobby") {
    text("Small sticks.",600,159,67);text("BIG GRUDGES.",600,230,80);
    const samples=players.length?players:[{name:"You",color:"#00a99c"},{name:"Your rival",color:"#eb6480"}];
    samples.forEach((p,i)=>{const x=600+(i-(samples.length-1)/2)*Math.min(180,990/samples.length);fighter(p,x,427,1.25,i);text(p.name,x,466,22,ink,"center",120);});
    box(152,512,896,100,ink);text("TILT to move    •    PUNCH    •    JUMP    •    GUARD",600,546,25,paper);
    text("3 × 30 seconds · 1 point per knockout · Quick respawns · Ties share the win",600,582,18,"#ffdc81");
    text(players.length<2?"Join on your phone. Bring a rival.":`${players.filter(p=>p.connected).length} fighters connected — the host starts the rumble`,600,646,23);
    return;
  }
  if(s.phase === "podium" || s.phase === "intermission" || s.phase === "ended") {
    text(s.phase === "podium"?"THAT’S A WRAP!":s.phase === "ended"?"MATCH ENDED":`ROUND ${s.round} COMPLETE`,600,128,55);
    const winners=players.filter(p=>p.rank===1&&!p.queued);
    text(s.phase==="intermission"?`Next round in ${Math.ceil(seconds)} · Fresh health, new starting spots`:winners.length>1?"TIED AT THE TOP — SHARED GLORY":`${winners[0]?.name||"Everyone"} takes the crown`,600,188,25);
    players.forEach((p,i)=>{const x=100+(i%2)*520,y=249+Math.floor(i/2)*84;box(x,y,480,70,p.rank===1?"#f7d475":"#eee5d5");text(`${p.rank}. ${p.name}`,x+22,y+25,24,ink,"left",320);text(`+${p.roundPoints||0} this round`,x+22,y+51,16,ink,"left");text(`${p.points} KO`,x+454,y+35,28,ink,"right");});
    text(s.phase==="podium"?"Hit Rematch to settle the score.":"Every knockout is worth one point.",600,635,24);return;
  }
  players.forEach((p,i)=>{const w=1070/Math.max(1,players.length),x=65+i*w;box(x,81,w-8,65,"#eee5d5");text(p.name,x+10,101,Math.min(19,w/7),ink,"left",w-20);text(`${p.points} KO`,x+10,128,19,ink,"left");});
  text(`${Math.ceil(seconds)}s`,600,190,36);
  // Broad floor and restrained scenery leave the fighting silhouettes clear.
  ctx.fillStyle="#e7ddc8";ctx.fillRect(48,543,1104,66);ctx.strokeStyle=ink;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(48,543);ctx.lineTo(1152,543);ctx.stroke();
  text("THE DOODLE DOJO",600,582,18,"#776c57");
  (s.platforms||[]).forEach((platform,index)=>{
    const y=542-platform.y;
    ctx.fillStyle=index===1?"#e0a85c":"#d7bd82";ctx.strokeStyle=ink;ctx.lineWidth=3;
    ctx.beginPath();ctx.roundRect(platform.x,y,platform.width,18,4);ctx.fill();ctx.stroke();
    ctx.strokeStyle="#7b6545";ctx.lineWidth=2;
    for(let x=platform.x+18;x<platform.x+platform.width;x+=34){ctx.beginPath();ctx.moveTo(x,y+4);ctx.lineTo(x+12,y+14);ctx.stroke();}
    ctx.fillStyle="#25334922";ctx.fillRect(platform.x+10,y+18,platform.width-20,5);
  });
  players.forEach((p,i)=>{const f=p.fighter;if(!f)return;fighter(p,f.x,542-f.y,1,i);const y=375-f.y;box(f.x-40,y,80,8,"#d6cbbb");box(f.x-40,y,Math.max(0.1,80*f.health/100),8,f.health<=25?"#d64f5b":"#168678");text(p.name,f.x,y-16,16,ink,"center",110);if(f.respawnAt>clock)text("BACK IN A SEC",f.x,520-f.y,14);});
  text(s.headline||"Tilt to move. Get close and punch!",600,646,24,ink,"center",1080);
  if(s.phase === "countdown" || s.phase === "paused") {
    box(280,237,640,165,ink);text(s.phase==="paused"?"TIME OUT":`ROUND ${s.round} · GET READY`,600,291,40,paper);
    text(s.phase==="paused"?(s.pauseReason==="host_disconnected"?"Waiting for the host to reconnect":"The host will resume soon"):`${Math.max(1,Math.ceil(seconds))} · Jump through boxes to take the high ground.`,600,354,24,"#ffdc81");
  }
}
