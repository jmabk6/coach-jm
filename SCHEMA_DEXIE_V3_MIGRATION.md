# Schéma Dexie v3, migration et sauvegarde v2 — contrat technique du lot C

**Phase 1, document 2 sur 3.**

**Date** : 23 septembre 2026
**Statut** : **VALIDÉ** le 23/09/2026, avec une correction : la sauvegarde de référence est celle du 23/09, et aucun nombre de séances n'est écrit en dur. Toute évolution passe par une nouvelle révision.
**Source de vérité** : `CONCEPTION_TECHNIQUE_V2.md` révision 3 (VALIDÉE, FIGÉE, `9fb0ee0`), en particulier § 3 et § 4. En cas de contradiction, la conception l'emporte. Ce document ne décide rien de fonctionnel : il dit **comment** le lot C met la conception en œuvre.

**Vérifié dans**
- le code de `main` à `9fb0ee0` :
  - `src/db/database.ts` et `src/db/repositories/*` ;
  - `src/domain/models/*` ;
  - `src/features/backup/{exportBackup,restoreBackup,canonicalJson,serializationAudit}.ts` ;
  - `scripts/verify-backup.mjs` ;
  - `src/main.tsx`, `seedExerciseCatalog.ts`, `seedRpeScale.ts` ;
  - `deleteWorkout.ts`, `finishWorkout.ts` ;
- le code de Dexie 4.4.6 (`node_modules/dexie/dist/dexie.mjs`) ;
- la sauvegarde réelle **de référence** `coach-jm-sauvegarde-2026-09-23-1639.json` (empreinte `5755a2e9…`) ; celles du 20/09 (`…-0205`) et du 22/09 (`…-1205`) restent jouées par les tests (R) ;
- une expérience isolée (§ 3.2).

**Conventions**
- Chemins relatifs à `src/`.
- **C-n** : étape de l'algorithme de migration.
- **I-n** : invariant.
- **T-n** : test du lot C.

---

## Sommaire

1. État exact avant migration
2. Schéma cible complet
3. v3 seule ou v3 + v4 : vérification et décision
4. Migration, étape par étape
5. Seeds
6. Format de sauvegarde v2
7. Matrice de restauration
8. Suppressions et intégrité référentielle
9. Tests obligatoires du lot C
10. Déploiement sur l'iPhone et rollback
11. Questions réellement bloquantes pour le lot C

---

## 1. État exact avant migration

### 1.1 Versions et stores déclarés (`db/database.ts`)

- Nom de la base : `coach-jm`. `DATABASE_VERSION = 2`.
- `this.version(1).stores(VERSION_1_STORES)`, puis `this.version(2).stores(VERSION_2_STORES)`.
- **Aucune fonction `upgrade()`.** Dexie 4.4.6, `fake-indexeddb` 6.2.5 en test.

| Store | Clé | Index (v2) | Depuis | Modèle TS (`domain/models`) |
|---|---|---|---|---|
| `exercises` | `id` | `name, zone, movement, equipment, location, mode, measurementType, status, updatedAt, progressionGroup, movementFamily` | v1 (index enrichis en v2) | `Exercise` (`exercise.ts`) |
| `sessionTemplates` | `id` | `name, category, status, position, updatedAt` | v1 | `SessionTemplate` (`session.ts`) |
| `weeklyPrograms` | `id` | `name, updatedAt` | v1 | `WeeklyProgram` (`program.ts`) |
| `plannedSessions` | `id` | `date, sessionTemplateId, status, source, updatedAt` | v1 | `PlannedSession` (`program.ts`) |
| `workouts` | `id` | `date, plannedSessionId, sessionTemplateId, source, status, startedAt, completedAt, updatedAt, kind` | v1 (`kind` en v2) | `WorkoutSession` (`workout.ts`) |
| `goals` | `id` | `status, dueDate, achievedAt, updatedAt` | v1 | `Goal` v1 (`goal.ts`, union `target`) |
| `weightEntries` | `id` | `&date, kg, updatedAt` | v1 | `WeightEntry` (`weight.ts`) |
| `strengthFrames` | `id` | `exerciseId, updatedAt` | v2 | `StrengthFrame` (`strength.ts`) |
| `strengthFrameVersions` | `id` | `frameId, status, updatedAt` | v2 | `StrengthFrameVersion` |
| `strengthMilestones` | `id` | `frameVersionId, workoutId, date` | v2 | `StrengthMilestone` |
| `rpeScaleVersions` | `id` | `status, startDate` | v2 | `RpeScaleVersion` |
| `cardioProtocols` | `id` | `indicator, cycleWeek` | v2 | `CardioProtocol` (`cardioTest.ts`) |
| `cardioProtocolVersions` | `id` | `protocolId, status` | v2 | `CardioProtocolVersion` |
| `cardioTests` | `id` | `versionId, date, status` | v2 | `CardioTest` |
| `cardioTestMeasures` | `id` | `testId, [testId+key]` | v2 | `CardioTestMeasure` |
| `mobilityProtocolVersions` | `id` | `status, startDate` | v2 | `MobilityProtocolVersion` (`mobility.ts`) |
| `mobilityAssessments` | `id` | `&workoutId, versionId, date` | v2 | `MobilityAssessment` |
| `mobilityMeasures` | `id` | `assessmentId, [assessmentId+key]` | v2 | `MobilityMeasure` |
| `mobilityObservations` | `id` | `assessmentId` | v2 | `MobilityObservation` |

### 1.2 Relations implicites

Toutes passent par des identifiants, sans contrainte en base :

- `plannedSessions.sessionTemplateId` → `sessionTemplates`.
- `plannedSessions.workoutId` ↔ `workouts.plannedSessionId`.
- `workouts.sessionTemplateId` → `sessionTemplates`.
- Dans `workouts.blocks[]` :
  - `exerciseId` et `originalExerciseId` des briques → `exercises` ;
  - `rounds[].children[].exerciseId` → `exercises` ;
  - `frameVersionId` (brique, enfant de tour) → `strengthFrameVersions`.
- `workouts.rpeScaleVersionId` → `rpeScaleVersions`.
- `sessionTemplates.blocks[].exerciseId` et `children[].exerciseId` → `exercises`.
- `weeklyPrograms.days[].sessionTemplateId` → `sessionTemplates`.
- `strengthFrames.exerciseId` → `exercises`.
- `strengthFrameVersions.frameId` → `strengthFrames`.
- `strengthMilestones.frameVersionId` → `strengthFrameVersions` ; `strengthMilestones.workoutId` → `workouts`.
- `goals.target.exerciseId` (v1) → `exercises` : jamais écrit.

### 1.3 Données réelles (sauvegarde de référence du 23/09, vérifiée)

**Métadonnées**
- Fichier `coach-jm-sauvegarde-2026-09-23-1639.json`, format 1, base `coach-jm` version **2**.
- Exportée le 2026-09-23T14:39:47Z, build 2026-09-23T10:59:34Z (lot a déployé), iPhone (écran d'accueil).
- Empreinte `5755a2e9f060…`.
- `warnings: []`.

| Store | Compte | Détail vérifié |
|---|---|---|
| `exercises` | **48** | tous `active` ; `loadSemantics: "assistance"` déjà posé par le seed du lot a sur `traction-assistee` et `dips-assistes` |
| `sessionTemplates` | **1** | le « modèle brouillon » : `id` `d6b12816-…`, **nom « Muscu A »**, `Musculation`, 2 blocs, créé le 17/09 |
| `workouts` | **13** au 23/09 (le nombre augmente à chaque séance ; aucun test ni contrôle ne l'écrit en dur) | 10 importées (`import-2026-09-01` → `import-2026-09-16`) et 3 libres (`free-2026-09-18…`, `free-2026-09-20…`, `free-2026-09-23…`) ; toutes `completed` ; une seule porte `rpeScaleVersionId`, deux portent `kind` ; la séance du 15/09 porte la traction assistée 49×10, 49×6, 56×10 ; aucune brique ne porte de `frameVersionId` |
| `strengthFrames` | **1** | `frame-a73a1d19-…`, exercice **`tirage-vertical`**, créé le 22/09 |
| `strengthFrameVersions` | **1** | `…-v1`, `active`, `charge_croissante`, **3 × 10-12**, RPE cible 8, repos 90 s, incrément 2,5 kg, `currentTarget` **40 kg** (accepté le 22/09) ; **non figée** (pas de `firstOfficialWorkoutId` : aucune séance ne l'a encore exécutée) |
| `rpeScaleVersions` | **1** | `rpe-scale-v1`, `active`, `startDate` 2026-09-22 |
| `weeklyPrograms`, `plannedSessions`, `goals`, `weightEntries`, `strengthMilestones` | **0** | |
| `cardio*` (4), `mobility*` (4) | **0** | |

**Sauvegardes plus anciennes, toujours jouées par les tests (R)** :
- 20/09 (`…-0205`) : pas d'échelle RPE ni de cadre ;
- 22/09 (`…-1205`, empreinte `2576bdfa…`) : échelle RPE, pas de cadre, pas de `loadSemantics`.

Elles couvrent les états antérieurs que peut avoir une base.

Aucun code applicatif n'écrit dans `goals`, `weightEntries`, `cardio*` ni `mobility*` (vérifié dans l'audit du 23/09 et confirmé par la recherche des appels de repository). Leur vacuité sur l'appareil reste pourtant **à revérifier sur la sauvegarde fraîche** du jour du déploiement (§ 10). C'est le rôle de la garde (§ 4).

### 1.4 Comportements existants dont dépend la migration

- **Sauvegarde** : format `coach-jm-backup`, version 1.
  - `readStores` lit **tous** les stores de la base dans une transaction en lecture seule, triés par clé primaire.
  - Empreinte = SHA-256 de `canonicalStringify(stores)` (règle `sorted-keys-json-v1`).
- **Restauration** (`restoreBackup.ts`) :
  - elle refuse un store du fichier absent de la base cible, une empreinte fausse, une base cible non vide ;
  - elle écrit tout dans **une** transaction (`bulkAdd`) ;
  - elle relit **après** la validation de la transaction : si l'empreinte relue diffère, elle lève, mais les données sont déjà écrites (écart traité au § 7).
- **`verify-backup.mjs`** :
  - accepte seulement `formatVersion === 1` ;
  - suppose que **tout** enregistrement a un `id` chaîne, ce qui sera faux pour `settings` (clé `key`, § 6.7) ;
  - calcule `legacyHash` sur les 7 stores d'origine.
- **Démarrage** (`main.tsx`) : `seedExerciseCatalog()` puis `seedRpeScale()`, **sans** `try/catch`. C'est le premier accès à `db` qui ouvre la base et déclenche une éventuelle migration. En cas d'échec, l'application ne s'affiche pas (écart traité au § 4.4).

---

## 2. Schéma cible complet

Légende du statut : **CONSERVÉ** (index et forme inchangés), **ADAPTÉ** (champs facultatifs ajoutés, index inchangés), **REFONDU** (forme et index changent), **CRÉÉ**, **SUPPRIMÉ**.

### 2.1 Déclaration Dexie cible

```ts
export const DATABASE_VERSION = 3;

export const VERSION_3_STORES = {
  exercises:
    "id, name, zone, movement, equipment, location, mode, " +
    "measurementType, status, updatedAt, progressionGroup, movementFamily",
  sessionTemplates: "id, name, category, status, position, updatedAt",
  weeklyPrograms: "id, name, updatedAt",
  plannedSessions: "id, date, sessionTemplateId, status, source, updatedAt",
  workouts:
    "id, date, plannedSessionId, sessionTemplateId, source, status, " +
    "startedAt, completedAt, updatedAt, kind",
  weightEntries: "id, &date, kg, updatedAt",
  strengthFrames: "id, exerciseId, updatedAt",
  strengthFrameVersions: "id, frameId, status, updatedAt",
  strengthMilestones: "id, frameVersionId, workoutId, date",
  rpeScaleVersions: "id, status, startDate",
  goals: "id, &key, position, updatedAt",
  testProtocols: "id, &key, status",
  testProtocolVersions: "id, protocolId, status",
  testResults: "id, protocolId, versionId, date, workoutId, [protocolId+date]",
  settings: "key",
  cardioProtocols: null,
  cardioProtocolVersions: null,
  cardioTests: null,
  cardioTestMeasures: null,
  mobilityProtocolVersions: null,
  mobilityAssessments: null,
  mobilityMeasures: null,
  mobilityObservations: null,
} as const;

// constructeur
this.version(1).stores(VERSION_1_STORES);
this.version(2).stores(VERSION_2_STORES);
this.version(3).stores(VERSION_3_STORES).upgrade(guardV3Migration);   // § 4
```

- `VERSION_2_STORES` reste déclaré **tel quel** : Dexie reconstruit le schéma global version par version.
- `STORE_NAMES` (utilisé par les sauvegardes et les tests) devient la liste des **15** stores non nuls de `VERSION_3_STORES`.

### 2.2 Store par store

| Store | Clé | Index (`&` = unique) | Statut | Modèle TS | Champs nouveaux (tous facultatifs sauf mention) | Relations sortantes | Suppression en cascade : propriétaire |
|---|---|---|---|---|---|---|---|
| `exercises` | `id` | inchangés | ADAPTÉ | `Exercise` | `powerUnit?` ; types de mesure `reps_duration`, `duration_power` ; `loadSemantics?` (lot a) | — | aucune suppression : archivage (`archiveExercise`) |
| `sessionTemplates` | `id` | inchangés | ADAPTÉ | `SessionTemplate`, `SessionBlock` | `letter?`, `subtitle?`, `tags?`, `origin?`, `mainBlockId?` ; `BaseBlock.role?: "warmup"` ; plages `RangeOrValue` dans les consignes de palier ; catégorie `"Routine"` | `blocks[].exerciseId` → `exercises` | aucune suppression : archivage |
| `weeklyPrograms` | `id` | inchangés | ADAPTÉ | `WeeklyProgram` | `eveningRotation?`, `eveningRotationAnchor?` | `days[].sessionTemplateId`, `eveningRotation[]` → `sessionTemplates` | `applyWeeklyProgram` (réécriture complète) |
| `plannedSessions` | `id` | inchangés | ADAPTÉ | `PlannedSession`, `PlannedTest` | `slot?`, `tests?[]` (dont `rescheduledToPlannedSessionId?`) | `sessionTemplateId` → `sessionTemplates` ; `workoutId` → `workouts` ; `tests[].protocolId` → `testProtocols` | `plannedSessionActions` (retrait logique `removedAt`) ; `applyWeeklyProgram` (suppression physique des instances futures intactes seulement) |
| `workouts` | `id` | inchangés | ADAPTÉ | `WorkoutSession`, `PerformedBlock` | `endedAt?`, `feeling?`, `note?` ; brique `PerformedTestBlock` (`draft?`, `testResultId?`) ; `PerformedExerciseBlock.role?`, `reducedPrescription?`, `heartRate?` ; `PerformedSeries.repDurationsSec?`, `result?`, `resistance?` | `plannedSessionId`, `sessionTemplateId`, `rpeScaleVersionId`, `blocks[]…exerciseId`, `frameVersionId`, `testResultId` | **`deleteWorkout`** : jalons, `testResults` d'origine séance, instance planifiée, versions de cadre et de protocole à défiger (§ 8) |
| `weightEntries` | `id` | `&date, kg, updatedAt` | CONSERVÉ | `WeightEntry` | — | — | `deleteWeightEntry` (aucune cascade : tout est dérivé) |
| `strengthFrames` | `id` | inchangés | CONSERVÉ | `StrengthFrame` | — | `exerciseId` → `exercises` ; `activeVersionId` → `strengthFrameVersions` | aucune suppression |
| `strengthFrameVersions` | `id` | inchangés | ADAPTÉ | `StrengthFrameVersion` | `increment` devient **facultatif** (D18, N4 : un incrément absent ne se propose jamais) | `frameId` → `strengthFrames` | aucune suppression : archivage |
| `strengthMilestones` | `id` | inchangés | CONSERVÉ | `StrengthMilestone` | — | `frameVersionId`, `workoutId` | **`deleteWorkout`** |
| `rpeScaleVersions` | `id` | inchangés | CONSERVÉ | `RpeScaleVersion` | — | — | aucune suppression |
| `goals` | `id` | **`&key, position, updatedAt`** (index v1 `status, dueDate, achievedAt` retirés) | **REFONDU** | `Goal` v2 (`GoalSegment`, `GoalMeasure`) | forme entière (conception § 3.6.1) | `segments[].measure.protocolId` → `testProtocols` ; `linkedExercises[]`, `secondaryIndicators[].exerciseId` → `exercises` | aucune suppression en V1 (7 objectifs fixes, édition seule) |
| `testProtocols` | `id` | `&key, status` | CRÉÉ | `TestProtocol` | forme entière (conception § 3.7.1) | `activeVersionId` → `testProtocolVersions` | aucune suppression (`status: "paused"`) |
| `testProtocolVersions` | `id` | `protocolId, status` | CRÉÉ | `TestProtocolVersion` | forme entière (conception § 3.7.2) | `protocolId` ; `measures[].exerciseId` → `exercises` | aucune suppression : archivage par nouvelle version |
| `testResults` | `id` | `protocolId, versionId, date, workoutId, [protocolId+date]` | CRÉÉ | `TestResult` | forme entière (conception § 3.7.3) ; **source unique** (D27) | `protocolId`, `versionId`, `workoutId`, `blockId` | `deleteWorkout` (origine `workout`) ; suppression directe (origine `manual`) |
| `settings` | **`key`** | — | CRÉÉ | `SettingsRecord` (union discriminée par `key`) | `profile`, `preferences`, `testCycle`, `testSchedule`, `install` (conception § 3.9) | `testSchedule[].templateId`, `targetBlockId` → `sessionTemplates` | effacement total seulement |
| `cardioProtocols`, `cardioProtocolVersions`, `cardioTests`, `cardioTestMeasures`, `mobilityProtocolVersions`, `mobilityAssessments`, `mobilityMeasures`, `mobilityObservations` | — | — | **SUPPRIMÉS** en v3 (déclarés `null`), sous garde | types retirés au lot N | — | — | — |

**Précisions de modélisation**

- **`settings`** : clé primaire `key` (et non `id`), valeurs :

  ```ts
  type SettingsRecord =
    | { key: "profile"; value: ProfileSettings }
    | { key: "preferences"; value: PreferenceSettings }
    | { key: "testCycle"; value: TestCycleSettings }
    | { key: "testSchedule"; value: TestScheduleEntry[] }
    | { key: "install"; value: InstallMarkers };
  ```

  Pas de champ `updatedAt` imposé. Chaque écriture remplace l'enregistrement entier (`put`).

- **`goals`** : l'index unique `&key` garantit « un objectif par clé » en base, là où l'unicité du cadre par exercice n'est tenue que par le code (`strengthFrames.exerciseId` n'est pas unique, constat de l'audit).
  - `testProtocols.key` est unique aussi.
  - `testResults.workoutId` n'est **pas** unique : une séance peut porter plusieurs tests (Muscu A et C en semaine de tests plus un autre, Souplesse et Tronc le lundi soir, N2).
- **Index composé `[protocolId+date]`** : il sert la courbe d'un objectif (résultats d'un protocole triés par date) et la détection « test à replanifier » (existe-t-il un résultat pour ce protocole à cette date ?).
- **Types TypeScript** : les champs ajoutés aux modèles existants sont **tous facultatifs**. Avec `exactOptionalPropertyTypes`, aucun `undefined` explicite n'est écrit.
  - Un enregistrement antérieur, sans ces champs, reste un état valide et **signifie l'ancien comportement** (I-9).

---

## 3. v3 seule ou v3 + v4 : vérification et décision

### 3.1 La question

La conception (D1) veut une **garde** : refuser la migration si l'un des 8 stores à supprimer, ou `goals` (forme v1), contient une donnée.

La garde s'exécute dans l'`upgrade()` de la version qui déclare ces stores `null`. Elle n'est possible en une seule version que si l'`upgrade()` peut encore **lire** un store qu'il est en train de supprimer. Sinon, il faut v3 (garde, stores gardés) puis v4 (suppression).

### 3.2 Méthode

**1. Lecture du code de Dexie 4.4.6** (`node_modules/dexie/dist/dexie.mjs`, fonction `updateTablesAndIndexes`, lignes 3806-3900). Pour chaque version à exécuter, Dexie enfile dans l'ordre :

1. création des stores ajoutés, puis changement des index des stores modifiés (`diff.add`, `diff.change`) ;
2. l'`upgrade()` de la version. Juste avant son appel :

   ```js
   var upgradeSchema_1 = shallowClone(newSchema);
   diff.del.forEach(function (table) { upgradeSchema_1[table] = oldSchema[table]; });
   ...
   setApiOnPlace(db, [db.Transaction.prototype], keys(upgradeSchema_1), upgradeSchema_1);
   trans.schema = upgradeSchema_1;
   ```

   Les stores supprimés (`diff.del`) sont **réinjectés** dans le schéma de la transaction d'upgrade ;
3. **ensuite seulement**, dans l'étape suivante de la file : `deleteRemovedTables(newSchema, idbtrans)`, qui appelle `deleteObjectStore` pour les stores absents du nouveau schéma (lignes 3869-3874 et 3971-3977).

Tout se déroule dans l'unique transaction `versionchange` d'IndexedDB. Une exception dans l'`upgrade()` fait **avorter** cette transaction. Par la spécification IndexedDB, un abandon de `versionchange` rétablit la version, les stores et les index d'avant.

**2. Expérience isolée**, hors du dépôt :
- fichier `scratchpad/dexie-exp/exp.mjs` ;
- exécutée avec le Dexie 4.4.6 et le `fake-indexeddb` 6.2.5 de `node_modules` ;
- bases **en mémoire**, données factices, aucune base réelle ouverte ni modifiée.

Chaque cas part d'une base v2 : `workouts` avec 2 séances, et selon le cas un enregistrement cardio ou des `goals` v1. On l'ouvre ensuite avec une v3 qui déclare `cardioTests: null`, `mobilityMeasures: null` et `goals: "id, &key, position, updatedAt"`, plus un `upgrade()`.

| # | Cas | Résultat observé |
|---|---|---|
| E1 | v3 sans garde ; l'`upgrade()` lit `tx.table("cardioTests").count()` alors que le store est déclaré `null` | lecture **possible** : compte = 1. `tx.storeNames` ne liste pas le store, mais `tx.table(...)` y accède. Après ouverture : version 3, `cardioTests` **supprimé avec sa donnée**, séances intactes |
| E2 | v3 avec garde qui lève si `cardioTests` n'est pas vide | ouverture en **erreur** (message de la garde) ; base **restée en version 2**, `cardioTests` toujours présent avec sa donnée, index de `goals` inchangés (v1), séances intactes |
| E3 | v3 avec garde, stores anciens vides | garde passée (0/0/0) ; version 3 ; stores anciens supprimés ; `goals` réindexé `&key, position, updatedAt` ; séances intactes |
| E4 | `upgrade()` qui **écrit** (modifie `w1`, crée un `settings`) puis lève | erreur ; base **restée en version 2** ; `w1` **inchangée** ; pas de store `settings`. L'annulation est complète |
| E5 | trois réouvertures successives d'une base déjà en v3 | `upgrade()` appelé **0 fois** |
| E6 | `goals` v1 non vide, **sans** garde | ouverture réussie, v3, les 2 objectifs v1 **conservés** sous le nouvel index (ils n'ont pas de `key`, donc ne sont pas indexés). Cela démontre que la garde sur `goals` est **nécessaire** : sans elle, des données incompatibles traverseraient la migration |
| E7 | tables visibles pendant et après l'upgrade | pendant : `tx.storeNames` = stores du nouveau schéma ; après : stores anciens absents |

### 3.3 Décision

**v3 seule : la version 3 contrôle, puis supprime.**
- Dexie 4.4.6 garantit par construction l'ordre « upgrade, puis suppression ». L'expérience le confirme.
- Une garde qui lève annule toute la transaction, suppressions et réindexation de `goals` comprises : **aucun risque de perte** (E2, E4).
- Une v4 n'apporterait rien et doublerait les tests de migration.

**Conditions de cette décision**, qui deviennent des tests du lot C (§ 9) :
- **Dexie verrouillé en 4.4.6** : `package.json` passe de `^4.4.6` à `4.4.6` exact. Un changement de version de Dexie oblige à rejouer T-3 à T-5.
- **T-3 à T-5 rejoués en vrai navigateur**, pas seulement sur `fake-indexeddb` :
  - dans le navigateur intégré (Chromium), page de test chargée depuis le serveur de développement ;
  - **sur Safari iOS**, avec des données fictives, comme la migration v1 → v2 du lot 1.

  Si Safari démentait E2 ou E4 (abandon non complet), la décision bascule sur v3 + v4 : c'est le seul cas prévu.

---

## 4. Migration, étape par étape

### 4.1 Déclenchement

- La migration est **implicite** : Dexie l'exécute à la première ouverture de `db` par le code v3.
- Pour la maîtriser, `main.tsx` ouvre la base **explicitement et en premier**, dans un `try/catch`, avant tout seed :

```ts
async function bootstrap() {
  try {
    await db.open();                 // migration v2 → v3 (ou v1 → v2 → v3) ici
  } catch (error) {
    renderMigrationFailure(error);   // § 4.4 — aucun seed, aucune écriture
    return;
  }
  await runSeeds();                  // § 5
  renderApp();
}
```

### 4.2 Algorithme exécuté par Dexie et par `guardV3Migration`

Tout se passe dans **une** transaction `versionchange`.

| Étape | Qui | Action |
|---|---|---|
| **C-1** | Dexie | Pour une base v1 : exécution de la version 2 (création des 12 stores v2, index enrichis). Pas d'`upgrade()` en v2. Une base v2 passe directement à C-2 |
| **C-2** | Dexie | Version 3, schéma : création de `testProtocols`, `testProtocolVersions`, `testResults`, `settings` ; `goals` : suppression des index `status`, `dueDate`, `achievedAt`, création de `&key` et `position` (`updatedAt` conservé) |
| **C-3** | `guardV3Migration(tx)` | Compte, **en lecture seule**, les enregistrements de `cardioProtocols`, `cardioProtocolVersions`, `cardioTests`, `cardioTestMeasures`, `mobilityProtocolVersions`, `mobilityAssessments`, `mobilityMeasures`, `mobilityObservations` et `goals`. Si un compte est > 0 : `throw new MigrationGuardError({ store: count, … })`. **Aucune écriture, dans aucun cas** |
| **C-4** | Dexie | Si C-3 n'a pas levé : `deleteObjectStore` des 8 stores anciens |
| **C-5** | IndexedDB | Validation de la transaction : la base est en version 3 |

**Garde sur `goals`.**
- Elle refuse **tout** enregistrement, et pas seulement ceux « incompatibles ». Le store n'a jamais été écrit par l'application ; une donnée présente est donc une anomalie, qu'on n'interprète pas.
- Le seed des objectifs (§ 5) n'écrit qu'**après** la migration : il ne peut pas déclencher la garde.

**Ce que la migration ne fait pas**
- Elle ne lit **aucun** enregistrement de `exercises`, `sessionTemplates`, `weeklyPrograms`, `plannedSessions`, `workouts`, `weightEntries`, `strength*` ni `rpeScaleVersions`, et n'en écrit aucun.
- Aucun champ n'est ajouté à un enregistrement existant : les champs nouveaux sont facultatifs, **absents = ancien comportement**.

### 4.3 Invariants

Tous sont vérifiés par les tests du § 9. « Avant » = base v2, « après » = même base en v3, **avant tout seed**.

| # | Invariant |
|---|---|
| I-1 | Pour chacun des 10 stores conservés ou adaptés : `canonicalStringify(après[store]) === canonicalStringify(avant[store])` (égalité octet à octet de la forme canonique) |
| I-2 | Cas particulier de I-1, sur la copie réelle : **toutes** les séances de la sauvegarde, **quel que soit leur nombre**, sont relues identiques (comparaison enregistrement par enregistrement, par identifiant, et même nombre d'enregistrements), **dont les séries de traction assistée du 15/09** (49×10, 49×6, 56×10) |
| I-3 | Le modèle brouillon `d6b12816-…` et `rpe-scale-v1` sont identiques |
| I-4 | `goals`, `testProtocols`, `testProtocolVersions`, `testResults` et `settings` sont vides |
| I-5 | Les 8 stores anciens n'existent plus : `db.tables` ne les contient pas |
| I-6 | `db.verno === 3` ; schéma (stores et index, lus par `describeSchema`) égal à `VERSION_3_STORES` |
| I-7 | **Échec de la garde** : `verno` reste 2, les 19 stores v2 sont présents, et le contenu de chacun est égal à l'« avant » |
| I-8 | **Idempotence** : réouvrir une base v3 n'appelle pas `guardV3Migration` (E5) et ne change aucun store |
| I-9 | Code v3 sur enregistrements anciens : une séance sans `endedAt`, `feeling`, `note`, sans brique `test`, sans `role` ni `reducedPrescription` se lit, s'affiche et se compte **exactement** comme avant (tests existants inchangés et verts) |

### 4.4 Échec de la migration : ce que voit l'utilisateur

**Écran minimal `MigrationFailureScreen`**
- Il est rendu par `renderMigrationFailure(error)` hors du routeur.
- Il explique : « La mise à jour des données a été arrêtée pour protéger vos données. Rien n'a été modifié. »
- Il liste les stores en cause, lus sur `MigrationGuardError`.
- Il propose **« Exporter mes données »**.

**Comment l'export est possible**
- Le code v3 ne peut pas ouvrir la base en déclarant la v2 : Dexie refuse une version inférieure.
- L'export ouvre donc la base **en mode dynamique** : `new Dexie("coach-jm")` sans aucune déclaration de version. Il lit les stores tels qu'ils sont (v2) dans une transaction en lecture seule. L'expérience l'a fait (fonction `inspect`).
- Il produit une sauvegarde **format 1**, identique à celle d'aujourd'hui.
- Aucune écriture.

**Autres échecs d'ouverture** (quota, base bloquée par un autre onglet) : même écran, avec le message d'erreur brut. Pas d'export dans ce cas si l'ouverture dynamique échoue aussi.

### 4.5 Onglets multiples et événement `versionchange`

- **PWA iOS et Safari** ont des bases IndexedDB **séparées** (constat du 16/09) : aucun conflit entre elles.
- **Plusieurs onglets sur le même navigateur** (cas PC) : l'ancien code v2 n'écoute pas `versionchange`. Dexie 4 ferme par défaut une connexion qui reçoit `versionchange`, ce qui débloque l'ouverture v3.
- **Si l'ouverture reste bloquée**, l'événement `blocked` de Dexie est affiché par `MigrationFailureScreen` : « Fermez les autres onglets de Coach JM ».

---

## 5. Seeds

La migration crée la structure. Les seeds créent le **contenu** installé d'office. Ce sont deux choses distinctes :
- la migration ne lance aucun seed ;
- un seed ne s'exécute qu'après une ouverture réussie ;
- un seed n'écrit jamais dans un enregistrement de l'utilisateur, sauf les compléments « si absent » déjà en vigueur (catalogue).

### 5.1 Règles communes

- **Exécution** : `runSeeds()`, à chaque lancement, après `db.open()`, **dans l'ordre du § 5.2**, séquentiellement.
- **Atomicité** : chaque seed est **une** transaction Dexie. Elle couvre les données créées **et** son marqueur `settings.install.<nom>` : les deux sont écrits ensemble ou pas du tout.
- **Marqueur d'installation.** `settings.install` est un seul enregistrement : `{ programV1?, routines?, frames?, testProtocols?, goals?, settingsDefaults? }` (dates ISO).
  - Un seed à marqueur **ne s'exécute plus** dès que son marqueur est posé, **même si l'utilisateur a depuis archivé ou modifié** ce qu'il avait créé. On ne réinstalle jamais par-dessus un choix.
  - Un seed sans marqueur (catalogue, RPE) garde son idempotence actuelle, fondée sur le contenu.
- **Échec** :
  - un seed qui lève est journalisé (`console.error`) ; les seeds **qui en dépendent** ne s'exécutent pas ; l'application démarre quand même ;
  - le seed est retenté au lancement suivant, puisque son marqueur n'est pas posé ;
  - aucun écran ne dépend d'un seed pour s'afficher : un état vide est toujours prévu (conception § 6).
- **Deuxième lancement** : aucune écriture. Test T-8 : espions sur toutes les méthodes d'écriture, comme le test existant « le seed du lancement n'écrit rien ».

### 5.2 Ordre et dépendances

L'ordre de la conception est conservé. Une précision : **`settingsDefaults` passe avant tout**, pour que les autres seeds puissent écrire leur marqueur dans un enregistrement `install` existant.

| # | Seed | Lot qui le livre | Marqueur | Condition de création | Si l'élément existe déjà | Dépend de |
|---|---|---|---|---|---|---|
| 1 | `seedExerciseCatalog` (existant, étendu) | a (fait), D (7 exercices) | aucun | exercice du catalogue absent | complète les champs **absents** (éditoriaux, classification, `loadSemantics`, médias officiels) ; n'écrase jamais | — |
| 2 | `seedRpeScale` (existant) | 4A (fait) | aucun | aucune version en base | rien | — |
| 3 | `seedSettingsDefaults` | C | `install.settingsDefaults` | enregistrement `preferences` ou `testCycle` absent | un enregistrement présent n'est jamais réécrit ; seuls les **manquants** sont créés (`preferences`, `testCycle`, `install`) | — |
| 4 | `seedTestProtocols` | G | `install.testProtocols` | marqueur absent | un protocole dont la `key` existe n'est pas recréé | 1 (exercices de souplesse et `planche`) |
| 5 | `seedProgramV1` (modèles, règle hebdomadaire, `testSchedule`) | D | `install.programV1` | marqueur absent | modèle d'id fixe `v1-*` existant : conservé ; règle hebdomadaire **existante** (`weekly-program`) : conservée, rien n'est fusionné ; `testSchedule` présent : conservé | 1 |
| 6 | `seedRoutines` (3 cadres vides) | D | `install.routines` | marqueur absent | id fixe existant : conservé | — |
| 7 | `seedProgramFrames` (premières cibles, D19) | D | `install.frames` | marqueur absent | un exercice qui a **déjà** un cadre n'en reçoit pas un second (unicité tenue par le code) | 1, 5 |
| 8 | `seedGoals` | H | `install.goals` | marqueur absent | objectif dont la `key` existe : conservé | 1, 4 |

Les seeds 4 à 8 **n'existent pas au lot C** : le lot C ne livre que la structure et le seed 3. Chaque lot ajoute le sien, avec les mêmes règles et le même test de double exécution.

**Deux points de la base réelle, sans décision à prendre**
- **Le brouillon s'appelle « Muscu A »** (§ 1.3). Le seed 5 crée `v1-muscu-a` « Muscu A — Traction force / dos » **à côté**, conformément à la conception (brouillon non touché). Deux modèles au nom proche coexisteront dans l'onglet Séances ; le brouillon reste archivable par l'utilisateur.
- **Aucune règle hebdomadaire n'existe** : le seed 5 l'installe.

---

## 6. Format de sauvegarde v2

### 6.1 Enveloppe

```ts
interface BackupEnvelopeV2 {
  format: "coach-jm-backup";
  formatVersion: 2;
  exportedAt: string;                               // ISO UTC
  app: { buildTime: string; version: string };      // version = package.json (aujourd'hui "0.0.0")
  device: { userAgent: string; standalone: boolean };
  database: { name: "coach-jm"; version: number };  // db.verno lu, 3 en V1
  counts: Record<StoreName, number>;                // les 15 stores, même à 0
  warnings: SerializationIssue[];                   // gravité "lossy" seulement
  integrity: {
    algorithm: "SHA-256";
    canonical: "sorted-keys-json-v1";
    hash: string;                                   // empreinte globale
    storeHashes: Record<StoreName, string>;         // empreinte par store (nouveau)
  };
  legacyIntegrity: { hash7: string };               // 7 stores d'origine
  stores: Record<StoreName, unknown[]>;             // les 15 stores
}
```

### 6.2 Ce qui entre dans les empreintes

- **`stores`** contient les 15 stores de la base, **tous présents même vides**, chacun trié par clé primaire en ordre de code point de `String(clé)` (règle actuelle de `readStores`). Pour `settings`, la clé est `key`.
- **`integrity.hash`** = `sha256Hex(canonicalStringify(stores))`, sur l'objet `stores` entier et rien d'autre (ni métadonnées, ni `counts`, ni `warnings`). Règle `sorted-keys-json-v1` inchangée : clés triées par code point, aucun espace, propriétés `undefined` omises, `undefined` dans un tableau écrit `null`.
- **`integrity.storeHashes[s]`** = `sha256Hex(canonicalStringify(stores[s]))`. **Précision de ce document**, dans l'esprit de `hash7` : elle permet de prouver store par store qu'une migration n'a rien changé (I-1, § 10). Elle n'entre pas dans `hash`.
- **`legacyIntegrity.hash7`** = `sha256Hex(canonicalStringify({ exercises, sessionTemplates, weeklyPrograms, plannedSessions, workouts, goals, weightEntries }))`.
  - C'est le calcul actuel de `verify-backup.mjs` (`LEGACY_STORE_ORDER`), que l'on peut reproduire à partir d'un fichier v1, v2 ou v3.
  - Son **rôle** : continuité avec les sauvegardes antérieures. Ce n'est pas une preuve d'invariance (`goals` refondu, catalogue complété par les seeds). La preuve fine est `storeHashes`.

### 6.3 `counts` et `warnings`

- `counts[s]` = `table.count()` lu dans la même transaction. L'export échoue si `count ≠ longueur lue` (règle actuelle).
- `warnings` : issues `lossy` de l'audit de sérialisation (propriété `undefined`, `-0`). Elles n'empêchent pas l'export.
- Les issues `unserializable` (`Date`, `Blob`, `Map`, `NaN`…) **refusent** l'export (règle actuelle).
- **Photos** : absentes en V1 (conception § 2.4). L'audit refuserait un `Blob`, donc aucune donnée binaire ne peut entrer dans une sauvegarde sans décision future (nouvelle version de format).

### 6.4 Champs facultatifs et données inconnues

- **Champs facultatifs absents** : ils sont absents du JSON. La forme canonique omet `undefined`, donc « absent » et « `undefined` » ont la même empreinte.
- **Champs inconnus d'un enregistrement** : IndexedDB stocke les objets entiers. Un champ que le code ne connaît pas est exporté, restauré et signé **tel quel** : jamais filtré, jamais perdu.
- **Store inconnu dans un fichier** : refus à la restauration (§ 7).
- **Store de la base absent du fichier** : impossible en format 2 (les 15 sont toujours écrits). En format 1, il est traité au § 7.

### 6.5 Reproduction à la restauration

La restauration recalcule `hash`, et `storeHashes` pour un fichier v2, **avant** toute écriture, sur `stores` tel que lu dans le fichier. Toute différence = refus. Le contrôle après écriture est au § 7.2.

### 6.6 Nom du fichier et diffusion

Inchangés : `coach-jm-sauvegarde-AAAA-MM-JJ-HHMM.json`, en partage Web Share ou en téléchargement.

### 6.7 `scripts/verify-backup.mjs`

- Il accepte les formats **1 et 2**.
- Il identifie un enregistrement par **la clé primaire de son store** (`key` pour `settings`, `id` ailleurs) au lieu de supposer `id`. Sans cette correction, `settings` serait signalé « sans identifiant ».
- Il vérifie `hash`, et `storeHashes` en format 2.
- Il calcule et affiche `hash7`.
- Il signale les références orphelines nouvelles :
  - `testResults.workoutId` → `workouts` ;
  - brique `test.testResultId` → `testResults` ;
  - `plannedSessions.tests[].protocolId` → `testProtocols` ;
  - `goals.segments[].measure.protocolId` → `testProtocols`.
- Il **compare deux fichiers** : `node scripts/verify-backup.mjs avant.json après.json` affiche, store par store, identique ou différent (avec le nombre d'enregistrements ajoutés, retirés ou modifiés). C'est l'outil de la recette du § 10.

---

## 7. Matrice de restauration

### 7.1 Principe : restaurer = remplacer, jamais fusionner, jamais à moitié

La restauration se fait par une fonction unique, `restoreInto(database, envelope)`, appelée :
- par l'import de l'interface, via `resetAndRestore` (§ 7.4) ;
- par les tests ;
- par la console de développement.

### 7.2 Correction du contrôle après écriture (écart de § 1.4)

- **Aujourd'hui**, l'empreinte relue est contrôlée **après** la validation de la transaction : un écart laisse des données écrites.
- **En v3, le contrôle se fait dans la transaction.** Après les `bulkAdd`, la transaction relit chaque store restauré et compare **la forme canonique** relue à celle du fichier (`canonicalStringify`, synchrone). Au premier écart, elle lève : **Dexie annule tout**.
- **On compare des chaînes, pas des SHA-256**, parce que `crypto.subtle.digest` est asynchrone et hors IndexedDB : l'attendre dans une transaction Dexie la validerait prématurément. Égalité des formes canoniques ⇔ égalité des empreintes.
- Le SHA-256 relu est recalculé **après** validation, pour le rapport seulement.

### 7.3 Les cas

Colonnes : validation (avant toute écriture) → écriture → migration et seeds → contrôle final → en cas d'erreur.

| Cas | Validation (avant écriture) | Écriture | Migration / seeds | Contrôle final | En cas d'erreur |
|---|---|---|---|---|---|
| **A. Format 1, base v1** (7 stores) | JSON lisible ; `format`, `formatVersion = 1` ; `counts` = longueurs ; `hash` recalculé = `integrity.hash` ; aucun store hors des 7 connus ; `goals` **vide** | les 6 autres stores du fichier, dans une transaction, dans la base v3 vide | aucune migration (la base cible est déjà v3) ; seeds au lancement suivant (`resetAndRestore` recharge l'app) | dans la transaction : forme canonique relue = fichier pour chaque store écrit ; les stores v3 absents du fichier restent vides | annulation complète ; message nommant la cause ; base laissée **vide** (après effacement, § 7.4) ou **intacte** (sans effacement) |
| **B. Format 1, base v2** (19 stores, sauvegardes du 20, du 22 et du 23/09) | idem A ; en plus, les 8 stores `cardio*` et `mobility*` doivent être **vides**, sinon refus nommé (« ce fichier contient des données de test cardio ou mobilité que cette version ne sait pas porter ») ; `goals` vide | les 11 stores communs non vides ; les 8 anciens **ignorés** (vides) | idem A | idem A ; l'empreinte du fichier porte sur ses 19 stores, et le contrôle compare les 11 écrits un à un (les 8 ignorés sont vides par la validation) | idem A |
| **C. Format 2, base v3** | idem, `formatVersion = 2` ; `hash` et **chaque** `storeHashes` recalculés ; stores = les 15 connus | les 15 stores | aucune | forme canonique relue = fichier, pour les 15 | idem |
| **D. Fichier invalide** (JSON illisible, `format` inconnu, `formatVersion` > 2, `counts` faux, store inconnu, enveloppe incomplète) | refus à la validation | aucune | aucune | — | message ; **rien d'écrit, rien d'effacé** : la validation précède toujours l'effacement (§ 7.4) |
| **E. Empreinte invalide** (un caractère modifié) | `hash` ou `storeHashes` recalculé ≠ embarqué → refus | aucune | aucune | — | idem D |
| **F. Données anciennes interdites** (`cardio*` ou `mobility*` non vides, `goals` non vide) | refus nommé, store par store | aucune | aucune | — | idem D. L'utilisateur garde son fichier : il pourra être restauré par une future version qui saura porter ces données |
| **G. Base cible non vide** | `restoreInto` refuse dans la transaction si un store contient un enregistrement (règle actuelle) | aucune | aucune | — | l'interface ne propose jamais `restoreInto` directement sur une base non vide : elle passe par `resetAndRestore` (§ 7.4) |

### 7.4 `resetAndRestore` : le seul chemin d'import de l'interface

Il n'y a pas d'autre chemin. Une app qui tourne n'a **jamais** une base vide : les seeds s'exécutent au lancement.

| Étape | Action |
|---|---|
| 1 | **Validation complète du fichier** (§ 7.3, colonne « Validation »). Échec → arrêt, rien n'est touché |
| 2 | **Export de sécurité** de la base actuelle, proposé et fortement recommandé ; double confirmation de l'effacement (conception § 2.9) |
| 3 | `replaceWith(envelope, db)` (C.7 bis) : **une seule transaction** qui vide les 15 tables, écrit les stores du fichier, relit chacun et compare sa forme canonique au fichier, et vérifie que les stores absents du fichier sont vides. La base n'est **jamais supprimée** : elle a déjà le schéma v3 |
| 4 | Échec en 3, à n'importe quel moment (vidage, écriture, relecture) → IndexedDB annule toute la transaction, vidage compris : **l'ancienne base reste intacte**. L'app affiche « Rien n'a été modifié » |
| 5 | Succès → `location.reload()` : `bootstrap` s'exécute normalement, les seeds complètent ce qui manque (par exemple `settings` après un fichier format 1) |

**Garantie** : aucune base « à moitié restaurée » ni vide. À tout instant, la base est soit l'ancienne, intacte, soit entièrement restaurée. `Dexie.delete` ne sert plus qu'à l'effacement total (§ 8), qui ne restaure rien.

**Portée pour le lot C.** `restoreInto`, `resetAndRestore`, `MigrationFailureScreen` et l'export en mode dynamique sont livrés **au lot C**. Leur écran complet (Plus > Sauvegarde) reste au lot L. Au lot C, un point d'entrée minimal suffit : Plus > « Importer une sauvegarde » et « Effacer ». Sans lui, **aucun rollback ne serait possible sur l'iPhone** : l'ancien build n'a pas d'import (§ 10).

---

## 8. Suppressions et intégrité référentielle

### 8.1 Matrice

| Objet | Suppression | Références à vérifier | Traitement | Transaction |
|---|---|---|---|---|
| **Workout confirmée** (`completed`) | **autorisée**, depuis son récapitulatif, avec confirmation (existant) | `strengthMilestones.workoutId` ; `testResults.workoutId` ; `plannedSessions.workoutId` ; versions de cadre et de protocole figées par cette séance | **cascade** : jalons supprimés (existant) ; **résultats de test d'origine séance supprimés** ; versions de cadre défigées si plus référencées (existant) ; version de protocole défigée si `firstOfficialResultId` supprimé et aucun autre résultat ; `currentTarget` effacé s'il vient d'un jalon supprimé (existant) ; instance planifiée → `upcoming`, ou rattachée à une autre réalisation (existant) ; ses tests redeviennent « à replanifier » **par dérivation** (aucune écriture) | **une** transaction `rw` : `workouts`, `plannedSessions`, `strengthMilestones`, `strengthFrameVersions`, `testResults`, `testProtocolVersions` |
| **Workout en attente d'enregistrement** (`in_progress` + `endedAt`, N6) | **autorisée**, depuis l'écran de fin, avec confirmation | `plannedSessions.workoutId` ; aucun jalon ni résultat n'existe encore (créés seulement à la confirmation) | instance planifiée → `upcoming` ; la brique `test.draft` disparaît avec la séance | `workouts`, `plannedSessions` |
| **Workout en cours** (sans `endedAt`) | **interdite** (existant : « terminez-la ») | — | — | — |
| **TestResult d'origine `manual`** | **autorisée**, depuis son détail | `testProtocolVersions.firstOfficialResultId` | version défigée si c'était son premier résultat et qu'il n'en reste aucun | `testResults`, `testProtocolVersions` |
| **TestResult d'origine `workout`** | **interdite** seule. D27 : c'est la source unique, référencée par `testResultId` dans une séance figée ; supprimer l'un sans l'autre créerait une référence pendante | — | uniquement par la suppression de sa séance | — |
| **PlannedSession** | retrait **logique** (`removedAt`, existant, action « Retirer ») ; suppression **physique** seulement par `applyWeeklyProgram` pour les instances futures **intactes** (existant) | `workoutId` ; `tests[]` | une instance faite ou en cours n'est jamais retirée (existant, action grisée) ; ses `tests[]` sont embarqués et disparaissent avec elle (retirée → tests « à replanifier » par dérivation, D26 ; supprimée physiquement → instance future intacte, jamais passée, rien à replanifier) | existant |
| **SessionTemplate** | **pas de suppression** : archivage (existant), qui la retire de la règle hebdomadaire (existant) | `plannedSessions`, `workouts`, `weeklyPrograms`, `testSchedule` | conservation : les instances et séances gardent leur référence ; un modèle V1 archivé garde son id fixe (le seed ne le recrée pas, marqueur posé) | existant |
| **Exercise** | **pas de suppression** : archivage (existant) | modèles, séances, cadres, objectifs (`linkedExercises`, secondaires), mesures de protocole (`exerciseId`) | conservation ; les écrans gèrent déjà « Exercice supprimé » et l'exercice archivé | — |
| **Goal** | **pas de suppression en V1** : 7 objectifs fixes, édition de la cible, de l'échéance et de la mesure seulement | — | — | — |
| **TestProtocol** | **pas de suppression** : `status: "paused"` | versions, résultats, `goals`, `testSchedule`, `plannedSessions.tests` | conservation | — |
| **TestProtocolVersion** | **pas de suppression** : archivage par création de la version suivante (figeage) | `testResults.versionId` | conservation | création de version : `testProtocols` + `testProtocolVersions` |
| **StrengthFrame / Version** | **pas de suppression** : archivage de version (existant) | jalons, séances | conservation | existant (`frameActions`) |
| **StrengthMilestone** | **uniquement** par la suppression de sa séance | — | — | celle de la séance |
| **WeightEntry** | **autorisée** (repository existant) ; même date → remplacement (existant) | aucune : tout est dérivé | aucune | simple |
| **Settings** | **pas de suppression**, sauf l'effacement total | — | — | — |
| **Effacement total** | autorisé (Plus, double confirmation, export proposé) | — | `Dexie.delete("coach-jm")` : tout disparaît, puis les seeds réinstallent | suppression de la base |

### 8.2 D27 : `testResults`, source unique

**Cycle de vie de la brique test**

| Moment | Contenu de la brique test | `testResults` |
|---|---|---|
| Démarrage | `{ kind: "test", protocolId, protocolVersionId, status }`, sans `draft` | rien |
| Pendant la séance, et entre Terminer et Enregistrer | `draft` écrit par le moteur | **aucun** enregistrement |
| `confirmWorkout` (une transaction) | la séance est écrite avec la brique **sans `draft`**, avec `testResultId` = id du résultat créé | le `TestResult` est créé (mesures entrées et dérivées calculées) |

**Invariants**

| # | Invariant | Contrôlé par |
|---|---|---|
| I-10 | Séance `completed` ⇒ aucune brique test n'a de `draft` | tests E et G ; `verify-backup` |
| I-11 | Brique test d'une séance `completed` avec `status: "performed"` ⇒ `testResultId` défini, et le résultat existe avec `workoutId` = cette séance et `blockId` = cette brique | tests E et G ; `verify-backup` |
| I-12 | `TestResult` d'origine `workout` ⇒ sa séance existe, est `completed`, et référence ce résultat (relation 1-1) | tests E et G ; `verify-backup` |
| I-13 | Une brique test `skipped` ou `not_performed` n'a ni `draft` ni `testResultId`. Le test attaché devient « à replanifier » par dérivation | tests E et G ; `verify-backup` |

---

## 9. Tests obligatoires du lot C

- **Environnement** : `fake-indexeddb`, avec une base au nom unique par test, supprimée après (`createTestDatabase` étendu à `version: 1 | 2 | 3`).
- **Sauvegarde réelle** : les tests marqués **(R)** s'exécutent avec `COACH_JM_BACKUP` et doivent passer avec les sauvegardes du **20/09, du 22/09 et du 23/09** (référence), plus la fraîche du déploiement (§ 10). **Aucun test n'écrit un nombre de séances en dur** : les attentes se calculent sur le contenu du fichier.
- **Tests existants** : `migration.test.ts` (v1 → v2), `restoreBackup.test.ts`, `exportBackup.test.ts`. Ils sont étendus, jamais supprimés. Ceux qui supposent 19 stores ou le format 1 à l'export sont mis à jour et listés au rapport du lot C.

| # | Précondition | Action | Résultat attendu | Invariants |
|---|---|---|---|---|
| T-1 | aucune base | `db.open()` | `verno` 3, 15 stores, tous vides ; aucune donnée ancienne | I-4, I-5, I-6 |
| T-2 | base v2 vide (tous les stores déclarés, 0 enregistrement) | ouverture v3 | migration réussie ; schéma = `VERSION_3_STORES` | I-4, I-5, I-6 |
| T-3 **(R)** | base v2 remplie avec la sauvegarde (restauration dans une base de test v2) | ouverture v3 | migration réussie ; **toutes les séances du fichier identiques**, quel que soit leur nombre (dont la traction du 15/09) ; le brouillon, l'échelle RPE, les 48 exercices, **le cadre `tirage-vertical` et sa version** identiques | I-1, I-2, I-3, I-4, I-5 |
| T-4a | base v2 avec 1 enregistrement dans `cardioTests` | ouverture v3 | `MigrationGuardError` nommant `cardioTests` ; `verno` 2 ; 19 stores ; tous les contenus égaux à l'avant | I-7 |
| T-4b | base v2 avec 1 enregistrement dans `mobilityMeasures` | idem | idem, nommant `mobilityMeasures` | I-7 |
| T-4c | base v2 avec 1 `goals` forme v1 (`target: { kind: "weight" }`) | idem | idem, nommant `goals` ; index de `goals` restés v1 | I-7 |
| T-4d | base v2 : un enregistrement dans chacun des 8 stores anciens et dans `goals` | idem | l'erreur liste les 9 stores ; base intacte | I-7 |
| T-5 | base v2 ; `guardV3Migration` remplacée, pour le test, par une fonction qui lève après une lecture | ouverture v3 | base restée v2 et intacte (simulation d'une panne pendant la migration) | I-7 |
| T-6 | base **v1** (7 stores) remplie avec les 10 séances importées et le catalogue | ouverture v3 | passage v1 → v2 → v3 dans la même ouverture ; contenus identiques | I-1, I-6 |
| T-7 | base v3 issue de T-3 | fermer et rouvrir 3 fois | `guardV3Migration` jamais appelée ; contenus égaux à chaque fois | I-8 |
| T-8 **(R)** | base v3 issue de T-3 | `runSeeds()` deux fois | premier passage : seulement les créations attendues du lot C (`settings` : `preferences`, `testCycle`, `install`) ; second passage : **aucune** méthode d'écriture appelée (espions) ; toutes les séances du fichier toujours identiques | I-1, I-2 |
| T-9 **(R)** | fichier format 1 (base v2, sauvegardes du 20, du 22 et du 23/09) | `resetAndRestore` dans une base de test v3 | succès ; les 11 stores communs relus identiques au fichier (formes canoniques) ; les 4 nouveaux vides avant seeds ; après les seeds, les séances restent identiques | I-1, I-2 |
| T-10 | fichier format 1, base v1 (fabriqué par `readBackup` sur une base v1 de test) | `resetAndRestore` | succès ; 7 stores identiques | I-1 |
| T-11 | base v3 peuplée (T-8) | export format 2 → `resetAndRestore` dans une autre base → export | les deux exports ont le même `hash` et les mêmes `storeHashes` ; `hash7` identique | § 6 |
| T-12 | fichier format 2 avec un caractère modifié dans `workouts` | `resetAndRestore` | refus à la validation ; `storeHashes.workouts` signalé ; base **non effacée** (validation avant effacement) | cas E |
| T-13 | fichier format 1 v2 avec 1 `cardioTests` | `resetAndRestore` | refus nommé ; base non effacée | cas F |
| T-14 | fichier valide ; `bulkAdd` forcé à lever au 3ᵉ store (simulation d'une panne pendant la restauration) | `restoreInto` sur base vide | exception ; **tous** les stores vides après coup (annulation complète) | § 7.2 |
| T-15 | fichier valide ; relecture interne altérée (un enregistrement relu différent, par espion) | `restoreInto` | la comparaison canonique dans la transaction lève ; base vide | § 7.2 |
| T-16 | base v3 non vide | `restoreInto` direct | refus « base cible non vide » ; rien d'écrit | cas G |
| T-17 | base v2 en échec de garde (T-4a) | export en mode dynamique | fichier format 1 valide (`verify` OK), 19 stores, contenu égal à la base ; aucune écriture | § 4.4 |
| T-18 | code v3, séances anciennes (sans champs v3) | suite complète existante (récap, Progression, fiche, cadres) | inchangée et verte | I-9 |
| T-19 | séance confirmée contenant une brique test (fabriquée directement en base de test, le moteur arrivant au lot G) | `verify-backup` et fonction `checkTestLinks` | I-10 à I-13 vérifiés ; un orphelin volontaire est détecté | I-10 à I-13 |
| T-20 | `verify-backup.mjs` | formats 1 et 2 ; store `settings` ; mode comparaison | OK ; `settings` non signalé « sans identifiant » ; la comparaison liste les stores différents | § 6.7 |
| T-21 **(R)** — livré avec le seed 7 (lot D) | copie de la sauvegarde du **23/09** (cadre existant sur `tirage-vertical`, version `…-v1`, 3 × 10-12, cible 40 kg) ; seeds 1 à 6 exécutés | `seedProgramFrames` (seed 7), deux fois | **aucun second cadre** pour `tirage-vertical` (un seul enregistrement `strengthFrames` pour cet exercice) ; le cadre existant et sa version **strictement identiques** au fichier : `activeVersionId`, `number`, `workSets`, `repRange`, `rpeTarget`, `restSec`, `increment`, **`currentTarget` (40 kg, date d'acceptation)**, `updatedAt` ; les autres exercices du programme reçoivent leur cadre ; second passage sans écriture | seed 7 (§ 5.2), I-1 |

**Exécution en vrai navigateur.** T-3, T-4a, T-5 et T-7 sont rejoués dans le **navigateur intégré** : page de test du serveur de développement, sur l'origin de recette (port 5174), jamais sur la base de l'utilisateur. Ils sont rejoués aussi sur **Safari iOS** avec des données fictives (§ 3.3).

---

## 10. Déploiement sur l'iPhone et rollback

**Préalables**
- Le lot C part **avec le lot D au minimum** (conception § 7).
- Le lot C livre le chemin de rollback (§ 7.4) : `resetAndRestore`, le point d'entrée minimal « Importer une sauvegarde » et « Effacer », `MigrationFailureScreen`, l'export en mode dynamique.
- **Sans eux, pas de déploiement.**

| # | Étape | Qui | Critère de passage |
|---|---|---|---|
| 1 | **Sauvegarde fraîche** sur l'iPhone (Plus > Sauvegarder), le jour même, depuis l'app en version actuelle, **PWA écran d'accueil** (sa base est distincte de celle de Safari) | toi | fichier `coach-jm-sauvegarde-<date>.json` transféré sur le PC |
| 2 | **Vérification** : `npm run backup:verify -- <fichier>` ; puis tests T-3, T-8 et T-9 avec `COACH_JM_BACKUP=<fichier>` | moi | empreinte OK ; comptes notés (séances : **le nombre du fichier**, jamais une valeur attendue en dur ; 48 exercices, 1 modèle, 1 échelle, cadres et jalons tels qu'ils sont ; **0** dans `goals`, `cardio*` et `mobility*`) ; T-3, T-8 et T-9 verts. **Si un store garde est non vide : arrêt, on ne déploie pas** |
| 3 | **Déploiement** : push, workflow « Deploy Coach JM » réussi, bundle en ligne vérifié (chaînes du lot) | moi, après ton feu vert | run `success`, bundle contenant `DATABASE_VERSION = 3` |
| 4 | **Ouverture et migration** : fermer complètement la PWA, la rouvrir ; si la date de version en bas de Plus n'a pas changé, fermer et rouvrir encore (le service worker active la nouvelle version au lancement suivant) | toi | date de build = celle du déploiement ; pas d'écran « mise à jour arrêtée » |
| 5 | **Contrôles visuels** : Planning, historique des séances de septembre, une fiche exercice (traction assistée : « Assistance min 49 kg »), Séances (le brouillon « Muscu A » présent) | toi | tout présent |
| 6 | **Export immédiat après migration** (Plus > Sauvegarder), fichier transféré | toi | fichier format 2, `database.version` 3 |
| 7 | **Comparaison** : `node scripts/verify-backup.mjs <avant> <après>` | moi | `storeHashes` identiques pour `workouts`, `sessionTemplates` (hors modèles `v1-*` ajoutés par D), `rpeScaleVersions`, `weightEntries`, `plannedSessions` et `weeklyPrograms` (hors ajouts de D) ; `exercises` : les 48 identiques + les 7 ajoutés par D ; `strengthFrames` et `strengthFrameVersions` : ceux du fichier identiques (dont `tirage-vertical`, cible 40 kg) + ceux créés par le seed 7 ; **toutes les séances du fichier identiques octet à octet**, quel que soit leur nombre. Chaque différence doit être listée et attendue |
| 8 | **Rollback, si un contrôle échoue** | toi et moi | voir ci-dessous |

**Rollback**

| Cas | Situation | Action |
|---|---|---|
| **8a** | La migration a échoué à la garde | La base est restée v2, **intacte** (I-7), et l'écran d'échec propose l'export (étape 1 bis). Rien à restaurer. On corrige le code et on redéploie. **L'app v3 ne démarre pas tant que la cause n'est pas traitée** : c'est voulu |
| **8b** | La migration a réussi mais un contrôle (5 à 7) montre un écart de données | Sur l'iPhone : Plus > « Importer une sauvegarde » avec le **fichier de l'étape 1** (format 1, cas B, § 7.3). Export de sécurité proposé, double confirmation, puis la base v3 est remplacée par le contenu d'avant la migration, les seeds se rejouant ensuite. Nouvel export, nouvelle comparaison avec l'étape 1 : les stores d'origine doivent être identiques |
| **8c** | Le code v3 lui-même est défectueux (l'app v3 inutilisable, au-delà des données) | **Revenir au build précédent ne suffit pas** : l'ancien code déclare la v2 et **ne peut pas ouvrir** une base v3 (Dexie refuse une version inférieure). Il n'a pas non plus d'import dans l'interface. La procédure est donc : corriger en avant (nouveau build v3), puis 8b si les données ont souffert. En dernier recours seulement : Réglages iOS > Safari > Avancé > Données des sites > supprimer les données de l'origine, redéployer l'ancien build, et restaurer le fichier de l'étape 1 par la console de développement sur PC. **Ce dernier recours est incompatible avec une PWA seule** et n'est pas un chemin prévu |

---

## 11. Questions réellement bloquantes pour le lot C

**Aucune décision utilisateur ne bloque le lot C.**

Tous les points ouverts ont été résolus dans ce document, sans décision fonctionnelle :
- v3 seule (§ 3) ;
- ordre des seeds (§ 5.2) ;
- empreintes par store (§ 6.2) ;
- contrôle interne à la transaction de restauration (§ 7.2) ;
- chemin de rollback livré au lot C (§ 7.4, § 10) ;
- correction de `verify-backup` pour `settings` (§ 6.7) ;
- verrouillage de Dexie en 4.4.6 (§ 3.3).

Deux éléments dépendent de faits à constater, pas de décisions :
- **le contenu réel de l'iPhone le jour du déploiement** (étape 2 du § 10) ;
- **le comportement de Safari iOS** sur T-4a et T-5 (§ 3.3).

Un résultat défavorable arrête le déploiement ou bascule mécaniquement sur la solution prévue (v3 + v4). Il ne demande pas d'arbitrage.

**À noter pour le document 3** (plan détaillé des lots), sans effet sur le lot C :
- le lot C inclut désormais le chemin de rollback minimal (§ 7.4), prélevé sur le lot L ;
- `package.json` fixe Dexie à 4.4.6 ;
- le seed 3 (`settingsDefaults`) appartient au lot C.
