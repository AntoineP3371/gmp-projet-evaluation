// Agenda (.ics) par encadrant : abonnement en direct aux évaluations des projets qu'il encadre.
// Rien de plus sensible que ce que la page étudiants montre déjà (lecture publique côté projets).
routerAdd("GET", "/ics/{token}", (e) => {
  const norm = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const esc = (s) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  // pliage des lignes à 75 octets, comme l'exige RFC 5545
  const fold = (line) => {
    // pas de TextEncoder dans ce moteur JS : longueur UTF-8 calculée à la main
    const bytes = (s) => {
      let n = 0;
      for (const ch of s) {
        const c = ch.codePointAt(0);
        n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
      }
      return n;
    };
    if (bytes(line) <= 75) return line;
    let out = "", rest = line;
    while (bytes(rest) > 75) {
      let cut = 74;
      while (cut > 1 && bytes(rest.slice(0, cut)) > 74) cut--;
      out += rest.slice(0, cut) + "\r\n ";
      rest = rest.slice(cut);
    }
    return out + rest;
  };

  // le moteur JS des hooks (goja) expose parfois un champ JSON (tableau ou objet) comme le
  // JSON brut du champ, octet UTF-8 par octet, au lieu de la valeur décodée ; on redétecte ce
  // cas (tableau dont le premier élément est un nombre) et on redécode nous-mêmes l'UTF-8.
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

  let token = e.request.pathValue("token");
  // certains clients (Zimbra notamment) devinent le type de flux par l'extension de l'URL
  // plutôt que par l'en-tête Content-Type ; on accepte donc /ics/<jeton>.ics en plus de /ics/<jeton>.
  if (token && token.toLowerCase().endsWith(".ics")) token = token.slice(0, -4);
  let user;
  try {
    user = $app.findFirstRecordByFilter("sae_users", "ics_token = {:t} && ics_token != ''", { t: token });
  } catch (err) {
    user = null;
  }
  if (!user) return e.string(404, "Lien d'agenda inconnu ou révoqué. Générez-en un nouveau depuis l'application.");
  const myKey = norm(user.get("name"));

  let itemTitres = {};
  let itemSemDefaut = {};
  try {
    const ref = $app.findFirstRecordByFilter("sae_config", "key = 'referentiel'");
    const val = jsonField(ref, "value", {});
    for (const sec of val.sections || []) for (const it of sec.items || []) {
      itemTitres[it.id] = it.titre;
      itemSemDefaut[it.id] = it.sem === "S3" || it.sem === "S4" ? it.sem : "both";
    }
  } catch (err) {}

  const projects = $app.findRecordsByFilter("sae_projects", "archived = false && visible_eleves = true", "", 0, 0);
  const mine = projects.filter((p) => (jsonField(p, "encadrants", [])||[]).some((n) => norm(n) === myKey));
  const mySlugs = new Set(mine.map((p) => p.get("slug")));

  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [];
  const push = (l) => lines.push(fold(l));

  push("BEGIN:VCALENDAR");
  push("VERSION:2.0");
  push("PRODID:-//Carnet SAE GMP//IUT Bordeaux//FR");
  push("CALSCALE:GREGORIAN");
  push("METHOD:PUBLISH");
  push("X-WR-CALNAME:" + esc("Évaluations — " + user.get("name")));
  push("X-WR-TIMEZONE:Europe/Paris");
  push("REFRESH-INTERVAL;VALUE=DURATION:PT12H");
  push("X-PUBLISHED-TTL:PT12H");

  for (const p of mine) {
    const evals = jsonField(p, "evals", {});
    for (const sem of ["S3", "S4"]) {
      const semEvals = evals[sem] || {};
      for (const itemId of Object.keys(semEvals)) {
        const ev = semEvals[itemId];
        if (!ev || !ev.date) continue;
        // livrable affecté à l'autre semestre : réglage du projet (ev.on) sinon valeur par défaut du référentiel
        const defaut = itemSemDefaut[itemId] || "both";
        if (typeof ev.on === "boolean" ? !ev.on : (defaut !== "both" && defaut !== sem)) continue;
        const titre = itemTitres[itemId] || itemId;
        const noteTxt = ev.note !== undefined && ev.note !== null && ev.note !== "" ? "Note : " + ev.note + "/20" : "Pas encore noté";
        push("BEGIN:VEVENT");
        push("UID:liv-" + p.get("slug") + "-" + sem + "-" + itemId + "@gmpbordeaux.fr");
        push("DTSTAMP:" + stamp);
        push("DTSTART;VALUE=DATE:" + String(ev.date).replace(/-/g, ""));
        push("SUMMARY:" + esc(p.get("nom") + " — " + titre));
        push("DESCRIPTION:" + esc("Semestre " + (sem === "S3" ? "3" : "4") + " · " + noteTxt));
        push("END:VEVENT");
      }
    }
  }

  const events = $app.findRecordsByFilter("sae_events", "deleted_by = ''", "", 0, 0);
  for (const ev of events) {
    const projets = jsonField(ev, "projets", []) || [];
    const perso = norm(ev.get("author")) === myKey;
    if (!perso && !projets.some((s) => mySlugs.has(s))) continue;
    push("BEGIN:VEVENT");
    push("UID:evt-" + ev.id + "@gmpbordeaux.fr");
    push("DTSTAMP:" + stamp);
    push("DTSTART;VALUE=DATE:" + String(ev.get("date")).replace(/-/g, ""));
    push("SUMMARY:" + esc("◆ " + ev.get("titre")));
    push("DESCRIPTION:" + esc("Ajouté par " + ev.get("author")));
    push("END:VEVENT");
  }

  push("END:VCALENDAR");

  const body = lines.join("\r\n") + "\r\n";
  // Content-Length explicite : sans lui, les réponses volumineuses partent en
  // Transfer-Encoding: chunked à travers le tunnel Cloudflare, que certains clients
  // anciens (ex. Jakarta Commons-HttpClient, utilisé par Zimbra) ne gèrent pas bien.
  const byteLen = (s) => { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };
  e.response.header().set("Content-Type", "text/calendar; charset=utf-8");
  e.response.header().set("Content-Disposition", "inline; filename=agenda-encadrant.ics");
  e.response.header().set("Content-Length", String(byteLen(body)));
  // certains clients HTTP très anciens (ex. Jakarta Commons-HttpClient, utilisé par Zimbra)
  // gèrent mal les connexions persistantes en HTTP/1.1 : on force la fermeture.
  e.response.header().set("Connection", "close");
  return e.string(200, body);
});
