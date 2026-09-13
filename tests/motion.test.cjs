const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const motion=import(pathToFileURL(path.join(__dirname,'../game/locomotion.mjs')));
const ui=import(pathToFileURL(path.join(__dirname,'../game/hud.mjs')));
const base={phase:1,time:2,move:0,run:0,dash:0,airborne:false,falling:false,attack:null};
test('all poses drive the same complete set of joints',async()=>{
 const {samplePose}=await motion;
 const idle=samplePose(base), keys=Object.keys(idle).sort();assert(keys.length>=24);
 for(const state of [{move:1},{move:1,run:1},{move:1,dash:1},{airborne:true},{airborne:true,falling:true},...[0,1,2,3].map(combo=>({attack:.4,combo}))]){
  const p=samplePose({...base,...state});assert.deepEqual(Object.keys(p).sort(),keys);
  for(const angles of Object.values(p))for(const angle of angles)assert(Number.isFinite(angle));
 }
});
test('knees and feet are continuous across the gait cycle',async()=>{
 const {samplePose}=await motion;
 for(let phase=0;phase<Math.PI*2;phase+=.01){
  const a=samplePose({...base,move:1,run:1,phase}),b=samplePose({...base,move:1,run:1,phase:phase+.001});
  for(const key of Object.keys(a))for(let i=0;i<3;i++)assert(Math.abs(a[key][i]-b[key][i])<.005,`${key} jumps`);
 }
});
test('idle resets gait and attack joints rather than preserving old pose',async()=>{
 const {samplePose}=await motion;const p=samplePose({...base,phase:10});
 for(const key of ['THIGHR','KNEER','FOOTR','THIGHL','KNEEL','FOOTL'])assert(p[key].every(v=>Math.abs(v)===0));
 assert.equal(Math.abs(p.PELVIS[1]),0);
});
test('combo directions and overhead pose differ',async()=>{
 const {samplePose}=await motion;const poses=[0,1,2,3].map(combo=>samplePose({...base,attack:.35,combo}));
 assert.notDeepEqual(poses[0].ARMR,poses[1].ARMR);assert.notDeepEqual(poses[0].ARMR,poses[2].ARMR);
});
test('damping is frame-rate independent',async()=>{
 const {damp}=await motion;const simulate=fps=>{let n=0;for(let i=0;i<fps;i++)n=damp(n,1,9,1/fps);return n;};
 assert(Math.abs(simulate(30)-simulate(120))<1e-12);
});
test('joystick has a deadzone and clamps diagonal input',async()=>{
 const {joystickAxis}=await motion;
 assert.deepEqual(joystickAxis(3,3),{x:0,y:0});
 const p=joystickAxis(100,100);assert(Math.abs(Math.hypot(p.x,p.y)-1)<1e-12);
 assert(joystickAxis(0,-30).y<0);
});
test('settings handle blocked storage, malformed data, and clamp ranges',async()=>{
 const {readSettings,DEFAULT_SETTINGS}=await ui;
 assert.deepEqual(readSettings(null),DEFAULT_SETTINGS);
 assert.deepEqual(readSettings({getItem:()=>'{broken'}),DEFAULT_SETTINGS);
 const s=readSettings({getItem:()=>JSON.stringify({sensitivity:500,cameraDistance:-3,quality:'invalid',shadows:'false',sound:false})});
 assert.equal(s.sensitivity,2);assert.equal(s.cameraDistance,3);assert.equal(s.quality,'balanced');assert.equal(s.shadows,true);assert.equal(s.sound,false);
});
