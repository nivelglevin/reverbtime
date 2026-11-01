# Phase 4 – Extras (saved songs, custom profiles, settings)

Read CLAUDE.md first. Phases 1 to 3 must be finished and working. Do ONLY this phase, then stop. Do not change the first-screen layout from Phase 2; everything here sits below it or in a settings area.

## Build
1. **Saved songs:** name + BPM + options + profile. Add, rename, delete, tap-to-load. Cap 50. Plain list rows with hairline dividers and a small delete button (no swipe gestures).
2. **Export / import JSON** for saved songs and custom profiles (storage does not sync across devices). Validate imported data; reject bad files with a friendly message; never overwrite without asking.
3. **Custom profiles (UI):** create, edit, rename, delete (cap 20). Fields: name, pre-delay min/max/step, decay min/max/step. Validate (min < max, step > 0). Appear in the profile picker.
4. **Settings area** (collapsed row): 
   - "Starting points – tune by ear" toggle (ON by default) that shows the Also-set row: **Lo Cut 200 Hz** (keeps low thuds out of the reverb) and **Hi Cut 5 kHz** (softens harsh S and T). Editable values. Never present them as exact science.
   - Long-tail warning threshold (default 2.0 s).
   - Reduce glass switch (already exists; move here if tidy).
   - Keep screen awake (Screen Wake Lock API, feature-detected, off by default, re-acquire after the tab returns to the foreground).
5. **Explainer** (collapsed `<details>` with chevron): "One beat in ms = 60,000 ÷ BPM", "Pre-delay = a small slice of a beat", "Decay = 2-4 beats so the tail ends before the next phrase", "Most devices measure decay as RT60, so tune by ear."
6. **Haptics:** `navigator.vibrate(10)` on Tap Tempo and Copy, feature-detected, never required.
7. **Tests:** add unit tests for any new pure logic (custom profile validation, import validation).

## Check yourself
- Save, reload, load, rename, delete a song; export then import round-trips
- A bad or hostile JSON file is rejected safely
- Custom profile clamps and rounds correctly in the main screen
- Storage blocked → app still works (features degrade gracefully, with a short note)
- The first screen is unchanged and still fits a phone
- Service worker cache list updated for any new files; bump the cache version

## Done when
- [ ] All checks pass (describe how you verified)
- [ ] `node --test` passes
- [ ] VERIFY items listed

Then STOP and report. Do not start Phase 5.
