# Mix n Match Padel — Marcos

Web app at https://mixnmatchpadel.reeldemiercoles.com

1. Upload a photo (never leaves the device; everything runs in the browser).
2. Pick a frame: Mix & Match, 1er / 2do / 3er / 4to Lugar.
3. Pick a format: vertical 4:5 (2160×2700), square (2160×2160), horizontal 4:3 (2880×2160).
4. Drag to move, pinch / wheel / slider to zoom, then download (on phones it opens the share sheet so you can save to Photos).

Frames are drawn procedurally in `js/frames.js` (vector, so they stay sharp at any size and adapt to every format).
Plain static HTML/CSS/JS, no build step.

## Run locally

```bash
npx http-server . -p 5174
```

## Deploy

cPanel pulls this repo and copies it to the subdomain's document root (cron job), so a push to `main` goes live within a minute.
