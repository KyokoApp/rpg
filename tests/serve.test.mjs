/* ============================================================
   TEST tools/serve.mjs — penjaga path server pratinjau.

   Server pratinjau bind ke 0.0.0.0, jadi terjangkau dari luar
   sandbox. `.git/` berada DI DALAM root repo, sehingga penjaga
   "jangan keluar dari root" saja tidak cukup: tanpa penolakan
   dotfile terpisah, `.git/config` ikut terkirim. Tes ini mengunci
   perilaku itu supaya tidak diam-diam rusak lagi.
   ============================================================ */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolve, join, sep } from 'node:path';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const { resolveSafe, MIME } = await import(resolve(HERE, '../tools/serve.mjs'));

const ROOT = resolve(HERE, '..');

test('berkas game yang memang dibutuhkan tetap terlayani', () => {
  assert.equal(resolveSafe(ROOT, '/'), join(ROOT, 'index.html'));
  assert.equal(resolveSafe(ROOT, '/index.html'), join(ROOT, 'index.html'));
  assert.equal(resolveSafe(ROOT, '/game/quality.mjs'), join(ROOT, 'game', 'quality.mjs'));
  assert.equal(resolveSafe(ROOT, '/jsm/loaders/GLTFLoader.js'),
    join(ROOT, 'jsm', 'loaders', 'GLTFLoader.js'));
  assert.equal(resolveSafe(ROOT, '/car.glb'), join(ROOT, 'car.glb'));
});

test('dotfile di DALAM root ditolak (ini bug yang dulu bocor)', () => {
  assert.equal(resolveSafe(ROOT, '/.git/config'), null, '.git/config harus ditolak');
  assert.equal(resolveSafe(ROOT, '/.gitignore'), null);
  assert.equal(resolveSafe(ROOT, '/.github/workflows/verify.yml'), null);
  assert.equal(resolveSafe(ROOT, '/.env'), null);
});

test('penyamaran dotfile lewat encoding tetap ditolak', () => {
  assert.equal(resolveSafe(ROOT, '/%2e%2e/.git/config'), null);
  assert.equal(resolveSafe(ROOT, '/..%2f.git%2fconfig'), null);
  assert.equal(resolveSafe(ROOT, '/%2E%67it/config'), null, '%2E = titik, %67 = g');
});

test('tidak bisa keluar dari root repo', () => {
  /* Catatan: `normalize` sudah melipat `..` di depan root, jadi
     '/../etc/passwd' menjadi '/etc/passwd' lalu di-join ke ROOT.
     Hasilnya DI DALAM root (dan tidak ada -> 404), bukan null.
     Yang wajib dijamin adalah: tidak pernah keluar root. */
  const escapes = ['/../etc/passwd', '/game/../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/..'];
  for (const p of escapes) {
    const out = resolveSafe(ROOT, p);
    if (out === null) continue;                       // ditolak outright: juga aman
    assert.ok(out === ROOT || out.startsWith(ROOT + sep),
      `${p} lolos ke ${out} — di luar root`);
  }

  /* dan yang paling penting: berkas sensitif sungguhan tak pernah terjangkau */
  assert.equal(resolveSafe(ROOT, '/../.git/config'), null, '.git/config tetap ditolak (dotfile)');
  assert.equal(resolveSafe(ROOT, '/game/../../etc/passwd'), join(ROOT, 'etc', 'passwd'),
    'terpetakan ke dalam root, bukan /etc/passwd sungguhan');
});


test('node_modules tidak dilayani', () => {
  assert.equal(resolveSafe(ROOT, '/node_modules/three/package.json'), null);
});

test('byte NUL dan encoding rusak tidak menjatuhkan server', () => {
  assert.equal(resolveSafe(ROOT, '/index.html%00.png'), null);
  assert.equal(resolveSafe(ROOT, '/%E0%A4%A'), null, 'persen-encoding tidak sah');
  assert.equal(resolveSafe(ROOT, ''), null);
  assert.equal(resolveSafe(ROOT, null), null);
  assert.equal(resolveSafe(ROOT, undefined), null);
});

test('hasil selalu berada di dalam root (invarian utama)', () => {
  const probes = [
    '/', '/index.html', '/game/postfx.mjs', '/.git/config', '/../etc/passwd',
    '/%2e%2e/.git/config', '/node_modules/x/y.js', '/car.glb', '/a/b/../../index.html',
  ];
  for (const p of probes) {
    const out = resolveSafe(ROOT, p);
    if (out === null) continue;
    assert.ok(out === ROOT || out.startsWith(ROOT + sep),
      `${p} -> ${out} berada di luar root`);
    assert.ok(!out.split(sep).some((s) => s.startsWith('.') && s !== '.'),
      `${p} -> ${out} masih mengandung dotfile`);
  }
});

test('semua tipe aset game punya content-type yang benar', () => {
  /* modul ES yang dikirim sebagai text/plain ditolak browser: halaman
     jadi kosong tanpa error yang jelas. */
  assert.equal(MIME['.mjs'], 'text/javascript; charset=utf-8');
  assert.equal(MIME['.js'], 'text/javascript; charset=utf-8');
  assert.equal(MIME['.css'], 'text/css; charset=utf-8');
  assert.equal(MIME['.glb'], 'model/gltf-binary');
  assert.equal(MIME['.html'], 'text/html; charset=utf-8');
});
