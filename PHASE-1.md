# Phase 1 – Core engine (math, profiles, tests). No UI.

Read CLAUDE.md first. Do ONLY this phase, then stop.

## Build
1. `calc.js`: pure functions for quarter note, note value (fraction × feel), pre-delay, decay, BPM validation, profile clamping and rounding, long-tail flag. JSDoc types. Constants (`longTailWarnS`, BPM min/max) at the top.
2. `profiles.js`: the four profiles (Generic, X32/M32 with `verified:false`, Plugin/DAW, Custom factory with validation: min < max, step > 0).
3. `calc.test.js` using Node's built-in `node --test`, no packages.

## Tests must cover
- The full 120 BPM worked example, including dotted and triplet
- BPM boundaries 40 and 220; decimal BPM (97.5)
- Invalid input: empty, 0, negative, NaN, text, 39.9, 220.1 → `{ ok:false, reason }`, never a throw
- Every pre-delay and decay option, plus custom ms and custom beats
- X32 profile clamping: 40 BPM with 4 beats caps at 5.0 s and reports the original value
- Generic profile does NOT clamp that same input
- Custom profile limits and step rounding
- `longTail` is false at exactly 2.0 s and true at 2.01 s

## Done when
- [ ] `node --test` passes and you show me the output
- [ ] No DOM or browser code in `calc.js` or `profiles.js`
- [ ] The return shape matches CLAUDE.md
- [ ] VERIFY items listed (X32 limits)

Then STOP and report. Do not start Phase 2.
