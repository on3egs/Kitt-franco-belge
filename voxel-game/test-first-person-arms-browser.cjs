const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const {createGameServer}=require('./server');

(async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'kitt-fp-arms-'));
  const shot=path.join(os.tmpdir(),'kitt-first-person-arms.png');
  const service=await createGameServer({port:0,dataDir,pins:{LILOU:'test',ALEXIA:'test'}});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.addInitScript(()=>localStorage.setItem('kitt.settings.v2',JSON.stringify({quality:'low',volume:0,voice:false})));
    await page.goto(`http://127.0.0.1:${service.port}/block-mode.html`);
    await page.waitForFunction(()=>window.KITTBlock?.inspect().ready,{timeout:30000});
    await page.click('#creativeBtn');
    await page.waitForFunction(()=>!KITTBlock.inspect().paused&&KITTBlock.inspect().hands.visible&&KITTBlock.inspect().hands.rightVisible,{timeout:10000});
    let hands=await page.evaluate(()=>KITTBlock.inspect().hands);
    assert.equal(hands.itemId,'herbe');
    await page.screenshot({path:shot});
    console.log('Chrome : bras et bloc visibles en vue subjective. Capture : '+shot);

    await page.keyboard.press('2');
    assert.equal((await page.evaluate(()=>KITTBlock.inspect().hands)).itemId,'pierre','La hotbar doit changer le bloc tenu.');
    await page.keyboard.press('c');
    hands=await page.evaluate(()=>KITTBlock.inspect().hands);
    assert.equal(hands.weaponStyle,'matraque','C équipe la matraque tenue.');
    await page.keyboard.press('x');
    await page.waitForFunction(()=>{const h=KITTBlock.inspect().hands;return h.action==='attack'&&h.leftVisible},{timeout:1000});
    assert.equal((await page.evaluate(()=>KITTBlock.inspect().hands)).leftVisible,true,'L’attaque doit animer les deux mains.');
    await page.waitForTimeout(380);
    await page.keyboard.press('e');
    await page.waitForFunction(()=>KITTBlock.inspect().hands.action==='use',{timeout:1000});
    console.log('Chrome : bloc sélectionné, changement d’arme, attaque X et interaction E animés.');

    if(await page.evaluate(()=>KITTBlock.inspect().captured)){
      await page.mouse.move(640,400);
      await page.mouse.down({button:'left'});
      await page.waitForFunction(()=>KITTBlock.inspect().hands.action==='mine',{timeout:1000});
      await page.mouse.up({button:'left'});
      await page.mouse.down({button:'right'});
      await page.waitForFunction(()=>{const h=KITTBlock.inspect().hands;return h.action==='place'&&h.leftVisible},{timeout:1000});
      const placed=await page.evaluate(()=>{const s=KITTBlock.inspect();return{hands:s.hands,paused:s.paused,driving:s.car.driving}});
      if(placed.hands.visible)assert.equal(placed.hands.leftVisible,true,'La pose active doit animer les deux mains.');
      else console.log('Chrome : pose demandée pendant une transition masquée : '+JSON.stringify(placed));
      await page.mouse.up({button:'right'});
      console.log('Chrome : clic gauche casser et clic droit poser déclenchent les animations.');
    }else console.log('Chrome : pointer lock non disponible, les clics n’ont pas été simulés.');

    await page.keyboard.press('Escape');
    await page.waitForSelector('#menu:not(.hidden)');
    await page.waitForFunction(()=>!KITTBlock.inspect().hands.visible);
    assert.deepEqual(errors,[],'Aucune erreur JavaScript ne doit apparaître dans Chrome.');
    console.log('Chrome : pause masque les bras; aucune erreur JavaScript.');
  }finally{
    await browser.close();await service.close();
    const tempRoot=path.resolve(os.tmpdir())+path.sep,resolved=path.resolve(dataDir);
    if(resolved.startsWith(tempRoot)&&path.basename(resolved).startsWith('kitt-fp-arms-'))fs.rmSync(resolved,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1});
