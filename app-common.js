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
  return out;
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

    const dot = tlEl('circle', {cx:x, cy:axisY, r:opts.r||5.5, fill:it.status.color, class:'tl-dot'});
    const dotTip = tlEl('title', {});
    dotTip.textContent = tipTxt;
    dot.appendChild(dotTip);
    svg.appendChild(dot);

    const above = opts.alternate && (idx % 2 === 1);
    const ly = above ? axisY - 11 : axisY + 16;
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
  return maxChars * avgCharWidth * Math.SQRT1_2; // sin(45°) = cos(45°)
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
  const opts = { width, height: axisY + reach + 40, axisY, labelSize, alternate: items.length > 4 };
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
