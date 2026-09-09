# Coach JM v42 — Étape 14/15 : sauvegarde et restauration

Ajout dans `Plus > Sauvegarde`.

Export :
- crée un fichier JSON ;
- contient toutes les séances enregistrées ;
- contient également la séance en cours si elle existe.

Import :
- vérifie qu'il s'agit d'une sauvegarde Coach JM ;
- demande confirmation ;
- restaure les séances dans IndexedDB ;
- restaure la séance en cours dans le stockage local.

But : ne pas dépendre uniquement du stockage Safari de l'iPhone.

Marqueurs : v42 + JS42.
Commit conseillé :
`Etape 14 v42 - sauvegarde restauration`
