/* ============================================================
   TES SHADER POSTFX — membandingkan konstanta GLSL di game/postfx.mjs
   dengan sumber aslinya di three.module.js (vendored r160).

   Kenapa perlu: postfx menerapkan ACES + sRGB secara manual karena
   three hanya melakukannya saat merender ke kanvas. Kalau satu angka
   matriks salah salin, gambar bergeser warnanya dan TIDAK ADA tes lain
   yang bisa menangkapnya (tidak ada GPU di CI). Tes ini yang menangkap.
============================================================ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const postfx = fs.readFileSync(path.join(root, 'game/postfx.mjs'), 'utf8');

/* tonemapping_pars_fragment & colorspace_pars_fragment disimpan sebagai
   string JS ter-escape di dalam three.module.js -> unescape dulu. */
function chunk(name) {
  const src = fs.readFileSync(path.join(root, 'three.module.js'), 'utf8');
  const i = src.indexOf('var ' + name);
  assert.ok(i >= 0, `chunk ${name} tidak ditemukan di three.module.js`);
  const j = src.indexOf('";', i);
  return src.slice(i, j).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
}
const nums = txt => txt.match(/-?\d+\.\d+/g) || [];

function matrix(txt, name) {
  const k = txt.indexOf(name + ' = mat3(');
  assert.ok(k >= 0, `matriks ${name} tidak ditemukan`);
  return nums(txt.slice(k, txt.indexOf(');', k)));
}

test('matriks ACES postfx identik dengan three r160', () => {
  const tm = chunk('tonemapping_pars_fragment');
  for (const m of ['ACESInputMat', 'ACESOutputMat']) {
    assert.deepEqual(matrix(postfx, m), matrix(tm, m), `${m} harus sama persis`);
  }
});

test('koefisien RRTAndODTFit identik dengan three r160', () => {
  const tm = chunk('tonemapping_pars_fragment');
  const grab = txt => {
    const k = txt.indexOf('vec3 RRTAndODTFit');
    const e = txt.indexOf('\n}', k);
    return nums(txt.slice(k, e));
  };
  assert.deepEqual(grab(postfx), grab(tm), 'kurva RRT/ODT harus sama persis');
});

test('sRGB OETF postfx identik dengan three r160', () => {
  const cs = chunk('colorspace_pars_fragment');
  const grab = txt => {
    const k = txt.indexOf('sRGBTransferOETF');
    const e = txt.indexOf('}', txt.indexOf('return', k));
    return nums(txt.slice(k, e));
  };
  assert.deepEqual(grab(postfx), grab(cs), 'ambang & pangkat sRGB harus sama');
});

test('postfx: tone mapping manual hanya di pass komposit', () => {
  /* material postfx wajib toneMapped:false, kalau tidak three menerapkan
     ACES dua kali (sekali di shader kita, sekali di three) -> gambar gelap */
  assert.ok(/toneMapped:\s*false/.test(postfx), 'material postfx harus toneMapped:false');
  /* dan kurva ACES harus benar-benar dipakai di komposit */
  assert.ok(/ACESFilmic\(\s*color\s*,\s*uExposure\s*\)/.test(postfx), 'komposit harus memanggil ACESFilmic');
});

test('postfx: saat semua efek Mati, tidak ada render target yang dialokasikan', () => {
  /* janji ke pemain: "Mati" berarti benar-benar mati. configure() dengan
     semua level 0 harus menonaktifkan dan melepas render target. */
  assert.ok(/if\s*\(!this\.enabled\)\s*this\._freeTargets\(\)/.test(postfx),
    'configure() harus melepas render target saat semua efek mati');
  assert.ok(/if\s*\(!this\.enabled\)\s*\{\s*r\.setRenderTarget\(null\);\s*r\.render\(scene,\s*camera\);\s*return;\s*\}/.test(postfx),
    'render() harus langsung ke kanvas saat postfx mati');
});
