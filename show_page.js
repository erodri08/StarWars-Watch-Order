// ─────────────────────────────────────────────────────────────────────────────
// show_page.js  —  shared engine for all episode-list show pages
// Each show HTML page sets window.SHOW_DATA before loading this script.
// ─────────────────────────────────────────────────────────────────────────────

// SHOW_DATA is set by the inline <script> in each show HTML page, e.g.:
//   window.SHOW_DATA = REBELS_DATA;

// ── STORAGE KEY (per show) ────────────────────────────────────────────────────
const SHOW_ID   = SHOW_DATA.show.id;
const SK        = {
  WT:      `sw_show_${SHOW_ID}_wt`,
  ACTIVE:  `sw_show_${SHOW_ID}_active`,
  FILTERS: `sw_show_${SHOW_ID}_filters`,
  TAGS:    `sw_show_${SHOW_ID}_tags`,     // { episodeId: [tag,...] } — merged with JSON tags on load
};

// ── STATE ─────────────────────────────────────────────────────────────────────
let S = {
  show: SHOW_DATA.show,
  episodes: [],           // working copy with tags merged in from localStorage

  watchthroughs: [],
  activeWT: null,

  filters: { vital: [], quality: [], tags: [], seasons: [] },
  tagsExpanded: false,

  editingEpId: null,
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function gid(id)    { return document.getElementById(id); }
function genId()    { return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }
function esc(s)     { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function slugify(s) { return s.trim().toLowerCase().replace(/\s+/g,'-'); }

function relKey(ep) {
  if (ep.release_date) {
    const p = ep.release_date.split('-').map(Number);
    if (p.length === 3 && !isNaN(p[0])) return p[0]*10000 + (p[1]||1)*100 + (p[2]||1);
  }
  return (ep.release_year || 9999) * 10000;
}

function getWT()    { return S.watchthroughs.find(w => w.id === S.activeWT) || null; }
function isWatched(epId) { return !!(getWT()?.watched?.[epId]); }

function getAllTags() {
  const ts = new Set();
  S.episodes.forEach(ep => (ep.tags||[]).forEach(t => ts.add(t)));
  return [...ts].sort();
}

function getSeasons() {
  return [...new Set(S.episodes.map(e => String(e.season)))];
}

// ── PERSIST ───────────────────────────────────────────────────────────────────
function load() {
  // Deep-copy episodes from data, merge saved tags from localStorage
  S.episodes = SHOW_DATA.episodes.map(ep => ({ ...ep, tags: [...(ep.tags||[])] }));

  try {
    const saved = JSON.parse(localStorage.getItem(SK.TAGS) || '{}');
    S.episodes.forEach(ep => {
      if (saved[ep.id]) ep.tags = saved[ep.id];
    });
  } catch(e) {}

  try {
    const wt = JSON.parse(localStorage.getItem(SK.WT) || '[]');
    S.watchthroughs = wt;
  } catch(e) {}

  try { S.activeWT = localStorage.getItem(SK.ACTIVE) || null; } catch(e) {}

  try {
    const f = JSON.parse(localStorage.getItem(SK.FILTERS) || '{}');
    S.filters = { vital:[], quality:[], tags:[], seasons:[], ...f };
  } catch(e) {}
}

function save() {
  localStorage.setItem(SK.WT,      JSON.stringify(S.watchthroughs));
  localStorage.setItem(SK.ACTIVE,  S.activeWT || '');
  localStorage.setItem(SK.FILTERS, JSON.stringify(S.filters));
  // Save tags keyed by episode id
  const tags = {};
  S.episodes.forEach(ep => { if (ep.tags?.length) tags[ep.id] = ep.tags; });
  localStorage.setItem(SK.TAGS, JSON.stringify(tags));
  flash();
}

function flash() {
  const el = gid('saveIndicator');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1400);
}

// ── FILTERING ─────────────────────────────────────────────────────────────────
function filtered() {
  const f = S.filters;
  let eps = [...S.episodes];

  if (f.seasons?.length) eps = eps.filter(e => f.seasons.includes(String(e.season)));

  if (f.vital.length) {
    eps = eps.filter(e =>
      (f.vital.includes('vital') && e.vitality === 'vital') ||
      (f.vital.includes('non-essential') && e.vitality === 'skippable')
    );
  }
  if (f.quality.length) eps = eps.filter(e => f.quality.includes(e.quality));
  if (f.tags.length)    eps = eps.filter(e => f.tags.every(t => (e.tags||[]).includes(t)));

  return eps;
}

function toggleF(cat, val) {
  const arr = S.filters[cat];
  const i = arr.indexOf(val);
  if (i >= 0) arr.splice(i, 1); else arr.push(val);
  save(); render();
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function render() {
  renderHeader();
  renderFilters();
  renderWTBar();
  renderList();
}

function renderHeader() {
  document.title = S.show.title + ' — Star Wars Watchlist';
  gid('showTitle').textContent = '⬡ ' + S.show.title.toUpperCase() + ' ⬡';
  gid('showYears').textContent = S.show.years || '';
}

function renderFilters() {
  const allTags  = getAllTags();
  const seasons  = getSeasons();
  const f        = S.filters;
  const color    = S.show.color || 'var(--sw-gold)';

  const vitalOpts = [['vital','Vital','active-vital'],['non-essential','Non-Essential','active-skippable']];
  const qualOpts  = [['great','Great','active-great'],['good','Good','active-good'],['meh','Meh','active-meh'],['bad','Bad','active-bad']];

  let html = `<div class="section-row" style="gap:1rem;align-items:stretch;">`;

  // Vitality
  html += filterPanel('Vitality', vitalOpts, f.vital, 'vital');
  // Quality
  html += filterPanel('Quality', qualOpts, f.quality, 'quality');

  // Season filter (only if multi-season)
  if (seasons.length > 1) {
    html += `<div class="panel" style="flex:1;min-width:180px;">
      <div class="panel-title">Season</div>
      <div class="filter-chips">
        ${seasons.map(s => `<button class="chip ${f.seasons.includes(s)?'active-order':''}" onclick="toggleF('seasons','${s}')">S${s}</button>`).join('')}
      </div>
    </div>`;
  }

  html += `</div>`;

  // Tags row — collapsible when > 8 tags
  if (allTags.length > 0) {
    const COLLAPSE_THRESHOLD = 8;
    const needsCollapse = allTags.length > COLLAPSE_THRESHOLD;
    const visibleTags   = (!needsCollapse || S.tagsExpanded) ? allTags : allTags.slice(0, COLLAPSE_THRESHOLD);
    html += `
      <div class="section-row" style="gap:1rem;align-items:stretch;">
        <div class="panel" style="flex:1;">
          <div class="panel-title" style="display:flex;align-items:center;gap:8px;">
            Tags
            ${needsCollapse ? `<button class="tag-collapse-btn" onclick="toggleTagsExpanded()">${S.tagsExpanded ? '▲ Show less' : '▼ Show all ('+allTags.length+')'}</button>` : ''}
          </div>
          <div class="filter-chips">
            ${visibleTags.map(t => `<button class="chip ${f.tags.includes(t)?'active-tag':''}" onclick="toggleF('tags','${esc(t)}')">${esc(t)}</button>`).join('')}
          </div>
        </div>
      </div>
    `;
  }

  gid('filtersArea').innerHTML = html;
}

function filterPanel(title, opts, activeArr, cat) {
  return `<div class="panel" style="flex:1;min-width:180px;">
    <div class="panel-title">${title}</div>
    <div class="filter-chips">
      ${opts.map(([val,label,cls]) =>
        `<button class="chip ${activeArr.includes(val)?cls:''}" onclick="toggleF('${cat}','${val}')">${label}</button>`
      ).join('')}
    </div>
  </div>`;
}

function toggleTagsExpanded() { S.tagsExpanded = !S.tagsExpanded; render(); }

function renderWTBar() {
  const wt = getWT();
  const eps = filtered();
  const watchedCount = wt ? eps.filter(e => isWatched(e.id)).length : 0;
  const pct = eps.length > 0 ? Math.round(watchedCount/eps.length*100) : 0;

  let html = `<div class="watchthrough-bar">
    <span class="wt-label">Watchthrough:</span>
    <select class="wt-select" onchange="selectWT(this.value)">
      <option value="">— None —</option>
      ${S.watchthroughs.map(w => `<option value="${w.id}" ${w.id===S.activeWT?'selected':''}>${esc(w.name)}</option>`).join('')}
    </select>
    <button class="btn primary" onclick="openNewWT()">+ New</button>
    ${wt ? `<button class="btn danger" onclick="deleteWT()">Delete</button>` : ''}
    ${wt ? `<button class="btn success" onclick="exportTxt()">↓ Export List</button>` : ''}
  </div>`;

  if (wt) {
    html += `<div style="margin-bottom:1rem;">
      <div class="progress-text">${watchedCount} / ${eps.length} watched — ${pct}%</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${S.show.color||'var(--sw-gold)'};"></div></div>
    </div>`;
  }

  html += `<div class="top-actions">
    <span style="font-family:'Orbitron',monospace;font-size:10px;color:var(--sw-muted);margin-left:auto;">${eps.length} episodes</span>
  </div>`;

  gid('wtArea').innerHTML = html;
}

function renderList() {
  const eps = filtered();
  let html = '';
  if (eps.length === 0) {
    html = '<div class="empty-state">No episodes match current filters</div>';
  } else {
    eps.forEach((ep, idx) => { html += renderEpRow(ep, idx+1); });
  }
  gid('epList').innerHTML = html;
}

function renderEpRow(ep, num) {
  const w       = isWatched(ep.id);
  const epCode  = formatAirCode(ep.air_code);
  const dateStr = ep.release_date || (ep.release_year ? String(ep.release_year) : '');

  const epBadge = `<span class="badge badge-ep">${esc(epCode)}</span>`;
  const vBadge  = ep.vitality === 'vital'
    ? `<span class="badge badge-vital">Vital</span>`
    : ep.vitality === 'skippable'
      ? `<span class="badge badge-skip">Non-Ess.</span>`
      : '';
  const qBadge  = ep.quality ? `<span class="badge badge-${ep.quality}">${ep.quality}</span>` : '';
  const tagHtml = (ep.tags||[]).map(t => `<span class="badge badge-tag">${esc(t)}</span>`).join('');
  const noteStr = ep.notes ? ` <span class="item-note">${esc(ep.notes)}</span>` : '';

  return `
    <div class="item-row ${w?'watched':''}" onclick="handleRowClick(event,'${ep.id}')">
      <div class="item-check ${w?'checked':''}">${w?'✓':''}</div>
      <div class="item-num">${num}</div>
      <div class="item-badges">${epBadge}${vBadge}${qBadge}</div>
      <div class="item-title ${w?'watched-title':''}">${esc(ep.title)}${noteStr}${tagHtml?' '+tagHtml:''}</div>
      <div class="item-year">${dateStr}</div>
      <button class="item-edit-btn" onclick="event.stopPropagation();openEditEp('${ep.id}')">Edit</button>
    </div>`;
}

function formatAirCode(code) {
  if (!code) return '?';
  const s = String(code);
  if (s.startsWith('B')) return 'BoBF E' + s.slice(1);
  if (s === 'T') return 'Film';
  if (s.length === 3) return `${s[0]}x${s.slice(1)}`;
  if (s.length === 4) return `${s.slice(0,2)}x${s.slice(2)}`;
  return s;
}

// ── INTERACTIONS ──────────────────────────────────────────────────────────────
function handleRowClick(e, epId) {
  if (e.target.classList.contains('item-edit-btn')) return;
  toggleWatch(epId);
}

function toggleWatch(epId) {
  const wt = getWT();
  if (!wt) { alert('Create or select a watchthrough first!'); return; }
  if (!wt.watched) wt.watched = {};
  wt.watched[epId] = !wt.watched[epId];
  wt.saved = new Date().toISOString();
  save(); render();
}

// ── WATCHTHROUGH CRUD ─────────────────────────────────────────────────────────
function selectWT(id) { S.activeWT = id || null; save(); render(); }

function openNewWT() {
  gid('wtModalBody').innerHTML = `
    <div class="form-group">
      <label class="form-label">Watchthrough Name</label>
      <input class="form-input" id="wtNameInput" placeholder="e.g. First Watch 2024" />
    </div>
    <div class="modal-actions">
      <button class="btn primary" onclick="createWT()">Create</button>
      <button class="btn" onclick="closeModal('wtModal')">Cancel</button>
    </div>`;
  gid('wtModal').classList.add('open');
  setTimeout(() => gid('wtNameInput').focus(), 80);
}

function createWT() {
  const name = gid('wtNameInput').value.trim();
  if (!name) return;
  const wt = { id: genId(), name, watched:{}, created: new Date().toISOString() };
  S.watchthroughs.push(wt);
  S.activeWT = wt.id;
  save(); closeModal('wtModal'); render();
}

function deleteWT() {
  if (!confirm('Delete this watchthrough? Progress will be lost.')) return;
  S.watchthroughs = S.watchthroughs.filter(w => w.id !== S.activeWT);
  S.activeWT = null;
  save(); render();
}

function exportTxt() {
  const lines = filtered().map(e => e.title).join('\n');
  const blob  = new Blob([lines], {type:'text/plain'});
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url; a.download = S.show.id + '-watchlist.txt';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── EPISODE EDIT MODAL ────────────────────────────────────────────────────────
function openEditEp(epId) {
  S.editingEpId = epId;
  const ep = S.episodes.find(e => e.id === epId);
  if (!ep) return;
  gid('itemModalTitle').textContent = 'Edit Episode';
  gid('itemModalBody').innerHTML = buildEpForm(ep);
  gid('itemModal').classList.add('open');
}

function getAllTagsForPool(epId) {
  const ts = new Set();
  S.episodes.forEach(e => (e.tags||[]).forEach(t => ts.add(t)));
  const epTags = (S.episodes.find(e=>e.id===epId)?.tags)||[];
  return [...ts].filter(t => !epTags.includes(t)).sort();
}

function buildEpForm(ep) {
  const sel = (v,m) => v===m?'selected':'';
  const pool = getAllTagsForPool(ep.id);
  return `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input class="form-input" id="ef_title" value="${esc(ep.title)}" />
    </div>
    <div class="form-group">
      <label class="form-label">Episode Code</label>
      <input class="form-input" id="ef_code" value="${esc(String(ep.air_code))}" />
    </div>
    <div class="form-group">
      <label class="form-label">Release Date (YYYY-MM-DD)</label>
      <input class="form-input" id="ef_date" type="date" value="${ep.release_date||''}" />
    </div>
    <div class="form-group">
      <label class="form-label">Release Year</label>
      <input class="form-input" id="ef_year" type="number" value="${ep.release_year||''}" />
    </div>
    <div class="form-group">
      <label class="form-label">Vitality</label>
      <select class="form-select" id="ef_vital">
        <option value="" ${!ep.vitality?'selected':''}>Unknown</option>
        <option value="vital"     ${sel(ep.vitality,'vital')}>Vital</option>
        <option value="skippable" ${sel(ep.vitality,'skippable')}>Non-Essential</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Quality</label>
      <select class="form-select" id="ef_quality">
        <option value=""      ${!ep.quality?'selected':''}>Unknown</option>
        <option value="great" ${sel(ep.quality,'great')}>Great</option>
        <option value="good"  ${sel(ep.quality,'good')}>Good</option>
        <option value="meh"   ${sel(ep.quality,'meh')}>Meh</option>
        <option value="bad"   ${sel(ep.quality,'bad')}>Bad</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <input class="form-input" id="ef_notes" value="${esc(ep.notes||'')}" />
    </div>
    <div class="form-group">
      <label class="form-label">Tags</label>
      <div class="tag-input-row">
        <input class="form-input" id="ef_tagInput" placeholder="Add tag…" onkeydown="tagKeydown(event)" />
        <button class="btn" onclick="addTag()">Add</button>
      </div>
      ${pool.length ? `
        <div class="tag-existing-label">Existing tags — click to add:</div>
        <div class="tag-existing-pool" id="tagPool">
          ${pool.map(t=>`<button class="tag-existing-pill" onclick="addTagDirect('${esc(t)}')">${esc(t)}</button>`).join('')}
        </div>` : '<div id="tagPool" style="display:none"></div>'}
      <div class="tags-display" id="tagsDisplay">
        ${(ep.tags||[]).map(t=>`<span class="tag-pill">${esc(t)}<span class="tag-pill-remove" onclick="removeTag('${esc(t)}')">✕</span></span>`).join('')}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn primary" onclick="saveEp()">Save</button>
      <button class="btn" onclick="closeModal('itemModal')">Cancel</button>
    </div>`;
}

function tagKeydown(e)      { if (e.key==='Enter') { e.preventDefault(); addTag(); } }
function addTagDirect(tag)  { addTagToEp(tag); }
function addTag() {
  const inp = gid('ef_tagInput');
  addTagToEp(slugify(inp.value));
  inp.value = '';
}
function addTagToEp(val) {
  if (!val || !S.editingEpId) return;
  const ep = S.episodes.find(e => e.id === S.editingEpId);
  if (!ep) return;
  if (!ep.tags) ep.tags = [];
  if (!ep.tags.includes(val)) ep.tags.push(val);
  refreshTagsDisplay();
}
function removeTag(tag) {
  const ep = S.episodes.find(e => e.id === S.editingEpId);
  if (!ep) return;
  ep.tags = (ep.tags||[]).filter(t => t !== tag);
  refreshTagsDisplay();
}
function refreshTagsDisplay() {
  const ep    = S.episodes.find(e => e.id === S.editingEpId);
  const tags  = ep?.tags || [];
  gid('tagsDisplay').innerHTML = tags.map(t =>
    `<span class="tag-pill">${esc(t)}<span class="tag-pill-remove" onclick="removeTag('${esc(t)}')">✕</span></span>`
  ).join('');
  const pool     = gid('tagPool');
  const available = getAllTagsForPool(S.editingEpId);
  if (pool) {
    if (available.length) {
      pool.style.display = '';
      pool.innerHTML = available.map(t =>
        `<button class="tag-existing-pill" onclick="addTagDirect('${esc(t)}')">${esc(t)}</button>`
      ).join('');
    } else { pool.style.display = 'none'; }
  }
}

function saveEp() {
  const ep = S.episodes.find(e => e.id === S.editingEpId);
  if (!ep) return;
  ep.title        = gid('ef_title').value.trim() || ep.title;
  ep.air_code     = gid('ef_code').value.trim()  || ep.air_code;
  ep.release_date = gid('ef_date').value.trim()  || undefined;
  ep.release_year = parseInt(gid('ef_year').value) || ep.release_year;
  ep.vitality     = gid('ef_vital').value   || null;
  ep.quality      = gid('ef_quality').value || null;
  ep.notes        = gid('ef_notes').value.trim();
  if (!ep.release_date) delete ep.release_date;
  save(); closeModal('itemModal'); render();
}

// ── DOWNLOAD JSON ─────────────────────────────────────────────────────────────
function downloadJSON() {
  const out = {
    show: S.show,
    episodes: S.episodes.map(ep => {
      const e = {...ep};
      if (!e.tags || e.tags.length === 0) delete e.tags;
      return e;
    }),
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = S.show.id + '_episodes.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
function closeModal(id) { gid(id).classList.remove('open'); }

// ── INIT ──────────────────────────────────────────────────────────────────────
load();
render();
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});
