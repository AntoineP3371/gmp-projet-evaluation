// Chaque encadrant ne voit que les commentaires, événements et entrées de journal des projets
// qu'il encadre (admin : tout). La règle PocketBase compare `enc_keys ~ @request.auth.login_key` ;
// ce champ est calculé ICI, côté serveur, et écrase toujours ce que le client enverrait.

// -- création / modification d'un commentaire, d'un événement ou d'une entrée de journal --
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/enc-scope-lib.js`);
  if (!lib.canWrite(e.record, e.auth, e.hasSuperuserAuth())) throw new ForbiddenError("Vous n'encadrez pas ce projet.");
  e.record.set("enc_keys", lib.keysFor(e.record));
  e.next();
}, "sae_comments", "sae_journal", "sae_events");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/enc-scope-lib.js`);
  if (!lib.canWrite(e.record, e.auth, e.hasSuperuserAuth())) throw new ForbiddenError("Vous n'encadrez pas ce projet.");
  e.record.set("enc_keys", lib.keysFor(e.record));
  e.next();
}, "sae_comments", "sae_journal", "sae_events");

// -- changement de roster d'un projet : recalcule les clés de tout ce qui s'y rattache --
onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/enc-scope-lib.js`);
  const before = e.record.original().get("enc_keys") || "";
  const after = e.record.get("enc_keys") || "";
  e.next();
  if (before === after) return;
  const slug = e.record.get("slug");
  for (const name of ["sae_comments", "sae_journal"]) {
    for (const r of $app.findRecordsByFilter(name, "project = {:s}", "", 0, 0, { s: slug })) lib.setKeys(name, r.id, after);
  }
  for (const ev of $app.findRecordsByFilter("sae_events", "", "", 0, 0)) {
    if (lib.jsonField(ev, "projets", []).includes(slug)) lib.setKeys("sae_events", ev.id, lib.keysFor(ev));
  }
}, "sae_projects");

// -- (re)calcul global, réservé au superutilisateur : remplissage initial et resynchronisation --
routerAdd("POST", "/enc-scope/backfill", (e) => {
  if (!e.hasSuperuserAuth()) return e.json(403, { error: "réservé au superutilisateur" });
  const lib = require(`${__hooks}/enc-scope-lib.js`);
  const result = {};
  for (const name of lib.SCOPED) {
    let changed = 0, total = 0, empty = 0;
    for (const r of $app.findRecordsByFilter(name, "", "", 0, 0)) {
      total++;
      const keys = lib.keysFor(r);
      if (!keys || keys === "||") empty++;
      if ((r.get("enc_keys") || "") !== keys) { lib.setKeys(name, r.id, keys); changed++; }
    }
    result[name] = { total, changed, sansEncadrant: empty };
  }
  return e.json(200, result);
});
