/* Tournament presets: the kit's podio/grupo compositions rebuilt as a list of
   independent, editable layers. Positions follow FrameKit's original compose(). */
(function () {
  'use strict';
  const FK = window.FrameKit, E = window.Elements;
  const { RED, BLACK, WHITE } = FK;
  const W = 1080;

  const RATIOS = {
    '4:5': { label: '4:5', sub: 'Post', H: 1350 },
    '3:4': { label: '3:4', sub: 'Vertical', H: 1440 },
    '1:1': { label: '1:1', sub: 'Cuadrado', H: 1080 },
    '9:16': { label: '9:16', sub: 'Historia', H: 1920 }
  };

  const L = E.make;
  const group = (label, list, seed, extra = {}) => L('strokes', { list, seed }, 0, 0, Object.assign({ center: true, shift: true, label }, extra));
  const free = (type, props, label) => L(type, props, 0, 0, { center: true, shift: true, label });

  /* Bottom block: place badge / title / medal, plus optional names and date. */
  function bottomBlock(c, out) {
    const { B, place, metal, o } = c;
    const mode = o.badge;
    if (mode === 'place' && place) {
      const P = E.PLACE_PRESETS[place];
      out.push(L('placeBadge', { place, num: P.num, suf: P.suf, theme: metal }, W / 2, B(196)));
    }
    if (mode === 'title') out.push(L('title', { title: o.title || 'CAMPEONES', sub: o.subtitle ?? 'MIX & MATCH PÁDEL', theme: metal }, W / 2, B(240)));
    if (mode === 'medal') out.push(L('medal', { place: place || 1, theme: metal }, W / 2, B(170)));
    if (o.names) out.push(L('nameplate', { n1: o.names[0], n2: o.names[1], theme: metal }, W / 2, B(mode === 'none' ? 130 : mode === 'medal' ? 120 : 440)));
    if (o.date) out.push(L('tag', { text: o.date }, mode === 'none' ? W / 2 : 880, B(mode === 'none' ? 60 : 92)));
  }

  function logo(kind, x, y, w) {
    const g = E.LOGOS[kind], h = w * g.h / g.w;
    return L('logo', { kind, w }, x + w / 2, y + h / 2, { ax: 0, ay: 0 });
  }

  function podio(c) {
    const { H, B, M, th, fx, seed } = c, out = [];
    const px = 70, py = 200, pw = 940, ph = B(150) - 200;
    out.push(L('grunge', { w: W, h: H, seed }, 0, 0, { locked: true }));
    out.push(group('Trazos superiores', [
      { x: -60, y: 150, len: 560, t: 120, a: -14, c: RED, dry: 1 },
      { x: 140, y: 96, len: 640, t: 64, a: -15, c: RED, dry: 1 },
      { x: 300, y: 36, len: 520, t: 36, a: -10, c: RED, dry: 1 }
    ], seed));
    out.push(group('Trazos fondo izq.', [
      { x: -80, y: M(430), len: 260, t: 80, a: -38, c: RED, dry: 1 },
      { x: -70, y: M(560), len: 220, t: 40, a: -36, c: WHITE, dry: 1 },
      { x: -90, y: M(700), len: 260, t: 80, a: -34, c: RED, dry: 1 }
    ], seed + 10));
    out.push(group('Trazos fondo der.', [
      { x: 900, y: M(560), len: 300, t: 100, a: -40, c: RED, dry: 1 },
      { x: 930, y: M(720), len: 220, t: 40, a: -38, c: WHITE, dry: 1 },
      { x: 910, y: M(880), len: 260, t: 80, a: -38, c: RED, dry: 1 }
    ], seed + 20));
    out.push(free('halftone', { x: 0, y: 300, w: 70, h: M(460), from: 'left', r: 7, step: 16, fill: RED, seed: seed + 3 }, 'Puntos izq.'));
    out.push(L('photo', { w: pw, h: ph, frame: 'metal', theme: th, vignette: fx.vignette ? .55 : 0, flares: fx.flares }, px, py));
    out.push(group('Mancha blanca', [
      { x: 640, y: 250, len: 600, t: 110, a: -24, c: WHITE, dry: 1 },
      { x: 720, y: 170, len: 480, t: 190, a: -20, c: WHITE },
      { x: 780, y: 70, len: 400, t: 220, a: -12, c: WHITE },
      { x: 850, y: 6, len: 300, t: 190, a: 0, c: WHITE },
      { x: 600, y: 190, len: 380, t: 34, a: -18, c: WHITE, dry: 1 }
    ], seed + 1));
    out.push(free('halftone', { x: 330, y: 30, w: 220, h: 80, from: 'left', r: 5.5, step: 14, fill: RED, seed }, 'Puntos arriba'));
    out.push(group('Bordes izq.', [
      { x: -70, y: M(1000), len: 300, t: 90, a: -32, c: RED, dry: 1 },
      { x: -40, y: M(560), len: 170, t: 40, a: -34, c: RED, dry: 1 }
    ], seed + 2));
    out.push(group('Bordes der.', [
      { x: 940, y: M(980), len: 260, t: 70, a: -40, c: RED, dry: 1 },
      { x: 960, y: M(800), len: 200, t: 46, a: -40, c: BLACK },
      { x: 860, y: B(360), len: 360, t: 80, a: -36, c: BLACK },
      { x: 820, y: B(310), len: 400, t: 44, a: -30, c: RED, dry: 1 }
    ], seed + 12));
    out.push(group('Franja inferior', [
      { x: -80, y: B(200), len: 620, t: 120, a: -18, c: BLACK },
      { x: -60, y: B(175), len: 540, t: 80, a: -20, c: RED, dry: 1 },
      { x: 380, y: B(70), len: 820, t: 170, a: -22, c: BLACK },
      { x: 520, y: B(175), len: 680, t: 60, a: -24, c: RED, dry: 1 },
      { x: 620, y: B(130), len: 540, t: 44, a: -26, c: WHITE, dry: 1 },
      { x: -100, y: B(70), len: 720, t: 100, a: -14, c: WHITE, dry: 1 },
      { x: -60, y: B(20), len: 820, t: 100, a: -10, c: BLACK },
      { x: -60, y: B(30), len: 480, t: 44, a: -14, c: RED, dry: 1 },
      { x: 820, y: B(56), len: 380, t: 100, a: -22, c: WHITE, dry: 1 }
    ], seed + 22));
    out.push(free('halftone', { x: 60, y: B(470), w: 180, h: 200, from: 'bl', r: 6.5, step: 15, fill: RED, seed: seed + 4 }, 'Puntos abajo'));
    out.push(free('halftone', { x: 860, y: B(230), w: 230, h: 240, from: 'br', shape: 'square', metal: th, step: 21, r: 8.5, hex: false, seed: seed + 5, jitter: .15, cut: .15 }, 'Cuadros metal'));
    if (fx.bokeh) {
      out.push(free('bokeh', { x: 0, y: B(380), w: W, h: 380, n: 22, theme: th, seed, opacity: .45 }, 'Bokeh abajo'));
      out.push(free('bokeh', { x: 700, y: 0, w: 380, h: 300, n: 8, color: '#ffffff', seed: seed + 1, opacity: .35 }, 'Bokeh arriba'));
    }
    out.push(L('net', { theme: th, w: 100, h: 230, skew: -8 }, 1010, M(720)));
    out.push(L('speed', { theme: th, seed }, 1060, M(430)));
    out.push(L('ball', { theme: th, r: 96 }, 1060, M(430)));
    out.push(L('racket', { theme: th, seed }, 20, B(520), { r: 26, s: .78 }));
    out.push(L('ball', { theme: th, r: 92 }, 30, B(160)));
    if (fx.confetti) out.push(free('confetti', { x: 80, y: 220, w: 920, h: 420, n: 46, theme: th, seed }, 'Confeti'));
    out.push(logo('mixMatch', 8, 6, 320));
    out.push(logo('artBlack', 800, 16, 250));
    bottomBlock(c, out);
    return out;
  }

  function grupo(c) {
    const { H, B, M, th, fx, seed } = c, out = [];
    const px = 64, py = 124, pw = 952, ph = B(140) - 124;
    out.push(L('grunge', { w: W, h: H, seed }, 0, 0, { locked: true }));
    out.push(group('Trazos superiores', [
      { x: 220, y: 64, len: 520, t: 100, a: -10, c: RED, dry: 1 },
      { x: 520, y: 36, len: 600, t: 64, a: -14, c: WHITE, dry: 1, o: .9 },
      { x: 700, y: 92, len: 420, t: 44, a: -18, c: '#8a8a8a', dry: 1 },
      { x: 860, y: 40, len: 300, t: 80, a: -30, c: RED, dry: 1 }
    ], seed));
    out.push(group('Trazos fondo izq.', [
      { x: -40, y: M(420), len: 200, t: 70, a: -40, c: RED, dry: 1 },
      { x: -40, y: M(800), len: 200, t: 56, a: -38, c: WHITE, dry: 1 },
      { x: -40, y: M(1000), len: 220, t: 70, a: -38, c: RED, dry: 1 }
    ], seed + 10));
    out.push(group('Trazos fondo der.', [
      { x: 990, y: M(320), len: 200, t: 80, a: -40, c: RED, dry: 1 },
      { x: 990, y: M(560), len: 200, t: 56, a: -40, c: WHITE, dry: 1 },
      { x: 990, y: M(760), len: 200, t: 80, a: -40, c: RED, dry: 1 }
    ], seed + 20));
    out.push(free('halftone', { x: 610, y: 48, w: 230, h: 62, from: 'right', r: 5, step: 14, fill: WHITE, seed }, 'Puntos arriba'));
    out.push(free('halftone', { x: 0, y: M(520), w: 56, h: 230, from: 'left', r: 6, step: 15, fill: WHITE, seed: seed + 1 }, 'Puntos izq.'));
    out.push(free('halftone', { x: 1022, y: M(830), w: 58, h: 230, from: 'right', r: 6, step: 15, fill: RED, seed: seed + 2 }, 'Puntos der.'));
    out.push(L('photo', { w: pw, h: ph, frame: th === 'red' ? 'red' : 'metal', theme: th, vignette: fx.vignette ? .45 : 0, flares: false }, px, py));
    if (fx.flares) {
      out.push(L('flare', { color: '#ff6a6a', streak: true }, px + pw, py + ph * .3, { s: .5 }));
      out.push(L('flare', { color: '#ff6a6a', streak: true }, px + pw * .55, py, { s: .45 }));
      out.push(L('flare', { color: '#ff6a6a', streak: true }, px, py + ph * .7, { s: .45 }));
    }
    out.push(group('Esquina sup. izq.', [
      { x: -60, y: 130, len: 360, t: 100, a: -24, c: RED, dry: 1 },
      { x: -40, y: 236, len: 240, t: 50, a: -30, c: WHITE, dry: 1 },
      { x: -80, y: M(600), len: 170, t: 40, a: -36, c: RED, dry: 1 }
    ], seed + 3));
    out.push(group('Bordes der.', [
      { x: 990, y: M(420), len: 160, t: 40, a: -40, c: BLACK },
      { x: 980, y: M(1000), len: 160, t: 60, a: -40, c: RED, dry: 1 }
    ], seed + 13));
    out.push(group('Franja inferior', [
      { x: -80, y: B(70), len: 760, t: 100, a: -10, c: BLACK },
      { x: 160, y: B(104), len: 680, t: 30, a: -6, c: RED, dry: 1 },
      { x: -60, y: B(22), len: 900, t: 90, a: -6, c: RED, dry: 1 },
      { x: 300, y: B(64), len: 600, t: 34, a: -10, c: WHITE, dry: 1 }
    ], seed + 23));
    out.push(group('Mancha blanca', [
      { x: 770, y: B(90), len: 440, t: 200, a: -26, c: WHITE },
      { x: 720, y: B(14), len: 480, t: 180, a: -10, c: WHITE },
      { x: 660, y: B(150), len: 380, t: 36, a: -24, c: WHITE, dry: 1 }
    ], seed + 33));
    out.push(free('halftone', { x: 186, y: B(190), w: 100, h: 110, from: 'left', r: 6, step: 15, fill: WHITE, seed: seed + 4 }, 'Puntos abajo'));
    if (fx.bokeh) {
      out.push(free('bokeh', { x: 0, y: B(200), w: 700, h: 200, n: 14, color: '#ff4a4a', seed, opacity: .45 }, 'Bokeh abajo'));
      out.push(free('bokeh', { x: 500, y: 0, w: 580, h: 130, n: 8, color: '#ffffff', seed: seed + 2, opacity: .3 }, 'Bokeh arriba'));
    }
    if (c.o.badge === 'none') out.push(L('ring', { r: 120, a0: -85.4, a1: -4.6, width: 10, color: RED }, 920.4, 149.6));
    out.push(L('ball', { r: 100, style: 'dark', motion: false }, 86, B(118)));
    if (fx.confetti) out.push(free('confetti', { x: 80, y: 140, w: 920, h: 360, n: 46, theme: th === 'red' ? 'gold' : th, seed }, 'Confeti'));
    out.push(logo('mixMatch', 14, 4, 310));
    out.push(c.o.badge === 'none' ? logo('artBlack', 800, B(218), 262) : logo('artWhite', 820, 6, 230));
    bottomBlock(c, out);
    return out;
  }

  /* o: { layout, place, theme, ratio, seed, badge, title, subtitle, names, date, fx } */
  function build(o = {}) {
    const H = (RATIOS[o.ratio] || RATIOS['4:5']).H;
    const B = v => H - v, M = v => v * H / 1350;
    const place = o.place || null;
    const th = o.theme && o.theme !== 'auto' ? o.theme : (place ? E.PLACE_PRESETS[place].theme : (o.layout === 'grupo' ? 'red' : 'silver'));
    const fx = Object.assign({ flares: true, vignette: true, bokeh: true, confetti: false }, o.fx || {});
    const badge = o.badge || (place ? 'place' : 'none');
    const c = { H, B, M, place, th, metal: th === 'red' ? 'silver' : th, fx, seed: o.seed || 7, o: Object.assign({}, o, { badge }) };
    return { W, H, layers: (o.layout === 'grupo' ? grupo : podio)(c) };
  }

  const PRESETS = [
    { id: 'grupo', label: 'Participación', sub: 'Grupo', o: { layout: 'grupo', place: 0 } },
    { id: 'p1', label: '1er lugar', sub: 'Oro', o: { layout: 'podio', place: 1 } },
    { id: 'p2', label: '2do lugar', sub: 'Plata', o: { layout: 'podio', place: 2 } },
    { id: 'p3', label: '3er lugar', sub: 'Bronce', o: { layout: 'podio', place: 3 } },
    { id: 'p4', label: '4to lugar', sub: 'Plata', o: { layout: 'podio', place: 4 } },
    { id: 'campeones', label: 'Campeones', sub: 'Título', o: { layout: 'podio', place: 0, theme: 'gold', badge: 'title', fx: { confetti: true } } },
    { id: 'medalla', label: 'Medalla', sub: 'Con nombres', o: { layout: 'podio', place: 2, badge: 'medal', names: ['ANA', 'LUIS'], date: '10 · 10 · 26' } },
    { id: 'grupo-oro', label: 'Grupo oro', sub: 'Título', o: { layout: 'grupo', place: 0, theme: 'gold', badge: 'title', title: 'MIX & MATCH', subtitle: 'OCTUBRE 2026' } }
  ];

  window.Presets = { W, RATIOS, PRESETS, build };
})();
