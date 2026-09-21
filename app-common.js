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
      out.push({ id: item.id, sem, titre: item.titre, date: ev.date, note: ev.note, status: timelineItemStatus(ev, today) });
    }
  }
  // événements ajoutés par les encadrants pour ce projet, dans la période affichée
  const dans = d => sems.some(sem => { const r = semRange(project, sem); return d >= r[0] && d <= r[1]; });
  for(const ev of eventsOfProject(project.slug)){
    const day = String(ev.date).slice(0, 10);
    if(dans(new Date(day + "T00:00:00"))) out.push({ event:true, id:ev.id, titre:ev.titre, date:day, author:ev.author, status:{color:"var(--ink)", text:"var(--ink)"} });
  }
  out.sort((a,b) => a.date.slice(0,10).localeCompare(b.date.slice(0,10)) || (a.event ? 1 : 0) - (b.event ? 1 : 0));
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
// Disposition : un bloc de texte horizontal par jour (date, puis un livrable par ligne, les uns sous les autres),
// posé sous ou au-dessus de l'axe, sur le premier niveau libre pour que rien ne se chevauche.
function layoutTimeline(items, w, range, size){
  const x0 = 6, x1 = w - 6, minD = range[0], maxD = range[1];
  const xPos = d => x0 + (new Date(d) - minD) / (maxD - minD) * (x1 - x0);
  const cw = size * 0.6, lh = size + 4, gap = 10;
  const groups = [];
  items.forEach(it => { (groups[it.group] = groups[it.group] || []).push(it); });
  const levels = { below: [], above: [] };
  const blocks = [];
  groups.forEach((g, gi) => {
    if(!g) return;
    const x = xPos(g[0].date);
    const head = fmtTlDate(g[0].date);
    const lines = g.map(it => { const t = (it.event ? "◆ " : "") + it.titre; return { it, txt: t.length > 32 ? t.slice(0, 31) + "…" : t }; });
    const wd = Math.max(head.length, ...lines.map(l => l.txt.length)) * cw + 8;
    const right = x + wd > x1;
    const a = right ? x - wd + 4 : x - 4, b = a + wd;
    const place = side => {
      const lv = levels[side];
      for(let L = 0; L <= lv.length; L++){
        if(L > 0 && lv[L-1].some(r => x >= r.a - 3 && x <= r.b + 3)) return null; // le trait de liaison traverserait un bloc
        const row = lv[L] || [];
        if(row.every(r => b + gap <= r.a || a - gap >= r.b)) return L;
      }
      return null;
    };
    const lb = place("below"), la = place("above");
    let side, L;
    if(lb === null && la === null){ side = "below"; L = levels.below.length; }
    else if(la === null || (lb !== null && (lb < la || (lb === la && gi % 2 === 0)))){ side = "below"; L = lb; }
    else { side = "above"; L = la; }
    const bk = { x, a, b, right, head, lines, side, L, h: (lines.length + 1) * lh + 4, group: g };
    (levels[side][L] = levels[side][L] || []).push(bk);
    blocks.push(bk);
  });
  const offs = {}, total = {};
  for(const side of ["below", "above"]){
    let o = 0; offs[side] = [];
    levels[side].forEach((row, L) => { offs[side][L] = o; o += Math.max(...row.map(r => r.h)) + 8; });
    total[side] = o;
  }
  return { blocks, offs, aboveH: total.above, belowH: total.below, lh, xPos, x0, x1 };
}
function buildTimelineSVG(items, range, opts){
  opts = opts || {};
  const w = opts.width || 900;
  const size = opts.labelSize || 10;
  const lay = layoutTimeline(items, w, range, size);
  const axisY = Math.max(60, lay.aboveH + 16 + 40);
  const h = axisY + lay.belowH + 16 + 24;
  // viewBox exactement à la largeur réelle en pixels : le repère de dessin correspond
  // au rendu final 1:1, donc aucune déformation du texte.
  const svg = tlEl('svg', {viewBox:'0 0 '+w+' '+h, class:'timeline-svg', style:'width:100%; height:'+h+'px; overflow:visible;'});
  const x0 = lay.x0, x1 = lay.x1;
  const minD = range[0], maxD = range[1];
  const today = new Date();
  const xPos = lay.xPos;

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

  const cliquable = it => it.event ? typeof onTimelineEvent === "function" : typeof goToLivrable === "function";
  const goTo = it => () => {
    if(it.event){ if(typeof onTimelineEvent === "function") onTimelineEvent(it.id); }
    else if(typeof goToLivrable === "function") goToLivrable(it.id, it.sem);
  };
  const tipOf = it => {
    if(it.event) return "Événement : " + it.titre + "\n" + fmtTlDate(it.date) + (it.author ? " — " + it.author : "") + (cliquable(it) ? "\n(cliquer pour ouvrir)" : "");
    const noteTxt = (it.note !== undefined && it.note !== null && it.note !== "") ? it.note + "/20" : "Pas encore noté";
    return it.titre + "\n" + fmtTlDate(it.date) + " — " + noteTxt + "\n(cliquer pour aller au livrable)";
  };
  const addTip = (el, txt) => { const t = tlEl('title', {}); t.textContent = txt; el.appendChild(t); };

  lay.blocks.forEach(bk => {
    const below = bk.side === "below";
    const off = lay.offs[bk.side][bk.L];
    const top = below ? axisY + 16 + off : axisY - 16 - off - bk.h;
    // trait de liaison de l'axe jusqu'au bloc
    svg.appendChild(tlEl('line', {x1:bk.x, y1:axisY, x2:bk.x, y2: below ? top + 2 : top + bk.h - 2, stroke:'var(--rule-strong)', 'stroke-width':1}));
    const tx = bk.right ? bk.b - 4 : bk.a + 4;
    const anchor = bk.right ? 'end' : 'start';
    const hd = tlEl('text', {x:tx, y:top + lay.lh - 4, 'text-anchor':anchor, style:'font-size:'+size+'px; font-weight:700;', fill:'var(--ink-muted)'});
    hd.textContent = bk.head;
    svg.appendChild(hd);
    bk.lines.forEach((l, i) => {
      const t = tlEl('text', {x:tx, y:top + lay.lh * (i + 2) - 4, 'text-anchor':anchor, fill:l.it.status.text, style:'font-size:'+size+'px;' + (l.it.event ? ' font-weight:600;' : '')});
      if(cliquable(l.it)) t.setAttribute('class', 'tl-link');
      t.textContent = l.txt;
      t.addEventListener('click', goTo(l.it));
      addTip(t, tipOf(l.it));
      svg.appendChild(t);
    });
    // point sur l'axe : rouge dès qu'un livrable du jour est en retard, sinon couleur du premier
    const worst = bk.group.find(it => it.status.color === "var(--danger)") || bk.group[0];
    const r = opts.r || 5.5;
    const dot = worst.event
      ? tlEl('polygon', {points:[[bk.x, axisY - r - 1], [bk.x + r + 1, axisY], [bk.x, axisY + r + 1], [bk.x - r - 1, axisY]].map(p => p.join(',')).join(' '), fill:worst.status.color, class:'tl-dot' + (cliquable(worst) ? ' tl-link' : '')})
      : tlEl('circle', {cx:bk.x, cy:axisY, r, fill:worst.status.color, class:'tl-dot tl-link'});
    dot.addEventListener('click', goTo(worst));
    addTip(dot, bk.group.map(tipOf).join("\n\n"));
    svg.appendChild(dot);
  });
  return svg;
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
  holder.innerHTML = "";
  holder.appendChild(buildTimelineSVG(items, range, { width, labelSize:10 }));
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
  // un message supprimé disparaît complètement, sauf s'il a encore des réponses (il reste alors un repère « supprimé »)
  const vivants = new Set();
  for(const c of all) if(!c.deleted_by){ let x = c, n = 0; while(x && n++ < 30){ vivants.add(x.id); x = x.parent ? byId.get(x.parent) : null; } }
  const shown = all.filter(c => c.legacy || vivants.has(c.id));
  if(!shown.length) return `<p class="cm-none">Aucun commentaire pour l'instant.</p>`;
  const roots = shown.filter(c => !c.parent || !byId.has(c.parent));
  const msg = (c, isReply) => {
    const deleted = !!c.deleted_by;
    const mine = !!me && !c.legacy && commentNorm(c.author) === commentNorm(me);
    const edited = !deleted && !c.legacy && c.updated && c.created && (commentDate(c.updated) - commentDate(c.created)) > 2000;
    const parent = c.parent ? byId.get(c.parent) : null;
    const quote = (isReply && parent && !deleted && !parent.deleted_by && rootOf(c) !== parent)
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
    const kids = shown.filter(k => k !== r && k.parent && rootOf(k) === r);
    return msg(r, false) + (kids.length ? `<div class="cm-replies">${kids.map(k => msg(k, true)).join("")}</div>` : "");
  }).join("");
}

/* clic sur la frise : défile jusqu'à la case du livrable et la met brièvement en évidence */
function scrollToLivrable(itemId){
  const card = document.querySelector('.livrable-card[data-item="' + CSS.escape(itemId) + '"]');
  if(!card) return false;
  card.scrollIntoView({ behavior:"smooth", block:"center" });
  card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash");
  clearTimeout(card._flashTimer);
  card._flashTimer = setTimeout(() => card.classList.remove("flash"), 2200);
  return true;
}

/* ---------------- événements ajoutés par les encadrants (calendrier et frises) ---------------- */
let eventsAll = [];
async function loadEvents(){
  try{ eventsAll = await pb.collection("sae_events").getFullList({ sort:"date" }); }
  catch(e){ eventsAll = []; }
}
function upsertEvent(rec){
  const i = eventsAll.findIndex(x => x.id === rec.id);
  if(i >= 0) eventsAll[i] = rec; else eventsAll.push(rec);
}
// événements (non supprimés) rattachés à un projet
function eventsOfProject(slug){
  return eventsAll.filter(e => !e.deleted_by && e.date && Array.isArray(e.projets) && e.projets.includes(slug));
}

/* ---------------- journal : lecture partagée (auteur et horodatage des notes) ---------------- */
let journalAll = [];
async function loadJournal(){
  try{ journalAll = await pb.collection("sae_journal").getFullList({ sort:"created", batch:500 }); }
  catch(e){ journalAll = []; }
}
function upsertJournal(rec){
  if(!journalAll.some(x => x.id === rec.id)) journalAll.push(rec);
}
let _jNoteIdx = null, _jNoteLen = -1;
function journalLastByKey(){
  if(_jNoteIdx && _jNoteLen === journalAll.length) return _jNoteIdx;
  const m = new Map();
  for(const e of journalAll) m.set(`${e.project}|${e.sem}|${e.cle}`, e);   // les lignes arrivent dans l'ordre : la dernière l'emporte
  _jNoteIdx = m; _jNoteLen = journalAll.length;
  return m;
}
function fmtNoteStamp(created){
  const d = new Date(String(created).replace(" ", "T"));
  return isNaN(d) ? "" : d.toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
// « NOM Prénom · 21/09/2026 14:32 » : dernier auteur de la note (auteur et heure fournis par le serveur)
function noteStampText(project, sem, itemId){
  const e = journalLastByKey().get(`${project.slug}|${sem}|item:${itemId}:note`);
  if(!e || String(e.apres || "").trim() === "") return "";
  if(/^(Point de référence|Validé par)/.test(e.author)) return "";
  return e.author + " · " + fmtNoteStamp(e.created);
}
function refreshNoteStamps(project, sem){
  document.querySelectorAll(".livrable-card[data-item]").forEach(card => {
    const el = card.querySelector(".note-stamp");
    if(el) el.textContent = noteStampText(project, sem, card.dataset.item);
  });
}

/* ---------------- individualisation des notes : note des livrables et note revue par les encadrants ---------------- */
// Par compétence, deux colonnes alignées sous le nom de la compétence :
//   « Livrables » = note d'équipe calculée à partir des notes des livrables ;
//   « Revue » = note modifiée par les encadrants pour cet étudiant (vide = la note d'équipe est reprise, dans l'appli comme dans l'export Excel).
function buildIndividualisation(project, sem, readOnly, onEdit){
  const comps = Object.keys(COMPETENCES);
  const etu = (project.etudiants || []).map((n, i) => ({ n, i }));
  const wrap = document.createElement("div");
  wrap.className = "indiv-panel";
  wrap.innerHTML = `<div class="disclosure">Individualisation des notes (semestre ${sem === "S3" ? "3" : "4"})</div>`;
  const body = document.createElement("div");
  body.className = "indiv-body";
  wrap.appendChild(body);
  if(etu.length === 0){
    body.innerHTML = `<p style="color:var(--ink-muted); font-size:12.5px;">Aucun étudiant renseigné pour ce projet.</p>`;
    return wrap;
  }
  const fmt = v => (v === null || v === undefined || v === "" || isNaN(Number(v))) ? "—" : String(Math.round(Number(v) * 100) / 100);
  const indiv = (project.individualisation && project.individualisation[sem]) || {};
  const team = computeScores(project, [sem]);
  const head1 = `<tr><th rowspan="2" class="nm">Étudiant</th>${comps.map(c => `<th colspan="2" class="ic" style="border-top-color:${COMPETENCES[c].couleur}">${c} · ${escapeHtml(COMPETENCES[c].nom)}</th>`).join("")}</tr>`;
  const head2 = `<tr>${comps.map(() => `<th class="sub" title="Note calculée avec les notes des livrables (équipe)">Livrables</th><th class="sub" title="Note revue par les encadrants">Revue</th>`).join("")}</tr>`;
  let rows = "";
  for(const { n, i } of etu){
    const ov = indiv[i] || {};
    rows += `<tr><td class="nm">${escapeHtml(n)}</td>`;
    for(const c of comps){
      const has = ov[c] !== undefined && ov[c] !== null && ov[c] !== "";
      rows += `<td class="num team${has ? " off" : ""}" data-comp="${c}" data-etu="${i}">${fmt(team[c])}</td>`;
      rows += readOnly
        ? `<td class="num rev${has ? " on" : ""}">${has ? fmt(ov[c]) : "—"}</td>`
        : `<td class="num rev"><input id="indiv-${i}-${c}" type="number" min="0" max="20" step="0.5" class="${has ? "on" : ""}" data-etu="${i}" data-comp="${c}" value="${has ? ov[c] : ""}" placeholder="—" aria-label="Note revue, ${escapeHtml(n)}, ${c}"></td>`;
    }
    rows += "</tr>";
  }
  body.innerHTML = `<div class="indiv-scroll"><table class="indiv-table"><thead>${head1}${head2}</thead><tbody>${rows}</tbody></table></div>
    <p class="indiv-default"><b>Livrables</b> : note calculée avec les notes des livrables (identique pour toute l'équipe). <b>Revue</b> : note revue par les encadrants pour cet étudiant. Case « Revue » vide : la note des livrables est reprise, dans l'application comme dans le fichier Excel. Case remplie : c'est elle qui est reprise.</p>`;
  if(!readOnly){
    body.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", () => {
        inp.classList.toggle("on", inp.value !== "");
        const cell = body.querySelector(`td.team[data-etu="${inp.dataset.etu}"][data-comp="${inp.dataset.comp}"]`);
        if(cell) cell.classList.toggle("off", inp.value !== "");
      });
      inp.addEventListener("change", e => {
        const v = e.target.value === "" ? null : parseFloat(e.target.value);
        if(onEdit) onEdit(e.target.dataset.etu, e.target.dataset.comp, v);
      });
    });
  }
  // recalcul de la colonne « Livrables » quand une note de livrable change (sans reconstruire la table)
  wrap._refresh = () => {
    const t = computeScores(project, [sem]);
    body.querySelectorAll("td.team").forEach(td => { td.textContent = fmt(t[td.dataset.comp]); });
  };
  return wrap;
}
