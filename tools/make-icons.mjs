// Draws the app icons (a pre-delay flat run into a decay curve) with no dependencies.
// Run from the project root: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x09, 0x0e, 0x14];
const FG = [0xca, 0xe7, 0xf9];
const STROKE = 0.075;

/** Glyph in unit-square coordinates: short flat run (pre-delay), then an exponential decay. */
function glyph(scale) {
  const pts = [[0.2, 0.3], [0.3, 0.3]];
  for (let i = 1; i <= 64; i++) {
    const t = i / 64;
    pts.push([0.3 + 0.5 * t, 0.3 + 0.4 * (1 - Math.exp(-4 * t))]);
  }
  return pts.map(([x, y]) => [0.5 + (x - 0.5) * scale, 0.5 + (y - 0.5) * scale]);
}

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function render(size, scale) {
  const pts = glyph(scale);
  const half = (STROKE * scale) / 2;
  const SS = 4;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) / size;
          const py = (y + (sy + 0.5) / SS) / size;
          let d = Infinity;
          for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment(px, py, pts[i], pts[i + 1]));
          if (d <= half) hit++;
        }
      }
      const a = hit / (SS * SS);
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) rgba[o + c] = Math.round(BG[c] + (FG[c] - BG[c]) * a);
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0;
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('icons', { recursive: true });
// Maskable icons keep the glyph inside the central 80% safe zone.
const jobs = [['icon-180.png', 180, 1], ['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['icon-maskable-512.png', 512, 0.68]];
for (const [name, size, scale] of jobs) {
  writeFileSync(`icons/${name}`, png(size, render(size, scale)));
  console.log('wrote', name);
}

const d = glyph(1).map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 64).toFixed(2)} ${(y * 64).toFixed(2)}`).join('');
writeFileSync('icons/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#090E14"/><path d="${d}" fill="none" stroke="#CAE7F9" stroke-width="${(STROKE * 64).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`);
console.log('wrote favicon.svg');
