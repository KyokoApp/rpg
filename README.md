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

## Iklan buat unlock skill

Skill **Attack Speed** terbuka dengan nonton 3 iklan reward (Laser & Shield pakai koin). Kalau iklan
gagal, toast menampilkan kode error AdMob, contoh `Iklan belum tersedia (3 No fill)`:
- `3` No fill → belum ada iklan tersedia / ID iklan asli belum aktif → pakai ID test dulu
- `2` network error → cek koneksi
- `0` internal error → cek Google Play Services di HP

## Gameplay (ringkas)

- Bot mulai dengan skor bervariasi (150 – ~9000, sedikit sangat tinggi), bot yang mati respawn dengan
  skor kecil. Membunuh bot berskor tinggi memberi bonus 10% dari skor korban (`KILL_BOUNTY_RATIO`).
- Peringkat kamu ditampilkan di bawah top 5 kalau belum masuk 5 besar.
- AI: bidikan memprediksi gerak target, menghindari peluru, kabur saat HP rendah, membalas yang
  menembaknya, tidak menembak pemain yang sedang pakai shield, jaga jarak sambil strafing,
  menjauhi dinding dan tidak menumpuk. Kepintaran naik sesuai skor bot dan level permainan.
- Ekor karakter/musuh: satu garis halus meruncing yang menyusut sendiri saat berhenti.
- Panah: bentuk dart baru + jejak cahaya. Panah pemain solid putih, peluru musuh outline.
