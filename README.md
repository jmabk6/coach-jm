# Coach JM v49 — correctif écran blanc

Cause exacte trouvée grâce au diagnostic v48 :
`ReferenceError: Can't find variable: MUSCU_A`.

Lors de la construction de v47, le remplacement du bloc de drag tactile a accidentellement supprimé
les définitions `MUSCU_A` et `MUSCU_D`.

Correction v49 :
- réinsertion des définitions exactes depuis la base stable v45 ;
- conservation du Programme compact validé ;
- conservation du drag uniquement par la poignée ;
- suppression du panneau diagnostic rouge.

Marqueurs temporaires : v49 + JS49.
