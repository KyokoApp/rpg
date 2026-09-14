/* ============================================================
   check-imports.mjs — penjaga "halaman blank total".

   Bug yang pernah terjadi di repo ini: jsm/loaders/GLTFLoader.js meng-import
   '../utils/BufferGeometryUtils.js' yang tidak pernah di-commit. Karena itu
   STATIC import, seluruh module graph gagal di-resolve browser dan
   <script type="module"> di index.html tidak pernah dieksekusi sama sekali —
   halaman cuma menampilkan "Loading..." selamanya, tanpa error yang terlihat.

   Skrip ini menelusuri setiap specifier import di seluruh repo dan memastikan
   file tujuannya benar-benar ada; memastikan importmap di index.html menunjuk
   ke file nyata; dan memastikan setiap getElementById() punya elemen dengan id
   itu di HTML (kecuali yang memang dibuat runtime).

   Jalankan:  node tools/check-imports.mjs     (exit code 1 kalau ada masalah)
   Tidak butuh dependensi apa pun.
============================================================ */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP = new Set(['.git', 'node_modules', '.vercel', 'dist', 'build']);
const problems = [];
const checked = { imports: 0, files: 0, ids: 0 };

/* ---------- kumpulkan file ---------- */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name), out); }
    else if (/\.(js|mjs|html)$/.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}
const files = walk(ROOT);

/* ---------- buang komentar supaya string di dalam komentar tidak ikut terjaring ---------- */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))   // jaga jumlah baris
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

/* ---------- pola import yang sungguhan ----------
   Hanya cocok pada pernyataan import/export, bukan pada teks "from ..." yang
   kebetulan ada di dalam string (mis. console.warn('... from "srgb-linear"')). */
const PATTERNS = [
  /\bimport\s+[^'";()]*?from\s*['"]([^'"]+)['"]/gs,   // import x from '...'  (termasuk multi-baris)
  /\bexport\s+[^'";()]*?from\s*['"]([^'"]+)['"]/gs,   // export { x } from '...'
  /\bimport\s*['"]([^'"]+)['"]/g,                      // import '...'  (side-effect)
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,            // await import('...')
];
/* specifier yang memang bukan file lokal */
const EXTERNAL = /^(node:|https?:|data:|blob:)/;

/* ---------- importmap ---------- */
const INDEX = path.join(ROOT, 'index.html');
const indexHtml = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8') : '';
const importmap = (() => {
  const m = indexHtml.match(/<script[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); }
  catch (e) { problems.push(`importmap di index.html bukan JSON valid: ${e.message}`); return null; }
})();

/* URL di importmap di-resolve terhadap BASE URL DOKUMEN (root repo), bukan
   terhadap direktori file yang meng-import — persis seperti perilaku browser. */
function mapBare(spec) {
  if (!importmap || !importmap.imports) return null;
  const exact = importmap.imports[spec];
  if (exact) return path.resolve(ROOT, exact);
  for (const [prefix, target] of Object.entries(importmap.imports)) {
    if (prefix.endsWith('/') && spec.startsWith(prefix))
      return path.resolve(ROOT, target + spec.slice(prefix.length));
  }
  return null;
}

/* ---------- periksa tiap file ---------- */
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const raw = fs.readFileSync(file, 'utf8');
  checked.files++;

  const chunks = file.endsWith('.html')
    ? [...raw.matchAll(/<script[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
    : [raw];

  for (const chunk of chunks) {
    const code = stripComments(chunk);
    const specs = new Set();
    for (const re of PATTERNS) { re.lastIndex = 0; for (const m of code.matchAll(re)) specs.add(m[1]); }

    for (const spec of specs) {
      if (EXTERNAL.test(spec)) continue;
      checked.imports++;
      const target = spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : mapBare(spec);

      if (!target) {
        problems.push(`${rel}: specifier '${spec}' tidak bisa di-resolve — bukan path relatif ` +
          `dan tidak ada di importmap (repo ini tidak punya package.json/node_modules)`);
      } else if (!fs.existsSync(target)) {
        problems.push(`${rel}: '${spec}' menunjuk ke file yang TIDAK ADA: ` +
          `${path.relative(ROOT, target)}   <- module graph gagal, halaman jadi blank total`);
      }
    }
  }

  /* target importmap sendiri harus benar-benar ada */
  if (rel === 'index.html' && importmap && importmap.imports) {
    for (const [spec, target] of Object.entries(importmap.imports)) {
      const p = path.resolve(ROOT, target);          // prefix mapping boleh menunjuk direktori
      if (!fs.existsSync(p)) problems.push(`importmap: '${spec}' -> '${target}' tidak ada di disk`);
    }
  }
}

/* ---------- getElementById vs id di HTML ---------- */
/* id yang sengaja dibuat runtime lewat svgEl() di buildGauge(), bukan markup statis */
const RUNTIME_IDS = new Set(['gKmh', 'gUnit', 'gGear', 'gGearLbl']);
if (indexHtml) {
  const cut = indexHtml.indexOf('<script type="module">');
  const htmlPart = cut > 0 ? indexHtml.slice(0, cut) : indexHtml;
  const ids = new Set([...htmlPart.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  for (const m of indexHtml.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) {
    checked.ids++;
    if (!ids.has(m[1]) && !RUNTIME_IDS.has(m[1]))
      problems.push(`index.html: getElementById('${m[1]}') tidak punya elemen dengan id itu di HTML`);
  }
}

/* ---------- hasil ----------
   Catatan: teks pesan di bawah sengaja TIDAK diawali kata "import" + tanda kutip,
   karena skrip ini memindai dirinya sendiri dan pola itu akan terjaring sebagai
   specifier palsu. */
console.log(`diperiksa: ${checked.files} file, ${checked.imports} specifier import lokal, ${checked.ids} getElementById`);
if (importmap) console.log('importmap: ' + Object.entries(importmap.imports).map(([k, v]) => `${k} -> ${v}`).join(', '));

if (problems.length === 0) {
  console.log('\n✅ module graph utuh — tidak ada import yang menunjuk ke file hilang');
  process.exitCode = 0;
} else {
  console.log(`\n❌ ${problems.length} MASALAH:`);
  for (const p of [...new Set(problems)]) console.log('   - ' + p);
  process.exitCode = 1;
}
