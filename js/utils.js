// utils.js — small stateless helpers shared by every page

class Utils {
  /** Generate a reasonably-unique client-side id. */
  static generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  /** Escape a value for safe interpolation into HTML. */
  static escHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Turn free text into a filesystem/URL-friendly, lowercase, dash-separated tag. */
  static slugify(value) {
    return String(value).trim().toLowerCase().replace(/\s+/g, '-');
  }

  /** Render an internal episode/air code like "216" or "T" into a friendly label. */
  static formatAirCode(code) {
    if (!code) return '?';
    const s = String(code);
    if (s === 'T') return 'Film';
    if (s.startsWith('B')) return 'BoBF E' + s.slice(1);
    if (s.length === 3) return `${s[0]}x${s.slice(1)}`;
    if (s.length === 4) return `${s.slice(0, 2)}x${s.slice(2)}`;
    return s;
  }

  /** Converts release_date ("YYYY-MM-DD") or release_year into one sortable
   *  integer; undated entries fall back to 9999 so they sort last. */
  static releaseSortKey(entry) {
    if (entry.release_date) {
      const parts = entry.release_date.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0])) {
        return parts[0] * 10000 + (parts[1] || 1) * 100 + (parts[2] || 1);
      }
    }
    return (entry.release_year || 9999) * 10000;
  }

  /** Trigger a browser download of arbitrary text content. */
  static downloadFile(content, filename, mime = 'text/plain') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Shorthand for document.getElementById. */
  static $(id) {
    return document.getElementById(id);
  }
}
