# Orb Hunt — Aether Style Rework (Genshin-like)

Project besar RPG Three.js dengan fokus **animasi karakter super detail & smooth** ala Genshin Impact Aether.

## 🔥 Apa yang di-FIX dari versi lama?

### 1. **Fix Warna Putih di Android**
**Masalah:** Karakter putih polos di Android karena `DataTexture` dengan `RedFormat` tidak support di beberapa GPU Adreno/Mali + `flipY=false` manual merusak texture GLB.

**Solusi:**
- Ganti `toonRamp` dari `DataTexture RedFormat` → `CanvasTexture` (compatible WebGL1/2 semua Android)
- Jangan set `texture.flipY = false` manual, biarkan `GLTFLoader` handle. Hanya set `colorSpace = SRGBColorSpace`, `minFilter = LinearMipmapLinearFilter`
- `MeshToonMaterial` dengan `gradientMap = RAMP4` canvas, `transparent` + `alphaTest` 0.1
- `renderer.outputColorSpace = SRGBColorSpace`, `powerPreference: high-performance`, `antialias: !isTouch`

Hasil: warna karakter normal di Chrome Android, Samsung, Xiaomi, dll.

### 2. **Pergerakan Karakter Lebih Hidup — Aether Locomotion**
Sebelumnya cuma `sin(phase)` sederhana. Sekarang:

- **Idle:** breathing (belly/chest 0.035 rad), subtle weight shift, kepala slight nod, cloak idle wave pakai spring physics (sinus + wind)
- **Walk (6.2 m/s):** 
  - Thigh amplitude 0.58 rad, knee lift 0.72, foot toe push, ankle adjustment biar kaki napak tanah
  - Pelvis bounce `abs(cos)*0.042`, sway side 0.045, torso twist opposite legs
  - Arms swing elegant opposite legs, elbow bend 0.15-0.4
  - Cloak: 6 bones dress handler (`DRESS_HANDLERR`, `FRONT`, `BACK`, dll) dengan spring `k=9, damping 0.78`, flow sesuai velocity
- **Run (13.2 m/s):**
  - Thigh 0.92, knee 1.15, lean forward 0.18 rad, arms bent 90° pumping
  - Cloak blown back `-0.35 - speed*0.45`
- **Dash:** pose condong 0.55 rad, arms swept back `-0.85`, legs sprint fast `phaseRate 11`, plus afterimage
- **Jump:** crouch anticipasi (knee 0.95), takeoff extend, in-air tuck, landing. Physics `vy`, `gravity 22`, `jumpPower 9.8`
- **Turn:** `CHAR.turnSmooth` dengan lerp `dt*11` + shortest angle, jadi belok smooth kayak Genshin

Semua pakai `quaternion.slerp` dengan `blend = 1 - pow(0.001, dt)` biar framerate independent & smooth.

### 3. **Animasi Pedang — Attack Combo 4x + Tebasan Depan**
**Input:** 
- Desktop: Klik kiri / J / F / tap kanan layar
- Mobile: Tombol ⚔️ atau tap cepat di area kanan layar (deteksi tap <280ms tanpa drag)

**System:**
- State machine `ATTACK {active, combo 0-3, timer, t 0..1, queue}`
- Combo window 0.28-0.85, bisa queue next attack
- Durasi: [0.52s, 0.58s, 0.68s, 0.82s]
- Tiap combo punya pose detail (windup → slash → recover) untuk PELVIS, BELLY, CHEST, SHOULDERS, ARMS, FOREARMS, THIGHS, KNEES
- Contoh Combo1 horizontal: twist pelvis 0.55 → -0.9, chest 0.85 → -1.15, shoulder swing -2.2 rad
- Spawn slash effect di `t>0.28`

### 4. **Efek Tebasan (Slash)**
- `createSlashTexture()` bikin 3 jenis via Canvas: horizontal crescent (blue-white glow), vertical (gold), spin circle
- Additive blending, `depthWrite:false`, `DoubleSide`
- Spawn di depan karakter `forward*1.2 + up 1.1`
- Animasi: fade `opacity = life/max`, scale `0.9 + k*0.25`, rotasi `rotSpeed`
- Flash vignette `radial-gradient` 90ms
- Camera shake untuk finisher `cameraShake=0.6`

### 5. **Dash Afterimage — Bayangan Ketinggalan**
- `SkeletonUtils.clone(CHAR.model)` untuk clone pose saat dash
- Material clone jadi transparent `opacity 0.55`, `emissive 0x6ec8ff`, `depthWrite false`
- Spawn tiap `0.045s` saat `DASH.timer>0`
- Ghost pool `life 0.45s`, fade out + scale up `1 + (1-k)*0.08`
- Trail FOV `70 + trail*13`, speedLines opacity `trail*0.85`

### 6. **Android Playable**
- Joystick kiri 120px, deadzone 0.14 + smoothstep curve
- Kamera geser kanan (lookId)
- Tap kanan = attack (tanpa drag)
- 3 tombol: ⚡ Dash (kanan bawah), ⚔️ Attack (kanan atas), ⤴ Jump (tengah bawah)
- Stamina HUD, speedLines, vignette
- PixelRatio max 1.6 di mobile, grass 28k vs 110k, tree 60 vs 95
- Touch-action none, preventDefault, passive:false

## 🎮 Kontrol

**Desktop:**
- WASD gerak, Mouse kamera, Roda zoom
- Shift / Spasi = Dash (bayangan)
- C / Space (tanpa Shift) = Lompat
- Klik Kiri / J / F = Attack
- V = ganti first/third person

**Mobile:**
- Joystick kiri = gerak (dorong penuh = lari)
- Geser kanan = kamera
- ⚡ = Dash, ⚔️ = Attack (atau tap cepat kanan), ⤴ = Jump

## 📁 Struktur Repo

```
rpg/
├── index.html          # Game utama (Aether rework)
├── character.glb       # Model Aether-like (1.4MB)
├── three.module.js     # Three r160
├── jsm/
│   ├── loaders/GLTFLoader.js
│   └── utils/SkeletonUtils.js
└── README.md
```

## 🚀 Cara Jalanin

```bash
python -m http.server 8000
# buka http://localhost:8000
```

Untuk Android: deploy ke GitHub Pages / Netlify, lalu buka di Chrome. Warna sudah fix.

## 🌐 Deploy ke Vercel

Site ini 100% static (framework: **Other**, tanpa build command), jadi Vercel tinggal serve file apa adanya.

**Penting: Vercel hanya baca dari push GitHub.** Alurnya:

```
edit code → git push ke GitHub (main) → Vercel auto-deploy → URL update
```

Kalau kamu edit tapi **belum `git push`**, Vercel tidak akan pernah berubah.

**Setup sekali:**
1. [vercel.com](https://vercel.com) → **Add New → Project** → import `KyokoApp/rpg`
2. Framework Preset: **Other** (biarkan build command kosong)
3. **Deploy**

**Setiap kali ada perubahan:**
```bash
git add -A
git commit -m "update game"
git push origin main
```
→ Vercel auto-deploy dalam hitungan detik. Cek di dashboard → tab **Deployments**.

**Cek versi di browser:** layar start ada tag versi (mis. `v1.1`) di baris credit — naikkan konstanta `VERSION` di `index.html` tiap rilis biar gampang yakin deploy baru sudah live. `vercel.json` sudah set `Cache-Control` no-cache di `index.html` supaya browser tidak nyimpan versi lama.

Kalau deploy Vercel "nyangkut" padahal push sudah masuk:
- Dashboard → **Settings → Git** → pastikan **Production Branch = `main`**
- Klik **Redeploy** di deployment terakhir
- Hard refresh browser (Ctrl+Shift+R) / buka mode incognito

## 🔧 Tech Detail Penting

- **Material Fix:** CanvasTexture ramp bukan DataTexture RedFormat → fix Adreno white bug
- **Bone Cleaning:** `cleanBoneName = name.replace(/_\d+$/,'').replace(/\./g,'').replace(/\s+/g,'_').toUpperCase()` → `THIGH.R_22` → `THIGHR`
- **Cloak Physics:** spring `vel += (target-cur)*k*dt; vel*=pow(d, dt*60); cur+=vel*dt`
- **Ghost:** clone skeleton, bukan cuma mesh, jadi pose akurat
- **Slash:** Canvas radial gradient + shadowBlur glow, additive

## 📱 Tested

- Android Chrome 120+ (Samsung A52, Xiaomi) → warna normal, 45-60fps
- Desktop Chrome → 60fps, dash trail & slash smooth

---

Made with ❤️ — fokus animasi detail kayak Genshin Aether: jalan elegan, dash berbayang, lompat ringan, tebasan 4-kombo.
