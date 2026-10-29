/* Retour sonore facultatif commun aux mini-jeux, généré localement avec WebAudio. */
(()=>{
 'use strict';
 const STORAGE='kittArcade.sound.v1',simon=!!document.querySelector('.pad[data-pad]');
 const read=()=>{try{return localStorage.getItem(STORAGE)!=='off'}catch{return true}};
 const write=value=>{try{localStorage.setItem(STORAGE,value?'on':'off')}catch{}};
 let enabled=read(),context=null,lastPing=0;
 const tone=(frequency=520,duration=.075,shape='sine',gain=.045)=>{
  if(!enabled||simon)return;
  try{
   const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
   context??=new Audio();if(context.state==='suspended')void context.resume();
   const now=context.currentTime,osc=context.createOscillator(),volume=context.createGain();
   osc.type=shape;osc.frequency.setValueAtTime(frequency,now);
   volume.gain.setValueAtTime(.0001,now);volume.gain.exponentialRampToValueAtTime(gain,now+.012);volume.gain.exponentialRampToValueAtTime(.0001,now+duration);
   osc.connect(volume).connect(context.destination);osc.start(now);osc.stop(now+duration+.02);
  }catch{/* Audio indisponible : le jeu reste entièrement jouable. */}
 };
 const style=document.createElement('style');style.textContent='#kittArcadeSound{position:fixed;z-index:20;top:12px;right:12px;border:1px solid #516779;border-radius:999px;padding:8px 12px;background:#0c141eee;color:#dff7ff;font:700 10px/1.2 ui-monospace,monospace;letter-spacing:.08em;cursor:pointer;box-shadow:0 4px 18px #0008;backdrop-filter:blur(8px)}#kittArcadeSound[aria-pressed=true]{border-color:#ff4056;color:#ff8290}#kittArcadeSound:focus-visible{outline:3px solid #64dcef;outline-offset:3px}@media(max-width:620px){#kittArcadeSound{top:9px;right:9px;padding:9px 11px;font-size:9px}}';document.head.append(style);
 const button=document.createElement('button');button.id='kittArcadeSound';button.type='button';button.setAttribute('aria-label','Activer ou couper les sons de l’arcade');
 function refresh(){button.textContent=enabled?'◖))) SON':'◖× SON';button.setAttribute('aria-pressed',String(enabled))}
 button.addEventListener('click',()=>{enabled=!enabled;write(enabled);refresh();if(enabled)tone(740,.09,'triangle',.055)});document.body.append(button);refresh();
 document.addEventListener('pointerdown',event=>{if(event.target===button||!event.target.closest('button,canvas,[role="button"]'))return;const now=performance.now();if(now-lastPing<65)return;lastPing=now;tone(event.target.closest('#start,#restart,#new')?620:390,.045,'triangle',.025)},{capture:true,passive:true});
 document.addEventListener('keydown',event=>{if(event.repeat||event.target.matches('input,textarea,select'))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter','z','q','s','d','w','a'].includes(event.key)||event.code==='Space'){const now=performance.now();if(now-lastPing<65)return;lastPing=now;tone(360,.04,'square',.018)}},{capture:true});
 if(!simon){
  const statuses=['#message','#status','#turn'].map(selector=>document.querySelector(selector)).filter(Boolean);
  const endings=/(record|victoire|bien jou|signal valid|route d.gag|secteur s.curis|s.curis.|niveau suivant|paires s.curis|excellent|impact confirm)/i;
  const misses=/(perdu|mauvais signal|mine d.tect|fin de la chasse|plus de mouvement|retourner au garage|fin de course)/i;
  const observer=new MutationObserver(records=>{for(const record of records){if(record.type!=='childList'&&record.type!=='characterData')continue;const message=record.target.textContent||'';if(!message.trim())continue;if(endings.test(message)){tone(780,.11,'sine',.055);setTimeout(()=>tone(1040,.13,'sine',.045),85);try{navigator.vibrate?.([25,35,35])}catch{}}else if(misses.test(message))tone(180,.15,'triangle',.045);else tone(510,.065,'sine',.035);break}});
  statuses.forEach(node=>observer.observe(node,{subtree:true,childList:true,characterData:true}));
 }
 window.KITTArcadeFeedback={play:tone,setEnabled(value){enabled=!!value;write(enabled);refresh()},get enabled(){return enabled}};
})();
