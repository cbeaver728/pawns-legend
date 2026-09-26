// Renders the app icon to PNG (for home-screen installs) with no dependencies.
// Run once: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4x supersampling for smooth edges.
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const p = pixel(((x + (sx + 0.5) / 4) / size) * 64, ((y + (sy + 0.5) / 4) / size) * 64);
        for (let i = 0; i < 4; i++) acc[i] += p[i] / 16;
      }
      raw.set(acc.map(Math.round), y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function pixel(x, y) {
  const bgTop = [58, 45, 99, 255], bgBot = [28, 20, 56, 255];
  let c = mix(bgTop, bgBot, y / 64);
  const gold = mix([255, 231, 160, 255], [217, 161, 58, 255], Math.max(0, Math.min(1, (y - 10) / 45)));
  const head = Math.hypot(x - 32, y - 19) < 8;
  const collar = y >= 29 && y < 32 && x > 25 + (y - 29) * 0.67 && x < 39 - (y - 29) * 0.67;
  const bodyT = (y - 32) / 16;
  const body = y >= 32 && y < 48 && Math.abs(x - 32) < 3 + bodyT * 3;
  const base = y >= 48 && y < 54 && x >= 18 && x <= 46;
  if (head || collar || body || base) c = gold;
  return c;
}
for (const s of [192, 512]) writeFileSync(new URL(`../public/icon-${s}.png`, import.meta.url), png(s, pixel));
console.log('icons written');
