const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=html.split('<script type="module">')[1].split('</script>')[0];
function fn(name){
  const start=script.indexOf(`function ${name}(`);
  assert(start>=0, `Missing function ${name}`);
  let depth=0, end=script.indexOf('{',start);
  for(;end<script.length;end++){
    if(script[end]==='{') depth++;
    if(script[end]==='}' && --depth===0) break;
  }
  return script.slice(start,end+1);
}
function run(name,context,args=''){vm.runInNewContext(`${fn(name)};${name}(${args})`,context);}
test('main script parses',()=>{
  const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:script,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
test('all transitive local imports exist',()=>{
  const visited=new Set();
  function walk(source,dir){
    for(const [,specifier] of source.matchAll(/^import\s+[\s\S]*?from\s+['"]([^'"]+)['"]/gm)){
      const file=specifier==='three'?path.join(root,'three.module.js'):specifier.startsWith('three/addons/')?path.join(root,'jsm',specifier.slice(13)):path.resolve(dir,specifier);
      assert(fs.existsSync(file),`Missing ${file}`);
      if(!visited.has(file)){visited.add(file);walk(fs.readFileSync(file,'utf8'),path.dirname(file));}
    }
  }
  walk(script,root);
});
for(const state of ['ready','paused','won']){
  test(`actions do nothing when ${state}`,()=>{
    for(const name of ['tryDash','tryJump','tryAttack']) run(name,{state});
  });
}
test('touch only attacks for a short stationary right-side tap',()=>{
  for(const [type,duration,moved,endX,expected] of [
    ['touchend',100,false,900,1],['touchend',300,false,900,0],
    ['touchend',100,true,900,0],['touchcancel',100,false,900,0],
    ['touchend',100,false,950,0],['touchend',100,false,400,0]
  ]){
    let attacks=0;
    const c={stick:{id:null},lookId:2,lookGesture:{x:900,y:200,started:0,moved},performance:{now:()=>duration},innerWidth:1000,Math,tryAttack:()=>attacks++,e:{type,changedTouches:[{identifier:2,clientX:endX,clientY:200}]}};
    run('onTE',c,'e');assert.equal(attacks,expected);assert.equal(c.lookId,null);assert.equal(c.lookGesture,null);
  }
});
test('camera drag remains marked even when finger returns to starting point',()=>{
  const c={state:'playing',stick:{id:null},lookId:2,lookGesture:{x:900,y:200,moved:false},lastLX:900,lastLY:200,player:{yaw:0,pitch:0},cam3:{minPitch:-.55,maxPitch:1.05},Math,e:{preventDefault(){},changedTouches:[{identifier:2,clientX:930,clientY:200}]}};
  run('onTM',c,'e');assert.equal(c.lookGesture.moved,true);
});
test('stationary attack retains facing direction',()=>{
  const body=script.match(/if\(state === 'playing' && player.vel.lengthSq\(\)>1\)\{([\s\S]*?)\n    \}/)[0];
  const c={state:'playing',player:{vel:{x:0,z:0,lengthSq:()=>0}},CHAR:{turnSmooth:Math.PI},ATTACK:{active:true},Math};
  vm.runInNewContext(body,c);assert.equal(c.CHAR.turnSmooth,Math.PI);
});
test('pointer lock synchronous failure starts fallback without timers',()=>{
  const elements={};let starts=0;
  const c={lockPending:false,locked:false,mouseLookFallback:false,state:'ready',renderer:{domElement:{requestPointerLock(){throw Error('Denied');}}},document:{getElementById:id=>elements[id]??={style:{}}},startGame:()=>starts++};
  vm.runInNewContext(fn('pointerLockFailed')+fn('requestLock')+'requestLock()',c);
  assert.equal(starts,1);assert.equal(c.lockPending,false);assert.equal(c.mouseLookFallback,true);
});
test('pointer lock rejected promise starts fallback',async()=>{
  let starts=0;
  const c={lockPending:false,locked:false,state:'paused',renderer:{domElement:{requestPointerLock:()=>Promise.reject(Error('Denied'))}},document:{getElementById:()=>({style:{}})},startGame:()=>starts++};
  vm.runInNewContext(fn('pointerLockFailed')+fn('requestLock')+'requestLock()',c);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(starts,1);assert.equal(c.lockPending,false);
});
test('effects dispose owned resources, not shared geometry or textures',()=>{
  let materials=0,skeletons=0,removed=0;
  const material={dispose:()=>materials++},skeleton={dispose:()=>skeletons++};
  const mesh={isMesh:true,material:[material,material],skeleton,geometry:{dispose(){throw Error('Shared geometry disposed');}}};
  run('disposeGhost',{scene:{remove:()=>removed++},group:{traverse:cb=>{cb(mesh);cb(mesh);}}},'group');
  assert.deepEqual([materials,skeletons,removed],[1,1,1]);
  let geometries=0;
  run('disposeSlash',{scene:{remove(){}},mesh:{geometry:{dispose:()=>geometries++},material}},'mesh');
  assert.equal(geometries,1);assert.equal(materials,2);
});
test('new attack resets combo duration and index',()=>{
  const c={state:'playing',DASH:{timer:0},ATTACK:{active:false,cooldown:0,combo:3,duration:.82},COMBO_DURATIONS:[.52,.58,.68,.82]};
  run('tryAttack',c);assert.equal(c.ATTACK.combo,0);assert.equal(c.ATTACK.duration,.52);assert.equal(c.ATTACK.active,true);
});
test('toon ramp uses nearest-filtered CanvasTexture',()=>{
  class CanvasTexture{constructor(canvas){this.image=canvas;}}
  const c={document:{createElement:()=>({getContext:()=>({fillRect(){}})})},THREE:{CanvasTexture,NearestFilter:1003},Math};
  vm.runInNewContext(fn('toonRamp')+';result=toonRamp(4)',c);
  assert(c.result instanceof CanvasTexture);assert.equal(c.result.image.width,4);assert.equal(c.result.generateMipmaps,false);
});
