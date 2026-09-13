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
export function initHUD({terrainH,waterY,worldSize,settings,onSettings,onPause,onResume,getState}){
  const $=id=>document.getElementById(id);
  let activePanel=null,lastFocus=null,lastDraw=0;
  const terrain=document.createElement('canvas'); terrain.width=terrain.height=384;
  const ctx=terrain.getContext('2d'),pixels=ctx.createImageData(384,384);
  for(let z=0;z<384;z++)for(let x=0;x<384;x++){
    const wx=(x/383-.5)*worldSize,wz=(z/383-.5)*worldSize,h=terrainH(wx,wz);
    const slope=terrainH(wx+1,wz)-h;
    const base=h<waterY+.15?[95,145,145]:h<waterY+.65?[184,177,131]:[123,145,97];
    const shade=Math.max(-24,Math.min(24,slope*28+h*2));const i=(z*384+x)*4;
    for(let c=0;c<3;c++)pixels.data[i+c]=base[c]+shade;
    pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
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
      const list=[...activePanel.querySelectorAll('button,input,select')];const first=list[0],last=list.at(-1);
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
    const span=full?worldSize:105,scale=w/span;
    const centerX=full?0:s.x,centerZ=full?0:s.z;
    c.drawImage(terrain,0,0,384,384,w/2+(-worldSize/2-centerX)*scale,h/2+(-worldSize/2-centerZ)*scale,worldSize*scale,worldSize*scale);
    const point=(x,z)=>[w/2+(x-centerX)*scale,h/2+(z-centerZ)*scale];
    c.strokeStyle='#ffffff18';c.lineWidth=1;
    for(let i=1;i<8;i++){c.beginPath();c.moveTo(i*w/8,0);c.lineTo(i*w/8,h);c.stroke();c.beginPath();c.moveTo(0,i*h/8);c.lineTo(w,i*h/8);c.stroke();}
    for(const o of s.orbs){if(!o.visible)continue;const [x,z]=point(o.position.x,o.position.z);c.save();c.translate(x,z);c.rotate(Math.PI/4);c.fillStyle='#f9efc3';c.strokeStyle='#6a6c45';c.lineWidth=2;c.fillRect(-3,-3,6,6);c.strokeRect(-3,-3,6,6);c.restore();}
    const [x,z]=point(s.x,s.z);c.save();c.translate(x,z);c.rotate(-s.yaw);
    c.fillStyle='#fff7d120';c.beginPath();c.moveTo(0,0);c.arc(0,0,full?25:37,-Math.PI*.72,-Math.PI*.28);c.closePath();c.fill();c.restore();
    c.save();c.translate(x,z);c.rotate(-s.facing+Math.PI);c.fillStyle='#b1f0e9';c.strokeStyle='#3b7476';c.lineWidth=1.5;c.beginPath();c.moveTo(0,-10);c.lineTo(7,8);c.lineTo(0,4);c.lineTo(-7,8);c.closePath();c.fill();c.stroke();c.restore();
  }
  function draw(force=false){const now=performance.now();if(!force&&now-lastDraw<140)return;lastDraw=now;const s=getState();paint($('minimap'),false,s);if(activePanel?.id==='mapPanel')paint($('worldMap'),true,s);$('hpValue').textContent=`${s.hp} / ${s.maxHP}`;$('hpFill').style.width=(s.hp/s.maxHP*100)+'%';}
  return {update:draw,isOpen:()=>!!activePanel};
}
