import { dbPut, dbGet, dbDelete, dbGetAll } from "./js/db/db.js";


const ACTIVE_SESSION_ID="active_session";
let activeSessionRestored=false;
let historyCache=[];

function cloneData(v){return JSON.parse(JSON.stringify(v));}
function planKey(plan){return plan===MUSCU_D?"D":"A";}

async function persistActiveSession(){
  try{
    if(typeof LIVE==="undefined"||typeof LS==="undefined"||!ACTIVE_PLAN)return;
    await dbPut("meta",{
      id:ACTIVE_SESSION_ID,
      kind:"active_workout",
      planKey:planKey(ACTIVE_PLAN),
      live:cloneData(LIVE),
      state:cloneData({...LS,restTimer:undefined}),
      updatedAt:new Date().toISOString()
    });
  }catch(err){console.error("Coach JM persistence",err);}
}

async function clearActiveSession(){
  try{await dbDelete("meta",ACTIVE_SESSION_ID);}catch(err){console.error(err);}
}

async function restoreActiveSession(){
  try{
    const saved=await dbGet("meta",ACTIVE_SESSION_ID);
    if(!saved||!saved.live||!saved.state)return false;
    ACTIVE_PLAN=saved.planKey==="D"?MUSCU_D:MUSCU_A;
    LIVE=saved.live;
    LS=saved.state;
    LS.planKey=saved.planKey||LS.planKey||(saved.planKey==="D"?"D":"A");
    LS.restTimer=null;
    activeSessionRestored=true;
    return true;
  }catch(err){console.error("Restore failed",err);return false;}
}

async function saveCompletedWorkout(feedback){
  const id=`session_${Date.now()}`;
  const record={
    id,
    type:"workout_session",
    templateName:ACTIVE_PLAN.name,
    planKey:planKey(ACTIVE_PLAN),
    startedAt:new Date(Date.now()-(LS.t*1000)).toISOString(),
    endedAt:new Date().toISOString(),
    elapsedSeconds:LS.t,
    exercises:cloneData(LIVE),
    completed:cloneData(LS.ok),
    notes:cloneData(LS.notes),
    feedback:cloneData(feedback),
    createdAt:new Date().toISOString()
  };
  await dbPut("workoutSessions",record);
  await clearActiveSession();
  activeSessionRestored=false;
  historyCache=await dbGetAll("workoutSessions");
  return record;
}

async function loadHistory(){
  try{
    historyCache=(await dbGetAll("workoutSessions"))
      .filter(x=>x&&x.type==="workout_session")
      .sort((a,b)=>new Date(b.endedAt)-new Date(a.endedAt));
  }catch(err){console.error(err);historyCache=[];}
}

const BASE_WEEK_START = new Date(2026,8,7); // 7 septembre 2026, lundi
let programWeekOffset = 0;

const BASE_WEEK_TEMPLATE = [
 {dow:"LUN",status:"done",name:"Cardio léger + mobilité",meta:"42 min · réalisé",kind:"done"},
 {dow:"MAR",status:"today",name:"Muscu A — Jambes",meta:"≈ 55 min · Salle · 5 exercices",kind:"planned",id:"muscu-a"},
 {dow:"MER",status:"planned",name:"Muscu B — Tirage",meta:"≈ 55 min · Salle · 5 exercices",kind:"planned",id:"muscu-b"},
 {dow:"JEU",status:"planned",name:"Cardio — Intervalles",meta:"≈ 35 min · Cardio",kind:"planned"},
 {dow:"VEN",status:"rest",name:"Repos",meta:"",kind:"rest"},
 {dow:"SAM",status:"planned",name:"Muscu C — Poussée",meta:"≈ 55 min · Salle · 5 exercices",kind:"planned"},
 {dow:"DIM",status:"planned",name:"Cardio long",meta:"≈ 50 min · Endurance",kind:"planned"}
];

function datePlusDays(date,days){
 const d=new Date(date); d.setDate(d.getDate()+days); return d;
}
function weekStartDate(){
 return datePlusDays(BASE_WEEK_START,programWeekOffset*7);
}
function formatWeekTitle(){
 const s=weekStartDate(), e=datePlusDays(s,6);
 const months=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
 return `${s.getDate()} — ${e.getDate()} ${months[e.getMonth()]}`;
}
function baseDaysForCurrentWeek(){
 const s=weekStartDate();
 return BASE_WEEK_TEMPLATE.map((d,i)=>{
   const dd=datePlusDays(s,i);
   return {...d,n:dd.getDate(),dateISO:`${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,"0")}-${String(dd.getDate()).padStart(2,"0")}`, _slot:i};
 });
}
const PROGRAM_ORDER_KEY="coachjm_program_order_v2";

function programDays(){
  const base=baseDaysForCurrentWeek();
  try{
    const saved=JSON.parse(localStorage.getItem(`${PROGRAM_ORDER_KEY}_${programWeekOffset}`)||"null");
    if(!Array.isArray(saved)) return base;

    const movableSlots=base.filter(d=>d.kind!=="done").map(d=>d._slot);
    const movable=base.filter(d=>d.kind!=="done");
    const byKey=new Map(movable.map(d=>[(d.id||d.name),d]));

    const ordered=saved.map(k=>byKey.get(k)).filter(Boolean);
    movable.forEach(d=>{ if(!ordered.includes(d)) ordered.push(d); });

    movableSlots.forEach((slot,i)=>{
      const item=ordered[i];
      base[slot]={...item,dow:base[slot].dow,n:base[slot].n,status:base[slot].status,_slot:slot};
    });
    return base;
  }catch(e){
    return base;
  }
}

function saveProgramOrder(days){
  const keys=days.filter(d=>d.kind!=="done").map(d=>d.id||d.name);
  localStorage.setItem(`${PROGRAM_ORDER_KEY}_${programWeekOffset}`,JSON.stringify(keys));
}

function bindProgramDrag(){
  const handles=[...document.querySelectorAll(".drag-handle[data-slot]")];
  let dragEl=null, fromSlot=null, pointerId=null;

  function clearTargets(){
    document.querySelectorAll(".program-day.drag-target").forEach(x=>x.classList.remove("drag-target"));
  }
  function cleanup(){
    clearTargets();
    document.querySelectorAll(".workout-card.dragging").forEach(x=>x.classList.remove("dragging"));
    dragEl=null; fromSlot=null; pointerId=null;
  }

  handles.forEach(handle=>{
    handle.addEventListener("contextmenu",e=>e.preventDefault());

    handle.addEventListener("pointerdown",e=>{
      if(e.pointerType==="mouse" && e.button!==0) return;
      e.preventDefault();
      e.stopPropagation();

      pointerId=e.pointerId;
      fromSlot=+handle.dataset.slot;
      dragEl=handle.closest(".workout-card");
      dragEl?.classList.add("dragging");

      try{ handle.setPointerCapture(pointerId); }catch(_){}
      if(navigator.vibrate) navigator.vibrate(15);
    });

    handle.addEventListener("pointermove",e=>{
      if(!dragEl || e.pointerId!==pointerId) return;
      e.preventDefault();
      clearTargets();

      const under=document.elementFromPoint(e.clientX,e.clientY)?.closest(".program-day");
      if(under && under.querySelector(".drag-handle[data-slot]")){
        under.classList.add("drag-target");
      }
    });

    handle.addEventListener("pointerup",e=>{
      if(!dragEl || e.pointerId!==pointerId){ cleanup(); return; }
      e.preventDefault();
      e.stopPropagation();

      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest(".program-day");
      const targetHandle=target?.querySelector(".drag-handle[data-slot]");

      if(targetHandle){
        const to=+targetHandle.dataset.slot;
        const days=programDays();
        const a=days.findIndex(d=>d._slot===fromSlot);
        const b=days.findIndex(d=>d._slot===to);

        if(a>=0 && b>=0 && days[a].kind!=="done" && days[b].kind!=="done"){
          const slotA={dow:days[a].dow,n:days[a].n,status:days[a].status,_slot:days[a]._slot};
          const slotB={dow:days[b].dow,n:days[b].n,status:days[b].status,_slot:days[b]._slot};
          const A={...days[a]}, B={...days[b]};
          days[a]={...B,...slotA};
          days[b]={...A,...slotB};
          saveProgramOrder(days);
        }
      }

      cleanup();
      render("program");
    });

    handle.addEventListener("pointercancel",cleanup);
  });
}


const MUSCU_A = {
 name:"Muscu A — Jambes", subtitle:"Jambes · gainage · mobilité", duration:"≈ 60 min", place:"Salle", goal:"Renforcer les jambes, progresser sans douleur au genou et construire une base solide pour tout le reste.",
 exercises:[
  {name:"Tapis — échauffement", meta:"8 min · allure facile", extra:"Prévu : 5 km/h · pente légère"},
  {name:"Squat", meta:"3 séries · 10–12 reps · repos 90–120 s", extra:"Mouvement jambes principal", warmup:"Échauffement : barre à vide"},
  {name:"Leg Press horizontale", meta:"3 séries · 10–12 reps · repos 90 s", extra:"Complément jambes · charge à ajuster"},
  {name:"Leg Curl", meta:"3 séries · 10–12 reps · repos 75 s", extra:"Charge prévue : 15 kg"},
  {name:"Gainage frontal", meta:"3 séries · 30–45 s · repos 45 s", extra:"Poids du corps"},
  {name:"Mobilité hanches / ischios", meta:"5–8 min · fin de séance", extra:"Amplitude confortable, sans forcer"}
 ]
};

const MUSCU_D = {
 name:"Muscu D — Full Body", subtitle:"Corps entier · traction · tronc", duration:"≈ 60–70 min", place:"Salle",
 goal:"Travailler tout le corps en une séance, développer la force et l’endurance musculaire sans aller systématiquement à l’échec.",
 exercises:[
  {name:"Tapis — échauffement", meta:"10–12 min · progressif", extra:"Marche active · pente progressive"},
  {name:"Squat", meta:"3 séries · 10–12 reps · repos 90–120 s", extra:"Mouvement jambes principal", warmup:"Échauffement : barre à vide"},
  {name:"Tirage vertical", meta:"3 séries · 8–12 reps · repos 90–120 s", extra:"Objectif traction · charge de travail à ajuster"},
  {name:"Chest Press", meta:"3 séries · 8–12 reps · repos 90–120 s", extra:"Poussée · garder 1–2 reps en réserve"},
  {name:"Rowing assis / Leg Curl", meta:"3 séries · 10–12 reps", extra:"À choisir selon la séance et la fatigue"},
  {name:"Gainage frontal", meta:"3 séries · 30–50 s · repos 60 s", extra:"Tronc · arrêter si la posture se dégrade"},
  {name:"Mobilité hanches / ischios", meta:"5–8 min · fin de séance", extra:"Amplitude confortable, sans forcer"}
 ]
};


function bindProgramControls(){
 document.querySelector("#prevWeek")?.addEventListener("click",()=>{
   programWeekOffset--;
   render("program");
 });
 document.querySelector("#nextWeek")?.addEventListener("click",()=>{
   programWeekOffset++;
   render("program");
 });
 document.querySelector("#addProgramSession")?.addEventListener("click",()=>{
   navigate("new");
 });
}

function todayView(){
 const hasHistory=historyCache.length>0;
 return `<section class="page">
 <div class="topline"><div><h1 class="brand">Coach JM</h1><div class="date">Mardi 8 septembre</div></div><div class="avatar">JM</div></div>

 <div class="eyebrow">AUJOURD’HUI</div>
 <h2 class="hero-title">${activeSessionRestored?"On continue ?":"Prêt pour aujourd’hui ?"}</h2>

 ${activeSessionRestored
   ? `<div class="resume-card card today-active-session" data-route="live-workout">
        <div>
          <b>⏱ Séance en cours</b>
          <span>${ACTIVE_PLAN.name} · ${ft(LS.t)} · phase ${LS.x+1}/${LIVE.length}</span>
        </div>
        <button class="secondary" type="button">Reprendre</button>
      </div>`
   : `<div class="card today-card">
        <div class="session-title">💪 Muscu A — Jambes</div>
        <div class="meta">≈ 55 min · Salle · 5 exercices</div>
        <button class="primary" data-route="workout-muscu-a">Voir la séance</button>
      </div>`}

 <div class="section-head"><h2>Ma semaine</h2><button class="linkbtn" data-route="program">Voir</button></div>
 <div class="week-strip">${programDays().map(d=>`<div class="day-mini ${(programWeekOffset===0&&d.n===8)?'active':''}"><span class="dow">${d.dow}</span><b>${d.n}</b><i class="dot ${d.kind==='done'?'done':''}"></i></div>`).join("")}</div>

 <div class="section-head"><h2>Mes 3 objectifs</h2><button class="linkbtn" data-route="progress">Progression</button></div>
 <div class="goals">
   <div class="card goal"><div class="emoji">💪</div><b>Traction</b><div class="bar"><i></i></div><div class="small">À mesurer</div></div>
   <div class="card goal"><div class="emoji">🧘</div><b>Souplesse</b><div class="bar"><i></i></div><div class="small">À mesurer</div></div>
   <div class="card goal"><div class="emoji">🛡️</div><b>Tronc</b><div class="bar"><i></i></div><div class="small">À mesurer</div></div>
 </div>

 ${hasHistory
   ? `<div class="section-head"><h2>Mes premières données</h2><button class="linkbtn" data-route="progress">Voir</button></div>
      <div class="card today-card baseline-card">
        <b>${historyCache.length} séance${historyCache.length>1?"s":""} enregistrée${historyCache.length>1?"s":""}.</b>
        <div class="meta">Ta progression se construit maintenant à partir de ce que tu réalises réellement.</div>
      </div>`
   : `<div class="section-head"><h2>Point de départ</h2></div>
      <div class="card today-card baseline-card">
        <b>La première semaine servira de référence.</b>
        <div class="meta">Tes performances réelles alimenteront automatiquement ta progression.</div>
      </div>`}
 </section>`;
}

function programView(){
 const days=programDays();
 const doneCount=days.filter(d=>d.kind==="done").length;
 const plannedCount=days.filter(d=>d.kind==="planned").length;
 return `<section class="page program-page-final">
   <div class="program-header compact-head">
     <div class="backless">
       <h1>Mon programme</h1>
       <p>Une semaine prévue, adaptable au réel.</p>
     </div>
   </div>

   <div class="week-nav compact-week-nav">
     <button class="round" id="prevWeek" aria-label="Semaine précédente">‹</button>
     <div class="week-label">
       <strong>${formatWeekTitle()}</strong>
       <span>${doneCount} réalisée${doneCount>1?"s":""} · ${plannedCount} prévue${plannedCount>1?"s":""}</span>
     </div>
     <button class="round" id="nextWeek" aria-label="Semaine suivante">›</button>
   </div>

   <div class="program-list program-list-final">
     ${days.map(d=>`
       <div class="program-day program-day-final" data-slot="${d._slot}">
         <div class="datebox ${d.n===8?'today':''}">
           <span>${d.dow}</span>
           <b>${d.n}</b>
         </div>

         <div class="card workout-card workout-card-final ${d.kind==='done'?'done':''}" ${d.id?`data-route="workout-${d.id}"`:''}>
           <span class="program-status-dot ${d.kind==='done'?'done':d.kind==='rest'?'rest-dot':d.n===8?'today':'planned'}"></span>

           <div class="workout-main">
             <div class="workout-name">${d.name}</div>
             ${d.meta ? `<div class="workout-meta">${d.meta.replace(" · réalisé","").replace("≈ ","")}</div>` : ""}
           </div>

           ${d.kind!=="done"
             ? `<button class="drag-handle" type="button" aria-label="Déplacer ${d.name}" data-slot="${d._slot}">
                  <i></i><i></i><i></i>
                </button>`
             : `<div class="drag-handle locked" aria-hidden="true"><i></i><i></i><i></i></div>`}
         </div>
       </div>`).join("")}
   </div>

   <button class="secondary program-wide-action" id="addProgramSession">＋ Ajouter une séance</button>
   <button class="secondary program-wide-action history-open" data-route="history">▥ &nbsp; Historique des séances</button>
 </section>`;
}
function workoutDetail(which="A"){
 const w=which==="D"?MUSCU_D:MUSCU_A;
 const liveRoute=which==="D"?"live-workout-d":"live-workout";
 const hasActive=activeSessionRestored && (LS.planKey===which || (which==="D"&&ACTIVE_PLAN===MUSCU_D) || (which==="A"&&ACTIVE_PLAN===MUSCU_A));
 const currentExercise=hasActive && LIVE[LS.x] ? LIVE[LS.x] : null;

 return `<section class="page">
   <div class="detail-top">
     <button class="backbtn" data-route="sessions">‹</button>
     <div class="detail-title"><h1>Séance prévue</h1><p>${w.name}</p></div>
   </div>

   <div class="card workout-one-card">
     <div class="summary-head">
       <div class="bigemoji">💪</div>
       <div><h2>${w.name}</h2><div class="meta">${w.subtitle}</div></div>
     </div>

     <div class="pills">
       <span class="pill">⏱ ${w.duration}</span>
       <span class="pill">🏋️ ${w.place}</span>
       <span class="pill">📋 ${w.exercises.length} exercices</span>
     </div>

     ${hasActive?`<div class="workout-live-section" data-route="${liveRoute}">
       <div class="workout-live-title">
         <div><span class="live-dot"></span><b>SÉANCE EN COURS</b></div>
         <span>${ft(LS.t)}</span>
       </div>
       <div class="workout-live-content">
         <div class="active-phase-icon">${currentExercise?.i||"▶️"}</div>
         <div class="workout-live-copy">
           <div class="active-phase-label">PHASE ${LS.x+1}/${LIVE.length}</div>
           <h3>${currentExercise?.n||w.name}</h3>
           <p>${currentExercise?.m||""}</p>
         </div>
         <div class="chev">›</div>
       </div>
       <button class="resume-inline" type="button">Reprendre exactement ici ›</button>
     </div>`:""}

     <div class="workout-goal-section">
       <strong>🎯 Objectif de la séance</strong>
       <p>${w.goal}</p>
     </div>
   </div>

   <div class="section-head"><h2>Exercices prévus</h2><button class="linkbtn">Modifier</button></div>
   <div class="exercise-list">${w.exercises.map((e,i)=>`
     <div class="card exercise ${hasActive && i===LS.x?'exercise-current':''}">
       <div class="num">${i+1}</div>
       <div>
         ${hasActive && i===LS.x?`<span class="current-badge">EN COURS</span>`:""}
         <div class="exercise-name">${e.name}</div>
         <div class="exercise-meta">${e.meta}</div>
         <div class="exercise-extra">${e.extra}</div>
         ${e.warmup?`<span class="warmup">${e.warmup}</span>`:''}
       </div>
       <div class="chev">›</div>
     </div>`).join("")}</div>

   <div class="note-card card"><strong>Prévu ≠ réalisé.</strong><br>Le programme reste visible pendant la séance, mais la phase active reprend exactement là où tu l’as laissée.</div>

   <div class="detail-actions">
      <button class="secondary">Adapter la séance</button>
      ${hasActive?`<button class="primary compact" data-route="${liveRoute}">▶ Reprendre</button>`:`<button class="primary compact" data-route="${liveRoute}" data-plan="${which}">▶ Démarrer</button>`}
   </div>
 </section>`;
}

const EXERCISES=[
 {n:"Leg Press horizontale",g:"🦵",m:"Quadriceps · fessiers",t:["Machine","kg + reps"],c:"Jambes"},
 {n:"Leg Curl",g:"🦵",m:"Ischio-jambiers",t:["Machine","kg + reps"],c:"Jambes"},
 {n:"Leg Extension",g:"🦵",m:"Quadriceps",t:["Machine","kg + reps"],c:"Jambes"},
 {n:"Squat au poids du corps",g:"🏋️",m:"Jambes · tronc",t:["Poids du corps","reps"],c:"Jambes"},
 {n:"Tirage vertical",g:"💪",m:"Dos · biceps",t:["Machine","kg + reps"],c:"Tirage"},
 {n:"Rowing assis",g:"💪",m:"Dos · biceps",t:["Machine","kg + reps"],c:"Tirage"},
 {n:"Chest Press",g:"🏋️",m:"Pectoraux · triceps",t:["Machine","kg + reps"],c:"Poussée"},
 {n:"Gainage frontal",g:"🛡️",m:"Tronc",t:["Poids du corps","secondes"],c:"Tronc"},
 {n:"Tapis de marche",g:"🚶",m:"Cardio · échauffement",t:["Cardio","durée + vitesse + pente"],c:"Cardio"},
 {n:"Vélo",g:"🚴",m:"Cardio · jambes",t:["Cardio","durée + résistance"],c:"Cardio"},
 {n:"Mobilité hanches / ischios",g:"🧘",m:"Mobilité · souplesse",t:["Mobilité","durée"],c:"Mobilité"}
];
function catalogView(){
 return `<section class="page">
  <div class="catalog-head"><h1>Exercices</h1><p>Choisis, consulte ou ajoute un exercice.</p></div>
  <label class="searchbox">⌕ <input id="exerciseSearch" placeholder="Rechercher un exercice…" autocomplete="off"></label>
  <div class="chips"><button class="chip active" data-filter="Tous">Tous</button><button class="chip" data-filter="Jambes">🦵 Jambes</button><button class="chip" data-filter="Tirage">💪 Tirage</button><button class="chip" data-filter="Poussée">💪 Poussée</button><button class="chip" data-filter="Tronc">🛡️ Tronc</button><button class="chip" data-filter="Cardio">❤️ Cardio</button><button class="chip" data-filter="Mobilité">🧘 Mobilité</button><button class="chip" data-filter="Autres">••• Autres</button></div>
  <div class="catalog-count"><h2>Catalogue</h2><span id="exerciseCount">${EXERCISES.length} exercices</span></div>
  <div class="exercise-catalog" id="exerciseCatalog">${catalogRows(EXERCISES)}</div>
  <button class="primary">+ Créer un exercice</button>
  <div class="card catalog-footer"><b>Un exercice = une référence unique.</b><p>Ses performances pourront ensuite être comparées d’une séance à l’autre.</p></div>
 </section>`;
}
function slugify(s){return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
function catalogRows(items){return items.map((e,i)=>`<div class="card catalog-item" data-route="exercise-${slugify(e.n)}"><div class="exercise-glyph">${e.g}</div><div><h3>${e.n}</h3><p>${e.m}</p><div class="tags">${e.t.map(x=>`<span class="tag">${x}</span>`).join("")}</div></div><div class="chev">›</div></div>`).join("")}
function bindCatalog(){
 const input=document.querySelector("#exerciseSearch"); if(!input)return;
let activeFilter="Tous";
 const refresh=()=>{const q=input.value.toLowerCase().trim();let items=EXERCISES.filter(e=>(e.n+" "+e.m+" "+e.t.join(" ")).toLowerCase().includes(q));if(activeFilter!=="Tous"){items=activeFilter==="Autres"?items.filter(e=>!["Jambes","Tirage","Poussée","Tronc","Cardio","Mobilité"].includes(e.c)):items.filter(e=>e.c===activeFilter)}document.querySelector("#exerciseCatalog").innerHTML=catalogRows(items);document.querySelector("#exerciseCount").textContent=`${items.length} exercice${items.length>1?"s":""}`;};
 input.addEventListener("input",refresh);
 document.querySelectorAll(".chip").forEach(c=>c.addEventListener("click",()=>{document.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));c.classList.add("active");activeFilter=c.dataset.filter||"Tous";refresh();}));
}


function chestPressDetail(){
 return `<section class="page">
  <div class="exercise-detail-head">
    <button class="backbtn" data-route="new">‹</button>
    <div class="exercise-detail-title"><h1>Chest Press</h1><p>Pectoraux · triceps · machine guidée</p></div>
    <button class="favorite-btn" aria-label="Favori">♡</button>
  </div>

  <div class="card exercise-hero">
    <div class="exercise-hero-main">
      <div class="exercise-hero-icon">🏋️</div>
      <div><h2>Chest Press</h2><div class="sub">Mouvement de poussée pour le haut du corps</div></div>
    </div>
    <div class="metrics-row">
      <div class="metric"><b>Machine</b><span>Matériel</span></div>
      <div class="metric"><b>kg + reps</b><span>Mesure</span></div>
      <div class="metric"><b>Poussée</b><span>Famille</span></div>
    </div>
  </div>

  <div class="info-section"><h2>Muscles sollicités</h2>
    <div class="card info-card"><div class="muscle-tags"><span class="muscle-tag">Pectoraux</span><span class="muscle-tag">Triceps</span><span class="muscle-tag">Épaules</span></div></div>
  </div>

  <div class="info-section"><h2>Exécution</h2>
    <div class="card info-card">
      <div class="steps">
        <div class="step"><div class="step-num">1</div><p>Règle le siège pour que les poignées arrivent à hauteur du milieu de la poitrine.</p></div>
        <div class="step"><div class="step-num">2</div><p>Garde le dos et les omoplates en appui contre le dossier.</p></div>
        <div class="step"><div class="step-num">3</div><p>Pousse sans verrouiller brutalement les coudes, puis reviens lentement.</p></div>
        <div class="step"><div class="step-num">4</div><p>Conserve un mouvement fluide et contrôlé sur toute l’amplitude confortable.</p></div>
      </div>
    </div>
  </div>

  <div class="info-section"><h2>Ta référence actuelle</h2>
    <div class="card progress-preview">
      <div class="progress-preview-top"><h3>Dernière référence</h3><span class="trend">Point de départ</span></div>
      <div class="last-performance">
        <div class="perf"><b>35 kg</b><span>Charge</span></div>
        <div class="perf"><b>10 reps</b><span>Meilleure série</span></div>
        <div class="perf"><b>RPE 8</b><span>Effort</span></div>
      </div>
      <div class="spark"><svg viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="2,31 18,28 34,27 50,23 66,21 82,15 98,11"/></svg></div>
      <button class="secondary" style="width:100%;margin-top:12px">Voir toute la progression</button>
    </div>
  </div>

  <div class="info-section"><h2>Conseil Coach JM</h2>
    <div class="coach-tip"><b>Priorité à la technique.</b> L’objectif n’est pas de charger vite, mais de faire progresser charge, répétitions et contrôle sans dégrader le mouvement.</div>
  </div>

  <button class="primary sticky-action">+ Ajouter à une séance</button>
 </section>`;
}
function genericExerciseDetail(name){
 const e=EXERCISES.find(x=>slugify(x.n)===slugify(name))||EXERCISES[0];
 return `<section class="page">
   <div class="exercise-detail-head"><button class="backbtn" data-route="catalog">‹</button><div class="exercise-detail-title"><h1>${e.n}</h1><p>${e.m}</p></div><button class="favorite-btn">♡</button></div>
   <div class="card exercise-hero"><div class="exercise-hero-main"><div class="exercise-hero-icon">${e.g}</div><div><h2>${e.n}</h2><div class="sub">${e.m}</div></div></div><div class="metrics-row"><div class="metric"><b>${e.t[0]}</b><span>Type</span></div><div class="metric"><b>${e.t[1]||"—"}</b><span>Mesure</span></div><div class="metric"><b>${e.c}</b><span>Famille</span></div></div></div>
   <div class="info-section"><h2>Fiche exercice</h2><div class="card info-card"><p>Cette fiche sera enrichie avec les consignes, les muscles sollicités et ta progression propre à cet exercice.</p></div></div>
   <button class="primary sticky-action">+ Ajouter à une séance</button>
 </section>`;
}


const BUILDER_EXERCISES=[
 {id:"lat-pulldown",n:"Tirage vertical",g:"💪",m:"Dos · biceps",meta:"3 × 8–10 · repos 90 s"},
 {id:"rowing-assis",n:"Rowing assis",g:"💪",m:"Dos · biceps",meta:"3 × 10–12 · repos 90 s"},
 {id:"chest-press",n:"Chest Press",g:"🏋️",m:"Pectoraux · triceps",meta:"3 × 8–10 · repos 90 s"},
 {id:"leg-press",n:"Leg Press horizontale",g:"🦵",m:"Quadriceps · fessiers",meta:"3 × 10–12 · repos 90 s"},
 {id:"gainage",n:"Gainage frontal",g:"🛡️",m:"Tronc",meta:"3 × 30–45 s · repos 45 s"},
 {id:"mobilite",n:"Mobilité hanches / ischios",g:"🧘",m:"Mobilité",meta:"5–8 min"}
];
let builderState={mode:"custom",name:"Haut du corps — Tirage",type:"Tirage",duration:55,goal:"Renforcer le dos et progresser vers la traction.",selected:["lat-pulldown","rowing-assis","gainage"]};


function sessionsView(){
 const models=[
  {icon:"🦵",name:"Muscu A — Jambes",meta:"Jambes · gainage · mobilité",route:"workout-muscu-a"},
  {icon:"💪",name:"Muscu B — Tirage",meta:"Dos · biceps · objectif traction",route:"workout-muscu-a"},
  {icon:"🏋️",name:"Muscu C — Poussée",meta:"Pectoraux · épaules · triceps",route:"workout-muscu-a"},
  {icon:"🔄",name:"Muscu D — Full Body",meta:"Corps entier · traction · tronc",route:"workout-muscu-d"},
  {icon:"❤️",name:"Cardio — Intervalles",meta:"Tapis · blocs de travail",route:"workout-muscu-a"},
  {icon:"🧘",name:"Mobilité",meta:"Souplesse · récupération",route:"workout-muscu-a"}
 ];
 return `<section class="page">
  <div class="program-header"><div class="backless"><h1>Mes séances</h1><p>Choisis une séance à voir ou à démarrer.</p></div></div>
  ${activeSessionRestored?`<div class="resume-card card session-resume">
    <div><b>⏱ Séance en cours</b><span>${ACTIVE_PLAN.name} · exercice ${LS.x+1}/${LIVE.length} · ${ft(LS.t)}</span></div>
    <button class="secondary" data-route="live-workout">Reprendre</button>
  </div>`:""}
  <div class="template-list">
   ${models.map(m=>`<div class="card template-row" data-route="${m.route}"><div class="ico">${m.icon}</div><div><h3>${m.name}</h3><p>${m.meta}</p></div><div class="chev">›</div></div>`).join("")}
  </div>
  <button class="primary" data-route="new" style="margin-top:18px">+ Nouvelle séance</button>
  <div class="hint"><b>Une séance modèle n'est pas une séance réalisée.</b> Tu choisis d'abord le modèle, puis tu peux l'adapter et la démarrer.</div>
 </section>`;
}

function builderStart(){
 return `<section class="page">
  <div class="builder-head"><div><h1>Créer une séance</h1><p class="builder-sub">Choisis un modèle ou pars de zéro.</p></div></div>
  <div class="choice-grid">
    <div class="card choice selected" data-route="builder-info"><div class="ico">➕</div><h3>Séance personnalisée</h3><p>Je choisis mes exercices.</p></div>
    <div class="card choice" data-route="builder-template"><div class="ico">📋</div><h3>À partir d’un modèle</h3><p>Je duplique une séance existante.</p></div>
  </div>
  <div class="section-head"><h2>Modèles proposés</h2></div>
  <div class="template-list">
   ${[
    ["💪","Muscu A — Jambes","Jambes · gainage · mobilité"],
    ["💪","Muscu B — Tirage","Dos · biceps · traction"],
    ["💪","Muscu C — Poussée","Pectoraux · épaules · triceps"],
    ["❤️","Cardio — Intervalles","Tapis · blocs de travail"],
    ["🧘","Mobilité","Souplesse · récupération"]
   ].map((x,i)=>`<div class="card template-row" data-route="builder-info"><div class="ico">${x[0]}</div><div><h3>${x[1]}</h3><p>${x[2]}</p></div><div class="chev">›</div></div>`).join("")}
  </div>
 </section>`;
}
function builderInfo(){
 return `<section class="page">
  <div class="builder-head"><button class="backbtn" data-route="new">‹</button><div><h1>Séance personnalisée</h1><p class="builder-sub">Étape 1 sur 3</p></div></div>
  <div class="stepper"><div class="step-dot active"><b>1</b>Informations</div><div class="step-dot"><b>2</b>Exercices</div><div class="step-dot"><b>3</b>Récapitulatif</div></div>
  <div class="card form-card">
   <div class="field"><label>Nom de la séance</label><input id="builderName" value="${builderState.name}"></div>
   <div class="field"><label>Type principal</label><div class="type-grid">${["Jambes","Tirage","Poussée","Cardio","Mobilité","Tronc","Marche","Autre"].map(t=>`<button class="type-btn ${builderState.type===t?'active':''}" data-type="${t}">${t}</button>`).join("")}</div></div>
   <div class="field"><label>Durée estimée</label><select id="builderDuration"><option>30</option><option>45</option><option ${builderState.duration===55?'selected':''}>55</option><option>60</option><option>75</option></select></div>
   <div class="field"><label>Objectif de la séance</label><textarea id="builderGoal">${builderState.goal}</textarea></div>
  </div>
  <button class="primary" data-route="builder-exercises">Suivant →</button>
 </section>`;
}
function builderExercises(){
 const selected=builderState.selected.map(id=>BUILDER_EXERCISES.find(e=>e.id===id)).filter(Boolean);
 return `<section class="page">
  <div class="builder-head"><button class="backbtn" data-route="builder-info">‹</button><div><h1>Ajouter des exercices</h1><p class="builder-sub">Étape 2 sur 3</p></div></div>
  <div class="stepper"><div class="step-dot"><b>1</b>Informations</div><div class="step-dot active"><b>2</b>Exercices</div><div class="step-dot"><b>3</b>Récapitulatif</div></div>
  <label class="searchbox">⌕ <input id="builderSearch" placeholder="Rechercher un exercice…"></label>
  <div class="section-head"><h2>Exercices disponibles</h2><button class="linkbtn" data-route="catalog">Catalogue</button></div>
  <div class="exercise-picker" id="builderPicker">${BUILDER_EXERCISES.map(e=>`<div class="card pick-row"><div class="ico">${e.g}</div><div><h3>${e.n}</h3><p>${e.m}</p></div><button class="add-circle" data-add="${e.id}">+</button></div>`).join("")}</div>
  <div class="section-head"><h2>Dans ma séance</h2><span class="small">${selected.length} exercices</span></div>
  <div class="selected-list" id="selectedList">${selected.map((e,i)=>`<div class="card selected-row"><div class="drag">☰</div><div><h3>${i+1}. ${e.n}</h3><p>${e.meta}</p></div><button class="remove-btn" data-remove="${e.id}">×</button></div>`).join("")}</div>
  <div class="builder-actions"><button class="secondary" data-route="builder-info">← Retour</button><button class="primary compact" data-route="builder-recap">Suivant →</button></div>
 </section>`;
}
function builderRecap(){
 const selected=builderState.selected.map(id=>BUILDER_EXERCISES.find(e=>e.id===id)).filter(Boolean);
 return `<section class="page">
  <div class="builder-head"><button class="backbtn" data-route="builder-exercises">‹</button><div><h1>Récapitulatif</h1><p class="builder-sub">Étape 3 sur 3</p></div></div>
  <div class="stepper"><div class="step-dot"><b>1</b>Informations</div><div class="step-dot"><b>2</b>Exercices</div><div class="step-dot active"><b>3</b>Récapitulatif</div></div>
  <div class="card recap-card">
   <span class="badge">${builderState.type}</span>
   <h2 style="margin-top:10px">${builderState.name}</h2>
   <p>≈ ${builderState.duration} min · ${selected.length} exercices</p>
   <div class="goalbox"><strong>🎯 Objectif</strong><p>${builderState.goal}</p></div>
   <div class="recap-ex">${selected.map((e,i)=>`<div class="line"><b>${i+1}</b><div><strong>${e.n}</strong><div class="small">${e.meta}</div></div><span>☰</span></div>`).join("")}</div>
  </div>
  <div class="hint"><b>Cette séance devient un modèle.</b> Quand tu la planifieras, chaque séance réalisée gardera son propre historique, même si tu modifies ce modèle plus tard.</div>
  <button class="primary" id="saveTemplate">Enregistrer la séance</button>
 </section>`;
}
function bindBuilder(){
 document.querySelectorAll("[data-type]").forEach(b=>b.addEventListener("click",()=>{builderState.type=b.dataset.type;document.querySelectorAll("[data-type]").forEach(x=>x.classList.toggle("active",x.dataset.type===builderState.type))}));
 const n=document.querySelector("#builderName"),d=document.querySelector("#builderDuration"),g=document.querySelector("#builderGoal");
 if(n)n.addEventListener("input",()=>builderState.name=n.value);
 if(d)d.addEventListener("change",()=>builderState.duration=Number(d.value));
 if(g)g.addEventListener("input",()=>builderState.goal=g.value);
 document.querySelectorAll("[data-add]").forEach(b=>b.addEventListener("click",()=>{if(!builderState.selected.includes(b.dataset.add))builderState.selected.push(b.dataset.add);render("builder-exercises")}));
 document.querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",()=>{builderState.selected=builderState.selected.filter(x=>x!==b.dataset.remove);render("builder-exercises")}));
 const s=document.querySelector("#builderSearch"); if(s)s.addEventListener("input",()=>{const q=s.value.toLowerCase();document.querySelectorAll(".pick-row").forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?"grid":"none")});
 const save=document.querySelector("#saveTemplate"); if(save)save.addEventListener("click",()=>{alert("Séance modèle enregistrée (prototype UI6).");navigate("program")});
}



/* UI7 v16 — la séance en cours est créée à partir de la séance prévue MUSCU_A */
function makeLiveFromPlan(plan=MUSCU_A){
 return plan.exercises.map(e=>{
   const n=e.name;
   if(n.startsWith("Tapis")) return {type:"cardio",n,i:"🚶",m:"Cardio · échauffement",plan:e.meta,ref:e.extra.replace("Prévu : ",""),cardio:{blocks: plan===MUSCU_D
 ? [{duration:3,speed:4.5,incline:0,hr:""},{duration:4,speed:5,incline:5,hr:""},{duration:3,speed:5,incline:8,hr:""},{duration:2,speed:4.5,incline:0,hr:""}]
 : [{duration:3,speed:4.5,incline:0,hr:""},{duration:3,speed:5,incline:3,hr:""}]}};
   if(n==="Squat") return {type:"sets",n,i:"🏋️",m:"Jambes · fessiers · tronc",plan:e.meta,ref:"barre + charge",s:[["",12,7],["",12,8],["",10,8]]};
   if(n==="Leg Press horizontale") return {type:"sets",n,i:"🦵",m:"Quadriceps · fessiers",plan:e.meta,ref:"charge à ajuster",s:[[85,12,7],[85,12,8],[85,10,8]]};
   if(n==="Leg Curl") return {type:"sets",n,i:"🦵",m:"Ischio-jambiers",plan:e.meta,ref:"charge à ajuster",s:[[15,12,7],[20,12,8],[20,10,8]]};
   if(n==="Tirage vertical") return {type:"sets",n,i:"💪",m:"Dos · biceps",plan:e.meta,ref:"charge à ajuster",s:[[35,10,7],[35,10,8],[35,10,8]]};
   if(n==="Chest Press") return {type:"sets",n,i:"🏋️",m:"Pectoraux · triceps",plan:e.meta,ref:"charge à ajuster",s:[[30,10,7],[30,10,8],[30,10,8]]};
   if(n.startsWith("Rowing")) return {type:"sets",n,i:"💪",m:"Dos / ischios",plan:e.meta,ref:"à choisir",s:[["",10,7],["",10,8],["",10,8]]};
   if(n==="Gainage frontal") return {type:"duration",n,i:"🛡️",m:"Tronc",plan:e.meta,ref:"Poids du corps",d:[[40,7],[40,8],[40,8]]};
   return {type:"mobility",n,i:"🧘",m:"Mobilité · souplesse",plan:e.meta,ref:e.extra,mobility:{
     movements:[
       {name:"Chat / vache",target:"8 reps",done:false},
       {name:"Position de l’enfant",target:"30 s",done:false},
       {name:"Fléchisseur hanche gauche",target:"30 s",done:false},
       {name:"Fléchisseur hanche droit",target:"30 s",done:false},
       {name:"Ischios gauche",target:"30 s",done:false},
       {name:"Ischios droit",target:"30 s",done:false}
     ]
   }};
 });
}
let ACTIVE_PLAN=MUSCU_A;
let LIVE=makeLiveFromPlan(ACTIVE_PLAN);
let LS={x:0,t:0,ok:{},rest:0,notes:{}};

function ft(v){let m=Math.floor(v/60),s=v%60;return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}

function liveFields(e){
  const ok=LS.ok[LS.x]||[];
  if(e.type==="cardio"){
    const total=e.cardio.blocks.reduce((sum,b)=>sum+(+b.duration||0),0);
    return `<div class="treadmill-summary"><b>${total} min prévues</b><span>${e.cardio.blocks.length} lignes</span></div>
      <div class="treadmill-table">
        <div class="treadmill-head"><span>Durée</span><span>Vitesse</span><span>Pente</span><span>BPM</span><span></span></div>
        ${e.cardio.blocks.map((b,i)=>`<div class="treadmill-row">
          <div class="tm-input"><input data-bi="${i}" data-bf="duration" inputmode="numeric" value="${b.duration}"><small>min</small></div>
          <div class="tm-input"><input data-bi="${i}" data-bf="speed" inputmode="decimal" value="${b.speed}"><small>km/h</small></div>
          <div class="tm-input"><input data-bi="${i}" data-bf="incline" inputmode="decimal" value="${b.incline}"><small>%</small></div>
          <div class="tm-input"><input data-bi="${i}" data-bf="hr" inputmode="numeric" value="${b.hr}" placeholder="—"><small>bpm</small></div>
          <button class="remove-line" data-remove-block="${i}" ${e.cardio.blocks.length===1?'disabled':''}>×</button>
        </div>`).join("")}
      </div>
      <button class="add-treadmill-line" id="addTreadmillBlock">+ Ajouter une ligne</button>`;
  }
  if(e.type==="sets"){
    const firstOpen=Math.min(ok.length,e.s.length-1);
    const allDone=ok.length>=e.s.length;
    return `<div class="series-head"><span>Série</span><span>Charge</span><span>Reps</span><span>RPE</span><span></span></div>
      ${e.s.map((a,i)=>{
        const done=ok.includes(i);
        const active=!done && i===firstOpen && !allDone;
        const locked=!done && !active;
        return `<div class="series-row ${done?'series-done':active?'series-active':'series-locked'}">
          <span class="series-n">${i+1}</span>
          <input data-li="${i}" data-lf="0" value="${a[0]}" ${done||locked?'disabled':''}>
          <input data-li="${i}" data-lf="1" value="${a[1]}" ${done||locked?'disabled':''}>
          <select data-li="${i}" data-lf="2" ${done||locked?'disabled':''}>${[5,6,7,8,9,10].map(r=>`<option ${+a[2]===r?'selected':''}>${r}</option>`).join("")}</select>
          <button class="set-ok ${done?'checked':''}" data-setok="${i}" ${locked?'disabled':''}>${done?'✓':'○'}</button>
        </div>`;
      }).join("")}
      <button class="add-set-line" id="addSetLine" ${allDone?'':'disabled'}>+ Ajouter une série</button>`; 
  }
  if(e.type==="duration"){
    const firstOpen=Math.min(ok.length,e.d.length-1);
    const allDone=ok.length>=e.d.length;
    return `<div class="series-head"><span>Série</span><span>Temps</span><span>Unité</span><span>RPE</span><span></span></div>
      ${e.d.map((a,i)=>{
        const done=ok.includes(i);
        const active=!done && i===firstOpen && !allDone;
        const locked=!done && !active;
        return `<div class="series-row ${done?'series-done':active?'series-active':'series-locked'}">
          <span class="series-n">${i+1}</span>
          <input data-di="${i}" data-df="0" value="${a[0]}" ${done||locked?'disabled':''}>
          <input value="s" disabled>
          <select data-di="${i}" data-df="1" ${done||locked?'disabled':''}>${[5,6,7,8,9,10].map(r=>`<option ${+a[1]===r?'selected':''}>${r}</option>`).join("")}</select>
          <button class="set-ok ${done?'checked':''}" data-setok="${i}" ${locked?'disabled':''}>${done?'✓':'○'}</button>
        </div>`;
      }).join("")}
      <button class="add-set-line" id="addDurationSet" ${allDone?'':'disabled'}>+ Ajouter une série</button>`; 
  }
  return `<div class="mobility-live">
    <div class="mobility-head"><span>Mouvement</span><span>Prévu</span><span></span></div>
    ${e.mobility.movements.map((mv,i)=>`<div class="mobility-row ${mv.done?'mobility-done':''}">
      <div><b>${mv.name}</b></div>
      <div class="mobility-target">${mv.target}</div>
      <button class="mobility-check ${mv.done?'checked':''}" data-mobility-check="${i}">${mv.done?'✓':'○'}</button>
    </div>`).join("")}
    <button class="add-mobility" id="addMobility">+ Ajouter un mouvement</button>
  </div>`;
}

function liveView(){
 let e=LIVE[LS.x],ok=LS.ok[LS.x]||[];
 return `<section class="page">
   <div class="live-head">
    <button class="backbtn" id="liveBack">‹</button>
    <div><h1>${ACTIVE_PLAN.name}</h1><p>Exercice ${LS.x+1} sur ${LIVE.length}</p></div>
    <div class="live-clock" id="liveClock">${ft(LS.t)}</div>
   </div>
   <div class="live-progress">${LIVE.map((_,i)=>`<i class="${i<LS.x?'done':i===LS.x?'active':''}"></i>`).join("")}</div>
   <div class="card live-card">
    <div class="live-ex-head"><div class="live-icon">${e.i}</div><div><h2>${e.n}</h2><p>${e.m}</p></div></div>
    <div class="live-plan"><span><b>Prévu</b><br>${e.plan}</span><span style="text-align:right"><b>${e.ref}</b><br>référence</span></div>
    ${liveFields(e)}
    ${LS.rest?`<div class="rest"><strong id="restClock">${ft(LS.rest)}</strong><div><b>Repos</b><br><small>avant la prochaine série</small></div><button class="skip" id="skipRest">Passer</button></div>`:''}
    <div class="coach-adapt"><b>Coach JM</b> · ${coachText(e,ok)}</div>
   </div>
   <div class="section-head"><h2>Note rapide</h2></div>
   <textarea class="live-note" id="liveNote" placeholder="Sensations, douleur, difficulté…">${LS.notes[LS.x]||""}</textarea>
   <div class="live-actions"><button class="secondary">Remplacer</button><button class="secondary" data-route="exercise-${slugify(e.n)}">Voir la fiche</button></div>
   ${LS.x<LIVE.length-1?`
     <button class="primary" id="nextLive" ${(e.type==="sets"||e.type==="duration"||e.type==="mobility")&&ok.length===0?'disabled':''}>${e.type==="mobility"?"Mobilité terminée →":"Exercice terminé →"}</button>
     ${(e.type==="sets"||e.type==="duration"||e.type==="mobility")&&ok.length===0?`<button class="skip-exercise" id="skipExercise">Passer cet exercice</button>`:''}
   `:`<button class="primary" id="finishLive" ${(e.type==="sets"||e.type==="duration"||e.type==="mobility")&&ok.length===0?'disabled':''}>${e.type==="mobility"?"Mobilité terminée · Finir la séance ✓":"Terminer la séance ✓"}</button>`}
   <button class="add-live" data-route="catalog">+ Ajouter un exercice</button>
 </section>`;
}

function coachText(e,ok){
 if(!ok.length)return "Valide ce que tu réalises pour que Coach JM adapte la suite.";
 if(e.type==="cardio")return "Échauffement enregistré. Ton ressenti global peut être ajouté dans la note de fin.";
 if(e.type==="mobility")return "Mobilité enregistrée. L’objectif est la régularité, pas de forcer l’amplitude.";
 let idx=ok[ok.length-1],r=e.type==="sets"?+e.s[idx][2]:+e.d[idx][1];
 if(r>=10)return "Au taquet : ne monte pas la difficulté à la série suivante.";
 if(r>=9)return "Très difficile : garde la même difficulté ou baisse si la technique se dégrade.";
 if(r>=8)return "Bonne zone de travail : consolide à ce niveau.";
 return "Tu as de la marge : une petite hausse est possible si la technique reste propre.";
}

function liveDone(){
 return `<section class="page"><div class="card live-done"><div class="check">✅</div><h1>Séance terminée</h1><p>La séance réalisée reprend exactement les exercices de la séance prévue, avec tes valeurs réelles.</p><button class="primary" data-route="workout-summary">Voir le bilan</button></div></section>`;
}

let liveRestTimer=null,liveMainTimer=null;
function bindLive(){
 const liveBack=document.querySelector("#liveBack");
 if(liveBack)liveBack.addEventListener("click",()=>{
   const key=LS.planKey || (ACTIVE_PLAN===MUSCU_D?"D":"A");
   navigate(key==="D"?"workout-muscu-d":"workout-muscu-a");
 });
 document.querySelectorAll("[data-plan]").forEach(btn=>btn.addEventListener("click",()=>{
   ACTIVE_PLAN=btn.dataset.plan==="D"?MUSCU_D:MUSCU_A;
   LIVE=makeLiveFromPlan(ACTIVE_PLAN); LS={x:0,t:0,ok:{},rest:0,notes:{},planKey:(ACTIVE_PLAN===MUSCU_D?"D":"A")}; activeSessionRestored=true; persistActiveSession();
 }));
 if(document.querySelector("#liveClock")&&!liveMainTimer){let autosaveTicks=0;liveMainTimer=setInterval(()=>{LS.t++;autosaveTicks++;let c=document.querySelector("#liveClock");if(c)c.textContent=ft(LS.t);if(autosaveTicks%10===0)persistActiveSession()},1000);}

 document.querySelectorAll("[data-lf]").forEach(x=>x.addEventListener("change",()=>{LIVE[LS.x].s[+x.dataset.li][+x.dataset.lf]=x.dataset.lf==="2"?+x.value:x.value; persistActiveSession();}));
 document.querySelectorAll("[data-df]").forEach(x=>x.addEventListener("change",()=>{LIVE[LS.x].d[+x.dataset.di][+x.dataset.df]=+x.value; persistActiveSession();}));
 document.querySelectorAll("[data-bf]").forEach(x=>x.addEventListener("change",()=>{
   const b=LIVE[LS.x].cardio.blocks[+x.dataset.bi], f=x.dataset.bf;
   b[f]=(f==="hr")?x.value:(+x.value||0); persistActiveSession();
 }));
 const addBlock=document.querySelector("#addTreadmillBlock");
 if(addBlock)addBlock.addEventListener("click",()=>{
   LIVE[LS.x].cardio.blocks.push({duration:2,speed:5,incline:0,hr:""});
   persistActiveSession(); render("live-workout");
 });
 document.querySelectorAll("[data-remove-block]").forEach(b=>b.addEventListener("click",()=>{
   if(LIVE[LS.x].cardio.blocks.length>1)LIVE[LS.x].cardio.blocks.splice(+b.dataset.removeBlock,1);
   render("live-workout");
 }));

 const addSet=document.querySelector("#addSetLine");
 if(addSet)addSet.addEventListener("click",()=>{
   const e=LIVE[LS.x], last=e.s[e.s.length-1]||["",10,7];
   e.s.push([last[0],last[1],7]);
   persistActiveSession(); render("live-workout");
 });
 const addDuration=document.querySelector("#addDurationSet");
 if(addDuration)addDuration.addEventListener("click",()=>{
   const e=LIVE[LS.x], last=e.d[e.d.length-1]||[40,7];
   e.d.push([last[0],7]);
   render("live-workout");
 });
 document.querySelectorAll("[data-setok]").forEach(b=>b.addEventListener("click",()=>{
   LS.ok[LS.x]=LS.ok[LS.x]||[];
   let i=+b.dataset.setok;
   if(LS.ok[LS.x].includes(i)){
     // Correction: reopen this set and every later validated set.
     LS.ok[LS.x]=LS.ok[LS.x].filter(v=>v<i);
     LS.rest=0;
     if(liveRestTimer)clearInterval(liveRestTimer);
     liveRestTimer=null;
     persistActiveSession(); render("live-workout");
     return;
   }
   LS.ok[LS.x].push(i);
   LS.ok[LS.x].sort((a,b)=>a-b);
   LS.rest=(LIVE[LS.x].n==="Leg Curl"?75:LIVE[LS.x].type==="duration"?45:90);
   persistActiveSession(); render("live-workout"); startLiveRest();
 }));

 const block=document.querySelector("#completeBlock");
 if(block)block.addEventListener("click",()=>{
   LS.ok[LS.x]=[0];
   let e=LIVE[LS.x];
   if(e.type==="cardio"){
     // Values are already synchronized block by block.
   }
   render("live-workout");
 });

 document.querySelectorAll("[data-mobility-check]").forEach(btn=>btn.addEventListener("click",()=>{
   const e=LIVE[LS.x], i=+btn.dataset.mobilityCheck;
   e.mobility.movements[i].done=!e.mobility.movements[i].done; persistActiveSession();
   LS.ok[LS.x]=e.mobility.movements.some(m=>m.done)?[0]:[];
   persistActiveSession(); render("live-workout");
 }));
 const addMob=document.querySelector("#addMobility");
 if(addMob)addMob.addEventListener("click",()=>{
   const name=window.prompt("Nom du mouvement à ajouter");
   if(!name)return;
   const target=window.prompt("Durée ou répétitions prévues","30 s")||"";
   LIVE[LS.x].mobility.movements.push({name,target,done:false}); persistActiveSession();
   render("live-workout");
 });
 let n=document.querySelector("#liveNote"); if(n)n.addEventListener("input",()=>{LS.notes[LS.x]=n.value; persistActiveSession();});
 let skipEx=document.querySelector("#skipExercise");
 if(skipEx)skipEx.addEventListener("click",()=>{
   const reason=window.prompt("Pourquoi passes-tu cet exercice ?\n\nDouleur · Machine occupée · Fatigue · Autre","Machine occupée");
   if(reason===null)return;
   LS.notes[LS.x]=`Exercice passé — ${reason}`; persistActiveSession();
   LS.x++; LS.rest=0; persistActiveSession(); render("live-workout");
 });
 let nx=document.querySelector("#nextLive"); if(nx)nx.addEventListener("click",()=>{
   const e=LIVE[LS.x];
   // Cardio/mobility have no separate validation button: finishing the exercise validates the block.
   if(e.type==="cardio") LS.ok[LS.x]=[0];
   LS.x++; LS.rest=0; persistActiveSession(); render("live-workout");
 });
 let f=document.querySelector("#finishLive"); if(f)f.addEventListener("click",async ()=>{
   const e=LIVE[LS.x];
   if(e.type==="cardio") LS.ok[LS.x]=[0];
   await persistActiveSession();
   await clearActiveSession();
   activeSessionRestored=false;
   render("live-complete");
 });
 let sk=document.querySelector("#skipRest"); if(sk)sk.addEventListener("click",()=>{LS.rest=0;if(liveRestTimer)clearInterval(liveRestTimer);liveRestTimer=null;persistActiveSession();render("live-workout")});
}
function startLiveRest(){if(liveRestTimer)clearInterval(liveRestTimer);liveRestTimer=setInterval(()=>{if(LS.rest<=0){clearInterval(liveRestTimer);liveRestTimer=null;return}LS.rest--;let c=document.querySelector("#restClock");if(c)c.textContent=ft(LS.rest)},1000)}


function completedCount(i){
 const e=LIVE[i], ok=LS.ok[i]||[];
 if(e.type==="sets"||e.type==="duration")return ok.length;
 if(e.type==="cardio")return ok.length?1:0;
 if(e.type==="mobility")return e.mobility.movements.filter(m=>m.done).length;
 return 0;
}
function plannedCount(e){
 if(e.type==="sets")return e.s.length;
 if(e.type==="duration")return e.d.length;
 if(e.type==="cardio")return 1;
 if(e.type==="mobility")return e.mobility.movements.length;
 return 0;
}
function tonnage(){
 let t=0;
 LIVE.forEach((e,i)=>{
  if(e.type!=="sets")return;
  (LS.ok[i]||[]).forEach(si=>{
   const s=e.s[si],load=parseFloat(s[0]),reps=parseFloat(s[1]);
   if(Number.isFinite(load)&&Number.isFinite(reps))t+=load*reps;
  });
 });
 return Math.round(t);
}
function workoutSummary(){
 const exDone=LIVE.filter((e,i)=>completedCount(i)>0).length;
 const setsDone=LIVE.reduce((s,e,i)=>s+((e.type==="sets"||e.type==="duration")?(LS.ok[i]||[]).length:0),0);
 const setsPlan=LIVE.reduce((s,e)=>s+(e.type==="sets"?e.s.length:e.type==="duration"?e.d.length:0),0);
 const cardio=LIVE.find(e=>e.type==="cardio");
 const mobility=LIVE.find(e=>e.type==="mobility");
 const cardioMin=cardio?cardio.cardio.blocks.reduce((s,b)=>s+(+b.duration||0),0):0;
 const cardioMax=cardio?Math.max(0,...cardio.cardio.blocks.map(b=>+b.hr||0)):0;
 const mobDone=mobility?mobility.mobility.movements.filter(m=>m.done).length:0;
 const mobTotal=mobility?mobility.mobility.movements.length:0;
 return `<section class="page">
  <div class="detail-top"><button class="backbtn" data-route="live-complete">‹</button><div class="detail-title"><h1>Bilan de séance</h1><p>${ACTIVE_PLAN.name}</p></div></div>

  <div class="card summary">
   <div class="summary-head"><div class="bigemoji">✅</div><div><h2>Séance réalisée</h2><div class="meta">${ft(LS.t)} · ${exDone}/${LIVE.length} exercices</div></div></div>
   <div class="metrics-row">
    <div class="metric"><b>${exDone}/${LIVE.length}</b><span>Exercices</span></div>
    <div class="metric"><b>${setsDone}/${setsPlan}</b><span>Séries</span></div>
    <div class="metric"><b>${tonnage().toLocaleString("fr-FR")} kg</b><span>Tonnage</span></div>
   </div>
  </div>

  <div class="section-head"><h2>Prévu vs réalisé</h2></div>
  <div class="summary-ex-list">
   ${LIVE.map((e,i)=>{
    const done=completedCount(i),planned=plannedCount(e);
    let detail="";
    if(e.type==="sets")detail=(LS.ok[i]||[]).map(si=>`${e.s[si][0]} kg × ${e.s[si][1]} · RPE ${e.s[si][2]}`).join(" · ");
    if(e.type==="duration")detail=(LS.ok[i]||[]).map(si=>`${e.d[si][0]} s · RPE ${e.d[si][1]}`).join(" · ");
    if(e.type==="cardio")detail=e.cardio.blocks.map(b=>`${b.duration} min · ${b.speed} km/h · ${b.incline}%${b.hr?` · ${b.hr} bpm`:""}`).join(" / ");
    if(e.type==="mobility")detail=e.mobility.movements.filter(m=>m.done).map(m=>m.name).join(" · ");
    return `<div class="card summary-ex"><div class="summary-ex-top"><div><b>${e.i} ${e.n}</b><div class="small">${e.plan}</div></div><span class="status-pill ${done?'done-pill':'skip-pill'}">${done?`${done}/${planned}`:"Passé"}</span></div>${detail?`<div class="summary-ex-detail">${detail}</div>`:""}${LS.notes[i]?`<div class="summary-note">${LS.notes[i]}</div>`:""}</div>`;
   }).join("")}
  </div>

  <div class="section-head"><h2>Cardio</h2></div>
  <div class="card recap-card"><div class="last-performance"><div class="perf"><b>${cardioMin} min</b><span>Durée</span></div><div class="perf"><b>${cardio?cardio.cardio.blocks.length:0}</b><span>Blocs</span></div><div class="perf"><b>${cardioMax||"—"} bpm</b><span>FC max relevée</span></div></div></div>

  <div class="section-head"><h2>Mobilité</h2></div>
  <div class="card recap-card"><div class="progress-preview-top"><h3>${mobDone}/${mobTotal} mouvements réalisés</h3><span class="trend">${mobDone===mobTotal?"Complet":"Partiel"}</span></div></div>

  <div class="section-head"><h2>Mon ressenti</h2></div>
  <div class="card feedback-card">
   <div class="feedback-grid">
    <label>Énergie<select id="fbEnergy"><option>1</option><option>2</option><option>3</option><option selected>4</option><option>5</option></select></label>
    <label>Motivation<select id="fbMotivation"><option>1</option><option>2</option><option>3</option><option selected>4</option><option>5</option></select></label>
    <label>RPE global<select id="fbRpe"><option>5</option><option>6</option><option selected>7</option><option>8</option><option>9</option><option>10</option></select></label>
    <label>Sommeil<select id="fbSleep"><option>1</option><option>2</option><option>3</option><option selected>4</option><option>5</option></select></label>
   </div>
   <label class="feedback-check"><input type="checkbox" id="fbPain"> Gêne ou douleur pendant la séance</label>
   <textarea class="quick-note" id="fbNote" placeholder="Comment s’est passée la séance ?"></textarea>
  </div>

  <div class="hint"><b>Sauvegarde réelle.</b> Une fois enregistré, ce bilan reste dans l’historique local de Coach JM.</div>
  <button class="primary" id="saveWorkoutSummary">Enregistrer le bilan</button>
 </section>`;
}
function bindSummary(){
 const b=document.querySelector("#saveWorkoutSummary");if(!b)return;
 b.addEventListener("click",async ()=>{
   b.disabled=true; b.textContent="Enregistrement…";
   const feedback={
     energy:+document.querySelector("#fbEnergy").value,
     motivation:+document.querySelector("#fbMotivation").value,
     globalRpe:+document.querySelector("#fbRpe").value,
     sleepQuality:+document.querySelector("#fbSleep").value,
     discomfort:document.querySelector("#fbPain").checked,
     note:document.querySelector("#fbNote").value
   };
   try{
     await saveCompletedWorkout(feedback);
     activeSessionRestored=false;
     b.textContent="✓ Enregistré";
     navigate("history");
   }catch(err){
     console.error(err); b.disabled=false; b.textContent="Réessayer";
     alert("Impossible d’enregistrer la séance.");
   }
 });
}


function fmtDateFr(iso){
 const d=new Date(iso);
 return d.toLocaleDateString("fr-FR",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"});
}
function historyView(){
 return `<section class="page">
  <div class="detail-top"><button class="backbtn" data-route="program">‹</button><div class="detail-title"><h1>Historique</h1><p>${historyCache.length} séance${historyCache.length>1?"s":""} enregistrée${historyCache.length>1?"s":""} · sauvegarde locale</p></div></div>
  ${historyCache.length?`<div class="history-list">${historyCache.map(s=>`
    <div class="card history-row" data-history-id="${s.id}">
      <div><b>${s.templateName}</b><div class="small">${fmtDateFr(s.endedAt)} · ${ft(s.elapsedSeconds||0)}</div></div>
      <div class="history-meta"><span>RPE ${s.feedback?.globalRpe??"—"}</span><span>${s.exercises?.length||0} ex.</span><span class="chev">›</span></div>
    </div>`).join("")}</div>`:
    `<div class="card placeholder"><h2>Aucune séance enregistrée</h2><p>Ta première séance sauvegardée apparaîtra ici.</p></div>`}
 </section>`;
}


let selectedHistoryId=null;
function historyDetailView(){
 const s=historyCache.find(x=>x.id===selectedHistoryId);
 if(!s)return `<section class="page"><div class="detail-top"><button class="backbtn" data-route="history">‹</button><div class="detail-title"><h1>Séance introuvable</h1></div></div></section>`;
 const done=s.completed||{}, notes=s.notes||{}, ex=s.exercises||[];
 const exDone=ex.filter((e,i)=>{
   if(e.type==="mobility")return e.mobility?.movements?.some(m=>m.done);
   return (done[i]||[]).length>0;
 }).length;
 return `<section class="page">
   <div class="detail-top"><button class="backbtn" data-route="history">‹</button><div class="detail-title"><h1>${s.templateName}</h1><p>${fmtDateFr(s.endedAt)}</p></div></div>
   <div class="card summary">
     <div class="summary-head"><div class="bigemoji">✓</div><div><h2>Séance enregistrée</h2><div class="meta">${ft(s.elapsedSeconds||0)} · ${exDone}/${ex.length} exercices</div></div></div>
     <div class="metrics-row">
       <div class="metric"><b>${s.feedback?.globalRpe??"—"}</b><span>RPE global</span></div>
       <div class="metric"><b>${s.feedback?.energy??"—"}/5</b><span>Énergie</span></div>
       <div class="metric"><b>${s.feedback?.sleepQuality??"—"}/5</b><span>Sommeil</span></div>
     </div>
   </div>
   <div class="section-head"><h2>Exercices réalisés</h2></div>
   <div class="summary-ex-list">
   ${ex.map((e,i)=>{
      const ok=done[i]||[];
      let detail="";
      if(e.type==="sets") detail=ok.map(si=>`${e.s[si][0]} kg × ${e.s[si][1]} · RPE ${e.s[si][2]}`).join(" · ");
      else if(e.type==="duration") detail=ok.map(si=>`${e.d[si][0]} s · RPE ${e.d[si][1]}`).join(" · ");
      else if(e.type==="cardio") detail=(e.cardio?.blocks||[]).map(b=>`${b.duration} min · ${b.speed} km/h · ${b.incline}%${b.hr?` · ${b.hr} bpm`:""}`).join(" / ");
      else if(e.type==="mobility") detail=(e.mobility?.movements||[]).filter(m=>m.done).map(m=>`${m.name} · ${m.target}`).join(" · ");
      const realized=e.type==="mobility"?(e.mobility?.movements||[]).filter(m=>m.done).length:ok.length;
      return `<div class="card summary-ex"><div class="summary-ex-top"><div><b>${e.i||""} ${e.n}</b><div class="small">${e.plan||""}</div></div><span class="status-pill ${realized?'done-pill':'skip-pill'}">${realized?"Réalisé":"Passé"}</span></div>${detail?`<div class="summary-ex-detail">${detail}</div>`:""}${notes[i]?`<div class="summary-note">${notes[i]}</div>`:""}</div>`;
   }).join("")}
   </div>
   <div class="section-head"><h2>Ressenti</h2></div>
   <div class="card feedback-card">
      <div class="history-feedback"><span>Énergie <b>${s.feedback?.energy??"—"}/5</b></span><span>Motivation <b>${s.feedback?.motivation??"—"}/5</b></span><span>RPE <b>${s.feedback?.globalRpe??"—"}</b></span><span>Sommeil <b>${s.feedback?.sleepQuality??"—"}/5</b></span></div>
      ${s.feedback?.discomfort?`<div class="summary-note">⚠️ Gêne ou douleur signalée</div>`:""}
      ${s.feedback?.note?`<div class="summary-note">${s.feedback.note}</div>`:""}
   </div>
 </section>`;
}


function normalizeName(s){return (s||"").trim().toLowerCase();}
function completedSessionsAsc(){
 return [...historyCache].sort((a,b)=>new Date(a.endedAt)-new Date(b.endedAt));
}
function strengthPoint(session,e,i){
 const ok=(session.completed||{})[i]||[];
 const sets=ok.map(si=>e.s?.[si]).filter(Boolean);
 if(!sets.length)return null;
 const volume=sets.reduce((sum,x)=>sum+(+x[0]||0)*(+x[1]||0),0);
 const maxLoad=Math.max(...sets.map(x=>+x[0]||0));
 const repsAtMax=sets.filter(x=>(+x[0]||0)===maxLoad).reduce((m,x)=>Math.max(m,+x[1]||0),0);
 const avgRpe=sets.reduce((s,x)=>s+(+x[2]||0),0)/sets.length;
 return {date:session.endedAt,sessionId:session.id,volume,maxLoad,repsAtMax,avgRpe,sets:sets.length};
}
function cardioPoint(session,e){
 const b=(e.cardio?.blocks||[]).filter(x=>(+x.duration||0)>0);
 if(!b.length)return null;
 const total=b.reduce((s,x)=>s+(+x.duration||0),0);
 const maxSpeed=Math.max(...b.map(x=>+x.speed||0));
 const maxIncline=Math.max(...b.map(x=>+x.incline||0));
 const hrs=b.map(x=>+x.hr||0).filter(Boolean);
 const avgHr=hrs.length?Math.round(hrs.reduce((a,c)=>a+c,0)/hrs.length):null;
 return {date:session.endedAt,sessionId:session.id,total,maxSpeed,maxIncline,avgHr};
}
function durationPoint(session,e,i){
 const ok=(session.completed||{})[i]||[];
 const vals=ok.map(si=>e.d?.[si]).filter(Boolean);
 if(!vals.length)return null;
 return {date:session.endedAt,sessionId:session.id,best:Math.max(...vals.map(x=>+x[0]||0)),total:vals.reduce((s,x)=>s+(+x[0]||0),0)};
}
function buildProgress(){
 const map=new Map();
 completedSessionsAsc().forEach(s=>(s.exercises||[]).forEach((e,i)=>{
   const key=normalizeName(e.n);
   if(!key)return;
   if(!map.has(key))map.set(key,{name:e.n,icon:e.i||"🏋️",type:e.type,points:[]});
   let p=null;
   if(e.type==="sets")p=strengthPoint(s,e,i);
   else if(e.type==="cardio")p=cardioPoint(s,e);
   else if(e.type==="duration")p=durationPoint(s,e,i);
   if(p)map.get(key).points.push(p);
 }));
 return [...map.values()].filter(x=>x.points.length);
}
function pctChange(a,b){
 if(!a||a===0)return null;
 return Math.round(((b-a)/a)*100);
}
function deltaText(item){
 const p=item.points;if(p.length<2)return "1 séance enregistrée";
 const a=p[0],b=p[p.length-1];
 if(item.type==="sets"){
   const d=pctChange(a.volume,b.volume);
   const load=b.maxLoad-a.maxLoad;
   if(load>0)return `+${load} kg sur la meilleure charge`;
   if(d!==null&&d!==0)return `${d>0?"+":""}${d}% de volume`;
   return "Performance stable";
 }
 if(item.type==="cardio"){
   const d=(b.maxSpeed-a.maxSpeed).toFixed(1);
   return +d===0?"Vitesse max stable":`${+d>0?"+":""}${d} km/h en vitesse max`;
 }
 if(item.type==="duration"){
   const d=b.best-a.best; return d===0?"Durée stable":`${d>0?"+":""}${d} s sur la meilleure série`;
 }
 return `${p.length} séances`;
}
function sparkBars(item){
 const vals=item.points.slice(-8).map(p=>item.type==="sets"?p.volume:item.type==="cardio"?p.maxSpeed:p.best);
 const max=Math.max(...vals,1);
 return `<div class="spark">${vals.map((v,i)=>`<span style="height:${Math.max(12,Math.round(v/max*100))}%" title="${v}"></span>`).join("")}</div>`;
}
let selectedProgressName=null;
let selectedProgressCategory="Tout";

function progressCategory(item){
 const n=normalizeName(item.name);
 if(item.type==="cardio" || /tapis|vélo|rameur|elliptique|marche|course/.test(n)) return "Cardio";
 if(/squat|leg press|leg curl|leg extension|fente|mollet|hip thrust/.test(n)) return "Jambes";
 if(/tirage|rowing|traction|lat pull|pulldown/.test(n)) return "Tirage";
 if(/chest|développé|developpe|pompe|shoulder|élévation|elevation/.test(n)) return "Poussée";
 if(item.type==="duration" || /gainage|planche|abdo|crunch|dead bug/.test(n)) return "Abdos/Gainage";
 if(item.type==="mobility" || /mobilité|mobilite|étirement|etirement/.test(n)) return "Mobilité";
 return "Autres";
}
function progressionView(){
 const allItems=buildProgress();
 const categories=["Tout","Cardio","Jambes","Tirage","Poussée","Abdos/Gainage","Mobilité"];
 const items=selectedProgressCategory==="Tout"?allItems:allItems.filter(x=>progressCategory(x)===selectedProgressCategory);
 return `<section class="page">
  <div class="program-header"><div class="backless"><h1>Progression</h1><p>Ce qui change réellement au fil de tes séances.</p></div></div>
  <div class="progress-filters">${categories.map(c=>`<button class="progress-filter ${selectedProgressCategory===c?"active":""}" data-progress-category="${c}">${c}</button>`).join("")}</div>
  ${!allItems.length?`<div class="card placeholder"><h2>Pas encore assez de données</h2><p>Termine une séance pour commencer le suivi.</p></div>`:
  `<div class="progress-intro card"><b>${historyCache.length} séance${historyCache.length>1?"s":""} analysée${historyCache.length>1?"s":""}</b><span>Calculé uniquement à partir de tes séances enregistrées.</span></div>
   ${items.length?`<div class="progress-list">${items.map(item=>{
      const last=item.points[item.points.length-1];
      const main=item.type==="sets"?`${last.maxLoad} kg × ${last.repsAtMax}`:item.type==="cardio"?`${last.maxSpeed} km/h · ${last.maxIncline}%`: `${last.best} s`;
      return `<div class="card progress-card" data-progress-name="${encodeURIComponent(item.name)}">
        <div class="progress-card-head"><div><span class="progress-icon">${item.icon}</span><b>${item.name}</b></div><span>${item.points.length} séance${item.points.length>1?"s":""} ›</span></div>
        <div class="progress-main"><div><strong>${main}</strong><span>Dernière performance</span></div>${sparkBars(item)}</div>
        <div class="progress-delta">${deltaText(item)}</div>
      </div>`;
   }).join("")}</div>`:`<div class="card placeholder"><h2>Aucune donnée ${selectedProgressCategory}</h2><p>Cette catégorie apparaîtra dès qu'une séance correspondante sera enregistrée.</p></div>`}`}
 </section>`;
}
function progressionDetailView(){
 const item=buildProgress().find(x=>x.name===selectedProgressName);
 if(!item)return `<section class="page"><div class="detail-top"><button class="backbtn" data-route="progress">‹</button><div class="detail-title"><h1>Progression</h1></div></div></section>`;
 return `<section class="page">
  <div class="detail-top"><button class="backbtn" data-route="progress">‹</button><div class="detail-title"><h1>${item.icon} ${item.name}</h1><p>${item.points.length} performance${item.points.length>1?"s":""} enregistrée${item.points.length>1?"s":""}</p></div></div>
  <div class="card progress-hero">
    <div class="eyebrow">ÉVOLUTION</div><h2>${deltaText(item)}</h2>${sparkBars(item)}
  </div>
  <div class="section-head"><h2>Historique</h2></div>
  <div class="progress-table">
   ${[...item.points].reverse().map(p=>`<div class="card progress-row">
     <div><b>${fmtDateFr(p.date)}</b><span>${item.type==="sets"?`${p.sets} séries · RPE moy. ${p.avgRpe.toFixed(1)}`:item.type==="cardio"?`${p.total} min${p.avgHr?` · ${p.avgHr} bpm`:""}`:`${p.total} s au total`}</span></div>
     <div class="progress-values">${item.type==="sets"?`<b>${p.maxLoad} kg × ${p.repsAtMax}</b><span>${Math.round(p.volume)} kg volume</span>`:item.type==="cardio"?`<b>${p.maxSpeed} km/h</b><span>pente ${p.maxIncline}%</span>`:`<b>${p.best} s</b><span>meilleure série</span>`}</div>
   </div>`).join("")}
  </div>
 </section>`;
}


function latestStrengthStats(){
 const items=buildProgress().filter(x=>x.type==="sets");
 return items.map(item=>{
   const p=item.points;
   const last=p[p.length-1];
   const prev=p.length>1?p[p.length-2]:null;
   return {item,last,prev};
 });
}
function latestCardioStats(){
 const items=buildProgress().filter(x=>x.type==="cardio");
 return items.map(item=>{
   const p=item.points;
   return {item,last:p[p.length-1],prev:p.length>1?p[p.length-2]:null};
 });
}
function latestFeedback(){
 const s=[...historyCache].sort((a,b)=>new Date(b.endedAt)-new Date(a.endedAt))[0];
 return s?.feedback||null;
}
function coachRecommendations(){
 const out=[];
 const strength=latestStrengthStats();
 const cardio=latestCardioStats();
 const fb=latestFeedback();

 strength.forEach(({item,last,prev})=>{
   if(last.avgRpe>=9.5){
     out.push({
       priority:1,icon:"⚠️",title:item.name,
       text:`Dernière séance très proche de l’échec (RPE moyen ${last.avgRpe.toFixed(1)}). Garde la charge ou baisse légèrement avant de chercher à progresser.`,
       tag:"Récupération"
     });
   }else if(prev && last.maxLoad>prev.maxLoad && last.avgRpe<=8.5){
     out.push({
       priority:2,icon:"↗️",title:item.name,
       text:`Tu as augmenté la charge sans exploser le RPE. Tu peux consolider cette charge avant la prochaine hausse.`,
       tag:"Progression"
     });
   }else if(prev && last.volume>prev.volume*1.08 && last.avgRpe<=9){
     out.push({
       priority:2,icon:"📈",title:item.name,
       text:`Le volume progresse. Reste sur cette zone encore une séance pour confirmer.`,
       tag:"Volume"
     });
   }
 });

 cardio.forEach(({item,last,prev})=>{
   if(prev && last.maxSpeed>prev.maxSpeed){
     out.push({
       priority:3,icon:"❤️",title:item.name,
       text:`Ta vitesse maximale monte. Continue progressivement sans augmenter vitesse et pente en même temps.`,
       tag:"Cardio"
     });
   }else if(last.avgHr && prev?.avgHr && last.avgHr<prev.avgHr && last.maxSpeed>=prev.maxSpeed){
     out.push({
       priority:2,icon:"❤️",title:item.name,
       text:`Même niveau d’effort avec une fréquence cardiaque plus basse : bon signe d’efficacité cardio.`,
       tag:"Cardio"
     });
   }
 });

 if(fb){
   if(fb.globalRpe>=9){
     out.push({priority:1,icon:"🛌",title:"Récupération",text:"Ta dernière séance était très exigeante. Prévois une séance plus légère ou une journée de récupération avant de recharger.",tag:"Récupération"});
   }
   if(fb.sleepQuality<=2){
     out.push({priority:1,icon:"🌙",title:"Sommeil",text:"Sommeil bas sur la dernière séance : évite de transformer cette journée en séance maximale.",tag:"À surveiller"});
   }
   if(fb.discomfort){
     out.push({priority:1,icon:"⚠️",title:"Gêne signalée",text:"Une gêne ou douleur a été signalée. Sur la prochaine séance, privilégie le mouvement confortable et évite de forcer sur la zone concernée.",tag:"À surveiller"});
   }
 }

 if(!out.length && historyCache.length){
   out.push({priority:3,icon:"✅",title:"Continuer",text:"Pas de signal particulier pour l’instant. Continue à enregistrer tes séances pour que Coach JM affine ses recommandations.",tag:"Stable"});
 }
 if(!historyCache.length){
   out.push({priority:3,icon:"📝",title:"Première étape",text:"Enregistre quelques séances pour obtenir des recommandations personnalisées basées sur tes performances réelles.",tag:"Données"});
 }

 return out.sort((a,b)=>a.priority-b.priority).slice(0,6);
}

function coachView(){
 const recs=coachRecommendations();
 const last=[...historyCache].sort((a,b)=>new Date(b.endedAt)-new Date(a.endedAt))[0];
 return `<section class="page">
   <div class="program-header">
     <div class="backless"><h1>Conseils Coach JM</h1><p>Des recommandations basées sur tes séances enregistrées.</p></div>
   </div>

   <div class="card coach-overview">
     <div><b>${historyCache.length}</b><span>séance${historyCache.length>1?"s":""} analysée${historyCache.length>1?"s":""}</span></div>
     <div><b>${last?.feedback?.globalRpe??"—"}</b><span>RPE dernière séance</span></div>
     <div><b>${last?.feedback?.energy??"—"}/5</b><span>Énergie</span></div>
   </div>

   <div class="section-head"><h2>À retenir maintenant</h2></div>
   <div class="coach-rec-list">
     ${recs.map(r=>`<div class="card coach-rec ${r.priority===1?"coach-rec-priority":""}">
       <div class="coach-rec-top"><span class="coach-rec-icon">${r.icon}</span><div><b>${r.title}</b><span>${r.tag}</span></div></div>
       <p>${r.text}</p>
     </div>`).join("")}
   </div>

   <div class="hint"><b>Important.</b> Coach JM ne remplace pas ton ressenti : si une douleur apparaît, la priorité reste d’adapter ou arrêter le mouvement concerné.</div>
 </section>`;
}


async function exportCoachData(){
 try{
   const sessions=(await dbGetAll("workoutSessions"))
     .filter(x=>x&&x.type==="workout_session");
   const active=await dbGet("meta",ACTIVE_SESSION_ID);
   const payload={
     app:"Coach JM",
     version:1,
     exportedAt:new Date().toISOString(),
     workoutSessions:sessions,
     activeSession:active||null
   };
   const text=JSON.stringify(payload,null,2);
   const blob=new Blob([text],{type:"application/json"});
   const d=new Date();
   const stamp=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
   const filename=`coach-jm-sauvegarde-${stamp}.json`;

   /* iPhone/PWA : Web Share API si le partage de fichier est disponible. */
   const file=new File([blob],filename,{type:"application/json"});
   if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
     await navigator.share({
       files:[file],
       title:"Sauvegarde Coach JM"
     });
     return;
   }

   /* Fallback navigateur classique. */
   const url=URL.createObjectURL(blob);
   const a=document.createElement("a");
   a.href=url;
   a.download=filename;
   a.style.display="none";
   document.body.appendChild(a);
   a.click();
   a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1500);
 }catch(e){
   if(e?.name==="AbortError")return;
   console.error("Coach JM export",e);
   alert(`Impossible d'effectuer la sauvegarde : ${e?.message||"erreur inconnue"}`);
 }
}
async function importCoachData(file){
 try{
   const txt=await file.text();
   const data=JSON.parse(txt);
   if(data?.app!=="Coach JM" || !Array.isArray(data.workoutSessions)) throw new Error("Format invalide");
   if(!confirm(`Restaurer ${data.workoutSessions.length} séance(s) depuis cette sauvegarde ?`))return;
   for(const s of data.workoutSessions) await dbPut("workoutSessions",s);
   if(data.activeSession) await dbPut("meta",data.activeSession);
   historyCache=await dbGetAll("workoutSessions");
   alert("Sauvegarde restaurée.");
   render("more");
 }catch(e){
   console.error(e);alert("Ce fichier n'est pas une sauvegarde Coach JM valide.");
 }
}
function backupView(){
 return `<section class="page">
  <div class="detail-top"><button class="backbtn" data-route="more">‹</button><div class="detail-title"><h1>Sauvegarde</h1><p>Protège tes séances et ton historique.</p></div></div>
  <div class="card backup-status">
    <div class="bigemoji">☁️</div>
    <div><h2>${historyCache.length} séance${historyCache.length>1?"s":""} à protéger</h2><p>Les données sont actuellement stockées sur cet iPhone dans Safari.</p></div>
  </div>
  <div class="section-head"><h2>Exporter</h2></div>
  <div class="card backup-action">
    <div><b>Créer une sauvegarde</b><p>Crée un fichier contenant l'historique et, s'il y en a une, la séance actuellement en cours.</p></div>
    <button class="primary compact" id="exportBackup">Exporter</button>
  </div>
  <div class="section-head"><h2>Restaurer</h2></div>
  <div class="card backup-action">
    <div><b>Importer une sauvegarde</b><p>Permet de récupérer les données après changement d'iPhone ou suppression des données Safari.</p></div>
    <label class="secondary import-label">Choisir un fichier<input id="importBackup" type="file" accept=".json,application/json" hidden></label>
  </div>
  <div class="hint"><b>Conseil :</b> garde régulièrement le fichier dans iCloud Drive ou dans un autre emplacement sûr.</div>
 </section>`;
}
function bindBackup(){
 document.querySelector("#exportBackup")?.addEventListener("click",exportCoachData);
 document.querySelector("#importBackup")?.addEventListener("change",e=>{
   const f=e.target.files?.[0];if(f)importCoachData(f);
 });
}

function placeholder(title,text){return `<section class="page"><div class="topline"><h1 class="brand">Coach JM</h1><div class="avatar">JM</div></div><div class="card placeholder"><h2>${title}</h2><p>${text}</p></div></section>`}
function render(route){
 const app=document.querySelector("#app");
 app.innerHTML =
 route==="today"?todayView():
 route==="program"?programView():
 route==="workout-muscu-a"?workoutDetail("A"):route==="workout-muscu-d"?workoutDetail("D"):
 route==="sessions"?sessionsView():route==="new"?builderStart():route==="catalog"?catalogView():
 route==="live-workout"?liveView():route==="live-workout-d"?liveView():route==="live-complete"?liveDone():route==="workout-summary"?workoutSummary():route==="history"?historyView():route==="history-detail"?historyDetailView():route==="progress"?progressionView():route==="progression"?progressionView():route==="progression-detail"?progressionDetailView():route==="coach"?coachView():route==="backup"?backupView():route==="builder-info"?builderInfo():route==="builder-template"?builderInfo():route==="builder-exercises"?builderExercises():route==="builder-recap"?builderRecap():route==="exercise-chest-press"?chestPressDetail():
 route.startsWith("exercise-")?genericExerciseDetail(route.replace("exercise-","")):
 `<section class="page"><div class="program-header"><div class="backless"><h1>Plus</h1><p>Réglages et outils Coach JM.</p></div></div><div class="template-list"><div class="card template-row" data-route="coach"><div class="ico">🧠</div><div><h3>Conseils Coach JM</h3><p>Recommandations basées sur tes séances</p></div><div class="chev">›</div></div><div class="card template-row" data-route="history"><div class="ico">🗂️</div><div><h3>Historique</h3><p>Revoir toutes les séances enregistrées</p></div><div class="chev">›</div></div><div class="card template-row" data-route="backup"><div class="ico">💾</div><div><h3>Sauvegarde</h3><p>Exporter ou restaurer toutes les données</p></div><div class="chev">›</div></div></div></section>`;
 document.querySelectorAll(".nav-item").forEach(b=>{const activeRoute=(route==="coach"||route==="backup")?"more":(route==="workout-summary"||route==="history")?"program":(route==="workout-muscu-a"||route==="workout-muscu-d"||route==="live-workout"||route==="live-workout-d"||route==="live-complete")?"sessions":(route==="sessions"||route==="new"||route.startsWith("builder-")||route.startsWith("exercise-")||route==="catalog")?"sessions":route;b.classList.toggle("active",b.dataset.route===activeRoute)});
 document.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",async ()=>{
   if(activeSessionRestored) await persistActiveSession();
   if(el.classList.contains("nav-main") && el.dataset.route==="sessions" && activeSessionRestored){
     navigate("live-workout");
     return;
   }
   navigate(el.dataset.route);
 }));
 bindCatalog(); bindBuilder(); bindLive(); bindSummary(); bindBackup(); bindProgramDrag(); bindProgramControls();
 document.querySelectorAll("[data-history-id]").forEach(el=>el.addEventListener("click",()=>{
   selectedHistoryId=el.dataset.historyId;
   navigate("history-detail");
 }));
 document.querySelectorAll("[data-progress-name]").forEach(el=>el.addEventListener("click",()=>{
   selectedProgressName=decodeURIComponent(el.dataset.progressName);
   navigate("progression-detail");
 }));
 document.querySelectorAll("[data-progress-category]").forEach(el=>el.addEventListener("click",()=>{
   selectedProgressCategory=el.dataset.progressCategory;
   render("progress");
 }));
  document.querySelectorAll('[data-route="live-workout"], .start-workout').forEach(el=>{
    if(!el.dataset.startBound){
      el.dataset.startBound="1";
      el.addEventListener("click",(ev)=>{ev.preventDefault(); navigate("live-workout");});
    }
  });
  window.scrollTo(0,0);
}
function navigate(route){ location.hash=route; }
window.addEventListener("hashchange",()=>render(location.hash.slice(1)||"today"));
async function initCoachJM(){
  await restoreActiveSession();
  await loadHistory();
  render(location.hash.slice(1)||"today");
}
initCoachJM();


document.addEventListener("DOMContentLoaded",()=>{
  const mark=document.createElement("div");
  mark.className="js-version-badge";
  mark.textContent="JS52";
  document.body.appendChild(mark);
});


/* v40 — évite le zoom accidentel au double-tap sur iPhone */
(function preventAccidentalDoubleTapZoom(){
  let lastTouchEnd=0;
  document.addEventListener("touchend",function(e){
    const now=Date.now();
    if(now-lastTouchEnd<=300){
      e.preventDefault();
    }
    lastTouchEnd=now;
  },{passive:false});

  document.addEventListener("dblclick",function(e){
    e.preventDefault();
  },{passive:false});
})();
