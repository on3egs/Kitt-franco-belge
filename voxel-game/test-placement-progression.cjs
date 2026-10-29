// Régression : les trois chemins de pose partagent compteur et bonus.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright');
const {createGameServer}=require('./server');

(async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'kitt-placement-progress-'));let service,browser;
 try{
  service=await createGameServer({bind:'127.0.0.1',port:0,dataDir});
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1000,height:650}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   localStorage.setItem('kitt.settings.v2',JSON.stringify({quality:'low',volume:0,voice:false,sensitivity:4,halloween:false}));
   localStorage.setItem('kitt.session.v1',JSON.stringify({player:{x:-17.2,y:8,z:21,yaw:Math.PI/2,pitch:-.35},mode:'creative',health:100,hunger:100}));
   localStorage.setItem('kitt.campaign.v1',JSON.stringify({points:0,cores:0,engine:0,races:0,demons:0,storyStage:3,flagTruckStage:3,path:'moutons',missionPlaced:1,unlocks:[]}));
   // Un bloc source dans la zone de copie ; la première pose manuelle sera le second.
   localStorage.setItem('kitt.world.v2',JSON.stringify([['-15,8,21','pierre']]));
  });
  await page.goto(`http://127.0.0.1:${service.port}/block-mode.html`);
  await page.waitForFunction(()=>window.KITTBlock?.inspect().ready);
  await page.click('#resumeBtn');
  await page.waitForFunction(()=>KITTBlock.inspect().captured&&!KITTBlock.inspect().paused);

  // Une pose manuelle valide fait passer le compteur de 1 à 2.
  await page.evaluate(({x,y,z})=>{
   const s=KITTBlock.inspect(),dx=x-s.player.x,dz=z-s.player.z,dy=y-(s.player.y+1.6),yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz)),event=new MouseEvent('mousemove');
   Object.defineProperty(event,'movementX',{value:-Math.atan2(Math.sin(yaw-s.look.yaw),Math.cos(yaw-s.look.yaw))/.0026});
   Object.defineProperty(event,'movementY',{value:-(pitch-s.look.pitch)/.0026});document.dispatchEvent(event);
  },{x:-20.5,y:7.99,z:21.5});
  await page.waitForFunction(()=>KITTBlock.inspect().target!==null);
  await page.evaluate(()=>document.querySelector('#world canvas').dispatchEvent(new PointerEvent('pointerdown',{button:2,pointerType:'mouse',bubbles:true})));
  await page.waitForFunction(()=>KITTBlock.inspect().mission.placed===2);

  // Copier puis coller doit compter les deux blocs présents dans le plan.
  await page.keyboard.press('Tab');
  await page.waitForSelector('#inventoryPanel:not(.hidden)');
  await page.click('#copyPlan');
  await page.click('#pastePlan');
  await page.waitForFunction(()=>KITTBlock.inspect().mission.placed===4);
  assert.equal(await page.evaluate(()=>KITTBlock.inspect().campaign.points),0,'Le bonus ne doit pas arriver avant cinq poses.');

  // Le plan d’abri fait franchir le seuil au cinquième bloc et ne paie qu’une fois.
  await page.click('#buildPlan');
  await page.waitForFunction(()=>KITTBlock.inspect().campaign.points===30&&KITTBlock.inspect().campaign.unlocks.includes('Constructeur FLAG'));
  await page.waitForFunction(()=>KITTBlock.inspect().mission.placed===19);
  const result=await page.evaluate(()=>KITTBlock.inspect());
  assert.equal(result.mission.placed,19,'Le compteur doit inclure 1 pose manuelle, 2 blocs collés et 15 blocs d’abri.');
  assert.equal(result.campaign.missionPlaced,19,'Le compteur sauvegardé doit correspondre au compteur de mission.');
  assert.equal(result.campaign.points,30,'Les cinq premières poses combinées ne versent le bonus qu’une fois.');
  assert.equal(result.campaign.unlocks.filter(item=>item==='Constructeur FLAG').length,1);
  assert.deepEqual(errors,[]);
  console.log('OK progression blocs : pose manuelle + copier/coller + abri, seuil à 5 et bonus unique.');
 }finally{
  if(browser)await browser.close();
  if(service)await service.close();
  fs.rmSync(dataDir,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
