// Saved songs and backup files. Pure logic, no DOM: every value that comes from storage or an
// imported file is rebuilt field by field, so unknown keys and odd types never get through.
import { validateBpm } from './calc.js';
import { createCustomProfile, BUILT_IN_PROFILES, MAX_CUSTOM_PROFILES } from './profiles.js';

export const MAX_SONGS = 50;
export const MAX_NAME = 40;
export const MAX_FILE_BYTES = 262144;
export const NOTES = ['1/64', '1/32', '1/16', 'custom'];
export const FEELS = ['straight', 'dotted', 'triplet'];
export const BEATS = ['2', '3', '4', 'custom'];

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NUM_RE = /^\d{0,5}(\.\d{0,4})?$/;
const BUILT_IN_IDS = BUILT_IN_PROFILES.map((p) => p.id);

/** @typedef {{id:string, name:string, bpm:string, profileId:string, note:string, feel:string, beats:string, customMs:string, customBeats:string}} Song */

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Trim, collapse whitespace, drop control characters, cap the length. Returns '' for non-strings. */
export function cleanName(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

function numberText(v) {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
  return typeof v === 'string' && NUM_RE.test(v) ? v : '';
}

/**
 * Rebuild a song from untrusted data. Returns null if it can't be used.
 * @param {unknown} raw
 * @param {{keepId?:boolean}} [opts]
 * @returns {Song|null}
 */
export function sanitizeSong(raw, { keepId = false } = {}) {
  if (!isPlainObject(raw)) return null;
  const name = cleanName(raw.name);
  if (!name) return null;
  const bpm = validateBpm(raw.bpm);
  if (!bpm.ok) return null;
  return {
    id: keepId && typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : newId('song'),
    name,
    bpm: String(bpm.bpm),
    profileId: typeof raw.profileId === 'string' && ID_RE.test(raw.profileId) ? raw.profileId : 'generic',
    note: NOTES.includes(raw.note) ? raw.note : '1/32',
    feel: FEELS.includes(raw.feel) ? raw.feel : 'straight',
    beats: BEATS.includes(raw.beats) ? raw.beats : '3',
    customMs: numberText(raw.customMs),
    customBeats: numberText(raw.customBeats),
  };
}

/**
 * Rebuild a custom profile from untrusted data. Returns null if it fails the profile rules.
 * @param {unknown} raw
 * @param {{keepId?:boolean}} [opts]
 */
export function sanitizeProfile(raw, { keepId = false } = {}) {
  if (!isPlainObject(raw) || !isPlainObject(raw.preDelay) || !isPlainObject(raw.decay)) return null;
  const made = createCustomProfile({
    name: cleanName(raw.name),
    id: keepId && typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : newId('custom'),
    preDelay: { minMs: raw.preDelay.minMs, maxMs: raw.preDelay.maxMs, stepMs: raw.preDelay.stepMs },
    decay: { minS: raw.decay.minS, maxS: raw.decay.maxS, stepS: raw.decay.stepS },
  });
  return made.ok ? made.profile : null;
}

export function sanitizeSongList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const s = sanitizeSong(raw, { keepId: true });
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
    if (out.length >= MAX_SONGS) break;
  }
  return out;
}

export function sanitizeProfileList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set(BUILT_IN_IDS);
  const out = [];
  for (const raw of list) {
    const p = sanitizeProfile(raw, { keepId: true });
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= MAX_CUSTOM_PROFILES) break;
  }
  return out;
}

export function buildBackup({ songs, profiles }) {
  return { app: 'reverb-calc', format: 1, exportedAt: new Date().toISOString(), songs, profiles };
}

/**
 * Check a backup file's text. Never throws.
 * @param {unknown} text
 * @returns {{ok:true, songs:Song[], profiles:object[], dropped:number} | {ok:false, reason:string}}
 */
export function parseBackup(text) {
  if (typeof text !== 'string') return { ok: false, reason: "That file couldn't be read." };
  if (text.length > MAX_FILE_BYTES) return { ok: false, reason: 'That file is too big to be a backup from this app.' };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "That isn't a valid backup file." };
  }
  if (!isPlainObject(data) || data.app !== 'reverb-calc') {
    return { ok: false, reason: "That doesn't look like a Reverb Time Calculator backup." };
  }
  if (data.format !== 1) return { ok: false, reason: 'That backup was made by a different version of the app.' };
  if (!Array.isArray(data.songs) && !Array.isArray(data.profiles)) {
    return { ok: false, reason: 'That backup has no songs or custom units in it.' };
  }
  const rawSongs = Array.isArray(data.songs) ? data.songs : [];
  const rawProfiles = Array.isArray(data.profiles) ? data.profiles : [];
  const songs = sanitizeSongList(rawSongs);
  const profiles = sanitizeProfileList(rawProfiles);
  if (!songs.length && !profiles.length) return { ok: false, reason: 'Nothing in that file could be used.' };
  return { ok: true, songs, profiles, dropped: rawSongs.length + rawProfiles.length - songs.length - profiles.length };
}

/**
 * Add imported items to what the user already has. Imported items get fresh ids so nothing can
 * collide with or replace existing data; songs follow their custom unit to its new id.
 */
export function mergeBackup(current, imported) {
  const idMap = new Map();
  const profiles = [...current.profiles];
  let addedProfiles = 0;
  let skipped = 0;
  for (const p of imported.profiles) {
    if (profiles.length >= MAX_CUSTOM_PROFILES) { skipped++; continue; }
    const id = newId('custom');
    idMap.set(p.id, id);
    profiles.push({ ...p, id });
    addedProfiles++;
  }
  const songs = [...current.songs];
  let addedSongs = 0;
  for (const s of imported.songs) {
    if (songs.length >= MAX_SONGS) { skipped++; continue; }
    let profileId = s.profileId;
    if (idMap.has(profileId)) profileId = idMap.get(profileId);
    else if (!BUILT_IN_IDS.includes(profileId)) profileId = 'generic';
    songs.push({ ...s, id: newId('song'), profileId });
    addedSongs++;
  }
  return { songs, profiles, addedSongs, addedProfiles, skipped };
}
