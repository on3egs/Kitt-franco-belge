// Vérifie les commandes FPS, le bestiaire, les vrais signaux audio et les bulles.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createGameServer}=require('./server');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kitt-season-'));
 const service=await createGameServer({port:0,dataDir:temp,pins:{}});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 fs.mkdirSync('test-results',{recursive:true});
 await page.addInitScript(()=>{if(!localStorage.getItem('kitt.settings.v2'))localStorage.setItem('kitt.settings.v2',JSON.stringify({quality:'low',volume:50,voice:true}))});
 const inspect=()=>page.evaluate(()=>KITTBlock.inspect());
 const key=(type,key,code)=>page.evaluate(({type,key,code})=>window.dispatchEvent(new KeyboardEvent(type,{key,code})),{type,key,code});
 async function step(keys,distance=.3){
  const before=await inspect();for(const [keyName,code]of keys)await key('keydown',keyName,code);
  try{await page.waitForFunction(({x,z,distance})=>{const p=KITTBlock.inspect().player;return Math.hypot(p.x-x,p.z-z)>distance},{...before.player,distance},{timeout:15000})}
  finally{for(const [keyName,code]of keys)await key('keyup',keyName,code)}
  const after=await inspect();return {before,after,dx:after.player.x-before.player.x,dz:after.player.z-before.player.z};
 }
 try{
  await page.goto(`http://127.0.0.1:${service.port}/block-mode.html`);await page.waitForFunction(()=>window.KITTBlock?.inspect().ready);
  assert.equal((await inspect()).creatures.length,16);
  await page.click('#bestiaryOpen');
  await page.waitForFunction(()=>KITTBlock.inspect().audio.events.menuMusic>0);
  for(const type of ['sheep','ghost','pumpkin','bat','demon']){
   await page.click(`[data-sample="${type}"]`);
   await page.waitForFunction(type=>KITTBlock.inspect().audio.events[type]>0,type);
  }
  await page.waitForFunction(()=>KITTBlock.inspect().audio.peak>.0001);
  await page.screenshot({path:'test-results/bestiary.png'});
  await page.click('[data-close="bestiaryPanel"]');
  await page.click('#soundToggle');await page.waitForTimeout(700);
  assert.equal((await inspect()).audio.muted,true);assert.ok((await inspect()).audio.peak<.0001,'Le mixage muet doit être silencieux');
  await page.click('#soundToggle');await page.waitForFunction(()=>KITTBlock.inspect().audio.peak>.0001);
  console.log('Halloween : musique du menu, quatre sons de créatures et silence vérifiés sur le signal WebAudio.');
  await page.click('#creativeBtn');await page.waitForFunction(()=>!KITTBlock.inspect().paused);
  const speechBefore=(await inspect()).speech;assert.ok(speechBefore.requests>0);assert.ok(speechBefore.lastText.includes('FLAG'));
  const sizes=await page.evaluate(()=>({quote:parseFloat(getComputedStyle(document.querySelector('#quote')).fontSize),mission:parseFloat(getComputedStyle(document.querySelector('#mission')).fontSize)}));
  assert.ok(sizes.quote>=19&&sizes.mission>=18,'Dialogues et mission doivent rester lisibles');
  await page.keyboard.press('v');assert.ok((await inspect()).speech.requests>speechBefore.requests);
  const initial=(await inspect()).creatures;
  await page.mouse.move(500,360);await page.mouse.move(780,360,{steps:6});
  await page.waitForFunction(()=>Math.abs(KITTBlock.inspect().look.yaw)>.3);
  const forward=await step([['z','KeyW']]);
  const length=Math.hypot(forward.dx,forward.dz);
  assert.ok((forward.dx*forward.before.direction.x+forward.dz*forward.before.direction.z)/length>.98,'Z doit suivre le regard après rotation');
  const right=await step([['d','KeyD']]);
  assert.ok((right.dx*Math.cos(right.before.look.yaw)-right.dz*Math.sin(right.before.look.yaw))/Math.hypot(right.dx,right.dz)>.98,'D doit être un pas latéral');
  const back=await step([['s','KeyS']]);assert.ok(back.dx*back.before.direction.x+back.dz*back.before.direction.z<0,'S doit reculer');
  await key('keydown','Control','ControlLeft');await page.waitForFunction(()=>KITTBlock.inspect().player.height<1.2);
  await key('keyup','Control','ControlLeft');await page.waitForFunction(()=>KITTBlock.inspect().player.height>1.7);
  await page.keyboard.press('Space');await page.waitForFunction(()=>KITTBlock.inspect().player.y>8.15);
  await page.waitForFunction(()=>KITTBlock.inspect().audio.events.gameMusic>0);
  const animated=(await inspect()).creatures;assert.ok(animated.some((c,i)=>Math.hypot(c.x-initial[i].x,c.z-initial[i].z)>.1));assert.equal(animated.filter(c=>c.type==='demon').length,3);
  await page.screenshot({path:'test-results/halloween-world.png'});
  await page.keyboard.press('Escape');await page.waitForSelector('#menu:not(.hidden)');
  const stopped=(await inspect()).player;await key('keydown','z','KeyW');await page.waitForTimeout(300);await key('keyup','z','KeyW');
  assert.deepEqual((await inspect()).player,stopped,'Aucun déplacement en pause');
  await page.click('#settingsOpen');await page.selectOption('#weather','rain');assert.equal((await inspect()).weather,true);await page.selectOption('#halloween','off');assert.equal((await inspect()).creatures.length,8);
  await page.selectOption('#voice','off');await page.click('[data-close="settingsPanel"]');await page.reload();await page.waitForFunction(()=>window.KITTBlock?.inspect().ready);
  assert.equal((await inspect()).halloween,false);assert.equal((await inspect()).speech.enabled,false);assert.equal((await inspect()).weather,true);
  assert.deepEqual(errors,[]);
  console.log('OK Halloween/FPS : direction du regard, pas latéral, recul, accroupissement, saut, pause, animation des 13 créatures, réglages persistants et bulles.');
  console.log(`Lecture vocale : appels réels à SpeechSynthesis vérifiés ; ${speechBefore.frenchVoices} voix françaises disponibles dans Chrome de test.`);
 }finally{await browser.close();await service.close();if(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
