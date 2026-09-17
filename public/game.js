import * as THREE from './three.module.js';
function terrainH(x,z){return .7*Math.sin(x*.045)*Math.cos(z*.05)+.35*Math.sin(x*.11+1.7)*Math.cos(z*.13+2.3);}
const canvas=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0xbcd9ee,.017);scene.background=new THREE.Color(0xbcd9ee);
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.1,500);
scene.add(new THREE.HemisphereLight(0xcfe4ff,0x3a5f2a,1));const sun=new THREE.DirectionalLight(0xfff1cf,1.4);sun.position.set(60,90,30);scene.add(sun);
const sky=new THREE.Mesh(new THREE.SphereGeometry(280,24,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{top:{value:new THREE.Color(0x4d8ecf)},bot:{value:new THREE.Color(0xd8e9f5)}},vertexShader:`varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`uniform vec3 top,bot;varying vec3 vP;void main(){float h=clamp(normalize(vP).y*1.6+0.12,0.0,1.0);gl_FragColor=vec4(mix(bot,top,h),1.0);}`}));scene.add(sky);
const groundGeo=new THREE.PlaneGeometry(130,130,42,42),ground=new THREE.Mesh(groundGeo,new THREE.MeshLambertMaterial({color:0x274a1b}));ground.rotation.x=-Math.PI/2;ground.frustumCulled=false;scene.add(ground);
let gCX=0,gCZ=0;
function updateGroundHeights(cx,cz){gCX=cx;gCZ=cz;ground.position.set(cx,0,cz);const p=groundGeo.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,terrainH(cx+p.getX(i),cz-p.getY(i)));p.needsUpdate=true;groundGeo.computeVertexNormals();}updateGroundHeights(0,0);
const TRAIL_N=24,SEG=4;
function buildBlade(){const p=[],uv=[],idx=[];for(let s=0;s<SEG;s++){const t=s/SEG,w=.038*(1-t*.92);p.push(-w,t,0,w,t,0);uv.push(0,t,1,t);}p.push(0,1,0);uv.push(.5,1);for(let s=0;s<SEG-1;s++){const a=2*s;idx.push(a,a+2,a+1,a+1,a+2,a+3);}idx.push(2*(SEG-1),2*SEG,2*(SEG-1)+1);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);return g;}
const grassUniforms={uTime:{value:0},uBallPos:{value:new THREE.Vector2()},uBallVel:{value:new THREE.Vector2()},uTrail:{value:Array.from({length:TRAIL_N},()=>new THREE.Vector4())},uFogColor:{value:new THREE.Color(0xbcd9ee)},uFogDensity:{value:.017}};
const grassVert=`
#define TRAIL_N ${TRAIL_N}
attribute vec2 aOffset;attribute vec4 aData;
uniform float uTime;uniform vec2 uBallPos,uBallVel;uniform vec4 uTrail[TRAIL_N];varying vec3 vColor;varying float vDepth;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float terrainH(vec2 p){return 0.7*sin(p.x*0.045)*cos(p.y*0.05)+0.35*sin(p.x*0.11+1.7)*cos(p.y*0.13+2.3);}
void main(){
vec3 p=position;float t=uv.y;float ca=cos(aData.x),sa=sin(aData.x);p=vec3(p.x*ca,p.y,p.x*sa);p.xz*=mix(0.8,1.3,hash(aOffset+7.0));p.y*=aData.y;
vec2 world=aOffset,dBall=world-uBallPos;float dBallL=length(dBall);float lod=mix(1.0,0.55,smoothstep(18.0,40.0,dBallL));p.y*=lod;vec2 bend=vec2(0.0);float flat_=0.0;
float n=noise(world*0.35+vec2(uTime*0.9,uTime*0.7)+aData.w*6.28);float gust=noise(world*0.06+vec2(uTime*0.25,uTime*0.18));bend+=normalize(vec2(0.8,0.55))*(0.05+0.30*gust)*n;
float vlen=length(uBallVel);vec2 vdir=vlen>0.001?uBallVel/vlen:vec2(1.0,0.0);float infl=1.0-smoothstep(0.0,1.35,dBallL);
if(infl>0.001){vec2 dir=dBallL>0.001?dBall/dBallL:vec2(1.0,0.0);float front=clamp(dot(dir,vdir),0.0,1.0)*clamp(vlen/9.0,0.0,1.0);bend+=dir*infl*(0.55+0.65*front);flat_=max(flat_,infl*0.85);}
for(int i=0;i<TRAIL_N;i++){vec4 tr=uTrail[i];if(tr.z>0.004){vec2 d=world-tr.xy;float dl=length(d);float ti=(1.0-smoothstep(0.0,1.05,dl))*tr.z;if(ti>0.004){flat_=max(flat_,ti);bend+=(dl>0.001?d/dl:vec2(1.0,0.0))*ti*0.4;}}}
p.xz+=bend*t*t*lod;p.y*=1.0-0.8*flat_;p.x*=1.0+0.5*flat_;p.y+=terrainH(world);
vec3 base=vec3(0.045,0.105,0.022);vec3 tip=mix(vec3(0.30,0.55,0.10),vec3(0.52,0.66,0.17),aData.z);float flower=step(0.982,hash(aOffset*3.1));vec3 col=mix(base,tip,pow(t,0.75));col*=mix(0.5,1.0,smoothstep(0.0,0.32,t));col*=0.88+0.24*hash(aOffset);col+=vec3(0.06,0.10,0.015)*n*smoothstep(0.55,1.0,t);col=mix(col,vec3(0.93,0.92,0.80),flower*smoothstep(0.72,1.0,t));
vec4 mv=modelViewMatrix*vec4(p+vec3(world.x,0.0,world.y),1.0);vDepth=-mv.z;vColor=col;gl_Position=projectionMatrix*mv;}`;
const grassMat=new THREE.ShaderMaterial({uniforms:grassUniforms,vertexShader:grassVert,fragmentShader:`uniform vec3 uFogColor;uniform float uFogDensity;varying vec3 vColor;varying float vDepth;void main(){float f=1.0-exp(-uFogDensity*uFogDensity*vDepth*vDepth);gl_FragColor=vec4(mix(vColor,uFogColor,clamp(f,0.0,1.0)),1.0);}`,side:THREE.DoubleSide});
let grassMesh=null,offAttr=null,BLADE_COUNT=0;const SPAWN_R=41;
function initGrass(count){if(grassMesh){scene.remove(grassMesh);grassMesh.geometry.dispose();}BLADE_COUNT=count;const base=buildBlade(),geo=new THREE.InstancedBufferGeometry();geo.setIndex(base.index);geo.setAttribute('position',base.getAttribute('position'));geo.setAttribute('uv',base.getAttribute('uv'));const offs=new Float32Array(count*2),datas=new Float32Array(count*4);for(let i=0;i<count;i++){const r=SPAWN_R*Math.sqrt(Math.random()),a=Math.random()*Math.PI*2;offs[i*2]=Math.cos(a)*r;offs[i*2+1]=Math.sin(a)*r;datas.set([Math.random()*Math.PI*2,.75+Math.random()*.8,Math.random(),Math.random()],i*4);}offAttr=new THREE.InstancedBufferAttribute(offs,2);offAttr.setUsage(THREE.DynamicDrawUsage);geo.setAttribute('aOffset',offAttr);geo.setAttribute('aData',new THREE.InstancedBufferAttribute(datas,4));geo.instanceCount=count;grassMesh=new THREE.Mesh(geo,grassMat);grassMesh.frustumCulled=false;scene.add(grassMesh);}
function recycleGrass(bx,bz){if(!offAttr)return;const arr=offAttr.array,R2=(SPAWN_R+1)**2;let changed=false;for(let i=0;i<BLADE_COUNT;i++){const dx=arr[i*2]-bx,dz=arr[i*2+1]-bz;if(dx*dx+dz*dz>R2){const r=SPAWN_R*Math.sqrt(Math.random()),a=Math.random()*Math.PI*2;arr[i*2]=bx+Math.cos(a)*r;arr[i*2+1]=bz+Math.sin(a)*r;changed=true;}}if(changed)offAttr.needsUpdate=true;}
const ball=new THREE.Mesh(new THREE.SphereGeometry(.5,32,24),new THREE.MeshStandardMaterial({color:0xff5a3c,roughness:.35,metalness:.1}));scene.add(ball);
const blob=new THREE.Mesh(new THREE.CircleGeometry(.62,24),new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:.28,depthWrite:false}));blob.rotation.x=-Math.PI/2;scene.add(blob);
const orbMat=new THREE.MeshStandardMaterial({color:0xffd54a,emissive:0xffb300,emissiveIntensity:.8,roughness:.3}),orbGeo=new THREE.SphereGeometry(.26,16,12),orbs=[];
for(let i=0;i<30;i++){const m=new THREE.Mesh(orbGeo,orbMat),r=6+Math.random()*32,a=Math.random()*Math.PI*2;m.userData={px:Math.cos(a)*r,pz:Math.sin(a)*r,ph:Math.random()*Math.PI*2};scene.add(m);orbs.push(m);}
const keys={};addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();});addEventListener('keyup',e=>keys[e.code]=false);
let camYaw=.6,camPitch=.42,camDist=7.5,dragId=null,lastX=0,lastY=0;
canvas.addEventListener('pointerdown',e=>{if(dragId!==null)return;dragId=e.pointerId;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(e.pointerId!==dragId)return;camYaw-=(e.clientX-lastX)*.005;camPitch=Math.min(1.15,Math.max(.12,camPitch+(e.clientY-lastY)*.004));lastX=e.clientX;lastY=e.clientY;});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(e.pointerId===dragId)dragId=null;});
addEventListener('wheel',e=>camDist=Math.min(15,Math.max(4,camDist+e.deltaY*.01)),{passive:true});
const joy=document.getElementById('joy'),knob=document.getElementById('knob'),jumpBtn=document.getElementById('jump'),isTouch=matchMedia('(pointer: coarse)').matches;
let joyVec={x:0,y:0},joyActive=false,joyId=null;
function resetJoy(){joyActive=false;joyId=null;joyVec={x:0,y:0};knob.style.left='50%';knob.style.top='50%';}
if(isTouch){joy.style.display='block';jumpBtn.style.display='flex';document.getElementById('hint').textContent='Joystick — gerak · Drag — kamera';
function moveJoy(e){const r=joy.getBoundingClientRect();let dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2;const l=Math.hypot(dx,dy),max=r.width/2-8;if(l>max){dx*=max/l;dy*=max/l;}joyVec={x:dx/max,y:dy/max};knob.style.left=(50+dx/max*38)+'%';knob.style.top=(50+dy/max*38)+'%';}
joy.addEventListener('pointerdown',e=>{if(joyActive)return;joyActive=true;joyId=e.pointerId;joy.setPointerCapture(e.pointerId);moveJoy(e);});joy.addEventListener('pointermove',e=>{if(joyActive&&e.pointerId===joyId)moveJoy(e);});for(const event of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(event,e=>{if(e.pointerId===joyId)resetJoy();});jumpBtn.addEventListener('pointerdown',()=>{keys.Space=true;setTimeout(()=>keys.Space=false,120);});}
addEventListener('blur',()=>{for(const k in keys)keys[k]=false;dragId=null;resetJoy();});
let audioCtx=null;function pop(){if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='triangle';o.frequency.setValueAtTime(520,audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(980,audioCtx.currentTime+.08);g.gain.setValueAtTime(.18,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.16);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.18);}
const pos=new THREE.Vector3(0,.5+terrainH(0,0),0),vel=new THREE.Vector3();let grounded=true,vy=0,score=0,running=false;const scoreEl=document.getElementById('score');
document.querySelectorAll('#start .btn').forEach(b=>b.addEventListener('click',()=>{try{initGrass(parseInt(b.dataset.n,10));try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){audioCtx=new Audio();audioCtx.resume().catch(console.warn);}}catch(e){console.warn('Audio tidak tersedia',e);}document.getElementById('start').style.display='none';running=true;}catch(err){document.getElementById('error').textContent='Gagal memulai: '+err.message;console.error(err);}}));
const GRAV=22,ACCEL=34,FRICTION=5.5,MAXV=9,JUMPV=8.2,clock=new THREE.Clock();let trailTimer=0,recycleTimer=0;const lastTrail=new THREE.Vector2(1e9,1e9),axis=new THREE.Vector3(),target=new THREE.Vector3();ball.position.copy(pos);camera.position.set(4,5,7);camera.lookAt(pos);
function tick(){requestAnimationFrame(tick);const dt=Math.min(.05,clock.getDelta()),time=clock.elapsedTime;grassUniforms.uTime.value=time;
if(running){let ix=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0),iz=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0);if(isTouch&&joyActive){ix=joyVec.x;iz=-joyVec.y;}const fx=-Math.sin(camYaw),fz=-Math.cos(camYaw);let mx=fx*iz-fz*ix,mz=fz*iz+fx*ix;const ml=Math.hypot(mx,mz);if(ml>.001){mx/=ml;mz/=ml;vel.x+=mx*ACCEL*dt;vel.z+=mz*ACCEL*dt;}let sp=Math.hypot(vel.x,vel.z);if(sp>MAXV){vel.x*=MAXV/sp;vel.z*=MAXV/sp;sp=MAXV;}const damp=Math.exp(-FRICTION*dt);vel.x*=damp;vel.z*=damp;pos.x+=vel.x*dt;pos.z+=vel.z*dt;
const gY=terrainH(pos.x,pos.z);if(grounded&&keys.Space){vy=JUMPV;grounded=false;pop();}if(!grounded){vy-=GRAV*dt;pos.y+=vy*dt;if(pos.y<=gY+.5){pos.y=gY+.5;grounded=true;vy=0;}}else pos.y=gY+.5;
if(sp>.05)ball.rotateOnWorldAxis(axis.set(vel.z,0,-vel.x).normalize(),sp*dt/.5);ball.position.copy(pos);blob.position.set(pos.x,gY+.03,pos.z);const airH=pos.y-(gY+.5);blob.material.opacity=Math.max(.05,.28-airH*.06);blob.scale.setScalar(1+airH*.25);
trailTimer-=dt;if(grounded&&sp>1.2&&trailTimer<=0){const dx=pos.x-lastTrail.x,dz=pos.z-lastTrail.y;if(dx*dx+dz*dz>.25){const tr=grassUniforms.uTrail.value;for(let i=TRAIL_N-1;i>0;i--)tr[i].copy(tr[i-1]);tr[0].set(pos.x,pos.z,1,0);lastTrail.set(pos.x,pos.z);trailTimer=.05;}}for(const t of grassUniforms.uTrail.value)if(t.z>0)t.z*=Math.exp(-dt*.55);
grassUniforms.uBallPos.value.set(pos.x,pos.z);grassUniforms.uBallVel.value.set(vel.x,vel.z);recycleTimer-=dt;if(recycleTimer<=0){recycleGrass(pos.x,pos.z);recycleTimer=.3;}
for(const o of orbs){const oy=terrainH(o.userData.px,o.userData.pz)+.75+Math.sin(time*2+o.userData.ph)*.15;o.position.set(o.userData.px,oy,o.userData.pz);o.rotation.y=time*1.5;const dx=pos.x-o.userData.px,dz=pos.z-o.userData.pz;if(dx*dx+dz*dz<1.2){score++;scoreEl.textContent='orbs: '+score;pop();const r=6+Math.random()*32,a=Math.random()*Math.PI*2;o.userData.px=pos.x+Math.cos(a)*r;o.userData.pz=pos.z+Math.sin(a)*r;}}
if(Math.abs(pos.x-gCX)>6||Math.abs(pos.z-gCZ)>6)updateGroundHeights(Math.round(pos.x/4)*4,Math.round(pos.z/4)*4);
const ch=Math.sin(camPitch)*camDist+.6,cd=Math.cos(camPitch)*camDist;target.set(pos.x+Math.sin(camYaw)*cd,pos.y+ch,pos.z+Math.cos(camYaw)*cd);camera.position.lerp(target,1-Math.exp(-8*dt));camera.lookAt(pos.x,pos.y+.9,pos.z);}
sky.position.copy(camera.position);renderer.render(scene,camera);}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});tick();
