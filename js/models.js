// models.js — data models and the behavior that belongs to them

/** A named watchthrough: a set of watched ids plus timestamps. */
class Watchthrough {
  constructor({ id, name, watched = {}, created = null, saved = null } = {}) {
    this.id = id || Utils.generateId('wt');
    this.name = name;
    this.watched = watched;
    this.created = created || new Date().toISOString();
    this.saved = saved || this.created;
  }

  isWatched(entryId) {
    return !!this.watched[entryId];
  }

  toggle(entryId) {
    this.watched[entryId] = !this.watched[entryId];
    this.saved = new Date().toISOString();
  }

  /** Count how many of the given ids are marked watched. */
  countWatched(entryIds) {
    return entryIds.filter(id => this.isWatched(id)).length;
  }

  toJSON() {
    return { id: this.id, name: this.name, watched: this.watched, created: this.created, saved: this.saved };
  }
}

/** A list of Watchthroughs plus which one is active. Persistence is
 *  handled by the caller via KVStore, so this stays storage-agnostic. */
class WatchthroughCollection {
  constructor(rawList = [], activeId = null) {
    this.items = rawList.map(w => new Watchthrough(w));
    this.activeId = activeId || null;
  }

  get active() {
    return this.items.find(w => w.id === this.activeId) || null;
  }

  setActive(id) {
    this.activeId = id || null;
  }

  create(name) {
    const wt = new Watchthrough({ name });
    this.items.push(wt);
    this.activeId = wt.id;
    return wt;
  }

  deleteActive() {
    this.items = this.items.filter(w => w.id !== this.activeId);
    this.activeId = null;
  }

  toJSON() {
    return this.items.map(w => w.toJSON());
  }
}

/** Wraps an array of entries (main items or episodes) and centralizes
 *  the filter logic both apps need. */
class EntryCollection {
  constructor(entries = []) {
    this.entries = entries;
  }

  get all() {
    return this.entries;
  }

  byId(id) {
    return this.entries.find(e => e.id === id);
  }

  allTags(tagsOf = e => e.tags || []) {
    const set = new Set();
    this.entries.forEach(e => tagsOf(e).forEach(t => set.add(t)));
    return [...set].sort();
  }

  /** Vitality/quality/tag matcher shared by both entry types. */
  static matchesCommonFilters(entry, filters, tagsOf) {
    if (filters.vital?.length) {
      const ok =
        (filters.vital.includes('vital') && entry.vitality === 'vital') ||
        (filters.vital.includes('non-essential') && entry.vitality === 'skippable');
      if (!ok) return false;
    }
    if (filters.quality?.length && !filters.quality.includes(entry.quality)) return false;
    if (filters.tags?.length) {
      const entryTags = tagsOf(entry);
      if (!filters.tags.every(t => entryTags.includes(t))) return false;
    }
    return true;
  }
}
