/* ============================================================
   TES EKSEKUSI: blok post-processing di index.html.

   Bug layar hitam lolos dari SEMUA pemeriksaan statis yang ada:
   - node --check        : sintaksnya sah
   - check-imports.mjs   : modul & id DOM ada
   - check-exports.mjs   : named export ada
   Karena bugnya runtime: objek polos dipanggil .set().

   Jadi tes ini tidak memeriksa teks — ia MENGANGKAT blok itu dari
   index.html dan benar-benar menjalankannya dengan THREE asli plus
   stub car/player/sun/camera. Kalau ada yang melempar, tes gagal.
   ============================================================ */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

/* resolver hook supaya `import ... from 'three'` bekerja di Node */
require('node:module');

const HTML = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const CODE = HTML.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

/* ---- angkat blok post-processing persis seperti adanya ---- */
const START = CODE.indexOf('/* ---------- parameter post-processing frame ini');
assert.ok(START !== -1, 'blok parameter post-processing harus ditemukan di index.html');
const openBrace = CODE.indexOf('{', START);
let depth = 0, end = openBrace;
for (; end < CODE.length; end++) {
  if (CODE[end] === '{') depth++;
  else if (CODE[end] === '}') { depth--; if (depth === 0) break; }
}
const BLOCK = CODE.slice(openBrace, end + 1);
assert.ok(BLOCK.includes('postOpts.sunScreen'),
  'sanity: blok yang diangkat harus memuat postOpts.sunScreen');

/* ---- angkat deklarasi postOpts & _sunProj ---- */
const declOpts = CODE.match(/^const postOpts = .*$/m);
const declProj = CODE.match(/^const _sunProj = .*$/m);
assert.ok(declOpts && declProj, 'deklarasi postOpts dan _sunProj harus ditemukan');

/* Ambil ekspresi objek di kanan `const postOpts = ...`, lalu eval sebagai
   ekspresi. Mengeval seluruh pernyataan (`postOpts = {...}`) akan memicu
   TDZ karena namanya sama dengan variabel yang sedang diinisialisasi. */
const POSTOPTS_RHS = declOpts[0]
  .replace(/^const\s+postOpts\s*=\s*/, '')
  .replace(/;\s*$/, '');

function makePostOpts(THREE) {
  /* eslint-disable no-eval */
  return eval('(' + POSTOPTS_RHS + ')');
}

async function loadTHREE() {
  await import(pathToFileURL(resolve(__dirname, 'importmap.mjs')).href);
  return import(pathToFileURL(resolve(__dirname, '../three.module.js')).href);
}

test('blok post-processing benar-benar bisa dieksekusi tanpa melempar', async (t) => {
  const THREE = await loadTHREE();

  /* bangun lingkungan sekecil mungkin, tapi pakai kelas three ASLI
     supaya method yang hilang benar-benar ketahuan */
  const postOpts = makePostOpts(THREE);
  const _sunProj = new THREE.Vector3();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 4000);
  camera.position.set(0, 5, 10);
  camera.updateMatrixWorld();

  const sun = { position: new THREE.Vector3(120, 90, -40) };
  const car = { speed: 40, nitroActive: true, steerInput: -0.6, throttle: 1 };
  const player = { vel: new THREE.Vector3(3, 0, 4) };
  const CAR_CFG = { maxSpeed: 72 };

  /* Kembalikan SNAPSHOT nilai primitif. Mengembalikan postOpts langsung
     salah: itu objek yang sama dan dimutasi tiap panggilan, sehingga
     `fast` dan `nitro` jadi satu objek identik dan perbandingan selalu
     membandingkan dirinya sendiri. */
  const run = new Function(
    'THREE', 'postOpts', '_sunProj', 'camera', 'sun', 'car', 'player', 'CAR_CFG', 'mode',
    `${BLOCK}
     return {
       blur01: postOpts.blur01,
       blurDirX: postOpts.blurDir.x, blurDirY: postOpts.blurDir.y,
       sunX: postOpts.sunScreen.x, sunY: postOpts.sunScreen.y,
       sunVisible: postOpts.sunVisible,
     };`,
  );

  /* mode mobil: jalur yang memakai car.steerInput & nitroActive */
  const outCar = run(THREE, postOpts, _sunProj, camera, sun, car, player, CAR_CFG, 'car');
  assert.ok(Number.isFinite(outCar.blur01), 'blur01 harus angka hingga');
  assert.ok(outCar.blur01 > 0, 'di kecepatan 40 m/s blur harus aktif');
  assert.ok(Number.isFinite(outCar.sunX) && Number.isFinite(outCar.sunY),
    'sunScreen harus terisi angka hingga, bukan NaN');
  assert.equal(typeof outCar.sunVisible, 'boolean');

  /* mode jalan kaki: jalur player.vel */
  const outFoot = run(THREE, postOpts, _sunProj, camera, sun, car, player, CAR_CFG, 'foot');
  assert.ok(Number.isFinite(outFoot.blur01), 'blur01 mode jalan kaki harus angka hingga');
  assert.ok(Number.isFinite(outFoot.sunX), 'sunScreen mode jalan kaki harus hingga');
});

test('nilai yang dihasilkan masuk akal (bukan cuma "tidak melempar")', async (t) => {
  const THREE = await loadTHREE();
  const postOpts = makePostOpts(THREE);
  const _sunProj = new THREE.Vector3();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 4000);
  camera.position.set(0, 5, 10);
  camera.updateMatrixWorld();
  const sun = { position: new THREE.Vector3(120, 90, -40) };
  const CAR_CFG = { maxSpeed: 72 };
  /* Kembalikan SNAPSHOT nilai primitif. Mengembalikan postOpts langsung
     salah: itu objek yang sama dan dimutasi tiap panggilan, sehingga
     `fast` dan `nitro` jadi satu objek identik dan perbandingan selalu
     membandingkan dirinya sendiri. */
  const run = new Function(
    'THREE', 'postOpts', '_sunProj', 'camera', 'sun', 'car', 'player', 'CAR_CFG', 'mode',
    `${BLOCK}
     return {
       blur01: postOpts.blur01,
       blurDirX: postOpts.blurDir.x, blurDirY: postOpts.blurDir.y,
       sunX: postOpts.sunScreen.x, sunY: postOpts.sunScreen.y,
       sunVisible: postOpts.sunVisible,
     };`,
  );

  /* diam -> tidak ada blur */
  const still = run(THREE, postOpts, _sunProj, camera, sun,
    { speed: 0, nitroActive: false, steerInput: 0, throttle: 0 },
    { vel: new THREE.Vector3() }, CAR_CFG, 'car');
  assert.equal(still.blur01, 0, 'mobil diam tidak boleh dapat motion blur');

  /* kencang -> blur naik */
  const fast = run(THREE, postOpts, _sunProj, camera, sun,
    { speed: 70, nitroActive: false, steerInput: 0, throttle: 1 },
    { vel: new THREE.Vector3() }, CAR_CFG, 'car');
  assert.ok(fast.blur01 > 0.5, `kecepatan 70/72 m/s harus blur kuat, dapat ${fast.blur01}`);

  /* NOS memperkuat blur */
  const nitro = run(THREE, postOpts, _sunProj, camera, sun,
    { speed: 70, nitroActive: true, steerInput: 0, throttle: 1 },
    { vel: new THREE.Vector3() }, CAR_CFG, 'car');
  assert.ok(nitro.blur01 > fast.blur01, 'NOS harus menambah blur di atas kecepatan yang sama');

  /* belokan mengubah arah blur */
  const left = run(THREE, postOpts, _sunProj, camera, sun,
    { speed: 50, nitroActive: false, steerInput: -1, throttle: 1 },
    { vel: new THREE.Vector3() }, CAR_CFG, 'car');
  const right = run(THREE, postOpts, _sunProj, camera, sun,
    { speed: 50, nitroActive: false, steerInput: 1, throttle: 1 },
    { vel: new THREE.Vector3() }, CAR_CFG, 'car');
  assert.equal(Math.sign(left.blurDirX), -Math.sign(right.blurDirX),
    'belok kiri vs kanan harus memberi arah blur berlawanan');

  /* --- god rays: matahari DI DEPAN kamera harus terpetakan ke UV 0..1 --- */
  const carMid = { speed: 50, nitroActive: false, steerInput: 0, throttle: 1 };
  const foot = { vel: new THREE.Vector3() };
  const cam2 = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 4000);
  cam2.position.set(0, 5, 10); cam2.updateMatrixWorld();

  const onScreen = run(THREE, makePostOpts(THREE), new THREE.Vector3(), cam2,
    { position: new THREE.Vector3(10, 30, -50) }, carMid, foot, CAR_CFG, 'car');
  assert.ok(onScreen.sunX >= 0 && onScreen.sunX <= 1,
    `matahari di depan kamera harus terpetakan ke UV 0..1, dapat x=${onScreen.sunX}`);
  assert.ok(onScreen.sunY >= 0 && onScreen.sunY <= 1,
    `sunScreen.y harus 0..1, dapat ${onScreen.sunY}`);
  assert.equal(onScreen.sunVisible, true,
    'matahari di depan kamera harus menyalakan god rays');

  /* --- matahari DI LUAR layar harus mematikan god rays ---
     Kalau tidak, radial blur berpusat di titik tak terlihat dan
     menghasilkan sapuan cahaya yang salah arah. */
  const offScreen = run(THREE, makePostOpts(THREE), new THREE.Vector3(), cam2,
    { position: new THREE.Vector3(120, 90, -40) }, carMid, foot, CAR_CFG, 'car');
  assert.equal(offScreen.sunVisible, false,
    `matahari di luar layar (UV x=${offScreen.sunX.toFixed(2)}) harus mematikan god rays`);
  assert.ok(Number.isFinite(offScreen.sunX) && Number.isFinite(offScreen.sunY),
    'meski di luar layar, sunScreen tetap harus angka hingga (bukan NaN)');
});

test('postfx menerima objek hasil blok ini tanpa error', async (t) => {
  /* sisi penerima hanya membaca .x/.y — pastikan kontrak itu tetap cocok
     dengan yang diproduksi blok di atas */
  const src = readFileSync(resolve(__dirname, '../game/postfx.mjs'), 'utf8');
  const reads = [...src.matchAll(/opts\.sunScreen[\s\S]{0,80}?(c\.x|c\.y)/g)];
  assert.ok(reads.length > 0 || /opts\.sunScreen\s*\|\|/.test(src),
    'postfx harus membaca sunScreen lewat .x/.y atau punya fallback');
  assert.ok(!/opts\.sunScreen\s*\.\s*(set|copy|lerp)\s*\(/.test(src),
    'postfx tidak boleh memanggil method mutasi pada sunScreen');
});
