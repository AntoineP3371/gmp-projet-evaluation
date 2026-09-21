# Carnet SAE GMP — déploiement GitHub Pages + PocketBase

Deux pages statiques partageant un même backend PocketBase :

- `encadrants-<suffixe>.html` — espace **encadrants** : consultation, saisie des notes (un code d'écriture par encadrant, valable sur tous ses projets), mode admin (référentiel, import Excel). **Connexion unique par compte** : à l'ouverture, une fenêtre invite l'encadrant à choisir son nom et saisir son code (le même pour tous ses projets ; comptes PocketBase `sae_users`, le SHA-256 du code sert de mot de passe, code provisoire à changer à la première connexion, mode administrateur réservé au compte administrateur) ; tous les projets où il est inscrit sont alors débloqués à son nom, les autres restent en lecture seule. La connexion ne vit que le temps de l'onglet et se verrouille seule après 20 minutes d'inactivité (postes partagés). Le lien « Mes prochaines évaluations » (colonne de gauche) ouvre un calendrier mensuel des évaluations de ses projets (non archivés, visibles) ; un clic sur une étiquette ouvre le livrable, et le « + » d'une case ajoute un événement (date, intitulé, projets concernés) qui apparaît sur la frise de ces projets. Son nom contient un suffixe aléatoire volontairement non documenté ici ; il est marqué `noindex`.
- `etudiant.html` — espace **étudiants** : consultation seule, aucune option d'écriture. (`eleves.html`, ancien nom, redirige vers cette page pour ne pas casser les favoris.)
- `guide-encadrants.pdf` — guide de démarrage (3 pages) proposé en téléchargement par le lien « Guide » de la page encadrants. Version publique volontairement **sans l'adresse** de la page encadrants ; à régénérer quand l'interface change.
- `index.html` — simple redirection vers `etudiant.html` (adresse racine du site).

Les deux lisent/écrivent dans la même base PocketBase, en temps réel.

⚠️ **Important sur la sécurité** : sans compte étudiant, il n'y a pas d'authentification réelle. Le code d'écriture par encadrant est une protection *au niveau de l'application* (vérifiée par le JavaScript de la page), pas une règle de sécurité côté serveur — un visiteur technique pourrait théoriquement écrire directement dans PocketBase en contournant l'interface. C'est un compromis raisonnable pour un usage interne entre encadrants, mais ce n'est pas un coffre-fort. Le bouton "Supprimer" n'existe volontairement pas dans l'appli pour les projets et les encadrants : toute suppression définitive se fait depuis le tableau de bord PocketBase (protégé par votre compte superutilisateur) — "Réinitialiser le code" dans l'appli efface seulement le code (la fiche encadrant reste, sans code utilisable).

## Côté PocketBase — déjà fait ✓

Depuis le 2026-09-17, ce projet a sa **propre instance PocketBase dédiée** (`https://api_evalprojet.gmpbordeaux.fr`), sur le même Raspberry Pi que le projet "Réalité augmentée des objets" mais totalement séparée (processus, port, base de données indépendants) — plus de collections partagées. Guide RA utilise désormais `https://api_guidera.gmpbordeaux.fr`.

- **HTTPS public** : exposé via un tunnel Cloudflare (route dédiée sur ce domaine), vérifié via `/api/health`.
- **Collections** `sae_projects` (nom, sujet, formation, parcours, annee, etudiants, encadrants, codes *(hérité, non utilisé — voir `sae_encadrants`)*, archived, evals, individualisation, presence, visible_eleves), `sae_config` (key unique, value), `sae_comments` (fil de discussion par livrable : project, sem, item, author, text, parent, deleted_by ; règles publiques, suppression réservée au superutilisateur, horodatage `created`/`updated` fourni par le serveur) `sae_journal` (journal des modifications de notes, de dates et de notes individuelles : project, sem, cle, avant, apres, author, horodatage serveur ; ajout seul, le serveur refuse toute modification ou suppression ; consulté dans l'onglet « Journal » du mode administrateur, qui signale les valeurs changées sans trace, c'est-à-dire par écriture directe dans la base) `sae_users` (comptes des encadrants : name, login = nom normalisé, login_key, admin, must_change ; visibles seulement de leur titulaire et de l'administrateur) et un champ `enc_keys` sur `sae_projects` (appartenance des encadrants, maintenu par l'application) `sae_events` (événements ajoutés par les encadrants depuis le calendrier : date, titre, projets = liste de slugs, author, deleted_by ; affichés sur la frise des projets concernés ; mêmes règles que les commentaires) et `sae_encadrants` (nom unique, hash — un code d'écriture par encadrant, partagé sur tous ses projets), avec règles API List/View/Create/Update publiques et Delete réservé au superutilisateur.
- **CORS** : PocketBase 0.40.3 autorise les requêtes cross-origin par défaut (aucun réglage dédié dans cette version) — vérifié en conditions réelles depuis un domaine tiers, ça fonctionne sans rien configurer.
- **Données** : le référentiel complet et les 24 projets réels sont chargés dans la base (`seed-projects.json` / `seed-referentiel.json` conservés ici pour mémoire/re-seed, mais l'import a été fait via l'API PocketBase directement — le tableau de bord de cette version n'expose pas de bouton "Import" en évidence).
- **Code administrateur** : volontairement **non pré-rempli** — la première personne qui clique sur "Activer" le mode administrateur dans l'appli en choisit un.

## Configurer le site

`config.js` pointe déjà sur `https://api_evalprojet.gmpbordeaux.fr`. Rien à faire ici sauf si vous changez d'instance PocketBase un jour.

## Publier sur GitHub Pages

Poussez le contenu de ce dossier (pages HTML, `app-common.js`, `style.css`, `config.js`) à la racine d'un dépôt GitHub, puis **Settings → Pages → Deploy from branch**. Vous obtenez deux liens à partager :

- `https://<compte>.github.io/<repo>/encadrants-<suffixe>.html` — **aux encadrants uniquement** (adresse à communiquer directement, sans la publier).
- `https://<compte>.github.io/<repo>/` (redirige vers `etudiant.html`) — **aux étudiants**.

Rien n'empêche techniquement un étudiant déterminé de retrouver le nom de la page encadrants (le dépôt est public) — le suffixe aléatoire évite seulement de tomber dessus par hasard ; la vraie protection reste le code par encadrant.
