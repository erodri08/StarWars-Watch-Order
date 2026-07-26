// components.js — reusable UI building blocks; render() methods return HTML strings

/** Nav bar shared by every page. */
class Nav {
  static PAGES = [
    { href: 'index.html', label: '◈ Main List', color: null },
    { href: 'cw.html', label: '◈ Clone Wars', color: '#64B4FF' },
    { href: 'rebels.html', label: '◈ Rebels', color: '#E8A020' },
    { href: 'resistance.html', label: '◈ Resistance', color: '#E8DFA0' },
    { href: 'mando.html', label: '◈ Mando & Boba Fett', color: '#8B7355' },
    { href: 'bad_batch.html', label: '◈ Bad Batch', color: '#C0392B' },
  ];

  static render(trailingHtml = '') {
    const current = location.pathname.split('/').pop() || 'index.html';
    const tabs = Nav.PAGES.map(p => {
      const active = p.href === current;
      const style = p.color ? `style="--tab-color:${p.color}"` : '';
      return `<a class="nav-tab ${active ? 'active' : ''}" href="${p.href}" ${style}>${p.label}</a>`;
    }).join('');
    return tabs + trailingHtml;
  }

  static mount(elementId, trailingHtml = '') {
    const el = Utils.$(elementId);
    if (el) el.innerHTML = Nav.render(trailingHtml);
  }
}

/** Wraps a `.modal-overlay` element's open/closed state and content. */
class ModalController {
  constructor(id) {
    this.id = id;
  }

  get el() {
    return Utils.$(this.id);
  }

  open() {
    this.el?.classList.add('open');
  }

  close() {
    this.el?.classList.remove('open');
  }

  setTitle(text) {
    const el = Utils.$(this.id + 'Title');
    if (el) el.textContent = text;
  }

  setBody(html) {
    const el = Utils.$(this.id + 'Body');
    if (el) el.innerHTML = html;
  }

  /** Closes a modal on overlay click, routed through attemptCloseModal
   *  so unsaved edits still get a confirmation prompt. */
  static wireOverlayDismiss(app) {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target !== overlay) return;
        if (app) app.attemptCloseModal(overlay.id);
        else overlay.classList.remove('open');
      });
    });
  }
}

/** Renders a titled panel of toggle-able filter chips. */
class FilterPanel {
  /**
   * @param {string} title
   * @param {Array<[value,label,activeClass]>} options
   * @param {string[]} activeArr - currently active values
   * @param {(value:string)=>string} onClickFor - returns the onclick JS for a chip
   * @param {string} [extraStyle]
   */
  static renderChips(title, options, activeArr, onClickFor, extraStyle = 'flex:1; min-width:180px;') {
    return `
      <div class="panel" style="${extraStyle}">
        <div class="panel-title">${title}</div>
        <div class="filter-chips">
          ${options.map(([val, label, cls]) =>
            `<button class="chip ${activeArr.includes(val) ? cls : ''}" onclick="${onClickFor(val)}">${label}</button>`
          ).join('')}
        </div>
      </div>`;
  }
}

/** Renders the watchthrough selector bar and (optionally) its progress bar. */
class WatchthroughBar {
  static render({ watchthroughs, activeId, color = 'var(--sw-gold)', watchedCount = null, total = null }) {
    const hasActive = !!activeId;
    let html = `
      <div class="watchthrough-bar">
        <span class="wt-label">Watchthrough:</span>
        <select class="wt-select" onchange="app.selectWatchthrough(this.value)">
          <option value="">— None —</option>
          ${watchthroughs.map(w =>
            `<option value="${w.id}" ${activeId === w.id ? 'selected' : ''}>${Utils.escHtml(w.name)}</option>`
          ).join('')}
        </select>
        <button class="btn primary" onclick="app.openNewWatchthroughModal()">+ New</button>
        ${hasActive ? `<button class="btn danger" onclick="app.deleteActiveWatchthrough()">Delete</button>` : ''}
        ${hasActive ? `<button class="btn success" onclick="app.exportWatchlistTxt()">↓ Export List</button>` : ''}
      </div>`;

    if (hasActive && total !== null) {
      const pct = total > 0 ? Math.round((watchedCount / total) * 100) : 0;
      html += `
        <div style="margin-bottom:1rem;">
          <div class="progress-text">${watchedCount} / ${total} watched — ${pct}%</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color};"></div></div>
        </div>`;
    }
    return html;
  }
}

/** The "New Watchthrough" naming modal shared by both apps; the caller
 *  supplies what happens when a name is confirmed. */
class WatchthroughNameModal {
  constructor(modal, onCreate) {
    this.modal = modal; // ModalController for 'wtModal'
    this.onCreate = onCreate;
  }

  open() {
    this.modal.setBody(`
      <div class="form-group">
        <label class="form-label">Watchthrough Name</label>
        <input class="form-input" id="wtNameInput" placeholder="e.g. First Watch 2024" />
      </div>
      <div class="modal-actions">
        <button class="btn primary" onclick="app.watchthroughNameModal.confirm()">Create</button>
        <button class="btn" onclick="app.closeModal('wtModal')">Cancel</button>
      </div>
    `);
    this.modal.open();
    setTimeout(() => Utils.$('wtNameInput')?.focus(), 80);
  }

  confirm() {
    const name = Utils.$('wtNameInput').value.trim();
    if (!name) return;
    this.onCreate(name);
    this.modal.close();
  }
}

/** Generic tag editor for a modal's "Tags" field. Works for both main
 *  items and episodes — tags live directly on the entry either way; the
 *  caller just supplies get/set/list-all callbacks. */
class TagEditor {
  constructor({ getTags, setTags, getAllTags, onChange }) {
    this.getTags = getTags;
    this.setTags = setTags;
    this.getAllTags = getAllTags;
    this.onChange = onChange || (() => {});
  }

  renderField() {
    const tags = this.getTags();
    const pool = this._availableTags();
    return `
      <div class="form-group">
        <label class="form-label">Tags</label>
        <div class="tag-input-row">
          <input class="form-input" id="ef_tagInput" placeholder="New tag…"
                 onkeydown="app.tagEditor.handleKeydown(event)" oninput="app.tagEditor.filterPool()" />
          <button class="btn" onclick="app.tagEditor.addFromInput()">Add</button>
        </div>
        ${pool.length ? `
          <div class="tag-existing-label">Existing tags — click to add:</div>
          <input class="form-input" id="ef_poolSearch" style="margin-bottom:6px;font-size:13px;padding:5px 8px;"
                 placeholder="Search existing tags…" oninput="app.tagEditor.filterPool()" />
          <div class="tag-existing-pool" id="tagPool">${this._poolHtml(pool)}</div>`
          : `<div class="tag-existing-pool" id="tagPool" style="display:none"></div>`}
        <div class="tags-display" id="tagsDisplay">${this._tagsHtml(tags)}</div>
      </div>
    `;
  }

  handleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.addFromInput();
    }
  }

  addFromInput() {
    const input = Utils.$('ef_tagInput');
    this.addDirect(Utils.slugify(input.value));
    input.value = '';
  }

  addDirect(tag) {
    if (!tag) return;
    const tags = this.getTags();
    if (!tags.includes(tag)) this.setTags([...tags, tag]);
    this._refresh();
  }

  remove(tag) {
    this.setTags(this.getTags().filter(t => t !== tag));
    this._refresh();
  }

  filterPool() {
    const query = (Utils.$('ef_poolSearch')?.value || Utils.$('ef_tagInput')?.value || '').toLowerCase().trim();
    const pool = Utils.$('tagPool');
    if (!pool) return;
    const available = this._availableTags();
    const visible = query ? available.filter(t => t.includes(query)) : available;
    pool.style.display = '';
    pool.innerHTML = visible.length
      ? this._poolHtml(visible)
      : `<span style="color:var(--sw-muted);font-size:12px;">${available.length ? 'No tags match' : ''}</span>`;
  }

  _availableTags() {
    const current = this.getTags();
    return this.getAllTags().filter(t => !current.includes(t));
  }

  _tagsHtml(tags) {
    return tags.map(t => `
      <span class="tag-pill">${Utils.escHtml(t)}
        <span class="tag-pill-remove" onclick="app.tagEditor.remove('${Utils.escHtml(t)}')">✕</span>
      </span>`).join('');
  }

  _poolHtml(pool) {
    return pool.map(t =>
      `<button class="tag-existing-pill" onclick="app.tagEditor.addDirect('${Utils.escHtml(t)}')">${Utils.escHtml(t)}</button>`
    ).join('');
  }

  _refresh() {
    const display = Utils.$('tagsDisplay');
    if (display) display.innerHTML = this._tagsHtml(this.getTags());
    this.filterPool();
    this.onChange();
  }
}
