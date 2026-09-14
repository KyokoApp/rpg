/* ============================================================
   CAR — model, fisika, efek.

   KONVENSI SUMBU (penting; kalau diubah, model-nya harus ikut):
   - forward dunia = (sin(yaw), 0, cos(yaw)); steer kanan (input +1) membuat
     yaw BERKURANG. Lebar mobil di X, tinggi di Y.
   - Model (procedural maupun GLB) digambar dengan NOSE di -Z lokal, karena
     root diputar `rotation.y = yaw + PI` -> nose dunia = forward.
     Diverifikasi headless: dot(nose, arah gerak) = +1.000.
   - Konsekuensinya +X lokal = sisi KANAN mobil.

   Model: procedural (bawaan) ATAU GLB eksternal.
   loadModel('./car.glb') otomatis mengganti model procedural kalau
   filenya ada — jadi aset asli tinggal di-drop tanpa ubah kode game.
============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CAR_CFG = {
  /* --- dimensi (meter) --- */
  length: 4.55, width: 1.92, height: 1.18,
  wheelbase: 2.62, track: 1.60, wheelRadius: 0.34, wheelWidth: 0.28,
  mass: 1380,
  /* --- performa ---
     maxSpeed 72 m/s (259 km/j): dunia sekarang 24x24 km dengan jalan
     kerajaan selebar 16 m, jadi kecepatan tinggi benar-benar terpakai.
     dragK diturunkan otomatis dari angka ini (lihat constructor). */
  maxSpeed: 72.0, reverseSpeed: 12.0,
  /* Gaya dorong ditentukan oleh HASIL KALI peakTorque x finalDrive, dan
     hasil kali itu dijaga ~konstan (342 x 4.70 = 242 x 6.65 = ~1608) supaya
     akselerasi tidak berubah waktu top speed dinaikkan. Yang berubah hanya
     rpm per m/s: gigi 6 sekarang ~7800 rpm di 259 km/j (di bawah shiftUp
     7950), jadi keenam gigi tetap kepakai semua. Rasa gearbox close-ratio
     ala CarX Street dipertahankan. */
  peakTorque: 342,          // Nm di poros mesin (sudah termasuk faktor gearing pendek)
  idleRpm: 900, redline: 8600, revLimit: 8800,
  shiftUp: 7950, shiftDown: 3300,
  gears: [3.35, 2.28, 1.68, 1.28, 1.00, 0.82],
  reverse: 1.60, finalDrive: 4.70,
  mu: 1.28,                 // koefisien gesek ban (kering)
  driveWeightFrac: 0.62,    // porsi berat di roda penggerak (RWD)
  /* --- handling --- */
  maxSteer: 0.60, steerRate: 6.5, steerReturn: 9.5,
  gripRecover: 3.6, handbrakeGrip: 1.15, slipGenHandbrake: 0.95, slipGenPower: 0.30,
  /* --- nitro --- */
  nitroMax: 100, nitroDrain: 34, nitroRegen: 9, nitroBoost: 1.55,
  modelNoseFlip: false,   // set true kalau GLB eksternal malah menghadap belakang
  /* --- rem --- */
  brakeForce: 15000, handbrakeForce: 9000,
};

const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
const damp=(a,b,l,dt)=>lerp(a,b,1-Math.pow(0.001,dt*l));

/* outline shell non-instanced: extrude sepanjang normal, tebal konstan */
function outlineMat(color, thickness){
  const m=new THREE.MeshBasicMaterial({color,side:THREE.BackSide,fog:false});
  m.onBeforeCompile=(sh)=>{
    sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>',
      `\n#include <begin_vertex>\ntransformed += normalize(normal) * ${thickness.toFixed(4)};\n`);
  };
  return m;
}

/* scratch vectors — dipakai ulang supaya tidak ada alokasi per frame */
const _fwd=new THREE.Vector3(), _des=new THREE.Vector3(), _look=new THREE.Vector3();
const _AXX=new THREE.Vector3(1,0,0), _AXY=new THREE.Vector3(0,1,0);
const _qSpin=new THREE.Quaternion(), _qSteer=new THREE.Quaternion();

/* ============================================================
   PIPELINE MODEL GLB — fungsi murni, bisa diuji headless
   (tanpa GLTFLoader) di tests/car.model.test.mjs.

   Konvensi akhir: NOSE model harus di -Z lokal. Deteksi arah nose
   memakai nama roda ("Front"/"Rear") kalau ada, dan sebagai cadangan
   membandingkan posisi DUNIA roda depan vs belakang — posisi lokal
   node tidak boleh dipakai: di car.glb repositori ini transformasi
   disimpan sebagai `matrix` node dan vertex di-bake, sehingga
   `object.position` sering (0,0,0) padahal roda ada di tempat lain.
============================================================ */
const WHEEL_NAME_RE=/wheel|roda/i;
/* "SteeringWheel" (setir) BUKAN roda kendaraan — car.glb di repo ini punya
   46 segmen setir interior yang namanya mengandung "Wheel". Harus disaring
   atau semuanya ikut berputar ikut-ikutan. */
const NOT_WHEEL_RE=/steering|setir/i;
const FRONT_NAME_RE=/front|depan/i;
const REAR_NAME_RE=/rear|belakang|back/i;

function _hasMeshDescendant(o){
  let found=false;
  o.traverse(c=>{ if(c.isMesh) found=true; });
  return found;
}
function _isAncestor(anc, node){
  let c=node.parent;
  while(c){ if(c===anc) return true; c=c.parent; }
  return false;
}

/* Cari GROUP roda (node bukan-mesh yang punya mesh di bawahnya dan namanya
   mengandung "wheel"/"roda"). Dua aturan penting:

   1. Node "container" (mis. `Wheel1A_3D_00` yang memayungi keempat roda)
      TIDAK boleh dianimasikan — kalau diputar, keempat roda berputar
      sebagai satu benda kaku. Container dikenali: ada kandidat lain di
      dalam subtreenya.
   2. Mesh anak (ban/velg) yang kebetulan namanya mengandung "wheel"
      (mis. `polySurface1_Tire:..._Wheel1A_...`) juga tidak ikut — rotasi
      harus dipasang di group RODA UTAMA, bukan di semua mesh ban/rim anak,
      karena kalau keduanya diputar roda berputar DOBEL.

   Hasil: {wheels:[{node, z}] (urutan terurut z dunia), front:Set, rear:Set}
   atau null kalau kandidat roda kurang dari 2. */
export function detectCarWheels(root){
  const named=[];
  root.traverse(o=>{
    const nm=o.name||'';
    if(o!==root && WHEEL_NAME_RE.test(nm) && !NOT_WHEEL_RE.test(nm)) named.push(o);
  });
  const groups=named.filter(o=>!o.isMesh && _hasMeshDescendant(o));
  const candidates=groups.filter(g=>!groups.some(h=>h!==g && _isAncestor(g,h)));
  if(candidates.length<2) return null;
  root.updateMatrixWorld(true);
  const pv=new THREE.Vector3();
  const withZ=candidates.map(w=>{ w.getWorldPosition(pv); return {node:w, z:pv.z}; });
  withZ.sort((a,b)=>a.z-b.z);
  const namedFront=withZ.filter(x=>FRONT_NAME_RE.test(x.node.name||''));
  const namedRear=withZ.filter(x=>REAR_NAME_RE.test(x.node.name||''));
  let front, rear, byName, selected=withZ;
  if(namedFront.length>=1 && namedRear.length>=1){
    /* Pasangan front/rear yang lengkap dipercaya: hanya node bernama itu
       yang dianggap roda (node "roda" anonim lain diabaikan). */
    front=namedFront; rear=namedRear; byName=true;
    selected=[...namedFront, ...namedRear];
  } else {
    /* Tidak ada nama front/rear yang lengkap. Kita BELUM tahu arah nose,
       jadi pasang asumsi sementara "nose di -Z" (konvensi internal):
       sisi z kecil = roda depan. Kalau ternyata model harus di-flip
       (CAR_CFG.modelNoseFlip), alignCarModel menukar set-nya. */
    const zmid=(withZ[0].z+withZ[withZ.length-1].z)/2;
    front=withZ.filter(x=>x.z<zmid);
    rear=withZ.filter(x=>x.z>=zmid);
    byName=false;
  }
  return {
    wheels:selected,
    front:new Set(front.map(x=>x.node)),
    rear:new Set(rear.map(x=>x.node)),
    byName,
  };
}

/* Arah nose relatif terhadap sumbu Z DUNIA (setelah sumbu terpanjang
   diluruskan ke Z): -1 = nose sudah menunjuk -Z, +1 = nose menunjuk +Z
   (harus di-flip), 0 = tidak bisa ditentukan. */
export function modelNoseSign(frontSet, rearSet){
  if(!frontSet||!rearSet||frontSet.size===0||rearSet.size===0) return 0;
  const avg=set=>{ let z=0; const p=new THREE.Vector3();
    set.forEach(w=>{ w.getWorldPosition(p); z+=p.z; });
    return z/set.size; };
  const zf=avg(frontSet), zr=avg(rearSet);
  /* ambang relatif terhadap rentang z semua roda (model bisa di-author
     dalam cm — car.glb di repo ini di-scale 0.01 oleh node root-nya) */
  let zmin=Infinity, zmax=-Infinity;
  const scan=set=>set.forEach(w=>{ const p=new THREE.Vector3(); w.getWorldPosition(p);
    if(p.z<zmin) zmin=p.z; if(p.z>zmax) zmax=p.z; });
  scan(frontSet); scan(rearSet);
  const span=Math.max(1e-9, zmax-zmin);
  if(Math.abs(zf-zr)<span*0.02) return 0;
  return zf<zr ? -1 : +1;
}

/* Luruskan model GLB mobil ke konvensi internal:
   - sumbu terpanjang -> Z (tanpa memiringkan sumbu Y-up),
   - nose -> -Z di frame kontainer (auto-detect dari roda;
     CAR_CFG.modelNoseFlip sebagai override manual — flip
     DITERAPKAN PERSIS SEKALI, bukan dua kali),
   - skala sehingga panjang = cfg.length, dipusatkan, dan ban napak
     sedikit "tenggelam" di atas tanah.
   Semua transformasi penyelarasan dipasang di GROUP HOLDER baru, bukan
   di node root GLB — karena root GLB sering sudah membawa rotasi author
   (car.glb di repo ini: node root berotasi -90° di sumbu X) dan menulis
   .rotation pada node itu akan MENIMPA rotasi author, bukan menambah flip.
   Melempar Error kalau model kosong/tidak punya mesh (supaya loadModel
   bisa jatuh ke model procedural). */
export function alignCarModel(m, cfg){
  let hasMesh=false;
  m.traverse(o=>{ if(o.isMesh) hasMesh=true; });
  if(!hasMesh) throw new Error('model GLB tidak punya mesh — model kosong');

  const holder=new THREE.Group();
  holder.name='carAlignedRoot';
  holder.add(m);
  holder.updateMatrixWorld(true);
  const size=new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3());
  if(size.x>size.z) holder.rotation.y=-Math.PI/2;    // holder masih identitas -> Euler aman
  holder.updateMatrixWorld(true);

  /* deteksi roda & arah nose (posisi dunia, bukan posisi lokal node) */
  const wheels=detectCarWheels(holder);
  let nose=0;
  if(wheels && wheels.byName) nose=modelNoseSign(wheels.front, wheels.rear);
  if(nose===0) nose=CAR_CFG.modelNoseFlip ? +1 : -1;      // tidak bisa ditebak -> asumsi (atau override manual)
  else if(CAR_CFG.modelNoseFlip) nose=-nose;              // override manual: balikkan deteksi
  if(nose>0){
    holder.rotation.y+=Math.PI;                           // flip SEKALI supaya nose berakhir di -Z
    if(wheels && !wheels.byName){                         // set z-based harus ikut dibalik
      const tmp=wheels.front; wheels.front=wheels.rear; wheels.rear=tmp;
    }
  }
  holder.updateMatrixWorld(true);

  const b2=new THREE.Box3().setFromObject(holder);
  const s2=b2.getSize(new THREE.Vector3());
  const sc=cfg.length/Math.max(0.001,s2.z);
  holder.scale.multiplyScalar(sc);
  holder.updateMatrixWorld(true);
  const b3=new THREE.Box3().setFromObject(holder);
  const c3=b3.getCenter(new THREE.Vector3());
  holder.position.x-=c3.x;
  holder.position.z-=c3.z;
  holder.position.y-=b3.min.y-cfg.wheelRadius*0.06;   // ban sedikit "tenggelam" biar napak
  m.traverse(o=>{
    if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; o.frustumCulled=false; }
  });
  return {scale:sc, nose, wheels, holder};
}

/* Perbaiki color-space & filtering texture material GLB.
   flipY dan wrapping TIDAK disentuh — GLTFLoader sudah menyetelnya
   sesuai spesifikasi glTF (flipY=false), dan mengubahnya merusak UV. */
export function fixCarModelMaterials(root){
  root.traverse(o=>{
    if(!o.isMesh) return;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    for(const mm of mats){
      if(!mm) continue;
      for(const k of ['map','emissiveMap']){
        const t=mm[k];
        if(t){
          t.colorSpace=THREE.SRGBColorSpace;           // warna = data sRGB
          t.minFilter=THREE.LinearMipmapLinearFilter;  // trilinear mipmap
          t.magFilter=THREE.LinearFilter;
          t.needsUpdate=true;
        }
      }
      if(mm.normalMap){
        mm.normalMap.minFilter=THREE.LinearMipmapLinearFilter;
        mm.normalMap.magFilter=THREE.LinearFilter;
        mm.normalMap.needsUpdate=true;                 // normal map tetap linear (NoColorSpace)
      }
    }
  });
}

/* Bungkus tiap group roda dengan PIVOT di frame model-yang-sudah-diluruskan
   (sumbu panjang=Z, up=Y, poros roda=X). Pivot inilah yang berputar
   (spin) dan berputar yaw (steer) — group roda aslinya tidak disentuh
   lagi, jadi transformasi yang di-author di GLB (matrix node, tilt,
   scale) tetap utuh dan tidak dirotasi dobel.

   Hasil: [{pivot, group, front, baseQ}] atau null. */
export function buildWheelPivots(m, det){
  if(!det) return null;
  const out=[];
  m.updateMatrixWorld(true);
  const mW=new THREE.Matrix4().copy(m.matrixWorld);
  const A=new THREE.Matrix4();
  for(const w of det.wheels){
    w.node.updateWorldMatrix(true,false);
    /* transformasi roda di frame aligned (mW^-1 * world).
       PIVOT disimpan IDENTITAS di pusat roda; transformasi author
       RODA UTUH dipindah ke node roda (anak pivot). Animasi
       (steer+spin) kemudian ditulis langsung di pivot — yaitu di
       frame aligned, SUMBU X = poros roda.
       Ini PENTING: beberapa GLB menulis roda kanan sebagai salinan
       roda kiri yang dirotasi ~180° (car.glb di repo ini begitu:
       matriks 3DWheel Front R memetakan X->-X, Z->-Z). Kalau animasi
       dikomposisikan di SEBELAH KANAN rotasi author (baseQ*Qy*Qx),
       rotasi 180° itu mengonjugasi spin dan ARAH PUTARAN roda kanan
       TERTUKAR. Dengan pivot identitas, spin/steer diterapkan di
       frame aligned SEBELUM orientasi roda — arah putaran konsisten
       untuk semua roda. */
    A.copy(mW).invert().multiply(w.node.matrixWorld);
    const pivot=new THREE.Group();
    pivot.name='carWheelPivot';
    pivot.position.setFromMatrixPosition(A);
    m.add(pivot);
    pivot.add(w.node);
    w.node.position.set(0,0,0);
    w.node.quaternion.setFromRotationMatrix(A);
    w.node.scale.setFromMatrixScale(A);
    out.push({pivot, group:w.node, front:det.front.has(w.node), baseQ:new THREE.Quaternion()});
  }
  return out;
}

/* ============================================================
   SKID MARK — satu draw call, ring buffer quad + alpha per vertex
============================================================ */
class SkidTrail {
  constructor(max=460){
    this.max=max; this.head=0; this.anyAlive=false;
    const pos=new Float32Array(max*4*3);
    const col=new Float32Array(max*4*4);
    const idx=new Uint16Array(max*6);
    for(let i=0;i<max;i++){
      const v=i*4,o=i*6;
      idx[o]=v;idx[o+1]=v+1;idx[o+2]=v+2;idx[o+3]=v;idx[o+4]=v+2;idx[o+5]=v+3;
    }
    const g=new THREE.BufferGeometry();
    this.posAttr=new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr=new THREE.BufferAttribute(col,4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position',this.posAttr); g.setAttribute('color',this.colAttr);
    g.setIndex(new THREE.BufferAttribute(idx,1));
    this.life=new Float32Array(max);
    const m=new THREE.MeshBasicMaterial({
      vertexColors:true, transparent:true, depthWrite:false, side:THREE.DoubleSide,
      polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4,
    });
    this.mesh=new THREE.Mesh(g,m);
    this.mesh.frustumCulled=false; this.mesh.renderOrder=3;
    this.mesh.visible=false;
  }
  add(x,y,z,dirX,dirZ,w,len,strength){
    const i=this.head; this.head=(this.head+1)%this.max;
    const px=-dirZ, pz=dirX;                       // perpendicular
    const hw=w*0.5, hl=len*0.5;
    const P=this.posAttr.array, C=this.colAttr.array;
    const corners=[[-hl,-hw],[-hl,hw],[hl,hw],[hl,-hw]];
    for(let k=0;k<4;k++){
      const vi=(i*4+k)*3;
      P[vi  ]=x+dirX*corners[k][0]+px*corners[k][1];
      P[vi+1]=y+0.022+Math.random()*0.004;
      P[vi+2]=z+dirZ*corners[k][0]+pz*corners[k][1];
      const ci=(i*4+k)*4;
      C[ci]=0.055; C[ci+1]=0.048; C[ci+2]=0.042; C[ci+3]=clamp(strength,0,1)*0.85;
    }
    this.life[i]=1.0;
    this.posAttr.needsUpdate=true; this.colAttr.needsUpdate=true;
    this.mesh.visible=true; this.anyAlive=true;
  }
  update(dt){
    if(!this.anyAlive) return;
    const C=this.colAttr.array; let alive=false;
    const decay=Math.pow(0.5, dt/4.5);              // half-life 4.5 detik
    for(let i=0;i<this.max;i++){
      if(this.life[i]<=0) continue;
      this.life[i]*=decay;
      if(this.life[i]<0.012){
        this.life[i]=0;
        for(let k=0;k<4;k++) C[(i*4+k)*4+3]=0;
      } else {
        alive=true;
        for(let k=0;k<4;k++) C[(i*4+k)*4+3]=this.life[i]*0.85;
      }
    }
    this.colAttr.needsUpdate=true;
    this.anyAlive=alive;
    if(!alive) this.mesh.visible=false;
  }
}

/* ============================================================
   DEBU / ASAP BAN — Points dengan shader sendiri (alpha per partikel)
============================================================ */
class Dust {
  constructor(n=160, fogColor=0xe8bf8d){
    this.n=n; this.head=0;
    const pos=new Float32Array(n*3), life=new Float32Array(n), size=new Float32Array(n);
    const vel=new Float32Array(n*3);
    this.vel=vel;
    const g=new THREE.BufferGeometry();
    this.posAttr=new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage);
    this.lifeAttr=new THREE.BufferAttribute(life,1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position',this.posAttr); g.setAttribute('aLife',this.lifeAttr);
    g.setAttribute('aSize',new THREE.BufferAttribute(size,1));
    for(let i=0;i<n;i++) size[i]=0.5+Math.random()*0.9;
    const c=document.createElement('canvas'); c.width=c.height=64;
    const x=c.getContext('2d');
    const gr=x.createRadialGradient(32,32,1,32,32,31);
    gr.addColorStop(0,'rgba(255,255,255,0.95)'); gr.addColorStop(0.45,'rgba(255,255,255,0.35)');
    gr.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=gr; x.fillRect(0,0,64,64);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    this.mat=new THREE.ShaderMaterial({
      transparent:true, depthWrite:false,
      uniforms:{ map:{value:tex}, fogColor:{value:new THREE.Color(fogColor)}, fogNear:{value:80}, fogFar:{value:380} },
      vertexShader:`attribute float aLife; attribute float aSize; varying float vA; varying float vD;
        void main(){ vA=aLife; vec4 mv=modelViewMatrix*vec4(position,1.0); vD=-mv.z;
          gl_PointSize=aSize*(340.0/max(1.0,-mv.z))*(0.35+aLife*1.15);
          gl_Position=projectionMatrix*mv; }`,
      fragmentShader:`uniform sampler2D map; uniform vec3 fogColor; uniform float fogNear,fogFar;
        varying float vA; varying float vD;
        void main(){ if(vA<=0.001) discard; vec4 t=texture2D(map,gl_PointCoord);
          float f=smoothstep(fogNear,fogFar,vD);
          vec3 col=mix(vec3(0.78,0.72,0.63),fogColor,f*0.85);
          gl_FragColor=vec4(col, t.a*vA*0.50*(1.0-f*0.6)); }`,
    });
    this.points=new THREE.Points(g,this.mat);
    this.points.frustumCulled=false; this.points.renderOrder=4;
  }
  spawn(x,y,z,vx,vy,vz,life){
    const i=this.head; this.head=(this.head+1)%this.n;
    const P=this.posAttr.array;
    P[i*3]=x; P[i*3+1]=y; P[i*3+2]=z;
    this.vel[i*3]=vx; this.vel[i*3+1]=vy; this.vel[i*3+2]=vz;
    this.lifeAttr.array[i]=life;
  }
  update(dt){
    const P=this.posAttr.array, L=this.lifeAttr.array, V=this.vel;
    for(let i=0;i<this.n;i++){
      if(L[i]<=0) continue;
      L[i]-=dt*0.85;
      if(L[i]<0) L[i]=0;
      P[i*3]  +=V[i*3]*dt;   P[i*3+1]+=V[i*3+1]*dt; P[i*3+2]+=V[i*3+2]*dt;
      V[i*3]*=Math.pow(0.35,dt); V[i*3+2]*=Math.pow(0.35,dt);
      V[i*3+1]+=dt*0.55;                                  // asap naik
    }
    this.posAttr.needsUpdate=true; this.lifeAttr.needsUpdate=true;
  }
}

/* ============================================================
   CAR
============================================================ */
export class Car {
  constructor(scene, opts={}){
    this.scene=scene;
    this.cfg=CAR_CFG;
    this.terrainH=opts.terrainH || ((x,z)=>0);
    this.colliders=opts.colliders || [];
    this.limit=opts.limit || 200;
    this.waterY=opts.waterY ?? -0.9;
    this.audio=opts.audio || null;

    /* --- state --- */
    this.pos=new THREE.Vector3(0,0,0);
    this.yaw=Math.PI; this.pitch=0; this.roll=0;
    this.speed=0; this.slip=0; this.slip01=0; this.steer=0; this.yawRate=0;
    this.rpm=CAR_CFG.idleRpm; this.gear=1; this.shiftTimer=0; this.limiter=false;
    this.throttle=0; this.brake=0; this.handbrake=false; this.steerInput=0;
    this.nitro=CAR_CFG.nitroMax; this.nitroActive=false;
    this.engineOn=false; this.occupied=false; this.spawned=false;
    this.wheelAngle=0; this.tractionSlip=0; this.suspension=0; this.cameraShake=0;
    this.kmh=0; this.slope=0;
    this._impactCd=0;

    /* --- scene graph --- */
    this.root=new THREE.Group();               // posisi + yaw
    this.body=new THREE.Group();               // pitch + roll + suspensi
    this.root.add(this.body);
    scene.add(this.root);

    this.wheels=[];        // {group, spinMesh, isFront}
    this.lightMats=[];
    this.brakeMats=[];

    this.buildProcedural();
    this.skid=new SkidTrail(460); scene.add(this.skid.mesh);
    this.dust=new Dust(170); scene.add(this.dust.points);
    this.buildSummonFx();

    /* dragKoef diturunkan supaya kecepatan puncak = maxSpeed PERSIS.
       Harus pakai rpm yang benar-benar terjadi di gigi tertinggi pada maxSpeed;
       kalau pakai rpm tebak-tebakan, terminal speed meleset beberapa m/s. */
    const gTop=CAR_CFG.gears.length-1;
    const rpmAtMax=(CAR_CFG.maxSpeed/(2*Math.PI*CAR_CFG.wheelRadius))*60
                   *CAR_CFG.gears[gTop]*CAR_CFG.finalDrive;
    const topForce=this._driveForce(gTop, clamp(rpmAtMax,CAR_CFG.idleRpm,CAR_CFG.revLimit));
    this.dragK=Math.max(0.18,(topForce-this._rollF())/(CAR_CFG.maxSpeed*CAR_CFG.maxSpeed));
    this.rpmAtMax=rpmAtMax;
    this.root.visible=false;
  }

  /* ---------- force helpers ---------- */
  _rollF(){ return 0.016*this.cfg.mass*9.81; }
  _torqueCurve(rpm){
    const n=clamp((rpm-700)/(this.cfg.redline-700),0,1);
    /* Kurva mesin balap NA: torsi naik cepat, puncak LEBAR mulai ~62% redline,
       lalu cuma turun sedikit di ujung. Ini penting: kalau torsi jatuh di dekat
       redline, gigi atas tidak pernah punya tenaga buat nutup jarak ke titik
       upshift dan mobil mentok di gigi tengah. */
    const rise=clamp(n/0.62,0,1), fall=clamp((n-0.62)/0.38,0,1);
    return 0.62 + 0.66*Math.pow(rise,0.55) - 0.42*Math.pow(fall,2.2);
  }
  _driveForce(gearIdx, rpm){
    const g=gearIdx<0 ? -this.cfg.reverse : this.cfg.gears[gearIdx];
    return this.cfg.peakTorque*this._torqueCurve(rpm)*Math.abs(g)*this.cfg.finalDrive/this.cfg.wheelRadius;
  }

  /* ============================================================
     MODEL PROCEDURAL — gaya toon biar senada dengan dunia
  ============================================================ */
  buildProcedural(){
    const C=this.cfg;
    const g=new THREE.Group();
    this.procedural=g;

    const ramp=(()=>{
      /* Toon ramp 4 langkah sebagai texture RGBA8 eksplisit.
         SEBELUMNYA memakai THREE.RedFormat — format 1 kanal itu bermasalah di
         beberapa GPU Android (shading menggelap/merah) dan tidak portable.
         RGBA 8-bit dijamin didukung semua konteks WebGL; NearestFilter menjaga
         langkah toon tetap tegas (tanpa blur antar tangga). */
      const steps=[70,140,205,255];
      const d=new Uint8Array(steps.length*4);
      steps.forEach((v,i)=>{ d[i*4]=v; d[i*4+1]=v; d[i*4+2]=v; d[i*4+3]=255; });
      const t=new THREE.DataTexture(d,steps.length,1,THREE.RGBAFormat,THREE.UnsignedByteType);
      t.minFilter=t.magFilter=THREE.NearestFilter;
      t.generateMipmaps=false;
      t.needsUpdate=true;
      return t; })();
    /* Material di-CACHE per (warna + opsi). Sebelumnya tiap bagian memanggil
       toon() sendiri -> 71 mesh punya 69 material unik, jadi renderer tidak bisa
       menghemat satu pun state change. Visual identik, jumlah material turun ~6x. */
    const matCache=new Map();
    const toon=(color,extra)=>{
      const key=color+'|'+(extra?JSON.stringify(extra):'');
      let m=matCache.get(key);
      if(!m){ m=new THREE.MeshToonMaterial(Object.assign({color,gradientMap:ramp},extra||{})); matCache.set(key,m); }
      return m;
    };
    const CAR_BODY=0xb41f2a, CARBON=0x1b1d22, GLASS=0x101820, TRIM=0x2a2d34, CHROME=0x9aa3ad;

    /* --- body utama: profil samping di-extrude selebar mobil --- */
    const L=C.length, H=C.height;
    const s=new THREE.Shape();
    s.moveTo(-L*0.50, 0.20);
    s.lineTo(-L*0.495,0.40);
    s.quadraticCurveTo(-L*0.44,0.52,-L*0.34,0.55);      // bumper depan
    s.lineTo(-L*0.20,0.60);
    s.quadraticCurveTo(-L*0.10,0.63,-L*0.04,0.66);      // kap
    s.lineTo( L*0.06,0.70);
    s.quadraticCurveTo( L*0.12,0.98, L*0.20,H*0.99);    // kaca depan
    s.lineTo( L*0.30,H*1.00);                            // atap
    s.quadraticCurveTo( L*0.40,H*0.93, L*0.44,0.80);    // kaca belakang
    s.lineTo( L*0.485,0.72);
    s.quadraticCurveTo( L*0.50,0.55, L*0.495,0.30);     // buntut
    s.lineTo( L*0.48,0.20);
    s.lineTo(-L*0.50,0.20);
    const bodyGeo=new THREE.ExtrudeGeometry(s,{depth:C.width*0.94,bevelEnabled:true,bevelSize:0.045,bevelThickness:0.05,bevelSegments:2,curveSegments:8});
    bodyGeo.rotateY(-Math.PI/2);          // extrude +Z  ->  lebar di X, nose menghadap +Z
    bodyGeo.translate(C.width*0.47,0,0);  // pusatkan lebar di x=0
    bodyGeo.computeVertexNormals();
    const body=new THREE.Mesh(bodyGeo,toon(CAR_BODY));
    body.castShadow=true; body.receiveShadow=true;
    g.add(body);

    /* --- outline: extrude sepanjang normal, tebalnya konstan (sama seperti pohon/batu) --- */
    const outline=new THREE.Mesh(bodyGeo,outlineMat(0x120a0c,0.028));
    outline.renderOrder=-1;
    g.add(outline);

    /* --- kaca kokpit: kotak gelap sedikit lebih lebar dari body supaya kebaca sebagai jendela --- */
    const glass=new THREE.Mesh(new THREE.BoxGeometry(C.width*1.008,0.26,L*0.30),
      toon(GLASS,{transparent:true,opacity:0.9}));
    glass.position.set(0,H*0.85,L*0.235);
    g.add(glass);

    /* --- splitter depan & diffuser --- */
    const splitter=new THREE.Mesh(new THREE.BoxGeometry(C.width*1.02,0.045,0.42),toon(CARBON));
    splitter.position.set(0,0.155,-L*0.47); splitter.castShadow=true; g.add(splitter);
    const diffuser=new THREE.Mesh(new THREE.BoxGeometry(C.width*0.94,0.16,0.34),toon(CARBON));
    diffuser.position.set(0,0.24,L*0.46); g.add(diffuser);
    /* 5 sirip diffuser: geometry & material sama, hanya beda translasi ->
       digabung jadi SATU mesh (hemat 4 draw call, hasil visual identik). */
    const finGeo=(()=>{ const base=new THREE.BoxGeometry(0.028,0.15,0.30), parts=[];
      for(let i=0;i<5;i++){ const q=base.clone(); q.translate(-C.width*0.34+i*C.width*0.17,0.24,L*0.46); parts.push(q); }
      const mg=mergeGeometries(parts,false); parts.forEach(x=>x.dispose()); base.dispose(); return mg; })();
    g.add(new THREE.Mesh(finGeo,toon(CARBON)));
    /* --- side skirt --- */
    const skirtGeo=new THREE.BoxGeometry(0.075,0.14,L*0.52);
    for(const sgn of [-1,1]){
      const sk=new THREE.Mesh(skirtGeo,toon(CARBON));
      sk.position.set(sgn*C.width*0.475,0.235,L*0.02); sk.castShadow=true; g.add(sk);
    }
    /* --- sayap belakang GT3 --- */
    const wingY=H*1.20;
    const wing=new THREE.Mesh(new THREE.BoxGeometry(C.width*0.98,0.045,0.40),toon(CARBON));
    wing.position.set(0,wingY,L*0.44); wing.rotation.x=-0.13; wing.castShadow=true; g.add(wing);
    const flap=new THREE.Mesh(new THREE.BoxGeometry(C.width*0.92,0.03,0.16),toon(CARBON));
    flap.position.set(0,wingY+0.075,L*0.30); flap.rotation.x=-0.30; g.add(flap);
    const strutGeo=new THREE.BoxGeometry(0.055,0.30,0.11), plateGeo=new THREE.BoxGeometry(0.03,0.20,0.44);
    for(const sgn of [-1,1]){
      const strut=new THREE.Mesh(strutGeo,toon(TRIM));
      strut.position.set(sgn*C.width*0.31,wingY-0.16,L*0.44); g.add(strut);
      const plate=new THREE.Mesh(plateGeo,toon(CARBON));
      plate.position.set(sgn*C.width*0.485,wingY+0.02,L*0.44); g.add(plate);
    }
    /* --- roof snorkel + antena --- */
    const snorkel=new THREE.Mesh(new THREE.CylinderGeometry(0.085,0.10,0.24,10),toon(CARBON));
    snorkel.position.set(0,H*1.02,L*0.30); g.add(snorkel);

    /* --- lampu --- */
    const hlMat=new THREE.MeshBasicMaterial({color:0xfff2cc,fog:false});
    const tlMat=new THREE.MeshBasicMaterial({color:0x5a1015,fog:false});
    this.lightMats=[]; this.brakeMats=[tlMat];
    const glowTex=(()=>{ const c=document.createElement('canvas'); c.width=c.height=64;
      const x=c.getContext('2d'); const gr=x.createRadialGradient(32,32,1,32,32,31);
      gr.addColorStop(0,'rgba(255,244,214,1)'); gr.addColorStop(0.4,'rgba(255,226,160,0.45)');
      gr.addColorStop(1,'rgba(255,210,130,0)'); x.fillStyle=gr; x.fillRect(0,0,64,64);
      const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t; })();
    const tlGlowTex=(()=>{ const c=document.createElement('canvas'); c.width=c.height=64;
      const x=c.getContext('2d'); const gr=x.createRadialGradient(32,32,1,32,32,31);
      gr.addColorStop(0,'rgba(255,90,70,1)'); gr.addColorStop(0.4,'rgba(255,40,30,0.45)');
      gr.addColorStop(1,'rgba(255,20,10,0)'); x.fillStyle=gr; x.fillRect(0,0,64,64);
      const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t; })();
    this.headSprites=[]; this.tailSprites=[];
    const hlGeo=new THREE.BoxGeometry(0.34,0.10,0.06), tlGeo=new THREE.BoxGeometry(0.40,0.075,0.05);
    const exGeo=new THREE.CylinderGeometry(0.055,0.062,0.14,10), mirGeo=new THREE.BoxGeometry(0.10,0.07,0.16);
    const hlSprMat=new THREE.SpriteMaterial({map:glowTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,opacity:0.85});
    const tlSprMat=new THREE.SpriteMaterial({map:tlGlowTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,opacity:0.25});
    for(const sgn of [-1,1]){
      const hl=new THREE.Mesh(hlGeo,hlMat);
      hl.position.set(sgn*C.width*0.30,0.55,-L*0.495); g.add(hl);
      const sp=new THREE.Sprite(hlSprMat);
      sp.scale.set(1.5,1.5,1); sp.position.set(sgn*C.width*0.30,0.55,-L*0.55); g.add(sp);
      this.headSprites.push(sp);
      const tl=new THREE.Mesh(tlGeo,tlMat);
      tl.position.set(sgn*C.width*0.28,0.66,L*0.495); g.add(tl);
      const tsp=new THREE.Sprite(tlSprMat);
      tsp.scale.set(1.2,0.9,1); tsp.position.set(sgn*C.width*0.28,0.66,L*0.55); g.add(tsp);
      this.tailSprites.push(tsp);
      /* knalpot ganda */
      const ex=new THREE.Mesh(exGeo,toon(CHROME));
      ex.rotation.x=Math.PI/2; ex.position.set(sgn*C.width*0.22,0.26,L*0.50); g.add(ex);
      /* mirror */
      const mir=new THREE.Mesh(mirGeo,toon(CARBON));
      mir.position.set(sgn*C.width*0.50,0.80,L*0.06); g.add(mir);
    }

    /* --- roda ---
       Keempat roda identik, dan tiap roda tadinya 9 mesh sendiri-sendiri
       (ban, sidewall, velg, 5 spoke, hub, cakram) = 36 mesh + 36 material.
       Semuanya digabung jadi SATU geometry per roda dengan vertex color, jadi
       tinggal 4 mesh. Posisi & rotasi tiap bagian di-bake ke vertex, dan warna
       aslinya disimpan di attribute `color` -> hasil render identik, tapi draw
       call roda turun dari 36 jadi 4. Kaliper sengaja tetap terpisah karena
       tidak ikut berputar. */
    const R=C.wheelRadius, W=C.wheelWidth;
    const bake=(geo,pos,rot)=>{
      const m=new THREE.Matrix4().compose(
        new THREE.Vector3(pos[0],pos[1],pos[2]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0],rot[1],rot[2])),
        new THREE.Vector3(1,1,1));
      return geo.applyMatrix4(m);
    };
    const paint=(geo,hex)=>{
      const col=new THREE.Color(hex), n=geo.attributes.position.count, arr=new Float32Array(n*3);
      for(let i=0;i<n;i++){ arr[i*3]=col.r; arr[i*3+1]=col.g; arr[i*3+2]=col.b; }
      geo.setAttribute('color',new THREE.BufferAttribute(arr,3));
      return geo;
    };
    const wheelGeo=(()=>{
      const parts=[];
      parts.push(paint(bake(new THREE.CylinderGeometry(R,R,W,22,1,false),[0,0,0],[0,0,Math.PI/2]),0x141416));
      parts.push(paint(bake(new THREE.TorusGeometry(R*0.93,0.035,6,20),[W*0.5,0,0],[0,Math.PI/2,0]),0x0e0e10));
      parts.push(paint(bake(new THREE.CylinderGeometry(R*0.66,R*0.66,W*1.02,16),[0,0,0],[0,0,Math.PI/2]),0xc9ced6));
      const spoke=new THREE.BoxGeometry(W*1.04,0.055,R*0.60);
      for(let i=0;i<5;i++){ const a=i*Math.PI*2/5;
        parts.push(paint(bake(spoke.clone(),[0,Math.sin(a)*R*0.31,Math.cos(a)*R*0.31],[a,0,0]),0xb6bcc6)); }
      parts.push(paint(bake(new THREE.CylinderGeometry(0.055,0.055,W*1.12,8),[0,0,0],[0,0,Math.PI/2]),0x8b929c));
      parts.push(paint(bake(new THREE.CylinderGeometry(R*0.55,R*0.55,0.035,16),[0,0,0],[0,0,Math.PI/2]),0x6d737c));
      const mg=mergeGeometries(parts,false);
      parts.forEach(q=>q.dispose()); spoke.dispose();
      return mg;
    })();
    const wheelMat=new THREE.MeshToonMaterial({color:0xffffff,gradientMap:ramp,vertexColors:true});
    const calGeo=new THREE.BoxGeometry(0.075,0.16,0.14);

    this.wheels=[];
    const mkWheel=(x,z,isFront)=>{
      const grp=new THREE.Group(); grp.position.set(x,C.wheelRadius,z);
      const spin=new THREE.Group(); grp.add(spin);
      const wheel=new THREE.Mesh(wheelGeo,wheelMat); wheel.castShadow=true; spin.add(wheel);
      /* kaliper tidak ikut berputar */
      const cal=new THREE.Mesh(calGeo,toon(0xd8a02a));
      cal.position.set((x>0?-0.062:0.062), C.wheelRadius*0.34, 0);
      grp.add(cal);
      this.body.add(grp);
      const w={group:grp,spin,isFront,x,z};
      this.wheels.push(w);
      return w;
    };
    const hx=C.track*0.5, hz=C.wheelbase*0.5;
    mkWheel(-hx,-hz,true); mkWheel(hx,-hz,true);
    mkWheel(-hx, hz,false); mkWheel(hx, hz,false);

    this.body.add(g);
    this.outlineMesh=outline;
    this.rearWheels=this.wheels.filter(w=>!w.isFront);
    this.frontWheels=this.wheels.filter(w=>w.isFront);
  }

  /* ============================================================
     GLB SWAP — drop car.glb ke root repo, otomatis kepakai.
     Pipeline: fixCarModelMaterials -> alignCarModel ->
     buildWheelPivots. Kalau GLB tidak ada/rusak/kosong, model
     procedural tetap dipakai (game tidak boleh blank).
  ============================================================ */
  loadModel(url='./car.glb'){
    return new Promise((resolve)=>{
      new GLTFLoader().load(url,(gltf)=>{
        try{
          const m=gltf.scene;
          fixCarModelMaterials(m);
          const info=alignCarModel(m,this.cfg);
          this.glbWheels=buildWheelPivots(info.holder,info.wheels);
          if(this.procedural) this.procedural.visible=false;
          this.model=info.holder; this.body.add(info.holder);
          console.log('[CAR] GLB dipakai:',url,'| skala',info.scale.toFixed(3),
            '| nose',info.nose>0?'di-flip otomatis':'sudah benar',
            '| roda terdeteksi',this.glbWheels?this.glbWheels.length:0);
          if(!this.glbWheels)
            console.info('[CAR] roda GLB tidak terdeteksi -> model tetap dipakai, tapi roda tidak ikut berputar/menyetir.');
          else if(CAR_CFG.modelNoseFlip)
            console.info('[CAR] CAR_CFG.modelNoseFlip=true sedang aktif (override arah nose manual). Set false lagi kalau arah sudah benar.');
          resolve(true);
        }catch(err){
          console.warn('[CAR] car.glb gagal diolah -> pakai model procedural:',err.message);
          resolve(false);
        }
      },undefined,()=>{ console.info('[CAR] car.glb tidak ada -> pakai model procedural'); resolve(false); });
    });
  }

  /* ---------- efek summon ---------- */
  buildSummonFx(){
    const ring=new THREE.Mesh(
      new THREE.RingGeometry(1.6,2.5,48),
      new THREE.MeshBasicMaterial({color:0x8fe6ff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false})
    );
    ring.rotation.x=-Math.PI/2; ring.visible=false; ring.renderOrder=5;
    this.scene.add(ring); this.summonRing=ring; this.summonT=0;
  }
  _updateSummon(dt){
    if(this.summonT<=0) return;
    this.summonT-=dt;
    const k=clamp(this.summonT/0.9,0,1);
    const m=this.summonRing.material;
    m.opacity=Math.sin(k*Math.PI)*0.75;
    this.summonRing.scale.setScalar(0.4+(1-k)*2.4);
    this.summonRing.rotation.z+=dt*2.2;
    if(this.summonT<=0) this.summonRing.visible=false;
  }

  /* ============================================================
     SPAWN / MASUK / KELUAR
  ============================================================ */
  spawnAt(x,z,yaw){
    /* cari titik bebas collider & di atas air, spiral keluar kalau perlu */
    let px=x,pz=z,ok=false;
    for(let ring=0; ring<26 && !ok; ring++){
      for(let a=0;a<12;a++){
        const ang=a*Math.PI*2/12;
        const cx=x+Math.cos(ang)*ring*1.6, cz=z+Math.sin(ang)*ring*1.6;
        const h=this.terrainH(cx,cz);
        if(h < this.waterY+0.6) continue;
        let hit=false;
        for(const c of this.colliders){ if(Math.hypot(cx-c.x,cz-c.z) < c.r+2.0){ hit=true; break; } }
        if(!hit){ px=cx; pz=cz; ok=true; break; }
      }
    }
    this.pos.set(px, this.terrainH(px,pz), pz);
    this.yaw = yaw!==undefined?yaw:Math.PI;
    this.pitch=0; this.roll=0;
    this.speed=0; this.slip=0; this.rpm=this.cfg.idleRpm; this.gear=1;
    this.nitro=this.cfg.nitroMax;
    this.spawned=true; this.engineOn=true;
    this.root.visible=true;
    this.summonRing.position.set(px,this.terrainH(px,pz)+0.06,pz);
    this.summonRing.visible=true; this.summonT=0.9;
    if(this.audio){ this.audio.door(true); this.audio._shimmerPing && this.audio._shimmerPing(); }
  }
  despawn(){ this.spawned=false; this.root.visible=false; this.occupied=false; this.engineOn=false; }

  canEnter(playerPos){
    if(!this.spawned||this.occupied) return false;
    return Math.hypot(playerPos.x-this.pos.x, playerPos.z-this.pos.z) < 3.6;
  }
  enter(){
    this.occupied=true; this.engineOn=true;
    if(this.audio) this.audio.engineStart();
  }
  exit(){
    /* taruh pemain di sisi kiri mobil, agak ke belakang */
    this.occupied=false;
    const side=new THREE.Vector3(Math.cos(this.yaw),0,-Math.sin(this.yaw)).multiplyScalar(1.62);  // sisi kiri = rx dunia
    const out=this.pos.clone().add(side);
    out.y=this.terrainH(out.x,out.z);
    if(this.audio) this.audio.door(false);
    return out;
  }

  /* ============================================================
     UPDATE — fisika
     input: {throttle,brake,steer,handbrake,nitro}
  ============================================================ */
  update(dt, input, occupied){
    const C=this.cfg;
    this._impactCd=Math.max(0,this._impactCd-dt);
    this._updateSummon(dt);
    this.skid.update(dt);
    this.dust.update(dt);

    if(!this.spawned){ this.root.visible=false; return; }
    this.root.visible=true;

    /* ---------- input ---------- */
    const thr = clamp(input.throttle||0,0,1);
    const brk = clamp(input.brake||0,0,1);
    const hbr = !!input.handbrake;
    const nit = !!input.nitro && this.nitro>1 && thr>0.05;
    const steerIn = clamp(input.steer||0,-1,1);
    const throttle = occupied?thr:0;
    const brake    = occupied?brk:0;
    this.throttle=throttle; this.brake=brake; this.handbrake=hbr&&occupied; this.steerInput=steerIn;

    /* ---------- nitro ---------- */
    this.nitroActive=nit;
    if(nit) this.nitro=Math.max(0,this.nitro-C.nitroDrain*dt);
    else    this.nitro=Math.min(C.nitroMax,this.nitro+C.nitroRegen*dt);

    /* ---------- arah & kecepatan ---------- */
    const fwd=_fwd.set(Math.sin(this.yaw),0,Math.cos(this.yaw));
    const spd=this.speed;
    const moving=Math.abs(spd)>0.35;

    /* ---------- gigi & RPM ---------- */
    const gearIdx = spd < -0.6 ? -1 : Math.max(0,Math.min(C.gears.length-1,this.gear-1));
    const gRatio = gearIdx<0 ? C.reverse : C.gears[gearIdx];
    const wheelRps = Math.abs(spd)/(2*Math.PI*C.wheelRadius);
    const rpmFromSpeed = wheelRps*60*gRatio*C.finalDrive;
    let rpm;
    if(Math.abs(spd)<2.6){
      /* kopling lepas: bebas ngegas di tempat */
      rpm = C.idleRpm + throttle*(C.revLimit*0.86-C.idleRpm);
    } else {
      rpm = clamp(rpmFromSpeed, C.idleRpm, C.revLimit+450);
    }
    this.limiter = rpm>=C.revLimit;
    if(this.limiter) rpm = C.revLimit - 260*Math.random();

    /* auto shift (hanya saat jalan maju) */
    this.shiftTimer=Math.max(0,this.shiftTimer-dt);
    if(spd>2.6 && this.shiftTimer<=0){
      if(rpm>C.shiftUp && this.gear<C.gears.length){ this.gear++; this.shiftTimer=0.16; if(this.audio) this.audio.gearShift(); }
      else if(rpm<C.shiftDown && this.gear>1){ this.gear--; this.shiftTimer=0.13; if(this.audio) this.audio.gearShift(); }
    }
    if(Math.abs(spd)<0.5 && brake>0.5 && throttle<0.1){ this.gear=1; }
    this.rpm=rpm;

    /* ---------- gaya longitudinal ---------- */
    const tractionMax = C.mass*9.81*C.driveWeightFrac*C.mu*(this.handbrake?0.35:1)*(this.nitroActive?1.25:1);
    let force=0;
    if(occupied){
      if(throttle>0.01 && !this.limiter){
        const clutch=clamp(Math.abs(spd)/4.0,0.42,1);        // kopling: anti-teleport dari berdiri
        let f=this._driveForce(gearIdx, rpm)*throttle*clutch;
        if(this.nitroActive) f*=C.nitroBoost;
        if(spd<-0.5) f*=0.25;                                 // ngegas saat mundur = lawan arah
        const dir = spd<-0.5 ? -1 : 1;
        force=Math.min(f,tractionMax)*dir;
        this.tractionSlip = f>tractionMax*1.02 ? clamp((f-tractionMax)/tractionMax,0,1) : 0;
      } else this.tractionSlip=0;
      if(brake>0.01){
        if(spd>0.9)       force -= C.brakeForce*brake;                       // mengerem saat maju
        else if(spd<-0.9) force += C.brakeForce*brake;                       // mengerem saat mundur
        else              force -= Math.sign(spd)*C.brakeForce*0.30*brake;   // hampir berhenti
        if(Math.abs(spd)<0.9 && this.gear!==1) this.gear=1;
      }
      if(this.handbrake) force -= Math.sign(spd)*C.handbrakeForce;
    } else {
      /* tidak ada pengemudi: rem parkir otomatis */
      force -= Math.sign(spd)*Math.min(Math.abs(spd)*C.mass*4.5, 9000);
      this.tractionSlip=0;
    }
    /* gigi MUNDUR: rem diinjak dalam-dalam saat (hampir) berhenti, seperti transmisi otomatis */
    if(occupied && brake>0.35 && spd<0.9 && throttle<0.05){
      force = -3400*brake;
    }

    /* ---------- gravitasi sepanjang lereng ----------
       Dunia 24 km punya jalan yang menanjak dan gunung sampai +225 m.
       Tanpa komponen ini mobil menaiki lereng 40 derajat seolah-olah datar.
       gaya = -m.g.sin(theta); theta diukur dari tinggi terrain di depan dan
       belakang mobil (bukan dari this.pitch, yang sudah tercampur suspensi
       dan di-damp sehingga telat satu frame). */
    const sfx=Math.sin(this.yaw), sfz=Math.cos(this.yaw);
    const hUp=this.terrainH(this.pos.x+sfx*C.wheelbase, this.pos.z+sfz*C.wheelbase);
    const hDn=this.terrainH(this.pos.x-sfx*C.wheelbase, this.pos.z-sfz*C.wheelbase);
    const slope=Math.atan2(hUp-hDn, C.wheelbase*2);           // + berarti menanjak
    const gradeAccel=-9.81*Math.sin(slope);
    this.slope=slope;

    const drag = this.dragK*spd*Math.abs(spd);
    const roll = Math.sign(spd)*this._rollF()*(Math.abs(spd)>0.05?1:0);
    const accel = force/C.mass - (drag+roll)/C.mass + gradeAccel;
    this.speed += accel*dt;
    /* rem parkir statis: mobil tanpa pengemudi tidak boleh merayap pelan di
       tanjakan yang masih sanggup ditahan rem parkir (batas ~41 derajat). */
    if(!occupied && Math.abs(this.speed)<0.35 && Math.abs(gradeAccel)*C.mass<9000) this.speed=0;
    if(!occupied && Math.abs(this.speed)<0.08) this.speed=0;
    const cap = spd<-0.5 ? C.reverseSpeed : C.maxSpeed*(this.nitroActive?1.12:1);
    this.speed = clamp(this.speed, -C.reverseSpeed, cap);

    /* ---------- steering ---------- */
    const speedFactor = clamp(1-Math.abs(this.speed)/(C.maxSpeed*1.15),0.22,1);
    const targetSteer = occupied ? steerIn*C.maxSteer*speedFactor : 0;
    const rate = Math.abs(steerIn)>0.05 ? C.steerRate : C.steerReturn;
    this.steer = damp(this.steer, targetSteer, rate*0.55, dt);

    /* ---------- yaw (bicycle model) ---------- */
    const wb=C.wheelbase;
    let yawRate = Math.tan(this.steer)*this.speed/wb;
    const latAccel = Math.abs(yawRate*this.speed);
    const maxLat = 9.81*C.mu*(this.handbrake?0.44:1.0)*(1-0.22*clamp(Math.abs(this.speed)/C.maxSpeed,0,1));
    let oversteer=0;
    if(latAccel>maxLat && Math.abs(this.speed)>3){
      oversteer = clamp((latAccel-maxLat)/Math.max(1,latAccel),0,0.85);
      yawRate = Math.sign(yawRate)*maxLat/Math.max(3,Math.abs(this.speed));
    }
    this.yawRate=yawRate;
    this.yaw -= yawRate*dt;                                  // steer kanan (+) -> yaw turun

    /* ---------- slip / drift ---------- */
    const slipGen = (this.handbrake? C.slipGenHandbrake : C.slipGenPower) * yawRate
                  + (this.tractionSlip||0)*0.35*Math.sign(this.steer||this.speed);
    const recover = this.handbrake? C.handbrakeGrip : C.gripRecover;
    this.slip += (slipGen - this.slip*recover)*dt*Math.min(1,Math.abs(this.speed)/6+0.25);
    this.slip = clamp(this.slip,-1.1,1.1);
    if(Math.abs(this.speed)<1.2) this.slip*=Math.pow(0.02,dt);
    this.slip01 = clamp(Math.abs(this.slip)/0.55 + (this.tractionSlip||0)*0.6,0,1);

    /* ---------- posisi ---------- */
    const velYaw = this.yaw - this.slip*0.62;
    const vx=Math.sin(velYaw)*this.speed, vz=Math.cos(velYaw)*this.speed;
    const nx=this.pos.x+vx*dt, nz=this.pos.z+vz*dt;

    /* batas air & dunia */
    const hNext=this.terrainH(nx,nz);
    if(hNext < this.waterY+0.25){
      this.speed*=Math.pow(0.02,dt);
      if(this.audio && this._impactCd<=0){ this.audio.impact(0.35); this._impactCd=0.4; }
    } else {
      this.pos.x=nx; this.pos.z=nz;
    }
    const LIM=this.limit;
    if(Math.abs(this.pos.x)>LIM||Math.abs(this.pos.z)>LIM){
      this.pos.x=clamp(this.pos.x,-LIM,LIM); this.pos.z=clamp(this.pos.z,-LIM,LIM);
      this.speed*=-0.28;
      if(this.audio && this._impactCd<=0){ this.audio.impact(0.7); this._impactCd=0.4; }
      this.cameraShake=Math.max(this.cameraShake,0.35);
    }

    /* ---------- tabrakan dengan pohon/batu ---------- */
    const R=1.05;
    for(const c of this.colliders){
      const dx=this.pos.x-c.x, dz=this.pos.z-c.z;
      const rr=c.r+R, d2=dx*dx+dz*dz;
      if(d2<rr*rr && d2>1e-6){
        const d=Math.sqrt(d2), inv=(rr-d)/d;
        this.pos.x+=dx*inv; this.pos.z+=dz*inv;
        const nnx=dx/d, nnz=dz/d;
        const vn=vx*nnx+vz*nnz;
        const impact=Math.abs(this.speed);
        if(vn<0){
          this.speed *= -0.26;
          this.slip += (Math.random()-0.5)*0.5;
          this.cameraShake=Math.max(this.cameraShake, clamp(impact/26,0.15,1.0));
          if(this.audio && this._impactCd<=0){ this.audio.impact(clamp(impact/22,0.2,1.4)); this._impactCd=0.28; }
        }
      }
    }

    /* ---------- ketinggian, pitch, roll (ikuti terrain) ---------- */
    const gh=this.terrainH(this.pos.x,this.pos.z);
    const gy=Math.max(gh,this.waterY-0.4);
    const fx=fwd.x, fz=fwd.z;
    const rx=Math.cos(this.yaw), rz=-Math.sin(this.yaw);
    const hF=this.terrainH(this.pos.x+fx*wb*0.5, this.pos.z+fz*wb*0.5);
    const hB=this.terrainH(this.pos.x-fx*wb*0.5, this.pos.z-fz*wb*0.5);
    const hL=this.terrainH(this.pos.x+rx*C.track*0.5, this.pos.z+rz*C.track*0.5);
    const hR=this.terrainH(this.pos.x-rx*C.track*0.5, this.pos.z-rz*C.track*0.5);
    const tPitch= Math.atan2(hF-hB,wb);      // depan lebih tinggi -> nose naik (+)
    const tRoll = Math.atan2(hR-hL,C.track);  // kiri lebih tinggi -> body miring ke kanan(+X model) naik = negatif
    /* suspensi: body turun saat ngerem/ngegas, miring saat belok */
    const suspTarget = -brake*0.035 + throttle*0.030 - Math.abs(this.slip)*0.012;
    this.suspension = damp(this.suspension, suspTarget, 5.5, dt);
    const rollExtra = yawRate*this.speed*0.0038;   // body roll ke luar tikungan
    this.pos.y = damp(this.pos.y, gy, 18, dt);
    this.pitch = damp(this.pitch, tPitch + this.suspension*0.6, 7, dt);
    this.roll  = damp(this.roll,  tRoll*0.75 + rollExtra, 6.5, dt);

    /* ---------- tulis ke scene graph ---------- */
    this.root.position.copy(this.pos);
    // Model digambar dengan nose di -Z (lokal), sedangkan forward dunia = (sin yaw, cos yaw).
    // Putar root 180° supaya nose menunjuk arah jalan. BUKTI: Ry(yaw+PI)*(0,0,-1) = (sin yaw,0,cos yaw).
    this.root.rotation.y=this.yaw+Math.PI;
    this.body.rotation.x=this.pitch;
    this.body.rotation.z=this.roll;
    this.body.position.y=this.suspension;

    /* ---------- roda ---------- */
    this.wheelAngle += this.speed/C.wheelRadius*dt;
    const spinVis = this.wheelAngle + (this.tractionSlip||0)*dt*22;
    for(const w of this.wheels){
      w.spin.rotation.x = -spinVis;
      if(w.isFront) w.group.rotation.y = -this.steer;   // nose di -Z: rotasi +Y = belok KIRI, jadi dinegasikan
      /* suspensi per roda */
      w.group.position.y = C.wheelRadius - this.suspension*0.5;
    }
    if(this.model && this.glbWheels){
      /* Roda GLB dianimasikan lewat PIVOT (bukan group aslinya, supaya
         transformasi author di GLB tidak rusak dan tidak berputar dobel).
         Semua roda berputar sesuai kecepatan; roda DEPAN juga mengikuti
         steering. Sumbu aligned: X = poros roda, Y = ke atas, nose = -Z —
         jadi konvensi tanda sama persis dengan roda procedural. */
      _qSpin.setFromAxisAngle(_AXX, -spinVis);
      for(const w of this.glbWheels){
        if(w.front){
          _qSteer.setFromAxisAngle(_AXY, -this.steer);
          w.pivot.quaternion.copy(w.baseQ).multiply(_qSteer).multiply(_qSpin);
        } else {
          w.pivot.quaternion.copy(w.baseQ).multiply(_qSpin);
        }
      }
    }
    if(this.model && this.procedural) this.procedural.visible=false;

    /* ---------- lampu ---------- */
    const braking = brake>0.15 || this.handbrake;
    for(const m of this.brakeMats) m.color.setHex(braking?0xff2a1c:0x5a1015);
    for(const s of this.tailSprites) s.material.opacity = braking?0.95:0.28;

    /* ---------- skid mark + debu ---------- */
    const slipping = this.slip01>0.22 && Math.abs(this.speed)>3.2;
    if(slipping){
      const rear=this.rearWheels;
      for(const w of rear){
        const wx=this.pos.x + rx*w.x - fwd.x*C.wheelbase*0.5;
        const wz=this.pos.z + rz*w.x - fwd.z*C.wheelbase*0.5;
        const wy=this.terrainH(wx,wz);
        this.skid.add(wx,wy,wz, Math.sin(velYaw),Math.cos(velYaw), 0.20, 0.34+Math.abs(this.speed)*0.012, this.slip01);
      }
      if(Math.random()<this.slip01*0.9){
        const w=rear[(Math.random()*rear.length)|0];
        const wx=this.pos.x + rx*w.x - fwd.x*C.wheelbase*0.5;
        const wz=this.pos.z + rz*w.x - fwd.z*C.wheelbase*0.5;
        const wy=this.terrainH(wx,wz);
        this.dust.spawn(wx,wy+0.12,wz,(Math.random()-0.5)*2.2-vx*0.06,0.9+Math.random()*1.5,(Math.random()-0.5)*2.2-vz*0.06,1.0);
      }
      if(this.audio) this.audio.setTireSlip(this.slip01, Math.abs(this.speed)/C.maxSpeed);
    } else if(this.audio) this.audio.setTireSlip(0,0);

    /* nitro flame / debu knalpot */
    if(this.nitroActive && Math.random()<0.7){
      for(const sgn of [-1,1]){
        const exX=this.pos.x+rx*C.width*0.22*sgn-fwd.x*C.length*0.5;
        const exZ=this.pos.z-fwd.z*C.length*0.5;
        this.dust.spawn(exX,this.pos.y+0.30,exZ,(Math.random()-0.5)*1.5,0.6+Math.random(),(Math.random()-0.5)*1.5,0.55);
      }
    }
    /* backfire pas limiter / lepas throttle di RPM tinggi */
    if(this.audio && (this.limiter || (rpm>6200 && throttle<0.05 && Math.random()<0.06))){
      if(Math.random()<0.14) this.audio.backfire();
    }

    this.kmh=Math.abs(this.speed)*3.6;
    this.cameraShake=Math.max(0,this.cameraShake-dt*2.2);
  }

  /* ---------- audio sink ---------- */
  pushAudio(){
    if(!this.audio||!this.audio.ok) return;
    const on=this.engineOn&&this.spawned;
    const load=clamp(Math.abs(this.speed)/this.cfg.maxSpeed,0,1)*0.6+this.throttle*0.4;
    this.audio.setEngine(this.rpm,this.throttle,on?load:0,on);
  }

  /* ---------- chase camera ---------- */
  updateCamera(camera, dt, blend){
    const C=this.cfg;
    const fwd=_fwd.set(Math.sin(this.yaw),0,Math.cos(this.yaw));
    const spd01=clamp(Math.abs(this.speed)/C.maxSpeed,0,1);
    const dist = 7.4 + spd01*2.2;
    const height = 2.55 + spd01*0.35;
    const desired=_des.copy(this.pos).addScaledVector(fwd,-dist);
    desired.y += height;
    /* jangan sampai kamera masuk tanah / pohon */
    const minY=this.terrainH(desired.x,desired.z)+0.85;
    if(desired.y<minY) desired.y=minY;
    for(const c of this.colliders){
      const dx=desired.x-c.x, dz=desired.z-c.z;
      if(dx*dx+dz*dz < (c.r+1.0)*(c.r+1.0)) desired.y=Math.max(desired.y, this.terrainH(desired.x,desired.z)+c.r*1.5);
    }
    const k=1-Math.pow(0.001,dt*(blend<1?7:5.5));
    camera.position.lerp(desired,k);
    const look=_look.copy(this.pos).addScaledVector(fwd,4.2+spd01*4.0);
    look.y += 0.95;
    /* shake */
    if(this.cameraShake>0.001){
      const s=this.cameraShake*0.28;
      look.x+=(Math.random()-0.5)*s; look.y+=(Math.random()-0.5)*s; look.z+=(Math.random()-0.5)*s;
    }
    camera.lookAt(look);
    const wantFov = 70 + spd01*16 + (this.nitroActive?6:0);
    if(Math.abs(camera.fov-wantFov)>0.05){ camera.fov=damp(camera.fov,wantFov,6,dt); camera.updateProjectionMatrix(); }
  }

  /* ---------- kamera transisi masuk/keluar ---------- */
  static doorCameraPose(car){
    const fwd=new THREE.Vector3(Math.sin(car.yaw),0,Math.cos(car.yaw));
    const rx=Math.cos(car.yaw), rz=-Math.sin(car.yaw);
    return {
      pos:new THREE.Vector3(car.pos.x - rx*2.3, car.pos.y+1.55, car.pos.z - rz*2.3),
      look:new THREE.Vector3(car.pos.x+fwd.x*0.6, car.pos.y+0.95, car.pos.z+fwd.z*0.6),
    };
  }
}
