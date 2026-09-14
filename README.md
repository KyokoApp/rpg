# Orb Hunt — Aurelia: The Seven Realms

Prototipe eksplorasi Three.js: jelajahi tujuh kawasan dunia prosedural, jalan kerajaan, dan kumpulkan 12 orb. HUD ringan terinspirasi layout action-RPG: minimap bulat, ikon monokrom, analog sentuh sementara, serta bar HP di bawah. Icon SVG dibuat untuk project ini, bukan aset UI yang diambil dari Genshin.

## Menjalankan dan deploy

```sh
python -m http.server 8000 --bind 0.0.0.0
```

Buka `http://localhost:8000`, bukan `file://`. ES modules dan GLB perlu dilayani melalui HTTP. Upload **seluruh repo**, termasuk folder `game/` dan `jsm/`, untuk hosting statis. Tidak diperlukan build atau backend.

Vercel/GitHub Pages hanya menerima perubahan setelah di-push ke GitHub. Preview branch berbeda dari production: jika production memakai `main`, merge PR setelah memeriksa preview.

## Kontrol

### Desktop
- WASD: gerak.
- Mouse: kamera dengan pointer lock.
- Shift: dash saat ditekan; tahan untuk lari, memakai stamina.
- Space: lompat; Shift + Space: dash.
- Klik kiri / J / F: attack. Tekan lagi di jendela combo untuk melanjutkan.
- **M:** peta besar. **O:** pengaturan (juga tersedia lewat ikon saat kursor bebas).
- Escape: pause / tutup panel. Klik overlay untuk lanjut.
- Jika pointer lock ditolak: **tahan klik kanan + geser** untuk kamera.

### Mobile
- Sentuh kiri: analog muncul di lokasi jari, hilang saat dilepas. Ada deadzone 14%; dorong penuh untuk lari.
- Geser kanan: kamera.
- **Tap kanan: basic attack**, tanpa tombol attack terpisah. Tap harus <280 ms dan gerakan maksimum 12 CSS pixel. Drag/cancel tidak memicu attack.
- Dua ikon putih kanan bawah: lompat dan dash.
- Ketuk minimap untuk peta besar; ikon roda gigi untuk pengaturan; ikon pause untuk jeda.

## HUD dan pengaturan

- Minimap menampilkan terrain yang sama dengan dunia, arah pemain/kamera, dan orb yang belum diambil. Peta besar menampilkan seluruh lembah.
- Sensitivitas kamera, jarak kamera, resolusi render, bayangan, dan suara orb dapat diubah langsung. Pengaturan disimpan di `localStorage`; storage yang diblokir tidak menghalangi bermain.
- Profil resolusi membatasi pixel ratio: ringan 1, seimbang 1.25, tinggi 1.75 mobile / 2 desktop. Jumlah grass dekat pemain 9.000 mobile / 28.000 desktop; rumput disembunyikan dari badan jalan.
- Bar HP membaca `player.hp` dan `player.maxHP` (awal 1000/1000). **Belum ada musuh/damage**, jadi HP belum berkurang selama eksplorasi. Level 1 adalah placeholder, bukan sistem leveling.
- Membuka panel menghentikan gameplay; tutup panel untuk melanjutkan. Dialog mendukung fokus keyboard dan Escape.

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

Jaringan jalan melengkung terhubung pada grid 3 km: **jalan utama 16 m**, **jalan cabang 8 m**. Paving batu dengan inlay emas, bukan aspal/marka modern. Tinggi jalan diratakan dengan perubahan elevasi halus; pada sungai/danau, jalan menjadi **tanggul/causeway**, bukan jembatan berongga. Pohon/batu dihindarkan dari badan jalan. Ini lebar yang disiapkan untuk kendaraan; **belum ada mobil atau physics kendaraan**.

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
index.html                       Scene, gameplay, loading, input
game/hud.css                    Tampilan HUD dan panel
game/hud.mjs                    Minimap, dialog, pengaturan
game/locomotion.mjs             Pose prosedural, damping, deadzone
game/world-data.mjs             Ukuran dunia, bioma, jalan, terrain CPU/GPU
game/world-stream.mjs           Chunk terrain, LOD, scenery, disposal
character.glb                    Model rig Hornet yang tersedia
three.module.js                  Three.js r160
jsm/loaders/GLTFLoader.js
jsm/utils/SkeletonUtils.js
jsm/utils/BufferGeometryUtils.js
licenses/three-LICENSE.txt
tests/*.test.cjs                 Tes unit/regresi Node
tests/browser-smoke.cjs          Tes browser opsional
.github/workflows/test.yml       CI Node.js
```

## Tes

Node.js 22, tanpa install dependency:

```sh
node --test tests/*.test.cjs
```

27 tes mencakup dependency modul, sintaks, guard state, tap/drag, arah serangan, kegagalan pointer lock, disposal, combo, ramp, kontinuitas joint, damping, deadzone, validasi settings, lebar/grade jalan, sambungan chunk, dan streaming/disposal ke seluruh kawasan.

Tes browser opsional, dengan server masih berjalan:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/browser-smoke.cjs
```

Browser smoke menguji load model, senjata di tangan, start, tap/drag/analog, menu, setting bayangan, fast travel ke Frostspire, batas chunk/collider lokal, dan resume; error JavaScript/shader membuat tes gagal. `RPG_URL` dapat diisi URL server lain. `RPG_FAST_SMOKE=1` mengurangi grass hanya pada respons test untuk mempercepat software-rendered CI; jangan gunakan hasilnya sebagai benchmark FPS. Hook inspeksi disisipkan oleh test ke respons HTTP, bukan diekspos game production.

Validasi update ini: 27 unit tests lulus; browser desktop/mobile lulus dalam mode cepat; mobile juga lulus dengan 9.000 grass asli. Streaming ke tujuh kawasan diuji di Node; fast travel dalam browser diuji dari Heartlands ke Frostspire. **Belum ada benchmark perangkat Android fisik.** Tetap cek kenyamanan gait, grip, lompat, combo, dan FPS pada HP target sebelum rilis.

## Lisensi

Three.js/addon r160 disimpan lokal; lisensinya di `licenses/three-LICENSE.txt`. Lisensi Three.js tidak mencakup model karakter. Pastikan hak penggunaan/distribusi model dan aset pengganti sebelum rilis publik.
