// Where custom frames live:
//  - server: shared with everyone, published with the admin key (api/frames.php)
//  - local:  only on this device (IndexedDB), anyone can make them
import { normalizeDef, detectWindow } from './frames.js';
import { loadImage } from './scene.js';

const API = 'api/frames.php';
const KEY_STORAGE = 'mm_admin_key';

// ------------------------------------------------------------------ admin key

export function getAdminKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}
export function setAdminKey(key) {
  try { key ? localStorage.setItem(KEY_STORAGE, key) : localStorage.removeItem(KEY_STORAGE); } catch { /* private mode */ }
}

// ------------------------------------------------------------------ server

export async function fetchServerFrames() {
  const r = await fetch(API, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return Array.isArray(j.frames) ? j.frames : [];
}

async function post(form) {
  const r = await fetch(API, { method: 'POST', body: form });
  let j = {};
  try { j = await r.json(); } catch { /* non-JSON error page */ }
  if (!r.ok || !j.ok) {
    const err = new Error(j.error || `HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return j;
}

export async function checkAdminKey(key) {
  const f = new FormData();
  f.append('action', 'check');
  f.append('key', key);
  await post(f);
}

/** rec = { name, kind, def?, blobs: { badge?, corner?, png? } } */
export async function publishFrame(key, rec) {
  const f = new FormData();
  f.append('action', 'save');
  f.append('key', key);
  f.append('name', rec.name);
  f.append('kind', rec.kind);
  if (rec.kind === 'design') f.append('def', JSON.stringify(rec.def));
  for (const [slot, blob] of Object.entries(rec.blobs || {})) {
    if (blob) f.append(slot, blob, `${slot}.png`);
  }
  return (await post(f)).frame;
}

export async function deleteServerFrame(key, id) {
  const f = new FormData();
  f.append('action', 'delete');
  f.append('key', key);
  f.append('id', id);
  await post(f);
}

// ------------------------------------------------------------------ local (IndexedDB)

let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open('mixnmatch', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('frames', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction('frames', mode);
    const out = fn(t.objectStore('frames'));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}

export async function listLocal() {
  try {
    const all = await tx('readonly', (s) => s.getAll());
    return (all || []).sort((a, b) => b.created - a.created);
  } catch {
    return [];
  }
}
export const saveLocal = (rec) => tx('readwrite', (s) => s.put(rec));
export const deleteLocal = (id) => tx('readwrite', (s) => s.delete(id));

// ------------------------------------------------------------------ runtime frames

/**
 * Turns a stored record into a frame the renderer can draw.
 * Server records carry URLs; local records carry blobs.
 */
export async function hydrate(rec, source) {
  const url = (slot) => {
    if (source === 'server') return rec.files?.[slot] || null;
    const blob = rec.blobs?.[slot];
    return blob ? URL.createObjectURL(blob) : null;
  };
  const base = { id: `${source}:${rec.id}`, rawId: rec.id, name: rec.name || 'Marco', source, rev: 0, seed: rec.id };

  if (rec.kind === 'png') {
    const src = url('png');
    if (!src) return null;
    const image = await loadImage(src);
    const win = detectWindow(image) || { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    return { ...base, kind: 'png', image, w: image.naturalWidth, h: image.naturalHeight, win };
  }

  const def = normalizeDef(rec.def);
  const images = {};
  for (const slot of ['badge', 'corner']) {
    const src = def[slot].type === 'image' ? url(slot) : null;
    if (src) {
      try { images[slot] = await loadImage(src); } catch { /* missing logo: draw without it */ }
    }
  }
  return { ...base, kind: 'design', def, images };
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
