# Coach JM — Étape 11 v27 — reprise forcée

Correction du vrai bug :
- le package v26 contenait encore l'ancien `navigate(route){ location.hash=route }`;
- v27 intercepte réellement le bouton **Séance** ;
- si une séance est active : **Séance → séance en cours** ;
- sécurité supplémentaire : même si `#sessions` est ouvert directement, `render()` redirige vers la séance active.

Test :
1. démarrer une séance ;
2. valider au moins une donnée ;
3. aller sur Aujourd'hui ;
4. toucher Séance ;
5. retour immédiat au même exercice.

Commit conseillé :
`Etape 11 v27 - reprise forcee seance`
