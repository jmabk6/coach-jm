# Coach JM v60 — drag tactile fiabilisé

Cause probable des comportements incohérents :
- `bindProgramDrag()` ajoutait des listeners globaux à chaque `render()`;
- ces anciens listeners restaient actifs, donc plusieurs états de drag pouvaient réagir en même temps.

Correction :
- AbortController global : un seul jeu de listeners de drag existe à la fois;
- touchmove/touchend/touchcancel écoutés sur `window` en capture;
- le bloc original devient rouge et suit le doigt;
- aucune copie n'est créée;
- la destination est calculée par la position verticale du doigt, pas par `elementFromPoint`;
- le rouge est retiré AVANT le rerender au relâchement;
- blur/touchcancel nettoient aussi l'état.

Marqueurs : v60 + JS60.
