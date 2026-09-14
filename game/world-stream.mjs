import * as THREE from 'three';
import {CHUNK_SIZE,WORLD_SIZE,WAYPOINTS,terrainH,terrainColor,regionAt,roadInfo,roadX,roadZ,ROAD_SPACING,randomForChunk,chunkPlan,TERRAIN_GLSL} from './world-data.mjs';

export class WorldStream {
 constructor(scene,{mobile=false,textures=null,detail=2,roadProps=true,roadPropSpacing=130,propsNear=0,propsFar=0,segmentsNear=0,segmentsFar=0}={}){
  this.scene=scene;this.radius=mobile?3:4;this.mobile=mobile;
  /* Kedetailan dunia & properti jalan datang dari game/quality.mjs.
     Default-nya = preset "Sedang" supaya pemanggil lama (termasuk
     tests/world.test.cjs yang tidak mengirim opsi) tetap identik. */
  this.detail=detail|0;this.roadProps=!!roadProps;this.roadPropSpacing=Math.max(40,roadPropSpacing|0||130);
  /* Kerapatan properti & detail terrain bisa disetel dari luar
     (game/quality.mjs). Kalau tidak dikirim, dipakai angka lama supaya
     tests/world.test.cjs — yang tidak mengirim opsi — tetap identik. */
  this.propsNear=propsNear|0||(mobile?32:48);
  this.propsFar=propsFar|0||8;
  this.segmentsNear=Math.max(8,segmentsNear|0||64);
  this.segmentsFar=Math.max(4,segmentsFar|0||12);
  this.textures=textures||null;this.chunks=new Map();this.pending=[];this.center='';this.colliders=[];
  this.terrainMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0});
  this.terrainMaterial.onBeforeCompile=shader=>{
   shader.vertexShader='varying vec2 vWorldXZ;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWorldXZ=(modelMatrix*vec4(transformed,1.0)).xz;');
   shader.fragmentShader='varying vec2 vWorldXZ;\n'+TERRAIN_GLSL+'\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec3 road=roadData(vWorldXZ);
    float pave=1.0-smoothstep(-0.25,0.35,road.x);
    vec2 cell=vec2(vWorldXZ.x/1.5+mod(floor(vWorldXZ.y/1.1),2.0)*0.5,vWorldXZ.y/1.1);
    vec2 joint=abs(fract(cell)-0.5);
    float grout=smoothstep(0.43,0.49,max(joint.x,joint.y));
    float noise=fract(sin(dot(floor(cell),vec2(127.1,311.7)))*43758.5453);
    vec3 stone=mix(vec3(.31,.29,.24),vec3(.43,.40,.32),noise);
    stone*=1.0-grout*.22;
    float inlay=1.0-smoothstep(.06,.14,abs(road.x+1.0));
    stone=mix(stone,vec3(.61,.53,.32),inlay*.6);
    float shoulder=1.0-smoothstep(0.0,3.5,road.x);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.39,.36,.27),shoulder*.5);
    diffuseColor.rgb=mix(diffuseColor.rgb,stone,pave);
   `);
  };
  this.geometries={trunk:new THREE.CylinderGeometry(.35,.7,7,6),leaf:new THREE.IcosahedronGeometry(3.3,1),pine:new THREE.ConeGeometry(3.4,10,7),rock:new THREE.DodecahedronGeometry(1,0),pillar:new THREE.CylinderGeometry(1.4,1.8,12,8),box:new THREE.BoxGeometry(1,1,1),roof:new THREE.ConeGeometry(3.5,5,6),crystal:new THREE.OctahedronGeometry(1.5),plinth:new THREE.CylinderGeometry(7,8,1.2,12),
   /* tiang lampu jalan: batang + kepala + lengan. Segmentasi rendah
      (6-8) karena tiang tipis; detail datang dari tekstur, bukan geometri */
   pole:new THREE.CylinderGeometry(.16,.22,7.4,7),poleArm:new THREE.BoxGeometry(1.5,.16,.16),lampHead:new THREE.CylinderGeometry(.42,.3,.5,8),post:new THREE.CylinderGeometry(.13,.17,3.2,6)};
  this.materials={trunk:new THREE.MeshStandardMaterial({color:0x615041,roughness:1}),leaf:new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),rock:new THREE.MeshStandardMaterial({color:0x8e958b,roughness:1}),stone:new THREE.MeshStandardMaterial({color:0xb6b7a0,roughness:.85}),roof:new THREE.MeshStandardMaterial({color:0x426776,roughness:.65}),crystal:new THREE.MeshStandardMaterial({color:0x9cede3,emissive:0x52b8ba,emissiveIntensity:.65,roughness:.3}),
   metal:new THREE.MeshStandardMaterial({color:0x9aa1ab,roughness:.42,metalness:.7}),
   lampGlass:new THREE.MeshStandardMaterial({color:0xfff3d0,emissive:0xffd79a,emissiveIntensity:1.15,roughness:.35})};
  /* Tekstur prosedural dipasang HANYA kalau diberikan. Di tes headless
     (tanpa DOM) textures=null, dan material tetap berwarna polos —
     jadi modul ini tidak pernah menyentuh canvas sendiri. */
  this._applyTextures();
  this.disposedChunks=0;
 }
 _applyTextures(){
  const t=this.textures;if(!t)return;
  const map=(mat,key,rx=2,ry=2)=>{
   const src=t[key];if(!src)return;
   /* clone supaya tiap material punya repeat sendiri; tekstur sumber
      tetap milik pemanggil (index.html) dan di-dispose di sana */
   const c=src.clone();c.needsUpdate=true;c.wrapS=c.wrapT=THREE.RepeatWrapping;c.repeat.set(rx,ry);
   mat.map=c;mat.needsUpdate=true;
  };
  map(this.materials.trunk,'bark',1,3);
  map(this.materials.rock,'rock',2,2);
  map(this.materials.stone,'stone',2,2);
  map(this.materials.roof,'roof',3,3);
  map(this.materials.metal,'metal',1,4);
  /* logam jadi lebih "logam" begitu ada tekstur: pantulan panjang
     terlihat hanya kalau roughness diturunkan */
  this.materials.metal.roughness=.34;this.materials.metal.metalness=.78;
 }
 createTerrain(cx,cz,near){
  const segments=near?this.segmentsNear:this.segmentsFar,step=CHUNK_SIZE/segments;
  const positions=[],colors=[],indices=[];
  for(let z=0;z<=segments;z++)for(let x=0;x<=segments;x++){
   const wx=cx*CHUNK_SIZE+x*step,wz=cz*CHUNK_SIZE+z*step,h=terrainH(wx,wz);
   positions.push(x*step,h,z*step);
   const color=terrainColor(wx,wz),shade=.94+.06*Math.sin(wx*.05)*Math.cos(wz*.04);
   colors.push(...color.map(v=>v*shade));
  }
  const row=segments+1;
  for(let z=0;z<segments;z++)for(let x=0;x<segments;x++){const a=z*row+x;indices.push(a,a+row,a+1,a+1,a+row,a+row+1);}
  // Skirts hide cracks where near/far meshes have different edge subdivisions.
  const edges=[[],[],[],[]];
  for(let i=0;i<=segments;i++){edges[0].push(i);edges[1].push(i*row+segments);edges[2].push(segments*row+segments-i);edges[3].push((segments-i)*row);}
  for(const edge of edges){const first=positions.length/3;for(const i of edge){positions.push(positions[i*3],positions[i*3+1]-35,positions[i*3+2]);colors.push(colors[i*3],colors[i*3+1],colors[i*3+2]);}for(let i=0;i<edge.length-1;i++)indices.push(edge[i],first+i,edge[i+1],edge[i+1],first+i,first+i+1);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  // Analytic edge normals keep lighting continuous across chunk borders.
  const normals=geometry.attributes.normal;
  for(let z=0;z<=segments;z++)for(let x=0;x<=segments;x++){const wx=cx*CHUNK_SIZE+x*step,wz=cz*CHUNK_SIZE+z*step;const n=new THREE.Vector3(terrainH(wx-.5,wz)-terrainH(wx+.5,wz),1,terrainH(wx,wz-.5)-terrainH(wx,wz+.5)).normalize();normals.setXYZ(z*row+x,n.x,n.y,n.z);}
  geometry.computeBoundingSphere();return geometry;
 }
 build(spec){
  const {cx,cz,near}=spec,group=new THREE.Group();group.position.set(cx*CHUNK_SIZE,0,cz*CHUNK_SIZE);
  const geometry=this.createTerrain(cx,cz,near),ground=new THREE.Mesh(geometry,this.terrainMaterial);ground.receiveShadow=true;group.add(ground);
  const colliders=[],random=randomForChunk(cx,cz),dummy=new THREE.Object3D();
  const matrices={trunk:[],leaf:[],pine:[],rock:[]},tints={leaf:[],pine:[]};
  const add=(kind,x,y,z,sx,sy,sz,yaw=0)=>{dummy.position.set(x,y,z);dummy.rotation.set(0,yaw,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();matrices[kind].push(dummy.matrix.clone());};
  const count=near?this.propsNear:this.propsFar;
  for(let i=0;i<count;i++){
   const x=random()*CHUNK_SIZE,z=random()*CHUNK_SIZE,wx=x+group.position.x,wz=z+group.position.z,y=terrainH(wx,wz);
   const scale=.65+random()*1.05,region=regionAt(wx,wz);
   if(y<2||roadInfo(wx,wz).edge<10||WAYPOINTS.some(w=>Math.hypot(wx-w.x,wz-w.z)<70))continue;
   if(random()<.22||region.id==='amber'){
    add('rock',x,y+scale,z,scale*2,scale*1.5,scale*1.7,random()*6.28);if(near)colliders.push({x:wx,z:wz,r:scale*1.7});continue;
   }
   add('trunk',x,y+3.5*scale,z,scale,scale,scale);
   const type=['frost','highlands'].includes(region.id)?'pine':'leaf';
   add(type,x,y+8*scale,z,scale,type==='leaf'?.85*scale:scale,scale,random()*6.28);
   tints[type].push(new THREE.Color(region.foliage));
   if(near)colliders.push({x:wx,z:wz,r:.65*scale});
  }
  for(const kind of Object.keys(matrices)){
   if(!matrices[kind].length)continue;
   const mesh=new THREE.InstancedMesh(this.geometries[kind],this.materials[kind==='pine'?'leaf':kind],matrices[kind].length);
   matrices[kind].forEach((m,i)=>{mesh.setMatrixAt(i,m);if(tints[kind])mesh.setColorAt(i,tints[kind][i]);});mesh.castShadow=near;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);
  }
  for(const waypoint of WAYPOINTS){
   if(Math.floor(waypoint.x/CHUNK_SIZE)!==cx||Math.floor(waypoint.z/CHUNK_SIZE)!==cz)continue;
   this.addLandmark(group,colliders,waypoint);
  }
  this.addRoadProps(group,colliders,cx,cz,near,dummy);
  this.scene.add(group);return {...spec,group,geometry,colliders};
 }
 addLandmark(group,colliders,w){
  const ox=group.position.x,oz=group.position.z;
  const piece=(geo,mat,x,y,z,sx=1,sy=1,sz=1)=>{const mesh=new THREE.Mesh(this.geometries[geo],this.materials[mat]);mesh.position.set(x-ox,y,z-oz);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;};
  // A 20 m clear gateway: no pillars obstruct the 16 m carriageway.
  const x=w.x,z=w.z+45,y=terrainH(x,z);
  for(const side of [-1,1]){
   const px=x+side*12,py=terrainH(px,z);
   piece('pillar','stone',px,py+6,z);piece('roof','roof',px,py+14.5,z);
   colliders.push({x:px,z,r:1.8});
  }
  piece('box','stone',x,y+11.8,z,26,1.3,2.3);piece('crystal','crystal',x,y+14,z,.65,.65,.65);
  // Off-road teleport shrine, distinctive region monument and a roadside sign.
  const sx=w.x+35,sz=w.z+30,sy=terrainH(sx,sz);
  piece('plinth','stone',sx,sy+.6,sz);
  piece('crystal','crystal',sx,sy+4,sz,1,2,1);
  colliders.push({x:sx,z:sz,r:2});
  for(let i=0;i<4;i++){
   const a=i*Math.PI/2,px=sx+Math.cos(a)*10,pz=sz+Math.sin(a)*10,py=terrainH(px,pz);
   piece('pillar','stone',px,py+5,pz,.55,.8,.55);piece('crystal','crystal',px,py+10,pz,.35,.5,.35);
   colliders.push({x:px,z:pz,r:1});
  }
  const signX=w.x-14,signZ=w.z+18,signY=terrainH(signX,signZ);
  piece('box','trunk',signX,signY+1.4,signZ,.25,2.8,.25);piece('box','stone',signX,signY+2.5,signZ,3.5,.7,.18);
  // Crownfall gains a ruined watchtower; other regions have differing silhouettes.
  const tx=w.x-50,tz=w.z-45,ty=terrainH(tx,tz),height=w.id==='highlands'?3:w.id==='frost'?2.5:1.4;
  piece('pillar','stone',tx,ty+6*height,tz,3,height,3);piece('roof','roof',tx,ty+12*height+3,tz,2.2,1.2,2.2);
  colliders.push({x:tx,z:tz,r:5.4});
 }
 /* ---------- properti jalan: TIANG lampu & tonggak penanda ----------
    Diminta pemain ("tambahin texture untuk yang perlu di tambahin kayak
    tiang"). Dua InstancedMesh per chunk, bukan satu Mesh per tiang:
    49 chunk x ~8 tiang jadi 98 draw call, bukan 400.
    Hanya dipasang di chunk `near` supaya chunk jauh tetap murah. */
 addRoadProps(group,colliders,cx,cz,near,dummy){
  if(!this.roadProps||!near)return;
  const ox=group.position.x,oz=group.position.z;
  const spacing=this.roadPropSpacing, half=CHUNK_SIZE/2;
  const ccx=ox+half, ccz=oz+half;
  const poles=[],heads=[];
  const place=(wx,wz,yaw)=>{
   const y=terrainH(wx,wz);
   dummy.position.set(wx-ox,y+3.7,wz-oz);dummy.rotation.set(0,yaw,0);dummy.scale.set(1,1,1);dummy.updateMatrix();
   poles.push(dummy.matrix.clone());
   /* kepala lampu sedikit di atas tiang, condong ke arah jalan */
   dummy.position.set(wx-ox+Math.sin(yaw)*0.6,y+7.5,wz-oz+Math.cos(yaw)*0.6);
   dummy.updateMatrix();heads.push(dummy.matrix.clone());
   colliders.push({x:wx,z:wz,r:.5});
  };
  /* jalan membujur (z konstan per lane) */
  const laneZ0=Math.round((ccz-roadZ(ccx))/ROAD_SPACING);
  for(let lane=laneZ0-1;lane<=laneZ0+1;lane++){
   if(Math.abs(roadZ(ccx,lane)-ccz)>half)continue;
   for(let x=ox+spacing*0.5;x<ox+CHUNK_SIZE;x+=spacing){
    const z=roadZ(x,lane);
    if(z<oz-8||z>oz+CHUNK_SIZE+8)continue;
    place(x,z+11.6,Math.PI*0.5);
    place(x,z-11.6,-Math.PI*0.5);
   }
  }
  /* jalan melintang (x konstan per lane) */
  const laneX0=Math.round((ccx-roadX(ccz))/ROAD_SPACING);
  for(let lane=laneX0-1;lane<=laneX0+1;lane++){
   if(Math.abs(roadX(ccz,lane)-ccx)>half)continue;
   for(let z=oz+spacing*0.5;z<oz+CHUNK_SIZE;z+=spacing){
    const x=roadX(z,lane);
    if(x<ox-8||x>ox+CHUNK_SIZE+8)continue;
    place(x+11.6,z,0);
    place(x-11.6,z,Math.PI);
   }
  }
  if(poles.length){
   const m=new THREE.InstancedMesh(this.geometries.pole,this.materials.metal,poles.length);
   poles.forEach((mx,i)=>m.setMatrixAt(i,mx));
   m.castShadow=true;m.receiveShadow=true;m.computeBoundingSphere();group.add(m);
  }
  if(heads.length){
   const m=new THREE.InstancedMesh(this.geometries.lampHead,this.materials.lampGlass,heads.length);
   heads.forEach((mx,i)=>m.setMatrixAt(i,mx));
   m.receiveShadow=false;m.computeBoundingSphere();group.add(m);
  }
 }
 remove(chunk){
  this.scene.remove(chunk.group);chunk.geometry.dispose();
  chunk.group.traverse(o=>{if(o.isInstancedMesh)o.dispose();});this.disposedChunks++;
 }
 update(x,z,force=false){
  let changed=false;
  const key=`${Math.floor(x/CHUNK_SIZE)},${Math.floor(z/CHUNK_SIZE)}`;
  if(force||key!==this.center){
   this.center=key;const plan=chunkPlan(x,z,this.radius),wanted=new Map(plan.map(p=>[p.key,p]));
   for(const [key,chunk] of this.chunks){if(!wanted.has(key)||wanted.get(key).near!==chunk.near){this.remove(chunk);this.chunks.delete(key);changed=true;}}
   this.pending=plan.filter(p=>!this.chunks.has(p.key));
  }
  // Always synchronously build the close ring after teleport; stream the horizon in batches.
  const budget=force?9:2;
  for(let i=0;i<budget&&this.pending.length;i++){const p=this.pending.shift();this.chunks.set(p.key,this.build(p));changed=true;}
  if(changed||force){this.colliders.length=0;for(const chunk of this.chunks.values())this.colliders.push(...chunk.colliders);}
 }
 dispose(){for(const chunk of this.chunks.values())this.remove(chunk);this.chunks.clear();this.pending=[];this.colliders.length=0;this.terrainMaterial.dispose();Object.values(this.geometries).forEach(g=>g.dispose());
  /* material.dispose() TIDAK melepas .map. Karena _applyTextures()
     meng-clone tekstur per material, klon itu milik kita dan wajib
     dibuang di sini — kalau tidak, tiap kali dunia di-dispose VRAM
     untuk tekstur menumpuk. Tekstur SUMBER tetap milik pemanggil. */
  Object.values(this.materials).forEach(m=>{if(m.map&&m.map.dispose)m.map.dispose();m.dispose();});}
 get stats(){return {loaded:this.chunks.size,pending:this.pending.length,max:(this.radius*2+1)**2,disposed:this.disposedChunks};}
}
