// base-app.js — shared skeleton for MainListApp and ShowPageApp

class BaseWatchlistApp {
  constructor() {
    this.saveIndicator = new SaveIndicator('saveIndicator');
    this.modals = {
      item: new ModalController('itemModal'),
      wt: new ModalController('wtModal'),
    };
    this.watchthroughNameModal = new WatchthroughNameModal(this.modals.wt, name => this.createWatchthrough(name));
    /** @type {TagEditor|null} set by subclasses whenever an edit modal opens */
    this.tagEditor = null;
    /** True once the open item/episode edit form has an unsaved change. */
    this.formDirty = false;
  }

  /** Called once at the end of the page's init(); wires generic chrome. */
  mountChrome() {
    ModalController.wireOverlayDismiss(this);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.attemptCloseModal('itemModal');
    });
  }

  /** Marks the open edit form dirty; wired via oninput/onchange on #itemModalBody. */
  markDirty() {
    this.formDirty = true;
  }

  /** Closes a modal, confirming first if it's the dirty edit form.
   *  Used by the ✕ button, Cancel, overlay click, and Escape. */
  attemptCloseModal(id) {
    if (id === 'itemModal' && this.formDirty) {
      if (!confirm("You have unsaved changes. Close without saving?")) return;
    }
    this.formDirty = false;
    this.closeModal(id);
  }

  closeModal(id) {
    (Object.values(this.modals).find(m => m.id === id) || new ModalController(id)).close();
  }

  flashSaved() {
    this.saveIndicator.flash();
  }

  openNewWatchthroughModal() {
    this.watchthroughNameModal.open();
  }

  exportWatchlistTxt() {
    const entries = this.getFilteredEntries();
    Utils.downloadFile(entries.map(e => e.title).join('\n'), this.watchlistFilename());
  }

  watchlistFilename() {
    return 'watchlist.txt';
  }

  // Subclasses must implement:
  // getFilteredEntries(), createWatchthrough(name), selectWatchthrough(id),
  // deleteActiveWatchthrough(), render()
}
