// Optional: install playwright, serve the repo, then node tests/browser-smoke.cjs.
// A test-only hook is injected into the response; it is never shipped in the game.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  for(const mobile of (process.env.RPG_MOBILE_ONLY? [true]:[true,false])){
   const context=await browser.newContext({viewport:{width:960,height:540},hasTouch:mobile,isMobile:mobile});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.route('**/',async route=>{
    const response=await route.fetch();let body=await response.text();
    if(process.env.RPG_FAST_SMOKE==='1')body=body.replace('const GRASS_N=isTouch?9000:28000','const GRASS_N=1500');
    body=body.replace('animate();\naddEventListener','window.qa={CHAR,player,ATTACK,renderer,tryAttack,startGame,pauseGame,world,travelTo,WAYPOINTS,terrainH,COLLIDERS};\nanimate();\naddEventListener');
    await route.fulfill({response,body});
   });
   await page.goto(process.env.RPG_URL||'http://127.0.0.1:8000');
   await page.waitForFunction(()=>window.qa?.CHAR.ready,null,{timeout:60000});
   assert(await page.evaluate(()=>qa.CHAR.weapon.parent===qa.CHAR.bones.HANDR));
   assert.equal(await page.locator('#atkBtn').count(),0);
   if(!mobile)await page.evaluate(()=>HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.reject(Error('Test denial')));
   await page.locator('#startOverlay').click();
   await page.waitForFunction(()=>document.body.classList.contains('playing'));
   await page.waitForFunction(()=>getComputedStyle(document.getElementById('hud')).opacity==='1');
   // Dispatch realistic touch identifiers to verify tap/drag/joystick routing.
   if(mobile){
    const result=await page.evaluate(()=>{
     const canvas=document.querySelector('#app canvas');
     function touch(type,id,x,y){const t=new Touch({identifier:id,target:canvas,clientX:x,clientY:y});canvas.dispatchEvent(new TouchEvent(type,{changedTouches:[t],touches:type==='touchend'?[]:[t],bubbles:true,cancelable:true}));}
     qa.ATTACK.active=false;qa.ATTACK.cooldown=0;
     touch('touchstart',1,750,200);touch('touchmove',1,800,210);touch('touchend',1,800,210);
     const dragAttacked=qa.ATTACK.active;
     touch('touchstart',2,750,200);touch('touchend',2,750,200);const tapAttacked=qa.ATTACK.active;
     touch('touchstart',3,150,350);const stickVisible=getComputedStyle(document.getElementById('stickBase')).display!=='none';
     touch('touchend',3,150,350);const stickHidden=getComputedStyle(document.getElementById('stickBase')).display==='none';
     return {dragAttacked,tapAttacked,stickVisible,stickHidden};
    });
    assert.deepEqual(result,{dragAttacked:false,tapAttacked:true,stickVisible:true,stickHidden:true});
   }
   if(mobile)await page.locator('#settingsBtn').click();else await page.keyboard.press('KeyO');
   await page.waitForFunction(()=>!document.getElementById('settingsPanel').classList.contains('hidden'));
   assert.equal(await page.evaluate(()=>document.body.classList.contains('playing')),false);
   await page.locator('#sensitivityInput').fill('1.4');await page.locator('#sensitivityInput').dispatchEvent('input');
   assert.equal(await page.locator('#sensitivityValue').textContent(),'1.4×');
   await page.locator('#shadowsInput').uncheck();
   assert.equal(await page.evaluate(()=>qa.renderer.shadowMap.enabled),false);
   if(process.env.RPG_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.RPG_SCREENSHOT_DIR}/settings-${mobile}.png`});
   await page.locator('#settingsPanel [data-close-panel]').first().click();
   await page.waitForFunction(()=>document.body.classList.contains('playing'));
   if(mobile)await page.locator('#mapBtn').click();else await page.keyboard.press('KeyM');
   await page.waitForFunction(()=>!document.getElementById('mapPanel').classList.contains('hidden'));
   assert.equal(await page.locator('[data-waypoint]').count(),7);
   await page.locator('[data-waypoint="frost"]').click();
   if(process.env.RPG_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.RPG_SCREENSHOT_DIR}/atlas-${mobile}.png`});
   await page.locator('#travelBtn').click();
   await page.waitForFunction(()=>Math.abs(qa.player.pos.x)>5000&&qa.world.stats.pending===0,null,{timeout:60000});
   const streamed=await page.evaluate(()=>({loaded:qa.world.stats.loaded,max:qa.world.stats.max,disposed:qa.world.stats.disposed,ground:qa.terrainH(qa.player.pos.x,qa.player.pos.z),near:qa.world.chunks.has(qa.world.center),localColliders:qa.COLLIDERS.every(c=>Math.hypot(c.x-qa.player.pos.x,c.z-qa.player.pos.z)<1800)}));
   assert(streamed.loaded<=streamed.max);assert(streamed.disposed>0);assert(streamed.ground>0);assert(streamed.near);assert(streamed.localColliders);
   assert.equal(await page.locator('#regionLabel').textContent(),'Frostspire Reach');
   await page.waitForFunction(()=>document.body.classList.contains('playing'));
   await page.waitForFunction(()=>getComputedStyle(document.getElementById('hud')).opacity==='1');
   if(process.env.RPG_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.RPG_SCREENSHOT_DIR}/hud-${mobile}.png`});
   assert.deepEqual(errors,[]);console.log(`PASS ${mobile?'mobile':'desktop'}: load, held weapon, HUD, input, map, settings, resume, no JS/shader errors`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
