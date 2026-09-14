/* ============================================================
   TES FITUR MOBIL v2 — headless, tanpa browser/GPU.
   Jalankan:  node tests/car.features.mjs

   Menutup dua keluhan pemain yang tidak tercover car.physics.mjs:
   N1-N4  NOS tidak merespons saat ditekan
   C1-C3  tombol kamera 3 mode (dekat / jauh / sinematik)
============================================================ */
import './importmap.mjs';     // petakan 'three' -> three.module.js vendored
import './stubs.mjs';         // stub DOM + canvas 2D

const THREE = await import('three');
const { Car, CAR_CFG } = await import('../js/car.js');
const { WATER_LEVEL, WORLD_LIMIT } = await import('../game/world-data.mjs');

const flat = () => 2;
const DT = 1 / 60;
const bad = [];
const chk = (name, cond, extra = '') => { if (!cond) bad.push(name + ' ' + extra); };

/* perekam audio palsu: mencatat panggilan supaya bisa dipastikan
   umpan balik benar-benar diberikan (bukan cuma state internal) */
function recAudio() {
  const calls = { setNitro: [], exhaustPop: 0, gearShift: 0, backfire: 0 };
  return {
    calls, ok: true,
    setNitro(a, s) { calls.setNitro.push([!!a, s]); },
    exhaustPop() { calls.exhaustPop++; },
    gearShift() { calls.gearShift++; },
    backfire() { calls.backfire++; },
    setEngine() {}, setTireSlip() {}, setRush() {},
    /* Car.spawnAt/enter memanggil beberapa one-shot ini; stub harus
       lengkap supaya tes gagal karena logika, bukan karena stub bolong. */
    door() {}, impact() {}, uiClick() {}, summon() {},
  };
}

function mkCar(audio = null) {
  const scene = new THREE.Scene();
  const c = new Car(scene, { terrainH: flat, colliders: [], limit: WORLD_LIMIT, waterY: WATER_LEVEL, audio });
  c.spawnAt(0, 0, 0);
  return c;
}
const IN = (o = {}) => Object.assign({ throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false }, o);

/* ============================================================
   N1 — REGRESI UTAMA: NOS harus aktif TANPA tombol gas.
   Bug lama: `nit = input.nitro && nitro>1 && thr>0.05`.
   Di ponsel tombol NOS ada di atas tombol gas, jadi satu jempol
   tidak bisa menekan keduanya -> NOS mati total.
============================================================ */
{
  const c = mkCar();
  c.update(DT, IN({ nitro: true }), true);
  chk('N1 nitroActive tanpa throttle', c.nitroActive === true, `= ${c.nitroActive}`);
  chk('N1 nitro terkuras tanpa throttle', c.nitro < CAR_CFG.nitroMax, `= ${c.nitro}`);
  chk('N1 throttle minimum tersuplai', c.throttle >= CAR_CFG.nitroThrottle - 1e-9, `= ${c.throttle}`);
}

/* N1b — NOS tanpa gas harus benar-benar mendorong mobil */
{
  const c = mkCar();
  for (let i = 0; i < 120; i++) c.update(DT, IN({ nitro: true }), true);
  chk('N1b mobil bergerak oleh NOS saja', c.speed > 1.0, `speed = ${c.speed.toFixed(3)}`);
}

/* N2 — NOS + gas tetap jalan (perilaku lama tidak boleh rusak) */
{
  const c = mkCar();
  let peak = 0;
  for (let i = 0; i < 120; i++) { c.update(DT, IN({ throttle: 1, nitro: true }), true); peak = Math.max(peak, c.speed); }
  chk('N2 NOS+gas mendorong', peak > 5, `peak = ${peak.toFixed(2)}`);
}

/* N3 — tangki kosong: harus ADA umpan balik, bukan diam */
{
  const a = recAudio();
  const c = mkCar(a);
  c.nitro = 0;
  c.update(DT, IN({ nitro: true }), true);
  chk('N3 nitroActive false saat kosong', c.nitroActive === false);
  chk('N3 nitroDenied terpasang', c.nitroDenied === true);
}
{
  /* melepas tombol harus membersihkan latch supaya toast tidak nyangkut */
  const c = mkCar();
  c.nitro = 0;
  c.update(DT, IN({ nitro: true }), true);
  chk('N3b latch aktif', c.nitroDenied === true);
  c.update(DT, IN({ nitro: false }), true);
  chk('N3b latch dibersihkan', c.nitroDenied === false);
}

/* N4 — audio NOS hanya dikabari saat STATUS berubah (bukan tiap frame).
   Membuat node audio tiap frame adalah sumber klik. */
{
  const a = recAudio();
  const c = mkCar(a);
  for (let i = 0; i < 60; i++) c.update(DT, IN({ nitro: true }), true);
  chk('N4 setNitro(true) dipanggil sekali', a.calls.setNitro.filter(x => x[0] === true).length === 1,
    `= ${a.calls.setNitro.filter(x => x[0] === true).length}`);
  c.update(DT, IN({ nitro: false }), true);
  chk('N4 setNitro(false) saat dilepas', a.calls.setNitro.at(-1)[0] === false);
}

/* N4b — NOS habis di tengah boost harus memicu letupan */
{
  const a = recAudio();
  const c = mkCar(a);
  for (let i = 0; i < 600; i++) c.update(DT, IN({ nitro: true }), true);
  chk('N4b nitro habis', c.nitro <= 1, `= ${c.nitro.toFixed(2)}`);
  chk('N4b ada letupan knalpot', a.calls.exhaustPop > 0, `= ${a.calls.exhaustPop}`);
}

/* N5 — NOS tidak boleh aktif saat tidak dikendarai */
{
  const c = mkCar();
  c.update(DT, IN({ nitro: true }), false);
  chk('N5 NOS mati saat tidak dikemudikan', c.nitroActive === false);
}

/* ============================================================
   C1-C3 — mode kamera
============================================================ */
const CAM = Car.CAMERA_MODES;
chk('C0 ada 3 mode kamera', CAM && CAM.near && CAM.far && CAM.cine);
chk('C0 near lebih dekat dari far', CAM.near.dist < CAM.far.dist);
chk('C0 cine FOV paling sempit', CAM.cine.fov < CAM.near.fov && CAM.cine.fov < CAM.far.fov);
chk('C0 cine punya sway (gerak sinematik)', CAM.cine.sway > 0 && CAM.near.sway === 0);

function camDist(mode, steps = 90) {
  const c = mkCar();
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 2000);
  cam.position.set(0, 10, -30);
  for (let i = 0; i < steps; i++) {
    c.update(DT, IN({ throttle: 1 }), true);
    c.updateCamera(cam, DT, 1, mode);
  }
  return { d: cam.position.distanceTo(c.pos), fov: cam.fov, c, cam };
}

const nearR = camDist('near'), farR = camDist('far'), cineR = camDist('cine');
console.log(`C1  jarak kamera  near=${nearR.d.toFixed(2)}m  far=${farR.d.toFixed(2)}m  cine=${cineR.d.toFixed(2)}m`);
console.log(`C2  FOV           near=${nearR.fov.toFixed(1)}  far=${farR.fov.toFixed(1)}  cine=${cineR.fov.toFixed(1)}`);
chk('C1 near < far', nearR.d < farR.d - 1.0, `${nearR.d} vs ${farR.d}`);
chk('C2 near FOV > cine FOV', nearR.fov > cineR.fov + 2, `${nearR.fov} vs ${cineR.fov}`);
chk('C2 far FOV > cine FOV', farR.fov > cineR.fov + 2, `${farR.fov} vs ${cineR.fov}`);

/* C3 — kamera tidak boleh tembus tanah */
for (const mode of ['near', 'far', 'cine']) {
  const r = camDist(mode);
  chk(`C3 ${mode} kamera di atas tanah`, r.cam.position.y > 0.5, `y = ${r.cam.position.y.toFixed(2)}`);
  for (const k of ['x', 'y', 'z']) {
    if (!Number.isFinite(r.cam.position[k])) bad.push(`C3 ${mode} NaN kamera.${k}`);
  }
}

/* C4 — mode tidak dikenal jatuh ke 'near', bukan crash */
{
  const c = mkCar();
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 2000);
  let threw = null;
  try { for (let i = 0; i < 10; i++) { c.update(DT, IN(), true); c.updateCamera(cam, DT, 1, 'tidak-ada'); } }
  catch (e) { threw = e; }
  chk('C4 mode asing tidak melempar', threw === null, threw && threw.message);
}

/* ============================================================
   HASIL
============================================================ */
console.log('');
if (bad.length) {
  console.log('================ GAGAL ================');
  for (const b of bad) console.log(' ✗', b);
  process.exitCode = 1;
} else {
  console.log('================ HASIL ================');
  console.log('✅ SEMUA TES LULUS (0 kegagalan)');
}
