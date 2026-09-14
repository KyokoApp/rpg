/* ============================================================
   TES: penangan error global (#fatalErr).

   Bug layar hitam dulu gagal SENYAP: animate() melempar tiap frame,
   loop tetap hidup, canvas tidak pernah digambar, dan tidak ada satu
   pun petunjuk di layar. Panel #fatalErr menutup lubang itu.

   Tes ini MENGANGKAT showFatal() dari index.html dan benar-benar
   menjalankannya di atas mini-DOM, lalu memeriksa perilakunya:
   muncul sekali, tidak spam, tidak menutupi error aslinya.
   ============================================================ */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const HTML = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const CODE = HTML.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

/* ---- angkat deklarasi _fatalShown + fungsi showFatal apa adanya ---- */
const startIdx = CODE.indexOf('let _fatalShown = false;');
assert.ok(startIdx !== -1, 'deklarasi _fatalShown harus ada di index.html');
const fnIdx = CODE.indexOf('function showFatal(', startIdx);
assert.ok(fnIdx !== -1, 'function showFatal harus ada di index.html');
let depth = 0, end = CODE.indexOf('{', fnIdx);
for (; end < CODE.length; end++) {
  if (CODE[end] === '{') depth++;
  else if (CODE[end] === '}') { depth--; if (depth === 0) break; }
}
const FATAL_SRC = CODE.slice(startIdx, end + 1);
assert.ok(FATAL_SRC.includes('classList.add(\'on\')'),
  'sanity: showFatal harus menyalakan panel lewat kelas "on"');

/* ---------------- mini DOM ---------------- */
function makeEnv() {
  const nodes = {};
  const mk = (id) => (nodes[id] = {
    id,
    _class: new Set(),
    _text: '',
    _listeners: {},
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    classList: {
      add: (...c) => c.forEach((x) => nodes[id]._class.add(x)),
      remove: (...c) => c.forEach((x) => nodes[id]._class.delete(x)),
      contains: (c) => nodes[id]._class.has(c),
    },
    addEventListener(ev, fn) { (nodes[id]._listeners[ev] ||= []).push(fn); },
  });
  mk('fatalErr'); mk('fatalErrMsg'); mk('fatalErrReload');

  const winListeners = {};
  let reloaded = 0;
  const sandbox = {
    document: { getElementById: (id) => nodes[id] || null },
    console: { error() {} },
    location: { reload() { reloaded++; } },
    addEventListener: (ev, fn) => { (winListeners[ev] ||= []).push(fn); },
    _nodes: nodes,
    _winListeners: winListeners,
    get _reloaded() { return reloaded; },
  };
  return sandbox;
}

/* bangun showFatal di dalam sandbox, kembalikan {showFatal, fire} */
function boot() {
  const env = makeEnv();
  const factory = new Function(
    'document', 'console', 'location', 'addEventListener',
    `${FATAL_SRC}
     return { showFatal, isShown: () => _fatalShown,
              fire: (ev, payload) => (_winFire[ev] || []).forEach(f => f(payload)) };`,
  );
  /* kumpulkan listener window supaya bisa dipicu */
  const captured = {};
  const api = factory(
    env.document, env.console, env.location,
    (ev, fn) => { (captured[ev] ||= []).push(fn); },
  );
  return { env, api, captured };
}

test('error global menampilkan panel dengan pesan aslinya', () => {
  const { env, api } = boot();
  assert.equal(env._nodes.fatalErr.classList.contains('on'), false,
    'panel harus tersembunyi sebelum ada error');

  api.showFatal(new TypeError('postOpts.sunScreen.set is not a function'));

  assert.equal(env._nodes.fatalErr.classList.contains('on'), true,
    'panel harus muncul saat ada error fatal');
  assert.match(env._nodes.fatalErrMsg.textContent, /sunScreen\.set is not a function/,
    'pesan error asli harus terlihat oleh pemain, bukan pesan generik');
});

test('tidak spam: error berulang hanya menampilkan panel sekali', () => {
  const { env, api } = boot();
  api.showFatal(new Error('pertama'));
  const first = env._nodes.fatalErrMsg.textContent;

  /* loop yang rusak akan memanggil ini 60x/detik */
  for (let i = 0; i < 60; i++) api.showFatal(new Error('frame ke-' + i));

  assert.match(first, /pertama/, 'error PERTAMA yang harus ditampilkan, bukan yang terakhir');
  assert.equal(env._nodes.fatalErrMsg.textContent, first,
    'pesan tidak boleh tertimpa — pemain butuh error pertama sebagai petunjuk');
  assert.equal(api.isShown(), true);
});

test('listener window terpasang untuk error dan unhandledrejection', () => {
  const { captured } = boot();
  /* listener dipasang di window scope index.html, bukan di sandbox ini,
     jadi yang diverifikasi adalah sumbernya benar-benar mendaftarkan keduanya */
  assert.ok(/addEventListener\(\s*'error'/.test(CODE),
    "index.html harus memasang addEventListener('error')");
  assert.ok(/addEventListener\(\s*'unhandledrejection'/.test(CODE),
    "index.html harus memasang addEventListener('unhandledrejection')");

  const errIdx = CODE.indexOf("addEventListener('error'");
  const rejIdx = CODE.indexOf("addEventListener('unhandledrejection'");
  const heavyIdx = CODE.indexOf('function animate(');
  assert.ok(errIdx < heavyIdx && rejIdx < heavyIdx,
    'penangan error harus dipasang SEBELUM loop render, supaya error boot tertangkap');
  void captured;
});

test('input aneh tidak membuat showFatal ikut melempar', () => {
  const { api } = boot();
  assert.doesNotThrow(() => api.showFatal(undefined));
  assert.doesNotThrow(() => api.showFatal(null));
  assert.doesNotThrow(() => api.showFatal('string polos'));
  assert.doesNotThrow(() => api.showFatal({}));
  assert.doesNotThrow(() => api.showFatal({ message: 12345 }));
});

test('pesan sangat panjang dipotong, tidak menghancurkan tata letak', () => {
  const { env, api } = boot();
  api.showFatal(new Error('x'.repeat(5000)));
  assert.ok(env._nodes.fatalErrMsg.textContent.length <= 800,
    `pesan harus dipotong <= 800 karakter, dapat ${env._nodes.fatalErrMsg.textContent.length}`);
});

test('animate() berhenti mengerjakan frame setelah fatal (tidak membanjiri konsol)', () => {
  /* guard ini yang mencegah loop rusak melempar 60x/detik */
  const fn = CODE.slice(CODE.indexOf('function animate('));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.ok(body.includes('if (_fatalShown) return;'),
    'animate() harus keluar lebih awal setelah error fatal');

  const rafIdx = body.indexOf('requestAnimationFrame(animate)');
  const guardIdx = body.indexOf('if (_fatalShown) return;');
  assert.ok(rafIdx !== -1 && guardIdx > rafIdx,
    'guard harus SETELAH requestAnimationFrame, agar loop tidak mati total');
});

test('panel error punya gaya dan berada di atas segalanya', () => {
  const css = readFileSync(resolve(__dirname, '../game/hud.css'), 'utf8');
  assert.ok(/#fatalErr\{[^}]*display:none/.test(css), 'panel harus tersembunyi secara bawaan');
  assert.ok(/#fatalErr\.on\{[^}]*display:block/.test(css), 'kelas .on harus menampilkannya');

  const zFatal = Number(css.match(/#fatalErr\{[^}]*z-index:(\d+)/)[1]);
  const zLoad = Number(css.match(/#loadScreen\{[^}]*z-index:(\d+)/)[1]);
  assert.ok(zFatal > zLoad,
    `z-index panel error (${zFatal}) harus di atas layar loading (${zLoad})`);
});
