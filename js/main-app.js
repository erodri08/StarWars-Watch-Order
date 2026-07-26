// main-app.js — controls index.html (the main content list)

class MainListApp extends BaseWatchlistApp {
  static STORAGE_KEYS = {
    WATCHTHROUGHS: 'sw_watchthroughs',
    USER_DATA: 'sw_user_data',
    CUSTOM_ORDER: 'sw_custom_order',
    HIDDEN_IDS: 'sw_hidden_ids',
    ITEM_EDITS: 'sw_main_item_edits',
    ADDED_ITEMS: 'sw_main_added_items',
    DELETED_IDS: 'sw_main_deleted_ids',
  };

  constructor() {
    super();
    const K = MainListApp.STORAGE_KEYS;
    this.store = {
      watchthroughs: new KVStore(K.WATCHTHROUGHS),
      userData: new KVStore(K.USER_DATA),
      customOrder: new KVStore(K.CUSTOM_ORDER),
      hiddenIds: new KVStore(K.HIDDEN_IDS),
      itemEdits: new KVStore(K.ITEM_EDITS),
      addedItems: new KVStore(K.ADDED_ITEMS),
      deletedIds: new KVStore(K.DELETED_IDS),
    };

    this.projectInfo = {};
    this.items = [];
    this.releaseOrder = [];

    this.watchthroughs = new WatchthroughCollection();
    this.customOrder = [];
    this.hiddenIds = new Set();
    /** Tombstoned ids so deleted shipped entries don't reappear. */
    this.deletedIds = new Set();
    /** Tags for a not-yet-saved new entry (not in `this.items` yet). */
    this.pendingNewTags = [];

    this.filters = {
      vital: [], quality: [], type: [], tags: [],
      order: 'chronological',
      george: true, post_george: true,
    };

    this.editingItemId = null;
    this.selectedIds = new Set();
    this.tagsExpanded = false;
    this.tagSearch = '';
  }

  // Load
  async init() {
    this.loadContent();
    this.loadPersisted();
    this.syncCustomOrder();
    this.render();
    this.mountChrome();
  }

  loadContent() {
    this.projectInfo = window.PROJECT_INFO || {};
    const items = (window.CONTENT_DATA && CONTENT_DATA.items) || [];
    // Clone so in-session edits never mutate the shipped data.js objects.
    this.items = items.map(i => ({ ...i, tags: [...(i.tags || [])] }));
    this.releaseOrder = (window.CONTENT_DATA && CONTENT_DATA.release_order) || [];
  }

  loadPersisted() {
    const wt = this.store.watchthroughs.getJSON(null);
    const savedWTs = wt?.watchthroughs || [];

    const userData = this.store.userData.getJSON(null);
    const state = userData?.app_state || {};

    this.watchthroughs = new WatchthroughCollection(savedWTs, state.activeWT ?? null);
    if (state.mainFilters) this.filters = { ...this.filters, ...state.mainFilters };

    this.customOrder = this.store.customOrder.getJSON([]);
    this.hiddenIds = new Set(this.store.hiddenIds.getJSON([]));

    // Apply saved edits so item changes (including tags) persist, as with episodes.
    this.deletedIds = new Set(this.store.deletedIds.getJSON([]));
    this.items = this.items.filter(i => !this.deletedIds.has(i.id));

    const added = this.store.addedItems.getJSON([]);
    this.items.push(...added.map(i => ({ ...i, tags: [...(i.tags || [])] })));

    const edits = this.store.itemEdits.getJSON({});
    this.items.forEach(item => { if (edits[item.id]) Object.assign(item, edits[item.id]); });
  }

  // Persist
  saveWatchthroughs() {
    this.store.watchthroughs.setJSON({ watchthroughs: this.watchthroughs.toJSON() });
  }

  saveUserData() {
    this.store.userData.setJSON({
      app_state: { activeWT: this.watchthroughs.activeId, mainFilters: this.filters },
    });
    this.store.customOrder.setJSON(this.customOrder);
    this.store.hiddenIds.setJSON([...this.hiddenIds]);
  }

  /** Persists item changes as a diff against data.js, like show-app.js does for episodes. */
  saveContentEdits() {
    const origById = new Map(((window.CONTENT_DATA && CONTENT_DATA.items) || []).map(i => [i.id, i]));
    const edits = {};
    const added = [];
    const fields = ['title', 'release_date', 'release_year', 'timeline_position',
      'timeline_sort_key', 'type', 'vitality', 'quality', 'is_post_george_lucas', 'notes', 'tags'];
    this.items.forEach(item => {
      const orig = origById.get(item.id);
      if (!orig) { added.push(item); return; }
      const diff = {};
      fields.forEach(k => {
        if (JSON.stringify(item[k] ?? null) !== JSON.stringify(orig[k] ?? null)) diff[k] = item[k];
      });
      if (Object.keys(diff).length) edits[item.id] = diff;
    });
    this.store.itemEdits.setJSON(edits);
    this.store.addedItems.setJSON(added);
    this.store.deletedIds.setJSON([...this.deletedIds]);
  }

  saveAll() {
    this.saveWatchthroughs();
    this.saveUserData();
    this.saveContentEdits();
    this.flashSaved();
  }

  // Watched / hidden
  isWatched(itemId) {
    return !!this.watchthroughs.active?.isWatched(itemId);
  }

  toggleWatched(itemId) {
    const wt = this.watchthroughs.active;
    if (!wt) { alert('Create or select a watchthrough first!'); return; }
    wt.toggle(itemId);
    this.saveAll(); this.render();
  }

  toggleHidden(itemId) {
    if (this.hiddenIds.has(itemId)) this.hiddenIds.delete(itemId);
    else this.hiddenIds.add(itemId);
    this.saveAll(); this.render();
  }

  // Filtering / sorting
  getFilteredEntries(includeHidden = false) {
    return this.getFilteredItems(includeHidden);
  }

  getFilteredItems(includeHidden = false) {
    const f = this.filters;
    let items = this.items.filter(i => includeHidden ? this.hiddenIds.has(i.id) : !this.hiddenIds.has(i.id));

    if (f.order === 'release') {
      items.sort((a, b) => Utils.releaseSortKey(a) - Utils.releaseSortKey(b));
    } else if (f.order === 'custom') {
      const orderMap = {};
      this._effectiveCustomOrder(items).forEach((id, i) => orderMap[id] = i);
      items.sort((a, b) => (orderMap[a.id] ?? 9999) - (orderMap[b.id] ?? 9999));
    } else {
      items.sort((a, b) => a.timeline_sort_key - b.timeline_sort_key || a.chronological_order - b.chronological_order);
    }

    if (!f.george) items = items.filter(i => i.is_post_george_lucas);
    if (!f.post_george) items = items.filter(i => !i.is_post_george_lucas);
    if (f.type.length) items = items.filter(i => f.type.includes(i.type));

    items = items.filter(i => EntryCollection.matchesCommonFilters(i, f, e => e.tags || []));

    return items;
  }

  _effectiveCustomOrder(items) {
    const allIds = items.map(i => i.id);
    const inOrder = this.customOrder.filter(id => allIds.includes(id));
    const notInOrder = allIds.filter(id => !this.customOrder.includes(id));
    return [...inOrder, ...notInOrder];
  }

  getAllMainTags() {
    return new EntryCollection(this.items).allTags(i => i.tags || []);
  }

  // Custom order
  syncCustomOrder() {
    const allIds = this.items.map(i => i.id);
    this.customOrder = this.customOrder.filter(id => allIds.includes(id));
    allIds.forEach(id => { if (!this.customOrder.includes(id)) this.customOrder.push(id); });
  }

  seedCustomOrder(basis) {
    const label = basis === 'release' ? 'release date' : 'chronological';
    if (!confirm(`Reset your custom order to ${label} order? This will overwrite your current arrangement.`)) return;
    const allItems = [...this.items];
    if (basis === 'release') {
      allItems.sort((a, b) => Utils.releaseSortKey(a) - Utils.releaseSortKey(b));
    } else {
      allItems.sort((a, b) => a.timeline_sort_key - b.timeline_sort_key || a.chronological_order - b.chronological_order);
    }
    this.customOrder = allItems.map(i => i.id);
    this.selectedIds = new Set();
    this.saveAll(); this.render();
  }

  updateCustomOrderFromVisible(visibleIds) {
    const result = [];
    let vi = 0;
    for (const id of this.customOrder) {
      if (visibleIds.includes(id)) result.push(visibleIds[vi++]);
      else result.push(id);
    }
    while (vi < visibleIds.length) result.push(visibleIds[vi++]);
    this.customOrder = result;
  }

  // Render
  render() {
    this.renderNav();
    this.renderMain();
  }

  renderNav() {
    Utils.$('headerTitle').textContent = `⬡ ${this.projectInfo.title || 'STAR WARS WATCHLIST MAKER'} ⬡`;
    Utils.$('headerSub').textContent = this.projectInfo.subtitle || '';
    Nav.mount('navTabs', `
      <button class="btn" style="margin-left:auto" onclick="app.downloadFullDataJs()">↓ Download data.js</button>
      <button class="btn" onclick="app.openExportModal()">⇅ Export / Import</button>
    `);
  }

  renderMain() {
    const items = this.getFilteredItems(false);
    const wt = this.watchthroughs.active;
    const isCustom = this.filters.order === 'custom';
    const sel = this.selectedIds;
    const allMainTags = this.getAllMainTags();

    const vitalOpts = [['vital', 'Vital', 'active-vital'], ['non-essential', 'Non-Essential', 'active-skippable']];
    const typeOpts = [['movie', 'Movie', 'active-movie'], ['tv', 'TV', 'active-tv'], ['game', 'Game', 'active-game']];
    const qualOpts = [['great', 'Great', 'active-great'], ['good', 'Good', 'active-good'], ['meh', 'Meh', 'active-meh'], ['bad', 'Bad', 'active-bad']];

    let html = `
      <div class="section-row" style="gap:1rem; align-items:stretch;">
        <div class="panel" style="flex:1; min-width:260px;">
          <div class="panel-title">Sort Order</div>
          <div class="filter-chips">
            ${['chronological', 'release', 'custom'].map(o =>
              `<button class="chip ${this.filters.order === o ? 'active-order' : ''}" onclick="app.setOrder('${o}')">${o.charAt(0).toUpperCase() + o.slice(1)}</button>`
            ).join('')}
          </div>
        </div>
        ${FilterPanel.renderChips('Vitality', vitalOpts, this.filters.vital, v => `app.toggleFilter('vital','${v}')`)}
        ${FilterPanel.renderChips('Type', typeOpts, this.filters.type, v => `app.toggleFilter('type','${v}')`)}
      </div>
      <div class="section-row" style="gap:1rem; align-items:stretch;">
        ${FilterPanel.renderChips('Quality', qualOpts, this.filters.quality, v => `app.toggleFilter('quality','${v}')`)}
        <div class="panel" style="flex:1; min-width:220px;">
          <div class="panel-title">Era</div>
          <div class="filter-chips">
            <button class="chip ${this.filters.george ? 'active-post' : ''}" onclick="app.toggleEra('george')">${this.filters.george ? 'George Lucas ✓' : 'George Lucas'}</button>
            <button class="chip ${this.filters.post_george ? 'active-post' : ''}" onclick="app.toggleEra('post_george')">${this.filters.post_george ? 'Post-George ✓' : 'Post-George'}</button>
          </div>
        </div>
        ${allMainTags.length ? this._renderTagsPanel(allMainTags) : ''}
      </div>
    `;

    html += WatchthroughBar.render({
      watchthroughs: this.watchthroughs.items,
      activeId: this.watchthroughs.activeId,
      watchedCount: wt ? items.filter(i => this.isWatched(i.id)).length : null,
      total: wt ? items.length : null,
    });

    html += `<div class="top-actions">
      <button class="btn primary" onclick="app.openAddItemModal()">+ Add Entry</button>`;

    if (isCustom && sel.size > 0) {
      html += `
        <span class="multi-sel-info">${sel.size} selected</span>
        <button class="btn" onclick="app.moveSelectedUp()">▲ Move Up</button>
        <button class="btn" onclick="app.moveSelectedDown()">▼ Move Down</button>
        <button class="btn danger" onclick="app.clearSelection()">✕ Clear</button>
      `;
    }

    html += `<span style="font-family:'Orbitron',monospace;font-size:10px;color:var(--sw-muted);margin-left:auto;">${items.length} entries</span>
    </div>`;

    if (isCustom) {
      html += `
        <div class="custom-order-hint">
          <span>⠿ DRAG TO REORDER — OR SELECT MULTIPLE ROWS AND USE ▲ ▼ BUTTONS</span>
          <span class="hint-seed-label">RESET TO:</span>
          <button class="btn hint-seed-btn" onclick="app.seedCustomOrder('chronological')">Chronological</button>
          <button class="btn hint-seed-btn" onclick="app.seedCustomOrder('release')">Release</button>
        </div>
      `;
    }

    html += `<div class="items-list" id="mainItemsList">`;
    if (items.length === 0) html += `<div class="empty-state">No entries match current filters</div>`;
    items.forEach((item, idx) => html += this.renderItemRow(item, idx + 1, this.isWatched(item.id), isCustom, false));
    html += `</div>`;

    if (this.hiddenIds.size > 0) {
      const hiddenFiltered = this.items.filter(i => this.hiddenIds.has(i.id));
      html += `
        <div class="hidden-section">
          <div class="hidden-section-header">
            <span class="hidden-section-title">◈ Hidden from Watchthrough</span>
            <span class="hidden-section-count">${hiddenFiltered.length} entr${hiddenFiltered.length === 1 ? 'y' : 'ies'}</span>
          </div>
          <div class="items-list">
      `;
      hiddenFiltered.forEach((item, idx) => html += this.renderItemRow(item, idx + 1, this.isWatched(item.id), false, true));
      html += `</div></div>`;
    }

    Utils.$('appContent').innerHTML = html;
    if (isCustom) this.initDragDrop();
  }

  _renderTagsPanel(allMainTags) {
    return `
      <div class="panel" style="flex:2; min-width:220px;">
        <div class="panel-title" style="display:flex;align-items:center;gap:8px;cursor:pointer;" onclick="app.toggleTagsExpanded()">
          Tags
          ${this.filters.tags.length ? `<span style="font-size:10px;color:var(--sw-gold);letter-spacing:0;">${this.filters.tags.length} active</span>` : ''}
          <button class="tag-collapse-btn">${this.tagsExpanded ? '▲ Collapse' : '▼ Show (' + allMainTags.length + ')'}</button>
        </div>
        ${this.tagsExpanded ? `
          <input class="form-input" id="mainTagSearchInput" style="margin-top:8px;margin-bottom:8px;font-size:13px;padding:5px 8px;"
            placeholder="Search tags…" value="${Utils.escHtml(this.tagSearch || '')}"
            oninput="app.updateTagSearch(this.value)"
            onclick="event.stopPropagation()" />
          <div class="filter-chips" id="mainTagChips">${this._tagChipsHtml(allMainTags)}</div>` : ''}
      </div>`;
  }

  _tagChipsHtml(allMainTags) {
    const q = (this.tagSearch || '').toLowerCase().trim();
    const visible = q ? allMainTags.filter(t => t.includes(q)) : allMainTags;
    return visible.length
      ? visible.map(t => `<button class="chip ${this.filters.tags.includes(t) ? 'active-tag' : ''}" onclick="event.stopPropagation();app.toggleFilter('tags','${Utils.escHtml(t)}')">${Utils.escHtml(t)}</button>`).join('')
      : `<span style="color:var(--sw-muted);font-size:12px;">No tags match</span>`;
  }

  /** Called on every keystroke in the tag search box — updates only the chip
   *  list, never re-renders the input itself, so focus/cursor are preserved. */
  updateTagSearch(value) {
    this.tagSearch = value;
    const chips = Utils.$('mainTagChips');
    if (chips) chips.innerHTML = this._tagChipsHtml(this.getAllMainTags());
  }

  renderItemRow(item, num, watched, draggable, isHidden) {
    const sel = this.selectedIds.has(item.id);
    const vBadge = `<span class="badge badge-${item.vitality === 'vital' ? 'vital' : 'skip'}">${item.vitality === 'vital' ? 'Vital' : 'Non-Ess.'}</span>`;
    const qBadge = item.quality ? `<span class="badge badge-${item.quality}">${item.quality}</span>` : '';
    const tBadge = `<span class="badge badge-${item.type}">${item.type}</span>`;
    const glTag = !item.is_post_george_lucas ? '<span class="gl-tag" title="George Lucas era">GL</span>' : '';
    const noteStr = item.notes ? ` <span class="item-note">${item.notes}</span>` : '';
    const dateStr = item.release_date ? item.release_date : (item.release_year ? String(item.release_year) : '');

    const hideBtn = !isHidden
      ? `<button class="item-hide-btn" title="Hide from watchthrough" onclick="event.stopPropagation(); app.toggleHidden('${item.id}')">Hide</button>`
      : `<button class="item-hide-btn item-hide-btn--show" title="Add back to watchthrough" onclick="event.stopPropagation(); app.toggleHidden('${item.id}')">Show</button>`;

    return `
      <div class="item-row ${watched ? 'watched' : ''} ${draggable ? 'draggable' : ''} ${sel ? 'selected' : ''} ${isHidden ? 'hidden-row' : ''}"
           data-id="${item.id}"
           ${draggable ? 'draggable="true"' : ''}
           onclick="${isHidden ? '' : `app.handleItemClick(event, '${item.id}')`}">
        ${draggable ? `<span class="drag-handle" title="Drag to reorder">⠿</span>` : ''}
        <div class="item-check ${watched && !isHidden ? 'checked' : ''}">${watched && !isHidden ? '✓' : ''}</div>
        <div class="item-num">${num}</div>
        <div class="item-badges">${vBadge}${tBadge}${qBadge}</div>
        <div class="item-title ${watched && !isHidden ? 'watched-title' : ''}">${item.title}${glTag}${noteStr}</div>
        <div class="item-year">${dateStr}</div>
        <div class="item-set">${item.timeline_position || ''}</div>
        ${hideBtn}
        <button class="item-edit-btn" onclick="event.stopPropagation(); app.openEditItemModal('${item.id}')">Edit</button>
      </div>
    `;
  }

  // Drag and drop
  initDragDrop() {
    const list = Utils.$('mainItemsList');
    if (!list) return;
    let dragSrc = null;

    list.querySelectorAll('.item-row.draggable').forEach(row => {
      row.addEventListener('dragstart', () => {
        dragSrc = row;
        setTimeout(() => row.classList.add('dragging'), 0);
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        list.querySelectorAll('.item-row').forEach(r => r.classList.remove('drag-over'));
      });
      row.addEventListener('dragover', e => {
        e.preventDefault();
        if (row !== dragSrc) {
          list.querySelectorAll('.item-row').forEach(r => r.classList.remove('drag-over'));
          row.classList.add('drag-over');
        }
      });
      row.addEventListener('drop', e => {
        e.preventDefault();
        if (dragSrc && dragSrc !== row) {
          row.classList.remove('drag-over');
          const rows = [...list.querySelectorAll('.item-row[data-id]')];
          const ids = rows.map(r => r.dataset.id);
          const srcIdx = ids.indexOf(dragSrc.dataset.id);
          const dstIdx = ids.indexOf(row.dataset.id);
          ids.splice(srcIdx, 1);
          ids.splice(dstIdx, 0, dragSrc.dataset.id);
          this.updateCustomOrderFromVisible(ids);
          this.saveAll(); this.render();
        }
      });
    });
  }

  // Multi-select
  toggleSelectItem(itemId) {
    if (this.selectedIds.has(itemId)) this.selectedIds.delete(itemId);
    else this.selectedIds.add(itemId);
    this.render();
  }

  clearSelection() {
    this.selectedIds = new Set();
    this.render();
  }

  moveSelectedUp() {
    if (this.selectedIds.size === 0) return;
    const visibleIds = this.getFilteredItems(false).map(i => i.id);
    const firstSelIdx = visibleIds.findIndex(id => this.selectedIds.has(id));
    if (firstSelIdx === 0) return;
    const newVisible = [...visibleIds];
    for (let i = 0; i < newVisible.length; i++) {
      if (this.selectedIds.has(newVisible[i]) && i > 0 && !this.selectedIds.has(newVisible[i - 1])) {
        [newVisible[i - 1], newVisible[i]] = [newVisible[i], newVisible[i - 1]];
      }
    }
    this.updateCustomOrderFromVisible(newVisible);
    this.saveAll(); this.render();
  }

  moveSelectedDown() {
    if (this.selectedIds.size === 0) return;
    const visibleIds = this.getFilteredItems(false).map(i => i.id);
    const lastSelIdx = visibleIds.map((id, i) => this.selectedIds.has(id) ? i : -1).filter(i => i >= 0).pop();
    if (lastSelIdx === visibleIds.length - 1) return;
    const newVisible = [...visibleIds];
    for (let i = newVisible.length - 1; i >= 0; i--) {
      if (this.selectedIds.has(newVisible[i]) && i < newVisible.length - 1 && !this.selectedIds.has(newVisible[i + 1])) {
        [newVisible[i], newVisible[i + 1]] = [newVisible[i + 1], newVisible[i]];
      }
    }
    this.updateCustomOrderFromVisible(newVisible);
    this.saveAll(); this.render();
  }

  // Filter actions
  toggleFilter(category, value) {
    const arr = this.filters[category];
    const idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(value);
    this.saveUserData(); this.render();
  }

  setOrder(order) {
    if (order === 'custom') this.syncCustomOrder();
    this.filters.order = order;
    this.selectedIds = new Set();
    this.saveUserData(); this.render();
  }

  toggleEra(key) {
    this.filters[key] = !this.filters[key];
    this.saveUserData(); this.render();
  }

  toggleTagsExpanded() {
    this.tagsExpanded = !this.tagsExpanded;
    this.render();
  }

  // Watchthrough actions
  selectWatchthrough(id) {
    this.watchthroughs.setActive(id);
    this.saveAll(); this.render();
  }

  createWatchthrough(name) {
    this.watchthroughs.create(name);
    this.saveAll(); this.render();
  }

  deleteActiveWatchthrough() {
    if (!confirm('Delete this watchthrough? All progress will be lost.')) return;
    this.watchthroughs.deleteActive();
    this.saveAll(); this.render();
  }

  watchlistFilename() {
    return 'watchlist.txt';
  }

  // Item click
  handleItemClick(event, itemId) {
    if (event.target.classList.contains('drag-handle')) return;
    if (event.target.classList.contains('item-edit-btn')) return;
    if (event.target.classList.contains('item-hide-btn')) return;

    const isCustom = this.filters.order === 'custom';
    if (isCustom && (event.ctrlKey || event.metaKey || event.shiftKey)) {
      this.toggleSelectItem(itemId);
      return;
    }
    this.toggleWatched(itemId);
  }

  // Item edit modal
  openAddItemModal() {
    this.editingItemId = Utils.generateId();
    this.pendingNewTags = [];
    this._openItemModal('Add New Entry', null);
  }

  openEditItemModal(id) {
    this.editingItemId = id;
    this._openItemModal('Edit Entry', this.items.find(i => i.id === id));
  }

  _openItemModal(title, item) {
    this.formDirty = false;
    this._setupTagEditor();
    this.modals.item.setTitle(title);
    this.modals.item.setBody(this.buildItemForm(item));
    this.modals.item.open();
  }

  _setupTagEditor() {
    this.tagEditor = new TagEditor({
      getTags: () => {
        const item = this.items.find(i => i.id === this.editingItemId);
        return item ? item.tags || [] : this.pendingNewTags;
      },
      setTags: tags => {
        const item = this.items.find(i => i.id === this.editingItemId);
        if (item) item.tags = tags; else this.pendingNewTags = tags;
      },
      getAllTags: () => this.getAllMainTags(),
      onChange: () => {},
    });
  }

  buildItemForm(item) {
    const sel = (val, match) => val === match ? 'selected' : '';
    return `
      <div class="form-group">
        <label class="form-label">Title</label>
        <input class="form-input" id="ef_title" value="${item ? Utils.escHtml(item.title) : ''}" placeholder="Entry title" />
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
        <input class="form-input" id="ef_setIn" value="${item ? Utils.escHtml(item.timeline_position || '') : ''}" placeholder="e.g. 19 BBY" />
      </div>
      <div class="form-group">
        <label class="form-label">Timeline Sort Key <span style="color:var(--sw-muted);font-size:11px;">BBY = negative, ABY = positive</span></label>
        <input class="form-input" id="ef_setSort" type="number" step="0.1" value="${item ? item.timeline_sort_key : 0}" />
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <select class="form-select" id="ef_type">
          <option value="movie" ${sel(item?.type, 'movie')}>Movie</option>
          <option value="tv" ${sel(item?.type, 'tv')}>TV</option>
          <option value="game" ${sel(item?.type, 'game')}>Game</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Vitality</label>
        <select class="form-select" id="ef_vital">
          <option value="vital" ${sel(item?.vitality, 'vital')}>Vital</option>
          <option value="skippable" ${sel(item?.vitality, 'skippable')}>Non-Essential</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Quality</label>
        <select class="form-select" id="ef_quality">
          <option value="" ${!item?.quality ? 'selected' : ''}>Unknown</option>
          <option value="great" ${sel(item?.quality, 'great')}>Great</option>
          <option value="good" ${sel(item?.quality, 'good')}>Good</option>
          <option value="meh" ${sel(item?.quality, 'meh')}>Meh</option>
          <option value="bad" ${sel(item?.quality, 'bad')}>Bad</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">George Lucas Era?</label>
        <select class="form-select" id="ef_postLucas">
          <option value="false" ${!item?.is_post_george_lucas ? 'selected' : ''}>Yes (George Lucas)</option>
          <option value="true" ${item?.is_post_george_lucas ? 'selected' : ''}>No (Post-George)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input class="form-input" id="ef_notes" value="${item ? Utils.escHtml(item.notes || '') : ''}" placeholder="Optional notes" />
      </div>
      ${this.tagEditor.renderField()}
      <div class="modal-actions">
        <button class="btn primary" onclick="app.saveItem()">Save</button>
        ${item ? `<button class="btn danger" onclick="app.deleteItem('${item.id}')">Delete</button>` : ''}
        <button class="btn" onclick="app.attemptCloseModal('itemModal')">Cancel</button>
      </div>
    `;
  }

  saveItem() {
    const title = Utils.$('ef_title').value.trim();
    if (!title) { alert('Title is required'); return; }
    const dateVal = Utils.$('ef_date').value.trim();
    const data = {
      title,
      release_date: dateVal || undefined,
      release_year: parseInt(Utils.$('ef_year').value) || new Date().getFullYear(),
      timeline_position: Utils.$('ef_setIn').value.trim(),
      timeline_sort_key: parseFloat(Utils.$('ef_setSort').value) || 0,
      type: Utils.$('ef_type').value,
      vitality: Utils.$('ef_vital').value,
      quality: Utils.$('ef_quality').value || null,
      is_post_george_lucas: Utils.$('ef_postLucas').value === 'true',
      notes: Utils.$('ef_notes').value.trim(),
    };
    if (!data.release_date) delete data.release_date;

    const existingItem = this.items.find(i => i.id === this.editingItemId);
    if (existingItem) {
      Object.assign(existingItem, data);
    } else {
      const newItem = {
        ...data,
        id: this.editingItemId,
        tags: this.pendingNewTags || [],
        chronological_order: Math.max(...this.items.map(i => i.chronological_order || 0), 0) + 1,
      };
      this.pendingNewTags = [];
      this.items.push(newItem);
      const newKey = Utils.releaseSortKey(newItem);
      const insertIdx = this.releaseOrder.findIndex(id => {
        const existing = this.items.find(i => i.id === id);
        return existing && Utils.releaseSortKey(existing) > newKey;
      });
      if (insertIdx === -1) this.releaseOrder.push(newItem.id);
      else this.releaseOrder.splice(insertIdx, 0, newItem.id);
      this.customOrder.push(newItem.id);
    }
    this.formDirty = false;
    this.saveAll(); this.closeModal('itemModal'); this.render();
  }

  deleteItem(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    this.formDirty = false;
    this.items = this.items.filter(i => i.id !== id);
    this.releaseOrder = this.releaseOrder.filter(i => i !== id);
    this.customOrder = this.customOrder.filter(i => i !== id);
    this.hiddenIds.delete(id);
    this.deletedIds.add(id);
    this.saveAll(); this.closeModal('itemModal'); this.render();
  }

  // Export / import
  openExportModal() {
    const exportData = JSON.stringify({
      version: 7,
      exported: new Date().toISOString(),
      watchthroughs: this.watchthroughs.toJSON(),
      customOrder: this.customOrder,
      hiddenIds: [...this.hiddenIds],
      appState: { activeWT: this.watchthroughs.activeId, mainFilters: this.filters },
    }, null, 2);

    Utils.$('exportModalBody').innerHTML = `
      <p style="color:var(--sw-muted);font-size:13px;margin-bottom:1rem;">
        Exports watchthrough progress, custom ordering, and hidden items — your
        personal browser data. For content changes (titles, tags, episodes),
        use ↓ Download data.js below instead.
      </p>
      <textarea id="exportText" style="width:100%;height:200px;background:var(--sw-panel2);border:1px solid var(--sw-border);color:var(--sw-text);font-family:monospace;font-size:11px;padding:10px;border-radius:2px;resize:vertical;">${exportData}</textarea>
      <div class="modal-actions">
        <button class="btn primary" onclick="app.copyExport()">Copy to Clipboard</button>
        <button class="btn success" onclick="app.importData()">Import from above</button>
        <button class="btn" onclick="app.closeModal('exportModal')">Close</button>
      </div>
      <p id="exportMsg" style="color:#81C784;font-size:12px;margin-top:8px;display:none;">Copied!</p>

      <div class="export-divider"></div>
      <div class="export-section-title">↓ Download data.js</div>
      <p style="color:var(--sw-muted);font-size:12px;margin-bottom:0.75rem;line-height:1.5;">
        Generates a complete, ready-to-use <code>data.js</code> — this list's entries plus
        every show's episodes, with all edits (including tags) from every page in this
        browser already baked in. Save it over the site's existing <code>data.js</code>
        to make everything permanent.
      </p>
      <div class="modal-actions">
        <button class="btn" onclick="app.downloadFullDataJs()">↓ Download data.js</button>
      </div>
    `;
    Utils.$('exportModal').classList.add('open');
  }

  copyExport() {
    navigator.clipboard.writeText(Utils.$('exportText').value).then(() => {
      const msg = Utils.$('exportMsg');
      msg.style.display = 'block';
      setTimeout(() => msg.style.display = 'none', 2000);
    });
  }

  importData() {
    try {
      const data = JSON.parse(Utils.$('exportText').value);
      if (data.watchthroughs) this.watchthroughs = new WatchthroughCollection(data.watchthroughs, this.watchthroughs.activeId);
      if (data.customOrder) this.customOrder = data.customOrder;
      if (data.hiddenIds) this.hiddenIds = new Set(data.hiddenIds);
      if (data.appState) {
        if (data.appState.activeWT !== undefined) this.watchthroughs.setActive(data.appState.activeWT);
        if (data.appState.mainFilters) this.filters = { ...this.filters, ...data.appState.mainFilters };
      }
      this.saveAll(); this.closeModal('exportModal'); this.render();
      alert('Data imported successfully!');
    } catch (e) {
      alert('Invalid JSON data. Please check and try again.');
    }
  }

  /** Rebuilds the full data.js: this page's items (already reflect edits)
   *  plus every show's episodes with that show's saved edits merged in,
   *  read straight from localStorage without needing to visit each page. */
  buildFullDataJs() {
    const showGlobals = ['CW_DATA', 'REBELS_DATA', 'RESISTANCE_DATA', 'MANDO_DATA', 'BAD_BATCH_DATA'];
    const out = {
      CONTENT_DATA: { items: this.items.map(i => ({ ...i })), release_order: this.releaseOrder },
    };

    showGlobals.forEach(globalName => {
      const shipped = window[globalName];
      if (!shipped) return;
      const editsStore = new KVStore(`sw_show_${shipped.show.id}_edits`);
      const legacyTagsStore = new KVStore(`sw_show_${shipped.show.id}_tags`);
      const edits = editsStore.getJSON({});
      const legacyTags = legacyTagsStore.getJSON({});
      const episodes = shipped.episodes.map(ep => {
        const merged = { ...ep, tags: [...(ep.tags || [])] };
        if (legacyTags[ep.id]) merged.tags = legacyTags[ep.id];
        if (edits[ep.id]) Object.assign(merged, edits[ep.id]);
        return merged;
      });
      out[globalName] = { show: shipped.show, episodes };
    });

    out.PROJECT_INFO = window.PROJECT_INFO || {};
    return out;
  }

  downloadFullDataJs() {
    const d = this.buildFullDataJs();
    const dump = obj => JSON.stringify(obj);
    const lines = [
      '// data.js — the database for this static site.',
      "// Downloaded via the main list's Download data.js button, with every",
      "// edit made in this browser (on any page) already merged in.",
      '// Save it over the existing data.js to make those changes permanent.',
      '// `var` (not `const`) is required — these become window.* globals that',
      '// main-app.js / show-app.js look up by name at runtime.',
      '',
      `var CONTENT_DATA = ${dump(d.CONTENT_DATA)};`,
      `var CW_DATA = ${dump(d.CW_DATA)};`,
      `var REBELS_DATA = ${dump(d.REBELS_DATA)};`,
      `var RESISTANCE_DATA = ${dump(d.RESISTANCE_DATA)};`,
      `var MANDO_DATA = ${dump(d.MANDO_DATA)};`,
      `var BAD_BATCH_DATA = ${dump(d.BAD_BATCH_DATA)};`,
      `var PROJECT_INFO = ${dump(d.PROJECT_INFO)};`,
      '',
    ];
    Utils.downloadFile(lines.join('\n'), 'data.js', 'application/javascript');
  }
}
