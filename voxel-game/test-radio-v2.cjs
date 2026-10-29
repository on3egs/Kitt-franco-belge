// Tests de la radio sans dépendre du réseau des diffuseurs ou de musique protégée.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright'),{createGameServer}=require('./server');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kitt-radio-v2-')),service=await createGameServer({port:0,dataDir:temp,pins:{}});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const markup=fs.readFileSync(path.join(__dirname,'block-mode.html'),'utf8').match(/<section id="radioPanel"[\s\S]*?<\/section>/)[0].replace('radio-panel hidden','radio-panel');
 const harness='<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/game/style.css"><link rel="stylesheet" href="/game/season.css"><link rel="stylesheet" href="/game/radio.css"><title>Radio KITT</title><body style="background:radial-gradient(ellipse at 50% 70%,#2d3e4c,#07111c);min-height:100vh">'+markup+'<script type="module">import {KittRadio} from "/game/radio.js";window.radioProbe=new KittRadio(document.querySelector("#radioPanel"));document.querySelector("#radioClose").onclick=()=>document.querySelector("#radioPanel").classList.add("hidden");</script></body></html>';
 const errors=[];fs.mkdirSync('test-results',{recursive:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(()=>{
   window.audioRecords=[];
   window.Audio=class extends EventTarget{constructor(){super();this.src='';this.volume=1;this.muted=false;window.audioRecords.push(this)}load(){}pause(){this.paused=true}removeAttribute(name){if(name==='src')this.src=''}play(){this.paused=false;if(window.radioReject)return Promise.reject(new DOMException('Gesture required','NotAllowedError'));if(window.radioDelay)return new Promise(resolve=>{this.resolvePlay=resolve});setTimeout(()=>this.dispatchEvent(new Event('playing')),20);return Promise.resolve()}};
  });
  await context.route('**/radio-harness.html',route=>route.fulfill({contentType:'text/html',body:harness}));
  await context.route('https://**',route=>route.fulfill({contentType:'text/html',body:'<button>▶ Lecteur officiel de test</button>'}));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.port}/radio-harness.html`);await page.waitForFunction(()=>window.radioProbe);
  assert.equal(await page.locator('#radioStation option').count(),7);
  assert.equal(await page.evaluate(()=>radioProbe.inspect().state),'off');
  await page.click('#radioPower');assert.equal(await page.evaluate(()=>radioProbe.inspect().state),'embed');assert.equal(await page.locator('#radioPlayerMount iframe').count(),1);assert.equal(await page.evaluate(()=>radioProbe.inspect().audible),false);assert.equal(await page.locator('#radioVolume').isDisabled(),true);
  await page.click('[data-station="contact"]');await page.waitForFunction(()=>radioProbe.inspect().state==='playing');assert.equal(await page.evaluate(()=>radioProbe.inspect().audible),true);assert.equal(await page.locator('#radioPlayerMount iframe').count(),0);
  await page.locator('#radioVolume').fill('32');await page.locator('#radioVolume').dispatchEvent('input');assert.equal(await page.evaluate(()=>radioProbe.inspect().volume),.32);
  await page.click('#radioMute');assert.equal(await page.evaluate(()=>radioProbe.audio.muted),true);assert.equal(await page.evaluate(()=>radioProbe.inspect().audible),false);await page.click('#radioMute');
  await page.click('[data-station="nostalgie-80"]');await page.waitForFunction(()=>radioProbe.state==='playing');const wasFavorite=await page.evaluate(()=>radioProbe.inspect().favorites.includes('nostalgie-80'));await page.click('#radioFavorite');assert.equal(await page.evaluate(()=>radioProbe.inspect().favorites.includes('nostalgie-80')),!wasFavorite);
  await page.screenshot({path:'test-results/radio-v2-desktop.png'});
  await page.reload();await page.waitForFunction(()=>window.radioProbe);assert.equal(await page.evaluate(()=>radioProbe.station.id),'nostalgie-80');assert.equal(await page.evaluate(()=>radioProbe.volume),.32);assert.equal(await page.evaluate(()=>radioProbe.on),false);assert.equal(await page.evaluate(()=>radioProbe.inspect().favorites.includes('nostalgie-80')),!wasFavorite);
  await page.evaluate(()=>window.radioReject=true);await page.click('#radioPower');await page.waitForFunction(()=>radioProbe.state==='blocked');assert.equal(await page.locator('#radioRetry').isVisible(),true);await page.evaluate(()=>window.radioReject=false);await page.click('#radioRetry');await page.waitForFunction(()=>radioProbe.state==='playing');
  await page.evaluate(()=>radioProbe.audio.dispatchEvent(new Event('error')));assert.equal(await page.evaluate(()=>radioProbe.state),'error');await page.click('#radioRetry');await page.waitForFunction(()=>radioProbe.state==='playing');
  await page.evaluate(()=>window.radioDelay=true);await page.click('#radioNext');await page.click('#radioPower');await page.evaluate(()=>{const old=audioRecords.findLast(a=>a.resolvePlay);old.resolvePlay();old.dispatchEvent(new Event('playing'))});assert.equal(await page.evaluate(()=>radioProbe.on),false);assert.equal(await page.evaluate(()=>radioProbe.state),'off');assert.equal(await page.evaluate(()=>audioRecords.every(a=>!a.src||a.paused)),true);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/radio-v2-mobile.png'});const panel=await page.locator('#radioPanel').boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=390);assert.equal(await page.evaluate(()=>document.querySelector('#radioPanel').scrollWidth<=document.querySelector('#radioPanel').clientWidth),true);
  await page.locator('#radioPrevious').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('#radioPanel').isVisible(),false);
  assert.deepEqual(errors,[]);console.log('OK radio : 7 stations, embeds honnêtes, lecture, volume/sourdine, favoris persistés, refus autoplay/réessai, erreur réseau, arrêt sans course asynchrone et mobile.');
 }finally{await browser.close();await service.close();if(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
