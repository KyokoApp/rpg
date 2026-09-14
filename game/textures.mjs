/* ============================================================
   TEXTURES — tekstur prosedural via <canvas>.

   Kenapa prosedural, bukan file PNG?
   - PWA ini harus tetap kecil & offline. Satu atlas PNG 512² untuk 6
     material bisa 300-800 KB; tekstur canvas ini dibuat dalam
     ~10-20 ms total dan 0 byte di jaringan.
   - Ukurannya bisa DITURUNKAN oleh setting kualitas (128/256/512)
     tanpa perlu menyiapkan beberapa varian file.
   - Deterministik (RNG ber-seed), jadi tampilannya sama di semua
     perangkat dan bisa diuji.

   Modul ini TIDAK menyentuh DOM saat di-import — semua kerja canvas
   ada di dalam fungsi, jadi aman diuji headless.
============================================================ */
import * as THREE from 'three';

/* RNG deterministik (mulberry32) — hasil identik tiap kali dijalankan */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Noise bernilai (value noise) di kanvas kecil lalu diperbesar.
   Jauh lebih murah daripada menulis 512x512 piksel per tekstur. */
function noiseCanvas(size, seed, octaves = 3) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const r = rng(seed);
  /* lapisan kasar -> halus, digambar bertumpuk dengan opacity menurun */
  let cell = Math.max(2, size >> 3);
  for (let o = 0; o < octaves; o++) {
    const alpha = 1 / (o + 1);
    x.globalAlpha = alpha;
    for (let py = 0; py < size; py += cell) {
      for (let px = 0; px < size; px += cell) {
        const v = 90 + r() * 130;
        x.fillStyle = 'rgb(' + (v | 0) + ',' + (v | 0) + ',' + (v | 0) + ')';
        x.fillRect(px, py, cell, cell);
      }
    }
    cell = Math.max(1, cell >> 1);
  }
  x.globalAlpha = 1;
  return c;
}

function baseCanvas(size, fill) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = fill;
  x.fillRect(0, 0, size, size);
  return c;
}

/* overlay noise pakai mode blend supaya murah (satu drawImage) */
function overlayNoise(ctx, size, seed, alpha = 0.30, mode = 'overlay') {
  const prev = ctx.globalAlpha, prevMode = ctx.globalCompositeOperation;
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = mode;
  ctx.drawImage(noiseCanvas(size, seed), 0, 0, size, size);
  ctx.globalAlpha = prev;
  ctx.globalCompositeOperation = prevMode;
}

/* ---------- generator per material ---------- */

/* Batu bata / masonry — untuk pilar, plinth, dan menara */
function genStone(size, seed) {
  const c = baseCanvas(size, '#6d6a63');
  const x = c.getContext('2d');
  const r = rng(seed);
  const rows = 6, cols = 3;
  const bh = size / rows, bw = size / cols;
  x.lineWidth = Math.max(1, size / 128);
  for (let ry = 0; ry < rows; ry++) {
    /* susunan selang-seling supaya tidak terlihat seperti grid */
    const off = (ry % 2) ? bw * 0.5 : 0;
    for (let cx = -1; cx <= cols; cx++) {
      const px = cx * bw + off, py = ry * bh;
      const v = 96 + r() * 34;
      x.fillStyle = 'rgb(' + (v | 0) + ',' + ((v * 0.98) | 0) + ',' + ((v * 0.92) | 0) + ')';
      x.fillRect(px + x.lineWidth, py + x.lineWidth, bw - x.lineWidth * 2, bh - x.lineWidth * 2);
    }
    /* nat (mortar) */
    x.strokeStyle = 'rgba(40,38,34,0.55)';
    x.beginPath(); x.moveTo(0, ry * bh); x.lineTo(size, ry * bh); x.stroke();
    for (let cx = 0; cx <= cols; cx++) {
      const px = cx * bw + off;
      x.beginPath(); x.moveTo(px, ry * bh); x.lineTo(px, (ry + 1) * bh); x.stroke();
    }
  }
  overlayNoise(x, size, seed + 11, 0.34);
  return c;
}

/* Logam bergaris halus — untuk TIANG (lampu, rambu, tonggak) */
function genMetal(size, seed) {
  const c = baseCanvas(size, '#4a4e55');
  const x = c.getContext('2d');
  const r = rng(seed);
  /* guratan vertikal khas logam tarik (brushed) */
  for (let i = 0; i < size * 2; i++) {
    const px = r() * size;
    const v = 62 + r() * 66;
    x.strokeStyle = 'rgba(' + (v | 0) + ',' + ((v * 1.02) | 0) + ',' + ((v * 1.08) | 0) + ',0.28)';
    x.lineWidth = r() < 0.15 ? 2 : 1;
    x.beginPath(); x.moveTo(px, 0); x.lineTo(px + (r() - 0.5) * 3, size); x.stroke();
  }
  /* sambungan / pita penguat tiap 1/4 tinggi */
  for (let i = 1; i < 4; i++) {
    const py = (size / 4) * i;
    x.fillStyle = 'rgba(28,30,34,0.55)';
    x.fillRect(0, py - Math.max(1, size / 96), size, Math.max(2, size / 48));
    x.fillStyle = 'rgba(180,186,196,0.16)';
    x.fillRect(0, py + Math.max(1, size / 96), size, Math.max(1, size / 128));
  }
  overlayNoise(x, size, seed + 23, 0.16, 'soft-light');
  return c;
}

/* Kayu berurat — untuk papan rambu, tonggak kayu, gagang */
function genWood(size, seed) {
  const c = baseCanvas(size, '#6b4a2c');
  const x = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < 90; i++) {
    const y = r() * size;
    const v = r();
    x.strokeStyle = v > 0.5 ? 'rgba(120,84,50,0.35)' : 'rgba(58,38,22,0.4)';
    x.lineWidth = 0.6 + r() * 2.4;
    x.beginPath();
    x.moveTo(0, y);
    /* urat kayu bergelombang, bukan garis lurus */
    for (let px = 0; px <= size; px += size / 8) {
      x.lineTo(px, y + Math.sin((px / size) * 6.2 + i) * (2 + r() * 3));
    }
    x.stroke();
  }
  /* papan: garis gelap tiap 1/3 */
  for (let i = 1; i < 3; i++) {
    x.fillStyle = 'rgba(30,18,10,0.5)';
    x.fillRect(0, (size / 3) * i, size, Math.max(2, size / 64));
  }
  overlayNoise(x, size, seed + 37, 0.26);
  return c;
}

/* Kulit kayu — untuk batang pohon */
function genBark(size, seed) {
  const c = baseCanvas(size, '#4b3a2a');
  const x = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < 46; i++) {
    const px = r() * size;
    const w = 2 + r() * (size / 26);
    const g = x.createLinearGradient(px, 0, px + w, 0);
    g.addColorStop(0, 'rgba(30,22,15,0.0)');
    g.addColorStop(0.5, r() > 0.5 ? 'rgba(28,20,13,0.55)' : 'rgba(96,74,52,0.5)');
    g.addColorStop(1, 'rgba(30,22,15,0.0)');
    x.fillStyle = g;
    x.fillRect(px, 0, w, size);
  }
  overlayNoise(x, size, seed + 51, 0.30);
  return c;
}

/* Batu alam berbintik — untuk batu karang & singkapan */
function genRock(size, seed) {
  const c = baseCanvas(size, '#5c5a56');
  const x = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < 240; i++) {
    const px = r() * size, py = r() * size, rad = 1 + r() * (size / 28);
    const v = 66 + r() * 76;
    x.fillStyle = 'rgba(' + (v | 0) + ',' + ((v * 0.98) | 0) + ',' + ((v * 0.93) | 0) + ',0.45)';
    x.beginPath(); x.arc(px, py, rad, 0, 6.2832); x.fill();
  }
  overlayNoise(x, size, seed + 71, 0.36);
  return c;
}

/* Genteng — untuk atap gerbang & menara */
function genRoof(size, seed) {
  const c = baseCanvas(size, '#3f3226');
  const x = c.getContext('2d');
  const r = rng(seed);
  const rows = 8;
  const rh = size / rows, rw = size / 8;
  for (let ry = 0; ry < rows; ry++) {
    const off = (ry % 2) ? rw * 0.5 : 0;
    for (let cx = -1; cx <= 8; cx++) {
      const px = cx * rw + off, py = ry * rh;
      const v = 56 + r() * 34;
      const g = x.createLinearGradient(px, py, px, py + rh);
      g.addColorStop(0, 'rgba(' + ((v * 1.35) | 0) + ',' + ((v * 1.05) | 0) + ',' + ((v * 0.78) | 0) + ',1)');
      g.addColorStop(1, 'rgba(' + ((v * 0.62) | 0) + ',' + ((v * 0.5) | 0) + ',' + ((v * 0.4) | 0) + ',1)');
      x.fillStyle = g;
      x.beginPath();
      /* bentuk genteng: persegi panjang dengan ujung membulat */
      const rr = Math.min(rw, rh) * 0.42;
      x.moveTo(px + 1, py + rh);
      x.lineTo(px + 1, py + rr);
      x.quadraticCurveTo(px + rw * 0.5, py - rr * 0.35, px + rw - 1, py + rr);
      x.lineTo(px + rw - 1, py + rh);
      x.closePath();
      x.fill();
    }
  }
  overlayNoise(x, size, seed + 91, 0.22, 'soft-light');
  return c;
}

/* Kristal — untuk pilar teleport */
function genCrystal(size, seed) {
  const c = baseCanvas(size, '#2c3a44');
  const x = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < 40; i++) {
    const px = r() * size, py = r() * size;
    const w = 2 + r() * (size / 20), h = 6 + r() * (size / 6);
    const a = (r() - 0.5) * 0.8;
    x.save();
    x.translate(px, py); x.rotate(a);
    const g = x.createLinearGradient(-w, 0, w, 0);
    g.addColorStop(0, 'rgba(120,220,235,0.05)');
    g.addColorStop(0.5, 'rgba(190,245,255,0.40)');
    g.addColorStop(1, 'rgba(120,220,235,0.05)');
    x.fillStyle = g;
    x.fillRect(-w / 2, -h / 2, w, h);
    x.restore();
  }
  overlayNoise(x, size, seed + 103, 0.18, 'soft-light');
  return c;
}

const GENERATORS = {
  stone: genStone,
  metal: genMetal,
  wood: genWood,
  bark: genBark,
  rock: genRock,
  roof: genRoof,
  crystal: genCrystal,
};

export const TEXTURE_KEYS = Object.keys(GENERATORS);

/* ---------- API utama ---------- */
export function makeTextureSet({
  size = 256,
  anisotropy = 4,
  keys = TEXTURE_KEYS,
  seed = 1337,
  srgb = true,
} = {}) {
  const s = Math.max(32, Math.min(1024, size | 0 || 256));
  const out = { size: s, anisotropy, dispose };
  const textures = [];

  for (const key of keys) {
    const gen = GENERATORS[key];
    if (!gen) continue;
    const canvas = gen(s, seed + key.length * 977);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    /* filter: linear untuk hasil halus; mipmap MATI karena tekstur
       ini dipakai di permukaan dekat dan mipmap menambah VRAM 33%
       tanpa manfaat yang terlihat di ukuran ini */
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.max(1, anisotropy | 0 || 1);
    tex.needsUpdate = true;
    out[key] = tex;
    textures.push(tex);
  }

  function dispose() {
    for (const t of textures) t.dispose();
    textures.length = 0;
  }
  return out;
}
