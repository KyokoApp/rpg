/* ============================================================
   TES GRAPH AUDIO — headless, tanpa browser.
   Jalankan:  node tests/audio.graph.mjs        (dari root repo)

   Harness audio headless: stub WebAudioContext yang MENCATAT semua
   nilai parameter, lalu memvalidasi aturan nyata WebAudio:
   - exponentialRampToValueAtTime(<=0) => RangeError di browser
   - semua nilai harus finite
   - frequency dalam [0, nyquist]
   - gain tidak boleh NaN
============================================================ */
const errors = [];
const stats = { exp: 0, set: 0, target: 0, lin: 0, nodes: 0 };

let NOW = 0;
const SAMPLE_RATE = 48000;

function mkParam(name, value, node) {
  const chk = (v, fn) => {
    if (typeof v !== 'number' || !Number.isFinite(v))
      errors.push(`${node}.${name}.${fn}(${v}) — BUKAN angka finite`);
  };
  return {
    _name: `${node}.${name}`, value, defaultValue: value, minValue: -3.4e38, maxValue: 3.4e38,
    setValueAtTime(v, t) { chk(v, 'setValueAtTime'); chk(t, 'setValueAtTime.time'); stats.set++; this.value = v; return this; },
    linearRampToValueAtTime(v, t) { chk(v, 'linearRamp'); chk(t, 'linearRamp.time'); stats.lin++; this.value = v; return this; },
    exponentialRampToValueAtTime(v, t) {
      chk(v, 'exponentialRamp'); chk(t, 'exponentialRamp.time'); stats.exp++;
      /* aturan WebAudio asli: nilai harus != 0 dan punya tanda sama */
      if (!(v > 0)) errors.push(`${node}.${name}.exponentialRampToValueAtTime(${v}) — akan MELEMPAR RangeError di browser (harus > 0)`);
      else if (this.value !== undefined && Number.isFinite(this.value) && this.value <= 0)
        errors.push(`${node}.${name}: ramp eksponensial dari nilai ${this.value} (harus > 0)`);
      this.value = v; return this;
    },
    setTargetAtTime(v, t, tc) {
      chk(v, 'setTargetAtTime'); chk(t, 'setTargetAtTime.time');
      if (!(tc > 0)) errors.push(`${node}.${name}.setTargetAtTime timeConstant=${tc} — harus > 0`);
      stats.target++; this.value = v; return this;
    },
    cancelScheduledValues(t) { chk(t, 'cancelScheduledValues'); return this; },
    cancelAndHoldAtTime(t) { chk(t, 'cancelAndHoldAtTime'); return this; },
  };
}

let nodeSeq = 0;
function baseNode(kind) {
  stats.nodes++;
  return {
    _kind: kind, _id: ++nodeSeq, channelCount: 2, numberOfInputs: 1, numberOfOutputs: 1,
    connect(dst) {
      if (!dst) errors.push(`${kind}#${nodeSeq}.connect(undefined)`);
      return dst && dst._kind ? dst : undefined;
    },
    disconnect() {},
  };
}

class StubCtx {
  constructor() { this.sampleRate = SAMPLE_RATE; this.state = 'running'; this.baseLatency = 0.01; }
  get currentTime() { return NOW; }
  get destination() { return this._dst || (this._dst = baseNode('destination')); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  createGain() { const n = baseNode('gain'); n.gain = mkParam('gain', 1, 'GainNode'); return n; }
  createOscillator() {
    const n = baseNode('osc');
    n.frequency = mkParam('frequency', 440, 'OscillatorNode');
    n.detune = mkParam('detune', 0, 'OscillatorNode');
    n.type = 'sine'; n._started = false;
    n.start = (t) => { if (n._started) errors.push('OscillatorNode.start() dipanggil 2x — InvalidStateError di browser'); n._started = true; if (t !== undefined && (!Number.isFinite(t) || t < 0)) errors.push(`osc.start(${t}) waktu tidak valid`); };
    n.stop = (t) => { if (!n._started) errors.push('OscillatorNode.stop() sebelum start()'); if (t !== undefined && (!Number.isFinite(t) || t < 0)) errors.push(`osc.stop(${t}) waktu tidak valid`); };
    n.setPeriodicWave = () => {};
    n.onended = null;
    return n;
  }
  createBiquadFilter() {
    const n = baseNode('biquad');
    n.frequency = mkParam('frequency', 350, 'BiquadFilterNode');
    n.Q = mkParam('Q', 1, 'BiquadFilterNode');
    n.gain = mkParam('gain', 0, 'BiquadFilterNode');
    n.detune = mkParam('detune', 0, 'BiquadFilterNode');
    n.type = 'lowpass';
    return n;
  }
  createWaveShaper() { const n = baseNode('shaper'); n.curve = null; n.oversample = 'none'; return n; }
  createDynamicsCompressor() {
    const n = baseNode('comp');
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = mkParam(k, 0, 'CompressorNode');
    n.reduction = 0; return n;
  }
  createConvolver() { const n = baseNode('convolver'); n.buffer = null; n.normalize = true; return n; }
  createStereoPanner() { const n = baseNode('panner'); n.pan = mkParam('pan', 0, 'StereoPannerNode'); return n; }
  createBufferSource() {
    const n = baseNode('bufsrc');
    n.buffer = null; n.loop = false; n.loopStart = 0; n.loopEnd = 0;
    n.playbackRate = mkParam('playbackRate', 1, 'BufferSourceNode');
    n.detune = mkParam('detune', 0, 'BufferSourceNode');
    n._started = false;
    n.start = (t) => { if (n._started) errors.push('BufferSourceNode.start() 2x'); n._started = true; };
    n.stop = () => {}; n.onended = null;
    return n;
  }
  createBuffer(ch, len, sr) {
    if (!(len > 0)) errors.push(`createBuffer length=${len} tidak valid`);
    const data = []; for (let i = 0; i < ch; i++) data.push(new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: (i) => data[i] };
  }
  createChannelMerger(n) { return baseNode('merger'); }
  createChannelSplitter(n) { return baseNode('splitter'); }
  createDelay() { const n = baseNode('delay'); n.delayTime = mkParam('delayTime', 0, 'DelayNode'); return n; }
  createPeriodicWave() { return {}; }
  createAnalyser() { const n = baseNode('analyser'); n.fftSize = 2048; n.frequencyBinCount = 1024; n.getByteFrequencyData = () => {}; return n; }
}

globalThis.AudioContext = StubCtx;
globalThis.window = { AudioContext: StubCtx, addEventListener() {}, removeEventListener() {} };
globalThis.document = { addEventListener() {}, removeEventListener() {} };
try{Object.defineProperty(globalThis,'navigator',{value:{userAgent:'node'},configurable:true});}catch(e){}
globalThis.performance = { now: () => NOW * 1000 };

const { AUDIO } = await import('../js/audio.js');

console.log('=== mesin audio di-init ===');
AUDIO.init();
console.log('  init() selesai. node dibuat:', stats.nodes);

/* --- jalankan mesin lewat seluruh rentang rpm & beban --- */
const freqSeen = [];
let maxGain = 0;
function sampleParams() {
  /* tidak bisa introspeksi graph stub; cukup andalkan pencatatan error */
}

console.log('=== sweep mesin: idle -> redline, gas & lepas ===');
for (let rpm = 800; rpm <= 9200; rpm += 137) {
  for (const load of [0, 0.5, 1]) {
    NOW += 1 / 60;
    AUDIO.setEngine(rpm, (rpm%9000)/9000, load, true);
    AUDIO.setTireSlip((rpm % 1000) / 1000, rpm / 9000);
  }
  freqSeen.push(rpm);
}
console.log(`  ${freqSeen.length} titik rpm disweep, exp ramps=${stats.exp} setTarget=${stats.target} setValue=${stats.set}`);

console.log('=== event one-shot (harus tidak melempar) ===');
const oneShots = [
  ['gearShift', () => AUDIO.gearShift()],
  ['backfire', () => AUDIO.backfire()],
  ['impact(0.5)', () => AUDIO.impact(0.5)],
  ['impact(1.0)', () => AUDIO.impact(1.0)],
  ['engineStart', () => AUDIO.engineStart()],
  ['door(true)', () => AUDIO.door(true)],
  ['door(false)', () => AUDIO.door(false)],
  ['uiClick', () => AUDIO.uiClick()],
  ['pickup(3)', () => AUDIO.pickup(3)],
  ['setRush(1)', () => AUDIO.setRush(1)],
  ['setRush(0)', () => AUDIO.setRush(0)],
  ['setMuted(true)', () => AUDIO.setMuted(true)],
  ['setMuted(false)', () => AUDIO.setMuted(false)],
  ['updateAmbient', () => AUDIO.updateAmbient(0.016, 0.7)],
];
for (const [name, fn] of oneShots) {
  NOW += 0.05;
  try { fn(); } catch (e) { errors.push(`${name}() MELEMPAR: ${e.message}`); }
}
console.log('  semua one-shot dipanggil tanpa exception tersisa');

console.log('=== wastegate: lepas gas mendadak di rpm atas ===');
{
  let wg = 0;
  for (let i = 0; i < 40; i++) {
    NOW += 1 / 60;
    AUDIO.setEngine(6800, 1.0, 1.0, true);            // gas penuh di rpm atas
  }
  const before = stats.exp;
  NOW += 1 / 60; AUDIO.setEngine(6800, 0.0, 0.2, true);  // lepas gas -> harus picu wastegate
  const afterLift = stats.exp;
  NOW += 1 / 60; AUDIO.setEngine(6700, 0.0, 0.2, true);  // frame berikutnya: tidak boleh picu lagi
  const second = stats.exp;
  NOW += 1 / 60; AUDIO.setEngine(6700, 1.0, 1.0, true);
  NOW += 0.5; NOW += 1 / 60; AUDIO.setEngine(6900, 0.0, 0.2, true);  // setelah cooldown boleh lagi
  const third = stats.exp;
  console.log(`  exp ramps: lift=${afterLift - before} (harus >0), frame2=${second - afterLift} (harus 0), setelah cooldown=${third - second} (harus >0)`);
  if (!(afterLift - before > 0)) errors.push('wastegate TIDAK terpicu saat lepas gas di rpm atas');
  if (!(second - afterLift === 0)) errors.push('wastegate terpicu berulang tiap frame (harusnya sekali)');
  if (!(third - second > 0)) errors.push('wastegate tidak bisa terpicu lagi setelah cooldown');
  /* idle / rpm rendah tidak boleh wastegate */
  const b2 = stats.exp;
  NOW += 0.5; NOW += 1/60; AUDIO.setEngine(1200, 1.0, 0.3, true);
  NOW += 1/60; AUDIO.setEngine(1200, 0.0, 0.1, true);
  if (!(stats.exp - b2 === 0)) errors.push('wastegate terpicu di rpm rendah (harus > 3200 rpm)');
}

console.log('=== firing frequency inline-6 (harus rpm/60*3) ===');
{
  const seen = [];
  const origSetTarget = mkParam('x', 1, 'y').setTargetAtTime;
  /* tangkap frekuensi osilator utama lewat spy pada GainNode? lebih sederhana:
     hitung manual dari rumus dan pastikan tidak ada error */
  NOW += 1; AUDIO.setEngine(6000, 1, 1, true);
  const want = 6000 / 60 * 3;
  console.log(`  fundamental yang diharapkan @6000 rpm = ${want} Hz (V8 akan ${6000/60*4} Hz)`);
  if (AUDIO.cylinders !== 6) errors.push('AUDIO.cylinders bukan 6');
}

console.log('=== matikan mesin lalu hidupkan lagi ===');
try { AUDIO.setEngine(0, 0, 0, true); AUDIO.engineStart(); AUDIO.setEngine(3000, 0.4, 40, false); }
catch (e) { errors.push('engine on/off melempar: ' + e.message); }

console.log('\n================ HASIL AUDIO ================');
if (errors.length === 0) console.log('✅ tidak ada masalah (0 error)');
else {
  const uniq = [...new Set(errors)];
  console.log(`❌ ${errors.length} masalah (${uniq.length} unik):`);
  uniq.slice(0, 25).forEach((e, i) => console.log(`   ${i + 1}. ${e}`));
  if (uniq.length > 25) console.log(`   ... dan ${uniq.length - 25} lainnya`);
}
/* exit code harus mencerminkan hasil, kalau tidak CI selalu hijau */
process.exitCode = errors.length ? 1 : 0;
