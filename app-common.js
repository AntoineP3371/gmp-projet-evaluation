// Fonctions partagées entre la page encadrants (encadrants-*.html) et eleves.html (consultation).
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
