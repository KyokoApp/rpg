/* ============================================================
   TES PWA — headless, tanpa browser.
   Jalankan:  node --test tests/pwa.test.mjs   (dari root repo)

   Memastikan:
   - manifest.webmanifest valid (path relatif, ikon 192 & 512 ada
     dan benar-benar PNG dengan dimensi yang dijanjikan),
   - sw.js precache SEMUA aset game (index, game/js/jsm, three,
     character.glb, car.glb, manifest, ikon) dan semua path itu
     eksis di repo — offline setelah kunjungan pertama online,
   - alur update: SKIP_WAITING + banner "Perbarui" + reload hanya
     setelah controller baru,
   - ikon hasil tools/make-icons.mjs deterministik (byte-identik
     saat digenerate ulang),
   - index.html memakai path RELATIF (Vercel + GitHub Pages),
   - vercel.json tidak meng-cache sw.js & manifest.
   ============================================================ */
import './importmap.mjs';
import './stubs.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* ---------- helper: baca dimensi PNG dari IHDR ---------- */
function pngSize(file){
  const b = fs.readFileSync(path.join(ROOT, file));
  assert.equal(b.readUInt32BE(0) & 0xFFFFFF, 0x504E47, `${file} bukan PNG`);   // 'PNG'
  assert.equal(b[0], 0x89, `${file} signature PNG salah`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), bytes: b.length };
}

/* ---------- helper: ekstrak daftar PRECACHE dari sw.js ---------- */
function precacheList(){
  const sw = read('sw.js');
  const m = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(m, 'sw.js harus punya konstanta PRECACHE');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

test('manifest.webmanifest: JSON valid, lengkap, path relatif', () => {
  assert.ok(exists('manifest.webmanifest'), 'manifest.webmanifest harus ada di root');
  const man = JSON.parse(read('manifest.webmanifest'));
  assert.ok(man.name, 'name wajib');
  assert.ok(man.short_name, 'short_name wajib');
  for (const k of ['start_url', 'scope', 'display']) assert.ok(man[k], `manifest.${k} wajib`);
  assert.ok(man.start_url.startsWith('./') || man.start_url.startsWith('/'), 'start_url harus relatif/origin');
  assert.ok(!/^https?:/.test(man.start_url), 'start_url tidak boleh absolut http (harus relatif)');
  assert.ok(!/^https?:/.test(man.scope || ''), 'scope harus relatif');
  assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(man.display), 'display harus mode aplikasi');
  assert.ok(Array.isArray(man.icons) && man.icons.length >= 2, 'minimal 2 ikon');
  const sizes = man.icons.map(i => i.sizes);
  assert.ok(sizes.includes('192x192'), 'ikon 192x192 wajib');
  assert.ok(sizes.includes('512x512'), 'ikon 512x512 wajib');
  for (const i of man.icons){
    assert.ok(i.src.startsWith('./'), `ikon ${i.src} harus path relatif`);
    assert.ok(exists(i.src.slice(2)), `ikon ${i.src} harus eksis di repo`);
    assert.equal(i.type, 'image/png');
  }
});

test('ikon: PNG valid dengan dimensi sesuai klaim', () => {
  const man = JSON.parse(read('manifest.webmanifest'));
  for (const i of man.icons){
    const [w, h] = i.sizes.split('x').map(Number);
    const got = pngSize(i.src.slice(2));
    assert.equal(got.width, w, `${i.src} lebar`);
    assert.equal(got.height, h, `${i.src} tinggi`);
    assert.ok(got.bytes > 500, `${i.src} terkecil-sangat (korup?)`);
  }
  assert.ok(exists('icons/apple-touch-icon.png'), 'apple-touch-icon wajib');
  const apple = pngSize('icons/apple-touch-icon.png');
  assert.equal(apple.width, 180);
  assert.equal(apple.height, 180);
});

test('sw.js: precache mencakup SEMUA aset game & semua path eksis', () => {
  const list = precacheList();
  const must = [
    './index.html', './three.module.js', './character.glb', './car.glb',
    './manifest.webmanifest',
  ];
  for (const u of must) assert.ok(list.includes(u), `precache harus punya ${u}`);
  /* seluruh file game/, js/, jsm/ harus masuk precache */
  for (const dir of ['game', 'js', 'jsm']){
    for (const f of fs.readdirSync(path.join(ROOT, dir), { recursive: true })){
      if (!/\.(css|mjs|js)$/.test(f)) continue;
      const rel = './' + path.join(dir, f).split(path.sep).join('/');
      assert.ok(list.includes(rel), `precache harus punya ${rel}`);
    }
  }
  for (const f of fs.readdirSync(path.join(ROOT, 'icons'))){
    const rel = './icons/' + f;
    assert.ok(list.includes(rel), `precache harus punya ${rel}`);
  }
  /* semua path precache harus eksis di repo (path relatif = resolu
     terhadap root repo di sini, terhadap origin di browser) */
  for (const u of list){
    assert.ok(exists(u.slice(2)), `precache ${u} menunjuk file yang tidak ada`);
  }
});

test('sw.js: versi cache, update terkendali, offline-first untuk aset', () => {
  const sw = read('sw.js');
  assert.match(sw, /const VERSION = '[^']+'/);
  assert.match(sw, /orb-hunt-/);
  /* lifecycle lengkap */
  assert.ok(sw.includes("addEventListener('install'"), 'fase install');
  assert.ok(sw.includes("addEventListener('activate'"), 'fase activate');
  assert.ok(sw.includes("addEventListener('fetch'"), 'fase fetch');
  assert.ok(sw.includes('allSettled'), 'install toleran aset opsional gagal');
  assert.ok(sw.includes('caches.keys()') && sw.includes('caches.delete'), 'activate membuang cache lama');
  assert.ok(sw.includes('clients.claim()'), 'activate claim klien');
  /* update terkendali: SKIP_WAITING dari page */
  assert.ok(sw.includes('SKIP_WAITING'), 'handler SKIP_WAITING');
  assert.ok(sw.includes('skipWaiting()'), 'skipWaiting dipanggil');
  /* strategi: navigasi network-first, aset cache-first */
  assert.ok(sw.includes("req.mode === 'navigate'"), 'dibedakan navigasi vs aset');
  assert.ok(sw.includes('caches.match(req)'), 'aset: cache-first');
  assert.ok(sw.includes('fetch(req)'), 'fallback network');
  /* syntax sah */
  const r = execFileSync(process.execPath, ['--check', path.join(ROOT, 'sw.js')], { stdio: 'pipe' });
  assert.ok(r, 'sw.js lolos node --check');
});

test('index.html: manifest, theme-color, SW registrasi relatif, banner Perbarui', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/, 'link manifest relatif');
  assert.match(html, /<meta name="theme-color"/);
  assert.match(html, /<link rel="apple-touch-icon"/);
  assert.match(html, /serviceWorker\.register\('\.\/sw\.js'\)/, "registrasi SW harus relatif './sw.js'");
  /* alur update: banner + tombol + SKIP_WAITING + reload saat controller baru */
  assert.ok(html.includes('updateBanner'), 'banner update');
  assert.ok(html.includes('Perbarui'), 'tombol Perbarui');
  assert.ok(html.includes('SKIP_WAITING'), 'PostMessage SKIP_WAITING');
  assert.ok(html.includes('controllerchange'), 'reload saat controller baru');
  /* semua href/src di index.html harus relatif (Vercel + GitHub Pages) */
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)){
    const u = m[1];
    if (u.startsWith('data:')) continue;
    assert.ok(!u.startsWith('http') && !u.startsWith('//'), `path absolut/eksternal dilarang: ${u}`);
    assert.ok(!u.startsWith('/'), `path absolut root dilarang: ${u}`);
  }
});

test('index.html: fullscreen + landscape + overlay putar (fallback aman)', () => {
  const html = read('index.html');
  assert.ok(html.includes('fullscreenBtn'), 'tombol fullscreen di HUD');
  assert.ok(html.includes('requestFullscreen'), 'requestFullscreen dipakai');
  assert.ok(html.includes("orientation.lock('landscape')") || html.includes('orientation.lock("landscape")'), 'lock landscape dicoba');
  assert.ok(html.includes('rotateOverlay'), 'overlay putar');
  assert.ok(html.includes('rotateDismiss'), 'overlay bisa ditutup (game harus tetap playable)');
  /* masuk dari gesture tombol mulai */
  assert.match(html, /startOverlay\.addEventListener\('click'[\s\S]*?enterImmersive\(\)/);
});

test('make-icons.mjs deterministik: generate ulang = byte identik', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'icons-'));
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/make-icons.mjs'), tmp], { stdio: 'pipe', cwd: ROOT });
    for (const f of ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png']){
      const a = fs.readFileSync(path.join(ROOT, 'icons', f));
      const b = fs.readFileSync(path.join(tmp, f));
      assert.ok(a.equals(b), `${f} hasil generate ulang harus byte-identik (deterministik)`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('vercel.json: sw.js & manifest no-cache (update tidak stuck)', () => {
  const v = JSON.parse(read('vercel.json'));
  const headersFor = (src) => {
    const entry = v.headers.find(h => h.source === src);
    assert.ok(entry, `vercel.json harus punya aturan untuk ${src}`);
    return entry.headers;
  };
  const cc = (hdrs) => (hdrs.find(h => h.key === 'Cache-Control') || {}).value || '';
  assert.match(cc(headersFor('/sw.js')), /no-cache/, 'sw.js harus no-cache');
  assert.match(cc(headersFor('/manifest.webmanifest')), /no-cache/, 'manifest harus no-cache');
});
