// Procedural Mix & Match Pádel frames.
// Everything is drawn in vector at whatever size is requested, so exports stay sharp
// at any resolution and every frame works in vertical, square and horizontal.

export const ASPECTS = {
  vertical:   { label: 'Vertical',   w: 2160, h: 2700 }, // 4:5
  square:     { label: 'Cuadrado',   w: 2160, h: 2160 }, // 1:1
  horizontal: { label: 'Horizontal', w: 2880, h: 2160 }, // 4:3
};

const RED = '#e10f1a';
const FONT = '"Anton", Impact, "Arial Narrow Bold", sans-serif';

const METALS = {
  gold:   ['#fff7d1', '#ffd75e', '#c08a1e', '#fff0a8', '#8a5a10'],
  silver: ['#ffffff', '#e3e6ea', '#8c929b', '#f7f8fa', '#4f555d'],
  bronze: ['#ffe6cf', '#f0a76b', '#a0562a', '#ffc9a0', '#5e2c10'],
  steel:  ['#f2f2f2', '#a9aeb5', '#50555c', '#d5d8dc', '#25282c'],
  red:    ['#ff8a8f', '#ff2a33', '#a1060d', '#ff5a61', '#5c0005'],
};

export const FRAMES = [
  { id: 'mixmatch', name: 'Mix & Match', metal: 'red',    place: null },
  { id: 'p1',       name: '1er Lugar',   metal: 'gold',   place: { num: '1', sup: 'ER', word: 'LUGAR' } },
  { id: 'p2',       name: '2do Lugar',   metal: 'silver', place: { num: '2', sup: 'DO', word: 'LUGAR' } },
  { id: 'p3',       name: '3er Lugar',   metal: 'bronze', place: { num: '3', sup: 'ER', word: 'LUGAR' } },
  { id: 'p4',       name: '4to Lugar',   metal: 'steel',  place: { num: '4', sup: 'TO', word: 'LUGAR' } },
];

/** Window (transparent hole) where the photo shows, in canvas px. */
export function layout(W, H, frame) {
  const s = Math.min(W, H) / 1080;
  const side = 75 * s;
  const top = 150 * s;
  const bottom = (frame.place ? 250 : 120) * s;
  const win = { x: side, y: top, w: W - side * 2, h: H - top - bottom };
  win.cx = win.x + win.w / 2;
  win.cy = win.y + win.h / 2;
  return { s, win };
}

export async function loadFonts() {
  try {
    await Promise.all([
      document.fonts.load(`100px "Anton"`),
      document.fonts.load(`100px "Anton"`, 'ÁÉ&'),
    ]);
  } catch { /* fall back to Impact */ }
}

/** Renders the frame (transparent window) to a new canvas of W×H. */
export function renderFrame(frame, W, H) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const { s, win } = layout(W, H, frame);
  const rng = mulberry32(hash(`${frame.id}:${(W / H).toFixed(3)}`));
  const metal = METALS[frame.metal];

  // ---- Grunge background, clipped to everything outside the window ----
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.rect(win.x, win.y, win.w, win.h);
  ctx.clip('evenodd');

  ctx.fillStyle = '#060606';
  ctx.fillRect(0, 0, W, H);

  // White paint sweeps: behind the Art Padel logo and along the bottom corners.
  const artTop = !!frame.place;
  if (artTop) {
    blob(ctx, rng, W - 230 * s, 105 * s, 330 * s, 150 * s, '#fff');
    sweep(ctx, rng, W * 0.55, -40 * s, W + 60 * s, 260 * s, 26, 70 * s, '#fff', s);
  } else {
    blob(ctx, rng, W - 240 * s, H - 95 * s, 330 * s, 140 * s, '#fff');
    sweep(ctx, rng, W * 0.6, H + 40 * s, W + 60 * s, H - 280 * s, 26, 70 * s, '#fff', s);
  }
  sweep(ctx, rng, -60 * s, H - 120 * s, W * 0.35, H + 60 * s, 14, 55 * s, '#fff', s);
  sweep(ctx, rng, -60 * s, H * 0.55, 140 * s, H * 0.35, 10, 45 * s, '#fff', s);

  // Red diagonal brush strokes everywhere (only the margins survive the clip).
  const strokes = 70;
  for (let i = 0; i < strokes; i++) {
    const x = rng() * W * 1.2 - W * 0.1;
    const y = rng() * H * 1.2 - H * 0.1;
    const len = (160 + rng() * 520) * s;
    const ang = -0.45 + (rng() - 0.5) * 0.35;
    const w = (12 + rng() * 70) * s;
    const color = rng() < 0.72 ? RED : rng() < 0.6 ? '#000' : '#fff';
    brush(ctx, rng, x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, w, color, s);
  }

  // Metal accent strokes for podium frames.
  if (frame.place) {
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

  // Halftone dot patches.
  halftone(ctx, 0, 230 * s, 75 * s, 420 * s, 16 * s, 6 * s, RED, 'right');
  halftone(ctx, W - 75 * s, H * 0.3, 75 * s, 380 * s, 16 * s, 6 * s, '#fff', 'left');
  halftone(ctx, W * 0.42, 0, 360 * s, 150 * s, 18 * s, 6.5 * s, RED, 'down');
  halftone(ctx, W * 0.22, H - 120 * s, 260 * s, 120 * s, 18 * s, 6.5 * s, frame.place ? metal[1] : '#fff', 'up');

  ctx.restore(); // end clip

  // Clean white backdrop for the Art Padel logo, painted over the strokes.
  if (artTop) {
    blob(ctx, rng, W - 215 * s, 100 * s, 230 * s, 105 * s, '#fff');
    for (let i = 0; i < 8; i++) {
      const y = (20 + rng() * 170) * s;
      brush(ctx, rng, W - (380 + rng() * 120) * s, y + 60 * s, W - 150 * s, y - 20 * s, (10 + rng() * 22) * s, '#fff', s);
    }
  } else {
    blob(ctx, rng, W - 215 * s, H - 85 * s, 230 * s, 100 * s, '#fff');
    for (let i = 0; i < 8; i++) {
      const y = H - (10 + rng() * 170) * s;
      brush(ctx, rng, W - (380 + rng() * 120) * s, y + 60 * s, W - 150 * s, y - 20 * s, (10 + rng() * 22) * s, '#fff', s);
    }
  }

  // ---- Window border ----
  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 7 * s;
  ctx.strokeRect(win.x - 3.5 * s, win.y - 3.5 * s, win.w + 7 * s, win.h + 7 * s);
  ctx.strokeStyle = frame.place ? metalGradient(ctx, win.y, win.y + win.h, metal) : RED;
  ctx.lineWidth = 5 * s;
  ctx.strokeRect(win.x - 12 * s, win.y - 12 * s, win.w + 24 * s, win.h + 24 * s);
  ctx.restore();

  // A few rough strokes biting into the window corners, like painted edges.
  ctx.save();
  ctx.beginPath();
  ctx.rect(win.x - 20 * s, win.y - 20 * s, win.w + 40 * s, win.h + 40 * s);
  ctx.clip();
  brush(ctx, rng, win.x - 60 * s, win.y + win.h - 10 * s, win.x + 220 * s, win.y + win.h - 120 * s, 22 * s, RED, s);
  brush(ctx, rng, win.x + win.w - 240 * s, win.y + win.h + 30 * s, win.x + win.w + 40 * s, win.y + win.h - 90 * s, 26 * s, '#000', s);
  brush(ctx, rng, win.x + win.w - 160 * s, win.y + 40 * s, win.x + win.w + 40 * s, win.y - 30 * s, 16 * s, RED, s);
  ctx.restore();

  // ---- Decorations ----
  if (frame.place) {
    ball(ctx, W + 10 * s, H * 0.3, 95 * s, metal, s);
    ball(ctx, -10 * s, H * 0.8, 110 * s, metal, s);
  } else {
    ball(ctx, 120 * s, H - 110 * s, 105 * s, METALS.red, s);
  }

  // ---- Logos ----
  mixMatchLogo(ctx, 190 * s, 170 * s, 128 * s, s);
  if (artTop) artPadelLogo(ctx, W - 70 * s, 70 * s, s);
  else artPadelLogo(ctx, W - 70 * s, H - 175 * s, s);

  if (frame.place) placeBadge(ctx, W / 2, H - 150 * s, frame.place, metal, frame.metal, s);

  // Punch the window last so nothing covers the photo except the edge strokes.
  return canvas;
}

// ------------------------------------------------------------------ pieces

function mixMatchLogo(ctx, cx, cy, r, s) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 24 * s;
  circle(ctx, cx, cy, r, '#fff');
  ctx.shadowColor = 'transparent';
  circle(ctx, cx, cy, r - 7 * s, RED);
  circle(ctx, cx, cy, r - 16 * s, '#0b0b0b');

  // Court net lines in the lower half.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 16 * s, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 2 * s;
  for (let x = cx - r; x < cx + r; x += 14 * s) {
    ctx.beginPath(); ctx.moveTo(x, cy - 5 * s); ctx.lineTo(x, cy + r); ctx.stroke();
  }
  for (let y = cy - 5 * s; y < cy + r; y += 14 * s) {
    ctx.beginPath(); ctx.moveTo(cx - r, y); ctx.lineTo(cx + r, y); ctx.stroke();
  }
  ctx.restore();

  // Crossed rackets + ball.
  racket(ctx, cx - 38 * s, cy - 40 * s, 40 * s, -0.5, '#fff', RED, s);
  racket(ctx, cx + 38 * s, cy - 40 * s, 40 * s, 0.5, '#fff', RED, s);
  circle(ctx, cx, cy - 92 * s, 15 * s, RED);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3 * s;
  ctx.beginPath(); ctx.arc(cx - 10 * s, cy - 92 * s, 12 * s, -1, 1); ctx.stroke();

  // Spiky burst behind the wordmark.
  ctx.save();
  ctx.beginPath();
  const bw = r * 1.45, bh = r * 0.62, by = cy + 52 * s;
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
  ctx.fillStyle = '#0b0b0b';
  ctx.fill();
  ctx.lineWidth = 5 * s;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.restore();

  skewed(ctx, cx, cy + 40 * s, -0.22, () => {
    outlinedText(ctx, 'MIX&', cx + 4 * s, cy + 40 * s, 92 * s, '#fff', [['#000', 16 * s], [RED, 7 * s]]);
    outlinedText(ctx, 'MATCH', cx, cy + 118 * s, 92 * s, RED, [['#000', 18 * s], ['#fff', 9 * s]]);
  });

  // PÁDEL ribbon.
  ctx.fillStyle = '#0b0b0b';
  roundRect(ctx, cx - 62 * s, cy + 128 * s, 124 * s, 34 * s, 17 * s);
  ctx.fill();
  ctx.strokeStyle = RED;
  ctx.lineWidth = 3 * s;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `${26 * s}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('P Á D E L', cx, cy + 146 * s);
  ctx.restore();
}

function artPadelLogo(ctx, right, top, s) {
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const black = '#0a0a0a';

  // Player silhouette: racket + ball above the text.
  racket(ctx, right - 30 * s, top + 20 * s, 34 * s, 0.6, black, black, s);
  circle(ctx, right - 90 * s, top + 4 * s, 9 * s, RED);

  ctx.fillStyle = black;
  ctx.font = `${62 * s}px ${FONT}`;
  ctx.fillText('ART', right - 130 * s, top + 62 * s);

  // "PADEL" with a red A.
  ctx.font = `${84 * s}px ${FONT}`;
  const parts = [['P', black], ['A', RED], ['DEL', black]];
  const widths = parts.map(([t]) => ctx.measureText(t).width);
  let x = right - widths.reduce((a, b) => a + b, 0);
  ctx.textAlign = 'left';
  parts.forEach(([t, c], i) => {
    ctx.fillStyle = c;
    ctx.fillText(t, x, top + 146 * s);
    x += widths[i];
  });

  ctx.fillStyle = black;
  ctx.font = `${30 * s}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('C  L  U  B', right - 40 * s, top + 186 * s);
  ctx.restore();
}

function placeBadge(ctx, cx, cy, place, metal, metalName, s) {
  ctx.save();

  // Laurels.
  laurel(ctx, cx, cy + 10 * s, 330 * s, metal, s, -1);
  laurel(ctx, cx, cy + 10 * s, 330 * s, metal, s, 1);

  const numSize = 300 * s;
  const supSize = 108 * s;
  const wordSize = 150 * s;
  ctx.font = `${numSize}px ${FONT}`;
  const numW = ctx.measureText(place.num).width;
  ctx.font = `${wordSize}px ${FONT}`;
  const wordW = ctx.measureText(place.word).width;
  ctx.font = `${supSize}px ${FONT}`;
  const supW = ctx.measureText(place.sup).width;

  const gap = 6 * s;
  const total = numW + gap + Math.max(wordW, supW);
  const x0 = cx - total / 2;
  const base = cy + 120 * s;
  const wordMetal = metalName === 'gold' ? METALS.silver : metal;

  // Crown above the superscript.
  crown(ctx, x0 + numW + gap + supW / 2 + 70 * s, base - 270 * s, 46 * s, metal, s);

  skewed(ctx, cx, base, -0.18, () => {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    metalText(ctx, place.num, x0, base, numSize, metal, s);
    metalText(ctx, place.sup, x0 + numW + gap, base - 150 * s, supSize, metal, s);
    metalText(ctx, place.word, x0 + numW + gap, base, wordSize, wordMetal, s);
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
    const a = Math.PI / 2 + dir * (0.45 + t * 1.25); // sweep from bottom up the side
    const x = cx + Math.cos(a) * R * 0.95 * (dir < 0 ? 1 : 1);
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
  for (const [dx, dy] of [[-1, -0.25], [0, -0.55], [1, -0.25]]) {
    circle(ctx, cx + dx * w, cy + dy * w - 8 * s, 8 * s, metal[0]);
  }
  ctx.restore();
}

function ball(ctx, cx, cy, r, metal, s) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.6)';
  ctx.shadowBlur = 30 * s;
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, metal[0]);
  g.addColorStop(0.45, metal[1]);
  g.addColorStop(1, metal[4]);
  circle(ctx, cx, cy, r, g);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,.75)';
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
  // Holes.
  ctx.fillStyle = stroke;
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

  // Dry-brush bristles trailing past the end.
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
  // Splatter.
  const dots = Math.floor(rng() * 5);
  for (let i = 0; i < dots; i++) {
    const t = 1 + rng() * 0.25;
    circle(ctx, x1 + dx * t + nx * (rng() - 0.5) * w * 2, y1 + dy * t + ny * (rng() - 0.5) * w * 2, (1 + rng() * 4) * s, color);
  }
}

/** Dense bundle of parallel strokes between two points. */
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
