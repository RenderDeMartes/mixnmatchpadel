/* App shell: document state, undo/redo, panels, templates, export. */
(function () {
  'use strict';
  const E = window.Elements, P = window.Presets, R = window.Renderer, FK = window.FrameKit, Store = window.Store;
  const $ = s => document.querySelector(s);
  const icon = n => `<svg><use href="#i-${n}"/></svg>`;
  const esc = E.esc;
  const isDesktop = () => matchMedia('(min-width: 960px)').matches;
  const API = 'api/frames.php';

  /* ---------- State ---------- */
  let doc = null;            // { W, H, ratio, preset, layers }
  let selId = null;
  let tab = null;            // open panel: frames | photo | add | layers | style | element
  let photoMode = 'pan';     // pan | window
  let undoStack = [], redoStack = [], lastSnap = null;
  let viewScale = 1;
  let liveId = null;         // layer being edited by a gesture or slider right now

  const view = $('#view'), overlay = $('#overlay'), vctx = view.getContext('2d');

  /* ---------- Assets (photos and uploaded images, stored on the device) ---------- */
  const assets = {
    map: new Map(),
    url(id) { const a = this.map.get(id); return a ? a.url : null; },
    blob(id) { const a = this.map.get(id); return a ? a.blob : null; },
    async add(blob) {
      const id = 'a' + E.uid();
      await Store.putBlob(id, blob);
      this.map.set(id, { blob, url: URL.createObjectURL(blob) });
      return id;
    },
    async load(id) {
      if (!id || this.map.has(id)) return;
      const b = await Store.getBlob(id);
      if (b) this.map.set(id, { blob: b, url: URL.createObjectURL(b) });
    }
  };

  /* ---------- Document ---------- */
  const layerById = id => doc && doc.layers.find(l => l.id === id);
  const sel = () => (selId ? layerById(selId) : null);
  const photoLayer = () => doc.layers.find(l => l.type === 'photo');

  async function loadDoc(raw) {
    if (!raw || !Array.isArray(raw.layers)) throw new Error('bad doc');
    const ratio = P.RATIOS[raw.ratio] ? raw.ratio : 'custom';
    const H = ratio === 'custom' ? Math.max(400, Math.min(3000, +raw.H || 1350)) : P.RATIOS[ratio].H;
    const layers = raw.layers.map(E.sanitizeLayer).filter(Boolean);
    await Promise.all(layers.map(l => assets.load(l.props.asset)));
    for (const l of layers) if (l.props.asset && !assets.url(l.props.asset)) l.props.asset = null;
    await R.prepare(layers, assets);
    return { W: P.W, H, ratio, preset: typeof raw.preset === 'string' ? raw.preset.slice(0, 40) : '', layers };
  }

  const snapshot = () => JSON.stringify(doc);
  function commit() {
    const s = snapshot();
    if (s === lastSnap) return;
    if (lastSnap) undoStack.push(lastSnap);
    if (undoStack.length > 80) undoStack.shift();
    redoStack = [];
    lastSnap = s;
    updateUndo();
    save();
  }
  async function restore(s) {
    doc = await loadDoc(JSON.parse(s));
    lastSnap = s;
    if (!sel()) selId = null;
    layout();
    refreshUI();
    save();
  }
  function undo() { if (!undoStack.length) return; redoStack.push(lastSnap); restore(undoStack.pop()).then(updateUndo); }
  function redo() { if (!redoStack.length) return; undoStack.push(lastSnap); restore(redoStack.pop()).then(updateUndo); }
  function updateUndo() { $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length; }

  let saveT = 0;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => Store.set('current', JSON.parse(snapshot())), 400); }

  /* ---------- Drawing ---------- */
  let raf = 0, loadingT = 0, firstPaint;
  const painted = new Promise(r => { firstPaint = r; setTimeout(r, 8000); });
  function requestDraw() { if (!raf) raf = requestAnimationFrame(drawNow); }
  function drawNow() {
    raf = 0;
    if (!doc) return;
    const done = R.draw(vctx, doc, viewScale, assets, requestDraw, liveId);
    editor.draw();
    clearTimeout(loadingT);
    if (done) { $('#loading').classList.remove('on'); firstPaint(); }
    else loadingT = setTimeout(() => $('#loading').classList.add('on'), 250);
  }

  function layout() {
    if (!doc) return;
    const st = $('#stage'), cs = getComputedStyle(st);
    const aw = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ah = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const k = Math.max(.05, Math.min(aw / doc.W, ah / doc.H));
    const w = Math.floor(doc.W * k), h = Math.floor(doc.H * k);
    const wrap = $('#canvasWrap');
    wrap.style.width = w + 'px'; wrap.style.height = h + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    for (const c of [view, overlay]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    viewScale = view.width / doc.W;
    editor.setScale(w / doc.W);
    cancelAnimationFrame(raf); raf = 0;
    drawNow(); // resizing cleared the canvas; repaint right away to avoid a blank frame
  }

  /* ---------- Editor ---------- */
  const editor = window.Editor.create({
    overlay, assets,
    getDoc: () => doc,
    getSel: () => selId,
    getPhotoMode: () => photoMode,
    select: id => setSel(id, true),
    onLive: id => { liveId = id; requestDraw(); },
    onCommit: () => { commit(); if (tab === 'element' || tab === 'photo') renderSheet(); },
    onTapEmptyPhoto: () => $('#photoInput').click()
  });

  function setSel(id, fromCanvas) {
    if (id === selId) return;
    selId = id;
    const l = sel();
    if (l && l.type !== 'photo') photoMode = 'pan';
    if (l && l.type === 'photo' && (tab === 'element' || (fromCanvas && tab && tab !== 'layers'))) openTab('photo');
    else if (l && l.type !== 'photo' && (isDesktop() || (fromCanvas && tab && tab !== 'layers'))) openTab('element');
    else if (!l && (tab === 'element')) openTab(isDesktop() ? 'frames' : null);
    else renderSheet();
    renderSelbar();
    requestDraw();
  }

  /* ---------- Toast & prompt ---------- */
  let toastT = 0;
  function toast(msg, action, fn) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action)}</button>` : '');
    t.classList.toggle('has-action', !!action);
    if (action) t.querySelector('button').onclick = () => { t.classList.remove('on'); fn(); };
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), action ? 4500 : 2600);
  }
  function ask(title, text, value = '') {
    const d = $('#promptDialog');
    $('#promptTitle').textContent = title;
    $('#promptText').textContent = text;
    const inp = $('#promptInput');
    inp.value = value;
    d.showModal();
    setTimeout(() => inp.select(), 50);
    return new Promise(res => { d.onclose = () => res(d.returnValue === 'ok' ? inp.value.trim() : null); });
  }

  /* ---------- Names ---------- */
  function layerName(l) {
    if (l.label) return l.label;
    const p = l.props;
    if (l.type === 'logo') return E.TYPES.logo.schema.kind.opts.find(o => o[0] === p.kind)[1];
    if (l.type === 'placeBadge') return `${p.num}${p.suf.toLowerCase()} ${p.word.toLowerCase()}`;
    if (l.type === 'text' || l.type === 'tag' || l.type === 'ribbon') return p.text || E.TYPES[l.type].name;
    if (l.type === 'title') return p.title || 'Título';
    if (l.type === 'ball') return { metal: 'Pelota metal', red: 'Pelota roja', dark: 'Pelota negra' }[p.style];
    return E.TYPES[l.type].name;
  }

  /* ---------- Tabs & sheet ---------- */
  const TITLES = { frames: 'Marcos', photo: 'Foto', add: 'Agregar', layers: 'Capas', style: 'Diseño', element: 'Elemento' };
  function openTab(t) {
    tab = t;
    if (t === 'photo') { const p = photoLayer(); if (p && selId !== p.id) { selId = p.id; renderSelbar(); requestDraw(); } }
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('#sheet').hidden = !t;
    renderSheet();
    renderSelbar();
    requestAnimationFrame(layout);
  }
  document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.tab;
    if (tab === t && !isDesktop()) openTab(null); else openTab(t);
  }));
  $('#sheetClose').onclick = () => openTab(null);

  function renderSheet() {
    if (!tab) return;
    const body = $('#sheetBody');
    const l = sel();
    $('#sheetTitle').textContent = tab === 'element' && l ? layerName(l) : TITLES[tab];
    const keepScroll = body.dataset.tab === tab ? body.scrollTop : 0;
    body.dataset.tab = tab;
    body.innerHTML = '';
    ({ frames: panelFrames, photo: panelPhoto, add: panelAdd, layers: panelLayers, style: panelStyle, element: panelElement })[tab](body);
    body.scrollTop = keepScroll;
  }
  function refreshUI() { renderSelbar(); renderSheet(); }

  /* ---------- Small UI builders ---------- */
  function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function field(label, node) { const f = h(`<div class="field"><span class="label">${esc(label)}</span></div>`); f.appendChild(node); return f; }
  function chips(opts, value, onPick) {
    const c = h('<div class="chips"></div>');
    for (const [v, label, extra] of opts) {
      const b = h(`<button type="button" class="chip${v === value ? ' on' : ''}">${extra || ''}${esc(label)}</button>`);
      b.onclick = () => onPick(v);
      c.appendChild(b);
    }
    return c;
  }
  function metalDot(t) { const s = FK.THEMES[t].stops; return `<span class="metal" style="background:linear-gradient(160deg,${s[0]},${s[1]} 35%,${s[3]} 60%,${s[4]})"></span>`; }
  function themeChips(value, onPick) { return chips(E.THEMES.map(t => [t, E.THEME_LABELS[t], metalDot(t)]), value, onPick); }
  function swatches(value, nullable, onPick, nullLabel = 'Original') {
    const c = h('<div class="swatches"></div>');
    if (nullable) { const b = h(`<button type="button" class="swatch none${value == null ? ' on' : ''}" title="${esc(nullLabel)}" aria-label="${esc(nullLabel)}"></button>`); b.onclick = () => onPick(null); c.appendChild(b); }
    for (const col of E.SWATCHES) {
      const b = h(`<button type="button" class="swatch${value === col ? ' on' : ''}" style="background:${col}" aria-label="${col}"></button>`);
      b.onclick = () => onPick(col);
      c.appendChild(b);
    }
    const custom = h(`<label class="swatch-custom" title="Otro color">${icon('plus')}<input type="color" value="${value && /^#/.test(value) ? value : '#e4161e'}"></label>`);
    if (value && !E.SWATCHES.includes(value)) { custom.style.background = value; custom.style.borderStyle = 'solid'; custom.style.borderColor = '#fff'; }
    const inp = custom.querySelector('input');
    inp.oninput = () => onPick(inp.value, true);
    inp.onchange = () => onPick(inp.value);
    c.appendChild(custom);
    return c;
  }
  function range(min, max, step, value, fmt, onInput, onDone) {
    const r = h(`<div class="range"><input type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output>${fmt(value)}</output></div>`);
    const i = r.querySelector('input'), o = r.querySelector('output');
    i.oninput = () => { o.textContent = fmt(+i.value); onInput(+i.value); };
    i.onchange = () => { liveId = null; onDone(); requestDraw(); };
    return r;
  }

  /* Changes props of a layer and re-measures it. */
  async function setProps(l, patch, { live = false } = {}) {
    Object.assign(l.props, patch);
    l.props = E.sanitizeProps(l.type, l.props);
    liveId = live ? l.id : null;
    await R.prepare([l], assets);
    requestDraw();
    if (!live) { commit(); renderSheet(); renderSelbar(); }
  }
  let typingT = 0;
  function typed(l, key, value) {
    l.props[key] = value;
    l.props = E.sanitizeProps(l.type, l.props);
    requestDraw();
    clearTimeout(typingT);
    typingT = setTimeout(() => { commit(); renderSelbar(); if (tab === 'element') $('#sheetTitle').textContent = layerName(l); }, 500);
  }

  /* ---------- Selection bar ---------- */
  function renderSelbar() {
    const bar = $('#selbar'), l = sel();
    bar.hidden = !l;
    if (!l) return;
    bar.innerHTML = '';
    const add = (ic, label, fn, cls = '') => { const b = h(`<button type="button" class="${cls}">${icon(ic)}<span>${esc(label)}</span></button>`); b.onclick = fn; bar.appendChild(b); return b; };
    bar.appendChild(h(`<div class="sel-name">${esc(layerName(l))}</div>`));
    if (l.type === 'photo') {
      add('photo', l.props.asset ? 'Cambiar' : 'Subir', () => $('#photoInput').click());
      add('move', 'Mover foto', () => { photoMode = 'pan'; renderSelbar(); renderSheet(); requestDraw(); }, photoMode === 'pan' ? 'on' : '');
      add('frames', 'Ventana', () => { photoMode = 'window'; renderSelbar(); renderSheet(); requestDraw(); }, photoMode === 'window' ? 'on' : '');
      if (tab !== 'photo') add('edit', 'Editar', () => openTab('photo'));
      return;
    }
    if (tab !== 'element') add('edit', 'Editar', () => openTab('element'));
    if (l.locked) { add('unlock', 'Desbloquear', () => toggleLock(l)); return; }
    add('copy', 'Duplicar', () => duplicate(l));
    if (!E.TYPES[l.type].noFlip) add('flip', 'Voltear', () => { l.flip = !l.flip; commit(); requestDraw(); });
    add('up', 'Adelante', () => moveZ(l, 1));
    add('down', 'Atrás', () => moveZ(l, -1));
    add('lock', 'Bloquear', () => toggleLock(l));
    add('trash', 'Borrar', () => removeLayer(l), 'danger');
  }

  /* ---------- Layer actions ---------- */
  async function duplicate(l) {
    const c = E.sanitizeLayer(JSON.parse(JSON.stringify(l)));
    c.id = E.uid(); c.x += 30; c.y += 30; c.label = l.label;
    doc.layers.splice(doc.layers.indexOf(l) + 1, 0, c);
    await R.prepare([c], assets);
    selId = c.id;
    commit(); refreshUI(); requestDraw();
  }
  function moveZ(l, d) {
    const i = doc.layers.indexOf(l), j = Math.max(0, Math.min(doc.layers.length - 1, i + d));
    if (i === j) return;
    doc.layers.splice(i, 1); doc.layers.splice(j, 0, l);
    commit(); renderSheet(); requestDraw();
  }
  function toggleLock(l) { l.locked = !l.locked; commit(); refreshUI(); requestDraw(); }
  function removeLayer(l) {
    doc.layers.splice(doc.layers.indexOf(l), 1);
    selId = null;
    commit();
    if (tab === 'element') openTab(isDesktop() ? 'layers' : null); else refreshUI();
    requestDraw();
    toast('Elemento borrado', 'Deshacer', undo);
  }

  async function addLayer(l, { select = true } = {}) {
    await R.prepare([l], assets);
    doc.layers.push(l);
    if (select) selId = l.id;
    commit();
    if (!isDesktop()) openTab(null); else openTab('element');
    renderSelbar();
    requestDraw();
  }
  function addFromLibrary(item) {
    const pl = photoLayer();
    const cy = pl ? pl.y + pl.props.h / 2 : doc.H / 2;
    const l = E.make(item.type, item.props, doc.W / 2, cy, { center: true, s: item.s || 1, r: item.r || 0 });
    if ('theme' in l.props && item.props.theme === undefined) {
      const t = currentMetal();
      if (t && E.TYPES[item.type].schema.theme && !E.TYPES[item.type].schema.theme.nullable) l.props.theme = t;
    }
    addLayer(l);
  }
  function currentMetal() {
    const p = photoLayer();
    return p && p.props.frame === 'metal' ? p.props.theme : null;
  }

  /* ---------- Presets & templates ---------- */
  function carryPhoto(layers) {
    const old = doc && photoLayer(), nw = layers.find(l => l.type === 'photo');
    if (old && nw && old.props.asset) Object.assign(nw.props, { asset: old.props.asset, zoom: old.props.zoom, px: old.props.px, py: old.props.py });
  }
  async function applyPreset(id) {
    const pr = P.PRESETS.find(p => p.id === id);
    const ratio = doc && P.RATIOS[doc.ratio] ? doc.ratio : '4:5';
    const built = P.build(Object.assign({}, pr.o, { ratio }));
    carryPhoto(built.layers);
    await R.prepare(built.layers, assets);
    const had = !!doc;
    doc = { W: built.W, H: built.H, ratio, preset: id, layers: built.layers };
    selId = null;
    commit(); layout(); refreshUI();
    if (had) toast(`Marco: ${pr.label}`, 'Deshacer', undo);
  }
  async function applyTemplateDoc(raw, presetId) {
    const d = await loadDoc(raw);
    carryPhoto(d.layers);
    await R.prepare(d.layers, assets);
    d.preset = presetId;
    doc = d; selId = null;
    commit(); layout(); refreshUI();
    toast('Plantilla aplicada', 'Deshacer', undo);
  }
  /* Document without the photo, for templates. */
  function templateDoc() {
    const d = JSON.parse(snapshot());
    for (const l of d.layers) if (l.type === 'photo') Object.assign(l.props, { asset: null, zoom: 1, px: 0, py: 0 });
    return d;
  }

  const thumbs = new Map();
  async function docThumb(key, makeDoc, holder) {
    if (thumbs.has(key)) { holder.appendChild(thumbs.get(key)); return; }
    try {
      const d = await makeDoc();
      const c = await R.render(d, 220 / d.W, assets);
      thumbs.set(key, c);
      holder.appendChild(c);
    } catch (e) { holder.textContent = '—'; }
  }
  let thumbQueue = painted; // thumbnails wait until the main canvas is ready
  const queueThumb = (...a) => { thumbQueue = thumbQueue.then(() => docThumb(...a)); };

  async function localTemplates() { return (await Store.get('templates')) || []; }
  async function saveTemplate() {
    const name = await ask('Guardar plantilla', 'Se guarda en este dispositivo, sin la foto.', 'Mi marco');
    if (!name) return;
    const list = await localTemplates();
    list.unshift({ id: E.uid(), name: name.slice(0, 40), created: Date.now(), doc: templateDoc() });
    await Store.set('templates', list);
    toast('Plantilla guardada');
    renderSheet();
  }

  /* Shared frames on the server ("Del torneo"). */
  const tokens = (() => { try { return JSON.parse(localStorage.getItem('mm-owner-tokens') || '{}'); } catch (e) { return {}; } })();
  const saveTokens = () => { try { localStorage.setItem('mm-owner-tokens', JSON.stringify(tokens)); } catch (e) { /* private mode */ } };
  const adminKey = () => sessionStorage.getItem('mm-admin') || '';
  let shared = null, sharedErr = false;
  async function loadShared(force) {
    if (shared && !force) return shared;
    try {
      const r = await fetch(API, { cache: 'no-store' });
      const j = await r.json();
      shared = (j.frames || []).filter(f => f.kind === 'layout' || f.kind === 'png');
      sharedErr = false;
    } catch (e) { shared = []; sharedErr = true; }
    return shared;
  }
  function sharedDoc(f) {
    if (f.kind === 'layout') return Promise.resolve(f.def);
    return R.trackImage(f.files.png).then(info => {
      if (!info) throw new Error('png');
      const H = Math.round(P.W * info.h / info.w);
      return {
        W: P.W, H, ratio: 'custom', layers: [
          E.make('grunge', { w: P.W, h: H }, 0, 0, { locked: true }),
          E.make('photo', { w: P.W, h: H, frame: 'none', vignette: 0, flares: false }, 0, 0),
          E.make('image', { url: f.files.png, w: P.W }, P.W / 2, H / 2, { locked: true, label: f.name })
        ]
      };
    });
  }
  async function toPNG(blob) {
    if (blob.type === 'image/png') return blob;
    const img = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return new Promise(r => c.toBlob(r, 'image/png'));
  }
  async function publish() {
    const name = await ask('Publicar para todos', 'Todos verán este marco en "Del torneo". Tu foto no se sube.', 'Marco del torneo');
    if (!name) return;
    const d = templateDoc(), fd = new FormData();
    let n = 0;
    for (const l of d.layers) {
      if (l.type !== 'image' || !l.props.asset) continue;
      if (n >= 5) { toast('Máximo 5 imágenes propias por marco'); return; }
      const blob = assets.blob(l.props.asset);
      if (!blob) continue;
      fd.append('img' + n, await toPNG(blob), `img${n}.png`);
      l.props.asset = 'img' + n++;
    }
    fd.append('action', 'save'); fd.append('kind', 'layout'); fd.append('name', name);
    fd.append('def', JSON.stringify({ v: 2, W: d.W, H: d.H, ratio: d.ratio, layers: d.layers }));
    if (adminKey()) fd.append('key', adminKey());
    toast('Publicando…');
    try {
      const j = await (await fetch(API, { method: 'POST', body: fd })).json();
      if (!j.ok) throw new Error(j.error || 'Error');
      tokens[j.frame.id] = j.token; saveTokens();
      shared = null;
      toast('Marco publicado');
      renderSheet();
    } catch (e) { toast(e.message || 'No se pudo publicar'); }
  }
  async function deleteShared(f) {
    if (!confirm(`¿Borrar "${f.name}" para todos?`)) return;
    const fd = new FormData();
    fd.append('action', 'delete'); fd.append('id', f.id);
    if (tokens[f.id]) fd.append('token', tokens[f.id]);
    if (adminKey()) fd.append('key', adminKey());
    try {
      const j = await (await fetch(API, { method: 'POST', body: fd })).json();
      if (!j.ok) throw new Error(j.error);
      delete tokens[f.id]; saveTokens();
      shared = null; renderSheet();
      toast('Marco borrado');
    } catch (e) { toast(e.message || 'No se pudo borrar'); }
  }

  /* ---------- Panels ---------- */
  function card(label, sub, on, onPick, onDelete) {
    const c = h(`<button type="button" class="card${on ? ' on' : ''}"><div class="thumb"></div><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`);
    c.onclick = onPick;
    if (onDelete) {
      const d = h(`<span class="del" role="button" aria-label="Borrar">${icon('trash')}</span>`);
      d.onclick = e => { e.stopPropagation(); onDelete(); };
      c.appendChild(d);
    }
    return c;
  }

  function panelFrames(body) {
    body.appendChild(h('<p class="muted">Elige un marco. Luego toca cualquier pieza para moverla, agrandarla o girarla.</p>'));
    const g = h('<div class="cards"></div>');
    for (const pr of P.PRESETS) {
      const c = card(pr.label, pr.sub, doc.preset === pr.id, () => applyPreset(pr.id));
      g.appendChild(c);
      queueThumb('preset:' + pr.id, async () => { const b = P.build(Object.assign({}, pr.o, { ratio: '4:5' })); await R.prepare(b.layers, assets); return b; }, c.querySelector('.thumb'));
    }
    body.appendChild(field('Torneo', g));

    const mine = h('<div class="cards"></div>');
    const mineField = field('Mis plantillas', mine);
    body.appendChild(mineField);
    localTemplates().then(list => {
      if (!list.length) mine.replaceWith(h('<p class="muted">Guarda tu diseño para reusarlo después.</p>'));
      for (const t of list) {
        const c = card(t.name, '', doc.preset === 'local:' + t.id, () => applyTemplateDoc(t.doc, 'local:' + t.id), async () => {
          await Store.set('templates', (await localTemplates()).filter(x => x.id !== t.id));
          renderSheet();
        });
        mine.appendChild(c);
        queueThumb('local:' + t.id, () => loadDoc(t.doc), c.querySelector('.thumb'));
      }
    });

    const shg = h('<div class="cards"></div>');
    body.appendChild(field('Del torneo', shg));
    loadShared().then(list => {
      if (sharedErr) { shg.replaceWith(h('<p class="muted">No se pudieron cargar los marcos compartidos.</p>')); return; }
      if (!list.length) { shg.replaceWith(h('<p class="muted">Todavía no hay marcos publicados.</p>')); return; }
      for (const f of list) {
        const canDel = !!tokens[f.id] || !!adminKey();
        const c = card(f.name, f.kind === 'png' ? 'PNG' : '', doc.preset === 'shared:' + f.id, async () => {
          try { applyTemplateDoc(await sharedDoc(f), 'shared:' + f.id); } catch (e) { toast('No se pudo abrir ese marco'); }
        }, canDel ? () => deleteShared(f) : null);
        shg.appendChild(c);
        queueThumb('shared:' + f.id, async () => loadDoc(await sharedDoc(f)), c.querySelector('.thumb'));
      }
    });

    const row = h('<div class="row"></div>');
    const s = h(`<button type="button" class="btn">${icon('download')}<span>Guardar plantilla</span></button>`); s.onclick = saveTemplate;
    const p = h(`<button type="button" class="btn">${icon('share')}<span>Publicar</span></button>`); p.onclick = publish;
    row.append(s, p);
    body.appendChild(row);
  }

  function panelPhoto(body) {
    const l = photoLayer();
    if (!l) { body.appendChild(h('<p class="muted">Este marco no tiene foto.</p>')); return; }
    const p = l.props;
    if (!p.asset) {
      const b = h(`<button type="button" class="btn btn-primary btn-block">${icon('photo')}<span>Subir foto</span></button>`);
      b.onclick = () => $('#photoInput').click();
      body.appendChild(b);
      body.appendChild(h('<p class="muted">Tu foto se queda en tu teléfono; nada se sube a internet.</p>'));
    } else {
      const row = h('<div class="row"></div>');
      const c = h(`<button type="button" class="btn">${icon('photo')}<span>Cambiar foto</span></button>`); c.onclick = () => $('#photoInput').click();
      const ctr = h(`<button type="button" class="btn">${icon('center')}<span>Centrar</span></button>`); ctr.onclick = () => setProps(l, { px: 0, py: 0, zoom: 1 });
      row.append(c, ctr);
      body.appendChild(row);
      body.appendChild(field('Al tocar la foto', chips([['pan', 'Mover foto'], ['window', 'Ajustar ventana']], photoMode, v => { photoMode = v; renderSelbar(); renderSheet(); requestDraw(); })));
      body.appendChild(h(`<p class="muted">${photoMode === 'pan' ? 'Arrastra para encuadrar y pellizca para acercar.' : 'Arrastra para mover la ventana y usa la esquina roja para cambiar su tamaño.'}</p>`));
      body.appendChild(field('Zoom', range(1, 4, .01, p.zoom, v => v.toFixed(1) + '×', v => { const info = R.imageNow(R.imageSrc(l, assets)); l.props.zoom = v; if (info) { const g = R.photoGeom(l, info); if (g.ox <= 0) l.props.px = 0; if (g.oy <= 0) l.props.py = 0; } requestDraw(); }, commit)));
    }
    body.appendChild(field('Borde', chips(E.TYPES.photo.schema.frame.opts, p.frame, v => setProps(l, { frame: v }))));
    if (p.frame === 'metal') {
      body.appendChild(field('Metal del borde', themeChips(p.theme, v => setProps(l, { theme: v }))));
      body.appendChild(field('Destellos en el borde', chips([[true, 'Sí'], [false, 'No']], p.flares, v => setProps(l, { flares: v }))));
    }
    body.appendChild(field('Viñeta', range(0, 1, .05, p.vignette, v => Math.round(v * 100) + '%', v => setProps(l, { vignette: v }, { live: true }), commit)));
  }

  function panelAdd(body) {
    for (const grp of E.LIBRARY) {
      const g = h('<div class="lib"></div>');
      if (grp.group === 'Logos') {
        const up = h(`<button type="button" class="lib-item upload"><div class="ico">${icon('plus')}</div>Subir imagen</button>`);
        up.onclick = () => $('#imageInput').click();
        g.appendChild(up);
      }
      for (const it of grp.items) {
        const b = h(`<button type="button" class="lib-item"><div class="ico"></div>${esc(it.label)}</button>`);
        b.onclick = () => addFromLibrary(it);
        g.appendChild(b);
        libThumb(it, b.querySelector('.ico'));
      }
      body.appendChild(field(grp.group, g));
    }
  }
  const libThumbs = new Map();
  function libThumb(it, holder) {
    const key = it.type + JSON.stringify(it.props);
    const put = c => { const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d').drawImage(c, 0, 0); holder.appendChild(k); };
    if (libThumbs.has(key)) { put(libThumbs.get(key)); return; }
    thumbQueue = thumbQueue.then(async () => {
      const l = E.make(it.type, it.props, 0, 0, { center: true });
      await R.prepare([l], assets);
      const c = await R.thumb(l, 112, assets);
      libThumbs.set(key, c);
      put(c);
    }).catch(() => {});
  }

  const layerThumbs = new Map();
  function panelLayers(body) {
    body.appendChild(h('<p class="muted">Arriba están las piezas que se ven encima. Toca una para seleccionarla.</p>'));
    const list = h('<div class="layers"></div>');
    for (const l of [...doc.layers].reverse()) {
      const row = h(`<div class="layer${l.id === selId ? ' on' : ''}${l.hidden ? ' off' : ''}">
        <button type="button" class="layer-main"><div class="lt"></div><span>${esc(layerName(l))}</span></button>
        <button type="button" class="icon-btn${l.hidden ? '' : ' lit'}" data-a="eye" aria-label="Ver u ocultar">${icon(l.hidden ? 'eyeoff' : 'eye')}</button>
        <button type="button" class="icon-btn${l.locked ? ' lit' : ''}" data-a="lock" aria-label="Bloquear">${icon(l.locked ? 'lock' : 'unlock')}</button>
        <button type="button" class="icon-btn" data-a="up" aria-label="Subir">${icon('up')}</button>
        <button type="button" class="icon-btn" data-a="down" aria-label="Bajar">${icon('down')}</button>
      </div>`);
      row.querySelector('.layer-main').onclick = () => { selId = l.id; if (l.type === 'photo') photoMode = 'pan'; refreshUI(); requestDraw(); };
      row.querySelector('[data-a=eye]').onclick = () => { l.hidden = !l.hidden; commit(); renderSheet(); requestDraw(); };
      row.querySelector('[data-a=lock]').onclick = () => toggleLock(l);
      row.querySelector('[data-a=up]').onclick = () => moveZ(l, 1);
      row.querySelector('[data-a=down]').onclick = () => moveZ(l, -1);
      const key = l.type === 'photo' ? 'photo:' + l.props.asset : l.type + JSON.stringify(l.props);
      const holder = row.querySelector('.lt');
      if (layerThumbs.has(key)) holder.appendChild(cloneCanvas(layerThumbs.get(key)));
      else thumbQueue = thumbQueue.then(() => R.thumb(l, 80, assets)).then(c => { layerThumbs.set(key, c); holder.appendChild(cloneCanvas(c)); }).catch(() => {});
      list.appendChild(row);
    }
    body.appendChild(list);
  }
  function cloneCanvas(c) { const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d').drawImage(c, 0, 0); return k; }

  function panelStyle(body) {
    body.appendChild(field('Metal de todo el marco', themeChips(currentMetal(), setMetal)));
    const vary = h(`<button type="button" class="btn btn-block">${icon('dice')}<span>Variar trazos y texturas</span></button>`);
    vary.onclick = reseedAll;
    body.appendChild(vary);
    const ratios = Object.entries(P.RATIOS).map(([k, v]) => [k, `${v.label} · ${v.sub}`]);
    body.appendChild(field('Formato', chips(ratios, doc.ratio, setRatio)));
    const bg = doc.layers.find(l => l.type === 'grunge');
    if (bg) body.appendChild(field('Color de fondo', swatches(bg.props.color, false, (v, live) => setProps(bg, { color: v }, { live }))));
    const fx = h('<div class="chips"></div>');
    const has = t => doc.layers.some(l => l.type === t);
    for (const [t, label] of [['bokeh', 'Bokeh'], ['confetti', 'Confeti'], ['flare', 'Destellos']]) {
      const b = h(`<button type="button" class="chip${has(t) ? ' on' : ''}">${label}</button>`);
      b.onclick = () => toggleFx(t);
      fx.appendChild(b);
    }
    body.appendChild(field('Efectos', fx));
    if (doc.preset && P.PRESETS.some(p => p.id === doc.preset)) {
      const reset = h(`<button type="button" class="btn btn-block">${icon('undo')}<span>Volver al marco original</span></button>`);
      reset.onclick = () => applyPreset(doc.preset);
      body.appendChild(reset);
    }
  }

  function panelElement(body) {
    const l = sel();
    if (!l) { body.appendChild(h('<p class="muted">Toca una pieza del marco para editarla.</p>')); return; }
    if (l.type === 'photo') { panelPhoto(body); return; }
    const T = E.TYPES[l.type];
    const texts = [];
    for (const [k, f] of Object.entries(T.schema)) {
      if (!f.label) continue;
      const v = l.props[k];
      if (f.t === 'text') {
        const inp = h(`<input class="input" maxlength="${f.max}" autocomplete="off" spellcheck="false">`);
        inp.value = v;
        inp.oninput = () => typed(l, k, inp.value.toUpperCase());
        texts.push(field(f.label, inp));
      } else if (f.t === 'theme') {
        if (l.type === 'ball' && l.props.style !== 'metal') continue;
        if (l.type === 'halftone' && l.props.shape !== 'square') continue;
        const opts = E.THEMES.map(t => [t, E.THEME_LABELS[t], metalDot(t)]);
        if (f.nullable) opts.unshift([null, 'Ninguno']);
        body.appendChild(field(f.label, chips(opts, v, nv => setProps(l, { [k]: nv }))));
      } else if (f.t === 'color') {
        if (l.type === 'halftone' && l.props.shape === 'square' && l.props.metal) continue;
        if (l.type === 'ribbon' && l.props.theme) continue;
        if (l.type === 'text' && l.props.style === 'chrome') continue;
        body.appendChild(field(f.label, swatches(v, f.nullable, (nv, live) => setProps(l, { [k]: nv }, { live }), l.type === 'strokes' ? 'Original' : 'Automático')));
      } else if (f.t === 'pick') {
        body.appendChild(field(f.label, chips(f.opts, v, nv => setProps(l, { [k]: nv }))));
      } else if (f.t === 'bool') {
        body.appendChild(field(f.label, chips([[true, 'Sí'], [false, 'No']], v, nv => setProps(l, { [k]: nv }))));
      } else if (f.t === 'seed') {
        const b = h(`<button type="button" class="btn">${icon('dice')}<span>${esc(f.label)}</span></button>`);
        b.onclick = () => setProps(l, { [k]: 1 + Math.floor(Math.random() * 9000) });
        body.appendChild(b);
      } else if (f.t === 'place') {
        body.appendChild(field(f.label, chips([[1, '1er'], [2, '2do'], [3, '3er'], [4, '4to']], v, nv => setProps(l, Object.assign({ place: nv }, E.PLACE_PRESETS[nv])))));
      } else if (f.t === 'num') {
        body.appendChild(field(f.label, range(f.min, f.max, f.step || .01, v, x => x.toFixed(2), x => setProps(l, { [k]: x }, { live: true }), commit)));
      }
    }
    if (texts.length) {
      const g = h(`<div class="${texts.length > 1 ? 'grid2' : 'field'}"></div>`);
      texts.forEach(t => g.appendChild(t));
      body.prepend(g);
    }
    body.appendChild(h('<div class="divider"></div>'));
    const live = () => { liveId = l.id; requestDraw(); };
    body.appendChild(field('Tamaño', range(.1, 4, .01, l.s, x => Math.round(x * 100) + '%', x => { l.s = x; live(); }, commit)));
    if (!T.noRotate) body.appendChild(field('Giro', range(-180, 180, 1, ((l.r % 360) + 540) % 360 - 180, x => Math.round(x) + '°', x => { l.r = Math.abs(x) < 3 ? 0 : x; live(); }, commit)));
    body.appendChild(field('Opacidad', range(0, 1, .01, l.o, x => Math.round(x * 100) + '%', x => { l.o = x; live(); }, commit)));
  }

  /* ---------- Global design actions ---------- */
  async function setMetal(t) {
    for (const l of doc.layers) {
      const sc = E.TYPES[l.type].schema;
      if (l.type === 'halftone') { if (l.props.metal) l.props.metal = t; continue; }
      if (l.type === 'photo') { l.props.theme = t; if (l.props.frame === 'red') l.props.frame = 'metal'; continue; }
      if (sc.theme && (!sc.theme.nullable || l.props.theme)) {
        l.props.theme = t === 'red' && ['placeBadge', 'title', 'medal', 'nameplate', 'laurels', 'crown'].includes(l.type) ? 'silver' : t;
      }
    }
    await R.prepare(doc.layers, assets);
    commit(); renderSheet(); requestDraw();
  }
  async function reseedAll() {
    for (const l of doc.layers) if (E.TYPES[l.type].schema.seed) l.props.seed = 1 + Math.floor(Math.random() * 9000);
    await R.prepare(doc.layers, assets);
    commit(); requestDraw();
  }
  async function setRatio(r) {
    if (r === doc.ratio) return;
    const H2 = P.RATIOS[r].H, k = H2 / doc.H;
    for (const l of doc.layers) {
      if (l.type === 'grunge') { l.props.h = H2; continue; }
      l.y *= k;
      if (l.type === 'photo') l.props.h = Math.round(l.props.h * k);
    }
    doc.H = H2; doc.ratio = r;
    await R.prepare(doc.layers, assets);
    commit(); layout(); renderSheet();
  }
  async function toggleFx(t) {
    const list = doc.layers.filter(l => l.type === t);
    if (list.length) { doc.layers = doc.layers.filter(l => l.type !== t); commit(); renderSheet(); requestDraw(); return; }
    const th = currentMetal() || 'gold', pl = photoLayer();
    const top = pl ? pl.y : 120, ph = pl ? pl.props.h : doc.H - 240;
    let add = [];
    if (t === 'bokeh') add = [E.make('bokeh', { x: 0, y: doc.H - 380, w: doc.W, h: 380, n: 22, theme: th, opacity: .45 }, 0, 0, { center: true, shift: true }), E.make('bokeh', { x: 700, y: 0, w: 380, h: 300, n: 8, color: '#ffffff', opacity: .35, seed: 8 }, 0, 0, { center: true, shift: true })];
    if (t === 'confetti') add = [E.make('confetti', { x: 80, y: top + 20, w: doc.W - 160, h: ph * .4, n: 46, theme: th }, 0, 0, { center: true, shift: true })];
    if (t === 'flare' && pl) add = [E.make('flare', { theme: th }, pl.x + pl.props.w, pl.y + ph * .35, { s: .55 }), E.make('flare', { theme: th }, pl.x, pl.y + ph * .7, { s: .45 })];
    await R.prepare(add, assets);
    // effects go just above the photo so badges and logos stay on top
    const at = pl ? doc.layers.indexOf(pl) + 1 : doc.layers.length;
    doc.layers.splice(t === 'bokeh' ? at : doc.layers.length - countTop(), 0, ...add);
    commit(); renderSheet(); requestDraw();
  }
  function countTop() { let n = 0; for (let i = doc.layers.length - 1; i >= 0 && ['logo', 'placeBadge', 'title', 'medal', 'nameplate', 'tag'].includes(doc.layers[i].type); i--) n++; return n; }

  /* ---------- File inputs ---------- */
  $('#photoInput').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const l = photoLayer();
    if (!l) return;
    const id = await assets.add(f);
    const info = await R.trackImage(assets.url(id));
    if (!info) { toast('No se pudo abrir esa imagen'); return; }
    Object.assign(l.props, { asset: id, zoom: 1, px: 0, py: 0 });
    selId = l.id; photoMode = 'pan';
    commit();
    if (!isDesktop()) openTab(null);
    refreshUI(); requestDraw();
    toast('Arrastra la foto para encuadrarla');
  });
  $('#imageInput').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const id = await assets.add(f);
    const info = await R.trackImage(assets.url(id));
    if (!info) { toast('No se pudo abrir esa imagen'); return; }
    const w = Math.min(500, info.w);
    addLayer(E.make('image', { asset: id, w }, doc.W / 2, doc.H / 2, { label: 'Imagen' }));
  });

  /* ---------- Export ---------- */
  let exp = { type: 'image/jpeg', scale: 2 };
  const canShareFiles = (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' })] })); } catch (e) { return false; } })();
  function renderExportOpts() {
    const f = $('#exportFormat'), s = $('#exportSize');
    f.innerHTML = ''; s.innerHTML = '';
    f.appendChild(chips([['image/jpeg', 'JPG · ligero'], ['image/png', 'PNG · máxima calidad']], exp.type, v => { exp.type = v; renderExportOpts(); }));
    s.appendChild(chips([[1, `${doc.W} × ${doc.H}`], [2, `${doc.W * 2} × ${doc.H * 2}`]], exp.scale, v => { exp.scale = v; renderExportOpts(); }));
  }
  async function openExport() {
    if (selId) setSel(null);
    const d = $('#exportDialog');
    $('#shareBtn').hidden = !canShareFiles;
    renderExportOpts();
    const img = $('#exportPreview');
    img.removeAttribute('src');
    d.showModal();
    const c = await R.render(doc, 600 / doc.W, assets);
    img.src = c.toDataURL('image/jpeg', .85);
  }
  async function makeFile() {
    const c = await R.render(doc, exp.scale, assets);
    const blob = await new Promise(r => c.toBlob(r, exp.type, .93));
    c.width = c.height = 0;
    const p = photoLayer();
    if (p && !p.props.asset) toast('Ojo: el marco no tiene foto');
    const stamp = new Date().toISOString().slice(0, 10);
    return new File([blob], `mixnmatch-${doc.preset ? doc.preset.replace(/[^a-z0-9-]/gi, '') + '-' : ''}${stamp}.${exp.type === 'image/png' ? 'png' : 'jpg'}`, { type: exp.type });
  }
  async function busy(btn, fn) {
    const label = btn.querySelector('span'), old = label.textContent;
    btn.disabled = true; label.textContent = 'Preparando…';
    try { await fn(); } finally { btn.disabled = false; label.textContent = old; }
  }
  $('#exportBtn').onclick = openExport;
  $('#downloadBtn').onclick = e => busy(e.currentTarget, async () => {
    const file = await makeFile();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Descargado');
  });
  $('#shareBtn').onclick = e => busy(e.currentTarget, async () => {
    const file = await makeFile();
    try { await navigator.share({ files: [file], title: 'Mix & Match Pádel' }); }
    catch (err) { if (err && err.name !== 'AbortError') toast('No se pudo compartir; usa Descargar'); }
  });

  /* ---------- Keyboard ---------- */
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, dialog')) return;
    const mod = e.ctrlKey || e.metaKey, l = sel();
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (!l) return;
    if (e.key === 'Escape') setSel(null);
    else if ((e.key === 'Delete' || e.key === 'Backspace') && l.type !== 'photo' && !l.locked) { e.preventDefault(); removeLayer(l); }
    else if (mod && e.key.toLowerCase() === 'd' && l.type !== 'photo') { e.preventDefault(); duplicate(l); }
    else if (e.key.startsWith('Arrow') && !l.locked) {
      e.preventDefault();
      const d = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') l.x -= d; if (e.key === 'ArrowRight') l.x += d;
      if (e.key === 'ArrowUp') l.y -= d; if (e.key === 'ArrowDown') l.y += d;
      requestDraw();
      clearTimeout(keyT); keyT = setTimeout(commit, 400);
    }
  });
  let keyT = 0;
  $('#undo').onclick = undo;
  $('#redo').onclick = redo;

  /* ---------- Boot ---------- */
  new ResizeObserver(() => layout()).observe($('#stage'));

  async function cleanupBlobs() {
    const keys = await Store.blobKeys();
    if (!keys) return;
    const used = new Set();
    const scan = d => d && (d.layers || []).forEach(l => l.props && l.props.asset && used.add(l.props.asset));
    scan(doc);
    (await localTemplates()).forEach(t => scan(t.doc));
    for (const k of keys) if (!used.has(k)) Store.delBlob(k);
  }

  (async function boot() {
    $('#loading').classList.add('on');
    await R.init();
    if (/[?&]admin\b/.test(location.search) && !adminKey()) {
      const k = prompt('Clave de admin');
      if (k) {
        const fd = new FormData(); fd.append('action', 'check'); fd.append('key', k);
        try { const j = await (await fetch(API, { method: 'POST', body: fd })).json(); if (j.ok) sessionStorage.setItem('mm-admin', k); else alert(j.error); } catch (e) { alert('No se pudo verificar'); }
      }
    }
    let first = false;
    try { const saved = await Store.get('current'); if (saved) doc = await loadDoc(saved); } catch (e) { doc = null; }
    if (!doc) {
      first = true;
      const b = P.build(P.PRESETS[1].o);
      await R.prepare(b.layers, assets);
      doc = { W: b.W, H: b.H, ratio: '4:5', preset: P.PRESETS[1].id, layers: b.layers };
    }
    lastSnap = snapshot();
    updateUndo();
    layout();
    if (first || isDesktop()) openTab('frames');
    cleanupBlobs();
  })();
})();
