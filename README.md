# Coach JM v35 — correctif page blanche

Cause trouvée :
- v34 déplaçait `app.js` à la racine sous le nom `coachjm-v34.js`;
- mais son import restait `./db/db.js`;
- depuis la racine, ce chemin est faux ;
- le module JavaScript ne se chargeait donc pas, d'où la page blanche.

Correction :
- import corrigé vers `./js/db/db.js`;
- nouveaux assets `coachjm-v35.js` et `coachjm-v35.css`;
- marqueurs attendus : `v35` et `JS35`.

Aucun changement fonctionnel supplémentaire.
