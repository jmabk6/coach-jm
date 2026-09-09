# Coach JM v38 — correctif Étape 12 Progression

Cause trouvée :
- le bouton de navigation du bas utilise la route `progress`;
- l'écran de progression v37 avait été branché sur `progression`;
- l'ancienne route `progress` affichait encore le placeholder `Ma progression`.

Correction :
- `progress` affiche maintenant le vrai écran `progressionView()`;
- `progression` reste accepté comme alias ;
- retour du détail vers `progress`;
- suppression de l'ancien placeholder.

Marqueurs attendus : v38 + JS38.
