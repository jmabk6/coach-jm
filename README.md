# Coach JM v34 — assets uniques, zéro cache ambigu

Cette version ne charge plus `./js/app.js` ni `./css/app.css`.

Elle charge :
- `./coachjm-v34.js`
- `./coachjm-v34.css`

Donc un ancien `app.js` Safari/service-worker ne peut plus être utilisé.

Deux marqueurs doivent apparaître :
- `v34` = index.html v34 chargé
- `JS34` = le vrai JavaScript v34 chargé

Aucun service worker n'est fourni dans ce ZIP.

La fiche Muscu D contenue dans `coachjm-v34.js` est la version à CARTE UNIQUE :
titre + badges + séance en cours + phase + reprendre + objectif dans le même cadre.

Commit conseillé :
`v34 assets uniques sans cache`
