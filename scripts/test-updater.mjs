#!/usr/bin/env node
/* Test updater.js tanpa browser: niru window (localStorage/sessionStorage/IndexedDB/fetch).
 * Jalankan: node scripts/test-updater.mjs
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gameHtml = readFileSync(join(root, 'www', 'game.html'));
const sha = createHash('sha256').update(gameHtml).digest('hex');

/* ---------- palsu: penyimpanan kv berbasis Map ---------- */
function fakeIDB(store) {
  const os = {
    get(k) { return { result: store.has(k) ? structuredClone(store.get(k)) : undefined }; },
    put(v, k) { store.set(k, structuredClone(v)); return {}; },
    delete(k) { store.delete(k); return {}; }
  };
  return {
    open(_n, _v) {
      const req = { onupgradeneeded: null, onerror: null, onsuccess: null, result: null };
      queueMicrotask(() => {
        req.result = {
          createObjectStore() { return os; },
          transaction() {
            const tx = { objectStore() { return os; }, onerror: null, onabort: null, oncomplete: null };
            queueMicrotask(() => tx.oncomplete && tx.oncomplete());
            return tx;
          },
          close() {}
        };
        req.onsuccess && req.onsuccess();
      });
      return req;
    }
  };
}
function fakeLS() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

/* ---------- palsu: fetch dengan tabel rute ---------- */
function makeFetch(routes) {
  return function fakeFetch(url) {
    const clean = String(url).split('?')[0];
    const hit = routes.get(clean);
    if (!hit) return Promise.reject(new TypeError('fetch gagal (simulasi jaringan) ' + clean));
    if (typeof hit === 'number') return Promise.reject(new Error('HTTP ' + hit));
    return Promise.resolve({
      ok: true, status: 200,
      headers: { get: () => null },
      json: () => Promise.resolve(JSON.parse(hit.toString())),
      text: () => Promise.resolve(hit.toString()),
      arrayBuffer: () => Promise.resolve(hit.buffer.slice(hit.byteOffset, hit.byteOffset + hit.byteLength)),
      body: null
    });
  };
}

function makeWindow({ routes, update }) {
  const w = {
    BZ_UPDATE: update,
    localStorage: fakeLS(), sessionStorage: fakeLS(),
    indexedDB: fakeIDB(new Map()),
    crypto: globalThis.crypto,
    document: { hidden: false, open() {}, write() {}, close() {} },
    location: { reload() { w.__reloaded = true; } }
  };
  globalThis.fetch = makeFetch(routes);
  new Function('window', readFileSync(join(root, 'www', 'updater.js'), 'utf8'))(w);
  return w;
}

const R = (s) => (typeof s === 'string' ? Buffer.from(s) : s);
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.error('  ✗', name); } }

const vJson = (build, name, opts = {}) => JSON.stringify({
  build, name, file: 'game.html', size: gameHtml.length, sha256: opts.sha === null ? 'deadbeef' : sha
});

/* ============================ UJI 1: fallback mirror ============================ */
console.log('UJI 1 — server utama mati, mirror hidup: check + download + launch');
{
  const w = makeWindow({
    update: { url: 'https://main.test/rpg/', repo: 'KyokoApp/rpg', urls: ['https://main.test/rpg/', 'https://raw.test/KyokoApp/rpg/update-pkg/'] },
    routes: new Map([
      // hanya version.json relatif (bawaan APK) + mirror raw yang hidup
      ['version.json', R('{"build": 100, "name": "apk"}')],
      ['https://raw.test/KyokoApp/rpg/update-pkg/version.json', R(vJson(5000, 'mirror-build'))],
      ['https://raw.test/KyokoApp/rpg/update-pkg/game.html', gameHtml]
    ])
  });
  const U = w.BZUpdater;
  ok(U.enabled, 'enabled = true walau repo mirror dari config');
  const c = await U.check();
  ok(c.available === true, 'pembaruan tersedia via mirror');
  ok(c.remote._base === 'https://raw.test/KyokoApp/rpg/update-pkg/', 'remote mencatat server asal');
  ok(c.errors.length === 1 && /main\.test/.test(c.errors[0]), 'kegagalan server utama tercatat: ' + c.errors[0]);
  ok(w.localStorage.getItem('bz_base_ok') === 'https://raw.test/KyokoApp/rpg/update-pkg/', 'server yang berhasil diingat');
  let prog = [];
  await U.download(c.remote, p => prog.push(p));
  ok(prog[prog.length - 1] === 1, 'progress sampai 100%');
  const cur = await U.current();
  ok(cur.build === 5000 && cur.source === 'stored', 'versi terunduh terpakai');
  await U.launch();
  ok(w.__reloaded !== true, 'launch menulis dokumen tanpa reload');
}

/* ============================ UJI 2: semua server mati ============================ */
console.log('UJI 2 — semua server tidak terjangkau: alasan + daftar kesalahan');
{
  const w = makeWindow({
    update: { url: 'https://a.test/', repo: 'KyokoApp/rpg' },
    routes: new Map([['version.json', R('{"build": 100, "name": "apk"}')]])
  });
  const c = await w.BZUpdater.check();
  ok(c.available === false && c.reason === 'offline', 'reason = offline');
  ok(c.errors.length === 3, '3 server dicoba (utama + raw + jsdelivr), ' + c.errors.length + ' tercatat');
}

/* ============================ UJI 3: hash/ukuran salah ditolak ============================ */
console.log('UJI 3 — hash tidak cocok → unduhan dibuang, tidak tersimpan');
{
  const w = makeWindow({
    update: { url: 'https://main.test/', repo: '' },
    routes: new Map([
      ['version.json', R('{"build": 100, "name": "apk"}')],
      ['https://main.test/version.json', R(vJson(5000, 'rusak', { sha: null }))],
      ['https://main.test/game.html', gameHtml]
    ])
  });
  const U = w.BZUpdater;
  const c = await U.check();
  let err = null;
  try { await U.download(c.remote, () => {}); } catch (e) { err = e; }
  ok(err && /hash/.test(err.message), 'download ditolak: ' + (err && err.message));
  const cur = await U.current();
  ok(cur.source === 'bundled', 'tetap pakai versi bawaan APK');
}

/* ============================ UJI 4: tanpa konfigurasi ============================ */
console.log('UJI 4 — tanpa url & repo: pembaruan dimatikan');
{
  const w = makeWindow({ update: {}, routes: new Map() });
  ok(w.BZUpdater.enabled === false, 'enabled = false');
  const c = await w.BZUpdater.check();
  ok(c.reason === 'disabled', 'reason = disabled');
}

/* ============================ UJI 5: APK lebih baru dari sisa unduhan ============================ */
console.log('UJI 5 — bawaan APK lebih baru: unduhan lama dibuang, jalankan bawaan');
{
  const store = new Map();
  const w = makeWindow({ update: { url: 'https://main.test/' }, routes: new Map([['version.json', R('{"build": 9000, "name": "apk-baru"}')], ['game.html', gameHtml]]) });
  w.indexedDB = fakeIDB(store);
  store.set('game', { build: 5000, name: 'lama', html: '<html>x</html>' });
  await w.BZUpdater.launch();
  ok(!store.has('game'), 'sisa unduhan dihapus');
  ok(w.__reloaded !== true, 'launch selesai menulis game bawaan');
}

/* ============================ UJI 6: blacklist rollback ============================ */
console.log('UJI 6 — blacklist build gagal jalan: berlaku 24 jam, entri lama diabaikan');
{
  const routes = new Map([
    ['version.json', R('{"build": 100, "name": "apk"}')],
    ['https://main.test/version.json', R(vJson(5000, 'baru'))],
    ['https://main.test/game.html', gameHtml]
  ]);
  // a) entri legacy tanpa cap waktu (pemain lama yang nyangkut) -> diabaikan
  let w = makeWindow({ update: { url: 'https://main.test/' }, routes });
  w.localStorage.setItem('bz_bad_build', '5000');   // format lama, tanpa bz_bad_at
  let c = await w.BZUpdater.check();
  ok(c.available === true, 'blacklist legacy diabaikan -> update tersedia lagi');

  // b) baru diblacklist -> tidak tersedia
  w = makeWindow({ update: { url: 'https://main.test/' }, routes });
  w.localStorage.setItem('bz_bad_build', '5000');
  w.localStorage.setItem('bz_bad_at', String(Date.now()));
  c = await w.BZUpdater.check();
  ok(c.available === false, 'blacklist segar memblokir build 5000');

  // c) kedaluwarsa 24 jam -> tersedia lagi
  w.localStorage.setItem('bz_bad_at', String(Date.now() - 25 * 3600 * 1000));
  c = await w.BZUpdater.check();
  ok(c.available === true, 'blacklist kedaluwarsa setelah 24 jam');

  // d) rollback mencatat cap waktu
  const idbStore = new Map([['game', { build: 4321, name: 'x', html: '<html></html>' }]]);
  w.indexedDB = fakeIDB(idbStore);
  await w.BZUpdater.rollback();
  ok(w.localStorage.getItem('bz_bad_build') === '4321', 'rollback memblacklist build terunduh');
  ok(!!w.localStorage.getItem('bz_bad_at'), 'rollback mencatat cap waktu blacklist');
}

/* ============================ UJI 7: markOk mencegah rollback ============================ */
console.log('UJI 7 — urutan launcher: unduh -> launch -> game memanggil markOk');
{
  const w = makeWindow({ update: { url: 'https://main.test/' }, routes: new Map([['version.json', R('{"build": 100, "name": "apk"}')]]) });
  const routes2 = new Map([
    ['version.json', R('{"build": 100, "name": "apk"}')],
    ['https://main.test/version.json', R(vJson(7000, 'baru-banget'))],
    ['https://main.test/game.html', gameHtml]
  ]);
  globalThis.fetch = makeFetch(routes2);
  const c = await w.BZUpdater.check();
  await w.BZUpdater.download(c.remote, () => {});
  await w.BZUpdater.launch();
  w.BZUpdater.markOk();
  ok(w.sessionStorage.getItem('bz_stored_run') === '7000', 'versi terunduh ditandai sedang berjalan');
  const cur = await w.BZUpdater.current();
  ok(cur.build === 7000 && cur.source === 'stored', 'versi terunduh TIDAK dihapus setelah markOk');
}

console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
