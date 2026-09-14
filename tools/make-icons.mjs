#!/usr/bin/env node
/* ============================================================
   PENJENER IKON PWA — TANPA dependensi apa pun.

   Mengerjakan:
     icons/icon-192.png         (manifest "any")
     icons/icon-512.png         (manifest "any")
     icons/icon-512-maskable.png (manifest "maskable" — aman dipotong)
     icons/apple-touch-icon.png  (180×180, iOS)

   PNG di-encode manual (signature + IHDR + IDAT zlib + IEND) dari
   buffer RGBA8 — deterministik: input sama = byte sama, jadi file
   hasil boleh di-commit dan CI tidak pernah menghasilkan diff.

   Jalankan:  node tools/make-icons.mjs [out-dir]   (default: icons)
   ============================================================ */
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

/* ---------- encoder PNG (RGBA 8-bit) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf){
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data){
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePNG(width, height, rgba){
  const sig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  const raw = Buffer.alloc((width*4 + 1) * height);
  for (let y = 0; y < height; y++){
    raw[y*(width*4+1)] = 0;                       // filter: None
    rgba.copy(raw, y*(width*4+1) + 1, y*width*4, (y+1)*width*4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- palet (sama dengan game: langit senja + orb emas) ---------- */
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);
const C8 = v => Math.round(v < 0 ? 0 : (v > 255 ? 255 : v));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

function hex(s){ return [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)]; }
const C_TOP   = hex('#2b4a40');   // langit atas (hijau senja)
const C_BOT   = hex('#12181b');   // dasar
const C_GLOW  = hex('#f2a63e');   // cahaya orb
const C_CORE  = hex('#fff6d8');
const C_MID   = hex('#ffe08a');
const C_OUT   = hex('#ffcf63');
const C_RING  = hex('#e8d4a1');
const C_GROUND= hex('#0e1417');
const C_LINE  = hex('#d9c593');

/* Gambar satu ikon ke buffer RGBA.
   scale: mengecilkan seluruh motif agar aman untuk "maskable"
   (zona aman maskable = lingkaran diameter 80% di tengah). */
function drawIcon(size, scale = 1){
  const buf = Buffer.alloc(size * size * 4);
  const c05 = size * 0.5;
  const cx = c05, cy = size * 0.44 * scale + c05 * (1 - scale);
  for (let y = 0; y < size; y++){
    for (let x = 0; x < size; x++){
      const u = x / (size - 1), v = y / (size - 1);
      // latar: gradasi vertikal + pendaran hangat di belakang orb
      let r = mix(C_TOP[0], C_BOT[0], v);
      let g = mix(C_TOP[1], C_BOT[1], v);
      let b = mix(C_TOP[2], C_BOT[2], v);
      const d = Math.hypot(x - cx, y - cy) / size;
      const warm = Math.pow(1 - clamp01(d / (0.62 * scale + 0.38)), 2) * 0.16;
      r = mix(r, C_GLOW[0], warm); g = mix(g, C_GLOW[1], warm); b = mix(b, C_GLOW[2], warm);
      // strip tanah + garis horizon tipis
      if (v > 0.80){
        r = C_GROUND[0]; g = C_GROUND[1]; b = C_GROUND[2];
        const dl = Math.abs(v - 0.80) * size;
        if (dl < 1.2) { const a = (1 - dl / 1.2) * 0.5; r = mix(r, C_LINE[0], a); g = mix(g, C_LINE[1], a); b = mix(b, C_LINE[2], a); }
      }
      // orb: inti -> tengah -> luar -> pendaran
      const rr = d / scale;
      let cr = r, cg = g, cb = b, ca = 1;
      if (rr <= 0.13)        { cr = C_CORE[0]; cg = C_CORE[1]; cb = C_CORE[2]; }
      else if (rr <= 0.20)   { const t = smooth(0.13, 0.20, rr); cr = mix(C_CORE[0], C_MID[0], t); cg = mix(C_CORE[1], C_MID[1], t); cb = mix(C_CORE[2], C_MID[2], t); }
      else if (rr <= 0.26)   { const t = smooth(0.20, 0.26, rr); cr = mix(C_MID[0], C_OUT[0], t); cg = mix(C_MID[1], C_OUT[1], t); cb = mix(C_MID[2], C_OUT[2], t); }
      else if (rr <= 0.55)   { const a = Math.pow(1 - (rr - 0.26) / 0.29, 1.7) * 0.85; cr = mix(r, C_GLOW[0], a); cg = mix(g, C_GLOW[1], a); cb = mix(b, C_GLOW[2], a); }
      // cincin halo
      if (rr > 0.30 && rr <= 0.33){
        const a = (1 - Math.abs(rr - 0.315) / 0.015) * 0.55;
        cr = mix(cr, C_RING[0], a); cg = mix(cg, C_RING[1], a); cb = mix(cb, C_RING[2], a);
      }
      const i = (y * size + x) * 4;
      buf[i] = C8(cr); buf[i+1] = C8(cg); buf[i+2] = C8(cb); buf[i+3] = C8(255 * ca);
    }
  }
  return buf;
}

const outDir = path.resolve(process.cwd(), process.argv[2] || 'icons');
fs.mkdirSync(outDir, { recursive: true });
const targets = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-512-maskable.png', 512, 0.72],
  ['apple-touch-icon.png', 180, 1],
];
for (const [name, size, scale] of targets){
  const file = path.join(outDir, name);
  fs.writeFileSync(file, encodePNG(size, size, drawIcon(size, scale)));
  console.log('[ICONS]', name, size + 'x' + size, (fs.statSync(file).size/1024).toFixed(1) + ' KB');
}
console.log('[ICONS] selesai ->', outDir);
