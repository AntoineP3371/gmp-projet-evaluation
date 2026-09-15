# Carnet SAE GMP — déploiement GitHub Pages + PocketBase

Deux pages statiques partageant un même backend PocketBase :

- `index.html` — espace **encadrants** : consultation, saisie des notes (code par projet), mode admin (référentiel, import Excel).
- `eleves.html` — espace **étudiants** : consultation seule, aucune option d'écriture.

Les deux lisent/écrivent dans la même base PocketBase, en temps réel.

⚠️ **Important sur la sécurité** : sans compte étudiant, il n'y a pas d'authentification réelle. Le code d'écriture par projet est une protection *au niveau de l'application* (vérifiée par le JavaScript de la page), pas une règle de sécurité côté serveur — un visiteur technique pourrait théoriquement écrire directement dans PocketBase en contournant l'interface. C'est un compromis raisonnable pour un usage interne entre encadrants, mais ce n'est pas un coffre-fort. Le bouton "Supprimer" n'existe volontairement pas dans l'appli : toute suppression définitive se fait depuis le tableau de bord PocketBase (protégé par votre compte superutilisateur).

## 1. Installer PocketBase sur le Raspberry Pi

```bash
# Sur le Raspberry Pi (adapter l'architecture : arm64 pour un Pi 64-bit récent)
mkdir ~/pocketbase && cd ~/pocketbase
wget https://github.com/pocketbase/pocketbase/releases/latest/download/pocketbase_<version>_linux_arm64.zip
unzip pocketbase_*.zip
./pocketbase serve --http=0.0.0.0:8090
```

Créez un compte superutilisateur au premier lancement (invite dans le terminal, ou `./pocketbase superuser create <email> <mot-de-passe>`). Pensez à lancer PocketBase comme service (`systemd`) pour qu'il survive aux redémarrages.

## 2. Exposer PocketBase en HTTPS

GitHub Pages est servi en HTTPS ; un navigateur bloque les requêtes vers une API en `http://` depuis une page en `https://` (contenu mixte). Deux options simples :

- **Cloudflare Tunnel** (le plus simple, pas de port forwarding ni d'IP fixe nécessaire) : `cloudflared tunnel --url http://localhost:8090`, ou un tunnel nommé avec votre propre sous-domaine.
- **Reverse proxy Caddy** avec un nom de domaine pointant vers votre IP (port 8090 redirigé) : Caddy obtient un certificat Let's Encrypt automatiquement.

Notez l'URL HTTPS publique obtenue (ex. `https://sae-gmp.example.com`).

## 3. Créer les collections

Dans le tableau de bord PocketBase (`<votre-url>/_/`) → **Collections** → **New collection**.

### Collection `projects` (type Base)
| Champ | Type | Options |
|---|---|---|
| `slug` | Text | requis, **unique** |
| `nom` | Text | requis |
| `sujet` | Text | |
| `formation` | Text | |
| `parcours` | Text | |
| `etudiants` | JSON | |
| `encadrants` | JSON | |
| `codes` | JSON | |
| `archived` | Bool | |
| `evals` | JSON | |
| `individualisation` | JSON | |

**Règles API** (onglet *API Rules*) :
- List/Search : *(vide → public)*
- View : *(vide → public)*
- Create : *(vide → public)*
- Update : *(vide → public)*
- Delete : laisser sur **superutilisateur uniquement** (icône verrou / champ non renseigné dans les versions récentes = admin only)

### Collection `config` (type Base)
| Champ | Type | Options |
|---|---|---|
| `key` | Text | requis, **unique** |
| `value` | JSON | |

Mêmes règles API que `projects` (List/View/Create/Update publics, Delete admin uniquement).

## 4. CORS

Dans **Settings → Application** (ou **Settings → CORS** selon la version), ajoutez l'origine de votre site GitHub Pages, par ex. `https://<votre-compte>.github.io`.

## 5. Importer les données de départ

Pour chaque collection, menu **⋮ → Import records**, sélectionnez :
- `seed-projects.json` pour `projects` (24 projets réels, issus de votre Excel).
- `seed-referentiel.json` pour `config` (référentiel complet C1→C5, vérifié contre votre barème).

Le code administrateur n'est **pas** pré-rempli : la première personne qui clique sur "Activer" le mode administrateur dans l'appli en choisit un.

## 6. Configurer le site

Éditez `config.js` et remplacez `PB_URL` par l'URL HTTPS obtenue à l'étape 2.

## 7. Publier sur GitHub Pages

Poussez le contenu de ce dossier (`index.html`, `eleves.html`, `style.css`, `config.js`) à la racine d'un dépôt GitHub, puis **Settings → Pages → Deploy from branch**. Vous obtenez deux liens à partager :

- `https://<compte>.github.io/<repo>/index.html` — **aux encadrants**.
- `https://<compte>.github.io/<repo>/eleves.html` — **aux étudiants**.

Rien n'empêche techniquement un étudiant curieux de deviner l'URL `index.html` — la séparation est une commodité de partage, la vraie protection reste le code par projet.
