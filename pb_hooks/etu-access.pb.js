// Accès étudiants par lien + mot de passe de projet.
// sae_projects/sae_comments/sae_events/sae_journal sont réservés aux encadrants connectés ;
// les étudiants ne passent plus que par ces routes, qui contournent les règles via $app.
//
// Note : les fonctions utilitaires sont dupliquées dans chaque callback routerAdd plutôt que
// déclarées une fois en haut du fichier, car PocketBase ne les rend pas visibles depuis
// l'intérieur des callbacks sinon (constaté empiriquement, cf. ics.pb.js).

// -------- jeton d'accès étudiants : garanti pour tout projet --------
// Sans jeton, un projet n'apparaît ni dans la liste étudiante ni via son lien : on en pose un
// à la création (import Excel, ajout manuel, tableau de bord) et, au démarrage du service,
// pour les projets déjà créés sans. Écriture SQL directe : ne modifie pas `updated`.
onRecordCreateRequest((e) => {
  if (!e.record.get("etu_token")) e.record.set("etu_token", $security.randomStringWithAlphabet(48, "0123456789abcdef"));
  e.next();
}, "sae_projects");

onBootstrap((e) => {
  e.next();
  try {
    for (const p of $app.findRecordsByFilter("sae_projects", "etu_token = ''", "", 0, 0)) {
      $app.db().newQuery("UPDATE sae_projects SET etu_token = {:t} WHERE id = {:id}")
        .bind({ t: $security.randomStringWithAlphabet(48, "0123456789abcdef"), id: p.id }).execute();
    }
  } catch (err) { console.log("jetons etudiants : rattrapage impossible", err); }
});

// -------- liste des projets (nom + jeton) pour la page d'accueil étudiants --------
// Expose volontairement les noms de projets (pas leur contenu) : permet de proposer un bouton
// par projet plutôt que d'obliger à distribuer un lien unique par équipe. Le mot de passe reste
// la seule protection du contenu.
routerAdd("GET", "/etu/list", (e) => {
  const projects = $app.findRecordsByFilter("sae_projects", "archived = false && visible_eleves = true && etu_token != ''", "nom", 0, 0);
  return e.json(200, projects.map((p) => ({ slug: p.get("slug"), nom: p.get("nom"), token: p.get("etu_token"), parcours: p.get("parcours"), formation: p.get("formation"), description: p.get("sujet") })));
});

// -------- déverrouillage étudiant --------
routerAdd("POST", "/etu/unlock", (e) => {
  const utf8Decode = (bytes) => {
    let out = "", i = 0;
    while (i < bytes.length) {
      const b0 = bytes[i++];
      if (b0 < 0x80) { out += String.fromCharCode(b0); }
      else if ((b0 & 0xE0) === 0xC0) { const b1 = bytes[i++] || 0; out += String.fromCharCode(((b0 & 0x1F) << 6) | (b1 & 0x3F)); }
      else if ((b0 & 0xF0) === 0xE0) { const b1 = bytes[i++] || 0, b2 = bytes[i++] || 0; out += String.fromCharCode(((b0 & 0x0F) << 12) | ((b1 & 0x3F) << 6) | (b2 & 0x3F)); }
      else if ((b0 & 0xF8) === 0xF0) { const b1 = bytes[i++] || 0, b2 = bytes[i++] || 0, b3 = bytes[i++] || 0; out += String.fromCodePoint(((b0 & 0x07) << 18) | ((b1 & 0x3F) << 12) | ((b2 & 0x3F) << 6) | (b3 & 0x3F)); }
    }
    return out;
  };
  const jsonField = (record, field, fallback) => {
    const v = record.get(field);
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "number") {
      try { return JSON.parse(utf8Decode(v)); } catch (err) { return fallback; }
    }
    return v == null ? fallback : v;
  };

  // v : version des données déjà affichées ; si rien n'a changé, la réponse est minuscule (actualisation toutes les 10 s)
  const body = new DynamicModel({ token: "", password: "", v: "" });
  try { e.bindBody(body); } catch (err) { return e.json(400, { error: "requête invalide" }); }
  const token = String(body.token || "");
  const password = String(body.password || "");
  const knownV = String(body.v || "");
  if (!token || !password) return e.json(400, { error: "requête invalide" });

  let p;
  try { p = $app.findFirstRecordByFilter("sae_projects", "etu_token = {:t} && etu_token != ''", { t: token }); }
  catch (err) { p = null; }
  if (!p || p.get("archived") || p.get("visible_eleves") === false) return e.json(404, { error: "Lien inconnu ou projet indisponible." });

  const slug = p.get("slug");

  // essais de mot de passe : 10 échecs en 10 minutes pour un même couple (adresse, projet) bloquent ce couple 10 minutes
  const failKey = "etu-fail:" + e.realIP() + ":" + token;
  const fk = $app.store().get(failKey) || { n: 0, first: 0, until: 0 };
  if (fk.until > Date.now()) return e.json(429, { error: "Trop d'essais. Réessayez dans quelques minutes." });

  let pw;
  try { pw = $app.findFirstRecordByFilter("sae_project_pw", "project = {:s}", { s: slug }); }
  catch (err) { pw = null; }
  if (!pw) return e.json(403, { error: "Aucun mot de passe défini pour ce projet. Contactez votre encadrant." });
  if (pw.get("password") !== password) {
    const now = Date.now();
    const n = (fk.first && now - fk.first < 600000 ? fk.n : 0) + 1;
    $app.store().set(failKey, n >= 10 ? { n: 0, first: 0, until: now + 600000 } : { n: n, first: (fk.first && now - fk.first < 600000 ? fk.first : now), until: 0 });
    return e.json(403, { error: "Mot de passe incorrect." });
  }
  $app.store().remove(failKey);

  // le fil "_prive" est réservé aux encadrants : jamais transmis aux étudiants
  const comments = $app.findRecordsByFilter("sae_comments", "project = {:s} && item != '_prive'", "", 0, 0, { s: slug });
  const events = $app.findRecordsByFilter("sae_events", "deleted_by = ''", "", 0, 0);
  const myEvents = events.filter((ev) => jsonField(ev, "projets", []).includes(slug));
  const journal = $app.findRecordsByFilter("sae_journal", "project = {:s}", "", 0, 0, { s: slug });

  // version des données visibles (la présence des encadrants, qui bouge toutes les 12 s, n'en fait pas partie)
  const lastUpd = (arr) => arr.reduce((m, r) => { const u = String(r.get("updated") || ""); return u > m ? u : m; }, "");
  const core = JSON.stringify([p.get("nom"), p.get("sujet"), p.get("parcours"), p.get("formation"), p.get("annee"), p.get("etudiants"), p.get("evals"), p.get("individualisation")]);
  const v = $security.md5(core + "|" + comments.length + lastUpd(comments) + "|" + myEvents.length + lastUpd(myEvents) + "|" + journal.length + lastUpd(journal));

  // lien d'abonnement au calendrier du projet : signé avec le secret du serveur et le mot de passe (changer le mot de passe le révoque)
  const secret = $os.getenv("SAE_SYNC_SECRET");
  const ics = secret ? "/etu/ics/" + token + "." + $security.hs256("ics|" + slug + "|" + password, secret) + ".ics" : "";

  if (knownV && knownV === v) return e.json(200, { unchanged: true, v: v, ics: ics });
  return e.json(200, { project: p, comments: comments, events: myEvents, journal: journal, v: v, ics: ics });
});

// -------- aide pour l'encadrant : qui/quand le mot de passe a été défini --------
routerAdd("GET", "/etu/access-info/{slug}", (e) => {
  const norm = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const utf8Decode = (bytes) => {
    let out = "", i = 0;
    while (i < bytes.length) {
      const b0 = bytes[i++];
      if (b0 < 0x80) { out += String.fromCharCode(b0); }
      else if ((b0 & 0xE0) === 0xC0) { const b1 = bytes[i++] || 0; out += String.fromCharCode(((b0 & 0x1F) << 6) | (b1 & 0x3F)); }
      else if ((b0 & 0xF0) === 0xE0) { const b1 = bytes[i++] || 0, b2 = bytes[i++] || 0; out += String.fromCharCode(((b0 & 0x0F) << 12) | ((b1 & 0x3F) << 6) | (b2 & 0x3F)); }
      else if ((b0 & 0xF8) === 0xF0) { const b1 = bytes[i++] || 0, b2 = bytes[i++] || 0, b3 = bytes[i++] || 0; out += String.fromCodePoint(((b0 & 0x07) << 18) | ((b1 & 0x3F) << 12) | ((b2 & 0x3F) << 6) | (b3 & 0x3F)); }
    }
    return out;
  };
  const jsonField = (record, field, fallback) => {
    const v = record.get(field);
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "number") {
      try { return JSON.parse(utf8Decode(v)); } catch (err) { return fallback; }
    }
    return v == null ? fallback : v;
  };

  if (!e.auth) return e.json(401, { error: "non connecté" });
  const slug = e.request.pathValue("slug");
  let p;
  try { p = $app.findFirstRecordByFilter("sae_projects", "slug = {:s}", { s: slug }); } catch (err) { p = null; }
  if (!p) return e.json(404, { error: "projet inconnu" });
  const myKey = norm(e.auth.get("name"));
  const isEnc = jsonField(p, "encadrants", []).some((n) => norm(n) === myKey);
  if (!isEnc && !e.auth.get("admin")) return e.json(403, { error: "pas encadrant de ce projet" });

  let pw;
  try { pw = $app.findFirstRecordByFilter("sae_project_pw", "project = {:s}", { s: slug }); } catch (err) { pw = null; }
  if (!pw) return e.json(200, { hasPassword: false });
  return e.json(200, { hasPassword: true, password: pw.get("password"), author: pw.get("author"), created: pw.get("created") });
});

// -------- définir / changer le mot de passe du projet (encadrant du projet) --------
routerAdd("POST", "/etu/set-password", (e) => {
  const norm = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const utf8Decode = (bytes) => {
    let out = "", i = 0;
    while (i < bytes.length) {
      const b0 = bytes[i++];
      if (b0 < 0x80) { out += String.fromCharCode(b0); }
      else if ((b0 & 0xE0) === 0xC0) { const b1 = bytes[i++] || 0; out += String.fromCharCode(((b0 & 0x1F) << 6) | (b1 & 0x3F)); }
      else if ((b0 & 0xF0) === 0xE0) { const b1 = bytes[i++] || 0, b2 = bytes[i++] || 0; out += String.fromCharCode(((b0 & 0x0F) << 12) | ((b1 & 0x3F) << 6) | (b2 & 0x3F)); }
      else if ((b0 & 0xF8) === 0xF0) { const b1 = bytes[i++] || 0, b2 = bytes[i++] || 0, b3 = bytes[i++] || 0; out += String.fromCodePoint(((b0 & 0x07) << 18) | ((b1 & 0x3F) << 12) | ((b2 & 0x3F) << 6) | (b3 & 0x3F)); }
    }
    return out;
  };
  const jsonField = (record, field, fallback) => {
    const v = record.get(field);
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "number") {
      try { return JSON.parse(utf8Decode(v)); } catch (err) { return fallback; }
    }
    return v == null ? fallback : v;
  };

  if (!e.auth) return e.json(401, { error: "non connecté" });
  const body = new DynamicModel({ slug: "", password: "" });
  try { e.bindBody(body); } catch (err) { return e.json(400, { error: "requête invalide" }); }
  const slug = String(body.slug || "");
  const password = String(body.password || "");
  if (!slug || !password) return e.json(400, { error: "requête invalide" });

  let p;
  try { p = $app.findFirstRecordByFilter("sae_projects", "slug = {:s}", { s: slug }); } catch (err) { p = null; }
  if (!p) return e.json(404, { error: "projet inconnu" });
  const myKey = norm(e.auth.get("name"));
  const isEnc = jsonField(p, "encadrants", []).some((n) => norm(n) === myKey);
  if (!isEnc && !e.auth.get("admin")) return e.json(403, { error: "pas encadrant de ce projet" });

  const author = e.auth.get("name");
  let pw;
  try { pw = $app.findFirstRecordByFilter("sae_project_pw", "project = {:s}", { s: slug }); } catch (err) { pw = null; }
  if (pw) {
    pw.set("password", password); pw.set("author", author);
    $app.save(pw);
    return e.json(200, { ok: true, author, created: pw.get("created") });
  }
  const collection = $app.findCollectionByNameOrId("sae_project_pw");
  const rec = new Record(collection);
  rec.set("project", slug); rec.set("password", password); rec.set("author", author);
  $app.save(rec);
  return e.json(200, { ok: true, author, created: rec.get("created") });
});
