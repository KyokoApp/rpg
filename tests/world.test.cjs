const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const dataURL=pathToFileURL(path.join(root,'game/world-data.mjs')).href;
const data=import(dataURL);
const three=import(pathToFileURL(path.join(root,'three.module.js')).href);
async function streamer(){
 const source=fs.readFileSync(path.join(root,'game/world-stream.mjs'),'utf8').replace("from 'three'",`from '${pathToFileURL(path.join(root,'three.module.js')).href}'`).replace("from './world-data.mjs'",`from '${dataURL}'`);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
test('world is a nominal 24 km square with seven distinct reachable destinations',async()=>{
 const {WORLD_SIZE,WORLD_LIMIT,WAYPOINTS,terrainH,roadInfo}=await data;
 assert.equal(WORLD_SIZE,24000);assert.equal((WORLD_SIZE/1000)**2,576);assert.equal(WAYPOINTS.length,7);
 assert.equal(new Set(WAYPOINTS.map(w=>w.id)).size,7);
 for(const w of WAYPOINTS){assert(Math.abs(w.x)<WORLD_LIMIT&&Math.abs(w.z)<WORLD_LIMIT);assert(terrainH(w.x,w.z)>0);assert(roadInfo(w.x,w.z).edge<0);}
});
test('main and branch roads have continuous 16 m and 8 m carriageways',async()=>{
 const {roadX,roadInfo,roadHeight,terrainH}=await data;
 for(const [lane,half] of [[0,8],[1,4],[-2,8],[-1,4]])for(let z=-11000;z<11000;z+=317){
  const x=roadX(z,lane);assert(roadInfo(x,z).edge<0);
  for(const side of [-half,0,half])assert(Math.abs(terrainH(x+side,z)-roadHeight(x+side,z))<1e-8);
 }
 assert.equal(roadInfo(roadX(1700,0),1700).halfWidth,8);assert.equal(roadInfo(roadX(1700,1),1700).halfWidth,4);
});
test('all road intersections meet and road grades stay below 6 percent',async()=>{
 const {intersection,roadX,roadZ,terrainH}=await data;
 for(let a=-3;a<=3;a++)for(let b=-3;b<=3;b++){const p=intersection(a,b);assert(Math.abs(p.x-roadX(p.z,a))<1e-7);assert(Math.abs(p.z-roadZ(p.x,b))<1e-7);}
 for(let lane=-3;lane<=3;lane++)for(let z=-11500;z<11500;z+=57){const x=roadX(z,lane),nx=roadX(z+1,lane);assert(Math.abs(terrainH(nx,z+1)-terrainH(x,z))/Math.hypot(nx-x,1)<.06);}
});
test('terrain and vegetation seed are deterministic across negative and distant chunks',async()=>{
 const {randomForChunk,terrainH,terrainColor}=await data;
 for(const [x,z] of [[0,0],[-9000,9700],[11950,-11950]]){
  const a=randomForChunk(x,z),b=randomForChunk(x,z);for(let i=0;i<100;i++)assert.equal(a(),b());
  assert(Number.isFinite(terrainH(x,z)));assert.deepEqual(terrainColor(x,z),terrainColor(x,z));assert(terrainColor(x,z).every(v=>v>=0&&v<=1));
 }
});
test('chunk scheduling is bounded, unique, nearest-first, and clipped at world edges',async()=>{
 const {chunkPlan,CHUNK_SIZE,WORLD_SIZE}=await data;
 for(const [x,z] of [[0,0],[-7000,9000],[11968,11968],[-11968,-11968]]){
  const plan=chunkPlan(x,z,3);assert(plan.length<=49);assert.equal(new Set(plan.map(p=>p.key)).size,plan.length);assert.equal(plan[0].distance,0);
  plan.forEach((p,i)=>{assert(p.cx*CHUNK_SIZE<WORLD_SIZE/2&&(p.cx+1)*CHUNK_SIZE>-WORLD_SIZE/2);if(i)assert(p.distance>=plan[i-1].distance);});
 }
});
test('adjacent detailed terrain tiles share edge heights and normals',async()=>{
 const {WorldStream}=await streamer(),THREE=await three;const world=new WorldStream(new THREE.Scene(),{mobile:true});
 const a=world.createTerrain(-1,0,true),b=world.createTerrain(0,0,true);
 try{for(let z=0;z<=64;z++){const ai=z*65+64,bi=z*65;assert.equal(a.attributes.position.getY(ai),b.attributes.position.getY(bi));for(const axis of ['getX','getY','getZ'])assert.equal(a.attributes.normal[axis](ai),b.attributes.normal[axis](bi));}}
 finally{a.dispose();b.dispose();world.dispose();}
});
test('streaming all regions releases old tiles and keeps shared resources alive',async()=>{
 const {WorldStream}=await streamer(),THREE=await three,{WAYPOINTS}=await data;
 const scene=new THREE.Scene(),world=new WorldStream(scene,{mobile:true});let sharedDisposed=0;
 world.geometries.leaf.addEventListener('dispose',()=>sharedDisposed++);
 let firstGeometryDisposals=0;
 for(const [i,w] of WAYPOINTS.entries()){
  world.update(w.x,w.z+6,true);while(world.pending.length)world.update(w.x,w.z+6);
  assert.equal(world.stats.loaded,49);assert.equal(scene.children.length,49);assert.equal(world.stats.pending,0);assert(world.chunks.has(world.center));
  assert(world.colliders.every(c=>Math.hypot(c.x-w.x,c.z-w.z)<1800));
  if(i===0)world.chunks.values().next().value.geometry.addEventListener('dispose',()=>firstGeometryDisposals++);
 }
 assert(firstGeometryDisposals>0);assert(world.stats.disposed>=6*49);assert.equal(sharedDisposed,0);
 world.dispose();assert.equal(scene.children.length,0);assert.equal(sharedDisposed,1);assert.equal(world.colliders.length,0);
});
