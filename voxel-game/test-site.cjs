// VÃ©rifie le vÃ©ritable site principal, sa recherche et le jeu dans son iframe.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 const errors=[];fs.mkdirSync('test-results',{recursive:true});
 async function pageIn(mobile){
  const page=await browser.newPage(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:900}});
  await page.addInitScript(()=>localStorage.setItem('kitt.settings.v2',JSON.stringify({quality:'low',volume:0,voice:false})));
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://kitt-franco-belge.be/jeux/',{waitUntil:'domcontentloaded'});
  await page.getByRole('searchbox',{name:'Rechercher dans la collection'}).waitFor({timeout:40000});return page;
 }
 try{
  if(!process.env.MOBILE_ONLY){
  const page=await pageIn(false),search=page.getByRole('searchbox',{name:'Rechercher dans la collection'});
  for(const query of ['minecraft','blocs halloween','halloween blocs','crÃ©atures blocs']){
   await search.fill(query);await page.waitForFunction(()=>document.querySelectorAll('.arcade-card').length===1);
   assert.match(await page.locator('.arcade-card h3').innerText(),/Monde en blocs/);
  }
  await page.getByRole('button',{name:'Rechercher dans le site',exact:true}).first().click();
  await page.getByRole('searchbox',{name:'Votre recherche'}).fill('minecraft');
  const result=page.locator('.site-search-results a');await result.waitFor();
  assert.equal(await result.count(),1);assert.equal(await result.getAttribute('href'),'https://kitt.kitt-franco-belge.be/static/games/kitt-blocks/');
  await page.getByRole('searchbox',{name:'Votre recherche'}).fill('introuvable-xyz-182');await page.getByText('Aucune rubrique trouvÃ©e.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Fermer la recherche'}).click();
  await page.locator('.arcade-card').getByRole('button',{name:'Jouer',exact:true}).click();
  const child=page.frameLocator('iframe[title="KITT Â· Monde en blocs"]');
  await child.locator('#creativeBtn').waitFor({timeout:40000});
  let frame=page.frames().find(f=>f.url().includes('/static/games/kitt-blocks/'));
  await frame.waitForFunction(()=>window.KITTBlock?.inspect().ready);
  await child.locator('#creativeBtn').click();await frame.waitForFunction(()=>!KITTBlock.inspect().paused);
  assert.equal(await frame.evaluate(()=>KITTBlock.inspect().creatures.length),16);
  await page.screenshot({path:'test-results/root-game.png'});
  await page.keyboard.press('Escape');await child.locator('#exitBtn').click();
  await page.waitForFunction(()=>!document.querySelector('.arcade-frame'));
  await page.screenshot({path:'test-results/root-catalogue.png'});
  console.log('Site principal : recherche des jeux et du site, lancement rÃ©el, WebGL, crÃ©atures et retour dans le catalogue validÃ©s.');await page.close();}
  const mobile=await pageIn(true);await mobile.getByRole('searchbox',{name:'Rechercher dans la collection'}).fill('minecraft');
  await mobile.locator('.arcade-card').getByRole('button',{name:'Jouer',exact:true}).tap();
  const mobileChild=mobile.frameLocator('iframe[title="KITT Â· Monde en blocs"]');await mobileChild.locator('#creativeBtn').waitFor({timeout:40000});
  frame=mobile.frames().find(f=>f.url().includes('/static/games/kitt-blocks/'));await frame.waitForFunction(()=>window.KITTBlock?.inspect().ready);
  await mobileChild.locator('#creativeBtn').tap();await frame.waitForFunction(()=>!KITTBlock.inspect().paused);
  await mobileChild.locator('[data-command="jump"]').tap();await frame.waitForFunction(()=>KITTBlock.inspect().player.y>8.1);
  await mobile.screenshot({path:'test-results/root-mobile-game.png'});
  await mobileChild.locator('#pauseBtn').tap();await mobileChild.locator('#exitBtn').tap();await mobile.waitForFunction(()=>!document.querySelector('.arcade-frame'));
  assert.deepEqual(errors,[]);console.log('OK site public : PC et mobile, recherche Minecraft/Halloween, jeu intÃ©grÃ©, saut tactile et fermeture inter-domaines.');
 }catch(e){
  console.error('Erreurs de page :',errors);
  for(const context of browser.contexts())for(const page of context.pages()){
   await page.screenshot({path:'test-results/root-failure.png'}).catch(()=>{});
   for(const frame of page.frames())if(frame.url().includes('/static/games/kitt-blocks/'))console.error('Chargement du jeu :',await frame.locator('#loadText').textContent().catch(()=>''));
  }
  throw e;
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
