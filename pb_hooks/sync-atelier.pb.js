// Route serveur-à-serveur pour l'application Atelier GMP (synchro des étudiants). Protégée par un secret
// partagé dans l'en-tête X-Sync-Secret ; le secret est lu dans la variable d'environnement SAE_SYNC_SECRET
// du service (jamais dans le dépôt). Sans secret configuré, la route répond 503.

// -------- synchro : étudiants et encadrants par projet visible --------
routerAdd("GET", "/etu/sync", (e) => {
  const secret = $os.getenv("SAE_SYNC_SECRET");
  if (!secret) return e.json(503, { error: "synchronisation non configurée" });
  const given = e.request.header.get("X-Sync-Secret") || "";
  if (!$security.equal(given, secret)) return e.json(403, { error: "secret invalide" });

  const lib = require(`${__hooks}/enc-scope-lib.js`);
  const projects = $app.findRecordsByFilter("sae_projects", "archived = false && visible_eleves = true && etu_token != ''", "nom", 0, 0);
  return e.json(200, {
    projects: projects.map((p) => ({
      slug: p.get("slug"),
      nom: p.get("nom"),
      token: p.get("etu_token"),
      annee: p.get("annee"),
      formation: p.get("formation"),
      parcours: p.get("parcours"),
      etudiants: lib.jsonField(p, "etudiants", []),
      encadrants: lib.jsonField(p, "encadrants", []),
    })),
  });
});
