# Credits / Atribusi Pihak Ketiga

Repo ini memakai aset pihak ketiga. Semua atribusi di bawah **wajib** dipertahankan
selama asetnya masih dipakai.

---

## 1. Model karakter — `character.glb`

| Field | Nilai |
|---|---|
| Judul | **SHAW ! Hornet - Hollow Knight Silksong** |
| Author | **Seifert** (Peter_Seifert) |
| Sumber | https://sketchfab.com/3d-models/shaw-hornet-hollow-knight-silksong-670a87a9234c40bc9c2a4f274f6d8cc1 |
| Profil author | https://sketchfab.com/Peter_Seifert |
| Lisensi | **CC-BY-4.0** — http://creativecommons.org/licenses/by/4.0/ |
| Generator | Sketchfab-16.74.0 (glTF 2.0) |

Informasi di atas diambil langsung dari `asset.extras` di dalam `character.glb`,
jadi bisa diverifikasi ulang kapan saja:

```bash
python3 -c "import struct,json;d=open('character.glb','rb').read();\
l=struct.unpack('<I',d[8:12])[0];o=12;c=[];\
exec('while o<l:\n n,t=struct.unpack(\"<II\",d[o:o+8]);c.append((t,n,o+8));o+=8+n');\
j=[x for x in c if x[0]==0x4E4F534A][0];\
print(json.dumps(json.loads(d[j[2]:j[2]+j[1]])['asset'],indent=2))"
```

**Kewajiban CC-BY-4.0:** menyebut nama pembuat, judul, sumber, dan lisensi, serta
menyatakan jika ada perubahan. Perubahan yang dilakukan repo ini terhadap model:

- Mesh `SILK_LINE` dan `shadow` dibuang saat runtime (regex `DROP_MAT = /shadow|silk/i`).
- Material `KHR_materials_unlit` dipertahankan apa adanya (tidak diubah).
- Model di-scale agar tinggi bounding box = 1.75 unit.
- Seluruh animasi dibuat ulang secara prosedural di JavaScript; clip bawaan
  `HORNET RIGAction` tidak dipakai.

Kredit ini juga ditampilkan di layar mulai game (`div.credit` pada `index.html`).

> Catatan IP: *Hollow Knight* / *Silksong* dan karakter Hornet adalah milik
> **Team Cherry**. Model di atas dirilis author-nya di bawah CC-BY-4.0. Repo ini
> tidak berafiliasi dengan Team Cherry dan tidak mengklaim kepemilikan atas IP tersebut.
> Kalau game ini nanti dikomersialkan, urus izin IP-nya terpisah dari lisensi modelnya.

---

## 2. three.js — `three.module.js`, `jsm/`

| Field | Nilai |
|---|---|
| Versi | **r160** (`const REVISION = '160'`) |
| Lisensi | **MIT** |
| Copyright | Copyright 2010-2023 Three.js Authors |
| Proyek | https://github.com/mrdoob/three.js |

Header lisensi MIT ada di baris pertama `three.module.js`:

```js
/**
 * @license
 * Copyright 2010-2023 Three.js Authors
 * SPDX-License-Identifier: MIT
 */
```

File addon yang di-vendor (ketiganya bagian dari three.js, lisensi MIT yang sama,
tapi **tidak** membawa header lisensinya sendiri):

- `jsm/loaders/GLTFLoader.js`
- `jsm/utils/SkeletonUtils.js`
- `jsm/utils/BufferGeometryUtils.js` — di-import secara statis oleh `GLTFLoader`,
  jadi **wajib ada** kalau tidak halaman jadi blank

> **Penting:** tiga file di atas di-vendor (di-commit ke repo), bukan diambil dari CDN.
> Itu sah di bawah MIT selama notice di atas tetap ada. Jangan hapus header
> `@license` di `three.module.js`.

---

## 3. Kode game (`index.html`, `js/car.js`, `js/audio.js`)

Seluruh kode game ditulis sendiri oleh pemilik repo — dunia & pemain di
`index.html`, mobil di `js/car.js`, audio di `js/audio.js` — **kecuali** bagian yang
memakai API three.js. `js/audio.js` tidak memakai aset suara pihak ketiga sama
sekali: semua suara disintesis runtime dengan WebAudio.

⚠️ **Belum ada lisensi untuk kode repo ini.** `gh repo view` melaporkan
`licenseInfo: null` dan tidak ada file `LICENSE`. Selama belum ada, secara hukum
default-nya *all rights reserved* — orang lain boleh melihat (karena repo publik)
tapi tidak boleh memakai/memodifikasi/mendistribusikan kodenya.

Kalau memang mau dibuka, tambahkan file `LICENSE`. Pilihan umum:

- **MIT** — paling longgar dan paling cocok untuk proyek game web kecil.
- **Apache-2.0** — seperti MIT plus grant paten.
- **CC-BY-NC-4.0** — kalau mau boleh dipakai asal non-komersial.

Jangan lupa: lisensi kode **tidak** menimpa lisensi aset. `character.glb` tetap
CC-BY-4.0 milik Seifert dan `three.module.js` tetap MIT, apa pun lisensi yang
dipilih untuk kode.

---

## 4. Yang TIDAK dipakai

Supaya tidak salah kredit:

- **Tidak ada** aset Genshin Impact / miHoYo / HoYoverse di repo ini. Karakternya
  Hornet (Hollow Knight: Silksong), bukan Aether. Penyebutan "Aether" di README
  lama sudah dihapus karena salah atribusi.
- **Tidak ada** font, audio file, atau texture eksternal. Suara chime dibuat
  runtime lewat `AudioContext` (oscillator), bukan aset berlisensi.
- **Tidak ada** library lain selain three.js.
