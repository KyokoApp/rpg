import {WAYPOINTS,terrainColor,roadX,roadZ} from './world-data.mjs';
export const DEFAULT_SETTINGS={sensitivity:1,cameraDistance:5,quality:'balanced',shadows:true,sound:true};
export function readSettings(storage){
  try{
    const s=JSON.parse(storage.getItem('orb-hunt.settings')||'{}');
    return {sensitivity:Number.isFinite(s.sensitivity)?Math.max(.4,Math.min(2,s.sensitivity)):1,
      cameraDistance:Number.isFinite(s.cameraDistance)?Math.max(3,Math.min(8,s.cameraDistance)):5,
      quality:['low','balanced','high'].includes(s.quality)?s.quality:'balanced',
      shadows:typeof s.shadows==='boolean'?s.shadows:true,sound:typeof s.sound==='boolean'?s.sound:true};
  }catch{return {...DEFAULT_SETTINGS};}
}
export function initHUD({terrainH,waterY,worldSize,settings,onSettings,onPause,onResume,onTravel,getState}){
  const $=id=>document.getElementById(id);
  let activePanel=null,lastFocus=null,lastDraw=0;
  let selected=null;
  const terrain=document.createElement('canvas');terrain.width=terrain.height=384;
  const localTerrain=document.createElement('canvas');localTerrain.width=localTerrain.height=256;
  let localCenter=null;
  function makeMap(canvas,cx,cz,span){
    const ctx=canvas.getContext('2d'),n=canvas.width,pixels=ctx.createImageData(n,n);
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){
      const wx=cx+(x/(n-1)-.5)*span,wz=cz+(z/(n-1)-.5)*span,h=terrainH(wx,wz);
      const slope=terrainH(wx+5,wz)-h;
      const base=h<waterY+.15?[83,139,151]:terrainColor(wx,wz).map(v=>v*220+30);
      const shade=Math.max(-30,Math.min(24,slope*7+h*.04)),i=(z*n+x)*4;
      for(let c=0;c<3;c++)pixels.data[i+c]=base[c]+shade;pixels.data[i+3]=255;
    }
    ctx.putImageData(pixels,0,0);
    // Draw the exact same analytic road network as the world, not decorative paths.
    const px=x=>(x-cx)/span*n+n/2,pz=z=>(z-cz)/span*n+n/2;
    for(let lane=-4;lane<=4;lane++)for(const vertical of [true,false]){
      ctx.beginPath();const start=(vertical?cz:cx)-span/2;
      for(let i=0;i<=160;i++){const along=start+i*span/160;const x=vertical?roadX(along,lane):along,z=vertical?along:roadZ(along,lane);if(i===0)ctx.moveTo(px(x),pz(z));else ctx.lineTo(px(x),pz(z));}
      ctx.strokeStyle=lane%2===0?'#e4d6a5':'#b9b795';ctx.lineWidth=Math.max(span>1000?1:2,(lane%2===0?16:8)/span*n);ctx.stroke();
    }
  }
  makeMap(terrain,0,0,worldSize);
  const list=$('waypointList');
  function select(id){
    selected=WAYPOINTS.find(w=>w.id===id);if(!selected)return;
    const s=getState(),km=Math.hypot(s.x-selected.x,s.z-selected.z)/1000;
    $('destinationInfo').textContent=selected.subtitle+' · '+km.toFixed(1)+' km dari posisi kamu';
    $('travelBtn').disabled=false;$('travelBtn').textContent='Fast travel — '+selected.name.split(' ')[0];
    list.querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b.dataset.waypoint===id);b.setAttribute('aria-pressed',String(b.dataset.waypoint===id));});draw(true);
  }
  for(const waypoint of WAYPOINTS){const button=document.createElement('button');button.className='waypoint-button';button.dataset.waypoint=waypoint.id;button.textContent=waypoint.name;button.setAttribute('aria-pressed','false');button.onclick=()=>select(waypoint.id);list.appendChild(button);}
  $('travelBtn').onclick=()=>{if(selected&&onTravel?.(selected.id)){localCenter=null;close();draw(true);}};
  $('worldMap').addEventListener('click',e=>{
    const rect=$('worldMap').getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width,pz=(e.clientY-rect.top)/rect.height;
    const hit=WAYPOINTS.find(w=>Math.hypot((w.x/worldSize+.5-px)*rect.width,(w.z/worldSize+.5-pz)*rect.height)<22);
    if(hit)select(hit.id);
  });
  function open(id){
    if(activePanel)return;
    lastFocus=document.activeElement;onPause();activePanel=$(id);activePanel.classList.remove('hidden');
    activePanel.querySelector('button').focus();draw(true);
  }
  function close(){
    if(!activePanel)return;
    activePanel.classList.add('hidden');activePanel=null;lastFocus?.focus();onResume();
  }
  $('settingsBtn').onclick=()=>open('settingsPanel');$('mapBtn').onclick=()=>open('mapPanel');
  document.querySelectorAll('[data-close-panel]').forEach(b=>b.onclick=close);
  document.querySelectorAll('.panel-backdrop').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)close();}));
  document.addEventListener('keydown',e=>{
    if(!activePanel){
      if(getState().state==='playing' && !e.repeat && ['KeyM','KeyO'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();open(e.code==='KeyM'?'mapPanel':'settingsPanel');}
      return;
    }
    if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}
    if(e.code==='Tab'){
      const list=[...activePanel.querySelectorAll('button:not(:disabled),input,select')];const first=list[0],last=list.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  },true);
  const controls={sensitivity:'sensitivityInput',cameraDistance:'distanceInput',quality:'qualityInput',shadows:'shadowsInput',sound:'soundInput'};
  for(const [key,id] of Object.entries(controls)){
    const input=$(id);if(input.type==='checkbox')input.checked=settings[key];else input.value=settings[key];
    input.addEventListener('input',()=>{
      settings[key]=input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value;
      try{localStorage.setItem('orb-hunt.settings',JSON.stringify(settings));}catch{}
      labels();onSettings(settings,key);
    });
  }
  function labels(){ $('sensitivityValue').textContent=settings.sensitivity.toFixed(1)+'×';$('distanceValue').textContent=settings.cameraDistance.toFixed(1)+' m'; }
  labels();
  function paint(canvas,full,s){
    const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    c.clearRect(0,0,w,h);c.fillStyle='#7b9161';c.fillRect(0,0,w,h);
    const span=full?worldSize:280,scale=w/span;
    const centerX=full?0:s.x,centerZ=full?0:s.z;
    if(full)c.drawImage(terrain,0,0,w,h);
    else{
      const keyX=Math.floor(s.x/64)*64,keyZ=Math.floor(s.z/64)*64;
      if(!localCenter||localCenter.x!==keyX||localCenter.z!==keyZ){localCenter={x:keyX,z:keyZ};makeMap(localTerrain,keyX,keyZ,768);}
      c.drawImage(localTerrain,0,0,256,256,w/2+(localCenter.x-384-s.x)*scale,h/2+(localCenter.z-384-s.z)*scale,768*scale,768*scale);
    }
    const point=(x,z)=>[w/2+(x-centerX)*scale,h/2+(z-centerZ)*scale];
    c.strokeStyle='#ffffff18';c.lineWidth=1;
    for(let i=1;i<8;i++){c.beginPath();c.moveTo(i*w/8,0);c.lineTo(i*w/8,h);c.stroke();c.beginPath();c.moveTo(0,i*h/8);c.lineTo(w,i*h/8);c.stroke();}
    if(!full)for(const o of s.orbs){if(!o.visible)continue;const [x,z]=point(o.position.x,o.position.z);c.save();c.translate(x,z);c.rotate(Math.PI/4);c.fillStyle='#f9efc3';c.strokeStyle='#6a6c45';c.lineWidth=2;c.fillRect(-3,-3,6,6);c.strokeRect(-3,-3,6,6);c.restore();}
    for(const waypoint of WAYPOINTS){
      const [x,z]=point(waypoint.x,waypoint.z);c.save();c.translate(x,z);
      if(full&&selected?.id===waypoint.id){c.strokeStyle='#fff5c9';c.lineWidth=1.5;c.beginPath();c.arc(0,0,14,0,Math.PI*2);c.stroke();}
      c.fillStyle='#c5fcf2';c.strokeStyle='#306b72';c.lineWidth=2;c.beginPath();c.moveTo(0,-7);c.lineTo(5,0);c.lineTo(0,7);c.lineTo(-5,0);c.closePath();c.fill();c.stroke();
      if(full){c.font='12px Georgia';c.textAlign='center';c.fillStyle='#fff7dc';c.shadowColor='#182f31';c.shadowBlur=4;c.fillText(waypoint.name,0,23);}
      c.restore();
    }
    const [x,z]=point(s.x,s.z);c.save();c.translate(x,z);c.rotate(-s.yaw);
    c.fillStyle='#fff7d120';c.beginPath();c.moveTo(0,0);c.arc(0,0,full?25:37,-Math.PI*.72,-Math.PI*.28);c.closePath();c.fill();c.restore();
    c.save();c.translate(x,z);c.rotate(-s.facing+Math.PI);c.fillStyle='#b1f0e9';c.strokeStyle='#3b7476';c.lineWidth=1.5;c.beginPath();c.moveTo(0,-10);c.lineTo(7,8);c.lineTo(0,4);c.lineTo(-7,8);c.closePath();c.fill();c.stroke();c.restore();
  }
  function draw(force=false){const now=performance.now();if(!force&&now-lastDraw<140)return;lastDraw=now;const s=getState();paint($('minimap'),false,s);if(activePanel?.id==='mapPanel')paint($('worldMap'),true,s);$('hpValue').textContent=`${s.hp} / ${s.maxHP}`;$('hpFill').style.width=(s.hp/s.maxHP*100)+'%';if(s.region)$('regionLabel').textContent=s.region.name;if(s.stream)$('streamStatus').textContent=s.stream.pending?'Memuat cakrawala…':'Open world · '+s.stream.loaded+' chunks';}
  return {update:draw,isOpen:()=>!!activePanel};
}
