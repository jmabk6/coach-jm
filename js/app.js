(function(){
  'use strict';
  const view=document.getElementById('view');
  const todayLabel=document.getElementById('today-label');

  function todayHTML(){
    return `
      <p class="eyebrow">AUJOURD’HUI</p>
      <h1 class="headline">Prêt pour aujourd’hui ?</h1>
      <section class="card workout-card">
        <div class="workout-top"><span class="session-icon">💪</span><div><div class="pill">SÉANCE DU JOUR</div><h2>Muscu A — Jambes</h2><p>≈ 55 min · Salle · 5 exercices</p></div></div>
        <button class="primary" type="button" data-go="program">Voir la séance</button>
      </section>
      <div class="section-head"><h2>Ma semaine</h2><button type="button" data-go="program">Voir</button></div>
      <section class="week">
        <div class="day done"><small>Lun</small><strong>7</strong><i></i></div><div class="day today"><small>Mar</small><strong>8</strong><i></i></div><div class="day"><small>Mer</small><strong>9</strong><i></i></div><div class="day"><small>Jeu</small><strong>10</strong><i></i></div><div class="day"><small>Ven</small><strong>11</strong><i></i></div><div class="day"><small>Sam</small><strong>12</strong><i></i></div><div class="day"><small>Dim</small><strong>13</strong><i></i></div>
      </section>
      <div class="section-head"><h2>Mes 3 objectifs</h2><button type="button" data-go="progress">Progression</button></div>
      <section class="goals">
        <div class="card goal"><div class="ico">💪</div><b>Traction</b><div class="bar"><span style="width:8%"></span></div><small>À mesurer</small></div>
        <div class="card goal"><div class="ico">🧘</div><b>Souplesse</b><div class="bar"><span style="width:8%"></span></div><small>À mesurer</small></div>
        <div class="card goal"><div class="ico">🛡️</div><b>Tronc</b><div class="bar"><span style="width:8%"></span></div><small>À mesurer</small></div>
      </section>
      <div class="section-head"><h2>Point de départ</h2></div>
      <section class="stats"><div class="card stat"><strong>Semaine 1</strong><small>Baseline officielle</small></div><div class="card stat"><strong>5 séances</strong><small>Premier repère</small></div></section>
      <div class="tech">Coach JM · UI 1.1</div>`;
  }

  const routes={
    today:todayHTML,
    program:()=>`<p class="eyebrow">PROGRAMME</p><h1 class="headline">Ma semaine</h1><section class="card empty"><div class="big">📅</div><h2>Programme hebdomadaire</h2><p>Les séances prévues, déplacées ou remplacées seront organisées ici.</p><button class="primary" type="button" data-go="new">Créer ma première séance</button></section>`,
    new:()=>`<p class="eyebrow">NOUVELLE SÉANCE</p><h1 class="headline">Créer une séance</h1><section class="card empty"><div class="big">＋</div><h2>Assistant de création</h2><p>On y construira tes séances modèles, exercice par exercice.</p><button class="primary" type="button">Bientôt disponible</button></section>`,
    progress:()=>`<p class="eyebrow">PROGRESSION</p><h1 class="headline">Ma progression</h1><section class="card empty"><div class="big">📈</div><h2>D’où je pars → où j’arrive</h2><p>Musculation, cardio, traction, souplesse, tronc et régularité seront réunis ici.</p></section><div class="section-head"><h2>Mes domaines</h2></div><section class="card list"><div class="list-row"><span class="icon">💪</span><div><b>Musculation</b><small>Charges · répétitions · RPE</small></div></div><div class="list-row"><span class="icon">❤️</span><div><b>Cardio</b><small>Durée · vitesse · pente · FC</small></div></div><div class="list-row"><span class="icon">🎯</span><div><b>Objectifs</b><small>Traction · souplesse · tronc</small></div></div></section>`,
    more:()=>`<p class="eyebrow">PLUS</p><h1 class="headline">Réglages</h1><section class="card list"><div class="list-row"><span class="icon">👤</span><div><b>Profil</b><small>Informations et préférences</small></div></div><div class="list-row"><span class="icon">⚙️</span><div><b>Paramètres d’entraînement</b><small>Unités · repos · RPE</small></div></div><div class="list-row"><span class="icon">💾</span><div><b>Sauvegarde</b><small>Exporter ou restaurer mes données</small></div></div></section>`
  };

  function bindInternalLinks(){
    view.querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.go)));
  }
  function go(route){
    if(!routes[route]) route='today';
    view.innerHTML=routes[route]();
    document.querySelectorAll('.nav-item').forEach(btn=>btn.classList.toggle('active',btn.dataset.route===route));
    bindInternalLinks();
    window.scrollTo({top:0,behavior:'instant'});
  }
  document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.route)));
  try{
    const fmt=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'});
    todayLabel.textContent=fmt.format(new Date()).replace(/^./,c=>c.toUpperCase());
  }catch(_){todayLabel.textContent='Aujourd’hui';}
  go('today');

  if('serviceWorker' in navigator){
    window.addEventListener('load',async()=>{
      try{
        const reg=await navigator.serviceWorker.register('./sw.js?v=4',{updateViaCache:'none'});
        reg.update();
      }catch(err){console.warn('SW',err);}
    });
  }
})();
