const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const { createGameServer } = require('./server');

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitt-bistro-barman-'));
  const service = await createGameServer({ port: 0, dataDir });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader']
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    await page.addInitScript(() => localStorage.setItem('kitt.settings.v2', JSON.stringify({ quality: 'low', volume: 0, voice: false, sensitivity: 4 })));
    await page.goto(`http://127.0.0.1:${service.port}/block-mode.html`);
    await page.waitForFunction(() => window.KITTBlock?.inspect().ready);
    await page.click('#bistroVisitBtn');
    await page.waitForFunction(() => !KITTBlock.inspect().paused);

    // Marcher devant le comptoir permet aussi de vérifier l’accès entre bornes et tabourets.
    await page.waitForFunction(() => KITTBlock.inspect().captured && !KITTBlock.inspect().paused);
    const destination = { x: -14.5, z: -16.0 };
    await page.evaluate(({ x, z }) => {
      const state = KITTBlock.inspect();
      const yaw = Math.atan2(-(x - state.player.x), -(z - state.player.z));
      const delta = Math.atan2(Math.sin(yaw - state.look.yaw), Math.cos(yaw - state.look.yaw));
      const event = new MouseEvent('mousemove');
      Object.defineProperty(event, 'movementX', { value: -delta / 0.0026 });
      Object.defineProperty(event, 'movementY', { value: state.look.pitch / 0.0026 });
      document.dispatchEvent(event);
    }, destination);
    await page.keyboard.down('z');
    try {
      await page.waitForFunction(({ x, z }) => {
        const p = KITTBlock.inspect().player;
        return Math.hypot(p.x - x, p.z - z) < 0.65;
      }, destination, { timeout: 30000 });
    } finally {
      await page.keyboard.up('z');
    }

    await page.waitForTimeout(500);
    const approach = await page.evaluate(() => ({ player: KITTBlock.inspect().player, label: document.querySelector('#targetName').textContent, hidden: document.querySelector('#targetName').hidden, bistro: KITTBlock.inspect().bistro }));
    if (!approach.label.includes('MARCEL, LE BARMAN')) throw new Error(`Marcel n’est pas ciblable : ${JSON.stringify(approach)}`);
    for (let order = 1; order <= 4; order++) {
      if (order > 1) await page.waitForTimeout(5100);
      await page.keyboard.press('e');
      await page.waitForFunction(expected => KITTBlock.inspect().bistro.bartender.orders === expected, order);
      await page.waitForFunction(() => KITTBlock.inspect().bistro.bartender.glassVisible);
      assert.equal(await page.locator('#quoteSpeaker').textContent(), 'MARCEL');
      if (order === 4) {
        await page.waitForFunction(() => document.querySelector('#quoteText').textContent.includes('Manix'));
        const story = await page.locator('#quoteText').textContent();
        assert.match(story, /hacker blanc/i);
        assert.match(story, /outils gratuits/i);
        assert.match(story, /harcèlement/i);
        await page.screenshot({ path: 'test-results/bistro-marcel-manix-story.png' });
      }
    }

    console.log('OK Chrome : Marcel se laisse approcher, sert quatre verres et raconte l’histoire de Manix en français.');
  } finally {
    await browser.close();
    await service.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
