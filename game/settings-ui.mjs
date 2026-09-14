/* ============================================================
   SETTINGS UI — panel pengaturan grafis & kontrol.

   Dibangun dari data di game/quality.mjs, bukan hard-coded, supaya
   menambah opsi cukup dengan menambah satu baris di GFX_OPTIONS
   (tidak ada dua tempat yang bisa tidak sinkron).

   Dibangun di dalam modul .mjs (bukan di index.html) karena
   tools/check-imports.mjs memverifikasi setiap getElementById di
   index.html punya markup statis; elemen yang dibuat runtime
   sengaja ditaruh di sini.
============================================================ */
import {
  PRESET_IDS, PRESET_LABEL, PRESETS, FPS_CHOICES, GFX_OPTIONS, LEVEL_LABEL,
  TEXTURE_LEVEL_LABEL, STICK_SHAPES, BUTTON_THEMES, setGfx, applyPreset,
} from './quality.mjs';

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

/* nilai tampilan untuk satu opsi */
function levelText(opt, v) {
  if (opt.key === 'texture') return TEXTURE_LEVEL_LABEL[v] || TEXTURE_LEVEL_LABEL[0];
  return LEVEL_LABEL[v] || LEVEL_LABEL[0];
}

export function initSettingsUI({ host, getSettings, onSettings, fps = 0 }) {
  if (!host) return { refresh() {} };

  /* ---------- tab ---------- */
  const tabs = el('div', 'tabs');
  const paneGfx = el('div', 'tabpane');
  const paneCtl = el('div', 'tabpane');
  paneCtl.hidden = true;
  const tabGfx = el('button', 'tab', 'Grafik'); tabGfx.type = 'button'; tabGfx.setAttribute('aria-selected', 'true');
  const tabCtl = el('button', 'tab', 'Kontrol'); tabCtl.type = 'button'; tabCtl.setAttribute('aria-selected', 'false');
  tabs.append(tabGfx, tabCtl);
  const selectTab = which => {
    const gfx = which !== 'ctl';
    tabGfx.setAttribute('aria-selected', gfx ? 'true' : 'false');
    tabCtl.setAttribute('aria-selected', gfx ? 'false' : 'true');
    paneGfx.hidden = !gfx;
    paneCtl.hidden = gfx;
  };
  tabGfx.addEventListener('click', () => selectTab('gfx'));
  tabCtl.addEventListener('click', () => selectTab('ctl'));

  /* ---------- preset ---------- */
  const secPreset = el('div', 'set-section');
  secPreset.appendChild(el('h3', '', 'Preset kualitas'));
  const presetChips = el('div', 'chips');
  const chipNodes = {};
  for (const id of PRESET_IDS) {
    const b = el('button', 'chip', PRESET_LABEL[id] + '<small>' + PRESETS[id].fps + ' FPS</small>');
    b.type = 'button';
    b.addEventListener('click', () => onSettings(applyPreset(getSettings(), id)));
    chipNodes[id] = b;
    presetChips.appendChild(b);
  }
  const chipCustom = el('button', 'chip', 'Custom<small>manual</small>');
  chipCustom.type = 'button';
  chipCustom.addEventListener('click', () => onSettings({ ...getSettings(), quality: 'custom', custom: true }));
  chipNodes.custom = chipCustom;
  presetChips.appendChild(chipCustom);
  secPreset.appendChild(presetChips);

  /* ---------- FPS ---------- */
  const secFps = el('div', 'set-section');
  secFps.appendChild(el('h3', '', 'Batas FPS'));
  const fpsChips = el('div', 'chips');
  const fpsNodes = {};
  for (const f of FPS_CHOICES) {
    const b = el('button', 'chip', String(f) + '<small>fps</small>');
    b.type = 'button';
    b.addEventListener('click', () => {
      /* mengubah FPS tidak mengubah preset grafis: keduanya berdiri sendiri */
      onSettings({ ...getSettings(), fps: f });
    });
    fpsNodes[f] = b;
    fpsChips.appendChild(b);
  }
  secFps.appendChild(fpsChips);
  const fpsNote = el('p', 'set-hint',
    'FPS lebih rendah = beban GPU jauh lebih ringan. Di layar 60 Hz, nilai 45 akan dibulatkan ke 30 karena frame hanya bisa digambar pada interval refresh.');
  secFps.appendChild(fpsNote);

  /* ---------- skala render ---------- */
  const secScale = el('div', 'set-section');
  secScale.appendChild(el('h3', '', 'Resolusi render'));
  const scaleRow = el('div', 'opt-row');
  const scaleName = el('div', 'opt-name', 'Skala render<small>Menurunkan ini cara termurah menaikkan FPS; detail dunia tidak berubah</small>');
  const scaleVal = el('div', 'opt-val');
  scaleRow.append(scaleName, scaleVal);
  const scaleRange = document.createElement('input');
  scaleRange.type = 'range'; scaleRange.className = 'thin';
  scaleRange.min = '50'; scaleRange.max = '150'; scaleRange.step = '5';
  scaleRange.setAttribute('aria-label', 'Skala render persen');
  scaleRange.style.gridColumn = '1/-1';
  scaleRange.addEventListener('input', () => {
    onSettings(setGfx(getSettings(), 'renderScale', Number(scaleRange.value) / 100));
  });
  secScale.append(scaleRow, scaleRange);

  /* ---------- opsi bertingkat ---------- */
  const secOpts = el('div', 'set-section');
  secOpts.appendChild(el('h3', '', 'Pengaturan detail (custom)'));
  const optRows = [];
  for (const opt of GFX_OPTIONS) {
    const row = el('div', 'opt-row');
    const name = el('div', 'opt-name', opt.label + '<small>' + (opt.hint || '') + '</small>');
    const val = el('div', 'opt-val', '');
    val.setAttribute('role', 'button');
    val.setAttribute('tabindex', '0');
    val.title = 'Klik untuk mengubah tingkat';
    const step = () => {
      const cur = getSettings().gfx[opt.key] | 0;
      /* siklus: naik terus; kalau sudah maksimal dan fitur bisa mati,
         kembali ke Mati. Jadi setiap fitur benar-benar bisa dimatikan. */
      const next = cur >= opt.max ? (opt.off ? 0 : 0) : cur + 1;
      onSettings(setGfx(getSettings(), opt.key, next));
    };
    val.addEventListener('click', step);
    val.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(); }
    });
    row.append(name, val);
    secOpts.appendChild(row);
    optRows.push({ opt, val });
  }
  const optHint = el('p', 'set-hint',
    'Klik nilai di kanan untuk menaikkan tingkat. Fitur bertanda bisa dimatikan sepenuhnya (Mati) — saat Mati, pass/objeknya benar-benar tidak digambar.');
  secOpts.appendChild(optHint);

  /* ---------- kontrol ---------- */
  const secStick = el('div', 'set-section');
  secStick.appendChild(el('h3', '', 'Analog / joystick'));
  const stickChips = el('div', 'chips');
  const stickNodes = {};
  for (const s of STICK_SHAPES) {
    const b = el('button', 'chip', s === 'circle' ? 'Bundar<small>klasik</small>' : 'Kotak<small>sudut halus</small>');
    b.type = 'button';
    b.addEventListener('click', () => onSettings({ ...getSettings(), stickShape: s }));
    stickNodes[s] = b;
    stickChips.appendChild(b);
  }
  secStick.appendChild(stickChips);

  const secBtn = el('div', 'set-section');
  secBtn.appendChild(el('h3', '', 'Tombol sentuh'));
  const themeChips = el('div', 'chips');
  const themeNodes = {};
  for (const t of BUTTON_THEMES) {
    const b = el('button', 'chip', t === 'mono' ? 'Hitam-putih<small>monokrom</small>' : 'Berwarna<small>klasik</small>');
    b.type = 'button';
    b.addEventListener('click', () => onSettings({ ...getSettings(), buttonTheme: t }));
    themeNodes[t] = b;
    themeChips.appendChild(b);
  }
  secBtn.appendChild(themeChips);

  const scaleBtnRow = el('div', 'opt-row');
  scaleBtnRow.append(
    el('div', 'opt-name', 'Ukuran tombol<small>Perbesar kalau sering salah pencet</small>'),
    (() => { const v = el('div', 'opt-val'); return v; })(),
  );
  const btnScaleVal = scaleBtnRow.lastChild;
  const btnScaleRange = document.createElement('input');
  btnScaleRange.type = 'range'; btnScaleRange.className = 'thin';
  btnScaleRange.min = '75'; btnScaleRange.max = '140'; btnScaleRange.step = '5';
  btnScaleRange.setAttribute('aria-label', 'Ukuran tombol persen');
  btnScaleRange.style.gridColumn = '1/-1';
  btnScaleRange.addEventListener('input', () => {
    onSettings({ ...getSettings(), buttonScale: Number(btnScaleRange.value) / 100 });
  });
  secBtn.append(scaleBtnRow, btnScaleRange);

  const btnLayoutRow = el('div', 'opt-row');
  btnLayoutRow.appendChild(el('div', 'opt-name',
    'Susun tombol<small>Seret tombol ke posisi yang kamu suka</small>'));
  const editBtn = el('div', 'opt-val', 'Geser');
  editBtn.setAttribute('role', 'button'); editBtn.setAttribute('tabindex', '0');
  btnLayoutRow.appendChild(editBtn);
  const resetBtn = el('div', 'opt-val', 'Reset');
  resetBtn.setAttribute('role', 'button'); resetBtn.setAttribute('tabindex', '0');
  const layoutRow2 = el('div', 'opt-row');
  layoutRow2.append(el('div', 'opt-name', 'Kembalikan posisi asli'), resetBtn);
  secBtn.append(btnLayoutRow, layoutRow2);
  const layoutHint = el('p', 'set-hint',
    'Saat mode geser aktif, game dijeda sebentar dan tombol diberi garis putus-putus. Sentuh lalu seret, lalu ketuk <b>Selesai</b>.');
  secBtn.appendChild(layoutHint);

  /* ---------- kamera mobil ---------- */
  const secCam = el('div', 'set-section');
  secCam.appendChild(el('h3', '', 'Kamera mobil'));
  const camChips = el('div', 'chips');
  const camNodes = {};
  const CAMS = [['near', 'Dekat<small>responsif</small>'], ['far', 'Jauh<small>lihat jauh</small>'], ['cine', 'Sinematik<small>gaya film</small>']];
  for (const [id, label] of CAMS) {
    const b = el('button', 'chip', label);
    b.type = 'button';
    b.addEventListener('click', () => onSettings({ ...getSettings(), carCamera: id }));
    camNodes[id] = b;
    camChips.appendChild(b);
  }
  secCam.appendChild(camChips);
  secCam.appendChild(el('p', 'set-hint', 'Bisa juga diganti cepat lewat tombol kamera di HUD mobil atau tombol <b>C</b>.'));

  /* ---------- info performa ---------- */
  const secPerf = el('div', 'set-section');
  secPerf.appendChild(el('h3', '', 'Performa'));
  const fpsRow = el('div', 'opt-row');
  const fpsVal = el('div', 'opt-val', '–');
  fpsRow.append(el('div', 'opt-name', 'FPS terukur<small>Naik-turunkan preset sampai angka ini stabil</small>'), fpsVal);
  secPerf.appendChild(fpsRow);
  const fpsToggleRow = el('div', 'opt-row');
  const fpsToggle = el('div', 'opt-val', 'Tampilkan');
  fpsToggle.setAttribute('role', 'button'); fpsToggle.setAttribute('tabindex', '0');
  fpsToggleRow.append(el('div', 'opt-name', 'Meter FPS di layar'), fpsToggle);
  secPerf.append(fpsToggleRow);

  /* ---------- tombol aksi ---------- */
  const actions = el('div');
  actions.style.marginTop = '18px';
  actions.style.display = 'flex';
  actions.style.gap = '10px';
  const doneBtn = el('button', 'panel-button', 'Selesai');
  doneBtn.type = 'button';
  doneBtn.style.marginTop = '0';
  actions.appendChild(doneBtn);

  paneGfx.append(secPreset, secFps, secScale, secOpts, secPerf);
  paneCtl.append(secStick, secBtn, secCam);
  host.append(tabs, paneGfx, paneCtl, actions);

  /* ---------- sinkronisasi tampilan ---------- */
  function refresh() {
    const s = getSettings();
    for (const id of Object.keys(chipNodes)) {
      chipNodes[id].setAttribute('aria-pressed', s.quality === id ? 'true' : 'false');
    }
    for (const f of FPS_CHOICES) {
      fpsNodes[f].setAttribute('aria-pressed', s.fps === f ? 'true' : 'false');
    }
    const rs = Math.round((s.gfx.renderScale || 1) * 100);
    scaleRange.value = String(rs);
    scaleVal.textContent = rs + '%';
    for (const { opt, val } of optRows) {
      const v = s.gfx[opt.key] | 0;
      val.textContent = levelText(opt, v);
      val.dataset.off = (v === 0) ? '1' : '0';
    }
    for (const sh of STICK_SHAPES) stickNodes[sh].setAttribute('aria-pressed', s.stickShape === sh ? 'true' : 'false');
    for (const t of BUTTON_THEMES) themeNodes[t].setAttribute('aria-pressed', s.buttonTheme === t ? 'true' : 'false');
    const bs = Math.round((s.buttonScale || 1) * 100);
    btnScaleRange.value = String(bs);
    btnScaleVal.textContent = bs + '%';
    for (const [id] of CAMS) camNodes[id].setAttribute('aria-pressed', s.carCamera === id ? 'true' : 'false');
    fpsVal.textContent = fps > 0 ? Math.round(fps) + ' fps' : '–';
  }

  /* ---------- wiring aksi khusus ---------- */
  let onEditLayout = null, onResetLayout = null, onDone = null, onToggleFps = null;
  const setFpsValue = v => { fpsVal.textContent = v > 0 ? Math.round(v) + ' fps' : '–'; };
  editBtn.addEventListener('click', () => { if (onEditLayout) onEditLayout(); });
  resetBtn.addEventListener('click', () => { if (onResetLayout) onResetLayout(); });
  doneBtn.addEventListener('click', () => { if (onDone) onDone(); });
  fpsToggle.addEventListener('click', () => {
    onSettings({ ...getSettings(), showFps: !getSettings().showFps });
    if (onToggleFps) onToggleFps();
  });

  refresh();
  return {
    refresh, setFpsValue,
    onEditLayout: fn => { onEditLayout = fn; },
    onResetLayout: fn => { onResetLayout = fn; },
    onDone: fn => { onDone = fn; },
    onToggleFps: fn => { onToggleFps = fn; },
  };
}
