# Orb Hunt — Aether

Prototipe game eksplorasi Three.js: jelajahi terrain prosedural, kumpulkan 12 orb, dan gunakan karakter beranimasi dengan dash, lompat, serta efek tebasan. Project ini masih prototipe, bukan RPG lengkap.

## Menjalankan

Dari direktori repo:

```sh
python -m http.server 8000 --bind 0.0.0.0
```

Buka `http://localhost:8000`. Jangan membuka `index.html` langsung dengan `file://`, karena game memakai ES modules dan memuat model GLB. Untuk hosting statis seperti GitHub Pages, unggah seluruh struktur repo; tidak diperlukan build atau backend.

## Kontrol yang tersedia

### Desktop
- WASD: gerak.
- Mouse: kamera setelah pointer lock aktif.
- Shift: dash saat ditekan; tahan untuk lari (memakai stamina).
- Space: lompat; Shift + Space: dash.
- Klik kiri / J / F: serangan; tekan lagi pada jendela combo untuk melanjutkan.
- Escape: pause; klik overlay untuk melanjutkan.
- Jika browser/iframe menolak pointer lock, game menggunakan **tahan klik kanan + geser** untuk kamera. Petunjuk muncul di layar.

### Mobile
- Sentuh/geser area kiri: joystick; dorong penuh untuk lari.
- Geser area kanan: kamera.
- Tap kanan kurang dari 280 ms dengan perpindahan maksimum 12 CSS pixel: serangan.
- Tombol ⚡ / ⚔️ / ⤴: dash / serangan / lompat.
- Tombol ⏸: pause.

Zoom roda mouse, kamera first-person/V, dan tombol C belum tersedia.

## Implementasi saat ini

- Terrain, pencahayaan senja, toon shading, vegetasi instanced, serta fauna dengan animasi shader.
- Penyesuaian mobile: pixel ratio maksimal 1.5, grass 30.000 (desktop 130.000), shadow map 1024 (desktop 2048). Ini bukan jaminan FPS.
- Karakter GLB dikonversi ke `MeshToonMaterial`; ramp grayscale memakai `CanvasTexture` dengan nearest filtering. Orientasi texture tetap ditangani `GLTFLoader`.
- Animasi tulang prosedural untuk idle, gerak, dash, lompat, dan serangan. Cloak memakai interpolasi sederhana, bukan simulasi spring lengkap.
- Combo memiliki empat tahap dengan durasi 0.52 / 0.58 / 0.68 / 0.82 detik dan jendela queue 0.28–0.85. Saat ini tahap-tahap tersebut masih memakai pose dan texture slash yang sama, bukan empat koreografi berbeda.
- Dash menghasilkan clone skeleton yang memudar. Resource material/skeleton milik ghost dibersihkan saat habis; geometry dan texture bersama tidak dibuang. Geometry/material slash dibersihkan terpisah.
- Belum ada musuh, damage/hitbox combat, inventory, quest, atau save game.

## Struktur

```text
index.html                     UI, scene, kontrol, gameplay, efek
character.glb                  Model karakter
three.module.js                Three.js r160
jsm/loaders/GLTFLoader.js       Loader model
jsm/utils/SkeletonUtils.js     Clone skeleton
jsm/utils/BufferGeometryUtils.js Dependency loader, Three.js r160
licenses/three-LICENSE.txt      Lisensi Three.js
tests/regression.test.cjs      Tes regresi tanpa dependency npm
.github/workflows/test.yml     CI Node.js
```

## Pengujian

Dengan Node.js 22:

```sh
node --test tests/*.test.cjs
```

Tes mencakup sintaks script, keberadaan dependency modul, guard aksi di luar permainan, tap versus drag/cancel, arah hadap saat serangan diam, kegagalan pointer lock, disposal efek, reset awal combo, dan pembuatan toon ramp. Tes logika menggunakan fungsi dari `index.html` dalam sandbox Node; ini **bukan pengganti tes WebGL/browser**.

Checklist pengujian manual sebelum rilis:

1. Pastikan status berubah ke `Aether Ready` tanpa 404 atau error shader di console.
2. Mulai, gerak, dash, lompat, serang, pause, dan lanjutkan pada desktop dan mobile.
3. Geser kamera mobile lalu lepaskan: tidak boleh menyerang. Tap cepat harus menyerang.
4. Coba keempat tahap combo, kumpulkan semua orb, dan mulai permainan ulang.
5. Ulangi dash/serangan dan pantau memori GPU; resource tidak boleh terus bertambah setelah efek habis.
6. Uji pointer lock yang diizinkan dan ditolak; coba fallback klik kanan.
7. Cek warna karakter dan FPS pada Android sungguhan, termasuk perangkat kelas menengah. Kompatibilitas semua GPU dan angka 45–60 FPS belum diverifikasi dalam perbaikan ini.

## Dependency

Dependency runtime disimpan lokal. `BufferGeometryUtils.js` diambil dari paket npm resmi `three@0.160.0` agar cocok dengan Three.js r160. Saat upgrade, perbarui core dan addon bersamaan. Lisensi Three.js tidak otomatis mencakup model karakter; pastikan hak penggunaan/distribusi aset sebelum rilis publik.
