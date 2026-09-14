/* ============================================================
   SERVICE WORKER — Orb Hunt
   ============================================================
   Tujuan:
   1. OFFLINE total setelah kunjungan pertama online: semua aset
      game di-precache saat install (index.html, seluruh game/js/jsm,
      three.module.js, character.glb, car.glb, manifest, ikon).
   2. VERSI CACHE MUDAH: ubah satu string VERSION di bawah (v1 -> v2)
      lalu push. Cache lama otomatis dibuang di fase activate.
   3. UPDATE TERKENDALI: navigasi network-first (game selalu segar
      saat online), aset lain cache-first. Kalau ada versi baru yang
      terpasang, index.html menampilkan banner "Perbarui" — reload
      hanya terjadi kalau pengguna mengkliknya (SKIP_WAITING).

   Semua path RELATIF (./...) supaya sama-sama jalan di Vercel dan
   GitHub Pages, di root maupun di sub-path.
   ============================================================ */
'use strict';

const VERSION = 'v2';                    // <- TINGKATKAN SAAT ASET BERUBAH
const CACHE = 'orb-hunt-' + VERSION;
const NAV_TIMEOUT_MS = 8000;

const PRECACHE = [
  './index.html',
  './manifest.webmanifest',
  './sw.js',
  './three.module.js',
  './character.glb',
  './car.glb',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './game/hud.css',
  './game/car.css',
  './game/hud.mjs',
  './game/car-hud.mjs',
  './game/locomotion.mjs',
  './game/world-data.mjs',
  /* modul v2: kualitas grafis, post-processing, tekstur, loading,
     dan panel pengaturan. Wajib terdaftar — tanpa ini versi offline
     akan memuat index.html baru dengan modul yang tidak ter-cache. */
  './game/quality.mjs',
  './game/settings-ui.mjs',
  './game/postfx.mjs',
  './game/loader.mjs',
  './game/textures.mjs',
  './game/world-stream.mjs',
  './js/audio.js',
  './js/car.js',
  './jsm/loaders/GLTFLoader.js',
  './jsm/utils/BufferGeometryUtils.js',
  './jsm/utils/SkeletonUtils.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* allSettled: aset opsional yang gagal (mis. car.glb di build lama)
       tidak boleh menggagalkan install PWA. */
    const results = await Promise.allSettled(PRECACHE.map(url =>
      cache.add(new Request(url, { credentials: 'same-origin' }))
    ));
    for (const [i, r] of results.entries()){
      if (r.status === 'rejected') console.warn('[SW] precache gagal:', PRECACHE[i], r.reason);
    }
    /* intinya dua: index.html + three.js. Kalau salah satu hilang,
       offline pun tidak akan pernah bisa jalan -> gagal install. */
    const coreOk = [PRECACHE[0], './three.module.js'].every((u, idx) => {
      const i = PRECACHE.indexOf(u);
      return results[i] && results[i].status === 'fulfilled';
    });
    if (!coreOk) throw new Error('Aset inti gagal di-cache (index.html/three.module.js)');
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    /* buang cache versi lama (orb-hunt-v0, v1, ...) saat versi baru aktif */
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('orb-hunt-') && k !== CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* fetch: navigasi = network-first (fallback cache), sisanya = cache-first */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate'){
    event.respondWith((async () => {
      try {
        const net = await Promise.race([
          fetch(req),
          new Promise((_, rej) => setTimeout(() => rej(new Error('nav-timeout')), NAV_TIMEOUT_MS)),
        ]);
        if (net.ok){
          const cache = await caches.open(CACHE);
          cache.put('./index.html', net.clone()).catch(() => {});
          return net;
        }
        throw new Error('http ' + net.status);
      } catch (err) {
        const cached = await caches.match('./index.html');
        if (cached) return cached;
        return new Response('Luar jaringan dan game belum pernah dimuat online.',
          { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // biarkan lintas-origin lewat

  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const net = await fetch(req).catch(() => null);
    if (net && net.ok){
      const cache = await caches.open(CACHE);
      cache.put(req, net.clone()).catch(() => {});
    }
    return net || (await caches.match(req)) || Response.error();
  })());
});

/* Banner "Perbarui" di index.html mengirim pesan ini */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
