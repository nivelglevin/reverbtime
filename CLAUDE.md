# Reverb Time Calculator – project context (read this first, every session)

Claude Code reads this file automatically. Build the app in phases. Each phase has its own prompt file (PHASE-1.md to PHASE-5.md). Do ONLY the phase I ask for, then stop and report.

## Working rules
- Make a short plan first, then build.
- Stay inside the current phase. Do not start later phases, even if it looks easy.
- When a phase ends: run the tests, list what was built, list every item marked VERIFY, then STOP and wait for me.
- Never create a repo or push to GitHub unless I say so (Phase 5 only).
- Never invent device specs. Unknown limits are marked VERIFY.
- Comments only where the reason is not obvious.

## Purpose
A single-page installable web app (PWA). The user enters a song's BPM and gets **Pre-Delay (ms)** and **Decay (s)** to type into ANY reverb: a mixing console (Behringer X32/M32, Yamaha, A&H, DiGiCo, Soundcraft), outboard unit, or plugin (Waves, UAD, DAW). Main users: church volunteer sound operators at FOH on a phone or tablet, in a dim room, in a hurry. Musicians and studio users should find it useful too. Priorities: fast, readable at arm's length, hard to misuse, works offline.
The app must NOT assume one brand. Default profile is "Generic" with no console limits.

## Constraints
- Vanilla HTML, CSS, JS. No framework, no bundler, no build step, no npm runtime dependencies.
- Only external resource: Figtree font (Google Fonts) with the stack `"Figtree", -apple-system, "SF Pro Text", system-ui, sans-serif`.
- Runs on iPhone (Safari), Android (Chrome), Windows and macOS (Chrome, Edge, Safari). Mobile-first, 360px and up, plus landscape.
- Will be hosted on GitHub Pages in a sub-folder: use **relative paths everywhere** (no leading `/`), `start_url` and `scope` = `"./"`, service worker at `./sw.js`, and an empty `.nojekyll`.
- No backend, no accounts, no analytics, no cookies.
- Every localStorage call in try/catch. The app must work if storage is blocked.

## File layout
```
/index.html  /styles.css  /app.js  /calc.js  /profiles.js  /calc.test.js
/sw.js  /manifest.webmanifest  /icons/  /README.md  /.nojekyll
```
`calc.js` and `profiles.js` are pure (no DOM), so Node can test them.

## The math (`calc.js`)
- `quarterMs = 60000 / bpm`
- `noteMs = quarterMs × fraction × feel`
  - Fractions: 1/4 = 1, 1/8 = 0.5, 1/16 = 0.25, 1/32 = 0.125, 1/64 = 0.0625
  - Feel: straight = 1, dotted = 1.5, triplet = 2/3 (default straight)
- Pre-delay options: **1/32 (default, "Tight – best for live vocals")**, 1/16 ("Roomy"), 1/64 ("Very tight"), Custom ms.
- Decay options by beats: 2, **3 (default)**, 4, Custom beats (0.5 to 8, step 0.5). `decayS = quarterMs × beats / 1000`.
- Rounding follows the active profile's step. Always keep the raw value for an "exact" line (for example 62.5 ms).
- **Valid BPM: 40 to 220**, decimals allowed. Otherwise return `{ ok: false, reason }`. Never throw, never show NaN or Infinity.
- If a value is clamped by the profile: `clamped: true` plus the original value. UI text: "Capped to X – this device can't go higher/lower."
- If `decayS > longTailWarnS` (default 2.0): `longTail: true`. UI: yellow notice "Long tail for a reverberant room. Try 2 beats, or keep the return fader low." Warn only, never block.
- Return shape: `{ ok, bpm, quarterMs, preDelay: { ms, msRounded, fraction, feel, clamped }, decay: { s, beats, clamped, longTail }, profileId }`.
- **Worked example (Generic):** 120 BPM → quarter 500 ms; 1/32 → 62.5 ms (shown 63); 1/16 → 125 ms; 1/64 → 31.25 ms; dotted 1/16 → 187.5 ms; triplet 1/16 → 83.33 ms; 3 beats → 1.50 s; 4 beats → 2.00 s.

## Device profiles (`profiles.js`, data only)
Shape: `{ id, name, preDelay: { minMs, maxMs, stepMs }, decay: { minS, maxS, stepS }, notes, verified }`
1. **Generic (default):** pre-delay 0 to 500 ms step 0.1; decay 0.1 to 20 s step 0.01; verified true.
2. **Behringer X32 / Midas M32:** pre-delay 0 to 200 ms step 1; decay 0.2 to 5.0 s step 0.01; `verified: false`, badge "Verify on your console" (limits come from memory; check the Plate/Hall Reverb screen). Console decay is an RT60 approximation.
3. **Plugin / DAW (no limits):** like Generic, shown to 1 decimal.
4. **Custom:** user-entered name, min, max, step. Several allowed (cap 20).
Do not add other brands' limits unless `verified: false` and user-editable.

## Design: sleek, minimal, iOS-style glass in the Churchfront palette
Calm, spacious, few elements, big numbers, soft translucent layers on deep navy. Native-iOS feel. Sentence case everywhere (no uppercase headings). Dark only.
```css
:root {
  --bg:#090E14; --bg-glow-1:rgba(202,231,249,0.10); --bg-glow-2:rgba(202,231,249,0.04);
  --text:#E6E7E8; --text-muted:rgba(230,231,232,0.72); --text-faint:rgba(230,231,232,0.42);
  --accent:#CAE7F9;
  --glass:rgba(230,231,232,0.06); --glass-strong:rgba(230,231,232,0.10);
  --glass-border:rgba(230,231,232,0.14); --glass-highlight:rgba(255,255,255,0.18);
  --warn:#F2C94C; --error:#FF8A80;
  --r-card:28px; --r-control:20px; --r-pill:999px; --space:8px;
  --ease:cubic-bezier(0.2,0.8,0.2,1);
}
```
- Background: `--bg` with two fixed blurred radial glows. No images.
- Glass surfaces: `background:var(--glass)`, `backdrop-filter: blur(24px) saturate(160%)` (with `-webkit-`), 1px `--glass-border`, inset top highlight, radius `--r-card`, very soft shadow.
- Fallback: when `backdrop-filter` is unsupported, or `prefers-reduced-transparency: reduce`, or the app's own "Reduce glass" setting is on, use solid `#10171F` with the same border. Contrast stays at least 4.5:1.
- Type: title 34px/700, label 13px/600 in `--text-faint`, body 17px/400, result numbers `clamp(56px,16vw,104px)`/700, tabular numerals, letter-spacing -0.02em, color `--accent`, units smaller in `--text-muted`.
- Segmented controls: one glass track with a sliding thumb (transform, 250 ms, `--ease`), built on real radio inputs.
- Buttons: primary = filled `--text` pill, `--bg` text, 52px tall, weight 600, no uppercase. Secondary = glass pill. Press scale 0.97. Hover only in `@media (hover:hover)`.
- Layout: one centered column, max 520px, 20px gutters plus safe-area insets, 24-32px between sections.
- Motion: subtle (numbers cross-fade 150 ms). Respect `prefers-reduced-motion`.
- Icons: inline SVG, 1.75px stroke, rounded caps. No emoji, no icon font.
- At most 4 glass layers visible at once. Never animate blurred elements (animate transform or opacity only).
- Do NOT copy Churchfront's logo or text, and do NOT use Apple logos, SF Symbols, or unlicensed fonts. Style language only.

## Accessibility
Keyboard operable; visible accent focus rings; labels on all inputs; `aria-live="polite"` on results and warnings; tap targets at least 44px; inputs at least 16px (stops iOS zoom). No console errors.

## Out of scope for the whole project
OSC or MIDI control, accounts, backend, analytics, light theme. Phase 2 ideas for later: BPM-synced delay-time card, more device profiles, OSC push to the X32.
