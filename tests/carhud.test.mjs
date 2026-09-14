/* ============================================================
   TES CAR HUD (DOM) — headless, tanpa browser.
   Jalankan:  node --test tests/carhud.test.mjs

   Ini menutup keluhan pemain yang paling utama: "NOS dipencet tidak
   merespons". Perbaikannya ada di dua lapisan:
     1. fisika  -> ditutup tests/car.features.mjs
     2. tombol  -> ditutup file ini (pointer capture, tanpa pointerleave)
   Lapisan tombol tidak bisa diuji oleh car.features.mjs karena itu
   murni DOM, jadi perlu DOM mini di sini.

   DOM mini ini sengaja ditulis seadanya tapi JUJUR: ia mencatat event
   apa adanya, termasuk pointerleave, supaya kalau ada yang memasang
   kembali listener pointerleave tes ini langsung gagal.
============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';

/* ---------------- DOM mini ---------------- */
let REG = new Map();          // id -> el
let WINDOW_LISTENERS = new Map();

function makeClassList(el) {
  const set = new Set();
  return {
    add: (...c) => c.forEach(x => set.add(x)),
    remove: (...c) => c.forEach(x => set.delete(x)),
    contains: c => set.has(c),
    toggle: (c, force) => {
      const on = force === undefined ? !set.has(c) : !!force;
      if (on) set.add(c); else set.delete(c);
      return on;
    },
    _set: set,
  };
}

function makeEl(tag = 'div', id = null) {
  const el = {
    tagName: tag.toUpperCase(),
    id: id || '',
    style: {},
    dataset: {},
    children: [],
    textContent: '',
    _html: '',
    _listeners: new Map(),
    classList: null,
    _captured: new Set(),
  };
  el.classList = makeClassList(el);
  el.className = '';
  el.addEventListener = (type, fn) => {
    if (!el._listeners.has(type)) el._listeners.set(type, []);
    el._listeners.get(type).push(fn);
  };
  el.removeEventListener = (type, fn) => {
    const l = el._listeners.get(type);
    if (l) el._listeners.set(type, l.filter(f => f !== fn));
  };
  el.setPointerCapture = pid => el._captured.add(pid);
  el.releasePointerCapture = pid => el._captured.delete(pid);
  el.getBoundingClientRect = () => el._rect || { left: 0, top: 0, width: 64, height: 64 };
  el.setAttribute = (k, v) => { el.dataset[k] = v; };
  el.getAttribute = k => el.dataset[k];
  el.appendChild = c => { el.children.push(c); return c; };
  el.focus = () => {};
  el.closest = sel => {
    /* hanya perlu mendukung '.cBtn' untuk handler drag */
    const cls = sel.replace(/^\./, '');
    return el.classList.contains(cls) ? el : (el._parent && el._parent.closest ? el._parent.closest(sel) : null);
  };
  el.querySelectorAll = sel => queryAll(sel, el);
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html,
    set: v => { el._html = v; parseInto(v, el); },
  });
  if (id) REG.set(id, el);
  return el;
}

/* parser innerHTML seadanya: cukup untuk markup statis car-hud.mjs */
function parseInto(html, parent) {
  /* <span> wajib ikut: #nosPct adalah span, dan tanpanya update()
     gagal menulis textContent — itu kegagalan stub, bukan produk. */
  for (const m of html.matchAll(/<(div|button|svg|small|span)\b([^>]*)>/g)) {
    const attrs = m[2];
    const idm = attrs.match(/id="([^"]+)"/);
    const clm = attrs.match(/class="([^"]+)"/);
    const el = makeEl(m[1], idm ? idm[1] : null);
    if (clm) clm[1].split(/\s+/).forEach(c => c && el.classList.add(c));
    el._parent = parent;
    parent.children.push(el);
  }
}

function queryAll(sel, root) {
  /* mendukung '.a.b' sederhana */
  const classes = sel.split('.').filter(Boolean);
  const out = [];
  for (const el of REG.values()) {
    if (classes.every(c => el.classList.contains(c))) out.push(el);
  }
  return out;
}

function installDom() {
  REG = new Map();
  WINDOW_LISTENERS = new Map();
  const body = makeEl('body');
  globalThis.document = {
    body,
    createElement: t => makeEl(t),
    createElementNS: (ns, t) => {
      const el = makeEl(t);
      el.getTotalLength = () => 300;   // dipakai buildGauge untuk dasharray
      return el;
    },
    getElementById: id => REG.get(id) || null,
    querySelectorAll: sel => queryAll(sel, null),
    querySelector: sel => queryAll(sel, null)[0] || null,
  };
  globalThis.window = globalThis;
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 360;
  globalThis.addEventListener = (type, fn) => {
    if (!WINDOW_LISTENERS.has(type)) WINDOW_LISTENERS.set(type, []);
    WINDOW_LISTENERS.get(type).push(fn);
  };
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  return body;
}

function fire(el, type, extra = {}) {
  const ev = { type, pointerId: 1, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {}, ...extra };
  for (const fn of (el._listeners.get(type) || [])) fn(ev);
  return ev;
}
function fireWindow(type, extra = {}) {
  const ev = { type, pointerId: 1, preventDefault() {}, ...extra };
  for (const fn of (WINDOW_LISTENERS.get(type) || [])) fn(ev);
}

const CFG = { maxSpeed: 72, idleRpm: 900, redline: 8600, revLimit: 8800, nitroMax: 100 };

async function bootHUD(opts = {}) {
  installDom();
  const mod = await import('../game/car-hud.mjs?cb=' + Math.random());
  const hud = mod.initCarHUD({ cfg: CFG, isTouch: true, onExit() {}, onCarButton() {}, onCameraMode: opts.onCameraMode });
  return { hud, mod, ctl: hud.ctl };
}

/* ---------------- tes ---------------- */

test('NOS: pointerdown menyalakan, dan pointerleave TIDAK mematikannya', async () => {
  const { ctl } = await bootHUD();
  const nos = document.getElementById('nosBtn');
  assert.ok(nos, 'nosBtn harus ada');

  fire(nos, 'pointerdown', { pointerId: 7 });
  assert.equal(ctl.nos, 1, 'NOS harus aktif saat ditekan');

  /* INI bug-nya dulu: jari bergeser sedikit -> pointerleave -> NOS mati */
  fire(nos, 'pointerleave', { pointerId: 7 });
  assert.equal(ctl.nos, 1, 'NOS tidak boleh mati hanya karena pointerleave');

  fire(nos, 'pointerup', { pointerId: 7 });
  assert.equal(ctl.nos, 0, 'NOS harus mati saat dilepas');
});

test('NOS: tombol tidak dipasang listener pointerleave sama sekali', async () => {
  const { } = await bootHUD();
  const nos = document.getElementById('nosBtn');
  assert.ok(!nos._listeners.has('pointerleave'),
    'pointerleave tidak boleh dipasang lagi — itu penyebab NOS lepas sendiri');
});

test('NOS: pointer capture dipasang saat ditekan', async () => {
  await bootHUD();
  const nos = document.getElementById('nosBtn');
  fire(nos, 'pointerdown', { pointerId: 42 });
  assert.ok(nos._captured.has(42), 'setPointerCapture harus dipanggil');
});

test('jaring pengaman window: pointerup di luar elemen tetap melepas tombol', async () => {
  const { ctl } = await bootHUD();
  const gas = document.getElementById('gasBtn');
  fire(gas, 'pointerdown', { pointerId: 3 });
  assert.equal(ctl.gas, 1);
  /* jari terangkat di atas kanvas, bukan di atas tombol */
  fireWindow('pointerup', { pointerId: 3 });
  assert.equal(ctl.gas, 0, 'tombol tidak boleh nyangkut menyala terus');
});

test('blur membersihkan semua tombol (tidak ada yang nyangkut)', async () => {
  const { ctl } = await bootHUD();
  fire(document.getElementById('gasBtn'), 'pointerdown', { pointerId: 1 });
  fire(document.getElementById('steerL'), 'pointerdown', { pointerId: 2 });
  assert.equal(ctl.gas, 1);
  assert.equal(ctl.left, 1);
  fireWindow('blur');
  assert.equal(ctl.gas, 0);
  assert.equal(ctl.left, 0);
});

test('setInCar menampilkan kontrol sentuh', async () => {
  const { hud } = await bootHUD();
  const ctrls = document.getElementById('carCtrls');
  assert.equal(ctrls.classList.contains('on'), false);
  hud.setInCar(true);
  assert.equal(ctrls.classList.contains('on'), true);
  hud.setInCar(false);
  assert.equal(ctrls.classList.contains('on'), false);
});

test('kamera: cycleCameraMode berputar near -> far -> cine -> near', async () => {
  const seen = [];
  const { hud } = await bootHUD({ onCameraMode: m => seen.push(m) });
  assert.equal(hud.getCameraMode(), 'near');
  assert.equal(hud.cycleCameraMode(), 'far');
  assert.equal(hud.cycleCameraMode(), 'cine');
  assert.equal(hud.cycleCameraMode(), 'near');
  assert.deepEqual(seen, ['far', 'cine', 'near']);
  assert.equal(document.getElementById('camLbl').textContent, 'DEKAT');
});

test('kamera: setCameraMode menolak nilai asing', async () => {
  const { hud } = await bootHUD();
  assert.equal(hud.setCameraMode('tidak-ada'), 'near');
  assert.equal(hud.setCameraMode('far'), 'far');
});

test('layout: hanya tombol yang digeser pemain yang dapat posisi inline', async () => {
  const { hud } = await bootHUD();
  const gas = document.getElementById('gasBtn');
  const brake = document.getElementById('brakeBtn');

  hud.applyLayout({ gasBtn: { x: 0.5, y: 0.5 } }, 1);
  assert.equal(gas.style.left, '400px', '0.5 x 800px');
  assert.equal(gas.style.top, '180px', '0.5 x 360px');
  assert.equal(gas.style.right, 'auto');
  assert.equal(brake.style.left, '', 'tombol lain harus tetap dari CSS');
  assert.equal(brake.style.top, '');

  /* hapus dari layout -> kembali ke CSS */
  hud.applyLayout({}, 1);
  assert.equal(gas.style.left, '');
  assert.equal(gas.style.right, '');
});

test('layout: skala tombol diterapkan, dan 1 berarti tidak menulis transform', async () => {
  const { hud } = await bootHUD();
  const gas = document.getElementById('gasBtn');
  hud.applyLayout({}, 1);
  assert.equal(gas.style.transform, '', 'skala 1 tidak boleh menulis transform');
  hud.applyLayout({}, 1.25);
  assert.equal(gas.style.transform, 'scale(1.25)');
  hud.applyLayout({ gasBtn: { x: 0.5, y: 0.5 } }, 1.25);
  assert.equal(gas.style.transform, 'translate(-50%,-50%) scale(1.25)');
});

test('mode susun: kontrol tetap terlihat walau pemain tidak di dalam mobil', async () => {
  const { hud } = await bootHUD();
  const ctrls = document.getElementById('carCtrls');
  hud.setInCar(false);
  assert.equal(ctrls.classList.contains('on'), false);
  hud.setEditMode(true);
  assert.equal(ctrls.classList.contains('on'), true,
    'tanpa ini pemain jalan kaki tidak punya tombol untuk digeser');
  hud.setEditMode(false);
  assert.equal(ctrls.classList.contains('on'), false);
});

test('tema: setTheme men-toggle kelas monokrom di body', async () => {
  const { hud } = await bootHUD();
  hud.setTheme('color');
  assert.equal(document.body.classList.contains('ui-color'), true);
  hud.setTheme('mono');
  assert.equal(document.body.classList.contains('ui-color'), false);
});

test('update: NOS kosong memberi tanda, dan toast hilang sendiri', async () => {
  const { hud } = await bootHUD();
  hud.setInCar(true);
  const car = { kmh: 0, rpm: 900, speed: 0, throttle: 0, nitro: 0, nitroActive: false, nitroDenied: true };
  hud.update(car);
  assert.equal(document.getElementById('nosWrap').classList.contains('empty'), true);
  assert.equal(document.getElementById('nosToast').classList.contains('on'), true);

  /* setelah ~1 detik toast harus hilang sendiri.
     Ganti SELURUH objek performance: menimpa .now saja membuat fungsi
     native dipanggil tanpa `this` dan melempar TypeError. */
  let fakeT = 0;
  globalThis.performance = { now: () => fakeT };
  hud.update(car);
  assert.equal(document.getElementById('nosToast').classList.contains('on'), true);

  fakeT = 5000;
  hud.update({ ...car, nitroDenied: false });
  assert.equal(document.getElementById('nosToast').classList.contains('on'), false,
    'toast harus hilang sendiri, bukan nyangkut di layar');
});
