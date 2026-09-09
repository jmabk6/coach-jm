# Coach JM v61 — drag visuel réel

v60 sélectionnait et relâchait correctement, mais le bloc ne suivait pas visiblement le doigt.

v61 :
- au touchstart sur les 3 barres, le bloc ORIGINAL est déplacé temporairement dans `body`;
- il passe en `position: fixed`;
- un placeholder invisible conserve sa place d'origine;
- `left/top` suivent directement les coordonnées du doigt;
- au relâchement, le bloc est remis dans son emplacement DOM puis la semaine est rerendue;
- aucun clone visuel.

Test :
toucher les 3 barres -> cadre rouge;
bouger le doigt -> le cadre doit physiquement suivre le doigt;
relâcher -> échange avec le jour le plus proche et retour normal.

Marqueurs : v61 + JS61.
