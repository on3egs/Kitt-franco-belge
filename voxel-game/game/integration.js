// Catalogue local encapsulé pour préserver les styles du site hôte.
(() => {
  // Un hôte peut fournir son URL ; les fonctions déjà présentes sont conservées.
  const gameUrl=new URL(window.KITT_BLOCK_MODE_URL||'../block-mode.html',document.currentScript.src).href;
  let frame;
  window.startBlockMode ||= () => {
    if(frame)return frame.focus();
    frame=document.createElement('iframe');frame.src=gameUrl;frame.title='Mode de jeu KITT en blocs';frame.allow='autoplay; fullscreen; gamepad';frame.allowFullscreen=true;
    Object.assign(frame.style,{position:'fixed',inset:'0',width:'100%',height:'100dvh',border:'0',zIndex:'30000',background:'#080e17'});
    document.body.append(frame);frame.focus();
  };
  window.stopBlockMode ||= () => {frame?.remove();frame=null};
  window.addEventListener('message',event=>{if(frame&&event.source===frame.contentWindow&&event.origin===new URL(gameUrl).origin&&event.data?.type==='kitt:blockmode:stop')window.stopBlockMode()});
  let host;
  window.openBlockGames = () => {
    if (host) { host.hidden=false; return; }
    host=document.createElement('div');Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'25000'});
    const root=host.attachShadow({mode:'open'});
    root.innerHTML=`<style>:host{font:15px system-ui;color:#e5f3fa}*{box-sizing:border-box}.catalog{height:100dvh;overflow:auto;background:radial-gradient(ellipse at 80% 20%,#20354a,#080f19 60%);padding:clamp(24px,6vw,90px)}header{display:flex;justify-content:space-between;gap:16px;align-items:center;border-bottom:1px solid #52677a;padding-bottom:20px}small{color:#66d5e9;letter-spacing:3px}h1{font-size:clamp(35px,7vw,70px);margin:32px 0;color:#fff}h2{font-size:30px;margin:10px 0}.card{max-width:800px;border:1px solid #516b80;background:#102031;padding:30px;border-radius:10px}.scanner{height:6px;width:140px;background:linear-gradient(90deg,#721525,#ff3853,#721525);box-shadow:0 0 25px #f2355577;margin-bottom:25px}p{color:#adc3cf;line-height:1.8}button{background:#ff3b51;border:1px solid #ff3b51;color:#fff;border-radius:5px;padding:13px 20px;cursor:pointer;font:inherit;font-weight:700}.back{background:transparent;border-color:#55758b}.tags{font-size:12px;color:#72d3e7;margin:20px 0}</style><section class="catalog"><header><small>KITT FRANCO-BELGE // JEUX</small><button class="back" id="close">RETOUR AU SITE</button></header><h1>LE GARAGE DES JEUX</h1><article class="card"><div class="scanner"></div><small>01 / CONSTRUCTION & EXPLORATION</small><h2>KITT · MONDE EN BLOCS</h2><p>Votre poste FLAG, la route du Nevada et toute la liberté de construire. Retrouvez Michael, appelez KITT et explorez le monde en solo ou en salle publique.</p><div class="tags">ZQSD CONFIGURABLE · PC & MOBILE · 16 PLACES / SALLE</div><button id="play">LANCER LE JEU →</button></article></section>`;
    root.querySelector('#close').onclick=()=>host.hidden=true;
    root.querySelector('#play').onclick=()=>window.startBlockMode();document.body.append(host);
  };
})();
