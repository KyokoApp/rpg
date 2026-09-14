# Orb Hunt — Aurelia: The Seven Realms

Prototipe eksplorasi Three.js: jelajahi tujuh kawasan dunia prosedural seluas 24 × 24 km, susuri jalan kerajaan, kumpulkan 12 orb — dan panggil **mobil balap** untuk menempuh jarak jauh. HUD ringan terinspirasi layout action-RPG: minimap bulat, ikon monokrom, analog sentuh sementara, bar HP di bawah, plus HUD mobil gaya CarX Street. Icon SVG dibuat untuk project ini, bukan aset UI yang diambil dari Genshin.

## Menjalankan dan deploy

```sh
python -m http.server 8000 --bind 0.0.0.0
```

Buka `http://localhost:8000`, bukan `file://`. ES modules dan GLB perlu dilayani melalui HTTP. Upload **seluruh repo**, termasuk folder `game/`, `js/`, dan `jsm/`, untuk hosting statis. Tidak diperlukan build atau backend.

### Deploy otomatis (sudah aktif)

Repo ini terhubung ke Vercel lewat Git integration, jadi **setiap push ter-deploy sendiri**:

| Kejadian | Hasil |
| --- | --- |
| Push / merge ke `main` | Production ter-update (`rpg-six-jet.vercel.app`) |
| Push branch atau buka PR | Preview deployment sendiri + status check `Vercel` di PR |
| GitHub Pages | Ikut ter-update dari `main` |

`vercel.json` sengaja tanpa `buildCommand`/`installCommand` (situs statis murni) dan mengatur cache: `index.html`, `js/*`, dan `game/*` di-set `no-cache` supaya update langsung terasa, sedangkan aset besar yang jarang berubah (`three.module.js`, `jsm/*`, `*.glb`) di-cache 7 hari dengan MIME `model/gltf-binary` untuk GLB.

Preview branch berbeda dari production: jika production memakai `main`, merge PR setelah memeriksa preview. Preview Vercel dilindungi *Vercel Authentication* secara default, jadi perlu login ke akun Vercel untuk membukanya; production tetap publik.

## Kontrol

### Desktop
- WASD: gerak.
- Mouse: kamera dengan pointer lock.
- Shift: dash saat ditekan; tahan untuk lari, memakai stamina.
- Space: lompat; Shift + Space: dash.
- Klik kiri / J / F: attack. Tekan lagi di jendela combo untuk melanjutkan.
- **M:** peta besar. **O:** pengaturan (juga tersedia lewat ikon saat kursor bebas).
- **B:** summon mobil. **E:** masuk / keluar mobil. **R:** balikkan mobil. **N:** bisu.
- Escape: pause / tutup panel. Klik overlay untuk lanjut.
- Jika pointer lock ditolak: **tahan klik kanan + geser** untuk kamera.

### Di dalam mobil
- **W / S:** gas dan rem (tahan S sampai berhenti lalu terus = mundur).
- **A / D:** setir. **Space:** rem tangan (drift). **Shift:** nitro.
- **E:** keluar (harus hampir berhenti, < 2,4 m/s). **R:** balikkan kalau terbalik.
- Gigi pindah otomatis (6 maju + R), jadi tidak ada kopling/tombol gigi.
- Saat masuk mobil, pointer lock dilepas supaya tombol HUD bisa diklik; kamera kembali chase cam.

### Mobile
- Sentuh kiri: analog muncul di lokasi jari, hilang saat dilepas. Ada deadzone 14%; dorong penuh untuk lari.
- Geser kanan: kamera.
- **Tap kanan: basic attack**, tanpa tombol attack terpisah. Tap harus <280 ms dan gerakan maksimum 12 CSS pixel. Drag/cancel tidak memicu attack.
- Dua ikon putih kanan bawah: lompat dan dash. Ikon **🚗** muncul hanya saat relevan (mobil belum di-summon, atau cukup dekat untuk dimasuki).
- Di dalam mobil: pedal GAS/REM, tombol HAND/NOS, dan dua tombol setir; analog kiri juga bisa dipakai menyetir.
- Ketuk minimap untuk peta besar; ikon roda gigi untuk pengaturan; ikon pause untuk jeda.

## HUD dan pengaturan

- Minimap menampilkan terrain yang sama dengan dunia, arah pemain/kamera, dan orb yang belum diambil. Peta besar menampilkan seluruh lembah.
- Sensitivitas kamera, jarak kamera, resolusi render, bayangan, dan suara dapat diubah langsung. Pengaturan disimpan di `localStorage`; storage yang diblokir tidak menghalangi bermain. Toggle **suara** mengendalikan seluruh AudioEngine (mesin, ambient, efek), bukan hanya suara orb.
- Profil resolusi membatasi pixel ratio: ringan 1, seimbang 1.25, tinggi 1.75 mobile / 2 desktop. Jumlah grass dekat pemain 9.000 mobile / 28.000 desktop; rumput disembunyikan dari badan jalan.
- Bar HP membaca `player.hp` dan `player.maxHP` (awal 1000/1000). **Belum ada musuh/damage**, jadi HP belum berkurang selama eksplorasi. Level 1 adalah placeholder, bukan sistem leveling.
- Membuka panel menghentikan gameplay; tutup panel untuk melanjutkan. Dialog mendukung fokus keyboard dan Escape. Membuka peta saat menyetir ikut menjeda mobil.

## Open world Aurelia

**Ukuran nominal: 24.000 × 24.000 meter = 576 km²**, dengan 1 unit dunia = 1 meter. Pemain dibatasi 32 m dari tepi dunia. Ini ukuran yang ditentukan project, **bukan klaim sama dengan luas Teyvat**. Luas besar tidak berarti kepadatan konten setara game AAA.

Tujuh kawasan/waypoint:

| Kawasan | Ciri visual |
| --- | --- |
| Aurelia Heartlands | Padang hijau, gerbang kerajaan, shrine awal |
| Frostspire Reach | Pegunungan pucat, pohon konifer, menara tinggi |
| Crownfall Highlands | Bukit batu dan menara penjaga |
| Amber Wastes | Tanah keemasan dan batuan |
| Elderwood Wilds | Vegetasi hijau tua |
| Roseveil Expanse | Pohon merah muda dan dataran hangat |
| Azure Coast | Palet biru-hijau, lembah sungai |

Jaringan jalan melengkung terhubung pada grid 3 km: **jalan utama 16 m**, **jalan cabang 8 m**. Paving batu dengan inlay emas, bukan aspal/marka modern. Tinggi jalan diratakan dengan perubahan elevasi halus (grade < 6%); pada sungai/danau, jalan menjadi **tanggul/causeway**, bukan jembatan berongga. Pohon/batu dihindarkan dari badan jalan. Lebar ini memang disiapkan untuk kendaraan — dan sekarang **benar-benar dipakai**: lihat [Mobil](#-mobil).

Landmark mencakup gerbang dengan bukaan 20 m, menara, shrine kristal, pilar, dan penanda jalan. Sebagian bentuk digunakan ulang dengan variasi kawasan. Belum ada kota berinterior, NPC, quest, atau dungeon; ini fondasi dunia besar, bukan seluruh konten game jadi.

### Streaming dan atlas

- Chunk 256 × 256 m. Maksimal **49 chunk mobile** / **81 desktop** aktif, tidak memuat seluruh 576 km².
- Ring terdekat memakai grid terrain 4 m; cakrawala memakai LOD lebih rendah dan skirt untuk menutup celah. Heights dan normal tepi diambil dari fungsi dunia yang sama.
- Area lama dihapus beserta geometry/instance buffer miliknya. Geometry dan material scenery bersama digunakan ulang. Vegetasi deterministik berdasarkan koordinat chunk.
- Setelah teleport, 9 chunk terdekat disiapkan lebih dulu; horizon dimuat bertahap 2 chunk/frame. Collider mengikuti chunk aktif.
- Minimap menampilkan jalan aktual dan orb terdekat. **M / ketuk minimap** membuka atlas dengan skala dunia, nama kawasan, dan waypoint.
- Pilih kawasan dari daftar atau ketuk diamond pada atlas, lalu tekan **Fast travel**. Semua tujuh waypoint terbuka sejak awal agar jarak besar mudah diuji.
- 12 orb ditempatkan deterministik di sekitar waypoint. Progress orb belum disimpan antarsesi.
- Sky, pencahayaan, fauna, debu, dan kamera mengikuti pemain hingga kawasan jauh. Render distance tetap terbatas/fogged untuk performa; seluruh dunia tidak terlihat sekaligus.
- **Saat menyetir, posisi pemain di-mirror ke posisi mobil**, jadi streaming chunk, rumput, orb, matahari, dan minimap mengikuti mobil tanpa perlu jalur kode terpisah.

## 🚗 Mobil

Fisika dan rendering mobil ada di **`js/car.js`** (dependency-injected), HUD-nya di **`game/car-hud.mjs`** + **`game/car.css`**, dan wiring-nya (masuk/keluar, summon, kamera, loop) di `index.html`.

### Yang disuntikkan dari dunia

`new Car(scene, {terrainH, colliders, limit, waterY, audio})` — tidak ada state global. `terrainH` dan `WORLD_LIMIT`/`WATER_LEVEL` datang dari `game/world-data.mjs`, `colliders` adalah array hidup milik `WorldStream` (di-mutate in place, jadi referensi tetap valid saat chunk berganti).

### Angka yang terukur (headless, `node tests/car.physics.mjs`)

| | |
| --- | --- |
| 0–100 km/j | **3,87 s** |
| Kecepatan puncak | **259,2 km/j** (72,00 m/s) di gigi 6, **7.794 rpm** |
| Mundur | 43,2 km/j (12 m/s) |
| Tanjakan 11,5° | puncak terpotong jadi 56,7 m/s |
| Waktu ke 60 m/s | turunan 8,98 s vs datar 13,82 s |
| Tabrakan @23,9 m/s | memantul ke −6,25 m/s, tidak menembus pohon, camera shake 0,89 |
| Stres 60 s input acak | tanpa NaN, tetap dalam batas dunia |

### Model gaya

- **Mesin → roda:** `peakTorque × kurvaTorsi(rpm) × gigi × finalDrive / radiusRoda`, dibatasi traksi `μ·m·g·driveWeightFrac` (RWD, 62% berat di belakang). Kalau gaya minta lebih dari traksi, kelebihannya jadi `tractionSlip` → wheelspin.
- **Hasil kali `peakTorque × finalDrive` dijaga ~konstan (342 × 4,70 = 242 × 6,65 ≈ 1608).** Itu sebabnya menaikkan kecepatan puncak dari 165 ke 259 km/j **tidak** mengubah akselerasi 0–100; yang berubah hanya rpm per m/s.
- **`dragK` diturunkan otomatis dari `maxSpeed`** memakai rpm yang benar-benar terjadi di gigi tertinggi, bukan rpm tebakan — kalau tidak, kecepatan puncak meleset beberapa m/s.
- **Gravitasi sepanjang lereng:** `-g·sin(θ)` dengan θ diukur dari tinggi terrain di depan dan belakang mobil. Dunia 24 km punya jalan menanjak dan gunung sampai +225 m, jadi tanpa komponen ini mobil menaiki lereng 40° seolah datar. Rem parkir statis menahan mobil tanpa pengemudi sampai kemiringan ~41°.
- **Yaw:** bicycle model `tan(δ)·v/wheelbase`, dibatasi `μ·g` lateral; kelebihannya jadi `slip` (drift). Rem tangan memotong grip lateral ke 44% supaya bisa sliding.
- **Gigi:** otomatis, 6 maju + R, upshift 7.950 rpm / downshift 3.300 rpm, redline 8.600, rev limiter 8.800. Rasio close-ratio `[3.35, 2.28, 1.68, 1.28, 1.00, 0.82]`.
- **Air:** mobil tidak bisa masuk sungai/danau (`terrainH < waterY + 0,25` menahan gerak, sama seperti aturan pemain). Spawn juga menghindari air dan lereng terjal.

### Spawn & summon

`B` (atau 🚗 di mobile) me-summon mobil. Titik spawn dipilih dari kandidat berurutan: **badan jalan kerajaan terdekat** (kalau pemain dalam ~140 m dari jalan, mobil ditaruh di centerline dan diarahkan searah sumbu jalan), lalu 15 titik di depan pemain pada jarak 5,2 / 7,5 / 10,5 m dengan offset lateral. Setiap kandidat ditolak kalau di bawah air, di luar batas dunia, atau miring lebih dari ~23°.

### Aset & biaya render

`car.loadModel('./car.glb')` dipanggil saat init: kalau file GLB ada, model procedural otomatis diganti (termasuk pelurusan sumbu dan deteksi roda lewat nama node). **`car.glb` belum ada di repo** — jadi yang tampil sekarang adalah mobil procedural gaya toon: 31 mesh / 10 material / 17 geometry / 3.744 segitiga (~38 draw call, sudah dioptimasi dari 76). Jejak rem adalah satu draw call (ring buffer 460 quad, alpha per vertex, fade 4,5 s) dan debu 170 point.

Untuk devtools: `window.car`, `window.CAR_CFG`, dan `window.AUDIO` diekspos, jadi aset mobil bisa di-tuning tanpa edit kode (misal `CAR_CFG.modelNoseFlip = true` kalau GLB eksternal menghadap belakang).

## 🔊 Audio

**`js/audio.js`** — satu `AudioEngine` prosedural murni WebAudio (tanpa file suara, tanpa dependency). Master → compressor → speaker, plus convolver reverb dengan impulse response yang dibuat prosedural (noise × decay 2,6 s).

- **Mesin:** frekuensi firing = `rpm/60 × (silinder × 0,5)`; inline-6 → **300 Hz pada 6.000 rpm** (V8 akan 400 Hz). Lima harmonik `[0.5, 1, 2, 3, 4.02]` + soft clipping.
- **Turbo:** dua whistle (turbin + kompresor) yang naik bersama rpm dan load; **wastegate** membuka saat gas dilepas mendadak di rpm atas (bandpass 2.650 → 680 Hz selama 0,34 s, dengan cooldown 0,3 s supaya tidak beruntun).
- **Ban & angin:** noise slip yang ikut `slip01` dan kecepatan; rush angin naik dengan kecepatan (mobil maupun lari).
- **Ambient fantasy:** burung/serangga dan shimmer ping yang menipis saat mesin meraung, jadi dunia tetap hidup saat jalan kaki.
- **One-shot:** engine start, backfire, gear shift, pintu, tabrakan (skala sesuai gaya), UI click, dan pickup orb (menggantikan `chime()` lama).

Semua memakai `setTargetAtTime` (bukan `setValueAtTime` mendadak) supaya tidak ada klik; tes graph audio memverifikasi aturan itu.

## Model dan animasi: batas yang perlu diketahui

**Model `character.glb` yang ada adalah rig bernama `HORNET RIG` dengan material `NEEDLE`, bukan model Aether.** Nama lama di README tidak mencerminkan file aslinya.

Perbaikan memakai model yang sudah ada:
- Ukuran tubuh dinormalisasi dari mesh tubuh, bukan dari panjang senjata/shadow.
- Mesh needle dipasang sebagai senjata rigid pada `HANDR`; mesh skinned lama di belakang dihapus. Offset grip disesuaikan khusus untuk GLB ini, bukan auto-retarget semua model.
- Pose prosedural menggerakkan pelvis, torso, leher/kepala, bahu, lengan, siku, tangan, paha, lutut, kaki, dan jari kaki. Seluruh joint yang dikendalikan mendapat target setiap frame agar tidak tersangkut pada pose attack.
- Gait memakai kurva kontinu, peralihan idle/walk/run/dash memakai damping, dan quaternion joint di-blend. Kain memakai spring dengan substep.
- Combo berdurasi 0.52 / 0.58 / 0.68 / 0.82 detik; queue di 0.28–0.85. Ada arah tebasan bergantian dan pose overhead. Efek slash memakai texture bersama.
- Resource efek slash/ghost dibersihkan; resource bersama milik karakter tidak ikut dibuang.

Ini **belum** animasi produksi setara Genshin, belum terrain foot IK atau motion capture, dan bukan penggantian bentuk karakter menjadi manusia. Untuk hasil tersebut diperlukan model berlisensi dengan rig dan klip idle/walk/run/jump/attack yang sesuai. Dunia Aurelia adalah terrain prosedural orisinal, bukan peta kota pada gambar acuan atau salinan Teyvat.

## Struktur

```text
index.html                       Scene, gameplay, loading, input, wiring mobil
game/hud.css                     Tampilan HUD dan panel
game/hud.mjs                     Minimap, dialog, pengaturan
game/locomotion.mjs              Pose prosedural, damping, deadzone
game/world-data.mjs              Ukuran dunia, bioma, jalan, terrain CPU/GPU
game/world-stream.mjs            Chunk terrain, LOD, scenery, disposal
game/car.css                     Gaya HUD mobil (CarX-style)
game/car-hud.mjs                 Markup + takometer SVG + tombol layar mobil
js/car.js                        Fisika & rendering mobil (dependency-injected)
js/audio.js                      AudioEngine prosedural (mesin, ambient, efek)
tools/check-imports.mjs          Validator module graph & elemen DOM
character.glb                    Model rig Hornet yang tersedia
three.module.js                  Three.js r160
jsm/loaders/GLTFLoader.js
jsm/utils/SkeletonUtils.js
jsm/utils/BufferGeometryUtils.js
licenses/three-LICENSE.txt
vercel.json                      Deploy statis + aturan cache
tests/*.test.cjs                 Tes unit/regresi Node (27 tes)
tests/car.physics.mjs            Tes fisika mobil headless (11 skenario)
tests/audio.graph.mjs            Tes graph audio WebAudio
tests/importmap.mjs, stubs.mjs   Harness: petakan 'three' + stub DOM/canvas
tests/browser-smoke.cjs          Tes browser opsional (Playwright)
.github/workflows/test.yml       CI: node --test tests/*.test.cjs
.github/workflows/verify.yml     CI: module graph, syntax, fisika, audio, vendored
```

## Tes

Node.js 22, tanpa install dependency:

```sh
node --test tests/*.test.cjs     # 27 tes regresi (dunia, gerak, HUD, DOM)
node tests/car.physics.mjs       # 11 skenario fisika mobil
node tests/audio.graph.mjs       # aturan parameter WebAudio
node tools/check-imports.mjs     # module graph & getElementById
```

**27 tes `.cjs`** mencakup dependency modul, sintaks, guard state, tap/drag, arah serangan, kegagalan pointer lock, disposal, combo, ramp, kontinuitas joint, damping, deadzone, validasi settings, lebar/grade jalan, sambungan chunk, dan streaming/disposal ke seluruh kawasan.

**11 skenario fisika mobil** (T1–T11) memakai three.js vendored dan `terrainH` asli dari `game/world-data.mjs`, jadi tidak pernah tidak sinkron dengan game: akselerasi & kecepatan puncak, arah belok, orientasi model vs arah gerak, mundur, drift + jejak rem, berhenti saat ditinggal, nitro, tabrakan dengan collider, pitch/roll di terrain asli, stres 60 s input acak tanpa NaN, dan gravitasi lereng (tanjakan/turunan/meluncur tanpa gas/rem parkir).

`tools/check-imports.mjs` adalah penjaga bug terparah yang pernah ada di repo ini: satu file addon hilang membuat seluruh module graph gagal dan halaman **blank total** tanpa error yang terlihat. Skrip itu memverifikasi setiap specifier import, importmap, dan `getElementById` — dan sudah diuji dua arah (lulus di repo sehat, gagal saat satu file disembunyikan).

Tes browser opsional, dengan server masih berjalan:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/browser-smoke.cjs
```

Browser smoke menguji load model, senjata di tangan, start, tap/drag/analog, menu, setting bayangan, fast travel ke Frostspire, batas chunk/collider lokal, dan resume; error JavaScript/shader membuat tes gagal. `RPG_URL` dapat diisi URL server lain. `RPG_FAST_SMOKE=1` mengurangi grass hanya pada respons test untuk mempercepat software-rendered CI; jangan gunakan hasilnya sebagai benchmark FPS. Hook inspeksi disisipkan oleh test ke respons HTTP, bukan diekspos game production.

Kedua workflow CI jalan otomatis di setiap push dan PR: `test.yml` (27 tes regresi) dan `verify.yml` (module graph, syntax semua file JS + script module `index.html`, fisika mobil, graph audio, dan memastikan keempat file vendored **byte-identik** dengan `three@0.160.0` resmi supaya versi addon tidak pernah bercampur).

**Belum ada benchmark perangkat Android fisik**, dan browser smoke belum mengendarai mobil. Tetap cek kenyamanan gait, grip, lompat, combo, HUD mobil, dan FPS pada HP target sebelum rilis.

## Yang belum ada / batasan

- **Musuh dan damage** belum ada; bar HP dan Lv. 1 masih placeholder.
- **Kerusakan mobil** belum dimodelkan: tabrakan memantul, menggoyang kamera, dan berbunyi, tapi tidak ada deformasi mesh, kerusakan mesin, atau biaya perbaikan.
- **`car.glb` belum ada di repo.** Mobil yang tampil sekarang procedural. Menaruh `car.glb` di root langsung dipakai tanpa perubahan kode.
- **Progres tidak disimpan** antar sesi (orb, posisi, pengaturan mobil). Pengaturan HUD tersimpan di `localStorage`.
- **Tidak ada AI lalu lintas, interior mobil, atau kamera kokpit**; kamera chase di luar.
- **Suara memakai sintesis WebAudio**, bukan rekaman mesin asli. Karakternya inline-6 twin-turbo, tapi ini pendekatan, bukan sampel pabrik.
- **Tidak ada build step**, jadi tidak ada tree-shaking/bundling: `three.module.js` (1,27 MB) dikirim apa adanya.

## Kredit aset & lisensi

Karakter di game ini **bukan** Aether / Genshin Impact. Modelnya adalah **"SHAW ! Hornet — Hollow Knight Silksong"** karya **Seifert**, diunduh dari Sketchfab, lisensi **CC-BY-4.0**.

```
Model   : SHAW ! Hornet - Hollow Knight Silksong
Author  : Seifert (https://sketchfab.com/Peter_Seifert)
Source  : https://sketchfab.com/3d-models/shaw-hornet-hollow-knight-silksong-670a87a9234c6d8cc1
License : CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
```

Three.js dan addon r160 disimpan lokal; lisensinya (MIT, Copyright 2010-2023 Three.js Authors) ada di `licenses/three-LICENSE.txt`. Lisensi Three.js tidak mencakup model karakter. Detail lengkap atribusi dan daftar perubahan yang dilakukan terhadap model ada di **[CREDITS.md](CREDITS.md)**.

⚠️ **Kode game itu sendiri belum punya lisensi** (tidak ada file `LICENSE`). Pastikan hak penggunaan/distribusi model dan aset pengganti sebelum rilis publik, dan putuskan lisensi kode secara sadar — lihat catatan di [CREDITS.md](CREDITS.md#3-kode-game-indexhtml).
