const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createGameServer } = require('./server');

(async () => {
  const service = await createGameServer({ port: 0, dataDir: require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'kitt-radio-bistro-')) });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    await page.route('https://www.nrj.be/**', route => route.abort());
    await page.route('https://kitt-franco-belge.be/**', route => route.abort());
    await page.goto('http://127.0.0.1:' + service.port + '/block-mode.html');
    await page.waitForFunction(() => window.KITTBlock?.inspect().ready);
    await page.click('#bistroVisitBtn');
    await page.waitForFunction(() => !KITTBlock.inspect().paused);
    assert.ok(await page.locator('#radioOpen').isVisible(), 'Le bouton radio doit apparaître dans le HUD.');
    await page.keyboard.press('F9');
    assert.equal(await page.locator('#radioStation option').count(), 5, 'Les cinq stations doivent être proposées.');
    await page.selectOption('#radioStation', 'nrj-dance');
    assert.equal(await page.locator('#radioPanel').getAttribute('data-state'), 'embed');
    assert.match(await page.locator('#radioPlayerMount iframe').getAttribute('src'), /nrj\.be\/embed\/newradioplayer\/NRJdance/);
    await page.locator('#radioPower').evaluate(button => button.click());
    assert.equal(await page.locator('#radioPanel').evaluate(node => node.classList.contains('is-on')), false, 'La radio doit réellement couper et décharger le lecteur.');
    assert.equal(await page.locator('#radioPlayerMount iframe').count(), 0);
    await page.keyboard.press('F9');
    assert.equal(await page.locator('#radioPanel').evaluate(node => node.classList.contains('is-on')), true, 'F9 doit rallumer la radio.');
    await page.keyboard.press('F9');
    assert.equal(await page.locator('#radioPanel').evaluate(node => node.classList.contains('is-on')), false);
    await page.locator('#radioClose').evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('#targetName').textContent.includes('BORNE PAC-MAN'));
    await page.keyboard.press('e');
    await page.waitForSelector('#arcadePanel:not(.hidden)');
    assert.match(await page.locator('#arcadeFrame').getAttribute('src'), /pacman-3d\.html/);
    assert.equal(await page.locator('#arcadeFallback').getAttribute('target'), '_blank');
    await page.screenshot({ path: 'test-results/bistro-pacman-cabinet.png' });
    await page.click('#arcadeClose');
    assert.equal(await page.locator('#arcadePanel').evaluate(node => node.classList.contains('hidden')), true);
    if (await page.locator('#pointerPrompt').isVisible().catch(() => false)) await page.locator('#capturePointer').click();
    await page.keyboard.down('s');
    await page.waitForFunction(() => document.querySelector('#targetName').textContent.includes('BORNE TETRIS'), null, { timeout: 7000 });
    await page.keyboard.up('s');
    await page.keyboard.press('e');
    await page.waitForSelector('#arcadePanel:not(.hidden)');
    assert.match(await page.locator('#arcadeFrame').getAttribute('src'), /tetris-3d-ultra\.html/);
    console.log('OK Chrome : radio F9, bistrot, accès à pied et bornes Tetris + Pac-Man.');
  } finally {
    await browser.close();
    await service.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
