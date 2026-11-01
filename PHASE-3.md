# Phase 3 – Installable and offline (PWA, iPhone, icons, README)

Read CLAUDE.md first. Phases 1 and 2 must be finished. Do ONLY this phase, then stop.

## Build
1. **`manifest.webmanifest`:** name "Reverb Time Calculator", short_name "Reverb Calc", `display: standalone`, `background_color` and `theme_color` `#090E14`, `start_url: "./"`, `scope: "./"`, icons (192, 512, maskable 512). All paths relative.
2. **iOS head tags in `index.html`:** `apple-touch-icon` (180), `apple-mobile-web-app-capable`, `apple-mobile-web-app-title`, status bar `black-translucent`, `viewport-fit=cover`, `theme-color`, `color-scheme: dark`. Confirm `env(safe-area-inset-*)` padding is in place.
3. **Icons (`/icons`):** make them yourself: a sky-blue `#CAE7F9` decay-curve glyph on `#090E14`. Export icon-180, icon-192, icon-512, icon-maskable-512 (PNG) and favicon.svg. Use a small script and keep it in `/tools`. No Churchfront or Apple logos.
4. **`sw.js`:** precache all app files (cache-first); versioned cache name `reverb-calc-v1`; delete old caches on activate; runtime cache for the Figtree font (stale-while-revalidate); register with a relative path `./sw.js`.
5. **Update bar:** when a new version is waiting, show a slim glass bar "Update ready – tap to refresh".
6. **Install hint:** dismissible tip on iOS ("Share → Add to Home Screen"); use `beforeinstallprompt` on Chrome, Edge and Android.
7. **Footer:** app version from one constant.
8. **`.nojekyll`** (empty file).
9. **`README.md`:** how to run locally (open `index.html` or `npx serve`), run tests, change constants, install on iPhone, Windows and macOS, bump the cache version on release, and (placeholder) how to deploy to GitHub Pages.

## Check yourself
- Serve the app from a sub-folder (for example `npx serve` at `/reverb-calc/`) and confirm everything loads: relative paths, manifest, service worker
- Load once, go offline, reload: the app still works, including the font fallback
- Bump the cache name and confirm the update bar appears
- Manifest and icons valid (no console warnings)
- Lighthouse: PWA installable, Accessibility 95+

## Done when
- [ ] All checks pass (describe how you verified)
- [ ] `node --test` still passes
- [ ] VERIFY items listed

Then STOP and report. Do not start Phase 4.
