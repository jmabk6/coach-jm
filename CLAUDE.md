# COACH-JM — consignes pour Claude

Application de sport pour iPhone (PWA React + TypeScript + Vite, données Dexie dans le téléphone). Utilisateur : JM, qui s'en sert à chaque séance.

## Parler avec JM

- **Toujours en français.**
- **Une chose à la fois** : une question ou une recommandation par message, quelques lignes, des mots simples, sans jargon. Les détails techniques seulement s'il les demande.

## Où sont les choses

- **Le coffre Obsidian du projet** : `COFFRE_COACH-JM/` (exclu de git, sauvegardé chaque jour dans Google Drive). Specs dans `2-SPECS/`, plans et suivi dans `3-SUIVI/`, captures dans `4-CAPTURES/`, audits dans `5-AUDITS/`. Les nouvelles specs, plans et maquettes vont dans ce coffre, jamais dans le dépôt.
- **Les sauvegardes réelles de l'iPhone** : `C:\Users\JMA\Downloads\coach-jm-sauvegarde-*.json`. Des tests les lisent à cet endroit : **ne jamais les déplacer ni les supprimer.**
- **En ligne** : un push sur `main` déclenche `.github/workflows/deploy.yml` (GitHub Pages) et met à jour l'application de l'iPhone.

## Règles fermes

- **Travailler directement dans `C:\Users\JMA\COACH-JM`**, sur `main`. Pas de copie de travail dans le dossier temporaire (Windows le vide). Lire `git status` avant chaque commit et ajouter les fichiers par leur nom.
- **Aucun commit sans l'accord de JM.**
- **Aucun push sans les deux : le feu vert de JM ET sa confirmation que la sauvegarde de l'iPhone est à jour**, même sans changement de structure de la base. « Pas de séance depuis la dernière sauvegarde » vaut confirmation. Relire `git show --stat` avant de pousser (une suppression inattendue peut casser le déploiement).
- **superpowers** : rien dans `docs/superpowers/`, pas de commit automatique, ni branche, ni worktree, ni fusion sans accord.

## Vérifier avant de passer la main à JM

- **Tout ce qui se teste sur PC, je le teste moi-même** dans le navigateur intégré, à 375 px de large, par les vrais gestes (clics, formulaires, navigation, rechargement). Je ne laisse à JM qu'une liste iPhone **courte**, limitée à ce qui est propre à iOS (mise à jour de l'app installée, écran verrouillé, clavier, zoom, geste de retour, rendu Safari).
- **Le contrôle visuel final se fait sur le build de production** (`npm run build` puis `vite preview`), pas seulement sur le serveur de dev : l'ordre du CSS diffère. Toute surcharge d'une classe partagée s'écrit en sélecteur composé (`.today-card.body-card`).
- **Rythme des tests** : pendant une étape, une passe sans sauvegarde + une passe avec la sauvegarde la plus récente, plus lint et tsc. **Avant chaque push** : passes complètes (sans sauvegarde, puis avec chaque sauvegarde de Téléchargements), lint, tsc et build. Donner un point d'avancement court pendant les attentes.
- Les certificats de recette iPhone (`.certs/`, ignorés par git) ont disparu au rangement du 01/11/2026 : les recréer la première fois qu'il faut tester sur l'iPhone en réseau local.
