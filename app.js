import { calculate, validateBpm, BPM_MIN, BPM_MAX } from './calc.js';
import { BUILT_IN_PROFILES, DEFAULT_PROFILE, MAX_CUSTOM_PROFILES, createCustomProfile } from './profiles.js';
import {
  MAX_SONGS, MAX_FILE_BYTES, NOTES, FEELS, BEATS, cleanName, newId, sanitizeSong, sanitizeSongList,
  sanitizeProfileList, buildBackup, parseBackup, mergeBackup,
} from './store.js';

const APP_VERSION = '2.3.0';
const STORAGE_KEY = 'reverb-calc-v1';
const TIP_KEY = 'reverb-calc-tip-dismissed';
const CHIP_BPMS = [60, 72, 80, 90, 100, 110, 120, 130, 140];
const DEFAULTS = {
  bpm: '', profileId: DEFAULT_PROFILE.id, note: '1/32', feel: 'straight',
  beats: '3', customMs: '', customBeats: '', units: 's', reduceGlass: false,
  songs: [], customProfiles: [],
  showStarting: true, loCut: '200', hiCut: '5', longTailWarn: '2', keepAwake: false,
};

const $ = (id) => document.getElementById(id);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- storage (every call guarded: it can be blocked) ---------- */
const LIMITS = { loCut: [20, 1000], hiCut: [1, 20], longTailWarn: [0.5, 20] };
function validLimit(key, str) {
  const n = parseNumber(str);
  return n !== null && n >= LIMITS[key][0] && n <= LIMITS[key][1];
}

// Storage can be blocked (private mode, strict settings). Songs and units then live in memory only.
const storageOk = (() => {
  try {
    localStorage.setItem('reverb-calc-probe', '1');
    localStorage.removeItem('reverb-calc-probe');
    return true;
  } catch { return false; }
})();

function loadState() {
  const state = { ...DEFAULTS, songs: [], customProfiles: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return state;
    state.songs = sanitizeSongList(saved.songs);
    state.customProfiles = sanitizeProfileList(saved.customProfiles);
    if ([...BUILT_IN_PROFILES, ...state.customProfiles].some((p) => p.id === saved.profileId)) state.profileId = saved.profileId;
    if (typeof saved.showStarting === 'boolean') state.showStarting = saved.showStarting;
    for (const key of Object.keys(LIMITS)) {
      if (typeof saved[key] === 'string' && validLimit(key, saved[key])) state[key] = saved[key];
    }
    state.keepAwake = saved.keepAwake === true;
    if (typeof saved.bpm === 'string' && saved.bpm.length <= 6) state.bpm = saved.bpm;
    if (NOTES.includes(saved.note)) state.note = saved.note;
    if (FEELS.includes(saved.feel)) state.feel = saved.feel;
    if (BEATS.includes(saved.beats)) state.beats = saved.beats;
    if (typeof saved.customMs === 'string' && saved.customMs.length <= 8) state.customMs = saved.customMs;
    if (typeof saved.customBeats === 'string' && saved.customBeats.length <= 8) state.customBeats = saved.customBeats;
    if (saved.units === 's' || saved.units === 'ms') state.units = saved.units;
    state.reduceGlass = saved.reduceGlass === true;
  } catch { /* storage blocked or corrupt: use defaults */ }
  return state;
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const state = loadState();

/* ---------- helpers ---------- */
function sanitizeNumber(raw) {
  const cleaned = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  return dot === -1 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
}
function parseNumber(str) {
  if (typeof str !== 'string' || str.trim() === '' || str === '.') return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}
function decimalsOf(step) {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}
function trimmed(n, max = 2) {
  return String(Number(n.toFixed(max)));
}
const allProfiles = () => [...BUILT_IN_PROFILES, ...state.customProfiles];
function currentProfile() {
  return allProfiles().find((p) => p.id === state.profileId) || DEFAULT_PROFILE;
}

/* ---------- compute everything the screen needs ---------- */
function compute() {
  const profile = currentProfile();
  const bpmCheck = validateBpm(state.bpm);
  if (!bpmCheck.ok) {
    return { status: state.bpm.trim() === '' ? 'empty' : 'invalid', reason: bpmCheck.reason, profile };
  }
  let customMs = null;
  let preValid = true;
  if (state.note === 'custom') {
    customMs = parseNumber(state.customMs);
    preValid = customMs !== null && customMs >= 0;
  }
  let beats = state.beats === 'custom' ? parseNumber(state.customBeats) : Number(state.beats);
  const beatsValid = beats !== null && calculate({ bpm: 120, beats }).ok;

  const r = calculate({
    bpm: bpmCheck.bpm,
    fraction: preValid ? state.note : '1/32',
    feel: state.feel,
    customMs: preValid ? customMs : undefined,
    beats: beatsValid ? beats : 3,
    profile,
    longTailWarnS: Number(state.longTailWarn),
  });
  if (!r.ok) return { status: 'invalid', reason: r.reason, profile };
  return { status: 'ok', r, preValid, beatsValid, profile };
}

function formatPreDelay(r, profile) {
  const decimals = profile.id === 'generic' ? 0 : decimalsOf(profile.preDelay.stepMs);
  return r.preDelay.msRounded.toFixed(decimals);
}
function formatDecay(r, profile) {
  if (state.units === 'ms') return String(Math.round(r.decay.sRounded * 1000));
  return r.decay.sRounded.toFixed(Math.max(2, decimalsOf(profile.decay.stepS)));
}

/* ---------- render ---------- */
let lastCopy = null;
let warnOpen = false;

function setText(el, text) {
  if (el.textContent === text) return;
  el.textContent = text;
  if (!reducedMotion() && el.animate) el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
}

function render() {
  const profile = currentProfile();
  const c = compute();

  // profile note + badge
  $('profile-badge').hidden = profile.verified;
  // Generic's note adds nothing, so only units with something to say get the extra line.
  $('profile-notes').textContent = profile.id === 'generic' ? '' : profile.notes;

  // chips
  const bpmNum = parseNumber(state.bpm);
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(bpmNum === Number(chip.dataset.bpm)));
  });

  // options
  renderSteppers();
  setSeg('seg-feel', 'feel', state.feel);
  $('custom-ms-wrap').hidden = state.note !== 'custom';
  $('custom-beats-wrap').hidden = state.beats !== 'custom';
  const feelOff = state.note === 'custom';
  $('opt-feel').classList.toggle('is-off', feelOff);
  document.querySelectorAll('input[name="feel"]').forEach((i) => { i.disabled = feelOff; });
  $('note-hint').textContent = {
    '1/64': 'Very tight', '1/32': 'Tight – best for live vocals', '1/16': 'Roomy', custom: '',
  }[state.note];

  const msg = $('bpm-msg');
  msg.classList.remove('error');
  lastCopy = null;
  let hasAlert = false;
  const alerts = [];
  const capped = [];

  if (c.status !== 'ok') {
    // The empty hint lives in the card so the first screen doesn't grow by a line.
    // While typing on the pad, a half-typed "7" isn't an error yet.
    const typing = kpOpen || Date.now() - lastTypedAt < 1500;
    msg.textContent = flashMsg || (c.status === 'empty' || typing ? '' : c.reason);
    if (c.status === 'invalid' && !typing) msg.classList.add('error');
    setText($('pre-num'), '–');
    setText($('dec-num'), '–');
    $('dec-unit').textContent = state.units;
    $('pre-sub').textContent = c.status === 'empty' ? 'Type a BPM or tap the tempo.' : 'Waiting for a BPM.';
    $('dec-sub').textContent = 'Waiting for a BPM.';
  } else {
    msg.textContent = flashMsg;
    const { r } = c;
    hasAlert = r.preDelay.clamped || r.decay.clamped || r.decay.longTail;
    const bpmText = trimmed(r.bpm);

    // pre-delay
    if (c.preValid) {
      const preText = formatPreDelay(r, profile);
      setText($('pre-num'), preText);
      const feelWord = r.preDelay.feel === 'straight' ? '' : `${cap(r.preDelay.feel)} · `;
      const detail = state.note === 'custom' ? 'Custom pre-delay' : `${feelWord}exact ${trimmed(r.preDelay.ms)} ms`;
      // Warnings sit inside the card they explain, so they can never push the dock off the screen.
      const preDir = r.preDelay.original > r.preDelay.msRounded ? 'higher' : 'lower';
      setSub($('pre-sub'), detail, r.preDelay.clamped && 'Capped');
      if (r.preDelay.clamped) capped.push({ value: `${preText} ms`, dir: preDir });
      lastCopy = { pre: `${preText} ms` };
    } else {
      setText($('pre-num'), '–');
      $('pre-sub').textContent = 'Type a pre-delay in ms under Options.';
    }

    // decay
    if (c.beatsValid) {
      const decText = formatDecay(r, profile);
      setText($('dec-num'), decText);
      $('dec-unit').textContent = state.units;
      const beatsN = r.decay.beats;
      const exactDecay = state.units === 'ms' ? `${trimmed(r.decay.s * 1000, 1)} ms` : `${trimmed(r.decay.s, 3)} s`;
      const decDir = r.decay.original > r.decay.sRounded ? 'higher' : 'lower';
      setSub(
        $('dec-sub'),
        `exact ${exactDecay}`,
        r.decay.clamped && 'Capped',
      );
      if (r.decay.clamped) capped.push({ value: `${decText} ${state.units}`, dir: decDir });
      if (r.decay.longTail) alerts.push('Long tail for a reverberant room. Try 2 beats, or keep the return fader low.');
      lastCopy = { ...(lastCopy || {}), dec: `${decText} ${state.units}` };
    } else {
      setText($('dec-num'), '–');
      $('dec-unit').textContent = state.units;
      $('dec-sub').textContent = 'Type beats from 0.5 to 8, in halves, under Options.';
    }
  }

  // Every cap in one sentence, then the long-tail notice, as slim banners under the results.
  if (capped.length) {
    const sameWay = capped.every((c) => c.dir === capped[0].dir);
    alerts.unshift(sameWay
      ? `Capped to ${capped.map((c) => c.value).join(' and ')} – this device can't go ${capped[0].dir}.`
      : capped.map((c) => `Capped to ${c.value} – this device can't go ${c.dir}.`).join(' '));
  }
  const box = $('warnings');
  box.textContent = '';
  box.classList.toggle('open', warnOpen);
  if (alerts.length) {
    // On short screens the banners collapse into this pill so the dial and Tap tempo never leave the screen.
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'warn-pill';
    pill.setAttribute('aria-expanded', String(warnOpen));
    const pillDot = document.createElement('i');
    pillDot.className = 'dot';
    pillDot.setAttribute('aria-hidden', 'true');
    pill.append(pillDot, document.createTextNode(`${alerts.length} warning${alerts.length === 1 ? '' : 's'}`));
    pill.addEventListener('click', () => { warnOpen = !warnOpen; render(); });
    box.append(pill);
  }
  for (const text of alerts) {
    const div = document.createElement('div');
    div.className = 'banner';
    const dot = document.createElement('i');
    dot.className = 'dot';
    dot.setAttribute('aria-hidden', 'true');
    const p = document.createElement('p');
    p.textContent = text;
    div.append(dot, p);
    box.append(div);
  }

  // With a warning on show the numbers shrink a little, so the dock never leaves the screen.
  document.querySelector('.stage').classList.toggle('has-alert', hasAlert);

  // copy buttons
  $('copy-pre').disabled = !(lastCopy && lastCopy.pre);
  $('copy-dec').disabled = !(lastCopy && lastCopy.dec);
  $('copy-both').disabled = !(lastCopy && lastCopy.pre && lastCopy.dec);
  document.querySelectorAll('.icon-btn:disabled, .btn:disabled').forEach((b) => { b.style.opacity = '0.4'; });
  document.querySelectorAll('.icon-btn:not(:disabled), .btn:not(:disabled)').forEach((b) => { b.style.opacity = ''; });

  // decay unit toggle, the beat light, and the number pad readout
  const unitBtn = $('dec-unit');
  unitBtn.textContent = state.units;
  unitBtn.setAttribute('aria-label', state.units === 's' ? 'Decay shown in seconds. Switch to milliseconds.' : 'Decay shown in milliseconds. Switch to seconds.');
  const tempo = validateBpm(state.bpm);
  const beat = $('beat');
  beat.classList.toggle('off', !tempo.ok);
  // Above 180 BPM it blinks every second beat, so it never flashes faster than about 3 times a second.
  if (tempo.ok) beat.style.setProperty('--beat', `${((60 / tempo.bpm) * (tempo.bpm > 180 ? 2 : 1)).toFixed(3)}s`);
  $('kp-value').textContent = state.bpm || '–';
  setDial(state.bpm || '–');
  for (const id of ['pre-value', 'dec-value']) {
    const numText = $(id === 'pre-value' ? 'pre-num' : 'dec-num').textContent;
    $(id).classList.toggle('long', numText.length >= 5);
  }
  centerActiveChip();

  // reduce glass
  document.documentElement.classList.toggle('reduce-glass', state.reduceGlass);
  $('glass-switch').setAttribute('aria-checked', String(state.reduceGlass));
  renderExtras();
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function setDial(text) {
  const el = $('bpm-text');
  if (el.dataset.v === text) return;
  el.dataset.v = text;
  el.textContent = '';
  const [whole, decimals] = text.split('.');
  el.append(document.createTextNode(whole));
  if (decimals !== undefined) {
    const small = document.createElement('span');
    small.className = 'dec';
    small.textContent = `.${decimals}`;
    el.append(small);
  }
  el.classList.toggle('long', text.length >= 6);
}

function setSub(el, text, flag) {
  el.textContent = text;
  if (flag) {
    const span = document.createElement('span');
    span.className = 'cap';
    span.textContent = ' · capped';
    el.append(span);
  }
}

/* ---------- steppers: ‹ value › for the pre-delay note and decay beats ---------- */
const NOTE_ORDER = ['1/64', '1/32', '1/16', 'custom'];
const BEATS_ORDER = ['2', '3', '4', 'custom'];
function renderSteppers() {
  const ni = NOTE_ORDER.indexOf(state.note);
  const bi = BEATS_ORDER.indexOf(state.beats);
  $('note-value').textContent = state.note === 'custom' ? 'Custom' : state.note;
  $('beats-value').textContent = state.beats === 'custom' ? 'Custom' : `${state.beats} beats`;
  $('note-prev').disabled = ni <= 0;
  $('note-next').disabled = ni >= NOTE_ORDER.length - 1;
  $('beats-prev').disabled = bi <= 0;
  $('beats-next').disabled = bi >= BEATS_ORDER.length - 1;
}
function stepOption(key, order, delta) {
  const i = order.indexOf(state[key]) + delta;
  if (i < 0 || i >= order.length) return;
  state[key] = order[i];
  saveState();
  render();
}
$('note-prev').addEventListener('click', () => stepOption('note', NOTE_ORDER, -1));
$('note-next').addEventListener('click', () => stepOption('note', NOTE_ORDER, 1));
$('beats-prev').addEventListener('click', () => stepOption('beats', BEATS_ORDER, -1));
$('beats-next').addEventListener('click', () => stepOption('beats', BEATS_ORDER, 1));

// Keep the chosen tempo chip in the middle of the strip, so the strip stays balanced around it.
function centerActiveChip() {
  const strip = $('chips');
  const active = strip.querySelector('.chip[aria-pressed="true"]');
  if (!active) return;
  const target = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
  strip.scrollTo({ left: Math.max(0, target), behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function setSeg(id, name, value) {
  const seg = $(id);
  const inputs = [...seg.querySelectorAll(`input[name="${name}"]`)];
  const idx = Math.max(0, inputs.findIndex((i) => i.value === value));
  inputs.forEach((i, n) => { i.checked = n === idx; });
  seg.style.setProperty('--i', String(idx));
}

/* ---------- BPM input ---------- */
function setBpm(value) {
  state.bpm = value;
  const input = $('bpm');
  if (input.value !== value) input.value = value;
  saveState();
  render();
}

/* BPM entry. On touch screens the built-in number pad opens so the phone keyboard never covers the
   results. With a physical keyboard you can just click the number and type. */
let kpOpen = false;
let kpFresh = true; // the next key replaces the whole value, like selecting it first
let bpmBeforePad = '';
let flashMsg = '';

function bpmAfterKey(cur, key, fresh) {
  if (key === 'back') return cur.slice(0, -1);
  if (key === '.') {
    if (fresh || cur === '') return '0.';
    return cur.includes('.') ? cur : `${cur}.`;
  }
  const next = (fresh ? '' : cur) + key;
  const [whole, decimals = ''] = next.split('.');
  return whole.length > 3 || decimals.length > 2 ? cur : next;
}
function pressKey(key) {
  const next = bpmAfterKey(state.bpm, key, kpFresh);
  kpFresh = false;
  resetTaps();
  setBpm(next);
}

function openKeypad() {
  if (kpOpen) return;
  kpOpen = true;
  document.documentElement.classList.add('kp-open');
  kpFresh = true;
  bpmBeforePad = state.bpm;
  const pad = $('keypad');
  pad.hidden = false;
  requestAnimationFrame(() => pad.classList.add('open'));
  render();
}
function closeKeypad() {
  if (!kpOpen) return;
  kpOpen = false;
  document.documentElement.classList.remove('kp-open');
  const pad = $('keypad');
  pad.classList.remove('open');
  setTimeout(() => { if (!kpOpen) pad.hidden = true; }, reducedMotion() ? 0 : 260);
  // A half-typed value (like "7") goes back to the last good tempo instead of leaving results blank.
  if (state.bpm !== '' && !validateBpm(state.bpm).ok) {
    state.bpm = validateBpm(bpmBeforePad).ok ? bpmBeforePad : '';
    $('bpm').value = state.bpm;
    saveState();
    flashMsg = `BPM must be between ${BPM_MIN} and ${BPM_MAX}.`;
    setTimeout(() => { flashMsg = ''; render(); }, 2500);
  }
  render();
}

function handleBpmKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (/^[0-9]$/.test(k)) pressKey(k);
  else if (k === '.' || k === ',') pressKey('.');
  else if (k === 'Backspace' || k === 'Delete') pressKey('back');
  else if (k === 'ArrowUp') stepBpm(1);
  else if (k === 'ArrowDown') stepBpm(-1);
  else if (k === 'Enter' || k === 'Escape') { closeKeypad(); if (k === 'Enter') $('bpm').blur(); }
  else return;
  e.preventDefault();
}
let lastTypedAt = 0;
document.addEventListener('keydown', (e) => {
  if (kpOpen) { handleBpmKey(e); return; }
  // With a keyboard, digits typed while nothing else is focused go straight to the tempo.
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!/^[0-9.]$/.test(e.key)) return;
  const now = Date.now();
  kpFresh = now - lastTypedAt > 1500;
  lastTypedAt = now;
  pressKey(e.key);
  setTimeout(render, 1600); // show the range message once the typing pause is over
  e.preventDefault();
});
$('type-btn').addEventListener('click', () => { kpFresh = true; openKeypad(); });
document.querySelectorAll('.kp-key').forEach((b) => b.addEventListener('click', () => { buzz(); pressKey(b.dataset.k); }));
$('kp-done').addEventListener('click', closeKeypad);
document.addEventListener('pointerdown', (e) => {
  if (kpOpen && !e.target.closest('#keypad') && !e.target.closest('#type-btn')) closeKeypad();
});

function stepBpm(delta) {
  const cur = parseNumber(state.bpm);
  let next = cur === null ? 120 : cur + delta;
  next = Math.min(BPM_MAX, Math.max(BPM_MIN, next));
  kpFresh = true;
  resetTaps();
  setBpm(String(Number(next.toFixed(1))));
}

// Press and hold repeats; keyboard activation (click with detail 0) steps once.
function holdRepeat(btn, delta) {
  let delay = null;
  let timer = null;
  const stop = () => { clearTimeout(delay); clearInterval(timer); delay = timer = null; };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    stepBpm(delta);
    delay = setTimeout(() => { timer = setInterval(() => stepBpm(delta), 80); }, 450);
  });
  ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((ev) => btn.addEventListener(ev, stop));
  btn.addEventListener('click', (e) => { if (e.detail === 0) stepBpm(delta); });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}
holdRepeat($('bpm-minus'), -1);
holdRepeat($('bpm-plus'), 1);

/* ---------- tap tempo ---------- */
let taps = [];
function resetTaps() {
  taps = [];
  $('tap-cap').textContent = 'Tap tempo';
}
// Only buzz right after a real touch; browsers log an error for vibration without one.
const buzz = () => {
  try {
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    navigator.vibrate?.(10);
  } catch { /* not supported */ }
};

$('tap').addEventListener('click', () => {
  buzz();
  kpFresh = true;
  const pad = $('tap');
  pad.classList.remove('hit');
  void pad.offsetWidth; // restart the flash on every tap
  pad.classList.add('hit');
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
  taps.push(now);
  taps = taps.slice(-6);
  if (taps.length < 2) return;
  const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
  const bpm = Math.round((60000 / avg) * 2) / 2;
  $('tap-cap').textContent = `Detected ${trimmed(bpm, 1)}`;
  setBpm(String(bpm));
});

$('reset').addEventListener('click', () => {
  resetTaps();
  Object.assign(state, { bpm: '', note: '1/32', feel: 'straight', beats: '3', customMs: '', customBeats: '' });
  $('bpm').value = '';
  $('custom-ms').value = '';
  $('custom-beats').value = '';
  saveState();
  render();
});

/* ---------- chips ---------- */
const chipBox = $('chips');
for (const n of CHIP_BPMS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.dataset.bpm = String(n);
  b.textContent = String(n);
  b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => { kpFresh = true; resetTaps(); setBpm(String(n)); });
  chipBox.append(b);
}

/* ---------- profile ---------- */
const sel = $('profile');
function populateProfiles() {
  sel.textContent = '';
  for (const p of allProfiles()) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    sel.append(o);
  }
  if (!allProfiles().some((p) => p.id === state.profileId)) state.profileId = DEFAULT_PROFILE.id;
  sel.value = state.profileId;
}
populateProfiles();
sel.addEventListener('change', () => { state.profileId = sel.value; saveState(); render(); });

/* ---------- options ---------- */
function onRadio(name, key) {
  document.querySelectorAll(`input[name="${name}"]`).forEach((i) => {
    i.addEventListener('change', () => { if (i.checked) { state[key] = i.value; saveState(); render(); } });
  });
}
onRadio('feel', 'feel');

// Tap the unit next to the decay number to flip between seconds and milliseconds.
$('dec-unit').addEventListener('click', () => {
  state.units = state.units === 's' ? 'ms' : 's';
  saveState();
  render();
});

function bindNumberField(id, key) {
  const el = $(id);
  el.value = state[key];
  el.addEventListener('input', () => {
    const clean = sanitizeNumber(el.value);
    if (clean !== el.value) el.value = clean;
    state[key] = clean;
    saveState();
    render();
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
}
bindNumberField('custom-ms', 'customMs');
bindNumberField('custom-beats', 'customBeats');

/* ---------- copy ---------- */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the old method */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
  document.body.append(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

function flashCopied(btn, label) {
  btn.classList.add('is-copied');
  const prev = label ? label.textContent : null;
  if (label) { label.textContent = 'Copied'; label.classList.add('is-copied'); }
  setTimeout(() => {
    btn.classList.remove('is-copied');
    if (label) { label.textContent = prev; label.classList.remove('is-copied'); }
  }, 1400);
}

function wireCopy(btnId, getText, labelEl) {
  const btn = $(btnId);
  btn.addEventListener('click', async () => {
    const text = getText();
    if (!text) return;
    if (await copyText(text)) { buzz(); flashCopied(btn, labelEl); }
  });
}
wireCopy('copy-pre', () => lastCopy && lastCopy.pre, $('copy-caption'));
wireCopy('copy-dec', () => lastCopy && lastCopy.dec, $('copy-caption'));
wireCopy('copy-both', () => (lastCopy && lastCopy.pre && lastCopy.dec ? `Pre-Delay ${lastCopy.pre} | Decay ${lastCopy.dec}` : null), $('copy-both-label'));


/* ---------- scroll to the extras ---------- */
$('more-link').addEventListener('click', () => {
  $('more').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
});

/* ---------- settings ---------- */
function bindSwitch(id, key) {
  $(id).addEventListener('click', () => { state[key] = !state[key]; saveState(); render(); });
}
bindSwitch('glass-switch', 'reduceGlass');
bindSwitch('starting-switch', 'showStarting');

function bindLimit(id, key) {
  const el = $(id);
  el.addEventListener('input', () => {
    const clean = sanitizeNumber(el.value);
    if (clean !== el.value) el.value = clean;
    const ok = validLimit(key, clean);
    el.setAttribute('aria-invalid', String(!ok));
    if (ok) { state[key] = clean; saveState(); render(); }
  });
  el.addEventListener('blur', () => { el.value = state[key]; el.setAttribute('aria-invalid', 'false'); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
}
bindLimit('locut', 'loCut');
bindLimit('hicut', 'hiCut');
bindLimit('longtail', 'longTailWarn');

function setIfIdle(id, value) {
  const el = $(id);
  if (document.activeElement !== el && el.value !== value) el.value = value;
}

function renderExtras() {
  $('also-card').hidden = !state.showStarting;
  $('starting-switch').setAttribute('aria-checked', String(state.showStarting));
  setIfIdle('locut', state.loCut);
  setIfIdle('hicut', state.hiCut);
  setIfIdle('longtail', state.longTailWarn);
  $('wake-switch').setAttribute('aria-checked', String(state.keepAwake));
  $('storage-note').hidden = storageOk;
  const canSave = validateBpm(state.bpm).ok && state.songs.length < MAX_SONGS;
  $('save-song').disabled = !canSave;
  $('save-song').style.opacity = canSave ? '' : '0.4';
}

/* ---------- keep screen awake ---------- */
let wakeLock = null;
async function acquireWake() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
    $('wake-msg').textContent = '';
  } catch {
    wakeLock = null;
    state.keepAwake = false;
    saveState();
    render();
    $('wake-msg').textContent = "This device wouldn't keep the screen awake.";
  }
}
async function releaseWake() {
  try { await wakeLock?.release(); } catch { /* already released */ }
  wakeLock = null;
}
if ('wakeLock' in navigator) {
  $('wake-row').hidden = false;
  $('wake-switch').addEventListener('click', () => {
    state.keepAwake = !state.keepAwake;
    saveState();
    render();
    if (state.keepAwake) acquireWake(); else releaseWake();
  });
  // The browser drops the lock when the tab is hidden, so take it again on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.keepAwake) acquireWake();
  });
  if (state.keepAwake) acquireWake();
}

/* ---------- small helpers for the lists ---------- */
const SVG_OPEN = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">';
const ICONS = {
  pencil: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 7.5l3 3"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M7 7l10 10M17 7L7 17"/>',
};
function iconButton(icon, label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn';
  b.setAttribute('aria-label', label);
  b.innerHTML = `${SVG_OPEN}${ICONS[icon]}</svg>`; // static markup only, no user text
  b.addEventListener('click', onClick);
  return b;
}
// Delete takes two taps: the first turns the button into "Delete?" for three seconds.
let pendingDelete = null;
let pendingTimer = null;
function armDelete(key, rerender) {
  pendingDelete = key;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { pendingDelete = null; rerender(); }, 3000);
  rerender();
}
function deleteButton(key, name, rerender, onConfirm) {
  const armed = pendingDelete === key;
  const b = iconButton('trash', armed ? `Confirm delete ${name}` : `Delete ${name}`, () => {
    if (pendingDelete === key) { pendingDelete = null; clearTimeout(pendingTimer); onConfirm(); } else armDelete(key, rerender);
  });
  if (armed) { b.classList.add('confirming'); b.textContent = 'Delete?'; }
  return b;
}

/* ---------- saved songs ---------- */
let editingSongId = null;
const songStatus = (text) => { $('songs-status').textContent = text; };

function songSummary(s) {
  const p = allProfiles().find((x) => x.id === s.profileId);
  const note = s.note === 'custom'
    ? `${s.customMs || '?'} ms pre-delay`
    : `${s.feel === 'straight' ? '' : s.feel + ' '}${s.note}`;
  const beats = `${s.beats === 'custom' ? (s.customBeats || '?') : s.beats} beats`;
  return `${s.bpm} BPM · ${note} · ${beats} · ${p ? p.name : 'Generic'}`;
}

function renderSongs() {
  const list = $('song-list');
  list.textContent = '';
  $('songs-empty').hidden = state.songs.length > 0;
  for (const s of state.songs) {
    const li = document.createElement('li');
    if (editingSongId === s.id) {
      li.append(songEditRow(s));
    } else {
      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'row-main';
      const t = document.createElement('span');
      t.className = 'row-title';
      t.textContent = s.name;
      const sub = document.createElement('span');
      sub.className = 'row-sub';
      sub.textContent = songSummary(s);
      main.append(t, sub);
      main.setAttribute('aria-label', `Load ${s.name}`);
      main.addEventListener('click', () => loadSong(s));
      li.append(
        main,
        iconButton('pencil', `Rename ${s.name}`, () => { editingSongId = s.id; renderSongs(); }),
        deleteButton(s.id, s.name, renderSongs, () => deleteSong(s)),
      );
    }
    list.append(li);
  }
}

function songEditRow(s) {
  const wrap = document.createElement('div');
  wrap.className = 'edit-row';
  const input = document.createElement('input');
  input.className = 'field';
  input.type = 'text';
  input.maxLength = 40;
  input.value = s.name;
  input.setAttribute('aria-label', `New name for ${s.name}`);
  const commit = () => {
    const name = cleanName(input.value);
    if (!name) { input.setAttribute('aria-invalid', 'true'); return; }
    s.name = name;
    editingSongId = null;
    saveState();
    renderSongs();
    songStatus('Renamed.');
  };
  const cancel = () => { editingSongId = null; renderSongs(); };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') cancel();
  });
  wrap.append(input, iconButton('check', 'Save name', commit), iconButton('x', 'Cancel rename', cancel));
  queueMicrotask(() => input.focus());
  return wrap;
}

function loadSong(s) {
  const known = allProfiles().some((p) => p.id === s.profileId);
  Object.assign(state, {
    bpm: s.bpm, note: s.note, feel: s.feel, beats: s.beats, customMs: s.customMs, customBeats: s.customBeats,
    profileId: known ? s.profileId : DEFAULT_PROFILE.id,
  });
  $('bpm').value = state.bpm;
  $('custom-ms').value = state.customMs;
  $('custom-beats').value = state.customBeats;
  sel.value = state.profileId;
  resetTaps();
  saveState();
  render();
  songStatus(known ? `Loaded “${s.name}”.` : `Loaded “${s.name}”. Its reverb unit was deleted, so Generic is selected.`);
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function deleteSong(s) {
  state.songs = state.songs.filter((x) => x.id !== s.id);
  saveState();
  renderSongs();
  renderExtras();
  songStatus(`Deleted “${s.name}”.`);
}

$('save-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (state.songs.length >= MAX_SONGS) { songStatus(`You can keep up to ${MAX_SONGS} songs. Delete one to save another.`); return; }
  const name = cleanName($('song-name').value) || 'Untitled';
  const song = sanitizeSong({
    name, bpm: state.bpm, profileId: state.profileId, note: state.note, feel: state.feel, beats: state.beats,
    customMs: state.customMs, customBeats: state.customBeats,
  });
  if (!song) { songStatus('Enter a BPM first.'); return; }
  state.songs.push(song);
  $('song-name').value = '';
  saveState();
  renderSongs();
  renderExtras();
  songStatus(`Saved “${song.name}”.`);
});

/* ---------- my reverb units ---------- */
let editingUnitId = null; // null = form closed, 'new' = adding, otherwise the id being edited
const unitFields = {
  name: $('unit-name'), preMin: $('u-pre-min'), preMax: $('u-pre-max'), preStep: $('u-pre-step'),
  decMin: $('u-dec-min'), decMax: $('u-dec-max'), decStep: $('u-dec-step'),
};

function unitSummary(p) {
  return `Pre-delay ${p.preDelay.minMs}–${p.preDelay.maxMs} ms, step ${p.preDelay.stepMs} · Decay ${p.decay.minS}–${p.decay.maxS} s, step ${p.decay.stepS}`;
}

function renderUnits() {
  const list = $('unit-list');
  list.textContent = '';
  for (const p of state.customProfiles) {
    const li = document.createElement('li');
    const main = document.createElement('div');
    main.className = 'row-main';
    const t = document.createElement('span');
    t.className = 'row-title';
    t.textContent = p.name;
    const sub = document.createElement('span');
    sub.className = 'row-sub';
    sub.textContent = unitSummary(p);
    main.append(t, sub);
    li.append(
      main,
      iconButton('pencil', `Edit ${p.name}`, () => openUnitForm(p)),
      deleteButton(p.id, p.name, renderUnits, () => deleteUnit(p)),
    );
    list.append(li);
  }
  const full = state.customProfiles.length >= MAX_CUSTOM_PROFILES;
  $('unit-add').disabled = full;
  $('unit-add').style.opacity = full ? '0.4' : '';
  $('unit-add').hidden = editingUnitId !== null;
}

function openUnitForm(p) {
  const base = p || { name: '', preDelay: { minMs: 0, maxMs: 500, stepMs: 0.1 }, decay: { minS: 0.1, maxS: 20, stepS: 0.01 } };
  editingUnitId = p ? p.id : 'new';
  unitFields.name.value = base.name;
  unitFields.preMin.value = String(base.preDelay.minMs);
  unitFields.preMax.value = String(base.preDelay.maxMs);
  unitFields.preStep.value = String(base.preDelay.stepMs);
  unitFields.decMin.value = String(base.decay.minS);
  unitFields.decMax.value = String(base.decay.maxS);
  unitFields.decStep.value = String(base.decay.stepS);
  $('unit-error').textContent = '';
  $('unit-form').hidden = false;
  $('unit-add').hidden = true;
  unitFields.name.focus();
}

function closeUnitForm() {
  editingUnitId = null;
  $('unit-form').hidden = true;
  $('unit-add').hidden = false;
  renderUnits();
}

function deleteUnit(p) {
  state.customProfiles = state.customProfiles.filter((x) => x.id !== p.id);
  if (state.profileId === p.id) state.profileId = DEFAULT_PROFILE.id;
  saveState();
  populateProfiles();
  renderUnits();
  render();
}

$('unit-add').addEventListener('click', () => {
  if (state.customProfiles.length >= MAX_CUSTOM_PROFILES) return;
  openUnitForm(null);
});
$('unit-cancel').addEventListener('click', closeUnitForm);
$('unit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (editingUnitId === null) return;
  // Read the raw text (no cleanup) so "-1" is reported, not quietly turned into "1".
  const num = (el) => {
    const t = el.value.trim().replace(',', '.');
    return t === '' ? NaN : Number(t);
  };
  const isNew = editingUnitId === 'new';
  if (isNew && state.customProfiles.length >= MAX_CUSTOM_PROFILES) {
    $('unit-error').textContent = `You can keep up to ${MAX_CUSTOM_PROFILES} units.`;
    return;
  }
  const made = createCustomProfile({
    id: isNew ? newId('custom') : editingUnitId,
    name: cleanName(unitFields.name.value),
    preDelay: { minMs: num(unitFields.preMin), maxMs: num(unitFields.preMax), stepMs: num(unitFields.preStep) },
    decay: { minS: num(unitFields.decMin), maxS: num(unitFields.decMax), stepS: num(unitFields.decStep) },
  });
  if (!made.ok) { $('unit-error').textContent = made.reason; return; }
  if (isNew) {
    state.customProfiles.push(made.profile);
    state.profileId = made.profile.id;
  } else {
    state.customProfiles = state.customProfiles.map((x) => (x.id === made.profile.id ? made.profile : x));
  }
  saveState();
  populateProfiles();
  closeUnitForm();
  render();
});

/* ---------- export and import ---------- */
const backupMsg = (text) => { $('backup-msg').textContent = text; };
let pendingImport = null;

$('export-btn').addEventListener('click', () => {
  if (!state.songs.length && !state.customProfiles.length) { backupMsg('Nothing to export yet. Save a song or add a unit first.'); return; }
  const blob = new Blob([JSON.stringify(buildBackup({ songs: state.songs, profiles: state.customProfiles }), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'reverb-calc-backup.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  backupMsg(`Backup file created with ${state.songs.length} song${state.songs.length === 1 ? '' : 's'} and ${state.customProfiles.length} unit${state.customProfiles.length === 1 ? '' : 's'}.`);
});

$('import-btn').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  $('import-confirm').hidden = true;
  pendingImport = null;
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) { backupMsg('That file is too big to be a backup from this app.'); return; }
  let text;
  try { text = await file.text(); } catch { backupMsg("That file couldn't be read."); return; }
  const result = parseBackup(text);
  if (!result.ok) { backupMsg(result.reason); return; }
  pendingImport = result;
  const n = result.songs.length;
  const u = result.profiles.length;
  const skipped = result.dropped ? ` ${result.dropped} item${result.dropped === 1 ? '' : 's'} in the file couldn't be used and will be left out.` : '';
  $('import-confirm-text').textContent = `This file has ${n} song${n === 1 ? '' : 's'} and ${u} custom unit${u === 1 ? '' : 's'}.${skipped} Add them to what you have now, or replace everything you have now?`;
  backupMsg('');
  $('import-confirm').hidden = false;
  $('import-add').focus();
});

function finishImport(merged, text) {
  state.songs = merged.songs;
  state.customProfiles = merged.profiles;
  saveState();
  populateProfiles();
  renderSongs();
  renderUnits();
  render();
  pendingImport = null;
  $('import-confirm').hidden = true;
  backupMsg(text);
}
$('import-add').addEventListener('click', () => {
  if (!pendingImport) return;
  const m = mergeBackup({ songs: state.songs, profiles: state.customProfiles }, pendingImport);
  const skipped = m.skipped ? ` ${m.skipped} didn't fit within the limits and were left out.` : '';
  finishImport(m, `Added ${m.addedSongs} song${m.addedSongs === 1 ? '' : 's'} and ${m.addedProfiles} unit${m.addedProfiles === 1 ? '' : 's'}.${skipped}`);
});
$('import-replace').addEventListener('click', () => {
  if (!pendingImport) return;
  const m = mergeBackup({ songs: [], profiles: [] }, pendingImport);
  finishImport(m, `Replaced with ${m.addedSongs} song${m.addedSongs === 1 ? '' : 's'} and ${m.addedProfiles} unit${m.addedProfiles === 1 ? '' : 's'}.`);
});
$('import-cancel').addEventListener('click', () => {
  pendingImport = null;
  $('import-confirm').hidden = true;
  backupMsg('Import cancelled. Nothing was changed.');
});

/* ---------- start ---------- */
$('bpm').value = state.bpm;
renderSongs();
renderUnits();
// The thumb should not slide in from the left on first paint.
document.querySelectorAll('.seg .thumb').forEach((t) => { t.style.transition = 'none'; });
render();
requestAnimationFrame(() => requestAnimationFrame(() => {
  document.querySelectorAll('.seg .thumb').forEach((t) => { t.style.transition = ''; });
}));

/* ---------- version, install hint, offline and updates ---------- */
$('version').textContent = `Version ${APP_VERSION}`;

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function tipDismissed() {
  try { return localStorage.getItem(TIP_KEY) === '1'; } catch { return false; }
}
function showTip(text, withInstall) {
  if (isStandalone() || tipDismissed()) return;
  $('install-text').textContent = text;
  $('install-btn').hidden = !withInstall;
  $('install-tip').hidden = false;
}
$('install-close').addEventListener('click', () => {
  $('install-tip').hidden = true;
  try { localStorage.setItem(TIP_KEY, '1'); } catch { /* ignore */ }
});

let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  showTip('Install this app to use it offline from your home screen.', true);
});
$('install-btn').addEventListener('click', async () => {
  if (!installEvent) return;
  installEvent.prompt();
  try { await installEvent.userChoice; } catch { /* ignore */ }
  installEvent = null;
  $('install-tip').hidden = true;
});
window.addEventListener('appinstalled', () => { $('install-tip').hidden = true; });
if (isIos()) showTip('To install: tap Share, then Add to Home Screen.', false);

let swReg = null;
const updateMsg = (text) => { $('update-msg').textContent = text; };

if ('serviceWorker' in navigator) {
  let reloading = false;
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The very first install also fires this (no older version was running, so no reload). Every later
    // change is a real update, even if the app was first opened in this same session.
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  const offerUpdate = (worker) => {
    const bar = $('update-bar');
    bar.hidden = false;
    bar.onclick = () => worker.postMessage('SKIP_WAITING');
    updateMsg('An update is ready. Tap the bar at the top of the screen to install it.');
  };

  // updateViaCache 'none' makes the browser fetch a fresh sw.js every time instead of trusting a cached copy.
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    swReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });

    // An iPhone home-screen app is usually resumed, not relaunched, and iOS only looks for a new version
    // on a fresh launch. So ask for one ourselves: now, whenever the app comes back to the front, and every 30 minutes.
    const check = () => { reg.update().catch(() => { /* offline: try again later */ }); };
    check();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    window.addEventListener('pageshow', check);
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => { /* offline support unavailable; the app still works online */ });
}

$('update-check').addEventListener('click', async () => {
  if (!swReg) { updateMsg("Updates can't be checked in this browser. Reload the page to get the latest version."); return; }
  updateMsg('Checking…');
  try {
    await swReg.update();
  } catch {
    updateMsg("Couldn't check. Are you online?");
    return;
  }
  if (swReg.waiting) { offerUpdateNow(); return; }
  if (swReg.installing) {
    updateMsg('Downloading the update…');
    swReg.installing.addEventListener('statechange', function () {
      if (this.state === 'installed') offerUpdateNow();
    });
    return;
  }
  updateMsg(`You're on the latest version (${APP_VERSION}).`);
});
function offerUpdateNow() {
  const worker = swReg && swReg.waiting;
  if (!worker) return;
  $('update-bar').hidden = false;
  $('update-bar').onclick = () => worker.postMessage('SKIP_WAITING');
  updateMsg('An update is ready. Tap the bar at the top of the screen to install it.');
}
