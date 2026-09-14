# Orb Hunt

Game eksplorasi 3D third-person berbasis **Three.js r160** tanpa build step. Jelajahi
lembah saat senja, ikuti pilar cahaya, kumpulkan **12 orb purba** secepat mungkin —
lalu panggil **mobil** dan jelajahi lembah yang sama dengan kecepatan 165 km/j.

Kode terbagi tiga file: `index.html` (dunia + pemain + HUD), `js/car.js` (model &
fisika mobil), `js/audio.js` (seluruh suara, 100% sintesis WebAudio — nol file aset).

| | |
|---|---|
| **Live (GitHub Pages)** | https://kyokoapp.github.io/rpg/ |
| **Live (Vercel)** | https://rpg-six-jet.vercel.app |
| **Engine** | three.js r160 (vendored, bukan CDN) |
| **Mode** | Jalan kaki ↔ mobil (fisika arcade, HUD gaya CarX Street) |
| **Audio** | Sintesis WebAudio murni: mesin inline-6 twin-turbo + ambient fantasy |
| **Build step** | Tidak ada — statis, langsung deploy |
| **Target** | Desktop Chrome/Edge/Firefox + Android Chrome |

> README ini sengaja hanya mendeskripsikan apa yang **benar-benar ada di kode**.
> Fitur yang belum diimplementasi dipindah ke bagian [Roadmap](#-roadmap-belum-diimplementasi)
> dan diberi tanda ❌ supaya tidak menyesatkan.

---

## 📜 Kredit aset (wajib dibaca)

Karakter di game ini **bukan** Aether / Genshin Impact. Modelnya adalah
**"SHAW ! Hornet — Hollow Knight Silksong"** karya **Seifert**, diunduh dari Sketchfab,
lisensi **CC-BY-4.0**.

```
Model   : SHAW ! Hornet - Hollow Knight Silksong
Author  : Seifert (https://sketchfab.com/Peter_Seifert)
Source  : https://sketchfab.com/3d-models/shaw-hornet-hollow-knight-silksong-670a87a9234c40bc9c2a4f274f6d8cc1
License : CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
```

Engine **three.js r160** dipakai di bawah lisensi **MIT** (Copyright 2010-2023
Three.js Authors). Detail lengkap + daftar perubahan yang dilakukan terhadap model
ada di **[CREDITS.md](CREDITS.md)**.

⚠️ Kode game itu sendiri **belum punya lisensi** (tidak ada file `LICENSE`).
Lihat catatan di [CREDITS.md](CREDITS.md#3-kode-game-indexhtml).

---

## 🎮 Kontrol

### Desktop

| Input | Aksi |
|---|---|
| `W` `A` `S` `D` | Bergerak |
| Mouse | Lihat sekeliling (butuh *pointer lock*) |
| `Shift` | Lari — **dan** dash (keydown Shift langsung memicu dash) |
| `Space` | Lompat. Kalau `Shift` sedang ditahan → dash |
| Klik **kiri** / `J` / `F` | Attack |
| `E` | Masuk / keluar mobil |
| `B` | Summon mobil ke dekat pemain |
| `R` | Balikkan mobil (hanya saat di mobil & terbalik) |
| `M` | Matikan / nyalakan semua suara |
| `Escape` | Pause |

Catatan jujur:

- **Tidak ada** zoom roda mouse. Jarak kamera tetap `5.0` unit dan hanya mengecil
  otomatis kalau terhalang pohon/batu (minimum `1.4`).
- **Tidak ada** toggle first/third person. Kamera selalu third-person.
- Klik kiri juga dipakai browser untuk mengunci pointer saat belum ter-lock, jadi
  klik pertama setelah pause akan **sekalian** memicu satu tebasan.
- Masuk mobil **melepas pointer lock** dengan sengaja: setir pakai `A`/`D`, kamera
  otomatis mengikuti mobil, jadi mouse tidak perlu dikunci lagi.

### Di dalam mobil

Tombol yang sama dipakai ulang, artinya berubah:

| Input | Aksi |
|---|---|
| `W` / `S` | Gas / rem. Tahan `S` dari posisi berhenti → **mundur otomatis** (maks 43 km/j) |
| `A` / `D` | Setir |
| `Shift` | Nitro (×1.55 gaya dorong; isi ulang sendiri saat gas biasa) |
| `Space` | Rem tangan → drift, meninggalkan **skid mark** yang memudar |
| `E` | Keluar (hanya boleh kalau \|kecepatan\| ≤ 2.4 m/s) |
| `R` | Balikkan mobil yang terbalik |

HUD berubah total saat masuk mobil: gauge RPM + kecepatan, gigi `R/N/1-6`, bar nitro.
Lihat bagian [Mobil](#-mobil--audio-jscarjs).

### Mobile / Touch

| Input | Aksi |
|---|---|
| Sentuh & geser di **45% kiri** layar | Joystick dinamis (muncul di titik sentuh) |
| Dorong joystick > 88% | Lari |
| Geser di sisi kanan | Putar kamera |
| ⚡ | Dash |
| ⚔️ | Attack |
| ⤴ | Lompat |
| ⏸ | Pause |
| 🚗 | Masuk / keluar mobil, atau summon kalau mobilnya jauh |

Begitu masuk mobil, tombol ⚡/⚔️/⤴ digantikan **pedal gas-rem, tombol rem tangan &
nitro, dan setir sentuh**; joystick kiri tetap berfungsi sebagai setir.

⚠️ **Bug yang diketahui:** melepaskan sentuhan di kanan 55% layar **selalu** memicu
attack, termasuk setelah selesai menggeser kamera. Deteksi tap-vs-drag belum ada
(`index.html:791`, fungsi `onTE`). Lihat [Known Issues](#-known-issues).

---

## 🚀 Cara menjalankan

Wajib lewat HTTP server — **jangan** buka `file://`, karena ES module + `importmap`
diblokir CORS di protokol file.

```bash
cd rpg
python3 -m http.server 8000
# buka http://localhost:8000
```

Alternatif tanpa Python:

```bash
npx serve .        # atau
php -S 0.0.0.0:8000
```

Jalankan tesnya dulu (≈1 detik, tidak butuh browser, tidak butuh `npm install`):

```bash
node tools/check-imports.mjs      # penjaga bug "halaman blank total"
node tests/car.physics.mjs        # 10 skenario fisika mobil
node tests/audio.graph.mjs        # aturan parameter WebAudio
```

---

## ☁️ Deploy & CI

### Vercel — otomatis setiap update (sudah aktif)

Project **`rpg-six-jet`** (https://rpg-six-jet.vercel.app) sudah terhubung ke repo ini
lewat *Git integration* Vercel. Artinya **tidak perlu token, CLI, atau secret apa pun**:

| Kejadian | Hasil |
|---|---|
| Push ke `main` | Deploy **production** otomatis ke `rpg-six-jet.vercel.app` |
| Buka / update PR | Deploy **preview** otomatis ke URL unik per PR |
| Merge PR ke `main` | Production ikut ter-update otomatis |

Bukti pipeline-nya memang jalan: situs itu sekarang masih menyajikan build lama
(`<title>Orb Hunt — Aether</title>`, tanpa HUD mobil) karena **belum pernah ada push
baru** — bukan karena konfigurasinya kurang.

`vercel.json` ditambahkan supaya perilakunya eksplisit:

- `buildCommand` & `installCommand` kosong → tidak ada build, tidak ada install
  (repo ini memang tanpa tooling; Vercel langsung menyajikan file statisnya).
- `index.html` dan `js/*` → `Cache-Control: no-cache`, jadi **begitu deploy selesai,
  pengunjung langsung dapat versi baru** (direvalidasi lewat ETag, murah).
- `three.module.js` (1,27 MB), `jsm/*`, dan `*.glb` (1,46 MB) → cache 7 hari, karena
  jarang berubah dan ukurannya besar. `*.glb` juga diberi `Content-Type:
  model/gltf-binary`.

### GitHub Pages — otomatis dari `main`

Pages di-set dari branch `main` (`.nojekyll` ada supaya folder `jsm/` tidak diproses
Jekyll) → https://kyokoapp.github.io/rpg/. Push ke `main` = live.

### CI — `.github/workflows/verify.yml`

Jalan otomatis di **setiap push ke `main`, setiap pull request**, dan bisa dipicu
manual. Lima pemeriksaan, semuanya tanpa browser dan tanpa `npm install`:

1. **Module graph** (`tools/check-imports.mjs`) — menelusuri setiap specifier import
   di seluruh repo, memastikan file tujuannya ada, memastikan `importmap` di
   `index.html` menunjuk ke file nyata, dan memastikan setiap `getElementById()`
   punya elemennya. Ini penjaga bug yang pernah membuat situs blank total
   ([Known Issues #22](#-known-issues)).
2. **Syntax** semua file JS + blok `<script type="module">` di `index.html`.
3. **Tes fisika mobil** (10 skenario).
4. **Tes graph audio** (aturan parameter WebAudio).
5. **Konsistensi versi** — keempat file three.js yang di-vendor harus
   **byte-identik** dengan paket npm `three@0.160.0`, supaya addon tidak pernah
   bercampur versi dengan `three.module.js`.

Semua tes mengatur `process.exitCode` sesuai hasil, jadi CI benar-benar bisa merah
(diverifikasi dengan menyuntik kegagalan sengaja: exit 1).

---

## 📁 Struktur repo

```
rpg/
├── index.html          78 KB / 1.099 baris — dunia, pemain, HUD, game loop
├── js/
│   ├── car.js          42 KB / 870 baris — model mobil, fisika, skid mark, debu
│   └── audio.js        21 KB / 455 baris — AudioEngine (mesin + ambient fantasy)
├── character.glb       1,46 MB — model Hornet (Seifert, CC-BY-4.0)
├── car.glb             ⚠️ BELUM ADA — drop aset mobil di sini (lihat bagian Mobil)
├── three.module.js     1,27 MB — three.js r160 (MIT), di-vendor
├── jsm/
│   ├── loaders/GLTFLoader.js        addon three.js r160 (MIT)
│   └── utils/
│       ├── SkeletonUtils.js         addon three.js r160 (MIT)
│       └── BufferGeometryUtils.js   addon three.js r160 (MIT) — WAJIB ada,
│                                    di-import oleh GLTFLoader
├── tools/
│   └── check-imports.mjs  penjaga module graph (bug blank page)
├── .github/workflows/
│   └── verify.yml         CI: jalan di setiap push & PR
├── vercel.json           config deploy Vercel (tanpa build + aturan cache)
├── tests/              verifikasi headless (Node, TANPA npm install)
│   ├── car.physics.mjs   10 skenario fisika mobil
│   ├── audio.graph.mjs   validasi graph + aturan parameter WebAudio
│   ├── importmap.mjs     hook: 'three' -> three.module.js vendored
│   ├── stubs.mjs         stub DOM/canvas
│   └── README.md
├── CREDITS.md          atribusi pihak ketiga
├── README.md
└── .nojekyll           untuk GitHub Pages
```

Tidak ada `package.json`, tidak ada build step, tidak ada `.gitignore`. Semua
dependensi di-vendor supaya GitHub Pages maupun Vercel bisa menyajikannya langsung
tanpa instalasi apa pun — termasuk untuk tes dan CI-nya: `node tests/car.physics.mjs`
dan `node tools/check-imports.mjs` jalan langsung tanpa `npm install`
(lihat [tests/README.md](tests/README.md) dan [Deploy & CI](#-deploy--ci)).

> `car.glb` sengaja **tidak** disertakan: `car.loadModel('./car.glb')` di
> `index.html:510` gagal dengan anggun (404 → `console.info` → tetap pakai model
> procedural), jadi game tetap jalan penuh tanpa file itu.

---

## 🔧 Arsitektur & tech detail

Semua referensi baris menunjuk ke `index.html` pada commit ini.

### Render setup (`:243`)

```
WebGLRenderer  antialias: !isTouch, powerPreference: high-performance
pixelRatio     min(devicePixelRatio, isTouch ? 1.5 : 2)
shadowMap      PCFSoftShadowMap, 2048px (1024 di mobile)
toneMapping    ACESFilmic, exposure 1.02
outputColorSpace SRGBColorSpace
fog            THREE.Fog(0xe8bf8d, 80, 380)
camera         PerspectiveCamera(70°, near 0.1, far 1200)
```

Deteksi perangkat: `('ontouchstart' in window) || (maxTouchPoints > 0 && pointer: coarse)`.
Semua angka "mobile vs desktop" di bawah bercabang dari satu flag `isTouch` itu.

### Pencahayaan (`:297`)

| Light | Warna | Intensitas |
|---|---|---|
| `DirectionalLight` (matahari, cast shadow) | `0xffc184` | **3.3** |
| `HemisphereLight` | `0xaed2f0` / `0x7d6238` | 0.60 |
| `AmbientLight` | `0xffd9ae` | 0.20 |
| `PointLight` × 12 (satu per orb) | `0xffd88a` | 3.2, distance 12, decay 2 |

Shadow camera mengikuti pemain setiap frame (`:1046`) dengan frustum ortho ±62 unit,
near 1 / far 420, bias `-0.0004`, normalBias `0.04`.

⚠️ Intensitas matahari 3.3 itu tinggi untuk satuan fisik three.js r155+. Lihat
Known Issues #5.

### Terrain (`:306`)

Fungsi tinggi dipakai **15×** (1 di JS, sisanya diduplikasi ke 3 shader GLSL):

```js
terrainH(x,z) = sin(x*0.045)*cos(z*0.05)*2.6
              + sin(x*0.11+1.7)*sin(z*0.09+0.6)*1.1
              + sin((x+z)*0.023)*1.6
              + cos(x*0.31)*sin(z*0.27)*0.28
```

Plane 440×440 unit, 160×160 segmen (120 di mobile), vertex color 4 zona
(pasir / rumput / rumput gelap / batu) berdasarkan tinggi + noise sinus,
`MeshToonMaterial` dengan `gradientMap` 4-step. Batas main pemain `±202.4` unit.
Air di `y = -0.9`; pemain tidak bisa masuk area dengan `terrainH < -0.75`.

### Rumput GPU (`:316`)

`InstancedBufferGeometry` + `ShaderMaterial` sendiri:

| | desktop | mobile |
|---|---|---|
| instance | 130.000 | 30.000 |
| segitiga/frame | **6.240.000** | 1.440.000 |

Tiap instance = 4 blade × 6 segmen × 2 segitiga = 48 segitiga, `DoubleSide`.

Tiga trik culling yang dipakai:

1. **Wrapping modular** — posisi instance di-`mod` ke kotak 95×95 yang mengikuti
   pemain (`fieldCenter` di-update tiap frame), jadi rumput selalu ada di sekitar
   pemain tanpa buffer besar.
2. **Height cull** — blade di luar rentang `-0.2 < h < 3.6` (air & puncak bukit)
   dibuang dengan `gl_Position = vec4(0,0,2,1)`.
3. **Sink** — di atas jarak 34–46 unit blade ditenggelamkan ke bawah tanah.

Angin = 2 gelombang sinus + flutter per-instance, arah `normalize(vec2(0.80,0.60))`.

### Langit, air, fauna

- **Sky** (`:273`): sphere r=1000, `BackSide`, shader FBM 5 oktaf, awan di-*step*
  3 level biar senada dengan gaya toon, glow matahari `pow(dot,700)`, `fog:false`.
- **Air** (`:341`): plane 440×440 (96×96 segmen, 64 di mobile), 3 gelombang sinus
  di vertex shader, fresnel `pow(1-dot(V,N),2.2)`, specular `pow(dot(R,sunDir),200)`.
- **Kupu-kupu** (`:380`): 55 instance (26 mobile), `InstancedBufferGeometry`, flap +
  drift orbit per instance, alpha fade di atas 30–52 unit.
- **Burung** (`:389`): 34 instance (18 mobile), 3 flock mengitari radius 95–150 unit
  di ketinggian 58–94 unit, `fog:false`, fade 230–340 unit.
- **Debu** (`:396`): 190 point (90 mobile), `PointsMaterial` additive, dibungkus
  kotak 90×90 yang mengikuti pemain.

Semua `ShaderMaterial` di atas mengimplementasikan fog **manual** dengan uniform
`fogColor/fogNear/fogFar` yang nilainya sama dengan `scene.fog`, supaya konsisten.

### Pohon & batu (`:355`)

`InstancedMesh` + cel outline:

| | desktop | mobile |
|---|---|---|
| pohon | 95 | 60 |
| foliage blob | 4–6 per pohon | 4–6 per pohon |
| batu | 44 | 30 |

- **Outline** (`:351`): shell `BackSide` yang di-extrude sepanjang normal, tebalnya
  tumbuh mengikuti jarak kamera (`clamp(1 + dCam*0.016, 1, 2.4)`) supaya garis tepi
  tetap kelihatan konsisten di jauh/dekat.
- **Wind** (`:350`): disuntik lewat `onBeforeCompile` ke `#include <begin_vertex>`,
  pakai `instanceMatrix` sebagai sumber fase. `trunkMat` stiffness 4.0, `foliMat` 5.0.
- **Collider**: circle. Pohon `r = 0.42 * scale`, batu `r = 0.80 * scale`, disimpan
  di array `COLLIDERS` (~139 entri desktop) dan dipakai untuk tabrakan pemain **dan**
  pull-in kamera.

### Orb (`:372`)

12 orb ditempatkan acak dengan syarat: `terrainH > -0.55`, jarak dari spawn `> 7`,
dan jarak antar-orb `> 26` unit (maksimal 8000 percobaan). Tiap orb = 1 group berisi:

1. `IcosahedronGeometry(0.34, 2)` + `MeshBasicMaterial`
2. shell outline `BackSide` skala 1.16
3. `Sprite` glow additive (CanvasTexture radial 128px)
4. beacon silinder tinggi 46 unit, shader additive, `frustumCulled = false`
5. `PointLight`

Ambil orb: jarak horizontal `< 2.4` **dan** `|Δy| < 3.8`. Menang: `score === 12`.

### Karakter (`:417`)

`character.glb` — 49 node, **33 joint**, 6 mesh / 12.536 segitiga total.

**Yang dipakai:** 4 `SkinnedMesh` (DRESS, HEAD, BODY, NEEDLE).
**Yang dibuang saat runtime** oleh `DROP_MAT = /shadow|silk/i`: mesh `SILK_LINE`
(7.872 vertex, 299 KB = **43% geometry GLB**) dan mesh `shadow` (4 vertex).

**Material:** semua material GLB memakai extension `KHR_materials_unlit`, jadi
`GLTFLoader` menghasilkan `MeshBasicMaterial`. Material asli **dipertahankan apa
adanya** — tidak dikonversi ke `MeshToonMaterial`. Alasannya ada di
[Known Issues #5](#-known-issues).

**Normalisasi nama bone** (`:419`):

```js
cleanBoneName = n => n.replace(/_\d+$/,'').replace(/\./g,'').replace(/\s+/g,'_').toUpperCase()
// 'THIGH.R_22'            -> 'THIGHR'
// 'DRESS HANDLER BACK.R_4'-> 'DRESS_HANDLER_BACKR'
```

**Animasi 100% prosedural.** Clip bawaan GLB (`HORNET RIGAction`, 30 channel)
**tidak dipakai** — tidak ada `AnimationMixer` di proyek ini. Semua pose dihitung
per frame lewat `boneRot(name, rx, ry, rz, blend)`:

```js
_e.set(rx,ry,rz); _q.setFromEuler(_e); _q.premultiply(restQuat[name]);
bone.quaternion.slerp(_q, 1 - Math.pow(0.001, dt));   // framerate independent
```

**18 dari 33 joint** digerakkan: `PELVIS`, `BELLY`, `CHEST`, `HEAD`, `SHOULDERR/L`,
`ARMR`, `FOREARMR`, `THIGHR/L`, `KNEER/L`, + **6 bone cloak** (semua yang namanya
mengandung `DRESS`: `DRESS_HANDLERR`, `DRESS_HANDLER_BACKR`, `DRESS_HANDLERL`,
`DRESS_HANDLER_BACKL`, `DRESS_HANDLER_FRONT`, `DRESS_HANDLER_BACK`).

**15 joint tidak pernah disentuh**: `NECK`, `HAND.R/L`, `KNUCLE.R/L`, `LOWLEG.R/L`,
`FOOT.R/L`, `TOE.R/L`, `ARM.L`, `FOREARM.L`, `NEEDLE_BONE`.

State machine animasi (`animateCharacter`, `:454`), prioritas dari atas ke bawah:

| State | Yang dianimasikan |
|---|---|
| `attack.active` | PELVIS, CHEST, SHOULDERR, ARMR, FOREARMR, cloak |
| `dashing` | PELVIS, THIGHR/L, KNEER/L, cloak (ditarik ke −0.9) |
| `jumping/falling` | THIGHR/L, KNEER/L |
| `moving` | THIGHR/L, KNEER/L, SHOULDERR/L, CHEST, cloak |
| idle | BELLY, CHEST, HEAD, cloak |

Amplitudo jalan: thigh `0.58` rad, arm `0.42`. Lari: thigh `0.92`, arm `0.72`.
Phase rate: `5.6` (jalan) / `9.2` (lari) / `11` (dash) / `1.2` (idle).

Cloak pakai spring sederhana `curX += (target - curX) * dt * k` dengan `k` berbeda
per state (idle 2.2, jalan 6, attack 8, dash 12).

### Dash & afterimage (`:415`, `:810`)

```
dur 0.30s | power 40 m/s | cooldown 0.34s | jarak ±7 m
stamina: max 100, cost dash 26, drain lari 20/s, regen 32/s, delay regen 0.55s
```

Afterimage: `SkeletonUtils.clone(model)` tiap **0.045 detik** selama dash
(±7 clone per dash), material diganti jadi siluet cyan `0x6ec8ff` transparan
(`opacity 0.55`, `depthWrite false`, texture dilepas), hidup 0.45s lalu fade +
scale `1 + (1-k)*0.08`.

Efek samping dash: FOV trail & `#speedLines` opacity `trail * 0.85`,
`trail` meluruh `dt * 2.6`.

### Attack (`:819`, `:980`)

```
durasi 0.52s | cooldown setelah selesai 0.15s
combo counter 0..3 (siklis) | window queue: t antara 0.28 dan 0.85
slash spawn di t > 0.28
```

Satu pose attack untuk **semua** combo (belum ada variasi per combo — lihat Roadmap).
Efek slash: `PlaneGeometry(5.2, 3.2)` + `MeshBasicMaterial` additive dengan
`CanvasTexture` 512px (crescent biru-putih, dibuat sekali via `createRadialGradient`
+ `shadowBlur`), di-spawn `1.2` unit di depan karakter pada tinggi `1.1`, hidup
0.28s, scale `0.9 + k*0.25`. Plus flash layar 90ms (`#attackFlash`).

Selama attack, input gerak dikalikan `0.35` (setelah `t > 0.4` saja) dan turn speed
naik ke `18`.

### Fisika pemain (`:919`)

Modelnya *accelerate + exponential damping*, bukan kecepatan tetap:

```js
player.vel += dir * speed * 8 * dt
player.vel *= Math.pow(DASH.timer > 0 ? 0.35 : 0.0008, dt)
```

`speed` = 6.5 (jalan) / 13.5 (lari). Kecepatan terminal hasil formula di atas:

| | 30 fps | 60 fps | 144 fps |
|---|---|---|---|
| jalan | 8.19 m/s | 7.74 m/s | 7.48 m/s |
| lari | 17.0 m/s | 16.1 m/s | 15.5 m/s |

⚠️ Berarti kecepatan gerak **bergantung framerate** (selisih ±5%). Belum
framerate-independent sepenuhnya.

Lompat: `vy = 9.8`, gravity `22` → apex **2.18 m**, airtime **0.89 s**,
`jumpCooldown 0.25s`. `player.pos.y` adalah tinggi *di atas* terrain, jadi
mendarat = `pos.y <= 0`.

Tabrakan: circle-vs-circle terhadap `COLLIDERS`, posisi didorong keluar dan
komponen kecepatan sepanjang normal dihapus (tidak ada tunneling).
`dt` di-cap `0.05` (20 fps minimum simulasi).

### Kamera third-person (`:1033`)

```
target      : (x, groundY + 1.92, z)
jarak       : 5.0, pull-in ke 1.4 kalau terhalang collider
pitch clamp : -0.55 .. 1.05 rad  (-31.5° .. +60°)
sensitivitas: mouse 0.0022, touch 0.005
smoothing   : lerp dt*14 (dt*26 saat dash), pull-in dt*18 / release dt*5
```

Kamera juga di-clamp agar tidak masuk terrain (`terrainH + 0.55`).

### HUD

Orb counter, timer (update 10×/detik, lewat `elTime` yang di-cache), stamina bar
(muncul saat `< 99.5%` atau sedang dash, berubah oranye saat `< 30%` atau
exhausted), speed lines, vignette, attack flash. Suara chime saat ambil orb dibuat
runtime dengan 3 oscillator sine (660 / 880 / 1320 Hz) lewat `AUDIO.pickup(score)`
— naik setengah nada tiap orb beruntun. Tidak ada file audio sama sekali.

**HUD mobil** (CSS `index.html:55`, elemen + logika `:518-674`) menggantikan HUD kaki
begitu `mode === 'car'`, meniru tata letak CarX Street:

| Bagian | Isi |
|---|---|
| Gauge kanan bawah | Jarum kecepatan + **arc RPM** (dasharray SVG) + nomor gigi |
| Panel kiri | Angka km/j, RPM, bar nitro |
| Bawah | Pedal gas/rem, tombol rem tangan & nitro, setir sentuh |
| Tengah bawah | Prompt kontekstual (`Tekan E masuk mobil` / `B summon` / `E keluar`) |

Gauge-nya **dibangun runtime** (`svgEl()`, `:537`) dari tiga konstanta — sudut awal
`-126°`, sapuan `252°`, skala maksimum `180` km/j — jadi tidak ada path SVG yang
di-hardcode dan angkanya tidak bisa meleset dari `CAR_CFG`.

---

### 🚗 Mobil (`js/car.js`, 870 baris)

**Model.** Dua jalur, dipilih otomatis:

1. **Procedural** (bawaan, selalu ada): 31 mesh / **3.744 segitiga** / 10 material /
   17 geometry — body GT3 hasil `ExtrudeGeometry` dari profil samping, kaca, splitter,
   diffuser + 5 sirip, side skirt, sayap belakang + strut + end plate, snorkel,
   lampu & sprite glow, knalpot ganda, spion, dan 4 roda (ban, sidewall, velg,
   5 spoke, hub, cakram, kaliper).
2. **GLB eksternal** (`car.glb` di root repo): `car.loadModel()` di `index.html:509`
   memuatnya, menormalkan sumbu terpanjang ke Z, menskalakan ke `CAR_CFG.length`
   (4.55 m), menurunkan ke tanah, mendeteksi node roda dari nama
   (`/wheel|tire|tyre|rim|roda/i`) supaya ikut berputar & berbelok, lalu
   menyembunyikan model procedural. **Gagal 404 = tetap jalan normal.**

> **Cara memasang aset mobil asli:** taruh file sebagai `car.glb` di root repo,
> reload. Kalau mobilnya malah jalan mundur, buka console dan ketik
> `CAR_CFG.modelNoseFlip = true` lalu keluar-masuk mobil (`window.car`,
> `window.CAR_CFG`, `window.AUDIO` memang diekspos untuk ini). Konvensi: model harus
> berakhir dengan **nose di −Z lokal**, karena root diputar `rotation.y = yaw + π`.

**Optimasi draw call (sudah diverifikasi headless).** Model procedural tadinya 71 mesh
dengan 69 material unik dan 70 geometry unik — praktis tidak ada yang dipakai ulang.
Sekarang:

| | sebelum | sesudah |
|---|---|---|
| mesh mobil | 71 | **31** |
| material unik | 69 | **10** |
| geometry unik | 70 | **17** |
| segitiga | 3.744 | **3.744** (identik) |
| draw call seluruh sistem mobil | ~76 | **38** |

Caranya: material di-cache per (warna + opsi), geometry yang berulang dipakai ulang,
5 sirip diffuser digabung jadi 1 mesh, dan **tiap roda digabung dari 9 mesh jadi 1**
dengan posisi/rotasi di-*bake* ke vertex dan warna asli disimpan di attribute `color`
(`vertexColors: true`, material putih). Keenam warna roda diverifikasi sama persis
dalam ruang linear, dan bounding box-nya tetap 0.327 × 0.702 × 0.702 m.

**Fisika.** Arcade tapi berbasis gaya, bukan sekadar menggeser posisi. Semua konstanta
ada di `CAR_CFG` (`js/car.js:20`):

| Parameter | Nilai |
|---|---|
| Massa / panjang / lebar / tinggi | 1380 kg / 4.55 / 1.92 / 1.18 m |
| Wheelbase / track / radius roda | 2.62 / 1.60 / 0.34 m |
| Kecepatan maksimum | **46.0 m/s = 165.6 km/j** (dibatasi sengaja: dunia cuma 440×440 m) |
| Mundur maksimum | 12.0 m/s = 43.2 km/j |
| Gigi | 6 maju `[3.35, 2.28, 1.68, 1.28, 1.00, 0.82]` + R, final drive `6.65` |
| Torsi puncak | 242 N·m, kurva puncak lebar (tetap ~1.03× di 7950 rpm) |
| Upshift / downshift / rev limit | 7950 / 3300 / 8800 rpm |
| μ ban / porsi berat roda penggerak | 1.28 / 0.62 (RWD) |
| Nitro | ×1.55 gaya dorong, 100 unit, habis 34/s, isi ulang 9/s |
| Rem / rem tangan | 15.000 N / 9.000 N |

Rantai gayanya: `torsi mesin × kurva × rasio gigi × final drive / radius roda`,
dibatasi **traksi** `mass × 9.81 × 0.62 × μ` (jadi gigi 1–2 benar-benar bisa
wheelspin), lalu dikurangi drag `dragK·v²` dan rolling resistance. `dragK` **diturunkan
saat runtime** dari gaya di gigi tertinggi pada rpm yang benar-benar terjadi di
`maxSpeed` — karena itu kecepatan puncak tepat 46.00 m/s, bukan "kira-kira".
Kopling disimulasikan `clamp(|v|/4.0, 0.42, 1)` supaya tidak ada torsi penuh saat
hampir berhenti. Rem diinjak dalam dari posisi hampir berhenti → **gigi mundur
otomatis** (transmisi otomatis, bukan tombol terpisah).

**Handling.** Slip angle dihitung dari selisih arah nose dan arah gerak; di atas
ambang tertentu mobil drift, grip pulih dengan `gripRecover 3.6`. Rem tangan
menurunkan grip lateral (`handbrakeGrip 1.15`) dan menaikkan pembentukan slip
(`slipGenHandbrake 0.95`) → bisa powerslide. Kemudi dibatasi `maxSteer 0.60` rad dan
dilemahkan otomatis pada kecepatan tinggi. Pitch & roll diambil dari **4 sampel
`terrainH()`** di tiap roda (bukan dari normal rata-rata), di-damping 18/s, ditambah
roll ekstra dari yaw rate — jadi mobil miring saat menikung dan mengikuti kontur bukit.

**Tabrakan & batas.** Semua `COLLIDERS` dunia (pohon/batu) dipakai: respons berupa
dorongan keluar + `speed ×= −0.26` + `cameraShake` proporsional + cooldown dampak
0.35 s supaya tidak "gigil" saat bergesekan. Mobil juga tidak bisa masuk air
(`WATER_Y`) atau keluar dunia (`limit = T_SIZE × 0.46`).

**Efek.** Skid mark = **satu** mesh ring-buffer 460 quad (920 segitiga, 1 draw call)
dengan alpha per-vertex yang memudar (half-life 4.5 s), ditulis hanya saat slip
cukup besar. Debu = 170 point (1 draw call). Ada cincin summon saat mobil dipanggil.

**Verifikasi.** Karena sandbox tidak punya GPU/browser, fisika mobil dijalankan
**headless di Node** (stub DOM + canvas, three.js r160 asli, 10 skenario). Hasil:

| Tes | Hasil |
|---|---|
| 0–100 km/j | **4.33 s** |
| Kecepatan puncak | **165.6 km/j**, gigi 6, 7045 rpm |
| Steer kanan (`+1`) | yaw **berkurang**, gerak ke −X ✓ |
| Arah nose vs arah gerak | `dot = 1.0000` ✓ |
| Mundur | tepat −12.0 m/s, gigi `R` ✓ |
| Drift rem tangan | slip maks 0.448, skid mark tertulis ✓ |
| Ditinggal keluar mobil | berhenti sendiri (rem parkir) ✓ |
| Nitro | 30.4 → 39.7 m/s ✓ |
| Tabrak pohon @23.0 m/s | membal −6.0 m/s, **tidak menembus** (jarak min = jumlah radius), shake 0.85 ✓ |
| Terrain asli 25 detik | pitch maks 11.8°, roll maks 9.0° ✓ |
| Stress 60 s input acak | tidak ada `NaN`/`Infinity` ✓ |

---

### 🔊 Audio (`js/audio.js`, 455 baris)

**Nol file aset** — semuanya sintesis WebAudio. Satu `AudioContext` untuk seluruh game
(menghindari bug multi-context di iOS), semua node dibuat **sekali** di `init()` lalu
hanya parameternya yang di-update tiap frame → tidak ada alokasi per frame.

| Lapis | Isi |
|---|---|
| **Mesin** | Firing frequency `rpm/60 × (silinder/2)` = **inline-6** (300 Hz @6000 rpm; `AUDIO.cylinders` bisa diset 8 untuk karakter V8). 5 harmonik (sub 0.5×, fundamental saw, oktaf, ganjil 3×, 4.02×) + LFO "kasar" di 0.5× yang mengecil saat rpm naik, lewat **softclip `tanh`** → terdengar seperti mesin, bukan synth. Ditambah noise intake (naik dengan throttle) dan **dua whistle turbo** yang sedikit detune (twin-turbo). |
| **Wastegate** | Lepas gas mendadak (`Δthrottle > 0.45`) di atas 3200 rpm → flutter bandpass 2650→680 Hz selama 0.34 s, sekali per transisi + cooldown 0.30 s. |
| **Ban** | 2 noise bandpass (2350 Hz Q7.5 + 3700 Hz Q3) yang gain-nya mengikuti slip & kecepatan, frekuensinya bergeser + jitter acak. |
| **Benturan** | `impact(force)` — noise burst + oscillator turun, volumenya skala dengan gaya. |
| **Backfire** | Square 210→60 Hz + burst, dipicu rev limiter. |
| **Lainnya** | `engineStart()` (starter motor 0.8 s), `gearShift()`, `door(open)`, `uiClick()`, `pickup(step)` (3 sine 660/880/1320 naik setengah nada). |
| **Ambient fantasy** | Angin (noise + 2 filter + LFO 0.07 Hz), pad akor 5 oscillator yang ganti akor ±15 detik dengan filter LFO 0.045 Hz, burung, dan shimmer sihir. |

Ambient di-*duck* otomatis saat mesin keras (`updateAmbient(dt, engineLoud01)`) supaya
suara mesin tidak bertumpuk dengan pad. `M` = mute seluruh bus.

**Verifikasi headless** (stub `AudioContext` yang mencatat setiap nilai parameter dan
menegakkan aturan WebAudio asli): 63 node, 3.349 update parameter, **0 error** — tidak
ada nilai `NaN`, tidak ada `exponentialRampToValueAtTime(≤0)` (yang di browser
melempar `RangeError`), tidak ada `start()` ganda, dan wastegate terpicu tepat sekali
per lift-off (bukan tiap frame) serta tidak bunyi di rpm rendah.

---

## ⚡ Anggaran performa

| Item | Desktop | Mobile |
|---|---|---|
| Segitiga rumput | 6.240.000 | 1.440.000 |
| Segitiga terrain | 51.200 | 28.800 |
| Segitiga air | 18.432 | 8.192 |
| Segitiga karakter | ~12.500 (4 mesh) | sama |
| Segitiga mobil | 3.744 (31 mesh) | sama |
| Segitiga skid mark | ≤ 920 (1 mesh ring-buffer) | sama |
| Draw call dunia (±) | ~100 | ~100 |
| Draw call mobil (+) | ~38 | ~38 |
| Light per fragmen | 1 dir + 1 hemi + 1 amb + **12 point** | sama |
| Shadow map | 2048² | 1024² |
| pixelRatio cap | 2.0 | 1.5 |

⚠️ Angka dunia **belum pernah diprofil** dengan alat ukur. Tidak ada telemetry, tidak
ada FPS counter, tidak ada quality toggle di repo ini. Angka mobil dihitung langsung
dari scene graph secara headless (bukan perkiraan): 31 mesh, 3.744 segitiga, 10
material, 17 geometry, plus skid mark (1 mesh), debu (170 point), 4 sprite, dan cincin
summon.

Dua beban terbesar yang teridentifikasi dari pembacaan kode: (1) 6,24 juta segitiga
rumput `DoubleSide`, (2) 12 `PointLight` yang masuk ke **setiap** shader
`MeshToonMaterial` — termasuk terrain yang menutupi seluruh layar.

---

## 🐛 Known Issues

Urut dari yang paling berdampak. Semua sudah diverifikasi terhadap kode, bukan tebakan.
Item bertanda **✅** sudah diperbaiki di branch ini tapi nomornya dipertahankan supaya
referensi silang di README tidak putus.

### 🚨 Ditemukan & diperbaiki di branch ini

**22. Halaman blank total: `jsm/utils/BufferGeometryUtils.js` tidak ada di repo** — ✅ **FIXED**

Ini bug paling parah di repo dan tidak terlihat dari membaca kode saja.
`jsm/loaders/GLTFLoader.js:68` berisi:

```js
import { toTrianglesDrawMode } from '../utils/BufferGeometryUtils.js';
```

File itu **tidak pernah di-commit** (dikonfirmasi lewat GitHub API: HTTP 404 di
`main`). Karena ini *static import*, seluruh module graph gagal di-resolve browser →
`<script type="module">` di `index.html` **tidak pernah dieksekusi sama sekali** →
tidak ada renderer, tidak ada scene, halaman cuma menampilkan overlay statis dengan
tulisan "Loading..." selamanya. Jadi https://kyokoapp.github.io/rpg/ saat ini blank.

*Fix (sudah diterapkan):* vendor `BufferGeometryUtils.js` resmi dari paket npm
`three@0.160.0`. Ketiga file addon + `three.module.js` di repo sudah diverifikasi
**byte-identik** dengan rilis resmi r160, jadi tidak ada risiko campur versi.

*Pelajaran:* cek module graph, bukan cuma isi file. Skrip verifikasi sekarang
menelusuri setiap `import` relatif / `three/addons/` dan memastikan file tujuannya ada.

### P0

**1. Karakter terlalu pendek ±37% & jarumnya menancap ke tanah** — `:423-425`, `:486`

`Box3.setFromObject(model)` menghitung **seluruh** model termasuk NEEDLE, yang
menjulur jauh di luar badan. Bounds asli dari GLB (semua node mesh ber-transform
identity, jadi bounds lokal = bounds dunia):

| mesh | rentang Y |
|---|---|
| BODY | 0.021 → 0.854 |
| DRESS | 0.335 → 0.880 |
| HEAD | 0.812 → 1.116 |
| **NEEDLE** | **−0.314 → 1.426** |

Jadi `size.y = 1.740` → `scale = 1.75/1.740 = 1.006`, padahal tinggi badan asli
hanya ~1.10 unit. Karakter tampil **~1.11 unit, bukan 1.75**, sementara kamera
mengincar `groundY + 1.92` (0.8 unit di atas kepalanya).
Selain itu `model.position.y -= box2.min.y` (angkat +0.316) **ditimpa tiap frame**
oleh `:486` (`CHAR.model.position.y = ... : 0`), jadi offset grounding-nya jadi
dead code dan ujung jarum terkubur ±0.31 unit di bawah tanah.

*Fix:* ukur tinggi dari mesh BODY / tulang `FOOT`, simpan `CHAR.baseY`, lalu
`position.y = CHAR.baseY + bounce`.

**2. Idle membekukan kaki & tangan** — `:483`

Cabang idle hanya menulis `BELLY`, `CHEST`, `HEAD` + cloak. `THIGH/KNEE/SHOULDER/ARM/FOREARM`
tidak pernah di-reset, jadi begitu berhenti jalan karakter berdiri dengan kaki dan
lengan nyangkut di pose langkah terakhir. Cabang jump/fall sama (lengan beku), dan
cabang dash tidak menggerakkan lengan sama sekali.

*Fix:* setiap cabang harus menulis semua bone yang ditulis cabang lain, atau reset
ke `restQuat` dengan blend.

**3. Mobile: geser kamera = menyerang** — `:791`

`touchend` di kanan 55% layar langsung memanggil `tryAttack()` tanpa memeriksa
durasi atau jarak geser.

*Fix:* catat `timeStamp` + koordinat di `touchstart`, di `touchend` syaratkan
`dt < 280ms && jarak < 12px`.

**4. Memory leak: tidak ada satu pun `dispose()`** — `:488`, `:498`

`grep -c "dispose(" index.html` = **0**. `spawnGhost()` meng-clone material tiap
0.045s (±7 clone per dash) dan `spawnSlash()` membuat `PlaneGeometry` +
`MeshBasicMaterial` **baru tiap serangan**; keduanya cuma di-`scene.remove()`.
Bonus: `SkeletonUtils.clone` = deep clone 33 bone + 4 SkinnedMesh tiap 45ms →
potensi frame hitch.

*Fix:* pool ghost (pre-clone 8, reuse) + 1 geometry/material slash dipakai bersama;
`dispose()` kalau memang dibuang permanen.

### P1

**5. Warna karakter clipping (kemungkinan besar ini penyebab "putih/pudar" yang
selama ini dikira bug Android)** — `:260`, `:297`

Pipeline `sun 3.3` + `hemi 0.6` + `ambient 0.2` + `RAMP4` (gradient minimum
**0.424**, jadi tidak pernah benar-benar gelap) + `ACESFilmic` menghasilkan
irradiance `1.90 – 3.80`. Dihitung ulang dari texture asli GLB:

| bagian | albedo asli | hasil di layar |
|---|---|---|
| Dress (merah) | (179, 19, 61) | (229, **0**, **0**) → (255, 77, 38) |
| Needle (abu baja) | (167, 176, 183) | (215, **255**, **255**) |

Kanal merah clip ke 255, hijau/biru hancur → hue bergeser, detail hilang.
**Status: karakter sekarang sudah di-unlit** (material asli GLB dipertahankan), jadi
karakter tidak lagi terpengaruh. Terrain/pohon/batu **masih** toon dengan sun 3.3.

Catatan: di three r160 shader toon membaca `texture2D(gradientMap, coord).r`, jadi
`DataTexture` ber-`RedFormat` **aman di WebGL2**. Baru rusak di device WebGL1-only,
dan gejalanya **gelap**, bukan putih.

**6. Instruksi di layar salah** — ✅ **FIXED** (overlay `:190` vs handler `:849`)
Overlay tadinya menulis "Klik **Kanan** / J", kodenya `e.button === 0` = klik **kiri**.
Sekarang overlay menulis "Klik **Kiri** / J", dan daftar tombolnya sudah ditambah
`E` / `B` / `R` / `M` (desktop) serta 🚗 + pedal/setir (touch).

**7. Audio tidak pernah di-resume** — ✅ **FIXED**
`audioCtx` lokal sudah dihapus; seluruh suara lewat satu `AudioEngine`
(`js/audio.js`), dan `AUDIO.init(); AUDIO.resume()` dipanggil **di dalam gesture**:
`startGame()` (`:861`), klik overlay (`:615`, `:637`), ambil orb (`:853`), dan
keydown (`:838`). Ini juga memperbaiki masalah iOS/Android yang context-nya mulai
dalam state `suspended`.

**8. 12 PointLight masuk ke semua shader** — `:378`
*Fix:* pool 2–3 lampu tetap yang dipindah ke orb terdekat tiap frame. Jumlah lampu
harus konstan supaya tidak memicu shader recompile (yang bikin hitch).

**9. Potensi soft-lock** — `:1058`
Menang dicek dengan `score === ORB_COUNT` (konstanta 12), padahal penempatan orb
bisa gagal (batas 8000 percobaan). *Fix:* pakai `orbs.length`.

**10. `requestLock()` retry tanpa batas** — `:722`
`setTimeout(requestLock, 450)` dipanggil terus kalau browser menolak (Chrome punya
cooldown setelah `exitPointerLock`), tanpa penghitung maksimum.

**11. Ground snapping patah** — `:1009`
`groundY` langsung = `terrainH()` tanpa smoothing, jadi turun bukit terasa menyentak
dan kamera ikut. *Fix:* lerp `groundY`.

**12. `resetGame()` tidak lengkap** — `:876`
`ATTACK.combo`, `DASH.exhausted`, `ghosts`, `slashPool`, `camera.position`, dan
`cam3.distNow` tidak direset → kamera "terbang" dari posisi lama saat main ulang.

**13. Kecepatan bergantung framerate** (±5%) — lihat tabel di bagian Fisika pemain.

### P2

**14. Tidak ada favicon** → 404 di setiap page load.
**15. Dead code** — ✅ **sebagian FIXED**
`HALF` dan `cameraShake` global **dihapus** (shake mobil ada di `car.cameraShake` dan
dipakai `car.updateCamera()`); `elTime` sekarang **benar-benar dipakai** untuk update
timer (`:915`) menggantikan `getElementById('timeVal')` yang dipanggil ulang tiap
0.1 detik; `audioCtx` sisa chime lama dihapus.
**Masih dead:** `#crosshair` (CSS `:14` + div `:132`, selalu `display:none`).
**16. Dead weight di GLB:** mesh `SILK_LINE` 7.872 vertex (299 KB = 43% geometry)
dan clip animasi `HORNET RIGAction` dibuang runtime — sebaiknya dibuang dari filenya.
**17. `terrainH` diduplikasi 3×** — `:306` (JS), `:335` (GLSL rumput), `:386`
(GLSL kupu-kupu) → rawan tidak sinkron kalau salah satu diubah.
*Fix:* generate GLSL dari satu template string.
**18. Tidak ada fallback kalau WebGL gagal** → pengguna cuma melihat "Loading..."
selamanya. `new THREE.WebGLRenderer(...)` tidak dibungkus try/catch.
**19. Aksesibilitas:** `user-scalable=no` + `maximum-scale=1.0` (WCAG 1.4.4),
overlay berupa `div` dengan klik saja tanpa `role="button"` / `tabindex` / dukungan
keyboard, tidak ada `aria-live` untuk skor.
**20. Tidak ada PWA manifest**, padahal UI menyarankan "Tambahkan ke layar utama
untuk full-screen" — tanpa manifest, Android tetap membukanya dengan URL bar.
**21. File sangat panjang dengan baris raksasa** — `index.html` sekarang **1.099
baris** (baris terpanjang **1.858 karakter**, di `:386` = shader kupu-kupu) → praktis
tidak bisa di-diff/review. Sudah agak membaik: mobil dan audio dipecah ke `js/car.js`
(870 baris) dan `js/audio.js` (455 baris). Sisanya (dunia, pemain, HUD, game loop)
masih satu file. *Fix:* pecah lagi per sistem seperti yang sudah dilakukan untuk
mobil/audio.

---

## 🗺️ Roadmap (BELUM diimplementasi)

Semua item di bawah **tidak ada di kode**. Sebelumnya tertulis di README sebagai
sudah selesai — dipindah ke sini supaya jujur.

- ❌ `toonRamp` via `CanvasTexture` sebagai pengaman device WebGL1 (`:260` masih
  `DataTexture(..., RedFormat)`)
- ❌ Toggle first/third person dengan `V` (tidak ada handler `KeyV`; `#crosshair`
  juga selalu `display:none`)
- ❌ `C` untuk lompat (tidak ada handler `KeyC`)
- ❌ Zoom kamera dengan roda mouse
- ❌ Variasi pose & durasi per combo — `[0.52, 0.58, 0.68, 0.82]`. Sekarang satu
  durasi `0.52` dan satu pose untuk keempat combo; `ATTACK.combo` dihitung tapi
  tidak pernah dipakai
- ❌ 3 jenis slash texture (horizontal / vertical / spin). Sekarang cuma 1
- ❌ Camera shake saat finisher attack. (Shake baru ada untuk **mobil** —
  `car.cameraShake` saat tabrakan, dipakai `car.updateCamera()`. Variabel global
  `cameraShake` yang mati sudah dihapus.)
- ❌ Foot toe push & ankle adjustment (bone `LOWLEG`/`FOOT`/`TOE` tak pernah disentuh)
- ❌ Pelvis bounce lewat bone `PELVIS` — sekarang yang digerakkan `model.position.y`
- ❌ Lengan tersapu ke belakang saat dash (`-0.85`)
- ❌ Idle weight shift & subtle nod di luar breathing
- ❌ Deadzone joystick `0.14` + kurva smoothstep (sekarang linear, tanpa deadzone)
- ❌ Deteksi tap <280ms tanpa drag untuk attack mobile
- ❌ Quality toggle / FPS counter
- ❌ Gabungkan sisa mesh body mobil per material (31 → ~15 draw call). Yang sudah
  digabung baru 5 sirip diffuser dan 9 bagian tiap roda
- ❌ Aset mobil asli (`car.glb`) — sekarang masih model procedural
- ❌ Suara mesin **belum pernah didengar di browser sungguhan**: verifikasi yang ada
  bersifat headless (nilai parameter & aturan WebAudio), bukan persepsi
- ❌ CI. Test otomatis sudah ada tapi **harus dijalankan manual** — lihat `tests/`

**Perbaikan kecil pada klaim lama yang memang sudah ada:**

| README lama | Angka sebenarnya di kode |
|---|---|
| Joystick 120px | 110px (`MAX_R = 55`) |
| Grass 28k / 110k | 30.000 / 130.000 |
| pixelRatio max 1.6 di mobile | 1.5 |
| Cloak spring `k=9, damping 0.78` | spring `curX += (target-curX)*dt*k`, `k` = 2.2 / 6 / 8 / 12 per state |
| Walk 6.2 m/s, run 13.2 m/s | 6.5 / 13.5 sebagai *accel multiplier*; terminal 7.5–8.2 / 15.5–17 m/s |
| "Tested: Android 45-60fps (A52, Xiaomi)" | tidak ada bukti/profil tersimpan di repo |

---

## 🧭 Catatan pengembangan

- **Jangan buka lewat `file://`.** `importmap` + ES module butuh origin HTTP.
- **Jangan hapus header `@license`** di `three.module.js` (kewajiban MIT).
- **Jangan hapus atribusi** model di [CREDITS.md](CREDITS.md) dan `div.credit` di
  `index.html` (kewajiban CC-BY-4.0).
- Kalau mengubah `terrainH` di JS (`:306`), ubah juga **2 salinannya** di shader GLSL:
  rumput `:335` dan kupu-kupu `:386`. Ketiganya harus tetap identik, kalau tidak
  rumput/kupu-kupu akan melayang atau terkubur. Konstanta `FIELD=95` (`:315`) juga
  hardcoded di shader.
- **Jangan hapus `jsm/utils/BufferGeometryUtils.js`.** `GLTFLoader` meng-import-nya
  secara statis; tanpa file itu seluruh module graph gagal dan halaman jadi blank
  (lihat [Known Issues #22](#-known-issues)).
- **Konvensi nose mobil:** model digambar dengan nose di **−Z lokal**, karena
  `root.rotation.y = yaw + π`. Aset GLB baru harus dinormalkan ke konvensi itu, atau
  set `CAR_CFG.modelNoseFlip = true`.
- **`dragK` dihitung runtime**, jangan di-hardcode: nilainya diturunkan supaya
  kecepatan puncak tepat `CAR_CFG.maxSpeed`. Kalau `gears`, `finalDrive`,
  `peakTorque`, atau kurva torsi diubah, `dragK` menyesuaikan sendiri.
- **Firing frequency mesin** = `rpm/60 × (AUDIO.cylinders/2)`. Default 6 (inline-6
  twin-turbo). Ubah ke 8 kalau mobilnya diganti V8, atau suara mesin jadi salah nada.
- Branch kerja: commit kecil-kecil. History repo ini sekarang cuma 1 commit, jadi
  tidak ada yang bisa di-bisect.

---

## 📄 Lisensi

- **Kode game:** belum ada lisensi (lihat [CREDITS.md](CREDITS.md#3-kode-game-indexhtml))
- **`character.glb`:** CC-BY-4.0 © Seifert — [sumber](https://sketchfab.com/3d-models/shaw-hornet-hollow-knight-silksong-670a87a9234c40bc9c2a4f274f6d8cc1)
- **`three.module.js`, `jsm/`:** MIT © 2010-2023 Three.js Authors (ketiga file addon
  diverifikasi byte-identik dengan paket npm `three@0.160.0`)
- Hornet / Hollow Knight / Silksong adalah IP milik **Team Cherry**. Repo ini tidak
  berafiliasi dengan Team Cherry.
