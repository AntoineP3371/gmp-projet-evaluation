// Utilitaires partagés par enc-scope.pb.js (chargés via require, car les fonctions déclarées
// au niveau d'un fichier .pb.js ne sont pas visibles depuis les callbacks).
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

const projectKeys = (slug) => {
  try { return $app.findFirstRecordByFilter("sae_projects", "slug = {:s}", { s: String(slug || "") }).get("enc_keys") || ""; }
  catch (err) { return ""; }
};

// Clés de visibilité d'un enregistrement : ceux qui encadrent le(s) projet(s) concerné(s).
// Un événement sans projet reste visible de son seul auteur.
const keysFor = (record) => {
  if (record.collection().name === "sae_events") {
    let keys = "|" + norm(record.get("author")) + "|";
    for (const slug of jsonField(record, "projets", [])) keys += projectKeys(slug);
    return keys;
  }
  return projectKeys(record.get("project"));
};

// Écriture directe en base : n'altère ni `updated` (l'interface affiche « modifié » si updated ≠ created)
// ni les abonnements temps réel.
const SCOPED = ["sae_comments", "sae_journal", "sae_events"];
const setKeys = (collection, id, keys) => {
  if (!SCOPED.includes(collection)) throw new Error("collection non gérée");
  $app.db().newQuery("UPDATE " + collection + " SET enc_keys = {:k} WHERE id = {:id}").bind({ k: keys, id: id }).execute();
};

// Un encadrant n'écrit que sur les projets qu'il encadre (l'administrateur et le superutilisateur : partout).
// Événement : chaque projet cité doit être le sien ; un événement sans projet reste personnel.
const canWrite = (record, auth, isSuper) => {
  if (isSuper) return true;
  if (!auth) return false;
  if (auth.get("admin")) return true;
  const me = auth.get("login_key");
  if (!me) return false;
  if (record.collection().name === "sae_events") {
    return jsonField(record, "projets", []).every((slug) => projectKeys(slug).includes(me));
  }
  return projectKeys(record.get("project")).includes(me);
};

module.exports = { keysFor, jsonField, projectKeys, setKeys, canWrite, SCOPED };
