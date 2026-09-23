# Conception technique V2 — Coach JM

**Date** : 23 septembre 2026. Révision 2 : décisions Q1 à Q28 et corrections A et B. Révision 3, le même jour : relecture validée (jour du test traction, échéance de S1, incrément des élévations, presse à 130 kg, N2 à N12).
**Statut** : **VALIDÉE et FIGÉE** (révision 3, 23/09/2026). Toute évolution passe par une nouvelle révision numérotée. Aucun code n'accompagne ce document.
**Dépôt de référence** : `C:\Users\JMA\coach-jm`, `origin/main` = `eb49be6` (lot a déployé le 23/09).

**Sources, par ordre de priorité**
1. Les décisions Q1 à Q28 et les corrections A et B du 23/09, puis les décisions initiales du 23/09.
2. Les maquettes validées : `Coach_jm_2.docx`, 11 écrans M1 à M11. Les valeurs de M9 et M10 sont illustratives et ne deviennent jamais des règles de calcul.
3. `AUDIT_2026-09-23.md` : état du code, contradictions C1 à C10.
4. `CONCEPTION_TECHNIQUE_MODELE_CIBLE.md` v1.6 et son amendement : ce qui reste valable.

**Conventions**
- Les chemins sont relatifs à `src/`.
- « v1.6 § x » renvoie à la conception précédente.
- **Dn** renvoie à la décision n de la section 8.1.
- **Nn** renvoie à une question nouvelle de la section 8.2. Aucune n'est bloquante pour le lot B.

**Base réelle au 22/09** (sauvegarde `2576bdfa`)
- Contenu : 12 séances, 48 exercices, 1 modèle brouillon, 1 échelle RPE.
- Tout le reste est à 0 : cadres, jalons, objectifs, pesées, programmes, séances planifiées, cardio et mobilité.

---

## Table des matières

1. Classement de l'existant : À CONSERVER / À ADAPTER / À CRÉER
2. Décisions fonctionnelles, précisées techniquement
3. Modèle de données et schéma Dexie v3
4. Migration v2 → v3 et format de sauvegarde v2
5. Règles de calcul
6. Écrans M1 à M11
7. Plan des lots B à O
8. Décisions Q1 à Q28, et questions nouvelles
9. Annexe : premier jet des Conseils des objectifs 2 à 7 (**à valider**)

---

## 1. Classement de l'existant

Légende :
- **CONSERVER** : inchangé.
- **ADAPTER** : conservé, avec des modifications.
- **CRÉER** : n'existe pas.
- **RETIRER** : supprimé, au plus tard au lot N.

### 1.1 Données et schéma

| Élément | Classement | Détail |
|---|---|---|
| `db/database.ts` (Dexie v1 et v2) | ADAPTER | ajout de `version(3)`, voire d'une `version(4)` (D1, § 4.1) ; les versions antérieures restent déclarées |
| `exercises` | ADAPTER | types de mesure `reps_duration` et `duration_power`, champ `powerUnit` (§ 3.3) ; `loadSemantics` conservé (lot a) |
| `sessionTemplates` | ADAPTER | `letter`, `subtitle`, `tags`, `origin`, `mainBlockId` ; catégorie « Routine » ; **plages** dans les consignes (D16) ; rôle `warmup` d'une brique (D14) |
| `weeklyPrograms` | ADAPTER | `eveningRotation` (routines) ; jours ordonnés du dimanche au samedi |
| `plannedSessions` | ADAPTER | `slot` (matin / journée / soir), `tests[]` (tests planifiés, report d'un test en retard) |
| `workouts` | ADAPTER | `endedAt`, `feeling`, `note` ; brique `test` ; `role: "warmup"` sur une brique ; FC étendue ; durée par répétition |
| `goals` | ADAPTER (refonte) | la forme v1 (`target` union) est remplacée par l'objectif à **segments** (correction A, § 3.6). Le store est vide sur la base réelle |
| `weightEntries` | CONSERVER | forme inchangée, enfin écrite (lot I) |
| `strengthFrames`, `strengthFrameVersions`, `strengthMilestones` | CONSERVER, **1 adaptation** | `increment` devient facultatif pour l'assistance tant que le cran n'est pas saisi (D18, N4) ; les jalons **n'alimentent jamais** la courbe d'un objectif |
| `rpeScaleVersions` | CONSERVER | |
| `cardioProtocols`, `cardioProtocolVersions`, `cardioTests`, `cardioTestMeasures`, `mobilityProtocolVersions`, `mobilityAssessments`, `mobilityMeasures`, `mobilityObservations` | RETIRER | suppression sous garde (D1) |
| `testProtocols`, `testProtocolVersions`, `testResults` | CRÉER | structure générique (§ 3.7) ; mensurations comprises (D13) |
| `settings` | CRÉER | profil, préférences, cycle et calendrier des tests, marqueurs d'installation (§ 3.9) |
| `domain/models/cardioTest.ts`, `mobility.ts` | RETIRER | types seuls, jamais écrits |
| `domain/models/goal.ts` | ADAPTER (refonte) | § 3.6 |

### 1.2 Règles et moteur

| Module | Classement | Détail |
|---|---|---|
| `features/workout/engine/*` (moteur pur) | CONSERVER | cœur de M9 |
| `engine/workoutBlocks.ts`, `createWorkoutSnapshot.ts` | ADAPTER | brique `test` ; placements et ajustements du jour de test ; rôle `warmup` recopié |
| `finishWorkout.ts` | ADAPTER | coupé en `endWorkout` (Terminer) et `confirmWorkout` (Enregistrer), D20, D21 |
| `ResumeWatcher.tsx` | ADAPTER | récapitulatif en attente au lancement |
| `deleteWorkout.ts` | ADAPTER | suppression atomique étendue aux `testResults` d'origine séance |
| `domain/rules/strengthRules.ts`, `features/strength/*` | CONSERVER, **1 adaptation** | double progression = cadre existant ; sans incrément, aucune hausse proposée (D18) |
| `domain/rules/loadSemanticsRules.ts` (lot a) | CONSERVER | tonnage hors assistance |
| `domain/rules/programRules.ts` | ADAPTER | `WEEK_STARTS_ON = 0` ; tests planifiés ; conflit de déplacement ; statut « Non réalisée » (D23) |
| `features/program/plannedSessionActions.ts` | ADAPTER | déplacer avec conflit ; sauter avec test « à replanifier » (D26) |
| `features/program/generateProgramWeek.ts`, `applyWeeklyProgram.ts` | ADAPTER | routines du soir (cadres vides), tests de la semaine de tests |
| `domain/rules/workoutKindRules.ts` + catégorie « Bilan de mobilité » | CONSERVER jusqu'au lot N | plus aucune création (D2) ; retrait au lot N si aucune donnée ne les utilise |
| `features/progression/overview.ts`, `trends.ts`, `cardio.ts`, `period.ts`, `historyGroups.ts` | CONSERVER (calculs) | réutilisés par Planning > Mois et par la page Objectif |
| `features/exercises/exercisePerformance.ts` | CONSERVER | indicateurs secondaires, base des records |
| `features/backup/*` | ADAPTER | format v2, restauration des formats 1, import et effacement dans l'interface |
| `features/history/importedWorkouts.ts` | ADAPTER | bouton retiré de l'interface (D3) ; code gardé tant qu'il sert aux tests (fixture du 15/09) et aux tests de migration |
| `features/workout/restSignal.ts` | ADAPTER | réglage « Son du minuteur » |

### 1.3 Écrans

| Écran actuel | Classement | Devient |
|---|---|---|
| `AppShell.tsx` | ADAPTER | 5 onglets ; barre masquée sur `/seance-en-cours` |
| `today/TodayScreen.tsx` | ADAPTER | **Accueil** (M1) ; l'entrée « Bilan de mobilité (séance libre) » est retirée (D2) |
| `today/SessionPreviewScreen.tsx` | CONSERVER | aperçu d'une séance planifiée |
| `program/*` | ADAPTER | **Planning** Semaine (M2) et Mois (M3) |
| `sessions/SessionsScreen.tsx`, `SessionCard.tsx` | ADAPTER | onglet **Séances** (M8), sans photo (D4) |
| `sessions/*` (édition des modèles) | ADAPTER | saisie des plages de réglage (D16) |
| `workout/WorkoutScreen.tsx` et cartes | ADAPTER | plein écran `/seance-en-cours`, frise, brique test, encarts de progression |
| `workout/WorkoutRecapScreen.tsx` | ADAPTER | **fin de séance**, trois vues (M10) |
| `workout/WorkoutBlockDetailScreen.tsx` | CONSERVER | détail d'un exercice (décision du 17/09) |
| `progression/*` (écrans) | ADAPTER puis RETIRER | accessibles provisoirement (Plus > Statistiques), retirés au lot N (D6) |
| `exercises/*` | CONSERVER | bibliothèque, depuis Plus |
| `plus/PlusScreen.tsx` | ADAPTER | M11 ; plus de bouton d'import de septembre (D3) |
| `exercises/ExercisePictogram.tsx/.css` (non suivis) | ADAPTER | base des icônes Lucide des objectifs (D4) |
| Objectifs, Objectif (3 onglets), Profil, Réglages, Sauvegarde, Protocoles de tests, Routines, saisie d'un test passé, pesée, mensurations | CRÉER | |

---

## 2. Décisions fonctionnelles, précisées techniquement

### 2.1 Navigation

#### 2.1.1 Barre d'onglets

| Onglet | Route | Icône Lucide | Remplace |
|---|---|---|---|
| Accueil | `/` | `House` | Aujourd'hui |
| Planning | `/planning` | `CalendarDays` | Programme `/programme` |
| Objectifs | `/objectifs` | `Target` | — |
| Séances | `/seances` | `Dumbbell` | Plus → Séances `/sessions` |
| Plus | `/plus` | `Ellipsis` | Plus |

- **Séance en cours** : `/seance-en-cours` (D5), **en plein écran**. `AppShell` masque la barre d'onglets sur `/seance-en-cours*`, comme il le fait déjà en mode sélection (`AppShell.tsx:17-20`).
- **Redirections permanentes** :

  | Ancienne route | Nouvelle route |
  |---|---|
  | `/programme` | `/planning` |
  | `/programme/programmation` | `/planning/programmation` |
  | `/sessions*` | `/seances*` |
  | `/seance*` (singulier) | `/seance-en-cours*` |

  Ces redirections protègent les `returnTo` et les liens mémorisés.

#### 2.1.2 Semaine du dimanche au samedi

- **Point unique dans le code** : `programRules.ts:71`, qui appelle `startOfWeek(…, { weekStartsOn: 1 })`.
- **Changement** : une constante exportée `WEEK_STARTS_ON = 0`, lue par toute grille et tout calcul hebdomadaire ; l'ordre `weekdays` devient `sunday … saturday`.
- **Aucune migration.** Les `Weekday` sont stockés par nom, jamais par index. Sur la base réelle, il y a 0 programme et 0 séance planifiée.
- **Ce qui est touché, et testé** :
  - grilles Semaine et Mois ;
  - `generateProgramWeek` : une semaine générée va du dimanche au samedi ;
  - resynchronisation des instances intactes (décision du 16/09) ;
  - « la semaine en cours ne reçoit rien de la règle » : semaine du dimanche courant ;
  - moyenne hebdomadaire des pesées ;
  - semaine de tests.

#### 2.1.3 Destination des fonctions de Progression

L'ancien écran Progression reste accessible pendant le chantier (Plus > « Statistiques »). Il est retiré au lot N, une fois ses fonctions utiles redistribuées (D6).

| Fonction | Destination |
|---|---|
| Progression par exercice (`trends.ts`, fiche « Mes performances ») | page **Objectif** > Progression > « Indicateurs secondaires » (M5) ; fiche exercice (existante) |
| Bilan global (`overview.ts`) | **Planning > Mois**, « Résumé du mois » (M3), par mois civil |
| Historique des séances | **Planning > Mois** : le passé = séances réalisées ; la fiche du jour ouvre le récapitulatif |
| Cardio (paliers comparables, BPM : `cardio.ts`) | objectif **Cardio**, indicateurs secondaires ; fiche exercice cardio |
| Bouton « Mes objectifs » | supprimé : Objectifs devient un onglet |

- **Fonctions sans destination** : tendance par exercice sur période glissante, variation par rapport à la période précédente, taux de réalisation du programme.
- Elles restent visibles dans l'écran provisoire jusqu'au lot N. Le retrait vaut abandon, sauf avis contraire à la relecture du lot N.

### 2.2 Objectifs

**Sept objectifs installés d'office**, dans cet ordre, par un seed idempotent (§ 3.6.4). Cible, échéance et indicateur principal sont facultatifs : s'ils manquent, le statut affiché est « — », et aucune valeur n'est inventée.

**Objectif à segments (correction A).**
- Un objectif porte un ou plusieurs **segments**. Chaque segment a son indicateur, son sens et sa cible de segment.
- Seul le **dernier** segment (`role: "final"`) porte la réussite de l'objectif.
- Atteindre la cible d'un segment intermédiaire affiche « **Palier atteint** », jamais « objectif atteint ».
- Les segments ne sont **jamais raccordés** sur la courbe.

| # | Clé | Titre | Segment(s) : protocole, mesure, sens, cible | Échéance |
|---|---|---|---|---|
| 1 | `traction` | Traction | **S1 intermédiaire** : `traction` / `assistance_min_kg`, baisse = mieux, cible de segment **0 kg** ; **S2 final** : `traction_stricte` / `tractions_barre`, hausse = mieux, cible **1 traction stricte** | S1 : **2027-03-31** (trajectoire vers 0 kg en mars 2027, conforme à M5) ; S2 : saisie à son activation (N1) |
| 2 | `upper_body` | Haut du corps | final : `mensurations` / `ratio_epaules_taille` (dérivée), hausse = mieux, cible — | — |
| 3 | `legs` | Jambes | final : **à choisir après 2 tests** parmi `sprint_puissance_moy`, `sprint_baisse_pct`, `chaise_duree_s` ; absent à l'installation | — |
| 4 | `cardio` | Cardio | final : `cardio` / `fc_moy_16_20` (calculée, D28), baisse = mieux, cible — | — |
| 5 | `core` | Tronc | final : `tronc` / `planche_duree_s`, hausse = mieux, cible — (D7) | — |
| 6 | `flexibility` | Souplesse | final : `souplesse` / `doigts_sol_cm` (signée, D8), baisse = mieux, cible — | — |
| 7 | `weight` | Poids | final : `weight_weekly_average`, baisse = mieux, cible **75 kg** (D9) | **2027-03-31** |

**Définitions**
- **Départ d'un segment** : le premier résultat admissible de sa mesure. Il est dérivé, jamais stocké.
- **Départ du Poids** : la première semaine complète avec au moins 3 pesées (D9).
- **Trajectoire, statut, pourcentage** : § 5.1.
- **Courbe principale** : uniquement les résultats de test de la mesure du segment. Pour le Poids : les moyennes hebdomadaires. **Jamais** de jalon, de série ni de meilleure performance d'entraînement.
- **Passage de S1 à S2 (C10)** : pas d'algorithme en V1. Le modèle et le protocole `traction_stricte` existent ; le geste qui active S2 est à définir (N12).
- **Séance liée** : séance confirmée contenant au moins un exercice lié réellement effectué (brique ou enfant de tour). Les briques d'échauffement (`warmup`) ne comptent pas (N10).

**Exercices liés, installés par le seed (D10)**

| Objectif | Exercices liés |
|---|---|
| Traction | traction assistée · traction négative · tirage vertical · rowing poulie basse · pullover poulie bras tendus · suspension + activation des omoplates |
| Haut du corps | chest press · développé épaules machine · développé incliné haltères · élévations latérales · rowing poulie basse · tirage vertical · extension triceps poulie |
| Jambes | squat barre · presse à cuisses · leg curl assis · montée sur banc · chaise 60° · marche latérale élastique · mollets debout · sprints vélo |
| Cardio | tapis (`tapis`), vélo (`velo`) : exercices de Cardio A, B, C |
| Tronc, Souplesse | exercices des routines du soir, **à définir** (correction B) : liste vide tant que les routines n'ont pas de contenu |
| Poids | aucun |

- **Lettre A/B/C d'un exercice (M6)** : elle est lue sur les modèles du programme V1 qui le contiennent (`SessionTemplate.letter`), jamais stockée sur le lien.
- **Plusieurs lettres possibles.** Un exercice présent dans plusieurs modèles affiche toutes ses lettres (élévations latérales : A et B ; leg curl : A et C).
- **Conseils (M7)** : Traction selon M7. Objectifs 2 à 7 : premier jet en annexe (section 9), marqué « à valider ».

### 2.3 Tests

**Structure générique**
- Protocole stable, puis versions figées dès le premier résultat officiel, puis résultats datés à plusieurs mesures.
- L'objectif désigne la mesure de chacun de ses segments.
- **Source unique** : `testResults` (D27).
- **Jalons ≠ tests** : les jalons restent des données d'entraînement.

**Semaine de tests** : toutes les 4 semaines. La première va du **dimanche 27/09 au samedi 03/10/2026**.

**Place de chaque test**, dans `settings.testSchedule` (§ 3.9) :

| Protocole | Jour | Créneau / séance | Placement |
|---|---|---|---|
| `traction` | dimanche | Muscu A | **étape 0**, avant le premier bloc de travail ; ajustement : traction assistée **2 séries** au lieu de 3 |
| `mensurations` | lundi | matin, avec la pesée | hors séance |
| `souplesse` | **lundi** | **soir, à la place de la routine** (D12) ; première fois le **lundi 28/09/2026** | remplace la séance du soir |
| `cardio` | mercredi | Cardio A | **remplace** le bloc principal (35 min à 5 km/h, pente 6-8 %) |
| `jambes` | jeudi | Muscu C | **après l'échauffement, avant le travail musculaire** (D11) |
| `tronc` | **à placer** (N2) | — | protocole défini (D7), place non décidée |

**Génération**
- Pour une semaine de tests, `generateProgramWeek` attache à chaque `PlannedSession` concernée un `tests[]` (§ 3.5.2).
- Au démarrage, `createWorkoutSnapshot` insère la brique `test` et applique les ajustements.

**Séance déplacée, sautée, non réalisée (D26)**
- **Déplacée** : son test la suit.
- **Sautée**, ou **non réalisée** (jour passé sans séance) : chaque test attaché qui n'a pas de résultat devient **« à replanifier »** (en retard). C'est un état **dérivé**, sans champ stocké.
- **« Replanifier »** attache le test à une autre instance planifiée, ou à une séance libre ne contenant que la brique test. Le test d'origine est alors marqué `rescheduledToPlannedSessionId`.
- Un test en retard n'est **jamais converti** en test passé.
- La saisie manuelle d'un test passé reste un geste distinct et explicite.

**Saisie d'un test passé**
- Depuis la page Objectif ou Plus > Protocoles de tests, avec une date choisie. Le résultat a pour origine `manual`.
- C'est le chemin du test du 27/09, noté sur papier.

**Recommandation d'entraînement à partir d'un test** : infrastructure seulement.
- Un type `TestRecommendationRule` et un registre **vide**.
- M10.3 n'affiche une recommandation que si une règle existe. Aucune règle n'est codée.

**Protocoles V1** : § 3.7.4.
- `traction_stricte` est créé avec le statut `paused` (utilisé seulement par le segment S2).
- Les trois autres tests cardio de l'ancienne spec sont en pause : ni créés ni supprimés.

### 2.4 Poids et mensurations

- **Pesée quotidienne** : `weightEntries`, une par jour. Une seconde saisie le même jour remplace la première (comportement du repository).
- **Indicateur (D9)** : moyenne de la **dernière semaine complète** (dimanche → samedi) qui compte **au moins 3 pesées**. La semaine en cours est affichée « **provisoire** » et n'entre pas dans le statut. Détail au § 5.4.
- **Mensurations** (épaules, taille) : protocole `mensurations` du modèle générique, **sans table dédiée** (D13). Le ratio est dérivé.
- **Photos** : hors de l'app en V1.

### 2.5 Programme V1

- **Installé d'office** (lot D) par un seed idempotent : marqueur `settings.install.programV1`, aucune réécriture ensuite. Le modèle brouillon existant n'est pas touché.
- **Semaine type** :

  | Dimanche | Lundi | Mardi | Mercredi | Jeudi | Vendredi | Samedi |
  |---|---|---|---|---|---|---|
  | Muscu A | Cardio B | Muscu B | Cardio A | Muscu C | repos | Cardio C |

  Chaque soir : routine A / B / C en rotation.
- **Routines du soir (correction B)** : 3 modèles « Routine A — à définir », « Routine B — à définir », « Routine C — à définir », catégorie `Routine`, **aucun bloc**.
  - Aucun exercice n'est inventé.
  - Une routine vide s'affiche au Planning et à l'Accueil avec la mention « Contenu à définir ». Elle ne se démarre pas (bouton désactivé, raison affichée).
  - Le lundi soir d'une semaine de tests, le test Souplesse prend sa place.
- **Échauffement (D14)** : chaque muscu commence par une **vraie brique** cardio facile, tapis ou vélo, un palier de 10 min en plage 8-10 min, avec le rôle `warmup`. Elle ne compte pas comme une séance cardio dans le résumé mensuel.
- **Plages (D16)** : les consignes portent de vraies plages min/max quand la prescription en est une (§ 3.4.1). Jamais une valeur unique qui travestit la prescription.

**Contenu des modèles**

| Modèle | Blocs, dans l'ordre (consignes ; première cible du cadre entre parenthèses, D19) |
|---|---|
| **Muscu A — Traction force / dos** (~60 min), A | échauffement cardio 8-10 min ; traction assistée 3×6-8, repos 150 s (**52 kg d'aide**) ; squat barre 3×8-10, repos 120 s (**35 kg**, barre 20 kg, saisie par côté 7,5 kg) ; rowing poulie basse 3×8-12 (**37,5 kg**) ; chest press 3×8-12 (**37,5 kg**) ; leg curl assis 3×10-12 (**30 kg**) ; élévations latérales 2×12-15, repos **90 s** (D15) (**5 kg**) |
| **Muscu B — Pecs / épaules** (~60 min), B | échauffement ; traction négative 3×3-5, descente visée ≥ 5 s ; développé épaules machine 3×8-10 (**27,5 kg**) ; presse à cuisses 3×10-12 (**130 kg**) ; **développé incliné haltères** 3×8-12 (*à étalonner* : vide) ; tirage vertical 3×8-12 (**40 kg**) ; élévations latérales 2×12-15, repos 90 s (**5 kg**) ; extension triceps poulie 2×10-15 (**15 kg**) |
| **Muscu C — Jambes padel** (~60 min), C | échauffement ; suspension + activation des omoplates 3×20-30 s ; sprints vélo 6×12 s / 48 s ; montée sur banc bas 3×8/jambe ; **groupe « Rester bas »** ×3 tours, 90 s entre les tours : chaise 60° 30-45 s, marche latérale élastique 10 pas/côté, mollets debout 15-20 ; pullover poulie bras tendus 3×10-15 (*à étalonner* : vide) ; leg curl assis 2×12 (**30 kg**) → N5 |
| **Cardio A — Endurance facile** (45 min), A | tapis : 5 min à 4,5 km/h, 0 % ; **35 min à 5 km/h, pente 6-8 %** (`mainBlockId`) ; 5 min de retour au calme |
| **Cardio B — Intervalles vélo** (40 min), B | 10 min progressif ; 8 × (1 min RPE 7-8 / 2 min facile) ; 5 min de retour au calme |
| **Cardio C — Endurance longue** (55 min), C | 5 / 45 / 5 min, réglages de Cardio A ou randonnée ; consigne « +5 min quand c'est confortable, jusqu'à 90 min » |

**Exercices à créer (lot D)**

| Id | Nom | Classification | Mesure |
|---|---|---|---|
| `traction-negative` | Traction négative | Musculation / Dos / Tirage / Poids du corps | `reps_duration` : répétitions + **durée de chaque descente** (D25) |
| `suspension-omoplates` | Suspension + activation des omoplates | Musculation / Dos / Tirage / Poids du corps | `duration` |
| `montee-banc` | Montée sur banc bas | Musculation / Jambes / Squat / Poids du corps | `reps_per_side` |
| `chaise-60` | Chaise contre le mur à 60° | Musculation / Jambes / Squat / Poids du corps | `duration` |
| `marche-laterale-elastique` | Marche latérale élastique | Musculation / Jambes / Isolation / Élastique | `reps_per_side`, libellé « pas » |
| `mollets-debout` | Mollets debout | Musculation / Jambes / Isolation / Machine | `load_reps` |
| `sprint-velo` | Sprints vélo | Cardio / — / — / Vélo | `duration_power` : durée + résultat en watts **ou** mètres + résistance (D17) |

« Tirage bras tendus » = `pullover-poulie`, qui existe déjà.

#### 2.5.1 Cadres de progression du programme (D18, D19)

- **Principe (D19)** : le programme V1 validé vaut autorisation initiale. Le seed D crée un cadre par exercice de musculation à charge du programme. Sa **première cible** (`currentTarget`) est la charge indiquée ci-dessus, avec `acceptedAt` = date d'installation et sans `fromMilestoneId`.
- Les charges *à étalonner* (développé incliné haltères, pullover poulie bras tendus) et celles non indiquées (mollets debout) restent **sans cible**. La presse à cuisses démarre à 130 kg (relecture 4).

| Exercices | Type | Séries / plage / repos | RPE cible | Incrément |
|---|---|---|---|---|
| haut du corps (chest press, développé épaules, développé incliné, rowing, tirage vertical, extension triceps, pullover) | `charge_croissante` | ceux du modèle | 8 | **2,5 kg** |
| élévations latérales | `charge_croissante` | 2 × 12-15, 90 s | 8 | **plus petit écart d'haltères disponible**, 1 kg par défaut (modifiable) |
| jambes (squat, presse, leg curl, mollets debout) | `charge_croissante` | ceux du modèle | 8 | **5 kg** |
| traction assistée | `assistance_decroissante` | 3 × 6-8, 150 s | 8 | **absent** tant que le cran de la machine n'est pas saisi (D18) |

- **Squat** : `barWeightKg: 20`, saisie par côté (v1.6).
- **Séances à prescription réduite : ni validation, ni stagnation.** Une séance où l'exercice est fait avec moins de séries que le cadre n'en demande, **par prescription**, ne valide jamais le palier et n'est pas comptée dans la détection de stagnation. Deux cas en V1 :
  - le **jour du test traction** (traction assistée ramenée à 2 séries par l'ajustement du test) ;
  - le **leg curl de Muscu C** (2 × 12, contre 3 × 10-12 au cadre, N5).

  **Règle technique** : la brique réalisée porte `reducedPrescription: true`, posé au démarrage par `createWorkoutSnapshot` quand le nombre de séries des consignes (après ajustement éventuel du test) est inférieur à `workSets` du cadre capturé. À la confirmation, `validateFrame` n'est pas appelée pour cette version sur cette brique : aucun jalon, aucun motif « séries manquantes ». `listVersionSessions` et `detectStagnation` ignorent ces séances. Les séries restent des données d'entraînement normales (tonnage, historique, records).
- **Exercices en durée** (suspension, chaise) : pas de cadre en V1. La décision « double progression » vise les charges.
- **Traction négative** (`reps_duration`) : pas de cadre ; `frameTypesFor` n'en prévoit pas pour ce type.
- **Cardio** : « la durée d'abord ». C'est une consigne, sans algorithme.
- **Cran de la machine (D18)** : paramètre saisi par l'utilisateur sur la version de cadre de la traction assistée. Tant qu'il est absent, `nextStep` et `proposeRaise` ne proposent rien. Sa saisie après la première séance officielle pose la question du figeage → **N4**.

### 2.6 Séance et fin de séance

- **Plein écran** : `/seance-en-cours`.
- **Terminer** : demande une **confirmation** (D21). Ensuite, l'écran écrit `endedAt`, clôt le repos en cours et fige `activeDurationSec` à `endedAt`. Le statut reste `in_progress` (D20).
  - Aucun jalon, aucun figeage, aucun résultat de test.
  - L'instance planifiée ne passe pas à `done`.
- **Entre Terminer et Enregistrer (D21)** :
  - **permis** : ressenti, notes, **correction des séries**, et des essais ou mesures de la brique test ;
  - **pas de « Reprendre la séance »**.
- **Enregistrer et revenir à l'accueil** : `confirmWorkout`, en une transaction.
  1. écrit `feeling` et `note` ;
  2. passe la séance `completed`, avec `completedAt = endedAt` ;
  3. pour les cadres (logique actuelle de `finishWorkout`) : figeage des versions, jalons, effacement de `currentTarget`. **Exception** : une brique marquée `reducedPrescription` (jour du test traction, leg curl de Muscu C) ne valide jamais le palier et n'est pas comptée en stagnation (§ 2.5.1) ;
  4. pour chaque brique test : **création du `testResult`**, puis remplacement de la saisie de la brique par la seule référence `testResultId` (D27) ;
  5. passe l'instance planifiée à `done`.

  Ensuite, la séance est **non modifiable** : la règle v1.5 § 11.1 est inchangée.
- **App fermée entre les deux** : au lancement, une séance `in_progress` avec `endedAt` ouvre le **récapitulatif en attente**.
- **Séance en attente** : elle n'entre dans aucune statistique, aucun record ni aucun objectif.
- **Récapitulatif (M10.1)** : objectifs travaillés (§ 5.7), records (§ 5.6), tonnage hors assistance, ressenti (5 niveaux), notes, prochaine séance.
- **Détail (M10.2)** : liste des exercices → page dédiée (décision du 17/09). La brique test apparaît en tête, avec son résultat.

### 2.7 Planning

- **Semaine (M2)** : 7 lignes, du dimanche au samedi. Un jour sans séance affiche « Repos » ; la routine du soir apparaît sous le créneau Soir.
- **Statuts (D23)** :
  - **Faite** ;
  - **Sautée** : choix de l'utilisateur ;
  - **Non réalisée** : jour passé, séance ni faite ni sautée ;
  - **Aujourd'hui** ;
  - **À venir**.
- **Déplacer.** Quand le jour visé porte déjà une séance **du même créneau**, trois choix sont proposés :
  - **Échanger** : les deux instances échangent leurs dates, avec leurs tests ;
  - **Faire les deux** : les deux coexistent ;
  - **Remplacer** : l'instance visée est retirée (`removedAt`) ; ses tests passent « à replanifier ».

  Le bouton du bas reprend le choix fait. Une instance faite ou en cours n'est jamais échangée ni remplacée : seul « Faire les deux » est proposé.
- **Sauter** : dans le menu et dans la feuille Déplacer. Les tests attachés passent « à replanifier » (D26).
- **Mois (M3)** : le passé montre les séances **réalisées** (confirmées), le futur les séances **planifiées**, aujourd'hui les deux. Fiche d'un jour. **Résumé du mois** : Musculation / Cardio / Routine, et jours sans séance (§ 5.8, N8).

### 2.8 Accueil (M1)

- **Bloc Aujourd'hui** : séance du jour, test éventuel, routine du soir (« Contenu à définir » tant qu'elle est vide).
- **Bandeau** : « Semaine de tests dans N jours » ou « Semaine de tests », formulation identique dans la liste des Objectifs.
- **7 cartes d'objectifs**, chacune avec :
  - la valeur du segment courant, issue d'un **test** (ou la moyenne de pesées pour le Poids), et le statut ;
  - ou « À mesurer » et la date du prochain test ;
  - ou « Test à replanifier ».
- **Invariant** : une carte n'affiche **jamais** une performance d'entraînement comme un résultat de test. Un test d'invariant le vérifie.
- **Choisir une séance** : l'entrée « Bilan de mobilité » disparaît (D2).

### 2.9 Plus (M11)

- **Profil** : prénom ; **date de naissance complète**, facultative, âge calculé (D24) ; taille. Pas de photo.
- **Exercices** : bibliothèque existante.
- **Routines du soir** : les 3 cadres vides.
- **Protocoles de tests** : liste, versions, « Saisir un test passé », « Tests à replanifier ».
- **Réglages** :
  - thème clair / sombre / auto ;
  - son du minuteur ;
  - repos de la séance libre, 90 s par défaut ;
  - **pas de Vibration**.
- **Sauvegarde** :
  - exporter ;
  - importer (base vide, sinon parcours export → effacement → import) ;
  - effacer (double confirmation, export proposé avant).
- **À propos** : version de l'application et date de build.
- **Pas d'import de septembre** (D3).

---

## 3. Modèle de données et schéma Dexie v3

### 3.1 Schéma

```ts
this.version(1).stores(VERSION_1_STORES);           // inchangé
this.version(2).stores(VERSION_2_STORES);           // inchangé
this.version(3).stores({
  exercises: "id, name, zone, movement, equipment, location, mode, measurementType, status, updatedAt, progressionGroup, movementFamily",
  sessionTemplates: "id, name, category, status, position, updatedAt",
  weeklyPrograms: "id, name, updatedAt",
  plannedSessions: "id, date, sessionTemplateId, status, source, updatedAt",
  workouts: "id, date, plannedSessionId, sessionTemplateId, source, status, startedAt, completedAt, updatedAt, kind",
  weightEntries: "id, &date, kg, updatedAt",
  strengthFrames: "id, exerciseId, updatedAt",
  strengthFrameVersions: "id, frameId, status, updatedAt",
  strengthMilestones: "id, frameVersionId, workoutId, date",
  rpeScaleVersions: "id, status, startDate",
  goals: "id, &key, position, updatedAt",                           // refondu
  testProtocols: "id, &key, status",                               // nouveau
  testProtocolVersions: "id, protocolId, status",                  // nouveau
  testResults: "id, protocolId, versionId, date, workoutId, [protocolId+date]",   // nouveau
  settings: "key",                                                 // nouveau
  // suppression sous garde (D1) — ici, ou en version(4) : § 4.1
  cardioProtocols: null, cardioProtocolVersions: null, cardioTests: null, cardioTestMeasures: null,
  mobilityProtocolVersions: null, mobilityAssessments: null, mobilityMeasures: null, mobilityObservations: null,
}).upgrade(guardLegacyStoresEmpty);
```

- **15 stores** en fin de migration.
- Pas d'index nouveau sur `plannedSessions.slot` ni sur `workouts.endedAt` : filtres en mémoire, volumes faibles.

### 3.2 Relations

```mermaid
flowchart LR
  EX[exercises] --> ST[sessionTemplates]
  ST --> WP[weeklyPrograms]
  ST --> PS[plannedSessions]
  PS -->|tests[]| TP[testProtocols]
  PS --> WK[workouts]
  WK -->|brique test → testResultId| TR[testResults]
  TP --> TV[testProtocolVersions] --> TR
  G[goals] -->|segments| TP
  G -->|exercices liés| EX
  G -->|poids| WE[weightEntries]
  EX --> SF[strengthFrames] --> SV[strengthFrameVersions] --> SM[strengthMilestones]
  WK --> SM
  RPE[rpeScaleVersions] --> WK
```

### 3.3 `exercises`

Champs inchangés, dont `loadSemantics?` (lot a). Ajouts :

| Ajout | Détail |
|---|---|
| `MeasurementType` `reps_duration` (mode `series`) | série = `reps` + `repDurationsSec?: number[]` (une durée par répétition, D25) ; `durationSec` = la plus longue, pour les métriques existantes |
| `MeasurementType` `duration_power` (mode `series`) | série = `durationSec` + `result: { unit: "watts" \| "meters"; value }` + `resistance?: number` |
| `powerUnit?: "watts" \| "meters"` (`duration_power`) | **fixée à la première saisie**, ensuite imposée ; changer de machine ou d'unité passe par un nouvel exercice (D17) |
| `PerformedSeries.repDurationsSec?`, `result?`, `resistance?` | facultatifs |

**Saisie par répétition (D25), UX.**
- Après la saisie du nombre de répétitions, une rangée de N petits champs « s » s'affiche, préremplis vides. On peut n'en remplir aucun.
- Si l'essai sur PC montre une saisie trop lourde, repli : une seule durée, « la plus lente ». C'est à décider à la recette du lot D, pas avant.

**Conséquences dans le code** (signalées par les `satisfies` exhaustifs) :
- `SeriesForm`, `workoutDisplay` ;
- `exercisePerformance.getCompatiblePerformanceMetrics` :
  - `reps_duration` → `reps` et `durationMax` ;
  - `duration_power` → `powerMax` (nouvelle métrique, comparée à même unité et même durée).

### 3.4 `sessionTemplates`, briques et `weeklyPrograms`

```ts
type SessionCategory = "Musculation" | "Cardio" | "Mobilité" | "Bilan de mobilité" | "Routine";

interface SessionTemplate {
  // existants : id, name, category, description?, status, position, blocks, createdAt, updatedAt
  letter?: "A" | "B" | "C";
  subtitle?: string;              // « Traction force / dos »
  tags?: string[];                // « Haut du corps · Dos » (M2)
  origin?: "program_v1";
  mainBlockId?: Id;               // Cardio A : bloc remplacé par le test
}

interface BaseBlock { /* existants */ role?: "warmup" }   // D14 ; absent = travail

interface WeeklyProgram {
  // existants
  eveningRotation?: Id[];         // [routine A, B, C]
  eveningRotationAnchor?: string; // date de la routine A de référence
}
```

- **« Routine »** (5ᵉ catégorie) se complète comme la 4ᵉ (`sessionCategories`, `icons` avec `satisfies`, classe CSS).
- **« Bilan de mobilité »** reste dans le type jusqu'au lot N, mais n'est plus proposée à la création (D2).
- **Identifiants fixes** :
  - modèles : `v1-muscu-a/b/c`, `v1-cardio-a/b/c`, `v1-routine-a/b/c` ;
  - blocs : `v1-muscu-a-traction`, `v1-cardio-a-principal`, etc.

#### 3.4.1 Plages dans les consignes (D16)

`NumberRange { min; max }` existe déjà (`session.ts:138`). Il est étendu aux paliers :

```ts
type RangeOrValue = number | NumberRange;       // une valeur unique reste permise quand la prescription en est une

interface SpeedInclineStepInstruction {
  // existants : id, position, durationSec, …
  durationSec: RangeOrValue;                     // 8-10 min (échauffement)
  speedKmh: RangeOrValue;
  inclinePercent: RangeOrValue;                  // 6-8 %
  targetRpe?: NumberRange;                       // RPE 7-8 (Cardio B)
}
```

- **Mêmes plages** pour `restBetweenSetsSec` quand une prescription l'exige ; aucune dans le programme V1 depuis D15.
- **Le réalisé reste une valeur unique** : le palier exécuté porte les réglages réels.
- **Préremplissage** : bas de la plage.
- **Comparabilité des paliers** (`isCardioStepComparable`) : elle reste calculée sur les réglages **exécutés**, donc inchangée.
- **Données existantes** : les consignes actuelles (nombres) restent valides.

### 3.5 `plannedSessions` et `workouts`

#### 3.5.1 `PlannedSession`

```ts
interface PlannedSession {
  // existants
  slot?: "morning" | "day" | "evening";          // absent = "day"
  tests?: PlannedTest[];
}

interface PlannedTest {
  protocolId: Id;
  placement: "before_all" | "after_warmup" | "replace_block" | "replace_all";
  targetBlockId?: Id;                            // replace_block
  adjustments?: Array<{ blockId: Id; sets: number }>;
  rescheduledToPlannedSessionId?: Id;            // D26 : posé par « Replanifier »
}
```

- **Placement de chaque test** :
  - Traction : `before_all`, mais après l'échauffement → `after_warmup` ;
  - Jambes : `after_warmup` ;
  - Cardio : `replace_block` ;
  - Souplesse : `replace_all`, sur la routine du lundi soir.
- **Mensurations** : pas de `PlannedSession`. L'Accueil et le Planning les lisent dans `settings.testSchedule` et dans le cycle.
- **État « à replanifier »** d'un test, **dérivé** : instance `skipped`, ou `removedAt`, ou passée et `upcoming` (non réalisée) ; aucun `testResult` pour ce protocole à cette date ; pas de `rescheduledToPlannedSessionId`.

#### 3.5.2 `WorkoutSession` et brique `test`

```ts
interface WorkoutSession {
  // existants
  endedAt?: string;                  // D20 : présent + status in_progress = en attente d'enregistrement
  feeling?: 1 | 2 | 3 | 4 | 5;       // 1 = Très difficile … 5 = Très facile
  note?: string;                     // note de séance
}

type PerformedBlock = PerformedExerciseBlock | PerformedGroupBlock | PerformedNoteBlock | PerformedTestBlock;

interface PerformedTestBlock {
  kind: "test"; id: Id; position: number;
  status: PerformedBlockStatus;
  protocolId: Id; protocolVersionId: Id;        // version capturée au démarrage
  replacedBlockId?: Id;
  draft?: {                                      // saisie pendant l'exécution (D27)
    trials?: TestTrial[];
    values?: Record<string, number>;
    sideValues?: Record<string, { left?: number; right?: number }>;
    note?: string;
  };
  testResultId?: Id;                             // après confirmation ; draft retiré
}

interface TestTrial { order: number; value: number; outcome: "success" | "failure"; restSec?: number; completedAt: string }
```

- **D27, source unique.** À la confirmation, `draft` est **retiré** de la brique et `testResultId` est posé : aucune copie définitive dans la séance. Le récapitulatif et le détail lisent le `testResult`.
- **Reprise du moteur.** Le moteur écrit `draft` comme toute saisie, par le chemin d'écriture unique de la séance.
- **Rôle d'échauffement** : `PerformedExerciseBlock.role?: "warmup"` est recopié depuis la brique du modèle.

#### 3.5.3 Mesures cardio étendues

```ts
interface PerformedExerciseBlock {
  // existants
  role?: "warmup";
  reducedPrescription?: true;        // moins de séries que le cadre, par prescription : ni validation ni stagnation (§ 2.5.1)
  heartRate?: { samples?: Array<{ atSec: number; bpm: number }>; maxBpm?: number; recovery1MinBpm?: number };
}
```

Facultatif en entraînement. En test, ces valeurs sont des mesures du protocole.

### 3.6 `goals` (refonte)

#### 3.6.1 Modèle

```ts
type GoalKey = "traction" | "upper_body" | "legs" | "cardio" | "core" | "flexibility" | "weight";
type Direction = "increase" | "decrease";

type GoalMeasure =
  | { source: "test"; protocolId: Id; measureKey: string }
  | { source: "weight_weekly_average" };

interface GoalSegment {
  id: Id;
  role: "intermediate" | "final";        // correction A : seul "final" fait réussir l'objectif
  measure?: GoalMeasure;                 // absent = « — » (Jambes avant 2 tests)
  direction?: Direction;
  target?: number;                       // cible du segment
  dueDate?: string;                      // échéance du segment ; Traction S1 = 2027-03-31, S2 saisie à l'activation (N1)
  label: string;                         // « Assistance minimale », « Traction stricte »
}

interface Goal {
  id: Id; key: GoalKey; position: number;
  title: string; icon: string;           // Lucide (D4)
  segments: GoalSegment[];               // ordonnés ; au moins un
  currentSegmentId: Id;
  dueDate?: string;                      // repli si le segment courant n'en a pas ; la carte Échéance (M5) affiche celle du segment courant
  linkedExercises: Array<{ exerciseId: Id }>;
  secondaryIndicators: Array<
    | { kind: "exercise"; exerciseId: Id; metric: "chargeMax" | "reps" | "durationMax" | "volume" | "powerMax" }
    | { kind: "test_measure"; protocolId: Id; measureKey: string }
  >;
  adviceKey: string;
  createdAt: string; updatedAt: string;
}
```

- **Rien de dérivé n'est stocké** : ni départ, ni statut, ni atteinte. Tout se recalcule à l'affichage, suppression de séance comprise.
- **Passage de segment** : il modifie `currentSegmentId`. Le geste est à définir (N12).

#### 3.6.2 Contenu des objectifs à l'installation

| Objectif | Segments | Échéance | Exercices liés | Indicateurs secondaires |
|---|---|---|---|---|
| Traction | S1 intermédiaire `traction/assistance_min_kg`, décroissant, cible 0, **échéance 2027-03-31** ; S2 final `traction_stricte/tractions_barre`, croissant, cible 1, échéance saisie à l'activation | — (portée par les segments) | 6 (D10) | Traction négative (reps, durée max) ; Tirage vertical (charge max) ; Rowing poulie basse (charge max) ; Suspension (durée max) |
| Haut du corps | final `mensurations/ratio_epaules_taille`, croissant | — | 7 (D10) | charge max de chacun des exercices liés |
| Jambes | final, **mesure absente** | — | 8 (D10) | mesures du test `jambes` ; charge max squat, presse, leg curl, mollets |
| Cardio | final `cardio/fc_moy_16_20`, décroissant | — | tapis, vélo | mesures secondaires du test `cardio` |
| Tronc | final `tronc/planche_duree_s`, croissant | — | vide (routines à définir) | — |
| Souplesse | final `souplesse/doigts_sol_cm`, décroissant | — | vide (routines à définir) | `apley_cm`, `papillon_cm` |
| Poids | final `weight_weekly_average`, décroissant, cible 75 | 2027-03-31 | aucun | — |

#### 3.6.3 Contenu Conseils

- **Fichier** : contenu statique `features/goals/goalAdvice.ts`, sélectionné par la clé `adviceKey`.
- **Rubriques** : fréquence, comment progresser, points techniques, erreurs à éviter.
- **Traction** : le texte de M7.
- **Objectifs 2 à 7** : le premier jet de la section 9, marqué « **à valider** ». L'app l'affiche avec un bandeau « Conseils en cours de validation » tant que ce marqueur est présent.

#### 3.6.4 Seed

- Il crée les 7 objectifs s'ils sont absents (clé unique).
- Il n'écrase jamais un objectif existant, même principe que la classification des exercices.

### 3.7 Tests

#### 3.7.1 `testProtocols`

```ts
interface TestProtocol {
  id: Id; key: string;                 // traction, traction_stricte, cardio, jambes, souplesse, mensurations, tronc
  name: string;
  status: "active" | "paused";
  activeVersionId: Id;
  createdAt: string; updatedAt: string;
}
```

#### 3.7.2 `testProtocolVersions`

```ts
interface TestProtocolVersion {
  id: Id; protocolId: Id; number: number;
  status: "active" | "archived";
  kind: "trials_descending" | "single_attempt" | "measures";
  instructions: string[];
  settings?: Record<string, number | string>;     // ex. { machine: "…", unit: "watts" }
  measures: Array<{
    key: string; label: string; unit: string;
    input: "entered" | "derived";
    required: boolean;
    side?: boolean;
    signed?: boolean;                              // accepte les valeurs négatives (doigts-sol, D8)
    exerciseId?: Id;
  }>;
  primaryMeasureKey?: string;
  firstOfficialResultId?: string; frozenAt?: string;
  createdAt: string; updatedAt: string;
}
```

- **Figeage** : comme les cadres. Après le premier résultat officiel, toute modification d'un réglage ou d'une mesure crée la version suivante.
- **Unité des sprints (D17)** : `settings.unit` est **fixée au premier test**. Tant que la version n'est pas figée, elle reste modifiable ; après, changer d'unité ou de vélo crée une nouvelle version. Deux versions ne se comparent pas.

#### 3.7.3 `testResults` (source unique, D27)

```ts
interface TestResult {
  id: Id; protocolId: Id; versionId: Id;
  date: string;
  origin: "workout" | "manual";
  workoutId?: Id; blockId?: Id;
  status: "complete" | "incomplete";
  measures: Array<{ key: string; value: number; unit: string; side?: "left" | "right" }>;
  trials?: TestTrial[];
  conditionsRespected?: boolean; conditionsNote?: string;
  rpe?: number; note?: string;
  createdAt: string; updatedAt: string;
}
```

- **Admissible dans une courbe** : `complete`, et la version appartient au segment courant.
- **Suppression** :
  - un résultat `manual` se supprime depuis son détail ;
  - un résultat `workout` disparaît avec sa séance, dans la même transaction que `deleteWorkout`.

#### 3.7.4 Protocoles V1 (seed du lot G)

| Clé | Nature | Consignes et réglages | Mesures (principale en **gras**) |
|---|---|---|---|
| `traction` | `trials_descending` | échauffement : 2 séries faciles à ~55 kg d'aide, non enregistrées ; 1er essai à 40 kg ; −2 à 3 kg par essai ; 3 min de repos ; jusqu'au premier échec ; même machine | **`assistance_min_kg`** (dérivée : dernier essai réussi) ; `essais_nb` (dérivée) |
| `traction_stricte` | `single_attempt` | à la barre, sans aide ; amplitude complète ; statut `paused` | **`tractions_barre`** (nombre) |
| `cardio` | `measures` | 20 min de tapis, 5 km/h, pente 8 % | `fc_16`, `fc_17`, `fc_18`, `fc_19`, `fc_20` (saisies) ; **`fc_moy_16_20`** (dérivée, D28) ; `fc_5`, `fc_10`, `fc_15` ; `fc_max` ; `fc_recup_1min` ; `rpe_final` |
| `jambes` | `measures` | 6 sprints vélo de 12 s, 48 s de récupération, même vélo, même résistance ; puis chaise contre le mur à 60°, durée max ; `settings.unit` fixée au 1er test (D17) | `sprint_1` … `sprint_6` ; `sprint_puissance_moy` (dérivée) ; `sprint_baisse_pct` (dérivée) ; `chaise_duree_s` ; `resistance` |
| `souplesse` | `measures` | protocole mobilité V1 (v1.6 § 6.2 : état, position, méthode, consigne d'arrêt) ; doigts-sol signé : 0 = contact, positif = au-dessus du sol, négatif = au-delà (D8) | **`doigts_sol_cm`** (`signed`) ; `apley_cm` G/D ; `papillon_cm` |
| `mensurations` | `measures` | le matin, même mètre ruban | `epaules_cm` ; `taille_cm` ; **`ratio_epaules_taille`** (dérivée) |
| `tronc` | `single_attempt` | planche sur les avant-bras, **1 essai**, durée maximale en bonne forme ; arrêt dès que le bassin descend ou monte franchement (D7) | **`planche_duree_s`** |

La saisie en cm accepte déjà les négatifs dans le code actuel (`SimpleMeasurementForm.tsx:134`, `min={-100}`). La brique test reprend ce comportement pour les mesures `signed`.

### 3.8 `weightEntries`

Inchangé. `weightRepository.ts` est enfin appelé (lot I).

### 3.9 `settings`

| Clé | Valeur | Défaut |
|---|---|---|
| `profile` | `{ firstName?: string; birthDate?: string /* YYYY-MM-DD */; heightCm?: number }` | vide (D24) |
| `preferences` | `{ theme: "light" \| "dark" \| "auto"; timerSound: boolean; freeWorkoutRestSec: number }` | `auto`, `true`, `90` |
| `testCycle` | `{ anchorWeekStart: string; everyWeeks: number }` | `2026-09-27`, `4` |
| `testSchedule` | `Array<{ protocolKey; weekday: Weekday; slot; templateId?; placement; targetBlockId?; adjustments? }>` | § 2.3 (sans Tronc, N2) |
| `install` | `{ programV1?; goals?; testProtocols?; frames? }` | dates d'installation |

---

## 4. Migration v2 → v3 et format de sauvegarde v2

### 4.1 Migration Dexie (D1)

**Garde de migration.** `guardLegacyStoresEmpty` compte les enregistrements :
- des 8 stores cardio et mobilité ;
- de `goals` sous la forme v1.

Si l'un d'eux n'est pas vide, la fonction lève une exception. La transaction d'upgrade est annulée, la base **reste en v2, intacte**, et l'app affiche « Migration impossible : exportez votre sauvegarde ».

**Faisabilité (vérifiée au lot C, avant tout autre code).** Dexie permet-il, dans l'`upgrade()` de la version qui supprime les stores (déclarés `null`), de les lire encore ?

| Réponse | Schéma retenu |
|---|---|
| **oui** | une seule `version(3)`, qui contrôle et supprime |
| **non** | `version(3)` : crée les nouveaux stores, refond `goals`, garde les 8 anciens et exécute la garde (aucun `null`) ; `version(4)` : ne fait que les passer à `null`. Les deux se déploient ensemble ; une base qui échoue à la garde v3 n'atteint jamais v4 |

Dans les deux cas, **aucun risque de perte**.

**Nature de la migration**
- Aucun enregistrement existant n'est réécrit.
- Tous les champs ajoutés sont facultatifs : absent = ancien comportement.

**Seeds au lancement**, dans l'ordre, chacun idempotent (marqueur `settings.install.*`, jamais d'écrasement) :
1. catalogue, avec les 7 exercices nouveaux ;
2. échelle RPE ;
3. `settings` par défaut ;
4. protocoles de tests (lot G) ;
5. programme V1 et routines vides (lot D) ;
6. cadres du programme avec leurs premières cibles (lot D, D19) ;
7. objectifs (lot H).

**Premier lancement sur la base réelle**
- Inchangés : les 12 séances, les 48 exercices, le brouillon.
- Ajoutés : 7 exercices, 9 modèles (6 plus 3 routines vides), la règle hebdomadaire, les protocoles, les cadres, les 7 objectifs et les réglages.

**Tests de migration** (lot C, fake-indexeddb puis navigateur intégré et Safari iOS avec données fictives) :
- base v2 vide ;
- copie de la sauvegarde du 22/09 ;
- base v2 avec un enregistrement cardio : refus, base restée v2 ;
- base v1 ;
- réouverture idempotente ;
- seeds rejoués deux fois sans écriture.

### 4.2 Format de sauvegarde v2

```ts
interface BackupEnvelopeV2 {
  format: "coach-jm-backup"; formatVersion: 2;
  exportedAt; app: { buildTime; version }; device;
  database: { name: "coach-jm"; version: 3 | 4 };
  counts; warnings;
  integrity: { algorithm: "SHA-256"; canonical: "sorted-keys-json-v1"; hash };
  legacyIntegrity: { hash7: string };     // 7 stores d'origine (comparaison avec les sauvegardes v1)
  stores: Record<StoreName, unknown[]>;
}
```

- L'empreinte garde le même principe : SHA-256 de la forme canonique de `stores`.
- `hash7` change dès que le seed complète un exercice. C'est attendu, comme au lot a.

### 4.3 Restauration des anciennes sauvegardes

| Fichier | Traitement |
|---|---|
| format 1, base v1 (7 stores) | 1. empreinte vérifiée telle quelle ; 2. `goals` doit être vide, sinon refus nommé ; 3. `bulkAdd` dans une base v3 vide, sans aucune transformation ; 4. relecture et empreinte recalculée sur les stores du fichier ; 5. seeds au lancement suivant |
| format 1, base v2 (19 stores) | idem ; les 8 stores cardio et mobilité doivent être vides, sinon refus nommé ; ils ne sont pas écrits |
| format 2 | chemin actuel |
| format > 2 | refus |

- `scripts/verify-backup.mjs` accepte les formats 1 et 2 et calcule `hash7`.
- **Import dans l'interface** : la base doit être vide. Sinon : exporter, puis effacer (double confirmation), puis importer.
- **Effacer** : suppression de la base Dexie et réouverture ; les seeds réinstallent tout.

---

## 5. Règles de calcul

Notations, pour un **segment** d'objectif :
- *S* : départ ; *C* : cible du segment ; *A* : dernier résultat admissible ;
- *d₀* : date du départ ; *tₐ* : date de *A* ;
- *D* : échéance du segment, sinon celle de l'objectif (Traction S1 : 31/03/2027, N1).

Les dates sont converties en jours entiers (`differenceInCalendarDays`).

### 5.1 Trajectoire, statut, pourcentage

**Conditions.** Il faut une mesure, une cible, une échéance et au moins un résultat.
- Sinon, le statut est « — ».
- Sans résultat : « À mesurer » et la date du prochain test, ou « Test à replanifier ».

**Amplitude** : `amp = |C − S|`. Si `amp = 0` : cible déjà tenue au départ, § 5.1 bis.

**Trajectoire** : `T(t) = S + (C − S) × (t − d₀) / (D − d₀)` pour d₀ ≤ t ≤ D, et `T(t) = C` au-delà.

**Statut**, évalué à *tₐ* :
- `σ = sign(C − S)` ;
- `écart = σ × (A − T(tₐ))` ;
- `tol = 0,05 × amp` ;

| Condition | Statut |
|---|---|
| `écart > tol` | en avance |
| `écart < −tol` | en retard |
| sinon | dans les temps |

**Écart en semaines** : `t* = d₀ + (A − S)/(C − S) × (D − d₀)`, puis `semaines = (tₐ − t*) / 7`, arrondi à 0,5.
- Positif : en retard de *n* semaines.
- Négatif : en avance.
- Non affiché si le statut est « dans les temps ».

**Pourcentage du segment** : `p = (A − S)/(C − S) × 100`, arrondi à l'unité.
- La barre est bornée à [0, 100].
- Le nombre affiché n'est pas borné : un recul donne un pourcentage négatif.

**Premier résultat** : écart 0, « dans les temps », 0 %.

#### 5.1 bis — Atteinte (correction A)

**Segment atteint** : `σ × (A − C) ≥ 0`.

| Segment atteint | Affichage |
|---|---|
| intermédiaire | « **Palier atteint** » (Traction à 0 kg : « Palier atteint — prochaine étape : traction stricte »). Statut de l'objectif « — », courbe arrêtée, **jamais** « objectif atteint » |
| final | « **Objectif atteint** » |

**Pourcentage de l'objectif sur les cartes** (M1, M4) : celui du **segment courant**, libellé du nom du segment dès qu'il y en a plusieurs (« Assistance minimale : 40 % »). Il n'y a pas de pourcentage global inter-segments.

### 5.2 Courbe

- **Points** : les résultats admissibles de la mesure du segment, par date.
- **Segments** : un par segment d'objectif et par version de protocole, **jamais reliés**.
- **Trajectoire** : celle du segment courant.
- **Poids** : points = moyennes hebdomadaires complètes (§ 5.4) ; la semaine provisoire est affichée en point creux.

### 5.3 Mesures dérivées d'un test

Toutes les mesures dérivées sont calculées et stockées **une fois à l'enregistrement**. Un changement de formule ne réécrit pas le passé.

**Traction**
- `assistance_min_kg` = valeur du **dernier essai réussi**, dans l'ordre des essais.
- Aucun essai réussi : mesure absente, résultat `incomplete`, avec le message « aucun essai réussi : recalibrer le premier essai ».
- `essais_nb` = nombre d'essais.

**Cardio (D28)**
- `fc_moy_16_20 = (fc_16 + fc_17 + fc_18 + fc_19 + fc_20) / 5`, arrondie à l'unité.
- Nombre minimal de relevés → N9.

**Jambes**
- `sprint_puissance_moy` = moyenne des `sprint_i` renseignés.
- `sprint_baisse_pct = (sprint_1 − sprint_6) / sprint_1 × 100`, arrondie à 0,1.
- Seule unité admise : celle de la version.

**Mensurations** : `ratio_epaules_taille = epaules_cm / taille_cm`, arrondi à 0,01.

**Souplesse**
- Valeurs entrées ; doigts-sol signé.
- Apley par côté ; la valeur comparée est le côté le moins bon, comme dans le code actuel.

**Tronc** : `planche_duree_s`, entrée.

**Complétude** : `complete` si toutes les mesures `required` entrées sont présentes et si les dérivées sont calculables.

### 5.4 Poids (D9)

- **Semaine** : dimanche → samedi.
- **Moyenne d'une semaine** = moyenne arithmétique de ses pesées, arrondie à 0,1 kg. Elle n'est **valide** qu'avec au moins 3 pesées.
- **Indicateur** = moyenne de la **dernière semaine complète valide**.
- **Semaine en cours** : moyenne affichée « **provisoire** », avec le nombre de pesées. Elle n'entre ni dans le statut ni dans la courbe pleine.
- **Départ** = première semaine complète valide.
- **Statut** : § 5.1, décroissant, cible 75 kg, échéance 31/03/2027.

### 5.5 Tonnage

- `Σ charge × répétitions` des séries validées des exercices `external` à charge.
- Assistance = 0 (lot a).
- Les briques `warmup` n'ont pas de charge.
- Libellé : « Tonnage total ».

### 5.6 Records (D22)

**Portée**
- Un record se calcule pour chaque exercice réellement effectué dans la séance confirmée, brique ou enfant de tour.
- Sont exclues : les séries `echauffement`, les séries `sideLimited` et les briques `warmup`.

**Historique**
- *H* = les séries retenues du **même exercice** dans les séances **confirmées antérieures**, séances importées comprises.
- `H` vide : l'exercice est à sa **première mesure**. Elle sert de **référence**, jamais de record.

**Comparabilité**
- **Charge** : même `loadSemantics`.
- **`duration_power`** : même `powerUnit`, même `durationSec` et même `resistance`.
- **Mesure par côté** : on retient le côté le plus faible (règle actuelle `getSeriesReps` / `getSeriesDurationSec`).

**Record d'une série *s* du jour**, selon le type de mesure. On note `≽` « au moins aussi bon » : pour une charge, `≥` ; pour une assistance, `≤`.

| Type de mesure | *s* est un record si… |
|---|---|
| `load_reps` | ∃ p ∈ H comparable, et **aucune** p ∈ H ne la domine : `¬∃ p : charge(p) ≽ charge(s) ∧ reps(p) ≥ reps(s)` |
| `reps`, `reps_per_side` | `reps(s) > max(reps(H))` |
| `duration`, `duration_per_side` | `durée(s) > max(durée(H))` |
| `reps_duration` | `¬∃ p : reps(p) ≥ reps(s) ∧ duréeMax(p) ≥ duréeMax(s)` |
| `duration_power` | parmi les p comparables : `résultat(s) > max(résultat(p))` |
| cardio (`steps`, mesures simples) | pas de record en V1 (N7) |

**Précédent affiché** : la série de *H* qui a la charge la plus proche de celle de *s* (assistance : idem), en cas d'égalité la plus récente. Exemple : « 35 kg × 10, précédent : 30 kg × 12 ».

**Un record par exercice et par séance** : la meilleure série du jour selon `pickBestSeries`, qui gère déjà la règle de l'assistance.

**Résultat d'un test** : affiché « Nouveau repère », jamais « record ».

### 5.7 Objectifs travaillés

Ce sont les objectifs dont au moins un exercice lié a été réellement effectué dans la séance, hors briques `warmup`. La brique test compte pour l'objectif de son protocole.

### 5.8 Résumé du mois (D23)

- **Périmètre** : séances confirmées du mois civil, comptées selon `isCountedWorkout`.
- **Lignes** : Musculation, Cardio, Routine, selon la **catégorie du modèle**. Une séance libre sans modèle prend la catégorie inférée existante.
- **Exclusions** : les séances Mobilité (et Bilan de mobilité) n'entrent dans **aucune** des trois lignes. Leur place dans le total et dans « jours sans séance » est à trancher (N8).
- **Échauffement** : une brique `warmup` ne fait jamais d'une séance une séance cardio.
- **Jours sans séance** : jours écoulés du mois (jusqu'à hier pour le mois en cours) sans aucune séance comptée.

### 5.9 Semaine de tests et prochain test

- `isTestWeek(w) = w ≥ anchor ∧ ((w − anchor)/7) mod everyWeeks = 0`.
- **Prochain test d'un protocole** : sa date dans la prochaine semaine de tests. Si une instance planifiée le porte (déplacée, replanifiée), c'est sa date qui compte.
- **« Dans N jours »** = jours jusqu'au prochain dimanche de semaine de tests.

---

## 6. Écrans M1 à M11

### M1 — Accueil (`/`)

- **Lu** : séances planifiées du jour (tous créneaux) et leurs tests ; séance en cours ou en attente ; `goals` ; `testResults` ; `weightEntries` ; cycle et calendrier des tests ; modèles.
- **Écrit** : rien. « Démarrer » appelle `startWorkout`.
- **États** :
  - repos : carte « Repos » ;
  - routine vide : « Routine B — contenu à définir », non démarrable ;
  - séance en cours : « Reprendre » ;
  - séance en attente : « Terminer l'enregistrement » ;
  - objectif sans résultat : « À mesurer · Test [jour date] » ou « Test à replanifier » ;
  - Jambes sans mesure : « Indicateur à choisir après 2 tests » ;
  - Poids : « Moyenne provisoire » ou « Pesée demain » ;
  - segment intermédiaire atteint : « Palier atteint ».

### M2 — Planning Semaine (`/planning`)

- **Lu** : instances du dimanche au samedi, séances libres confirmées, modèles, tests planifiés, cycle.
- **Écrit** : déplacer (avec conflit), sauter, restaurer, retirer, dupliquer, replanifier un test ; `startWorkout`.
- **États** : semaine vide → 7 lignes « Repos » ; semaine de tests → bandeau et mention des tests ; test à replanifier → badge ambre.

### M3 — Planning Mois (`/planning?view=mois`)

- **Lu** : passé = séances confirmées ; futur = instances ; résumé (§ 5.8) ; semaines de tests à venir.
- **Écrit** : rien.
- **Fiche d'un jour** : blocs avec leur durée estimée, statut, « Voir le détail ».
- **États** : mois vide → résumé à 0.

### M4 — Objectifs (`/objectifs`)

- **Lu** : `goals`, `testResults`, `weightEntries`, cycle.
- **Écrit** : rien.
- **Ligne** : numéro, icône Lucide, titre, libellé du segment courant, badge (« Test le … », « À replanifier », « Pesée demain »), barre du segment, valeur ou « À mesurer », cible ou « à définir ».
- **États** : Jambes sans indicateur ; Tronc sans résultat ; Traction à 0 kg → « Palier atteint ».

### M5 — Objectif > Progression (`/objectifs/:key`)

- **Lu** : objectif, résultats des mesures de ses segments, prochaine séance portant le test, indicateurs secondaires, séances liées.
- **Écrit** : saisie d'un test passé (`testResult` manuel) ; édition de la cible, de l'échéance et de la mesure (Jambes) ; « Démarrer le test » (séance du jour qui le porte, sinon séance libre avec la seule brique test).
- **Cartes** : Aujourd'hui, Statut, Échéance.
- **Courbe** par segments.
- **Indicateurs secondaires** : meilleure série depuis le début de l'historique, et son écart.
- **Séances liées** : 10 dernières.
- **États** : aucun résultat → « Les résultats apparaîtront ici après ton premier test ».

### M6 — Objectif > Exercices

- **Lu** : exercices liés, médias, modèles V1 qui les contiennent (lettres, prescription).
- **Écrit** : rien.
- **États** :
  - exercice hors programme : pas de lettre ;
  - exercice supprimé : ligne inactive ;
  - Tronc et Souplesse : « Exercices à définir avec les routines du soir ».

### M7 — Objectif > Conseils

- **Lu** : `goalAdvice[adviceKey]`.
- **États** : premier jet → bandeau « Conseils en cours de validation ».

### M8 — Séances (`/seances`)

- **Lu** : modèles actifs (V1 par lettre et catégorie, puis modèles utilisateur).
- **Écrit** : actions existantes ; « Séance libre ».
- **Carte** : lettre, icône de catégorie, nom, sous-titre, description, nombre de blocs, durée. **Pas de photo** (D4).
- **États** : routine vide → « Contenu à définir ».

### M9 — Séance en cours (`/seance-en-cours`, plein écran)

- **Lu** : séance, exercices, cadres, dernière fois, échelle RPE, protocole de la brique test.
- **Écrit** : `workouts` (moteur), `draft` de la brique test.
- **Contenu** :
  - frise 0 (test) … n ;
  - brique test : consignes, tableau d'essais (traction), relevés minute par minute (cardio), sprints (jambes), mesures signées (souplesse), résultat calculé en direct ;
  - brique exercice : charge conseillée, tableau des séries (« Assistance (kg) » ou « Charge (kg) »), RPE facultatif, durée par répétition (traction négative) ;
  - « Terminer » avec confirmation.
- **États** : test sans essai → « Résultat : — » ; plage dans une consigne → « pente 6-8 % ».

### M10 — Fin de séance (`/seance-en-cours/fin`, puis `/workouts/:id`)

- **Lu** : séance (`endedAt`), tonnage, objectifs travaillés, records (§ 5.6), résultats de test calculés, prochaine séance, prochain matin de mesures.
- **Écrit** :
  - avant Enregistrer : ressenti, notes, corrections de séries et d'essais (D21) ;
  - à Enregistrer : `confirmWorkout`.
- **Vues** : 1 — terminée et records ; 2 — liste → pages dédiées ; 3 — bilan du test, prochaine séance, ressenti, notes.
- **États** :
  - aucun record → section masquée, avec « Références posées : N » si des exercices ont été faits pour la première fois ;
  - aucune assistance → pas de mention « non incluse » ;
  - séance déjà confirmée → vues en lecture.

### M11 — Plus (`/plus`, `/plus/profil`, `/plus/reglages`, `/plus/sauvegarde`, `/plus/protocoles`, `/plus/routines`, `/plus/a-propos`)

- **Lu** : `settings`, protocoles, routines.
- **Écrit** : profil, préférences, sauvegarde (export, import, effacement).
- **États** : profil vide → « Ajouter mes informations » ; âge absent tant que la date de naissance est vide.

---

## 7. Plan des lots B à O

**Règles communes**
- Un commit par sous-lot.
- `tsc`, ESLint et vitest verts, avec et sans `COACH_JM_BACKUP` (sauvegardes du 20/09 et du 22/09).
- Recette PC à 375 px par les gestes.
- Pas de push sans feu vert.
- Sauvegarde de l'iPhone rafraîchie avant tout push qui migre.

**Calendrier** : la première semaine de tests commence le 27/09 et aucun lot ne sera prêt. Les tests du 27/09 au 03/10 sont notés sur papier et saisis au lot G.

| Lot | Contenu | Schéma ? | Critères de fin |
|---|---|---|---|
| **B — Navigation et semaine dim → sam** | 5 onglets, icônes Lucide ; Accueil / Planning ; `/planning`, `/objectifs` (écran provisoire), `/seances`, `/seance-en-cours` en plein écran ; redirections ; Plus > Statistiques (ancien écran Progression) ; `WEEK_STARTS_ON = 0` partout | non | routes et redirections testées (jsdom) ; semaine générée dim → sam et resynchronisation rejouée ; grille Mois commençant le dimanche ; barre absente pendant la séance ; recette 375 px ; aucun test supprimé |
| **C — Schéma v3 et sauvegarde v2** | vérification Dexie de D1 (première tâche) ; `version(3)` (+ `version(4)` si nécessaire) ; garde ; types ; format v2 ; restauration des formats 1 ; `verify-backup.mjs` | **oui** | § 4.1 complet ; sauvegardes du 20/09 et du 22/09 restaurées en v3, empreintes OK ; refus d'un store cardio non vide, base restée v2 ; Safari iOS (données fictives) ; **jamais poussé seul** |
| **D — Catalogue et programme V1** | 7 exercices ; `reps_duration` (durée par répétition), `duration_power` + `powerUnit` ; plages dans les consignes ; rôle `warmup` ; catégorie Routine ; 6 modèles et 3 routines vides ; règle hebdomadaire ; cadres avec premières cibles (D19 ; presse 130 kg), sans incrément pour l'assistance (D18), élévations latérales à +1 kg ; marqueur `reducedPrescription` (§ 2.5.1) | non | seeds rejoués deux fois sans écriture ; leg curl de Muscu C : jamais de jalon, jamais compté en stagnation ; brouillon intact ; aucun bloc dans les routines ; Muscu A générée le 27/09 ; plages saisies, affichées et préremplies au bas ; saisie des durées par répétition jugée sur PC (repli possible, § 3.3) |
| **E — Fin de séance** | `endWorkout` avec confirmation / `confirmWorkout` ; `endedAt`, `feeling`, `note` ; corrections permises, pas de reprise ; récap en attente au lancement ; M10 ; records (§ 5.6) ; tonnage renommé | non | jalons et figeage seulement à Enregistrer ; fermeture entre les deux → récap en attente ; records : première mesure = référence, dominance charge × reps, assistance inversée ; séance confirmée non modifiable |
| **F — Planning** | M2 et M3 ; statuts Faite / Sautée / Non réalisée / Aujourd'hui / À venir ; conflit à trois choix ; résumé du mois (§ 5.8) | non | trois choix testés, dont une cible faite ; résumé recalculé à la main ; Mobilité hors des trois lignes |
| **G — Tests** | 7 protocoles V1 ; cycle et `testSchedule` ; tests attachés à la génération ; brique `test` (`draft` → `testResultId`) ; 2 séries de traction assistée ; Souplesse à la place de la routine du lundi soir ; mensurations hors séance ; saisie d'un test passé ; tests à replanifier ; suppression avec la séance ; registre de recommandations vide | non (stores en C) | semaine du 27/09 : traction dim, mensurations et souplesse lun, cardio mer, jambes jeu ; dérivées (§ 5.3) testées, dont traction sans réussite et FC moyenne ; **jour du test traction : la traction assistée à 2 séries ne valide jamais le palier et n'est pas comptée en stagnation** (test sur une suite jour de test + 3 séances normales) ; `draft` absent après confirmation ; séance sautée → test à replanifier, jamais converti ; tests du 27/09 au 03/10 saisis a posteriori |
| **I — Poids et mensurations** | pesée quotidienne ; moyenne de la dernière semaine complète (≥ 3 pesées), semaine en cours provisoire ; saisie des mensurations | non | 2 pesées → semaine non valide ; remplacement le même jour ; ratio |
| **H — Objectifs** | seed des 7 objectifs (segments, exercices liés, secondaires) ; M4 à M7 ; § 5.1, 5.1 bis, 5.2 ; édition de la cible, de l'échéance et de la mesure de Jambes ; Conseils (Traction et premier jet) | non | cas limites (premier résultat, amp = 0, après l'échéance, recul) ; **0 kg d'assistance → « Palier atteint », jamais « objectif atteint »** ; segments non raccordés ; invariant « aucune donnée d'entraînement dans une courbe » |
| **J — Accueil** | M1 ; retrait de « Bilan de mobilité » de Choisir une séance (D2) | non | invariant des cartes ; tous les états de M1 |
| **K — Routines du soir** | rotation `eveningRotation` ; créneau Soir ; routines vides non démarrables ; remplacement par Souplesse le lundi de la semaine de tests | non | rotation d'une semaine à l'autre (N3) ; aucune routine inventée |
| **L — Plus** | Profil (date de naissance complète), Réglages (thème sombre complet, son, repos libre 90 s), Sauvegarde (import et effacement), Protocoles, Routines, À propos ; bouton d'import de septembre retiré (D3) | non | thème sombre sur tous les écrans (tokens, plus les 146 couleurs en dur) ; parcours import sur base non vide ; effacement → seeds |
| **M — Progression en séance** | encarts « Augmentation proposée » et « Stagnation à examiner » en séance ; charge conseillée chiffrée dans « Exercices suivants » ; frise et tableau des séries | non | aucune hausse sans incrément (traction) ; pas de double inversion ; cohérence avec la fiche exercice |
| **N — Nettoyage** | retrait des écrans Progression (D6), de `mobility_assessment` et de la catégorie Bilan si aucune donnée (D2), des types `cardioTest` et `mobility`, de l'ancien `Goal`, du code d'import s'il ne sert plus aux tests (D3) ; dépendances inutilisées ; commentaires périmés | non (sauf v4 éventuelle, déjà en C) | build ; taille du bundle avant et après ; tests verts |
| **O — Recette iPhone** | migration réelle après sauvegarde ; PWA ; clavier ; verrouillage pendant un repos ; fermeture en attente d'enregistrement ; thème système ; son | — | `verify` avant et après ; `hash7` expliqué ; une semaine de tests réelle parcourue |

**Déploiement**
- B peut partir seul.
- C part avec D au minimum, après une sauvegarde de l'iPhone.
- Les lots suivants partent un par un.

**Après la V1** :
- algorithme C10 (passage automatique à la traction stricte) ;
- les 3 anciens tests cardio ;
- les photos dans l'app ;
- l'écran d'édition des protocoles.

**À relever plus tard, non bloquant** :
- watts affichés par le vélo (D17) ;
- cran de la machine de traction (D18) ;
- date de naissance (D24).

---

## 8. Décisions Q1 à Q28, et questions nouvelles

### 8.1 Décisions intégrées

| # | Décision | Où |
|---|---|---|
| D1 | Suppression des 8 tables sous garde ; v4 si Dexie l'impose | § 3.1, § 4.1 |
| D2 | `mobility_assessment` conservé jusqu'au lot N ; plus de création de Bilan | § 1.2, § 2.8, lot J, lot N |
| D3 | Import de septembre retiré de l'interface ; code gardé s'il sert aux tests | § 1.2, lot L, lot N |
| D4 | Icônes Lucide (base `ExercisePictogram`) ; pas de photo sur les cartes | § 1.3, M8 |
| D5 | `/seance-en-cours` | § 2.1.1 |
| D6 | Ancien Progression provisoire, retiré au lot N | § 2.1.3 |
| D7 | Tronc : planche sur les avant-bras, 1 essai, durée max, arrêt au bassin ; en secondes | § 3.7.4 |
| D8 | Doigts-sol signé, plus bas = mieux | § 3.7.4, § 5.3 |
| D9 | Poids : baisse ; dernière semaine complète, ≥ 3 pesées ; en cours = provisoire ; 75 kg au 31/03/2027 | § 2.4, § 5.4 |
| D10 | Exercices liés définis avant le seed ; Conseils 2-7 en premier jet | § 2.2, § 3.6.2, section 9 |
| D11 | Jambes après l'échauffement, avant le travail | § 2.3 |
| D12 | Souplesse le lundi soir de la semaine de tests, à la place de la routine ; première fois le 28/09 | § 2.3 |
| D13 | Mensurations = protocole générique | § 2.4 |
| D14 | Échauffement = brique `warmup`, hors cardio mensuel | § 2.5, § 3.4, § 5.8 |
| D15 | Élévations : repos 90 s | § 2.5 |
| D16 | Plages min/max dans les consignes | § 3.4.1 |
| D17 | Sprints : watts ou mètres, unité fixée au premier test | § 3.3, § 3.7 |
| D18 | Pas d'incrément automatique sans cran saisi | § 2.5.1 |
| D19 | Charges V1 = premières cibles des cadres ; « à étalonner » vides | § 2.5.1 |
| D20 | `endedAt` + `in_progress` | § 2.6 |
| D21 | Ressenti, notes, corrections permis ; pas de reprise ; Terminer confirmé | § 2.6 |
| D22 | Record = bat une performance antérieure comparable ; première mesure = référence | § 5.6 |
| D23 | Sautée = choix ; Non réalisée = jour passé ; Mobilité hors Routine | § 2.7, § 5.8 |
| D24 | Date de naissance complète, facultative ; pas de photo | § 3.9 |
| D25 | Durée de chaque répétition (traction négative) | § 3.3 |
| D26 | Test déplacé avec sa séance ; sautée → à replanifier, jamais converti | § 2.3, § 3.5.1 |
| D27 | `testResult` source unique ; `draft` puis `testResultId` | § 3.5.2 |
| D28 | FC saisie de la 16e à la 20e minute, moyenne calculée, et secondaires | § 3.7.4, § 5.3 |
| Corr. A | 0 kg = cible du segment 1 ; réussite = 1 traction stricte ; segments non raccordés | § 2.2, § 3.6, § 5.1 bis |
| Corr. B | Routines = 3 cadres vides, aucun exercice inventé | § 2.5, § 3.6.2, lot K |
| Relecture 1 | Jour du test traction (2 séries) : ni validation du palier, ni stagnation — même règle que le leg curl de Muscu C | § 2.5.1, § 2.6, § 3.5.3, lots D et G |
| Relecture 2 | Échéance de Traction S1 = 31/03/2027 ; S2 saisie à l'activation | § 2.2, § 3.6, § 5 |
| Relecture 3 | Élévations latérales : incrément = plus petit écart d'haltères disponible, 1 kg par défaut | § 2.5.1 |
| Relecture 4 | Presse à cuisses : première cible 130 kg | § 2.5, lot D |
| Relecture 5 | N2 à N12 validées telles que proposées | § 8.2 |

**Corrections faites à la révision 1** (vérification demandée par la correction B)
- « Tronc — protocole à définir » est remplacé par D7.
- Il n'y avait pas d'exercice de routine inventé ; les routines sont désormais explicitement vides.
- Les « exercices liés vides à l'installation » sont remplacés par D10.
- L'ancienne cible Traction « 0 kg = objectif » est remplacée par la correction A.

### 8.2 Questions nouvelles — tranchées à la relecture

N1 est **modifiée** (voir ci-dessous) ; N2 à N12 sont **validées telles que proposées**. La colonne « Proposition » vaut décision.

| # | Question | Pourquoi elle apparaît | Proposition | Bloque |
|---|---|---|---|---|
| **N1** | Échéance du segment 1 de Traction (0 kg d'assistance) | Échéance de l'objectif final ou du segment ? | **Décidé** : S1 = 31/03/2027 (trajectoire jusqu'à 0 kg en mars 2027, conforme à M5) ; l'échéance de S2 est saisie à son activation | H |
| **N2** | Jour et place du test Tronc dans la semaine de tests | D7 définit le protocole, pas sa place | Lundi soir, avec la Souplesse (même créneau, sans matériel) | G |
| **N3** | Rotation des routines quand la Souplesse remplace celle du lundi soir | La rotation suit-elle les jours (la routine du lundi est perdue) ou les routines (elle glisse au mardi) ? | Suivre les jours | K |
| **N4** | Saisie du cran de la machine après la première séance officielle | `increment` est un paramètre de figeage (v1.6) : le saisir plus tard créerait une V2 du cadre | Renseigner un incrément **absent** ne crée pas de version (exception, comme `barWeightKg`) ; le **modifier** ensuite, si | D |
| **N5** | Leg curl : deux prescriptions (A : 3×10-12, C : 2×12) pour un seul cadre par exercice | La v1.6 impose un cadre par exercice, avec une seule plage et un seul nombre de séries | Le cadre suit la prescription de Muscu A ; la séance C (2 séries) ne valide jamais le palier et n'est pas comptée en stagnation | D |
| **N6** | Supprimer une séance en attente d'enregistrement | D21 ne dit rien de la suppression ; le code ne supprime que les séances confirmées | Autorisé, avec confirmation, depuis l'écran de fin ; l'instance planifiée revient à venir | E |
| **N7** | Records cardio (paliers, durée à vitesse égale, BPM) | D22 parle d'« exercice » ; les comparaisons cardio existent (`isCardioStepComparable`) mais leur sens (BPM plus bas = mieux) diffère | Pas de record cardio en V1 | E |
| **N8** | Résumé du mois : les séances Mobilité comptent-elles dans le total « séances réalisées » et dans « jours sans séance » ? | D23 les exclut des trois lignes, pas forcément du reste | Comptées dans le total et dans les jours actifs, mais dans aucune ligne ; l'écart est visible (total > somme des lignes) | F |
| **N9** | Test cardio incomplet : combien de relevés de la 16e à la 20e minute faut-il ? | D28 calcule une moyenne, sans dire si un relevé peut manquer | Les 5 obligatoires ; sinon résultat `incomplete` | G |
| **N10** | Briques `warmup` et objectifs | L'échauffement sur tapis ou vélo relierait chaque séance de musculation à l'objectif Cardio (tapis et vélo y sont liés) | Les briques `warmup` sont exclues de « séance liée », des « objectifs travaillés » et des records | E / H |
| **N11** | Plages et cadres | Un cadre porte une seule plage de répétitions ; les plages de D16 s'appliquent aux consignes, pas aux cadres | Aucun changement aux cadres ; les plages de consignes servent à l'affichage et au préremplissage | D |
| **N12** | Geste de passage au segment 2 de Traction | C10 : pas d'algorithme en V1 ; sans geste, S2 est inaccessible | Bouton « Passer à la traction stricte » sur la page Objectif, proposé seulement quand S1 est atteint | H |

**Confirmation pour le lot B.** Le lot B (navigation, renommages, routes, redirections, plein écran, semaine dimanche → samedi, accès provisoire à Progression) ne dépend d'aucune question ouverte. D4, D5 et D6 fixent ses seuls choix. **Aucune question bloquante ne reste pour le lot B.**

---

## 9. Annexe — Conseils des objectifs 2 à 7 (premier jet, **à valider**)

- **Nature** : textes rédigés sans exercice nouveau. Ils ne citent que les exercices liés de D10.
- **Tronc et Souplesse** : les routines étant à définir, les conseils restent génériques.
- **Aucun chiffre de résultat attendu** : les délais sont formulés comme des indications prudentes.

### Haut du corps

- **Fréquence** : 2 séances par semaine qui le travaillent (Muscu A et Muscu B).
- **Comment progresser** :
  - double progression ;
  - quand toutes les séries atteignent le haut de la fourchette à RPE ≤ 8, ajouter 2,5 kg à la séance suivante ;
  - garder la même machine et le même réglage de siège pour comparer.
- **Points techniques** :
  - omoplates serrées et basses sur les tirages et les poussées ;
  - amplitude complète ;
  - descente contrôlée, environ 2 secondes.
- **Erreurs à éviter** :
  - hausser les épaules sur les élévations latérales ;
  - cambrer sur le développé incliné ;
  - augmenter la charge au détriment de l'amplitude.
- **Mesure** : tour d'épaules et tour de taille, le matin, même mètre ruban, même position. Seul le ratio compte, pas chaque tour séparément.

### Jambes

- **Fréquence** : 2 séances par semaine qui les travaillent (Muscu A et Muscu C).
- **Comment progresser** :
  - charges : +5 kg quand toutes les séries atteignent le haut de la fourchette à RPE ≤ 8 ;
  - sprints : même vélo, même résistance, et viser la même puissance du premier au dernier sprint avant d'augmenter la résistance.
- **Points techniques** :
  - genoux dans l'axe des pieds (squat, presse, montée sur banc) ;
  - dos neutre ;
  - chaise à 60° : dos plaqué au mur, poids sur les talons.
- **Erreurs à éviter** :
  - laisser les genoux rentrer vers l'intérieur ;
  - réduire l'amplitude pour tenir la charge ;
  - sprinter sans échauffement.

### Cardio

- **Fréquence** : 3 séances par semaine (Cardio A, B et C).
- **Comment progresser** :
  - la durée d'abord : allonger Cardio C de 5 min quand c'est confortable, jusqu'à 90 min, avant d'augmenter l'intensité ;
  - l'indicateur baisse quand la forme s'améliore : même effort, cœur plus calme.
- **Points techniques** :
  - Cardio A et C à allure où l'on peut parler ;
  - Cardio B : effort franc sur la minute rapide, récupération réelle sur les deux minutes lentes.
- **Erreurs à éviter** :
  - transformer chaque séance en séance difficile ;
  - comparer des tests faits à des heures ou dans des états de fatigue très différents.
- **Mesure** : même tapis, 5 km/h, pente 8 %, 20 min ; relever la FC chaque minute de la 16e à la 20e.

### Tronc

- **Fréquence** : quelques minutes, plusieurs soirs par semaine, avec les routines du soir (contenu à définir).
- **Comment progresser** : allonger la durée de maintien en gardant une position parfaite, plutôt que de tenir plus longtemps en position dégradée.
- **Points techniques** :
  - planche sur les avant-bras ;
  - coudes sous les épaules ;
  - corps aligné de la tête aux talons ;
  - ventre et fessiers serrés ;
  - respiration continue.
- **Erreurs à éviter** :
  - bassin qui descend (dos creusé) ou qui monte ;
  - bloquer la respiration.
- **Mesure** : 1 essai, durée maximale en bonne forme ; arrêt dès que le bassin descend ou monte franchement.

### Souplesse

- **Fréquence** : courte et régulière, le soir, avec les routines (contenu à définir).
- **Comment progresser** : régularité plutôt qu'intensité ; aucune douleur vive.
- **Points techniques** :
  - s'échauffer légèrement avant ;
  - expirer en allant dans l'étirement ;
  - garder chaque position sans à-coups.
- **Erreurs à éviter** :
  - forcer en rebonds ;
  - comparer des mesures prises à froid et après échauffement (le protocole fixe l'état de mesure).
- **Mesure** : doigts-sol, 0 = contact, positif au-dessus du sol, négatif au-delà ; plus bas = mieux. Apley et Papillon en indicateurs secondaires.

### Poids

- **Fréquence** : une pesée chaque matin, dans les mêmes conditions (au lever, après être allé aux toilettes, avant de manger).
- **Comment progresser** : regarder la moyenne de la semaine, jamais la pesée du jour ; les variations quotidiennes (eau, sel, entraînement) sont normales.
- **Erreurs à éviter** :
  - réagir à une seule pesée ;
  - changer de balance ;
  - se peser à des heures différentes.
- **Mesure** : moyenne de la semaine du dimanche au samedi, à partir de 3 pesées ; la semaine en cours est provisoire.
