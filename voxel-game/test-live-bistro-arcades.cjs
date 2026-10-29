const assert=require('node:assert/strict');
const {chromium}=require('playwright'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 try{
  fs.mkdirSync('test-results',{recursive:true});
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')console.error('Console : '+m.text())});
  await page.addInitScript(()=>localStorage.setItem('kitt.settings.v2',JSON.stringify({quality:'low',volume:0,voice:false,sensitivity:4})));
  await page.goto('https://kitt.kitt-franco-belge.be/static/games/kitt-blocks/');
  await page.waitForFunction(()=>window.KITTBlock?.inspect().ready,{timeout:60000});
  await page.locator('#bistroVisitBtn').click();
  await page.waitForFunction(()=>!KITTBlock.inspect().paused,{timeout:30000});
  // Laisse disparaître la bulle d'accueil pour inspecter les machines sans masque.
  await page.waitForTimeout(9000);
  const state=await page.evaluate(()=>({bistro:KITTBlock.inspect().bistro,target:{text:document.querySelector('#targetName').textContent,hidden:document.querySelector('#targetName').hidden},welcome:document.querySelector('#quoteText')?.textContent}));
  await page.screenshot({path:'test-results/live-bistro-five-arcades.png'});
  assert.deepEqual(state.bistro.cabinets,['pacman','tetris','space-invaders','stunt','arcade-hub']);
  assert.equal(state.target.hidden,false,'Le kiosque des dix jeux doit être repéré dès l’entrée.');
  assert.match(state.target.text,/BORNE 10 JEUX/);
  assert.deepEqual(errors,[],'Aucune erreur JavaScript sur le bistrot publié.');
  console.log('OK Chrome public : cinq bornes instanciées; capture test-results/live-bistro-five-arcades.png');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
