/* Renderer: turns layers into pixels.
   - SVG layers are rasterized once per (props, scale bucket) and cached, so dragging
     a layer is just a drawImage with a new transform.
   - Bitmap layers (logos, uploaded images) and the photo are drawn straight from images.
   - Export re-rasterizes every layer at the output scale so the result stays sharp. */
(function () {
  'use strict';
  const E = window.Elements;
  const NS = 'http://www.w3.org/2000/svg';
  const MAX_SIDE = 4096, MAX_AREA = 16e6;
  const CACHE_PX = 36e6;
  const PHOTO_PREVIEW = 2048;

  let fontCSS = '';
  let measureSvg = null;
  const boxes = new Map();     // key -> {x,y,w,h}
  const rasters = new Map();   // key@bucket -> {canvas, rs, box, alpha?, used}
  const pending = new Map();   // key@bucket -> Promise
  const failed = new Set();    // key@bucket that could not be rasterized
  const images = new Map();    // src -> Promise<{img, w, h, preview}>
  let cachePx = 0;
  let queue = Promise.resolve();
  let active = 0;
  const waiters = [];

  async function init() {
    try {
      const blob = await (await fetch('fonts/anton-latin.woff2')).blob();
      const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      fontCSS = `@font-face{font-family:'Anton';src:url(${url}) format('woff2');}`;
    } catch (e) { fontCSS = ''; }
    try { await document.fonts.load('100px Anton'); } catch (e) { /* fallback font */ }
    measureSvg = document.createElementNS(NS, 'svg');
    measureSvg.setAttribute('width', '10'); measureSvg.setAttribute('height', '10');
    measureSvg.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(measureSvg);
  }

  /* ---------- Keys & markup ---------- */
  function isBitmap(l) { return !!E.TYPES[l.type].bitmap; }
  function propsKey(l) {
    if (l.type === 'photo') { const p = l.props; return `photo|${p.w}|${p.h}|${p.frame}|${p.theme}|${p.vignette}|${p.flares}`; }
    return l.type + '|' + JSON.stringify(l.props);
  }
  function markup(l) { return E.TYPES[l.type].svg(l.props); }

  /* ---------- Images (logos, uploads, photo) ---------- */
  function imageSrc(l, assets) {
    if (l.type === 'logo') return E.LOGOS[l.props.kind].src;
    if (l.type === 'image') return l.props.asset ? assets.url(l.props.asset) : l.props.url;
    if (l.type === 'photo') return l.props.asset ? assets.url(l.props.asset) : null;
    return null;
  }
  function loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (images.has(src)) return images.get(src);
    const p = new Promise(res => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        let preview = img;
        const k = PHOTO_PREVIEW / Math.max(w, h);
        if (k < 1) {
          preview = document.createElement('canvas');
          preview.width = Math.round(w * k); preview.height = Math.round(h * k);
          const cx = preview.getContext('2d');
          cx.imageSmoothingQuality = 'high';
          cx.drawImage(img, 0, 0, preview.width, preview.height);
        }
        res({ img, w, h, preview });
      };
      img.onerror = () => res(null);
      img.src = src;
    });
    images.set(src, p);
    return p;
  }
  function imageNow(src) { const p = images.get(src); return p && p.done; }
  function trackImage(src) {
    const p = loadImage(src);
    if (p && !p.tracked) { p.tracked = true; p.then(v => { p.done = v; }); }
    return p;
  }
  function forgetImage(src) { images.delete(src); }

  /* ---------- Bounding boxes ---------- */
  function svgBox(l) {
    const k = propsKey(l);
    if (boxes.has(k)) return boxes.get(k);
    let b;
    if (l.type === 'photo') {
      const p = l.props, pad = p.frame === 'metal' && p.flares ? 150 : 30;
      b = { x: -pad, y: -pad, w: p.w + pad * 2, h: p.h + pad * 2 };
    } else {
      const g = document.createElementNS(NS, 'g');
      g.innerHTML = markup(l);
      measureSvg.appendChild(g);
      let bb;
      try { bb = g.getBBox(); } catch (e) { bb = { x: -100, y: -100, width: 200, height: 200 }; }
      measureSvg.removeChild(g);
      const pad = (E.TYPES[l.type].pad || 16) + Math.max(bb.width, bb.height) * .02;
      b = { x: bb.x - pad, y: bb.y - pad, w: bb.width + pad * 2, h: bb.height + pad * 2 };
    }
    boxes.set(k, b);
    return b;
  }
  /* Bitmap boxes are centered on the local origin. */
  function bitmapBox(l, info) {
    const w = l.props.w;
    let h = w;
    if (l.type === 'logo') { const g = E.LOGOS[l.props.kind]; h = w * g.h / g.w; } else if (info) h = w * info.h / info.w;
    return { x: -w / 2, y: -h / 2, w, h };
  }
  function boxOf(l, assets) {
    if (isBitmap(l)) { const src = imageSrc(l, assets); return bitmapBox(l, src && imageNow(src)); }
    return svgBox(l);
  }

  /* Loads images, measures boxes and resolves center anchors. Mutates layers. */
  async function prepare(layers, assets) {
    await Promise.all(layers.map(l => { const s = imageSrc(l, assets); return s ? trackImage(s) : null; }));
    for (const l of layers) {
      const b = boxOf(l, assets);
      if (l.ax == null || l.ay == null) {
        l.ax = b.x + b.w / 2; l.ay = b.y + b.h / 2;
        if (l.shift) { l.x += l.ax; l.y += l.ay; }
        l.shift = false;
      }
    }
  }

  /* ---------- Rasterizing ---------- */
  function bucket(s) { return Math.pow(2, Math.ceil(Math.log2(Math.max(.05, s)) * 4) / 4); }
  function fitScale(box, rs) {
    rs = Math.min(rs, MAX_SIDE / box.w, MAX_SIDE / box.h);
    if (box.w * box.h * rs * rs > MAX_AREA) rs = Math.sqrt(MAX_AREA / (box.w * box.h));
    return rs;
  }
  function svgDoc(inner, box, pw, ph) {
    const font = fontCSS && inner.includes('<text') ? `<defs><style>${fontCSS}</style></defs>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" width="${pw}" height="${ph}">${font}${inner}</svg>`;
  }
  function slot() {
    if (active < 3) { active++; return Promise.resolve(); }
    return new Promise(r => waiters.push(r));
  }
  function release() { const w = waiters.shift(); if (w) w(); else active--; }

  async function rasterize(l, rs) {
    const box = svgBox(l);
    rs = fitScale(box, rs);
    const pw = Math.max(1, Math.round(box.w * rs)), ph = Math.max(1, Math.round(box.h * rs));
    const inner = markup(l);
    await slot();
    try {
      const url = URL.createObjectURL(new Blob([svgDoc(inner, box, pw, ph)], { type: 'image/svg+xml' }));
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      if (inner.includes('<text')) await new Promise(r => setTimeout(r, 30)); // Safari paints web fonts in SVG images a tick late
      const c = document.createElement('canvas');
      c.width = pw; c.height = ph;
      c.getContext('2d').drawImage(img, 0, 0, pw, ph);
      URL.revokeObjectURL(url);
      return { canvas: c, rs: pw / box.w, box };
    } finally { release(); }
  }

  function evict() {
    if (cachePx <= CACHE_PX) return;
    const list = [...rasters.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k, r] of list) {
      if (cachePx <= CACHE_PX * .75) break;
      rasters.delete(k);
      cachePx -= r.canvas.width * r.canvas.height;
    }
  }

  const lastDrawn = new Map(); // layer id -> raster drawn last time (stand-in while a layer is being edited live)

  /* Returns the best cached raster now (maybe at another scale) and requests the ideal one.
     With `live`, nothing new is requested: the layer is mid-gesture and keeps its last raster. */
  function rasterFor(l, want, onReady, live) {
    const key = propsKey(l), b = bucket(want), full = key + '@' + b;
    const hit = rasters.get(full);
    if (hit) { hit.used = performance.now(); return hit; }
    if (!live && !pending.has(full) && !failed.has(full)) {
      const p = rasterize(l, b).then(r => {
        r.used = performance.now();
        r.bucket = b;
        rasters.set(full, r);
        cachePx += r.canvas.width * r.canvas.height;
        pending.delete(full);
        evict();
        if (onReady) onReady();
        return r;
      }).catch(e => { pending.delete(full); failed.add(full); console.warn('No se pudo dibujar', l.type, e); });
      pending.set(full, p);
    }
    let best = null;
    for (const [k, r] of rasters) if (k.startsWith(key + '@') && (!best || Math.abs(r.rs - b) < Math.abs(best.rs - b))) best = r;
    return best || (live ? lastDrawn.get(l.id) : null) || null;
  }

  /* ---------- Drawing ---------- */
  function applyTransform(ctx, l) {
    ctx.translate(l.x, l.y);
    if (l.r) ctx.rotate(l.r * Math.PI / 180);
    ctx.scale(l.s * (l.flip ? -1 : 1), l.s);
  }

  function photoGeom(l, info) {
    const p = l.props;
    const cover = Math.max(p.w / info.w, p.h / info.h) * p.zoom;
    const dw = info.w * cover, dh = info.h * cover;
    return { dw, dh, ox: dw - p.w, oy: dh - p.h, dx: (p.w - dw) / 2 + p.px * (dw - p.w) / 2, dy: (p.h - dh) / 2 + p.py * (dh - p.h) / 2 };
  }

  function drawPlaceholder(ctx, w, h) {
    ctx.fillStyle = '#2b2b2e';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#333337';
    ctx.lineWidth = 11;
    ctx.beginPath();
    for (let i = -h; i < w; i += 22) { ctx.moveTo(i, h); ctx.lineTo(i + h, 0); }
    ctx.stroke();
    ctx.fillStyle = '#a2a2a8';
    ctx.textAlign = 'center';
    ctx.font = `600 ${Math.round(Math.min(w, h) * .05)}px 'Barlow Condensed', sans-serif`;
    ctx.fillText('TOCA AQUÍ PARA', w / 2, h * .42);
    ctx.fillText('AGREGAR TU FOTO', w / 2, h * .42 + Math.min(w, h) * .062);
  }

  function drawPhoto(ctx, l, info, full) {
    const p = l.props;
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.beginPath(); ctx.rect(0, 0, p.w, p.h); ctx.clip();
    if (info) {
      const g = photoGeom(l, info);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(full ? info.img : info.preview, g.dx, g.dy, g.dw, g.dh);
    } else drawPlaceholder(ctx, p.w, p.h);
    ctx.restore();
  }

  function drawRaster(ctx, l, r) {
    ctx.save();
    ctx.globalAlpha = l.o;
    if (l.type === 'photo') ctx.translate(l.x, l.y); else applyTransform(ctx, l);
    ctx.drawImage(r.canvas, r.box.x - (l.ax || 0), r.box.y - (l.ay || 0), r.box.w, r.box.h);
    ctx.restore();
  }

  function drawBitmap(ctx, l, info, assets) {
    const b = bitmapBox(l, info);
    ctx.save();
    ctx.globalAlpha = l.o;
    applyTransform(ctx, l);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(info.img, b.x - l.ax, b.y - l.ay, b.w, b.h);
    ctx.restore();
  }

  /* Preview draw. Returns true when everything was ready at the wanted resolution.
     `liveId` is the layer being dragged/pinched/slid right now. */
  function draw(ctx, doc, scale, assets, onReady, liveId) {
    let complete = true;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, doc.W, doc.H);
    for (const l of doc.layers) {
      if (l.hidden) continue;
      if (isBitmap(l)) {
        const src = imageSrc(l, assets), info = src && imageNow(src);
        if (info) drawBitmap(ctx, l, info, assets);
        else if (src) { complete = false; trackImage(src).then(v => { if (v && onReady) onReady(); }); }
        continue;
      }
      if (l.type === 'photo') {
        const src = imageSrc(l, assets), info = src && imageNow(src);
        if (src && !info) { complete = false; trackImage(src).then(() => onReady && onReady()); }
        drawPhoto(ctx, l, info || null, false);
      }
      const want = scale * (l.type === 'photo' ? 1 : l.s);
      const r = rasterFor(l, want, onReady, l.id === liveId);
      if (r ? r.bucket !== bucket(want) : !failed.has(propsKey(l) + '@' + bucket(want))) complete = false;
      if (r) { drawRaster(ctx, l, r); lastDrawn.set(l.id, r); }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return complete;
  }

  /* Full-resolution render for download/share. */
  async function render(doc, scale, assets) {
    const c = document.createElement('canvas');
    c.width = Math.round(doc.W * scale); c.height = Math.round(doc.H * scale);
    const ctx = c.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, doc.W, doc.H);
    for (const l of doc.layers) {
      if (l.hidden) continue;
      if (isBitmap(l)) {
        const info = await trackImage(imageSrc(l, assets));
        if (info) drawBitmap(ctx, l, info, assets);
        continue;
      }
      if (l.type === 'photo') drawPhoto(ctx, l, await trackImage(imageSrc(l, assets)), true);
      const r = await rasterize(l, scale * (l.type === 'photo' ? 1 : l.s));
      drawRaster(ctx, l, r);
      r.canvas.width = r.canvas.height = 0;
    }
    return c;
  }

  /* ---------- Geometry & hit testing ---------- */
  function toLocal(l, x, y) {
    let dx = x - l.x, dy = y - l.y;
    const a = -(l.r || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    let lx = dx * c - dy * s, ly = dx * s + dy * c;
    lx /= l.s * (l.flip ? -1 : 1); ly /= l.s;
    return [lx + (l.ax || 0), ly + (l.ay || 0)];
  }
  function toWorld(l, lx, ly) {
    lx -= l.ax || 0; ly -= l.ay || 0;
    lx *= l.s * (l.flip ? -1 : 1); ly *= l.s;
    const a = (l.r || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [l.x + lx * c - ly * s, l.y + lx * s + ly * c];
  }
  /* Downsampled alpha mask of a raster/image, plus the tight bounds of its solid pixels
     (soft glows are left out so the selection box hugs what you actually see). */
  function mask(canvas, store) {
    if (store.alpha) return store.alpha;
    const cw = canvas.naturalWidth || canvas.width, ch = canvas.naturalHeight || canvas.height;
    const k = Math.min(1, 256 / Math.max(cw, ch));
    const w = Math.max(1, Math.round(cw * k)), h = Math.max(1, Math.round(ch * k));
    const t = document.createElement('canvas'); t.width = w; t.height = h;
    const cx = t.getContext('2d', { willReadFrequently: true });
    cx.drawImage(canvas, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data, a = new Uint8Array(w * h);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < a.length; i++) {
      const v = a[i] = d[i * 4 + 3];
      if (v > 110) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    store.alpha = { a, w, h, k: w / cw, tight: x1 >= 0 ? { x: x0 / w, y: y0 / h, w: (x1 + 1 - x0) / w, h: (y1 + 1 - y0) / h } : null };
    return store.alpha;
  }
  function anyRaster(l) {
    const key = propsKey(l) + '@';
    for (const [k, v] of rasters) if (k.startsWith(key)) return v;
    return null;
  }

  /* Visible content box of a layer in local coords (photo: the window). */
  function contentBox(l, assets) {
    if (l.type === 'photo') return { x: 0, y: 0, w: l.props.w, h: l.props.h };
    const b = boxOf(l, assets);
    let t = null;
    if (isBitmap(l)) { const info = imageNow(imageSrc(l, assets)); if (info) t = mask(info.img, info.hit || (info.hit = {})).tight; }
    else { const r = anyRaster(l); if (r) t = mask(r.canvas, r).tight; }
    return t ? { x: b.x + t.x * b.w, y: b.y + t.y * b.h, w: t.w * b.w, h: t.h * b.h } : b;
  }

  function alphaAt(canvas, store, px, py) {
    const A = mask(canvas, store);
    // Check a small neighborhood so thin pieces are still easy to grab with a finger.
    const cx = Math.floor(px * A.k), cy = Math.floor(py * A.k);
    let max = 0;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const x = cx + i, y = cy + j;
      if (x >= 0 && y >= 0 && x < A.w && y < A.h) max = Math.max(max, A.a[y * A.w + x]);
    }
    return max;
  }

  function hitLayer(l, x, y, assets) {
    if (l.type === 'photo') {
      const p = l.props;
      return x >= l.x && x <= l.x + p.w && y >= l.y && y <= l.y + p.h;
    }
    const [lx, ly] = toLocal(l, x, y);
    const b = boxOf(l, assets);
    if (lx < b.x || ly < b.y || lx > b.x + b.w || ly > b.y + b.h) return false;
    if (isBitmap(l)) {
      const info = imageNow(imageSrc(l, assets));
      if (!info) return true;
      if (!info.hit) info.hit = {};
      return alphaAt(info.img, info.hit, (lx - b.x) / b.w * info.img.naturalWidth, (ly - b.y) / b.h * info.img.naturalHeight) > 30;
    }
    const r = anyRaster(l);
    if (!r) return true;
    return alphaAt(r.canvas, r, (lx - r.box.x) * r.rs, (ly - r.box.y) * r.rs) > 40;
  }

  /* Topmost unlocked, visible layer under the point. */
  function hitTest(doc, x, y, assets) {
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const l = doc.layers[i];
      if (l.hidden || l.locked) continue;
      if (hitLayer(l, x, y, assets)) return l;
    }
    return null;
  }

  /* Small thumbnail of a single layer for the layers panel. */
  async function thumb(l, size, assets) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    let src, b;
    if (isBitmap(l) || l.type === 'photo') {
      const info = await trackImage(imageSrc(l, assets));
      if (!info) return c;
      src = info.preview; b = { w: info.preview.width, h: info.preview.height, x: 0, y: 0 };
    } else {
      const r = await rasterize(l, Math.min(1, size * 1.5 / Math.max(svgBox(l).w, svgBox(l).h)));
      src = r.canvas; b = { x: 0, y: 0, w: r.canvas.width, h: r.canvas.height };
    }
    const k = Math.min(size / b.w, size / b.h);
    ctx.drawImage(src, (size - b.w * k) / 2, (size - b.h * k) / 2, b.w * k, b.h * k);
    return c;
  }

  window.Renderer = { init, prepare, draw, render, hitTest, toLocal, toWorld, contentBox, photoGeom, imageNow, trackImage, forgetImage, imageSrc, thumb, isBitmap };
})();
