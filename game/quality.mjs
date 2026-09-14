/* ============================================================
   QUALITY — satu sumber kebenaran untuk kualitas grafis & performa.

   Prinsip desain:
   1. PRESET dulu, CUSTOM kemudian. Pemain memilih Rendah/Sedang/
      Tinggi/Ultra; preset mengisi semua opsi. Begitu satu opsi
      diubah manual, preset otomatis jadi 'custom' (tidak ada
      state "preset setengah jadi" yang membingungkan).
   2. Modul ini PURE: tidak menyentuh DOM, three.js, atau
      localStorage. Semua fungsi bisa diuji headless di Node
      (lihat tests/quality.test.mjs) — jadi angka kualitas tidak
      pernah diam-diam bergeser.
   3. Semua opsi punya tingkat, dan yang berat bisa MATI total
      (nilai 0). "Off" harus benar-benar off: tidak ada sisa draw
      call atau pass yang tetap jalan.

   Penamaan tingkat: 0 = Mati, 1 = Rendah, 2 = Sedang, 3 = Tinggi.
============================================================ */

/* ---- preset berkualitas: kunci kualitas internal ----
   'balanced' dipakai sebagai nama internal "Sedang/Medium" supaya
   pengaturan lama (orb-hunt.settings versi sebelumnya) tetap kebaca. */
export const PRESET_IDS = ['low', 'balanced', 'high', 'ultra'];

export const PRESET_LABEL = {
  low: 'Rendah',
  balanced: 'Sedang',
  high: 'Tinggi',
  ultra: 'Ultra',
  custom: 'Custom',
};

/* FPS yang bisa dipilih pemain. 60 = default; 24 untuk perangkat
   sangat lemah supaya simulasi tetap jalan mulus (bukan patah-patah). */
export const FPS_CHOICES = [24, 30, 45, 60];

export const LEVEL_LABEL = ['Mati', 'Rendah', 'Sedang', 'Tinggi'];
export const TEXTURE_LEVEL_LABEL = ['Rendah', 'Sedang', 'Tinggi'];

/* ---- definisi opsi custom (dipakai UI untuk merender baris setting) ----
   max: tingkat tertinggi. `off` berarti tingkat 0 mematikan fitur. */
export const GFX_OPTIONS = [
  { key: 'shadows',    label: 'Bayangan',          max: 3, off: true,  hint: 'Peta bayangan matahari' },
  { key: 'grass',      label: 'Rumput',            max: 3, off: true,  hint: 'Jumlah bilah rumput di sekitar pemain' },
  { key: 'particles',  label: 'Partikel & satwa',  max: 3, off: true,  hint: 'Debu, kupu-kupu, burung' },
  { key: 'water',      label: 'Air',               max: 3, off: true,  hint: 'Detail gelombang permukaan air' },
  { key: 'view',       label: 'Jarak pandang',     max: 3, off: false, hint: 'Kabut, cakrawala, dan jarak streaming dunia' },
  { key: 'detail',     label: 'Kedetailan dunia',  max: 3, off: false, hint: 'Kerapatan pohon, batu, dan properti jalan' },
  { key: 'texture',    label: 'Detail tekstur',    max: 2, off: false, hint: 'Resolusi & anisotropi tekstur prosedural' },
  { key: 'bloom',      label: 'Bloom',             max: 3, off: true,  hint: 'Pendar cahaya pada orb, lampu, dan knalpot' },
  { key: 'motionBlur', label: 'Motion blur',       max: 3, off: true,  hint: 'Blur kecepatan ala Forza Horizon' },
  { key: 'volumetric', label: 'Volumetrik',        max: 3, off: true,  hint: 'Berkas cahaya matahari (god rays)' },
];

/* ---- isi tiap preset ----
   Angka ini hasil penalaran biaya: bayangan & post-processing adalah
   beban GPU terbesar, jadi preset Rendah mematikannya total. */
export const PRESETS = {
  low: {
    fps: 30,
    gfx: { renderScale: 0.70, shadows: 0, grass: 0, particles: 0, water: 1, view: 1, detail: 0, texture: 0, bloom: 0, motionBlur: 0, volumetric: 0, adaptive: true },
  },
  balanced: {
    fps: 45,
    gfx: { renderScale: 0.85, shadows: 1, grass: 1, particles: 1, water: 2, view: 2, detail: 1, texture: 1, bloom: 1, motionBlur: 0, volumetric: 0, adaptive: true },
  },
  high: {
    fps: 60,
    gfx: { renderScale: 1.00, shadows: 2, grass: 2, particles: 2, water: 3, view: 3, detail: 2, texture: 2, bloom: 2, motionBlur: 1, volumetric: 1, adaptive: true },
  },
  ultra: {
    fps: 60,
    gfx: { renderScale: 1.25, shadows: 3, grass: 3, particles: 3, water: 3, view: 3, detail: 3, texture: 2, bloom: 3, motionBlur: 2, volumetric: 2, adaptive: false },
  },
};

/* ---- bentuk analog & tema tombol (bagian UI, disimpan bareng setting) ---- */
export const STICK_SHAPES = ['circle', 'square'];       // square = kotak bersudut halus
export const BUTTON_THEMES = ['mono', 'color'];          // mono = hitam-putih (default)
export const CAR_CAMERA_MODES = ['near', 'far', 'cine'];
export const CAR_CAMERA_LABEL = { near: 'Dekat', far: 'Jauh', cine: 'Sinematik' };

const clampInt = (v, a, b) => (Number.isFinite(v) ? Math.max(a, Math.min(b, Math.round(v))) : a);
const clampNum = (v, a, b, d) => (Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
/* Tingkat yang hilang/rusak harus jatuh ke DEFAULT PRESET, bukan ke 0.
   Tanpa ini, settings lama yang belum punya field baru akan mematikan
   semua fitur secara diam-diam. */
const level = (v, max, d) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : d);

/* Bentuk default = preset 'balanced'. Dibekukan supaya tidak bisa
   termutasi dari luar (readSettings selalu mengembalikan salinan). */
export const DEFAULT_SETTINGS = Object.freeze({
  sensitivity: 1,
  cameraDistance: 5,
  quality: 'balanced',
  shadows: true,
  sound: true,
  /* --- baru: performa & grafis --- */
  fps: 60,
  custom: false,
  showFps: false,
  gfx: Object.freeze({ ...PRESETS.balanced.gfx }),
  /* --- baru: UI sentuh --- */
  stickShape: 'circle',
  buttonTheme: 'mono',
  buttonScale: 1,
  layout: Object.freeze({}),
  /* --- baru: kamera mobil --- */
  carCamera: 'near',
});

function cloneGfx(gfx) {
  const base = PRESETS.balanced.gfx;
  const src = (gfx && typeof gfx === 'object') ? gfx : {};
  return {
    renderScale: clampNum(src.renderScale, 0.5, 1.5, base.renderScale),
    shadows: level(src.shadows, 3, base.shadows),
    grass: level(src.grass, 3, base.grass),
    particles: level(src.particles, 3, base.particles),
    water: level(src.water, 3, base.water),
    view: level(src.view, 3, base.view),
    detail: level(src.detail, 3, base.detail),
    texture: level(src.texture, 2, base.texture),
    bloom: level(src.bloom, 3, base.bloom),
    motionBlur: level(src.motionBlur, 3, base.motionBlur),
    volumetric: level(src.volumetric, 3, base.volumetric),
    adaptive: typeof src.adaptive === 'boolean' ? src.adaptive : base.adaptive,
  };
}

/* Layout tombol: {id:{x,y}} dalam fraksi 0..1 terhadap viewport.
   Disimpan sebagai fraksi (bukan piksel) supaya tetap pas setelah
   ponsel diputar atau ukuran layar berubah. */
function cloneLayout(layout) {
  const out = {};
  if (layout && typeof layout === 'object') {
    for (const [id, p] of Object.entries(layout)) {
      if (!p || typeof p !== 'object') continue;
      const x = Number(p.x), y = Number(p.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      out[id] = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    }
  }
  return out;
}

/* ---------- baca dari storage (toleran terhadap data rusak/lama) ---------- */
export function readSettings(storage) {
  let s = {};
  try {
    s = JSON.parse(storage.getItem('orb-hunt.settings') || '{}') || {};
    if (typeof s !== 'object') s = {};
  } catch {
    return cloneSettings(DEFAULT_SETTINGS);
  }
  const gfx = cloneGfx(s.gfx);
  const quality = pick(s.quality, [...PRESET_IDS, 'custom'], 'balanced');
  return {
    sensitivity: clampNum(s.sensitivity, 0.4, 2, 1),
    cameraDistance: clampNum(s.cameraDistance, 3, 8, 5),
    quality,
    shadows: typeof s.shadows === 'boolean' ? s.shadows : true,
    sound: typeof s.sound === 'boolean' ? s.sound : true,
    fps: pick(Number.isFinite(s.fps) ? clampInt(s.fps, 24, 60) : NaN, FPS_CHOICES, 60),
    custom: typeof s.custom === 'boolean' ? s.custom : quality === 'custom',
    showFps: typeof s.showFps === 'boolean' ? s.showFps : false,
    gfx,
    stickShape: pick(s.stickShape, STICK_SHAPES, 'circle'),
    buttonTheme: pick(s.buttonTheme, BUTTON_THEMES, 'mono'),
    buttonScale: clampNum(s.buttonScale, 0.75, 1.4, 1),
    layout: cloneLayout(s.layout),
    carCamera: pick(s.carCamera, CAR_CAMERA_MODES, 'near'),
  };
}

export function cloneSettings(s) {
  return { ...s, gfx: { ...s.gfx }, layout: cloneLayout(s.layout) };
}

export function saveSettings(storage, settings) {
  try { storage.setItem('orb-hunt.settings', JSON.stringify(settings)); } catch { /* private mode */ }
  return settings;
}

/* ---------- preset ---------- */
export function applyPreset(settings, id) {
  const p = PRESETS[id];
  if (!p) return settings;
  return {
    ...settings,
    quality: id,
    custom: false,
    fps: p.fps,
    gfx: { ...p.gfx },
    /* preset ikut menyetel saklar bayangan lama supaya konsisten */
    shadows: p.gfx.shadows > 0,
  };
}

/* Mengubah satu opsi custom: preset langsung turun jadi 'custom'. */
export function setGfx(settings, key, value) {
  const opt = GFX_OPTIONS.find(o => o.key === key);
  const gfx = { ...settings.gfx };
  if (opt) {
    gfx[key] = clampInt(value, 0, opt.max);
  } else if (key === 'renderScale') {
    gfx.renderScale = clampNum(value, 0.5, 1.5, gfx.renderScale);
  } else if (key === 'adaptive') {
    gfx.adaptive = !!value;
  } else {
    return settings;
  }
  return { ...settings, gfx, quality: 'custom', custom: true };
}

/* Apakah isi gfx persis sama dengan sebuah preset? Dipakai UI untuk
   menampilkan "Custom" hanya saat benar-benar berbeda. */
export function detectPreset(gfx) {
  for (const id of PRESET_IDS) {
    const p = PRESETS[id].gfx;
    if (Object.keys(p).every(k => p[k] === gfx[k])) return id;
  }
  return 'custom';
}

/* ============================================================
   RESOLVE — terjemahkan tingkat ke angka konkret untuk engine.
   isTouch menurunkan plafon karena GPU ponsel jauh lebih sempit.
============================================================ */
const RAMP4 = [0, 0.25, 0.55, 1];        // faktor jumlah untuk opsi berbasis populasi
const RAMP_VIEW = [0.45, 0.7, 1, 1.35];  // faktor jarak pandang

export function resolveGfx(settings, isTouch = false) {
  const g = settings.gfx || PRESETS.balanced.gfx;
  const dprCap = isTouch ? 2 : 2.5;

  const grassBase = isTouch ? 9000 : 28000;
  const dustBase = isTouch ? 90 : 190;
  const bflyBase = isTouch ? 26 : 55;
  const birdBase = isTouch ? 18 : 34;

  const shadowSize = [0, 1024, 1536, 2048][g.shadows] || 0;
  const viewF = RAMP_VIEW[g.view] ?? 1;

  return {
    /* --- resolusi ---
       Catatan: angka pixelRatio final TIDAK dihitung di sini. Yang
       menentukan adalah currentPixelRatio() di index.html karena hanya
       di sana devicePixelRatio perangkat dan adaptiveResolution dikenal.
       Menyediakan pixelRatio di sini akan membuat dua sumber kebenaran
       untuk satu hal — dan yang satu pasti terlupa diperbarui. */
    dprCap,
    renderScale: g.renderScale || 1,
    adaptive: !!g.adaptive,

    /* --- bayangan --- */
    shadowsEnabled: shadowSize > 0 && settings.shadows !== false,
    shadowMapSize: shadowSize || 512,
    /* bayangan diperbarui tiap N frame: hemat besar, nyaris tak terlihat */
    shadowRefreshFrames: g.shadows >= 3 ? 1 : g.shadows === 2 ? 1 : 2,

    /* --- vegetasi & partikel --- */
    grassCount: Math.round(grassBase * (RAMP4[g.grass] ?? 0)),
    grassEnabled: g.grass > 0,
    dustCount: Math.round(dustBase * (RAMP4[g.particles] ?? 0)),
    butterflyCount: Math.round(bflyBase * (RAMP4[g.particles] ?? 0)),
    birdCount: Math.round(birdBase * (RAMP4[g.particles] ?? 0)),
    particlesEnabled: g.particles > 0,

    /* --- air --- */
    waterSegments: [24, 44, 68, 96][g.water] ?? 68,
    waterWaves: g.water >= 2,
    waterOpacity: g.water === 0 ? 0.55 : 0.86,

    /* --- jarak pandang / streaming dunia --- */
    fogNear: Math.round((isTouch ? 260 : 450) * viewF),
    fogFar: Math.round((isTouch ? 700 : 950) * viewF),
    orbCullDistance: Math.round(650 * viewF),
    streamRadius: Math.max(2, Math.min(5, (isTouch ? 3 : 4) + (g.view >= 3 ? 1 : g.view === 0 ? -1 : 0))),

    /* --- kedetailan dunia --- */
    terrainSegmentsNear: [28, 44, 64, 84][g.detail] ?? 64,
    propsNear: [10, 24, 40, 56][g.detail] ?? 40,
    propsFar: [3, 5, 8, 12][g.detail] ?? 8,
    roadProps: g.detail >= 1,          // tiang lampu, rambu, tonggak penanda jalan
    roadPropSpacing: g.detail >= 3 ? 90 : g.detail === 2 ? 130 : 190,

    /* --- tekstur --- */
    textureSize: [128, 256, 512][g.texture] ?? 256,
    anisotropy: [1, 4, 8][g.texture] ?? 4,

    /* --- post-processing --- */
    bloomLevel: g.bloom,
    motionBlurLevel: g.motionBlur,
    volumetricLevel: g.volumetric,
    postEnabled: g.bloom > 0 || g.motionBlur > 0 || g.volumetric > 0,
  };
}

/* Interval frame dalam ms untuk FPS cap. 0 = tanpa batas. */
export function frameInterval(fps) {
  return FPS_CHOICES.includes(fps) && fps > 0 ? 1000 / fps : 0;
}

/* ---------- adaptive resolution ----------
   Naik-turunkan skala render mengikuti waktu frame terukur. Histeresis
   lebar (turun cepat, naik pelan) supaya tidak berosilasi. */
export function createAdaptiveResolution({ min = 0.55, max = 1, start = 1 } = {}) {
  let scale = start;
  let badFrames = 0;
  let goodFrames = 0;
  return {
    get scale() { return scale; },
    reset(next = start) { scale = next; badFrames = 0; goodFrames = 0; },
    /* targetMs = budget frame (mis. 1000/45). Mengembalikan skala baru. */
    update(frameMs, targetMs) {
      if (!(targetMs > 0) || !Number.isFinite(frameMs)) return scale;
      if (frameMs > targetMs * 1.22) { badFrames++; goodFrames = 0; }
      else if (frameMs < targetMs * 0.82) { goodFrames++; badFrames = 0; }
      else { badFrames = 0; goodFrames = 0; }
      if (badFrames >= 20) { scale = Math.max(min, scale - 0.1); badFrames = 0; }
      else if (goodFrames >= 150) { scale = Math.min(max, scale + 0.05); goodFrames = 0; }
      return scale;
    },
  };
}
