/* ============================================================
   CAR HUD — markup + takometer SVG + tombol layar.
   Mengikuti pola game/hud.mjs: DOM dibangun di sini supaya
   index.html cuma berisi wiring permainan.
============================================================ */

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

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
  </div>
  <button id="exitCar" type="button">&#9211; KELUAR &nbsp;<b>E</b></button>
  <div id="carHint">
    <b>W/S</b> gas &amp; rem · <b>A/D</b> belok<br>
    <b>SPASI</b> rem tangan · <b>SHIFT</b> nitro<br>
    <b>E</b> keluar · <b>B</b> summon · <b>R</b> balikkan · <b>M</b> bisu
  </div>
</div>
<div id="carPrompt"></div>
<div id="speedoFlash"></div>`;

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
export function initCarHUD({ cfg, isTouch, onExit, onCarButton }){
  const host = document.createElement('div');
  host.id = 'carHudHost';
  host.innerHTML = MARKUP;
  while (host.firstChild) document.body.appendChild(host.firstChild);

  const $ = id => document.getElementById(id);
  const carHUD = $('carHUD'), carCtrls = $('carCtrls'), carPrompt = $('carPrompt');
  const speedoFlash = $('speedoFlash'), carBtn = $('carBtn');
  const csSpeed = $('csSpeed'), csRpm = $('csRpm');
  const nosFill = $('nosFill'), nosWrap = $('nosWrap'), nosPct = $('nosPct');
  const GA = buildGauge($('gauge'), cfg);

  /* state tombol layar — dibaca index.html untuk menyusun input mobil */
  const ctl = { gas:0, brake:0, left:0, right:0, hand:0, nos:0 };

  function holdBtn(id, key){
    const e = $(id); if (!e) return;
    const on = ev => { ev.preventDefault(); ctl[key] = 1; e.classList.add('hit'); };
    const off = ev => { if (ev && ev.preventDefault) ev.preventDefault(); ctl[key] = 0; e.classList.remove('hit'); };
    e.addEventListener('pointerdown', on);
    e.addEventListener('pointerup', off);
    e.addEventListener('pointercancel', off);
    e.addEventListener('pointerleave', off);
    e.addEventListener('contextmenu', ev => ev.preventDefault());
  }
  holdBtn('gasBtn','gas'); holdBtn('brakeBtn','brake');
  holdBtn('steerL','left'); holdBtn('steerR','right');
  holdBtn('handBtn','hand'); holdBtn('nosBtn','nos');

  if (onExit) $('exitCar').addEventListener('click', onExit);
  if (carBtn && onCarButton) carBtn.addEventListener('click', e => { e.stopPropagation(); onCarButton(); });

  let inCar = false;
  function setInCar(v){
    inCar = !!v;
    carHUD.classList.toggle('on', inCar);
    carCtrls.classList.toggle('on', inCar && isTouch);
    if (!inCar){ resetControls(); speedoFlash.style.opacity = '0'; setPrompt(''); }
  }

  function resetControls(){
    for (const k in ctl) ctl[k] = 0;
    document.querySelectorAll('.cBtn.hit').forEach(b => b.classList.remove('hit'));
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

    /* kilat mulai terlihat di ~45% kecepatan puncak, penuh menjelang puncak */
    const flashFrom = GA.kmax * 0.45;
    speedoFlash.style.opacity =
      (clamp01((kmh - flashFrom) / flashFrom) * 0.85 + (car.nitroActive ? 0.35 : 0)).toFixed(3);
  }

  return { ctl, update, setInCar, setPrompt, showCarButton, resetControls, speedoFlash, kmax: GA.kmax };
}
