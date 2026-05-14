const ROWS=9,COLS=16,TOTAL_TIME=480,MIN_TOTAL_TIME=360,TIMER_STEP_PER_LOOP=15,LEVEL_LOOP_SIZE=8,HINTS=5,SHUFFLES=10,MAX_HINTS=10,MAX_SHUFFLES=15;
const SAVE_KEY="pocketmatch_save_v1"; // legacy single-slot save key
const SAVES_KEY="pocketmatch_saves_v2";
const SPRITE_SET_KEY="pocketmatch_sprite_set_v1";
let audioCtx=null,muted=false,timerWarned=false;
let audioUnlocked=false;

/* iPhone / iPad audio fix:
   iOS can keep WebAudio suspended until it is resumed inside a real
   touch/pointer gesture.  We unlock the AudioContext on the earliest
   gesture, then SFX calls can run normally from click handlers. */
function audio(){
  if(!audioCtx){
    audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  }
  return audioCtx;
}

function warmAudio(ac){
  if(audioUnlocked || !ac)return;
  try{
    const o=ac.createOscillator();
    const g=ac.createGain();
    g.gain.setValueAtTime(0.00001,ac.currentTime);
    o.connect(g);g.connect(ac.destination);
    o.start(ac.currentTime);
    o.stop(ac.currentTime+0.01);
    audioUnlocked=true;
  }catch(e){}
}

function unlockAudio(){
  try{
    const ac=audio();
    const ready=()=>warmAudio(ac);
    if(ac.state==="suspended"){
      ac.resume().then(ready).catch(ready);
    }else{
      ready();
    }
  }catch(e){}
}

["touchstart","pointerdown","mousedown","keydown","click"].forEach(type=>{
  document.addEventListener(type,unlockAudio,{capture:true,passive:true});
});

function withAudio(run){
  if(muted)return;
  let ac;
  try{ac=audio()}catch(e){return}
  const play=()=>{try{warmAudio(ac);run(ac)}catch(e){}};
  if(ac.state==="suspended"){
    ac.resume().then(play).catch(play);
  }else{
    play();
  }
}

function tone(freq,dur=.08,type="square",vol=.06,delay=0){
  withAudio(ac=>{
    let o=ac.createOscillator(),g=ac.createGain();
    const t=ac.currentTime+delay;
    o.type=type;
    o.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(vol,t+.01);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g);g.connect(ac.destination);
    o.start(t);
    o.stop(t+dur+.02);
  });
}

function noise(dur=.10,vol=.04,delay=0){
  withAudio(ac=>{
    let buf=ac.createBuffer(1,Math.max(1,Math.floor(ac.sampleRate*dur)),ac.sampleRate),
        data=buf.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
    let src=ac.createBufferSource(),g=ac.createGain();
    const t=ac.currentTime+delay;
    src.buffer=buf;
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    src.connect(g);g.connect(ac.destination);
    src.start(t);
  });
}
const sfx={
  select(){tone(440,.045,"square",.035);tone(660,.035,"square",.025,.035)},
  match(){tone(523,.07,"square",.05);tone(659,.07,"square",.05,.06);tone(784,.09,"square",.055,.12);tone(1175,.12,"triangle",.035,.18);noise(.12,.025,.04)},
  invalid(){tone(160,.12,"sawtooth",.045);tone(110,.10,"sawtooth",.035,.08)},
  shuffle(){noise(.18,.05);tone(300,.05,"square",.035);tone(420,.05,"square",.035,.08);tone(540,.05,"square",.035,.16)},
  hint(){tone(880,.05,"triangle",.035);tone(1320,.06,"triangle",.030,.07);tone(1760,.06,"triangle",.025,.14)},
  warn(){tone(880,.08,"square",.045);tone(880,.08,"square",.045,.16)},
  level(){tone(392,.08,"square",.04);tone(523,.08,"square",.04,.08);tone(659,.08,"square",.04,.16);tone(784,.16,"square",.05,.24)},
  save(){tone(660,.06,"square",.04);tone(880,.08,"square",.035,.08);tone(1100,.10,"triangle",.025,.16)},
  timeup(){tone(220,.16,"sawtooth",.05);tone(196,.16,"sawtooth",.045,.18);tone(164,.25,"sawtooth",.04,.36)}
};

// ─────────────────────────────────────────────
//  THEME SYSTEM
// ─────────────────────────────────────────────
const THEMES=[
  {id:"arcade",   name:"NEON ARCADE"},
  {id:"ocean",    name:"DEEP OCEAN"},
  {id:"obsidian", name:"OBSIDIAN GOLD"},
  {id:"cyber",    name:"CYBER SLATE"},
  {id:"amethyst", name:"VOID AMETHYST"}
];
let currentTheme="arcade";

function pathColors(){
  const s=getComputedStyle(document.documentElement);
  return{
    halo:s.getPropertyValue("--path-halo").trim(),
    line:s.getPropertyValue("--path-line").trim(),
    core:s.getPropertyValue("--path-core").trim()
  }
}

function applyTheme(id){
  currentTheme=id;
  if(id==="arcade")document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme",id);
  document.querySelectorAll(".theme-option").forEach(el=>el.classList.toggle("active",el.dataset.theme===id));
}

function toggleThemePicker(){$("themePicker").classList.toggle("hidden")}

document.addEventListener("click",e=>{
  const picker=$("themePicker"),btn=$("themeBtn");
  if(!picker.contains(e.target)&&e.target!==btn)picker.classList.add("hidden");
});

// ─────────────────────────────────────────────
//  MOVEMENT STRATEGIES
//  8-level loop:
//  1=NORMAL, 2=BOTTOM, 3=TOP, 4=LEFT,
//  5=RIGHT, 6=LEFT+RIGHT, 7=TOP+BOTTOM,
//  8=RANDOM, then repeats from NORMAL.
// ─────────────────────────────────────────────
const STRATEGIES=[
  {id:0,name:"NORMAL",     label:"No movement"},
  {id:1,name:"BOTTOM",     label:"Fall to bottom"},
  {id:2,name:"TOP",        label:"Rise to top"},
  {id:3,name:"LEFT",       label:"Slide to left"},
  {id:4,name:"RIGHT",      label:"Slide to right"},
  {id:5,name:"LEFT+RIGHT", label:"Push left/right halves outward"},
  {id:6,name:"TOP+BOTTOM", label:"Push top/bottom sections outward"},
  {id:7,name:"RANDOM",     label:"Random movement after each match"}
];
const RANDOM_MOVEMENT_IDS=[1,2,3,4,5,6];

function getStrategy(lvl){
  return STRATEGIES[(Math.max(1,lvl)-1)%LEVEL_LOOP_SIZE];
}

function applyMovement(strategy){
  const id=strategy.id;
  if(id===0)return;
  if(id===7){
    const randomId=RANDOM_MOVEMENT_IDS[Math.floor(Math.random()*RANDOM_MOVEMENT_IDS.length)];
    const randomStrategy=STRATEGIES.find(s=>s.id===randomId)||STRATEGIES[0];
    applyMovement(randomStrategy);
    return;
  }
  function compactLine(cells,dir){
    let active=cells.filter(c=>!c.removed),empty=cells.filter(c=>c.removed);
    return dir===1?[...empty,...active]:[...active,...empty];
  }
  function applyVertical(dir){
    for(let c=0;c<COLS;c++){
      let col=board.map(row=>row[c]),comp=compactLine(col,dir);
      for(let r=0;r<ROWS;r++)board[r][c]=comp[r];
    }
  }
  function applyHorizontal(dir){
    for(let r=0;r<ROWS;r++)board[r]=compactLine(board[r],dir)
  }
  function applyLeftRight(){
    const mid=Math.floor(COLS/2);
    for(let r=0;r<ROWS;r++){
      const left=board[r].slice(0,mid);
      const right=board[r].slice(mid);
      board[r]=[...compactLine(left,0),...compactLine(right,1)];
    }
  }
  function applyTopBottom(){
    const mid=Math.floor(ROWS/2); // 9 rows => row index 4 is the neutral center row
    for(let c=0;c<COLS;c++){
      const top=[];
      const bottom=[];
      for(let r=0;r<mid;r++)top.push(board[r][c]);
      const center=board[mid][c];
      for(let r=mid+1;r<ROWS;r++)bottom.push(board[r][c]);
      const newTop=compactLine(top,0);      // rows 1–4 move TOP
      const newBottom=compactLine(bottom,1); // rows 6–9 move BOTTOM
      for(let r=0;r<mid;r++)board[r][c]=newTop[r];
      board[mid][c]=center;                // row 5 stays as neutral center row
      for(let r=mid+1;r<ROWS;r++)board[r][c]=newBottom[r-(mid+1)];
    }
  }
  if(id===1)applyVertical(1);
  else if(id===2)applyVertical(0);
  else if(id===3)applyHorizontal(0);
  else if(id===4)applyHorizontal(1);
  else if(id===5)applyLeftRight();
  else if(id===6)applyTopBottom();
}

// ─────────────────────────────────────────────
//  SPRITES & ENTITIES
// ─────────────────────────────────────────────
const SPRITES=[
  {id:1,n:"Character 01",img:"assets/sprites/original/01-character-01.png"},
  {id:2,n:"Character 02",img:"assets/sprites/original/02-character-02.png"},
  {id:3,n:"Character 03",img:"assets/sprites/original/03-character-03.png"},
  {id:4,n:"Character 04",img:"assets/sprites/original/04-character-04.png"},
  {id:5,n:"Character 05",img:"assets/sprites/original/05-character-05.png"},
  {id:6,n:"Character 06",img:"assets/sprites/original/06-character-06.png"},
  {id:7,n:"Character 07",img:"assets/sprites/original/07-character-07.png"},
  {id:8,n:"Character 08",img:"assets/sprites/original/08-character-08.png"},
  {id:9,n:"Character 09",img:"assets/sprites/original/09-character-09.png"},
  {id:10,n:"Character 10",img:"assets/sprites/original/10-character-10.png"},
  {id:11,n:"Character 11",img:"assets/sprites/original/11-character-11.png"},
  {id:12,n:"Character 12",img:"assets/sprites/original/12-character-12.png"},
  {id:13,n:"Character 13",img:"assets/sprites/original/13-character-13.png"},
  {id:14,n:"Character 14",img:"assets/sprites/original/14-character-14.png"},
  {id:15,n:"Character 15",img:"assets/sprites/original/15-character-15.png"},
  {id:16,n:"Character 16",img:"assets/sprites/original/16-character-16.png"},
  {id:17,n:"Character 17",img:"assets/sprites/original/17-character-17.png"},
  {id:18,n:"Character 18",img:"assets/sprites/original/18-character-18.png"},
  {id:19,n:"Character 19",img:"assets/sprites/original/19-character-19.png"},
  {id:20,n:"Character 20",img:"assets/sprites/original/20-character-20.png"},
  {id:21,n:"Character 21",img:"assets/sprites/original/21-character-21.png"},
  {id:22,n:"Character 22",img:"assets/sprites/original/22-character-22.png"},
  {id:23,n:"Character 23",img:"assets/sprites/original/23-character-23.png"},
  {id:24,n:"Character 24",img:"assets/sprites/original/24-character-24.png"},
  {id:25,n:"Character 25",img:"assets/sprites/original/25-character-25.png"},
  {id:26,n:"Character 26",img:"assets/sprites/original/26-character-26.png"},
  {id:27,n:"Character 27",img:"assets/sprites/original/27-character-27.png"},
  {id:28,n:"Character 28",img:"assets/sprites/original/28-character-28.png"},
  {id:29,n:"Character 29",img:"assets/sprites/original/29-character-29.png"},
  {id:30,n:"Character 30",img:"assets/sprites/original/30-character-30.png"},
];
const GADGET_SPRITES=[{"id":1,"n":"Air Purifier","img":"assets/sprites/gadgets/01-air-purifier.png"},{"id":2,"n":"CCTV","img":"assets/sprites/gadgets/02-cctv.png"},{"id":3,"n":"CPU","img":"assets/sprites/gadgets/03-cpu.png"},{"id":4,"n":"Camera","img":"assets/sprites/gadgets/04-camera.png"},{"id":5,"n":"Desktop Speakers","img":"assets/sprites/gadgets/05-desktop-speakers.png"},{"id":6,"n":"Docking","img":"assets/sprites/gadgets/06-docking.png"},{"id":7,"n":"Drone","img":"assets/sprites/gadgets/07-drone.png"},{"id":8,"n":"Earbuds","img":"assets/sprites/gadgets/08-earbuds.png"},{"id":9,"n":"Floppy","img":"assets/sprites/gadgets/09-floppy.png"},{"id":10,"n":"GPU","img":"assets/sprites/gadgets/10-gpu.png"},{"id":11,"n":"Game Console 1","img":"assets/sprites/gadgets/11-game-console-1.png"},{"id":12,"n":"Game Console 2","img":"assets/sprites/gadgets/12-game-console-2.png"},{"id":13,"n":"Game Controller","img":"assets/sprites/gadgets/13-game-controller.png"},{"id":14,"n":"Headset","img":"assets/sprites/gadgets/14-headset.png"},{"id":15,"n":"Joystick","img":"assets/sprites/gadgets/15-joystick.png"},{"id":16,"n":"Keyboard","img":"assets/sprites/gadgets/16-keyboard.png"},{"id":17,"n":"Laptop","img":"assets/sprites/gadgets/17-laptop.png"},{"id":18,"n":"Mobile Phone 1","img":"assets/sprites/gadgets/18-mobile-phone-1.png"},{"id":19,"n":"Mobile Phone 2","img":"assets/sprites/gadgets/19-mobile-phone-2.png"},{"id":20,"n":"Monitor","img":"assets/sprites/gadgets/20-monitor.png"},{"id":21,"n":"Photo Frame","img":"assets/sprites/gadgets/21-photo-frame.png"},{"id":22,"n":"Powerbank","img":"assets/sprites/gadgets/22-powerbank.png"},{"id":23,"n":"Projector","img":"assets/sprites/gadgets/23-projector.png"},{"id":24,"n":"SD Card","img":"assets/sprites/gadgets/24-sd-card.png"},{"id":25,"n":"Smart Watch","img":"assets/sprites/gadgets/25-smart-watch.png"},{"id":26,"n":"Speaker","img":"assets/sprites/gadgets/26-speaker.png"},{"id":27,"n":"Tablet","img":"assets/sprites/gadgets/27-tablet.png"},{"id":28,"n":"Turntable","img":"assets/sprites/gadgets/28-turntable.png"},{"id":29,"n":"VR","img":"assets/sprites/gadgets/29-vr.png"},{"id":30,"n":"Widescreen","img":"assets/sprites/gadgets/30-widescreen.png"}];
const SPORTS_SPRITES=[{"id":1,"n":"American Football Helmet","img":"assets/sprites/sports/01-american-football-helmet.png"},{"id":2,"n":"American Football","img":"assets/sprites/sports/02-american-football.png"},{"id":3,"n":"Analog Timer","img":"assets/sprites/sports/03-analog-timer.png"},{"id":4,"n":"Basketball","img":"assets/sprites/sports/04-basketball.png"},{"id":5,"n":"Bicycle","img":"assets/sprites/sports/05-bicycle.png"},{"id":6,"n":"Bowling Pins","img":"assets/sprites/sports/06-bowling-pins.png"},{"id":7,"n":"Bowling","img":"assets/sprites/sports/07-bowling.png"},{"id":8,"n":"Boxing","img":"assets/sprites/sports/08-boxing.png"},{"id":9,"n":"Dart Board","img":"assets/sprites/sports/09-dart-board.png"},{"id":10,"n":"Dumbbell","img":"assets/sprites/sports/10-dumbbell.png"},{"id":11,"n":"F1","img":"assets/sprites/sports/11-f1.png"},{"id":12,"n":"Football Shoe","img":"assets/sprites/sports/12-football-shoe.png"},{"id":13,"n":"Football","img":"assets/sprites/sports/13-football.png"},{"id":14,"n":"Golf","img":"assets/sprites/sports/14-golf.png"},{"id":15,"n":"Kayak","img":"assets/sprites/sports/15-kayak.png"},{"id":16,"n":"Motorcross Bike","img":"assets/sprites/sports/16-motorcross-bike.png"},{"id":17,"n":"Parachute","img":"assets/sprites/sports/17-parachute.png"},{"id":18,"n":"Ping Pong","img":"assets/sprites/sports/18-ping-pong.png"},{"id":19,"n":"Podium","img":"assets/sprites/sports/19-podium.png"},{"id":20,"n":"Pommel Horse","img":"assets/sprites/sports/20-pommel-horse.png"},{"id":21,"n":"Rollerskate","img":"assets/sprites/sports/21-rollerskate.png"},{"id":22,"n":"Sailboat","img":"assets/sprites/sports/22-sailboat.png"},{"id":23,"n":"Scoreboard","img":"assets/sprites/sports/23-scoreboard.png"},{"id":24,"n":"Scuba Goggles","img":"assets/sprites/sports/24-scuba-goggles.png"},{"id":25,"n":"Shuttlecock","img":"assets/sprites/sports/25-shuttlecock.png"},{"id":26,"n":"Stadium","img":"assets/sprites/sports/26-stadium.png"},{"id":27,"n":"Tennis","img":"assets/sprites/sports/27-tennis.png"},{"id":28,"n":"Timer","img":"assets/sprites/sports/28-timer.png"},{"id":29,"n":"Trophy","img":"assets/sprites/sports/29-trophy.png"},{"id":30,"n":"Volleyball","img":"assets/sprites/sports/30-volleyball.png"}];
const HOME_SPRITES=[{"id":1,"n":"Air Fryer","img":"assets/sprites/home/01-air-fryer.png"},{"id":2,"n":"Bath Tub","img":"assets/sprites/home/02-bath-tub.png"},{"id":3,"n":"Bed","img":"assets/sprites/home/03-bed.png"},{"id":4,"n":"Bluetooth Speaker","img":"assets/sprites/home/04-bluetooth-speaker.png"},{"id":5,"n":"Bookshelf","img":"assets/sprites/home/05-bookshelf.png"},{"id":6,"n":"Bunk Bed","img":"assets/sprites/home/06-bunk-bed.png"},{"id":7,"n":"Chandelier","img":"assets/sprites/home/07-chandelier.png"},{"id":8,"n":"Clock","img":"assets/sprites/home/08-clock.png"},{"id":9,"n":"Cloth Rack","img":"assets/sprites/home/09-cloth-rack.png"},{"id":10,"n":"Curtain","img":"assets/sprites/home/10-curtain.png"},{"id":11,"n":"Dining Chair","img":"assets/sprites/home/11-dining-chair.png"},{"id":12,"n":"Fan","img":"assets/sprites/home/12-fan.png"},{"id":13,"n":"Fridge","img":"assets/sprites/home/13-fridge.png"},{"id":14,"n":"Hair Dryer","img":"assets/sprites/home/14-hair-dryer.png"},{"id":15,"n":"Lounge Chair","img":"assets/sprites/home/15-lounge-chair.png"},{"id":16,"n":"Microwave","img":"assets/sprites/home/16-microwave.png"},{"id":17,"n":"PC","img":"assets/sprites/home/17-pc.png"},{"id":18,"n":"Phone","img":"assets/sprites/home/18-phone.png"},{"id":19,"n":"Radio","img":"assets/sprites/home/19-radio.png"},{"id":20,"n":"Sewing Machine","img":"assets/sprites/home/20-sewing-machine.png"},{"id":21,"n":"Sink","img":"assets/sprites/home/21-sink.png"},{"id":22,"n":"Sofa","img":"assets/sprites/home/22-sofa.png"},{"id":23,"n":"Stereo","img":"assets/sprites/home/23-stereo.png"},{"id":24,"n":"Stove","img":"assets/sprites/home/24-stove.png"},{"id":25,"n":"Toaster","img":"assets/sprites/home/25-toaster.png"},{"id":26,"n":"TV","img":"assets/sprites/home/26-tv.png"},{"id":27,"n":"Vacuum Cleaner","img":"assets/sprites/home/27-vacuum-cleaner.png"},{"id":28,"n":"Vase","img":"assets/sprites/home/28-vase.png"},{"id":29,"n":"Wardrobe","img":"assets/sprites/home/29-wardrobe.png"},{"id":30,"n":"Washing Machine","img":"assets/sprites/home/30-washing-machine.png"}];
const LANDMARK_SPRITES=[{"id":1,"n":"Acropolis of Athens","img":"assets/sprites/landmarks/01-acropolis-of-athens.png"},{"id":2,"n":"Big Ben","img":"assets/sprites/landmarks/02-big-ben.png"},{"id":3,"n":"Christ the Redeemer","img":"assets/sprites/landmarks/03-christ-the-redeemer.png"},{"id":4,"n":"Colosseum","img":"assets/sprites/landmarks/04-colosseum.png"},{"id":5,"n":"Eiffel Tower","img":"assets/sprites/landmarks/05-eiffel-tower.png"},{"id":6,"n":"Golden Gate Bridge","img":"assets/sprites/landmarks/06-golden-gate-bridge.png"},{"id":7,"n":"Grand Palace","img":"assets/sprites/landmarks/07-grand-palace.png"},{"id":8,"n":"Great Pyramid of Giza","img":"assets/sprites/landmarks/08-great-pyramid-of-giza.png"},{"id":9,"n":"Great Wall of China","img":"assets/sprites/landmarks/09-great-wall-of-china.png"},{"id":10,"n":"Kinderdijk Windmill","img":"assets/sprites/landmarks/10-kinderdijk-windmill.png"},{"id":11,"n":"Las Vegas","img":"assets/sprites/landmarks/11-las-vegas.png"},{"id":12,"n":"Leaning Tower of Pisa","img":"assets/sprites/landmarks/12-leaning-tower-of-pisa.png"},{"id":13,"n":"Louvre Museum","img":"assets/sprites/landmarks/13-louvre-museum.png"},{"id":14,"n":"Marina Bay Sands","img":"assets/sprites/landmarks/14-marina-bay-sands.png"},{"id":15,"n":"Merlion","img":"assets/sprites/landmarks/15-merlion.png"},{"id":16,"n":"Mount Fuji","img":"assets/sprites/landmarks/16-mount-fuji.png"},{"id":17,"n":"Mount Rushmore","img":"assets/sprites/landmarks/17-mount-rushmore.png"},{"id":18,"n":"Neuschwanstein Castle","img":"assets/sprites/landmarks/18-neuschwanstein-castle.png"},{"id":19,"n":"Palm Jumeirah","img":"assets/sprites/landmarks/19-palm-jumeirah.png"},{"id":20,"n":"Sheikh Zayed Grand Mosque","img":"assets/sprites/landmarks/20-sheikh-zayed-grand-mosque.png"},{"id":21,"n":"St. Peter's Basilica","img":"assets/sprites/landmarks/21-st-peter-s-basilica.png"},{"id":22,"n":"Statue of Liberty","img":"assets/sprites/landmarks/22-statue-of-liberty.png"},{"id":23,"n":"Stonehenge","img":"assets/sprites/landmarks/23-stonehenge.png"},{"id":24,"n":"Swiss Alps","img":"assets/sprites/landmarks/24-swiss-alps.png"},{"id":25,"n":"Sydney Harbour Bridge","img":"assets/sprites/landmarks/25-sydney-harbour-bridge.png"},{"id":26,"n":"Sydney Opera House","img":"assets/sprites/landmarks/26-sydney-opera-house.png"},{"id":27,"n":"Taj Mahal","img":"assets/sprites/landmarks/27-taj-mahal.png"},{"id":28,"n":"The United States Capitol","img":"assets/sprites/landmarks/28-the-united-states-capitol.png"},{"id":29,"n":"Tower Bridge","img":"assets/sprites/landmarks/29-tower-bridge.png"},{"id":30,"n":"White House","img":"assets/sprites/landmarks/30-white-house.png"}];
const SPRITE_SETS={
  original:{name:"POKÉMON",label:"Pokémon sprites",sprites:SPRITES,scale:0.85},
  foodies:{name:"FOODIES",label:"Optimized food sprites",sprites:[{"id":1,"n":"Beer","img":"assets/sprites/foodies/01-beer.png"},{"id":2,"n":"Bento","img":"assets/sprites/foodies/02-bento.png"},{"id":3,"n":"Boba Milk Tea","img":"assets/sprites/foodies/03-boba-milk-tea.png"},{"id":4,"n":"Burger","img":"assets/sprites/foodies/04-burger.png"},{"id":5,"n":"Cheese","img":"assets/sprites/foodies/05-cheese.png"},{"id":6,"n":"Chocolate Bar","img":"assets/sprites/foodies/06-chocolate-bar.png"},{"id":7,"n":"Coffee","img":"assets/sprites/foodies/07-coffee.png"},{"id":8,"n":"Cupcake","img":"assets/sprites/foodies/08-cupcake.png"},{"id":9,"n":"Custard","img":"assets/sprites/foodies/09-custard.png"},{"id":10,"n":"Donut","img":"assets/sprites/foodies/10-donut.png"},{"id":11,"n":"French Fries","img":"assets/sprites/foodies/11-french-fries.png"},{"id":12,"n":"Grape","img":"assets/sprites/foodies/12-grape.png"},{"id":13,"n":"Hotdog","img":"assets/sprites/foodies/13-hotdog.png"},{"id":14,"n":"Ice Cream","img":"assets/sprites/foodies/14-ice-cream.png"},{"id":15,"n":"Lollipop","img":"assets/sprites/foodies/15-lollipop.png"},{"id":16,"n":"Macaron","img":"assets/sprites/foodies/16-macaron.png"},{"id":17,"n":"Milk","img":"assets/sprites/foodies/17-milk.png"},{"id":18,"n":"Orange","img":"assets/sprites/foodies/18-orange.png"},{"id":19,"n":"Pizza","img":"assets/sprites/foodies/19-pizza.png"},{"id":20,"n":"Popcorn","img":"assets/sprites/foodies/20-popcorn.png"},{"id":21,"n":"Ramen","img":"assets/sprites/foodies/21-ramen.png"},{"id":22,"n":"Sandwich","img":"assets/sprites/foodies/22-sandwich.png"},{"id":23,"n":"Soda","img":"assets/sprites/foodies/23-soda.png"},{"id":24,"n":"Strawberry","img":"assets/sprites/foodies/24-strawberry.png"},{"id":25,"n":"Sushi","img":"assets/sprites/foodies/25-sushi.png"},{"id":26,"n":"Taco","img":"assets/sprites/foodies/26-taco.png"},{"id":27,"n":"Waffle","img":"assets/sprites/foodies/27-waffle.png"},{"id":28,"n":"Watermelon","img":"assets/sprites/foodies/28-watermelon.png"},{"id":29,"n":"Apple","img":"assets/sprites/foodies/29-apple.png"},{"id":30,"n":"Banana","img":"assets/sprites/foodies/30-banana.png"}],scale:1},
  gadgets:{name:"GADGETS",label:"Optimized gadget sprites",sprites:GADGET_SPRITES,scale:1},
  sports:{name:"SPORTS",label:"Optimized sports sprites",sprites:SPORTS_SPRITES,scale:1.24},
  home:{name:"HOME",label:"Home sprites",sprites:HOME_SPRITES,scale:1},
  landmarks:{name:"LANDMARKS",label:"World landmark sprites",sprites:LANDMARK_SPRITES,scale:1}

};
let currentSpriteSetId=determineInitialSpriteSet();
let entities=[];

function buildEntities(setId){
  const set=SPRITE_SETS[setId]||SPRITE_SETS.original;
  return set.sprites.map(e=>({id:e.id,name:e.n,img:e.img,scale:e.scale||set.scale||0.85}));
}

function applySpriteSet(setId,opts={}){
  currentSpriteSetId=SPRITE_SETS[setId]?setId:"original";
  entities=buildEntities(currentSpriteSetId);
  try{localStorage.setItem(SPRITE_SET_KEY,currentSpriteSetId)}catch(e){}
  document.querySelectorAll(".sprite-option").forEach(el=>el.classList.toggle("active",el.dataset.set===currentSpriteSetId));
  updateBoardInfo();
  if(typeof refreshStartScreen==="function")refreshStartScreen();
  if(typeof updateSpriteCarouselDots==="function")updateSpriteCarouselDots();
  if(typeof centerSpriteCarouselOn==="function" && !opts.fromCarousel && document.getElementById("spriteOptions")?.dataset.carouselReady==="1"){
    centerSpriteCarouselOn(currentSpriteSetId,true);
  }
}

function randomSpriteSetId(excludeId=null){
  const ids=Object.keys(SPRITE_SETS);
  const pool=ids.length>1?ids.filter(id=>id!==excludeId):ids;
  return pool[Math.floor(Math.random()*pool.length)]||ids[0]||"original";
}

function applyQuickGameRandomSet(){
  if(!isQuickGame)return currentSpriteSetId;
  const nextSet=randomSpriteSetId(currentSpriteSetId);
  applySpriteSet(nextSet);
  return nextSet;
}

// Sprite set is applied after DOM refs are ready.

// ─────────────────────────────────────────────
//  DOM REFS & STATE
// ─────────────────────────────────────────────
const $=id=>document.getElementById(id);
const boardEl=$("board"),canvas=$("pathCanvas"),ctx=canvas.getContext("2d");
const overlay=$("overlay"),pauseOverlay=$("pauseOverlay"),levelCompleteOverlay=$("levelCompleteOverlay"),gameOverOverlay=$("gameOverOverlay");
const saveOverlay=$("saveOverlay");
let saveOverlayAction="none";
const appShell=document.querySelector(".app-shell");
const levelEl=$("level"),scoreEl=$("score"),timerText=$("timerText"),timerBar=$("timerBar"),boardTimerBar=$("boardTimerBar");
const hintCountEl=$("hintCount"),shuffleCountEl=$("shuffleCount"),moveStatus=$("moveStatus");
const boardInfoEl=$("boardInfo");
const ruleTagEl=$("ruleTag");

let board=[],selected=null,score=0,levelScore=0,timeLeft=TOTAL_TIME,levelTotalTime=TOTAL_TIME;
let timerId=null,hintCount=HINTS,shuffleCount=SHUFFLES,level=1,paused=false,gameStarted=false;
let comboCount=0,lastMatchAt=0,bestCombo=0,usedHintLvl=0,usedShuffLvl=0;
const COMBO_WINDOW_MS=5000;
const COMBO_POINTS=[100,150,200,300,400,500];
const TIME_BONUS_PER_SECOND=50;
const PERFECT_BONUS=5000;
let isQuickGame=false,currentSaveSlotId=null;
let currentStrategy=STRATEGIES[0];

function getLevelTime(lvl){
  const reduction=Math.floor((Math.max(1,lvl)-1)/LEVEL_LOOP_SIZE)*TIMER_STEP_PER_LOOP;
  return Math.max(MIN_TOTAL_TIME,TOTAL_TIME-reduction);
}

function formatScore(value){
  return Number(value||0).toLocaleString('en-US');
}
function setScoreDisplay(){
  if(scoreEl)scoreEl.textContent=formatScore(score);
}

function formatHelperCount(n){return String(Math.max(0,n)).padStart(2,"0")}
function updateHelperDisplay(){
  hintCountEl.textContent=formatHelperCount(hintCount);
  shuffleCountEl.textContent=formatHelperCount(shuffleCount);
}
function refillHelpersAfterClearedLevel(clearedLevel){
  if(clearedLevel>0 && clearedLevel%3===0){
    hintCount=Math.min(MAX_HINTS,hintCount+1);
    shuffleCount=Math.min(MAX_SHUFFLES,shuffleCount+2);
    updateHelperDisplay();
    return true;
  }
  return false;
}
applySpriteSet(currentSpriteSetId);
let bgm=new Audio("assets/audio/background-music.mp3");bgm.loop=true;bgm.volume=.4;
const uiAudio={
  levelComplete:new Audio("assets/audio/level-complete.wav"),
  gameOver:new Audio("assets/audio/game-over.wav")
};
uiAudio.levelComplete.volume=.65;
uiAudio.gameOver.volume=.60;
function playUiAudio(name){
  if(muted)return;
  const a=uiAudio[name];
  if(!a)return;
  try{
    a.pause();
    a.currentTime=0;
    a.muted=muted;
    a.play().catch(()=>{});
  }catch(e){}
}

// ─────────────────────────────────────────────
//  SAVE / LOAD
// ─────────────────────────────────────────────
function serializeBoard(){
  // Store only entity id + removed flag per cell
  return board.map(row=>row.map(cell=>({id:cell.entity.id,removed:cell.removed})));
}

function deserializeBoard(data){
  return data.map(row=>row.map(cell=>{
    const entity=entities.find(e=>e.id===cell.id)||entities[0];
    return{entity,removed:cell.removed};
  }));
}

function loadAllSaves(){
  try{
    const raw=localStorage.getItem(SAVES_KEY);
    const parsed=raw?JSON.parse(raw):{};
    return parsed&&typeof parsed==="object"?parsed:{};
  }catch(e){return {}}
}

function saveAllSaves(saves){
  try{localStorage.setItem(SAVES_KEY,JSON.stringify(saves));return true}catch(e){return false}
}

function migrateLegacySave(){
  try{
    if(localStorage.getItem(SAVES_KEY))return;
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw)return;
    const old=JSON.parse(raw);
    if(!old||!old.board)return;
    const slot=SPRITE_SETS[old.spriteSet]?old.spriteSet:"original";
    const saves={};
    saves[slot]={...old,version:2,spriteSet:slot,ts:old.ts||Date.now()};
    saveAllSaves(saves);
  }catch(e){}
}

function getLatestSavedSetId(){
  const saves=loadAllSaves();
  let latestId=null,latestTs=-1;
  Object.keys(SPRITE_SETS).forEach(id=>{
    const s=saves[id];
    if(s&&s.ts&&s.ts>latestTs){latestTs=s.ts;latestId=id}
  });
  return latestId;
}

function determineInitialSpriteSet(){
  migrateLegacySave();
  const latest=getLatestSavedSetId();
  if(latest)return latest;
  const stored=localStorage.getItem(SPRITE_SET_KEY)||"original";
  return SPRITE_SETS[stored]?stored:"original";
}

function getSaveForSet(setId=currentSpriteSetId){
  const saves=loadAllSaves();
  const save=saves[setId];
  return save&&save.board?save:null;
}

function saveGame(){
  if(isQuickGame)return false;
  const slot=SPRITE_SETS[currentSaveSlotId]?currentSaveSlotId:currentSpriteSetId;
  const save={
    version:2,
    ts:Date.now(),
    level,score,levelScore,timeLeft,levelTotalTime,hintCount,shuffleCount,
    comboCount,lastMatchAt,bestCombo,usedHintLvl,usedShuffLvl,
    strategyId:currentStrategy.id,
    theme:currentTheme,
    spriteSet:slot,
    board:serializeBoard()
  };
  const saves=loadAllSaves();
  saves[slot]=save;
  return saveAllSaves(saves);
}

function loadSave(setId=currentSpriteSetId){
  return getSaveForSet(setId);
}

function deleteSave(setId=currentSpriteSetId){
  const saves=loadAllSaves();
  delete saves[setId];
  saveAllSaves(saves);
}

function formatSaveDate(ts){
  const d=new Date(ts);
  const dd=String(d.getDate()).padStart(2,"0");
  const mm=String(d.getMonth()+1).padStart(2,"0");
  const hh=String(d.getHours()).padStart(2,"0");
  const min=String(d.getMinutes()).padStart(2,"0");
  return`${dd}/${mm} ${hh}:${min}`;
}

function refreshSpriteSavePills(){
  const saves=loadAllSaves();
  document.querySelectorAll(".sprite-option").forEach(el=>{
    const id=el.dataset.set;
    const pill=el.querySelector(".sprite-save-pill");
    const save=saves[id];
    if(!pill)return;
    if(save){
      pill.textContent=`LV ${String(save.level).padStart(2,"0")}`;
      pill.classList.remove("new");
      pill.classList.add("saved");
    }else{
      pill.textContent="NEW";
      pill.classList.remove("saved");
      pill.classList.add("new");
    }
  });
}

function refreshSaveSlot(){
  const save=loadSave(currentSpriteSetId);
  const slot=$("savedSlot");
  const resumeBtn=$("continueFromSaveBtn");
  const deleteBtn=$("deleteSaveBtn");
  const setName=(SPRITE_SETS[currentSpriteSetId]||SPRITE_SETS.original).name;
  refreshSpriteSavePills();
  if(!save){
    if(slot)slot.classList.remove("hidden");
    if(resumeBtn){resumeBtn.disabled=true;resumeBtn.classList.add("disabled");}
    if(deleteBtn)deleteBtn.classList.add("hidden");
    $("saveLevel").textContent=`${setName}`;
    $("saveScore").textContent="No saved game";
    $("saveDate").textContent="—";
    return;
  }
  if(slot)slot.classList.remove("hidden");
  if(resumeBtn){resumeBtn.disabled=false;resumeBtn.classList.remove("disabled");}
  if(deleteBtn)deleteBtn.classList.remove("hidden");
  $("saveLevel").textContent=`${setName} · LV ${String(save.level).padStart(2,"0")}`;
  $("saveScore").textContent=`${formatScore(save.score)} pts`;
  $("saveDate").textContent=formatSaveDate(save.ts);
}

function refreshStartScreen(){
  refreshSaveSlot();
}

function returnToTitleAfterSave(){
  gameStarted=false;
  paused=false;
  clearInterval(timerId);
  bgm.pause();bgm.currentTime=0;
  pauseOverlay.classList.add("hidden");
  levelCompleteOverlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
  $("endQuickConfirmOverlay")?.classList.add("hidden");
  $("helperMessageOverlay")?.classList.add("hidden");
  appShell.classList.remove("paused");
  document.body.classList.remove("low-time");
  overlay.classList.remove("hidden");
  refreshSaveSlot();
}

function triggerSave(fromPause=false){
  const ok=saveGame();
  sfx.save();
  saveOverlayAction=fromPause?"quit":"continue";
  saveOverlay.dataset.action=saveOverlayAction;
  $("saveMsg").textContent=isQuickGame
    ?"Quick Game is a single-session mode and does not save progress."
    : ok
      ?`Progress saved for ${(SPRITE_SETS[currentSaveSlotId]||SPRITE_SETS[currentSpriteSetId]).name}.`
      :"Save failed — localStorage may be unavailable.";
  pauseOverlay.classList.add("hidden");
  saveOverlay.classList.remove("hidden");
  gameOverOverlay.classList.add("hidden");
  $("themePicker").classList.add("hidden");
}

function restoreGame(save){
  // Apply theme and character set first
  applyTheme(save.theme||"arcade");
  applySpriteSet(save.spriteSet||"original");
  currentSaveSlotId=save.spriteSet||currentSpriteSetId;
  isQuickGame=false;
  level=save.level;
  score=save.score;
  levelScore=save.levelScore||0;
  levelTotalTime=save.levelTotalTime||getLevelTime(level);
  timeLeft=Math.min(save.timeLeft,levelTotalTime);
  hintCount=Number.isFinite(save.hintCount)?save.hintCount:HINTS;
  shuffleCount=Number.isFinite(save.shuffleCount)?save.shuffleCount:SHUFFLES;
  comboCount=save.comboCount||0;
  lastMatchAt=save.lastMatchAt||0;
  bestCombo=save.bestCombo||0;
  usedHintLvl=save.usedHintLvl||0;
  usedShuffLvl=save.usedShuffLvl||0;
  currentStrategy=STRATEGIES.find(s=>s.id===save.strategyId)||STRATEGIES[0];
  board=deserializeBoard(save.board);

  // Sync HUD
  levelEl.textContent=String(level).padStart(2,"0");
  setScoreDisplay();
  updateHelperDisplay();
  updateRuleTag();
  updateTimer();
  renderBoard();
}

// ─────────────────────────────────────────────
//  BOARD CREATION & RENDER
// ─────────────────────────────────────────────
function shuf(a){for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

function createBoard(){
  let values=[],active=entities.slice(0,ROWS*COLS/2);
  for(let i=0;i<ROWS*COLS/2;i++){let e=active[i%active.length];values.push(e,e)}
  shuf(values);board=[];let k=0;
  for(let r=0;r<ROWS;r++){let row=[];for(let c=0;c<COLS;c++)row.push({entity:values[k++],removed:false});board.push(row)}
}

function renderBoard(){
  boardEl.innerHTML="";
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    let t=document.createElement("div");t.className="tile";t.dataset.r=r;t.dataset.c=c;
    if(board[r][c].removed){t.classList.add("removed")}
    else{
      let e=board[r][c].entity,i=document.createElement("img");
      i.className="entity-sprite";i.title=e.name;i.alt=e.name;i.src=e.img;
      i.loading="eager";i.draggable=false;i.style.setProperty("--sprite-scale",e.scale);
      t.appendChild(i)
    }
    let tilePressLock=0;
    const handleTilePress=(ev)=>{
      unlockAudio();
      if(ev&&ev.cancelable)ev.preventDefault();

      // iOS can fire pointerup + touchend + synthetic click for one tap.
      // Without this guard, the same tile is processed twice, so the first
      // tap selects then instantly clears itself.
      const now=Date.now();
      if(now-tilePressLock<260)return;
      tilePressLock=now;

      clickTile(r,c,t);
    };

    if(window.PointerEvent){
      t.addEventListener("pointerup",handleTilePress,{passive:false});
    }else{
      t.addEventListener("touchend",handleTilePress,{passive:false});
      t.addEventListener("mouseup",handleTilePress,{passive:false});
    }

    t.onclick=(ev)=>{
      // Desktop fallback only. Touch/pointer devices are handled above.
      if(window.PointerEvent || (ev&&ev.detail===0))return;
      handleTilePress(ev);
    };
    boardEl.appendChild(t)
  }
  updateBoardInfo();
  setTimeout(resizeCanvas,50)
}

let pathPadX=0,pathPadY=0;
function resizeCanvas(){
  // Expand the connection-line canvas around the tile grid so border routes
  // (above, below, left, right of the grid) remain fully visible on every device.
  const rect=boardEl.getBoundingClientRect();
  const wrap=document.querySelector(".board-wrap").getBoundingClientRect();
  const tw=rect.width/COLS, th=rect.height/ROWS;
  pathPadX=Math.max(10,tw*.62);
  pathPadY=Math.max(18,th*.88);
  canvas.width =Math.ceil(rect.width  + pathPadX*2);
  canvas.height=Math.ceil(rect.height + pathPadY*2);
  canvas.style.width =canvas.width +"px";
  canvas.style.height=canvas.height+"px";
  canvas.style.left=(rect.left-wrap.left-pathPadX)+"px";
  canvas.style.top =(rect.top -wrap.top -pathPadY)+"px";
}
window.onresize=resizeCanvas;

// ─────────────────────────────────────────────
//  PATH LOGIC
// ─────────────────────────────────────────────
function empty(r,c){return r<0||r>=ROWS||c<0||c>=COLS||board[r][c].removed}
function straight(a,b){
  if(a.r===b.r){for(let c=Math.min(a.c,b.c)+1;c<Math.max(a.c,b.c);c++)if(!empty(a.r,c))return false;return true}
  if(a.c===b.c){for(let r=Math.min(a.r,b.r)+1;r<Math.max(a.r,b.r);r++)if(!empty(r,a.c))return false;return true}
  return false
}
function routeDistance(points){
  let d=0;
  for(let i=0;i<points.length-1;i++){
    d+=Math.abs(points[i].r-points[i+1].r)+Math.abs(points[i].c-points[i+1].c);
  }
  return d;
}
function routeOutsidePenalty(points){
  return points.reduce((n,p)=>n+((p.r<0||p.r>=ROWS||p.c<0||p.c>=COLS)?1:0),0);
}
function simplifyRoute(points){
  const out=[];
  points.forEach(p=>{
    const last=out[out.length-1];
    if(!last||last.r!==p.r||last.c!==p.c)out.push(p);
  });
  return out;
}
function pickShortestRoute(routes){
  if(!routes.length)return null;
  routes.sort((a,b)=>{
    const da=routeDistance(a),db=routeDistance(b);
    if(da!==db)return da-db;
    const oa=routeOutsidePenalty(a),ob=routeOutsidePenalty(b);
    if(oa!==ob)return oa-ob;
    return a.length-b.length;
  });
  return simplifyRoute(routes[0]);
}
function path(a,b){
  const A={r:a.r,c:a.c},B={r:b.r,c:b.c};
  const routes=[];

  if(straight(A,B))routes.push([A,B]);

  const p1={r:A.r,c:B.c};
  if(empty(p1.r,p1.c)&&straight(A,p1)&&straight(p1,B))routes.push([A,p1,B]);

  const p2={r:B.r,c:A.c};
  if(empty(p2.r,p2.c)&&straight(A,p2)&&straight(p2,B))routes.push([A,p2,B]);

  // Allow two-turn routing through empty internal lanes first, and through
  // one-cell border lanes only when they produce the shortest valid path.
  // This avoids sending mid-board matches all the way to the outer frame when
  // a shorter valid route is available just above/below/beside the matched tiles.
  for(let r=-1;r<=ROWS;r++){
    const pa={r,c:A.c},pb={r,c:B.c};
    if(empty(pa.r,pa.c)&&empty(pb.r,pb.c)&&straight(A,pa)&&straight(pa,pb)&&straight(pb,B))routes.push([A,pa,pb,B]);
  }
  for(let c=-1;c<=COLS;c++){
    const pa={r:A.r,c},pb={r:B.r,c};
    if(empty(pa.r,pa.c)&&empty(pb.r,pb.c)&&straight(A,pa)&&straight(pa,pb)&&straight(pb,B))routes.push([A,pa,pb,B]);
  }

  return pickShortestRoute(routes);
}
function tileEl(r,c){return boardEl.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`)}
function clearSel(){document.querySelectorAll(".tile.selected").forEach(t=>t.classList.remove("selected"));selected=null}

// ─────────────────────────────────────────────
//  SCORING HELPERS
// ─────────────────────────────────────────────
function comboPts(){
  return COMBO_POINTS[Math.min(COMBO_POINTS.length-1,Math.max(0,comboCount-1))];
}

function showCombo(text){
  const layer=$("comboLayer");
  if(!layer)return;
  const el=document.createElement("div");
  el.className="combo-pop";
  el.textContent=text;
  layer.appendChild(el);
  setTimeout(()=>el.remove(),760);
}

function resetLevelScoring(){
  comboCount=0;
  lastMatchAt=0;
  bestCombo=0;
  usedHintLvl=0;
  usedShuffLvl=0;
}

// ─────────────────────────────────────────────
//  CLICK HANDLER
// ─────────────────────────────────────────────
function clickTile(r,c,el){
  if(paused||!gameStarted)return;
  if(board[r][c].removed)return;
  unlockAudio();
  if(!selected){selected={r,c,el};el.classList.add("selected");sfx.select();moveStatus.textContent=board[r][c].entity.name.toUpperCase();return}
  if(selected.r===r&&selected.c===c){clearSel();sfx.select();moveStatus.textContent="SELECTION CLEARED";return}
  let a=selected,b={r,c,el};
  if(board[a.r][a.c].entity.id===board[b.r][b.c].entity.id){
    let p=path(a,b);
    if(p){
      drawPath(p);sfx.match();
      tileEl(a.r,a.c)?.classList.add("matched");tileEl(b.r,b.c)?.classList.add("matched");
      board[a.r][a.c].removed=board[b.r][b.c].removed=true;
      const now=Date.now();
      comboCount=(lastMatchAt&&now-lastMatchAt<=COMBO_WINDOW_MS)?comboCount+1:1;
      lastMatchAt=now;
      bestCombo=Math.max(bestCombo,comboCount);
      const pts=comboPts();
      score+=pts;levelScore+=pts;setScoreDisplay();
      moveStatus.textContent=comboCount>1?`COMBO x${comboCount}  +${formatScore(pts)}`:`MATCH  +${formatScore(pts)}`;
      if(comboCount>1)showCombo(`COMBO x${comboCount}  +${formatScore(pts)}`);
      setTimeout(()=>{
        clearPath();applyMovement(currentStrategy);renderBoard();
        if(board.flat().every(t=>t.removed)){sfx.level();showLevelComplete()}
        else if(!findMove()){updateBoardInfo();moveStatus.textContent="NO MATCHES // AUTO SHUFFLE";setTimeout(()=>shuffleTiles(false),500)}
      },430)
    }else{moveStatus.textContent="PATH BLOCKED";sfx.invalid()}
  }else{moveStatus.textContent="DIFFERENT CREATURES";sfx.invalid()}
  clearSel()
}

// ─────────────────────────────────────────────
//  DRAW PATH — clipped to canvas bounds
//  so lines that route via r=-1/c=-1 ghost
//  cells don't bleed outside the board frame
// ─────────────────────────────────────────────
function cellSize(){
  const rect=boardEl.getBoundingClientRect();
  return{w:rect.width/COLS,h:rect.height/ROWS}
}

function center(p){
  const{w,h}=cellSize();
  const gridW=w*COLS,gridH=h*ROWS;
  let x,y;
  if(p.c<0)x=pathPadX*.42;
  else if(p.c>=COLS)x=pathPadX+gridW+pathPadX*.58;
  else x=pathPadX+(p.c+.5)*w;

  // Border-route lanes: keep top/bottom outside paths close to the tile grid
  // so players can see the complete path without it being hidden by the frame.
  const laneGap=Math.max(8,Math.min(14,h*.18));
  if(p.r<0)y=Math.max(5,pathPadY-laneGap);
  else if(p.r>=ROWS)y=Math.min(canvas.height-5,pathPadY+gridH+laneGap);
  else y=pathPadY+(p.r+.5)*h;
  return{x,y};
}

function drawPixelLine(points,color,width,shadow){
  ctx.save();
  ctx.lineJoin="round";ctx.lineCap="round";
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.shadowBlur=shadow;ctx.shadowColor=color;
  ctx.beginPath();
  points.forEach((q,i)=>{
    const cp=center(q);
    const x=Math.round(cp.x)+.5,y=Math.round(cp.y)+.5;
    i?ctx.lineTo(x,y):ctx.moveTo(x,y)
  });
  ctx.stroke();ctx.restore()
}

function drawPath(p){
  const col=pathColors();
  resizeCanvas();ctx.clearRect(0,0,canvas.width,canvas.height);
  drawPixelLine(p,col.halo,13,24);
  drawPixelLine(p,col.line,7,18);
  drawPixelLine(p,col.core,2,5);
  ctx.save();
  ctx.fillStyle=col.core;ctx.shadowColor=col.line;ctx.shadowBlur=12;
  p.forEach(q=>{const cp=center(q);ctx.fillRect(Math.round(cp.x)-3,Math.round(cp.y)-3,6,6)});
  for(let i=0;i<p.length-1;i++){
    let a=center(p[i]),b=center(p[i+1]);
    let steps=Math.max(2,Math.floor(Math.hypot(a.x-b.x,a.y-b.y)/58));
    for(let k=1;k<steps;k++){
      let t=k/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
      ctx.fillRect(Math.round(x)-2,Math.round(y)-2,4,4)
    }
  }
  ctx.restore()
}

function clearPath(){ctx.clearRect(0,0,canvas.width,canvas.height)}

// ─────────────────────────────────────────────
//  TIMER
// ─────────────────────────────────────────────
function updateTimer(){
  let m=String(Math.floor(timeLeft/60)).padStart(2,"0"),s=String(timeLeft%60).padStart(2,"0");
  timerText.textContent=`${m}:${s}`;
  const pct=Math.max(0,timeLeft/levelTotalTime*100);
  if(timerBar)timerBar.style.width=`${pct}%`;
  if(boardTimerBar)boardTimerBar.style.width=`${pct}%`;
  document.body.classList.toggle("low-time",timeLeft<=60&&gameStarted&&!paused);
  if(timeLeft===60&&!timerWarned){timerWarned=true;sfx.warn();moveStatus.textContent="ONE MINUTE LEFT"}
}
function startTimer(){
  clearInterval(timerId);
  timerId=setInterval(()=>{
    if(paused)return;
    timeLeft=Math.max(0,timeLeft-1);updateTimer();
    if(timeLeft<=0){showGameOver()}
  },1000)
}

function showGameOver(){
  clearInterval(timerId);
  clearSel();
  clearPath();
  paused=true;
  gameStarted=false;
  timeLeft=0;
  updateTimer();
  document.body.classList.remove("low-time");
  appShell.classList.remove("paused");
  pauseOverlay.classList.add("hidden");
  levelCompleteOverlay.classList.add("hidden");
  saveOverlay.classList.add("hidden");
  $("themePicker").classList.add("hidden");
  const goSummary=$("goSummary");
  if(goSummary){
    const rule=currentStrategy?currentStrategy.name:"—";
    goSummary.textContent=`LV ${String(level).padStart(2,"0")} · ${rule} · ${formatScore(score)} pts`;
  }
  const goMsg=$("goMessage");
  if(goMsg)goMsg.textContent=isQuickGame
    ?"Time is up. Start a new Quick Game or return to the start screen."
    :"Time is up. Start a new game or return to the start screen.";
  const goNew=$("gameOverNewGameBtn");
  if(goNew)goNew.textContent=isQuickGame?"New Quick Game":"New Game";
  const goQuit=$("gameOverQuitBtn");
  if(goQuit)goQuit.textContent="Back to Start";
  moveStatus.textContent="GAME OVER";
  playUiAudio("gameOver");
  gameOverOverlay.classList.remove("hidden");
}

// ─────────────────────────────────────────────
//  FIND MOVE / HINT / SHUFFLE
// ─────────────────────────────────────────────
function findMove(){
  for(let r1=0;r1<ROWS;r1++)for(let c1=0;c1<COLS;c1++){
    if(board[r1][c1].removed)continue;
    for(let r2=0;r2<ROWS;r2++)for(let c2=0;c2<COLS;c2++){
      if((r1===r2&&c1===c2)||board[r2][c2].removed)continue;
      if(board[r1][c1].entity.id===board[r2][c2].entity.id&&path({r:r1,c:c1},{r:r2,c:c2}))return[{r:r1,c:c1},{r:r2,c:c2}]
    }
  }
  return null
}

function countConnectablePairs(){
  let cells=[];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    if(!board[r][c].removed)cells.push({r,c,id:board[r][c].entity.id});
  }
  let count=0;
  for(let i=0;i<cells.length;i++){
    for(let j=i+1;j<cells.length;j++){
      if(cells[i].id===cells[j].id && path(cells[i],cells[j]))count++;
    }
  }
  return count;
}

function updateBoardInfo(){
  if(!boardInfoEl)return;
  if(!board||!board.length){boardInfoEl.textContent="MATCHES: --";return}
  const n=countConnectablePairs();
  const setName=(SPRITE_SETS[currentSpriteSetId]||SPRITE_SETS.original).name;
  boardInfoEl.textContent=`MATCHES: ${String(n).padStart(2,"0")}  ·  SET: ${setName}`;
}

function showHelperMessage(kind,message){
  const ov=$("helperMessageOverlay");
  if(!ov){moveStatus.textContent=message;sfx.invalid();return}
  $("helperMessageKicker").textContent="HELPER UNAVAILABLE";
  $("helperMessageTitle").textContent=kind;
  $("helperMessageText").textContent=message;
  ov.classList.remove("hidden");
  sfx.invalid();
}

function hint(){
  if(paused||!gameStarted)return;
  if(hintCount<=0){showHelperMessage("No Hints Left","You have no hints available for this run.");return}
  let m=findMove();
  if(!m){showHelperMessage("No Link Found","There is no available link right now. Try shuffling the board.");return}
  hintCount--;usedHintLvl++;updateHelperDisplay();
  document.querySelectorAll(".tile.hint").forEach(t=>t.classList.remove("hint"));
  m.forEach(p=>tileEl(p.r,p.c)?.classList.add("hint"));
  sfx.hint();moveStatus.textContent="FIND PULSE SENT";
  setTimeout(()=>document.querySelectorAll(".tile.hint").forEach(t=>t.classList.remove("hint")),1800)
}

function shuffleTiles(count=true){
  if(paused||!gameStarted)return;
  if(count&&shuffleCount<=0){showHelperMessage("No Shuffles Left","You have no shuffles available for this run.");return}
  let rem=[];board.flat().forEach(t=>{if(!t.removed)rem.push(t.entity)});
  // Try a few reshuffles so the board comes back with at least one connectable pair.
  for(let attempt=0;attempt<12;attempt++){
    shuf(rem);
    let k=0;for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(!board[r][c].removed)board[r][c].entity=rem[k++];
    if(findMove())break;
  }
  if(count){shuffleCount--;usedShuffLvl++;updateHelperDisplay()}
  renderBoard();sfx.shuffle();moveStatus.textContent="CARTRIDGE RESHUFFLED"
}

// ─────────────────────────────────────────────
//  LEVEL MANAGEMENT
// ─────────────────────────────────────────────
function updateRuleTag(){ruleTagEl.textContent=currentStrategy.name}

function showLevelComplete(){
  clearInterval(timerId);paused=true;
  const nextLvl=level+1,nextStrat=getStrategy(nextLvl);
  const timeBonus=timeLeft*TIME_BONUS_PER_SECOND;
  const perfect=(usedHintLvl===0&&usedShuffLvl===0)?PERFECT_BONUS:0;
  score+=timeBonus+perfect;levelScore+=timeBonus+perfect;setScoreDisplay();
  const nextSetName=isQuickGame?"Random tile set":(SPRITE_SETS[currentSpriteSetId]||SPRITE_SETS.original).name;
  $("lcKicker").textContent=`LEVEL ${String(level).padStart(2,"0")} COMPLETE`;
  $("lcTitle").textContent="Level Complete";
  $("lcSummary").textContent=isQuickGame?"Quick Game continues with a new random tile set next level.":"Your progress can be saved before returning to the start screen.";
  $("lcTime").textContent=`+${formatScore(timeBonus)} pts`;
  $("lcPerfect").textContent=perfect?`+${formatScore(PERFECT_BONUS)} pts`:"—";
  $("lcLevelScore").textContent=`${formatScore(levelScore)} pts`;
  $("lcTotalScore").textContent=`${formatScore(score)} pts`;
  $("lcNextRule").textContent=`Next: LV ${nextLvl} · ${nextStrat.name} · ${nextSetName}`;
  playUiAudio("levelComplete");
  const quitBtn=$("levelCompleteQuitBtn");
  if(quitBtn)quitBtn.textContent=isQuickGame?"End Quick Game":"Save & Quit";
  levelCompleteOverlay.classList.remove("hidden");
}

function prepareNextLevelState(){
  const clearedLevel=level;
  level++;levelScore=0;resetLevelScoring();
  refillHelpersAfterClearedLevel(clearedLevel);
  if(isQuickGame)applyQuickGameRandomSet();
  currentStrategy=getStrategy(level);
  levelEl.textContent=String(level).padStart(2,"0");
  updateRuleTag();
  levelTotalTime=getLevelTime(level);
  timeLeft=levelTotalTime;timerWarned=false;
  updateHelperDisplay();
  updateTimer();createBoard();renderBoard();
}

function startNextLevel(){
  levelCompleteOverlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
  $("endQuickConfirmOverlay")?.classList.add("hidden");
  $("helperMessageOverlay")?.classList.add("hidden");
  prepareNextLevelState();
  paused=false;gameStarted=true;
  const setName=(SPRITE_SETS[currentSpriteSetId]||SPRITE_SETS.original).name;
  moveStatus.textContent=isQuickGame?`QUICK GAME · ${setName} · LV ${level}`:`LV ${level}  ·  ${currentStrategy.name}`;
  startTimer();
}

function levelCompleteQuit(){
  if(isQuickGame){
    levelCompleteOverlay.classList.add("hidden");
    endQuickGame(true);
    return;
  }
  prepareNextLevelState();
  saveGame();
  sfx.save();
  returnToTitleAfterSave();
}

// ─────────────────────────────────────────────
//  GAME LIFECYCLE
// ─────────────────────────────────────────────
function startGame(options={}){
  const mode=typeof options==="object"?options:{};
  const selectedSet=mode.randomSet
    ? randomSpriteSetId(null)
    : currentSpriteSetId;
  applySpriteSet(selectedSet);
  isQuickGame=!!mode.quick;
  currentSaveSlotId=isQuickGame?null:selectedSet;
  overlay.classList.add("hidden");
  pauseOverlay.classList.add("hidden");
  levelCompleteOverlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
  $("themePicker").classList.add("hidden");
  appShell.classList.remove("paused");
  unlockAudio();sfx.level();bgm.play().catch(()=>{});
  score=0;levelScore=0;level=1;resetLevelScoring();
  currentStrategy=getStrategy(1);
  levelTotalTime=getLevelTime(1);
  timeLeft=levelTotalTime;timerWarned=false;
  hintCount=HINTS;shuffleCount=SHUFFLES;
  paused=false;gameStarted=true;
  levelEl.textContent="01";setScoreDisplay();
  updateHelperDisplay();
  updateRuleTag();updateTimer();createBoard();renderBoard();startTimer();
  moveStatus.textContent=isQuickGame?`QUICK GAME · ${(SPRITE_SETS[selectedSet]||SPRITE_SETS.original).name}`:"SYSTEM ONLINE"
}

function startNewGameFromTitle(force=false){
  const existing=loadSave(currentSpriteSetId);
  if(existing&&!force){
    const setName=(SPRITE_SETS[currentSpriteSetId]||SPRITE_SETS.original).name;
    $("newGameConfirmMsg").textContent=`Starting a new ${setName} game will delete its saved progress.`;
    $("newGameConfirmOverlay").classList.remove("hidden");
    return;
  }
  if(existing)deleteSave(currentSpriteSetId);
  refreshStartScreen();
  startGame({quick:false});
}

function startQuickGame(){
  startGame({quick:true,randomSet:true});
}

function continueFromSave(){
  const save=loadSave(currentSpriteSetId);
  if(!save){sfx.invalid();return;}
  overlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
  $("themePicker").classList.add("hidden");
  appShell.classList.remove("paused");
  unlockAudio();sfx.level();bgm.play().catch(()=>{});
  restoreGame(save);
  timerWarned=false;paused=false;gameStarted=true;
  startTimer();
  moveStatus.textContent=`SAVE RESTORED  LV ${level}`;
}

function setupPauseModal(){
  const kicker=document.querySelector('#pauseOverlay .modal-kicker');
  const title=document.querySelector('#pauseOverlay h1');
  const msg=$("pauseMessage");
  const saveContinue=$("saveContinueBtn");
  const saveQuit=$("saveFromPauseBtn");
  const endQuick=$("endQuickGameBtn");
  if(isQuickGame){
    if(kicker)kicker.textContent="QUICK GAME PAUSED";
    if(title)title.textContent="Quick Game Paused";
    if(msg)msg.textContent="Quick Game is a single-session mode and will not save progress.";
    saveContinue.classList.add("hidden");
    saveQuit.classList.add("hidden");
    endQuick.classList.remove("hidden");
  }else{
    if(kicker)kicker.textContent="GAME PAUSED";
    if(title)title.textContent="Paused";
    if(msg)msg.textContent="The timer is stopped. Choose how you want to continue.";
    saveContinue.classList.remove("hidden");
    saveQuit.classList.remove("hidden");
    endQuick.classList.add("hidden");
  }
}

function saveAndContinue(){
  if(!gameStarted)return;
  const ok=saveGame();
  sfx.save();
  if(ok){moveStatus.textContent="GAME SAVED";}
  resumeGame();
}

function saveAndQuit(){
  if(!gameStarted)return;
  saveGame();
  sfx.save();
  returnToTitleAfterSave();
}

function endQuickGame(skipConfirm=false){
  if(!isQuickGame){returnToTitleAfterSave();return;}
  if(!skipConfirm){
    const ov=$("endQuickConfirmOverlay");
    if(ov){ov.classList.remove("hidden");return;}
  }
  gameStarted=false;
  paused=false;
  clearInterval(timerId);
  bgm.pause();bgm.currentTime=0;
  pauseOverlay.classList.add("hidden");
  appShell.classList.remove("paused");
  document.body.classList.remove("low-time");
  overlay.classList.remove("hidden");
  refreshSaveSlot();
}

function pauseGame(){
  if(!gameStarted||paused)return;
  paused=true;clearInterval(timerId);clearSel();clearPath();
  document.body.classList.remove("low-time");
  $("themePicker").classList.add("hidden");
  appShell.classList.add("paused");
  setupPauseModal();
  pauseOverlay.classList.remove("hidden");
  moveStatus.textContent="GAME PAUSED";sfx.select()
}

function resumeGame(){
  if(!gameStarted||!paused)return;
  paused=false;
  pauseOverlay.classList.add("hidden");
  appShell.classList.remove("paused");
  document.body.classList.toggle("low-time",timeLeft<=60&&gameStarted);
  moveStatus.textContent="SYSTEM ONLINE";sfx.level();startTimer();resizeCanvas()
}

function restartCurrentLevel(){
  gameOverOverlay.classList.add("hidden");
  levelScore=0;resetLevelScoring();
  currentStrategy=getStrategy(level);
  levelTotalTime=getLevelTime(level);
  timeLeft=levelTotalTime;timerWarned=false;
  updateRuleTag();updateTimer();createBoard();renderBoard();
  paused=false;gameStarted=true;
  moveStatus.textContent=`RETRY  LV ${level}`;
  startTimer();
}

function newGameFromGameOver(){
  gameOverOverlay.classList.add("hidden");
  if(isQuickGame){
    startQuickGame();
  }else{
    startGame({quick:false});
  }
}

function quitFromGameOver(){
  gameOverOverlay.classList.add("hidden");
  returnToTitleAfterSave();
}


// ─────────────────────────────────────────────
//  v1.3.16  FINITE SCROLL-SNAP CAROUSEL
//  Single unified approach for desktop + mobile.
//  Layout: CSS flex scroll-snap (no absolute positioning, no JS transforms).
//  JS responsibility: track active index, update is-center class,
//  scroll active card into view, update dots, update arrow disabled state.
// ─────────────────────────────────────────────
let spriteCarouselIndex=0;
let spriteCarouselScrollTimer=0;
let spriteCarouselSuppressScroll=false;
let spriteCarouselWheelLock=false;
let spriteCarouselPointerStart=null;
let spriteCarouselPointerMoved=false;
let spriteCarouselResizeRAF=0;

function baseSpriteOptions(){
  const el=$("spriteOptions");
  return el?[...el.querySelectorAll(".sprite-option:not(.sprite-clone)")]:[];
}

function getSpriteCarouselIds(){
  return baseSpriteOptions().map(card=>card.dataset.set).filter(Boolean);
}

function setupSpriteCarousel(){
  const el=$("spriteOptions");
  if(!el||el.dataset.carouselReady==="1")return;
  el.dataset.carouselReady="1";
  buildSpriteCarouselDots();

  const ids=getSpriteCarouselIds();
  spriteCarouselIndex=Math.max(0,ids.indexOf(currentSpriteSetId));

  // Arrow buttons
  const prev=$("spriteCarouselPrev");
  const next=$("spriteCarouselNext");
  if(prev)prev.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();moveSpriteCarousel(-1,true);});
  if(next)next.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();moveSpriteCarousel(1,true);});

  // Scroll → detect which card is centred after scrolling settles
  el.addEventListener("scroll",()=>{
    if(spriteCarouselSuppressScroll)return;
    window.clearTimeout(spriteCarouselScrollTimer);
    spriteCarouselScrollTimer=window.setTimeout(selectNearestCarouselCard,90);
  },{passive:true});

  // Mouse-wheel: step one card at a time
  el.addEventListener("wheel",handleSpriteCarouselWheel,{passive:false});

  // Re-centre on resize
  window.addEventListener("resize",()=>{
    if(spriteCarouselResizeRAF)return;
    spriteCarouselResizeRAF=requestAnimationFrame(()=>{
      spriteCarouselResizeRAF=0;
      scrollCarouselToIndex(spriteCarouselIndex,false);
    });
  },{passive:true});

  refreshSpriteSavePills();
  renderSpriteCarousel();
  // Defer first scroll so layout is complete
  setTimeout(()=>scrollCarouselToIndex(spriteCarouselIndex,false),80);
  updateSpriteCarouselDots();
}

function renderSpriteCarousel(){
  const cards=baseSpriteOptions();
  const n=cards.length;
  if(!n)return;
  spriteCarouselIndex=Math.max(0,Math.min(spriteCarouselIndex,n-1));
  cards.forEach((card,i)=>{
    card.classList.toggle("is-center",i===spriteCarouselIndex);
  });
  updateSpriteCarouselDots();
  updateCarouselArrows();
}

function scrollCarouselToIndex(idx,smooth=true){
  const el=$("spriteOptions");
  const cards=baseSpriteOptions();
  const card=cards[idx];
  if(!el||!card)return;
  spriteCarouselSuppressScroll=true;
  // Scroll so the card centre aligns with the container centre
  const cardRect=card.getBoundingClientRect();
  const containerRect=el.getBoundingClientRect();
  const delta=(cardRect.left+cardRect.width/2)-(containerRect.left+containerRect.width/2);
  if(smooth){
    el.scrollTo({left:el.scrollLeft+delta,behavior:"smooth"});
  }else{
    el.scrollLeft=el.scrollLeft+delta;
  }
  window.setTimeout(()=>{spriteCarouselSuppressScroll=false;},smooth?340:80);
}

function selectNearestCarouselCard(){
  const el=$("spriteOptions");
  const cards=baseSpriteOptions();
  if(!el||!cards.length)return;
  const mid=el.getBoundingClientRect().left+el.clientWidth/2;
  let bestIdx=spriteCarouselIndex,bestDist=Infinity;
  cards.forEach((card,i)=>{
    const r=card.getBoundingClientRect();
    const dist=Math.abs((r.left+r.width/2)-mid);
    if(dist<bestDist){bestDist=dist;bestIdx=i;}
  });
  if(bestIdx!==spriteCarouselIndex){
    spriteCarouselIndex=bestIdx;
    const ids=getSpriteCarouselIds();
    const setId=ids[spriteCarouselIndex];
    if(setId&&setId!==currentSpriteSetId)applySpriteSet(setId,{fromCarousel:true});
    renderSpriteCarousel();
  }
}

function centerSpriteCarouselOn(setId,smooth=true){
  const ids=getSpriteCarouselIds();
  const idx=ids.indexOf(setId);
  if(idx<0)return;
  spriteCarouselIndex=idx;
  renderSpriteCarousel();
  scrollCarouselToIndex(idx,smooth);
}

function moveSpriteCarousel(direction,playSound=false){
  const ids=getSpriteCarouselIds();
  if(!ids.length)return;
  // Finite: clamp at ends, no wrap-around
  spriteCarouselIndex=Math.max(0,Math.min(spriteCarouselIndex+direction,ids.length-1));
  const setId=ids[spriteCarouselIndex];
  applySpriteSet(setId,{fromCarousel:true});
  renderSpriteCarousel();
  scrollCarouselToIndex(spriteCarouselIndex,true);
  if(playSound&&typeof sfx!=="undefined")sfx.select();
}

function selectSpriteCarouselSet(setId,playSound=false){
  const ids=getSpriteCarouselIds();
  const idx=ids.indexOf(setId);
  if(idx<0)return;
  spriteCarouselIndex=idx;
  applySpriteSet(setId,{fromCarousel:true});
  renderSpriteCarousel();
  scrollCarouselToIndex(idx,true);
  if(playSound&&typeof sfx!=="undefined")sfx.select();
}

function getCenteredSpriteCard(){
  return baseSpriteOptions()[spriteCarouselIndex]||null;
}

function normalizeSpriteCarouselPosition(){
  renderSpriteCarousel();
  scrollCarouselToIndex(spriteCarouselIndex,false);
}

function updateCarouselArrows(){
  const ids=getSpriteCarouselIds();
  const prev=$("spriteCarouselPrev");
  const next=$("spriteCarouselNext");
  if(prev)prev.disabled=spriteCarouselIndex===0;
  if(next)next.disabled=spriteCarouselIndex===ids.length-1;
}

function handleSpriteCarouselWheel(e){
  const amount=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
  if(Math.abs(amount)<8)return;
  e.preventDefault();
  if(spriteCarouselWheelLock)return;
  spriteCarouselWheelLock=true;
  moveSpriteCarousel(amount>0?1:-1,true);
  setTimeout(()=>{spriteCarouselWheelLock=false;},260);
}

function buildSpriteCarouselDots(){
  const dots=$("spriteCarouselDots");
  if(!dots)return;
  dots.innerHTML="";
  baseSpriteOptions().forEach(card=>{
    const dot=document.createElement("button");
    dot.type="button";
    dot.className="sprite-carousel-dot";
    dot.dataset.set=card.dataset.set;
    dot.setAttribute("aria-label",`Select ${(SPRITE_SETS[card.dataset.set]||{}).name||card.dataset.set}`);
    dot.addEventListener("click",e=>{
      e.preventDefault();
      e.stopPropagation();
      selectSpriteCarouselSet(dot.dataset.set,true);
    });
    dots.appendChild(dot);
  });
}

function updateSpriteCarouselDots(){
  document.querySelectorAll(".sprite-carousel-dot").forEach(dot=>dot.classList.toggle("active",dot.dataset.set===currentSpriteSetId));
}

function handleSpriteCarouselPointerDown(e){
  spriteCarouselPointerStart={x:e.clientX,y:e.clientY,t:Date.now()};
  spriteCarouselPointerMoved=false;
}

function handleSpriteCarouselPointerUp(e){
  if(!spriteCarouselPointerStart)return false;
  const dx=(e.clientX||0)-spriteCarouselPointerStart.x;
  const dy=(e.clientY||0)-spriteCarouselPointerStart.y;
  const dt=Date.now()-spriteCarouselPointerStart.t;
  spriteCarouselPointerStart=null;
  if(Math.abs(dx)>32&&Math.abs(dx)>Math.abs(dy)*1.25&&dt<900){
    spriteCarouselPointerMoved=true;
    moveSpriteCarousel(dx<0?1:-1,true);
    setTimeout(()=>{spriteCarouselPointerMoved=false;},120);
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────
//  BUTTON BINDINGS
// ─────────────────────────────────────────────
$("startBtn").onclick=()=>startNewGameFromTitle(false);
$("hintBtn").onclick=hint;
$("shuffleBtn").onclick=()=>shuffleTiles(true);
$("pauseBtn").onclick=pauseGame;
$("continueBtn").onclick=(e)=>{
  e.preventDefault();
  e.stopPropagation();
  saveOverlay.classList.add("hidden");
  resumeGame();
};
$("nextLevelBtn").onclick=startNextLevel;
$("levelCompleteQuitBtn").onclick=levelCompleteQuit;
$("gameOverNewGameBtn").onclick=newGameFromGameOver;
$("gameOverQuitBtn").onclick=quitFromGameOver;
$("themeBtn").onclick=(e)=>{e.stopPropagation();toggleThemePicker()};
$("musicBtn").onclick=()=>{unlockAudio();muted=!muted;bgm.muted=muted;Object.values(uiAudio).forEach(a=>a.muted=muted);$("musicBtn").textContent=muted?"×":"♪";if(!muted)bgm.play().catch(()=>{})};

// Save buttons
$("saveBtn").onclick=(e)=>{
  e.preventDefault();
  e.stopPropagation();
  if(!gameStarted)return;
  if(!paused)pauseGame();
  triggerSave(false);
};
$("saveOkBtn").onclick=(e)=>{
  e.preventDefault();
  e.stopPropagation();
  saveOverlay.classList.add("hidden");
  const action=saveOverlay.dataset.action||saveOverlayAction;
  saveOverlay.dataset.action="none";
  saveOverlayAction="none";
  refreshSaveSlot();
  if(action==="quit"){
    returnToTitleAfterSave();
  }else if(gameStarted&&paused){
    resumeGame();
  }
};
$("saveContinueBtn").onclick=(e)=>{
  e.preventDefault();
  e.stopPropagation();
  saveAndContinue();
};
$("saveFromPauseBtn").onclick=(e)=>{
  e.preventDefault();
  e.stopPropagation();
  saveAndQuit();
};
$("endQuickGameBtn").onclick=(e)=>{
  e.preventDefault();
  e.stopPropagation();
  endQuickGame(false);
};
$("cancelEndQuickBtn").onclick=()=>$("endQuickConfirmOverlay").classList.add("hidden");
$("confirmEndQuickBtn").onclick=()=>{
  $("endQuickConfirmOverlay").classList.add("hidden");
  endQuickGame(true);
};
$("helperMessageOkBtn").onclick=()=>$("helperMessageOverlay").classList.add("hidden");

// Start screen actions
$("continueFromSaveBtn").onclick=continueFromSave;
$("quickGameBtn").onclick=startQuickGame;
$("cancelNewGameBtn").onclick=()=>$("newGameConfirmOverlay").classList.add("hidden");
$("confirmNewGameBtn").onclick=()=>{
  $("newGameConfirmOverlay").classList.add("hidden");
  startNewGameFromTitle(true);
};
$("deleteSaveBtn").onclick=()=>{
  deleteSave(currentSpriteSetId);
  refreshSaveSlot();
};


// Character set option clicks
// Delegated pointer/click handling keeps the full cartridge-style button tappable
// on iPhone/iPad, including taps on the small subtitle text.
let lastSpritePressAt=0;
function handleSpritePointerDown(e){
  handleSpriteCarouselPointerDown(e);
}
function handleSpriteOptionPress(e){
  const opt=e.target.closest(".sprite-option");
  if(!opt)return;
  if(e.type==="pointerup" && handleSpriteCarouselPointerUp(e)){
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if(e.type==="click" && spriteCarouselPointerMoved){
    e.preventDefault();
    e.stopPropagation();
    spriteCarouselPointerMoved=false;
    return;
  }
  const now=Date.now();
  e.preventDefault();
  e.stopPropagation();
  if(now-lastSpritePressAt<180)return;
  lastSpritePressAt=now;
  selectSpriteCarouselSet(opt.dataset.set,true);
}
const spriteOptionsEl=$("spriteOptions");
if(spriteOptionsEl){
  spriteOptionsEl.style.setProperty("--sprite-count", Math.min(6, spriteOptionsEl.querySelectorAll(".sprite-option").length));
  setupSpriteCarousel();
  spriteOptionsEl.addEventListener("pointerdown",handleSpritePointerDown,true);
  spriteOptionsEl.addEventListener("pointerup",handleSpriteOptionPress,true);
  spriteOptionsEl.addEventListener("click",handleSpriteOptionPress,true);
}

// Theme option clicks
document.querySelectorAll(".theme-option").forEach(el=>{
  el.onclick=(e)=>{
    e.stopPropagation();
    applyTheme(el.dataset.theme);
    $("themePicker").classList.add("hidden");
  }
});

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
updateTimer();createBoard();renderBoard();
refreshSaveSlot();  // show saved game slot on start screen if one exists
