# Carnet SAE GMP — déploiement GitHub Pages + PocketBase

Deux pages statiques partageant un même backend PocketBase :

- `encadrants-<suffixe>.html` — espace **encadrants** : consultation, saisie des notes et des commentaires, calendrier, accès étudiants, et mode administrateur (référentiel, import Excel, gestion des projets, des encadrants, journal). Son nom contient un suffixe aléatoire volontairement non documenté ici ; il est marqué `noindex`.
  - **Connexion unique par compte** : à l'ouverture, une fenêtre invite l'encadrant à choisir son nom et à saisir son code (comptes PocketBase `sae_users`, le SHA-256 du code sert de mot de passe, code provisoire à changer à la première connexion). La connexion ne vit que le temps de l'onglet et se verrouille seule après 20 minutes d'inactivité (postes partagés).
  - **Chacun ne voit que ses projets** (ceux dont il est encadrant, même masqués aux étudiants). Le compte administrateur voit et modifie tout en activant le « Mode administrateur » ; hors de ce mode, il ne voit que ses propres projets.
  - **Panneau « Accès étudiants »** (repliable) dans chaque projet : lien personnel du projet (régénérable), mot de passe saisi par l'encadrant (visible de tous les encadrants du projet, avec son auteur et sa date) et descriptif affiché aux étudiants. Un projet décoché « visible étudiants » est signalé « masqué » ; seul l'administrateur peut changer ce réglage.
  - Le lien « Mes prochaines évaluations » ouvre un calendrier mensuel des évaluations de ses projets (non archivés, visibles) ; le « + » d'une case ajoute un événement (date, intitulé, projets concernés) qui apparaît sur la frise de ces projets. Le bouton « Abonnement au calendrier » génère un lien personnel iCalendar (`.ics`), à ajouter une fois dans Google Calendar, Outlook, Apple Calendar ou Zimbra ; il se resynchronise tout seul (jeton régénérable si partagé par erreur).
- `etudiant.html` — espace **étudiants**, consultation seule. Deux entrées : la liste des projets (cartes classées par parcours, une couleur par parcours, badge Apprentissage / Formation initiale, descriptif) ou le lien personnel `?p=<jeton>` donné par l'encadrant. Dans les deux cas, l'étudiant saisit le **mot de passe du projet** et voit la vue collective de son seul projet (notes, commentaires, frise). Pas de temps réel : la page se rafraîchit toute seule toutes les 3 minutes. (`eleves.html`, ancien nom, redirige vers cette page.)
- `guide-encadrants.pdf` — guide de démarrage (3 pages) proposé par le lien « Guide » de la page encadrants. Version publique volontairement **sans l'adresse** de la page encadrants ; à régénérer quand l'interface change.
- `index.html` — redirection vers `etudiant.html` (adresse racine du site).

## Sécurité (modèle actuel)

L'accès aux données est contrôlé **côté serveur** (règles PocketBase + hooks), pas seulement par le JavaScript des pages :

- **Anonyme** : rien n'est lisible dans `sae_projects`, `sae_comments`, `sae_journal`, `sae_events`, `sae_users`. Seuls restent publics le référentiel (`sae_config`), la liste des noms de comptes pour la fenêtre de connexion (`GET /enc/names`) et la liste des projets proposée aux étudiants (`GET /etu/list` : nom, parcours, descriptif, jeton ; jamais de contenu). Aucune écriture sans compte.
- **Encadrant** : lit et écrit uniquement ce qui concerne ses projets (`enc_keys ~ login_key`). Il ne peut pas modifier le nom, le parcours, la formation, les étudiants, l'année, les encadrants, l'archivage ni la visibilité d'un projet (réservé à l'administrateur). Chaque commentaire, événement et note est signé du nom du compte ; un hook refuse (403) toute écriture de commentaire, de journal ou d'événement sur un projet qu'il n'encadre pas.
- **Administrateur** (`admin = true`) : tout lire et écrire.
- **Étudiants** : aucun accès direct à l'API. Ils passent par `POST /etu/unlock` (jeton de projet + mot de passe), qui renvoie uniquement les données de ce projet.
- **Mots de passe de projet** : stockés **en clair** dans `sae_project_pw` (fermée à tout sauf superutilisateur), car les encadrants du projet doivent pouvoir les relire et les transmettre. Ils sont choisis avec les étudiants et partagés par toute l'équipe : ils protègent une consultation de notes, pas un secret.
- **Limitation de débit** : 30 tentatives de connexion par minute et par IP, 60 déverrouillages étudiants par minute et par IP. L'IP réelle est lue dans l'en-tête `CF-Connecting-IP` du tunnel Cloudflare.
- **Journal** (`sae_journal`) : ajout seul, le serveur refuse toute modification ou suppression ; l'onglet « Journal » du mode administrateur signale les valeurs changées sans trace (écriture directe dans la base).
- **Suppressions** : aucun bouton « Supprimer » dans l'appli pour les projets et les encadrants ; toute suppression définitive se fait depuis le tableau de bord PocketBase (compte superutilisateur).
- **Limites assumées** : les noms de projets et leurs jetons sont publics (`/etu/list`) pour éviter de distribuer un lien par équipe ; le dépôt est public, le suffixe de la page encadrants évite seulement de tomber dessus par hasard.

## Côté PocketBase — déjà fait ✓

Instance **dédiée** à ce projet (`https://api_evalprojet.gmpbordeaux.fr`, PocketBase 0.40.3), sur un Raspberry Pi, séparée des autres projets (processus, port, base indépendants). Exposée en HTTPS par un tunnel Cloudflare, vérifiable via `/api/health`. CORS ouvert par défaut dans cette version.

- **Collections** : `sae_projects` (nom, sujet = descriptif, formation, parcours, annee, etudiants, encadrants, `enc_keys` = appartenance des encadrants maintenue par l'application, `etu_token` = jeton du lien étudiants, archived, visible_eleves, evals, individualisation, presence), `sae_project_pw` (project, password, author, created), `sae_comments` (fil par livrable : project, sem, item, author, text, parent, deleted_by), `sae_journal` (project, sem, cle, avant, apres, author), `sae_events` (date, titre, projets = liste de slugs, author, deleted_by), `sae_users` (comptes : name, login = nom normalisé, login_key, admin, must_change, ics_token), `sae_config` (key unique, value : le référentiel). `sae_comments`, `sae_journal` et `sae_events` portent aussi un champ `enc_keys`, calculé par le serveur. `sae_encadrants` est l'ancienne collection de codes, fermée (superutilisateur seul), conservée pour mémoire.
- **Hooks serveur** (`pb_hooks/*.pb.js` sur le Pi, hors dépôt) :
  - `ics.pb.js` : `GET /ics/<jeton>[.ics]`, flux iCalendar personnel (servi aussi sur `agenda.gmpbordeaux.fr`, nom d'hôte sans tiret bas, exigé par Zimbra, Google Agenda et iOS).
  - `etu-access.pb.js` : `GET /etu/list`, `POST /etu/unlock`, `GET /etu/access-info/{slug}` et `POST /etu/set-password` (ces deux dernières réservées aux encadrants du projet et à l'administrateur).
  - `enc-names.pb.js` : `GET /enc/names`, noms des comptes pour la fenêtre de connexion.
  - `enc-scope.pb.js` (+ `enc-scope-lib.js`) : calcule `enc_keys`, refuse les écritures hors de ses projets, recalcule tout quand l'équipe d'un projet change, et `POST /enc-scope/backfill` (superutilisateur) pour resynchroniser.
- **Pièges connus des hooks** (moteur JavaScript goja) : le corps d'une requête se lit avec `new DynamicModel({...})` + `e.bindBody()`, jamais `JSON.parse(e.request.body)` ; les fonctions d'un fichier ne sont pas visibles dans les callbacks (dupliquer ou `require`) ; un champ JSON lu par `record.get()` peut arriver sous forme d'octets UTF-8 à décoder ; une erreur dans un callback empêche toutes les routes du fichier de s'enregistrer (404 trompeur).
- **Sauvegardes** : automatiques deux fois par jour sur le Pi.
- **Données** : `seed-projects.json` / `seed-referentiel.json` conservés pour mémoire ou re-seed.
- **Comptes** : un compte par encadrant (`sae_users`), créé par l'administrateur avec un code provisoire à remettre à l'intéressé ; l'administrateur est le compte marqué `admin`.

## Configurer le site

`config.js` pointe sur `https://api_evalprojet.gmpbordeaux.fr`. À modifier seulement si l'instance PocketBase change.

## Publier sur GitHub Pages

Poussez le contenu de ce dossier (pages HTML, `app-common.js`, `style.css`, `config.js`, images, PDF) à la racine du dépôt ; **Settings → Pages → Deploy from branch**. Deux liens à partager :

- `https://<compte>.github.io/<repo>/encadrants-<suffixe>.html` — **aux encadrants uniquement** (à communiquer directement, sans la publier).
- `https://<compte>.github.io/<repo>/` (redirige vers `etudiant.html`) — **aux étudiants**.

Le numéro de version (`?v=` des feuilles de style, étiquette « vX.YY » des pages) est à incrémenter à chaque publication pour forcer le rechargement des fichiers.
