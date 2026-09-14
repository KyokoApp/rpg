# `tests/` — verifikasi headless

Sandbox/CI untuk repo ini **tidak punya browser dan tidak punya GPU**, jadi fisika
mobil dan graph audio diverifikasi di **Node** dengan three.js yang sudah di-vendor
di repo. Tidak perlu `npm install`, tidak perlu `package.json`, tidak perlu build.

```bash
cd rpg
node tools/check-imports.mjs   # module graph utuh? (penjaga bug halaman blank)
node tests/car.physics.mjs     # 11 skenario fisika mobil
node tests/audio.graph.mjs     # validasi graph WebAudio + aturan parameternya
```

Ketiganya mengatur `process.exitCode` sesuai hasil (0 = lulus, 1 = ada kegagalan),
jadi aman dipakai di CI — lihat `.github/workflows/verify.yml`, yang menjalankan
ketiganya di setiap push dan setiap pull request.

Folder ini juga berisi **suite kedua** milik regresi dunia/karakter
(`tests/*.test.cjs`, dijalankan `.github/workflows/test.yml` lewat
`node --test tests/*.test.cjs`). Keduanya hidup berdampingan: pola nama
`*.test.cjs` tidak cocok dengan file `.mjs` di atas, jadi tidak saling ganggu.

Butuh **Node ≥ 22.15** (untuk `module.registerHooks`).

## Isi folder

| File | Fungsi |
|---|---|
| `importmap.mjs` | Hook resolver: `'three'` → `../three.module.js`, `'three/addons/*'` → `../jsm/*`. Cermin persis dari `importmap` di `index.html`, jadi tes menguji kode yang sama dengan yang jalan di browser. |
| `stubs.mjs` | Stub `document`, `canvas` 2D context, `matchMedia`, `requestAnimationFrame` — cukup supaya `js/car.js` bisa membangun scene graph tanpa DOM sungguhan. |
| `car.physics.mjs` | 11 skenario fisika. `terrainH()`, `WORLD_LIMIT`, dan `WATER_LEVEL` **diimpor langsung dari `game/world-data.mjs`** — sumber yang sama dipakai `index.html` — supaya tes tidak pernah tidak sinkron dengan dunia game. |
| `audio.graph.mjs` | Stub `AudioContext` yang **mencatat setiap nilai parameter** lalu menegakkan aturan WebAudio asli. |

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
- Belum ada runner terpadu (`npm test`) dan belum ada CI; keduanya harus dipanggil
  manual.
