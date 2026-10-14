// Frame creator: design a frame from a preset (texts, colors, logos) or upload a transparent PNG.
import { ASPECTS, PRESETS, METALS, normalizeDef, detectWindow, frameSize } from './frames.js';
import { placeholderPhoto, drawScene, cachedFrame, fileToPngBlob, loadImage } from './scene.js';
import { publishFrame, newId } from './store.js';

const LOGO_MAX = 1000;   // px, longest side for uploaded logos
const PNG_MAX = 4096;    // px, longest side for uploaded frame PNGs

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function initCreator(app) {
  const root = $('#step-creator');
  const canvas = $('#creator-canvas');
  const ctx = canvas.getContext('2d');

  const st = {
    tab: 'design',
    aspect: 'vertical',
    def: clone(PRESETS[0].def, PRESETS[0].id),
    presetId: PRESETS[0].id,
    logos: { badge: null, corner: null },  // { blob, img }
    png: null,                              // { blob, img, w, h, win }
    rev: 0,
  };

  // ---------------------------------------------------------------- tabs

  $$('.tab', root).forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
  function setTab(tab) {
    st.tab = tab;
    $$('.tab', root).forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    $$('[data-panel]', root).forEach((p) => (p.hidden = p.dataset.panel !== tab));
    $('#creator-aspects').hidden = tab === 'png';
    redraw();
  }

  // ---------------------------------------------------------------- preview aspect

  for (const [key, a] of Object.entries(ASPECTS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'aspect';
    b.dataset.aspect = key;
    b.setAttribute('role', 'radio');
    b.textContent = a.label;
    b.addEventListener('click', () => { st.aspect = key; syncAspect(); redraw(); });
    $('#creator-aspects').appendChild(b);
  }
  function syncAspect() {
    $$('#creator-aspects .aspect').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.aspect === st.aspect)));
  }
  syncAspect();

  // ---------------------------------------------------------------- presets + metals

  const presetBox = $('#c-presets');
  for (const p of PRESETS) {
    const b = chip(p.name, () => {
      st.def = clone(p.def, p.id);
      st.presetId = p.id;
      syncForm();
      changed();
    });
    b.dataset.preset = p.id;
    presetBox.appendChild(b);
  }

  const metalBox = $('#c-metals');
  const metalOptions = [...Object.entries(METALS).map(([k, m]) => [k, m.label]), ['red', 'Color principal']];
  for (const [value, label] of metalOptions) {
    const b = chip(label, () => { st.def.colors.metal = value; syncForm(); changed(); });
    b.dataset.metal = value;
    metalBox.appendChild(b);
  }
  const customMetal = document.createElement('label');
  customMetal.className = 'chip chip--color';
  customMetal.innerHTML = '<input type="color" value="#2b7bff"><span>Otro</span>';
  const customInput = $('input', customMetal);
  customInput.addEventListener('input', () => { st.def.colors.metal = customInput.value; syncForm(); changed(); });
  metalBox.appendChild(customMetal);

  const varyBtn = chip('🎲 Variar trazos', () => { st.def.seed = newId(); changed(); });
  varyBtn.classList.add('chip--action');
  presetBox.appendChild(varyBtn);

  // ---------------------------------------------------------------- bound inputs

  for (const el of $$('[data-bind]', root)) {
    const path = el.dataset.bind;
    if (el.classList.contains('seg')) {
      $$('button', el).forEach((b) => b.addEventListener('click', () => { setPath(st.def, path, b.dataset.value); syncForm(); changed(); }));
    } else if (el.type === 'checkbox') {
      el.addEventListener('change', () => { setPath(st.def, path, el.checked); changed(); });
    } else {
      el.addEventListener('input', () => { setPath(st.def, path, el.value); changed(); });
    }
  }

  function syncForm() {
    for (const el of $$('[data-bind]', root)) {
      const v = getPath(st.def, el.dataset.bind);
      if (el.classList.contains('seg')) $$('button', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
      else if (el.type === 'checkbox') el.checked = !!v;
      else if (document.activeElement !== el) el.value = v ?? '';
    }
    for (const el of $$('[data-when]', root)) {
      const [path, value] = el.dataset.when.split('=');
      el.hidden = String(getPath(st.def, path)) !== value;
    }
    $$('[data-preset]', presetBox).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === st.presetId)));
    const metal = st.def.colors.metal;
    $$('[data-metal]', metalBox).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.metal === metal)));
    const isCustom = metal.startsWith('#');
    customMetal.setAttribute('aria-pressed', String(isCustom));
    if (isCustom) customInput.value = metal;
    for (const slot of ['badge', 'corner']) {
      const img = $(`[data-logo-preview="${slot}"]`, root);
      const logo = st.logos[slot];
      img.hidden = !logo;
      if (logo) img.src = logo.img.src;
    }
  }

  // ---------------------------------------------------------------- logos

  for (const input of $$('[data-logo]', root)) {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        const blob = await fileToPngBlob(file, LOGO_MAX);
        const img = await loadImage(URL.createObjectURL(blob));
        st.logos[input.dataset.logo] = { blob, img };
        st.def[input.dataset.logo].type = 'image';
        syncForm();
        changed();
      } catch (err) {
        console.error(err);
        app.toast('No pude abrir ese logo. Prueba con PNG o JPG.');
      }
    });
  }

  // ---------------------------------------------------------------- PNG frame

  $('#c-png-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const info = $('#c-png-info');
    try {
      if (file.type && file.type !== 'image/png') throw new Error('not png');
      let blob = file;
      let img = await loadImage(URL.createObjectURL(blob));
      if (Math.max(img.naturalWidth, img.naturalHeight) > PNG_MAX) {
        blob = await fileToPngBlob(file, PNG_MAX);
        img = await loadImage(URL.createObjectURL(blob));
      }
      const win = detectWindow(img);
      info.hidden = false;
      if (!win) {
        st.png = null;
        info.className = 'png-info png-info--bad';
        info.textContent = 'Este PNG no tiene partes transparentes, así que la foto no se vería. Exporta el marco con el centro transparente.';
      } else {
        st.png = { blob, img, w: img.naturalWidth, h: img.naturalHeight, win };
        info.className = 'png-info';
        info.textContent = `✓ ${img.naturalWidth}×${img.naturalHeight} px · ventana para la foto detectada`;
        if (!$('#c-name').value) $('#c-name').value = file.name.replace(/\.[^.]+$/, '').slice(0, 40);
      }
      changed();
    } catch (err) {
      console.error(err);
      app.toast('Tiene que ser una imagen PNG.');
    }
  });

  // ---------------------------------------------------------------- preview

  function previewFrame() {
    if (st.tab === 'png') {
      if (!st.png) return null;
      return { id: 'creator-png', rev: st.rev, kind: 'png', image: st.png.img, w: st.png.w, h: st.png.h, win: st.png.win };
    }
    const images = {};
    for (const slot of ['badge', 'corner']) if (st.logos[slot]) images[slot] = st.logos[slot].img;
    return { id: 'creator', rev: st.rev, kind: 'design', def: normalizeDef(st.def), images };
  }

  let raf = 0;
  function redraw() {
    if (root.hidden || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const frame = previewFrame();
      const box = canvas.parentElement.getBoundingClientRect();
      const { w, h } = frame ? frameSize(frame, st.aspect) : ASPECTS[st.aspect];
      const maxW = box.width - 24;
      const maxH = Math.max(220, Math.min(window.innerHeight * (window.innerWidth >= 900 ? 0.72 : 0.42), 760));
      const k = Math.min(maxW / w, maxH / h);
      const cw = Math.max(60, Math.floor(w * k)), ch = Math.max(60, Math.floor(h * k));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      const W = canvas.width, H = canvas.height;
      if (!frame) {
        ctx.fillStyle = '#151515';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#777';
        ctx.font = `600 ${Math.round(W / 22)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('Elige un PNG para ver la vista previa', W / 2, H / 2);
        return;
      }
      const photo = app.getPhoto() || placeholderPhoto();
      drawScene(ctx, W, H, cachedFrame(frame, W, H), { ...photo, frame, z: 1, ox: 0, oy: 0 });
    });
  }
  new ResizeObserver(redraw).observe(canvas.parentElement);

  function changed() {
    st.rev++;
    redraw();
  }

  // ---------------------------------------------------------------- save / publish

  function buildRecord() {
    const name = $('#c-name').value.trim().slice(0, 40);
    if (st.tab === 'png') {
      if (!st.png) { app.toast('Primero elige un PNG con el centro transparente.'); return null; }
      return { id: newId(), name: name || 'Marco PNG', kind: 'png', blobs: { png: st.png.blob }, created: Date.now() };
    }
    const def = normalizeDef(st.def);
    for (const slot of ['badge', 'corner']) {
      if (def[slot].type === 'image' && !st.logos[slot]) {
        app.toast(slot === 'badge' ? 'Elige una imagen para el logo principal.' : 'Elige una imagen para el logo de la esquina.');
        return null;
      }
    }
    const blobs = {};
    for (const slot of ['badge', 'corner']) if (def[slot].type === 'image') blobs[slot] = st.logos[slot].blob;
    return { id: newId(), name: name || 'Mi marco', kind: 'design', def, blobs, created: Date.now() };
  }

  $('#c-use').addEventListener('click', async () => {
    const rec = buildRecord();
    if (!rec) return;
    try {
      await app.saveLocal(rec);
      const frame = await app.onSaved(rec, 'local');
      app.useFrame(frame);
    } catch (err) {
      console.error(err);
      app.toast('No se pudo guardar el marco en este teléfono.');
    }
  });

  $('#c-publish').addEventListener('click', async () => {
    const rec = buildRecord();
    if (!rec) return;
    const btn = $('#c-publish');
    btn.disabled = true;
    btn.textContent = 'Publicando…';
    try {
      const saved = await publishFrame(rec);
      await app.onSaved(saved, 'server');
      app.toast('✅ Publicado. Ya aparece para todos en "Del torneo".');
    } catch (err) {
      app.handleApiError(err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Publicar para todos';
    }
  });

  syncForm();

  return {
    open() { syncForm(); redraw(); },
    redraw: () => { st.rev++; redraw(); },
  };
}

// ------------------------------------------------------------------ helpers

function clone(def, seed) {
  const d = JSON.parse(JSON.stringify(def));
  d.seed = d.seed || seed;
  return d;
}

function chip(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = value;
}
