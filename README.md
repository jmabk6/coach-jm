# Coach JM

Nouvelle application PWA de suivi sportif, construite depuis zéro.

## Principes V1

- programme prédéfini mais flexible ;
- séparation stricte entre **prévu**, **réalisé** et **analysé** ;
- historique des séances réalisé sous forme de snapshots immuables ;
- progression mesurable en musculation, cardio, traction, souplesse et tronc ;
- export futur exploitable par un coach ;
- stockage local IndexedDB dans la V1.

## Base IndexedDB V1

Collections :

- `exercises`
- `workoutTemplates`
- `plannedWorkouts`
- `workoutSessions`
- `goals`
- `assessments`
- `recommendations`
- `settings`
- `meta`

## Lancer localement

Le projet utilise les modules JavaScript et un service worker. Il doit être servi en HTTP(S), pas ouvert directement en `file://`.

Exemple :

```bash
python -m http.server 8000
```

Puis ouvrir `http://localhost:8000/`.

## GitHub Pages

Une fois les fichiers déposés dans la branche `main`, activer GitHub Pages depuis **Settings → Pages → Deploy from a branch → main / root**.
