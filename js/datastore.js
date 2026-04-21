// datastore.js — IndexedDB-backed data store for Construct Check
// Handles version data that can exceed localStorage limits
// Falls back to localStorage if IndexedDB is unavailable

const DataStore = {
  DB_NAME: 'construct_check_db',
  DB_VERSION: 2,
  _db: null,
  _ready: false,

  async open() {
    if (this._db && this._ready) return this._db;
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('user_data')) {
            db.createObjectStore('user_data', { keyPath: 'key' });
          }
        };
        req.onsuccess = (e) => {
          this._db = e.target.result;
          this._ready = true;
          resolve(this._db);
        };
        req.onerror = (e) => {
          console.error('[DataStore] IndexedDB open error:', e.target?.error);
          reject(e.target?.error);
        };
      } catch (err) {
        console.error('[DataStore] IndexedDB not available:', err);
        reject(err);
      }
    });
  },

  // Generic put — stores a keyed record in IndexedDB
  async put(key, value) {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('user_data', 'readwrite');
        const store = tx.objectStore('user_data');
        store.put({ key, value, updatedAt: Date.now() });
        tx.oncomplete = () => {
          console.log(`[DataStore] Saved "${key}" (${JSON.stringify(value).length} bytes)`);
          resolve(true);
        };
        tx.onerror = (e) => {
          console.error(`[DataStore] Save failed for "${key}":`, e.target?.error);
          reject(e.target?.error);
        };
      });
    } catch (err) {
      console.error(`[DataStore] put("${key}") failed:`, err);
      // Fallback: try localStorage
      try {
        localStorage.setItem('ds_' + key, JSON.stringify(value));
        console.log(`[DataStore] Saved to localStorage fallback: "${key}"`);
        return true;
      } catch (lsErr) {
        console.error(`[DataStore] localStorage fallback also failed:`, lsErr);
        return false;
      }
    }
  },

  // Generic get — retrieves a keyed record from IndexedDB
  async get(key) {
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction('user_data', 'readonly');
        const store = tx.objectStore('user_data');
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && req.result.value !== undefined) {
            resolve(req.result.value);
          } else {
            // Try localStorage fallback
            const ls = localStorage.getItem('ds_' + key);
            resolve(ls ? JSON.parse(ls) : null);
          }
        };
        req.onerror = () => {
          const ls = localStorage.getItem('ds_' + key);
          resolve(ls ? JSON.parse(ls) : null);
        };
      });
    } catch (err) {
      // Fallback to localStorage
      try {
        const ls = localStorage.getItem('ds_' + key);
        return ls ? JSON.parse(ls) : null;
      } catch (e) {
        return null;
      }
    }
  },

  // ─── Convenience methods for the app ────────────────────────

  _userKey(email, type) {
    return `${type}_${(email || 'guest').toLowerCase()}`;
  },

  async saveProjects(email, projects) {
    // Projects are small — save to both localStorage (sync render) and IDB (backup)
    try {
      localStorage.setItem(`cc_projects_${email}`, JSON.stringify(projects));
    } catch (e) { console.error('[DataStore] projects localStorage fail:', e); }
    return this.put(this._userKey(email, 'projects'), projects);
  },

  loadProjectsSync(email) {
    // Synchronous read from localStorage for initial render
    try {
      const ls = localStorage.getItem(`cc_projects_${email}`);
      return ls ? JSON.parse(ls) : null;
    } catch (e) { return null; }
  },

  async loadProjects(email) {
    // Async read — tries IDB first, falls back to localStorage
    const idbData = await this.get(this._userKey(email, 'projects'));
    if (idbData) return idbData;
    return this.loadProjectsSync(email);
  },

  async saveVersions(email, versions) {
    // Versions can be large — primary store is IndexedDB
    const saved = await this.put(this._userKey(email, 'versions'), versions);
    // Also try localStorage as a backup (may fail for large data, that's OK)
    try {
      localStorage.setItem(`cc_versions_${email}`, JSON.stringify(versions));
    } catch (e) {
      console.warn('[DataStore] versions localStorage backup failed (expected for large data)');
    }
    return saved;
  },

  async loadVersions(email) {
    const idbData = await this.get(this._userKey(email, 'versions'));
    if (idbData) return idbData;
    // Fallback to localStorage
    try {
      const ls = localStorage.getItem(`cc_versions_${email}`);
      return ls ? JSON.parse(ls) : null;
    } catch (e) { return null; }
  }
};

window.DataStore = DataStore;
