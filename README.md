# Reverb Time Calculator

Made by GLEV.

Enter a song's BPM and get the **pre-delay (ms)** and **decay (s)** to type into any reverb: a mixing console, an outboard unit, or a plugin. Built for volunteer sound operators at front of house, on a phone, in a dim room.

Plain HTML, CSS and JavaScript. No framework, no build step, no runtime dependencies, no accounts, no analytics.

## Using it

- **Tap the big coral dial** along with the song, or press **−** and **+**, or tap a tempo chip.
- **Type** opens a built-in number pad (on a keyboard, just type digits). Done keeps the tempo; a half-typed value goes back to the last good one.
- **Pre-delay** and **Decay** each have a ‹ › stepper right under the number: tighter or roomier pre-delay, fewer or more beats of decay. Tap a number to copy it; the copy button copies both.
- Tap the small unit next to the decay number to switch between seconds and milliseconds.
- Saved songs, your own reverb units, note feel and settings are one scroll down.

## Run it locally

The app uses JavaScript modules and a service worker, which browsers block on `file://`, so serve the folder:

```bash
npx serve .
```

Then open the address it prints. Opening `index.html` directly shows the page, but calculations and offline mode will not work.

## Run the tests

```bash
node --test
```

Needs Node 18 or newer. There is nothing to install.

## Change the settings

| What | Where |
|---|---|
| BPM range (40 to 220), long-tail warning (2.0 s), custom beats range | constants at the top of `calc.js` |
| Device limits and step sizes | `profiles.js` |
| Song and backup rules (50 songs, 20 custom units, file size cap) | `store.js` and `profiles.js` |
| Colours, glass, spacing | `:root` in `styles.css` |
| BPM chips | `CHIP_BPMS` at the top of `app.js` |
| App version shown in the footer | `APP_VERSION` at the top of `app.js` |

The X32 / M32 limits come from memory and are marked unverified. Check them on the console's Plate/Hall Reverb screen.

## Saved songs, custom units and backups

Songs (up to 50) and custom reverb units (up to 20) are stored in the browser on that one device. Use **Settings, then Export** to save them to a `reverb-calc-backup.json` file and **Import** to load it on another device. Import asks whether to add to or replace what is already there, and rejects files that aren't valid backups. If the browser blocks storage, the app still works but keeps everything only until the tab closes.

## Install it

- **iPhone / iPad (Safari):** tap Share, then Add to Home Screen.
- **Android (Chrome):** tap Install in the app's tip, or the browser menu, then Install app.
- **Windows and macOS (Chrome or Edge):** click the install icon in the address bar, or the Install button in the app's tip.
- **macOS (Safari):** File, then Add to Dock.

After the first visit the app works offline.

## Release a new version

Browsers keep the old files until the cache name changes.

1. Change `APP_VERSION` in `app.js`.
2. Change `CACHE` in `sw.js` (for example `reverb-calc-v1` to `reverb-calc-v2`).
3. If you add or rename a file, add it to `APP_FILES` in `sw.js` (the list includes `store.js`).
4. Deploy.

People who already have the app see "Update ready – tap to refresh" and get the new version when they tap it.

The app looks for a new version every time it is opened or brought back to the front, and every 30 minutes. There is also **Settings, then Check for updates**, and the footer shows the version number so you can tell what a phone is running. If a phone is stuck on an old version, close the app completely (swipe it away in the app switcher) and open it again while online.

## Icons

`node tools/make-icons.mjs` redraws everything in `icons/`. It needs no packages.

## Deploy to GitHub Pages

The app uses relative paths only, so it works from a sub-folder such as `https://<user>.github.io/reverb-calculator/`. The empty `.nojekyll` file stops GitHub from processing the files.

1. Create a public repository named `reverb-calculator` on github.com.
2. In this folder, run `git init`, `git add .`, then `git commit -m "Reverb Time Calculator v1"`.
3. Run `git branch -M main`, then `git remote add origin https://github.com/<user>/reverb-calculator.git`, then `git push -u origin main`.
4. On GitHub, open Settings, then Pages, choose Deploy from a branch, pick `main` and `/ (root)`, and save.
5. After a minute or two the app is live at `https://<user>.github.io/reverb-calculator/`.

To check the live site: load it, go offline and reload, then install it (iPhone: Safari, Share, Add to Home Screen; Windows and macOS: Chrome or Edge, Install).

To update later: change the files, bump `APP_VERSION` and `CACHE` (see Release a new version), then `git add .`, `git commit` and `git push`. Phones show "Update ready – tap to refresh" once and then run the new version.
