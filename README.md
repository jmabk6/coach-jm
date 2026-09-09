# Coach JM — Étape 11 v33 — reset cache iPhone

Objectif : forcer Safari/GitHub Pages à charger réellement la nouvelle UI.

Modifications :
- désinscription de tous les anciens Service Workers ;
- suppression de tous les caches Cache Storage au chargement ;
- suppression de l’enregistrement du service worker dans l’app ;
- `sw.js` devient auto-nettoyant et se désinscrit ;
- assets forcés en `app.css?v=33` et `app.js?v=33` ;
- badge temporaire `v33` visible en bas à droite pour confirmer la bonne version.

La PWA hors-ligne est volontairement désactivée pour le moment afin d’éviter les anciennes versions fantômes.

Commit conseillé :
`Etape 11 v33 - reset cache Safari`
