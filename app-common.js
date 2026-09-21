// Fonctions partagées entre la page encadrants (encadrants-*.html) et etudiant.html (consultation).
// Chargé via <script src="app-common.js"> avant le script propre à chaque page ;
// ces fonctions s'appuient sur des globales définies par la page (ex. allItems).

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
let toastTimer = null;
function showToast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove("show"), 1500);
}
function showConnError(show){ document.getElementById("conn-banner").classList.toggle("show", !!show); }

function allItemsFromReferentiel(ref){
  if(!ref || !ref.sections) return [];
  return ref.sections.flatMap(s => s.items.map(it => ({...it, sectionId: s.id})));
}
function getOverdueItemNumbers(project){
  if(!allItems.length) return [];
  const today = new Date().toISOString().slice(0,10);
  const nums = [];
  allItems.forEach((item, idx) => {
    for(const sem of ["S3","S4"]){
      const ev = project.evals && project.evals[sem] && project.evals[sem][item.id];
      if(ev && ev.date && ev.date <= today && (ev.note === undefined || ev.note === null || ev.note === "")){
        nums.push(idx+1);
        break;
      }
    }
  });
  return nums;
}
const PRESENCE_STALE_MS = 45000;
function getActiveEditors(project, excludeLabel){
  const now = Date.now();
  return (project.presence || []).filter(e =>
    e.label !== excludeLabel && (now - new Date(e.lastSeen).getTime()) < PRESENCE_STALE_MS
  );
}
function connectionState(project){
  const count = getActiveEditors(project, null).length;
  return count === 0 ? "none" : count === 1 ? "one" : "many";
}
function lockIconSvg(open){
  return `<svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="11" width="16" height="10" rx="2"></rect>
    ${open ? '<path d="M8 11V8a4 4 0 0 1 7.6-1.8"></path>' : '<path d="M8 11V8a4 4 0 0 1 8 0v3"></path>'}
  </svg>`;
}
function computeScores(project, semestres){
  const totals = { C1:{n:0,d:0}, C2:{n:0,d:0}, C3:{n:0,d:0}, C4:{n:0,d:0}, C5:{n:0,d:0} };
  for(const sem of semestres){
    const evals = (project.evals && project.evals[sem]) || {};
    for(const item of allItems){
      const ev = evals[item.id];
      if(!ev || ev.note === undefined || ev.note === null || ev.note === "") continue;
      const note = parseFloat(ev.note);
      if(isNaN(note)) continue;
      for(const c of Object.keys(item.coef||{})){
        totals[c].n += note * item.coef[c];
        totals[c].d += item.coef[c];
      }
    }
  }
  const out = {};
  for(const c of Object.keys(totals)) out[c] = totals[c].d > 0 ? Math.round((totals[c].n/totals[c].d)*100)/100 : null;
  return out;
}
function fillSelect(id, values, allLabel, current){
  const sel = document.getElementById(id);
  const sorted = Array.from(values).sort((a,b)=>a.localeCompare(b,"fr",{sensitivity:"base"}));
  sel.innerHTML = `<option value="">${allLabel}</option>` + sorted.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  sel.value = current;
  sel.classList.toggle("is-set", !!current);
}
function effectiveTheme(){
  const stored = localStorage.getItem("theme");
  if(stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function updateThemeToggleBtn(){
  const dark = effectiveTheme() === "dark";
  document.getElementById("btn-theme-toggle").textContent = dark ? "☀️ Mode clair" : "🌙 Mode sombre";
}

/* ---------------- frise chronologique des livrables (partagée) ---------------- */
function parseAnneeYears(p){
  const m = /^(\d{4})-(\d{4})$/.exec(p.annee || "");
  if(m) return [parseInt(m[1],10), parseInt(m[2],10)];
  const y = new Date().getFullYear();
  return [y, y+1];
}
function semRange(p, sem){
  const [y1,y2] = parseAnneeYears(p);
  return sem === "S3" ? [new Date(y1,8,1), new Date(y1,11,31)] : [new Date(y2,0,1), new Date(y2,5,30)];
}
function timelineItemStatus(ev, today){
  if(ev && ev.note !== undefined && ev.note !== null && ev.note !== ""){
    const n = parseFloat(ev.note);
    if(!isNaN(n)){
      if(n >= 12) return {color:"var(--good)", text:"var(--good)"};
      if(n >= 8) return {color:"var(--logo-blue)", text:"var(--logo-blue)"};
      return {color:"var(--warn)", text:"var(--warn)"};
    }
  }
  const due = ev && ev.date ? new Date(ev.date) : null;
  if(due && due < today) return {color:"var(--danger)", text:"var(--danger)"};
  return {color:"var(--rule-strong)", text:"var(--ink-faint)"};
}
// même jour : les livrables sont empilés (rang dans la pile) et partagent le même côté de l'axe
const TL_STACK = 18;
function assignTimelineStacks(items){
  const days = new Map();
  items.forEach(it => {
    const k = String(it.date).slice(0,10);
    if(!days.has(k)) days.set(k, []);
    it.stack = days.get(k).length;
    days.get(k).push(it);
    it.day = k;
  });
  let g = 0;
  for(const list of days.values()){ list.forEach(it => { it.group = g; it.stackSize = list.length; }); g++; }
  return items;
}
function collectTimelineItems(project, sems){
  const today = new Date();
  const out = [];
  for(const sem of sems){
    const evals = (project.evals && project.evals[sem]) || {};
    for(const item of allItems){
      const ev = evals[item.id];
      if(!ev || !ev.date) continue;
      out.push({ titre: item.titre, date: ev.date, note: ev.note, status: timelineItemStatus(ev, today) });
    }
  }
  out.sort((a,b) => a.date.localeCompare(b.date));
  return assignTimelineStacks(out);
}
function fmtTlDate(d){
  return new Date(d).toLocaleDateString('fr-FR', {day:'2-digit', month:'short'});
}
const TL_NS = "http://www.w3.org/2000/svg";
function tlEl(tag, attrs){
  const e = document.createElementNS(TL_NS, tag);
  for(const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function buildTimelineSVG(items, range, opts){
  opts = opts || {};
  const w = opts.width || 900;
  const h = opts.height || 180;
  const axisY = opts.axisY || 40;
  // viewBox exactement à la largeur réelle en pixels : le repère de dessin correspond
  // au rendu final 1:1, donc aucune déformation du texte (contrairement à un viewBox
  // abstrait étiré avec preserveAspectRatio="none").
  const svg = tlEl('svg', {viewBox:'0 0 '+w+' '+h, class:'timeline-svg', style:'width:100%; height:'+h+'px; overflow:visible;'});
  const x0 = 6, x1 = w - 6;
  const minD = range[0], maxD = range[1];
  const today = new Date();
  function xPos(d){ return x0 + (new Date(d) - minD) / (maxD - minD) * (x1 - x0); }

  let cur = new Date(minD.getFullYear(), minD.getMonth(), 1);
  while(cur <= maxD){
    const x = xPos(cur);
    svg.appendChild(tlEl('line', {x1:x, y1:8, x2:x, y2:h-15, stroke:'var(--rule)', 'stroke-width':1}));
    const lbl = tlEl('text', {x:x+4, y:10, class:'tl-month-label'});
    lbl.textContent = cur.toLocaleDateString('fr-FR', {month:'short'});
    svg.appendChild(lbl);
    cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
  }

  svg.appendChild(tlEl('line', {x1:x0, y1:axisY, x2:x1, y2:axisY, class:'tl-axis'}));

  if(today >= minD && today <= maxD){
    const tx = xPos(today);
    svg.appendChild(tlEl('line', {x1:tx, y1:20, x2:tx, y2:h-10, class:'tl-today-line'}));
    const tlbl = tlEl('text', {x:tx+5, y:30, class:'tl-today-label'});
    tlbl.textContent = "Aujourd'hui";
    svg.appendChild(tlbl);
  }

  items.forEach((it, idx) => {
    const x = xPos(it.date);
    const noteTxt = (it.note !== undefined && it.note !== null && it.note !== "") ? `${it.note}/20` : "Pas encore noté";
    const tipTxt = `${it.titre}\n${fmtTlDate(it.date)} — ${noteTxt}`;

    const above = opts.alternate && (it.group % 2 === 1);
    const dir = above ? -1 : 1;
    const cy = axisY + dir * TL_STACK * it.stack;
    if(it.stack > 0) svg.appendChild(tlEl('line', {x1:x, y1:axisY, x2:x, y2:cy, stroke:'var(--rule-strong)', 'stroke-width':1}));
    const dot = tlEl('circle', {cx:x, cy:cy, r:opts.r||5.5, fill:it.status.color, class:'tl-dot'});
    const dotTip = tlEl('title', {});
    dotTip.textContent = tipTxt;
    dot.appendChild(dotTip);
    svg.appendChild(dot);

    const ly = above ? cy - 11 : cy + 16;
    const rot = above ? -45 : 45;
    const label = tlEl('text', {x:x, y:ly, fill:it.status.text, style:'font-size:'+(opts.labelSize||10)+'px; cursor:default;', transform:'rotate('+rot+' '+x+' '+ly+')'});
    label.textContent = it.titre + " · " + fmtTlDate(it.date);
    const labelTip = tlEl('title', {});
    labelTip.textContent = tipTxt;
    label.appendChild(labelTip);
    svg.appendChild(label);
  });
  return svg;
}
function estimateLabelReach(items, labelSize){
  // estime, en pixels réels, jusqu'où le texte incliné à 45° le plus long peut
  // s'étendre verticalement depuis son point d'ancrage.
  let maxChars = 0;
  items.forEach(it => {
    const txt = it.titre + " · " + fmtTlDate(it.date);
    maxChars = Math.max(maxChars, txt.length);
  });
  const avgCharWidth = labelSize * 0.58;
  const maxStack = items.reduce((m, it) => Math.max(m, it.stack || 0), 0);
  return maxChars * avgCharWidth * Math.SQRT1_2 + maxStack * TL_STACK; // sin(45°) = cos(45°)
}
function renderTimeline(project, vue){
  const wrap = document.createElement('div');
  wrap.className = 'timeline-wrap';
  const cap = document.createElement('div');
  cap.className = 'timeline-caption';
  let items, range, label;
  if(vue === 'ANNEE'){
    const [y1,y2] = parseAnneeYears(project);
    range = [new Date(y1,8,1), new Date(y2,5,30)];
    items = collectTimelineItems(project, ["S3","S4"]);
    label = 'Frise — Année complète (septembre → juin)';
  } else {
    range = semRange(project, vue);
    items = collectTimelineItems(project, [vue]);
    label = 'Frise — ' + (vue === 'S3' ? 'Semestre 3 (sept.–déc.)' : 'Semestre 4 (janv.–juin)');
  }
  cap.textContent = label;
  wrap.appendChild(cap);
  if(items.length === 0){
    const empty = document.createElement('div');
    empty.className = 'timeline-empty';
    empty.textContent = "Aucune date d'évaluation renseignée pour l'instant.";
    wrap.appendChild(empty);
  } else {
    const holder = document.createElement('div');
    wrap.appendChild(holder);
    // la largeur réelle du conteneur n'est connue qu'une fois inséré dans le document ;
    // voir populateTimelineSVG, appelé juste après l'insertion de ce wrap dans la page.
    wrap._tlItems = items;
    wrap._tlRange = range;
    wrap._tlHolder = holder;
  }
  return wrap;
}
function populateTimelineSVG(wrap){
  if(!wrap._tlHolder) return;
  const items = wrap._tlItems, range = wrap._tlRange, holder = wrap._tlHolder;
  const width = holder.clientWidth || Math.round(holder.getBoundingClientRect().width) || 900;
  const labelSize = 8.5;
  const reach = Math.ceil(estimateLabelReach(items, labelSize));
  const axisY = Math.max(60, reach + 40); // + place pour l'ancrage et la ligne des mois
  const opts = { width, height: axisY + reach + 40, axisY, labelSize, alternate: new Set(items.map(it => it.group)).size > 4 };
  holder.innerHTML = "";
  holder.appendChild(buildTimelineSVG(items, range, opts));
  wrap._tlWidth = width;
}

/* ---------------- bande de choix de la période (S3 / S4 / Année), pastille glissante ---------------- */
let lastVue = null;
function renderVueSelector(current, onChange){
  const el = document.createElement("div");
  el.className = "vue-selector";
  el.dataset.vue = lastVue || current;
  el.innerHTML = [["S3","Semestre 3"],["S4","Semestre 4"],["ANNEE","Année"]]
    .map(([k,t]) => `<button type="button" class="vue-btn${k===current?" active":""}" data-vue="${k}">${t}</button>`).join("");
  el.querySelectorAll(".vue-btn").forEach(b => b.addEventListener("click", () => onChange(b.dataset.vue)));
  requestAnimationFrame(() => requestAnimationFrame(() => { el.dataset.vue = current; }));
  lastVue = current;
  return el;
}

/* ---------------- rafraîchissement doux : outils partagés ---------------- */
const sansPresence = r => { const { presence, updated, ...reste } = r || {}; return JSON.stringify(reste); };
function captureViewState(){
  const a = document.activeElement;
  const st = { y: window.scrollY, focus: null };
  if(a && a.id && document.getElementById("main").contains(a)){
    st.focus = { id: a.id, start: a.selectionStart ?? null, end: a.selectionEnd ?? null };
  }
  return st;
}
function restoreViewState(st){
  window.scrollTo(0, st.y);
  if(st.focus){
    const el = document.getElementById(st.focus.id);
    if(el){
      el.focus({ preventScroll:true });
      try{ if(st.focus.start !== null) el.setSelectionRange(st.focus.start, st.focus.end); }catch(e){}
    }
  }
}

/* ---------------- fil de commentaires par livrable (partagé) ---------------- */
let commentsAll = [];
async function loadComments(){
  try{ commentsAll = await pb.collection("sae_comments").getFullList({ sort:"created" }); }
  catch(e){ commentsAll = []; }
}
function upsertComment(rec){
  const i = commentsAll.findIndex(c => c.id === rec.id);
  if(i >= 0) commentsAll[i] = rec; else commentsAll.push(rec);
}
function commentsFor(slug, sem, itemId){
  return commentsAll
    .filter(c => c.project === slug && c.sem === sem && c.item === itemId)
    .sort((a,b) => String(a.created).localeCompare(String(b.created)));
}
function legacyComment(project, sem, itemId){
  const ev = (project.evals && project.evals[sem] && project.evals[sem][itemId]) || {};
  return (ev.commentaire && String(ev.commentaire).trim()) ? String(ev.commentaire) : "";
}
function countComments(project, sem, itemId){
  return commentsFor(project.slug, sem, itemId).filter(c => !c.deleted_by).length + (legacyComment(project, sem, itemId) ? 1 : 0);
}
const commentNorm = s => String(s||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
function knownAuthorNames(){
  const m = new Map();
  for(const p of projects.values()) for(const a of (p.encadrants || [])) if(a) m.set(commentNorm(a), a);
  for(const cm of commentsAll) if(cm.author) m.set(commentNorm(cm.author), cm.author);
  return [...m.keys()].sort((a,b) => a.localeCompare(b, "fr"));
}
// 20 teintes écartées (rang × 7 modulo 20, par pas de 18°), deux niveaux de clarté en alternance :
// chaque encadrant a une couleur propre, et la même sur les deux pages
function authorStyle(name){
  const key = commentNorm(name);
  let i = knownAuthorNames().indexOf(key);
  if(i < 0) i = [...key].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return "--h:" + (((i * 7) % 20) * 18) + ";--l:" + (i % 2 ? 44 : 32) + "%";
}
function authorInitials(name){ return String(name).split(/\s+/).filter(Boolean).map(s => s[0]).slice(0,2).join("").toUpperCase(); }
function authorShort(name){ const p = String(name).split(/\s+/).filter(Boolean); return p.length > 1 ? p[1] + " " + p[0][0] + "." : String(name); }
function commentDate(s){ return new Date(String(s).replace(" ", "T")); }
function fmtCommentDate(s){
  if(!s) return "sans date";
  const d = commentDate(s);
  if(isNaN(d)) return "";
  const now = new Date();
  const hm = d.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" });
  if(d.toDateString() === now.toDateString()) return "Aujourd'hui · " + hm;
  const opts = { day:"numeric", month:"short" };
  if(d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("fr-FR", opts) + " · " + hm;
}
function threadShellHTML(itemId){
  return `<div class="cm-thread" data-item="${escapeHtml(itemId)}">
    <div class="cm-h">Commentaires <span class="cm-n" data-n>0</span><span class="cm-people" data-people></span></div>
    <div data-list></div>
    <div data-composer></div>
  </div>`;
}
function drawThreadList(th, project, sem, itemId, opts){
  th.querySelector("[data-list]").innerHTML = commentListHTML(project, sem, itemId, opts);
  th.querySelector("[data-n]").textContent = countComments(project, sem, itemId);
  const seen = new Map();
  for(const cm of commentsFor(project.slug, sem, itemId)) if(!seen.has(commentNorm(cm.author))) seen.set(commentNorm(cm.author), cm.author);
  th.querySelector("[data-people]").innerHTML = [...seen.values()]
    .map(a => `<span class="cm-person" style="${authorStyle(a)}"><i></i>${escapeHtml(authorShort(a))}</span>`).join("");
}
function commentListHTML(project, sem, itemId, opts){
  opts = opts || {};
  const me = opts.readOnly ? null : (opts.me || null);
  const all = [];
  const legacy = legacyComment(project, sem, itemId);
  if(legacy) all.push({ id:"legacy", author:"Ancien commentaire", created:null, text:legacy, parent:"", legacy:true });
  all.push(...commentsFor(project.slug, sem, itemId));
  if(!all.length) return `<p class="cm-none">Aucun commentaire pour l'instant.</p>`;
  const byId = new Map(all.map(c => [c.id, c]));
  const rootOf = c => { let x = c, n = 0; while(x.parent && byId.has(x.parent) && n++ < 30) x = byId.get(x.parent); return x; };
  const roots = all.filter(c => !c.parent || !byId.has(c.parent));
  const msg = (c, isReply) => {
    const deleted = !!c.deleted_by;
    const mine = !!me && !c.legacy && commentNorm(c.author) === commentNorm(me);
    const edited = !deleted && !c.legacy && c.updated && c.created && (commentDate(c.updated) - commentDate(c.created)) > 2000;
    const parent = c.parent ? byId.get(c.parent) : null;
    const quote = (isReply && parent && !deleted && rootOf(c) !== parent)
      ? `<div class="cm-quote">↪ ${escapeHtml(authorShort(parent.author))} : ${escapeHtml(parent.text.slice(0,60))}${parent.text.length > 60 ? "…" : ""}</div>` : "";
    let body;
    if(opts.editingId === c.id){
      body = `<div class="cm-edit"><textarea data-edit aria-label="Modifier le message">${escapeHtml(c.text)}</textarea>
        <div class="cm-btns"><button class="btn btn-accent btn-sm" data-do="saveEdit" data-id="${escapeHtml(c.id)}" type="button">Enregistrer</button><button class="btn btn-sm" data-do="cancelEdit" type="button">Annuler</button></div></div>`;
    } else if(deleted){
      body = `<p class="cm-txt">Message supprimé par ${escapeHtml(authorShort(c.deleted_by))} · ${escapeHtml(fmtCommentDate(c.updated))}</p>`;
    } else {
      body = `${quote}<p class="cm-txt">${escapeHtml(c.text)}</p>`;
    }
    const canAct = !!me && !deleted && opts.editingId !== c.id;
    const acts = canAct
      ? `<div class="cm-acts"><button data-do="reply" data-id="${escapeHtml(c.id)}" type="button">Répondre</button>${mine ? `<button data-do="edit" data-id="${escapeHtml(c.id)}" type="button">Modifier</button><button data-do="del" data-id="${escapeHtml(c.id)}" type="button">Supprimer</button>` : ""}</div>` : "";
    const head = `<div class="cm-mh"><span class="cm-who">${escapeHtml(c.author)}</span><span class="cm-when">${escapeHtml(fmtCommentDate(c.created))}</span>${edited ? `<span class="cm-edited">modifié · ${escapeHtml(fmtCommentDate(c.updated))}</span>` : ""}</div>`;
    const av = c.legacy ? `<span class="cm-av legacy">…</span>` : `<span class="cm-av">${escapeHtml(authorInitials(c.author))}</span>`;
    return `<div class="cm-msg${deleted ? " deleted" : ""}"${c.legacy ? "" : ` style="${authorStyle(c.author)}"`}>${av}<div class="cm-mb">${head}${body}${acts}</div></div>`;
  };
  return roots.map(r => {
    const kids = all.filter(k => k !== r && k.parent && rootOf(k) === r);
    return msg(r, false) + (kids.length ? `<div class="cm-replies">${kids.map(k => msg(k, true)).join("")}</div>` : "");
  }).join("");
}
