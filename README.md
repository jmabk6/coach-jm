# Coach JM — Étape 11 v29 — retour dynamique fiable

Le précédent correctif n'était pas fiable car le bouton retour restait dépendant du HTML généré.

v29 :
- le bouton retour live n'a plus de `data-route` codé en dur ;
- son clic est géré en JavaScript au moment où l'écran est affiché ;
- la séance mémorise explicitement `planKey = A ou D` ;
- Muscu D revient donc vers `workout-muscu-d`, même après reprise/restauration.

Commit conseillé :
`Etape 11 v29 - retour dynamique plan actif`
