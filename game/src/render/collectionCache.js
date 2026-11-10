/**
 * Persistent archive thumbnail cache. Only the generated 136x164 image is
 * stored; blades and gameplay saves remain in the existing progress store.
 * IndexedDB is optional (Safari private mode may reject it).
 */
const DB = 'blade-forge-thumbnails';
const STORE = 'previews';
// WebP thumbnails are small (normally a few KB). Keep enough for a large
// archive so paging back does not rebuild old GPU images. Prune oldest after
// this limit; visual keys are versioned to invalidate changed appearance.
const MAX_DISK = 512;
let connection = null;
let writes = 0;
const metrics = { hits: 0, misses: 0, writes: 0, errors: 0 };

function open() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (connection) return connection;
  connection = new Promise(resolve => {
    let req;
    try { req = indexedDB.open(DB, 1); } catch (_) { metrics.errors++; resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { metrics.errors++; resolve(null); };
    req.onblocked = () => { metrics.errors++; resolve(null); };
  });
  return connection;
}

export async function loadThumbnail(key) {
  const db = await open();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const item = req.result;
        if (item?.dataUrl && typeof item.dataUrl === 'string') {
          metrics.hits++;
          resolve({ dataUrl: item.dataUrl, degraded: false });
        } else { metrics.misses++; resolve(null); }
      };
      req.onerror = () => { metrics.errors++; resolve(null); };
      tx.onabort = () => resolve(null);
    } catch (_) { metrics.errors++; resolve(null); }
  });
}

async function prune(db) {
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const count = store.count();
    count.onsuccess = () => {
      let extra = count.result - MAX_DISK;
      if (extra <= 0) return;
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        if (!cursor.result || extra <= 0) return;
        cursor.result.delete();
        extra--;
        cursor.result.continue();
      };
    };
  } catch (_) { metrics.errors++; }
}

export async function saveThumbnail(key, result) {
  if (!result?.dataUrl || result.degraded) return;
  const db = await open();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key, dataUrl: result.dataUrl });
    tx.oncomplete = () => {
      metrics.writes++;
      if (++writes % 20 === 0) prune(db);
    };
    tx.onerror = () => { metrics.errors++; };
  } catch (_) { metrics.errors++; }
}

export function thumbnailCacheStats() { return { ...metrics, maxDisk: MAX_DISK }; }
