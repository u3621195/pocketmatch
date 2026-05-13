/* ============================================================
   POCKET MATCH — Game logic
   ============================================================ */
let ROWS=9, COLS=16;
const BASE_TIME=480;
const HINTS=5, SHUFFLES=10;
const SAVE_KEY="pocketmatch_v4";
const SET_KEY="pocketmatch_set_v3";

const $=id=>document.getElementById(id);
const boardEl=$("board"), canvas=$("pathCanvas"), ctx=canvas.getContext("2d");

/* ---------- RESPONSIVE BOARD LAYOUT ----------
   Desktop keeps the full 16×9 board. Phones use fewer, larger tiles so
   the game is playable when saved to the iPhone Home Screen. */
function isTouchDevice(){
  return (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || "ontouchstart" in window;
}
function chooseBoardLayout(){
  // Keep the original app layout on every device.
  // The previous mobile build reduced the board to 10×6 / 12×8, which made
  // the game feel unlike the reference app. Instead, we keep 16×9 and scale
  // the frame to use the available screen area.
  return {rows:9, cols:16};
}
function applyBoardVars(){
  if(!boardEl) return;
  boardEl.style.setProperty("--rows", ROWS);
  boardEl.style.setProperty("--cols", COLS);
  const frame=document.querySelector(".board-frame");
  if(frame) frame.style.setProperty("--board-aspect", `${COLS} / ${ROWS}`);
}
function configureBoardLayout(layout){
  const chosen=layout || chooseBoardLayout();
  ROWS=chosen.rows; COLS=chosen.cols;
  applyBoardVars();
}
function fitBoardFrame(){
  const frame=document.querySelector(".board-frame");
  const screen=$("gameScreen");
  if(!frame || !screen || screen.classList.contains("hidden")) return;

  const hud=document.querySelector(".game-hud")?.getBoundingClientRect().height || 0;
  const rail=document.querySelector(".timer-rail-wrap")?.getBoundingClientRect().height || 0;
  const status=document.querySelector(".board-status")?.getBoundingClientRect().height || 22;
  const w=window.innerWidth||document.documentElement.clientWidth||900;
  const h=window.innerHeight||document.documentElement.clientHeight||600;
  const ratio=16/9;
  const touch=isTouchDevice();
  const landscape=w>=h;

  // Leave room for iOS side overlays / safe areas, but otherwise make the
  // board as large as possible so 16×9 tiles look close to the original app.
  const sideReserve=(touch && landscape) ? 116 : (touch ? 24 : 28);
  const bottomReserve=(touch && landscape) ? 8 : (touch ? 14 : 36);
  const availW=Math.max(320, w-sideReserve);
  const availH=Math.max(220, h-hud-rail-status-bottomReserve);
  let fittedW=Math.floor(Math.min(availW, availH*ratio));
  let fittedH=Math.floor(fittedW/ratio);

  frame.style.width=fittedW+"px";
  frame.style.height=fittedH+"px";
  frame.style.maxWidth="none";
  frame.style.maxHeight="none";
  frame.style.aspectRatio="auto";
}
configureBoardLayout();

/* ---------- AUDIO ---------- */
let audioCtx=null, sfxOn=true, bgmOn=true, audioUnlocked=false;
function ac(){ if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)(); return audioCtx; }
function unlockAudio(){ try{const c=ac(); if(c.state==="suspended") c.resume().catch(()=>{}); audioUnlocked=true;}catch(e){} }
["touchstart","pointerdown","mousedown","keydown","click"].forEach(t=>document.addEventListener(t,unlockAudio,{capture:true,passive:true}));
function tone(f,d=.08,type="square",v=.06,delay=0){
  if(!sfxOn) return;
  try{
    const c=ac(); if(c.state==="suspended") return;
    const o=c.createOscillator(), g=c.createGain();
    const t=c.currentTime+delay;
    o.type=type; o.frequency.setValueAtTime(f,t);
    g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(v,t+.01);
    g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t+d+.02);
  }catch(e){}
}
const sfx={
  tap(){tone(440,.04,"square",.03);tone(660,.04,"square",.025,.03)},
  match(){tone(523,.07,"square",.05);tone(784,.09,"triangle",.04,.08);tone(1175,.12,"triangle",.03,.18)},
  bad(){tone(160,.12,"sawtooth",.045);tone(110,.10,"sawtooth",.035,.08)},
  shuffle(){tone(300,.05,"square",.035);tone(420,.05,"square",.035,.08);tone(540,.05,"square",.035,.16)},
  hint(){tone(880,.05,"triangle",.035);tone(1320,.06,"triangle",.030,.07);tone(1760,.06,"triangle",.025,.14)},
  level(){tone(392,.08,"square",.04);tone(523,.08,"square",.04,.08);tone(659,.08,"square",.04,.16);tone(784,.16,"square",.05,.24)},
  warn(){tone(880,.08,"square",.045);tone(880,.08,"square",.045,.16)},
  over(){tone(220,.16,"sawtooth",.05);tone(196,.16,"sawtooth",.045,.18);tone(164,.25,"sawtooth",.04,.36)}
};
const bgm=new Audio("assets/audio/background-music.mp3");
bgm.loop=true; bgm.volume=.35;

/* ---------- STRATEGIES ---------- */
const STRATEGIES=[
  {id:0,name:"NORMAL",   label:"No movement"},
  {id:1,name:"BOTTOM",   label:"Fall downward"},
  {id:2,name:"TOP",      label:"Rise upward"},
  {id:3,name:"LEFT",     label:"Slide left"},
  {id:4,name:"RIGHT",    label:"Slide right"},
  {id:5,name:"X CENTER", label:"Collapse to center"},
  {id:6,name:"Y CENTER", label:"Collapse to middle row"}
];
const getStrategy=lvl=>STRATEGIES[(Math.max(1,lvl)-1)%STRATEGIES.length];
const getLevelTime=lvl=>lvl<=7?480:lvl<=14?450:lvl<=21?420:lvl<=28?405:lvl<=35?390:360;
function applyMovement(strategy){
  const id=strategy.id; if(id===0) return;
  const compact=(cells,dir)=>{const a=cells.filter(c=>!c.removed),e=cells.filter(c=>c.removed);return dir===1?[...e,...a]:[...a,...e]};
  const vert=dir=>{for(let c=0;c<COLS;c++){const col=board.map(r=>r[c]),x=compact(col,dir);for(let r=0;r<ROWS;r++)board[r][c]=x[r]}};
  const horz=dir=>{for(let r=0;r<ROWS;r++)board[r]=compact(board[r],dir)};
  const xCent=()=>{const mid=Math.floor(COLS/2);for(let r=0;r<ROWS;r++){const all=board[r],a=all.filter(x=>!x.removed),e=all.filter(x=>x.removed);const la=a.slice(0,Math.ceil(a.length/2)),ra=a.slice(Math.ceil(a.length/2));const lg=e.slice(0,mid-la.length),rg=e.slice(mid-la.length);board[r]=[...la,...lg,...rg,...ra]}};
  const yCent=()=>{const mid=Math.floor(ROWS/2);for(let c=0;c<COLS;c++){const col=board.map(r=>r[c]),a=col.filter(x=>!x.removed),e=col.filter(x=>x.removed);const ta=a.slice(0,Math.ceil(a.length/2)),ba=a.slice(Math.ceil(a.length/2));const tg=e.slice(0,mid-ta.length),bg=e.slice(mid-ta.length);const nc=[...ta,...tg,...bg,...ba];for(let r=0;r<ROWS;r++)board[r][c]=nc[r]}};
  if(id===1)vert(1); else if(id===2)vert(0); else if(id===3)horz(0); else if(id===4)horz(1); else if(id===5)xCent(); else if(id===6)yCent();
}

/* ---------- SPRITES ---------- */
const SPRITE_SETS={
  gadgets:{ name:"GADGETS", count:30, dir:"assets/sprites/gadgets",
    names:["air-purifier","cctv","cpu","camera","desktop-speakers","docking","drone","earbuds","floppy","gpu","game-console-1","game-console-2","game-controller","headset","joystick","keyboard","laptop","mobile-phone-1","mobile-phone-2","monitor","photo-frame","powerbank","projector","sd-card","smart-watch","speaker","tablet","turntable","vr","widescreen"]
  },
  sports:{ name:"SPORTS", count:30, dir:"assets/sprites/sports", scale:1.18,
    names:["american-football-helmet","american-football","analog-timer","basketball","bicycle","bowling-pins","bowling","boxing","dart-board","dumbbell","f1","football-shoe","football","golf","kayak","motorcross-bike","parachute","ping-pong","podium","pommel-horse","rollerskate","sailboat","scoreboard","scuba-goggles","shuttlecock","stadium","tennis","timer","trophy","volleyball"]
  },
  foodies:{ name:"FOODIES", count:30, dir:"assets/sprites/foodies",
    names:["beer","bento","boba-milk-tea","burger","cheese","chocolate-bar","coffee","cupcake","custard","donut","french-fries","grape","hotdog","ice-cream","lollipop","macaron","milk","orange","pizza","popcorn","ramen","sandwich","soda","strawberry","sushi","taco","waffle","watermelon","apple","banana"]
  },
  home:{ name:"HOME", count:30, dir:"assets/sprites/home",
    names:["air-fryer","bath-tub","bed","bluetooth-speaker","bookshelf","bunk-bed","chandelier","clock","cloth-rack","curtain","dining-chair","fan","fridge","hair-dryer","lounge-chair","microwave","pc","phone","radio","sewing-machine","sink","sofa","stereo","stove","toaster","tv","vacuum-cleaner","vase","wardrobe","washing-machine"]
  }
};
function spritesFor(setId){
  const s=SPRITE_SETS[setId];
  return s.names.map((n,i)=>({id:i+1, name:n, img:`${s.dir}/${String(i+1).padStart(2,"0")}-${n}.png`, scale:s.scale||1}));
}

/* ---------- STATE ---------- */
let board=[], selected=null, score=0, levelScore=0, level=1;
let timeLeft=BASE_TIME, currentLevelTime=BASE_TIME, timerWarned=false;
let timerId=null, paused=false, gameStarted=false, quickPlay=false;
let comboCount=0, lastMatchAt=0, bestCombo=0;
let usedHintLvl=0, usedShuffLvl=0;
let hintCount=HINTS, shuffleCount=SHUFFLES;
let currentStrategy=STRATEGIES[0];
let currentSetId=localStorage.getItem(SET_KEY)||"sports";
if(!SPRITE_SETS[currentSetId]) currentSetId="sports";
let entities=spritesFor(currentSetId);

/* ---------- BG TILES ---------- */
(function paintBgTiles(){
  const wrap=$("bgTiles"); if(!wrap) return;
  const all=[...spritesFor("gadgets"), ...spritesFor("sports"), ...spritesFor("foodies"), ...spritesFor("home")];
  const need=80;
  for(let i=0;i<need;i++){
    const s=all[Math.floor(Math.random()*all.length)];
    const img=document.createElement("img");
    img.src=s.img; img.alt="";
    wrap.appendChild(img);
  }
})();

/* ---------- SAVE/LOAD ---------- */
const saveKey=(setId=currentSetId)=>`${SAVE_KEY}_${setId}`;
function saveGame(){
  if(quickPlay||!gameStarted) return;
  try{
    const data={ts:Date.now(),level,score,levelScore,timeLeft,currentLevelTime,hintCount,shuffleCount,strategyId:currentStrategy.id,setId:currentSetId,rows:ROWS,cols:COLS,
      board:board.map(r=>r.map(c=>({id:c.entity.id,removed:c.removed})))};
    localStorage.setItem(saveKey(),JSON.stringify(data));
  }catch(e){}
}
function loadSave(setId=currentSetId){
  try{const raw=localStorage.getItem(saveKey(setId)); return raw?JSON.parse(raw):null}catch(e){return null}
}
function deleteSave(setId=currentSetId){try{localStorage.removeItem(saveKey(setId))}catch(e){}}
function restoreFromSave(s){
  currentSetId=s.setId||currentSetId;
  entities=spritesFor(currentSetId);
  level=s.level; score=s.score; levelScore=s.levelScore||0;
  timeLeft=s.timeLeft; currentLevelTime=s.currentLevelTime||getLevelTime(level);
  hintCount=s.hintCount; shuffleCount=s.shuffleCount;
  currentStrategy=STRATEGIES.find(x=>x.id===s.strategyId)||STRATEGIES[0];
  configureBoardLayout();
  if((s.board?.length||0)!==ROWS || (s.board?.[0]?.length||0)!==COLS) return false;
  board=s.board.map(r=>r.map(c=>({entity:entities.find(e=>e.id===c.id)||entities[0],removed:c.removed})));
  syncHud();
  renderBoard();
}

/* ---------- BOARD ---------- */
function shuf(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function createBoard(){
  const total=ROWS*COLS, pairs=total/2;
  const active=entities.slice(0,Math.min(entities.length,pairs));
  const vals=[];
  for(let i=0;i<pairs;i++){const e=active[i%active.length]; vals.push(e,e)}
  shuf(vals);
  board=[]; let k=0;
  for(let r=0;r<ROWS;r++){const row=[];for(let c=0;c<COLS;c++) row.push({entity:vals[k++],removed:false}); board.push(row)}
}
function renderBoard(){
  applyBoardVars();
  fitBoardFrame();
  boardEl.innerHTML="";
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const t=document.createElement("div"); t.className="tile"; t.dataset.r=r; t.dataset.c=c;
    if(board[r][c].removed) t.classList.add("removed");
    else{
      const e=board[r][c].entity;
      const img=document.createElement("img");
      img.className="entity-sprite";
      img.src=e.img; img.alt=e.name; img.draggable=false; img.loading="eager";
      img.style.setProperty("--sprite-scale", e.scale||1);
      t.appendChild(img);
    }
    let last=0;
    const press=(ev)=>{
      unlockAudio();
      if(ev&&ev.cancelable) ev.preventDefault();
      const now=Date.now(); if(now-last<260) return; last=now;
      clickTile(r,c,t);
    };
    if(window.PointerEvent) t.addEventListener("pointerup",press,{passive:false});
    else{ t.addEventListener("touchend",press,{passive:false}); t.addEventListener("mouseup",press,{passive:false}); }
    boardEl.appendChild(t);
  }
  fitBoardFrame();
  setTimeout(()=>{ fitBoardFrame(); resizeCanvas(); },40);
}
function resizeCanvas(){
  const r=boardEl.getBoundingClientRect();
  const tw=r.width/COLS, th=r.height/ROWS;
  canvas.width=r.width+tw*2; canvas.height=r.height+th*2;
  canvas.style.width=canvas.width+"px"; canvas.style.height=canvas.height+"px";
  const wrap=boardEl.parentElement.getBoundingClientRect();
  canvas.style.left=(r.left-wrap.left-tw)+"px";
  canvas.style.top=(r.top-wrap.top-th)+"px";
}
window.addEventListener("resize",()=>{ if(gameStarted){ fitBoardFrame(); resizeCanvas(); } });
window.addEventListener("orientationchange",()=>{ if(gameStarted){ setTimeout(()=>{ fitBoardFrame(); resizeCanvas(); },250); } });

/* ---------- PATH LOGIC ---------- */
function emptyCell(r,c){return r<0||r>=ROWS||c<0||c>=COLS||board[r][c].removed}
function straight(a,b){
  if(a.r===b.r){for(let c=Math.min(a.c,b.c)+1;c<Math.max(a.c,b.c);c++) if(!emptyCell(a.r,c)) return false; return true}
  if(a.c===b.c){for(let r=Math.min(a.r,b.r)+1;r<Math.max(a.r,b.r);r++) if(!emptyCell(r,a.c)) return false; return true}
  return false;
}
function findPath(a,b){
  if(straight(a,b)) return [a,b];
  const p1={r:a.r,c:b.c}; if(emptyCell(p1.r,p1.c)&&straight(a,p1)&&straight(p1,b)) return [a,p1,b];
  const p2={r:b.r,c:a.c}; if(emptyCell(p2.r,p2.c)&&straight(a,p2)&&straight(p2,b)) return [a,p2,b];
  for(let r=-1;r<=ROWS;r++){const pa={r,c:a.c},pb={r,c:b.c}; if(emptyCell(pa.r,pa.c)&&emptyCell(pb.r,pb.c)&&straight(a,pa)&&straight(pa,pb)&&straight(pb,b)) return [a,pa,pb,b]}
  for(let c=-1;c<=COLS;c++){const pa={r:a.r,c},pb={r:b.r,c}; if(emptyCell(pa.r,pa.c)&&emptyCell(pb.r,pb.c)&&straight(a,pa)&&straight(pa,pb)&&straight(pb,b)) return [a,pa,pb,b]}
  return null;
}
function findAnyMove(){
  const cells=[]; for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(!board[r][c].removed) cells.push({r,c,id:board[r][c].entity.id});
  for(let i=0;i<cells.length;i++) for(let j=i+1;j<cells.length;j++) if(cells[i].id===cells[j].id && findPath(cells[i],cells[j])) return [cells[i],cells[j]];
  return null;
}

/* ---------- PATH DRAW ---------- */
function cellSize(){const r=boardEl.getBoundingClientRect(); return {w:r.width/COLS,h:r.height/ROWS}}
function pt(p){const {w,h}=cellSize(); return {x:(p.c+1.5)*w, y:(p.r+1.5)*h}}
function drawLine(pts,col,w,blur){
  ctx.save(); ctx.lineJoin="round"; ctx.lineCap="round";
  ctx.strokeStyle=col; ctx.lineWidth=w; ctx.shadowBlur=blur; ctx.shadowColor=col;
  ctx.beginPath();
  pts.forEach((p,i)=>{const o=pt(p);(i?ctx.lineTo:ctx.moveTo).call(ctx, Math.round(o.x)+.5, Math.round(o.y)+.5)});
  ctx.stroke(); ctx.restore();
}
function drawPath(p){
  resizeCanvas(); ctx.clearRect(0,0,canvas.width,canvas.height);
  drawLine(p,"rgba(217,163,255,.45)",14,24);
  drawLine(p,"#d9a3ff",7,18);
  drawLine(p,"#ffffff",2,5);
}
function clearPath(){ctx.clearRect(0,0,canvas.width,canvas.height)}

/* ---------- TILE INTERACTION ---------- */
function tileEl(r,c){return boardEl.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`)}
function clearSel(){document.querySelectorAll(".tile.selected").forEach(t=>t.classList.remove("selected")); selected=null}
function comboPts(){return [100,150,200,300,400,500][Math.min(5,Math.max(0,comboCount-1))]}
function showCombo(text){
  const el=document.createElement("div");el.className="combo-pop";el.textContent=text;
  $("comboLayer").appendChild(el); setTimeout(()=>el.remove(),760);
}
function setStatus(t){$("boardStatus").textContent=t}
function clickTile(r,c,el){
  if(paused||!gameStarted||board[r][c].removed) return;
  if(!selected){ selected={r,c,el}; el.classList.add("selected"); sfx.tap(); setStatus(board[r][c].entity.name.toUpperCase().replace(/-/g," ")); return; }
  if(selected.r===r&&selected.c===c){ clearSel(); sfx.tap(); setStatus("CLEARED"); return; }
  const a=selected, b={r,c};
  if(board[a.r][a.c].entity.id===board[b.r][b.c].entity.id){
    const p=findPath(a,b);
    if(p){
      drawPath(p); sfx.match();
      tileEl(a.r,a.c)?.classList.add("matched"); tileEl(b.r,b.c)?.classList.add("matched");
      board[a.r][a.c].removed=board[b.r][b.c].removed=true;
      const now=Date.now();
      comboCount=(lastMatchAt && now-lastMatchAt<=4000)?comboCount+1:1;
      lastMatchAt=now; bestCombo=Math.max(bestCombo,comboCount);
      const pts=comboPts(); score+=pts; levelScore+=pts;
      $("hudScore").textContent=score;
      setStatus(comboCount>1?`COMBO x${comboCount}  +${pts}`:`MATCH  +${pts}`);
      if(comboCount>1) showCombo(`COMBO x${comboCount}  +${pts}`);
      saveGame();
      setTimeout(()=>{
        clearPath(); applyMovement(currentStrategy); renderBoard();
        if(board.flat().every(t=>t.removed)){ sfx.level(); showLevelComplete(); }
        else if(!findAnyMove()){ setStatus("NO MOVES — RESHUFFLING"); setTimeout(()=>shuffleTiles(false),420) }
      },420);
    }else{ setStatus("PATH BLOCKED"); sfx.bad(); }
  }else{ setStatus("NOT A PAIR"); sfx.bad(); }
  clearSel();
}

/* ---------- HINT / SHUFFLE ---------- */
function doHint(){
  if(paused||!gameStarted) return;
  if(hintCount<=0){ sfx.bad(); return; }
  const m=findAnyMove(); if(!m){ setStatus("NO LINK"); sfx.bad(); return; }
  hintCount--; usedHintLvl++; $("hintCount").textContent=hintCount;
  document.querySelectorAll(".tile.hint").forEach(t=>t.classList.remove("hint"));
  m.forEach(p=>tileEl(p.r,p.c)?.classList.add("hint"));
  sfx.hint(); setStatus("HINT");
  saveGame();
  setTimeout(()=>document.querySelectorAll(".tile.hint").forEach(t=>t.classList.remove("hint")),1800);
}
function shuffleTiles(count=true){
  if(paused||!gameStarted) return;
  if(count && shuffleCount<=0){ sfx.bad(); return; }
  const rem=[]; board.flat().forEach(t=>{if(!t.removed) rem.push(t.entity)});
  for(let a=0;a<12;a++){
    shuf(rem);
    let k=0; for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(!board[r][c].removed) board[r][c].entity=rem[k++];
    if(findAnyMove()) break;
  }
  if(count){ shuffleCount--; usedShuffLvl++; $("shuffleCount").textContent=shuffleCount; saveGame(); }
  renderBoard(); sfx.shuffle(); setStatus("RESHUFFLED");
}

/* ---------- TIMER ---------- */
function updateTimer(){
  const m=String(Math.floor(timeLeft/60)).padStart(2,"0"), s=String(timeLeft%60).padStart(2,"0");
  $("timerText").textContent=`${m}:${s}`;
  $("timerFill").style.width=`${Math.max(0,timeLeft/currentLevelTime*100)}%`;
  document.body.classList.toggle("low-time", timeLeft<=45);
  if(timeLeft===45 && !timerWarned){ timerWarned=true; sfx.warn(); setStatus("TIME WARNING"); }
}
function startTimer(){
  clearInterval(timerId);
  timerId=setInterval(()=>{
    if(paused) return;
    timeLeft=Math.max(0,timeLeft-1); updateTimer();
    if(timeLeft<=0) showGameOver();
  },1000);
}

/* ---------- HUD ---------- */
function syncHud(){
  $("hudLevel").textContent=String(level).padStart(2,"0");
  $("hudScore").textContent=score;
  $("hintCount").textContent=hintCount;
  $("shuffleCount").textContent=shuffleCount;
  $("ruleTag").textContent=`${currentStrategy.name} · ${currentStrategy.label}`;
  updateTimer();
}

/* ---------- LIFECYCLE ---------- */
function showScreen(which){
  document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));
  $(which).classList.remove("hidden");
  // Hide gear during gameplay, show on start screen
  const gear=$("settingsBtn");
  if(gear) gear.classList.toggle("is-hidden", which!=="startScreen");
  if(which==="gameScreen") setTimeout(()=>{ fitBoardFrame(); resizeCanvas(); }, 50);
}
function startGame(opts={}){
  quickPlay=!!opts.quick;
  if(!quickPlay) deleteSave(currentSetId);
  hideAllOverlays();
  showScreen("gameScreen");
  level=1; score=0; levelScore=0;
  hintCount=HINTS; shuffleCount=SHUFFLES;
  currentStrategy=getStrategy(1);
  currentLevelTime=getLevelTime(1); timeLeft=currentLevelTime; timerWarned=false;
  comboCount=0; lastMatchAt=0; bestCombo=0; usedHintLvl=0; usedShuffLvl=0;
  paused=false; gameStarted=true;
  entities=spritesFor(currentSetId);
  configureBoardLayout();
  createBoard(); renderBoard(); syncHud();
  saveGame(); startTimer();
  setStatus("LET'S GO");
  if(bgmOn) bgm.play().catch(()=>{});
}
function continueFromSave(){
  const s=loadSave(); if(!s){ startGame(); return; }
  hideAllOverlays(); showScreen("gameScreen");
  paused=false; gameStarted=true; timerWarned=false;
  restoreFromSave(s);
  startTimer();
  setStatus(`RESUMED LV ${level}`);
  if(bgmOn) bgm.play().catch(()=>{});
}
function showLevelComplete(){
  clearInterval(timerId); paused=true;
  const next=level+1, ns=getStrategy(next);
  const tBonus=timeLeft*50;
  const perfect=(usedHintLvl===0&&usedShuffLvl===0)?5000:0;
  score+=tBonus+perfect; levelScore+=tBonus+perfect;
  $("hudScore").textContent=score;
  if(level%3===0){ hintCount=Math.min(9,hintCount+1); shuffleCount=Math.min(15,shuffleCount+2); }
  saveGame();
  const mm=String(Math.floor(timeLeft/60)).padStart(2,"0"), ss=String(timeLeft%60).padStart(2,"0");
  $("lcKicker").textContent=`LEVEL ${String(level).padStart(2,"0")} COMPLETE`;
  $("lcTime").textContent=`${mm}:${ss}`;
  $("lcLevelScore").textContent=`${levelScore}${perfect?"  · PERFECT +5000":""}`;
  $("lcTotal").textContent=score;
  $("lcNextRule").textContent=`LV ${next} — ${ns.name}`;
  $("levelCompleteOverlay").classList.remove("hidden");
}
function startNextLevel(){
  $("levelCompleteOverlay").classList.add("hidden");
  level++; levelScore=0; comboCount=0; lastMatchAt=0; usedHintLvl=0; usedShuffLvl=0;
  currentStrategy=getStrategy(level);
  currentLevelTime=getLevelTime(level); timeLeft=currentLevelTime; timerWarned=false;
  configureBoardLayout();
  createBoard(); renderBoard(); syncHud();
  paused=false; gameStarted=true; saveGame(); startTimer();
  setStatus(`LV ${level} · ${currentStrategy.name}`);
}
function showGameOver(){
  clearInterval(timerId);
  paused=true; gameStarted=false; clearSel(); clearPath();
  $("goLevel").textContent=String(level).padStart(2,"0");
  $("goScore").textContent=score;
  if(!quickPlay) deleteSave(currentSetId);
  sfx.over(); bgm.pause();
  $("gameOverOverlay").classList.remove("hidden");
}
function pauseGame(){
  if(!gameStarted||paused) return;
  paused=true; clearInterval(timerId); clearSel(); clearPath(); saveGame();
  $("pauseOverlay").classList.remove("hidden");
}
function resumeGame(){
  if(!gameStarted||!paused) return;
  paused=false; $("pauseOverlay").classList.add("hidden"); startTimer(); resizeCanvas();
}
function quitToHome(){
  saveGame();
  clearInterval(timerId); gameStarted=false; paused=false;
  hideAllOverlays();
  bgm.pause(); bgm.currentTime=0;
  showScreen("startScreen");
  refreshStart();
}
function hideAllOverlays(){
  document.querySelectorAll(".overlay").forEach(o=>o.classList.add("hidden"));
}

/* ---------- START SCREEN ---------- */
function refreshStart(){
  let activeTileSetBtn=null;
  document.querySelectorAll(".tileset-btn").forEach(b=>{
    const isActive=b.dataset.set===currentSetId;
    b.classList.toggle("is-active", isActive);
    if(isActive) activeTileSetBtn=b;
    const id=b.dataset.set;
    const badge=b.querySelector(`[data-set-badge="${id}"]`);
    const s=loadSave(id);
    if(badge){
      if(s){ badge.textContent=`LV ${s.level}`; badge.dataset.state="saved"; }
      else { badge.textContent="NEW"; badge.dataset.state="new"; }
    }
  });
  if(activeTileSetBtn && typeof activeTileSetBtn.scrollIntoView === "function") {
    requestAnimationFrame(()=>{
      activeTileSetBtn.scrollIntoView({behavior:"smooth", inline:"center", block:"nearest"});
      updateTileSetCarousel();
    });
  } else {
    updateTileSetCarousel();
  }
  const save=loadSave(currentSetId);
  $("playLabel").textContent=save?"CONTINUE":"START GAME";
  const summary=$("saveSummary");
  const newBtn=$("newGameBtn");
  if(save){
    summary.hidden=false;
    newBtn?.classList.remove("is-hidden");
    $("saveLevel").textContent=`LV ${String(save.level).padStart(2,"0")}`;
    $("saveScore").textContent=`${save.score||0} pts`;
  }else{
    summary.hidden=true;
    newBtn?.classList.add("is-hidden");
  }
}

function updateTileSetCarousel(){
  const scroll=$("tileSetScroll");
  const carousel=scroll?.closest(".tileset-carousel");
  const prev=$("tileSetPrev"), next=$("tileSetNext");
  if(!scroll || !carousel) return;
  const max=Math.max(0, scroll.scrollWidth-scroll.clientWidth);
  const hasOverflow=max>8;
  carousel.classList.toggle("has-overflow", hasOverflow);
  if(prev) prev.disabled=!hasOverflow || scroll.scrollLeft<=4;
  if(next) next.disabled=!hasOverflow || scroll.scrollLeft>=max-4;
}
function scrollTileSets(dir){
  const scroll=$("tileSetScroll");
  if(!scroll) return;
  const amount=Math.max(160, Math.round(scroll.clientWidth*.72));
  scroll.scrollBy({left:dir*amount, behavior:"smooth"});
  setTimeout(updateTileSetCarousel, 260);
}

$("tileSetPrev")?.addEventListener("click",(e)=>{e.preventDefault();e.stopPropagation();scrollTileSets(-1);sfx.tap();});
$("tileSetNext")?.addEventListener("click",(e)=>{e.preventDefault();e.stopPropagation();scrollTileSets(1);sfx.tap();});
$("tileSetScroll")?.addEventListener("scroll",()=>requestAnimationFrame(updateTileSetCarousel),{passive:true});
window.addEventListener("resize",()=>requestAnimationFrame(updateTileSetCarousel));
window.addEventListener("orientationchange",()=>setTimeout(updateTileSetCarousel, 250));

document.querySelectorAll(".tileset-btn").forEach(btn=>{
  let lock=0;
  const press=(e)=>{
    e.preventDefault(); e.stopPropagation();
    const now=Date.now(); if(now-lock<200) return; lock=now;
    currentSetId=btn.dataset.set;
    try{localStorage.setItem(SET_KEY,currentSetId)}catch(e){}
    entities=spritesFor(currentSetId);
    sfx.tap();
    refreshStart();
    setTimeout(updateTileSetCarousel, 260);
  };
  btn.addEventListener("click",press);
});

$("playBtn").addEventListener("click",(e)=>{
  e.preventDefault();
  const save=loadSave(currentSetId);
  if(save) continueFromSave(); else startGame();
});
$("newGameBtn").addEventListener("click",(e)=>{
  e.preventDefault();
  const save=loadSave(currentSetId);
  if(save && !confirm(`Start a new ${SPRITE_SETS[currentSetId].name} game? Saved progress will be lost.`)) return;
  deleteSave(currentSetId);
  refreshStart();
  startGame();
});
$("quickGameBtn").addEventListener("click",(e)=>{
  e.preventDefault();
  startGame({quick:true});
});
$("settingsBtn")?.addEventListener("click",(e)=>{
  e.preventDefault();
  $("settingsOverlay").classList.remove("hidden");
  $("toggleSfx").classList.toggle("is-on",sfxOn);
  $("toggleBgm").classList.toggle("is-on",bgmOn);
});
$("settingsCloseBtn").addEventListener("click",(e)=>{
  e.preventDefault();
  $("settingsOverlay").classList.add("hidden");
});
$("toggleSfx").addEventListener("click",()=>{ sfxOn=!sfxOn; $("toggleSfx").classList.toggle("is-on",sfxOn); });
$("toggleBgm").addEventListener("click",()=>{ bgmOn=!bgmOn; bgm.muted=!bgmOn; $("toggleBgm").classList.toggle("is-on",bgmOn); if(bgmOn && gameStarted) bgm.play().catch(()=>{}); else bgm.pause(); });
/* GAME SCREEN BUTTONS */
$("hudBack").addEventListener("click",pauseGame);
$("hintBtn").addEventListener("click",doHint);
$("shuffleBtn").addEventListener("click",()=>shuffleTiles(true));
$("pauseBtn").addEventListener("click",pauseGame);
$("resumeBtn").addEventListener("click",resumeGame);
$("quitBtn").addEventListener("click",quitToHome);
$("nextLevelBtn").addEventListener("click",startNextLevel);
$("goRestartBtn").addEventListener("click",()=>{ $("gameOverOverlay").classList.add("hidden"); startGame(); });
$("goHomeBtn").addEventListener("click",()=>{ $("gameOverOverlay").classList.add("hidden"); quitToHome(); });

document.addEventListener("visibilitychange",()=>{
  if(document.hidden && gameStarted){
    clearInterval(timerId);
    if(!paused){
      paused=true;
      clearSel();
      clearPath();
    }
    saveGame();
  }else if(!document.hidden && gameStarted && paused){
    $("pauseOverlay").classList.remove("hidden");
    resizeCanvas();
  }
});
window.addEventListener("pagehide",()=>{ if(gameStarted) saveGame(); });

/* INIT */
refreshStart();

// Final visibility fix: make selected tile-set state and carousel state re-apply after cached restores / iOS page show.
window.addEventListener("pageshow",()=>{
  try{ refreshStart(); updateTileSetCarousel(); }catch(e){}
});
setTimeout(()=>{ try{ refreshStart(); updateTileSetCarousel(); }catch(e){} }, 100);
