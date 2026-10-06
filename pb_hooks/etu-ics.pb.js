// Calendrier (.ics) d'un projet pour ses étudiants : dates d'évaluation des livrables et événements du projet,
// jamais de notes. Le lien est donné à l'étudiant déverrouillé par POST /etu/unlock ; il porte une signature
// calculée avec SAE_SYNC_SECRET et le mot de passe du projet : changer le mot de passe révoque l'ancien lien.
routerAdd("GET", "/etu/ics/{key}", (e) => {
  const secret = $os.getenv("SAE_SYNC_SECRET");
  if (!secret) return e.string(503, "Calendrier non configuré.");

  const esc = (s) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const byteLen = (s) => { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };
  // pliage des lignes à 75 octets (RFC 5545)
  const fold = (line) => {
    if (byteLen(line) <= 75) return line;
    let out = "", rest = line;
    while (byteLen(rest) > 75) {
      let cut = 74;
      while (cut > 1 && byteLen(rest.slice(0, cut)) > 74) cut--;
      out += rest.slice(0, cut) + "\r\n ";
      rest = rest.slice(cut);
    }
    return out + rest;
  };
  const lib = require(`${__hooks}/enc-scope-lib.js`);

  let key = e.request.pathValue("key") || "";
  if (key.toLowerCase().endsWith(".ics")) key = key.slice(0, -4);
  const dot = key.lastIndexOf(".");
  const notFound = () => e.string(404, "Lien de calendrier inconnu ou révoqué. Récupérez-en un nouveau depuis la page du projet.");
  if (dot < 1) return notFound();
  const token = key.slice(0, dot), sig = key.slice(dot + 1);

  let p;
  try { p = $app.findFirstRecordByFilter("sae_projects", "etu_token = {:t} && etu_token != ''", { t: token }); }
  catch (err) { return notFound(); }
  if (p.get("archived") || p.get("visible_eleves") === false) return notFound();
  const slug = p.get("slug");
  let pw;
  try { pw = $app.findFirstRecordByFilter("sae_project_pw", "project = {:s}", { s: slug }); }
  catch (err) { return notFound(); }
  if (!$security.equal(sig, $security.hs256("ics|" + slug + "|" + String(pw.get("password") || ""), secret))) return notFound();

  // titres et affectation par défaut des livrables (référentiel)
  const itemTitres = {}, itemSemDefaut = {};
  try {
    const ref = $app.findFirstRecordByFilter("sae_config", "key = 'referentiel'");
    const val = lib.jsonField(ref, "value", {});
    for (const sec of val.sections || []) for (const it of sec.items || []) {
      itemTitres[it.id] = it.titre;
      itemSemDefaut[it.id] = it.sem === "S3" || it.sem === "S4" ? it.sem : "both";
    }
  } catch (err) {}

  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [];
  const push = (l) => lines.push(fold(l));
  push("BEGIN:VCALENDAR");
  push("VERSION:2.0");
  push("PRODID:-//Carnet SAE GMP//IUT Bordeaux//FR");
  push("CALSCALE:GREGORIAN");
  push("METHOD:PUBLISH");
  push("X-WR-CALNAME:" + esc("Évaluations — " + p.get("nom")));
  push("X-WR-TIMEZONE:Europe/Paris");
  push("REFRESH-INTERVAL;VALUE=DURATION:PT12H");
  push("X-PUBLISHED-TTL:PT12H");

  const evals = lib.jsonField(p, "evals", {});
  for (const sem of ["S3", "S4"]) {
    const semEvals = evals[sem] || {};
    for (const itemId of Object.keys(semEvals)) {
      const ev = semEvals[itemId];
      if (!ev || !ev.date) continue;
      const defaut = itemSemDefaut[itemId] || "both";
      if (typeof ev.on === "boolean" ? !ev.on : (defaut !== "both" && defaut !== sem)) continue;
      push("BEGIN:VEVENT");
      push("UID:etu-" + slug + "-" + sem + "-" + itemId + "@gmpbordeaux.fr");
      push("DTSTAMP:" + stamp);
      push("DTSTART;VALUE=DATE:" + String(ev.date).replace(/-/g, ""));
      push("SUMMARY:" + esc(p.get("nom") + " — " + (itemTitres[itemId] || itemId)));
      push("DESCRIPTION:" + esc("Évaluation, semestre " + (sem === "S3" ? "3" : "4")));
      push("END:VEVENT");
    }
  }

  for (const ev of $app.findRecordsByFilter("sae_events", "deleted_by = ''", "", 0, 0)) {
    if (!lib.jsonField(ev, "projets", []).includes(slug)) continue;
    push("BEGIN:VEVENT");
    push("UID:evt-" + ev.id + "@gmpbordeaux.fr");
    push("DTSTAMP:" + stamp);
    push("DTSTART;VALUE=DATE:" + String(ev.get("date")).replace(/-/g, ""));
    push("SUMMARY:" + esc("◆ " + ev.get("titre")));
    push("END:VEVENT");
  }
  push("END:VCALENDAR");

  const body = lines.join("\r\n") + "\r\n";
  e.response.header().set("Content-Type", "text/calendar; charset=utf-8");
  e.response.header().set("Content-Disposition", "inline; filename=calendrier-projet.ics");
  e.response.header().set("Content-Length", String(byteLen(body)));
  e.response.header().set("Connection", "close");
  return e.string(200, body);
});
