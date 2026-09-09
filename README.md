# COACH JM V1 — ÉTAPE 11/15 — Sauvegarde + historique

Cette version branche réellement IndexedDB.

## Sauvegarde automatique
- une séance démarrée est enregistrée localement;
- les charges, reps, RPE, tapis, mobilité, notes et progression sont autosauvegardés;
- le chrono est sauvegardé régulièrement;
- après fermeture/rechargement, Coach JM affiche `Séance en cours → Reprendre`.

## Fin de séance
- `Enregistrer le bilan` écrit une vraie entrée dans `workoutSessions`;
- la séance en cours est alors supprimée de `meta.active_session`;
- le bilan apparaît dans `Programme → Historique des séances`.

## Important
Les données sont locales à ce navigateur/iPhone pour l'instant. Export/restauration viendront plus tard.

Commit conseillé :
`Etape 11 - sauvegarde IndexedDB et historique`
