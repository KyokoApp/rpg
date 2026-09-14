/* ============================================================
   TES MODEL MOBIL — headless, tanpa browser/GPU.
   Jalankan:  node --test tests/car.model.test.mjs   (dari root repo)

   Dua lapis verifikasi:

   1. car.glb ASLI dari root repo, dibaca lewat MIRROR adegan yang
      faithful terhadap GLTFLoader:
        - setiap node glTF = Object3D; node yang punya `mesh` =
          THREE.Mesh (isMesh=true) — persis seperti GLTFLoader,
          karena deteksi roda bergantung pada `isMesh`;
        - transform node dari `matrix` (car.glb memakai `matrix`,
          bukan translation/rotation/scale) di-decompose;
        - geometry = Box yang ukurannya diambil dari min/max
          accessor POSITION (yang dibutuhkan pipeline hanyalah
          bounding box dunia).
      Ini memungkinkan pipeline GLB (detectCarWheels ->
      modelNoseSign -> alignCarModel -> buildWheelPivots -> animasi
      roda di Car.update) dites penuh tanpa WebGL.

   2. Model-model SINTETIS kecil untuk edge-case:
        - group "steering wheel" interior harus dikecualikan,
        - model panjang di sumbu X harus diputar,
        - root GLB yang sudah berotasi (pola ekspor Sketchfab: dua
          rotasi -90°/+90° di node berurutan) tidak boleh rusak —
          penyelarasan dipasang di holder, bukan menimpa rotasi
          author (bug lama: menulis .rotation.y menimpa rotasi
          root yang sudah ada).
   ============================================================ */
import './importmap.mjs';
import './stubs.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const THREE = await import('three');
const { CAR_CFG, Car,
        detectCarWheels, modelNoseSign, alignCarModel,
        buildWheelPivots, fixCarModelMaterials } = await import('../js/car.js');

const ROOT = path.resolve(import.meta.dirname, '..');
const DT = 1/60;
const EPS = 1e-6;
const near = (a,b,tol=1e-4) => Math.abs(a-b) <= tol;

/* ---------- mirror car.glb (faithful terhadap GLTFLoader) ---------- */
function buildGlbMirror(){
  const buf = fs.readFileSync(path.join(ROOT, 'car.glb'));
  const glbLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + glbLen).toString('utf8'));
  const readAcc = (acc) => {
    const a = json.accessors[acc];
    const t = json.bufferViews[a.bufferView];
    const off = (t.byteOffset||0) + (a.byteOffset||0);
    const n = a.type === 'VEC3' ? 3 : a.type === 'VEC2' ? 2 : 1;
    const f = new Float32Array(buf.buffer, off);
    const out = new Float32Array(a.count * n);
    for (let i = 0; i < out.length; i++) out[i] = f[i];
    return out;
  };
  const obj = json.nodes.map(n => {
    const hasMesh = n.mesh !== undefined;
    const o = hasMesh
      ? new THREE.Mesh(new THREE.BoxGeometry(0.001,0.001,0.001), new THREE.MeshBasicMaterial())
      : new THREE.Group();
    o.name = n.name || '';
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    return o;
  });
  json.nodes.forEach((n, i) => (n.children || []).forEach(c => obj[i].add(obj[c])));
  json.nodes.forEach((n, i) => {
    if (n.mesh === undefined) return;
    const prims = json.meshes[n.mesh].primitives.filter(p => p.attributes && p.attributes.POSITION !== undefined);
    if (!prims.length) return;
    let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9];
    for (const pr of prims) {
      const a = json.accessors[pr.attributes.POSITION];
      for (let k = 0; k < 3; k++){ mn[k] = Math.min(mn[k], a.min[k]); mx[k] = Math.max(mx[k], a.max[k]); }
    }
    const geo = new THREE.BoxGeometry(mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]);
    geo.translate((mn[0]+mx[0])/2, (mn[1]+mx[1])/2, (mn[2]+mx[2])/2);
    obj[i].geometry.dispose();
    obj[i].geometry = geo;
  });
  return { json, root: obj.find(o => o.name === 'Sketchfab_model'), all: obj };
}

/* ---------- model sintetis ----------
   Panjang default di Z, nose di +Z (z=+1.5), roda depan x=±0.45,
   roda belakang z=-1.5. Opsi:
     longX      : panjang di X (roda depan x=+1.5)
     doubleQuat : root Rx(-90°) + child Rx(+90°) (pola Sketchfab —
                  kedua rotasi saling meniadakan; dipakai untuk
                  memverifikasi penyelarasan TIDAK menimpa root)
     addSteering: tambah group "SteeringWheel" interior ber-mesh
                  (harus TIDAK terdeteksi sebagai roda)            */
function makeSynthetic({ longX=false, doubleQuat=false, addSteering=false } = {}){
  const root = new THREE.Group(); root.name = 'SynRoot';
  const world = doubleQuat ? new THREE.Group() : root;
  if (doubleQuat){
    root.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI/2);
    world.name = 'SynInner';
    world.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0), +Math.PI/2);
    root.add(world);
  }
  const box = (w,h,d,x,y,z,name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshBasicMaterial());
    m.name = name || ''; m.position.set(x,y,z); world.add(m); return m;
  };
  const L = 4.5;
  if (longX) box(L, 1.0, 0.9, 0, 0.5, 0, 'SynBody');
  else       box(0.9, 1.0, L, 0, 0.5, 0, 'SynBody');
  const wheel = (name, x, z) => {
    const g = new THREE.Group(); g.name = name;
    const tire = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.6,0.6), new THREE.MeshBasicMaterial());
    tire.name = name + '_Tire';
    g.add(tire);
    g.position.set(x, 0.3, z);
    world.add(g);
    return g;
  };
  if (longX){
    wheel('3DWheel Front L',  1.5,  0.45);
    wheel('3DWheel Front R',  1.5, -0.45);
    wheel('3DWheel Rear L',   -1.5, 0.45);
    wheel('3DWheel Rear R',   -1.5, -0.45);
  } else {
    wheel('3DWheel Front L',  0.45,  1.5);
    wheel('3DWheel Front R', -0.45,  1.5);
    wheel('3DWheel Rear L',   0.45, -1.5);
    wheel('3DWheel Rear R',  -0.45, -1.5);
  }
  if (addSteering){
    const sw = new THREE.Group(); sw.name = 'SteeringWheel';
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.3,0.05), new THREE.MeshBasicMaterial());
    rim.name = 'SteeringWheel_Rim';
    sw.add(rim);
    sw.position.set(0, 0.9, 0.5);
    world.add(sw);
  }
  return root;
}

/* ============================ car.glb ============================ */

test('GLB: detectCarWheels menemukan 4 roda utama, tanpa setir interior', () => {
  const { root } = buildGlbMirror();
  const det = detectCarWheels(root);
  assert.ok(det, 'deteksi tidak boleh null');
  assert.equal(det.wheels.length, 4);
  assert.ok(det.byName, 'roda GLB punya nama Front/Rear yang lengkap -> byName');
  const names = det.wheels.map(w => w.node.name).sort();
  assert.deepEqual(names, [
    '3DWheel Front L', '3DWheel Front R',
    '3DWheel Rear L',  '3DWheel Rear R',
  ]);
  const nFront = [...det.front].map(w => w.name).sort();
  const nRear  = [...det.rear ].map(w => w.name).sort();
  assert.deepEqual(nFront, ['3DWheel Front L', '3DWheel Front R']);
  assert.deepEqual(nRear,  ['3DWheel Rear L',  '3DWheel Rear R']);
  /* 46 group setir BMW:ANC_SteeringWheel_* di interior tidak boleh ikut */
  assert.ok(!det.wheels.some(w => /steering/i.test(w.node.name)),
    'group setir interior harus dikecualikan');
});

test('GLB: arah nose mentah +Z (world) -> modelNoseSign = +1', () => {
  const { root } = buildGlbMirror();
  const det = detectCarWheels(root);
  assert.equal(modelNoseSign(det.front, det.rear), +1);
});

test('GLB: alignCarModel -> flip sekali, panjang & tanjakan benar', () => {
  const { root } = buildGlbMirror();
  const info = alignCarModel(root, CAR_CFG);
  const holder = info.holder;
  /* flip diterapkan PERSIS SEKALI: nose mentah +Z -> holder berotasi π */
  assert.equal(info.nose, +1);
  assert.ok(near(holder.rotation.y, Math.PI, 1e-3),
    'holder.rotation.y harus ±π (flip sekali), dapat ' + holder.rotation.y);
  /* root GLB TIDAK disentuh (rotasi author utuh) */
  assert.equal(root.rotation.y, 0);
  assert.ok(near(root.quaternion.x, -0.70710678, 1e-4),
    'quaternion root author (Rx -90°) harus tetap utuh');
  holder.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(holder);
  const size = bb.getSize(new THREE.Vector3());
  assert.ok(near(size.z, CAR_CFG.length, 0.05),
    'panjang akhir harus ≈ cfg.length (4.55 m), dapat ' + size.z);
  assert.ok(size.z > size.x, 'sumbu terpanjang harus Z');
  assert.ok(Math.abs(size.x) < CAR_CFG.width * 1.6,
    'lebar wajar (tidak ada model terbalik sisi-atas)');
  assert.ok(near(bb.min.y, CAR_CFG.wheelRadius * 0.06, 0.01),
    'bawah model harus tepat di 6% radius roda di atas tanah, dapat ' + bb.min.y);
  /* roda depan harus berakhir di sisi -Z (sisi nose) */
  const pv = new THREE.Vector3();
  let zFront = 0, zRear = 0;
  info.wheels.front.forEach(w => { w.getWorldPosition(pv); zFront += pv.z; });
  info.wheels.rear .forEach(w => { w.getWorldPosition(pv); zRear  += pv.z; });
  zFront /= info.wheels.front.size; zRear /= info.wheels.rear.size;
  assert.ok(zFront < 0 && zRear > 0,
    `nose harus di -Z (front z=${zFront.toFixed(2)}, rear z=${zRear.toFixed(2)})`);
  assert.ok(zFront < zRear, 'roda depan lebih dekat ke nose');
});

test('GLB: buildWheelPivots -> 4 pivot (2 depan), pusat pivot == pusat roda', () => {
  const { root } = buildGlbMirror();
  const info = alignCarModel(root, CAR_CFG);
  const piv = buildWheelPivots(info.holder, info.wheels);
  assert.ok(piv, 'pivot harus berhasil dibuat');
  assert.equal(piv.length, 4);
  assert.equal(piv.filter(p => p.front).length, 2);
  for (const p of piv){
    assert.equal(p.pivot.parent, info.holder, 'pivot harus anak holder (frame aligned)');
  }
  /* reparent roda ke pivot tidak boleh menggeser pusat roda di dunia */
  const pv = new THREE.Vector3(), pv2 = new THREE.Vector3();
  for (const p of piv){
    p.pivot.getWorldPosition(pv);
    p.group.getWorldPosition(pv2);
    assert.ok(pv.distanceTo(pv2) < 0.01,
      `pusat pivot harus == pusat roda ${p.group.name} (selisih ${pv.distanceTo(pv2).toFixed(4)} m)`);
  }
});

test('GLB: animasi roda via Car — semua berputar, hanya DEPAN menyetir', () => {
  const { root } = buildGlbMirror();
  const info = alignCarModel(root, CAR_CFG);
  const piv = buildWheelPivots(info.holder, info.wheels);

  const scene = new THREE.Scene();
  const car = new Car(scene, { terrainH: () => 2, colliders: [], limit: 200, waterY: 0, audio: null });
  car.model = info.holder;
  car.glbWheels = piv;
  car.procedural.visible = false;
  car.body.add(info.holder);
  car.spawnAt(0, 0, 0);

  const C = car.cfg;
  /* kunci keadaan yang dikenal: v=8 m/s, setir 0.5 (target sudah dicapai) */
  car.speed = 8;
  car.rpm = C.idleRpm;
  car.wheelAngle = 0;
  car.tractionSlip = 0;
  const speedFactor = Math.min(1, Math.max(0.22, 1 - 8/(C.maxSpeed*1.15)));
  car.steer = 0.5 * C.maxSteer * speedFactor;
  car.update(DT, { throttle: 0, brake: 0, steer: 0.5 }, true);

  const phi = car.wheelAngle;
  assert.ok(phi > 0.2, `roda harus berputar selama 1 frame @8 m/s (Δ=${phi.toFixed(3)} rad)`);
  const qSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), phi);
  const qSteer = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), -car.steer);
  for (const p of piv){
    const rel = new THREE.Quaternion().copy(p.baseQ).invert().multiply(p.pivot.quaternion);
    if (p.front){
      /* pivot = baseQ · Qy(-steer) · Qx(-spin)  ->  hapus spin, sisa murni Qy */
      const residual = rel.multiply(qSpin);
      const e = new THREE.Euler().setFromQuaternion(residual, 'XYZ');
      assert.ok(near(e.y, -car.steer, 0.01),
        `roda depan ${p.group.name}: setir harus -steer (e.y=${e.y.toFixed(3)}, target ${(-car.steer).toFixed(3)})`);
      assert.ok(Math.abs(e.x) < 0.02 && Math.abs(e.z) < 0.02,
        `roda depan ${p.group.name}: tidak boleh ada rotasi liar selain setir`);
    } else {
      const residual = rel.multiply(qSpin);
      const e = new THREE.Euler().setFromQuaternion(residual, 'XYZ');
      assert.ok(Math.abs(e.x) < 0.02 && Math.abs(e.y) < 0.02 && Math.abs(e.z) < 0.02,
        `roda belakang ${p.group.name}: TIDAK boleh ikut menyetir (e x=${e.x.toFixed(3)} y=${e.y.toFixed(3)} z=${e.z.toFixed(3)})`);
    }
  }
  /* semua pivot harus sudah berputar: sudut antara baseQ dan quaternion pivot */
  for (const p of piv){
    const dq = new THREE.Quaternion().copy(p.baseQ).invert().multiply(p.pivot.quaternion);
    const a = 2 * Math.acos(Math.min(1, Math.abs(dq.w)));
    assert.ok(a > 0.2, `pivot ${p.group.name} harus sudah berputar (Δ=${a.toFixed(2)} rad)`);
  }
});

test('alignCarModel melempar Error untuk model tanpa mesh (fallback procedural)', () => {
  const empty = new THREE.Group();
  empty.name = 'empty';
  const g = new THREE.Group(); g.name = 'child';
  empty.add(g);
  assert.throws(() => alignCarModel(empty, CAR_CFG), /tidak punya mesh/i);
});

test('fixCarModelMaterials: sRGB + mipmap untuk map, normal map linear, flipY tidak disentuh', () => {
  const mat = new THREE.MeshStandardMaterial();
  const mk = (flipY) => {
    const t = new THREE.DataTexture(new Uint8Array([255,0,0,255]), 1, 1);
    t.colorSpace = THREE.NoColorSpace;
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.flipY = flipY;
    return t;
  };
  mat.map = mk(false);
  mat.emissiveMap = mk(true);
  mat.normalMap = mk(false);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), mat);
  const grp = new THREE.Group(); grp.add(mesh);
  fixCarModelMaterials(grp);
  for (const t of [mat.map, mat.emissiveMap]){
    assert.equal(t.colorSpace, THREE.SRGBColorSpace, 'map/emissiveMap harus SRGBColorSpace');
    assert.equal(t.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(t.magFilter, THREE.LinearFilter);
  }
  assert.equal(mat.normalMap.colorSpace, THREE.NoColorSpace, 'normal map harus tetap linear');
  assert.equal(mat.normalMap.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(mat.map.flipY, false,  'flipY (pasang GLTFLoader) tidak boleh diubah');
  assert.equal(mat.emissiveMap.flipY, true, 'flipY (pasang GLTFLoader) tidak boleh diubah');
});

test('Sumber js/car.js bebas THREE.RedFormat (GPU Android)', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'js/car.js'), 'utf8');
  /* hapus komentar dulu: menyebut "RedFormat" di komentar tidak boleh
     membuat tes gagal (yang dilarang adalah PENGGUNAAN-nya di kode) */
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  assert.ok(!/RedFormat/.test(src), 'RedFormat dilarang dipakai di kode (bukan komentar)');
});

test('Toon ramp procedural: DataTexture RGBA8 4 langkah, NearestFilter, tanpa mipmap', () => {
  const scene = new THREE.Scene();
  const car = new Car(scene, { terrainH: () => 0, colliders: [], limit: 200, waterY: -1, audio: null });
  const mats = new Set();
  car.procedural.traverse(o => { if (o.isMesh && o.material && o.material.isMeshToonMaterial) mats.add(o.material); });
  assert.ok(mats.size > 0, 'model procedural harus punya material toon');
  for (const m of mats){
    const t = m.gradientMap;
    assert.ok(t, 'material toon harus punya gradientMap');
    assert.equal(t.format, THREE.RGBAFormat, 'gradientMap harus RGBAFormat (bukan RedFormat)');
    assert.equal(t.type, THREE.UnsignedByteType);
    assert.equal(t.image.width, 4);
    assert.equal(t.image.height, 1);
    const d = t.image.data;
    assert.equal(d[0], 70); assert.equal(d[4], 140); assert.equal(d[8], 205); assert.equal(d[12], 255);
    assert.equal(d[3], 255, 'alpha harus 255 (RGBA eksplisit)');
    assert.equal(t.minFilter, THREE.NearestFilter);
    assert.equal(t.magFilter, THREE.NearestFilter);
    assert.equal(t.generateMipmaps, false);
  }
});

/* ========================== model sintetis ========================== */

test('Synthetic: group setir interior tidak ikut terdeteksi', () => {
  const root = makeSynthetic({ addSteering: true });
  const det = detectCarWheels(root);
  assert.ok(det);
  assert.equal(det.wheels.length, 4);
  assert.ok(!det.wheels.some(w => /steering/i.test(w.node.name)));
  assert.ok(det.byName);
  /* nose sintetis di +Z */
  assert.equal(modelNoseSign(det.front, det.rear), +1);
});

test('Synthetic: panjang di sumbu X -> holder diputar -90° lalu nose benar', () => {
  const root = makeSynthetic({ longX: true });
  const info = alignCarModel(root, CAR_CFG);
  const holder = info.holder;
  /* -π/2 (sumbu X->Z) + π (flip nose) = +π/2 mod 2π */
  let ry = holder.rotation.y % (2*Math.PI);
  if (ry < 0) ry += 2*Math.PI;
  assert.ok(near(ry, Math.PI/2, 1e-3), 'rotasi holder ≈ +90° (mod 2π), dapat ' + ry);
  holder.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(holder);
  const size = bb.getSize(new THREE.Vector3());
  assert.ok(size.z > size.x, 'setelah align, sumbu terpanjang harus Z');
  const pv = new THREE.Vector3();
  let zFront = 0, zRear = 0;
  info.wheels.front.forEach(w => { w.getWorldPosition(pv); zFront += pv.z; });
  info.wheels.rear .forEach(w => { w.getWorldPosition(pv); zRear  += pv.z; });
  assert.ok(zFront < zRear, `nose harus di -Z (front ${zFront.toFixed(2)} < rear ${zRear.toFixed(2)})`);
});

test('Synthetic: root berotasi (pola Sketchfab) tidak dirusak penyelarasan', () => {
  const root = makeSynthetic({ doubleQuat: true });
  /* dua rotasi saling meniadakan: world == posisi raw (nose +Z, atas +Y) */
  const info = alignCarModel(root, CAR_CFG);
  const holder = info.holder;
  /* rotasi author utuh — bug lama: holder/rotation ditulis ke root */
  assert.ok(near(root.quaternion.x, -0.70710678, 1e-4), 'root quaternion tidak berubah');
  assert.equal(root.rotation.y, 0);
  holder.updateMatrixWorld(true);
  /* atas mobil tetap vertikal: sumbu Y kontainer sintetis (yang memuat
     bodi) harus memetakan ke ±Y dunia — kalau penyelarasan menimpa
     rotasi root (bug lama), mobil miring ke sisi */
  root.updateMatrixWorld(true);
  const inner = root.children[0];
  inner.updateWorldMatrix(true, false);
  const upWorld = new THREE.Vector3().setFromMatrixColumn(inner.matrixWorld, 1);
  assert.ok(Math.abs(upWorld.y) > 0.99,
    'sumbu atas mobil harus tetap vertikal setelah align, dapat ' + upWorld.toArray().map(v=>v.toFixed(3)).join(','));
  /* nose berakhir di -Z dunia */
  const pv = new THREE.Vector3();
  let zFront = 0, zRear = 0;
  info.wheels.front.forEach(w => { w.getWorldPosition(pv); zFront += pv.z; });
  info.wheels.rear .forEach(w => { w.getWorldPosition(pv); zRear  += pv.z; });
  assert.ok(zFront < zRear, `nose harus di -Z (front ${zFront.toFixed(2)} < rear ${zRear.toFixed(2)})`);
  /* pivot tetap valid */
  const piv = buildWheelPivots(holder, info.wheels);
  assert.equal(piv.length, 4);
});

test('Synthetic: roda tanpa nama front/rear -> fallback z-split', () => {
  const root = makeSynthetic({});
  /* hapus nama agar deteksi jatuh ke fallback z-split */
  root.traverse(o => { if (o.name.startsWith('3DWheel')) o.name = 'Wheel_' + (o.name.length); });
  const det = detectCarWheels(root);
  assert.ok(det, 'fallback z-split harus tetap menemukan roda');
  assert.equal(det.wheels.length, 4);
  assert.equal(det.byName, false);
  assert.equal(det.front.size, 2);
  assert.equal(det.rear.size, 2);
});
