# Coach JM v63 — échange de cases réellement persistant

Cause exacte du bug v62 :
- `PROGRAM_ORDER_KEY` était référencé mais n'était plus défini ;
- `programDays()` masquait cette erreur dans son try/catch et revenait au planning de base ;
- donc le bloc se déplaçait visuellement, mais après le relâchement le rerender remettait les séances à leur place initiale.

Correction :
- nouvelle clé `coachjm_program_slots_v3`;
- stockage explicite `case -> séance`;
- au relâchement, les deux cases échangent réellement leur contenu ;
- le rerender relit cette correspondance exacte ;
- plus de logique d'ordre ambiguë.

Exemple :
Jeudi Cardio + Samedi Muscu C
-> déposer Cardio sur Samedi
-> Jeudi devient Muscu C
-> Samedi devient Cardio
-> état conservé après rerender.

Marqueurs : v63 + JS63.
