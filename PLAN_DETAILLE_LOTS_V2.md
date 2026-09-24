# Plan détaillé des lots V2 — lots C à O

**Phase 1, document 3 sur 3.**

**Date** : 23 septembre 2026
**Statut** : **VALIDÉ** le 23/09/2026, avec deux corrections : le contenu des routines du soir fait partie de la V1 (lot K), et le lot I est coupé en deux (pesées tout de suite après C + D). La Phase 1 est close.

**Références**
- `CONCEPTION_TECHNIQUE_V2.md` révision 3 (VALIDÉE, `9fb0ee0`) : § 2 à § 7.
- `SCHEMA_DEXIE_V3_MIGRATION.md` (VALIDÉ, `e13413f`) : § 4 à § 11.
- `PLAN_LOT_B.md` : le lot B est fait et déployé (`b2cbaf2`, 23/09).

**État de départ** : `main` = `e13413f`, déployé. Navigation à 5 onglets, semaine du dimanche au samedi, schéma Dexie **v2**. Sauvegardes de référence : 20/09, 22/09, 23/09 (13 séances, 1 cadre `tirage-vertical`).

**Ce document découpe** chaque lot en étapes vérifiables, une étape = un commit. Il ne décide rien de fonctionnel ; tout renvoie à la conception (« CT § ») ou au document 2 (« D2 § », toujours suivi d'un numéro de section). « Dn » seul, ou « décision Dn », désigne une décision de la conception (CT § 8.1).

---

## 0. Règles communes à tous les lots

1. **Une étape = un commit**, avec un message qui la nomme (« Lot C.3 : … »).
   - Les commits de test seul sont séparés et le disent.
   - `git add` par fichier, **jamais `git add src/`** : `ExercisePictogram.*` reste non suivi jusqu'au lot H.
2. **Contrôles verts à chaque étape** :
   - `npx tsc -b --noEmit` ;
   - `npx eslint .` (0 erreur, 0 avertissement) ;
   - `npx vitest run` sans `COACH_JM_BACKUP`, puis avec les sauvegardes du 20/09, du 22/09 et du 23/09, et avec la plus récente si tu en as exporté une depuis.
3. **Aucun nombre de séances en dur**, ni dans un test ni dans un contrôle : les attentes se calculent sur le contenu du fichier (D2 § 9).
4. **Recette PC en fin de lot**, dans le navigateur intégré à 375 px, **par les gestes**, sur la base de test du port 5174. Les données de recette sont retirées ensuite. La liste iPhone est courte et limitée à ce qui est propre à iOS.
5. **Push** seulement sur ton feu vert, après le rapport de fin de lot.
   - **Avant tout push**, sauvegarde fraîche de l'iPhone si tu as fait une séance depuis la dernière.
   - **Après tout push** : run « Deploy Coach JM » vérifié, et chaînes caractéristiques du lot présentes dans le bundle en ligne.
6. **Tout écart** entre une décision et le code, découvert en route, est signalé avant d'être codé.
7. **Rapport de fin de lot** :
   - commits ;
   - contrôles, avec les nombres ;
   - tests existants modifiés, avec la raison ;
   - écarts au plan ;
   - recette ;
   - liste iPhone.

---

## 1. Vue d'ensemble

| Lot | Contenu | Schéma | Déploiement | Dépend de |
|---|---|---|---|---|
| **C** | Schéma v3, sauvegarde v2, restauration sûre, retour arrière minimal, seed des réglages | **v2 → v3** | **jamais seul** : avec D | — |
| **D** | Catalogue (7 exercices, nouvelles mesures, plages, échauffement), programme V1, routines vides, cadres de départ | non | avec C, en un push | C |
| **E** | Fin de séance : Terminer / Enregistrer, ressenti, notes, records, écrans M10 | non | seul | C |
| **F** | Planning : statuts, déplacement avec conflit, mois, résumé, historique | non | seul | D (catégorie Routine) |
| **G** | Tests : protocoles, cycle, brique test, résultats, test passé, à replanifier | non | seul | C, D, E |
| **I.1–I.2** | Pesée quotidienne et moyenne de la semaine | non | seul, **juste après C + D** | C |
| **I.3** | Mensurations | non | seul, après G | G (protocole `mensurations`) |
| **H** | Objectifs : les 7 objectifs, M4 à M7 | non | seul | G, I |
| **J** | Accueil (M1) | non | seul | G, H, I, K (routine) |
| **K** | Routines du soir : **contenu réel**, rotation, créneau Soir | non | seul | D, G, H ; **préalable : contenu défini avec Jean-Michel** |
| **L** | Plus : profil, réglages, thème sombre, sauvegarde complète, protocoles | non | seul | C, G |
| **M** | Progression en séance (M9) | non | seul | D, G |
| **N** | Nettoyage | non | seul | tous |
| **O** | Recette iPhone de la V2 | — | — | tous |

**Ordre d'exécution** : C → D (un seul déploiement), puis **I.1–I.2**, E, F, G, **I.3**, H, K, J, L, M, N, O.

**Deux ajustements de l'ordre de la conception**
- **K passe avant J** : l'Accueil affiche la routine du soir, qui doit exister.
- **Lot I coupé en deux** (relecture du 23/09).
  - Les pesées (I.1, I.2) arrivent juste après C + D : l'historique de poids commence tôt, et la courbe aura un vrai passé le jour où l'objectif Poids apparaîtra (H).
  - Les mensurations (I.3) restent après G, parce qu'elles dépendent du protocole de test.
  - H vient après les deux.

**Calendrier indicatif**
- La première semaine de tests (27/09 → 03/10) se fait sur papier (décision du 23/09).
- La suivante tombe le **25/10**. Viser C, D, E et G en ligne avant cette date permettrait de la passer dans l'app. C'est un souhait, pas une contrainte.

---

## 2. Lot C — Schéma v3, sauvegarde v2, retour arrière minimal

**Référence** : D2 dans son ensemble.

**Périmètre**
- Structure de données, sauvegarde et restauration.
- Un seul seed : `settingsDefaults`.
- Le chemin de retour arrière (D2 § 7.4, § 10). Il est prélevé sur le lot L.
- Aucun écran fonctionnel nouveau.

| Étape | Contenu | Tests | Critère de fin |
|---|---|---|---|
| **C.1** | `package.json` : `"dexie": "4.4.6"` exact ; l'expérience du scratchpad (D2 § 3.2, E1 à E7) devient un test du dépôt `dexieUpgradeBehavior.test.ts`, sur des bases factices | E1 à E7 : lecture d'un store `null` dans l'upgrade, garde qui lève → v2 intacte, annulation après écriture, idempotence | test vert ; lockfile cohérent |
| **C.2** | Types v3 : `Goal` v2 (segments), `TestProtocol`, `TestProtocolVersion`, `TestResult`, `SettingsRecord` ; champs facultatifs de `WorkoutSession`, `PerformedBlock` (`PerformedTestBlock` déclaré), `PlannedSession`, `SessionTemplate`, `BaseBlock`, `Exercise`, `StrengthFrameVersion.increment?` (CT § 3, D2 § 2.2). Les types `cardioTest.ts` et `mobility.ts` restent jusqu'au lot N | `tsc` : tout le code existant compile sans changement de comportement ; suite verte inchangée | aucun test existant modifié |
| **C.3** | `database.ts` : `VERSION_3_STORES`, `version(3).upgrade(guardV3Migration)`, `MigrationGuardError`, `STORE_NAMES` à 15, `DATABASE_VERSION = 3` ; `createTestDatabase(…, 3)` | **T-1 à T-7** (D2 § 9), dont T-3 (R) sur les trois sauvegardes : toutes les séances identiques, cadre `tirage-vertical` identique | migration.test étendu ; tests v1 → v2 existants toujours verts |
| **C.4** | `main.tsx` : `db.open()` explicite avant tout seed ; `MigrationFailureScreen` hors routeur ; export en mode dynamique (format 1) | **T-17** ; jsdom : l'écran d'échec liste les stores en cause et propose l'export | ouverture en échec → écran, aucun seed exécuté |
| **C.5** | Export format 2 (`storeHashes`, `legacyIntegrity.hash7`, `app.version`) ; `verify-backup.mjs` : formats 1 et 2, clé primaire par store, orphelins nouveaux, **mode comparaison de deux fichiers** | **T-11**, **T-20** ; export de la base de test v3 vérifié par le script | `npm run backup:verify -- a.json b.json` liste les stores identiques et différents |
| **C.6** | `restoreInto` : contrôle canonique **dans** la transaction ; formats 1 (base v1, base v2) et 2 ; refus nommés (D2 § 7.3, cas A à G) | **T-9, T-10, T-12 à T-16** | aucune base partiellement restaurée dans aucun test |
| **C.7** | Cadre des seeds : `runSeeds()` (ordre D2 § 5.2, transaction et marqueur par seed, arrêt des dépendants sur échec) ; seed 3 `settingsDefaults` ; `resetAndRestore` (drapeau `suspendSeeds`, rechargement) ; point d'entrée minimal Plus > « Importer une sauvegarde » et « Effacer » (double confirmation, export proposé avant) | **T-8** (R) ; jsdom : parcours import (validation → export proposé → confirmation) ; une validation qui échoue n'efface rien | seeds rejoués deux fois sans écriture |
| **C.8** | Recette : T-3, T-4a, T-5, T-7 dans le **navigateur intégré** (page de test du serveur de dev, port 5174) ; mêmes cas sur **Safari iOS**, données fictives (procédure du lot 1 : tunnel HTTPS ou LAN) | résultats consignés | Safari conforme à E2 et E4. **Sinon, arrêt et bascule v3 + v4** (D2 § 3.3) avant D |

**Critères de fin du lot C**
- T-1 à T-20 verts.
- Aucune séance modifiée par la migration sur les trois sauvegardes.
- Safari vérifié.
- **Non poussé** : attend D.

**Risque** : le comportement de Safari (D2 § 3.3). Il est traité en C.8, avant tout code du lot D.

**Rapport du lot C (24/09/2026) : terminé, non poussé.**

| Étape | Commit | Résultat |
|---|---|---|
| C.1 | `2ef8016` | Dexie 4.4.6 exact ; E1 à E7 en test permanent |
| C.2 | `97931b2` | types v3, aucun changement de comportement (écarts : `increment` reste obligatoire jusqu'à D.6, brique test hors de l'union jusqu'au lot G) |
| C.3 | `4235285` | schéma v3 à 15 stores, `guardV3Migration` ; T-1 à T-7, T-3 (R) sur les trois sauvegardes |
| C.4 | `8c2c66f` | ouverture explicite, `MigrationFailureScreen`, export de secours format 1 (T-17) |
| C.5 | `d186923` | format de sauvegarde 2, `verify-backup` formats 1 et 2 et mode comparaison (T-11, T-20) |
| C.6 | `d46598f` | `restoreInto` validé avant écriture, relu dans la transaction (T-9 (R), T-10, T-12 à T-16) |
| C.7 | `ddb1b31` | `runSeeds` (réglages en premier), seed 3, import et effacement dans Plus (T-8 (R)) |
| C.7 bis | `03afb77` | import atomique : vidage, écriture et relecture dans une seule transaction ; un échec laisse l'ancienne base intacte (D2 § 7.4 révisé) |
| C.8 | `4c914ae` | page de recette ; 6/6 OK sur Chromium et sur Safari iOS 18.7 (D2 § 3.3) |

Suite complète : 654 tests passent et 8 sont ignorés sans sauvegarde ; 662/662 avec chacune des sauvegardes du 20, du 22 et du 23/09. Recette PC à 375 px par de vrais gestes.

---

## 3. Lot D — Catalogue, mesures, programme V1

**Référence** : CT § 2.5, § 3.3, § 3.4, D2 § 5.2 (seeds 1, 5, 6, 7).

| Étape | Contenu | Tests | Critère de fin |
|---|---|---|---|
| **D.1** | Mesures nouvelles : `reps_duration` (`repDurationsSec`, durée par répétition, D25) et `duration_power` (`result`, `resistance`, `powerUnit` fixée à la première saisie, D17) ; `SeriesForm`, `workoutDisplay`, `exercisePerformance` (métrique `powerMax`), correspondances exhaustives | saisie, affichage, métriques ; `powerUnit` imposée après la première saisie | UX de la durée par répétition jugée sur PC ; repli « une durée, la plus lente » si trop lourde (CT § 3.3), signalé au rapport |
| **D.2** | Plages dans les consignes (`RangeOrValue`, D16) : modèle, édition (`BlockEditScreen`, `StepsEditor`), affichage « pente 6-8 % », préremplissage au bas de la plage ; le réalisé reste une valeur | consignes anciennes (nombres) lues à l'identique ; comparabilité des paliers inchangée | aucune donnée existante modifiée |
| **D.3** | Rôle `warmup` d'une brique (modèle et réalisé, recopié au démarrage) ; `reducedPrescription` posé par `createWorkoutSnapshot` (D2, CT § 2.5.1) ; `confirmWorkout` / `finishWorkout` n'appellent pas `validateFrame` pour une brique réduite ; `listVersionSessions` et `detectStagnation` l'ignorent | leg curl 2 séries contre un cadre 3 × 10-12 : ni jalon, ni stagnation ; séries comptées normalement ailleurs | tests de cadre existants verts |
| **D.4** | Catégorie `Routine` (listes, icône, classe CSS) ; 7 exercices au catalogue (CT § 2.5 : `traction-negative`, `suspension-omoplates`, `montee-banc`, `chaise-60`, `marche-laterale-elastique`, `mollets-debout`, `sprint-velo`) ; médias si les images sont prêtes, sinon fiche sans média ; seed 1 étendu | seed rejoué sans écriture ; classification valide | 55 exercices, dont 7 nouveaux |
| **D.5** | Seed 5 `seedProgramV1` : 6 modèles à identifiants fixes (`v1-muscu-a`…, blocs fixes, `letter`, `subtitle`, `tags`, `mainBlockId`) ; règle hebdomadaire dimanche → samedi **si aucune n'existe** ; `settings.testSchedule`. Seed 6 `seedRoutines` : 3 cadres vides, non démarrables (bouton désactivé, raison affichée) | marqueurs ; brouillon « Muscu A » intact ; règle existante jamais écrasée ; semaine générée du dimanche au samedi | Muscu A le dimanche dans une base de test |
| **D.6** | Seed 7 `seedProgramFrames` : cadres des exercices de musculation à charge du programme, premières cibles (D19 : presse 130 kg, élévations +1 kg, traction assistée **sans incrément**) ; `increment` facultatif ; renseigner un incrément absent ne crée pas de version (N4) | **T-21** (R, 23/09) : pas de second cadre `tirage-vertical`, cadre existant identique (cible 40 kg) ; aucune hausse proposée sans incrément | tests de cadre existants verts |
| **D.7** | Recette PC, puis **déploiement C + D** selon le protocole D2 § 10 (étapes 1 à 8) | comparaison avant / après : toutes les séances identiques octet à octet | export post-migration vérifié, différences toutes attendues |

**Liste iPhone (C + D)**
- migration à l'ouverture ;
- historique et cadres présents ;
- modèles V1 et routines visibles ;
- export post-migration transmis.

**Note** : la semaine du 27/09 ne sera pas générée si D arrive après le 26/09 (règle « semaine en cours intouchée »). C'est acté : tests sur papier. La génération reprend à la première semaine future.

**Rapport du lot D (24/09/2026) : terminé et déployé avec le lot C.**

| Étape | Commit | Résultat |
|---|---|---|
| D.1 | `3748fed` | mesures `reps_duration` (durée de chaque répétition, la plus lente en `durationSec`) et `duration_power` (watts ou mètres + résistance, unité fixée à la première saisie) ; métriques `reps`/`durationMax` et `powerMax` (même unité, même durée). Saisie jugée assez légère à l'essai sur PC : pas de repli « une durée » |
| D.2 | `d380367` | plages dans les consignes (paliers, durées, enfants de groupe) ; réalisé prérempli au bas de la plage ; estimation au milieu |
| D.3 | `58ecb99` | brique `warmup` recopiée au démarrage ; `reducedPrescription` : ni jalon, ni motif, ni stagnation (leg curl de Muscu C) |
| D.4 | `bc9e938` | catégorie Routine ; 7 exercices (55 au catalogue, sans médias) ; seed 1 étendu aux libellés de mesure |
| D.5 | `9ed3b6e` | seeds 5 et 6 : 6 modèles V1, règle dimanche → samedi, `testSchedule`, 3 routines vides non démarrables |
| D.6 | `53bcf71` | seed 7 : 13 cadres, premières cibles (rowing 40 kg, leg curl 32,5 kg), traction assistée sans incrément ; `increment` facultatif, le renseigner ne crée pas de version (N4) |
| D.6 bis | `54571f5` | décisions du 24/09 : distance facultative sur le vélo, RPE par palier, Cardio B à 18 paliers préremplis (40 min estimées) ; test traction `after_warmup` |
| correctif | `1053fed` | modifier un exercice conserve `loadSemantics`, les libellés hors cm et l'unité fixée |

Décisions du 24/09 : mollets debout sans groupe ni cible ; repos non précisés à 90 s ; échauffement tapis 5 km/h, pente 0 %, 8-10 min ; rotation des routines au 27/09.

**D.7, déploiement C + D (protocole D2 § 10)**
- Étape 1-2 : sauvegarde iPhone du 24/09 09:58 (schéma 2, 13 séances, identique au 23/09 store par store) ; stores gardés vides ; suite complète verte sur ce fichier (729/729), comme sur les sauvegardes du 20, du 22 et du 23/09.
- Étape 3 : push `b6c7f2d..54571f5`, workflow « Deploy Coach JM » `success`, bundle en ligne contrôlé (schéma v3, programme V1, écran d'échec, import ; ni console de développement ni page de recette), build du 24/09 10:20.
- Étapes 4 à 6 : migration à l'ouverture de la PWA, contrôles visuels, export de 10:28 (format 2, schéma 3).
- Étape 7 : comparaison 09:58 → 10:28 : **les 13 séances identiques à l'octet**, `rpeScaleVersions`, `weightEntries`, `strengthMilestones`, `goals` identiques ; brouillon « Muscu A » et cadre `tirage-vertical` (cible 40 kg) inchangés ; **uniquement des ajouts attendus** : 7 exercices, 9 modèles `v1-*`, 12 cadres `frame-v1-*`, la règle hebdomadaire, 6 séances planifiées du 27/09 au 03/10, 4 réglages ; les 8 stores cardio / mobilité, vides, ont disparu avec le schéma v2. Aucun rollback.
- Fichiers de référence : `coach-jm-sauvegarde-2026-09-24-0958.json` (retour arrière), `coach-jm-sauvegarde-2026-09-24-1028.json` (premier fichier v3).

---

## 4. Lot E — Fin de séance

**Référence** : CT § 2.6, § 5.5 à § 5.7, M10 ; D20, D21, D22, N6, N7, N10.

| Étape | Contenu | Tests | Critère de fin |
|---|---|---|---|
| **E.1** | `endWorkout` (confirmation de Terminer, `endedAt`, repos clos, durée figée) / `confirmWorkout` (une transaction : `feeling`, `note`, `completed`, cadres et jalons, instance `done`) ; `finishWorkout` remplacé ; plus de « Reprendre » | jalons et figeage **seulement** à Enregistrer ; séance en attente absente des statistiques, records et objectifs | tests moteur et base |
| **E.2** | `ResumeWatcher` : séance `in_progress` + `endedAt` au lancement → récapitulatif en attente ; corrections de séries permises en attente ; suppression d'une séance en attente (N6) | app « fermée » entre les deux (rechargement en navigateur) → récapitulatif en attente | recette navigateur |
| **E.3** | Records (CT § 5.6) : dominance charge × reps, assistance inversée, première mesure = référence, pas de record cardio (N7), `warmup` exclu (N10) | cas du 15/09 et cas synthétiques ; sauvegarde réelle : aucun record inventé | fonction pure testée |
| **E.4** | Écrans M10 : vue 1 (tonnage « Tonnage total » + « traction assistée non incluse », records, section « Objectifs travaillés » masquée tant qu'aucun objectif n'existe, lot H) ; vue 2 (liste → pages dédiées) ; vue 3 (prochaine séance, ressenti 5 niveaux, notes, Enregistrer) ; séance confirmée en lecture | jsdom par vue | recette 375 px par une vraie séance |

**Liste iPhone** : fermer l'app entre Terminer et Enregistrer, puis relancer.

---

## 5. Lot F — Planning

**Référence** : CT § 2.7, § 5.8, M2, M3 ; D23, N8.

| Étape | Contenu | Tests | Critère de fin |
|---|---|---|---|
| **F.1** | Statuts affichés : Faite, Sautée, Non réalisée, Aujourd'hui, À venir ; créneau Soir affiché (préparation de K) | règle de statut pure | — |
| **F.2** | Déplacer avec conflit (même jour, même créneau) : Échanger / Faire les deux / Remplacer ; cible faite ou en cours → seul « Faire les deux » ; libellé du bouton = choix fait | chaque choix, dont les cas interdits ; tests d'instance emportés à l'échange (préparation de G) | — |
| **F.3** | Mois : passé = séances confirmées, futur = planifiées ; fiche d'un jour (blocs et durées estimées) ; résumé du mois (Musculation / Cardio / Routine, jours sans séance ; Mobilité hors lignes, comptée au total, N8 ; `warmup` ne fait pas une séance cardio) ; accès à l'historique | résumé recalculé à la main sur un jeu de test | — |
| **F.4** | Recette 375 px | — | — |

---

## 6. Lot G — Tests

**Référence** : CT § 2.3, § 3.5, § 3.7, § 5.3, § 5.9 ; D2 § 8.2 (D27, I-10 à I-13) ; D7, D8, D11, D12, D17, D26, D27, D28, N2, N9.

| Étape | Contenu | Tests | Critère de fin |
|---|---|---|---|
| **G.1** | Repositories de tests ; seed 4 : 7 protocoles V1 (`traction`, `traction_stricte` en pause, `cardio`, `jambes`, `souplesse`, `mensurations`, `tronc`), mesures (dont `signed` pour doigts-sol), figeage des versions | seed idempotent ; figeage au premier résultat officiel | — |
| **G.2** | Cycle (`isTestWeek`, ancre au 27/09) et `testSchedule` complété (Tronc le lundi soir avec la Souplesse, N2) ; `PlannedTest` attachés à la génération ; état dérivé « à replanifier » (D26) ; action Replanifier | semaine du 25/10 générée avec ses tests aux bons endroits ; séance sautée → à replanifier, jamais convertie | — |
| **G.3** | Brique `test` dans le moteur (`draft` : essais, valeurs, côtés) ; placements `before_all`, `after_warmup`, `replace_block`, `replace_all` ; ajustement du jour de test (traction assistée à 2 séries → `reducedPrescription`) | moteur pur ; aucune validation de palier le jour du test traction | — |
| **G.4** | Écran de la brique test : tableau d'essais (traction, repos 3 min) ; FC minute par minute de la 16e à la 20e (cardio) ; sprints et chaise (jambes) ; souplesse signée ; planche (tronc) ; résultat calculé en direct (CT § 5.3, D28, N9) | dérivées : traction sans réussite, un seul essai, FC incomplète → `incomplete` | recette 375 px |
| **G.5** | `confirmWorkout` crée les `testResults` et remplace `draft` par `testResultId` (D27) ; `deleteWorkout` supprime les résultats d'origine séance et défige la version ; `verify-backup` contrôle I-10 à I-13 | **T-19** complet ; invariants I-10 à I-13 | — |
| **G.6** | Saisie d'un test passé (origine `manual`, date choisie) et sa suppression ; registre de recommandations vide | saisie du 27/09 possible a posteriori | les tests papier du 27/09 au 03/10 saisis **avec toi** sur l'iPhone après déploiement |

**Liste iPhone** : un test réel de bout en bout pendant la semaine de tests du 25/10.

---

## 7. Lot I — Poids et mensurations, en deux temps

**Référence** : CT § 2.4, § 5.4 ; D9, D13.

**I.1 et I.2** : juste après le déploiement C + D, avant E. Déploiement seul. **I.3** : après G.

| Étape | Contenu | Tests | Critère de fin |
|---|---|---|---|
| **I.1** | Pesée quotidienne (repository existant, remplacement le même jour) : saisie depuis **l'Accueil actuel** (carte « Pesée du jour »), liste des pesées récentes avec correction et suppression ; la page Poids viendra avec H | une pesée par jour ; remplacement le même jour | recette 375 px |
| **I.2** | Moyenne de la dernière semaine complète (dimanche → samedi, au moins 3 pesées), semaine en cours « provisoire » | 2 pesées → semaine non valide ; bords de semaine | fonction pure |
| **I.3** (après G) | Saisie des mensurations (épaules, taille) = résultat du protocole `mensurations`, ratio dérivé ; le lundi matin d'une semaine de tests | ratio arrondi à 0,01 | recette |

---

## 8. Lot H — Objectifs

**Référence** : CT § 2.2, § 3.6, § 5.1, § 5.1 bis, § 5.2, M4 à M7, section 9 ; corrections A et B ; D10, N1, N12.

| Étape | Contenu | Tests | Critère de fin |
|---|---|---|---|
| **H.1** | Seed 8 : les 7 objectifs (segments, S1 Traction au 31/03/2027, exercices liés D10, indicateurs secondaires, `adviceKey`) | seed idempotent ; clé unique | — |
| **H.2** | Calculs purs : trajectoire, statut ±5 % de l'amplitude, écart en semaines, pourcentage, atteinte de segment (« Palier atteint », jamais « objectif atteint » à 0 kg), courbe par segments ; Poids sur moyennes hebdomadaires | premier résultat, amplitude nulle, après l'échéance, recul, segment intermédiaire atteint ; **invariant : aucune donnée d'entraînement dans une courbe** | fonctions pures, cas limites couverts |
| **H.3** | M4 : liste des 7 objectifs, icônes Lucide (base `ExercisePictogram`, fin de son statut « non suivi ») | jsdom : états (Jambes sans mesure, Tronc sans résultat, Palier atteint) | — |
| **H.4** | M5 Progression : cartes, courbe, indicateurs secondaires, séances liées (`warmup` exclu, N10), saisie d'un test passé, édition de la cible, de l'échéance et de la mesure de Jambes, bouton « Passer à la traction stricte » seulement si S1 est atteint (N12) | jsdom | — |
| **H.5** | M6 Exercices (lettres lues sur les modèles V1), M7 Conseils (Traction ; objectifs 2 à 7 en premier jet avec le bandeau « en cours de validation ») ; « Objectifs travaillés » du lot E activés | jsdom | recette 375 px |

---

## 9. Lot K — Routines du soir

**Référence** : CT § 2.5, § 3.4 ; D12, N3 ; relecture du 23/09.

**Préalable (bloquant pour K)** : le contenu des 3 routines (A, B, C : exercices, consignes, durées) et les exercices liés des objectifs Tronc et Souplesse sont **définis avec Jean-Michel**. Aucun exercice n'est inventé par le code. Le lot K livre les **vraies** routines.

| Étape | Contenu | Tests | Critère de fin |
|---|---|---|---|
| **K.0** | Exercices des routines absents du catalogue : ajoutés (médias si prêts) ; seed 1 étendu | seed rejoué sans écriture | — |
| **K.1** | Contenu des 3 routines : les cadres `v1-routine-a/b/c` installés vides au lot D sont remplis **seulement s'ils sont encore vides et non modifiés** (marqueur `install.routinesContent`) ; une routine modifiée par l'utilisateur n'est jamais écrasée. Exercices liés de Tronc et Souplesse ajoutés aux objectifs **seulement si leur liste est encore vide** | seed idempotent ; routine modifiée à la main laissée telle quelle | routines démarrables |
| **K.2** | `eveningRotation` et génération en créneau Soir ; rotation qui suit les jours (N3) | rotation d'une semaine à l'autre ; saut et déplacement d'une routine sans casser la rotation | — |
| **K.3** | Lundi soir d'une semaine de tests : Souplesse et Tronc à la place de la routine (`replace_all`) | 26/10 | recette 375 px, par une vraie routine |

---

## 10. Lot J — Accueil (M1)

**Référence** : CT § 2.8, M1 ; décision D2.

| Étape | Contenu | Tests | Critère de fin |
|---|---|---|---|
| **J.1** | Bloc Aujourd'hui : séance, test éventuel, routine du soir (« contenu à définir ») ; séance en attente → « Terminer l'enregistrement » ; bandeau « Semaine de tests dans N jours » (même formulation que M4) | jsdom sur tous les états de CT § 6 M1 | — |
| **J.2** | 7 cartes d'objectifs (valeur de test ou moyenne de pesées, statut, « À mesurer · Test [date] », « Test à replanifier ») | **invariant** : des séances de traction assistée sans `testResult` → « À mesurer » | — |
| **J.3** | Retrait de l'entrée « Bilan de mobilité » de Choisir une séance (décision D2) | — | recette 375 px |

---

## 11. Lot L — Plus (M11)

**Référence** : CT § 2.9, M11 ; D3, D24.

| Étape | Contenu | Tests | Critère de fin |
|---|---|---|---|
| **L.1** | Profil (prénom, date de naissance complète facultative, âge calculé, taille ; pas de photo) | âge au jour près | — |
| **L.2** | Réglages : son du minuteur ; repos de la séance libre (90 s par défaut) **qui remplace la constante codée** ; pas de Vibration | défaut 90 s ; valeur saisie utilisée à l'ajout d'un exercice en séance libre | — |
| **L.3** | Thème clair / sombre / auto : tokens redéfinis, `data-theme`, `theme-color` ; les 146 `#2f6fed` et autres couleurs en dur passent en variables | contrôle visuel de chaque écran en sombre | aucune couleur en dur restante (recherche) |
| **L.4** | Sauvegarde complète : écran dédié autour du point d'entrée minimal de C (exporter, importer, effacer, dernier export) | parcours complets | — |
| **L.5** | Protocoles de tests (liste, versions, « Saisir un test passé », « Tests à replanifier ») ; Routines du soir ; À propos (version et date de build) ; **import de septembre retiré de l'interface** (D3) | jsdom | recette 375 px |

**Liste iPhone** : thème sombre système, son du minuteur.

---

## 12. Lot M — Progression en séance (M9)

**Référence** : CT § 6 M9 ; lot 4C existant.

| Étape | Contenu | Tests | Critère de fin |
|---|---|---|---|
| **M.1** | Encarts « Augmentation proposée » et « Stagnation à examiner » en séance (aujourd'hui sur la fiche seulement) | aucune hausse sans incrément (traction) ; pas de double inversion en assistance | — |
| **M.2** | Charge conseillée chiffrée dans « Exercices suivants » | cohérence avec la fiche exercice | — |
| **M.3** | Frise des étapes (0 = test) et tableau des séries (M9) | jsdom | recette 375 px |

---

## 13. Lot N — Nettoyage

**Référence** : CT § 7 lot N ; décisions D2, D3, D6.

| Étape | Contenu | Précondition | Critère de fin |
|---|---|---|---|
| **N.1** | Retrait des écrans de l'ancien Progression et de Plus > Statistiques | chaque fonction utile redistribuée (tableau CT § 2.1.3 revu avec toi) | routes retirées ; redirection de `/progression` et `/historique` vers Planning > Mois |
| **N.2** | Retrait de `mobility_assessment`, de la catégorie « Bilan de mobilité », des types `cardioTest` et `mobility`, de l'ancien `Goal` | **sauvegarde fraîche** : aucune séance de nature `mobility_assessment`, aucun modèle de cette catégorie ; sinon la règle reste | — |
| **N.3** | Code d'import de septembre retiré s'il ne sert plus aux tests (sinon déplacé sous `fixtures/`) | — | — |
| **N.4** | Dépendances inutilisées (`@supabase/supabase-js`, `zod`, `zustand`, `react-hook-form`, `@hookform/resolvers`, `playwright`) ; commentaires périmés (`canonicalJson.ts:3`, `exercise.ts:81,208`) | — | build OK ; taille du bundle notée avant et après |

---

## 14. Lot O — Recette iPhone de la V2

- **Préalable** : sauvegarde fraîche, `verify` OK.
- **Parcours d'une semaine de tests réelle**, idéalement celle du 22/11, avec :
  - le test traction en étape 0 ;
  - le cardio à la place du bloc principal ;
  - les jambes après l'échauffement ;
  - les mensurations et la pesée le lundi matin ;
  - la souplesse et le tronc le lundi soir.
- **Contrôles iOS** :
  - clavier ;
  - verrouillage pendant un repos ;
  - fermeture en attente d'enregistrement ;
  - thème système ;
  - son ;
  - mise à jour de la PWA.
- **Clôture** : export final, comparaison avec la sauvegarde de départ, `hash7` et `storeHashes` expliqués.

---

## 15. Ce qui reste hors de la V1 (CT § 7)

- Algorithme de passage automatique à la traction stricte (C10).
- Les 3 anciens tests cardio.
- Photos dans l'app.
- Écran d'édition des protocoles (nouvelle version).

---

## 16. Questions

**Aucune décision utilisateur ne bloque le lot C.**

**Deux points validés à la relecture du 23/09** :
1. **Ordre K avant J** (§ 1). L'Accueil affiche la routine du soir ; J après K évite un état intermédiaire. L'ordre de la conception était J puis K.
2. **Retour de `/progression` et `/historique` vers Planning > Mois** au lot N (N.1), plutôt qu'une suppression sèche des adresses. C'est cohérent avec les redirections du lot B.
