// Liste des noms d'encadrants pour le sélecteur de connexion (modal "Connexion").
// Public, volontairement : juste des noms (ceux qui ont un compte sae_users), aucune donnée
// de projet, d'étudiant ou de note. Nécessaire depuis que sae_projects n'est plus listable
// sans être connecté (v0.62) : sans cette route, impossible de choisir son nom pour se connecter.
routerAdd("GET", "/enc/names", (e) => {
  const users = $app.findRecordsByFilter("sae_users", "", "name", 0, 0);
  return e.json(200, users.map((u) => u.get("name")));
});
