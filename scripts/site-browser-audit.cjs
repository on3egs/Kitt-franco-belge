const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const fs = require('fs');
const path = require('path');
(async () => {
 const browser = await chromium.launch({channel:'chrome',headless:true});
 const root = process.env.SITE_URL || 'http://127.0.0.1:4173';
 const output = process.env.SITE_EVIDENCE || path.join(process.env.TEMP,'kitt-site-verification'); fs.mkdirSync(output,{recursive:true});
 const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const page = await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(root,{waitUntil:'domcontentloaded'});await page.waitForTimeout(3500);
 await page.screenshot({path:path.join(output,'home-desktop.png'),fullPage:false});
 await page.getByRole('button',{name:'Ouvrir le menu',exact:true}).click();
 await page.getByRole('navigation',{name:'Toutes les rubriques'}).waitFor();
 await page.screenshot({path:path.join(output,'menu-desktop.png')});await page.keyboard.press('Escape');
 await page.keyboard.press('Control+k');await page.getByRole('dialog').waitFor();
 await page.getByRole('searchbox').fill('sentinel');
 if(await page.locator('.site-search-results a').count()!==1)throw Error('Search result mismatch');
 await page.screenshot({path:path.join(output,'search-desktop.png')});await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Couper les sons du site',exact:true}).click();
 if(await page.evaluate(()=>localStorage.getItem('kitt-sound'))!=='off')throw Error('Sound preference not persisted');
 await page.reload({waitUntil:"domcontentloaded"});await page.getByRole('button',{name:'Activer les sons du site',exact:true}).waitFor();
 await page.locator('#logiciels').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'software-desktop.png')});
 for(const width of [390,320,768]){
  await page.setViewportSize({width,height:900});await page.goto(root,{waitUntil:"domcontentloaded"});await page.waitForTimeout(3000);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);if(overflow)throw Error('Home overflow '+width);
  await page.screenshot({path:path.join(output,'home-'+width+'.png')});
  await page.getByRole('button',{name:'Ouvrir le menu',exact:true}).click();await page.screenshot({path:path.join(output,'menu-'+width+'.png')});await page.keyboard.press('Escape');
 }
 for(const route of ['/kyronext-studio/','/sentinel/','/soutenir/','/videos','/musique','/documents','/missing-test-route']){
  await page.setViewportSize({width:390,height:900});const response=await page.goto(root+route,{waitUntil:"domcontentloaded"});await page.waitForTimeout(2200);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);if(overflow)throw Error('Overflow '+route);
  await page.screenshot({path:path.join(output,route.replace(/\W/g,'')+'-mobile.png')});
  console.log('ROUTE',route,response.status());
 }
 if(errors.length)throw Error('Browser errors: '+JSON.stringify(errors));
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({success:true,routes:9,viewports:[1440,768,390,320],errors},null,2));
 console.log('Browser verification PASS',output);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
