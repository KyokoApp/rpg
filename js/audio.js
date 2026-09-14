/* ============================================================
   AUDIO ENGINE — 100% sintesis WebAudio, NOL file aset.
   Dua lapis:
     (1) AMBIENT FANTASY  : angin, pad akor, burung, shimmer sihir
     (2) MOBIL            : mesin inline-6 twin-turbo (RPM-driven), wastegate,
                            ban, angin, benturan
   Satu AudioContext untuk semua suara (menghindari bug multi-context di iOS).
   Semua node dibuat sekali di init(), lalu cuma di-update parameternya tiap
   frame -> tidak ada alokasi per frame, tidak ada garbage collection hitch.
============================================================ */

const clamp = (v,a,b)=> v<a?a:(v>b?b:v);

/* ---- akor untuk pad ambient (D aeolian, register rendah biar tidak nabrak mesin) ---- */
const CHORDS = [
  [73.42, 110.00, 146.83, 174.61, 220.00],   // Dm(add9)
  [58.27,  87.31, 116.54, 146.83, 174.61],   // Bb maj7
  [87.31, 110.00, 130.81, 174.61, 220.00],   // F maj7(#11 feel)
  [110.00, 130.81, 164.81, 196.00, 246.94],  // Am7
  [98.00, 116.54, 146.83, 174.61, 233.08],   // Gm9
];
/* ---- nada shimmer: D minor pentatonic oktaf tinggi ---- */
const SHIMMER = [587.33, 698.46, 783.99, 1046.50, 1174.66, 1396.91];

export class AudioEngine {
  constructor(){
    this.ctx=null; this.ok=false; this.muted=false;
    /* Jumlah silinder menentukan firing frequency = rpm/60 x (silinder/2).
       6 = inline-6 twin-turbo (BMW S58, mesin M4 GT3). Set 8 utk karakter V8. */
    this.cylinders=6;
    this._prevThrottle=0; this._wgCd=-1;
    this.noiseBuf=null;
    this._t={ bird:2.5, shimmer:1.2, chord:0 };
    this._chord=0;
    this._engineLoud=0;
  }

  /* ---------- bootstrap: HARUS dipanggil dari user gesture ---------- */
  init(){
    if(this.ctx) return this.ok;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC){ this.ok=false; return false; }
    try { this.ctx = new AC(); } catch(e){ this.ok=false; return false; }
    const ctx = this.ctx;

    /* master chain: gain -> compressor -> LIMITER -> speaker

       Penyebab "kresek-kresek": kompresor saja tidak cukup. Attack 4ms
       masih meloloskan transient tajam (backfire, gigi masuk) dan bus
       mesin + ban + angin + reverb bisa menjumlah > 1.0, yang lalu
       DIPOTONG KERAS oleh DAC -> klik/pop. Rantai baru:
       kompresor meratakan level, lalu soft-clipper (tanh) jadi plafon
       mulus. Sinyal tidak pernah menyentuh 1.0, jadi tidak ada clipping. */
    this.master = ctx.createGain(); this.master.gain.value = this.muted?0:0.72;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value=-18; comp.knee.value=24; comp.ratio.value=3.2;
    comp.attack.value=0.012; comp.release.value=0.18;
    this.limiter = this._makeLimiter();
    this.master.connect(comp); comp.connect(this.limiter); this.limiter.connect(ctx.destination);

    /* reverb "ruang terbuka" — impulse response dibikin prosedural.
       Dipangkas dari 2.6s ke 1.5s: konvolusi stereo 2.6s adalah node
       paling mahal di seluruh graph dan di ponsel ia bikin audio thread
       telat -> buffer underrun -> kresek. 1.5s terdengar sama untuk
       ruang terbuka dan jauh lebih ringan. */
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeIR(1.5, 2.6);
    this.reverbGain = ctx.createGain(); this.reverbGain.gain.value = 0.34;
    this.reverb.connect(this.reverbGain); this.reverbGain.connect(this.master);

    /* bus */
    this.ambientBus = ctx.createGain(); this.ambientBus.gain.value = 0.95; this.ambientBus.connect(this.master);
    this.carBus     = ctx.createGain(); this.carBus.gain.value     = 1.00; this.carBus.connect(this.master);
    this.sendRev    = ctx.createGain(); this.sendRev.gain.value    = 1.00; this.sendRev.connect(this.reverb);

    this._makeNoise();
    this._buildAmbient();
    this._buildEngine();
    this._buildTire();
    this._buildWind();
    this._buildNitro();

    this.ok = true;
    return true;
  }

  resume(){ if(this.ctx && this.ctx.state!=='running'){ this.ctx.resume().catch(()=>{}); } }
  /* Saat tab disembunyikan, matikan context sepenuhnya. Kalau dibiarkan
     berjalan, browser men-throttle timer tapi audio thread tetap minta
     data -> underrun -> "kresek" keras saat pemain kembali. */
  suspend(){ if(this.ctx && this.ctx.state==='running') this.ctx.suspend().catch(()=>{}); }
  setMuted(m){ this.muted=m; if(this.master) this.master.gain.setTargetAtTime(m?0:0.72, this.ctx.currentTime, 0.05); }

  /* Limiter plafon-keras (gain terakhir sebelum speaker).
     Kurva tanh jenuh mulus tepat di bawah 1.0, jadi puncak tajam
     (backfire, NOS meletup, downshift) tidak pernah dipotong keras oleh
     DAC. Oversample 4x supaya harmonik hasil saturasi tidak aliasing
     menjadi "kresek". */
  _makeLimiter(){
    const ctx=this.ctx, len=4096, curve=new Float32Array(len);
    const k=1.6, norm=Math.tanh(k);
    for(let i=0;i<len;i++){
      const x=i*2/len-1;
      /* bagian bawah linear (suara pelang tidak berubah warna),
         bagian atas melengkung lembut */
      curve[i]= Math.abs(x)<0.55 ? x*0.94 : Math.tanh(k*x)/norm;
    }
    const ws=ctx.createWaveShaper(); ws.curve=curve; ws.oversample='4x';
    const trim=ctx.createGain(); trim.gain.value=0.98;
    ws.connect(trim);
    return trim;
  }

  /* Setter param yang "sadar biaya".
     setTargetAtTime dipanggil ~60x/detik untuk puluhan param. Kalau
     nilainya nyaris tidak berubah, panggilan itu hanya membebani audio
     thread (dan di beberapa browser memicu zipper noise karena kurva
     lama dibatalkan terus-menerus). Lewati bila selisihnya < eps. */
  _setP(param, value, tau){
    if(!Number.isFinite(value)) return;
    const last=param.__last;
    if(last!==undefined && Math.abs(last-value) < (Math.abs(value)*0.004 + 1e-4)) return;
    param.__last=value;
    param.setTargetAtTime(value, this.ctx.currentTime, tau);
  }

  /* ---------- utility ---------- */
  _makeIR(seconds, decay){
    const ctx=this.ctx, rate=ctx.sampleRate, len=Math.max(1,(rate*seconds)|0);
    const buf=ctx.createBuffer(2,len,rate);
    for(let ch=0; ch<2; ch++){
      const d=buf.getChannelData(ch);
      let lp=0;
      for(let i=0;i<len;i++){
        const t=i/len;
        const n=(Math.random()*2-1);
        lp += (n-lp)*0.35;                                   // sedikit lowpass biar tidak "putih tajam"
        d[i]= lp * Math.pow(1-t, decay) * (1-Math.exp(-i/220));
      }
    }
    return buf;
  }
  _makeNoise(){
    const ctx=this.ctx, rate=ctx.sampleRate, len=rate*3|0;
    const buf=ctx.createBuffer(1,len,rate), d=buf.getChannelData(0);
    let b0=0,b1=0,b2=0;
    for(let i=0;i<len;i++){                                   // pink-ish noise (lebih natural dari white)
      const w=Math.random()*2-1;
      b0=0.99765*b0+w*0.0990460; b1=0.96300*b1+w*0.2965164; b2=0.57000*b2+w*1.0526913;
      d[i]=(b0+b1+b2+w*0.1848)*0.22;
    }
    this.noiseBuf=buf;
  }
  _softClip(amount){
    const n=2048, c=new Float32Array(n), k=amount;
    const norm=Math.tanh(k);
    for(let i=0;i<n;i++){ const x=i*2/n-1; c[i]=Math.tanh(k*x)/norm; }
    return c;
  }
  _noiseSrc(loop=true){
    const s=this.ctx.createBufferSource();
    s.buffer=this.noiseBuf; s.loop=loop;
    if(!loop) s.playbackRate.value=0.85+Math.random()*0.4;
    return s;
  }

  /* ============================================================
     AMBIENT FANTASY
  ============================================================ */
  _buildAmbient(){
    const ctx=this.ctx;

    /* --- hembusan angin dasar (LFO pelan) --- */
    const wn=this._noiseSrc(true);
    const wlp=ctx.createBiquadFilter(); wlp.type='lowpass'; wlp.frequency.value=420; wlp.Q.value=0.5;
    const whp=ctx.createBiquadFilter(); whp.type='highpass'; whp.frequency.value=90;
    const wg=ctx.createGain(); wg.gain.value=0.045;
    wn.connect(wlp); wlp.connect(whp); whp.connect(wg); wg.connect(this.ambientBus); wg.connect(this.sendRev);
    wn.start();
    const lfo=ctx.createOscillator(); lfo.type='sine'; lfo.frequency.value=0.07;
    const lfoG=ctx.createGain(); lfoG.gain.value=0.022;
    lfo.connect(lfoG); lfoG.connect(wg.gain); lfo.start();
    this._ambWind=wg;

    /* --- pad akor: 5 osc triangle lewat lowpass, pindah akor tiap ~15 detik --- */
    const padLp=ctx.createBiquadFilter(); padLp.type='lowpass'; padLp.frequency.value=780; padLp.Q.value=0.6;
    const padG=ctx.createGain(); padG.gain.value=0.0;
    padLp.connect(padG); padG.connect(this.ambientBus); padG.connect(this.sendRev);
    this._padOsc=[];
    const detune=[-6,4,-3,7,0];
    for(let i=0;i<5;i++){
      const o=ctx.createOscillator(); o.type= i<2 ? 'triangle':'sine';
      o.frequency.value=CHORDS[0][i]; o.detune.value=detune[i];
      const g=ctx.createGain(); g.gain.value= i<2 ? 0.34 : 0.20;
      o.connect(g); g.connect(padLp); o.start();
      this._padOsc.push({o,g});
    }
    /* slow attack biar pad muncul perlahan, tidak "klik" */
    padG.gain.setTargetAtTime(0.085, ctx.currentTime, 4.0);
    this._padG=padG; this._padLp=padLp;

    /* --- "nafas" pad: filter LFO biar terasa hidup --- */
    const plfo=ctx.createOscillator(); plfo.type='sine'; plfo.frequency.value=0.045;
    const plfoG=ctx.createGain(); plfoG.gain.value=240;
    plfo.connect(plfoG); plfoG.connect(padLp.frequency); plfo.start();
  }

  _chirp(){
    const ctx=this.ctx, now=ctx.currentTime;
    const notes=2+((Math.random()*3)|0);
    const base=1900+Math.random()*1500;
    for(let i=0;i<notes;i++){
      const t0=now+i*(0.055+Math.random()*0.05);
      const o=ctx.createOscillator(); o.type='sine';
      const g=ctx.createGain();
      const f0=base*(0.85+Math.random()*0.4);
      o.frequency.setValueAtTime(f0,t0);
      o.frequency.exponentialRampToValueAtTime(f0*(1.35+Math.random()*0.5), t0+0.028);
      o.frequency.exponentialRampToValueAtTime(f0*0.92, t0+0.062);
      g.gain.setValueAtTime(0.0001,t0);
      g.gain.exponentialRampToValueAtTime(0.055+Math.random()*0.03, t0+0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0+0.085);
      const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=f0; bp.Q.value=2.2;
      o.connect(g); g.connect(bp); bp.connect(this.ambientBus); bp.connect(this.sendRev);
      o.start(t0); o.stop(t0+0.11);
    }
  }

  _shimmerPing(){
    const ctx=this.ctx, now=ctx.currentTime;
    const f=SHIMMER[(Math.random()*SHIMMER.length)|0];
    const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
    const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=f*2.005;
    const g=ctx.createGain(); const g2=ctx.createGain();
    g.gain.setValueAtTime(0.0001,now);
    g.gain.exponentialRampToValueAtTime(0.05, now+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now+2.4);
    g2.gain.setValueAtTime(0.0001,now);
    g2.gain.exponentialRampToValueAtTime(0.014, now+0.02);
    g2.gain.exponentialRampToValueAtTime(0.0001, now+1.3);
    o.connect(g); o2.connect(g2);
    g.connect(this.ambientBus); g.connect(this.sendRev);
    g2.connect(this.sendRev);
    o.start(now); o.stop(now+2.5); o2.start(now); o2.stop(now+1.4);
  }

  /* ---------- dipanggil tiap frame dari game loop ---------- */
  updateAmbient(dt, engineLoud01){
    if(!this.ok) return;
    this._engineLoud=engineLoud01;
    /* ducking: ambient turun waktu mesin meraung, biar tidak bertumpuk */
    const target=0.95 - 0.5*engineLoud01;
    this.ambientBus.gain.setTargetAtTime(target, this.ctx.currentTime, 0.35);

    this._t.chord-=dt;
    if(this._t.chord<=0){
      this._t.chord=13+Math.random()*7;
      this._chord=(this._chord+1+((Math.random()*2)|0))%CHORDS.length;
      const c=CHORDS[this._chord], now=this.ctx.currentTime;
      for(let i=0;i<this._padOsc.length;i++)
        this._padOsc[i].o.frequency.setTargetAtTime(c[i], now, 2.2);   // glissando pelan antar akor
    }
    this._t.bird-=dt;
    if(this._t.bird<=0){ this._t.bird=3.5+Math.random()*7; this._chirp(); }
    this._t.shimmer-=dt;
    if(this._t.shimmer<=0){ this._t.shimmer=2.2+Math.random()*5; this._shimmerPing(); }
  }

  /* ============================================================
     MESIN MOBIL — V8, frekuensi dasar = firing frequency (rpm/60 * 4)
  ============================================================ */
  _buildEngine(){
    const ctx=this.ctx;
    const out=ctx.createGain(); out.gain.value=0.0; out.connect(this.carBus);
    const shaper=ctx.createWaveShaper(); shaper.curve=this._softClip(2.6); shaper.oversample='2x';
    const lp=ctx.createBiquadFilter(); lp.type='lowpass';  lp.frequency.value=600; lp.Q.value=0.8;
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=260; bp.Q.value=0.85;
    const body=ctx.createGain(); body.gain.value=1.0;
    body.connect(shaper); shaper.connect(lp); lp.connect(bp); bp.connect(out);

    /* harmonik silinder: sub(0.5) + fundamental(1) + oktaf(2) + kelipatan ganjil */
    const spec=[{r:0.5,t:'sine',g:0.62},{r:1,t:'sawtooth',g:0.40},{r:2,t:'sawtooth',g:0.20},
                {r:3,t:'triangle',g:0.11},{r:4.02,t:'sine',g:0.06}];
    const oscs=[];
    for(const s of spec){
      const o=ctx.createOscillator(); o.type=s.t; o.frequency.value=60;
      const g=ctx.createGain(); g.gain.value=s.g;
      o.connect(g); g.connect(body); o.start();
      oscs.push({o,r:s.r});
    }
    /* geraman kasar: LFO amplitude di frekuensi firing, biar tidak terdengar seperti synth */
    const rough=ctx.createOscillator(); rough.type='sawtooth'; rough.frequency.value=30;
    const roughG=ctx.createGain(); roughG.gain.value=0.10;
    rough.connect(roughG); roughG.connect(body.gain); rough.start();

    /* hisapan udara / intake */
    const inj=this._noiseSrc(true);
    const ibp=ctx.createBiquadFilter(); ibp.type='bandpass'; ibp.frequency.value=850; ibp.Q.value=0.75;
    const ig=ctx.createGain(); ig.gain.value=0.0;
    inj.connect(ibp); ibp.connect(ig); ig.connect(body); inj.start();

    /* siulan turbo (baru kedengaran di RPM atas + throttle besar) */
    const turb=ctx.createOscillator(); turb.type='sine'; turb.frequency.value=1800;
    const turbG=ctx.createGain(); turbG.gain.value=0.0;
    const turbBp=ctx.createBiquadFilter(); turbBp.type='bandpass'; turbBp.frequency.value=2400; turbBp.Q.value=6;
    turb.connect(turbBp); turbBp.connect(turbG); turbG.connect(out); turb.start();
    /* turbo kedua, sedikit detune -> karakter "twin-turbo": dua whistle tidak
       pernah persis senada karena beban/putaran tiap turbo beda tipis */
    const turb2=ctx.createOscillator(); turb2.type='sine'; turb2.frequency.value=1870;
    const turb2G=ctx.createGain(); turb2G.gain.value=0.0;
    const turbBp2=ctx.createBiquadFilter(); turbBp2.type='bandpass'; turbBp2.frequency.value=2520; turbBp2.Q.value=7;
    turb2.connect(turbBp2); turbBp2.connect(turb2G); turb2G.connect(out); turb2.start();

    this.eng={out,lp,bp,oscs,rough,roughG,ig,turb,turbG,turb2,turb2G,body};
  }

  /* rpm: putaran mesin aktual | throttle/load: 0..1 | on: mesin nyala */
  setEngine(rpm, throttle, load, on){
    if(!this.ok) return;
    const now=this.ctx.currentTime, e=this.eng;
    /* firing frequency: tiap silinder menyala sekali per 2 putaran crank */
    const f=Math.max(18, rpm/60*(this.cylinders*0.5));
    const tau=0.035;
    for(const {o,r} of e.oscs) this._setP(o.frequency, f*r, tau);
    /* LFO "kasar" wajib tetap SUB-AUDIO. Sebelumnya f*0.5 bisa mencapai
       215 Hz pada 8600 rpm -> itu bukan getaran lagi melainkan
       amplitude-modulation di rentang dengar, dan bunyinya persis
       "kresek". Dibatasi 28 Hz; karakter "kasar di idle" dijaga lewat
       KEDALAMAN, bukan frekuensi. */
    this._setP(e.rough.frequency, Math.min(28, Math.max(9, f*0.42)), tau);
    this._setP(e.roughG.gain, 0.17 - 0.115*(rpm/8600), 0.08);   // kasar di idle, halus di atas
    this._setP(e.lp.frequency, 340 + f*2.4 + throttle*900, 0.06);
    this._setP(e.bp.frequency, 170 + f*0.85, 0.08);
    const vol = on ? (0.085 + 0.20*load + 0.16*throttle) : 0.0;
    if(Math.abs((e.out.gain.__last??0)-vol) > 0.0004){ e.out.gain.__last=vol; e.out.gain.setTargetAtTime(vol, now, on?0.07:0.30); }
    this._setP(e.ig.gain, on ? (0.03 + 0.30*throttle*(0.35+rpm/12000)) : 0.0, 0.07);
    const turboAmt = on ? clamp((rpm-3600)/5000,0,1) * (0.25+0.75*throttle) : 0;
    this._setP(e.turbG.gain, turboAmt*0.030, 0.09);
    this._setP(e.turb.frequency, 1500 + rpm*0.30, 0.09);
    this._setP(e.turb2G.gain, turboAmt*0.021, 0.12);
    this._setP(e.turb2.frequency, 1560 + rpm*0.315, 0.12);

    /* WASTEGATE / blow-off: lepas gas mendadak di rpm atas -> "stututu".
       Dipicu sekali per transisi (bukan tiap frame) + cooldown 0.30 s. */
    if(on && rpm>3200 && this._prevThrottle-throttle>0.45 && now-this._wgCd>0.30){
      this._wgCd=now;
      this._wastegate(clamp((rpm-3200)/5400,0,1));
    }
    this._prevThrottle=throttle;
  }

  /* ---------- wastegate / blow-off valve flutter ---------- */
  _wastegate(amt=1){
    if(!this.ok || amt<=0) return;
    const ctx=this.ctx, now=ctx.currentTime;
    const n=this._noiseSrc(false);
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=2.2;
    bp.frequency.setValueAtTime(2650,now);
    bp.frequency.exponentialRampToValueAtTime(680,now+0.30);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,now);
    g.gain.exponentialRampToValueAtTime(0.095*amt,now+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,now+0.34);
    n.connect(bp); bp.connect(g); g.connect(this.carBus); g.connect(this.sendRev);
    n.start(now,0,0.4); n.stop(now+0.36);
  }

  /* ---------- ban mencicit ---------- */
  _buildTire(){
    const ctx=this.ctx;
    const n=this._noiseSrc(true);
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2350; bp.Q.value=7.5;
    const bp2=ctx.createBiquadFilter(); bp2.type='bandpass'; bp2.frequency.value=3700; bp2.Q.value=3.0;
    const g=ctx.createGain(); g.gain.value=0.0;
    const g2=ctx.createGain(); g2.gain.value=0.0;
    n.connect(bp); bp.connect(g);
    n.connect(bp2); bp2.connect(g2);
    g.connect(this.carBus); g2.connect(this.carBus); g.connect(this.sendRev);
    n.start();
    this.tire={g,g2,bp,n};
  }
  setTireSlip(slip01, speed01){
    if(!this.ok) return;
    const now=this.ctx.currentTime, s=clamp(slip01,0,1);
    this._setP(this.tire.g.gain, s*0.115*Math.min(1,speed01*2.4), 0.045);
    this._setP(this.tire.g2.gain, s*0.045*Math.min(1,speed01*2.4), 0.05);
    /* TIDAK boleh ada Math.random() di jalur per-frame: frekuensi filter
       yang di-random tiap 16ms terdengar sebagai zipper noise ("krrk"). */
    this._setP(this.tire.bp.frequency, 2000+s*1500, 0.09);
  }

  /* ---------- angin (dipakai jalan kaki & mobil) ---------- */
  _buildWind(){
    const ctx=this.ctx;
    const n=this._noiseSrc(true);
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=320; lp.Q.value=0.4;
    const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=140;
    const g=ctx.createGain(); g.gain.value=0.0;
    n.connect(hp); hp.connect(lp); lp.connect(g); g.connect(this.master);
    n.start();
    this.rush={g,lp};
  }
  setRush(speed01){
    if(!this.ok) return;
    const now=this.ctx.currentTime, s=clamp(speed01,0,1);
    this._setP(this.rush.g.gain, s*s*0.075, 0.12);
    this._setP(this.rush.lp.frequency, 320+s*2200, 0.15);
  }

  /* ---------- one-shot ---------- */
  _burst({freq=1200,q=1,dur=0.25,vol=0.3,type='bandpass',to=0}={}){
    const ctx=this.ctx, now=ctx.currentTime;
    const n=this._noiseSrc(false);
    const f=ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q;
    if(to) f.frequency.exponentialRampToValueAtTime(Math.max(40,to), now+dur);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,now);
    g.gain.exponentialRampToValueAtTime(vol,now+0.006);
    g.gain.exponentialRampToValueAtTime(0.0001,now+dur);
    n.connect(f); f.connect(g); g.connect(this.master); g.connect(this.sendRev);
    /* offset acak dibatasi supaya offset+durasi tidak melewati ujung
       buffer 3 detik; kalau lewat, node berhenti mendadak -> klik. */
    const off = Math.min(Math.random()*2.0, Math.max(0, (this.noiseBuf?this.noiseBuf.duration:3) - dur - 0.08));
    n.start(now, off, dur+0.05); n.stop(now+dur+0.06);
  }

  impact(force=1){
    if(!this.ok) return;
    const ctx=this.ctx, now=ctx.currentTime, f=clamp(force,0.15,1.6);
    const o=ctx.createOscillator(); o.type='sine';
    o.frequency.setValueAtTime(150,now);
    o.frequency.exponentialRampToValueAtTime(36,now+0.24);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,now);
    g.gain.exponentialRampToValueAtTime(0.55*f,now+0.007);
    g.gain.exponentialRampToValueAtTime(0.0001,now+0.40);
    o.connect(g); g.connect(this.master); o.start(now); o.stop(now+0.42);
    this._burst({freq:1400,q:0.8,dur:0.20*f,vol:0.24*f,to:320});
  }
  backfire(){
    if(!this.ok) return;
    const ctx=this.ctx, now=ctx.currentTime;
    const o=ctx.createOscillator(); o.type='square';
    o.frequency.setValueAtTime(210,now); o.frequency.exponentialRampToValueAtTime(60,now+0.09);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,now);
    g.gain.exponentialRampToValueAtTime(0.20,now+0.004);
    g.gain.exponentialRampToValueAtTime(0.0001,now+0.16);
    o.connect(g); g.connect(this.master); g.connect(this.sendRev); o.start(now); o.stop(now+0.18);
    this._burst({freq:900,q:0.6,dur:0.12,vol:0.16,to:200});
  }
  gearShift(){ this._burst({freq:2600,q:2.4,dur:0.05,vol:0.05}); }

  /* ============================================================
     NITRO / NOS — "sssHHH" khas mobil arcade.
     Dibuat SEKALI lalu di-mute/un-mute, bukan dibuat ulang tiap
     dipakai: membuat 3 oscillator + 3 filter tiap kali NOS ditekan
     justru sumber klik, dan mahal di ponsel.
  ============================================================ */
  _buildNitro(){
    const ctx=this.ctx;
    const g=ctx.createGain(); g.gain.value=0;
    /* 1) desis gas bertekanan: noise -> highpass -> bandpass menyempit */
    const n=this._noiseSrc(true);
    const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=900;
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2400; bp.Q.value=1.6;
    const ng=ctx.createGain(); ng.gain.value=0.55;
    n.connect(hp); hp.connect(bp); bp.connect(ng); ng.connect(g);
    /* 2) dorongan rendah: dua sawtooth naik, memberi rasa "ditembak" */
    const o1=ctx.createOscillator(); o1.type='sawtooth'; o1.frequency.value=90;
    const o2=ctx.createOscillator(); o2.type='sawtooth'; o2.frequency.value=136;
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1400; lp.Q.value=3.0;
    const og=ctx.createGain(); og.gain.value=0.30;
    o1.connect(lp); o2.connect(lp); lp.connect(og); og.connect(g);
    g.connect(this.carBus); g.connect(this.sendRev);
    n.start(); o1.start(); o2.start();
    this.nitro={g,ng,og,bp,lp,n,o1,o2};
  }

  /* active: bool. Dipanggil dari car.js hanya saat STATUS berubah. */
  setNitro(active, strength=1){
    if(!this.ok) return;
    const e=this.nitro; if(!e) return;
    const now=this.ctx.currentTime, s=clamp(strength,0.2,1.4);
    if(active && !this._nitroOn){
      this._nitroOn=true;
      /* "pukulan" awal: bandpass menyapu naik, terasa seperti valve membuka */
      e.bp.frequency.cancelScheduledValues(now);
      e.bp.frequency.setValueAtTime(1500,now);
      e.bp.frequency.exponentialRampToValueAtTime(3800,now+0.22);
      e.g.gain.cancelScheduledValues(now);
      e.g.gain.setValueAtTime(0.0001,now);
      e.g.gain.exponentialRampToValueAtTime(0.30*s,now+0.05);
      this._burst({freq:1700,q:1.1,dur:0.16,vol:0.13*s,to:3200});
    } else if(active){
      this._setP(e.g.gain, 0.30*s, 0.06);
    } else if(this._nitroOn){
      this._nitroOn=false;
      e.g.gain.cancelScheduledValues(now);
      e.g.gain.setTargetAtTime(0, now, 0.05);
      /* blow-off saat dilepas */
      this._burst({freq:2600,q:2.0,dur:0.20,vol:0.10,to:900});
    }
  }

  /* ---------- letupan knalpot (exhaust pop / decel "meletup") ----------
     Dibedakan dari backfire(): ini pendek, kering, dan boleh beruntun.
     Dipakai saat lepas gas di kecepatan tinggi dan saat NOS habis. */
  exhaustPop(intensity=1){
    if(!this.ok) return;
    const ctx=this.ctx, now=ctx.currentTime, i=clamp(intensity,0.3,1.6);
    /* throttle keras: maksimal 1 letupan per 55ms supaya tidak jadi
       "kresek" saat beberapa roda/mechanic memicunya bersamaan */
    if(this._popCd && now - this._popCd < 0.055) return;
    this._popCd=now;
    const o=ctx.createOscillator(); o.type='square';
    const f0=150+Math.random()*120;
    o.frequency.setValueAtTime(f0,now);
    o.frequency.exponentialRampToValueAtTime(Math.max(38,f0*0.34),now+0.055);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,now);
    /* attack 9ms (bukan 4ms): cukup cepat untuk terasa menendang,
       cukup lambat untuk tidak berbunyi "klik" */
    g.gain.exponentialRampToValueAtTime(0.13*i,now+0.009);
    g.gain.exponentialRampToValueAtTime(0.0001,now+0.10);
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2200;
    o.connect(lp); lp.connect(g); g.connect(this.carBus); g.connect(this.sendRev);
    o.start(now); o.stop(now+0.12);
    /* percikan api: noise sangat pendek di frekuensi tinggi */
    this._burst({freq:2600+Math.random()*900, q:1.3, dur:0.055, vol:0.075*i, to:900});
  }
  door(open){
    if(!this.ok) return;
    this._burst({freq:open?520:700, q:1.6, dur:0.16, vol:0.14, to:open?260:180});
    const ctx=this.ctx, now=ctx.currentTime;
    const o=ctx.createOscillator(); o.type='triangle';
    o.frequency.setValueAtTime(open?180:120,now);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,now);
    g.gain.exponentialRampToValueAtTime(0.10,now+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,now+0.22);
    o.connect(g); g.connect(this.master); o.start(now); o.stop(now+0.24);
  }
  engineStart(){
    if(!this.ok) return;
    const ctx=this.ctx, now=ctx.currentTime;
    /* starter motor: gerinda pendek lalu mesin nyambar */
    const n=this._noiseSrc(false);
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=420; bp.Q.value=3.2;
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,now);
    g.gain.linearRampToValueAtTime(0.10,now+0.05);
    g.gain.setValueAtTime(0.10,now+0.55);
    g.gain.exponentialRampToValueAtTime(0.0001,now+0.75);
    n.connect(bp); bp.connect(g); g.connect(this.master);
    n.start(now,0,0.8); n.stop(now+0.82);
  }
  uiClick(){
    if(!this.ok) return;
    const ctx=this.ctx, now=ctx.currentTime;
    const o=ctx.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(1180,now);
    o.frequency.exponentialRampToValueAtTime(760,now+0.05);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,now);
    g.gain.exponentialRampToValueAtTime(0.055,now+0.005);
    g.gain.exponentialRampToValueAtTime(0.0001,now+0.09);
    o.connect(g); g.connect(this.master); o.start(now); o.stop(now+0.1);
  }
  /* chime ambil orb — menggantikan chime() lama supaya satu context */
  pickup(step=0){
    if(!this.ok) return;
    const ctx=this.ctx, now=ctx.currentTime;
    const notes=[660,880,1320];
    const base=Math.pow(2, Math.min(step,7)/12);            // naik setengah nada tiap orb beruntun
    notes.forEach((f,i)=>{
      const t0=now+i*0.055;
      const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=f*base;
      const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=f*base*2.01;
      const g=ctx.createGain(), g2=ctx.createGain();
      g.gain.setValueAtTime(0.0001,t0);
      g.gain.exponentialRampToValueAtTime(0.11,t0+0.018);
      g.gain.exponentialRampToValueAtTime(0.0001,t0+0.55);
      g2.gain.setValueAtTime(0.0001,t0);
      g2.gain.exponentialRampToValueAtTime(0.025,t0+0.018);
      g2.gain.exponentialRampToValueAtTime(0.0001,t0+0.30);
      o.connect(g); o2.connect(g2);
      g.connect(this.master); g.connect(this.sendRev);
      g2.connect(this.sendRev);
      o.start(t0); o.stop(t0+0.6); o2.start(t0); o2.stop(t0+0.35);
    });
  }
}

export const AUDIO = new AudioEngine();
