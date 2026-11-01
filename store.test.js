import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SONGS, MAX_NAME, MAX_FILE_BYTES, cleanName, sanitizeSong, sanitizeProfile, sanitizeSongList,
  buildBackup, parseBackup, mergeBackup,
} from './store.js';
import { createCustomProfile, MAX_CUSTOM_PROFILES } from './profiles.js';
import { calculate } from './calc.js';

const goodSong = (over = {}) => ({ name: 'Amazing Grace', bpm: '72', profileId: 'generic', note: '1/32', feel: 'straight', beats: '3', customMs: '', customBeats: '', ...over });
const goodProfile = (over = {}) => ({ name: 'My unit', preDelay: { minMs: 0, maxMs: 100, stepMs: 1 }, decay: { minS: 0.2, maxS: 4, stepS: 0.1 }, ...over });

test('cleanName trims, collapses, strips control characters and caps length', () => {
  assert.equal(cleanName('  Hello \n\t world  '), 'Hello world');
  assert.equal(cleanName('a\u0000b\u0007c'), 'a b c');
  assert.equal(cleanName('x'.repeat(500)).length, MAX_NAME);
  for (const v of [undefined, null, 5, {}, [], true]) assert.equal(cleanName(v), '');
});

test('sanitizeSong accepts a good song and fills safe defaults', () => {
  const s = sanitizeSong(goodSong());
  assert.equal(s.name, 'Amazing Grace');
  assert.equal(s.bpm, '72');
  assert.match(s.id, /^song-/);
  const d = sanitizeSong({ name: 'X', bpm: 100, note: 'nope', feel: 7, beats: '9', profileId: '<script>' });
  assert.deepEqual([d.note, d.feel, d.beats, d.profileId, d.bpm], ['1/32', 'straight', '3', 'generic', '100']);
});

test('sanitizeSong rejects unusable songs', () => {
  const bad = [null, undefined, 'x', 5, [], {}, goodSong({ name: '' }), goodSong({ name: '   ' }), goodSong({ name: 5 }),
    goodSong({ bpm: 39 }), goodSong({ bpm: 221 }), goodSong({ bpm: 'abc' }), goodSong({ bpm: '' }), goodSong({ bpm: NaN })];
  for (const b of bad) assert.equal(sanitizeSong(b), null);
});

test('sanitizeSong drops unknown keys and unsafe numeric strings', () => {
  const s = sanitizeSong({ ...goodSong(), __proto__: { evil: 1 }, constructor: 'x', extra: 'y', customMs: '<b>1</b>', customBeats: '3.5' });
  assert.deepEqual(Object.keys(s).sort(), ['beats', 'bpm', 'customBeats', 'customMs', 'feel', 'id', 'name', 'note', 'profileId']);
  assert.equal(s.customMs, '');
  assert.equal(s.customBeats, '3.5');
  assert.equal(({}).evil, undefined);
});

test('keepId only keeps ids that are safe', () => {
  assert.equal(sanitizeSong(goodSong({ id: 'song-abc_1' }), { keepId: true }).id, 'song-abc_1');
  assert.match(sanitizeSong(goodSong({ id: '../../x' }), { keepId: true }).id, /^song-/);
  assert.match(sanitizeSong(goodSong({ id: 'song-abc_1' })).id, /^song-/);
  assert.notEqual(sanitizeSong(goodSong({ id: 'song-abc_1' })).id, 'song-abc_1');
});

test('sanitizeProfile applies the profile rules', () => {
  assert.equal(sanitizeProfile(goodProfile()).name, 'My unit');
  const bad = [null, 'x', {}, goodProfile({ name: '' }), goodProfile({ preDelay: { minMs: 10, maxMs: 5, stepMs: 1 } }),
    goodProfile({ preDelay: { minMs: 0, maxMs: 10, stepMs: 0 } }), goodProfile({ preDelay: { minMs: 0, maxMs: 10, stepMs: 0.0001 } }),
    goodProfile({ decay: { minS: 0, maxS: 1e9, stepS: 1 } }), goodProfile({ decay: { minS: '0', maxS: 1, stepS: 1 } }),
    goodProfile({ preDelay: null })];
  for (const b of bad) assert.equal(sanitizeProfile(b), null);
});

test('a step larger than the range is rejected', () => {
  assert.equal(sanitizeProfile(goodProfile({ preDelay: { minMs: 0, maxMs: 1, stepMs: 5 } })), null);
  assert.equal(createCustomProfile(goodProfile({ preDelay: { minMs: 0, maxMs: 5, stepMs: 5 } })).ok, true);
  assert.equal(createCustomProfile(goodProfile({ decay: { minS: 1, maxS: 2, stepS: 1.5 } })).ok, false);
});

test('a custom profile from sanitizeProfile clamps and rounds in calculate()', () => {
  const p = sanitizeProfile(goodProfile());
  const r = calculate({ bpm: 40, beats: 4, fraction: '1/16', profile: p });
  assert.equal(r.preDelay.msRounded, 100);
  assert.equal(r.preDelay.clamped, true);
  assert.equal(r.preDelay.original, 375);
  assert.equal(r.decay.sRounded, 4);
  assert.equal(r.decay.clamped, true);
  const ok = calculate({ bpm: 97.5, profile: p });
  assert.equal(ok.preDelay.msRounded, 77);
  assert.equal(ok.decay.sRounded, 1.8);
  assert.equal(createCustomProfile(goodProfile()).profile.verified, true);
});

test('sanitizeSongList caps at 50, drops duplicates and junk', () => {
  const many = Array.from({ length: 80 }, (_, i) => goodSong({ name: `S${i}`, id: `song-${i}` }));
  assert.equal(sanitizeSongList(many).length, MAX_SONGS);
  assert.equal(sanitizeSongList([goodSong({ id: 'a' }), goodSong({ id: 'a' }), null, 5]).length, 1);
  assert.deepEqual(sanitizeSongList('nope'), []);
  assert.deepEqual(sanitizeSongList({ length: 3 }), []);
});

test('export then import round-trips', () => {
  const songs = [sanitizeSong(goodSong({ id: 'song-1' }), { keepId: true }), sanitizeSong(goodSong({ name: 'Second', bpm: '97.5', note: 'custom', customMs: '45' }), { keepId: true })];
  const profiles = [sanitizeProfile(goodProfile({ id: 'custom-1' }), { keepId: true })];
  const text = JSON.stringify(buildBackup({ songs, profiles }));
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.dropped, 0);
  assert.deepEqual(parsed.songs, songs);
  assert.deepEqual(parsed.profiles, profiles);
});

test('parseBackup rejects bad and hostile files without throwing', () => {
  const valid = { app: 'reverb-calc', format: 1, songs: [goodSong()], profiles: [] };
  const rejected = [
    undefined, null, 5, '', 'not json', '{', '[]', 'null', '"x"', '42',
    JSON.stringify({}), JSON.stringify({ app: 'other', format: 1, songs: [goodSong()] }),
    JSON.stringify({ ...valid, format: 2 }), JSON.stringify({ ...valid, format: '1' }),
    JSON.stringify({ app: 'reverb-calc', format: 1 }), JSON.stringify({ ...valid, songs: 'x', profiles: 'y' }),
    JSON.stringify({ ...valid, songs: [{ name: '', bpm: 1 }, null, 7] }),
    JSON.stringify({ ...valid, songs: [goodSong({ bpm: 5000 })] }),
    'x'.repeat(MAX_FILE_BYTES + 1),
  ];
  for (const t of rejected) {
    const r = parseBackup(t);
    assert.equal(r.ok, false, String(t).slice(0, 40));
    assert.equal(typeof r.reason, 'string');
  }
});

test('parseBackup survives prototype pollution attempts and oversized lists', () => {
  const evil = '{"app":"reverb-calc","format":1,"__proto__":{"polluted":true},"songs":[{"name":"A","bpm":90,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}],"profiles":[]}';
  const r = parseBackup(evil);
  assert.equal(r.ok, true);
  assert.equal(({}).polluted, undefined);
  assert.equal(r.songs[0].polluted, undefined);
  const big = JSON.stringify({ app: 'reverb-calc', format: 1, songs: Array.from({ length: 500 }, (_, i) => goodSong({ name: `S${i}` })), profiles: [] });
  const rb = parseBackup(big);
  assert.equal(rb.ok, true);
  assert.equal(rb.songs.length, MAX_SONGS);
  assert.equal(rb.dropped, 450);
  const html = parseBackup(JSON.stringify({ app: 'reverb-calc', format: 1, songs: [goodSong({ name: '<img src=x onerror=alert(1)>' })] }));
  assert.equal(html.songs[0].name, '<img src=x onerror=alert(1)>'); // kept as text; the UI only ever uses textContent
});

test('parseBackup keeps the good items and counts the dropped ones', () => {
  const r = parseBackup(JSON.stringify({ app: 'reverb-calc', format: 1, songs: [goodSong(), { name: 'bad', bpm: 1 }], profiles: [goodProfile(), { name: 'bad' }] }));
  assert.equal(r.ok, true);
  assert.equal(r.songs.length, 1);
  assert.equal(r.profiles.length, 1);
  assert.equal(r.dropped, 2);
});

test('mergeBackup adds with fresh ids, remaps units, and respects the caps', () => {
  const importedProfile = sanitizeProfile(goodProfile({ id: 'custom-x' }), { keepId: true });
  const imported = {
    profiles: [importedProfile],
    songs: [
      sanitizeSong(goodSong({ name: 'Uses unit', profileId: 'custom-x' })),
      sanitizeSong(goodSong({ name: 'Uses X32', profileId: 'x32' })),
      sanitizeSong(goodSong({ name: 'Unknown unit', profileId: 'custom-gone' })),
    ],
  };
  const current = { songs: [sanitizeSong(goodSong({ name: 'Mine' }))], profiles: [] };
  const m = mergeBackup(current, imported);
  assert.equal(m.songs.length, 4);
  assert.equal(m.profiles.length, 1);
  assert.notEqual(m.profiles[0].id, 'custom-x');
  assert.equal(m.songs[1].profileId, m.profiles[0].id);
  assert.equal(m.songs[2].profileId, 'x32');
  assert.equal(m.songs[3].profileId, 'generic');
  assert.equal(current.songs.length, 1);
  assert.equal(new Set(m.songs.map((s) => s.id)).size, 4);

  const full = { songs: Array.from({ length: MAX_SONGS }, (_, i) => sanitizeSong(goodSong({ name: `S${i}` }))), profiles: Array.from({ length: MAX_CUSTOM_PROFILES }, (_, i) => sanitizeProfile(goodProfile({ name: `P${i}` }))) };
  const capped = mergeBackup(full, imported);
  assert.equal(capped.songs.length, MAX_SONGS);
  assert.equal(capped.profiles.length, MAX_CUSTOM_PROFILES);
  assert.equal(capped.addedSongs, 0);
  assert.equal(capped.skipped, 4);
});
