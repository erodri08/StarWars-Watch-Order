// storage.js — thin wrapper around localStorage

/**
 * KVStore reads/writes a single localStorage key as JSON (or plain text) and
 * never throws — corrupt or missing data just falls back to a default.
 */
class KVStore {
  constructor(key) {
    this.key = key;
  }

  getJSON(fallback) {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  setJSON(value) {
    localStorage.setItem(this.key, JSON.stringify(value));
  }

  getText(fallback = '') {
    try {
      return localStorage.getItem(this.key) ?? fallback;
    } catch (e) {
      return fallback;
    }
  }

  setText(value) {
    localStorage.setItem(this.key, value ?? '');
  }
}

/**
 * SaveIndicator flashes the little "SAVED" pill that lives on every page.
 */
class SaveIndicator {
  constructor(elementId = 'saveIndicator') {
    this.elementId = elementId;
  }

  flash() {
    const el = Utils.$(this.elementId);
    if (!el) return;
    el.classList.add('show');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => el.classList.remove('show'), 1400);
  }
}
