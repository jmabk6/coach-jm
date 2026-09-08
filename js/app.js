
const DAYS = [
 {dow:"LUN",n:7,status:"done",name:"Cardio léger + mobilité",meta:"42 min · réalisé",kind:"done"},
 {dow:"MAR",n:8,status:"today",name:"Muscu A — Jambes",meta:"≈ 55 min · Salle · 5 exercices",kind:"planned"},
 {dow:"MER",n:9,status:"planned",name:"Muscu B — Tirage",meta:"≈ 55 min · Salle · 5 exercices",kind:"planned"},
 {dow:"JEU",n:10,status:"planned",name:"Cardio — Intervalles",meta:"≈ 35 min · Cardio",kind:"planned"},
 {dow:"VEN",n:11,status:"rest",name:"Repos / mobilité libre",meta:"Aucune séance imposée",kind:"rest"},
 {dow:"SAM",n:12,status:"planned",name:"Muscu C — Poussée",meta:"≈ 55 min · Salle · 5 exercices",kind:"planned"},
 {dow:"DIM",n:13,status:"planned",name:"Cardio long",meta:"≈ 50 min · Endurance",kind:"planned"}
];

function todayView(){
 return `<section class="page">
 <div class="topline"><div><h1 class="brand">Coach JM</h1><div class="date">Mardi 8 septembre</div></div><div class="avatar">JM</div></div>
 <div class="eyebrow">AUJOURD’HUI</div><h2 class="hero-title">Prêt pour aujourd’hui ?</h2>
 <div class="card today-card"><div class="session-title">💪 Muscu A — Jambes</div><div class="meta">≈ 55 min · Salle · 5 exercices</div><button class="primary" data-route="program">Voir la séance</button></div>
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
 <div class="week-nav"><button class="round" aria-label="Semaine précédente">‹</button><div class="week-label"><strong>7 — 13 septembre</strong><span>Semaine 2 · 5 séances prévues</span></div><button class="round" aria-label="Semaine suivante">›</button></div>
 <div class="program-list">${DAYS.map(d=>`<div class="program-day">
   <div class="datebox ${d.n===8?'today':''}"><span>${d.dow}</span><b>${d.n}</b></div>
   <div class="card workout-card ${d.kind==='done'?'done':''} ${d.kind==='rest'?'rest':''}">
    <div class="workout-main"><div class="status">${d.kind==='done'?'Réalisée':d.kind==='rest'?'Repos':d.n===8?'Aujourd’hui':'Prévue'}</div><div class="workout-name">${d.name}</div><div class="workout-meta">${d.meta}</div></div>
    <div class="chev">›</div>
   </div></div>`).join("")}</div>
 <div class="week-actions"><button class="secondary">+ Ajouter</button><button class="secondary">Modifier la semaine</button></div>
 <div class="hint"><b>Flexible par conception.</b> Une séance prévue pourra être déplacée, remplacée ou adaptée sans modifier ce qui a déjà été réellement effectué.</div>
 </section>`;
}
function placeholder(title,text){return `<section class="page"><div class="topline"><h1 class="brand">Coach JM</h1><div class="avatar">JM</div></div><div class="card placeholder"><h2>${title}</h2><p>${text}</p></div></section>`}
function render(route){
 const app=document.querySelector("#app");
 app.innerHTML = route==="today"?todayView():route==="program"?programView():route==="new"?placeholder("Nouvelle séance","L’assistant de création arrivera à l’étape dédiée."):route==="progress"?placeholder("Ma progression","Le mockup 47 sera branché sur les données réelles."):placeholder("Plus","Profil, paramètres, sauvegarde et export.");
 document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.route===route));
 document.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>navigate(el.dataset.route)));
 window.scrollTo(0,0);
}
function navigate(route){location.hash=route}
window.addEventListener("hashchange",()=>render(location.hash.slice(1)||"today"));
render(location.hash.slice(1)||"today");
if("serviceWorker" in navigator){navigator.serviceWorker.register("./sw.js").catch(()=>{});}
