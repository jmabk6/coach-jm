
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
   <div class="detail-top"><button class="backbtn" data-route="sessions">‹</button><div class="detail-title"><h1>Séance prévue</h1><p>Mardi 8 septembre</p></div></div>
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
  {icon:"❤️",name:"Cardio — Intervalles",meta:"Tapis · blocs de travail",route:"workout-muscu-a"},
  {icon:"🧘",name:"Mobilité",meta:"Souplesse · récupération",route:"workout-muscu-a"}
 ];
 return `<section class="page">
  <div class="program-header"><div class="backless"><h1>Mes séances</h1><p>Choisis une séance à voir ou à démarrer.</p></div></div>
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


const LIVE=[
 {n:"Squat",i:"🏋️",m:"Jambes · fessiers · tronc",p:"3 × 10–12",ref:"barre + 5 kg/côté",s:[["",12,6],["",12,8],["",12,8]]},
 {n:"Tirage vertical",i:"💪",m:"Dos · biceps",p:"3 × 8–12",ref:"35 kg",s:[[30,10,6],[35,10,7],[40,10,10]]},
 {n:"Leg Curl",i:"🦵",m:"Ischio-jambiers",p:"3 × 10–12",ref:"20 kg",s:[[15,12,6],[20,12,8],[20,12,10]]},
 {n:"Chest Press",i:"🏋️",m:"Pectoraux · triceps",p:"3 × 8–12",ref:"30 kg",s:[[30,12,8],[30,12,8],[35,8,10]]},
 {n:"Gainage frontal",i:"🛡️",m:"Tronc",p:"3 séries",ref:"45–50 s",s:[[40,"s",7],[50,"s",9],[45,"s",10]]}
];
let LS={x:0,t:0,ok:{},rest:0,notes:{}};
function ft(v){let m=Math.floor(v/60),s=v%60;return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}
function liveView(){let e=LIVE[LS.x],ok=LS.ok[LS.x]||[];return `<section class="page"><div class="live-head"><button class="backbtn" data-route="workout-muscu-a">‹</button><div><h1>Full Body</h1><p>Exercice ${LS.x+1} sur ${LIVE.length}</p></div><div class="live-clock" id="liveClock">${ft(LS.t)}</div></div><div class="live-progress">${LIVE.map((_,i)=>`<i class="${i<LS.x?'done':i===LS.x?'active':''}"></i>`).join("")}</div><div class="card live-card"><div class="live-ex-head"><div class="live-icon">${e.i}</div><div><h2>${e.n}</h2><p>${e.m}</p></div></div><div class="live-plan"><span><b>Prévu</b><br>${e.p}</span><span style="text-align:right"><b>${e.ref}</b><br>référence</span></div><div class="series-head"><span>Série</span><span>Charge/temps</span><span>Reps</span><span>RPE</span><span></span></div>${e.s.map((a,i)=>`<div class="series-row"><span class="series-n">${i+1}</span><input data-li="${i}" data-lf="0" value="${a[0]}"><input data-li="${i}" data-lf="1" value="${a[1]}"><select data-li="${i}" data-lf="2">${[5,6,7,8,9,10].map(r=>`<option ${+a[2]===r?'selected':''}>${r}</option>`).join("")}</select><button class="set-ok ${ok.includes(i)?'checked':''}" data-setok="${i}">${ok.includes(i)?'✓':'○'}</button></div>`).join("")}${LS.rest?`<div class="rest"><strong id="restClock">${ft(LS.rest)}</strong><div><b>Repos</b><br><small>avant la prochaine série</small></div><button class="skip" id="skipRest">Passer</button></div>`:''}<div class="coach-adapt"><b>Coach JM</b> · ${coachText(e,ok)}</div></div><div class="section-head"><h2>Note rapide</h2></div><textarea class="live-note" id="liveNote" placeholder="Sensations, douleur, difficulté…">${LS.notes[LS.x]||""}</textarea><div class="live-actions"><button class="secondary">Remplacer</button><button class="secondary" data-route="exercise-${slugify(e.n)}">Voir la fiche</button></div>${LS.x<LIVE.length-1?`<button class="primary" id="nextLive">Exercice terminé →</button>`:`<button class="primary" id="finishLive">Terminer la séance ✓</button>`}<button class="add-live" data-route="catalog">+ Ajouter un exercice</button></section>`}
function coachText(e,ok){if(!ok.length)return"Valide une série et j’adapte la suivante.";let r=+e.s[ok[ok.length-1]][2];if(r>=10)return"Au taquet : ne monte pas la charge à la série suivante.";if(r>=9)return"Très difficile : garde la charge, ou baisse si la technique se dégrade.";if(r>=8)return"Bonne zone de travail : consolide à cette charge.";return"Tu as de la marge : une petite hausse est possible si la technique reste propre."}
function liveDone(){return `<section class="page"><div class="card live-done"><div class="check">✅</div><h1>Séance terminée</h1><p>Charges, répétitions, RPE et notes ont été saisis séparément du programme prévu.</p><button class="primary" data-route="program">Voir le bilan</button></div></section>`}
let liveRestTimer=null,liveMainTimer=null;
function bindLive(){if(document.querySelector("#liveClock")&&!liveMainTimer)liveMainTimer=setInterval(()=>{LS.t++;let c=document.querySelector("#liveClock");if(c)c.textContent=ft(LS.t)},1000);document.querySelectorAll("[data-lf]").forEach(x=>x.addEventListener("change",()=>LIVE[LS.x].s[+x.dataset.li][+x.dataset.lf]=x.dataset.lf==="2"?+x.value:x.value));document.querySelectorAll("[data-setok]").forEach(b=>b.addEventListener("click",()=>{LS.ok[LS.x]=LS.ok[LS.x]||[];let i=+b.dataset.setok;if(!LS.ok[LS.x].includes(i))LS.ok[LS.x].push(i);LS.rest=90;render("live-workout");startLiveRest()}));let n=document.querySelector("#liveNote");if(n)n.addEventListener("input",()=>LS.notes[LS.x]=n.value);let nx=document.querySelector("#nextLive");if(nx)nx.addEventListener("click",()=>{LS.x++;LS.rest=0;render("live-workout")});let f=document.querySelector("#finishLive");if(f)f.addEventListener("click",()=>render("live-complete"));let sk=document.querySelector("#skipRest");if(sk)sk.addEventListener("click",()=>{LS.rest=0;if(liveRestTimer)clearInterval(liveRestTimer);liveRestTimer=null;render("live-workout")})}
function startLiveRest(){if(liveRestTimer)clearInterval(liveRestTimer);liveRestTimer=setInterval(()=>{if(LS.rest<=0){clearInterval(liveRestTimer);liveRestTimer=null;return}LS.rest--;let c=document.querySelector("#restClock");if(c)c.textContent=ft(LS.rest)},1000)}

function placeholder(title,text){return `<section class="page"><div class="topline"><h1 class="brand">Coach JM</h1><div class="avatar">JM</div></div><div class="card placeholder"><h2>${title}</h2><p>${text}</p></div></section>`}
function render(route){
 const app=document.querySelector("#app");
 app.innerHTML =
 route==="today"?todayView():
 route==="program"?programView():
 route==="workout-muscu-a"?workoutDetail():
 route==="sessions"?sessionsView():route==="new"?builderStart():route==="catalog"?catalogView():
 route==="live-workout"?liveView():route==="live-complete"?liveDone():route==="builder-info"?builderInfo():route==="builder-template"?builderInfo():route==="builder-exercises"?builderExercises():route==="builder-recap"?builderRecap():route==="exercise-chest-press"?chestPressDetail():
 route.startsWith("exercise-")?genericExerciseDetail(route.replace("exercise-","")):
 route==="progress"?placeholder("Ma progression","Le mockup 47 sera branché sur les données réelles."):
 placeholder("Plus","Profil, paramètres, sauvegarde et export.");
 document.querySelectorAll(".nav-item").forEach(b=>{const activeRoute=(route==="workout-muscu-a"||route==="live-workout"||route==="live-complete")?"sessions":(route==="sessions"||route==="new"||route.startsWith("builder-")||route.startsWith("exercise-")||route==="catalog")?"sessions":route;b.classList.toggle("active",b.dataset.route===activeRoute)});
 document.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>navigate(el.dataset.route)));
 bindCatalog(); bindBuilder(); bindLive(); window.scrollTo(0,0);
}
function navigate(route){location.hash=route}
window.addEventListener("hashchange",()=>render(location.hash.slice(1)||"today"));
render(location.hash.slice(1)||"today");
if("serviceWorker" in navigator){navigator.serviceWorker.register("./sw.js").catch(()=>{});}
