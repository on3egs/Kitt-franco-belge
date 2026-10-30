// Vérifie que le jeu n’utilise qu’un contexte WebGL et explique proprement son absence.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createGameServer}=require('./server');

(async()=>{
  const liveURL=process.env.KITT_WEBGL_URL;
  const temp=liveURL?null:fs.mkdtempSync(path.join(os.tmpdir(),'kitt-webgl-'));
  const pin=crypto.randomBytes(8).toString('hex');
  const service=temp?await createGameServer({port:0,dataDir:temp,pins:{LILOU:pin,ALEXIA:pin}}):null;
  const url=liveURL||`http://127.0.0.1:${service.port}/block-mode.html`;
  const executablePath=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser=await chromium.launch({executablePath,headless:true,args:['--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1100,height:760}});
    await page.addInitScript(()=>{
      const canvases=new Set();
      window.__webglCanvases=canvases;
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){
        const result=original.call(this,type,...args);
        if(result&&/^(webgl2?|experimental-webgl)$/i.test(type))canvases.add(this);
        return result;
      };
    });
    await page.goto(url);
    await page.waitForFunction(()=>window.KITTBlock?.inspect().ready,{timeout:30000});
    const contexts=await page.evaluate(()=>({
      webglCanvases:window.__webglCanvases.size,
      preview2d:document.querySelector('#profilePreview').getContext('2d') instanceof CanvasRenderingContext2D,
      previewWebgl:!!document.querySelector('#profilePreview').getContext('webgl')
    }));
    assert.deepEqual(contexts,{webglCanvases:1,preview2d:true,previewWebgl:false});
    fs.mkdirSync('test-results',{recursive:true});
    await page.screenshot({path:'test-results/webgl-context-reuse.png'});
    console.log('OK : un seul contexte WebGL; aperçu avatar sur canvas 2D.');

    const noWebgl=await browser.newPage();
    const pageErrors=[];
    noWebgl.on('pageerror',e=>pageErrors.push(e.message));
    await noWebgl.addInitScript(()=>{
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){
        if(/^(webgl2?|experimental-webgl)$/i.test(type))return null;
        return original.call(this,type,...args);
      };
    });
    await noWebgl.goto(url);
    await noWebgl.waitForSelector('#retryGame',{timeout:10000});
    const message=await noWebgl.locator('#loadText').textContent();
    assert.match(message,/WebGL/i);
    assert.deepEqual(pageErrors,[],'Le démarrage WebGL indisponible ne doit pas produire d’erreur non interceptée.');
    await noWebgl.screenshot({path:'test-results/webgl-indisponible.png'});
    console.log('OK : message de récupération affiché si WebGL est indisponible.');
  }finally{
    await browser.close();
    if(service)await service.close();
    if(temp&&path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1});
