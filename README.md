# Lift Log

A mobile-first, offline-capable PWA for logging weightlifting sets (weight, target reps, actual reps), timed sets (e.g. plank), plus cardio and yoga (duration and distance). It has no build step and no dependencies. Data is stored in IndexedDB on your device only.

## Run locally

```sh
python -m http.server 8000
# open http://localhost:8000
```

Service workers need `localhost` or HTTPS, so opening `index.html` as a `file://` URL won't work.

## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. Go to Settings → Pages, choose **Deploy from a branch**, and select `main` / root.
3. Open the Pages URL on your phone and use **Add to Home Screen**. On iOS this matters: Safari may clear storage for sites that aren't installed.

When you change any app file, bump `CACHE` in `sw.js` and `APP_VERSION` in `js/util.js` so installed copies update.

## Backup

Settings → **Export to JSON** downloads everything. **Import** can merge (upsert by id) or replace all data.

## Layout

```
index.html, manifest.webmanifest, sw.js
css/styles.css
js/app.js            router + boot
js/db.js             IndexedDB wrapper, export/import
js/seed.js           default exercise list
js/util.js           volume math, formatting, helpers
js/views/*.js        log, history, exercises, settings
icons/
```
