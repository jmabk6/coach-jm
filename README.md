# Coach JM v58 — correction définitive relâchement drag

Bug v57 :
`touchend` était attaché à la poignée.
Quand le doigt se déplaçait hors de la poignée avant d'être relâché,
Safari pouvait ne jamais envoyer `touchend` à cet élément.
La classe `.dragging` restait donc sur le cadre, d'où le rouge permanent.

Correction v58 :
- `touchstart` reste sur les 3 barres ;
- `touchmove`, `touchend` et `touchcancel` sont maintenant écoutés sur `document` ;
- quel que soit l'endroit où le doigt est relâché, `resetDrag()` est exécuté ;
- le cadre redevient normal immédiatement ;
- le clone de déplacement est supprimé ;
- les cibles rouges sont nettoyées.

Marqueurs : v58 + JS58.
