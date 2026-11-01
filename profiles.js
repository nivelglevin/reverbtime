// Device profiles. Data only, no DOM. Limits are used by calc.js for clamping and rounding.

/**
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} name
 * @property {{minMs:number, maxMs:number, stepMs:number}} preDelay
 * @property {{minS:number, maxS:number, stepS:number}} decay
 * @property {string} notes
 * @property {boolean} verified
 */

/** @type {Profile} */
export const GENERIC = {
  id: 'generic',
  name: 'Generic',
  preDelay: { minMs: 0, maxMs: 500, stepMs: 0.1 },
  decay: { minS: 0.1, maxS: 20, stepS: 0.01 },
  notes: 'No console limits. Works for any reverb.',
  verified: true,
};

/** @type {Profile} */
export const X32 = {
  id: 'x32',
  name: 'Behringer X32 / Midas M32',
  preDelay: { minMs: 0, maxMs: 200, stepMs: 1 },
  decay: { minS: 0.2, maxS: 5.0, stepS: 0.01 },
  notes: 'RT60-style decay. Verify on the Reverb screen.',
  verified: false,
};

/** @type {Profile} */
export const PLUGIN = {
  id: 'plugin',
  name: 'Plugin / DAW (no limits)',
  preDelay: { minMs: 0, maxMs: 500, stepMs: 0.1 },
  decay: { minS: 0.1, maxS: 20, stepS: 0.01 },
  notes: 'No device limits. Pre-delay shown to 1 decimal.',
  verified: true,
};

export const MAX_CUSTOM_PROFILES = 20;
const MIN_STEP = 0.001;
const MAX_LIMIT = 100000;

/** Built-in profiles in display order. Generic is the default. */
export const BUILT_IN_PROFILES = [GENERIC, X32, PLUGIN];
export const DEFAULT_PROFILE = GENERIC;

/**
 * Build a user-defined profile. Never throws.
 * Limits apply to both pre-delay (ms) and decay (s) unless separate ones are given.
 * @param {{name:string, preDelay:{minMs:number,maxMs:number,stepMs:number}, decay:{minS:number,maxS:number,stepS:number}, id?:string}} input
 * @returns {{ok:true, profile:Profile} | {ok:false, reason:string}}
 */
export function createCustomProfile(input) {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'Missing profile details.' };

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, reason: 'Give the profile a name.' };
  if (name.length > 40) return { ok: false, reason: 'Name is too long (40 characters max).' };

  const pre = checkRange(input.preDelay, 'minMs', 'maxMs', 'stepMs', 'Pre-delay');
  if (!pre.ok) return pre;
  const dec = checkRange(input.decay, 'minS', 'maxS', 'stepS', 'Decay');
  if (!dec.ok) return dec;

  return {
    ok: true,
    profile: {
      id: typeof input.id === 'string' && input.id ? input.id : `custom-${Date.now().toString(36)}`,
      name,
      preDelay: { minMs: pre.min, maxMs: pre.max, stepMs: pre.step },
      decay: { minS: dec.min, maxS: dec.max, stepS: dec.step },
      notes: 'Your own limits.',
      // The limits are the user's own, so the "Verify on your console" badge would not make sense.
      verified: true,
    },
  };
}

function checkRange(obj, minKey, maxKey, stepKey, label) {
  if (!obj || typeof obj !== 'object') return { ok: false, reason: `${label} limits are missing.` };
  const min = obj[minKey];
  const max = obj[maxKey];
  const step = obj[stepKey];
  if (![min, max, step].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return { ok: false, reason: `${label} min, max and step must be numbers.` };
  }
  if (min < 0) return { ok: false, reason: `${label} min can't be negative.` };
  if (!(min < max)) return { ok: false, reason: `${label} min must be lower than max.` };
  if (!(step > 0)) return { ok: false, reason: `${label} step must be above 0.` };
  if (step > max - min) return { ok: false, reason: `${label} step must fit inside the min to max range.` };
  // Keeps typos and hostile imports from producing absurd rounding.
  if (step < MIN_STEP) return { ok: false, reason: `${label} step must be at least ${MIN_STEP}.` };
  if (max > MAX_LIMIT) return { ok: false, reason: `${label} max must be ${MAX_LIMIT} or lower.` };
  return { ok: true, min, max, step };
}
