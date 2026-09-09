# Coach JM v56 — Programme = réel pour les jours passés

Corrections demandées :

1. 7 et 8 septembre
- s'il n'y a aucune séance enregistrée dans l'historique, le jour affiche `Repos`;
- on ne garde plus un faux planning prévu pour une journée déjà passée.

2. 9 septembre
- si l'historique contient Muscu D ce jour-là, le Programme affiche Muscu D;
- le planning Muscu B n'écrase plus le réel.

3. Consultation
- toute séance réelle affichée dans Programme porte son `historyId`;
- un clic ouvre directement le détail exact de la séance enregistrée dans Historique;
- un chevron `›` remplace la poignée de déplacement pour ces séances réalisées.

Règle :
- passé = réel ou Repos;
- aujourd'hui = réel si enregistré, sinon planning du jour;
- futur = planning prévu.

Marqueurs : v56 + JS56.
