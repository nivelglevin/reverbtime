# Phase 2 – Main screen (the part operators actually use)

Read CLAUDE.md first. Phase 1 must be finished and passing. Do ONLY this phase, then stop.

## Build `index.html`, `styles.css`, `app.js`
**First screen, no scrolling on a phone:** title, device profile picker, BPM block, the two result glass cards, Copy.
**Below it:** options, warnings.

1. **Title:** "Reverb Time Calculator", subtitle "BPM-synced pre-delay and decay for any reverb".
2. **Device profile picker** (dropdown, label "My reverb unit"): lists the built-in profiles. Show the profile `notes` and the "Verify on your console" badge for unverified ones. (Creating custom profiles comes in Phase 4.)
3. **BPM block:** huge centered number field (`inputmode="decimal"`, `enterkeyhint="done"`), round − / + glass buttons (±1, long-press repeats), **Tap Tempo** primary button (average of last 6 taps, restart after a 2 s gap, show detected BPM live, round to 0.5), **Reset**.
4. **BPM chips:** 60, 72, 80, 90, 100, 110, 120, 130, 140 (scrollable, scroll-snap, active chip tinted).
5. **Result glass cards (live, no Calculate button):**
   - PRE-DELAY → `63 ms`, small line "1/32 note at 120 BPM · exact 62.5 ms"
   - DECAY → `1.50 s`, small line "3 beats at 120 BPM"
   - Decay units toggle: s or ms.
   - Copy button on each card, plus **Copy both** → `Pre-Delay 63 ms | Decay 1.50 s`. Use `navigator.clipboard` with an `execCommand` fallback and a short "Copied" confirmation.
6. **Options** (iOS-style segmented controls, sliding thumb): Pre-delay note (1/64, 1/32, 1/16, Custom ms), Feel (Straight, Dotted, Triplet), Decay beats (2, 3, 4, Custom).
7. **Warnings:** slim glass banners with a small colored dot for long tail and for clamped values. Inline friendly message for invalid BPM. Empty state shows hint text and dashes.
8. **Remember** last BPM, options and profile in localStorage (try/catch).
9. **Design:** follow the Design section of CLAUDE.md exactly, including the glass fallback and the app's own "Reduce glass" toggle (a small switch at the bottom; also follows `prefers-reduced-transparency`).

## Check yourself
- 360px, 768px, desktop, landscape: no horizontal scroll
- The first screen fits a phone without scrolling
- Contrast at least 4.5:1 in glass and solid modes
- Reduced motion turns motion off
- 120 BPM with defaults shows 63 ms and 1.50 s (Generic)
- Storage blocked → app still works
- No console errors

## Done when
- [ ] All checks above pass (describe how you verified)
- [ ] `node --test` still passes
- [ ] Short list of anything unfinished or marked VERIFY

Then STOP and report. Do not start Phase 3.
