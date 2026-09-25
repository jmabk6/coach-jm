# Recette iPhone de la V2 — lot O

**À faire par Jean-Michel, sur l'iPhone, avec l'app installée sur l'écran d'accueil (PWA).**
Version attendue dans Plus > À propos : **0.9.0** tant que le lot O n'est pas clos (1.0.0 à la clôture).

Chaque point dit **quoi faire** puis **ce qu'on doit voir**. Coche au fur et à mesure ; note le numéro et une phrase pour tout écart (une capture d'écran aide).

Les points marqués 🍏 ne se vérifient que sur l'iPhone : je ne peux pas les voir sur le PC. Les autres ont déjà été vérifiés sur PC à 375 px ; sur l'iPhone, on confirme le rendu réel et le toucher.

> **Données réelles.** Tout ce que tu fais ici écrit dans ta vraie base. Les gestes « destructifs » (effacer, importer, retirer) sont regroupés en fin de liste, **après** un export de sécurité, et sont facultatifs.

---

## 0. Préalable

- [ ] **0.1** Plus > Sauvegarde > « Sauvegarder mes données ». → Un fichier `coach-jm-sauvegarde-AAAA-MM-JJ-HHMM.json` est proposé au partage ; enregistre-le dans Fichiers **et** envoie-le sur le PC (Téléchargements). Je lance `backup:verify` dessus : c'est la **sauvegarde de départ** de la recette.
- [ ] **0.2** 🍏 Mise à jour de la PWA : ferme complètement l'app (balayage), rouvre-la. → Plus > À propos affiche la dernière version ; aucun écran blanc, aucune boucle de rechargement.
- [ ] **0.3** Plus > À propos. → Version 0.9.0.

---

## 1. Barre d'onglets et navigation

- [ ] **1.1** Touche chacun des 5 onglets : Accueil, Planning, Objectifs, Séances, Plus. → L'onglet touché s'allume ; icônes nettes ; rien ne passe sous la barre.
- [ ] **1.2** 🍏 La barre ne chevauche pas la barre d'accueil de l'iPhone (le trait noir en bas) ; en haut, le contenu ne passe pas sous l'encoche / l'heure.
- [ ] **1.3** 🍏 Geste de retour (balayage depuis le bord gauche) depuis une fiche exercice, un objectif, un récapitulatif. → Retour à l'écran précédent, sans page blanche.
- [ ] **1.4** 🍏 Aucun écran ne défile **horizontalement** (essaie de glisser à gauche/droite sur Accueil, Planning Mois, séance en cours).

---

## 2. Accueil (M1)

- [ ] **2.1** Titre « Accueil ». La carte du jour montre la ou les séances planifiées (tous créneaux, dont « Ce soir » pour la routine), ou « Repos ».
- [ ] **2.2** Semaine de tests (ou dans les jours qui la précèdent) : bandeau « Semaine de tests » ou « Semaine de tests dans N jours ».
- [ ] **2.3** « Mes 7 objectifs » : 7 lignes ; un objectif sans résultat affiche « À mesurer · Test [jour date] » ou « Test à replanifier » ; Jambes sans mesure → « Indicateur à choisir après 2 tests ».
- [ ] **2.4** Poids : « Moyenne provisoire » tant que la semaine n'a pas 3 pesées, ou « Pesée demain ».
- [ ] **2.5** Carte Pesée du jour : saisis ton poids du matin. → La valeur s'affiche ; une seconde saisie le même jour **remplace** la première (pas deux pesées).
- [ ] **2.6** 🍏 Clavier de la pesée : pavé numérique avec la virgule ; « 82,4 » est accepté ; le clavier ne masque pas le bouton d'enregistrement.
- [ ] **2.7** Lundi matin de semaine de tests : carte Mensurations proposée ; saisie d'une valeur au centième. → Valeur affichée telle quelle (virgule française).
- [ ] **2.8** Dates : le premier jour d'un mois s'écrit « 1er oct. », jamais « 1 oct. ».
- [ ] **2.9** « Choisir une séance » (jour sans séance planifiée) : liste des modèles actifs, puis « Séance libre sans modèle ». → **Pas** d'entrée « Bilan de mobilité ».

---

## 3. Planning Semaine (M2)

- [ ] **3.1** La semaine va du **dimanche au samedi** ; aujourd'hui est repérable.
- [ ] **3.2** Chaque séance porte son statut : Faite, Sautée, Non réalisée, Aujourd'hui, À venir. La routine du soir apparaît sur chaque jour, en créneau Soir.
- [ ] **3.3** Semaine de tests : bandeau, et chaque test affiché **sous** sa séance (traction le dimanche, mensurations et souplesse le lundi, cardio le mercredi, jambes le jeudi).
- [ ] **3.4** Déplacer une séance future sur un jour qui en a déjà une. → Feuille de conflit à trois choix ; « Annuler » ne change rien. *(Facultatif : fais-le sur une séance que tu comptes vraiment déplacer.)*
- [ ] **3.5** Un test à replanifier (séance sautée) porte un badge ambre « À replanifier » ; la feuille de replanification propose des jours.
- [ ] **3.6** « Programmation » (règle hebdomadaire) s'ouvre et se referme sans rien modifier si on ne touche à rien.

## 4. Planning Mois (M3)

- [ ] **4.1** Onglet Mois : grille du dimanche au samedi, une pastille par séance (icône de catégorie ; forme = statut).
- [ ] **4.2** Toucher un jour passé → fiche du jour ; « Voir le récapitulatif » ouvre la séance faite.
- [ ] **4.3** Toucher un jour futur → séances prévues, avec leur durée estimée et « Voir le détail ».
- [ ] **4.4** « Résumé de [mois] » : séances réalisées, jours sans séance, lignes Musculation / Cardio / Routine. → **Pas** de lien « Voir l'historique » (retiré au lot N).
- [ ] **4.5** Changer de mois (précédent / suivant). → Le résumé suit le mois affiché.

---

## 5. Objectifs (M4 à M7)

- [ ] **5.1** Liste : 7 objectifs numérotés, icône, titre, segment courant, barre, valeur (ou « À mesurer »), cible (ou « à définir »), badge éventuel (« Test le … », « À replanifier », « Pesée demain »).
- [ ] **5.2** Ouvre **Traction** > Progression : cartes Aujourd'hui, Statut, Échéance ; courbe par segments (ou « Les résultats apparaîtront ici après ton premier test ») ; indicateurs secondaires ; séances liées.
- [ ] **5.3** Traction à 0 kg d'assistance (si tu y es) → « Palier atteint », **jamais** « objectif atteint ».
- [ ] **5.4** Onglet **Exercices** : exercices liés avec leur lettre de séance (A, B, C) ; Tronc et Souplesse → « Exercices à définir avec les routines du soir » *(ou la liste réelle si elle a été reliée)*.
- [ ] **5.5** Onglet **Conseils** : Traction relu ; objectifs 2 à 7 avec le bandeau « Conseils en cours de validation ».
- [ ] **5.6** Poids > modifier la cible ou l'échéance, puis annuler. → Rien ne change.
- [ ] **5.7** Saisie d'un test passé (depuis l'objectif ou Plus > Protocoles) : ouvre le formulaire, vérifie les champs, **Annuler**. *(À faire pour de vrai quand tu saisiras les tests papier du 27/09 au 03/10 : le résultat doit alors apparaître sur la courbe et l'Accueil.)*

---

## 6. Séances (M8)

- [ ] **6.1** Filtres : Toutes, Musculation, Cardio, Mobilité, Routine. → **Pas** de « Bilan de mobilité ».
- [ ] **6.2** Cartes : Muscu A/B/C, Cardio A/B/C, Routines A/B/C ; **pas de photo** ; nombre d'exercices, durée estimée.
- [ ] **6.3** Ouvre Muscu A : briques dans l'ordre, l'échauffement tapis marqué « Échauffement », consignes avec plages (« 6–8 reps », « pente 6-8 % »).
- [ ] **6.4** Ouvre les routines A, B, C : contenu réel (validé le 25/09) ; la planche, la planche latérale et le hollow body portent la note « +5 s de maintien par semaine tant que la position reste parfaite. »

---

## 7. Séance en cours (M9) — à faire sur une vraie séance

Le mieux : une **Muscu** de semaine de tests (traction en étape 0), sinon une Muscu normale.

- [ ] **7.1** « Démarrer » depuis l'Accueil. → Plein écran, **sans** la barre d'onglets.
- [ ] **7.2** Frise en haut : pastille « **Échauffement** » (sans numéro), test = **0**, exercices **1 à N** ; faite = ✓, en cours = bleu, sautée = pointillés. Un appui ouvre l'étape et fait défiler jusqu'à elle.
- [ ] **7.3** Échauffement tapis : palier prérempli (5 km/h), « Valider le palier 1 ». Pas de repos entre paliers.
- [ ] **7.4** Brique test traction (semaine de tests) : consignes lisibles ; tableau d'essais ; le résultat se calcule en direct ; sans essai → « Résultat : — ».
- [ ] **7.5** Exercices à venir (repliés) : « Charge conseillée : … » chiffrée — squat « 35 kg (barre + 7,5 kg de chaque côté) », traction « 52 kg d'assistance » *(valeurs du jour selon tes cadres)*. Même valeur que « Conseillé » dans la fiche exercice.
- [ ] **7.6** Tableau des séries : colonnes Série / **Assistance (kg)** (traction) ou **Charge (kg)** / Répétitions / RPE, bien alignées ; la ligne active montre les valeurs proposées, le formulaire dessous.
- [ ] **7.7** 🍏 Clavier de saisie : pavé numérique avec virgule (charge 47,5) ; les boutons − / + répondent au toucher sans zoomer l'écran ; le clavier ne cache pas « Valider la série ».
- [ ] **7.8** Valider une série. → Carte Repos avec le chrono ; « Ensuite » annonce la série ou l'exercice suivant (avec la charge conseillée) ; − 30 s / + 30 s / Passer.
- [ ] **7.9** 🍏 **Son** de fin de repos (si activé dans Réglages) : audible, mode silencieux coupé.
- [ ] **7.10** 🍏 **Verrouillage pendant un repos** : verrouille l'iPhone 1 min, déverrouille. → Le chrono a continué (temps réel), pas de remise à zéro ; la séance est intacte.
- [ ] **7.11** 🍏 Passe dans une autre app pendant un repos, reviens. → Même constat.
- [ ] **7.12** Encarts de progression (si un cadre est concerné) : « Augmentation proposée » (Accepter / Plus tard) ou « Stagnation à examiner ». Accepter → la charge conseillée de l'exercice suit immédiatement ; « Plus tard » → l'encart ne revient pas pendant la séance.
- [ ] **7.13** Une consigne à une seule série n'affiche **pas** « Repos 0 s ».
- [ ] **7.14** Sauter un exercice (menu ⋮). → Pointillés dans la frise, « Sauté » sur la carte.
- [ ] **7.15** « Terminer » → confirmation demandée.

## 8. Fin de séance (M10)

- [ ] **8.1** Vue 1 : séance terminée, records (ou « Références posées : N » la première fois ; section masquée sans record).
- [ ] **8.2** Vue 2 : liste des exercices, chacun ouvre sa page.
- [ ] **8.3** Vue 3 : bilan du test (« Nouveau repère » pour un test, jamais « record »), prochaine séance, ressenti, notes.
- [ ] **8.4** Corrige une série avant d'enregistrer. → Tonnage et records suivent.
- [ ] **8.5** 🍏 **Fermeture en attente d'enregistrement** : ferme l'app (balayage) **avant** « Enregistrer », rouvre. → L'Accueil propose « Terminer l'enregistrement » ; rien n'est perdu ; tu peux quand même démarrer une autre séance si besoin.
- [ ] **8.6** « Enregistrer ». → La séance passe en lecture seule ; Planning = Faite ; Mois et résumé comptent la séance ; l'objectif concerné (test) montre le nouveau résultat.

---

## 9. Fiche exercice

- [ ] **9.1** Plus > Exercices > Squat barre : zone, mouvement, matériel, groupe (Quadriceps) ; Mes performances ; section Cadre de progression.
- [ ] **9.2** Le bouton de retour dit « ← Exercices » et ramène à la liste avec les filtres conservés.
- [ ] **9.3** Médias : la photo s'affiche ; 🍏 si l'exercice a une vidéo, elle se lit **dans** la page (pas en plein écran forcé) et sans son intempestif.

---

## 10. Plus (M11)

- [ ] **10.1** Entrées : Mon profil, Exercices, Routines du soir, Protocoles de tests ; puis Réglages, Sauvegarde, À propos. → **Pas** de « Statistiques » (retiré au lot N).
- [ ] **10.2** Mon profil : date de naissance complète → âge affiché ; profil vide → « Ajouter mes informations ».
- [ ] **10.3** Réglages > Thème : **Clair** par défaut. Passe en **Sombre** : parcours Accueil, Planning Mois, un objectif, Séances, une séance en cours, fin de séance. → Aucun texte illisible, aucune zone restée blanche.
- [ ] **10.4** 🍏 Thème **Auto** : bascule le mode sombre de l'iPhone (Centre de contrôle). → L'app suit sans redémarrer. Remets ensuite Clair (ou ton choix).
- [ ] **10.5** Réglages > son du minuteur, repos de la séance libre (90 s par défaut) : modifiables, conservés après fermeture de l'app.
- [ ] **10.6** Routines du soir : les 3 routines, leur contenu, la rotation.
- [ ] **10.7** Protocoles de tests : les 7 protocoles, consignes, résultats, « tests à replanifier ».
- [ ] **10.8** Sauvegarde : date du dernier export affichée après 0.1.
- [ ] **10.9** Anciennes adresses : si tu as un favori vers `/progression` ou `/historique`, il ouvre Planning > Mois.

---

## 11. Gestes destructifs — facultatifs, après l'export 0.1

- [ ] **11.1** Plus > Sauvegarde > Importer : choisis la sauvegarde de 0.1 dans Fichiers. → « Le fichier … est valide : export du …, N séances » ; Continuer → confirmation « Remplacer » ; l'app redémarre avec **exactement** les mêmes données.
- [ ] **11.2** 🍏 Le sélecteur de fichiers iOS s'ouvre sur Fichiers / iCloud et accepte le `.json`.
- [ ] *(Ne pas faire « Effacer toutes les données » sauf si tu veux vraiment repartir de zéro.)*

---

## 12. Clôture

- [ ] **12.1** Nouvel export (Plus > Sauvegarde) envoyé sur le PC : je le compare à la sauvegarde de départ (0.1) — seules les séances et mesures faites pendant la recette doivent différer — et j'explique `hash7` et `storeHashes`.
- [ ] **12.2** Me transmettre la liste des écarts (numéros). Je corrige, puis version **1.0.0**.
