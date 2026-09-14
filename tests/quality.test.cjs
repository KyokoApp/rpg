/* ============================================================
   TES SISTEM KUALITAS + LOADER — headless, tanpa DOM/browser.
   Jalankan:  node --test tests/quality.test.cjs

   Yang dijaga di sini adalah JANJI ke pemain:
   - setiap fitur yang bisa "Mati" benar-benar menghasilkan 0,
     bukan angka kecil yang tetap memakan draw call
   - preset lama (low/balanced/high) tetap kebaca dari localStorage
   - layar loading tidak pernah menampilkan 100% sebelum selesai
============================================================ */
const test = require('node:test');
const assert = require('node:assert/strict');

const Q = require('../game/quality.mjs');
const L = require('../game/loader.mjs');

/* quality.mjs dan loader.mjs adalah ES module; di .cjs kita pakai
   createRequire-free dynamic import yang sudah di-await di top-level
   CommonJS lewat wrapper. Node mendukung require(esm) mulai v22. */

test('preset: empat tingkat dengan id yang diharapkan', () => {
  assert.deepEqual(Q.PRESET_IDS, ['low', 'balanced', 'high', 'ultra']);
  assert.equal(Q.FPS_CHOICES.length, 4);
  assert.deepEqual(Q.FPS_CHOICES, [24, 30, 45, 60]);
  for (const id of Q.PRESET_IDS) {
    const p = Q.PRESETS[id];
    assert.ok(p && p.gfx, `preset ${id} harus punya gfx`);
    assert.ok(Q.FPS_CHOICES.includes(p.fps), `fps preset ${id} harus salah satu pilihan`);
  }
});

test('preset Rendah mematikan semua yang mahal', () => {
  const g = Q.PRESETS.low.gfx;
  for (const k of ['shadows', 'grass', 'particles', 'bloom', 'motionBlur', 'volumetric']) {
    assert.equal(g[k], 0, `preset low: ${k} harus 0`);
  }
});

test('Ultra harus lebih berat dari Rendah di setiap opsi', () => {
  const lo = Q.PRESETS.low.gfx, ul = Q.PRESETS.ultra.gfx;
  for (const k of ['shadows', 'grass', 'particles', 'water', 'view', 'detail', 'texture', 'bloom', 'motionBlur', 'volumetric']) {
    assert.ok(ul[k] >= lo[k], `${k}: ultra ${ul[k]} >= low ${lo[k]}`);
  }
  assert.ok(ul.renderScale > lo.renderScale);
});

test('setGfx menurunkan preset menjadi custom', () => {
  let s = Q.applyPreset(Q.cloneSettings(Q.DEFAULT_SETTINGS), 'high');
  assert.equal(s.quality, 'high');
  assert.equal(s.custom, false);
  s = Q.setGfx(s, 'bloom', 0);
  assert.equal(s.quality, 'custom');
  assert.equal(s.custom, true);
  assert.equal(s.gfx.bloom, 0);
});

test('setGfx meng-clamp dan menolak kunci asing', () => {
  let s = Q.cloneSettings(Q.DEFAULT_SETTINGS);
  s = Q.setGfx(s, 'texture', 99);
  assert.equal(s.gfx.texture, 2, 'texture maks 2');
  s = Q.setGfx(s, 'shadows', -5);
  assert.equal(s.gfx.shadows, 0);
  const before = JSON.stringify(s.gfx);
  s = Q.setGfx(s, 'tidakAda', 3);
  assert.equal(JSON.stringify(s.gfx), before, 'kunci asing tidak boleh mengubah apa pun');
});

test('detectPreset mengenali preset persis, custom kalau beda', () => {
  for (const id of Q.PRESET_IDS) {
    assert.equal(Q.detectPreset(Q.PRESETS[id].gfx), id);
  }
  const mixed = { ...Q.PRESETS.high.gfx, bloom: 0 };
  assert.equal(Q.detectPreset(mixed), 'custom');
});

test('resolveGfx: fitur Mati benar-benar menghasilkan 0', () => {
  const s = Q.applyPreset(Q.cloneSettings(Q.DEFAULT_SETTINGS), 'low');
  const g = Q.resolveGfx(s, true);
  assert.equal(g.grassCount, 0, 'rumput mati -> 0 instance');
  assert.equal(g.dustCount, 0);
  assert.equal(g.butterflyCount, 0);
  assert.equal(g.birdCount, 0);
  assert.equal(g.shadowsEnabled, false);
  assert.equal(g.postEnabled, false, 'tidak ada post-processing saat semua Mati');
});

test('resolveGfx: Ultra menghidupkan post-processing dan rumput penuh', () => {
  const g = Q.resolveGfx(Q.applyPreset(Q.cloneSettings(Q.DEFAULT_SETTINGS), 'ultra'), false);
  assert.ok(g.grassCount > 20000, `grassCount = ${g.grassCount}`);
  assert.equal(g.postEnabled, true);
  assert.ok(g.bloomLevel > 0 && g.motionBlurLevel > 0 && g.volumetricLevel > 0);
  assert.equal(g.shadowMapSize, 2048);
  assert.equal(g.roadProps, true);
});

test('resolveGfx: mobile selalu lebih ringan dari desktop di preset sama', () => {
  for (const id of Q.PRESET_IDS) {
    const s = Q.applyPreset(Q.cloneSettings(Q.DEFAULT_SETTINGS), id);
    const m = Q.resolveGfx(s, true), d = Q.resolveGfx(s, false);
    assert.ok(m.grassCount <= d.grassCount, `${id}: rumput mobile <= desktop`);
    assert.ok(m.dustCount <= d.dustCount, `${id}: debu mobile <= desktop`);
    assert.ok(m.fogFar <= d.fogFar, `${id}: jarak pandang mobile <= desktop`);
  }
});

test('resolveGfx: jarak pandang naik monoton mengikuti tingkat', () => {
  const base = Q.cloneSettings(Q.DEFAULT_SETTINGS);
  let prev = -1;
  for (let v = 0; v <= 3; v++) {
    const g = Q.resolveGfx(Q.setGfx(base, 'view', v), false);
    assert.ok(g.fogFar > prev, `view ${v}: fogFar ${g.fogFar} > ${prev}`);
    prev = g.fogFar;
  }
});

test('frameInterval: hanya nilai yang dipilih yang berlaku', () => {
  assert.equal(Q.frameInterval(60), 1000 / 60);
  assert.equal(Q.frameInterval(24), 1000 / 24);
  assert.equal(Q.frameInterval(90), 0, 'FPS di luar pilihan = tanpa batas');
  assert.equal(Q.frameInterval(NaN), 0);
});

test('readSettings: kompatibel dengan format lama (tanpa field baru)', async () => {
  const { readSettings, DEFAULT_SETTINGS } = Q;
  /* settings versi lama hanya punya 5 kunci */
  const legacy = JSON.stringify({ sensitivity: 1.4, cameraDistance: 6, quality: 'high', shadows: true, sound: true });
  const s = readSettings({ getItem: () => legacy });
  assert.equal(s.sensitivity, 1.4);
  assert.equal(s.quality, 'high');
  /* field baru harus jatuh ke DEFAULT, bukan ke 0 */
  assert.equal(s.gfx.shadows, DEFAULT_SETTINGS.gfx.shadows);
  assert.equal(s.gfx.bloom, DEFAULT_SETTINGS.gfx.bloom);
  assert.equal(s.fps, 60);
  assert.deepEqual(s.layout, {});
});

test('readSettings: nilai rusak di-clamp, bukan bikin NaN', async () => {
  const { readSettings } = Q;
  const junk = JSON.stringify({ fps: 999, gfx: { bloom: 'x', renderScale: 99, texture: -3 }, layout: { gasBtn: { x: 5, y: NaN } }, buttonScale: 0 });
  const s = readSettings({ getItem: () => junk });
  assert.equal(s.fps, 60, 'fps di luar pilihan -> 60');
  assert.equal(s.gfx.bloom, Q.PRESETS.balanced.gfx.bloom, 'bloom non-angka -> default');
  assert.equal(s.gfx.renderScale, 1.5, 'renderScale di-clamp ke 1.5');
  assert.equal(s.gfx.texture, 0, 'texture negatif -> 0');
  assert.equal(s.buttonScale, 0.75, 'buttonScale di-clamp');
  /* layout dengan y NaN dibuang, x di-clamp ke 1 */
  assert.equal(s.layout.gasBtn.y, 0, 'y NaN -> 0');
});

test('applyPreset tidak memutasi settings asli', async () => {
  const s0 = Q.cloneSettings(Q.DEFAULT_SETTINGS);
  const snap = JSON.stringify(s0);
  const s1 = Q.applyPreset(s0, 'ultra');
  assert.equal(JSON.stringify(s0), snap, 'settings asli tidak boleh berubah');
  assert.notEqual(s1.gfx, s0.gfx, 'gfx harus salinan baru');
});

test('adaptive resolution: turun cepat, naik pelan, tidak berosilasi', async () => {
  const a = Q.createAdaptiveResolution({ min: 0.6, max: 1, start: 1 });
  assert.equal(a.scale, 1);
  /* 20 frame lambat berturut-turut baru menurunkan satu langkah */
  for (let i = 0; i < 19; i++) a.update(30, 1000 / 45);
  assert.equal(a.scale, 1, 'belum cukup bukti untuk turun');
  a.update(30, 1000 / 45);
  assert.ok(Math.abs(a.scale - 0.9) < 1e-9, `scale = ${a.scale}`);
  /* naik butuh jauh lebih banyak frame baik */
  for (let i = 0; i < 149; i++) a.update(10, 1000 / 45);
  assert.ok(Math.abs(a.scale - 0.9) < 1e-9, 'naik harus lambat');
  a.update(10, 1000 / 45);
  assert.ok(a.scale > 0.9, `scale = ${a.scale}`);
  /* tidak pernah keluar batas */
  for (let i = 0; i < 5000; i++) a.update(i % 2 ? 60 : 4, 1000 / 45);
  assert.ok(a.scale >= 0.6 && a.scale <= 1, `scale = ${a.scale}`);
});

/* ---------- loader ---------- */
function fakeEl() {
  return { style: {}, textContent: '', innerHTML: '', classList: { add() {}, remove() {} } };
}
function fakeDom(ids) {
  const map = {};
  for (const id of ids) map[id] = fakeEl();
  global.document = { getElementById: id => map[id] || null };
  return map;
}
const DOM_IDS = ['loadScreen', 'loadBar', 'loadPct', 'loadStep', 'loadTip', 'loadErr'];

/* done() wajib dipanggil walau assertion gagal: kalau tidak, setInterval
   milik loader menahan event loop dan seluruh proses tes menggantung. */
function withLoader(t, stages, fn) {
  fakeDom(DOM_IDS);
  const l = L.createLoader({ stages }).start();
  t.after(() => l.done());
  return l;
}

test('loader: tidak pernah mencapai 100% sebelum done()', async (t) => {
  const el = fakeDom(DOM_IDS);
  const stages = [{ k: 'a', w: 50, label: 'A' }, { k: 'b', w: 50, label: 'B' }];
  const l = L.createLoader({ stages }).start();
  t.after(() => l.done());
  l.stage('a'); l.progress(1);
  assert.ok(l.percent <= 99, `percent = ${l.percent}`);
  l.stage('b'); l.progress(0.999);
  assert.ok(l.percent <= 99, `percent harus dikunci 99, dapat ${l.percent}`);
  assert.equal(el.loadPct.textContent, '99%');
  l.done();
  assert.equal(el.loadPct.textContent, '100%');
});

test('loader: progres monoton (tidak pernah turun)', async (t) => {
  withLoader(t, [{ k: 'a', w: 30, label: 'A' }, { k: 'b', w: 70, label: 'B' }], l => {
    const seen = [];
    l.stage('a');
    for (let i = 0; i <= 10; i++) { l.progress(i / 10); seen.push(l.percent); }
    l.stage('b');
    for (let i = 0; i <= 10; i++) { l.progress(i / 10); seen.push(l.percent); }
    /* mundur paksa ke tahap awal: tampilan tetap tidak boleh turun,
       karena bar yang mundur terlihat seperti hang */
    l.stage('a'); l.progress(0); seen.push(l.percent);
    for (let i = 1; i < seen.length; i++) {
      assert.ok(seen[i] >= seen[i - 1], `progres turun: ${seen[i - 1]} -> ${seen[i]}`);
    }
  });
});

test('loader: tahap kedua mulai tepat di bobot tahap pertama', async (t) => {
  withLoader(t, [{ k: 'a', w: 30, label: 'A' }, { k: 'b', w: 70, label: 'B' }], l => {
    l.stage('a'); l.progress(1);      // selesai -> 30%
    l.stage('b'); l.progress(0);      // mulai tahap B -> tetap 30%
    assert.ok(Math.abs(l.percent - 30) < 0.5, `awal tahap B = ${l.percent}`);
    l.progress(0.5);
    assert.ok(Math.abs(l.percent - 65) < 0.5, `setengah tahap B = ${l.percent}`);
  });
});

test('loader: tahap yang dilewati tetap menyumbang bobotnya', async (t) => {
  withLoader(t, [{ k: 'a', w: 25, label: 'A' }, { k: 'b', w: 25, label: 'B' }, { k: 'c', w: 50, label: 'C' }], l => {
    l.stage('c');                     // langsung lompat ke tahap terakhir
    l.progress(0);
    assert.ok(Math.abs(l.percent - 50) < 0.5, `harus mulai di 50%, dapat ${l.percent}`);
  });
});
