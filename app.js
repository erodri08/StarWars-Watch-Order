// ─────────────────────────────────────────────────────────────────────────────
// Star wars watchlist maker — app.js
// All data loaded from /data/*.json; all changes persisted back via localStorage
// (since this is a local file-based app with no server, we use localStorage for
//  persistence and provide export/import for portability)
// ─────────────────────────────────────────────────────────────────────────────

// ── STORAGE KEYS ─────────────────────────────────────────────────────────────
const KEYS = {
  WATCHTHROUGHS: 'sw_watchthroughs',
  USER_DATA:     'sw_user_data',
  CW_TAGS:       'sw_cw_tags',
  CUSTOM_ORDER:  'sw_custom_order',
  APP_STATE:     'sw_app_state',
};

// ── STATE ─────────────────────────────────────────────────────────────────────
let APP = {
  // Loaded from JSON files
  projectInfo: {},
  items: [],            // from starwars_content.json
  releaseOrder: [],     // from starwars_content.json
  cwEpisodes: [],       // from clone_wars_episodes.json

  // Persisted in localStorage (mirrors data/*.json conceptually)
  watchthroughs: [],        // { id, name, created, saved, watched:{id:bool}, filters:{} }
  cwWatchthroughs: [],      // { id, name, created, saved, watched:{idx:bool} }
  customOrder: [],          // array of item ids in custom order
  cwEpisodeTags: {},        // { chron_num: ['tag1','tag2'] }

  // Session state
  activeTab: 'main',
  activeWT: null,
  activeCWWT: null,
  mainFilters: {
    vital: [],
    quality: [],
    type: [],
    order: 'chronological',
    george: true,
    post_george: true,
  },
  cwFilters: {
    vital: [],
    quality: [],
    tags: [],
  },
  editingItemId: null,
  editingCWChronNum: null,
  dragSrcIndex: null,
};

// ── LOAD FROM INLINED DATA (data.js) ─────────────────────────────────────────
// Data is inlined in data.js to avoid fetch() CORS issues with file:// protocol.
// To update content, edit data/starwars_content.json and data/clone_wars_episodes.json
// then regenerate data.js (or edit data.js directly).
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

// ── LOAD / SAVE PERSISTENT DATA ──────────────────────────────────────────────
function loadPersisted() {
  try {
    const wt = localStorage.getItem(KEYS.WATCHTHROUGHS);
    if (wt) {
      const parsed = JSON.parse(wt);
      APP.watchthroughs    = parsed.watchthroughs    || [];
      APP.cwWatchthroughs  = parsed.clone_wars_watchthroughs || [];
    }
  } catch(e) {}

  try {
    const ud = localStorage.getItem(KEYS.USER_DATA);
    if (ud) {
      const parsed = JSON.parse(ud);
      const s = parsed.app_state || {};
      if (s.activeTab)    APP.activeTab    = s.activeTab;
      if (s.activeWT  !== undefined) APP.activeWT = s.activeWT;
      if (s.activeCWWT !== undefined) APP.activeCWWT = s.activeCWWT;
      if (s.mainFilters)  APP.mainFilters  = { ...APP.mainFilters, ...s.mainFilters };
      if (s.cwFilters)    APP.cwFilters    = { ...APP.cwFilters, ...s.cwFilters };
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
}

function saveWatchthroughs() {
  const data = {
    watchthroughs: APP.watchthroughs,
    clone_wars_watchthroughs: APP.cwWatchthroughs,
  };
  localStorage.setItem(KEYS.WATCHTHROUGHS, JSON.stringify(data));
}

function saveUserData() {
  const data = {
    custom_order: APP.customOrder,
    episode_tags: APP.cwEpisodeTags,
    app_state: {
      activeTab:   APP.activeTab,
      activeWT:    APP.activeWT,
      activeCWWT:  APP.activeCWWT,
      mainFilters: APP.mainFilters,
      cwFilters:   APP.cwFilters,
    },
  };
  localStorage.setItem(KEYS.USER_DATA, JSON.stringify(data));
  localStorage.setItem(KEYS.CUSTOM_ORDER, JSON.stringify(APP.customOrder));
  localStorage.setItem(KEYS.CW_TAGS, JSON.stringify(APP.cwEpisodeTags));
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
  return !!(wt && wt.watched && wt.watched[itemId]);
}
function toggleWatched(itemId) {
  const wt = getActiveWTObj();
  if (!wt) { alert('Create or select a watchthrough first!'); return; }
  if (!wt.watched) wt.watched = {};
  wt.watched[itemId] = !wt.watched[itemId];
  wt.saved = new Date().toISOString();
  saveAll();
  render();
}

function isCWWatched(chronNum) {
  const wt = getActiveCWWTObj();
  return !!(wt && wt.watched && wt.watched[String(chronNum)]);
}
function toggleCWWatched(chronNum) {
  const wt = getActiveCWWTObj();
  if (!wt) { alert('Create or select a Clone Wars watchthrough first!'); return; }
  if (!wt.watched) wt.watched = {};
  wt.watched[String(chronNum)] = !wt.watched[String(chronNum)];
  wt.saved = new Date().toISOString();
  saveAll();
  render();
}

// ── FILTERING ─────────────────────────────────────────────────────────────────
function getFilteredItems() {
  const f = APP.mainFilters;
  let items = [...APP.items];

  // Sort
  if (f.order === 'release') {
    // Use the release_order array for correct ordering
    const releaseMap = {};
    APP.releaseOrder.forEach((id, i) => releaseMap[id] = i);
    items.sort((a, b) => {
      const ai = releaseMap[a.id] !== undefined ? releaseMap[a.id] : 9999;
      const bi = releaseMap[b.id] !== undefined ? releaseMap[b.id] : 9999;
      return ai - bi;
    });
  } else if (f.order === 'custom') {
    // Merge custom order with remaining items
    const customIds = APP.customOrder;
    const allIds = items.map(i => i.id);
    // Items in custom order first (in that order), then any not yet in custom order
    const inOrder = customIds.filter(id => allIds.includes(id));
    const notInOrder = allIds.filter(id => !customIds.includes(id));
    const fullOrder = [...inOrder, ...notInOrder];
    const orderMap = {};
    fullOrder.forEach((id, i) => orderMap[id] = i);
    items.sort((a, b) => (orderMap[a.id] ?? 9999) - (orderMap[b.id] ?? 9999));
  } else {
    // chronological
    items.sort((a, b) => a.timeline_sort_key - b.timeline_sort_key || a.chronological_order - b.chronological_order);
  }

  // George Lucas era filter
  if (!f.george)      items = items.filter(i => i.is_post_george_lucas);
  if (!f.post_george) items = items.filter(i => !i.is_post_george_lucas);

  // Type filter
  if (f.type.length > 0) items = items.filter(i => f.type.includes(i.type));

  // Vital filter
  if (f.vital.length > 0) {
    items = items.filter(i => {
      if (f.vital.includes('vital')    && i.vitality === 'vital')    return true;
      if (f.vital.includes('skippable') && i.vitality === 'skippable') return true;
      return false;
    });
  }

  // Quality filter
  if (f.quality.length > 0) {
    items = items.filter(i => f.quality.includes(i.quality));
  }

  return items;
}

function getFilteredCWEps() {
  const f = APP.cwFilters;
  let eps = APP.cwEpisodes.map(e => ({ ...e }));

  if (f.vital.length > 0) {
    eps = eps.filter(e => {
      if (f.vital.includes('vital')    && e.vitality === 'vital')    return true;
      if (f.vital.includes('skippable') && e.vitality === 'skippable') return true;
      return false;
    });
  }
  if (f.quality.length > 0) {
    eps = eps.filter(e => f.quality.includes(e.quality));
  }
  if (f.tags.length > 0) {
    eps = eps.filter(e => {
      const epTags = APP.cwEpisodeTags[String(e.chron_num)] || [];
      return f.tags.every(t => epTags.includes(t));
    });
  }
  return eps;
}

// Collect all unique CW tags across all episodes
function getAllCWTags() {
  const tagSet = new Set();
  Object.values(APP.cwEpisodeTags).forEach(tags => tags.forEach(t => tagSet.add(t)));
  return [...tagSet].sort();
}

// ── CUSTOM ORDER SYNC ─────────────────────────────────────────────────────────
// Ensure custom order contains all current item IDs (append new ones at end)
function syncCustomOrder() {
  const allIds = APP.items.map(i => i.id);
  // Remove deleted items
  APP.customOrder = APP.customOrder.filter(id => allIds.includes(id));
  // Add any new items not yet in custom order
  allIds.forEach(id => {
    if (!APP.customOrder.includes(id)) APP.customOrder.push(id);
  });
}

// ── FORMAT HELPERS ────────────────────────────────────────────────────────────
function formatAirCode(code) {
  if (code === 'T') return 'Film';
  if (!code) return '?';
  const s = String(code);
  if (s.length === 3) return `${s[0]}x${s.slice(1)}`;
  if (s.length === 4) return `${s.slice(0,2)}x${s.slice(2)}`;
  return s;
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
  saveUserData();
  render();
}

// ── MAIN LIST RENDER ──────────────────────────────────────────────────────────
function renderMain() {
  const items   = getFilteredItems();
  const wt      = getActiveWTObj();
  const watched = items.filter(i => isWatched(i.id)).length;
  const total   = items.length;
  const pct     = total > 0 ? Math.round(watched/total*100) : 0;
  const isCustom = APP.mainFilters.order === 'custom';

  let html = `
    <div class="section-row" style="gap:1rem; align-items:stretch;">
      <div class="panel" style="flex:1; min-width:260px;">
        <div class="panel-title">Sort Order</div>
        <div class="filter-chips">
          <button class="chip ${APP.mainFilters.order==='chronological'?'active-order':''}" onclick="setOrder('chronological')">Chronological</button>
          <button class="chip ${APP.mainFilters.order==='release'?'active-order':''}" onclick="setOrder('release')">Release Year</button>
          <button class="chip ${APP.mainFilters.order==='custom'?'active-order':''}" onclick="setOrder('custom')">Custom</button>
        </div>
      </div>
      <div class="panel" style="flex:1; min-width:180px;">
        <div class="panel-title">Vital / Skippable</div>
        <div class="filter-chips">
          <button class="chip ${APP.mainFilters.vital.includes('vital')?'active-vital':''}" onclick="toggleFilter('vital','vital')">Vital</button>
          <button class="chip ${APP.mainFilters.vital.includes('skippable')?'active-skippable':''}" onclick="toggleFilter('vital','skippable')">Skippable</button>
        </div>
      </div>
      <div class="panel" style="flex:1; min-width:200px;">
        <div class="panel-title">Type</div>
        <div class="filter-chips">
          <button class="chip ${APP.mainFilters.type.includes('movie')?'active-movie':''}" onclick="toggleFilter('type','movie')">Movie</button>
          <button class="chip ${APP.mainFilters.type.includes('tv')?'active-tv':''}" onclick="toggleFilter('type','tv')">TV</button>
          <button class="chip ${APP.mainFilters.type.includes('game')?'active-game':''}" onclick="toggleFilter('type','game')">Game</button>
        </div>
      </div>
    </div>

    <div class="section-row" style="gap:1rem; align-items:stretch;">
      <div class="panel" style="flex:1; min-width:200px;">
        <div class="panel-title">Quality</div>
        <div class="filter-chips">
          <button class="chip ${APP.mainFilters.quality.includes('good')?'active-good':''}" onclick="toggleFilter('quality','good')">Good</button>
          <button class="chip ${APP.mainFilters.quality.includes('meh')?'active-meh':''}" onclick="toggleFilter('quality','meh')">Meh</button>
          <button class="chip ${APP.mainFilters.quality.includes('bad')?'active-bad':''}" onclick="toggleFilter('quality','bad')">Bad</button>
        </div>
      </div>
      <div class="panel" style="flex:1; min-width:220px;">
        <div class="panel-title">Era</div>
        <div class="filter-chips">
          <button class="chip ${APP.mainFilters.george?'active-post':''}" onclick="toggleEra('george')">${APP.mainFilters.george?'George Lucas ✓':'George Lucas'}</button>
          <button class="chip ${APP.mainFilters.post_george?'active-post':''}" onclick="toggleEra('post_george')">${APP.mainFilters.post_george?'Post-George ✓':'Post-George'}</button>
        </div>
      </div>
    </div>

    <div class="watchthrough-bar">
      <span class="wt-label">Watchthrough:</span>
      <select class="wt-select" onchange="selectWT(this.value)">
        <option value="">— None —</option>
        ${APP.watchthroughs.map(w => `<option value="${w.id}" ${APP.activeWT===w.id?'selected':''}>${w.name}</option>`).join('')}
      </select>
      <button class="btn primary" onclick="openNewWTModal()">+ New</button>
      ${wt ? `<button class="btn danger" onclick="deleteWT()">Delete</button>` : ''}
    </div>
  `;

  if (wt) {
    html += `
      <div style="margin-bottom:1rem;">
        <div class="progress-text">${watched} / ${total} watched — ${pct}%</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
    `;
  }

  html += `<div class="top-actions">
    <button class="btn primary" onclick="openAddItemModal()">+ Add Entry</button>
    <span style="font-family:'Orbitron',monospace;font-size:10px;color:var(--sw-muted);margin-left:auto;">${items.length} entries</span>
  </div>`;

  if (isCustom) {
    html += `<div class="custom-order-hint">⠿ DRAG ROWS TO REORDER — ORDER SAVED AUTOMATICALLY</div>`;
  }

  html += `<div class="items-list" id="mainItemsList">`;
  if (items.length === 0) {
    html += `<div class="empty-state">No entries match current filters</div>`;
  }
  items.forEach((item, idx) => {
    const w = isWatched(item.id);
    html += renderItemRow(item, idx+1, w, isCustom);
  });
  html += `</div>`;

  document.getElementById('appContent').innerHTML = html;

  if (isCustom) initDragDrop();
}

function renderItemRow(item, num, watched, draggable) {
  const vBadge = item.vitality === 'vital'
    ? `<span class="badge badge-vital">Vital</span>`
    : `<span class="badge badge-skip">Skip</span>`;
  const qBadge = item.quality
    ? `<span class="badge badge-${item.quality}">${item.quality}</span>`
    : '';
  const tBadge = `<span class="badge badge-${item.type}">${item.type}</span>`;
  const glTag  = !item.is_post_george_lucas
    ? '<span style="font-size:9px;color:#7a7060;font-family:Orbitron,monospace;margin-left:2px" title="George Lucas era">GL</span>'
    : '';
  const dragHandle = draggable
    ? `<span class="drag-handle" title="Drag to reorder">⠿</span>`
    : '';
  const noteStr = item.notes ? ` <span style="font-size:10px;color:var(--sw-muted);font-style:italic;">${item.notes}</span>` : '';

  return `
    <div class="item-row ${watched?'watched':''} ${draggable?'draggable':''}"
         data-id="${item.id}"
         ${draggable ? 'draggable="true"' : ''}
         onclick="handleItemClick(event, '${item.id}')">
      ${dragHandle}
      <div class="item-check ${watched?'checked':''}">${watched?'✓':''}</div>
      <div class="item-num">${num}</div>
      <div class="item-badges">${vBadge}${tBadge}${qBadge}</div>
      <div class="item-title ${watched?'watched-title':''}">${item.title}${glTag}${noteStr}</div>
      <div class="item-year">${item.release_year||''}</div>
      <div class="item-set">${item.timeline_position||''}</div>
      <button class="item-edit-btn" onclick="event.stopPropagation(); openEditItemModal('${item.id}')">Edit</button>
    </div>
  `;
}

// ── CLONE WARS RENDER ─────────────────────────────────────────────────────────
function renderCW() {
  const eps  = getFilteredCWEps();
  const cwwt = getActiveCWWTObj();
  const watched = eps.filter(e => isCWWatched(e.chron_num)).length;
  const total   = eps.length;
  const pct     = total > 0 ? Math.round(watched/total*100) : 0;
  const allTags = getAllCWTags();

  let html = `
    <div class="section-row" style="gap:1rem; align-items:stretch;">
      <div class="panel" style="flex:1; min-width:180px;">
        <div class="panel-title">Vital / Skippable</div>
        <div class="filter-chips">
          <button class="chip ${APP.cwFilters.vital.includes('vital')?'active-vital':''}" onclick="toggleCWFilter('vital','vital')">Vital</button>
          <button class="chip ${APP.cwFilters.vital.includes('skippable')?'active-skippable':''}" onclick="toggleCWFilter('vital','skippable')">Skippable</button>
        </div>
      </div>
      <div class="panel" style="flex:1; min-width:200px;">
        <div class="panel-title">Quality</div>
        <div class="filter-chips">
          <button class="chip ${APP.cwFilters.quality.includes('good')?'active-good':''}" onclick="toggleCWFilter('quality','good')">Good</button>
          <button class="chip ${APP.cwFilters.quality.includes('meh')?'active-meh':''}" onclick="toggleCWFilter('quality','meh')">Meh</button>
          <button class="chip ${APP.cwFilters.quality.includes('bad')?'active-bad':''}" onclick="toggleCWFilter('quality','bad')">Bad</button>
        </div>
      </div>
      ${allTags.length > 0 ? `
      <div class="panel" style="flex:2; min-width:220px;">
        <div class="panel-title">Tags</div>
        <div class="filter-chips">
          ${allTags.map(t => `<button class="chip ${APP.cwFilters.tags.includes(t)?'active-tag':''}" onclick="toggleCWFilter('tags','${t}')">${t}</button>`).join('')}
        </div>
      </div>` : ''}
    </div>

    <div class="watchthrough-bar">
      <span class="wt-label">Watchthrough:</span>
      <select class="wt-select" onchange="selectCWWT(this.value)">
        <option value="">— None —</option>
        ${APP.cwWatchthroughs.map(w => `<option value="${w.id}" ${APP.activeCWWT===w.id?'selected':''}>${w.name}</option>`).join('')}
      </select>
      <button class="btn primary" onclick="openNewCWWTModal()">+ New</button>
      ${cwwt ? `<button class="btn danger" onclick="deleteCWWT()">Delete</button>` : ''}
    </div>
  `;

  if (cwwt) {
    html += `
      <div style="margin-bottom:1rem;">
        <div class="progress-text">${watched} / ${total} watched — ${pct}%</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%; background:#64B4FF;"></div></div>
      </div>
    `;
  }

  html += `<div class="top-actions">
    <span style="font-family:'Orbitron',monospace;font-size:10px;color:var(--sw-muted);">Chronological Order — ${eps.length} episodes</span>
  </div>`;

  // Header
  html += `
    <div style="display:flex;gap:8px;padding:4px 10px;margin-bottom:4px;">
      <span style="font-family:'Orbitron',monospace;font-size:9px;color:var(--sw-muted);width:16px;flex-shrink:0;">#</span>
      <span style="font-family:'Orbitron',monospace;font-size:9px;color:var(--sw-muted);width:22px;flex-shrink:0;">CHR</span>
      <span style="font-family:'Orbitron',monospace;font-size:9px;color:var(--sw-muted);width:34px;flex-shrink:0;">EP</span>
      <span style="font-family:'Orbitron',monospace;font-size:9px;color:var(--sw-muted);flex:1;">TITLE</span>
      <span style="font-family:'Orbitron',monospace;font-size:9px;color:var(--sw-muted);width:80px;text-align:center;">BADGES</span>
    </div>
  `;

  html += `<div class="items-list">`;
  if (eps.length === 0) {
    html += `<div class="empty-state">No episodes match current filters</div>`;
  }
  eps.forEach((ep, listIdx) => {
    const w = isCWWatched(ep.chron_num);
    const vBadge = ep.vitality === 'vital'
      ? `<span class="badge badge-vital" style="font-size:8px;">V</span>`
      : ep.vitality === 'skippable'
        ? `<span class="badge badge-skip" style="font-size:8px;">S</span>`
        : `<span class="badge" style="font-size:8px;color:var(--sw-muted);">?</span>`;
    const qBadge = ep.quality
      ? `<span class="badge badge-${ep.quality}" style="font-size:8px;">${ep.quality}</span>`
      : `<span class="badge" style="font-size:8px;color:var(--sw-muted);">?</span>`;
    const epTags = APP.cwEpisodeTags[String(ep.chron_num)] || [];
    const tagHtml = epTags.map(t => `<span class="badge badge-tag">${t}</span>`).join('');

    html += `
      <div class="cw-ep-row ${w?'watched':''}" onclick="toggleCWWatched('${ep.chron_num}')">
        <div class="item-check ${w?'checked':''}" style="width:14px;height:14px;font-size:9px;">${w?'✓':''}</div>
        <span class="cw-air">${listIdx+1}</span>
        <span class="cw-ep-num">${formatAirCode(ep.air_code)}</span>
        <span class="cw-title ${w?'watched-title':''}">${ep.title}${tagHtml ? ' ' : ''}${tagHtml}</span>
        <div style="display:flex;gap:3px;flex-shrink:0;">${vBadge}${qBadge}</div>
        <button class="item-edit-btn" style="font-size:10px;padding:1px 5px;" onclick="event.stopPropagation();openEditCWEpModal('${ep.chron_num}')">Edit</button>
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
        // Get current ordered ids from DOM
        const rows = [...list.querySelectorAll('.item-row[data-id]')];
        const ids  = rows.map(r => r.dataset.id);
        const srcIdx = ids.indexOf(dragSrc.dataset.id);
        const dstIdx = ids.indexOf(row.dataset.id);
        // Re-order
        ids.splice(srcIdx, 1);
        ids.splice(dstIdx, 0, dragSrc.dataset.id);
        // Update APP.customOrder to match this new full order (merge with all items)
        // The visible list may be filtered, so we update positions of visible items in the full order
        updateCustomOrderFromVisible(ids);
        saveAll();
        render();
      }
    });
  });
}

function updateCustomOrderFromVisible(visibleIds) {
  // Take the full custom order, and re-slot the visible items into their new positions
  // Items NOT in visibleIds keep their relative positions between the visible items
  const allIds = [...APP.customOrder];
  // Remove visible ids from allIds
  const nonVisible = allIds.filter(id => !visibleIds.includes(id));
  // Interleave: rebuild full order by replacing visible slots
  // Simple approach: since we always sort custom by APP.customOrder, just set the new visible order
  // and keep non-visible items at the end (they'll appear in their original relative position when unfiltered)
  // For full correctness: rebuild by inserting visible items back in the right relative positions
  const result = [];
  let vi = 0; // index into visibleIds
  for (const id of allIds) {
    if (visibleIds.includes(id)) {
      result.push(visibleIds[vi++]);
    } else {
      result.push(id);
    }
  }
  // Add any visible items that weren't in allIds
  while (vi < visibleIds.length) result.push(visibleIds[vi++]);
  APP.customOrder = result;
}

// ── FILTER ACTIONS ────────────────────────────────────────────────────────────
function toggleFilter(category, value) {
  const arr = APP.mainFilters[category];
  const idx = arr.indexOf(value);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(value);
  saveUserData();
  render();
}

function setOrder(order) {
  if (order === 'custom') syncCustomOrder();
  APP.mainFilters.order = order;
  saveUserData();
  render();
}

function toggleEra(key) {
  APP.mainFilters[key] = !APP.mainFilters[key];
  saveUserData();
  render();
}

function toggleCWFilter(category, value) {
  const arr = APP.cwFilters[category];
  const idx = arr.indexOf(value);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(value);
  saveUserData();
  render();
}

// ── WATCHTHROUGH ACTIONS ──────────────────────────────────────────────────────
function selectWT(id) {
  APP.activeWT = id || null;
  saveAll();
  render();
}

function selectCWWT(id) {
  APP.activeCWWT = id || null;
  saveAll();
  render();
}

function openNewWTModal() {
  document.getElementById('wtModalBody').innerHTML = `
    <div class="form-group">
      <label class="form-label">Watchthrough Name</label>
      <input class="form-input" id="wtNameInput" placeholder="e.g. First Watch 2024" />
    </div>
    <div class="modal-actions">
      <button class="btn primary" onclick="createWT()">Create</button>
      <button class="btn" onclick="closeModal('wtModal')">Cancel</button>
    </div>
  `;
  document.getElementById('wtModal').classList.add('open');
  setTimeout(() => document.getElementById('wtNameInput').focus(), 100);
}

function openNewCWWTModal() {
  document.getElementById('wtModalBody').innerHTML = `
    <div class="form-group">
      <label class="form-label">Clone Wars Watchthrough Name</label>
      <input class="form-input" id="wtNameInput" placeholder="e.g. Clone Wars Run 2024" />
    </div>
    <div class="modal-actions">
      <button class="btn primary" onclick="createCWWT()">Create</button>
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
  saveAll();
  closeModal('wtModal');
  render();
}

function createCWWT() {
  const name = document.getElementById('wtNameInput').value.trim();
  if (!name) return;
  const wt = { id: generateId(), name, watched: {}, created: new Date().toISOString(), saved: new Date().toISOString() };
  APP.cwWatchthroughs.push(wt);
  APP.activeCWWT = wt.id;
  saveAll();
  closeModal('wtModal');
  render();
}

function deleteWT() {
  if (!confirm('Delete this watchthrough? All progress will be lost.')) return;
  APP.watchthroughs = APP.watchthroughs.filter(w => w.id !== APP.activeWT);
  APP.activeWT = null;
  saveAll();
  render();
}

function deleteCWWT() {
  if (!confirm('Delete this Clone Wars watchthrough?')) return;
  APP.cwWatchthroughs = APP.cwWatchthroughs.filter(w => w.id !== APP.activeCWWT);
  APP.activeCWWT = null;
  saveAll();
  render();
}

// ── ITEM CLICK HANDLER ────────────────────────────────────────────────────────
function handleItemClick(event, itemId) {
  // Don't toggle watched if clicking drag handle or edit button
  if (event.target.classList.contains('drag-handle')) return;
  if (event.target.classList.contains('item-edit-btn')) return;
  toggleWatched(itemId);
}

// ── ITEM EDIT MODALS ──────────────────────────────────────────────────────────
function openAddItemModal() {
  APP.editingItemId = null;
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
  return `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input class="form-input" id="ef_title" value="${item ? escHtml(item.title) : ''}" placeholder="Entry title" />
    </div>
    <div class="form-group">
      <label class="form-label">Release Year</label>
      <input class="form-input" id="ef_year" type="number" value="${item ? item.release_year : new Date().getFullYear()}" />
    </div>
    <div class="form-group">
      <label class="form-label">Set In (timeline)</label>
      <input class="form-input" id="ef_setIn" value="${item ? escHtml(item.timeline_position||'') : ''}" placeholder="e.g. 19 BBY" />
    </div>
    <div class="form-group">
      <label class="form-label">Timeline Sort (BBY = negative, ABY = positive)</label>
      <input class="form-input" id="ef_setSort" type="number" step="0.1" value="${item ? item.timeline_sort_key : 0}" />
    </div>
    <div class="form-group">
      <label class="form-label">Type</label>
      <select class="form-select" id="ef_type">
        <option value="movie" ${item&&item.type==='movie'?'selected':''}>Movie</option>
        <option value="tv"    ${item&&item.type==='tv'?'selected':''}>TV</option>
        <option value="game"  ${item&&item.type==='game'?'selected':''}>Game</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Vitality</label>
      <select class="form-select" id="ef_vital">
        <option value="vital"     ${item&&item.vitality==='vital'?'selected':''}>Vital</option>
        <option value="skippable" ${item&&item.vitality==='skippable'?'selected':''}>Skippable</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Quality</label>
      <select class="form-select" id="ef_quality">
        <option value=""    ${item&&!item.quality?'selected':''}>Unknown</option>
        <option value="good" ${item&&item.quality==='good'?'selected':''}>Good</option>
        <option value="meh"  ${item&&item.quality==='meh'?'selected':''}>Meh</option>
        <option value="bad"  ${item&&item.quality==='bad'?'selected':''}>Bad</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">George Lucas Era?</label>
      <select class="form-select" id="ef_postLucas">
        <option value="false" ${item&&!item.is_post_george_lucas?'selected':''}>Yes (George Lucas)</option>
        <option value="true"  ${item&&item.is_post_george_lucas?'selected':''}>No (Post-George)</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <input class="form-input" id="ef_notes" value="${item ? escHtml(item.notes||'') : ''}" placeholder="Optional notes" />
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
  const release_year      = parseInt(document.getElementById('ef_year').value) || new Date().getFullYear();
  const timeline_position = document.getElementById('ef_setIn').value.trim();
  const timeline_sort_key = parseFloat(document.getElementById('ef_setSort').value) || 0;
  const type              = document.getElementById('ef_type').value;
  const vitality          = document.getElementById('ef_vital').value;
  const quality           = document.getElementById('ef_quality').value || null;
  const is_post_george_lucas = document.getElementById('ef_postLucas').value === 'true';
  const notes             = document.getElementById('ef_notes').value.trim();

  if (APP.editingItemId) {
    const item = APP.items.find(i => i.id === APP.editingItemId);
    if (item) {
      Object.assign(item, { title, release_year, timeline_position, timeline_sort_key, type, vitality, quality, is_post_george_lucas, notes });
    }
  } else {
    const maxChronoOrder = Math.max(...APP.items.map(i => i.chronological_order || 0), 0);
    const newItem = {
      id: generateId(),
      title, release_year, timeline_position, timeline_sort_key,
      type, vitality, quality, is_post_george_lucas, notes,
      chronological_order: maxChronoOrder + 1,
    };
    APP.items.push(newItem);
    APP.releaseOrder.push(newItem.id);
    APP.customOrder.push(newItem.id);
  }
  saveAll();
  closeModal('itemModal');
  render();
}

function deleteItem(id) {
  if (!confirm('Delete this entry?')) return;
  APP.items = APP.items.filter(i => i.id !== id);
  APP.releaseOrder = APP.releaseOrder.filter(i => i !== id);
  APP.customOrder  = APP.customOrder.filter(i => i !== id);
  saveAll();
  closeModal('itemModal');
  render();
}

// ── CW EPISODE EDIT MODAL ─────────────────────────────────────────────────────
function openEditCWEpModal(chronNum) {
  APP.editingCWChronNum = String(chronNum);
  const ep = APP.cwEpisodes.find(e => String(e.chron_num) === String(chronNum));
  if (!ep) return;
  const epTags = APP.cwEpisodeTags[String(chronNum)] || [];

  document.getElementById('itemModalTitle').textContent = 'Edit Clone Wars Episode';
  document.getElementById('itemModalBody').innerHTML = buildCWEpForm(ep, epTags);
  document.getElementById('itemModal').classList.add('open');
}

function buildCWEpForm(ep, epTags) {
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
        <option value=""         ${!ep.vitality?'selected':''}>Unknown</option>
        <option value="vital"    ${ep.vitality==='vital'?'selected':''}>Vital</option>
        <option value="skippable" ${ep.vitality==='skippable'?'selected':''}>Skippable</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Quality</label>
      <select class="form-select" id="cwef_quality">
        <option value=""    ${!ep.quality?'selected':''}>Unknown</option>
        <option value="good" ${ep.quality==='good'?'selected':''}>Good</option>
        <option value="meh"  ${ep.quality==='meh'?'selected':''}>Meh</option>
        <option value="bad"  ${ep.quality==='bad'?'selected':''}>Bad</option>
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
          <span class="tag-pill">
            ${escHtml(t)}
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

// Live tag management within the modal (in-memory, saved on Save)
let _modalTags = [];

function cwTagKeydown(e) {
  if (e.key === 'Enter') { e.preventDefault(); addCWTag(); }
}

function addCWTag() {
  const input = document.getElementById('cwef_tagInput');
  const val = input.value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!val) return;
  const epTags = APP.cwEpisodeTags[APP.editingCWChronNum] || [];
  if (!epTags.includes(val)) {
    APP.cwEpisodeTags[APP.editingCWChronNum] = [...epTags, val];
  }
  input.value = '';
  // Re-render just the tags display
  refreshCWTagsDisplay();
}

function removeCWTag(tag) {
  const epTags = APP.cwEpisodeTags[APP.editingCWChronNum] || [];
  APP.cwEpisodeTags[APP.editingCWChronNum] = epTags.filter(t => t !== tag);
  refreshCWTagsDisplay();
}

function refreshCWTagsDisplay() {
  const epTags = APP.cwEpisodeTags[APP.editingCWChronNum] || [];
  document.getElementById('cwTagsDisplay').innerHTML = epTags.map(t => `
    <span class="tag-pill">
      ${escHtml(t)}
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
  // Tags are already updated in APP.cwEpisodeTags in real-time
  saveAll();
  closeModal('itemModal');
  render();
}

// ── EXPORT / IMPORT ───────────────────────────────────────────────────────────
function openExportModal() {
  const exportData = JSON.stringify({
    version: 3,
    exported: new Date().toISOString(),
    watchthroughs: APP.watchthroughs,
    cwWatchthroughs: APP.cwWatchthroughs,
    customOrder: APP.customOrder,
    cwEpisodeTags: APP.cwEpisodeTags,
    appState: {
      activeWT: APP.activeWT,
      activeCWWT: APP.activeCWWT,
      mainFilters: APP.mainFilters,
      cwFilters: APP.cwFilters,
    },
  }, null, 2);

  document.getElementById('exportModalBody').innerHTML = `
    <p style="color:var(--sw-muted);font-size:13px;margin-bottom:1rem;">
      This exports your watchthrough progress, custom ordering, and tags.
      Content data (episodes, movies) comes from the <code>data/</code> JSON files.
    </p>
    <textarea id="exportText" style="width:100%;height:200px;background:var(--sw-panel2);border:1px solid var(--sw-border);color:var(--sw-text);font-family:monospace;font-size:11px;padding:10px;border-radius:2px;resize:vertical;">${exportData}</textarea>
    <div class="modal-actions">
      <button class="btn primary" onclick="copyExport()">Copy to Clipboard</button>
      <button class="btn success" onclick="importData()">Import from above</button>
      <button class="btn" onclick="closeModal('exportModal')">Close</button>
    </div>
    <p id="exportMsg" style="color:#81C784;font-size:12px;margin-top:8px;display:none;">Copied!</p>
  `;
  document.getElementById('exportModal').classList.add('open');
}

function copyExport() {
  const text = document.getElementById('exportText').value;
  navigator.clipboard.writeText(text).then(() => {
    const msg = document.getElementById('exportMsg');
    msg.style.display = 'block';
    setTimeout(() => msg.style.display='none', 2000);
  });
}

function importData() {
  try {
    const text = document.getElementById('exportText').value;
    const data = JSON.parse(text);
    if (data.watchthroughs)    APP.watchthroughs   = data.watchthroughs;
    if (data.cwWatchthroughs)  APP.cwWatchthroughs = data.cwWatchthroughs;
    if (data.customOrder)      APP.customOrder      = data.customOrder;
    if (data.cwEpisodeTags)    APP.cwEpisodeTags    = data.cwEpisodeTags;
    if (data.appState) {
      if (data.appState.activeWT    !== undefined) APP.activeWT    = data.appState.activeWT;
      if (data.appState.activeCWWT  !== undefined) APP.activeCWWT  = data.appState.activeCWWT;
      if (data.appState.mainFilters) APP.mainFilters = { ...APP.mainFilters, ...data.appState.mainFilters };
      if (data.appState.cwFilters)   APP.cwFilters   = { ...APP.cwFilters,   ...data.appState.cwFilters };
    }
    saveAll();
    closeModal('exportModal');
    render();
    alert('Data imported successfully!');
  } catch(e) {
    alert('Invalid JSON data. Please check and try again.');
  }
}

// ── MODAL UTILS ───────────────────────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadJSONFiles();
  loadPersisted();
  syncCustomOrder();
  render();

  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

init();
