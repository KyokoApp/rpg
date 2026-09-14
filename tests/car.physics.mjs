/* ============================================================
   TES FISIKA MOBIL — headless, tanpa browser/GPU.
   Jalankan:  node tests/car.physics.mjs        (dari root repo)

   three.js yang dipakai adalah file VENDORED di repo (lihat importmap.mjs),
   jadi hasilnya persis seperti di browser. terrainH(), batas dunia, dan tinggi
   air diimpor langsung dari game/world-data.mjs — sumber yang sama dipakai
   index.html — supaya tes tidak pernah tidak sinkron dengan gamenya.
============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import './importmap.mjs';     // petakan 'three' -> three.module.js vendored
import './stubs.mjs';         // stub DOM + canvas 2D

const THREE = await import('three');
const { Car, CAR_CFG } = await import('../js/car.js');

/* terrainH() ASLI dari modul dunia — kalau rumusnya berubah, tes ikut berubah. */
const { terrainH: realTerrain, WATER_LEVEL, WORLD_LIMIT } = await import('../game/world-data.mjs');
/* Dataran uji 2 m di atas permukaan air: game memakai WATER_LEVEL=0, jadi
   tanah "rata" di tes juga harus di atas air (kalau tidak, mobil dianggap
   berada di air dan tidak bisa bergerak). */
const flat=()=>2;
const DT=1/60;
const bad=[];
function chk(name,cond,extra=''){ if(!cond) bad.push(name+' '+extra); }
function nanCheck(tag,c){
  for(const k of ['speed','rpm','slip','steer','yaw','pitch','roll','nitro','suspension','yawRate'])
    if(!Number.isFinite(c[k])) bad.push(`NaN di ${tag}.${k} = ${c[k]}`);
  for(const k of ['x','y','z']) if(!Number.isFinite(c.pos[k])) bad.push(`NaN di ${tag}.pos.${k}`);
}
function mkCar(terrainH=flat, colliders=[], limit=WORLD_LIMIT){
  const scene=new THREE.Scene();
  const c=new Car(scene,{terrainH,colliders,limit,waterY:WATER_LEVEL,audio:null});
  c.spawnAt(0,0,0);
  return c;
}
const IN=(o={})=>Object.assign({throttle:0,brake:0,steer:0,handbrake:false,nitro:false},o);

/* ===== T1: akselerasi 0-100 km/j & kecepatan puncak ===== */
{
  const c=mkCar(); let t=0, t100=null;
  for(let i=0;i<60*90;i++){ c.update(DT,IN({throttle:1}),true); t+=DT; nanCheck('T1',c);
    if(t100===null && c.kmh>=100) t100=t; }
  console.log(`T1  0-100 km/j : ${t100?t100.toFixed(2)+' s':'TIDAK TERCAPAI'}`);
  console.log(`    top speed  : ${c.kmh.toFixed(1)} km/j (${c.speed.toFixed(2)} m/s) | gigi ${c.gear} | rpm ${c.rpm.toFixed(0)}`);
  chk('T1 top speed ~maxSpeed', Math.abs(c.speed-CAR_CFG.maxSpeed)<3.5, `got ${c.speed.toFixed(2)} want ~${CAR_CFG.maxSpeed}`);
  chk('T1 0-100 masuk akal (3-8s)', t100 && t100>2.5 && t100<9, `got ${t100}`);
  chk('T1 gigi sampai 6', c.gear===6, `gigi ${c.gear}`);
}
/* ===== T2: arah belok (steer +1 = kanan = yaw turun, gerak ke -X) ===== */
{
  const c=mkCar(); c.update(DT,IN({throttle:1}),true);
  for(let i=0;i<60*3;i++) c.update(DT,IN({throttle:1}),true);
  const yaw0=c.yaw, x0=c.pos.x, z0=c.pos.z;
  for(let i=0;i<60*1.5;i++){ c.update(DT,IN({throttle:0.6,steer:1}),true); nanCheck('T2',c); }
  console.log(`T2  steer=+1 (KANAN): Δyaw=${(c.yaw-yaw0).toFixed(4)} rad, gerak Δx=${(c.pos.x-x0).toFixed(2)} Δz=${(c.pos.z-z0).toFixed(2)}`);
  chk('T2 yaw berkurang saat belok kanan', c.yaw<yaw0-0.05, `Δyaw=${c.yaw-yaw0}`);
  chk('T2 mobil belok ke -X (kanan layar)', c.pos.x < x0-1.0, `Δx=${c.pos.x-x0}`);
  chk('T2 roda depan ikut belok', Math.abs(c.frontWheels[0].group.rotation.y)>0.05);
}
/* ===== T3: nose model searah gerak ===== */
{
  const c=mkCar();
  for(let i=0;i<60;i++) c.update(DT,IN({throttle:1}),true);
  const fwd=new THREE.Vector3(Math.sin(c.yaw),0,Math.cos(c.yaw));
  const noseLocal=new THREE.Vector3(0,0,-1);            // nose di -Z lokal
  const noseWorld=noseLocal.applyEuler(new THREE.Euler(0,c.root.rotation.y,0));
  const dot=noseWorld.dot(fwd);
  console.log(`T3  dot(nose model, arah gerak) = ${dot.toFixed(4)}  (harus ~+1)`);
  chk('T3 nose searah gerak', dot>0.999, `dot=${dot.toFixed(4)}`);
  chk('T3 root.rotation.y = yaw+PI', Math.abs(c.root.rotation.y-(c.yaw+Math.PI))<1e-9);
}
/* ===== T4: mundur ===== */
{
  const c=mkCar();
  for(let i=0;i<60*6;i++) c.update(DT,IN({brake:1}),true);
  console.log(`T4  tahan REM dari berhenti: speed=${c.speed.toFixed(2)} m/s (${c.kmh.toFixed(1)} km/j), gigi=${c.gear}`);
  chk('T4 bisa mundur', c.speed<-1.0, `speed=${c.speed.toFixed(2)}`);
  chk('T4 mundur dibatasi reverseSpeed', c.speed>=-CAR_CFG.reverseSpeed-0.01);
}
/* ===== T5: rem tangan -> drift + skid mark ===== */
{
  const c=mkCar();
  for(let i=0;i<60*4;i++) c.update(DT,IN({throttle:1}),true);
  let maxSlip=0; const before=c.skid.head;
  for(let i=0;i<60*2;i++){ c.update(DT,IN({throttle:1,steer:0.8,handbrake:true}),true); maxSlip=Math.max(maxSlip,Math.abs(c.slip)); nanCheck('T5',c); }
  const marks=(c.skid.head-before+c.skid.max)%c.skid.max;
  console.log(`T5  handbrake turn: slip maks=${maxSlip.toFixed(3)}, slip01=${c.slip01.toFixed(2)}, skid quads ditulis=${marks}`);
  chk('T5 drift menghasilkan slip', maxSlip>0.15, `slip=${maxSlip}`);
  chk('T5 skid mark tergambar', marks>10, `marks=${marks}`);
}
/* ===== T6: parkir (tidak ditempati) harus berhenti ===== */
{
  const c=mkCar();
  for(let i=0;i<60*4;i++) c.update(DT,IN({throttle:1}),true);
  const v0=c.speed;
  for(let i=0;i<60*12;i++) c.update(DT,IN({handbrake:true}),false);
  console.log(`T6  ditinggal keluar: ${v0.toFixed(1)} -> ${c.speed.toFixed(3)} m/s`);
  chk('T6 mobil berhenti sendiri', Math.abs(c.speed)<0.02, `speed=${c.speed}`);
}
/* ===== T7: nitro ===== */
{
  const c=mkCar();
  for(let i=0;i<60*5;i++) c.update(DT,IN({throttle:1}),true);
  const v0=c.speed;
  for(let i=0;i<60*2;i++) c.update(DT,IN({throttle:1,nitro:true}),true);
  console.log(`T7  nitro: ${v0.toFixed(1)} -> ${c.speed.toFixed(1)} m/s | sisa nitro ${c.nitro.toFixed(0)}`);
  chk('T7 nitro menambah kecepatan', c.speed>v0+1.0, `${v0}->${c.speed}`);
  chk('T7 nitro terkuras', c.nitro<CAR_CFG.nitroMax*0.5);
}
/* ===== T8: tabrakan pohon ===== */
{
  const col=[{x:0,z:40,r:0.6}];
  const c=mkCar(flat,col);
  let impactSpeed=null, speedAtImpact=0, maxShake=0, minDist=1e9;
  for(let i=0;i<60*6;i++){
    const prev=c.speed;
    c.update(DT,IN({throttle:impactSpeed===null?1:0}),true); nanCheck('T8',c);
    maxShake=Math.max(maxShake,c.cameraShake);
    minDist=Math.min(minDist,Math.hypot(c.pos.x-col[0].x,c.pos.z-col[0].z));
    if(impactSpeed===null && prev>0 && c.speed<0){ impactSpeed=c.speed; speedAtImpact=prev; }
  }
  console.log(`T8  nabrak pohon @${speedAtImpact.toFixed(1)} m/s -> ${impactSpeed===null?'TIDAK NABRAK':impactSpeed.toFixed(2)+' m/s'} | jarak terdekat ${minDist.toFixed(2)} (r+R=1.65) | shake maks ${maxShake.toFixed(2)}`);
  chk('T8 tabrakan terdeteksi', impactSpeed!==null);
  chk('T8 tidak tembus pohon', minDist>1.60, `minDist=${minDist.toFixed(2)}`);
  chk('T8 kecepatan mental berkurang', impactSpeed!==null && Math.abs(impactSpeed)<speedAtImpact*0.4);
  chk('T8 camera shake aktif', maxShake>0.05, `shake=${maxShake}`);
}
/* ===== T9: terrain bergelombang -> pitch/roll wajar ===== */
{
  const c=mkCar(realTerrain);
  let maxP=0,maxR=0;
  for(let i=0;i<60*25;i++){ c.update(DT,IN({throttle:1,steer:Math.sin(i*0.02)*0.6}),true); nanCheck('T9',c);
    maxP=Math.max(maxP,Math.abs(c.pitch)); maxR=Math.max(maxR,Math.abs(c.roll)); }
  console.log(`T9  terrain asli 25 detik: |pitch|max=${(maxP*57.3).toFixed(1)}°, |roll|max=${(maxR*57.3).toFixed(1)}°, posisi=(${c.pos.x.toFixed(1)},${c.pos.z.toFixed(1)})`);
  chk('T9 pitch wajar (<25°)', maxP<0.44, `${(maxP*57.3).toFixed(1)}°`);
  chk('T9 roll wajar (<25°)', maxR<0.44, `${(maxR*57.3).toFixed(1)}°`);
  chk('T9 mobil nempel terrain', Math.abs(c.pos.y-realTerrain(c.pos.x,c.pos.z))<1.2);
}
/* ===== T10: stress 60 detik input acak ===== */
{
  const c=mkCar(realTerrain,[{x:30,z:30,r:1.2},{x:-40,z:60,r:0.9}]);
  for(let i=0;i<60*60;i++){
    c.update(DT,IN({throttle:Math.random()<0.75?1:0,brake:Math.random()<0.2?1:0,
      steer:Math.sin(i*0.03)*1.2,handbrake:Math.random()<0.05,nitro:Math.random()<0.2}),true);
    nanCheck('T10',c);
    chk('T10 dalam batas dunia', Math.abs(c.pos.x)<=WORLD_LIMIT&&Math.abs(c.pos.z)<=WORLD_LIMIT);
    chk('T10 rpm tidak negatif', c.rpm>0);
  }
  console.log(`T10 stress 60s: speed=${c.speed.toFixed(1)} rpm=${c.rpm.toFixed(0)} gear=${c.gear} nitro=${c.nitro.toFixed(0)} skidAlive=${c.skid.anyAlive}`);
}
/* ===== T11: gravitasi sepanjang lereng (dunia 24 km punya jalan menanjak) ===== */
{
  const TAN=Math.tan(0.20);                       // ~11,5 derajat
  const hill=(x,z)=>8+x*TAN;                      // menanjak ke arah +X
  const yaw=Math.PI/2;                            // forward = (sin,cos) = +X

  /* (a) menanjak: kecepatan puncak harus lebih rendah daripada di datar */
  const up=mkCar(hill); up.spawnAt(0,0,yaw); let upMax=0;
  for(let i=0;i<60*90;i++){ up.update(DT,IN({throttle:1}),true); upMax=Math.max(upMax,up.speed); nanCheck('T11a',up); }
  const flatCar=mkCar(flat); flatCar.spawnAt(0,0,yaw); let flatMax=0;
  for(let i=0;i<60*90;i++){ flatCar.update(DT,IN({throttle:1}),true); flatMax=Math.max(flatMax,flatCar.speed); }
  console.log(`T11 tanjakan 11,5°: puncak ${upMax.toFixed(1)} m/s vs datar ${flatMax.toFixed(1)} m/s | slope=${(up.slope*57.3).toFixed(1)}°`);
  chk('T11 slope terukur benar', Math.abs(up.slope-0.20)<0.02, `slope=${up.slope}`);
  chk('T11 menanjak lebih lambat', upMax<flatMax-2.0, `${upMax.toFixed(1)} vs ${flatMax.toFixed(1)}`);
  chk('T11 masih bisa menanjak', upMax>10, `upMax=${upMax.toFixed(1)}`);

  /* (b) turunan: base 400 m supaya tidak berakhir di bawah permukaan air
        (WATER_LEVEL=0) selama pengujian. Kecepatan puncak di turunan tetap
        terpotong cap maxSpeed, jadi yang diukur adalah WAKTU mencapai 60 m/s
        dan kemampuan meluncur tanpa gas. */
  const down=(x,z)=>400-x*TAN;
  const time60=c=>{ let t=null; for(let i=0;i<60*60;i++){ c.update(DT,IN({throttle:1}),true);
    nanCheck('T11b',c); if(t===null&&c.speed>=60) t=(i+1)*DT; } return t===null?Infinity:t; };
  const dn=mkCar(down); dn.spawnAt(0,0,yaw); const tDown=time60(dn);
  const fl=mkCar(flat); fl.spawnAt(0,0,yaw);   const tFlat=time60(fl);
  console.log(`T11 waktu ke 60 m/s: turunan ${tDown.toFixed(2)} s vs datar ${tFlat.toFixed(2)} s`);
  chk('T11 turunan lebih cepat mencapai 60', tDown<tFlat-0.15, `${tDown.toFixed(2)} vs ${tFlat.toFixed(2)}`);

  /* tanpa gas pun mobil meluncur turun (bukti komponen gravitasi benar-benar ada) */
  const coast=mkCar(down); coast.spawnAt(0,0,yaw);
  for(let i=0;i<60*4;i++){ coast.update(DT,IN({}),true); nanCheck('T11c',coast); }
  console.log(`T11 meluncur tanpa gas 4 s di turunan 11,5°: ${coast.speed.toFixed(2)} m/s`);
  chk('T11 meluncur turun tanpa gas', coast.speed>4.0, `speed=${coast.speed.toFixed(2)}`);

  /* (c) rem parkir: mobil tanpa pengemudi tidak merayap di tanjakan landai */
  const park=(x,z)=>5+x*Math.tan(0.14);           // ~8 derajat
  const pc=mkCar(park); pc.spawnAt(0,0,yaw);
  for(let i=0;i<60*5;i++) pc.update(DT,IN({}),false);
  console.log(`T11 parkir di 8°: speed=${pc.speed.toFixed(4)} m/s (harus 0)`);
  chk('T11 parkir tidak merayap', pc.speed===0, `speed=${pc.speed}`);

  /* (d) lereng sangat terjal tetap membuat mobil meluncur (tidak beku palsu) */
  const steep=(x,z)=>60-x*Math.tan(0.90);         // ~42 derajat, menurun ke +X
  const sc=mkCar(steep); sc.spawnAt(0,0,yaw);
  for(let i=0;i<60*4;i++){ sc.update(DT,IN({}),false); nanCheck('T11d',sc); }
  chk('T11 lereng terjal meluncur', sc.speed>0.5, `speed=${sc.speed.toFixed(2)}`);
}
console.log('\n================ HASIL ================');
if(bad.length===0) console.log('✅ SEMUA TES LULUS (0 kegagalan)');
else { console.log('❌ '+bad.length+' MASALAH:'); [...new Set(bad)].slice(0,25).forEach(b=>console.log('   -',b)); }
/* exit code harus mencerminkan hasil, kalau tidak CI selalu hijau */
process.exitCode = bad.length ? 1 : 0;
