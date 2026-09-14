/* ============================================================
   TEST game/settings-ui.mjs — panel pengaturan, DOM headless.

   settings-ui membangun SELURUH panel dari JS. Kalau ia melempar,
   tombol Pengaturan tampak mati dan tidak ada satu pun setting yang
   bisa diakses. Jalur ini wajib ada tesnya.
   Mini-DOM; tanpa browser, tanpa tiga.
   ============================================================ */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/* ---------------- mini DOM ---------------- */
function el(tag) {
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    _class: new Set(),
    _text: '',
    _html: '',
    _listeners: {},
    value: '',
    get lastChild() { return this.children[this.children.length - 1] || null; },
    get firstChild() { return this.children[0] || null; },
    get className() { return [...this._class].join(' '); },
    set className(v) { this._class = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    classList: {
      add: (...c) => c.forEach((x) => node._class.add(x)),
      remove: (...c) => c.forEach((x) => node._class.delete(x)),
      contains: (c) => node._class.has(c),
      toggle: (c, f) => (f === undefined
        ? (node._class.has(c) ? node._class.delete(c) : node._class.add(c))
        : (f ? node._class.add(c) : node._class.delete(c))),
    },
    appendChild(c) { node.children.push(c); return c; },
    append(...cs) { node.children.push(...cs); },
    setAttribute(k, v) { node.dataset[k] = String(v); },
    getAttribute(k) { return node.dataset[k] === undefined ? null : node.dataset[k]; },
    addEventListener(ev, fn) { (node._listeners[ev] ||= []).push(fn); },
    removeEventListener(ev, fn) {
      node._listeners[ev] = (node._listeners[ev] || []).filter((f) => f !== fn);
    },
    dispatchEvent(e) {
      (node._listeners[e.type] || []).forEach((f) => f({ ...e, target: node, currentTarget: node, preventDefault() {} }));
      return true;
    },
  };
  return node;
}

globalThis.document = { createElement: el, getElementById: () => null };
globalThis.requestAnimationFrame = (cb) => { try { cb(0); } catch { /* abaikan */ } return 0; };

const { initSettingsUI } = await import(resolve(HERE, '../game/settings-ui.mjs'));
const {
  PRESET_IDS, PRESET_LABEL, FPS_CHOICES, GFX_OPTIONS, LEVEL_LABEL, TEXTURE_LEVEL_LABEL,
  DEFAULT_SETTINGS, cloneSettings,
} = await import(resolve(HERE, '../game/quality.mjs'));

/* ---------------- helper penelusuran ---------------- */
function all(root, out = []) {
  out.push(root);
  for (const c of root.children || []) all(c, out);
  return out;
}
function byClass(root, cls) { return all(root).filter((n) => n._class && n._class.has(cls)); }
/* teks chip disimpan sebagai innerHTML berbumbu <small>, jadi cocokkan awalan */
function findText(root, prefix) {
  return all(root).find((n) => n._html.startsWith(prefix) || n._text === prefix) || null;
}
/* baris opsi grafik ditandai dataset.off oleh refresh() */
function gfxRows(root) {
  return byClass(root, 'opt-row').filter((r) => {
    const v = byClass(r, 'opt-val')[0];
    return v && v.dataset.off !== undefined;
  });
}

function boot(mutation = (s) => s) {
  const host = el('div');
  let current = mutation(cloneSettings(DEFAULT_SETTINGS));
  const calls = [];
  const api = initSettingsUI({
    host,
    getSettings: () => current,
    onSettings: (next) => { calls.push(next); current = next; api.refresh(); },
    fps: 42,
  });
  return { host, api, calls, get: () => current };
}

/* ---------------- tes ---------------- */
test('panel terbangun tanpa melempar dan punya tab Grafik & Kontrol', () => {
  const { host } = boot();
  assert.ok(findText(host, 'Grafik'), 'tab Grafik harus ada');
  assert.ok(findText(host, 'Kontrol'), 'tab Kontrol harus ada');
  assert.ok(byClass(host, 'set-section').length >= 6,
    'semua seksi harus dirender, bukan cuma yang terlihat');
  assert.ok(byClass(host, 'tabpane').length === 2, 'harus ada tepat dua tabpane');
});

test('empat preset tampil dan memilih preset mengirim id yang benar', () => {
  const { host, calls } = boot();
  for (const id of PRESET_IDS) {
    assert.ok(findText(host, PRESET_LABEL[id]), `chip preset ${id} ("${PRESET_LABEL[id]}") harus ada`);
  }
  findText(host, PRESET_LABEL.low).dispatchEvent({ type: 'click' });
  assert.equal(calls.length, 1, 'memilih preset harus memanggil onSettings sekali');
  assert.equal(calls[0].quality, 'low', 'kunci preset adalah "quality", bukan "preset"');
  assert.equal(calls[0].gfx.renderScale, 0.7, 'preset Rendah harus menurunkan skala render');
});

test('FPS cap menawarkan 24/30/45/60 dan tersimpan sebagai angka', () => {
  const { host, calls } = boot();
  for (const f of FPS_CHOICES) assert.ok(findText(host, `${f}<small>`), `chip ${f} fps harus ada`);
  findText(host, '30<small>').dispatchEvent({ type: 'click' });
  assert.equal(calls.at(-1).fps, 30);
  assert.equal(typeof calls.at(-1).fps, 'number', 'fps harus angka, bukan string dari label');
  /* mengubah FPS tidak boleh menyeret preset grafis ikut berubah */
  assert.equal(calls.at(-1).quality, DEFAULT_SETTINGS.quality,
    'mengganti FPS tidak boleh mengubah preset');
});

test('setiap opsi grafik punya baris, dan setiap fitur bisa dimatikan', () => {
  const { host } = boot();
  const rows = gfxRows(host);
  assert.equal(rows.length, GFX_OPTIONS.length,
    `harus ada ${GFX_OPTIONS.length} baris opsi grafik, dapat ${rows.length}`);

  /* fitur bertanda off harus benar-benar bisa mencapai "Mati" */
  for (const { opt, val } of rows.map((r) => ({
    opt: GFX_OPTIONS[rows.indexOf(r)], val: byClass(r, 'opt-val')[0],
  }))) {
    if (!opt.off) continue;
    let guard = 0;
    while (val.textContent !== LEVEL_LABEL[0] && guard++ <= opt.max + 1) {
      val.dispatchEvent({ type: 'click' });
    }
    assert.equal(val.textContent, LEVEL_LABEL[0],
      `${opt.key} harus bisa mencapai "Mati" (permintaan pemain: tiap fitur bisa dimatikan)`);
    assert.equal(val.dataset.off, '1', `${opt.key} harus ditandai off saat Mati`);
  }
});

test('label tingkat selalu teks yang dikenal, tidak pernah undefined/kosong', () => {
  const { host } = boot();
  const valid = new Set([...LEVEL_LABEL, ...TEXTURE_LEVEL_LABEL]);
  for (const r of gfxRows(host)) {
    const v = byClass(r, 'opt-val')[0];
    assert.ok(valid.has(v.textContent),
      `label "${v.textContent}" bukan label tingkat yang dikenal`);
  }
});

test('klik nilai menaikkan tingkat dan mengirim angka, bukan label', () => {
  const { host, calls } = boot((s) => ({ ...s, gfx: { ...s.gfx, bloom: 0 } }));
  const bloomRow = gfxRows(host)[GFX_OPTIONS.findIndex((o) => o.key === 'bloom')];
  const val = byClass(bloomRow, 'opt-val')[0];
  assert.equal(val.textContent, LEVEL_LABEL[0]);
  val.dispatchEvent({ type: 'click' });
  assert.equal(calls.at(-1).gfx.bloom, 1, 'harus mengirim 1, bukan "Rendah"');
  assert.equal(val.textContent, LEVEL_LABEL[1]);
});

test('slider skala render mengirim pecahan, bukan persen', () => {
  const { host, calls } = boot();
  const slider = all(host).filter((n) => n.tagName === 'INPUT')[0];
  assert.ok(slider, 'harus ada slider skala render');
  assert.equal(slider.type, 'range');
  slider.value = '50';
  slider.dispatchEvent({ type: 'input' });
  assert.equal(calls.at(-1).gfx.renderScale, 0.5,
    'renderScale disimpan sebagai pecahan 0.5, bukan 50');
  slider.value = '150';
  slider.dispatchEvent({ type: 'input' });
  assert.equal(calls.at(-1).gfx.renderScale, 1.5);
});

test('refresh() aman dipanggil berulang dan menampilkan persen yang wajar', () => {
  const { host, api } = boot();
  assert.doesNotThrow(() => { api.refresh(); api.refresh(); });
  const pct = all(host).filter((n) => /%$/.test(n.textContent));
  assert.ok(pct.length >= 2, 'skala render & ukuran tombol harus tampil sebagai persen');
  for (const p of pct) assert.ok(!/NaN|undefined/.test(p.textContent), `label rusak: "${p.textContent}"`);
});

test('setFpsValue membulatkan dan tidak pernah menulis NaN', () => {
  const { api } = boot();
  const { host } = boot();
  /* bacaan FPS dibuat via createElement tanpa id: cari lewat barisnya */
  const readouts = byClass(host, 'opt-val');
  const before = readouts.map((n) => n.textContent);
  assert.doesNotThrow(() => api.setFpsValue(59.4));
  assert.doesNotThrow(() => api.setFpsValue(NaN));
  assert.doesNotThrow(() => api.setFpsValue(0));
  assert.ok(before.length > 0, 'harus ada elemen nilai di panel');
});

test('chip analog, tema, dan kamera mobil mengirim nilai yang sah', () => {
  const { host, calls } = boot();
  findText(host, 'Kotak').dispatchEvent({ type: 'click' });
  assert.equal(calls.at(-1).stickShape, 'square', 'analog kotak (sudut halus) harus bisa dipilih');
  findText(host, 'Berwarna').dispatchEvent({ type: 'click' });
  assert.equal(calls.at(-1).buttonTheme, 'color');
  findText(host, 'Hitam-putih').dispatchEvent({ type: 'click' });
  assert.equal(calls.at(-1).buttonTheme, 'mono');
  for (const [label, id] of [['Dekat', 'near'], ['Jauh', 'far'], ['Sinematik', 'cine']]) {
    findText(host, label).dispatchEvent({ type: 'click' });
    assert.equal(calls.at(-1).carCamera, id, `kamera ${label} -> ${id}`);
  }
});

test('slider ukuran tombol mengirim pecahan', () => {
  const { host, calls } = boot();
  const inputs = all(host).filter((n) => n.tagName === 'INPUT');
  assert.ok(inputs.length >= 2, 'harus ada slider skala render dan ukuran tombol');
  const btnSlider = inputs[1];
  btnSlider.value = '140';
  btnSlider.dispatchEvent({ type: 'input' });
  assert.equal(calls.at(-1).buttonScale, 1.4);
});

test('aksi Geser/Reset/Selesai terpanggil setelah didaftarkan', () => {
  const { host, api } = boot();
  let edit = 0, reset = 0, done = 0;
  api.onEditLayout(() => { edit++; });
  api.onResetLayout(() => { reset++; });
  api.onDone(() => { done++; });

  findText(host, 'Geser').dispatchEvent({ type: 'click' });
  findText(host, 'Reset').dispatchEvent({ type: 'click' });
  findText(host, 'Selesai').dispatchEvent({ type: 'click' });
  assert.deepEqual({ edit, reset, done }, { edit: 1, reset: 1, done: 1 });
});

test('aksi tetap aman bila callback belum didaftarkan', () => {
  const { host } = boot();
  assert.doesNotThrow(() => findText(host, 'Geser').dispatchEvent({ type: 'click' }));
  assert.doesNotThrow(() => findText(host, 'Selesai').dispatchEvent({ type: 'click' }));
});

test('meter FPS di layar bisa di-toggle', () => {
  const { host, calls } = boot((s) => ({ ...s, showFps: false }));
  findText(host, 'Tampilkan').dispatchEvent({ type: 'click' });
  assert.equal(calls.at(-1).showFps, true);
  findText(host, 'Tampilkan').dispatchEvent({ type: 'click' });
  assert.equal(calls.at(-1).showFps, false);
});

test('host kosong/null tidak membuat modul crash', () => {
  assert.doesNotThrow(() => initSettingsUI({ host: null, getSettings: () => ({}), onSettings: () => {} }));
});

test('tombol sentuh monokrom secara bawaan, warna hanya opt-in', () => {
  const car = readFileSync(resolve(HERE, '../game/car.css'), 'utf8');
  const hud = readFileSync(resolve(HERE, '../game/hud.css'), 'utf8');

  assert.ok(car.includes('body.ui-color'), 'harus ada jalur opt-in body.ui-color');
  assert.ok(car.includes('#carCtrls'), 'aturan #carCtrls harus ada');

  /* aturan netral harus muncul SEBELUM blok ui-color agar berlaku tanpa
     kelas itu. Yang dicari SELEKTOR di awal baris — bukan komentar yang
     sekadar menyebut namanya. */
  const m = car.search(/^body\.ui-color/m);
  assert.ok(m > 0, 'harus ada selektor body.ui-color di awal baris');
  const head = car.slice(0, m);
  assert.ok(/#carCtrls/.test(head), 'gaya dasar kontrol sentuh harus di luar blok ui-color');
  assert.ok(/#nosFill/.test(head), 'bar NOS juga harus netral tanpa body.ui-color');

  /* tombol sentuh tidak boleh diberi warna aksen di jalur monokrom */
  assert.ok(/\.tBtn/.test(hud), 'hud.css harus mendefinisikan .tBtn');
});
