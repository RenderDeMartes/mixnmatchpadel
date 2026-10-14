// Mix & Match Pádel frames.
//
// Two kinds of frame:
//  - "design": drawn procedurally from a definition (colors, texts, optional logo images).
//    Vector, so it stays sharp at any size and adapts to vertical / square / horizontal.
//  - "png": an uploaded PNG with a transparent window; fixed size and aspect.

export const ASPECTS = {
  vertical:   { label: 'Vertical',   w: 2160, h: 2700 }, // 4:5
  square:     { label: 'Cuadrado',   w: 2160, h: 2160 }, // 1:1
  horizontal: { label: 'Horizontal', w: 2880, h: 2160 }, // 4:3
};

const FONT = '"Anton", Impact, "Arial Narrow Bold", sans-serif';
const INK = '#0a0a0a';

export const METALS = {
  gold:   { label: 'Oro',    stops: ['#fff7d1', '#ffd75e', '#c08a1e', '#fff0a8', '#8a5a10'] },
  silver: { label: 'Plata',  stops: ['#ffffff', '#e3e6ea', '#8c929b', '#f7f8fa', '#4f555d'] },
  bronze: { label: 'Bronce', stops: ['#ffe6cf', '#f0a76b', '#a0562a', '#ffc9a0', '#5e2c10'] },
  steel:  { label: 'Acero',  stops: ['#f2f2f2', '#a9aeb5', '#50555c', '#d5d8dc', '#25282c'] },
};

/** Everything a design frame can customize, with the Mix & Match defaults. */
export const DEFAULT_DEF = {
  layout: 'classic',            // 'classic' | 'podium' (podium adds the bottom place badge)
  colors: {
    primary: '#e10f1a',         // brush strokes, MATCH text, accents
    bg: '#060606',              // frame background
    accent: '#ffffff',          // light paint sweeps, outlines, backdrop behind corner logo
    metal: 'red',               // 'gold' | 'silver' | 'bronze' | 'steel' | '#hex' | 'red' (= primary)
  },
  badge: { type: 'text', line1: 'MIX&', line2: 'MATCH', line3: 'PÁDEL' },     // top-left logo
  corner: { type: 'text', line1: 'ART', line2: 'P[A]DEL', line3: 'CLUB' },    // second logo; [x] = primary color
  place: { num: '1', sup: 'ER', word: 'LUGAR' },
  balls: true,
};

const podium = (num, sup, metal) => ({
  layout: 'podium',
  colors: { ...DEFAULT_DEF.colors, metal },
  place: { num, sup, word: 'LUGAR' },
});

export const PRESETS = [
  { id: 'mixmatch', name: 'Mix & Match', def: {} },
  { id: 'p1', name: '1er Lugar', def: podium('1', 'ER', 'gold') },
  { id: 'p2', name: '2do Lugar', def: podium('2', 'DO', 'silver') },
  { id: 'p3', name: '3er Lugar', def: podium('3', 'ER', 'bronze') },
  { id: 'p4', name: '4to Lugar', def: podium('4', 'TO', 'steel') },
].map((p) => ({ ...p, kind: 'design', source: 'preset', def: normalizeDef(p.def), images: {} }));

/** Fills in defaults and drops anything unknown. Also used to sanitize server/local data. */
export function normalizeDef(d = {}) {
  const str = (v, fallback, max = 24) => (typeof v === 'string' ? v.slice(0, max) : fallback);
  const hex = (v, fallback) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);
  const c = d.colors || {};
  const b = d.badge || {};
  const k = d.corner || {};
  const p = d.place || {};
  const D = DEFAULT_DEF;
  const metal = typeof c.metal === 'string' && (METALS[c.metal] || c.metal === 'red' || /^#[0-9a-f]{6}$/i.test(c.metal)) ? c.metal : D.colors.metal;
  const logoType = (t, fallback) => (['text', 'image', 'none'].includes(t) ? t : fallback);
  return {
    layout: d.layout === 'podium' ? 'podium' : 'classic',
    colors: {
      primary: hex(c.primary, D.colors.primary),
      bg: hex(c.bg, D.colors.bg),
      accent: hex(c.accent, D.colors.accent),
      metal,
    },
    badge: {
      type: logoType(b.type, D.badge.type),
      line1: str(b.line1, D.badge.line1),
      line2: str(b.line2, D.badge.line2),
      line3: str(b.line3, D.badge.line3),
    },
    corner: {
      type: logoType(k.type, D.corner.type),
      line1: str(k.line1, D.corner.line1),
      line2: str(k.line2, D.corner.line2),
      line3: str(k.line3, D.corner.line3),
    },
    place: {
      num: str(p.num, D.place.num, 4),
      sup: str(p.sup, D.place.sup, 6),
      word: str(p.word, D.place.word, 16),
    },
    balls: d.balls !== false,
    seed: typeof d.seed === 'string' && /^[a-z0-9-]{1,32}$/i.test(d.seed) ? d.seed : undefined,
  };
}

export function metalStops(def) {
  const m = def.colors.metal;
  if (METALS[m]) return METALS[m].stops;
  const base = m === 'red' ? def.colors.primary : m;
  return [mix(base, '#ffffff', 0.8), mix(base, '#ffffff', 0.3), mix(base, '#000000', 0.35), mix(base, '#ffffff', 0.6), mix(base, '#000000', 0.65)];
}

/** Output size for a frame. PNG frames keep their own aspect. */
export function frameSize(frame, aspect) {
  if (frame.kind === 'png') return { w: frame.w, h: frame.h };
  return ASPECTS[aspect];
}

/** Window (where the photo shows), in canvas px. */
export function layout(W, H, frame) {
  if (frame.kind === 'png') {
    const f = frame.win;
    const win = { x: f.x * W, y: f.y * H, w: f.w * W, h: f.h * H };
    win.cx = win.x + win.w / 2;
    win.cy = win.y + win.h / 2;
    return { s: Math.min(W, H) / 1080, win };
  }
  const s = Math.min(W, H) / 1080;
  const side = 75 * s;
  const top = 150 * s;
  const bottom = (frame.def.layout === 'podium' ? 250 : 120) * s;
  const win = { x: side, y: top, w: W - side * 2, h: H - top - bottom };
  win.cx = win.x + win.w / 2;
  win.cy = win.y + win.h / 2;
  return { s, win };
}

export async function loadFonts() {
  try {
    await Promise.all([document.fonts.load('100px "Anton"'), document.fonts.load('100px "Anton"', 'ÁÉ&')]);
  } catch { /* fall back to Impact */ }
}

/** Renders the frame (with a transparent window) to a new W×H canvas. */
export function renderFrame(frame, W, H) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (frame.kind === 'png') {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame.image, 0, 0, W, H);
    return canvas;
  }
  drawDesign(ctx, W, H, frame.def, frame.images || {}, frame.def.seed || frame.seed || frame.id);
  return canvas;
}

/**
 * Finds the transparent window of a PNG frame: flood-fills transparent pixels from the
 * center (falls back to the bounding box of all transparent pixels). Returns fractions.
 */
export function detectWindow(img) {
  const S = 300;
  const k = S / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const a = ctx.getImageData(0, 0, w, h).data;
  const clear = (x, y) => a[(y * w + x) * 4 + 3] < 128;

  let minX = w, minY = h, maxX = -1, maxY = -1;
  const grow = (x, y) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };

  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  if (clear(cx, cy)) {
    const seen = new Uint8Array(w * h);
    const stack = [cy * w + cx];
    seen[cy * w + cx] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i - x) / w;
      grow(x, y);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!seen[j] && clear(nx, ny)) { seen[j] = 1; stack.push(j); }
      }
    }
  } else {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (clear(x, y)) grow(x, y);
  }
  if (maxX < 0) return null; // no transparency at all
  return { x: minX / w, y: minY / h, w: (maxX - minX + 1) / w, h: (maxY - minY + 1) / h };
}

// ------------------------------------------------------------------ design renderer

function drawDesign(ctx, W, H, def, images, seed) {
  const { s, win } = layout(W, H, { kind: 'design', def });
  const rng = mulberry32(hash(`${seed}:${(W / H).toFixed(3)}`));
  const { primary, bg, accent } = def.colors;
  const metal = metalStops(def);
  const podiumLayout = def.layout === 'podium';
  const cornerTop = podiumLayout;
  const hasCorner = def.corner.type !== 'none';

  // ---- Grunge background, clipped to everything outside the window ----
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.rect(win.x, win.y, win.w, win.h);
  ctx.clip('evenodd');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (cornerTop) {
    sweep(ctx, rng, W * 0.55, -40 * s, W + 60 * s, 260 * s, 26, 70 * s, accent, s);
  } else {
    sweep(ctx, rng, W * 0.6, H + 40 * s, W + 60 * s, H - 280 * s, 26, 70 * s, accent, s);
  }
  sweep(ctx, rng, -60 * s, H - 120 * s, W * 0.35, H + 60 * s, 14, 55 * s, accent, s);
  sweep(ctx, rng, -60 * s, H * 0.55, 140 * s, H * 0.35, 10, 45 * s, accent, s);

  for (let i = 0; i < 70; i++) {
    const x = rng() * W * 1.2 - W * 0.1;
    const y = rng() * H * 1.2 - H * 0.1;
    const len = (160 + rng() * 520) * s;
    const ang = -0.45 + (rng() - 0.5) * 0.35;
    const w = (12 + rng() * 70) * s;
    const color = rng() < 0.72 ? primary : rng() < 0.6 ? '#000' : accent;
    brush(ctx, rng, x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, w, color, s);
  }

  if (podiumLayout) {
    for (let i = 0; i < 10; i++) {
      const left = rng() < 0.5;
      const x = left ? rng() * 140 * s : W - rng() * 140 * s;
      const y = H * (0.3 + rng() * 0.6);
      const len = (120 + rng() * 260) * s;
      const ang = -0.45 + (rng() - 0.5) * 0.3;
      ctx.save();
      ctx.globalAlpha = 0.85;
      brush(ctx, rng, x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, (4 + rng() * 10) * s, metal[1], s);
      ctx.restore();
    }
  }

  halftone(ctx, 0, 230 * s, 75 * s, 420 * s, 16 * s, 6 * s, primary, 'right');
  halftone(ctx, W - 75 * s, H * 0.3, 75 * s, 380 * s, 16 * s, 6 * s, accent, 'left');
  halftone(ctx, W * 0.42, 0, 360 * s, 150 * s, 18 * s, 6.5 * s, primary, 'down');
  halftone(ctx, W * 0.22, H - 120 * s, 260 * s, 120 * s, 18 * s, 6.5 * s, podiumLayout ? metal[1] : accent, 'up');

  ctx.restore();

  // Clean backdrop for the corner logo, painted over the strokes.
  if (hasCorner) {
    const by = cornerTop ? 100 * s : H - 85 * s;
    blob(ctx, rng, W - 215 * s, by, 230 * s, cornerTop ? 105 * s : 100 * s, accent);
    for (let i = 0; i < 8; i++) {
      const y = cornerTop ? (20 + rng() * 170) * s : H - (10 + rng() * 170) * s;
      brush(ctx, rng, W - (380 + rng() * 120) * s, y + 60 * s, W - 150 * s, y - 20 * s, (10 + rng() * 22) * s, accent, s);
    }
  }

  // ---- Window border ----
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 7 * s;
  ctx.strokeRect(win.x - 3.5 * s, win.y - 3.5 * s, win.w + 7 * s, win.h + 7 * s);
  ctx.strokeStyle = podiumLayout ? metalGradient(ctx, win.y, win.y + win.h, metal) : primary;
  ctx.lineWidth = 5 * s;
  ctx.strokeRect(win.x - 12 * s, win.y - 12 * s, win.w + 24 * s, win.h + 24 * s);
  ctx.restore();

  // Rough strokes biting into the window corners.
  ctx.save();
  ctx.beginPath();
  ctx.rect(win.x - 20 * s, win.y - 20 * s, win.w + 40 * s, win.h + 40 * s);
  ctx.clip();
  brush(ctx, rng, win.x - 60 * s, win.y + win.h - 10 * s, win.x + 220 * s, win.y + win.h - 120 * s, 22 * s, primary, s);
  brush(ctx, rng, win.x + win.w - 240 * s, win.y + win.h + 30 * s, win.x + win.w + 40 * s, win.y + win.h - 90 * s, 26 * s, '#000', s);
  brush(ctx, rng, win.x + win.w - 160 * s, win.y + 40 * s, win.x + win.w + 40 * s, win.y - 30 * s, 16 * s, primary, s);
  ctx.restore();

  // ---- Decorations ----
  if (def.balls) {
    if (podiumLayout) {
      ball(ctx, W + 10 * s, H * 0.3, 95 * s, metal, accent, s);
      ball(ctx, -10 * s, H * 0.8, 110 * s, metal, accent, s);
    } else {
      ball(ctx, 120 * s, H - 110 * s, 105 * s, metalStops({ colors: { metal: 'red', primary } }), accent, s);
    }
  }

  // ---- Logos ----
  if (def.badge.type === 'text') textBadge(ctx, 190 * s, 170 * s, 128 * s, def, s);
  else if (def.badge.type === 'image' && images.badge) imageLogo(ctx, images.badge, 30 * s, 25 * s, 330 * s, 300 * s, 'left', s);

  if (def.corner.type === 'text') {
    cornerText(ctx, W - 70 * s, cornerTop ? 70 * s : H - 175 * s, def, s);
  } else if (def.corner.type === 'image' && images.corner) {
    const y = cornerTop ? 20 * s : H - 210 * s;
    imageLogo(ctx, images.corner, W - 420 * s, y, 380 * s, 190 * s, 'right', s);
  }

  if (podiumLayout) placeBadge(ctx, W / 2, H - 150 * s, W, def.place, metal, def.colors.metal === 'gold' ? METALS.silver.stops : metal, s);
}

// ------------------------------------------------------------------ logos

function textBadge(ctx, cx, cy, r, def, s) {
  const { primary, accent } = def.colors;
  const { line1, line2, line3 } = def.badge;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 24 * s;
  circle(ctx, cx, cy, r, accent);
  ctx.shadowColor = 'transparent';
  circle(ctx, cx, cy, r - 7 * s, primary);
  circle(ctx, cx, cy, r - 16 * s, INK);

  // Court net in the lower half.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 16 * s, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = withAlpha(accent, 0.35);
  ctx.lineWidth = 2 * s;
  for (let x = cx - r; x < cx + r; x += 14 * s) { ctx.beginPath(); ctx.moveTo(x, cy - 5 * s); ctx.lineTo(x, cy + r); ctx.stroke(); }
  for (let y = cy - 5 * s; y < cy + r; y += 14 * s) { ctx.beginPath(); ctx.moveTo(cx - r, y); ctx.lineTo(cx + r, y); ctx.stroke(); }
  ctx.restore();

  racket(ctx, cx - 38 * s, cy - 40 * s, 40 * s, -0.5, accent, primary, s);
  racket(ctx, cx + 38 * s, cy - 40 * s, 40 * s, 0.5, accent, primary, s);
  circle(ctx, cx, cy - 92 * s, 15 * s, primary);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3 * s;
  ctx.beginPath(); ctx.arc(cx - 10 * s, cy - 92 * s, 12 * s, -1, 1); ctx.stroke();

  // Spiky burst behind the wordmark.
  const bw = r * 1.45, bh = r * 0.62, by = cy + 52 * s;
  ctx.beginPath();
  ctx.moveTo(cx - bw, by - 10 * s);
  ctx.lineTo(cx - bw * 0.78, by - bh * 0.62);
  ctx.lineTo(cx - bw * 0.7, by - bh * 0.9);
  ctx.lineTo(cx + bw * 0.75, by - bh * 0.95);
  ctx.lineTo(cx + bw * 0.86, by - bh * 0.62);
  ctx.lineTo(cx + bw * 1.02, by - bh * 0.7);
  ctx.lineTo(cx + bw * 0.9, by - 5 * s);
  ctx.lineTo(cx + bw * 1.0, by + bh * 0.25);
  ctx.lineTo(cx + bw * 0.8, by + bh * 0.85);
  ctx.lineTo(cx - bw * 0.75, by + bh * 0.95);
  ctx.lineTo(cx - bw * 0.88, by + bh * 0.5);
  ctx.lineTo(cx - bw * 1.04, by + bh * 0.45);
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.lineWidth = 5 * s;
  ctx.strokeStyle = accent;
  ctx.stroke();

  const maxW = r * 2.6;
  skewed(ctx, cx, cy + 40 * s, -0.22, () => {
    if (line1) outlinedText(ctx, line1, cx + 4 * s, cy + 40 * s, fitSize(ctx, line1, 92 * s, maxW), accent, [['#000', 16 * s], [primary, 7 * s]]);
    if (line2) outlinedText(ctx, line2, cx, cy + 118 * s, fitSize(ctx, line2, 92 * s, maxW), primary, [['#000', 18 * s], [accent, 9 * s]]);
  });

  if (line3) {
    const spaced = [...line3].join(' ');
    const size = fitSize(ctx, spaced, 26 * s, 200 * s);
    ctx.font = `${size}px ${FONT}`;
    const pw = Math.max(124 * s, ctx.measureText(spaced).width + 40 * s);
    ctx.fillStyle = INK;
    roundRect(ctx, cx - pw / 2, cy + 128 * s, pw, 34 * s, 17 * s);
    ctx.fill();
    ctx.strokeStyle = primary;
    ctx.lineWidth = 3 * s;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spaced, cx, cy + 146 * s);
  }
  ctx.restore();
}

function cornerText(ctx, right, top, def, s) {
  const { primary } = def.colors;
  const { line1, line2, line3 } = def.corner;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  racket(ctx, right - 30 * s, top + 20 * s, 34 * s, 0.6, INK, INK, s);
  circle(ctx, right - 90 * s, top + 4 * s, 9 * s, primary);

  if (line1) {
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.font = `${fitSize(ctx, line1, 62 * s, 220 * s)}px ${FONT}`;
    ctx.fillText(line1, right - 130 * s, top + 62 * s);
  }

  if (line2) {
    // [x] marks letters drawn in the primary color.
    const segs = [];
    line2.replace(/\[([^\]]*)\]|([^[]+)/g, (_, hi, lo) => { segs.push(hi !== undefined ? [hi, primary] : [lo, INK]); return ''; });
    const plain = segs.map(([t]) => t).join('');
    const size = fitSize(ctx, plain, 84 * s, 380 * s);
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = 'left';
    let x = right - ctx.measureText(plain).width;
    for (const [t, color] of segs) {
      ctx.fillStyle = color;
      ctx.fillText(t, x, top + 146 * s);
      x += ctx.measureText(t).width;
    }
  }

  if (line3) {
    const spaced = [...line3].join('  ');
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.font = `${fitSize(ctx, spaced, 30 * s, 340 * s)}px ${FONT}`;
    ctx.fillText(spaced, right - 40 * s, top + 186 * s);
  }
  ctx.restore();
}

function imageLogo(ctx, img, x, y, w, h, align, s) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const k = Math.min(w / iw, h / ih);
  const dw = iw * k, dh = ih * k;
  const dx = align === 'right' ? x + w - dw : align === 'left' ? x : x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 18 * s;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function placeBadge(ctx, cx, cy, W, place, metal, wordMetal, s) {
  ctx.save();
  laurel(ctx, cx, cy + 10 * s, 330 * s, metal, s, -1);
  laurel(ctx, cx, cy + 10 * s, 330 * s, metal, s, 1);

  const num = place.num.trim();
  const sup = place.sup.trim();
  const word = place.word.trim();
  const maxW = Math.min(W * 0.8, 820 * s);

  const numSize = 300 * s;
  ctx.font = `${numSize}px ${FONT}`;
  const numW = num ? ctx.measureText(num).width : 0;
  const gap = num ? 6 * s : 0;
  const wordSize = fitSize(ctx, word, 150 * s, maxW - numW - gap);
  const supSize = fitSize(ctx, sup, 108 * s, maxW - numW - gap);
  ctx.font = `${wordSize}px ${FONT}`;
  const wordW = word ? ctx.measureText(word).width : 0;
  ctx.font = `${supSize}px ${FONT}`;
  const supW = sup ? ctx.measureText(sup).width : 0;

  const total = numW + gap + Math.max(wordW, supW);
  const x0 = cx - total / 2;
  const base = cy + 120 * s;
  const right = x0 + numW + gap;

  if (sup || num) crown(ctx, right + supW / 2 + 70 * s, base - 270 * s, 46 * s, metal, s);

  skewed(ctx, cx, base, -0.18, () => {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if (num) metalText(ctx, num, x0, base, numSize, metal, s);
    if (sup) metalText(ctx, sup, right, base - 150 * s, supSize, metal, s);
    if (word) metalText(ctx, word, right, base, wordSize, wordMetal, s);
  });
  ctx.restore();
}

function metalText(ctx, text, x, y, size, metal, s) {
  ctx.save();
  ctx.font = `${size}px ${FONT}`;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,.75)';
  ctx.shadowBlur = 26 * s;
  ctx.shadowOffsetY = 8 * s;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = size * 0.11;
  ctx.strokeText(text, x, y);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = metalGradient(ctx, y - size * 0.85, y, metal);
  ctx.fillText(text, x, y);
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = Math.max(1, size * 0.012);
  ctx.strokeText(text, x, y);
  ctx.restore();
}

function laurel(ctx, cx, cy, R, metal, s, dir) {
  ctx.save();
  const leaves = 9;
  for (let i = 0; i < leaves; i++) {
    const t = i / (leaves - 1);
    const a = Math.PI / 2 + dir * (0.45 + t * 1.25);
    const x = cx + Math.cos(a) * R * 0.95;
    const y = cy + Math.sin(a) * R * 0.55;
    const tangent = a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tangent + side * 0.55 * dir);
      const len = (46 - t * 10) * s;
      ctx.beginPath();
      ctx.ellipse(len * 0.5, 0, len * 0.6, len * 0.22, 0, 0, Math.PI * 2);
      ctx.fillStyle = metalGradient(ctx, -len * 0.3, len * 0.3, metal);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

function crown(ctx, cx, cy, w, metal, s) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - w, cy + w * 0.5);
  ctx.lineTo(cx - w, cy - w * 0.25);
  ctx.lineTo(cx - w * 0.5, cy + w * 0.1);
  ctx.lineTo(cx, cy - w * 0.55);
  ctx.lineTo(cx + w * 0.5, cy + w * 0.1);
  ctx.lineTo(cx + w, cy - w * 0.25);
  ctx.lineTo(cx + w, cy + w * 0.5);
  ctx.closePath();
  ctx.fillStyle = metalGradient(ctx, cy - w * 0.55, cy + w * 0.5, metal);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 4 * s;
  ctx.fill();
  ctx.stroke();
  for (const [dx, dy] of [[-1, -0.25], [0, -0.55], [1, -0.25]]) circle(ctx, cx + dx * w, cy + dy * w - 8 * s, 8 * s, metal[0]);
  ctx.restore();
}

function ball(ctx, cx, cy, r, metal, accent, s) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.6)';
  ctx.shadowBlur = 30 * s;
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, metal[0]);
  g.addColorStop(0.45, metal[1]);
  g.addColorStop(1, metal[4]);
  circle(ctx, cx, cy, r, g);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = withAlpha(accent, 0.75);
  ctx.lineWidth = 6 * s;
  ctx.beginPath(); ctx.arc(cx - r * 1.05, cy, r * 0.75, -0.9, 0.9); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + r * 1.05, cy, r * 0.75, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
  ctx.restore();
}

function racket(ctx, x, y, size, angle, fill, stroke, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.35, size * 0.62, size * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(-size * 0.11, size * 0.35, size * 0.22, size * 0.85);
  for (let i = -1; i <= 1; i++) for (let j = -2; j <= 1; j++) {
    circle(ctx, i * size * 0.25, -size * 0.35 + j * size * 0.24 + size * 0.1, size * 0.055, stroke);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ brushes

function brush(ctx, rng, x1, y1, x2, y2, w, color, s) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const steps = Math.max(10, Math.round(len / Math.max(6 * s, w * 0.4)));
  const top = [], bot = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const profile = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.02)), 0.4);
    const px = x1 + dx * t, py = y1 + dy * t;
    const a = (w / 2) * profile * (0.75 + rng() * 0.5);
    const b = (w / 2) * profile * (0.75 + rng() * 0.5);
    top.push([px + nx * a, py + ny * a]);
    bot.push([px - nx * b, py - ny * b]);
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(top[0][0], top[0][1]);
  for (const [x, y] of top) ctx.lineTo(x, y);
  for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const bristles = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < bristles; i++) {
    const off = (rng() - 0.5) * w * 0.9;
    const start = 0.55 + rng() * 0.3;
    const extra = (0.1 + rng() * 0.35) * len;
    ctx.lineWidth = Math.max(1, w * (0.04 + rng() * 0.08));
    ctx.beginPath();
    ctx.moveTo(x1 + dx * start + nx * off, y1 + dy * start + ny * off);
    ctx.lineTo(x2 + ux * extra + nx * off, y2 + uy * extra + ny * off);
    ctx.stroke();
  }
  const dots = Math.floor(rng() * 5);
  for (let i = 0; i < dots; i++) {
    const t = 1 + rng() * 0.25;
    circle(ctx, x1 + dx * t + nx * (rng() - 0.5) * w * 2, y1 + dy * t + ny * (rng() - 0.5) * w * 2, (1 + rng() * 4) * s, color);
  }
}

function sweep(ctx, rng, x1, y1, x2, y2, count, maxW, color, s) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let i = 0; i < count; i++) {
    const off = (rng() - 0.5) * maxW * 3.2;
    const t0 = rng() * 0.25, t1 = 0.75 + rng() * 0.25;
    brush(ctx, rng,
      x1 + dx * t0 + nx * off, y1 + dy * t0 + ny * off,
      x1 + dx * t1 + nx * off, y1 + dy * t1 + ny * off,
      maxW * (0.3 + rng() * 0.7), color, s);
  }
}

function blob(ctx, rng, cx, cy, rx, ry, color) {
  const n = 48;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.82 + rng() * 0.3 + (rng() < 0.12 ? rng() * 0.45 : 0);
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function halftone(ctx, x, y, w, h, step, maxR, color, fade) {
  ctx.fillStyle = color;
  for (let py = y; py <= y + h; py += step) {
    for (let px = x; px <= x + w; px += step) {
      const t = fade === 'right' ? (px - x) / w
        : fade === 'left' ? 1 - (px - x) / w
        : fade === 'down' ? (py - y) / h
        : 1 - (py - y) / h;
      const r = maxR * (1 - t);
      if (r > 0.6) circle(ctx, px, py, r, color);
    }
  }
}

// ------------------------------------------------------------------ helpers

function fitSize(ctx, text, size, maxW) {
  if (!text) return size;
  ctx.save();
  ctx.font = `${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w > maxW ? size * (maxW / w) : size;
}

function metalGradient(ctx, y0, y1, m) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, m[0]);
  g.addColorStop(0.3, m[1]);
  g.addColorStop(0.55, m[2]);
  g.addColorStop(0.75, m[3]);
  g.addColorStop(1, m[4]);
  return g;
}

function outlinedText(ctx, text, x, y, size, fill, strokes) {
  ctx.save();
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  for (const [color, width] of strokes) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function skewed(ctx, ox, oy, k, draw) {
  ctx.save();
  ctx.translate(ox, oy);
  ctx.transform(1, 0, k, 1, 0, 0);
  ctx.translate(-ox, -oy);
  draw();
  ctx.restore();
}

function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p, sh) => (p >> sh) & 255;
  const m = (sh) => Math.round(ch(pa, sh) + (ch(pb, sh) - ch(pa, sh)) * t);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}

function withAlpha(hex, a) {
  const p = parseInt(hex.slice(1), 16);
  return `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${a})`;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
