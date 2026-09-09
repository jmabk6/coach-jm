# Coach JM v55 — correction Séance + date réelle

Deux bugs corrigés :

1. Onglet Séance
- avant : si `activeSessionRestored` était vrai, le clic sur l'onglet Séance était détourné vers `live-workout`;
- c'est pour cela que Muscu D se rouvrait directement à la phase Mobilité ;
- maintenant l'onglet Séance ouvre TOUJOURS `Mes séances`;
- une vraie séance en cours reste accessible depuis sa carte dédiée, pas en détournant l'onglet.

2. Date
- `Mardi 8 septembre` était codé en dur ;
- le jour 8 était aussi codé en dur pour le surlignage ;
- la date est maintenant calculée depuis la date réelle du téléphone/navigateur ;
- aujourd'hui doit donc afficher `Mercredi 9 septembre`;
- le surlignage du jour utilise la vraie date ISO.

Marqueurs : v55 + JS55.
