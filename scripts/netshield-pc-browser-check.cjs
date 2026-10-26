const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/ON3EG/AppData/Local/Temp/kitt-cockpit-browser/node_modules/playwright');
const fs = require('fs');
const path = require('path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const output=path.resolve('artifacts/netshield-pc');fs.mkdirSync(output,{recursive:true});
 const bases=process.env.NETSHIELD_BASES ? process.env.NETSHIELD_BASES.split(',') : ['http://127.0.0.1:4173/netshield/','https://kyronext.eu/netshield/'];
 const results=[];
 try {
  for(const base of bases)for(const width of [1280,390,320]){
   const page=await browser.newPage({viewport:{width,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const response=await page.goto(base,{waitUntil:'networkidle'});if(response.status()!==200)throw Error('HTTP '+response.status());
   await page.locator('#pc-autonome').waitFor();
   const exe=await page.locator('#pc-autonome a[href$="Setup.exe"]').getAttribute('href');
   if(!exe.includes('netshield-pc-v1.0.0'))throw Error('Wrong standalone installer');
   if(await page.locator('a[href*="/netshield-v1.0.0/"]').count()!==2)throw Error('AGX links lost');
   await page.locator('img[src="pc-dashboard.jpg"]').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>{const img=document.querySelector('img[src="pc-dashboard.jpg"]');return img&&img.complete&&img.naturalWidth>0});
   if(!await page.locator('img[src="pc-dashboard.jpg"]').evaluate(img=>img.complete&&img.naturalWidth>0))throw Error('Screenshot missing');
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Page overflow '+base+' '+width);
   await page.screenshot({path:path.join(output,(base.includes('127.')?'local':'live')+'-'+width+'.png'),fullPage:true});
   await page.goto(base+'pc-guide.html',{waitUntil:'networkidle'});
   if(!await page.getByRole('heading',{name:'5. Restauration et panne'}).count())throw Error('Guide incomplete');
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Guide overflow '+base+' '+width);
   if(errors.length)throw Error(errors.join('\n'));
   results.push({base,width,installer:exe,guide:true,errors});console.log('PASS',base,width);await page.close();
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
