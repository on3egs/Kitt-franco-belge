/* Navigation et commandes tactiles 3D ; aucune connexion multijoueur. */
(()=>{
 const boot=()=>{
  const invaders=!!window.SPACE_INVADERS_3D_ULTRA;
  document.body.dataset.arcadeGame=invaders?'invaders3d':'pacman3d';
  const bar=document.createElement('nav');bar.className='solo-3d-toolbar';bar.setAttribute('aria-label','Commandes du jeu');
  bar.innerHTML='<a href="/jeux">ARCADE</a><a href="/">ACCUEIL</a><button data-action="pause">PAUSE</button><button data-action="fullscreen">PLEIN ECRAN</button>'+(invaders?'<button data-code="ArrowLeft" aria-label="Gauche">GAUCHE</button><button data-code="ArrowRight" aria-label="Droite">DROITE</button><button data-code="Space">TIR</button><button data-code="KeyX">BOMBE X</button>':'');
  document.body.appendChild(bar);
  const style=document.createElement('style');style.textContent='.solo-3d-toolbar{position:fixed;bottom:max(10px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);display:flex;flex-wrap:wrap;justify-content:center;gap:5px;z-index:900;width:max-content;max-width:98vw}.solo-3d-toolbar a,.solo-3d-toolbar button{color:#9ef5ff;background:#08131ee8;border:1px solid #3a91a1;border-radius:9px;padding:10px 12px;font:700 10px monospace;text-decoration:none;white-space:nowrap;touch-action:none}.solo-3d-toolbar button:active{background:#234d5d}@media(max-width:550px){.solo-3d-toolbar{gap:3px}.solo-3d-toolbar a,.solo-3d-toolbar button{padding:10px 8px;font-size:9px}}';document.head.appendChild(style);
  bar.querySelector('[data-action="pause"]').onclick=()=> (invaders?window.SPACE_INVADERS_3D_ULTRA:window.PACMAN_3D).togglePause();
  bar.querySelector('[data-action="fullscreen"]').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{})};
  if(!invaders){
   const zoom=document.createElement('button');zoom.textContent='ZOOM ×1';zoom.onclick=()=>zoom.textContent='ZOOM ×'+window.PACMAN_3D.toggleViewZoom();bar.appendChild(zoom);
   const camera=document.createElement('button');camera.textContent='CAMÉRA';camera.onclick=()=>window.PACMAN_3D.toggleCamera();bar.appendChild(camera);
  }
  const held=new Set(),send=(type,code)=>document.dispatchEvent(new KeyboardEvent(type,{code,key:code==='Space'?' ':code,bubbles:true,cancelable:true}));
  if(invaders&&window.AstSfx){const sound=document.createElement('button');sound.textContent=AstSfx.isMuted()?'SON OFF':'SON ON';sound.onclick=()=>{AstSfx.ensure();AstSfx.setMuted(!AstSfx.isMuted());sound.textContent=AstSfx.isMuted()?'SON OFF':'SON ON'};bar.appendChild(sound)}
  bar.querySelectorAll('[data-code]').forEach(button=>{
   button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);held.add(button.dataset.code);send('keydown',button.dataset.code)};
   const release=()=>{held.delete(button.dataset.code);send('keyup',button.dataset.code)};
   button.onpointerup=release;button.onpointercancel=release;button.onlostpointercapture=release;
  });
  window.addEventListener('blur',()=>{held.forEach(code=>send('keyup',code));held.clear()});
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
