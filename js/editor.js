/* Touch-first editor: selection, drag, pinch (scale + rotate), corner handle,
   center snapping, photo pan/zoom and photo-window resizing.
   Works in design coordinates; the app owns the document and history. */
(function () {
  'use strict';
  const R = window.Renderer;
  const HANDLE = 22;        // handle radius in CSS px
  const SNAP = 10;          // snap distance in CSS px
  const ROT_SNAP = 4;       // degrees

  function create(opts) {
    const { overlay, getDoc, getSel, select, assets, onLive, onCommit, onTapEmptyPhoto, getPhotoMode } = opts;
    const pointers = new Map();
    let mode = null, start = null, moved = false, guides = { v: false, h: false };
    let cssScale = 1;

    const sel = () => { const id = getSel(); return id ? getDoc().layers.find(l => l.id === id) : null; };
    const toDesign = e => { const r = overlay.getBoundingClientRect(); return [(e.clientX - r.left) / cssScale, (e.clientY - r.top) / cssScale]; };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    const pts = () => [...pointers.values()];

    /* World-space corners of a layer's content box. */
    function corners(l) {
      const b = R.contentBox(l, assets);
      if (l.type === 'photo') return [[l.x, l.y], [l.x + b.w, l.y], [l.x + b.w, l.y + b.h], [l.x, l.y + b.h]];
      return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(p => R.toWorld(l, p[0], p[1]));
    }
    function centerOf(l) { const c = corners(l); return [(c[0][0] + c[2][0]) / 2, (c[0][1] + c[2][1]) / 2]; }
    function handlePos(l) { return corners(l)[2]; }
    function onHandle(l, p) {
      if (!l || l.locked) return false;
      if (l.type === 'photo' && getPhotoMode() !== 'window') return false;
      return dist(handlePos(l), p) * cssScale < HANDLE + 10;
    }

    function snapMove(l) {
      const doc = getDoc();
      guides = { v: false, h: false };
      if (l.type === 'photo') return;
      const c = centerOf(l), tol = SNAP / cssScale;
      if (Math.abs(c[0] - doc.W / 2) < tol) { l.x += doc.W / 2 - c[0]; guides.v = true; }
      if (Math.abs(c[1] - doc.H / 2) < tol) { l.y += doc.H / 2 - c[1]; guides.h = true; }
    }
    function snapRot(r) {
      for (let k = -360; k <= 360; k += 90) if (Math.abs(r - k) < ROT_SNAP) return k;
      return r;
    }

    function beginSingle(p) {
      const l = sel();
      if (onHandle(l, p)) {
        mode = l.type === 'photo' ? 'resize' : 'handle';
        start = { p, l: { x: l.x, y: l.y, s: l.s, r: l.r, w: l.props.w, h: l.props.h }, piv: [l.x, l.y], d0: dist([l.x, l.y], p), a0: ang([l.x, l.y], p) };
        return;
      }
      const hit = R.hitTest(getDoc(), p[0], p[1], assets);
      if (hit && hit.id !== getSel()) select(hit.id);
      if (!hit) { select(null); mode = 'none'; start = { p, hit: null }; return; }
      const pm = getPhotoMode();
      mode = hit.type === 'photo' ? (pm === 'window' ? 'move' : 'pan') : 'move';
      start = { p, hit, l: { x: hit.x, y: hit.y, px: hit.props.px, py: hit.props.py } };
    }

    function beginPinch() {
      const l = sel();
      if (!l || l.locked) { mode = 'none'; return; }
      const [a, b] = pts();
      mode = l.type === 'photo' ? 'photoPinch' : 'pinch';
      start = { d0: dist(a, b), a0: ang(a, b), c0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], l: { x: l.x, y: l.y, s: l.s, r: l.r, zoom: l.props.zoom, px: l.props.px, py: l.props.py } };
    }

    function down(e) {
      try { overlay.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      pointers.set(e.pointerId, toDesign(e));
      if (pointers.size === 1) { moved = false; beginSingle(toDesign(e)); }
      else if (pointers.size === 2) beginPinch();
      draw();
    }

    function panPhoto(l, dx, dy, base) {
      const info = R.imageNow(R.imageSrc(l, assets));
      if (!info) return;
      const g = R.photoGeom(l, info);
      l.props.px = g.ox > 0 ? Math.max(-1, Math.min(1, base.px + 2 * dx / g.ox)) : 0;
      l.props.py = g.oy > 0 ? Math.max(-1, Math.min(1, base.py + 2 * dy / g.oy)) : 0;
    }

    function move(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, toDesign(e));
      const l = sel();
      if (!start || !l && mode !== 'none') return;
      if (pointers.size === 1) {
        const p = toDesign(e), dx = p[0] - start.p[0], dy = p[1] - start.p[1];
        if (!moved && Math.hypot(dx, dy) * cssScale < 4) return;
        moved = true;
        if (mode === 'move' && !l.locked) { l.x = start.l.x + dx; l.y = start.l.y + dy; snapMove(l); }
        else if (mode === 'pan') panPhoto(l, dx, dy, start.l);
        else if (mode === 'handle') {
          l.s = Math.max(.05, Math.min(30, start.l.s * dist(start.piv, p) / Math.max(1, start.d0)));
          l.r = snapRot(start.l.r + ang(start.piv, p) - start.a0);
        } else if (mode === 'resize') {
          l.props.w = Math.max(80, start.l.w + dx); l.props.h = Math.max(80, start.l.h + dy);
        } else return;
      } else if (pointers.size === 2 && (mode === 'pinch' || mode === 'photoPinch')) {
        moved = true;
        const [a, b] = pts(), k = dist(a, b) / Math.max(1, start.d0);
        const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (mode === 'pinch') {
          l.s = Math.max(.05, Math.min(30, start.l.s * k));
          l.r = snapRot(start.l.r + ang(a, b) - start.a0);
          l.x = start.l.x + c[0] - start.c0[0]; l.y = start.l.y + c[1] - start.c0[1];
          snapMove(l);
        } else {
          l.props.zoom = Math.max(1, Math.min(8, start.l.zoom * k));
          panPhoto(l, c[0] - start.c0[0], c[1] - start.c0[1], start.l);
        }
      }
      onLive(l ? l.id : null);
    }

    function up(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size === 1) { // finished a pinch: continue as a drag from the remaining finger
        const p = pts()[0], l = sel();
        if (l && (mode === 'pinch' || mode === 'photoPinch')) {
          mode = l.type === 'photo' ? (getPhotoMode() === 'window' ? 'move' : 'pan') : 'move';
          start = { p, hit: l, l: { x: l.x, y: l.y, px: l.props.px, py: l.props.py } };
        }
        return;
      }
      if (pointers.size) return;
      const l = sel();
      if (moved) onCommit();
      else if (start && start.hit && start.hit.type === 'photo' && !start.hit.props.asset) onTapEmptyPhoto();
      mode = null; start = null; moved = false; guides = { v: false, h: false };
      onLive(null);
      draw();
    }

    function wheel(e) {
      const l = sel();
      if (!l || l.locked) return;
      e.preventDefault();
      const k = Math.exp(-e.deltaY * .0015);
      if (l.type === 'photo') {
        const base = { px: l.props.px, py: l.props.py };
        l.props.zoom = Math.max(1, Math.min(8, l.props.zoom * k));
        panPhoto(l, 0, 0, base);
      } else if (e.shiftKey) l.r = snapRot(l.r + e.deltaY * .05);
      else l.s = Math.max(.05, Math.min(30, l.s * k));
      onLive(l.id);
      clearTimeout(wheel.t);
      wheel.t = setTimeout(() => { onLive(null); onCommit(); }, 300);
    }

    overlay.addEventListener('pointerdown', down);
    overlay.addEventListener('pointermove', move);
    overlay.addEventListener('pointerup', up);
    overlay.addEventListener('pointercancel', up);
    overlay.addEventListener('wheel', wheel, { passive: false });

    /* ---------- Overlay ---------- */
    function draw() {
      const ctx = overlay.getContext('2d'), dpr = overlay.width / overlay.clientWidth || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      const doc = getDoc(), k = cssScale * dpr;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      const px = 1 / cssScale;
      if (guides.v || guides.h) {
        ctx.strokeStyle = '#ff3b47'; ctx.lineWidth = 1.5 * px; ctx.setLineDash([]);
        ctx.beginPath();
        if (guides.v) { ctx.moveTo(doc.W / 2, 0); ctx.lineTo(doc.W / 2, doc.H); }
        if (guides.h) { ctx.moveTo(0, doc.H / 2); ctx.lineTo(doc.W, doc.H / 2); }
        ctx.stroke();
      }
      const l = sel();
      if (!l || l.hidden) return;
      const c = corners(l);
      ctx.beginPath(); c.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      ctx.lineWidth = 3 * px; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.setLineDash([]); ctx.stroke();
      ctx.lineWidth = 1.5 * px; ctx.strokeStyle = '#fff'; ctx.setLineDash([7 * px, 5 * px]); ctx.stroke();
      ctx.setLineDash([]);
      if (l.locked) return;
      if (l.type === 'photo' && getPhotoMode() !== 'window') return;
      const h = handlePos(l), r = HANDLE * px * .75;
      ctx.beginPath(); ctx.arc(h[0], h[1], r, 0, Math.PI * 2);
      ctx.fillStyle = '#e4161e'; ctx.fill();
      ctx.lineWidth = 2.5 * px; ctx.strokeStyle = '#fff'; ctx.stroke();
      // double-arrow glyph
      ctx.save(); ctx.translate(h[0], h[1]); ctx.rotate(Math.PI / 4 + (l.type === 'photo' ? 0 : (l.r || 0) * Math.PI / 180));
      ctx.beginPath(); ctx.moveTo(-r * .5, 0); ctx.lineTo(r * .5, 0);
      ctx.moveTo(-r * .5, 0); ctx.lineTo(-r * .2, -r * .3); ctx.moveTo(-r * .5, 0); ctx.lineTo(-r * .2, r * .3);
      ctx.moveTo(r * .5, 0); ctx.lineTo(r * .2, -r * .3); ctx.moveTo(r * .5, 0); ctx.lineTo(r * .2, r * .3);
      ctx.lineWidth = 2 * px; ctx.stroke(); ctx.restore();
    }

    return {
      draw,
      setScale(s) { cssScale = s; },
      busy: () => pointers.size > 0
    };
  }

  window.Editor = { create };
})();
