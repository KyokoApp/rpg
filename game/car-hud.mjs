/* ============================================================
   CAR HUD — markup + takometer SVG + tombol layar.
   Mengikuti pola game/hud.mjs: DOM dibangun di sini supaya
   index.html cuma berisi wiring permainan.

   Perubahan besar:
   - holdBtn() sekarang pakai POINTER CAPTURE + fallback window.
     Tanpa capture, jempol yang bergeser 2px keluar tombol memicu
     `pointerleave` dan tombol "lepas sendiri" — salah satu sebab
     NOS terasa tidak merespons.
   - Ada tombol KAMERA (3 mode: dekat / jauh / sinematik).
   - Tema tombol monokrom (hitam-putih) dan tata letak tombol bisa
     digeser pemain (lihat setEditMode / applyLayout).
============================================================ */

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

/* Id elemen yang boleh digeser pemain + posisi default (fraksi viewport).
   Default ini SENGAJA sama dengan nilai di car.css supaya sebelum
   pemain menggeser apa pun, tampilannya tidak berubah sama sekali. */
export const DRAGGABLE = {
  steerL:  { x: 0.030, y: 0.62 },
  steerR:  { x: 0.185, y: 0.62 },
  gasBtn:  { x: 0.885, y: 0.72 },
  brakeBtn:{ x: 0.700, y: 0.80 },
  handBtn: { x: 0.885, y: 0.30 },
  nosBtn:  { x: 0.745, y: 0.30 },
  camBtn:  { x: 0.600, y: 0.18 },
};

export const CAM_LABEL = { near: 'DEKAT', far: 'JAUH', cine: 'SINEMATIK' };

/* ---------- markup ---------- */
const MARKUP = `
<div id="carHUD">
  <div id="carLeft">
    <div class="carStat"><div class="k">Kecepatan</div><div class="v" id="csSpeed">0 km/j</div></div>
    <div class="carStat"><div class="k">RPM × 1000</div><div class="v" id="csRpm">0.9</div></div>
    <div class="carStat"><div class="k">Nitro <span id="nosPct">100%</span></div><div id="nosWrap"><div id="nosFill"></div></div></div>
  </div>
  <div id="gaugeWrap"><svg id="gauge" viewBox="0 0 240 240" role="img" aria-label="Speedometer dan takometer"></svg></div>
  <div id="carCtrls">
    <div class="cBtn" id="steerL">&#9664;<small>KIRI</small></div>
    <div class="cBtn" id="steerR">&#9654;<small>KANAN</small></div>
    <div class="cBtn" id="gasBtn">GAS<small>W</small></div>
    <div class="cBtn" id="brakeBtn">REM<small>S</small></div>
    <div class="cBtn" id="handBtn">HAND<small>SPASI</small></div>
    <div class="cBtn" id="nosBtn">NOS<small>SHIFT</small></div>
    <div class="cBtn cTap" id="camBtn">&#127909;<small id="camLbl">DEKAT</small></div>
  </div>
  <button id="exitCar" type="button">&#9211; KELUAR &nbsp;<b>E</b></button>
  <div id="carHint">
    <b>W/S</b> gas &amp; rem · <b>A/D</b> belok<br>
    <b>SPASI</b> rem tangan · <b>SHIFT</b> nitro · <b>C</b> kamera<br>
    <b>E</b> keluar · <b>B</b> summon · <b>R</b> balikkan · <b>M</b> bisu
  </div>
</div>
<div id="carPrompt"></div>
<div id="speedoFlash"></div>
<div id="nosToast">NOS KOSONG</div>`;

/* ---------- gauge SVG ---------- */
const A0 = -126, SWEEP = 252;

function polar(cx, cy, r, deg){
  const a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcPath(cx, cy, r, a0, a1){
  const p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0, sweep = a1 > a0 ? 1 : 0;
  return `M ${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`;
}

/* Skala kecepatan diturunkan dari CAR_CFG.maxSpeed, jadi gauge selalu pas
   tanpa perlu diedit waktu mobil di-retune (mis. dunia diperbesar). */
export function gaugeMax(kmh){
  return Math.max(40, Math.ceil(kmh / 40) * 40);
}

function buildGauge(svg, cfg){
  const el = (tag, attrs) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    svg.appendChild(n);
    return n;
  };
  const kmax = gaugeMax(cfg.maxSpeed * 3.6);
  const major = kmax > 200 ? 40 : 20, minor = major / 2;

  el('circle', { cx:120, cy:120, r:112, class:'g-face' });
  el('path',   { d:arcPath(120,120,100,A0,A0+SWEEP), class:'g-tachoBg' });
  const redFrac = (cfg.redline - cfg.idleRpm) / (cfg.revLimit - cfg.idleRpm);
  el('path',   { d:arcPath(120,120,100,A0+SWEEP*redFrac,A0+SWEEP), class:'g-red' });

  const tacho = el('path', { d:arcPath(120,120,100,A0,A0+SWEEP), class:'g-tacho' });
  const tachoLen = tacho.getTotalLength();
  tacho.setAttribute('stroke-dasharray', tachoLen.toFixed(2));
  tacho.setAttribute('stroke-dashoffset', tachoLen.toFixed(2));

  for (let k = 0; k <= kmax; k += major){
    const a = A0 + SWEEP * (k / kmax);
    const p1 = polar(120,120,86,a), p2 = polar(120,120,77,a);
    el('line', { x1:p1[0].toFixed(2), y1:p1[1].toFixed(2), x2:p2[0].toFixed(2), y2:p2[1].toFixed(2), class:'g-tickMaj' });
    const pt = polar(120,120,65,a);
    const tx = el('text', { x:pt[0].toFixed(2), y:(pt[1]+3.5).toFixed(2), class:'g-num' });
    tx.textContent = k;
  }
  for (let k = minor; k < kmax; k += major){
    const a = A0 + SWEEP * (k / kmax);
    const p1 = polar(120,120,86,a), p2 = polar(120,120,81,a);
    el('line', { x1:p1[0].toFixed(2), y1:p1[1].toFixed(2), x2:p2[0].toFixed(2), y2:p2[1].toFixed(2), class:'g-tick' });
  }

  const needle = el('line', { x1:120, y1:120, x2:120, y2:42, class:'g-needle' });
  el('circle', { cx:120, cy:120, r:9, class:'g-cap' });
  const kmh = el('text', { x:120, y:148, id:'gKmh' }); kmh.textContent = '0';
  const unit = el('text', { x:120, y:163, id:'gUnit' }); unit.textContent = 'KM/JAM';
  const gear = el('text', { x:120, y:198, id:'gGear' }); gear.textContent = 'N';
  const gearLbl = el('text', { x:120, y:210, id:'gGearLbl' }); gearLbl.textContent = 'GIGI';

  return { tacho, tachoLen, needle, kmh, gear, kmax };
}

/* ---------- API ---------- */
export function initCarHUD({ cfg, isTouch, onExit, onCarButton, onCameraMode }){
  const host = document.createElement('div');
  host.id = 'carHudHost';
  host.innerHTML = MARKUP;
  while (host.firstChild) document.body.appendChild(host.firstChild);

  const $ = id => document.getElementById(id);
  const carHUD = $('carHUD'), carCtrls = $('carCtrls'), carPrompt = $('carPrompt');
  const speedoFlash = $('speedoFlash'), carBtn = $('carBtn');
  const csSpeed = $('csSpeed'), csRpm = $('csRpm');
  const nosFill = $('nosFill'), nosWrap = $('nosWrap'), nosPct = $('nosPct');
  const camBtn = $('camBtn'), camLbl = $('camLbl'), nosToast = $('nosToast');
  const GA = buildGauge($('gauge'), cfg);

  /* state tombol layar — dibaca index.html untuk menyusun input mobil */
  const ctl = { gas:0, brake:0, left:0, right:0, hand:0, nos:0 };

  /* ---------- tombol tahan (hold) ----------
     Dua perbaikan penting:
     1. setPointerCapture(): selama jari masih menempel, SEMUA event
        pointer dikirim ke tombol ini. Jadi `pointerleave` tidak lagi
        mematikan tombol saat jempol bergeser sedikit.
     2. Listener `pointerup`/`pointercancel` di window sebagai jaring
        pengaman — kalau event lepas terjadi di luar elemen (mis. jari
        terangkat di atas kanvas), state tombol tetap dibersihkan.
        Tanpa ini, tombol bisa "nyangkut" menyala terus. */
  const activePointers = new Map();   // pointerId -> key
  function holdBtn(id, key){
    const e = $(id); if (!e) return;
    e.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      ctl[key] = 1;
      e.classList.add('hit');
      activePointers.set(ev.pointerId, key);
      /* capture boleh gagal (browser lama) — jaring window tetap jalan */
      try { e.setPointerCapture(ev.pointerId); } catch (err) { /* abaikan */ }
    });
    const release = ev => {
      if (!activePointers.has(ev.pointerId)) return;
      const k = activePointers.get(ev.pointerId);
      activePointers.delete(ev.pointerId);
      ctl[k] = 0;
      e.classList.remove('hit');
      try { e.releasePointerCapture(ev.pointerId); } catch (err) { /* abaikan */ }
    };
    e.addEventListener('pointerup', release);
    e.addEventListener('pointercancel', release);
    /* sengaja TIDAK memasang pointerleave: itulah bug-nya */
    e.addEventListener('contextmenu', ev => ev.preventDefault());
  }
  const clearAllPointers = () => {
    for (const [, k] of activePointers) ctl[k] = 0;
    activePointers.clear();
    document.querySelectorAll('.cBtn.hit').forEach(b => b.classList.remove('hit'));
  };
  /* jaring pengaman global */
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerup', ev => {
      if (!activePointers.has(ev.pointerId)) return;
      const k = activePointers.get(ev.pointerId);
      activePointers.delete(ev.pointerId);
      ctl[k] = 0;
      const e = document.querySelector('.cBtn.hit');
      if (e) e.classList.remove('hit');
    });
    window.addEventListener('pointercancel', clearAllPointers);
    window.addEventListener('blur', clearAllPointers);
  }

  holdBtn('gasBtn','gas'); holdBtn('brakeBtn','brake');
  holdBtn('steerL','left'); holdBtn('steerR','right');
  holdBtn('handBtn','hand'); holdBtn('nosBtn','nos');

  if (onExit) $('exitCar').addEventListener('click', onExit);
  if (carBtn && onCarButton) carBtn.addEventListener('click', e => { e.stopPropagation(); onCarButton(); });

  /* ---------- tombol kamera: 3 mode ---------- */
  let camMode = 'near';
  function setCameraMode(m){
    camMode = (m === 'far' || m === 'cine') ? m : 'near';
    if (camLbl) camLbl.textContent = CAM_LABEL[camMode];
    if (camBtn) camBtn.dataset.mode = camMode;
    return camMode;
  }
  function cycleCameraMode(){
    const order = ['near', 'far', 'cine'];
    const next = order[(order.indexOf(camMode) + 1) % order.length];
    setCameraMode(next);
    if (onCameraMode) onCameraMode(next);
    return next;
  }
  setCameraMode('near');
  if (camBtn) {
    camBtn.addEventListener('pointerdown', ev => ev.stopPropagation());
    camBtn.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); cycleCameraMode(); });
  }

  let inCar = false;
  let editMode = false;
  /* Satu sumber kebenaran untuk visibilitas: kontrol tampil kalau sedang
     di dalam mobil ATAU sedang mode susun tombol. Tanpa `|| editMode`,
     pemain yang sedang jalan kaki tidak punya tombol untuk digeser. */
  function syncVisible(){
    const show = inCar || editMode;
    carHUD.classList.toggle('on', show);
    carCtrls.classList.toggle('on', show);
  }
  function setInCar(v){
    inCar = !!v;
    /* Tombol layar tampil SELALU saat di dalam mobil. Dulu hanya kalau
       isTouch, sehingga di perangkat hybrid (layar sentuh + keyboard,
       atau pointer:fine tapi tetap disentuh) tombolnya hilang total. */
    syncVisible();
    if (!inCar){ resetControls(); speedoFlash.style.opacity = '0'; setPrompt(''); hideNosToast(); }
  }

  function resetControls(){
    for (const k in ctl) ctl[k] = 0;
    clearAllPointers();
  }

  let promptCache = null;
  function setPrompt(html){
    const txt = html || '';
    if (txt === promptCache) return;
    promptCache = txt;
    if (txt) carPrompt.innerHTML = txt;
    carPrompt.classList.toggle('on', !!txt);
  }

  function showCarButton(show){
    if (carBtn) carBtn.classList.toggle('hide', !show);
  }

  /* ---------- umpan balik NOS kosong ----------
     Pemain harus tahu bedanya "tombol rusak" dan "tangki habis". */
  let toastUntil = 0, toastShown = false;
  function showNosToast(ms = 900){
    if (!nosToast) return;
    toastUntil = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + ms;
    if (!toastShown) { toastShown = true; nosToast.classList.add('on'); }
  }
  function hideNosToast(){
    toastShown = false;
    if (nosToast) nosToast.classList.remove('on');
  }

  /* ---------- tema monokrom ---------- */
  function setTheme(theme){
    document.body.classList.toggle('ui-color', theme === 'color');
  }

  /* ---------- tata letak tombol yang bisa digeser ----------
     Posisi disimpan sebagai fraksi viewport (0..1) supaya tetap pas
     setelah ponsel diputar atau ukuran layar berubah.

     PENTING: hanya tombol yang PERNAH digeser pemain yang dapat
     `left/top` inline. Sisanya tetap memakai posisi default dari CSS
     (yang sudah punya media query untuk layar kecil). Kalau kita tulis
     inline untuk semua tombol, tata letak bawaan di layar sempit rusak. */
  let btnScale = 1;
  function applyLayout(layout, scale = 1){
    const vw = (typeof innerWidth !== 'undefined' ? innerWidth : 1) || 1;
    const vh = (typeof innerHeight !== 'undefined' ? innerHeight : 1) || 1;
    btnScale = (typeof scale === 'number' && scale > 0) ? scale : 1;
    for (const id in DRAGGABLE) {
      const el = $(id); if (!el) continue;
      const p = layout && layout[id];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        /* sudah digeser pemain: left/top = TITIK TENGAH, jadi transform
           harus translate(-50%,-50%). right/bottom dinolkan supaya tidak
           saling tarik dengan left/top. */
        el.style.left = (p.x * vw) + 'px';
        el.style.top  = (p.y * vh) + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transform = 'translate(-50%,-50%) scale(' + btnScale + ')';
      } else {
        /* kembalikan ke CSS (posisi default + media query layar kecil) */
        el.style.left = ''; el.style.top = '';
        el.style.right = ''; el.style.bottom = '';
        el.style.transform = btnScale === 1 ? '' : 'scale(' + btnScale + ')';
      }
    }
  }
  /* posisi aktual -> fraksi, dipakai untuk menyimpan */
  function readLayout(existing){
    const out = { ...(existing || {}) };
    const vw = innerWidth || 1, vh = innerHeight || 1;
    for (const id in DRAGGABLE) {
      const el = $(id); if (!el || !el.style || !el.style.left) continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      out[id] = {
        x: Math.max(0, Math.min(1, (r.left + r.width / 2) / vw)),
        y: Math.max(0, Math.min(1, (r.top + r.height / 2) / vh)),
      };
    }
    return out;
  }
  function clearLayout(){
    for (const id in DRAGGABLE) {
      const el = $(id); if (!el) continue;
      el.style.left = ''; el.style.top = '';
      el.style.right = ''; el.style.bottom = '';
      el.style.transform = btnScale === 1 ? '' : 'scale(' + btnScale + ')';
    }
  }

  /* Mode susun: tombol diberi garis putus-putus dan bisa digeser.
     Input permainan dinonaktifkan selama mode ini aktif. */
  function setEditMode(on){
    editMode = !!on;
    document.body.classList.toggle('layout-edit', editMode);
    if (editMode) resetControls();
    syncVisible();
    return editMode;
  }

  /* Drag handler dipasang di carCtrls supaya satu listener saja. */
  if (carCtrls) {
    const drag = new Map();   // pointerId -> {id, offX, offY}
    carCtrls.addEventListener('pointerdown', ev => {
      if (!editMode) return;
      const el = ev.target.closest ? ev.target.closest('.cBtn') : null;
      if (!el) return;
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      drag.set(ev.pointerId, { id: el.id, cx: r.left + r.width / 2, cy: r.top + r.height / 2, px: ev.clientX, py: ev.clientY });
      el.classList.add('dragging');
      try { carCtrls.setPointerCapture(ev.pointerId); } catch (err) { /* abaikan */ }
    });
    carCtrls.addEventListener('pointermove', ev => {
      const d = drag.get(ev.pointerId); if (!d) return;
      const el = $(d.id); if (!el) return;
      const vw = innerWidth || 1, vh = innerHeight || 1;
      /* margin 6% supaya tombol tidak bisa disembunyikan keluar layar */
      const nx = Math.max(0.06, Math.min(0.94, (d.cx + ev.clientX - d.px) / vw));
      const ny = Math.max(0.08, Math.min(0.92, (d.cy + ev.clientY - d.py) / vh));
      el.style.left = (nx * vw) + 'px';
      el.style.top  = (ny * vh) + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
      /* transform harus sama dengan applyLayout: left/top = titik tengah */
      el.style.transform = 'translate(-50%,-50%) scale(' + btnScale + ')';
      d.nx = nx; d.ny = ny;
    });
    const endDrag = ev => {
      const d = drag.get(ev.pointerId); if (!d) return;
      drag.delete(ev.pointerId);
      const el = $(d.id); if (el) el.classList.remove('dragging');
      if (d.nx !== undefined && onLayoutChange) onLayoutChange(d.id, d.nx, d.ny);
    };
    carCtrls.addEventListener('pointerup', endDrag);
    carCtrls.addEventListener('pointercancel', endDrag);
  }

  let onLayoutChange = null;
  function setLayoutCallback(fn){ onLayoutChange = fn; }

  let lastNosPct = 1, nosEmptyLatch = false;
  function update(car){
    if (!inCar) return;
    const kmh = car.kmh;
    const ang = A0 + SWEEP * clamp01(kmh / GA.kmax);
    GA.needle.setAttribute('transform', `rotate(${ang.toFixed(2)} 120 120)`);
    GA.kmh.textContent = Math.round(kmh);

    const span = cfg.revLimit - cfg.idleRpm * 0.8;
    const rf = clamp01((car.rpm - cfg.idleRpm * 0.8) / span);
    GA.tacho.setAttribute('stroke-dashoffset', (GA.tachoLen * (1 - rf)).toFixed(2));
    GA.tacho.setAttribute('stroke', rf > 0.86 ? '#ff4a37' : rf > 0.66 ? '#ffd166' : '#5fdcff');
    GA.gear.textContent = car.speed < -0.6 ? 'R'
      : (Math.abs(car.speed) < 0.7 && car.throttle < 0.05 ? 'N' : String(car.gear));

    csSpeed.textContent = Math.round(kmh) + ' km/j';
    csRpm.textContent = (car.rpm / 1000).toFixed(1);

    const np = car.nitro / cfg.nitroMax;
    nosFill.style.width = (np * 100).toFixed(1) + '%';
    nosPct.textContent = Math.round(np * 100) + '%';
    nosWrap.classList.toggle('hot', car.nitroActive);
    nosWrap.classList.toggle('empty', np < 0.05);

    /* umpan balik "NOS KOSONG": muncul sekali tiap kali tangki habis
       lalu ditekan, hilang sendiri setelah ~0.9 detik */
    if (car.nitroDenied && !nosEmptyLatch) { nosEmptyLatch = true; showNosToast(); }
    if (!car.nitroDenied) nosEmptyLatch = false;
    const tnow = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (toastShown && tnow > toastUntil) hideNosToast();

    /* kilat mulai terlihat di ~45% kecepatan puncak, penuh menjelang puncak */
    const flashFrom = GA.kmax * 0.45;
    speedoFlash.style.opacity =
      (clamp01((kmh - flashFrom) / flashFrom) * 0.85 + (car.nitroActive ? 0.35 : 0)).toFixed(3);
    lastNosPct = np;
  }

  return {
    ctl, update, setInCar, setPrompt, showCarButton, resetControls,
    speedoFlash, kmax: GA.kmax,
    setCameraMode, cycleCameraMode, getCameraMode: () => camMode,
    applyLayout, readLayout, clearLayout, setEditMode, isEditing: () => editMode,
    setTheme, setLayoutCallback,
  };
}
