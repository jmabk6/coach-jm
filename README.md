# Coach JM v43 — correctif export sauvegarde iPhone

Cause du bug v42 :
- le code appelait `getAllWorkoutSessions()` qui n'existe pas ;
- il appelait aussi `ACTIVE_SESSION_KEY`, qui n'existe pas dans cette architecture ;
- les données sont en IndexedDB via `dbGetAll`, `dbGet`, `dbPut`.

Correction :
- export des séances directement depuis `workoutSessions` ;
- export de la séance active depuis `meta / active_session` ;
- sur iPhone/PWA : ouverture de la feuille de partage iOS avec le fichier JSON ;
- fallback téléchargement classique sur navigateur ;
- import corrigé lui aussi pour restaurer directement dans IndexedDB ;
- en cas d'erreur, le vrai message technique est maintenant affiché.

Marqueurs : v43 + JS43.
