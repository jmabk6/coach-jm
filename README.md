# Coach JM v45 — correctif fin de séance

Bug :
Après `Terminer la séance`, la séance active restait dans IndexedDB jusqu'à l'enregistrement du bilan.
En revenant sur Aujourd'hui avant/après certaines navigations, elle pouvait donc être restaurée comme `Séance en cours`.

Correction :
- au clic sur `Terminer la séance`, l'état courant est figé puis l'entrée `meta / active_session` est supprimée immédiatement ;
- `activeSessionRestored` passe immédiatement à `false` ;
- l'écran de bilan continue d'utiliser les données en mémoire, donc rien n'est perdu ;
- lors de `Enregistrer le bilan`, la séance est enregistrée dans l'historique et le flag est de nouveau sécurisé à `false`.

Résultat attendu :
Une fois `Terminer la séance` pressé, Aujourd'hui ne doit plus jamais proposer `Reprendre` cette séance.

Marqueurs : v45 + JS45.
