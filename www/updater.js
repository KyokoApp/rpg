/* BlockZone updater (v2)
 * Aplikasi Android cuma peluncur. Game (game.html) bisa diperbarui lewat internet:
 *   - versi bawaan APK  : game.html + version.json (di dalam APK)
 *   - versi terunduh    : disimpan di IndexedDB, dipakai kalau lebih baru dari bawaan APK
 * Update = ganti game.html di server (lihat README). Tidak perlu install APK lagi.
 *
 * v2: beberapa server sekaligus (utama + mirror raw.githubusercontent + mirror jsDelivr).
 *     Server yang pernah berhasil dicoba duluan. Semua kegagalan dilaporkan dengan alasannya.
 */
(function (global) {
  'use strict';
  if (global.BZUpdater) return;

  var DB_NAME = 'bz-updates', STORE = 'kv', KEY_GAME = 'game';
  var LS_BAD = 'bz_bad_build';          // build terunduh yang gagal jalan -> jangan diunduh lagi
  var LS_BAD_AT = 'bz_bad_at';          // kapan diblacklist; blacklist kedaluwarsa dalam 24 jam
  var BAD_TTL = 24 * 60 * 60 * 1000;
  var LS_BASE_OK = 'bz_base_ok';        // server update yang terakhir berhasil (dicoba duluan)
  var SS_STORED = 'bz_stored_run';      // sesi ini menjalankan versi terunduh (bukan bawaan APK)
  var CHECK_BUDGET = 15000;             // total anggaran waktu cek versi (semua server)
  var CHECK_TIMEOUT = 8000;             // batas waktu per server saat cek versi
  var WATCHDOG_MS = 10000;
  var DOWNLOAD_TIMEOUT = 30000;

  function cfg() { return global.BZ_UPDATE || {}; }
  function norm(u) { u = String(u || '').trim(); if (!u) return ''; if (u.charAt(u.length - 1) !== '/') u += '/'; return u; }
  function ls(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} }
  function ss(k) { try { return global.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { global.sessionStorage.setItem(k, v); } catch (e) {} }
  function ssDel(k) { try { global.sessionStorage.removeItem(k); } catch (e) {} }

  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var to = setTimeout(function () { reject(new Error('timeout')); }, ms);
      Promise.resolve(p).then(function (v) { clearTimeout(to); resolve(v); }, function (e) { clearTimeout(to); reject(e); });
    });
  }

  /* ---------- daftar server update ---------- */
  // Urutan: yang terakhir berhasil -> daftar dari konfigurasi -> mirror otomatis dari repo.
  function baseList() {
    var c = cfg(), out = [], seen = {};
    function add(u) { u = norm(u); if (u && !seen[u]) { seen[u] = 1; out.push(u); } }
    add(ls(LS_BASE_OK));
    if (Array.isArray(c.urls)) for (var i = 0; i < c.urls.length; i++) add(c.urls[i]);
    add(c.url);
    if (c.repo) {
      add('https://raw.githubusercontent.com/' + c.repo + '/update-pkg/');
      add('https://cdn.jsdelivr.net/gh/' + c.repo + '@update-pkg/');
    }
    return out;
  }

  /* ---------- penyimpanan (IndexedDB) ---------- */
  function openDb() {
    return new Promise(function (resolve, reject) {
      var r = global.indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }
  function kv(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var req = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { db.close(); resolve(req && req.result); };
        tx.onerror = tx.onabort = function () { db.close(); reject(tx.error || new Error('idb')); };
      });
    });
  }
  function kvGet(k) { return kv('readonly', function (s) { return s.get(k); }); }
  function kvSet(k, v) { return kv('readwrite', function (s) { return s.put(v, k); }); }
  function kvDel(k) { return kv('readwrite', function (s) { return s.delete(k); }); }
  function stored() { return kvGet(KEY_GAME).catch(function () { return null; }); }

  // build yang diblacklist (masih berlaku = diblacklist dalam 24 jam terakhir).
  // Entri lama tanpa cap waktu diabaikan -> instalasi yang dulu nyangkut otomatis lepas.
  function badBuild() {
    var b = Number(ls(LS_BAD)) || 0;
    if (!b) return 0;
    var at = Number(ls(LS_BAD_AT)) || 0;
    if (!at || Date.now() - at > BAD_TTL) return 0;
    return b;
  }

  /* ---------- versi ---------- */
  function bundled() {
    return fetch('version.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { return { build: Number(j.build) || 0, name: String(j.name || 'dev') }; })
      .catch(function () { return { build: 0, name: 'dev' }; });
  }

  // versi yang akan dijalankan: hasil unduhan kalau lebih baru dari bawaan APK
  function current() {
    return Promise.all([bundled(), stored()]).then(function (a) {
      var b = a[0], st = a[1];
      if (st && st.html && st.build > b.build) return { build: st.build, name: st.name, source: 'stored' };
      return { build: b.build, name: b.name, source: 'bundled' };
    });
  }

  // Cek versi di semua server sampai ada yang jawab. Semua kegagalan dikembalikan di `errors`.
  function check() {
    var bases = baseList();
    if (!bases.length) return Promise.resolve({ available: false, reason: 'disabled' });
    return current().then(function (cur) {
      var errors = [], t0 = Date.now();
      function attempt(i) {
        if (i >= bases.length || Date.now() - t0 > CHECK_BUDGET) {
          return { available: false, reason: 'offline', current: cur, errors: errors };
        }
        var b = bases[i];
        var left = Math.min(CHECK_TIMEOUT, CHECK_BUDGET - (Date.now() - t0));
        return withTimeout(fetch(b + 'version.json?t=' + Date.now(), { cache: 'no-store' }), left)
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (j) {
            if (!j || !Number(j.build)) throw new Error('version.json tidak valid');
            j._base = b;
            lsSet(LS_BASE_OK, b);
            var rb = Number(j.build) || 0;
            return { available: rb > cur.build && rb > badBuild(), remote: j, current: cur, errors: errors };
          })
          .catch(function (e) {
            errors.push(b + ' ' + String((e && e.message) || e));
            return attempt(i + 1);
          });
      }
      return attempt(0);
    });
  }

  function toHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  // Unduh game terbaru dari server asal version.json, cek ukuran + hash, baru simpan.
  // onProgress(0..1 | null)
  function download(remote, onProgress) {
    var base = norm(remote && remote._base) || baseList()[0] || '';
    if (!base) return Promise.reject(new Error('pembaruan dimatikan'));
    var url = base + ((remote && remote.file) || 'game.html') + '?v=' + ((remote && remote.build) || Date.now());
    var t0 = Date.now();
    return withTimeout(fetch(url, { cache: 'no-store' }), DOWNLOAD_TIMEOUT).then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      var total = Number(remote.size) || Number(res.headers.get('content-length')) || 0;
      if (res.body && res.body.getReader) {
        var reader = res.body.getReader(), parts = [], got = 0;
        var pump = function () {
          if (Date.now() - t0 > DOWNLOAD_TIMEOUT) {
            try { reader.cancel(); } catch (e) {}
            return Promise.reject(new Error('timeout'));
          }
          return reader.read().then(function (c) {
            if (c.done) return;
            parts.push(c.value); got += c.value.length;
            if (onProgress) onProgress(total ? Math.min(0.99, got / total) : null);
            return pump();
          });
        };
        return pump().then(function () {
          var bytes = new Uint8Array(got), o = 0;
          parts.forEach(function (p) { bytes.set(p, o); o += p.length; });
          return bytes;
        });
      }
      return res.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    }).then(function (bytes) {
      if (remote.size && bytes.length !== Number(remote.size)) throw new Error('ukuran file tidak cocok');
      var hashOk = Promise.resolve();
      if (remote.sha256 && global.crypto && global.crypto.subtle) {
        hashOk = global.crypto.subtle.digest('SHA-256', bytes).then(function (h) {
          if (toHex(h) !== String(remote.sha256).toLowerCase()) throw new Error('hash tidak cocok');
        });
      }
      return hashOk.then(function () {
        var html = new TextDecoder('utf-8').decode(bytes);
        if (html.indexOf('</html>') < 0) throw new Error('file game rusak');
        return kvSet(KEY_GAME, { build: remote.build, name: String(remote.name || remote.build), html: html, savedAt: Date.now() });
      });
    }).then(function () {
      if (onProgress) onProgress(1);
      return true;
    });
  }

  /* ---------- jalankan game ---------- */
  function rollback() {
    return stored().then(function (st) {
      if (st) {
        lsSet(LS_BAD, String(st.build));
        lsSet(LS_BAD_AT, String(Date.now()));
      }
      ssDel(SS_STORED);
      return kvDel(KEY_GAME).catch(function () {});
    });
  }

  // Kalau game terunduh tidak sempat jalan dalam 10 detik, buang & pakai versi bawaan APK.
  function armWatchdog() {
    if (global.__bzWd || !ss(SS_STORED)) return;
    var tick = function () {
      if (global.__bzOk) return;
      if (global.document && global.document.hidden) { global.__bzWd = setTimeout(tick, 3000); return; }
      rollback().then(function () { global.location.reload(); });
    };
    global.__bzWd = setTimeout(tick, WATCHDOG_MS);
  }

  function markOk() {
    global.__bzOk = true;
    if (global.__bzWd) { clearTimeout(global.__bzWd); global.__bzWd = 0; }
  }

  function launch() {
    return Promise.all([bundled(), stored()]).then(function (a) {
      var b = a[0], st = a[1];
      ssDel(SS_STORED);
      if (st && st.html && st.build > b.build) {
        ssSet(SS_STORED, String(st.build));
        return st.html;
      }
      var cleanup = st ? kvDel(KEY_GAME).catch(function () {}) : Promise.resolve();   // APK lebih baru dari sisa unduhan
      return cleanup.then(function () {
        return fetch('game.html', { cache: 'no-store' }).then(function (r) {
          if (!r.ok) throw new Error('game.html tidak ditemukan');
          return r.text();
        });
      });
    }).then(function (html) {
      global.__bzOk = false;
      global.document.open();
      global.document.write(html);
      global.document.close();
      armWatchdog();
    });
  }

  global.BZUpdater = {
    VER: 2,
    get enabled() { return baseList().length > 0; },
    baseList: baseList,
    current: current,
    check: check,
    download: download,
    launch: launch,
    markOk: markOk,
    armWatchdog: armWatchdog,
    rollback: rollback
  };
})(window);
