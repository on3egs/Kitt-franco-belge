const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createGameServer } = require('./server');

(async () => {
  const service = await createGameServer({ port: 0, dataDir: require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'kitt-radio-bistro-')) });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    await page.addInitScript(()=>localStorage.setItem('kitt.settings.v2',JSON.stringify({quality:'low',volume:0,voice:false,sensitivity:4})));
    async function walkTo(x,z){await page.waitForFunction(()=>KITTBlock.inspect().captured&&!KITTBlock.inspect().paused);await page.evaluate(({x,z})=>{const s=KITTBlock.inspect(),yaw=Math.atan2(-(x-s.player.x),-(z-s.player.z)),delta=Math.atan2(Math.sin(yaw-s.look.yaw),Math.cos(yaw-s.look.yaw)),event=new MouseEvent('mousemove');Object.defineProperty(event,'movementX',{value:-delta/.0026});Object.defineProperty(event,'movementY',{value:s.look.pitch/.0026});document.dispatchEvent(event)},{x,z});await page.keyboard.down('z');try{await page.waitForFunction(({x,z})=>{const p=KITTBlock.inspect().player;return Math.hypot(p.x-x,p.z-z)<.65},{x,z},{timeout:60000})}finally{await page.keyboard.up('z')}}
    await page.route('https://www.nrj.be/**', route => route.abort());
    // Dans l'iframe publique, servir les fichiers arcade locaux pour vérifier
    // exactement le code corrigé avant de le déployer.
    const arcadeRoot=path.resolve(__dirname,'../client/public/static/games/3d');
    await page.route('https://kitt-franco-belge.be/static/games/3d/**',route=>{
      const pathname=new URL(route.request().url()).pathname;
      const local=path.resolve(arcadeRoot,pathname.replace('/static/games/3d/',''));
      if(local.startsWith(arcadeRoot+path.sep)&&fs.existsSync(local))return route.fulfill({path:local});
      return route.continue();
    });
    await page.goto('http://127.0.0.1:' + service.port + '/block-mode.html');
    await page.waitForFunction(() => window.KITTBlock?.inspect().ready);
    await page.click('#bistroVisitBtn');
    await page.waitForFunction(() => !KITTBlock.inspect().paused);
    await page.screenshot({path:'test-results/bistro-integrated-interior.png'});
    assert.ok(await page.locator('#radioOpen').isVisible(), 'Le bouton radio doit apparaître dans le HUD.');
    await page.keyboard.press('F9');
    await page.waitForFunction(()=>KITTBlock.inspect().paused&&!KITTBlock.inspect().captured);
    assert.ok(await page.locator('#radioStation option').count() >= 5, 'Les cinq stations demandées doivent être proposées.');
    await page.selectOption('#radioStation', 'nrj-dance');
    assert.equal(await page.locator('#radioPanel').getAttribute('data-state'), 'embed');
    assert.match(await page.locator('#radioPlayerMount iframe').getAttribute('src'), /nrj\.be\/embed\/newradioplayer\/NRJdance/);
    await page.locator('#radioPower').click();
    assert.equal(await page.locator('#radioPanel').evaluate(node => node.classList.contains('is-on')), false, 'La radio doit réellement couper et décharger le lecteur.');
    assert.equal(await page.locator('#radioPlayerMount iframe').count(), 0);
    await page.keyboard.press('F9');
    assert.equal(await page.locator('#radioPanel').evaluate(node => node.classList.contains('is-on')), true, 'F9 doit rallumer la radio.');
    await page.keyboard.press('F9');
    assert.equal(await page.locator('#radioPanel').evaluate(node => node.classList.contains('is-on')), false);
    await page.locator('#radioClose').click();
    await walkTo(-21.9,-18);
    await page.waitForFunction(() => document.querySelector('#targetName').textContent.includes('BORNE PAC-MAN'));
    await page.keyboard.press('e');
    await page.waitForSelector('#arcadePanel:not(.hidden)');
    assert.match(await page.locator('#arcadeFrame').getAttribute('src'), /pacman-3d\.html/);
    assert.equal(await page.locator('#arcadeFallback').getAttribute('target'), '_blank');
    // Le canvas existe avant que le jeu soit prêt : attendre JOUER puis tester la partie.
    await page.frameLocator('#arcadeFrame').locator('#btn-start').waitFor({state:'visible',timeout:60000});
    const pacmanFrame=page.frames().find(frame=>frame.url().includes('pacman-3d.html'));
    assert.ok(pacmanFrame,'L’iframe Pac-Man doit être chargée.');
    await page.frameLocator('#arcadeFrame').locator('#btn-start').click();
    await pacmanFrame.waitForFunction(()=>window.PACMAN_3D?.state().state==='playing',null,{timeout:10000});
    await page.frameLocator('#arcadeFrame').locator('#game-container canvas').click({position:{x:400,y:300}});
    const pacmanStart=await pacmanFrame.evaluate(()=>PACMAN_3D.state().player);
    await pacmanFrame.locator('#game-container canvas').press('ArrowLeft');
    await page.waitForTimeout(1500);
    await pacmanFrame.waitForFunction(before=>{const p=PACMAN_3D.state().player;return p.x<before.x||p.y!==before.y},pacmanStart,{timeout:8000});
    await page.screenshot({ path: 'test-results/bistro-pacman-cabinet.png' });
    await page.click('#arcadeClose');
    assert.equal(await page.locator('#arcadePanel').evaluate(node => node.classList.contains('hidden')), true);
    if (!(await page.evaluate(()=>KITTBlock.inspect().captured&&!KITTBlock.inspect().paused))) {
      await page.locator('#capturePointer').click({timeout:10000});
      await page.waitForFunction(()=>KITTBlock.inspect().captured&&!KITTBlock.inspect().paused,{timeout:10000});
    }
    await walkTo(-21.9,-14);
    await page.waitForFunction(() => document.querySelector('#targetName').textContent.includes('BORNE TETRIS'));
    await page.keyboard.press('e');
    await page.waitForSelector('#arcadePanel:not(.hidden)');
    assert.match(await page.locator('#arcadeFrame').getAttribute('src'), /tetris-3d-ultra\.html/);
    await page.frameLocator('#arcadeFrame').locator('#start-button').waitFor({state:'visible',timeout:60000});
    await page.frameLocator('#arcadeFrame').locator('#start-button').click();
    const tetrisFrame=page.frames().find(frame=>frame.url().includes('tetris-3d-ultra.html'));
    assert.ok(tetrisFrame,'L’iframe Tetris doit être chargée.');
    await tetrisFrame.waitForFunction(()=>window.TETRIS_3D_ULTRA?.debugState().state==='playing',null,{timeout:10000});
    const tetrisStart=await tetrisFrame.evaluate(()=>TETRIS_3D_ULTRA.debugState().position);
    await tetrisFrame.locator('canvas').first().click({position:{x:400,y:300}});
    let tetrisMoved=false;
    for(const key of ['ArrowLeft','ArrowRight','ArrowRight','ArrowLeft']){
      await tetrisFrame.locator('canvas').first().press(key);
      await page.waitForTimeout(80);
      if((await tetrisFrame.evaluate(()=>TETRIS_3D_ULTRA.debugState().position[0]))!==tetrisStart[0]){tetrisMoved=true;break}
    }
    assert.ok(tetrisMoved,'Une flèche doit déplacer la pièce Tetris.');
    await page.locator('#arcadeClose').click();
    await page.waitForFunction(()=>document.querySelector('#arcadePanel').classList.contains('hidden'),null,{timeout:5000});
    console.log('OK Chrome : radio F9, bistrot, accès à pied et bornes Tetris + Pac-Man.');
  } finally {
    await browser.close();
    await service.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
