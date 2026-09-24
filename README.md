# BlockZone

Game battle royale kotak (Capacitor + HTML5 canvas). Aplikasi Android hanya **peluncur**: game-nya
(`www/game.html`) diunduh/diperbarui dari internet, jadi update tidak perlu install APK baru.

## Cara kerja update

- `www/index.html` = peluncur kecil (ikut di APK). Saat dibuka: cek `version.json` di server → kalau ada
  yang lebih baru, unduh (ada progress bar) → simpan → jalankan.
- Game juga punya tombol **Pengaturan > PEMBARUAN > CEK** untuk unduh update dari dalam game, lalu MULAI ULANG.
- `www/game.html` bawaan APK tetap ada sebagai cadangan (offline / update gagal / update rusak).
- Kalau update yang diunduh ternyata tidak bisa jalan (10 dtk tidak mulai), otomatis dibuang dan kembali
  ke versi bawaan APK, dan build rusak itu tidak diunduh lagi.
- Yang bisa diperbarui lewat internet: isi `game.html` (kode, tampilan, AI, balancing). Kalau menambah
  file gambar/suara baru, tanam sebagai data URI di `game.html`. Ganti plugin native / izin Android /
  icon tetap butuh APK baru.

### Cara update game
1. Edit `www/game.html`, push ke `main`.
2. Workflow **Publish Game Update** jalan sendiri dan mempublikasikannya. Selesai.

### Setup server update (sekali saja, pilih salah satu)
- **GitHub Pages (default)**: repo *Settings > Pages > Source = GitHub Actions*. Alamat otomatis
  `https://USER.github.io/REPO/`. (Repo private butuh GitHub Pro/Team.)
- **Vercel (gratis, repo private aman)**: import repo → Framework "Other" (`vercel.json` sudah siap) →
  Deploy. Lalu di GitHub: *Settings > Secrets and variables > Actions > Variables* → tambah
  `UPDATE_BASE_URL` = alamat Vercel, contoh `https://blockzone.vercel.app/`.

Setelah `UPDATE_BASE_URL` / Pages diatur, jalankan workflow **Build Android** sekali (manual) supaya
APK tahu alamat server updatenya. Setelah itu tidak perlu build APK lagi untuk update game.

> **Penting:** workflow lain (mis. *Deploy Jekyll to GitHub Pages*, template bawaan GitHub) tidak boleh
> ikut deploy ke Pages repo ini. Dia akan menimpa paket update dengan isi repo mentah (tanpa
> `version.json` di root), dan aplikasi diam-diam lanjut main versi lama. Workflow `publish-update.yml`
> satu-satunya yang boleh deploy ke Pages. Mau hosting situs lain? Pakai repo terpisah atau Vercel.

## Keystore permanen

Semua APK (debug, release) dan AAB ditandatangani **satu kunci yang sama**:
`keystore/blockzone.jks` + `keystore/credentials.env`. Jadi orang yang update aplikasi tidak pernah kena
"App not installed / conflicts with existing package".

- **Simpan cadangan** kedua file itu. Kalau kunci berubah, semua pemain harus uninstall dulu.
- Jaga repo tetap **private** karena kunci ada di dalamnya.
- Mau pakai kunci sendiri? Isi GitHub Secrets `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`,
  `KEY_PASSWORD` (format PKCS12) — otomatis dipakai menggantikan kunci di repo. Pilih satu dan jangan
  ganti-ganti.
- APK lama yang terlanjur terpasang dengan kunci acak (debug) harus di-uninstall **sekali**.

## Build APK

Push ke `main` (selain perubahan `game.html`/`*.md`) atau jalankan **Build Android** manual. Hasil di
Artifacts: `BlockZone-debug-apk` dan `BlockZone-release-signed` (APK + AAB). Log build menampilkan
sidik jari sertifikat; harus sama di semua build.

ID AdMob BlockZone sudah tertanam di `build-android.yml`, tidak perlu isi Variables lagi.
Variabel opsional untuk menimpa (Settings > Secrets and variables > Actions > Variables): `ADMOB_APP_ID`,
`ADMOB_INTERSTITIAL_ID`, `ADMOB_REWARDED_ID`, `ADMOB_TESTING`, `UPDATE_BASE_URL`.
`ADMOB_TESTING` default `true` (iklan test, aman). Ubah ke `false` hanya setelah game rilis di Play Store;
jangan pernah klik iklan asli milik sendiri (akun AdMob bisa diblokir). ID iklan asli yang baru dibuat
sering "No fill" berjam-jam.

## Iklan (dimatikan)

Iklan dimatikan karena TapTap belum didukung AdMob (penghasilan iklan terbatas). Skill **Attack Speed**
sekarang dibeli dengan **200 koin**, tidak lagi lewat nonton iklan.
Kodenya tidak dihapus: di `www/game.html` ganti `ADS_ENABLED = false` jadi `true` untuk menyalakan lagi
(iklan interstitial tiap kalah 3x dan unlock lewat iklan perlu ditambahkan kembali di toko).
ID AdMob tetap tersimpan di `build-android.yml`.

## Donasi (sukarela)

Di menu ada tombol **♥** (di bawah pengaturan). Tap → panel "Dukung Pengembang" → tombol membuka halaman
donasi di browser HP. Donasi murni sukarela, tidak ada hadiah/koin, jadi tidak perlu server.
Link sudah diisi (`https://saweria.co/YukiDesu`). Untuk mengganti, ubah `const DONATE_URL` di `www/game.html`.
Kalau dikosongkan, tombol ♥ tersembunyi. Karena cuma `game.html` yang berubah, pemain menerimanya lewat update
otomatis tanpa APK baru.

## Gameplay (ringkas)

- Bot mulai dengan skor bervariasi (150 – ~9000, sedikit sangat tinggi), bot yang mati respawn dengan
  skor kecil. Membunuh bot berskor tinggi memberi bonus 10% dari skor korban (`KILL_BOUNTY_RATIO`).
- Peringkat kamu ditampilkan di bawah top 5 kalau belum masuk 5 besar.
- AI: bidikan memprediksi gerak target, menghindari peluru, kabur saat HP rendah, membalas yang
  menembaknya, tidak menembak pemain yang sedang pakai shield, jaga jarak sambil strafing,
  menjauhi dinding dan tidak menumpuk. Kepintaran naik sesuai skor bot dan level permainan.
- Ekor karakter/musuh: satu garis halus meruncing yang menyusut sendiri saat berhenti.
- Panah: bentuk dart baru + jejak cahaya. Panah pemain solid putih, peluru musuh outline.
