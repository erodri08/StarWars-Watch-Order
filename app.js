// ─────────────────────────────────────────────────────────────────────────────
// Star Wars Watchlist Maker — app.js
// ─────────────────────────────────────────────────────────────────────────────

// ── STORAGE KEYS ─────────────────────────────────────────────────────────────
const KEYS = {
  WATCHTHROUGHS: 'sw_watchthroughs',
  USER_DATA:     'sw_user_data',
  CW_TAGS:       'sw_cw_tags',
  MAIN_TAGS:     'sw_main_tags',
  CUSTOM_ORDER:  'sw_custom_order',
  HIDDEN_IDS:    'sw_hidden_ids',
};

// ── STATE ─────────────────────────────────────────────────────────────────────
let APP = {
  projectInfo: {},
  items: [],
  releaseOrder: [],
  cwEpisodes: [],

  watchthroughs: [],
  cwWatchthroughs: [],
  customOrder: [],
  cwEpisodeTags: {},
  mainItemTags: {},   // tags for main list items, keyed by item id
  hiddenIds: new Set(),

  activeTab: 'main',
  activeWT: null,
  activeCWWT: null,
  mainFilters: {
    vital: [], quality: [], type: [], tags: [],
    order: 'chronological',
    george: true, post_george: true,
  },
  cwFilters: { vital: [], quality: [], tags: [] },

  editingItemId: null,
  editingCWChronNum: null,
  selectedIds: new Set(),
};

// ── DATA LOAD ─────────────────────────────────────────────────────────────────
async function loadJSONFiles() {
  try {
    APP.projectInfo  = PROJECT_INFO;
    APP.items        = CONTENT_DATA.items || [];
    APP.releaseOrder = CONTENT_DATA.release_order || [];
    APP.cwEpisodes   = CW_DATA.episodes || [];
  } catch (err) {
    console.error('Failed to load data:', err);
  }
}

// ── PERSIST ───────────────────────────────────────────────────────────────────
function loadPersisted() {
  try {
    const wt = localStorage.getItem(KEYS.WATCHTHROUGHS);
    if (wt) {
      const p = JSON.parse(wt);
      APP.watchthroughs   = p.watchthroughs || [];
      APP.cwWatchthroughs = p.clone_wars_watchthroughs || [];
    }
  } catch(e) {}

  try {
    const ud = localStorage.getItem(KEYS.USER_DATA);
    if (ud) {
      const s = (JSON.parse(ud).app_state) || {};
      if (s.activeTab)               APP.activeTab   = s.activeTab;
      if (s.activeWT  !== undefined)  APP.activeWT   = s.activeWT;
      if (s.activeCWWT !== undefined) APP.activeCWWT = s.activeCWWT;
      if (s.mainFilters) APP.mainFilters = { ...APP.mainFilters, ...s.mainFilters };
      if (s.cwFilters)   APP.cwFilters   = { ...APP.cwFilters,   ...s.cwFilters };
    }
  } catch(e) {}

  try {
    const co = localStorage.getItem(KEYS.CUSTOM_ORDER);
    if (co) APP.customOrder = JSON.parse(co);
  } catch(e) {}

  try {
    const tags = localStorage.getItem(KEYS.CW_TAGS);
    if (tags) APP.cwEpisodeTags = JSON.parse(tags);
  } catch(e) {}

  try {
    const mt = localStorage.getItem(KEYS.MAIN_TAGS);
    if (mt) APP.mainItemTags = JSON.parse(mt);
  } catch(e) {}

  try {
    const hidden = localStorage.getItem(KEYS.HIDDEN_IDS);
    if (hidden) APP.hiddenIds = new Set(JSON.parse(hidden));
  } catch(e) {}
}

function saveWatchthroughs() {
  localStorage.setItem(KEYS.WATCHTHROUGHS, JSON.stringify({
    watchthroughs: APP.watchthroughs,
    clone_wars_watchthroughs: APP.cwWatchthroughs,
  }));
}

function saveUserData() {
  localStorage.setItem(KEYS.USER_DATA, JSON.stringify({
    app_state: {
      activeTab: APP.activeTab, activeWT: APP.activeWT, activeCWWT: APP.activeCWWT,
      mainFilters: APP.mainFilters, cwFilters: APP.cwFilters,
    },
  }));
  localStorage.setItem(KEYS.CUSTOM_ORDER, JSON.stringify(APP.customOrder));
  localStorage.setItem(KEYS.CW_TAGS, JSON.stringify(APP.cwEpisodeTags));
  localStorage.setItem(KEYS.MAIN_TAGS, JSON.stringify(APP.mainItemTags));
  localStorage.setItem(KEYS.HIDDEN_IDS, JSON.stringify([...APP.hiddenIds]));
}

function saveAll() {
  saveWatchthroughs();
  saveUserData();
  showSaveFlash();
}

function showSaveFlash() {
  const el = document.getElementById('saveIndicator');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1400);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function generateId() { return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

function getActiveWTObj()   { return APP.watchthroughs.find(w => w.id === APP.activeWT) || null; }
function getActiveCWWTObj() { return APP.cwWatchthroughs.find(w => w.id === APP.activeCWWT) || null; }

function isWatched(itemId) {
  const wt = getActiveWTObj();
  return !!(wt?.watched?.[itemId]);
}
function toggleWatched(itemId) {
  const wt = getActiveWTObj();
  if (!wt) { alert('Create or select a watchthrough first!'); return; }
  if (!wt.watched) wt.watched = {};
  wt.watched[itemId] = !wt.watched[itemId];
  wt.saved = new Date().toISOString();
  saveAll(); render();
}

function isCWWatched(chronNum) {
  const wt = getActiveCWWTObj();
  return !!(wt?.watched?.[String(chronNum)]);
}
function toggleCWWatched(chronNum) {
  const wt = getActiveCWWTObj();
  if (!wt) { alert('Create or select a Clone Wars watchthrough first!'); return; }
  if (!wt.watched) wt.watched = {};
  wt.watched[String(chronNum)] = !wt.watched[String(chronNum)];
  wt.saved = new Date().toISOString();
  saveAll(); render();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatAirCode(code) {
  if (code === 'T') return 'Film';
  if (!code) return '?';
  const s = String(code);
  if (s.length === 3) return `${s[0]}x${s.slice(1)}`;
  if (s.length === 4) return `${s.slice(0,2)}x${s.slice(2)}`;
  return s;
}

// Convert a release_date string "YYYY-MM-DD" or year number to a sortable number.
// Falls back to release_year * 10000 if no date string available.
function releaseSortKey(item) {
  if (item.release_date) {
    // Parse YYYY-MM-DD into a number like 20240101
    const parts = item.release_date.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0])) {
      return parts[0] * 10000 + (parts[1] || 1) * 100 + (parts[2] || 1);
    }
  }
  return (item.release_year || 9999) * 10000;
}

// ── HIDE FROM WATCHTHROUGH ────────────────────────────────────────────────────
function toggleHidden(itemId) {
  if (APP.hiddenIds.has(itemId)) APP.hiddenIds.delete(itemId);
  else APP.hiddenIds.add(itemId);
  saveAll(); render();
}

// ── FILTERING ─────────────────────────────────────────────────────────────────
function getFilteredItems(includeHidden = false) {
  const f = APP.mainFilters;
  // When includeHidden is false, exclude hidden items from the main list
  let items = APP.items.filter(i => includeHidden ? APP.hiddenIds.has(i.id) : !APP.hiddenIds.has(i.id));

  if (f.order === 'release') {
    items.sort((a, b) => releaseSortKey(a) - releaseSortKey(b));
  } else if (f.order === 'custom') {
    const customIds = APP.customOrder;
    const allIds = items.map(i => i.id);
    const inOrder    = customIds.filter(id => allIds.includes(id));
    const notInOrder = allIds.filter(id => !customIds.includes(id));
    const orderMap   = {};
    [...inOrder, ...notInOrder].forEach((id, i) => orderMap[id] = i);
    items.sort((a, b) => (orderMap[a.id] ?? 9999) - (orderMap[b.id] ?? 9999));
  } else {
    items.sort((a, b) => a.timeline_sort_key - b.timeline_sort_key || a.chronological_order - b.chronological_order);
  }

  if (!f.george)      items = items.filter(i => i.is_post_george_lucas);
  if (!f.post_george) items = items.filter(i => !i.is_post_george_lucas);
  if (f.type.length)  items = items.filter(i => f.type.includes(i.type));

  if (f.vital.length) {
    items = items.filter(i =>
      (f.vital.includes('vital') && i.vitality === 'vital') ||
      (f.vital.includes('non-essential') && i.vitality === 'skippable')
    );
  }
  if (f.quality.length) items = items.filter(i => f.quality.includes(i.quality));
  if (f.tags.length) {
    items = items.filter(i => {
      const iTags = APP.mainItemTags[i.id] || [];
      return f.tags.every(t => iTags.includes(t));
    });
  }

  return items;
}

function getFilteredCWEps() {
  const f = APP.cwFilters;
  let eps = APP.cwEpisodes.map(e => ({ ...e }));

  if (f.vital.length) {
    eps = eps.filter(e =>
      (f.vital.includes('vital') && e.vitality === 'vital') ||
      (f.vital.includes('non-essential') && e.vitality === 'skippable')
    );
  }
  if (f.quality.length) eps = eps.filter(e => f.quality.includes(e.quality));
  if (f.tags.length) {
    eps = eps.filter(e => {
      const epTags = APP.cwEpisodeTags[String(e.chron_num)] || [];
      return f.tags.every(t => epTags.includes(t));
    });
  }
  return eps;
}

function getAllCWTags() {
  const tagSet = new Set();
  Object.values(APP.cwEpisodeTags).forEach(tags => tags.forEach(t => tagSet.add(t)));
  return [...tagSet].sort();
}

function getAllMainTags() {
  const tagSet = new Set();
  Object.values(APP.mainItemTags).forEach(tags => tags.forEach(t => tagSet.add(t)));
  return [...tagSet].sort();
}

// ── CUSTOM ORDER SYNC ─────────────────────────────────────────────────────────
function syncCustomOrder() {
  const allIds = APP.items.map(i => i.id);
  APP.customOrder = APP.customOrder.filter(id => allIds.includes(id));
  allIds.forEach(id => { if (!APP.customOrder.includes(id)) APP.customOrder.push(id); });
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function render() {
  renderNav();
  if (APP.activeTab === 'main') renderMain();
  else renderCW();
}

function renderNav() {
  const pi = APP.projectInfo;
  document.getElementById('headerTitle').textContent = `⬡ ${pi.title || 'STAR WARS WATCHLIST MAKER'} ⬡`;
  document.getElementById('headerSub').textContent   = pi.subtitle || 'USE THIS PROGRAM TO CREATE YOUR IDEAL ORDER FOR A STAR WARS WATCHTHROUGH';
  document.getElementById('navTabs').innerHTML = `
    <button class="nav-tab ${APP.activeTab==='main'?'active':''}" onclick="switchTab('main')">◈ Main List</button>
    <button class="nav-tab cw-tab ${APP.activeTab==='cw'?'active':''}" onclick="switchTab('cw')">◈ Clone Wars Episodes</button>
    <button class="btn" style="margin-left:auto" onclick="openExportModal()">⇅ Export / Import</button>
  `;
}

function switchTab(tab) {
  APP.activeTab = tab;
  APP.selectedIds = new Set();
  saveUserData();
  render();
}

// ── SHARED UI PARTIALS ────────────────────────────────────────────────────────
function renderWatchthroughBar(wtList, activeId, onChangeFn, onNewFn, onDeleteFn, onExportFn) {
  const hasActive = !!activeId;
  return `
    <div class="watchthrough-bar">
      <span class="wt-label">Watchthrough:</span>
      <select class="wt-select" onchange="${onChangeFn}(this.value)">
        <option value="">— None —</option>
        ${wtList.map(w => `<option value="${w.id}" ${activeId===w.id?'selected':''}>${escHtml(w.name)}</option>`).join('')}
      </select>
      <button class="btn primary" onclick="${onNewFn}()">+ New</button>
      ${hasActive ? `<button class="btn danger" onclick="${onDeleteFn}()">Delete</button>` : ''}
      ${hasActive ? `<button class="btn success" onclick="${onExportFn}()">↓ Export List</button>` : ''}
    </div>
  `;
}

// onToggleFn: plain global function name, category: first arg passed to it
function renderFilterPanel(title, items, activeArr, onToggleFn, category) {
  return `
    <div class="panel" style="flex:1; min-width:180px;">
      <div class="panel-title">${title}</div>
      <div class="filter-chips">
        ${items.map(([val, label, cls]) =>
          `<button class="chip ${activeArr.includes(val) ? cls : ''}" onclick="${onToggleFn}('${category}','${val}')">${label}</button>`
        ).join('')}
      </div>
    </div>
  `;
}

function renderProgressBar(watched, total, color = 'var(--sw-gold)') {
  const pct = total > 0 ? Math.round(watched/total*100) : 0;
  return `
    <div style="margin-bottom:1rem;">
      <div class="progress-text">${watched} / ${total} watched — ${pct}%</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color};"></div></div>
    </div>
  `;
}

// ── MAIN LIST RENDER ──────────────────────────────────────────────────────────
function renderMain() {
  const items    = getFilteredItems(false);
  const hidden   = getFilteredItems(true);  // hidden items (apply same filters)
  const wt       = getActiveWTObj();
  const isCustom = APP.mainFilters.order === 'custom';
  const sel      = APP.selectedIds;

  const vitalOpts = [['vital','Vital','active-vital'],['non-essential','Non-Essential','active-skippable']];
  const typeOpts  = [['movie','Movie','active-movie'],['tv','TV','active-tv'],['game','Game','active-game']];
  const qualOpts  = [['great','Great','active-great'],['good','Good','active-good'],['meh','Meh','active-meh'],['bad','Bad','active-bad']];
  const allMainTags = getAllMainTags();

  let html = `
    <div class="section-row" style="gap:1rem; align-items:stretch;">
      <div class="panel" style="flex:1; min-width:260px;">
        <div class="panel-title">Sort Order</div>
        <div class="filter-chips">
          ${['chronological','release','custom'].map(o =>
            `<button class="chip ${APP.mainFilters.order===o?'active-order':''}" onclick="setOrder('${o}')">${o.charAt(0).toUpperCase()+o.slice(1)}</button>`
          ).join('')}
        </div>
      </div>
      ${renderFilterPanel('Vitality', vitalOpts, APP.mainFilters.vital, 'toggleFilter', 'vital')}
      ${renderFilterPanel('Type', typeOpts, APP.mainFilters.type, 'toggleFilter', 'type')}
    </div>
    <div class="section-row" style="gap:1rem; align-items:stretch;">
      ${renderFilterPanel('Quality', qualOpts, APP.mainFilters.quality, 'toggleFilter', 'quality')}
      <div class="panel" style="flex:1; min-width:220px;">
        <div class="panel-title">Era</div>
        <div class="filter-chips">
          <button class="chip ${APP.mainFilters.george?'active-post':''}" onclick="toggleEra('george')">${APP.mainFilters.george?'George Lucas ✓':'George Lucas'}</button>
          <button class="chip ${APP.mainFilters.post_george?'active-post':''}" onclick="toggleEra('post_george')">${APP.mainFilters.post_george?'Post-George ✓':'Post-George'}</button>
        </div>
      </div>
      ${allMainTags.length ? `
      <div class="panel" style="flex:2; min-width:220px;">
        <div class="panel-title">Tags</div>
        <div class="filter-chips">
          ${allMainTags.map(t => `<button class="chip ${APP.mainFilters.tags.includes(t)?'active-tag':''}" onclick="toggleFilter('tags','${t}')">${t}</button>`).join('')}
        </div>
      </div>` : ''}
    </div>
  `;

  html += renderWatchthroughBar(APP.watchthroughs, APP.activeWT, 'selectWT', 'openNewWTModal', 'deleteWT', 'exportWatchlistTxt');

  if (wt) html += renderProgressBar(items.filter(i => isWatched(i.id)).length, items.length);

  html += `<div class="top-actions">
    <button class="btn primary" onclick="openAddItemModal()">+ Add Entry</button>`;

  if (isCustom && sel.size > 0) {
    html += `
      <span class="multi-sel-info">${sel.size} selected</span>
      <button class="btn" onclick="moveSelectedUp()">▲ Move Up</button>
      <button class="btn" onclick="moveSelectedDown()">▼ Move Down</button>
      <button class="btn danger" onclick="clearSelection()">✕ Clear</button>
    `;
  }

  html += `<span style="font-family:'Orbitron',monospace;font-size:10px;color:var(--sw-muted);margin-left:auto;">${items.length} entries</span>
  </div>`;

  if (isCustom) {
    html += `<div class="custom-order-hint">⠿ DRAG TO REORDER — OR SELECT MULTIPLE ROWS AND USE ▲ ▼ BUTTONS</div>`;
  }

  html += `<div class="items-list" id="mainItemsList">`;
  if (items.length === 0) html += `<div class="empty-state">No entries match current filters</div>`;
  items.forEach((item, idx) => html += renderItemRow(item, idx+1, isWatched(item.id), isCustom, false));
  html += `</div>`;

  // ── Hidden section ────────────────────────────────────────────────────────
  if (APP.hiddenIds.size > 0) {
    const hiddenFiltered = APP.items.filter(i => APP.hiddenIds.has(i.id));
    html += `
      <div class="hidden-section">
        <div class="hidden-section-header">
          <span class="hidden-section-title">◈ Hidden from Watchthrough</span>
          <span class="hidden-section-count">${hiddenFiltered.length} entr${hiddenFiltered.length===1?'y':'ies'}</span>
        </div>
        <div class="items-list">
    `;
    hiddenFiltered.forEach((item, idx) => html += renderItemRow(item, idx+1, isWatched(item.id), false, true));
    html += `</div></div>`;
  }

  document.getElementById('appContent').innerHTML = html;
  if (isCustom) initDragDrop();
}

function renderItemRow(item, num, watched, draggable, isHidden) {
  const sel = APP.selectedIds.has(item.id);
  const vBadge  = `<span class="badge badge-${item.vitality==='vital'?'vital':'skip'}">${item.vitality==='vital'?'Vital':'Non-Ess.'}</span>`;
  const qBadge  = item.quality ? `<span class="badge badge-${item.quality}">${item.quality}</span>` : '';
  const tBadge  = `<span class="badge badge-${item.type}">${item.type}</span>`;
  const glTag   = !item.is_post_george_lucas ? '<span class="gl-tag" title="George Lucas era">GL</span>' : '';
  const noteStr = item.notes ? ` <span class="item-note">${item.notes}</span>` : '';
  const dateStr = item.release_date
    ? item.release_date
    : (item.release_year ? String(item.release_year) : '');
  const itemTags  = APP.mainItemTags[item.id] || [];
  const tagHtml   = itemTags.map(t => `<span class="badge badge-tag">${t}</span>`).join('');

  const hideBtn = !isHidden
    ? `<button class="item-hide-btn" title="Hide from watchthrough" onclick="event.stopPropagation(); toggleHidden('${item.id}')">Hide</button>`
    : `<button class="item-hide-btn item-hide-btn--show" title="Add back to watchthrough" onclick="event.stopPropagation(); toggleHidden('${item.id}')">Show</button>`;

  return `
    <div class="item-row ${watched?'watched':''} ${draggable?'draggable':''} ${sel?'selected':''} ${isHidden?'hidden-row':''}"
         data-id="${item.id}"
         ${draggable ? 'draggable="true"' : ''}
         onclick="${isHidden ? '' : `handleItemClick(event, '${item.id}')`}">
      ${draggable ? `<span class="drag-handle" title="Drag to reorder">⠿</span>` : ''}
      <div class="item-check ${watched&&!isHidden?'checked':''}">${watched&&!isHidden?'✓':''}</div>
      <div class="item-num">${num}</div>
      <div class="item-badges">${vBadge}${tBadge}${qBadge}</div>
      <div class="item-title ${watched&&!isHidden?'watched-title':''}">${item.title}${glTag}${noteStr}${tagHtml ? ' '+tagHtml : ''}</div>
      <div class="item-year">${dateStr}</div>
      <div class="item-set">${item.timeline_position||''}</div>
      ${hideBtn}
      <button class="item-edit-btn" onclick="event.stopPropagation(); openEditItemModal('${item.id}')">Edit</button>
    </div>
  `;
}

// ── CLONE WARS RENDER ─────────────────────────────────────────────────────────
function renderCW() {
  const eps     = getFilteredCWEps();
  const cwwt    = getActiveCWWTObj();
  const allTags = getAllCWTags();

  const vitalOpts = [['vital','Vital','active-vital'],['non-essential','Non-Essential','active-skippable']];
  const qualOpts  = [['great','Great','active-great'],['good','Good','active-good'],['meh','Meh','active-meh'],['bad','Bad','active-bad']];

  let html = `
    <div class="section-row" style="gap:1rem; align-items:stretch;">
      ${renderFilterPanel('Vital / Skippable', vitalOpts, APP.cwFilters.vital, 'toggleCWFilter', 'vital')}
      ${renderFilterPanel('Quality', qualOpts, APP.cwFilters.quality, 'toggleCWFilter', 'quality')}
      ${allTags.length ? `
      <div class="panel" style="flex:2; min-width:220px;">
        <div class="panel-title">Tags</div>
        <div class="filter-chips">
          ${allTags.map(t => `<button class="chip ${APP.cwFilters.tags.includes(t)?'active-tag':''}" onclick="toggleCWFilter('tags','${t}')">${t}</button>`).join('')}
        </div>
      </div>` : ''}
    </div>
  `;

  html += renderWatchthroughBar(APP.cwWatchthroughs, APP.activeCWWT, 'selectCWWT', 'openNewCWWTModal', 'deleteCWWT', 'exportCWWatchlistTxt');

  if (cwwt) html += renderProgressBar(eps.filter(e => isCWWatched(e.chron_num)).length, eps.length, '#64B4FF');

  html += `<div class="top-actions">
    <span style="font-family:'Orbitron',monospace;font-size:10px;color:var(--sw-muted);">Chronological Order — ${eps.length} episodes</span>
  </div>`;

  html += `<div class="items-list">`;
  if (eps.length === 0) html += `<div class="empty-state">No episodes match current filters</div>`;

  eps.forEach((ep, listIdx) => {
    const w = isCWWatched(ep.chron_num);
    // ep code first, then vital, then quality
    const epBadge = `<span class="badge badge-ep">${formatAirCode(ep.air_code)}</span>`;
    const vBadge  = ep.vitality === 'vital'
      ? `<span class="badge badge-vital">Vital</span>`
      : ep.vitality === 'skippable'
        ? `<span class="badge badge-skip">Non-Ess.</span>`
        : '';
    const qBadge  = ep.quality ? `<span class="badge badge-${ep.quality}">${ep.quality}</span>` : '';
    const epTags  = APP.cwEpisodeTags[String(ep.chron_num)] || [];
    const tagHtml = epTags.map(t => `<span class="badge badge-tag">${t}</span>`).join('');

    html += `
      <div class="item-row ${w?'watched':''}" onclick="toggleCWWatched('${ep.chron_num}')">
        <div class="item-check ${w?'checked':''}">${w?'✓':''}</div>
        <div class="item-num">${listIdx+1}</div>
        <div class="item-badges">${epBadge}${vBadge}${qBadge}</div>
        <div class="item-title ${w?'watched-title':''}">${ep.title}${tagHtml ? ' '+tagHtml : ''}</div>
        <button class="item-edit-btn" onclick="event.stopPropagation();openEditCWEpModal('${ep.chron_num}')">Edit</button>
      </div>
    `;
  });

  html += `</div>`;
  document.getElementById('appContent').innerHTML = html;
}

// ── DRAG AND DROP (Custom Order) ──────────────────────────────────────────────
function initDragDrop() {
  const list = document.getElementById('mainItemsList');
  if (!list) return;
  let dragSrc = null;

  list.querySelectorAll('.item-row.draggable').forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrc = row;
      setTimeout(() => row.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      list.querySelectorAll('.item-row').forEach(r => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (row !== dragSrc) {
        list.querySelectorAll('.item-row').forEach(r => r.classList.remove('drag-over'));
        row.classList.add('drag-over');
      }
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      if (dragSrc && dragSrc !== row) {
        row.classList.remove('drag-over');
        const rows   = [...list.querySelectorAll('.item-row[data-id]')];
        const ids    = rows.map(r => r.dataset.id);
        const srcIdx = ids.indexOf(dragSrc.dataset.id);
        const dstIdx = ids.indexOf(row.dataset.id);
        ids.splice(srcIdx, 1);
        ids.splice(dstIdx, 0, dragSrc.dataset.id);
        updateCustomOrderFromVisible(ids);
        saveAll(); render();
      }
    });
  });
}

function updateCustomOrderFromVisible(visibleIds) {
  const allIds = [...APP.customOrder];
  const result = [];
  let vi = 0;
  for (const id of allIds) {
    if (visibleIds.includes(id)) result.push(visibleIds[vi++]);
    else result.push(id);
  }
  while (vi < visibleIds.length) result.push(visibleIds[vi++]);
  APP.customOrder = result;
}

// ── MULTI-SELECT (Custom Order) ───────────────────────────────────────────────
function toggleSelectItem(itemId) {
  if (APP.selectedIds.has(itemId)) APP.selectedIds.delete(itemId);
  else APP.selectedIds.add(itemId);
  render();
}

function clearSelection() {
  APP.selectedIds = new Set();
  render();
}

function moveSelectedUp() {
  if (APP.selectedIds.size === 0) return;
  const items      = getFilteredItems(false);
  const visibleIds = items.map(i => i.id);
  const firstSelIdx = visibleIds.findIndex(id => APP.selectedIds.has(id));
  if (firstSelIdx === 0) return;
  const newVisible = [...visibleIds];
  for (let i = 0; i < newVisible.length; i++) {
    if (APP.selectedIds.has(newVisible[i]) && i > 0 && !APP.selectedIds.has(newVisible[i-1])) {
      [newVisible[i-1], newVisible[i]] = [newVisible[i], newVisible[i-1]];
    }
  }
  updateCustomOrderFromVisible(newVisible);
  saveAll(); render();
}

function moveSelectedDown() {
  if (APP.selectedIds.size === 0) return;
  const items      = getFilteredItems(false);
  const visibleIds = items.map(i => i.id);
  const lastSelIdx = visibleIds.map((id, i) => APP.selectedIds.has(id) ? i : -1).filter(i => i >= 0).pop();
  if (lastSelIdx === visibleIds.length - 1) return;
  const newVisible = [...visibleIds];
  for (let i = newVisible.length - 1; i >= 0; i--) {
    if (APP.selectedIds.has(newVisible[i]) && i < newVisible.length - 1 && !APP.selectedIds.has(newVisible[i+1])) {
      [newVisible[i], newVisible[i+1]] = [newVisible[i+1], newVisible[i]];
    }
  }
  updateCustomOrderFromVisible(newVisible);
  saveAll(); render();
}

// ── FILTER ACTIONS ────────────────────────────────────────────────────────────
function toggleFilter(category, value) {
  const arr = APP.mainFilters[category];
  const idx = arr.indexOf(value);
  if (idx >= 0) arr.splice(idx, 1); else arr.push(value);
  saveUserData(); render();
}

function setOrder(order) {
  if (order === 'custom') syncCustomOrder();
  APP.mainFilters.order = order;
  APP.selectedIds = new Set();
  saveUserData(); render();
}

function toggleEra(key) {
  APP.mainFilters[key] = !APP.mainFilters[key];
  saveUserData(); render();
}

function toggleCWFilter(category, value) {
  const arr = APP.cwFilters[category];
  const idx = arr.indexOf(value);
  if (idx >= 0) arr.splice(idx, 1); else arr.push(value);
  saveUserData(); render();
}

// ── WATCHTHROUGH ACTIONS ──────────────────────────────────────────────────────
function selectWT(id)   { APP.activeWT   = id || null; saveAll(); render(); }
function selectCWWT(id) { APP.activeCWWT = id || null; saveAll(); render(); }

function openNewWTModal()   { showWTModal('New Watchthrough', 'e.g. First Watch 2024', 'createWT'); }
function openNewCWWTModal() { showWTModal('New Clone Wars Watchthrough', 'e.g. Clone Wars Run 2024', 'createCWWT'); }

function showWTModal(title, placeholder, saveFn) {
  document.getElementById('wtModalBody').innerHTML = `
    <div class="form-group">
      <label class="form-label">${title}</label>
      <input class="form-input" id="wtNameInput" placeholder="${placeholder}" />
    </div>
    <div class="modal-actions">
      <button class="btn primary" onclick="${saveFn}()">Create</button>
      <button class="btn" onclick="closeModal('wtModal')">Cancel</button>
    </div>
  `;
  document.getElementById('wtModal').classList.add('open');
  setTimeout(() => document.getElementById('wtNameInput').focus(), 100);
}

function createWT() {
  const name = document.getElementById('wtNameInput').value.trim();
  if (!name) return;
  const wt = { id: generateId(), name, watched: {}, created: new Date().toISOString(), saved: new Date().toISOString() };
  APP.watchthroughs.push(wt);
  APP.activeWT = wt.id;
  saveAll(); closeModal('wtModal'); render();
}

function createCWWT() {
  const name = document.getElementById('wtNameInput').value.trim();
  if (!name) return;
  const wt = { id: generateId(), name, watched: {}, created: new Date().toISOString(), saved: new Date().toISOString() };
  APP.cwWatchthroughs.push(wt);
  APP.activeCWWT = wt.id;
  saveAll(); closeModal('wtModal'); render();
}

function deleteWT() {
  if (!confirm('Delete this watchthrough? All progress will be lost.')) return;
  APP.watchthroughs = APP.watchthroughs.filter(w => w.id !== APP.activeWT);
  APP.activeWT = null;
  saveAll(); render();
}

function deleteCWWT() {
  if (!confirm('Delete this Clone Wars watchthrough? All progress will be lost.')) return;
  APP.cwWatchthroughs = APP.cwWatchthroughs.filter(w => w.id !== APP.activeCWWT);
  APP.activeCWWT = null;
  saveAll(); render();
}

// ── EXPORT WATCHLIST AS TXT ───────────────────────────────────────────────────
function exportWatchlistTxt() {
  const items = getFilteredItems(false);
  downloadTxt(items.map(i => i.title).join('\n'), 'watchlist.txt');
}

function exportCWWatchlistTxt() {
  downloadTxt(getFilteredCWEps().map(e => e.title).join('\n'), 'cw-watchlist.txt');
}

function downloadTxt(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── ITEM CLICK HANDLER ────────────────────────────────────────────────────────
function handleItemClick(event, itemId) {
  if (event.target.classList.contains('drag-handle')) return;
  if (event.target.classList.contains('item-edit-btn')) return;
  if (event.target.classList.contains('item-hide-btn')) return;

  const isCustom = APP.mainFilters.order === 'custom';
  if (isCustom && (event.ctrlKey || event.metaKey || event.shiftKey)) {
    toggleSelectItem(itemId);
    return;
  }
  toggleWatched(itemId);
}

// ── ITEM EDIT MODALS ──────────────────────────────────────────────────────────
function openAddItemModal() {
  APP.editingItemId = generateId();  // pre-generate so tags can be attached immediately
  document.getElementById('itemModalTitle').textContent = 'Add New Entry';
  document.getElementById('itemModalBody').innerHTML = buildItemForm(null);
  document.getElementById('itemModal').classList.add('open');
}

function openEditItemModal(id) {
  APP.editingItemId = id;
  const item = APP.items.find(i => i.id === id);
  document.getElementById('itemModalTitle').textContent = 'Edit Entry';
  document.getElementById('itemModalBody').innerHTML = buildItemForm(item);
  document.getElementById('itemModal').classList.add('open');
}

function buildItemForm(item) {
  const sel = (val, match) => val === match ? 'selected' : '';
  const itemTags = APP.mainItemTags[item?.id] || [];
  return `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input class="form-input" id="ef_title" value="${item ? escHtml(item.title) : ''}" placeholder="Entry title" />
    </div>
    <div class="form-group">
      <label class="form-label">Release Date (YYYY-MM-DD) <span style="color:var(--sw-muted);font-size:11px;">used for release sort order</span></label>
      <input class="form-input" id="ef_date" type="date" value="${item?.release_date || ''}" />
    </div>
    <div class="form-group">
      <label class="form-label">Release Year <span style="color:var(--sw-muted);font-size:11px;">displayed if no date set</span></label>
      <input class="form-input" id="ef_year" type="number" value="${item ? item.release_year : new Date().getFullYear()}" />
    </div>
    <div class="form-group">
      <label class="form-label">Set In (timeline)</label>
      <input class="form-input" id="ef_setIn" value="${item ? escHtml(item.timeline_position||'') : ''}" placeholder="e.g. 19 BBY" />
    </div>
    <div class="form-group">
      <label class="form-label">Timeline Sort Key <span style="color:var(--sw-muted);font-size:11px;">BBY = negative, ABY = positive</span></label>
      <input class="form-input" id="ef_setSort" type="number" step="0.1" value="${item ? item.timeline_sort_key : 0}" />
    </div>
    <div class="form-group">
      <label class="form-label">Type</label>
      <select class="form-select" id="ef_type">
        <option value="movie" ${sel(item?.type,'movie')}>Movie</option>
        <option value="tv"    ${sel(item?.type,'tv')}>TV</option>
        <option value="game"  ${sel(item?.type,'game')}>Game</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Vitality</label>
      <select class="form-select" id="ef_vital">
        <option value="vital"     ${sel(item?.vitality,'vital')}>Vital</option>
        <option value="skippable" ${sel(item?.vitality,'skippable')}>Non-Essential</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Quality</label>
      <select class="form-select" id="ef_quality">
        <option value=""      ${!item?.quality?'selected':''}>Unknown</option>
        <option value="great" ${sel(item?.quality,'great')}>Great</option>
        <option value="good"  ${sel(item?.quality,'good')}>Good</option>
        <option value="meh"   ${sel(item?.quality,'meh')}>Meh</option>
        <option value="bad"   ${sel(item?.quality,'bad')}>Bad</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">George Lucas Era?</label>
      <select class="form-select" id="ef_postLucas">
        <option value="false" ${!item?.is_post_george_lucas?'selected':''}>Yes (George Lucas)</option>
        <option value="true"  ${item?.is_post_george_lucas?'selected':''}>No (Post-George)</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <input class="form-input" id="ef_notes" value="${item ? escHtml(item.notes||'') : ''}" placeholder="Optional notes" />
    </div>
    <div class="form-group">
      <label class="form-label">Tags</label>
      <div class="tag-input-row">
        <input class="form-input" id="ef_tagInput" placeholder="e.g. skywalker, dark-side, mandalore" onkeydown="mainTagKeydown(event)" />
        <button class="btn" onclick="addMainTag()">Add</button>
      </div>
      <div class="tags-display" id="mainTagsDisplay">
        ${itemTags.map(t => `
          <span class="tag-pill">${escHtml(t)}
            <span class="tag-pill-remove" onclick="removeMainTag('${escHtml(t)}')">✕</span>
          </span>`).join('')}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn primary" onclick="saveItem()">Save</button>
      ${item ? `<button class="btn danger" onclick="deleteItem('${item.id}')">Delete</button>` : ''}
      <button class="btn" onclick="closeModal('itemModal')">Cancel</button>
    </div>
  `;
}

function saveItem() {
  const title = document.getElementById('ef_title').value.trim();
  if (!title) { alert('Title is required'); return; }
  const dateVal = document.getElementById('ef_date').value.trim();
  const data = {
    title,
    release_date:         dateVal || undefined,
    release_year:         parseInt(document.getElementById('ef_year').value) || new Date().getFullYear(),
    timeline_position:    document.getElementById('ef_setIn').value.trim(),
    timeline_sort_key:    parseFloat(document.getElementById('ef_setSort').value) || 0,
    type:                 document.getElementById('ef_type').value,
    vitality:             document.getElementById('ef_vital').value,
    quality:              document.getElementById('ef_quality').value || null,
    is_post_george_lucas: document.getElementById('ef_postLucas').value === 'true',
    notes:                document.getElementById('ef_notes').value.trim(),
  };
  if (!data.release_date) delete data.release_date;

  const existingItem = APP.items.find(i => i.id === APP.editingItemId);
  if (existingItem) {
    // Editing existing item
    Object.assign(existingItem, data);
  } else {
    // Adding new item — reuse the pre-generated id so tags are already attached
    const newItem = {
      ...data,
      id: APP.editingItemId,
      chronological_order: Math.max(...APP.items.map(i => i.chronological_order || 0), 0) + 1,
    };
    APP.items.push(newItem);
    const newKey = releaseSortKey(newItem);
    const insertIdx = APP.releaseOrder.findIndex(id => {
      const existing = APP.items.find(i => i.id === id);
      return existing && releaseSortKey(existing) > newKey;
    });
    if (insertIdx === -1) APP.releaseOrder.push(newItem.id);
    else APP.releaseOrder.splice(insertIdx, 0, newItem.id);
    APP.customOrder.push(newItem.id);
  }
  saveAll(); closeModal('itemModal'); render();
}

function deleteItem(id) {
  if (!confirm('Delete this entry?')) return;
  APP.items        = APP.items.filter(i => i.id !== id);
  APP.releaseOrder = APP.releaseOrder.filter(i => i !== id);
  APP.customOrder  = APP.customOrder.filter(i => i !== id);
  APP.hiddenIds.delete(id);
  delete APP.mainItemTags[id];
  saveAll(); closeModal('itemModal'); render();
}

// ── MAIN ITEM TAG FUNCTIONS ───────────────────────────────────────────────────
function mainTagKeydown(e) { if (e.key === 'Enter') { e.preventDefault(); addMainTag(); } }

function addMainTag() {
  const input = document.getElementById('ef_tagInput');
  const val   = input.value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!val || !APP.editingItemId) return;
  const tags = APP.mainItemTags[APP.editingItemId] || [];
  if (!tags.includes(val)) APP.mainItemTags[APP.editingItemId] = [...tags, val];
  input.value = '';
  refreshMainTagsDisplay();
}

function removeMainTag(tag) {
  if (!APP.editingItemId) return;
  APP.mainItemTags[APP.editingItemId] = (APP.mainItemTags[APP.editingItemId] || []).filter(t => t !== tag);
  refreshMainTagsDisplay();
}

function refreshMainTagsDisplay() {
  const tags = APP.mainItemTags[APP.editingItemId] || [];
  document.getElementById('mainTagsDisplay').innerHTML = tags.map(t => `
    <span class="tag-pill">${escHtml(t)}
      <span class="tag-pill-remove" onclick="removeMainTag('${escHtml(t)}')">✕</span>
    </span>`).join('');
}

// ── CW EPISODE EDIT MODAL ─────────────────────────────────────────────────────
function openEditCWEpModal(chronNum) {
  APP.editingCWChronNum = String(chronNum);
  const ep = APP.cwEpisodes.find(e => String(e.chron_num) === String(chronNum));
  if (!ep) return;
  document.getElementById('itemModalTitle').textContent = 'Edit Clone Wars Episode';
  document.getElementById('itemModalBody').innerHTML = buildCWEpForm(ep, APP.cwEpisodeTags[String(chronNum)] || []);
  document.getElementById('itemModal').classList.add('open');
}

function buildCWEpForm(ep, epTags) {
  const sel = (val, match) => val === match ? 'selected' : '';
  return `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input class="form-input" id="cwef_title" value="${escHtml(ep.title)}" />
    </div>
    <div class="form-group">
      <label class="form-label">Episode Code (e.g. 301 = S3E1)</label>
      <input class="form-input" id="cwef_ep" value="${escHtml(String(ep.air_code))}" />
    </div>
    <div class="form-group">
      <label class="form-label">Vitality</label>
      <select class="form-select" id="cwef_vital">
        <option value=""          ${!ep.vitality?'selected':''}>Unknown</option>
        <option value="vital"     ${sel(ep.vitality,'vital')}>Vital</option>
        <option value="skippable" ${sel(ep.vitality,'skippable')}>Skippable</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Quality</label>
      <select class="form-select" id="cwef_quality">
        <option value=""      ${!ep.quality?'selected':''}>Unknown</option>
        <option value="great" ${sel(ep.quality,'great')}>Great</option>
        <option value="good"  ${sel(ep.quality,'good')}>Good</option>
        <option value="meh"   ${sel(ep.quality,'meh')}>Meh</option>
        <option value="bad"   ${sel(ep.quality,'bad')}>Bad</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <input class="form-input" id="cwef_notes" value="${escHtml(ep.notes||'')}" />
    </div>
    <div class="form-group">
      <label class="form-label">Tags</label>
      <div class="tag-input-row">
        <input class="form-input" id="cwef_tagInput" placeholder="e.g. anakin, ahsoka, maul" onkeydown="cwTagKeydown(event)" />
        <button class="btn" onclick="addCWTag()">Add</button>
      </div>
      <div class="tags-display" id="cwTagsDisplay">
        ${epTags.map(t => `
          <span class="tag-pill">${escHtml(t)}
            <span class="tag-pill-remove" onclick="removeCWTag('${escHtml(t)}')">✕</span>
          </span>`).join('')}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn primary" onclick="saveCWEp()">Save</button>
      <button class="btn" onclick="closeModal('itemModal')">Cancel</button>
    </div>
  `;
}

function cwTagKeydown(e) { if (e.key === 'Enter') { e.preventDefault(); addCWTag(); } }

function addCWTag() {
  const input  = document.getElementById('cwef_tagInput');
  const val    = input.value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!val) return;
  const epTags = APP.cwEpisodeTags[APP.editingCWChronNum] || [];
  if (!epTags.includes(val)) APP.cwEpisodeTags[APP.editingCWChronNum] = [...epTags, val];
  input.value = '';
  refreshCWTagsDisplay();
}

function removeCWTag(tag) {
  APP.cwEpisodeTags[APP.editingCWChronNum] = (APP.cwEpisodeTags[APP.editingCWChronNum] || []).filter(t => t !== tag);
  refreshCWTagsDisplay();
}

function refreshCWTagsDisplay() {
  const epTags = APP.cwEpisodeTags[APP.editingCWChronNum] || [];
  document.getElementById('cwTagsDisplay').innerHTML = epTags.map(t => `
    <span class="tag-pill">${escHtml(t)}
      <span class="tag-pill-remove" onclick="removeCWTag('${escHtml(t)}')">✕</span>
    </span>`).join('');
}

function saveCWEp() {
  const ep = APP.cwEpisodes.find(e => String(e.chron_num) === APP.editingCWChronNum);
  if (!ep) return;
  ep.title    = document.getElementById('cwef_title').value.trim() || ep.title;
  ep.air_code = document.getElementById('cwef_ep').value.trim() || ep.air_code;
  ep.vitality = document.getElementById('cwef_vital').value || null;
  ep.quality  = document.getElementById('cwef_quality').value || null;
  ep.notes    = document.getElementById('cwef_notes').value.trim();
  saveAll(); closeModal('itemModal'); render();
}

// ── EXPORT / IMPORT ───────────────────────────────────────────────────────────
function openExportModal() {
  const exportData = JSON.stringify({
    version: 5,
    exported: new Date().toISOString(),
    watchthroughs: APP.watchthroughs,
    cwWatchthroughs: APP.cwWatchthroughs,
    customOrder: APP.customOrder,
    cwEpisodeTags: APP.cwEpisodeTags,
    mainItemTags: APP.mainItemTags,
    hiddenIds: [...APP.hiddenIds],
    appState: {
      activeWT: APP.activeWT, activeCWWT: APP.activeCWWT,
      mainFilters: APP.mainFilters, cwFilters: APP.cwFilters,
    },
  }, null, 2);

  document.getElementById('exportModalBody').innerHTML = `
    <p style="color:var(--sw-muted);font-size:13px;margin-bottom:1rem;">
      Exports watchthrough progress, custom ordering, hidden items, and tags.
      Content data (episodes, movies) comes from <code>data.js</code>.
    </p>
    <textarea id="exportText" style="width:100%;height:200px;background:var(--sw-panel2);border:1px solid var(--sw-border);color:var(--sw-text);font-family:monospace;font-size:11px;padding:10px;border-radius:2px;resize:vertical;">${exportData}</textarea>
    <div class="modal-actions">
      <button class="btn primary" onclick="copyExport()">Copy to Clipboard</button>
      <button class="btn success" onclick="importData()">Import from above</button>
      <button class="btn" onclick="closeModal('exportModal')">Close</button>
    </div>
    <p id="exportMsg" style="color:#81C784;font-size:12px;margin-top:8px;display:none;">Copied!</p>

    <div class="export-divider"></div>
    <div class="export-section-title">↓ Download Content JSONs</div>
    <p style="color:var(--sw-muted);font-size:12px;margin-bottom:0.75rem;line-height:1.5;">
      Downloads your current in-app content as JSON files, including any edits made to titles,
      dates, vitality, quality, or notes. Replace the files in <code>data/</code> and re-run
      <code>generate_data.py</code> to update <code>data.js</code>.
    </p>
    <div class="modal-actions">
      <button class="btn" onclick="downloadContentJSON()">↓ starwars_content.json</button>
      <button class="btn" onclick="downloadCWJSON()">↓ clone_wars_episodes.json</button>
    </div>
  `;
  document.getElementById('exportModal').classList.add('open');
}

function copyExport() {
  navigator.clipboard.writeText(document.getElementById('exportText').value).then(() => {
    const msg = document.getElementById('exportMsg');
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 2000);
  });
}

function importData() {
  try {
    const data = JSON.parse(document.getElementById('exportText').value);
    if (data.watchthroughs)   APP.watchthroughs   = data.watchthroughs;
    if (data.cwWatchthroughs) APP.cwWatchthroughs  = data.cwWatchthroughs;
    if (data.customOrder)     APP.customOrder      = data.customOrder;
    if (data.cwEpisodeTags)   APP.cwEpisodeTags    = data.cwEpisodeTags;
    if (data.mainItemTags)    APP.mainItemTags     = data.mainItemTags;
    if (data.hiddenIds)       APP.hiddenIds        = new Set(data.hiddenIds);
    if (data.appState) {
      if (data.appState.activeWT   !== undefined) APP.activeWT   = data.appState.activeWT;
      if (data.appState.activeCWWT !== undefined) APP.activeCWWT = data.appState.activeCWWT;
      if (data.appState.mainFilters) APP.mainFilters = { ...APP.mainFilters, ...data.appState.mainFilters };
      if (data.appState.cwFilters)   APP.cwFilters   = { ...APP.cwFilters,   ...data.appState.cwFilters };
    }
    saveAll(); closeModal('exportModal'); render();
    alert('Data imported successfully!');
  } catch(e) {
    alert('Invalid JSON data. Please check and try again.');
  }
}

function downloadContentJSON() {
  downloadTxt(JSON.stringify({ items: APP.items, release_order: APP.releaseOrder }, null, 2), 'starwars_content.json');
}

function downloadCWJSON() {
  const episodes = APP.cwEpisodes.map(ep => {
    const tags = APP.cwEpisodeTags[String(ep.chron_num)];
    if (tags && tags.length > 0) return { ...ep, tags };
    const { tags: _removed, ...rest } = ep;
    return rest;
  });
  downloadTxt(JSON.stringify({ episodes }, null, 2), 'clone_wars_episodes.json');
}

// ── MODAL UTILS ───────────────────────────────────────────────────────────────
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadJSONFiles();
  loadPersisted();
  syncCustomOrder();
  render();
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

init();
