/* Element registry: every layer type the editor knows.
   Each type has a schema (drives sanitizing and the property panel) and a render
   function that returns an SVG fragment in local coordinates (via FrameKit),
   or `bitmap: true` for image layers drawn straight onto the canvas. */
(function () {
  'use strict';
  const FK = window.FrameKit;
  const { RED, BLACK, WHITE } = FK;
  const THEMES = ['gold', 'silver', 'bronze', 'red'];
  const THEME_LABELS = { gold: 'Oro', silver: 'Plata', bronze: 'Bronce', red: 'Rojo' };
  const SWATCHES = [RED, WHITE, BLACK, '#8a8a8a', '#ffd56a', '#ffb27a'];

  /* ---------- Field types ---------- */
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const CLEAN = {
    num: (v, d, f) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, f.min ?? -1e4, f.max ?? 1e4) : d),
    int: (v, d, f) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(clamp(v, f.min ?? -1e6, f.max ?? 1e6)) : d),
    text: (v, d, f) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, f.max || 40) : d),
    color: (v, d, f) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : (f.nullable && v === null ? null : d)),
    theme: (v, d, f) => (THEMES.includes(v) ? v : (f.nullable && v === null ? null : d)),
    pick: (v, d, f) => (f.opts.some(o => o[0] === v) ? v : d),
    bool: (v, d) => (typeof v === 'boolean' ? v : d),
    seed: (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(clamp(v, 1, 99999)) : d),
    asset: (v, d) => (typeof v === 'string' && /^[a-z0-9_-]{1,40}$/i.test(v) ? v : d),
    url: (v, d) => (typeof v === 'string' && /^uploads\/[0-9a-f]{20}\.png$/.test(v) ? v : d),
    strokes: (v, d) => {
      if (!Array.isArray(v)) return d;
      const n = (x, lo, hi, df) => (typeof x === 'number' && Number.isFinite(x) ? clamp(x, lo, hi) : df);
      return v.slice(0, 40).filter(s => s && typeof s === 'object').map(s => ({
        x: n(s.x, -3000, 5000, 0), y: n(s.y, -3000, 5000, 0), len: n(s.len, 10, 3000, 300), t: n(s.t, 2, 600, 60),
        a: n(s.a, -360, 360, 0), c: CLEAN.color(s.c, RED, {}), dry: s.dry ? 1 : 0, o: n(s.o, 0, 1, 1), flip: !!s.flip
      }));
    }
  };

  const fld = {
    theme: (label = 'Metal', nullable = false) => ({ t: 'theme', label, nullable }),
    color: (label = 'Color', nullable = false) => ({ t: 'color', label, nullable }),
    text: (label, max = 30) => ({ t: 'text', label, max }),
    seed: (label = 'Variar') => ({ t: 'seed', label })
  };

  /* Color resolved from an optional explicit color, falling back to the theme glow. */
  const glowOf = p => p.color || FK.T(p.theme || 'silver').glow;

  /* ---------- Types ---------- */
  const TYPES = {
    grunge: {
      name: 'Fondo',
      schema: { w: { t: 'num', min: 100, max: 4000 }, h: { t: 'num', min: 100, max: 4000 }, seed: fld.seed('Variar textura'), color: fld.color('Color de fondo'), amount: { t: 'num', min: 0, max: 1 } },
      defaults: { w: 1080, h: 1350, seed: 7, color: BLACK, amount: .16 },
      svg: p => FK.grunge(p)
    },
    strokes: {
      name: 'Trazos',
      schema: { list: { t: 'strokes' }, seed: fld.seed('Variar trazos'), color: fld.color('Pintar todo', true) },
      defaults: { list: [{ x: 0, y: 0, len: 420, t: 70, a: -14, c: RED, dry: 1 }], seed: 3, color: null },
      svg: p => FK.strokes(p.color ? p.list.map(s => Object.assign({}, s, { c: p.color })) : p.list, { seed: p.seed }),
      pad: 50
    },
    halftone: {
      name: 'Semitono',
      schema: {
        w: { t: 'num', min: 10, max: 2000 }, h: { t: 'num', min: 10, max: 2000 }, x: { t: 'num' }, y: { t: 'num' },
        from: { t: 'pick', opts: ['left', 'right', 'top', 'bottom', 'br', 'bl', 'tr', 'tl', 'center'].map(v => [v, v]) },
        shape: { t: 'pick', opts: [['circle', 'Puntos'], ['square', 'Cuadros']], label: 'Forma' },
        r: { t: 'num', min: 1, max: 60 }, step: { t: 'num', min: 4, max: 120 }, fill: fld.color('Color'), metal: fld.theme('Metal (cuadros)', true),
        hex: { t: 'bool' }, jitter: { t: 'num', min: 0, max: 1 }, cut: { t: 'num', min: 0, max: 1 }, seed: fld.seed('Variar')
      },
      defaults: { x: 0, y: 0, w: 220, h: 200, from: 'left', shape: 'circle', r: 7, step: 16, fill: RED, metal: null, hex: true, jitter: .3, cut: .1, seed: 4 },
      svg: p => FK.halftone(p)
    },
    photo: {
      name: 'Foto',
      schema: {
        w: { t: 'num', min: 50, max: 4000 }, h: { t: 'num', min: 50, max: 4000 },
        frame: { t: 'pick', label: 'Borde', opts: [['metal', 'Metálico'], ['red', 'Rojo'], ['none', 'Sin borde']] },
        theme: fld.theme('Metal del borde'), vignette: { t: 'num', min: 0, max: 1, label: 'Viñeta', step: .05 }, flares: { t: 'bool', label: 'Destellos en borde' },
        asset: { t: 'asset' }, px: { t: 'num', min: -1, max: 1 }, py: { t: 'num', min: -1, max: 1 }, zoom: { t: 'num', min: 1, max: 8 }
      },
      defaults: { w: 940, h: 1000, frame: 'metal', theme: 'silver', vignette: .55, flares: true, asset: null, px: 0, py: 0, zoom: 1 },
      // The photo itself is drawn on the canvas; this is the border/vignette overlay in window coords.
      svg: p => FK.vignette({ x: 0, y: 0, w: p.w, h: p.h, strength: p.vignette }) +
        (p.frame === 'metal' ? FK.metalFrame({ x: 0, y: 0, w: p.w, h: p.h, theme: p.theme, flares: p.flares }) : p.frame === 'red' ? FK.redBorder({ x: 0, y: 0, w: p.w, h: p.h }) : ''),
      noFlip: true, noRotate: true
    },
    logo: {
      name: 'Logo', bitmap: true,
      schema: { kind: { t: 'pick', label: 'Logo', opts: [['mixMatch', 'Mix & Match'], ['artBlack', 'Art Pádel negro'], ['artWhite', 'Art Pádel blanco']] }, w: { t: 'num', min: 20, max: 3000 } },
      defaults: { kind: 'mixMatch', w: 320 }
    },
    image: {
      name: 'Imagen', bitmap: true,
      schema: { asset: { t: 'asset' }, url: { t: 'url' }, w: { t: 'num', min: 20, max: 4000 } },
      defaults: { asset: null, url: null, w: 400 }
    },
    ball: {
      name: 'Pelota',
      schema: { style: { t: 'pick', label: 'Estilo', opts: [['metal', 'Metal'], ['red', 'Roja'], ['dark', 'Negra']] }, theme: fld.theme(), r: { t: 'num', min: 10, max: 600 }, motion: { t: 'bool', label: 'Estela' } },
      defaults: { style: 'metal', theme: 'silver', r: 96, motion: true },
      svg: p => FK.ball(p)
    },
    speed: {
      name: 'Líneas de velocidad',
      schema: { x: { t: 'num' }, y: { t: 'num' }, w: { t: 'num', min: 20, max: 2000 }, h: { t: 'num', min: 10, max: 2000 }, n: { t: 'int', min: 1, max: 60 }, theme: fld.theme(), color: fld.color('Color', true), seed: fld.seed() },
      defaults: { x: 0, y: -70, w: 260, h: 140, n: 12, theme: 'silver', color: null, seed: 5 },
      svg: p => FK.speedLines(Object.assign({}, p, { color: glowOf(p) })),
      pad: 30
    },
    racket: {
      name: 'Raqueta',
      schema: { theme: fld.theme(), seed: { t: 'seed' } },
      defaults: { theme: 'silver', seed: 6 },
      svg: p => FK.racket(p)
    },
    net: {
      name: 'Red',
      schema: { theme: fld.theme(), w: { t: 'num', min: 20, max: 1000 }, h: { t: 'num', min: 20, max: 1000 }, skew: { t: 'num', min: -45, max: 45 } },
      defaults: { theme: 'silver', w: 100, h: 230, skew: -8 },
      svg: p => FK.net(p)
    },
    placeBadge: {
      name: 'Insignia de lugar',
      schema: { place: { t: 'place', label: 'Lugar' }, num: fld.text('Número', 3), suf: fld.text('Sufijo', 4), word: fld.text('Palabra', 10), theme: fld.theme(), sparkles: { t: 'bool', label: 'Brillos' } },
      defaults: { place: 1, num: '1', suf: 'ER', word: 'LUGAR', theme: 'gold', sparkles: true },
      svg: p => FK.placeBadge(p),
      pad: 40
    },
    title: {
      name: 'Título',
      schema: { title: fld.text('Título', 16), sub: fld.text('Subtítulo', 30), theme: fld.theme(), laurels: { t: 'bool', label: 'Laureles' }, crown: { t: 'bool', label: 'Corona' } },
      defaults: { title: 'CAMPEONES', sub: 'MIX & MATCH PÁDEL', theme: 'gold', laurels: true, crown: true },
      svg: p => {
        const gc = FK.T(p.theme).glow;
        return FK.glow({ r: 380, color: gc, opacity: .3 }) +
          (p.laurels ? FK.laurel({ theme: p.theme, side: 'left', rx: 360, ry: 170 }) + FK.laurel({ theme: p.theme, side: 'right', rx: 360, ry: 170 }) : '') +
          FK.titleBlock({ title: p.title || ' ', sub: p.sub, theme: p.theme }) +
          (p.crown ? `<g transform="translate(-10 -120)">${FK.crown({ theme: p.theme, w: 96 })}</g>` : '') +
          FK.lensFlare({ x: -230, y: -30, s: .6, color: gc }) + FK.lensFlare({ x: 260, y: 60, s: .45, color: gc });
      },
      pad: 30
    },
    medal: {
      name: 'Medalla',
      schema: { place: { t: 'pick', label: 'Número', opts: [[1, '1'], [2, '2'], [3, '3'], [4, '4']] }, theme: fld.theme(), glow: { t: 'bool', label: 'Resplandor' } },
      defaults: { place: 1, theme: 'gold', glow: true },
      svg: p => {
        const gc = FK.T(p.theme).glow;
        return (p.glow ? FK.glow({ r: 260, color: gc, opacity: .35 }) : '') + FK.medal({ place: p.place, theme: p.theme, r: 120 }) + FK.lensFlare({ x: 90, y: -80, s: .55, color: gc });
      }
    },
    nameplate: {
      name: 'Nombres',
      schema: { n1: fld.text('Jugador 1', 18), n2: fld.text('Jugador 2', 18), theme: fld.theme(), w: { t: 'num', min: 100, max: 1600 }, h: { t: 'num', min: 20, max: 300 } },
      defaults: { n1: 'JUGADOR 1', n2: 'JUGADOR 2', theme: 'silver', w: 600, h: 64 },
      svg: p => FK.nameplate({ names: [p.n1, p.n2], theme: p.theme, w: p.w, h: p.h })
    },
    tag: {
      name: 'Etiqueta',
      schema: { text: fld.text('Texto', 24), fill: fld.color('Fondo'), color: fld.color('Letra'), w: { t: 'num', min: 40, max: 1200 }, h: { t: 'num', min: 20, max: 300 } },
      defaults: { text: '10 · 10 · 26', fill: RED, color: '#ffffff', w: 220, h: 48 },
      svg: p => FK.tag(p)
    },
    ribbon: {
      name: 'Cinta',
      schema: { text: fld.text('Texto', 20), theme: fld.theme('Metal', true), fill: fld.color('Color') },
      defaults: { text: 'CAMPEONES', theme: null, fill: RED },
      svg: p => FK.ribbon(p)
    },
    text: {
      name: 'Texto',
      schema: { text: fld.text('Texto', 40), style: { t: 'pick', label: 'Estilo', opts: [['chrome', 'Metálico'], ['plain', 'Plano']] }, theme: fld.theme(), color: fld.color('Color'), skew: { t: 'num', min: -30, max: 30 } },
      defaults: { text: 'TEXTO', style: 'chrome', theme: 'gold', color: '#ffffff', skew: -11 },
      svg: p => {
        const size = 140, t = p.text || ' ';
        const inner = p.style === 'chrome'
          ? FK.chromeText([{ t, x: 0, y: size * .36, size, anchor: 'middle' }], FK.T(p.theme))
          : `<text x="0" y="${size * .36}" text-anchor="middle" font-family="${FK.FONT}" font-size="${size}" fill="${p.color}" stroke="#000" stroke-width="${size * .07}" stroke-linejoin="round" paint-order="stroke">${esc(t)}</text>`;
        return `<g transform="skewX(${p.skew})">${inner}</g>`;
      },
      pad: 30
    },
    laurels: {
      name: 'Laureles',
      schema: { theme: fld.theme() },
      defaults: { theme: 'gold' },
      svg: p => FK.laurel({ theme: p.theme, side: 'left' }) + FK.laurel({ theme: p.theme, side: 'right' })
    },
    crown: { name: 'Corona', schema: { theme: fld.theme() }, defaults: { theme: 'gold' }, svg: p => FK.crown({ theme: p.theme, w: 160 }) },
    sparkle: { name: 'Destello', schema: { color: fld.color() }, defaults: { color: '#ffffff' }, svg: p => FK.sparkle({ s: 2, color: p.color }) },
    flare: {
      name: 'Destello de lente',
      schema: { theme: fld.theme(), color: fld.color('Color', true), streak: { t: 'bool', label: 'Raya' } },
      defaults: { theme: 'gold', color: null, streak: true },
      svg: p => FK.lensFlare({ color: glowOf(p), streak: p.streak }),
      pad: 30
    },
    glow: {
      name: 'Resplandor',
      schema: { theme: fld.theme(), color: fld.color('Color', true), rays: { t: 'bool', label: 'Rayos' } },
      defaults: { theme: 'gold', color: null, rays: true },
      svg: p => FK.glow({ r: 300, color: glowOf(p), opacity: .5 }) + (p.rays ? FK.rays({ r: 360, color: glowOf(p), opacity: .25 }) : '')
    },
    bokeh: {
      name: 'Bokeh',
      schema: { x: { t: 'num' }, y: { t: 'num' }, w: { t: 'num', min: 20, max: 3000 }, h: { t: 'num', min: 20, max: 3000 }, n: { t: 'int', min: 1, max: 80 }, theme: fld.theme(), color: fld.color('Color', true), opacity: { t: 'num', min: 0, max: 1 }, seed: fld.seed() },
      defaults: { x: 0, y: 0, w: 500, h: 300, n: 18, theme: 'gold', color: null, opacity: .5, seed: 9 },
      svg: p => FK.bokeh(Object.assign({}, p, { color: glowOf(p) })),
      pad: 20
    },
    confetti: {
      name: 'Confeti',
      schema: { x: { t: 'num' }, y: { t: 'num' }, w: { t: 'num', min: 20, max: 3000 }, h: { t: 'num', min: 20, max: 3000 }, n: { t: 'int', min: 1, max: 150 }, theme: fld.theme(), seed: fld.seed() },
      defaults: { x: 0, y: 0, w: 900, h: 400, n: 46, theme: 'gold', seed: 11 },
      svg: p => FK.confetti(Object.assign({}, p, { colors: [RED, WHITE, FK.T(p.theme).stops[1]] }))
    },
    corners: {
      name: 'Esquineros',
      schema: { w: { t: 'num', min: 20, max: 3000 }, h: { t: 'num', min: 20, max: 3000 }, color: fld.color() },
      defaults: { w: 600, h: 450, color: '#ffffff' },
      svg: p => FK.corners({ x: -p.w / 2, y: -p.h / 2, w: p.w, h: p.h, color: p.color })
    },
    ring: {
      name: 'Arco',
      schema: { r: { t: 'num', min: 10, max: 1000 }, a0: { t: 'num', min: -360, max: 360 }, a1: { t: 'num', min: -360, max: 360 }, width: { t: 'num', min: 1, max: 80 }, color: fld.color() },
      defaults: { r: 120, a0: -86, a1: -5, width: 10, color: RED },
      svg: p => {
        const pt = a => [p.r * Math.cos(a * Math.PI / 180), p.r * Math.sin(a * Math.PI / 180)];
        const [x0, y0] = pt(p.a0), [x1, y1] = pt(p.a1), large = Math.abs(p.a1 - p.a0) > 180 ? 1 : 0;
        return `<path d="M${x0} ${y0}A${p.r} ${p.r} 0 ${large} 1 ${x1} ${y1}" fill="none" stroke="${p.color}" stroke-width="${p.width}" stroke-linecap="round"/>`;
      }
    }
  };

  function esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  const PLACE_PRESETS = { 1: { num: '1', suf: 'ER', theme: 'gold' }, 2: { num: '2', suf: 'DO', theme: 'silver' }, 3: { num: '3', suf: 'ER', theme: 'bronze' }, 4: { num: '4', suf: 'TO', theme: 'silver' } };

  /* Returns clean props for a type: known keys only, each validated, defaults filled in. */
  function sanitizeProps(type, props) {
    const T = TYPES[type];
    if (!T) return null;
    const out = {};
    props = props && typeof props === 'object' ? props : {};
    for (const [k, f] of Object.entries(T.schema)) {
      const d = T.defaults[k] ?? null;
      if (f.t === 'place') { out[k] = [1, 2, 3, 4].includes(props[k]) ? props[k] : d; continue; }
      const c = CLEAN[f.t];
      out[k] = c ? c(props[k], d, f) : d;
    }
    return out;
  }

  /* Validates a whole layer (from storage, undo history or a shared template). */
  function sanitizeLayer(l) {
    if (!l || typeof l !== 'object' || !TYPES[l.type]) return null;
    const n = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
    const out = {
      id: typeof l.id === 'string' && /^[a-z0-9]{1,16}$/i.test(l.id) ? l.id : uid(),
      type: l.type,
      props: sanitizeProps(l.type, l.props),
      x: n(l.x, -5000, 8000, 0), y: n(l.y, -5000, 8000, 0), s: n(l.s, .02, 40, 1), r: n(l.r, -3600, 3600, 0),
      flip: !!l.flip, o: n(l.o, 0, 1, 1), hidden: !!l.hidden, locked: !!l.locked,
      ax: l.ax == null ? null : n(l.ax, -1e4, 1e4, 0), ay: l.ay == null ? null : n(l.ay, -1e4, 1e4, 0),
      shift: !!l.shift
    };
    if (typeof l.label === 'string') out.label = l.label.replace(/[\u0000-\u001f]/g, '').slice(0, 40);
    return out;
  }

  let _n = 0;
  function uid() { return (Date.now() % 1e8).toString(36) + (++_n).toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  /* Creates a layer. `place` is where the anchor goes; anchor defaults to the local origin.
     Pass {center:true} to anchor on the content's bounding-box center (resolved by the renderer). */
  function make(type, props = {}, x = 0, y = 0, extra = {}) {
    const T = TYPES[type];
    const p = sanitizeProps(type, Object.assign({}, T.defaults, props));
    const l = { id: uid(), type, props: p, x, y, s: 1, r: 0, flip: false, o: 1, hidden: false, locked: false, ax: 0, ay: 0, shift: false };
    if (extra.center) { l.ax = null; l.ay = null; l.shift = !!extra.shift; }
    delete extra.center; delete extra.shift;
    return Object.assign(l, extra);
  }

  /* Things users can add from the "Agregar" panel. */
  const LIBRARY = [
    { group: 'Lugar y textos', items: [
      { label: '1er lugar', type: 'placeBadge', props: { place: 1, num: '1', suf: 'ER', theme: 'gold' }, s: .7 },
      { label: '2do lugar', type: 'placeBadge', props: { place: 2, num: '2', suf: 'DO', theme: 'silver' }, s: .7 },
      { label: '3er lugar', type: 'placeBadge', props: { place: 3, num: '3', suf: 'ER', theme: 'bronze' }, s: .7 },
      { label: '4to lugar', type: 'placeBadge', props: { place: 4, num: '4', suf: 'TO', theme: 'silver' }, s: .7 },
      { label: 'Título', type: 'title', props: {}, s: .7 },
      { label: 'Medalla', type: 'medal', props: {}, s: .8 },
      { label: 'Nombres', type: 'nameplate', props: {} },
      { label: 'Fecha', type: 'tag', props: {} },
      { label: 'Cinta', type: 'ribbon', props: {}, s: .8 },
      { label: 'Texto metal', type: 'text', props: {} },
      { label: 'Texto plano', type: 'text', props: { style: 'plain', text: 'TEXTO' } }
    ] },
    { group: 'Pádel', items: [
      { label: 'Pelota metal', type: 'ball', props: { motion: false } },
      { label: 'Pelota roja', type: 'ball', props: { style: 'red', motion: false } },
      { label: 'Pelota negra', type: 'ball', props: { style: 'dark', motion: false } },
      { label: 'Raqueta', type: 'racket', props: {}, s: .6, r: 20 },
      { label: 'Red', type: 'net', props: { skew: 0 } },
      { label: 'Velocidad', type: 'speed', props: { x: -130, y: -70 } }
    ] },
    { group: 'Decoración', items: [
      { label: 'Trazo rojo', type: 'strokes', props: { list: [{ x: -210, y: 0, len: 420, t: 70, a: 0, c: RED, dry: 1 }], seed: 3 }, r: -14 },
      { label: 'Trazo blanco', type: 'strokes', props: { list: [{ x: -210, y: 0, len: 420, t: 70, a: 0, c: WHITE, dry: 1 }], seed: 4 }, r: -14 },
      { label: 'Trazo negro', type: 'strokes', props: { list: [{ x: -210, y: 0, len: 420, t: 90, a: 0, c: BLACK }], seed: 5 }, r: -14 },
      { label: 'Mancha blanca', type: 'strokes', props: { list: [{ x: -210, y: 70, len: 420, t: 120, a: -24, c: WHITE, dry: 1 }, { x: -170, y: 0, len: 380, t: 150, a: -20, c: WHITE }, { x: -130, y: -70, len: 320, t: 110, a: -12, c: WHITE }], seed: 8 } },
      { label: 'Puntos', type: 'halftone', props: { x: -110, y: -100 } },
      { label: 'Cuadros metal', type: 'halftone', props: { x: -115, y: -120, w: 230, h: 240, from: 'br', shape: 'square', metal: 'gold', step: 21, r: 8.5, hex: false, jitter: .15, cut: .15 } },
      { label: 'Laureles', type: 'laurels', props: {}, s: .6 },
      { label: 'Corona', type: 'crown', props: {} },
      { label: 'Destello', type: 'sparkle', props: {} },
      { label: 'Destello lente', type: 'flare', props: {} },
      { label: 'Resplandor', type: 'glow', props: {} },
      { label: 'Bokeh', type: 'bokeh', props: { x: -250, y: -150 } },
      { label: 'Confeti', type: 'confetti', props: { x: -450, y: -200 } },
      { label: 'Esquineros', type: 'corners', props: {} },
      { label: 'Arco', type: 'ring', props: {} }
    ] },
    { group: 'Logos', items: [
      { label: 'Mix & Match', type: 'logo', props: { kind: 'mixMatch' } },
      { label: 'Art Pádel negro', type: 'logo', props: { kind: 'artBlack', w: 280 } },
      { label: 'Art Pádel blanco', type: 'logo', props: { kind: 'artWhite', w: 280 } }
    ] }
  ];

  const LOGOS = { mixMatch: { src: 'assets/mix-match-logo.png', w: 360, h: 340 }, artBlack: { src: 'assets/art-padel-black.png', w: 1600, h: 1149 }, artWhite: { src: 'assets/art-padel-white.png', w: 1600, h: 1149 } };

  window.Elements = { TYPES, THEMES, THEME_LABELS, SWATCHES, PLACE_PRESETS, LIBRARY, LOGOS, sanitizeProps, sanitizeLayer, make, uid, esc };
})();
