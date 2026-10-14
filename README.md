# Mix n Match Padel — Marcos

Web app at https://mixnmatchpadel.reeldemiercoles.com

1. Upload a photo (never leaves the device; everything runs in the browser).
2. Pick a frame: Mix & Match, 1er / 2do / 3er / 4to Lugar.
3. Pick a format: vertical 4:5 (2160×2700), square (2160×2160), horizontal 4:3 (2880×2160).
4. Drag to move, pinch / wheel / slider to zoom, then download (on phones it opens the share sheet so you can save to Photos).

Frames are drawn procedurally in `js/frames.js` (vector, so they stay sharp at any size and adapt to every format).
Plain static HTML/CSS/JS, no build step.

## Frame creator

- **Diseñar**: start from a preset and change texts, colors, metal, logos (text or uploaded image) and the place badge.
- **Subir PNG**: upload a PNG with a transparent center; the transparent area is detected automatically and the output keeps the PNG's size.
- **Usar este marco** saves it on the device (IndexedDB). **Publicar para todos** saves it on the server so everyone sees it under "Del torneo". No key needed; only the publishing device (owner token in localStorage) can delete it.

## Shared frames API (`api/frames.php`, PHP 7.4+)

- Data lives outside the web root in `/home/reeldemi/mixnmatch-data/` (`frames.json`, `admin-key.txt`); images go to `uploads/`.
- Anyone can publish: 10 publishes/hour per IP, 8 MB per image, 200 MB total, 100 frames max.
- Optional moderation: put a key (8+ chars) on the first non-comment line of `admin-key.txt`, then open the app with `?admin` to delete any frame.
- `MM_DATA_DIR` / `MM_UPLOAD_DIR` env vars override the paths.

## Run locally

```bash
npx http-server . -p 5174
```

## Deploy

cPanel pulls this repo and copies it to the subdomain's document root (cron job), so a push to `main` goes live within a minute.
