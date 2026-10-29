const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const {createGameServer}=require('./server');

(async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'kitt-view-budget-'));
 const service=await createGameServer({port:0,dataDir,pins:{LILOU:'test',ALEXIA:'test'}});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(`http://127.0.0.1:${service.port}/block-mode.html`);
  await page.waitForFunction(()=>window.KITTBlock?.inspect().ready,{timeout:30000});
  await page.waitForFunction(()=>window.KITTBlock.inspect().chunks===25,{timeout:15000});
  await page.click('#settingsOpen');
  assert.equal(await page.locator('#viewDistance').inputValue(),'2');
  assert.equal(await page.locator('#mapBudget').inputValue(),'standard');
  await page.screenshot({path:'test-results/view-budget-settings.png'});
  await page.locator('#viewDistance').evaluate(el=>{el.value='3';el.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.selectOption('#mapBudget','extended');
  await page.waitForFunction(()=>window.KITTBlock.inspect().chunks===49,{timeout:20000});
  assert.match(await page.locator('#mapBudgetReadout').textContent(),/49 chunks/);
  let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('kitt.settings.v2')));
  assert.equal(saved.viewDistance,3);assert.equal(saved.mapBudget,'extended');
  await page.selectOption('#mapBudget','economy');
  await page.waitForFunction(()=>window.KITTBlock.inspect().chunks===9,{timeout:15000});
  assert.match(await page.locator('#mapBudgetReadout').textContent(),/9 chunks/);
  saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('kitt.settings.v2')));
  assert.equal(saved.mapBudget,'economy');
  assert.deepEqual(errors,[]);
  console.log('OK Chrome : le budget bascule réellement entre 9, 25 et 49 chunks, s’affiche et se sauvegarde.');
 }finally{
  await browser.close();await service.close();
  const tempRoot=path.resolve(os.tmpdir())+path.sep;
  const resolvedDataDir=path.resolve(dataDir);
  if(resolvedDataDir.startsWith(tempRoot)&&path.basename(resolvedDataDir).startsWith('kitt-view-budget-'))fs.rmSync(resolvedDataDir,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
