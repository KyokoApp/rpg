/* BlockZone updater
 * Aplikasi Android cuma peluncur. Game (game.html) bisa diperbarui lewat internet:
 *   - versi bawaan APK  : game.html + version.json (di dalam APK)
 *   - versi terunduh    : disimpan di IndexedDB, dipakai kalau lebih baru dari bawaan APK
 * Update = ganti game.html di server (lihat README). Tidak perlu install APK lagi.
 */
(function (global) {
  'use strict';
  if (global.BZUpdater) return;

  var cfg = global.BZ_UPDATE || {};
  var base = String(cfg.url || '').trim();
  if (base && base.charAt(base.length - 1) !== '/') base += '/';

  var DB_NAME = 'bz-updates', STORE = 'kv', KEY_GAME = 'game';
  var LS_BAD = 'bz_bad_build';          // build terunduh yang gagal jalan -> jangan diunduh lagi
  var SS_STORED = 'bz_stored_run';      // sesi ini menjalankan versi terunduh (bukan bawaan APK)
  var WATCHDOG_MS = 10000;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var to = setTimeout(function () { reject(new Error('timeout')); }, ms);
      Promise.resolve(p).then(function (v) { clearTimeout(to); resolve(v); }, function (e) { clearTimeout(to); reject(e); });
    });
  }
  function ls(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} }
  function ss(k) { try { return global.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { global.sessionStorage.setItem(k, v); } catch (e) {} }
  function ssDel(k) { try { global.sessionStorage.removeItem(k); } catch (e) {} }

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

  function check() {
    if (!base) return Promise.resolve({ available: false, reason: 'disabled' });
    return current().then(function (cur) {
      return withTimeout(fetch(base + 'version.json?t=' + Date.now(), { cache: 'no-store' }), 6000)
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function (remote) {
          remote.build = Number(remote.build) || 0;
          var bad = Number(ls(LS_BAD)) || 0;
          var available = remote.build > cur.build && remote.build > bad;
          return { available: available, remote: remote, current: cur };
        })
        .catch(function () { return { available: false, reason: 'offline', current: cur }; });
    });
  }

  function toHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  // Unduh game terbaru, cek ukuran + hash, baru simpan. onProgress(0..1 | null)
  function download(remote, onProgress) {
    var url = base + (remote.file || 'game.html') + '?v=' + remote.build;
    return withTimeout(fetch(url, { cache: 'no-store' }), 15000).then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      var total = Number(remote.size) || Number(res.headers.get('content-length')) || 0;
      if (res.body && res.body.getReader) {
        var reader = res.body.getReader(), parts = [], got = 0;
        var pump = function () {
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
      if (st) lsSet(LS_BAD, String(st.build));
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
    enabled: !!base,
    current: current,
    check: check,
    download: download,
    launch: launch,
    markOk: markOk,
    armWatchdog: armWatchdog,
    rollback: rollback
  };
})(window);
