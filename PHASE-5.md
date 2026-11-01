# Phase 5 – Final QA and GitHub Pages release

Read CLAUDE.md first. Phases 1 to 4 must be finished. Do ONLY this phase.

## Part A – Final QA (do this now)
1. Run `node --test` and show the output.
2. Walk the whole app in a browser at 360px, 768px and desktop; landscape too.
3. Offline test (load once, go offline, reload).
4. Reduced motion and reduced transparency: confirm the fallbacks.
5. Lighthouse: Accessibility 95+, PWA installable, no console errors.
6. Re-check every item in these lists and report pass or fail for each:
   - [ ] Generic profile at 120 BPM shows 63 ms and 1.50 s with defaults
   - [ ] X32 profile clamps at 200 ms and 5.0 s and shows the verify badge
   - [ ] Custom profile can be created, saved, reloaded
   - [ ] Works offline after the first load
   - [ ] All paths are relative (works from a sub-folder)
   - [ ] First screen fits a phone without scrolling; no horizontal scroll at 360px
   - [ ] Glass fallback works; contrast at least 4.5:1
   - [ ] Storage blocked → app still works
7. Fix anything that fails, then update the README.

## Part B – Release (ONLY after I say "go")
Do NOT create a repo or push until I confirm. When I do, show me the exact commands and wait:
1. `git init`, `git add .`, `git commit -m "Reverb Time Calculator v1"`
2. I create a public repo on github.com named `reverb-calculator`; then `git remote add origin ...` and `git push -u origin main`
3. I turn on Pages: Settings → Pages → Deploy from branch → `main` / root
4. Tell me the final link format (`https://<user>.github.io/reverb-calculator/`) and what to test on it: load, go offline, install on iPhone (Safari → Share → Add to Home Screen), install on Windows and macOS (Chrome or Edge → Install)
5. Explain how updates work: push, bump the cache version, phones refresh once.

## Final summary (end of Part A)
What was built, test results, every VERIFY item still open (especially the X32 limits: pre-delay max and decay min/max, to confirm on the real console), and any known limits.

Then STOP and wait for my "go".
