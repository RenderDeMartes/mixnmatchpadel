/* Small IndexedDB wrapper: `blobs` holds photos and uploaded images, `kv` holds
   the current project and saved templates. Everything stays on the device. */
(function () {
  'use strict';
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('mixnmatch-marcos', 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const n of [...d.objectStoreNames]) d.deleteObjectStore(n);
        d.createObjectStore('blobs');
        d.createObjectStore('kv');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode), s = t.objectStore(store);
      const req = fn(s);
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  const safe = p => p.catch(e => { console.warn('store', e); return undefined; });
  window.Store = {
    get: k => safe(tx('kv', 'readonly', s => s.get(k))),
    set: (k, v) => safe(tx('kv', 'readwrite', s => s.put(v, k))),
    del: k => safe(tx('kv', 'readwrite', s => s.delete(k))),
    getBlob: k => safe(tx('blobs', 'readonly', s => s.get(k))),
    putBlob: (k, v) => safe(tx('blobs', 'readwrite', s => s.put(v, k))),
    delBlob: k => safe(tx('blobs', 'readwrite', s => s.delete(k))),
    blobKeys: () => safe(tx('blobs', 'readonly', s => s.getAllKeys()))
  };
})();
