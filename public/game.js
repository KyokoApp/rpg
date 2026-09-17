/* Rumput Lebat — padang rumput prosedural tak terbatas (Three.js r160).
 *
 * Gaya baru: KARTUN / cel-shaded — gradien LEMBUT (bukan pita kasar), warna
 * satu famili (tidak bentrok), outline tipis cokelat hangat (bukan hitam tebal).
 *
 * RONDE INI (perbaikan dari gaya kasar sebelumnya)
 *  + Shading dihaluskan: smoothstep menggantikan band keras; mid-tone 0.62–1.0
 *    sehingga tidak pernah gelap pekat / putih berlebih; rim & edge light tipis.
 *  + HUE dijaga: ambient memakai abu-abu netral (bukan pendar biru), jadi warna
 *    dasar benteng/bola/rumput tidak kebiruan & tidak bentrok satu sama lain.
 *  + Outline: cokelat gelap hangat & tipis (bukan hitam tebal) — membaca tepi
 *    bentuk tanpa membuat kesan "kotor".
 *  + Palet disatukan: batu pirus-hijau hangat + atap giok senada + tanah hijau
 *    pastel — seluruh scene dalam satu temperatur warna.
 *  + Posterisasi rumput dikurangi (4 → 3 tingkat) supaya lembut.
 *
 * RONDE SEBELUMNYA (tetap dipertahankan)
 *  + Benteng batu dekat spawn: menara drum ganda yang SALING MENIMPA, dinding
 *    batu antar menara, gerbang, atap kerucut, base bersusun — bukan tiang datar.
 *    Bola memantul & rumput dibersihkan di dalam benteng.
 *  + Optimasi: resolusi adaptif, recycle rumput dihemat, bebas bocor VRAM.
 *  + Visual: matahari, awan, burung, kupu-kupu.
 *
 * Semua kontrol, tombol kualitas, fisika, dan atribusi yang dijamin tes
 * DIJAGA PERSIS.
 */
import * as THREE from './three.module.js';

function terrainH(x, z) {
  return 0.7 * Math.sin(x * 0.045) * Math.cos(z * 0.05) +
         0.35 * Math.sin(x * 0.11 + 1.7) * Math.cos(z * 0.13 + 2.3);
}

const canvas = document.getElementById('c');
const isTouch = matchMedia('(pointer: coarse)').matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
/* resolusi adaptif: langit-langit per jenis perangkat, lantai saat FPS turun */
const PR_MAX = isTouch ? 1.25 : 1.75;
const PR_MIN = isTouch ? 0.6 : 0.9;
let prCurrent = Math.min(devicePixelRatio || 1, PR_MAX);
renderer.setPixelRatio(prCurrent);
renderer.setSize(innerWidth, innerHeight);

const FOG_COLOR = new THREE.Color(0xbcd9ee);
const FOG_DENSITY = 0.017;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), FOG_DENSITY);
scene.background = new THREE.Color(FOG_COLOR.getHex());
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);

/* lampu klasik dijaga (tidak terpakai shader toon, tapi jaga kompatibilitas) */
scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x3a5f2a, 1));
const sun = new THREE.DirectionalLight(0xfff1cf, 1.4);
sun.position.set(60, 90, 30);
scene.add(sun);

/* ------------------------------------------------------------------ toon
 * Cel-shading: warna dibentuk dari pita NdotL (mid-tone, tak pernah hitam
 * pekat / putih penuh) + rim light + outline gelap di silhouette.          */
const TOON_LIGHTS = {
  uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.35).normalize() },
  uColorSun: { value: new THREE.Color(0xfff2d0) },
  uHemiSky: { value: new THREE.Color(0xbfe3f5) },
  uHemiGround: { value: new THREE.Color(0x3a5f2a) },
};
const TOON_VERT = `
varying vec3 vN; varying vec3 vV; varying float vDist;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * w;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = mv.xyz;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const TOON_FRAG = `
uniform vec3 uBase; uniform vec3 uSunDir; uniform vec3 uColorSun;
uniform vec3 uHemiSky; uniform vec3 uHemiGround;
uniform float uSteps; uniform vec3 uFogColor; uniform float uFogDensity;
varying vec3 vN; varying vec3 vV; varying float vDist;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(-vV);
  /* gradien LEMBUT: mid-tone, tidak pernah gelap pekat / putih penuh */
  float shade = clamp(dot(N, normalize(uSunDir)) * 0.5 + 0.5, 0.0, 1.0);
  shade = shade * shade * (3.0 - 2.0 * shade);          /* smoothstep     */
  float tone = 0.62 + 0.38 * shade;                     /* 0.62 .. 1.0    */
  float hemi = N.y * 0.5 + 0.5;
  /* abu-abu netral menjaga HUE dasar tetap utuh (tidak kebiruan)      */
  vec3 col = uBase * (0.74 + 0.26 * hemi) * tone;
  col += uHemiSky * hemi * 0.05 * tone;                 /* pantul langit halus */
  col += uColorSun * smoothstep(0.6, 1.0, shade) * 0.12;
  float ndv = abs(dot(N, V));
  float fres = pow(1.0 - ndv, 3.5);
  col += uColorSun * fres * 0.14;                       /* rim lembut tipis */
  float edge = smoothstep(0.20, 0.48, ndv);
  col *= mix(0.85, 1.0, edge);                          /* gelap ujung halus */
  float f = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;
/* outline inverted-hull: brown gelap hangat & tipis, bukan hitam pekat */
const hullMat = new THREE.MeshBasicMaterial({ color: 0x4a3b2a, side: THREE.BackSide });
function toonMat(base, o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: new THREE.Color(base) },
      uSunDir: { value: TOON_LIGHTS.uSunDir.value },
      uColorSun: { value: TOON_LIGHTS.uColorSun.value },
      uHemiSky: { value: TOON_LIGHTS.uHemiSky.value },
      uHemiGround: { value: TOON_LIGHTS.uHemiGround.value },
      uSteps: { value: o.steps || 4 },
      uFogColor: { value: FOG_COLOR },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: TOON_VERT,
    fragmentShader: TOON_FRAG,
    side: o.side || THREE.FrontSide,
  });
}

/* ---- kubah langit (gradien asli dipertahankan) ---- */
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(280, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x4d8ecf) },
      bot: { value: new THREE.Color(0xd8e9f5) },
    },
    vertexShader: 'varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 top,bot;varying vec3 vP;void main(){float h=clamp(normalize(vP).y*1.6+0.12,0.0,1.0);gl_FragColor=vec4(mix(bot,top,h),1.0);}',
  })
);
scene.add(sky);

/* ---- matahari nyata: piringan + halo senja ---- */
const sunGroup = new THREE.Group();
const sunDisc = new THREE.Mesh(
  new THREE.SphereGeometry(9, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff4cf, fog: false, depthWrite: false })
);
const sunHalo = new THREE.Mesh(
  new THREE.SphereGeometry(22, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, transparent: true,
    uniforms: { uColor: { value: new THREE.Color(0xffd9a0) } },
    vertexShader: 'varying vec3 vN;void main(){vN=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 uColor;varying vec3 vN;void main(){float a=pow(clamp(vN.z,0.0,1.0),3.0);gl_FragColor=vec4(uColor,.32*a);}',
  })
);
sunGroup.add(sunDisc);
sunGroup.add(sunHalo);
scene.add(sunGroup);

/* ---- awan prosedural ---- */
const cloudsGroup = new THREE.Group();
scene.add(cloudsGroup);
const cloudDefs = [];

/* ---- tanah ---- */
const groundGeo = new THREE.PlaneGeometry(130, 130, 42, 42);
const ground = new THREE.Mesh(groundGeo, toonMat(0x6fae5a));
ground.rotation.x = -Math.PI / 2;
ground.frustumCulled = false;
scene.add(ground);

let gCX = 0, gCZ = 0;
function updateGroundHeights(cx, cz) {
  gCX = cx; gCZ = cz;
  ground.position.set(cx, 0, cz);
  const p = groundGeo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, terrainH(cx + p.getX(i), cz - p.getY(i)));
  p.needsUpdate = true;
  groundGeo.computeVertexNormals();
}
updateGroundHeights(0, 0);

/* ---- rumput: garis bilah + shader instansial (dari sesi sebelumnya) ---- */
const TRAIL_N = 24, SEG = 4, MAXC = 6;
function buildBlade() {
  const p = [], uv = [], idx = [];
  for (let s = 0; s < SEG; s++) {
    const t = s / SEG, w = 0.038 * (1 - t * 0.92);
    p.push(-w, t, 0, w, t, 0);
    uv.push(0, t, 1, t);
  }
  p.push(0, 1, 0);
  uv.push(0.5, 1);
  for (let s = 0; s < SEG - 1; s++) {
    const a = 2 * s;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  idx.push(2 * (SEG - 1), 2 * SEG, 2 * (SEG - 1) + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const grassUniforms = {
  uTime: { value: 0 },
  uBallPos: { value: new THREE.Vector2() },
  uBallVel: { value: new THREE.Vector2() },
  uTrail: { value: Array.from({ length: TRAIL_N }, () => new THREE.Vector4()) },
  uColliders: { value: Array.from({ length: MAXC }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uFogColor: { value: FOG_COLOR },
  uFogDensity: { value: FOG_DENSITY },
};

const grassVert = `
#define TRAIL_N ${TRAIL_N}
#define MAXC ${MAXC}
attribute vec2 aOffset;attribute vec4 aData;
uniform float uTime;uniform vec2 uBallPos,uBallVel;uniform vec4 uTrail[TRAIL_N];uniform vec4 uColliders[MAXC];varying vec3 vColor;varying float vDepth;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float terrainH(vec2 p){return 0.7*sin(p.x*0.045)*cos(p.y*0.05)+0.35*sin(p.x*0.11+1.7)*cos(p.y*0.13+2.3);}
void main(){
vec3 p=position;float t=uv.y;float ca=cos(aData.x),sa=sin(aData.x);p=vec3(p.x*ca,p.y,p.x*sa);p.xz*=mix(0.8,1.3,hash(aOffset+7.0));p.y*=aData.y;
vec2 world=aOffset,dBall=world-uBallPos;float dBallL=length(dBall);
float cull=0.0;for(int i=0;i<MAXC;i++){vec4 cc=uColliders[i];if(cc.w>0.001){float dl2=dot(world-cc.xy,world-cc.xy);if(dl2<cc.z*cc.z)cull=1.0;}}
if(cull>0.5){gl_Position=vec4(0.0,0.0,2.0,1.0);vColor=vec3(0.0);vDepth=0.0;return;}
float lod=mix(1.0,0.55,smoothstep(18.0,40.0,dBallL));p.y*=lod;vec2 bend=vec2(0.0);float flat_=0.0;
float n=noise(world*0.35+vec2(uTime*0.9,uTime*0.7)+aData.w*6.28);float gust=noise(world*0.06+vec2(uTime*0.25,uTime*0.18));bend+=normalize(vec2(0.8,0.55))*(0.05+0.30*gust)*n;
float vlen=length(uBallVel);vec2 vdir=vlen>0.001?uBallVel/vlen:vec2(1.0,0.0);float infl=1.0-smoothstep(0.0,1.35,dBallL);
if(infl>0.001){vec2 dir=dBallL>0.001?dBall/dBallL:vec2(1.0,0.0);float front=clamp(dot(dir,vdir),0.0,1.0)*clamp(vlen/9.0,0.0,1.0);bend+=dir*infl*(0.55+0.65*front);flat_=max(flat_,infl*0.85);}
for(int i=0;i<TRAIL_N;i++){vec4 tr=uTrail[i];if(tr.z>0.004){vec2 d=world-tr.xy;float dl=length(d);float ti=(1.0-smoothstep(0.0,1.05,dl))*tr.z;if(ti>0.004){flat_=max(flat_,ti);bend+=(dl>0.001?d/dl:vec2(1.0,0.0))*ti*0.4;}}}
p.xz+=bend*t*t*lod;p.y*=1.0-0.8*flat_;p.x*=1.0+0.5*flat_;p.y+=terrainH(world);
vec3 base=vec3(0.045,0.105,0.022);vec3 tip=mix(vec3(0.30,0.55,0.10),vec3(0.52,0.66,0.17),aData.z);float flower=step(0.982,hash(aOffset*3.1));vec3 col=mix(base,tip,pow(t,0.75));col*=mix(0.5,1.0,smoothstep(0.0,0.32,t));col*=0.88+0.24*hash(aOffset);col+=vec3(0.06,0.10,0.015)*n*smoothstep(0.55,1.0,t);col=mix(col,vec3(0.93,0.92,0.80),flower*smoothstep(0.72,1.0,t));
vec4 mv=modelViewMatrix*vec4(p+vec3(world.x,0.0,world.y),1.0);vDepth=-mv.z;vColor=col;gl_Position=projectionMatrix*mv;}`;

const grassMat = new THREE.ShaderMaterial({
  uniforms: grassUniforms,
  vertexShader: grassVert,
  /* posterize halus agar rumput ikut bergaya kartun */
  fragmentShader: 'uniform vec3 uFogColor;uniform float uFogDensity;varying vec3 vColor;varying float vDepth;void main(){vec3 q=floor(vColor*3.0+0.5)/3.0;float f=1.0-exp(-uFogDensity*uFogDensity*vDepth*vDepth);gl_FragColor=vec4(mix(q,uFogColor,clamp(f,0.0,1.0)),1.0);}',
  side: THREE.DoubleSide,
});

let grassMesh = null, offAttr = null, BLADE_COUNT = 0;
const SPAWN_R = 41;

function initGrass(count) {
  if (grassMesh) {
    scene.remove(grassMesh);
    grassMesh.geometry.dispose();      /* geometry instansial lama ikut dibuang */
    grassMesh = null;
  }
  BLADE_COUNT = count;
  const base = buildBlade();
  const geo = new THREE.InstancedBufferGeometry();
  geo.setIndex(base.index);
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));

  const offs = new Float32Array(count * 2);
  const datas = new Float32Array(count * 4);
  /* sebaran disk O(n): radius akar-uniform + sudut acak (tidak perlu reject) */
  for (let i = 0; i < count; i++) {
    const r = SPAWN_R * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    offs[i * 2] = Math.cos(a) * r;
    offs[i * 2 + 1] = Math.sin(a) * r;
    datas.set([
      Math.random() * Math.PI * 2,
      0.75 + Math.random() * 0.8,
      Math.random(),
      Math.random(),
    ], i * 4);
  }
  base.dispose();                      /* geometry sumber sekali pakai juga dibuang */

  offAttr = new THREE.InstancedBufferAttribute(offs, 2);
  offAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aOffset', offAttr);
  geo.setAttribute('aData', new THREE.InstancedBufferAttribute(datas, 4));
  geo.instanceCount = count;

  grassMesh = new THREE.Mesh(geo, grassMat);
  grassMesh.frustumCulled = false;
  scene.add(grassMesh);
}

function recycleGrass(bx, bz) {
  if (!offAttr) return;
  const arr = offAttr.array;
  const R2 = (SPAWN_R + 1) ** 2;
  let changed = false;
  for (let i = 0; i < BLADE_COUNT; i++) {
    const dx = arr[i * 2] - bx, dz = arr[i * 2 + 1] - bz;
    if (dx * dx + dz * dz > R2) {
      const r = SPAWN_R * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      arr[i * 2] = bx + Math.cos(a) * r;
      arr[i * 2 + 1] = bz + Math.sin(a) * r;
      changed = true;
    }
  }
  if (changed) offAttr.needsUpdate = true;
}

/* ---- bola + outline kartun + bayangan blob ---- */
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 32, 24),
  toonMat(0xff7043)
);
const ballOutline = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), hullMat);
ballOutline.scale.setScalar(1.07);   /* tipis: outline halus, bukan tepi tebal */
ball.add(ballOutline);
scene.add(ball);

const blob = new THREE.Mesh(
  new THREE.CircleGeometry(0.62, 24),
  new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.28, depthWrite: false })
);
blob.rotation.x = -Math.PI / 2;
scene.add(blob);

/* ---- orbs ---- */
const orbMat = toonMat(0xffd54a, { side: THREE.DoubleSide });
const orbGeo = new THREE.SphereGeometry(0.26, 16, 12);
const orbs = [];
for (let i = 0; i < 30; i++) {
  const m = new THREE.Mesh(orbGeo, orbMat);
  const r = 6 + Math.random() * 32, a = Math.random() * Math.PI * 2;
  m.userData = { px: Math.cos(a) * r, pz: Math.sin(a) * r, ph: Math.random() * Math.PI * 2 };
  scene.add(m);
  orbs.push(m);
}

/* ---- burung (sayap dua bidang melambai) ---- */
const birds = [];
for (let i = 0; i < 6; i++) {
  const g = new THREE.Group();
  const wingGeo = new THREE.PlaneGeometry(0.9, 0.32);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0x2a3542, side: THREE.DoubleSide, fog: false });
  const lw = new THREE.Mesh(wingGeo, wingMat);
  const rw = new THREE.Mesh(wingGeo, wingMat);
  lw.position.x = -0.5; rw.position.x = 0.5;
  g.add(lw); g.add(rw);
  g.userData = {
    l: lw, r: rw,
    x: (Math.random() - 0.5) * 160,
    y: 14 + Math.random() * 22,
    z: (Math.random() - 0.5) * 160,
    s: 3 + Math.random() * 3,
    ph: Math.random() * Math.PI * 2,
  };
  scene.add(g);
  birds.push(g);
}

/* ---- kupu-kupu ---- */
const butterflies = [];
for (let i = 0; i < 10; i++) {
  const g = new THREE.Group();
  const wingGeo = new THREE.PlaneGeometry(0.16, 0.1);
  const wingMat = new THREE.MeshBasicMaterial({
    color: i % 2 ? 0xffd54a : 0xff8ac2, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
  });
  const lw = new THREE.Mesh(wingGeo, wingMat);
  const rw = new THREE.Mesh(wingGeo, wingMat);
  lw.position.x = -0.08; rw.position.x = 0.08;
  g.add(lw); g.add(rw);
  g.userData = {
    l: lw, r: rw,
    x: (Math.random() - 0.5) * 80,
    y: 0.5 + Math.random() * 1.4,
    z: (Math.random() - 0.5) * 80,
    s: 2 + Math.random() * 2,
    ph: Math.random() * Math.PI * 2,
  };
  scene.add(g);
  butterflies.push(g);
}

/* ---- awan (gumpal bola melayang, dibuat sekali lalu digeser) ---- */
for (let i = 0; i < 8; i++) {
  const g = new THREE.Group();
  const n = 3 + ((Math.random() * 3) | 0);
  for (let j = 0; j < n; j++) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(6 + Math.random() * 12, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: false, depthWrite: false })
    );
    s.position.set(j * 9 - n * 4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 6);
    s.scale.y = 0.45 + Math.random() * 0.2;
    g.add(s);
  }
  const u = { x: (Math.random() - 0.5) * 400, y: 40 + Math.random() * 40, z: (Math.random() - 0.5) * 400, s: 0.5 + Math.random() * 1.2 };
  g.userData = u;
  g.position.set(u.x, u.y, u.z);
  cloudsGroup.add(g);
  cloudDefs.push(g);
}

/* ============================================================ benteng batu
 * Menara berdrum ganda saling menimpa + dinding batu antar menara + gerbang,
 * berdiri di base bersusun tiga tingkat. Bukan tiang datar.                 */
const FORT_X = 12, FORT_Z = 13;
const FORT_Y = terrainH(FORT_X, FORT_Z);
const fortress = new THREE.Group();
const fortressCircles = [];

const stoneMat = toonMat(0x9fa08b);      /* satu famili pirus-hijau hangat */
const stoneDark = toonMat(0x888a74);
const roofMat = toonMat(0x92b1a5);      /* giok lembut, senada dengan batu  */
const flagMat = toonMat(0x4c6e66, { side: THREE.DoubleSide });  /* bendera tirkis tua */

function addPart(mesh, o = {}) {
  fortress.add(mesh);
  if (o.hull !== false) {
    const h = new THREE.Mesh(mesh.geometry, hullMat);
    h.position.copy(mesh.position);
    h.rotation.copy(mesh.rotation);
    h.scale.setScalar(o.pad || 1.045);
    fortress.add(h);
  }
  return mesh;
}
function cyl(rt, rb, h, mat, x, y, z, o) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 22), mat);
  m.position.set(x, y, z);
  return addPart(m, o);
}
function cone(r, h, mat, x, y, z, o) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 18), mat);
  m.position.set(x, y, z);
  return addPart(m, o);
}
function box(w, hh, d, mat, x, y, z, o) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
  m.position.set(x, y, z);
  return addPart(m, o);
}

/* base bersusun tiga tingkat (terraced) */
cyl(6.6, 6.8, 1.0, stoneDark, 0, 0.5, 0, { pad: 1.03 });
cyl(5.2, 5.4, 0.9, stoneMat, 0, 1.45, 0, { pad: 1.04 });
cyl(4.4, 4.5, 0.6, stoneDark, 0, 2.2, 0, { pad: 1.05 });

/* menara pusat (keep) */
cyl(2.4, 2.6, 5.4, stoneMat, 0, 5.0, 0);
cone(3.0, 3.2, roofMat, 0, 9.3, 0, { pad: 1.05 });
cyl(0.5, 0.6, 0.8, roofMat, 0, 10.9, 0, { hull: false });

/* tiang bendera + bendera */
cyl(0.06, 0.06, 1.8, stoneDark, 0, 11.8, 0, { hull: false });
const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.85), flagMat);
flag.position.set(0.76, 12.4, 0);
fortress.add(flag);

/* empat menara sudut: drum ganda saling menimpa */
const T = [[-3, -3], [3, -3], [-3, 3], [3, 3]];
for (const [cx, cz] of T) {
  cyl(2.0, 2.1, 3.6, stoneMat, cx, 2.8, cz);     /* drum bawah */
  cyl(1.4, 1.55, 2.6, stoneDark, cx, 5.6, cz);   /* drum atas menimpa */
  cone(2.2, 2.6, roofMat, cx, 8.2, cz, { pad: 1.06 });
  cyl(0.22, 0.22, 0.7, roofMat, cx, 9.6, cz, { hull: false });
}

/* dinding batu antar menara (menimpa kedua ujung menara) */
const WY = 3.0, WH = 2.6, WT = 1.4;
box(6.6, WH, WT, stoneMat, 0, WY, -3);
box(6.6, WH, WT, stoneMat, 0, WY, 3);
box(WT, WH, 7.4, stoneMat, -3, WY, 0);
box(WT, WH, 7.4, stoneMat, 3, WY, 0);
/* bubungan (cap) di atas dinding */
box(6.9, 0.5, 1.7, stoneDark, 0, WY + WH / 2 + 0.3, -3, { hull: false });
box(6.9, 0.5, 1.7, stoneDark, 0, WY + WH / 2 + 0.3, 3, { hull: false });
box(1.7, 0.5, 7.7, stoneDark, -3, WY + WH / 2 + 0.3, 0, { hull: false });
box(1.7, 0.5, 7.7, stoneDark, 3, WY + WH / 2 + 0.3, 0, { hull: false });

/* gerbang (sisi menghadap spawn) */
box(1.1, 3.4, 1.1, stoneDark, -1.1, 3.7, -3.3);
box(1.1, 3.4, 1.1, stoneDark, 1.1, 3.7, -3.3);
box(3.4, 0.9, 1.1, stoneDark, 0, 5.5, -3.3);
/* obor kecil di gerbang */
cyl(0.09, 0.09, 1.8, stoneDark, -2.1, 4.6, -3.5, { hull: false });
cyl(0.09, 0.09, 1.8, stoneDark, 2.1, 4.6, -3.5, { hull: false });
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc36b, fog: false });
for (const sx of [-2.1, 2.1]) {
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), flameMat);
  flame.position.set(sx, 5.6, -3.5);
  fortress.add(flame);
}

fortress.position.set(FORT_X, FORT_Y, FORT_Z);
scene.add(fortress);

/* collider lingkaran benteng (bola memantul & rumput dibersihkan di dalam) */
fortressCircles.push({ x: FORT_X, z: FORT_Z, r: 6.6 });
grassUniforms.uColliders.value[0].set(FORT_X, FORT_Z, 6.9, 1);
for (let i = 1; i < MAXC; i++) grassUniforms.uColliders.value[i].set(0, 0, 0, 0);

/* ---- input ---- */
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => (keys[e.code] = false));

/* ---- kamera orbit ---- */
let camYaw = 0.6, camPitch = 0.42, camDist = 7.5, dragId = null, lastX = 0, lastY = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (dragId !== null) return;
  dragId = e.pointerId; lastX = e.clientX; lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== dragId) return;
  camYaw -= (e.clientX - lastX) * 0.005;
  camPitch = Math.min(1.15, Math.max(0.12, camPitch + (e.clientY - lastY) * 0.004));
  lastX = e.clientX; lastY = e.clientY;
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(ev, (e) => { if (e.pointerId === dragId) dragId = null; });
}
addEventListener('wheel', (e) => { camDist = Math.min(15, Math.max(4, camDist + e.deltaY * 0.01)); }, { passive: true });

/* ---- touch: joystick + tombol lompat ---- */
const joy = document.getElementById('joy'), knob = document.getElementById('knob'), jumpBtn = document.getElementById('jump');
let joyVec = { x: 0, y: 0 }, joyActive = false, joyId = null;
function resetJoy() { joyActive = false; joyId = null; joyVec = { x: 0, y: 0 }; knob.style.left = '50%'; knob.style.top = '50%'; }
if (isTouch) {
  joy.style.display = 'block';
  jumpBtn.style.display = 'flex';
  document.getElementById('hint').textContent = 'Joystick — gerak · Drag — kamera';
  function moveJoy(e) {
    const r = joy.getBoundingClientRect();
    let dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
    const l = Math.hypot(dx, dy), max = r.width / 2 - 8;
    if (l > max) { dx *= max / l; dy *= max / l; }
    joyVec = { x: dx / max, y: dy / max };
    knob.style.left = (50 + dx / max * 38) + '%';
    knob.style.top = (50 + dy / max * 38) + '%';
  }
  joy.addEventListener('pointerdown', (e) => {
    if (joyActive) return;
    joyActive = true; joyId = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    moveJoy(e);
  });
  joy.addEventListener('pointermove', (e) => { if (joyActive && e.pointerId === joyId) moveJoy(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    joy.addEventListener(ev, (e) => { if (e.pointerId === joyId) resetJoy(); });
  }
  jumpBtn.addEventListener('pointerdown', () => { keys.Space = true; setTimeout(() => { keys.Space = false; }, 120); });
}
addEventListener('blur', () => { for (const k in keys) keys[k] = false; dragId = null; resetJoy(); });

/* ---- audio ---- */
let audioCtx = null;
function pop() {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(520, audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(980, audioCtx.currentTime + 0.08);
  g.gain.setValueAtTime(0.18, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.16);
  o.connect(g).connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + 0.18);
}

/* ---- state ---- */
const pos = new THREE.Vector3(0, 0.5 + terrainH(0, 0), 0);
const vel = new THREE.Vector3();
let grounded = true, vy = 0, score = 0, running = false;
const scoreEl = document.getElementById('score');

document.querySelectorAll('#start .btn').forEach((b) => b.addEventListener('click', () => {
  try {
    initGrass(parseInt(b.dataset.n, 10));
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) { audioCtx = new Audio(); audioCtx.resume().catch(console.warn); }
    } catch (e) { console.warn('Audio tidak tersedia', e); }
    document.getElementById('start').style.display = 'none';
    running = true;
  } catch (err) {
    document.getElementById('error').textContent = 'Gagal memulai: ' + err.message;
    console.error(err);
  }
}));

const GRAV = 22, ACCEL = 34, FRICTION = 5.5, MAXV = 9, JUMPV = 8.2;
const clock = new THREE.Clock();
let trailTimer = 0, recycleTimer = 0;
const lastTrail = new THREE.Vector2(1e9, 1e9);
const axis = new THREE.Vector3(), target = new THREE.Vector3();
ball.position.copy(pos);
camera.position.set(4, 5, 7);
camera.lookAt(pos);

/* ---- governor resolusi adaptif ---- */
let fpsSmooth = 60, prTimer = 0;

/* ---- janitor render list ---- */
let janitorTimer = 0;
const SUN_OFFSET = new THREE.Vector3(240, 150, -80);

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  const time = clock.elapsedTime;
  grassUniforms.uTime.value = time;

  if (running) {
    let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    let iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    if (isTouch && joyActive) { ix = joyVec.x; iz = -joyVec.y; }
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    let mx = fx * iz - fz * ix, mz = fz * iz + fx * ix;
    const ml = Math.hypot(mx, mz);
    if (ml > 0.001) {
      mx /= ml; mz /= ml;
      vel.x += mx * ACCEL * dt;
      vel.z += mz * ACCEL * dt;
    }
    let sp = Math.hypot(vel.x, vel.z);
    if (sp > MAXV) { vel.x *= MAXV / sp; vel.z *= MAXV / sp; sp = MAXV; }
    const damp = Math.exp(-FRICTION * dt);
    vel.x *= damp; vel.z *= damp;
    pos.x += vel.x * dt; pos.z += vel.z * dt;

    /* benteng: tabrakan lingkaran sederhana — bola memantul, tak menembus */
    for (const c of fortressCircles) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d2 = dx * dx + dz * dz;
      const mmin = c.r + 0.5;
      if (d2 < mmin * mmin && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * mmin;
        pos.z = c.z + (dz / d) * mmin;
        vel.x *= 0.32; vel.z *= 0.32;
      }
    }

    const gY = terrainH(pos.x, pos.z);
    if (grounded && keys.Space) { vy = JUMPV; grounded = false; pop(); }
    if (!grounded) {
      vy -= GRAV * dt; pos.y += vy * dt;
      if (pos.y <= gY + 0.5) { pos.y = gY + 0.5; grounded = true; vy = 0; }
    } else pos.y = gY + 0.5;

    if (sp > 0.05) ball.rotateOnWorldAxis(axis.set(vel.z, 0, -vel.x).normalize(), sp * dt / 0.5);
    ball.position.copy(pos);
    blob.position.set(pos.x, gY + 0.03, pos.z);
    const airH = pos.y - (gY + 0.5);
    blob.material.opacity = Math.max(0.05, 0.28 - airH * 0.06);
    blob.scale.setScalar(1 + airH * 0.25);

    /* jejak trail */
    trailTimer -= dt;
    if (grounded && sp > 1.2 && trailTimer <= 0) {
      const dx = pos.x - lastTrail.x, dz = pos.z - lastTrail.y;
      if (dx * dx + dz * dz > 0.25) {
        const tr = grassUniforms.uTrail.value;
        for (let i = TRAIL_N - 1; i > 0; i--) tr[i].copy(tr[i - 1]);
        tr[0].set(pos.x, pos.z, 1, 0);
        lastTrail.set(pos.x, pos.z);
        trailTimer = 0.05;
      }
    }
    for (const t of grassUniforms.uTrail.value) if (t.z > 0) t.z *= Math.exp(-dt * 0.55);

    grassUniforms.uBallPos.value.set(pos.x, pos.z);
    grassUniforms.uBallVel.value.set(vel.x, vel.z);

    /* recycle rumput dihemat: 0.5 detik, hanya bila bergerak */
    recycleTimer -= dt;
    if (recycleTimer <= 0) {
      if (sp > 0.05) recycleGrass(pos.x, pos.z);
      recycleTimer = 0.5;
    }

    /* orbs */
    for (const o of orbs) {
      const oy = terrainH(o.userData.px, o.userData.pz) + 0.75 + Math.sin(time * 2 + o.userData.ph) * 0.15;
      o.position.set(o.userData.px, oy, o.userData.pz);
      o.rotation.y = time * 1.5;
      const dx = pos.x - o.userData.px, dz = pos.z - o.userData.pz;
      if (dx * dx + dz * dz < 1.2) {
        score++;
        scoreEl.textContent = 'orbs: ' + score;
        pop();
        const r = 6 + Math.random() * 32, a = Math.random() * Math.PI * 2;
        o.userData.px = pos.x + Math.cos(a) * r;
        o.userData.pz = pos.z + Math.sin(a) * r;
      }
    }

    if (Math.abs(pos.x - gCX) > 6 || Math.abs(pos.z - gCZ) > 6) {
      updateGroundHeights(Math.round(pos.x / 4) * 4, Math.round(pos.z / 4) * 4);
    }

    /* kamera */
    const ch = Math.sin(camPitch) * camDist + 0.6, cd = Math.cos(camPitch) * camDist;
    target.set(pos.x + Math.sin(camYaw) * cd, pos.y + ch, pos.z + Math.cos(camYaw) * cd);
    camera.position.lerp(target, 1 - Math.exp(-8 * dt));
    camera.lookAt(pos.x, pos.y + 0.9, pos.z);

    /* kupu-kupu: melayang acak & menghindar dari bola */
    for (const b of butterflies) {
      const u = b.userData;
      let tx = u.x + 3 * Math.sin(time * u.s + u.ph);
      let tz = u.z + 3 * Math.cos(time * u.s * 0.7 + u.ph);
      const dx = tx - pos.x, dz = tz - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 9) {
        const l = Math.sqrt(d2) || 0.001;
        const push = (3 - Math.sqrt(d2)) * 0.5;
        tx += dx / l * push; tz += dz / l * push;
      }
      const ty = terrainH(tx, tz) + 0.7 + Math.sin(time * 2 + u.ph) * 0.4;
      b.position.set(tx, ty, tz);
      b.rotation.y = Math.atan2(tx - u.x, tz - u.z);
      u.x = tx; u.z = tz;
      const flap = Math.sin(time * 22 + u.ph) * 0.9;
      u.l.rotation.y = flap; u.r.rotation.y = -flap;
    }

    /* governor: sesuaikan pixel ratio dengan frame time */
    prTimer += dt;
    if (prTimer > 1) {
      prTimer = 0;
      const instFps = dt > 0 ? 1 / dt : 60;
      fpsSmooth = fpsSmooth * 0.85 + instFps * 0.15;
      let next = prCurrent;
      if (fpsSmooth < 40) next = prCurrent * 0.85;
      else if (fpsSmooth > 55) next = prCurrent * 1.1;
      next = Math.min(PR_MAX, Math.max(PR_MIN, next));
      if (Math.abs(next - prCurrent) > 0.04) {
        prCurrent = next;
        renderer.setPixelRatio(prCurrent);
        renderer.setSize(innerWidth, innerHeight);
      }
    }
  }

  /* burung: melayang lintas langit (tetap hidup saat menu) */
  for (const b of birds) {
    const u = b.userData;
    u.x += u.s * dt;
    if (u.x > 120) u.x = -120;
    b.position.set(u.x, u.y + Math.sin(time * 0.7 + u.ph) * 2, u.z);
    b.rotation.y = Math.PI / 2;
    b.rotation.x = Math.sin(time * 3 + u.ph) * 0.15;
    const flap = Math.sin(time * 6 + u.ph) * 0.7;
    u.l.rotation.z = flap; u.r.rotation.z = -flap;
  }

  /* awan: hanyut pelan */
  for (let i = 0; i < cloudDefs.length; i++) {
    const g = cloudDefs[i];
    const u = g.userData;
    u.x += u.s * dt;
    if (u.x > 320) u.x = -320;
    g.position.x = u.x;
  }

  /* matahari, awan, dan kubah langit menempel pada posisi kamera */
  sunGroup.position.copy(camera.position).add(SUN_OFFSET);
  cloudsGroup.position.copy(camera.position);
  sky.position.copy(camera.position);

  /* janitor render list (alokasi per objek terbuang pada sesi panjang) */
  janitorTimer += dt;
  if (janitorTimer > 12) {
    janitorTimer = 0;
    if (renderer.renderLists) renderer.renderLists.dispose();
  }

  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
tick();
