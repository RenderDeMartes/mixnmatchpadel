# Mix n Match Padel — Marcos

Web app at https://mixnmatchpadel.reeldemiercoles.com

Frame editor for Mix & Match Pádel / Art Pádel Club photos, built on the modular frame kit (`js/frame-kit.js`). Phone first: every piece of the frame is its own layer you can drag, pinch to resize and rotate, recolor or hide.

1. **Marcos**: pick a tournament preset (Participación, 1er–4to lugar, Campeones, Medalla, Grupo oro), a saved template or a shared one.
2. **Foto**: upload a photo (it never leaves the device), drag to frame it, pinch to zoom. "Ajustar ventana" moves/resizes the photo window.
3. Tap any piece on the canvas to select it: drag to move, pinch or use the red corner handle to resize/rotate. The bar under the canvas duplicates, flips, reorders, locks or deletes; **Editar** changes texts, metal and colors.
4. **Agregar**: place badges, titles, medals, names, dates, balls, rackets, nets, brush strokes, halftones, effects, logos or your own image.
5. **Capas**: show/hide, lock and reorder layers. **Diseño**: metal for the whole frame, re-roll brush strokes, format (4:5, 3:4, 1:1, 9:16), background color, effects.
6. **Guardar**: JPG or PNG at 1× or 2× (2160 px wide). On phones it opens the share sheet so you can save to Photos.

Undo/redo, autosave (IndexedDB) and keyboard shortcuts on desktop (Ctrl+Z / Ctrl+Y, Delete, Ctrl+D, arrows).

## Code

Plain static HTML/CSS/JS, no build step.

| File | What it does |
| --- | --- |
| `js/frame-kit.js` | The kit: SVG primitives (strokes, halftones, metal frame, badge, ball, racket…) |
| `js/elements.js` | Layer types: schema (validation + property panel) and SVG render per type; "Agregar" library |
| `js/presets.js` | Tournament presets rebuilt as editable layer lists |
| `js/render.js` | Rasterizes each layer once (cached per scale), draws, hit-tests, exports |
| `js/editor.js` | Touch/mouse gestures, selection overlay, snapping |
| `js/app.js` | State, undo/redo, panels, templates, export/share |
| `js/store.js` | IndexedDB (photos, current project, saved templates) |

Anton (place/title lettering) is self-hosted in `fonts/` so exports embed it.

## Shared frames API (`api/frames.php`, PHP 7.4+)

- `kind=layout`: a frame saved as layers (`def` JSON) plus up to 5 PNGs (`img0`…`img4`) for custom images. The photo is never uploaded.
- `kind=png`: legacy PNG frames from the first version still show up under "Del torneo".
- Data lives outside the web root in `/home/reeldemi/mixnmatch-data/` (`frames.json`, `admin-key.txt`); images go to `uploads/`.
- Anyone can publish: 10 publishes/hour per IP, 8 MB per image, 200 MB total, 100 frames max. Only the publishing device (owner token in localStorage) can delete.
- Optional moderation: put a key (8+ chars) on the first non-comment line of `admin-key.txt`, then open the app with `?admin` to delete any frame.
- `MM_DATA_DIR` / `MM_UPLOAD_DIR` env vars override the paths.

## Run locally

```bash
npx http-server . -p 5174 -c-1
```

(The shared-frames section needs PHP; without it the app shows that they couldn't load.)

## Deploy

cPanel pulls this repo and copies it to the subdomain's document root (cron job), so a push to `main` goes live within a minute.
