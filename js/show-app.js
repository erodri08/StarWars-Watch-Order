// show-app.js — controller shared by every episode-list page
// (cw.html, rebels.html, resistance.html, mando.html, bad_batch.html)

class ShowPageApp extends BaseWatchlistApp {
  /** Maps a page filename to the data.js global holding its SHOW_DATA. */
  static PAGE_DATA_MAP = {
    'cw.html': 'CW_DATA',
    'rebels.html': 'REBELS_DATA',
    'resistance.html': 'RESISTANCE_DATA',
    'mando.html': 'MANDO_DATA',
    'bad_batch.html': 'BAD_BATCH_DATA',
  };

  constructor() {
    super();
    const page = location.pathname.split('/').pop() || '';
    const globalName = ShowPageApp.PAGE_DATA_MAP[page];
    const showData = window[globalName];
    if (!showData) throw new Error(`No SHOW_DATA found for page "${page}" (expected window.${globalName})`);

    this.show = showData.show;
    this.sourceEpisodes = showData.episodes;

    this.keys = {
      wt: new KVStore(`sw_show_${this.show.id}_wt`),
      active: new KVStore(`sw_show_${this.show.id}_active`),
      filters: new KVStore(`sw_show_${this.show.id}_filters`),
      tagsLegacy: new KVStore(`sw_show_${this.show.id}_tags`),
      edits: new KVStore(`sw_show_${this.show.id}_edits`),
    };

    this.episodes = [];
    this.watchthroughs = new WatchthroughCollection();
    this.filters = { vital: [], quality: [], tags: [], seasons: [] };
    this.tagsExpanded = false;
    this.tagSearch = '';
    this.editingEpId = null;
  }

  // Load / persist
  init() {
    this.load();
    this.render();
    this.mountChrome();
  }

  load() {
    this.episodes = this.sourceEpisodes.map(ep => ({ ...ep, tags: [...(ep.tags || [])] }));

    // Legacy tags-only key from an older version of the app, applied first
    // so current edits (below) always take precedence over it.
    const legacyTags = this.keys.tagsLegacy.getJSON({});
    this.episodes.forEach(ep => { if (legacyTags[ep.id]) ep.tags = legacyTags[ep.id]; });

    // Saved per-episode edits (vitality, quality, notes, tags, etc.)
    const edits = this.keys.edits.getJSON({});
    this.episodes.forEach(ep => { if (edits[ep.id]) Object.assign(ep, edits[ep.id]); });

    const savedWTs = this.keys.wt.getJSON([]);
    const activeId = this.keys.active.getText(null) || null;
    this.watchthroughs = new WatchthroughCollection(savedWTs, activeId);

    this.filters = { vital: [], quality: [], tags: [], seasons: [], ...this.keys.filters.getJSON({}) };
  }

  save() {
    this.keys.wt.setJSON(this.watchthroughs.toJSON());
    this.keys.active.setText(this.watchthroughs.activeId || '');
    this.keys.filters.setJSON(this.filters);

    // Only persist fields that differ from the shipped JSON, keeping the diff small.
    const edits = {};
    const origById = new Map(this.sourceEpisodes.map(ep => [ep.id, ep]));
    const fields = ['title', 'air_code', 'release_date', 'release_year', 'vitality', 'quality', 'notes', 'tags', 'timeline_position'];
    this.episodes.forEach(ep => {
      const orig = origById.get(ep.id);
      if (!orig) return;
      const diff = {};
      fields.forEach(k => {
        if (JSON.stringify(ep[k] ?? null) !== JSON.stringify(orig[k] ?? null)) diff[k] = ep[k];
      });
      if (Object.keys(diff).length) edits[ep.id] = diff;
    });
    this.keys.edits.setJSON(edits);
    this.flashSaved();
  }

  // Watched
  isWatched(epId) {
    return !!this.watchthroughs.active?.isWatched(epId);
  }

  toggleWatch(epId) {
    const wt = this.watchthroughs.active;
    if (!wt) { alert('Create or select a watchthrough first!'); return; }
    wt.toggle(epId);
    this.save(); this.render();
  }

  // Filtering
  getFilteredEntries() {
    return this.filtered();
  }

  filtered() {
    const f = this.filters;
    let eps = [...this.episodes];
    if (f.seasons?.length) eps = eps.filter(e => f.seasons.includes(String(e.season)));
    eps = eps.filter(e => EntryCollection.matchesCommonFilters(e, f, ep => ep.tags || []));
    return eps;
  }

  getAllTags() {
    return new EntryCollection(this.episodes).allTags(ep => ep.tags || []);
  }

  getSeasons() {
    return [...new Set(this.episodes.map(e => String(e.season)))];
  }

  toggleFilter(category, value) {
    const arr = this.filters[category];
    const idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(value);
    this.save(); this.render();
  }

  toggleTagsExpanded() {
    this.tagsExpanded = !this.tagsExpanded;
    this.render();
  }

  // Render
  render() {
    this.renderHeader();
    this.renderFilters();
    this.renderWTBar();
    this.renderList();
  }

  renderHeader() {
    document.title = `${this.show.title} — Star Wars Watchlist Maker`;
    Utils.$('showTitle').textContent = `⬡ ${this.show.title.toUpperCase()} ⬡`;
    Utils.$('showYears').textContent = this.show.years || '';
    Nav.mount('navTabs', `<button class="btn" style="margin-left:auto" onclick="app.downloadJSON()" title="For the complete data.js, use the Main List page">↓ Download ${Utils.escHtml(this.show.title)} JSON</button>`);
  }

  renderFilters() {
    const allTags = this.getAllTags();
    const seasons = this.getSeasons();
    const f = this.filters;

    const vitalOpts = [['vital', 'Vital', 'active-vital'], ['non-essential', 'Non-Essential', 'active-skippable']];
    const qualOpts = [['great', 'Great', 'active-great'], ['good', 'Good', 'active-good'], ['meh', 'Meh', 'active-meh'], ['bad', 'Bad', 'active-bad']];

    let html = `<div class="section-row" style="gap:1rem;align-items:stretch;">`;
    html += FilterPanel.renderChips('Vitality', vitalOpts, f.vital, v => `app.toggleFilter('vital','${v}')`);
    html += FilterPanel.renderChips('Quality', qualOpts, f.quality, v => `app.toggleFilter('quality','${v}')`);

    if (seasons.length > 1) {
      html += `<div class="panel" style="flex:1;min-width:180px;">
        <div class="panel-title">Season</div>
        <div class="filter-chips">
          ${seasons.map(s => `<button class="chip ${f.seasons.includes(s) ? 'active-order' : ''}" onclick="app.toggleFilter('seasons','${s}')">S${s}</button>`).join('')}
        </div>
      </div>`;
    }
    html += `</div>`;

    if (allTags.length > 0) {
      html += `
        <div class="section-row" style="gap:1rem;align-items:stretch;">
          <div class="panel" style="flex:1;">
            <div class="panel-title" style="display:flex;align-items:center;gap:8px;cursor:pointer;" onclick="app.toggleTagsExpanded()">
              Tags
              ${f.tags.length ? `<span style="font-size:10px;color:var(--sw-gold);letter-spacing:0;">${f.tags.length} active</span>` : ''}
              <button class="tag-collapse-btn">${this.tagsExpanded ? '▲ Collapse' : '▼ Show (' + allTags.length + ')'}</button>
            </div>
            ${this.tagsExpanded ? `
              <input class="form-input" id="showTagSearchInput" style="margin-top:8px;margin-bottom:8px;font-size:13px;padding:5px 8px;"
                placeholder="Search tags…" value="${Utils.escHtml(this.tagSearch)}"
                oninput="app.updateTagSearch(this.value)"
                onclick="event.stopPropagation()" />
              <div class="filter-chips" id="showTagChips">${this._tagChipsHtml(allTags)}</div>` : ''}
          </div>
        </div>
      `;
    }

    Utils.$('filtersArea').innerHTML = html;
  }

  _tagChipsHtml(allTags) {
    const q = (this.tagSearch || '').toLowerCase().trim();
    const visibleTags = q ? allTags.filter(t => t.includes(q)) : allTags;
    return visibleTags.length
      ? visibleTags.map(t => `<button class="chip ${this.filters.tags.includes(t) ? 'active-tag' : ''}" onclick="event.stopPropagation();app.toggleFilter('tags','${Utils.escHtml(t)}')">${Utils.escHtml(t)}</button>`).join('')
      : `<span style="color:var(--sw-muted);font-size:12px;">No tags match</span>`;
  }

  /** Called on every keystroke in the tag search box — updates only the chip
   *  list, never re-renders the input itself, so focus/cursor are preserved. */
  updateTagSearch(value) {
    this.tagSearch = value;
    const chips = Utils.$('showTagChips');
    if (chips) chips.innerHTML = this._tagChipsHtml(this.getAllTags());
  }

  renderWTBar() {
    const wt = this.watchthroughs.active;
    const eps = this.filtered();
    Utils.$('wtArea').innerHTML =
      WatchthroughBar.render({
        watchthroughs: this.watchthroughs.items,
        activeId: this.watchthroughs.activeId,
        color: this.show.color || 'var(--sw-gold)',
        watchedCount: wt ? wt.countWatched(eps.map(e => e.id)) : null,
        total: wt ? eps.length : null,
      }) +
      `<div class="top-actions">
        <span style="font-family:'Orbitron',monospace;font-size:10px;color:var(--sw-muted);margin-left:auto;">${eps.length} episodes</span>
      </div>`;
  }

  renderList() {
    const eps = this.filtered();
    Utils.$('epList').innerHTML = eps.length === 0
      ? '<div class="empty-state">No episodes match current filters</div>'
      : eps.map((ep, idx) => this.renderEpRow(ep, idx + 1)).join('');
  }

  renderEpRow(ep, num) {
    const w = this.isWatched(ep.id);
    const epCode = Utils.formatAirCode(ep.air_code);
    const dateStr = ep.release_date || (ep.release_year ? String(ep.release_year) : '');
    const epBadge = `<span class="badge badge-ep">${Utils.escHtml(epCode)}</span>`;
    const vBadge = ep.vitality === 'vital'
      ? `<span class="badge badge-vital">Vital</span>`
      : ep.vitality === 'skippable' ? `<span class="badge badge-skip">Non-Ess.</span>` : '';
    const qBadge = ep.quality ? `<span class="badge badge-${ep.quality}">${ep.quality}</span>` : '';
    const noteStr = ep.notes ? ` <span class="item-note">${Utils.escHtml(ep.notes)}</span>` : '';

    return `
      <div class="item-row ${w ? 'watched' : ''}" onclick="app.handleRowClick(event,'${ep.id}')">
        <div class="item-check ${w ? 'checked' : ''}">${w ? '✓' : ''}</div>
        <div class="item-num">${num}</div>
        <div class="item-badges">${epBadge}${vBadge}${qBadge}</div>
        <div class="item-title ${w ? 'watched-title' : ''}">${Utils.escHtml(ep.title)}${noteStr}</div>
        <div class="item-year">${dateStr}</div>
        <button class="item-edit-btn" onclick="event.stopPropagation();app.openEditEp('${ep.id}')">Edit</button>
      </div>`;
  }

  // Interactions
  handleRowClick(event, epId) {
    if (event.target.classList.contains('item-edit-btn')) return;
    this.toggleWatch(epId);
  }

  // Watchthrough CRUD
  selectWatchthrough(id) {
    this.watchthroughs.setActive(id);
    this.save(); this.render();
  }

  createWatchthrough(name) {
    this.watchthroughs.create(name);
    this.save(); this.render();
  }

  deleteActiveWatchthrough() {
    if (!confirm('Delete this watchthrough? Progress will be lost.')) return;
    this.watchthroughs.deleteActive();
    this.save(); this.render();
  }

  watchlistFilename() {
    return `${this.show.id}-watchlist.txt`;
  }

  saveAll() { this.save(); }

  // Episode edit modal
  openEditEp(epId) {
    const ep = this.episodes.find(e => e.id === epId);
    if (!ep) return;
    this.editingEpId = epId;
    this.formDirty = false;
    this._setupTagEditor();
    this.modals.item.setTitle('Edit Episode');
    this.modals.item.setBody(this.buildEpForm(ep));
    this.modals.item.open();
  }

  _setupTagEditor() {
    this.tagEditor = new TagEditor({
      getTags: () => this.episodes.find(e => e.id === this.editingEpId)?.tags || [],
      setTags: tags => {
        const ep = this.episodes.find(e => e.id === this.editingEpId);
        if (ep) ep.tags = tags;
      },
      getAllTags: () => this.getAllTags(),
      onChange: () => {},
    });
  }

  buildEpForm(ep) {
    const sel = (v, m) => v === m ? 'selected' : '';
    return `
      <div class="form-group">
        <label class="form-label">Title</label>
        <input class="form-input" id="ef_title" value="${Utils.escHtml(ep.title)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Episode Code</label>
        <input class="form-input" id="ef_code" value="${Utils.escHtml(String(ep.air_code))}" />
      </div>
      <div class="form-group">
        <label class="form-label">Release Date (YYYY-MM-DD)</label>
        <input class="form-input" id="ef_date" type="date" value="${ep.release_date || ''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Release Year</label>
        <input class="form-input" id="ef_year" type="number" value="${ep.release_year || ''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Vitality</label>
        <select class="form-select" id="ef_vital">
          <option value="" ${!ep.vitality ? 'selected' : ''}>Unknown</option>
          <option value="vital" ${sel(ep.vitality, 'vital')}>Vital</option>
          <option value="skippable" ${sel(ep.vitality, 'skippable')}>Non-Essential</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Quality</label>
        <select class="form-select" id="ef_quality">
          <option value="" ${!ep.quality ? 'selected' : ''}>Unknown</option>
          <option value="great" ${sel(ep.quality, 'great')}>Great</option>
          <option value="good" ${sel(ep.quality, 'good')}>Good</option>
          <option value="meh" ${sel(ep.quality, 'meh')}>Meh</option>
          <option value="bad" ${sel(ep.quality, 'bad')}>Bad</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input class="form-input" id="ef_notes" value="${Utils.escHtml(ep.notes || '')}" />
      </div>
      ${this.tagEditor.renderField()}
      <div class="modal-actions">
        <button class="btn primary" onclick="app.saveEp()">Save</button>
        <button class="btn" onclick="app.attemptCloseModal('itemModal')">Cancel</button>
      </div>`;
  }

  saveEp() {
    const ep = this.episodes.find(e => e.id === this.editingEpId);
    if (!ep) return;
    ep.title = Utils.$('ef_title').value.trim() || ep.title;
    ep.air_code = Utils.$('ef_code').value.trim() || ep.air_code;
    ep.release_date = Utils.$('ef_date').value.trim() || undefined;
    ep.release_year = parseInt(Utils.$('ef_year').value) || ep.release_year;
    ep.vitality = Utils.$('ef_vital').value || null;
    ep.quality = Utils.$('ef_quality').value || null;
    ep.notes = Utils.$('ef_notes').value.trim();
    if (!ep.release_date) delete ep.release_date;
    this.formDirty = false;
    this.save(); this.closeModal('itemModal'); this.render();
  }

  // Export
  downloadJSON() {
    const out = {
      show: this.show,
      episodes: this.episodes.map(ep => {
        const e = { ...ep };
        if (!e.tags || e.tags.length === 0) delete e.tags;
        return e;
      }),
    };
    Utils.downloadFile(JSON.stringify(out, null, 2), `${this.show.id}_episodes.json`, 'application/json');
  }
}
