import { ASPECTS, PRESETS, frameSize, renderFrame, loadFonts } from './frames.js';
import { makePhoto, zoomBounds, drawScene, cachedFrame, clearFrameCache, loadImage } from './scene.js';
import {
  fetchServerFrames, listLocal, saveLocal, deleteLocal, deleteServerFrame,
  hydrate, getAdminKey, setAdminKey, checkAdminKey,
} from './store.js';
import { initCreator } from './creator.js';

const JPEG_QUALITY = 0.92;

const $ = (sel) => document.querySelector(sel);
const steps = {
  home: $('#step-home'), frames: $('#step-frames'), edit: $('#step-edit'), creator: $('#step-creator'),
};
const preview = $('#preview');
const pctx = preview.getContext('2d');
const stage = $('#stage');
const zoomInput = $('#zoom');

const state = {
  photo: null,       // canvas holding the (possibly downscaled) photo
  blur: null,        // tiny copy used as blurred backdrop
  frame: PRESETS[0],
  aspect: 'vertical',
  z: 1,              // zoom relative to "cover the window"
  ox: 0, oy: 0,      // photo center offset from window center, in units of canvas width
  pendingFrame: null, // frame chosen in the creator before a photo exists
};

const lists = { server: [], local: [] };
let current = 'home';
let previous = 'home';

const dims = () => frameSize(state.frame, state.aspect);

// ------------------------------------------------------------------ navigation

function show(name) {
  if (name === 'back') name = previous === 'creator' ? 'home' : previous;
  if (name !== current) { previous = current; current = name; }
  for (const [k, el] of Object.entries(steps)) el.hidden = k !== name;
  if (name === 'frames') renderSections();
  if (name === 'edit') { renderStrip(); syncAspectUi(); fitPreview(); }
  if (name === 'creator') creator.open();
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));

// ------------------------------------------------------------------ photo input

$('#file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    Object.assign(state, makePhoto(await loadImage(url)));
  } catch (err) {
    console.error(err);
    toast('No pude abrir esa imagen. Prueba con otra (JPG o PNG).');
    return;
  } finally {
    URL.revokeObjectURL(url);
  }
  const r = state.photo.width / state.photo.height;
  state.aspect = r > 1.15 ? 'horizontal' : r < 0.87 ? 'vertical' : 'square';
  syncAspectButtons();
  resetTransform();

  if (state.pendingFrame) {
    const f = state.pendingFrame;
    state.pendingFrame = null;
    $('#pending-note').hidden = true;
    selectFrame(f);
    show('edit');
  } else if (current === 'edit') {
    renderStrip(); fitPreview();
  } else {
    show('frames');
  }
});

// ------------------------------------------------------------------ transform

function clampOffsets() {
  if (!state.photo) return;
  const { w: W, h: H } = dims();
  const { win, cover, min, max } = zoomBounds(W, H, state.frame, state.photo);
  state.z = Math.min(max, Math.max(min, state.z));
  const dw = state.photo.width * cover * state.z;
  const dh = state.photo.height * cover * state.z;
  // Keep the photo covering the window when it's big enough; otherwise keep it inside.
  const limX = Math.abs(dw - win.w) / 2;
  const limY = Math.abs(dh - win.h) / 2;
  state.ox = Math.max(-limX, Math.min(limX, state.ox * W)) / W;
  state.oy = Math.max(-limY, Math.min(limY, state.oy * W)) / W;
}

function resetTransform() {
  state.z = 1;
  state.ox = 0;
  state.oy = 0;
  syncZoomSlider();
}

// ------------------------------------------------------------------ preview

let cssW = 0, cssH = 0;

function fitPreview() {
  if (current !== 'edit' || !state.photo) return;
  const { w, h } = dims();
  const rect = stage.getBoundingClientRect();
  const k = Math.min((rect.width - 32) / w, (rect.height - 42) / h);
  cssW = Math.max(50, Math.floor(w * k));
  cssH = Math.max(50, Math.floor(h * k));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  preview.style.width = cssW + 'px';
  preview.style.height = cssH + 'px';
  preview.width = Math.round(cssW * dpr);
  preview.height = Math.round(cssH * dpr);
  draw();
}

let raf = 0;
function draw() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (!state.photo || !preview.width) return;
    const W = preview.width, H = preview.height;
    drawScene(pctx, W, H, cachedFrame(state.frame, W, H), state);
  });
}

new ResizeObserver(fitPreview).observe(stage);

// ------------------------------------------------------------------ gestures

const pointers = new Map();
let gesture = null;

function toCanvas(e) {
  const r = preview.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function zoomAt(px, py, factor) {
  // px/py in CSS px of the preview. Keep the point under the finger fixed.
  const { w, h } = dims();
  const { win, min, max } = zoomBounds(w, h, state.frame, state.photo);
  const newZ = Math.min(max, Math.max(min, state.z * factor));
  const f = newZ / state.z;
  const k = w / cssW;
  const P = { x: px * k, y: py * k };
  const C = { x: win.cx + state.ox * w, y: win.cy + state.oy * w };
  state.z = newZ;
  state.ox = (P.x + (C.x - P.x) * f - win.cx) / w;
  state.oy = (P.y + (C.y - P.y) * f - win.cy) / w;
}

preview.addEventListener('pointerdown', (e) => {
  preview.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, toCanvas(e));
  preview.classList.add('dragging');
  hideHint();
  startGesture();
});

preview.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId) || !gesture) return;
  pointers.set(e.pointerId, toCanvas(e));
  const pts = [...pointers.values()];
  const k = 1 / cssW; // CSS px -> units of canvas width
  if (pts.length === 1) {
    const p = pts[0];
    state.ox += (p.x - gesture.x) * k;
    state.oy += (p.y - gesture.y) * k;
    gesture.x = p.x; gesture.y = p.y;
  } else {
    const [a, b] = pts;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    state.ox += (mid.x - gesture.x) * k;
    state.oy += (mid.y - gesture.y) * k;
    zoomAt(mid.x, mid.y, dist / gesture.dist);
    gesture = { x: mid.x, y: mid.y, dist };
  }
  clampOffsets();
  syncZoomSlider();
  draw();
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (!pointers.size) { preview.classList.remove('dragging'); gesture = null; }
  else startGesture();
}
preview.addEventListener('pointerup', endPointer);
preview.addEventListener('pointercancel', endPointer);

function startGesture() {
  const pts = [...pointers.values()];
  if (pts.length === 1) gesture = { x: pts[0].x, y: pts[0].y };
  else if (pts.length >= 2) {
    const [a, b] = pts;
    gesture = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  }
}

preview.addEventListener('wheel', (e) => {
  e.preventDefault();
  hideHint();
  const p = toCanvas(e);
  zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
  clampOffsets();
  syncZoomSlider();
  draw();
}, { passive: false });

preview.addEventListener('dblclick', () => { resetTransform(); draw(); });

zoomInput.addEventListener('input', () => {
  const { w, h } = dims();
  const { min, max } = zoomBounds(w, h, state.frame, state.photo);
  const target = min * Math.pow(max / min, zoomInput.value / 1000);
  zoomAt(cssW / 2, cssH / 2, target / state.z);
  clampOffsets();
  hideHint();
  draw();
});

function syncZoomSlider() {
  if (!state.photo) return;
  const { w, h } = dims();
  const { min, max } = zoomBounds(w, h, state.frame, state.photo);
  zoomInput.value = Math.round((Math.log(state.z / min) / Math.log(max / min)) * 1000);
}

$('#reset').addEventListener('click', () => { resetTransform(); draw(); });

let hintHidden = false;
function hideHint() {
  if (hintHidden) return;
  hintHidden = true;
  $('.stage__hint').classList.add('gone');
}

// ------------------------------------------------------------------ aspect buttons

const ASPECT_ICONS = { vertical: [12, 15], square: [14, 14], horizontal: [17, 13] };

function buildAspectButtons(group, onPick, isChecked) {
  for (const [key, a] of Object.entries(ASPECTS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'aspect';
    b.dataset.aspect = key;
    b.setAttribute('role', 'radio');
    const [iw, ih] = ASPECT_ICONS[key];
    b.innerHTML = `<i style="width:${iw}px;height:${ih}px"></i>`;
    b.append(a.label);
    b.addEventListener('click', () => onPick(key));
    group.appendChild(b);
  }
  const sync = () => group.querySelectorAll('.aspect').forEach((b) => b.setAttribute('aria-checked', String(isChecked(b.dataset.aspect))));
  sync();
  return sync;
}

const aspectSyncers = [...document.querySelectorAll('#step-frames .aspects, #step-edit .aspects')]
  .map((g) => buildAspectButtons(g, setAspect, (k) => k === state.aspect));
const syncAspectButtons = () => aspectSyncers.forEach((f) => f());

function setAspect(key) {
  if (state.aspect === key) return;
  state.aspect = key;
  syncAspectButtons();
  state.ox = 0; state.oy = 0;
  clampOffsets();
  syncZoomSlider();
  if (current === 'frames') renderSections();
  if (current === 'edit') { renderStrip(); fitPreview(); }
}

function syncAspectUi() {
  const locked = state.frame.kind === 'png';
  $('#step-edit .aspects').hidden = locked;
  $('.aspect-locked').hidden = !locked;
}

// ------------------------------------------------------------------ frame lists

function allFrames() {
  return [...lists.server, ...lists.local, ...PRESETS];
}

async function loadFrameLists() {
  const [server, local] = await Promise.all([
    fetchServerFrames().catch((err) => { console.warn('server frames unavailable', err); return []; }),
    listLocal(),
  ]);
  lists.server = (await Promise.all(server.map((r) => hydrate(r, 'server').catch(() => null)))).filter(Boolean);
  lists.local = (await Promise.all(local.map((r) => hydrate(r, 'local').catch(() => null)))).filter(Boolean);
  if (current === 'frames') renderSections();
  if (current === 'edit') renderStrip();
}

function thumb(frame, width) {
  const { w, h } = frameSize(frame, state.aspect);
  const W = width, H = Math.round(width * h / w);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const fc = renderFrame(frame, W, H);
  if (state.photo) drawScene(ctx, W, H, fc, { ...state, frame, z: 1, ox: 0, oy: 0 });
  else ctx.drawImage(fc, 0, 0);
  return c;
}

function renderSections() {
  const root = $('#frame-sections');
  root.textContent = '';
  const groups = [
    ['Del torneo', lists.server],
    ['Mis marcos', lists.local],
    ['Clásicos', PRESETS],
  ];

  const createCard = document.createElement('button');
  createCard.type = 'button';
  createCard.className = 'frame-card frame-card--create';
  createCard.innerHTML = '<span class="plus" aria-hidden="true">＋</span>';
  createCard.append('Crear marco');
  createCard.addEventListener('click', () => show('creator'));

  let first = true;
  for (const [title, frames] of groups) {
    if (!frames.length) continue;
    const h = document.createElement('h2');
    h.className = 'section-title';
    h.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'frame-grid';
    if (first) { grid.appendChild(createCard); first = false; }
    for (const frame of frames) grid.appendChild(frameCard(frame));
    root.append(h, grid);
  }
}

function frameCard(frame) {
  const wrap = document.createElement('div');
  wrap.className = 'frame-card-wrap';
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'frame-card';
  card.appendChild(thumb(frame, 360));
  card.append(frame.name);
  card.addEventListener('click', () => { selectFrame(frame); show('edit'); });
  wrap.appendChild(card);

  const canDelete = frame.source === 'local' || (frame.source === 'server' && getAdminKey());
  if (canDelete) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'frame-del';
    del.setAttribute('aria-label', `Borrar ${frame.name}`);
    del.textContent = '×';
    del.addEventListener('click', () => removeFrame(frame));
    wrap.appendChild(del);
  }
  return wrap;
}

async function removeFrame(frame) {
  const where = frame.source === 'server' ? 'para todos' : 'de este teléfono';
  if (!window.confirm(`¿Borrar "${frame.name}" ${where}?`)) return;
  try {
    if (frame.source === 'server') {
      const key = await askAdminKey();
      if (!key) return;
      await deleteServerFrame(key, frame.rawId);
      lists.server = lists.server.filter((f) => f !== frame);
    } else {
      await deleteLocal(frame.rawId);
      lists.local = lists.local.filter((f) => f !== frame);
    }
    if (state.frame === frame) state.frame = PRESETS[0];
    renderSections();
    toast('Marco borrado');
  } catch (err) {
    handleApiError(err);
  }
}

function renderStrip() {
  const strip = $('#frame-strip');
  strip.textContent = '';
  for (const frame of allFrames()) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'frame-chip';
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', String(frame === state.frame));
    chip.appendChild(thumb(frame, 180));
    chip.append(frame.name);
    chip.addEventListener('click', () => {
      selectFrame(frame);
      strip.querySelectorAll('.frame-chip').forEach((c) => c.setAttribute('aria-checked', String(c === chip)));
    });
    strip.appendChild(chip);
  }
}

function selectFrame(frame) {
  const sizeChanged = frame.kind === 'png' || state.frame.kind === 'png';
  state.frame = frame;
  if (sizeChanged) { state.ox = 0; state.oy = 0; }
  clampOffsets();
  syncZoomSlider();
  if (current === 'edit') { syncAspectUi(); fitPreview(); }
  draw();
}

// ------------------------------------------------------------------ admin key

const dialog = $('#admin-dialog');

/** Returns a verified admin key (stored or freshly typed), or null if cancelled. */
function askAdminKey({ force = false } = {}) {
  const stored = getAdminKey();
  if (stored && !force) return Promise.resolve(stored);
  return new Promise((resolve) => {
    const form = $('#admin-form');
    const input = $('#admin-key');
    const error = $('#admin-error');
    input.value = '';
    error.hidden = true;
    const done = (key) => {
      form.removeEventListener('submit', onSubmit);
      $('#admin-cancel').removeEventListener('click', onCancel);
      dialog.close();
      resolve(key);
    };
    const onCancel = () => done(null);
    const onSubmit = async (e) => {
      e.preventDefault();
      const key = input.value.trim();
      try {
        await checkAdminKey(key);
        setAdminKey($('#admin-remember').checked ? key : '');
        done(key);
      } catch (err) {
        error.textContent = err.message || 'No se pudo verificar la clave.';
        error.hidden = false;
      }
    };
    form.addEventListener('submit', onSubmit);
    $('#admin-cancel').addEventListener('click', onCancel);
    dialog.showModal();
    input.focus();
  });
}

function handleApiError(err) {
  console.error(err);
  if (err.status === 403) setAdminKey('');
  toast(err.message || 'Algo falló. Intenta de nuevo.');
}

// ------------------------------------------------------------------ creator

const creator = initCreator({
  getPhoto: () => (state.photo ? { photo: state.photo, blur: state.blur } : null),
  askAdminKey,
  handleApiError,
  toast,
  async onSaved(rec, source) {
    const frame = await hydrate(rec, source);
    if (source === 'server') lists.server.unshift(frame);
    else lists.local.unshift(frame);
    return frame;
  },
  saveLocal,
  useFrame(frame) {
    if (state.photo) {
      selectFrame(frame);
      show('edit');
    } else {
      state.pendingFrame = frame;
      const note = $('#pending-note');
      note.textContent = `Marco "${frame.name}" listo ✓ Ahora sube tu foto.`;
      note.hidden = false;
      show('home');
    }
  },
});

// ------------------------------------------------------------------ export

$('#export').addEventListener('click', async () => {
  const btn = $('#export');
  btn.disabled = true;
  btn.textContent = 'Generando…';
  try {
    const { w, h } = dims();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    drawScene(c.getContext('2d'), w, h, renderFrame(state.frame, w, h), state);
    const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', JPEG_QUALITY));
    const slug = state.frame.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'marco';
    const name = `mixnmatch-${slug}-${Date.now().toString(36)}.jpg`;
    const file = new File([blob], name, { type: 'image/jpeg' });

    const isTouch = matchMedia('(pointer: coarse)').matches;
    if (isTouch && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Mix & Match Pádel' });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    toast('¡Listo! Foto descargada 🎾');
  } catch (err) {
    console.error(err);
    toast('Algo falló al exportar. Intenta de nuevo.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Descargar foto';
  }
});

// ------------------------------------------------------------------ misc

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

loadFonts().then(() => { clearFrameCache(); draw(); creator.redraw(); });
loadFrameLists();
