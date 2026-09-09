# Coach JM v64 — poignée intelligente

Programme :
- bouton global `Ajouter une séance` supprimé;
- appui court sur les 3 barres :
  - séance prévue -> Modifier la séance / Mettre en repos;
  - Repos -> Ajouter une séance;
- appui long (~450 ms) sur les 3 barres -> drag & drop;
- relâchement après drag -> échange de cases;
- séance réalisée : reste consultable par son chevron et n'est pas déplaçable.

Le jour choisi lors de `Ajouter une séance` est mémorisé dans sessionStorage pour permettre au créateur existant de le rattacher ensuite à la bonne case.

Marqueurs : v64 + JS64.
