# Carnet SAE GMP — déploiement GitHub Pages + PocketBase

Deux pages statiques partageant un même backend PocketBase :

- `index.html` — espace **encadrants** : consultation, saisie des notes (code par projet), mode admin (référentiel, import Excel).
- `eleves.html` — espace **étudiants** : consultation seule, aucune option d'écriture.

Les deux lisent/écrivent dans la même base PocketBase, en temps réel.

⚠️ **Important sur la sécurité** : sans compte étudiant, il n'y a pas d'authentification réelle. Le code d'écriture par projet est une protection *au niveau de l'application* (vérifiée par le JavaScript de la page), pas une règle de sécurité côté serveur — un visiteur technique pourrait théoriquement écrire directement dans PocketBase en contournant l'interface. C'est un compromis raisonnable pour un usage interne entre encadrants, mais ce n'est pas un coffre-fort. Le bouton "Supprimer" n'existe volontairement pas dans l'appli : toute suppression définitive se fait depuis le tableau de bord PocketBase (protégé par votre compte superutilisateur).

## Côté PocketBase — déjà fait ✓

Tout ce qui suit a été réalisé directement sur `https://api.gmpbordeaux.fr` (l'instance déjà en place pour le projet "Réalité augmentée des objets", réutilisée telle quelle) :

- **HTTPS public** : déjà exposé sur ce domaine, vérifié via `/api/health`.
- **Collections** `sae_projects` (11 champs : slug unique, nom, sujet, formation, parcours, etudiants, encadrants, codes, archived, evals, individualisation) et `sae_config` (key unique, value) créées, avec règles API List/View/Create/Update publiques et Delete réservé au superutilisateur — sans toucher aux collections existantes du projet RA (`users`, `anchors`, `machines`, etc.).
- **CORS** : PocketBase 0.40.3 autorise les requêtes cross-origin par défaut (aucun réglage dédié dans cette version) — vérifié en conditions réelles depuis un domaine tiers, ça fonctionne sans rien configurer.
- **Données** : le référentiel complet et les 24 projets réels sont chargés dans la base (`seed-projects.json` / `seed-referentiel.json` conservés ici pour mémoire/re-seed, mais l'import a été fait via l'API PocketBase directement — le tableau de bord de cette version n'expose pas de bouton "Import" en évidence).
- **Code administrateur** : volontairement **non pré-rempli** — la première personne qui clique sur "Activer" le mode administrateur dans l'appli en choisit un.

## Configurer le site

`config.js` pointe déjà sur `https://api.gmpbordeaux.fr`. Rien à faire ici sauf si vous changez d'instance PocketBase un jour.

## Publier sur GitHub Pages

Poussez le contenu de ce dossier (`index.html`, `eleves.html`, `style.css`, `config.js`) à la racine d'un dépôt GitHub, puis **Settings → Pages → Deploy from branch**. Vous obtenez deux liens à partager :

- `https://<compte>.github.io/<repo>/index.html` — **aux encadrants**.
- `https://<compte>.github.io/<repo>/eleves.html` — **aux étudiants**.

Rien n'empêche techniquement un étudiant curieux de deviner l'URL `index.html` — la séparation est une commodité de partage, la vraie protection reste le code par projet.
