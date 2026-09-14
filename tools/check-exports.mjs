/* ============================================================
   CHECK-EXPORTS — memverifikasi setiap nama yang di-impor blok modul
   index.html benar-benar diekspor oleh modul tujuannya.

   Kenapa perlu (dan kenapa check-imports.mjs tidak cukup):
   check-imports.mjs hanya memastikan FILE-nya ada. Kalau sebuah modul
   ada tapi tidak mengekspor nama yang diminta, browser gagal saat
   linking dan game mati total di layar hitam — tanpa error yang
   terlihat, dan tanpa satu pun tes headless yang gagal.

   Alat ini meng-impor modul sungguhan (lewat hook importmap yang sama
   dengan tes) lalu memeriksa binding-nya, jadi kegagalan semacam itu
   tertangkap sebelum sampai ke pemain.

   Jalankan:  node tools/check-exports.mjs
============================================================ */
import '../tests/importmap.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const blocks = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
if (blocks.length !== 1) {
  console.error(`❌ diharapkan tepat 1 blok <script type="module">, ditemukan ${blocks.length}`);
  process.exit(1);
}
const blk = blocks[0][1];

/* import { a, b as c } from './x.mjs'  — juga yang multiline */
const re = /import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g;

let m, bad = 0, checked = 0, specs = 0;
const missingFiles = [];

while ((m = re.exec(blk))) {
  specs++;
  const rel = m[2];
  const abs = path.join(ROOT, rel);
  const names = m[1]
    .split(',')
    .map(s => s.replace(/\/\/[^\n]*/g, '').trim())
    .filter(Boolean)
    .map(s => s.split(/\s+as\s+/)[0].trim());

  if (!fs.existsSync(abs)) { missingFiles.push(rel); bad++; continue; }

  let mod;
  try {
    mod = await import(pathToFileURL(abs).href);
  } catch (err) {
    console.log(`❌ gagal mengimpor ${rel}: ${err.message}`);
    bad++;
    continue;
  }
  for (const n of names) {
    checked++;
    if (!(n in mod)) {
      console.log(`❌ '${n}' tidak diekspor oleh ${rel}`);
      bad++;
    }
  }
}

/* namespace import (* as X) dan default import selalu aman selama
   file-nya ada, tapi tetap pastikan file-nya benar-benar ada */
for (const rel of blk.matchAll(/import\s+(?:\*\s+as\s+\w+|\w+)\s+from\s*['"](\.[^'"]+)['"]/g)) {
  specs++;
  if (!fs.existsSync(path.join(ROOT, rel[1]))) { missingFiles.push(rel[1]); bad++; }
}
/* side-effect import: import './x.mjs' */
for (const rel of blk.matchAll(/import\s*['"](\.[^'"]+)['"]/g)) {
  specs++;
  if (!fs.existsSync(path.join(ROOT, rel[1]))) { missingFiles.push(rel[1]); bad++; }
}

if (missingFiles.length) {
  console.log('file hilang:', [...new Set(missingFiles)].join(', '));
}

console.log(`diperiksa: ${specs} specifier import lokal, ${checked} nama impor`);
if (bad) {
  console.log(`\n❌ ${bad} masalah`);
  process.exit(1);
}
console.log('\n✅ semua nama impor tersedia di modul tujuannya');
