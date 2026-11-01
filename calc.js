// Reverb math. Pure functions, no DOM, never throws on bad input.
import { DEFAULT_PROFILE } from './profiles.js';

export const BPM_MIN = 40;
export const BPM_MAX = 220;
export const LONG_TAIL_WARN_S = 2.0;
export const CUSTOM_BEATS_MIN = 0.5;
export const CUSTOM_BEATS_MAX = 8;
export const CUSTOM_BEATS_STEP = 0.5;

/** Note fraction relative to a quarter note (1/4 = 1). */
export const FRACTIONS = { '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125, '1/64': 0.0625 };
export const FEELS = { straight: 1, dotted: 1.5, triplet: 2 / 3 };

export const PRE_DELAY_OPTIONS = [
  { fraction: '1/32', label: 'Tight', hint: 'Best for live vocals', isDefault: true },
  { fraction: '1/16', label: 'Roomy', hint: '' },
  { fraction: '1/64', label: 'Very tight', hint: '' },
  { fraction: 'custom', label: 'Custom ms', hint: '' },
];
export const DECAY_BEAT_OPTIONS = [2, 3, 4];
export const DEFAULT_DECAY_BEATS = 3;

/** @typedef {import('./profiles.js').Profile} Profile */

/**
 * @typedef {Object} CalcInput
 * @property {number|string} bpm
 * @property {'1/32'|'1/16'|'1/64'|'custom'} [fraction] default '1/32'
 * @property {'straight'|'dotted'|'triplet'} [feel] default 'straight'
 * @property {number} [customMs] used when fraction is 'custom'
 * @property {number} [beats] decay length in beats, default 3. Custom: 0.5 to 8 in steps of 0.5
 * @property {Profile} [profile] default Generic
 * @property {number} [longTailWarnS] default 2.0
 */

/**
 * @typedef {Object} CalcResult
 * @property {true} ok
 * @property {number} bpm
 * @property {number} quarterMs
 * @property {{ms:number, msRounded:number, fraction:string, feel:string, clamped:boolean, original?:number}} preDelay
 *   ms is the exact value; msRounded is what to type in (rounded to the profile step, then limited)
 * @property {{s:number, sRounded:number, beats:number, clamped:boolean, longTail:boolean, original?:number}} decay
 * @property {string} profileId
 */

/**
 * @param {unknown} input
 * @returns {{ok:true, bpm:number} | {ok:false, reason:string}}
 */
export function validateBpm(input) {
  let n = input;
  if (typeof n === 'string') {
    if (n.trim() === '') return { ok: false, reason: 'Enter a BPM.' };
    n = Number(n);
  }
  if (typeof n !== 'number') return { ok: false, reason: 'Enter a BPM.' };
  if (!Number.isFinite(n)) return { ok: false, reason: 'BPM must be a number.' };
  if (n < BPM_MIN || n > BPM_MAX) return { ok: false, reason: `BPM must be between ${BPM_MIN} and ${BPM_MAX}.` };
  return { ok: true, bpm: n };
}

/** @param {number} bpm */
export function quarterMs(bpm) {
  return 60000 / bpm;
}

/**
 * Length of a note in ms.
 * @param {number} bpm
 * @param {keyof typeof FRACTIONS} fraction
 * @param {keyof typeof FEELS} [feel]
 */
export function noteMs(bpm, fraction, feel = 'straight') {
  return quarterMs(bpm) * FRACTIONS[fraction] * FEELS[feel];
}

/** Decay time in seconds for a number of beats. */
export function decaySeconds(bpm, beats) {
  return (quarterMs(bpm) * beats) / 1000;
}

function decimalsOf(step) {
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** Round to the nearest multiple of step, without float noise. */
export function roundToStep(value, step) {
  if (!(step > 0)) return value;
  // The epsilon stops values like 1.005 landing just under .5 of a step and rounding down.
  return Number((Math.round(value / step + 1e-9) * step).toFixed(decimalsOf(step)));
}

/**
 * Round to the step, then keep inside min..max.
 * `clamped` is true when the exact value was outside the range; `original` is that exact value.
 */
export function applyLimits(value, min, max, step) {
  const rounded = roundToStep(value, step);
  const clamped = value < min || value > max;
  const limited = Math.min(max, Math.max(min, rounded));
  return clamped ? { value: limited, clamped, original: value } : { value: limited, clamped };
}

/**
 * @param {CalcInput} input
 * @returns {CalcResult | {ok:false, reason:string}}
 */
export function calculate(input) {
  try {
    const i = input && typeof input === 'object' ? input : {};
    const bpmCheck = validateBpm(i.bpm);
    if (!bpmCheck.ok) return bpmCheck;
    const bpm = bpmCheck.bpm;

    const profile = i.profile ?? DEFAULT_PROFILE;
    const warnS = Number.isFinite(i.longTailWarnS) ? i.longTailWarnS : LONG_TAIL_WARN_S;
    const q = quarterMs(bpm);

    const fraction = i.fraction ?? '1/32';
    let feel = i.feel ?? 'straight';
    let preRaw;
    if (fraction === 'custom') {
      const ms = i.customMs;
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
        return { ok: false, reason: 'Custom pre-delay must be 0 ms or more.' };
      }
      preRaw = ms;
      feel = 'straight';
    } else {
      if (!PRE_DELAY_OPTIONS.some((o) => o.fraction === fraction)) {
        return { ok: false, reason: 'Unknown pre-delay option.' };
      }
      if (!(feel in FEELS)) return { ok: false, reason: 'Unknown note feel.' };
      preRaw = noteMs(bpm, fraction, feel);
    }

    const beats = i.beats ?? DEFAULT_DECAY_BEATS;
    const beatsOk =
      typeof beats === 'number' &&
      Number.isFinite(beats) &&
      beats >= CUSTOM_BEATS_MIN &&
      beats <= CUSTOM_BEATS_MAX &&
      Number.isInteger(beats / CUSTOM_BEATS_STEP);
    if (!beatsOk) {
      return { ok: false, reason: `Decay must be ${CUSTOM_BEATS_MIN} to ${CUSTOM_BEATS_MAX} beats, in steps of ${CUSTOM_BEATS_STEP}.` };
    }
    const decayRaw = decaySeconds(bpm, beats);

    const pd = profile.preDelay;
    const dc = profile.decay;
    const pre = applyLimits(preRaw, pd.minMs, pd.maxMs, pd.stepMs);
    const dec = applyLimits(decayRaw, dc.minS, dc.maxS, dc.stepS);

    const preDelay = { ms: preRaw, msRounded: pre.value, fraction, feel, clamped: pre.clamped };
    if (pre.clamped) preDelay.original = pre.original;
    const decay = { s: decayRaw, sRounded: dec.value, beats, clamped: dec.clamped, longTail: dec.value > warnS };
    if (dec.clamped) decay.original = dec.original;

    return { ok: true, bpm, quarterMs: q, preDelay, decay, profileId: profile.id };
  } catch {
    return { ok: false, reason: 'Could not calculate. Check your values.' };
  }
}
