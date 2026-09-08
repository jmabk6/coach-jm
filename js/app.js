
const DAYS = [
 {dow:"LUN",n:7,status:"done",name:"Cardio léger + mobilité",meta:"42 min · réalisé",kind:"done"},
 {dow:"MAR",n:8,status:"today",name:"Muscu A — Jambes",meta:"≈ 55 min · Salle · 5 exercices",kind:"planned",id:"muscu-a"},
 {dow:"MER",n:9,status:"planned",name:"Muscu B — Tirage",meta:"≈ 55 min · Salle · 5 exercices",kind:"planned",id:"muscu-b"},
 {dow:"JEU",n:10,status:"planned",name:"Cardio — Intervalles",meta:"≈ 35 min · Cardio",kind:"planned"},
 {dow:"VEN",n:11,status:"rest",name:"Repos / mobilité libre",meta:"Aucune séance imposée",kind:"rest"},
 {dow:"SAM",n:12,status:"planned",name:"Muscu C — Poussée",meta:"≈ 55 min · Salle · 5 exercices",kind:"planned"},
 {dow:"DIM",n:13,status:"planned",name:"Cardio long",meta:"≈ 50 min · Endurance",kind:"planned"}
];

const MUSCU_A = {
 name:"Muscu A — Jambes", subtitle:"Jambes · gainage · mobilité", duration:"≈ 55 min", place:"Salle", goal:"Renforcer les jambes, progresser sans douleur au genou et construire une base solide pour tout le reste.",
 exercises:[
  {name:"Tapis — échauffement", meta:"8 min · allure facile", extra:"Prévu : 5 km/h · pente légère"},
  {name:"Leg Press horizontale", meta:"3 séries · 10–12 reps · repos 90 s", extra:"Charge prévue : 85 kg", warmup:"Échauffement : 1 série légère"},
  {name:"Leg Curl", meta:"3 séries · 10–12 reps · repos 75 s", extra:"Charge prévue : 15 kg"},
  {name:"Gainage frontal", meta:"3 séries · 30–45 s · repos 45 s", extra:"Poids du corps"},
  {name:"Mobilité hanches / ischios", meta:"5–8 min · fin de séance", extra:"Amplitude confortable, sans forcer"}
 ]
};

function todayView(){
 return `<section class="page">
 <div class="topline"><div><h1 class="brand">Coach JM</h1><div class="date">Mardi 8 septembre</div></div><div class="avatar">JM</div></div>
 <div class="eyebrow">AUJOURD’HUI</div><h2 class="hero-title">Prêt pour aujourd’hui ?</h2>
 <div class="card today-card"><div class="session-title">💪 Muscu A — Jambes</div><div class="meta">≈ 55 min · Salle · 5 exercices</div><button class="primary" data-route="workout-muscu-a">Voir la séance</button></div>
 <div class="section-head"><h2>Ma semaine</h2><button class="linkbtn" data-route="program">Voir</button></div>
 <div class="week-strip">${DAYS.map(d=>`<div class="day-mini ${d.n===8?'active':''}"><span class="dow">${d.dow}</span><b>${d.n}</b><i class="dot ${d.kind==='done'?'done':''}"></i></div>`).join("")}</div>
 <div class="section-head"><h2>Mes 3 objectifs</h2><button class="linkbtn" data-route="progress">Progression</button></div>
 <div class="goals"><div class="card goal"><div class="emoji">💪</div><b>Traction</b><div class="bar"><i></i></div><div class="small">À mesurer</div></div><div class="card goal"><div class="emoji">🧘</div><b>Souplesse</b><div class="bar"><i></i></div><div class="small">À mesurer</div></div><div class="card goal"><div class="emoji">🛡️</div><b>Tronc</b><div class="bar"><i></i></div><div class="small">À mesurer</div></div></div>
 <div class="section-head"><h2>Point de départ</h2></div><div class="card today-card"><b>La première semaine servira de référence.</b><div class="meta">Tes performances réelles alimenteront automatiquement ta progression.</div></div>
 </section>`;
}
function programView(){
 return `<section class="page">
 <div class="program-header"><div class="backless"><h1>Mon programme</h1><p>Une semaine prévue, adaptable au réel.</p></div></div>
 <div class="week-nav"><button class="round">‹</button><div class="week-label"><strong>7 — 13 septembre</strong><span>1 réalisée · 5 prévues</span></div><button class="round">›</button></div>
 <div class="program-list">${DAYS.map(d=>`<div class="program-day">
   <div class="datebox ${d.n===8?'today':''}"><span>${d.dow}</span><b>${d.n}</b></div>
   <div class="card workout-card ${d.kind==='done'?'done':''} ${d.kind==='rest'?'rest':''}" ${d.id?`data-route="workout-${d.id}"`:''}>
    <div class="workout-main"><div class="status">${d.kind==='done'?'Réalisée':d.kind==='rest'?'Repos':d.n===8?'Aujourd’hui':'Prévue'}</div><div class="workout-name">${d.name}</div><div class="workout-meta">${d.meta}</div></div>
    <div class="chev">›</div>
   </div></div>`).join("")}</div>
 <div class="week-actions"><button class="secondary">+ Ajouter</button><button class="secondary">Modifier la semaine</button></div>
 <div class="hint"><b>Flexible par conception.</b> Une séance prévue pourra être déplacée, remplacée ou adaptée sans modifier ce qui a déjà été réellement effectué.</div>
 </section>`;
}
function workoutDetail(){
 const w=MUSCU_A;
 return `<section class="page">
   <div class="detail-top"><button class="backbtn" data-route="program">‹</button><div class="detail-title"><h1>Séance prévue</h1><p>Mardi 8 septembre</p></div></div>
   <div class="card summary">
     <div class="summary-head"><div class="bigemoji">💪</div><div><h2>${w.name}</h2><div class="meta">${w.subtitle}</div></div></div>
     <div class="pills"><span class="pill">⏱ ${w.duration}</span><span class="pill">🏋️ ${w.place}</span><span class="pill">📋 ${w.exercises.length} exercices</span></div>
     <div class="goalbox"><strong>🎯 Objectif de la séance</strong><p>${w.goal}</p></div>
   </div>
   <div class="section-head"><h2>Exercices prévus</h2><button class="linkbtn">Modifier</button></div>
   <div class="exercise-list">${w.exercises.map((e,i)=>`
     <div class="card exercise">
       <div class="num">${i+1}</div>
       <div><div class="exercise-name">${e.name}</div><div class="exercise-meta">${e.meta}</div><div class="exercise-extra">${e.extra}</div>${e.warmup?`<span class="warmup">${e.warmup}</span>`:''}</div>
       <div class="chev">›</div>
     </div>`).join("")}</div>
   <div class="note-card card"><strong>Prévu ≠ réalisé.</strong><br>Tu pourras changer une charge, faire moins ou plus de reps, remplacer ou ajouter un exercice pendant la séance. L’historique enregistrera ce que tu as réellement fait.</div>
   <div class="detail-actions"><button class="secondary">Adapter la séance</button><button class="primary compact">▶ Démarrer</button></div>
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
   <div class="exercise-detail-head"><button class="backbtn" data-route="new">‹</button><div class="exercise-detail-title"><h1>${e.n}</h1><p>${e.m}</p></div><button class="favorite-btn">♡</button></div>
   <div class="card exercise-hero"><div class="exercise-hero-main"><div class="exercise-hero-icon">${e.g}</div><div><h2>${e.n}</h2><div class="sub">${e.m}</div></div></div><div class="metrics-row"><div class="metric"><b>${e.t[0]}</b><span>Type</span></div><div class="metric"><b>${e.t[1]||"—"}</b><span>Mesure</span></div><div class="metric"><b>${e.c}</b><span>Famille</span></div></div></div>
   <div class="info-section"><h2>Fiche exercice</h2><div class="card info-card"><p>Cette fiche sera enrichie avec les consignes, les muscles sollicités et ta progression propre à cet exercice.</p></div></div>
   <button class="primary sticky-action">+ Ajouter à une séance</button>
 </section>`;
}

function placeholder(title,text){return `<section class="page"><div class="topline"><h1 class="brand">Coach JM</h1><div class="avatar">JM</div></div><div class="card placeholder"><h2>${title}</h2><p>${text}</p></div></section>`}
function render(route){
 const app=document.querySelector("#app");
 app.innerHTML =
 route==="today"?todayView():
 route==="program"?programView():
 route==="workout-muscu-a"?workoutDetail():
 route==="new"?catalogView():
 route==="exercise-chest-press"?chestPressDetail():
 route.startsWith("exercise-")?genericExerciseDetail(route.replace("exercise-","")):
 route==="progress"?placeholder("Ma progression","Le mockup 47 sera branché sur les données réelles."):
 placeholder("Plus","Profil, paramètres, sauvegarde et export.");
 document.querySelectorAll(".nav-item").forEach(b=>{const activeRoute=route==="workout-muscu-a"?"program":route.startsWith("exercise-")?"new":route;b.classList.toggle("active",b.dataset.route===activeRoute)});
 document.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>navigate(el.dataset.route)));
 bindCatalog(); window.scrollTo(0,0);
}
function navigate(route){location.hash=route}
window.addEventListener("hashchange",()=>render(location.hash.slice(1)||"today"));
render(location.hash.slice(1)||"today");
if("serviceWorker" in navigator){navigator.serviceWorker.register("./sw.js").catch(()=>{});}
