const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:700}});
  const root=path.resolve(__dirname,'../client/public/static/games');
  await page.route('https://kitt-franco-belge.be/static/games/**',route=>{const pathname=new URL(route.request().url()).pathname,local=path.resolve(root,pathname.replace('/static/games/',''));if(local.startsWith(root+path.sep)&&fs.existsSync(local)&&fs.statSync(local).isFile())return route.fulfill({path:local});return route.continue()});
  await page.goto('https://kitt-franco-belge.be/static/games/kitt-arcade/index.html');
  assert.equal(await page.locator('.game').count(),10,'Le kiosque doit présenter ses dix jeux.');
  await page.goto('https://kitt-franco-belge.be/static/games/kitt-stunt/index.html');
  await page.locator('#start').click();
  assert.equal(await page.locator('#title').evaluate(e=>e.classList.contains('hidden')),true,'Le bouton doit démarrer la course.');
  const before=await page.locator('#distance').textContent();
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  const after=await page.locator('#distance').textContent();
  assert.notEqual(after,before,'La distance doit progresser pendant la course.');
  assert.ok(await page.locator('#game').evaluate(c=>c.width===960&&c.height===540),'La scène Canvas doit être initialisée.');
  assert.ok(fs.existsSync(path.join(root,'space_invaders_pro','index.html')),'La borne Space Invaders doit utiliser le jeu installé du site.');
  console.log('OK Chrome : kiosque des dix jeux, course Stunt jouable et ressource Space Invaders disponible.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
