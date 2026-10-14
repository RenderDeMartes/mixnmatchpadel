import { ASPECTS, FRAMES, layout, renderFrame, loadFonts } from './frames.js';

const MAX_SOURCE = 4096;   // downscale huge photos so mobile canvases don't run out of memory
const MAX_ZOOM = 6;
const JPEG_QUALITY = 0.92;

const $ = (sel) => document.querySelector(sel);
const steps = { upload: $('#step-upload'), frames: $('#step-frames'), edit: $('#step-edit') };
const preview = $('#preview');
const pctx = preview.getContext('2d');
const stage = $('#stage');
const zoomInput = $('#zoom');

const state = {
  photo: null,     // canvas holding the (possibly downscaled) photo
  blur: null,      // tiny copy used as blurred backdrop
  frame: FRAMES[0],
  aspect: 'vertical',
  z: 1,            // zoom relative to "cover the window"
  ox: 0, oy: 0,    // photo center offset from window center, in units of canvas width
};

const frameCache = new Map();
function cachedFrame(frame, W, H) {
  const key = `${frame.id}|${W}x${H}`;
  if (!frameCache.has(key)) {
    if (frameCache.size > 24) frameCache.clear();
    frameCache.set(key, renderFrame(frame, W, H));
  }
  return frameCache.get(key);
}

// ------------------------------------------------------------------ navigation

function show(name) {
  for (const [k, el] of Object.entries(steps)) el.hidden = k !== name;
  if (name === 'frames') renderGrid();
  if (name === 'edit') { renderStrip(); fitPreview(); }
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));

// ------------------------------------------------------------------ photo input

$('#file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    await loadPhoto(file);
  } catch (err) {
    console.error(err);
    toast('No pude abrir esa imagen. Prueba con otra (JPG o PNG).');
    return;
  }
  const fromEditor = !steps.edit.hidden;
  resetTransform();
  if (fromEditor) { renderStrip(); draw(); } else show('frames');
});

async function loadPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('image load failed'));
      i.src = url;
    });
    const k = Math.min(1, MAX_SOURCE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    const cx = c.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, c.width, c.height);
    state.photo = c;

    // Downscale-then-upscale gives a cheap blur that works in every browser.
    const b = document.createElement('canvas');
    const bk = 24 / Math.max(c.width, c.height);
    b.width = Math.max(1, Math.round(c.width * bk));
    b.height = Math.max(1, Math.round(c.height * bk));
    b.getContext('2d').drawImage(c, 0, 0, b.width, b.height);
    state.blur = b;

    const r = c.width / c.height;
    state.aspect = r > 1.15 ? 'horizontal' : r < 0.87 ? 'vertical' : 'square';
    syncAspectButtons();
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ------------------------------------------------------------------ scene

function zoomBounds(W, H, frame = state.frame, photo = state.photo) {
  const { win } = layout(W, H, frame);
  const { width: iw, height: ih } = photo;
  const cover = Math.max(win.w / iw, win.h / ih);
  const contain = Math.min(win.w / iw, win.h / ih);
  return { win, cover, min: contain / cover, max: MAX_ZOOM };
}

function drawScene(ctx, W, H, frameCanvas, s = state) {
  const { win, cover } = zoomBounds(W, H, s.frame, s.photo);
  const photo = s.photo;
  const scale = cover * s.z;
  const dw = photo.width * scale;
  const dh = photo.height * scale;
  const cx = win.cx + s.ox * W;
  const cy = win.cy + s.oy * W;

  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Blurred backdrop so zooming out never leaves empty space.
  const b = s.blur;
  const bs = Math.max(W / b.width, H / b.height) * 1.1;
  ctx.drawImage(b, (W - b.width * bs) / 2, (H - b.height * bs) / 2, b.width * bs, b.height * bs);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(0, 0, W, H);

  ctx.drawImage(photo, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.drawImage(frameCanvas, 0, 0, W, H);
}

function clampOffsets() {
  const { w: W, h: H } = ASPECTS[state.aspect];
  const { win, cover, min, max } = zoomBounds(W, H);
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
  if (steps.edit.hidden || !state.photo) return;
  const { w, h } = ASPECTS[state.aspect];
  const rect = stage.getBoundingClientRect();
  const availW = rect.width - 32;
  const availH = rect.height - 42;
  const k = Math.min(availW / w, availH / h);
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
    drawScene(pctx, W, H, cachedFrame(state.frame, W, H));
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
  const { w, h } = ASPECTS[state.aspect];
  const { win, min, max } = zoomBounds(w, h);
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
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, toCanvas(e));
  const pts = [...pointers.values()];
  if (!gesture) return;

  if (pts.length === 1) {
    const p = pts[0];
    state.ox += (p.x - gesture.x) / cssW;
    state.oy += (p.y - gesture.y) / cssW;
    gesture.x = p.x; gesture.y = p.y;
  } else {
    const [a, b] = pts;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    state.ox += (mid.x - gesture.x) / cssW;
    state.oy += (mid.y - gesture.y) / cssW;
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
  const { w, h } = ASPECTS[state.aspect];
  const { min, max } = zoomBounds(w, h);
  const target = min * Math.pow(max / min, zoomInput.value / 1000);
  zoomAt(cssW / 2, cssH / 2, target / state.z);
  clampOffsets();
  hideHint();
  draw();
});

function syncZoomSlider() {
  if (!state.photo) return;
  const { w, h } = ASPECTS[state.aspect];
  const { min, max } = zoomBounds(w, h);
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

document.querySelectorAll('.aspects').forEach((group) => {
  for (const [key, a] of Object.entries(ASPECTS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'aspect';
    b.dataset.aspect = key;
    b.setAttribute('role', 'radio');
    const [iw, ih] = ASPECT_ICONS[key];
    b.innerHTML = `<i style="width:${iw}px;height:${ih}px"></i>${a.label}`;
    b.addEventListener('click', () => setAspect(key));
    group.appendChild(b);
  }
});

function setAspect(key) {
  if (state.aspect === key) return;
  state.aspect = key;
  syncAspectButtons();
  state.ox = 0; state.oy = 0;
  clampOffsets();
  syncZoomSlider();
  if (!steps.frames.hidden) renderGrid();
  if (!steps.edit.hidden) { renderStrip(); fitPreview(); }
}

function syncAspectButtons() {
  document.querySelectorAll('.aspect').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.aspect === state.aspect)));
}
syncAspectButtons();

// ------------------------------------------------------------------ frame pickers

function thumb(frame, width) {
  const { w, h } = ASPECTS[state.aspect];
  const W = width, H = Math.round(width * h / w);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const fc = renderFrame(frame, W, H);
  if (state.photo) drawScene(ctx, W, H, fc, { ...state, frame, z: 1, ox: 0, oy: 0 });
  else ctx.drawImage(fc, 0, 0);
  return c;
}

function renderGrid() {
  const grid = $('#frame-grid');
  grid.textContent = '';
  for (const frame of FRAMES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'frame-card';
    card.appendChild(thumb(frame, 360));
    card.append(frame.name);
    card.addEventListener('click', () => { selectFrame(frame); show('edit'); });
    grid.appendChild(card);
  }
}

function renderStrip() {
  const strip = $('#frame-strip');
  strip.textContent = '';
  for (const frame of FRAMES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'frame-chip';
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', String(frame.id === state.frame.id));
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
  state.frame = frame;
  clampOffsets();
  syncZoomSlider();
  draw();
}

// ------------------------------------------------------------------ export

$('#export').addEventListener('click', async () => {
  const btn = $('#export');
  btn.disabled = true;
  btn.textContent = 'Generando…';
  try {
    const { w, h } = ASPECTS[state.aspect];
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    drawScene(c.getContext('2d'), w, h, renderFrame(state.frame, w, h));
    const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', JPEG_QUALITY));
    const name = `mixnmatch-${state.frame.id}-${state.aspect}-${Date.now().toString(36)}.jpg`;
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
  toastTimer = setTimeout(() => (t.hidden = true), 2800);
}

loadFonts().then(() => { frameCache.clear(); draw(); });
