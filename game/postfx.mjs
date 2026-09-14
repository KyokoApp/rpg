/* ============================================================
   POSTFX — bloom, motion blur, dan volumetrik (god rays).

   Kenapa ditulis tangan dan bukan pakai addon postprocessing?
   Karena addon EffectComposer menarik banyak file tambahan dan
   selalu mengalokasikan beberapa render target penuh. Di sini:

   - SEMUA efek mati  =>  render() langsung ke kanvas. Nol render
     target, nol pass tambahan. Ini jalur default preset Rendah.
   - Render target dialokasikan malas dan dipakai ulang; ukurannya
     mengikuti pixel ratio yang sudah diturunkan oleh quality.
   - Bloom & god rays dihitung di resolusi 1/4 - 1/8. Secara visual
     nyaris tidak bisa dibedakan, tapi biayanya 1/16.
   - Tone mapping (ACES) + konversi sRGB dilakukan manual di pass
     komposit, dengan kurva yang disalin persis dari three r160,
     supaya hasil akhirnya identik dengan render langsung.
       (three hanya menerapkan tone mapping & encoding saat target
        render = null, jadi saat scene dirender ke RT nilainya masih
        linear dan harus di-encode sendiri di sini.)
============================================================ */
import * as THREE from 'three';

/* --- kurva persis dari three r160 (tonemapping_pars_fragment) --- */
const ACES_GLSL = /* glsl */`
vec3 RRTAndODTFit( vec3 v ) {
  vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
  vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
  return a / b;
}
vec3 ACESFilmic( vec3 color, float exposure ) {
  const mat3 ACESInputMat = mat3(
    vec3( 0.59719, 0.07600, 0.02840 ),
    vec3( 0.35458, 0.90834, 0.13383 ),
    vec3( 0.04823, 0.01566, 0.83777 )
  );
  const mat3 ACESOutputMat = mat3(
    vec3(  1.60475, -0.10208, -0.00327 ),
    vec3( -0.53108,  1.10813, -0.07276 ),
    vec3( -0.07367, -0.00605,  1.07602 )
  );
  color *= exposure / 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit( color );
  color = ACESOutputMat * color;
  return clamp( color, 0.0, 1.0 );
}
/* sRGBTransferOETF — dari colorspace_pars_fragment three r160 */
vec3 LinearTosRGB( vec3 v ) {
  return mix( pow( v, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), v * 12.92,
              vec3( lessThanEqual( v, vec3( 0.0031308 ) ) ) );
}
`;

/* Fullscreen triangle: lebih murah dari quad (tidak ada diagonal yang
   dieksekusi dua kali) dan tidak butuh buffer posisi. */
const VS = /* glsl */`
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const BRIGHT_FS = /* glsl */`
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
void main(){
  /* 4-tap downsample: menghaluskan sebelum threshold, mencegah
     highlight kecil berkedip-kedip (flicker) saat kamera bergerak. */
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0,-1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2( 1.0,-1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2( 1.0, 1.0)).rgb;
  c *= 0.25;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  /* soft knee: transisi halus, tanpa garis keras di tepi bloom */
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, l - uThreshold) / max(l, 1e-4);
  gl_FragColor = vec4(c * contrib, 1.0);
}
`;

const BLUR_FS = /* glsl */`
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uDir;      /* sudah dikalikan texel */
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
  c += (texture2D(tSrc, vUv + uDir * 1.3846154).rgb
      + texture2D(tSrc, vUv - uDir * 1.3846154).rgb) * 0.3162162;
  c += (texture2D(tSrc, vUv + uDir * 3.2307692).rgb
      + texture2D(tSrc, vUv - uDir * 3.2307692).rgb) * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}
`;

/* God rays: radial blur dari posisi matahari di layar. */
const RAYS_FS = /* glsl */`
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uCenter;
uniform float uDensity;
uniform float uDecay;
uniform float uWeight;
uniform float uExposure;
void main(){
  vec2 d = (uCenter - vUv) * uDensity;
  vec2 uv = vUv;
  vec3 acc = vec3(0.0);
  float illum = 1.0;
  for (int i = 0; i < 10; i++){
    uv += d;
    acc += texture2D(tSrc, clamp(uv, 0.0, 1.0)).rgb * illum * uWeight;
    illum *= uDecay;
  }
  gl_FragColor = vec4(acc * uExposure, 1.0);
}
`;

const COMPOSITE_FS = /* glsl */`
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform float uExposure;
uniform float uBloom;
uniform float uRays;
uniform float uBlur;        /* kekuatan motion blur 0..1 */
uniform vec2  uBlurDir;     /* arah blur di ruang UV */
uniform float uVignette;
uniform float uCA;          /* chromatic aberration */
uniform float uTime;
uniform float uGrain;
${ACES_GLSL}

/* hash murah untuk film grain — tanpa tekstur tambahan */
float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main(){
  vec2 uv = vUv;
  vec2 fromCenter = uv - 0.5;
  float r2 = dot(fromCenter, fromCenter);

  vec3 color;
  if (uBlur > 0.001){
    /* Motion blur ala Forza: smear radial dari tengah layar (efek
       kecepatan) + komponen arah gerak kamera. Tap count dijaga
       rendah; sisanya ditutupi bloom supaya tetap terasa halus. */
    vec2 dir = uBlurDir + fromCenter * 0.55;
    float len = length(dir);
    dir = len > 1e-4 ? dir / len : vec2(0.0);
    float spread = uBlur * (0.010 + r2 * 0.030);
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 6; i++){
      float t = (float(i) - 2.5) * 0.4;
      float w = 1.0 - abs(t) * 0.28;
      acc += texture2D(tScene, clamp(uv + dir * spread * t, 0.0, 1.0)).rgb * w;
      wsum += w;
    }
    color = acc / wsum;
  } else {
    color = texture2D(tScene, uv).rgb;
  }

  /* Chromatic aberration halus di tepi frame (lensa mahal) */
  if (uCA > 0.0005){
    vec2 off = fromCenter * (r2 * uCA);
    color.r = texture2D(tScene, uv + off).r;
    color.b = texture2D(tScene, uv - off).b;
  }

  color += texture2D(tBloom, uv).rgb * uBloom;
  color += texture2D(tRays, uv).rgb * uRays;

  /* Vignette: memusatkan mata ke tengah, sekaligus menyembunyikan
     pop-in di tepi layar. */
  color *= 1.0 - uVignette * r2 * 1.35;

  color = ACESFilmic(color, uExposure);
  color = LinearTosRGB(color);

  if (uGrain > 0.0005){
    color += (hash(uv * vec2(1024.0, 768.0) + fract(uTime)) - 0.5) * uGrain;
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

function makeRT(w, h, type) {
  return new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
    type,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
}

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = false;
    this.levels = { bloom: 0, motionBlur: 0, volumetric: 0 };
    this._w = 0; this._h = 0; this._type = null;
    this._sceneRT = null; this._a = null; this._b = null; this._raysRT = null;
    this._time = 0;

    /* satu quad dipakai semua pass; material yang ditukar tiap pass */
    this._quadScene = new THREE.Scene();
    this._quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this._quad.frustumCulled = false;
    this._quadScene.add(this._quad);

    const mk = (fs, uniforms) => new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: fs, uniforms,
      depthTest: false, depthWrite: false, toneMapped: false,
    });

    this.matBright = mk(BRIGHT_FS, {
      tSrc: { value: null }, uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 0.72 }, uKnee: { value: 0.35 },
    });
    this.matBlur = mk(BLUR_FS, {
      tSrc: { value: null }, uDir: { value: new THREE.Vector2() },
    });
    this.matRays = mk(RAYS_FS, {
      tSrc: { value: null }, uCenter: { value: new THREE.Vector2(0.5, 0.35) },
      uDensity: { value: 0.021 }, uDecay: { value: 0.94 },
      uWeight: { value: 0.62 }, uExposure: { value: 0.85 },
    });
    this.matComposite = mk(COMPOSITE_FS, {
      tScene: { value: null }, tBloom: { value: null }, tRays: { value: null },
      uExposure: { value: 0.95 }, uBloom: { value: 0 }, uRays: { value: 0 },
      uBlur: { value: 0 }, uBlurDir: { value: new THREE.Vector2() },
      uVignette: { value: 0.34 }, uCA: { value: 0.0 }, uTime: { value: 0 },
      uGrain: { value: 0.0 },
    });

    /* layar putih 1x1: dipakai saat sebuah pass harus dinonaktifkan
       tanpa perlu merangkai ulang shader (menjaga 1 program saja). */
    this._white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    this._white.needsUpdate = true;
  }

  /* ---- konfigurasi dari resolveGfx() ---- */
  configure(g) {
    this.levels.bloom = g.bloomLevel | 0;
    this.levels.motionBlur = g.motionBlurLevel | 0;
    this.levels.volumetric = g.volumetricLevel | 0;
    this.enabled = this.levels.bloom > 0 || this.levels.motionBlur > 0 || this.levels.volumetric > 0;
    this.matComposite.uniforms.uBloom.value = [0, 0.42, 0.72, 1.05][this.levels.bloom] || 0;
    this.matComposite.uniforms.uRays.value = [0, 0.30, 0.55, 0.85][this.levels.volumetric] || 0;
    if (!this.enabled) this._freeTargets();
    return this.enabled;
  }

  /* ---- alokasi / resize ---- */
  _ensureTargets(w, h, type) {
    if (this._sceneRT && this._w === w && this._h === h && this._type === type) return;
    this._freeTargets();
    this._w = w; this._h = h; this._type = type;
    this._sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
    });
    /* sceneRT tidak boleh di-encode sRGB: nilainya harus linear
       supaya ACES di pass komposit benar. */
    this._sceneRT.texture.colorSpace = THREE.LinearSRGBColorSpace;

    const bw = Math.max(2, Math.round(w / 4)), bh = Math.max(2, Math.round(h / 4));
    this._a = makeRT(bw, bh, type);
    this._b = makeRT(bw, bh, type);
    this._raysRT = makeRT(Math.max(2, Math.round(w / 8)), Math.max(2, Math.round(h / 8)), type);
  }

  _freeTargets() {
    for (const rt of [this._sceneRT, this._a, this._b, this._raysRT]) { if (rt) rt.dispose(); }
    this._sceneRT = this._a = this._b = this._raysRT = null;
    this._w = this._h = 0;
  }

  /* ---- render utama ----
     opts: { blur01, blurDir:{x,y}, sunScreen:{x,y}, sunVisible } */
  render(scene, camera, dt = 0, opts = {}) {
    const r = this.renderer;
    if (!this.enabled) { r.setRenderTarget(null); r.render(scene, camera); return; }

    const size = r.getSize(new THREE.Vector2());
    const pr = r.getPixelRatio();
    const w = Math.max(2, Math.round(size.x * pr));
    const h = Math.max(2, Math.round(size.y * pr));
    const halfFloat = r.capabilities.isWebGL2 || r.capabilities.maxTextureSize > 0;
    const type = halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this._ensureTargets(w, h, type);

    this._time += dt;
    const prevTarget = r.getRenderTarget();
    const prevAutoClear = r.autoClear;

    /* 1) scene -> RT linear (tone mapping sengaja tidak diterapkan) */
    r.setRenderTarget(this._sceneRT);
    r.clear();
    r.render(scene, camera);

    const needBloom = this.levels.bloom > 0;
    const needRays = this.levels.volumetric > 0 && opts.sunVisible !== false;

    if (needBloom || needRays) {
      /* 2) bright pass + downsample 1/4 */
      this.matBright.uniforms.tSrc.value = this._sceneRT.texture;
      this.matBright.uniforms.uTexel.value.set(1 / w, 1 / h);
      this.matBright.uniforms.uThreshold.value = needRays ? 0.55 : 0.72;
      this._blit(this.matBright, this._a);

      /* 3) separable blur (ping-pong). Tingkat tinggi = 2 iterasi. */
      const iters = this.levels.bloom >= 3 ? 2 : 1;
      const bw = this._a.width, bh = this._a.height;
      let src = this._a, dst = this._b;
      for (let i = 0; i < iters; i++) {
        const spread = i === 0 ? 1 : 2;
        this.matBlur.uniforms.tSrc.value = src.texture;
        this.matBlur.uniforms.uDir.value.set(spread / bw, 0);
        this._blit(this.matBlur, dst);
        [src, dst] = [dst, src];
        this.matBlur.uniforms.tSrc.value = src.texture;
        this.matBlur.uniforms.uDir.value.set(0, spread / bh);
        this._blit(this.matBlur, dst);
        [src, dst] = [dst, src];
      }
      this.matComposite.uniforms.tBloom.value = needBloom ? src.texture : this._white;

      /* 4) god rays dari bright texture */
      if (needRays) {
        const c = opts.sunScreen || { x: 0.5, y: 0.35 };
        this.matRays.uniforms.tSrc.value = src.texture;
        this.matRays.uniforms.uCenter.value.set(c.x, c.y);
        this.matRays.uniforms.uExposure.value = [0, 0.55, 0.85, 1.2][this.levels.volumetric] || 0;
        this._blit(this.matRays, this._raysRT);
        this.matComposite.uniforms.tRays.value = this._raysRT.texture;
      } else {
        this.matComposite.uniforms.tRays.value = this._white;
      }
    } else {
      this.matComposite.uniforms.tBloom.value = this._white;
      this.matComposite.uniforms.tRays.value = this._white;
    }

    /* 5) komposit + ACES + sRGB -> kanvas */
    const u = this.matComposite.uniforms;
    u.tScene.value = this._sceneRT.texture;
    u.uExposure.value = r.toneMappingExposure;
    const blur01 = this.levels.motionBlur > 0 ? Math.min(1, opts.blur01 || 0) * [0, 0.45, 0.75, 1][this.levels.motionBlur] : 0;
    u.uBlur.value = blur01;
    u.uBlurDir.value.set(opts.blurDir ? opts.blurDir.x : 0, opts.blurDir ? opts.blurDir.y : 0);
    /* CA & grain hanya di tingkat tinggi; keduanya murah tapi
       menambah bandwidth, jadi tidak diberikan gratis. */
    u.uCA.value = this.levels.motionBlur >= 3 ? 0.0022 : this.levels.bloom >= 3 ? 0.0012 : 0;
    u.uGrain.value = this.levels.motionBlur >= 2 ? 0.012 : 0;
    u.uTime.value = this._time;
    u.uVignette.value = 0.30 + blur01 * 0.16;

    r.autoClear = false;
    r.setRenderTarget(null);
    this._blit(this.matComposite, null);
    r.autoClear = prevAutoClear;
    r.setRenderTarget(prevTarget);
  }

  /* fullscreen blit; target=null berarti kanvas */
  _blit(material, target) {
    this._quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this._quadScene, this._quadCam);
  }

  dispose() {
    this._freeTargets();
    for (const m of [this.matBright, this.matBlur, this.matRays, this.matComposite]) m.dispose();
    this._quad.geometry.dispose();
    this._white.dispose();
  }
}
