// Shared drawing helpers for the editor and the frame creator.
import { layout, renderFrame } from './frames.js';

export const MAX_ZOOM = 6;
const MAX_SOURCE = 4096; // downscale huge photos so mobile canvases don't run out of memory

/** { photo, blur } from an image: photo downscaled to MAX_SOURCE, blur is a tiny copy for the backdrop. */
export function makePhoto(img) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const k = Math.min(1, MAX_SOURCE / Math.max(iw, ih));
  const photo = document.createElement('canvas');
  photo.width = Math.round(iw * k);
  photo.height = Math.round(ih * k);
  const pc = photo.getContext('2d');
  pc.imageSmoothingQuality = 'high';
  pc.drawImage(img, 0, 0, photo.width, photo.height);

  // Downscale-then-upscale gives a cheap blur that works in every browser.
  const blur = document.createElement('canvas');
  const bk = 24 / Math.max(photo.width, photo.height);
  blur.width = Math.max(1, Math.round(photo.width * bk));
  blur.height = Math.max(1, Math.round(photo.height * bk));
  blur.getContext('2d').drawImage(photo, 0, 0, blur.width, blur.height);
  return { photo, blur };
}

/** Stand-in photo for previews before the user picks one. */
let placeholder = null;
export function placeholderPhoto() {
  if (placeholder) return placeholder;
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 1200;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 1200);
  g.addColorStop(0, '#5d6b7c');
  g.addColorStop(0.55, '#9aa6b2');
  g.addColorStop(0.551, '#b3161e');
  g.addColorStop(1, '#7d0d12');
  x.fillStyle = g;
  x.fillRect(0, 0, 1200, 1200);
  x.strokeStyle = 'rgba(255,255,255,.7)';
  x.lineWidth = 8;
  x.beginPath(); x.moveTo(600, 660); x.lineTo(600, 1200); x.stroke();
  x.fillStyle = 'rgba(15,15,20,.55)';
  for (const [cx, sc] of [[430, 1], [770, 1.05]]) {
    x.beginPath(); x.arc(cx, 470 * sc - 40, 75 * sc, 0, Math.PI * 2); x.fill();
    x.beginPath();
    x.moveTo(cx - 130 * sc, 1200); x.quadraticCurveTo(cx - 140 * sc, 560, cx, 560); x.quadraticCurveTo(cx + 140 * sc, 560, cx + 130 * sc, 1200);
    x.fill();
  }
  x.fillStyle = 'rgba(255,255,255,.85)';
  x.font = '600 54px Inter, system-ui, sans-serif';
  x.textAlign = 'center';
  x.fillText('Tu foto aquí', 600, 300);
  placeholder = makePhoto(c);
  return placeholder;
}

export function zoomBounds(W, H, frame, photo) {
  const { win } = layout(W, H, frame);
  const cover = Math.max(win.w / photo.width, win.h / photo.height);
  const contain = Math.min(win.w / photo.width, win.h / photo.height);
  return { win, cover, min: contain / cover, max: MAX_ZOOM };
}

/** Draws backdrop + photo + frame. s = { photo, blur, frame, z, ox, oy } (ox/oy in units of W). */
export function drawScene(ctx, W, H, frameCanvas, s) {
  const { win, cover } = zoomBounds(W, H, s.frame, s.photo);
  const scale = cover * s.z;
  const dw = s.photo.width * scale;
  const dh = s.photo.height * scale;
  const cx = win.cx + s.ox * W;
  const cy = win.cy + s.oy * W;

  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const b = s.blur;
  const bs = Math.max(W / b.width, H / b.height) * 1.1;
  ctx.drawImage(b, (W - b.width * bs) / 2, (H - b.height * bs) / 2, b.width * bs, b.height * bs);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(0, 0, W, H);

  ctx.drawImage(s.photo, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.drawImage(frameCanvas, 0, 0, W, H);
}

const frameCache = new Map();
/** Frame canvases are expensive; cache by frame id + revision + size. */
export function cachedFrame(frame, W, H) {
  const key = `${frame.id}|${frame.rev || 0}|${W}x${H}`;
  if (!frameCache.has(key)) {
    if (frameCache.size > 40) frameCache.clear();
    frameCache.set(key, renderFrame(frame, W, H));
  }
  return frameCache.get(key);
}
export function clearFrameCache() { frameCache.clear(); }

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('image load failed: ' + src));
    i.src = src;
  });
}

/** Reads an image file, downscaled to maxSide, as a PNG blob (keeps transparency). */
export async function fileToPngBlob(file, maxSide) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
