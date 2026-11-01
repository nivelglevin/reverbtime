import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, noteMs, roundToStep, validateBpm } from './calc.js';
import { GENERIC, X32, PLUGIN, createCustomProfile, BUILT_IN_PROFILES } from './profiles.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not close to ${b}`);

test('120 BPM worked example (Generic)', () => {
  const r = calculate({ bpm: 120 });
  assert.equal(r.ok, true);
  assert.equal(r.quarterMs, 500);
  assert.equal(r.profileId, 'generic');
  assert.equal(r.preDelay.ms, 62.5);
  assert.equal(r.preDelay.fraction, '1/32');
  assert.equal(r.preDelay.feel, 'straight');
  assert.equal(r.decay.beats, 3);
  assert.equal(r.decay.s, 1.5);
  assert.equal(calculate({ bpm: 120, fraction: '1/16' }).preDelay.ms, 125);
  assert.equal(calculate({ bpm: 120, fraction: '1/64' }).preDelay.ms, 31.25);
  assert.equal(calculate({ bpm: 120, fraction: '1/16', feel: 'dotted' }).preDelay.ms, 187.5);
  near(calculate({ bpm: 120, fraction: '1/16', feel: 'triplet' }).preDelay.ms, 83.3333333333);
  assert.equal(calculate({ bpm: 120, beats: 4 }).decay.s, 2);
});

test('62.5 ms shows as 63 on a 1 ms step device', () => {
  assert.equal(calculate({ bpm: 120, profile: X32 }).preDelay.msRounded, 63);
  assert.equal(calculate({ bpm: 120, profile: X32 }).preDelay.ms, 62.5);
});

test('return shape', () => {
  const r = calculate({ bpm: 120 });
  assert.deepEqual(Object.keys(r).sort(), ['bpm', 'decay', 'ok', 'preDelay', 'profileId', 'quarterMs']);
  assert.deepEqual(Object.keys(r.preDelay).sort(), ['clamped', 'feel', 'fraction', 'ms', 'msRounded']);
  assert.deepEqual(Object.keys(r.decay).sort(), ['beats', 'clamped', 'longTail', 's', 'sRounded']);
});

test('BPM boundaries and decimals', () => {
  assert.equal(calculate({ bpm: 40 }).quarterMs, 1500);
  assert.equal(calculate({ bpm: 220 }).ok, true);
  const r = calculate({ bpm: 97.5 });
  assert.equal(r.ok, true);
  assert.equal(r.bpm, 97.5);
  near(r.quarterMs, 60000 / 97.5);
  assert.equal(calculate({ bpm: '120' }).quarterMs, 500);
});

test('invalid BPM returns ok:false and never throws', () => {
  const bad = ['', '   ', 0, -5, NaN, Infinity, 'abc', '12abc', 39.9, 220.1, null, undefined, {}, [], true];
  for (const bpm of bad) {
    const r = calculate({ bpm });
    assert.equal(r.ok, false, `bpm ${String(bpm)} should be rejected`);
    assert.equal(typeof r.reason, 'string');
    assert.ok(r.reason.length > 0);
  }
  for (const input of [undefined, null, 5, 'x']) assert.equal(calculate(input).ok, false);
  assert.equal(validateBpm(39.9).ok, false);
  assert.equal(validateBpm(220.1).ok, false);
});

test('every pre-delay option at 100 BPM (quarter 600 ms)', () => {
  assert.equal(calculate({ bpm: 100, fraction: '1/32' }).preDelay.ms, 75);
  assert.equal(calculate({ bpm: 100, fraction: '1/16' }).preDelay.ms, 150);
  assert.equal(calculate({ bpm: 100, fraction: '1/64' }).preDelay.ms, 37.5);
  const custom = calculate({ bpm: 100, fraction: 'custom', customMs: 42 });
  assert.equal(custom.preDelay.ms, 42);
  assert.equal(custom.preDelay.fraction, 'custom');
  assert.equal(calculate({ bpm: 100, fraction: 'custom', customMs: 0 }).preDelay.ms, 0);
});

test('invalid custom ms and unknown options are rejected', () => {
  for (const customMs of [-1, NaN, Infinity, '40', undefined]) {
    assert.equal(calculate({ bpm: 100, fraction: 'custom', customMs }).ok, false);
  }
  assert.equal(calculate({ bpm: 100, fraction: '1/3' }).ok, false);
  assert.equal(calculate({ bpm: 100, feel: 'swing' }).ok, false);
});

test('every decay option plus custom beats (quarter 500 ms)', () => {
  assert.equal(calculate({ bpm: 120, beats: 2 }).decay.s, 1);
  assert.equal(calculate({ bpm: 120, beats: 3 }).decay.s, 1.5);
  assert.equal(calculate({ bpm: 120, beats: 4 }).decay.s, 2);
  assert.equal(calculate({ bpm: 120, beats: 0.5 }).decay.s, 0.25);
  assert.equal(calculate({ bpm: 120, beats: 7.5 }).decay.s, 3.75);
  assert.equal(calculate({ bpm: 120, beats: 8 }).decay.s, 4);
  for (const beats of [0, 0.4, 8.5, 1.25, -1, NaN, '3']) {
    assert.equal(calculate({ bpm: 120, beats }).ok, false, `beats ${beats}`);
  }
});

test('X32 caps decay at 5.0 s and reports the original', () => {
  const r = calculate({ bpm: 40, beats: 4, profile: X32 });
  assert.equal(r.decay.s, 6);
  assert.equal(r.decay.sRounded, 5);
  assert.equal(r.decay.clamped, true);
  assert.equal(r.decay.original, 6);
});

test('X32 caps pre-delay at 200 ms and applies the 0.2 s decay floor', () => {
  const pre = calculate({ bpm: 40, fraction: '1/16', profile: X32 });
  assert.equal(pre.preDelay.msRounded, 200);
  assert.equal(pre.preDelay.clamped, true);
  assert.equal(pre.preDelay.original, 375);
  const dec = calculate({ bpm: 220, beats: 0.5, profile: X32 });
  assert.equal(dec.decay.sRounded, 0.2);
  assert.equal(dec.decay.clamped, true);
});

test('Generic does not clamp the same input', () => {
  const r = calculate({ bpm: 40, beats: 4, profile: GENERIC });
  assert.equal(r.decay.sRounded, 6);
  assert.equal(r.decay.clamped, false);
  assert.equal('original' in r.decay, false);
});

test('Plugin profile has no practical limits', () => {
  const r = calculate({ bpm: 40, beats: 8, profile: PLUGIN });
  assert.equal(r.decay.s, 12);
  assert.equal(r.decay.clamped, false);
});

test('custom profile limits and step rounding', () => {
  const made = createCustomProfile({
    name: 'My unit',
    preDelay: { minMs: 10, maxMs: 100, stepMs: 5 },
    decay: { minS: 0.5, maxS: 3, stepS: 0.25 },
  });
  assert.equal(made.ok, true);
  const profile = made.profile;
  const a = calculate({ bpm: 120, profile });
  assert.equal(a.preDelay.msRounded, 65);
  assert.equal(a.preDelay.clamped, false);
  assert.equal(a.profileId, profile.id);
  const b = calculate({ bpm: 60, fraction: '1/16', profile });
  assert.equal(b.preDelay.msRounded, 100);
  assert.equal(b.preDelay.original, 250);
  const c = calculate({ bpm: 120, beats: 8, profile });
  assert.equal(c.decay.sRounded, 3);
  assert.equal(c.decay.clamped, true);
  const d = calculate({ bpm: 97.5, beats: 3, profile });
  assert.equal(d.decay.sRounded, 1.75);
  assert.equal(calculate({ bpm: 120, fraction: 'custom', customMs: 2, profile }).preDelay.msRounded, 10);
});

test('custom profile validation', () => {
  const ok = { name: 'A', preDelay: { minMs: 0, maxMs: 10, stepMs: 1 }, decay: { minS: 0, maxS: 1, stepS: 0.1 } };
  assert.equal(createCustomProfile(ok).ok, true);
  const cases = [
    undefined,
    null,
    { ...ok, name: '' },
    { ...ok, name: '   ' },
    { ...ok, preDelay: { minMs: 10, maxMs: 10, stepMs: 1 } },
    { ...ok, preDelay: { minMs: 20, maxMs: 10, stepMs: 1 } },
    { ...ok, preDelay: { minMs: 0, maxMs: 10, stepMs: 0 } },
    { ...ok, preDelay: { minMs: 0, maxMs: 10, stepMs: -1 } },
    { ...ok, decay: { minS: 0, maxS: 1, stepS: NaN } },
    { ...ok, decay: { minS: '0', maxS: 1, stepS: 0.1 } },
    { ...ok, decay: undefined },
  ];
  for (const c of cases) {
    const r = createCustomProfile(c);
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, 'string');
  }
});

test('built-in profiles', () => {
  assert.deepEqual(BUILT_IN_PROFILES.map((p) => p.id), ['generic', 'x32', 'plugin']);
  assert.equal(GENERIC.verified, true);
  assert.equal(X32.verified, false);
  assert.deepEqual(X32.preDelay, { minMs: 0, maxMs: 200, stepMs: 1 });
  assert.deepEqual(X32.decay, { minS: 0.2, maxS: 5, stepS: 0.01 });
});

test('longTail is false at exactly 2.0 s and true at 2.01 s', () => {
  const at2 = calculate({ bpm: 120, beats: 4 });
  assert.equal(at2.decay.s, 2);
  assert.equal(at2.decay.longTail, false);
  const at201 = calculate({ bpm: 240 / 2.01, beats: 4 });
  near(at201.decay.s, 2.01, 1e-6);
  assert.equal(at201.decay.sRounded, 2.01);
  assert.equal(at201.decay.longTail, true);
  assert.equal(calculate({ bpm: 120, beats: 3 }).decay.longTail, false);
  assert.equal(calculate({ bpm: 120, beats: 4, longTailWarnS: 1.5 }).decay.longTail, true);
});

test('helpers', () => {
  assert.equal(noteMs(120, '1/4'), 500);
  assert.equal(noteMs(120, '1/8'), 250);
  assert.equal(noteMs(120, '1/32', 'dotted'), 93.75);
  assert.equal(roundToStep(62.5, 1), 63);
  assert.equal(roundToStep(83.3333, 0.1), 83.3);
  assert.equal(roundToStep(1.005, 0.01), 1.01);
});
