# `tests/` — verifikasi headless

Sandbox/CI untuk repo ini **tidak punya browser dan tidak punya GPU**, jadi fisika
mobil dan graph audio diverifikasi di **Node** dengan three.js yang sudah di-vendor
di repo. Tidak perlu `npm install`, tidak perlu `package.json`, tidak perlu build.

```bash
cd rpg
node tools/check-imports.mjs                # module graph utuh? (penjaga bug halaman blank)
node --test tests/*.test.cjs tests/*.mjs    # suite node:test (lihat tabel di bawah)
node tests/car.physics.mjs                  # 11 skenario fisika mobil
node tests/audio.graph.mjs                  # validasi graph WebAudio + aturan parameternya
node tests/pwa.test.mjs                     # PWA: manifest, precache, SW, ikon, path relatif
```

Semuanya mengatur exit code sesuai hasil (0 = lulus, 1 = ada kegagalan),
jadi aman dipakai di CI — `.github/workflows/verify.yml` menjalankan semuanya
di setiap push dan pull request, dan `.github/workflows/test.yml` menjalankan
suite `node:test`.

Butuh **Node ≥ 22.15** (untuk `module.registerHooks`).

## Isi folder

| File | Fungsi |
|---|---|
| `importmap.mjs` | Hook resolver: `'three'` → `../three.module.js`, `'three/addons/*'` → `../jsm/*`. Cermin persis dari `importmap` di `index.html`, jadi tes menguji kode yang sama dengan yang jalan di browser. |
| `stubs.mjs` | Stub `document`, `canvas` 2D context, `matchMedia`, `requestAnimationFrame` — cukup supaya `js/car.js` bisa membangun scene graph tanpa DOM sungguhan. |
| `car.physics.mjs` | 11 skenario fisika. `terrainH()`, `WORLD_LIMIT`, dan `WATER_LEVEL` **diimpor langsung dari `game/world-data.mjs`** — sumber yang sama dipakai `index.html` — supaya tes tidak pernah tidak sinkron dengan dunia game. |
| `audio.graph.mjs` | Stub `AudioContext` yang **mencatat setiap nilai parameter** lalu menegakkan aturan WebAudio asli. |
| `car.model.test.mjs` | **Pipeline GLB mobil** (`js/car.js`) diuji headless dengan *mirror* adegan yang faithful terhadap `GLTFLoader` (node ber-mesh = `THREE.Mesh`, matriks node di-decompose, bbox dari min/max accessor) — deteksi 4 roda `car.glb` (tanpa 46 group setir interior), arah nose, flip sekali, panjang/tanjakan, pivot, hingga animasi "semua roda berputar + hanya depan menyetir" lewat `Car.update` sungguhan. Plus model sintetis untuk edge-case (setir interior, sumbu panjang di X, root berotasi ala Sketchfab, roda tanpa nama). |
| `pwa.test.mjs` | Manifest valid + path relatif, ikon PNG benar-benar valid dengan dimensi sesuai, **precache `sw.js` mencakup semua aset game dan semua path-nya eksis**, alur update `SKIP_WAITING`/banner "Perbarui", registrasi SW relatif di `index.html`, `make-icons.mjs` deterministik (byte-identik), dan `vercel.json` no-cache untuk `sw.js`/manifest. |

## Apa yang dijamin `car.physics.mjs`

| # | Skenario | Syarat lulus |
|---|---|---|
| T1 | Gas penuh 90 detik di jalan datar | 0–100 km/j 3–9 detik, kecepatan puncak = `CAR_CFG.maxSpeed`, **gigi 6 tercapai** |
| T2 | `steer = +1` | yaw **berkurang** dan mobil bergerak ke −X (kanan layar) |
| T3 | Arah nose model vs arah gerak | `dot = +1.000` — mobil tidak boleh jalan mundur |
| T4 | Tahan rem dari berhenti | mundur, dibatasi `reverseSpeed`, gigi `R` |
| T5 | Rem tangan sambil menikung | slip terbentuk, skid mark tertulis |
| T6 | Ditinggal keluar mobil | berhenti sendiri (rem parkir) |
| T7 | Nitro | kecepatan naik, isi nitro berkurang |
| T8 | Tabrak pohon | terdeteksi, **tidak menembus** collider, kecepatan berkurang, `cameraShake` naik |
| T9 | 25 detik di terrain asli | pitch/roll terbatas (tidak jungkir) |
| T10 | 60 detik input acak | tidak ada `NaN`/`Infinity` di state mana pun, tetap dalam batas dunia |
| T11 | Lereng (tanjak/turun/parkir) | `slope` terukur benar, menanjak lebih lambat, turun lebih cepat, **meluncur tanpa gas**, rem parkir menahan di 8° |

Setiap skenario juga memanggil `nanCheck()` tiap frame pada `speed`, `rpm`, `slip`,
`steer`, `yaw`, `pitch`, `roll`, `nitro`, `suspension`, `yawRate`.

Terrain "datar" untuk pengujian diletakkan 2 m di atas `WATER_LEVEL`, karena mobil
(sama seperti pemain) menolak bergerak di bawah permukaan air — kalau tes memakai
ketinggian 0 dengan `waterY` 0, semua skenario akan gagal karena alasan yang salah.

## Apa yang dijamin `audio.graph.mjs`

Stub `AudioContext`-nya menegakkan aturan WebAudio yang **benar-benar melempar error
di browser**, jadi tes ini menangkap bug yang tidak kelihatan dari membaca kode:

- `exponentialRampToValueAtTime(v)` dengan `v ≤ 0` → `RangeError` di browser.
- Nilai parameter non-finite (`NaN`/`Infinity`) → suara hilang senyap.
- `setTargetAtTime` dengan `timeConstant ≤ 0`.
- `OscillatorNode.start()` dua kali → `InvalidStateError`; `stop()` sebelum `start()`.
- Semua one-shot (`gearShift`, `backfire`, `impact`, `engineStart`, `door`, `uiClick`,
  `pickup`, `setRush`, `setMuted`, `updateAmbient`) harus tidak melempar.
- Wastegate harus terpicu **sekali** per lepas-gas (bukan tiap frame), menghormati
  cooldown, dan tidak bunyi di bawah 3200 rpm.

## Batasan (jujur)

- Tidak ada rendering sungguhan: tes ini **tidak bisa** menilai apakah mobilnya
  *terlihat* benar atau apakah mesinnya *terdengar* enak. Itu tetap harus dicek di
  browser.
- `js/car.js` membangun geometry lewat three.js asli, jadi jumlah mesh/segitiga bisa
  dihitung headless — tapi warna, bayangan, dan komposisi tidak.
- Mirror GLB di `car.model.test.mjs` memakai bounding box primitif (bukan
  vertex-by-vertex): cukup untuk pipeline (deteksi/align/pivot/animasi) karena
  yang dibutuhkan hanyalah transformasi dan bbox, tapi bukan untuk menilai
  bentuk visual.
- PWA dites struktural (manifest/SW/path/ikon) — perilaku *service worker sungguhan*
  (preflight, update di browser nyata) tetap perlu dicek sekali di browser.
