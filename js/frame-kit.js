/* FrameKit — elementos modulares de marcos Mix & Match Pádel.
   Cada función devuelve un fragmento SVG (string) en coordenadas locales.
   La app (js/elements.js, js/presets.js) convierte cada pieza en una capa editable. */
(function () {
  'use strict';
  const RED = '#e4161e', BLACK = '#0a0a0b', WHITE = '#f6f4f1';
  const THEMES = {
    gold:   { name: 'Oro',    stops: ['#fffbe2', '#f8d56e', '#c8962a', '#6e4a0c', '#e8b545', '#fff0b0'], dark: '#3a2604', edge: '#ffe7a0', glow: '#ffd56a', dot: '#d9a83a' },
    silver: { name: 'Plata',  stops: ['#ffffff', '#e4e4e4', '#a8a8a8', '#454545', '#c8c8c8', '#f6f6f6'], dark: '#161616', edge: '#ffffff', glow: '#ffffff', dot: '#bdbdbd' },
    bronze: { name: 'Bronce', stops: ['#fff1e2', '#f2bc8e', '#c07a48', '#5e2e14', '#d99668', '#ffdcbc'], dark: '#2a1407', edge: '#ffd3ae', glow: '#ffb27a', dot: '#c98a5c' },
    red:    { name: 'Rojo',   stops: ['#ff9a9a', '#ff3d3d', '#e4161e', '#6e0407', '#cf131a', '#ff6d6d'], dark: '#220203', edge: '#ffffff', glow: '#ff5a5a', dot: RED }
  };
  const PLACES = {
    1: { num: '1', suf: 'ER', theme: 'gold' },
    2: { num: '2', suf: 'DO', theme: 'silver' },
    3: { num: '3', suf: 'ER', theme: 'bronze' },
    4: { num: '4', suf: 'TO', theme: 'silver' }
  };
  const FONT = "Anton, 'Anton', Impact, 'Arial Narrow', sans-serif";
  let _u = 0;
  const uid = p => 'fk' + p + (++_u).toString(36);
  const rng = seed => { let a = (seed >>> 0) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const f = n => Math.round(n * 10) / 10;
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const T = t => (typeof t === 'string' ? THEMES[t] : t) || THEMES.silver;
  const rad = d => d * Math.PI / 180;

  function metalStops(th) { const o = [0, .28, .47, .53, .78, 1]; return th.stops.map((c, i) => `<stop offset="${o[i]}" stop-color="${c}"/>`).join(''); }
  function linGrad(id, th, g = {}) {
    const { x1 = 0, y1 = 0, x2 = 0, y2 = 1, units } = g;
    return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${units ? ` gradientUnits="${units}"` : ''}>${metalStops(T(th))}</linearGradient>`;
  }

  /* ---------- Fondo grunge ---------- */
  function grunge({ w = 1080, h = 1350, seed = 3, color = BLACK, amount = .16 } = {}) {
    const a = uid('g'), b = uid('g');
    return `<defs>
<filter id="${a}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 4.2 0 0 0 -2.45"/></filter>
<filter id="${b}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.022" numOctaves="4" seed="${seed + 2}"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 2.6 0 0 0 -1.35"/></filter></defs>
<rect width="${w}" height="${h}" fill="${color}"/><rect width="${w}" height="${h}" filter="url(#${b})" opacity="${amount * .55}"/><rect width="${w}" height="${h}" filter="url(#${a})" opacity="${amount}"/>`;
  }

  /* ---------- Trazos de pincel ---------- */
  function brushFilters(seed) {
    const rough = uid('r'), dry = uid('d');
    const disp = `<feTurbulence type="fractalNoise" baseFrequency="0.011 0.06" numOctaves="3" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="30" xChannelSelector="R" yChannelSelector="G" result="d"/>`;
    return { rough, dry, defs:
`<filter id="${rough}" x="-8%" y="-60%" width="116%" height="220%" color-interpolation-filters="sRGB">${disp}</filter>
<filter id="${dry}" x="-8%" y="-60%" width="116%" height="220%" color-interpolation-filters="sRGB">${disp}<feTurbulence type="fractalNoise" baseFrequency="0.0022 0.14" numOctaves="2" seed="${seed + 5}" result="s"/><feColorMatrix in="s" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3.4 0 0 0 -1.2" result="sa"/><feComposite in="d" in2="sa" operator="in"/></filter>` };
  }
  function strokeShape(r, len, t) {
    const h = t / 2, top = [], bot = [], n = 14;
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = len * (0.03 + 0.87 * u);
      const taper = Math.min(1, 0.35 + u * 4);
      top.push([x, -h * taper + (r() - .5) * t * .12]);
      bot.push([x, h * taper + (r() - .5) * t * .12]);
    }
    const end = [], k = 6 + Math.floor(r() * 5);
    for (let j = 0; j <= k; j++) {
      const y = -h + 2 * h * j / k;
      end.push([len * (j % 2 ? 0.93 + r() * 0.07 : 0.88 + r() * 0.04), y]);
    }
    let d = 'M0 ' + f((r() - .5) * t * .2) + 'L' + top.concat(end, bot.reverse()).map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
    const bristles = 3 + Math.floor(r() * 5);
    for (let i = 0; i < bristles; i++) {
      const y = (r() - .5) * t * .9, bt = Math.max(1.5, t * (.03 + r() * .07)), x0 = len * (.8 + r() * .1), x1 = len * (1.02 + r() * .22);
      d += `M${f(x0)} ${f(y - bt / 2)}L${f(x1)} ${f(y)}L${f(x0)} ${f(y + bt / 2)}Z`;
    }
    return d;
  }
  /* list: [{x,y,len,t,a,c,dry,o,flip}] — x,y = inicio del trazo; a = ángulo en grados */
  function strokes(list, { seed = 1 } = {}) {
    const F = brushFilters(seed), r = rng(seed * 97 + 13);
    return `<defs>${F.defs}</defs>` + list.map(s => {
      const d = strokeShape(r, s.len, s.t);
      return `<g transform="translate(${f(s.x)} ${f(s.y)}) rotate(${s.a || 0})${s.flip ? ' scale(-1 1)' : ''}" opacity="${s.o ?? 1}"><path d="${d}" fill="${s.c || RED}" filter="url(#${s.dry ? F.dry : F.rough})"/></g>`;
    }).join('');
  }

  /* ---------- Semitono ---------- */
  function halftone({ x = 0, y = 0, w = 200, h = 200, step = 18, r = 7, from = 'left', shape = 'circle', fill = RED, metal = null, seed = 4, jitter = .3, power = 1.3, cut = .1, hex = true, opacity = 1 } = {}) {
    const R = rng(seed); let out = '', defs = '', paint = fill;
    if (metal) { const id = uid('m'); defs = linGrad(id, metal, { x1: 0, y1: 0, x2: w * .35, y2: h, units: 'userSpaceOnUse' }); paint = `url(#${id})`; }
    const rowH = hex ? step * .866 : step;
    for (let j = 0; j * rowH <= h; j++) for (let i = 0; i * step <= w + step; i++) {
      const px = i * step + (hex && j % 2 ? step / 2 : 0), py = j * rowH;
      if (px > w) continue;
      const u = px / w, v = py / h;
      const map = { left: 1 - u, right: u, top: 1 - v, bottom: v, br: (u + v) / 2, bl: (1 - u + v) / 2, tr: (u + 1 - v) / 2, tl: (2 - u - v) / 2, center: 1 - Math.min(1, Math.hypot(u - .5, v - .5) * 2) };
      let t = Math.pow(map[from] ?? 1, power) * (1 - R() * jitter);
      if (t < cut) continue;
      const rr = r * t;
      out += shape === 'square' ? `<rect x="${f(px - rr)}" y="${f(py - rr)}" width="${f(rr * 2)}" height="${f(rr * 2)}"/>` : `<circle cx="${f(px)}" cy="${f(py)}" r="${f(rr)}"/>`;
    }
    return `<g transform="translate(${f(x)} ${f(y)})" opacity="${opacity}"><defs>${defs}</defs><g fill="${paint}">${out}</g></g>`;
  }

  /* ---------- Foto + filetes ---------- */
  function photo({ x = 0, y = 0, w = 800, h = 1000, href = null, vignette: vig = 0 } = {}) {
    const c = uid('p');
    const inner = href
      ? `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`
      : (() => { const p = uid('s'); return `<defs><pattern id="${p}" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="22" height="22" fill="#3a3a3d"/><rect width="11" height="22" fill="#333336"/></pattern></defs><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${p})"/><text x="${x + w / 2}" y="${y + h * .42}" fill="#9a9aa0" font-family="ui-monospace,Menlo,monospace" font-size="26" text-anchor="middle" letter-spacing="3">FOTO DEL EVENTO</text>`; })();
    return `<defs><clipPath id="${c}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs><g clip-path="url(#${c})">${inner}${vig ? vignette({ x, y, w, h, strength: vig }) : ''}</g>`;
  }
  function metalLine({ x1, y1, x2, y2, theme = 'silver', width = 6 }) {
    const id = uid('l');
    return `<defs>${linGrad(id, theme, { x1, y1, x2: x2 + (y2 - y1) * .15, y2: y2 + (x2 - x1) * .15, units: 'userSpaceOnUse' })}</defs>
<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="${width + 5}" stroke-linecap="square" opacity=".85"/>
<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#${id})" stroke-width="${width}" stroke-linecap="square"/>
<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="1.2" opacity=".55"/>`;
  }
  function redBorder({ x, y, w, h, width = 8, color = RED }) {
    return `<rect x="${x - width / 2}" y="${y - width / 2}" width="${w + width}" height="${h + width}" fill="none" stroke="${color}" stroke-width="${width}"/><rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" fill="none" stroke="#fff" stroke-width="2" opacity=".9"/>`;
  }

  /* ---------- Raqueta ---------- */
  function racket({ theme = 'silver', seed = 6 } = {}) {
    const th = T(theme), body = uid('rb'), rim = uid('rr'), clip = uid('rc'), R = rng(seed);
    const head = 'M0 -185C105 -185 160 -95 160 0C160 95 105 168 32 192L24 250L-24 250L-32 192C-105 168 -160 95 -160 0C-160 -95 -105 -185 0 -185Z';
    let holes = '';
    for (let yy = -150; yy <= 150; yy += 24) for (let xx = -130; xx <= 130; xx += 24) {
      const ox = xx + ((yy / 24) % 2 ? 12 : 0);
      const t = Math.max(0, 1 - Math.hypot(ox + 60, yy + 70) / 300);
      const rr = 3 + 5.5 * t * (0.85 + R() * .3);
      holes += `<circle cx="${ox}" cy="${yy}" r="${f(rr)}"/>`;
    }
    let grip = '';
    for (let i = 0; i < 9; i++) grip += `<line x1="-22" y1="${262 + i * 18}" x2="22" y2="${250 + i * 18}" stroke="#2c2c2c" stroke-width="3"/>`;
    return `<defs>
<radialGradient id="${body}" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#2e2e30"/><stop offset=".55" stop-color="#121213"/><stop offset="1" stop-color="#030303"/></radialGradient>
${linGrad(rim, th, { x1: 0, y1: 0, x2: .7, y2: 1 })}
<clipPath id="${clip}"><ellipse cx="0" cy="-5" rx="128" ry="152"/></clipPath></defs>
<rect x="-22" y="244" width="44" height="175" rx="10" fill="#0e0e0e" stroke="url(#${rim})" stroke-width="3"/>${grip}
<path d="${head}" fill="url(#${body})"/>
<g clip-path="url(#${clip})" fill="${th.dot}" opacity=".85">${holes}</g>
<path d="${head}" fill="none" stroke="#000" stroke-width="18"/>
<path d="${head}" fill="none" stroke="url(#${rim})" stroke-width="10"/>
<path d="${head}" fill="none" stroke="#fff" stroke-width="1.4" opacity=".5"/>`;
  }

  /* ---------- Pelota ---------- */
  function ball({ theme = 'silver', r = 100, style = 'metal', motion = true } = {}) {
    const th = T(theme), sg = uid('bs'), cl = uid('bc'), bl = uid('bb'), gl = uid('bg'), hi = uid('bh');
    const stops = style === 'dark'
      ? '<stop offset="0" stop-color="#4a4a4c"/><stop offset=".35" stop-color="#1a1a1b"/><stop offset=".8" stop-color="#050505"/><stop offset="1" stop-color="#220002"/>'
      : style === 'red'
      ? '<stop offset="0" stop-color="#ff5b5b"/><stop offset=".35" stop-color="#d4141b"/><stop offset=".75" stop-color="#3a0002"/><stop offset="1" stop-color="#070000"/>'
      : `<stop offset="0" stop-color="${th.stops[0]}"/><stop offset=".22" stop-color="${th.stops[1]}"/><stop offset=".55" stop-color="${th.stops[3]}"/><stop offset=".85" stop-color="#0b0b0b"/><stop offset="1" stop-color="${th.stops[2]}"/>`;
    const seam = style === 'red' ? WHITE : style === 'dark' ? RED : th.edge;
    const s1 = `M${-r * .98} ${-r * .22}C${-r * .35} ${-r * .05} ${-r * .25} ${r * .55} ${-r * .45} ${r * .95}`;
    const s2 = `M${r * .45} ${-r * .95}C${r * .25} ${-r * .55} ${r * .35} ${r * .05} ${r * .98} ${r * .22}`;
    return `<defs>
<radialGradient id="${sg}" cx=".36" cy=".32" r=".75">${stops}</radialGradient>
<radialGradient id="${gl}"><stop offset="0" stop-color="${style === 'metal' ? th.glow : RED}" stop-opacity="${style === 'dark' ? .2 : .45}"/><stop offset="1" stop-color="${style === 'metal' ? th.glow : RED}" stop-opacity="0"/></radialGradient>
<clipPath id="${cl}"><circle r="${r}"/></clipPath>
<filter id="${bl}" x="-150%" y="-30%" width="400%" height="160%"><feGaussianBlur stdDeviation="${f(r * .35)} ${f(r * .03)}"/></filter>
<filter id="${hi}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(r * .06)}"/></filter></defs>
<circle r="${r * 1.55}" fill="url(#${gl})"/>
${motion ? `<g filter="url(#${bl})" opacity=".6"><circle cx="${r * .7}" r="${r}" fill="url(#${sg})"/></g>` : ''}
<circle r="${r}" fill="url(#${sg})"/>
<g clip-path="url(#${cl})" fill="none" stroke-linecap="round"><path d="${s1}" stroke="#000" stroke-width="${r * .13}" opacity=".5"/><path d="${s2}" stroke="#000" stroke-width="${r * .13}" opacity=".5"/><path d="${s1}" stroke="${seam}" stroke-width="${r * .06}" opacity=".9"/><path d="${s2}" stroke="${seam}" stroke-width="${r * .06}" opacity=".9"/></g>
<ellipse cx="${-r * .34}" cy="${-r * .42}" rx="${r * .3}" ry="${r * .17}" transform="rotate(-30 ${-r * .34} ${-r * .42})" fill="#fff" opacity=".75" filter="url(#${hi})"/>
<circle r="${r}" fill="none" stroke="${style === 'metal' ? th.edge : RED}" stroke-width="${style === 'dark' ? r * .07 : r * .03}" opacity="${style === 'dark' ? 1 : .7}"/>`;
  }

  /* ---------- Red de pádel ---------- */
  function net({ w = 140, h = 280, theme = 'silver', step = 20, skew = 0 } = {}) {
    const g = uid('n'), c = uid('nc'); let lines = '';
    for (let x = 0; x <= w; x += step) lines += `<line x1="${x}" y1="0" x2="${x}" y2="${h}"/>`;
    for (let y = 0; y <= h; y += step) lines += `<line x1="0" y1="${y}" x2="${w}" y2="${y}"/>`;
    return `<g transform="skewY(${skew})"><defs>${linGrad(g, theme)}<clipPath id="${c}"><rect width="${w}" height="${h}"/></clipPath></defs>
<rect width="${w}" height="${h}" fill="#000" opacity=".55"/>
<g clip-path="url(#${c})" stroke="#e6e6e6" stroke-width="1.8" opacity=".9">${lines}</g>
<rect x="-6" y="-16" width="${w + 12}" height="16" fill="url(#${g})" stroke="#000" stroke-width="2"/>
<rect x="-12" y="-16" width="10" height="${h + 16}" fill="url(#${g})" stroke="#000" stroke-width="2"/></g>`;
  }

  /* ---------- Laurel ---------- */
  function laurel({ theme = 'gold', side = 'left', rx = 330, ry = 200, a0 = 122, a1 = 236, n = 8, leaf = 78 } = {}) {
    const th = T(theme), lg = uid('lg');
    const pt = a => [rx * Math.cos(rad(a)), ry * Math.sin(rad(a))];
    const tan = a => Math.atan2(ry * Math.cos(rad(a)), -rx * Math.sin(rad(a))) * 180 / Math.PI;
    const lp = (L, W) => `M0 0C${f(L * .22)} ${f(-W)} ${f(L * .72)} ${f(-W * .95)} ${f(L)} 0C${f(L * .72)} ${f(W * .95)} ${f(L * .22)} ${f(W)} 0 0Z`;
    const leafG = (p, ang, L) => { const W = L * .36; return `<g transform="translate(${f(p[0])} ${f(p[1])}) rotate(${f(ang)})"><path d="${lp(L, W)}" fill="url(#${lg})" stroke="${th.dark}" stroke-width="4.5" stroke-linejoin="round"/><path d="M${L * .06} 0Q${L * .5} ${-W * .1} ${L * .9} 0" fill="none" stroke="${th.dark}" stroke-width="1.8" opacity=".75"/><path d="M${L * .15} ${-W * .38}Q${L * .5} ${-W * .62} ${L * .82} ${-W * .25}" fill="none" stroke="#fff" stroke-width="1.3" opacity=".55"/></g>`; };
    let stem = '', leaves = '';
    const steps = 30; let d = '';
    for (let i = 0; i <= steps; i++) { const p = pt(a0 - 6 + (a1 - a0 + 6) * i / steps); d += (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1]); }
    stem = `<path d="${d}" fill="none" stroke="${th.dark}" stroke-width="10" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${th.stops[2]}" stroke-width="5" stroke-linecap="round"/>`;
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * i / (n - 1), p = pt(a), td = tan(a), L = leaf * (1 - .34 * i / (n - 1));
      leaves += leafG(p, td + 44, L * .92) + leafG(p, td - 40, L);
    }
    const ta = a1 + 4, tp = pt(ta);
    leaves += leafG(tp, tan(ta), leaf * .62);
    const body = `<defs><linearGradient id="${lg}" x1="0" y1="0" x2="0" y2="1">${metalStops(th)}</linearGradient></defs>${stem}${leaves}`;
    return side === 'right' ? `<g transform="scale(-1 1)">${body}</g>` : body;
  }

  /* ---------- Corona ---------- */
  function crown({ theme = 'gold', w = 110 } = {}) {
    const th = T(theme), g = uid('cg'), s = w / 120;
    return `<g transform="translate(${-60 * s} ${-90 * s}) scale(${s})"><defs>${linGrad(g, th)}</defs>
<path d="M6 70L0 20L32 46L60 4L88 46L120 20L114 70Z" fill="url(#${g})" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
<rect x="4" y="68" width="112" height="18" rx="3" fill="url(#${g})" stroke="#000" stroke-width="5"/>
<g fill="url(#${g})" stroke="#000" stroke-width="4"><circle cx="0" cy="18" r="8"/><circle cx="60" cy="3" r="9"/><circle cx="120" cy="18" r="8"/></g>
<g fill="${th.dark}"><circle cx="30" cy="77" r="4"/><circle cx="60" cy="77" r="4.5"/><circle cx="90" cy="77" r="4"/></g>
<path d="M14 64L60 18L106 64" fill="none" stroke="#fff" stroke-width="1.5" opacity=".5"/></g>`;
  }

  /* ---------- Destello ---------- */
  function sparkle({ x = 0, y = 0, s = 1, color = '#fff' } = {}) {
    const g = uid('sp');
    return `<g transform="translate(${f(x)} ${f(y)}) scale(${s})"><defs><radialGradient id="${g}"><stop offset="0" stop-color="${color}" stop-opacity=".9"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><circle r="26" fill="url(#${g})"/><path d="M0 -44C2.5 -7 7 -2.5 44 0C7 2.5 2.5 7 0 44C-2.5 7 -7 2.5 -44 0C-7 -2.5 -2.5 -7 0 -44Z" fill="${color}"/></g>`;
  }

  /* ---------- Texto cromado (base de lugar / título) ---------- */
  function chromeText(items, th, { font = FONT, sheen = true } = {}) {
    const fg = uid('tf'), eg = uid('te'), sh = uid('ts');
    const txt = (it, extra) => `<text x="${it.x}" y="${it.y}" font-size="${it.size}"${it.len ? ` textLength="${it.len}" lengthAdjust="spacingAndGlyphs"` : ''}${it.anchor ? ` text-anchor="${it.anchor}"` : ''} font-family="${font}" ${extra}>${esc(it.t)}</text>`;
    const one = it => {
      let o = txt(it, `fill="#000" stroke="#000" stroke-width="${it.size * .08}" stroke-linejoin="round"`);
      for (let k = 7; k >= 1; k--) o += `<g transform="translate(${f(k * it.size * .0045)} ${f(k * it.size * .0063)})">${txt(it, `fill="${th.dark}" stroke="${th.dark}" stroke-width="${it.size * .02}" stroke-linejoin="round"`)}</g>`;
      o += txt(it, `fill="url(#${fg})" stroke="url(#${eg})" stroke-width="${it.size * .025}" stroke-linejoin="round" paint-order="stroke"`);
      if (sheen) o += txt(it, `fill="url(#${sh})"`);
      o += txt(it, `fill="none" stroke="#fff" stroke-width="1.3" opacity=".65"`);
      return o;
    };
    return `<defs><linearGradient id="${fg}" x1="0" y1="0" x2="0" y2="1">${metalStops(th)}</linearGradient>${linGrad(eg, th, { x1: 0, y1: 0, x2: 1, y2: 1 })}
<linearGradient id="${sh}" x1="0" y1="0" x2="1" y2=".35"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset=".58" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>${items.map(one).join('')}`;
  }
  function plateLines(th, pts = [[-120, -16], [340, -34], [326, 132], [-138, 140]]) {
    const pg = uid('tp'), [a, b, c, d] = pts;
    return `<defs><linearGradient id="${pg}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${th.edge}" stop-opacity="0"/><stop offset=".25" stop-color="${th.stops[1]}"/><stop offset=".75" stop-color="${th.stops[4]}"/><stop offset="1" stop-color="${th.edge}" stop-opacity="0"/></linearGradient></defs>
<path d="M${a}L${b}L${c}L${d}Z" fill="#0b0b0b" opacity=".92"/><path d="M${a[0] - 90} ${a[1] + 6}L${a}L${b}L${b[0] + 90} ${b[1] - 6}" fill="none" stroke="url(#${pg})" stroke-width="4"/><path d="M${d[0] - 92} ${d[1] + 6}L${d}L${c}L${c[0] + 84} ${c[1] - 4}" fill="none" stroke="url(#${pg})" stroke-width="4"/>`;
  }
  /* ---------- Texto de lugar ---------- */
  function placeText({ place = 1, num, suf, word, theme, font = FONT } = {}) {
    const P = PLACES[place] || PLACES[1], th = T(theme || P.theme);
    const n = String(num ?? P.num), sf = String(suf ?? P.suf), wd = String(word ?? 'LUGAR');
    const numLen = 175 * Math.max(1, n.length);
    const items = [
      { t: n, x: -87 - numLen, y: 150, size: 340, len: numLen },
      { t: sf, x: -62, y: -24, size: 122, len: Math.max(1, sf.length) * 62 },
      { t: wd, x: -92, y: 122, size: 172, len: Math.max(1, wd.length) * 78.4 }
    ].filter(it => it.t);
    return `<g transform="skewX(-11)">${plateLines(th)}${chromeText(items, th, { font })}</g>`;
  }
  /* ---------- Título genérico (CAMPEONES, FINALISTAS…) ---------- */
  function titleBlock({ title = 'CAMPEONES', sub = 'MIX & MATCH PÁDEL', theme = 'gold', width = 560, font = FONT } = {}) {
    const th = T(theme);
    const subG = sub ? `<text x="0" y="128" text-anchor="middle" font-family="${font}" font-size="40" letter-spacing="10" fill="#fff">${esc(sub)}</text>` : '';
    return `<g transform="skewX(-11)">${plateLines(th, [[-width / 2 - 20, 70], [width / 2 + 30, 60], [width / 2 + 20, 145], [-width / 2 - 30, 150]])}${chromeText([{ t: title, x: -width / 2, y: 50, size: 190, len: width }], th, { font })}${subG}</g>`;
  }
  /* ---------- Insignia completa ---------- */
  function placeBadge({ place = 1, num, suf, word, theme, sparkles = true } = {}) {
    const th = theme || (PLACES[place] || PLACES[1]).theme, gc = T(th).glow;
    const sp = sparkles ? [[-120, -120, .55], [318, -48, .7], [-232, 150, .45], [210, 152, .5], [40, -186, .35]].map(([x, y, s]) => sparkle({ x, y, s, color: '#fff' })).join('') : '';
    return `<g>${glow({ r: 380, color: gc, opacity: .35 })}${rays({ r: 460, color: gc, opacity: .16 })}${laurel({ theme: th, side: 'left' })}${laurel({ theme: th, side: 'right' })}${placeText({ place, num, suf, word, theme: th })}<g transform="translate(-12 -122)">${crown({ theme: th, w: 96 })}</g>${sp}${sparkles ? lensFlare({ x: -150, y: -28, s: .6, color: gc }) + lensFlare({ x: 300, y: 70, s: .45, color: gc }) : ''}</g>`;
  }

  /* ---------- Marco metálico completo ---------- */
  function metalFrame({ x, y, w, h, theme = 'silver', width = 8, flares = true }) {
    const th = T(theme), id = uid('mf');
    let o = `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x}" y1="${y}" x2="${x + 240}" y2="${y + 300}" spreadMethod="reflect">${metalStops(th)}</linearGradient></defs>
<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#000" stroke-width="${width + 8}" opacity=".9"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="url(#${id})" stroke-width="${width}"/>
<rect x="${x - width / 2 + 1}" y="${y - width / 2 + 1}" width="${w + width - 2}" height="${h + width - 2}" fill="none" stroke="#fff" stroke-width="1.2" opacity=".55"/>
<rect x="${x + width / 2 + 1}" y="${y + width / 2 + 1}" width="${w - width - 2}" height="${h - width - 2}" fill="none" stroke="#000" stroke-width="2" opacity=".6"/>`;
    if (flares) o += lensFlare({ x: x + w, y: y + h * .38, s: .55, color: th.glow }) + lensFlare({ x: x, y: y + h * .72, s: .45, color: th.glow }) + lensFlare({ x: x + w * .62, y: y, s: .5, color: th.glow });
    return o;
  }

  /* ---------- Efectos de luz ---------- */
  function lensFlare({ x = 0, y = 0, s = 1, color = '#fff', streak = true } = {}) {
    const g = uid('lf'), b = uid('lb');
    return `<g transform="translate(${f(x)} ${f(y)}) scale(${s})"><defs><radialGradient id="${g}"><stop offset="0" stop-color="#fff"/><stop offset=".12" stop-color="${color}" stop-opacity=".9"/><stop offset=".45" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient><filter id="${b}" x="-50%" y="-800%" width="200%" height="1700%"><feGaussianBlur stdDeviation="7 1.6"/></filter></defs>
<circle r="70" fill="url(#${g})"/>${streak ? `<rect x="-240" y="-3.5" width="480" height="7" rx="3.5" fill="${color}" filter="url(#${b})"/><rect x="-110" y="-1.4" width="220" height="2.8" rx="1.4" fill="#fff"/><rect x="-1.4" y="-56" width="2.8" height="112" rx="1.4" fill="#fff" opacity=".8"/>` : ''}<circle r="7" fill="#fff"/></g>`;
  }
  function glow({ x = 0, y = 0, r = 300, color = '#fff', opacity = .4 } = {}) {
    const g = uid('gw');
    return `<defs><radialGradient id="${g}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset=".55" stop-color="${color}" stop-opacity="${opacity * .3}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="url(#${g})"/>`;
  }
  function bokeh({ x = 0, y = 0, w = 400, h = 300, n = 14, color = '#fff', seed = 9, rMin = 6, rMax = 34, opacity = .5 } = {}) {
    const R = rng(seed), b = uid('bk'); let o = '';
    for (let i = 0; i < n; i++) { const r = rMin + (rMax - rMin) * Math.pow(R(), 1.6); o += `<circle cx="${f(R() * w)}" cy="${f(R() * h)}" r="${f(r)}" opacity="${f((.25 + R() * .75) * opacity * 100) / 100}"/>`; }
    return `<g transform="translate(${f(x)} ${f(y)})"><defs><filter id="${b}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter></defs><g fill="${color}" filter="url(#${b})">${o}</g></g>`;
  }
  function speedLines({ x = 0, y = 0, w = 420, h = 160, n = 12, color = '#fff', angle = 0, seed = 5, opacity = .7 } = {}) {
    const R = rng(seed), b = uid('sl'); let o = '';
    for (let i = 0; i < n; i++) { const len = w * (.3 + R() * .7), t = 1.5 + R() * 4; o += `<rect x="${f(w - len)}" y="${f(R() * h)}" width="${f(len)}" height="${f(t)}" rx="${f(t / 2)}" opacity="${f(.3 + R() * .7)}"/>`; }
    return `<g transform="translate(${f(x)} ${f(y)}) rotate(${angle})" opacity="${opacity}"><defs><filter id="${b}" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="10 .8"/></filter></defs><g fill="${color}" filter="url(#${b})">${o}</g></g>`;
  }
  function vignette({ x = 0, y = 0, w = 800, h = 1000, strength = .6, color = '#000' } = {}) {
    const g = uid('vg'), e = uid('ve');
    return `<defs><radialGradient id="${g}" cx=".5" cy=".45" r=".72"><stop offset=".55" stop-color="${color}" stop-opacity="0"/><stop offset="1" stop-color="${color}" stop-opacity="${strength}"/></radialGradient><filter id="${e}" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="14"/></filter></defs>
<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${g})"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="40" opacity="${strength * .7}" filter="url(#${e})"/>`;
  }
  function rays({ r = 520, n = 18, color = '#fff', opacity = .22, seed = 2 } = {}) {
    const R = rng(seed), g = uid('ry'), m = uid('rm'); let o = '';
    for (let i = 0; i < n; i++) { const a = 360 * i / n + R() * 6, wdt = 3 + R() * 5, p1 = [r * Math.cos(rad(a - wdt)), r * Math.sin(rad(a - wdt))], p2 = [r * Math.cos(rad(a + wdt)), r * Math.sin(rad(a + wdt))]; o += `<path d="M0 0L${f(p1[0])} ${f(p1[1])}L${f(p2[0])} ${f(p2[1])}Z"/>`; }
    return `<defs><radialGradient id="${g}"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="${m}"><circle r="${r}" fill="url(#${g})"/></mask></defs><g mask="url(#${m})" fill="${color}" opacity="${opacity}">${o}</g>`;
  }
  function confetti({ x = 0, y = 0, w = 600, h = 400, n = 40, colors = [RED, WHITE, '#f8d56e'], seed = 11, blur = true } = {}) {
    const R = rng(seed), b = uid('cf'); let a = '', bl = '';
    for (let i = 0; i < n; i++) { const cw = 6 + R() * 12, ch = cw * (.35 + R() * .3), r = `<rect x="${f(-cw / 2)}" y="${f(-ch / 2)}" width="${f(cw)}" height="${f(ch)}" fill="${colors[Math.floor(R() * colors.length)]}" transform="translate(${f(R() * w)} ${f(R() * h)}) rotate(${f(R() * 360)})"/>`; if (blur && R() < .35) bl += r; else a += r; }
    return `<g transform="translate(${f(x)} ${f(y)})"><defs><filter id="${b}"><feGaussianBlur stdDeviation="2.5"/></filter></defs><g filter="url(#${b})" opacity=".8">${bl}</g>${a}</g>`;
  }

  /* ---------- Piezas gráficas extra ---------- */
  function ribbon({ text = 'CAMPEONES', w = 520, h = 84, theme = null, fill = RED, font = FONT } = {}) {
    const th = theme ? T(theme) : null, id = uid('rb');
    const face = th ? `url(#${id})` : fill, back = th ? th.dark : '#7a0508', ink = th ? th.dark : '#fff';
    const hw = w / 2, tw = 70;
    return `<defs>${th ? linGrad(id, th) : ''}</defs>
<path d="M${-hw - tw} 18L${-hw + 10} 18L${-hw + 10} ${h + 18}L${-hw - tw} ${h + 18}L${-hw - tw + 28} ${h / 2 + 18}Z" fill="${back}" stroke="#000" stroke-width="3"/>
<path d="M${hw + tw} 18L${hw - 10} 18L${hw - 10} ${h + 18}L${hw + tw} ${h + 18}L${hw + tw - 28} ${h / 2 + 18}Z" fill="${back}" stroke="#000" stroke-width="3"/>
<path d="M${-hw} ${h}L${-hw + 10} ${h + 18}L${-hw + 10} ${h}Z M${hw} ${h}L${hw - 10} ${h + 18}L${hw - 10} ${h}Z" fill="#000"/>
<rect x="${-hw}" y="0" width="${w}" height="${h}" fill="${face}" stroke="#000" stroke-width="4"/>
<rect x="${-hw + 6}" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="${th ? th.edge : '#fff'}" stroke-width="1.5" opacity=".6"/>
<text x="0" y="${h * .73}" text-anchor="middle" font-family="${font}" font-size="${h * .6}" letter-spacing="3" fill="${ink}">${esc(text)}</text>`;
  }
  function medal({ place = 1, theme, r = 110, font = FONT } = {}) {
    const P = PLACES[place] || PLACES[1], th = T(theme || P.theme), g = uid('md'), g2 = uid('md');
    return `<defs>${linGrad(g, th, { x1: 0, y1: 0, x2: 1, y2: 1 })}${linGrad(g2, th, { x1: 1, y1: 0, x2: 0, y2: 1 })}</defs>
<path d="M${-r * .75} ${-r * 2.1}L${-r * .25} ${-r * 2.1}L${r * .25} ${-r * .6}L${-r * .25} ${-r * .6}Z" fill="${RED}" stroke="#000" stroke-width="3"/>
<path d="M${r * .75} ${-r * 2.1}L${r * .25} ${-r * 2.1}L${-r * .25} ${-r * .6}L${r * .25} ${-r * .6}Z" fill="#b00f15" stroke="#000" stroke-width="3"/>
<path d="M${-r * .5} ${-r * 2.1}L${0} ${-r * .6}" stroke="#fff" stroke-width="${r * .06}"/>
<circle r="${r + 6}" fill="#000"/><circle r="${r}" fill="url(#${g})"/><circle r="${r * .78}" fill="url(#${g2})" stroke="${th.dark}" stroke-width="3"/>
<g transform="skewX(-8)">${chromeText([{ t: P.num, x: 0, y: r * .45, size: r * 1.25, anchor: 'middle' }], th, { font, sheen: false })}</g>
${sparkle({ x: -r * .55, y: -r * .55, s: .4 })}`;
  }
  function nameplate({ names = ['JUGADOR 1', 'JUGADOR 2'], w = 640, h = 70, theme = 'silver', font = FONT } = {}) {
    const th = T(theme), id = uid('np'), hw = w / 2;
    const parts = names.filter(Boolean);
    const label = parts.map((n, i) => (i ? `<tspan fill="${RED}"> &amp; </tspan>` : '') + `<tspan>${esc(n)}</tspan>`).join('');
    return `<defs>${linGrad(id, th, { x1: 0, y1: 0, x2: 1, y2: 0 })}</defs><g transform="skewX(-14)">
<rect x="${-hw}" y="0" width="${w}" height="${h}" fill="#0b0b0b" opacity=".92"/>
<rect x="${-hw}" y="0" width="${w}" height="4" fill="url(#${id})"/><rect x="${-hw}" y="${h - 4}" width="${w}" height="4" fill="url(#${id})"/>
<rect x="${-hw - 18}" y="0" width="10" height="${h}" fill="${RED}"/><rect x="${hw + 8}" y="0" width="10" height="${h}" fill="${RED}"/>
<text x="0" y="${h * .72}" text-anchor="middle" font-family="${font}" font-size="${h * .58}" letter-spacing="2" fill="#fff">${label}</text></g>`;
  }
  function tag({ text = '10 · 10 · 26', w = 250, h = 52, fill = RED, color = '#fff', font = FONT } = {}) {
    return `<g transform="skewX(-14)"><rect x="${-w / 2}" y="0" width="${w}" height="${h}" fill="${fill}" stroke="#000" stroke-width="3"/><text x="0" y="${h * .72}" text-anchor="middle" font-family="${font}" font-size="${h * .56}" letter-spacing="4" fill="${color}">${esc(text)}</text></g>`;
  }
  function corners({ x = 0, y = 0, w = 400, h = 300, len = 60, width = 6, color = WHITE } = {}) {
    const p = `M${x} ${y + len}V${y}H${x + len}M${x + w - len} ${y}H${x + w}V${y + len}M${x + w} ${y + h - len}V${y + h}H${x + w - len}M${x + len} ${y + h}H${x}V${y + h - len}`;
    return `<path d="${p}" fill="none" stroke="#000" stroke-width="${width + 4}" stroke-linecap="square"/><path d="${p}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="square"/>`;
  }

  window.FrameKit = { RED, BLACK, WHITE, THEMES, PLACES, FONT, T, grunge, strokes, halftone, photo, metalLine, redBorder, racket, ball, net, laurel, crown, sparkle, chromeText, placeText, placeBadge, titleBlock, metalFrame, lensFlare, glow, bokeh, speedLines, vignette, rays, confetti, ribbon, medal, nameplate, tag, corners };
})();
