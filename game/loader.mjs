/* ============================================================
   LOADER — layar pemuatan bergaya Genshin.

   Kenapa perlu modul sendiri? Karena aturan mainnya gampang salah:
   pemain harus melihat 100% BARU game ditampilkan. Kalau progres
   dihitung asal (mis. jumlah file dibagi total), angka bisa melompat
   ke 100% sementara shader belum dikompilasi — persis keluhan
   "nampil sebelum selesai".

   Solusinya: tahap (stage) dideklarasikan di depan dengan BOBOT.
   Progres = bobot tahap selesai + bobot tahap aktif x fraksi.
   Angka dikunci di 99% sampai done() dipanggil, jadi tidak mungkin
   menampilkan 100% palsu.

   Markup-nya statis di index.html sehingga sudah terlukis sebelum
   module deferred dijalankan. Modul ini hanya menggerakkannya.
============================================================ */

const TIPS = [
  'Tekan <b>B</b> untuk memanggil mobil dari mana saja.',
  'Gunakan <b>NOS</b> di jalan lurus panjang, bukan di tikungan.',
  'Tombol kamera <b>C</b> punya 3 mode: dekat, jauh, dan sinematik.',
  'Kualitas grafis bisa diubah kapan saja lewat <b>Pengaturan</b>.',
  'Pilih preset <b>Rendah</b> kalau frame rate terasa berat.',
  'Tombol sentuh bisa digeser: buka Pengaturan &rarr; Susun tombol.',
  'Lepas gas di kecepatan tinggi untuk mendengar letupan knalpot.',
  'Orb tersebar di seluruh peta — cek <b>Atlas</b> untuk petunjuk arah.',
];

function $(id) { return typeof document === 'undefined' ? null : document.getElementById(id); }

export function createLoader({
  stages = [],
  rootId = 'loadScreen', barId = 'loadBar', pctId = 'loadPct',
  stepId = 'loadStep', tipId = 'loadTip', errId = 'loadErr',
  onDone = null, tipEvery = 2600,
} = {}) {
  const root = $(rootId), bar = $(barId), pct = $(pctId);
  const stepEl = $(stepId), tipEl = $(tipId), errEl = $(errId);

  const total = stages.reduce((s, x) => s + (x.w > 0 ? x.w : 0), 0) || 1;
  /* offset kumulatif tiap tahap */
  const cum = [];
  { let acc = 0; for (const s of stages) { cum.push(acc); acc += Math.max(0, s.w || 0); } }

  let idx = -1;
  let shown = 0;          // nilai yang sudah ditampilkan (tidak pernah turun)
  let finished = false;
  let tipTimer = null;

  function target(frac) {
    if (idx < 0) return 0;
    const w = Math.max(0, stages[idx].w || 0);
    const f = Math.max(0, Math.min(1, frac || 0));
    return ((cum[idx] + w * f) / total) * 100;
  }

  function paint(v) {
    /* progres hanya boleh naik; penurunan terlihat seperti hang */
    if (v < shown) v = shown;
    /* dikunci 99% sampai benar-benar selesai */
    const disp = finished ? 100 : Math.min(99, v);
    shown = disp;
    if (bar) bar.style.width = disp.toFixed(1) + '%';
    if (pct) pct.textContent = Math.floor(disp) + '%';
  }

  function setTip() {
    if (!tipEl) return;
    tipEl.innerHTML = TIPS[(Math.random() * TIPS.length) | 0];
  }

  function stage(key, label) {
    const i = stages.findIndex(s => s.k === key);
    if (i < 0) return;
    /* lewati tahap yang terlewat supaya bobotnya tidak hilang */
    idx = i;
    if (stepEl) stepEl.textContent = label || stages[i].label || key;
    paint(0);
  }

  function progress(frac) { paint(target(frac)); }

  function note(text) { if (stepEl && text) stepEl.textContent = text; }

  function start() {
    if (root) { root.classList.remove('hidden', 'gone'); }
    setTip();
    if (tipTimer) clearInterval(tipTimer);
    tipTimer = setInterval(setTip, tipEvery);
    stage(stages.length ? stages[0].k : '', stages.length ? stages[0].label : '');
    return api;
  }

  function done() {
    if (finished) return;
    finished = true;
    paint(100);
    if (tipTimer) { clearInterval(tipTimer); tipTimer = null; }
    /* tahan sebentar di 100% supaya pemain benar-benar melihatnya,
       lalu pudar. Kalau langsung disembunyikan, 100% cuma kedipan. */
    setTimeout(() => {
      if (root) {
        root.classList.add('gone');
        /* tunggu transisi selesai sebelum display:none */
        setTimeout(() => { root.classList.add('hidden'); }, 620);
      }
      if (onDone) { try { onDone(); } catch (err) { /* jangan gagalkan boot */ } }
    }, 260);
  }

  function fail(message) {
    if (errEl) { errEl.textContent = message || 'Gagal memuat. Periksa koneksi lalu muat ulang.'; errEl.classList.add('on'); }
    if (tipTimer) { clearInterval(tipTimer); tipTimer = null; }
  }

  const api = { start, stage, progress, note, done, fail, get percent() { return shown; } };
  return api;
}

/* helper kecil: tunggu satu frame. Dipakai untuk membiarkan browser
   melukis layar loading sebelum kita mulai kerja berat — tanpa ini,
   layar loading baru terlihat SETELAH semua kerja selesai. */
export function nextFrame() {
  return new Promise(res => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => res());
    else setTimeout(res, 0);
  });
}

/* Jalankan tugas berat sambil memberi kesempatan browser melukis.
   `work` boleh async. Ini yang membuat bar benar-benar bergerak,
   bukan melompat dari 0 ke 100. */
export async function staged(loader, key, label, work) {
  loader.stage(key, label);
  await nextFrame();
  const result = await work(frac => loader.progress(frac));
  loader.progress(1);
  return result;
}
