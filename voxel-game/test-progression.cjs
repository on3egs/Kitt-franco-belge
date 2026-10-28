const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright');
const {createGameServer}=require('./server');

const saveState=(page,{profile='ANONYMOUS',stage=0,points=0,named=false}={})=>page.addInitScript(({profile,stage,points,named})=>{
  localStorage.setItem('kitt.settings.v2',JSON.stringify({quality:'low',volume:0,voice:false}));
  localStorage.setItem('kitt.free-mode.v1',JSON.stringify(true));
  localStorage.setItem('kitt.free-profile.v1',JSON.stringify(profile));
  localStorage.setItem('kitt.pilot-name.v1',JSON.stringify(''));
  localStorage.setItem('kitt.campaign.v1',JSON.stringify({points,cores:0,engine:0,races:named?1:0,demons:0,storyStage:stage,unlocks:[],freeRaceUnlocked:named}));
},{profile,stage,points,named});

(async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'kitt-progression-'));let service,browser;
  try{
    service=await createGameServer({bind:'127.0.0.1',port:0,basePath:'/test',dataDir});
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
    const url=`http://127.0.0.1:${service.port}/test/block-mode.html`;

    // Nouveau pilote : aucune identité et aucun avatar avancé avant la mission.
    const guest=await browser.newPage({viewport:{width:1100,height:820}});await saveState(guest);const errors=[];guest.on('pageerror',e=>errors.push(e.message));
    await guest.goto(url);await guest.waitForFunction(()=>KITTBlock?.inspect().ready);
    let state=await guest.evaluate(()=>KITTBlock.inspect());assert.equal(state.freeMode,true);assert.equal(state.anonymous,true);assert.equal(state.profile,'ANONYMOUS');
    assert.match(await guest.locator('#missionTitle').textContent(),/RETROUVER DEVON/);assert.match(await guest.locator('#missionSteps').innerText(),/point jaune.*radar/i);assert.match(await guest.locator('#missionResult').textContent(),/Devon te confie/i);
    assert.equal(await guest.locator('#playerName').isDisabled(),true);assert.equal(await guest.locator('#freeAvatarA').isDisabled(),true);
    await guest.click('#creativeBtn');await guest.waitForFunction(()=>!KITTBlock.inspect().paused);
    await guest.keyboard.down('d');await guest.waitForFunction(()=>Math.hypot(KITTBlock.inspect().player.x-4,KITTBlock.inspect().player.z-10)<3.5,{timeout:5000});await guest.keyboard.up('d');
    await guest.keyboard.press('e');await guest.waitForFunction(()=>KITTBlock.inspect().storyStage===1);assert.equal(await guest.evaluate(()=>KITTBlock.inspect().goliath.visible),true);assert.equal(await guest.evaluate(()=>KITTBlock.inspect().anonymous),true);
    await guest.screenshot({path:'test-results/guest-mission-goliath.png'});await guest.close();

    // La mission achevée ouvre les deux avatars de recrue, mais pas encore le pseudo.
    const unlocked=await browser.newPage();await saveState(unlocked,{stage:3,points:150});await unlocked.goto(url);await unlocked.waitForFunction(()=>KITTBlock?.inspect().ready);
    assert.equal(await unlocked.locator('#freeAvatarA').isDisabled(),false);assert.equal(await unlocked.locator('#playerName').isDisabled(),true);
    await unlocked.click('#freeAvatarA');assert.equal(await unlocked.evaluate(()=>KITTBlock.inspect().profile),'PILOT_FEMME');await unlocked.close();

    // Une course terminée déverrouille le champ de pseudo et le classement.
    const named=await browser.newPage();await saveState(named,{profile:'PILOT_FEMME',stage:3,points:300,named:true});await named.goto(url);await named.waitForFunction(()=>KITTBlock?.inspect().ready);
    assert.equal(await named.evaluate(()=>KITTBlock.inspect().profile),'PILOT_FEMME');assert.equal(await named.locator('#playerName').isDisabled(),false);
    assert.match(await named.locator('#missionTitle').textContent(),/MISSION FLAG.*CAMION ATELIER/);assert.match(await named.locator('#missionSteps').innerText(),/monter dans la cabine/i);assert.match(await named.locator('#missionSteps').innerText(),/descendre/i);assert.match(await named.locator('#missionResult').textContent(),/monte.*redescendu/i);
    await named.fill('#playerName','Alexia');await named.locator('#playerName').blur();assert.equal(await named.evaluate(()=>KITTBlock.inspect().pilotName),'Alexia');
    await named.click('#scoresOpen');await named.waitForSelector('#scoresPanel:not(.hidden)');assert.match(await named.locator('#scoreSummary').textContent(),/Alexia · 300 points/);assert.match(await named.locator('#scoreList').textContent(),/Alexia.*300 pts.*Pilote FLAG/);
    assert.ok(await named.locator('#radar').evaluate(c=>c.width===180&&c.height===180));await named.screenshot({path:'test-results/progression-classement.png'});assert.deepEqual(errors,[]);
    await named.close();console.log('OK progression FLAG : anonymat, mission Goliath, avatar après sauvetage, pseudo après course, classement et radar.');
  }finally{if(browser)await browser.close();if(service)await service.close();fs.rmSync(dataDir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
