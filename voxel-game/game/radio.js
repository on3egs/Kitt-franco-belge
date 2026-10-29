// Flux officiels : aucun morceau n'est copié dans le jeu. Les embeds ne permettent
// pas au jeu de connaître leur état audio ; leur lecture reste donc « inconnue ».
// Sources des flux ajoutés : nostalgie.be/radio/comment-ecouter-nostalgie et
// support.rtbf.be, article « Liens URL des chaînes radio et webradios ».
export const RADIO_STATIONS = [
 {id:'nrj-dance',name:'NRJ Dance',tag:'DANCE / BELGIQUE',mode:'embed',url:'https://www.nrj.be/embed/newradioplayer/NRJdance',site:'https://www.nrj.be/webradios'},
 {id:'contact',name:'Radio Contact',tag:'HITS / BELGIQUE',mode:'stream',url:'https://audiostream.rtl.be/1/app-radio-contact',site:'https://radiocontact.be/player/'},
 {id:'tipik',name:'Tipik',tag:'ALTERNATIVE / RTBF',mode:'stream',url:'https://radio.rtbf.be/tipik/mp3-160/me',site:'https://www.rtbf.be/radio/liveradio/tipik'},
 {id:'belrtl',name:'Bel RTL',tag:'ACTUALITÉ / BELGIQUE',mode:'embed',url:'https://www.belrtl.be/player/Iframe/belrtl?channel=Bel',site:'https://www.belrtl.be/player/'},
 {id:'nostalgie',name:'Nostalgie',tag:'CLASSIQUES / BELGIQUE',mode:'stream',url:'https://stream.rcs.revma.com/5gd04cwptg0uv',site:'https://www.nostalgie.be/radio/comment-ecouter-nostalgie'},
 {id:'nostalgie-80',name:'Nostalgie 80',tag:'ANNÉES 80 / BELGIQUE',mode:'stream',url:'https://stream.rcs.revma.com/e4xgg233ehuvv',site:'https://www.nostalgie.be/radio/comment-ecouter-nostalgie'},
 {id:'classic21-80',name:'Classic 21 · 80s',tag:'80’S HITS / RTBF',mode:'stream',url:'https://radio.rtbf.be/c21-80s/mp3-128/me',site:'https://support.rtbf.be/hc/fr-fr/articles/16393535008401-Liens-URL-des-cha%C3%AEnes-radio-et-webradios'}
];
const clamp=(v,fallback=.55)=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):fallback;
const read=(key,fallback)=>{try{return localStorage.getItem(key)??fallback}catch{return fallback}};
export class KittRadio {
 constructor(root,onState=()=>{}){
  this.root=root;this.onState=onState;this.on=false;this.audible=false;this.state='off';this.token=0;this.loadingTimer=null;this.playStarted=0;
  let saved={};try{saved=JSON.parse(read('kitt.radio.v2','{}'))||{}}catch{}
  this.station=RADIO_STATIONS.find(s=>s.id===(saved.station||read('kitt.radio.station','')))||RADIO_STATIONS[0];
  this.volume=clamp(Number(saved.volume??Number(read('kitt.radio.volume','55'))/100));this.muted=saved.muted===true;
  this.favorites=new Set((Array.isArray(saved.favorites)?saved.favorites:['nrj-dance','contact','nostalgie-80']).filter(id=>RADIO_STATIONS.some(s=>s.id===id)));
  this.audio=new Audio();this.audio.preload='none';
  this.select=root.querySelector('#radioStation');this.powerButton=root.querySelector('#radioPower');this.status=root.querySelector('#radioStatus');this.mount=root.querySelector('#radioPlayerMount');this.volumeInput=root.querySelector('#radioVolume');
  this.select.replaceChildren(...RADIO_STATIONS.map(s=>new Option(s.name,s.id)));
  this.select.addEventListener('change',()=>this.choose(this.select.value));this.powerButton.addEventListener('click',()=>this.toggle());
  this.volumeInput.addEventListener('input',()=>this.setVolume(Number(this.volumeInput.value)/100));
  root.querySelector('#radioPrevious').addEventListener('click',()=>this.step(-1));root.querySelector('#radioNext').addEventListener('click',()=>this.step(1));
  root.querySelector('#radioFavorite').addEventListener('click',()=>this.favorite());root.querySelector('#radioMute').addEventListener('click',()=>this.setMuted(!this.muted));root.querySelector('#radioRetry').addEventListener('click',()=>this.retry());
  // Les commandes radio ne doivent ni faire marcher ni faire sauter le pilote.
  root.addEventListener('keydown',e=>{if(e.key==='F9')return;e.stopPropagation();if(e.key==='Escape'){e.preventDefault();root.querySelector('#radioClose').click();return}if(!/INPUT|SELECT/.test(e.target.tagName)&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();this.step(e.key==='ArrowLeft'?-1:1)}});
  this.renderStation();this.setStatus('Radio éteinte · choisis une station puis ALLUMER.','off');
  this.elapsedTimer=setInterval(()=>this.renderElapsed(),1000);window.addEventListener('pagehide',()=>{this.shutdown();clearInterval(this.elapsedTimer)},{once:true});
 }
 persist(){try{localStorage.setItem('kitt.radio.v2',JSON.stringify({station:this.station.id,volume:this.volume,muted:this.muted,favorites:[...this.favorites]}));localStorage.setItem('kitt.radio.station',this.station.id);localStorage.setItem('kitt.radio.volume',String(Math.round(this.volume*100)))}catch{}}
 renderStation(){
  const embed=this.station.mode==='embed';this.select.value=this.station.id;this.volumeInput.value=String(Math.round(this.volume*100));this.volumeInput.disabled=embed;this.volumeInput.title=embed?'Utilise le volume du lecteur officiel ci-dessous.':'Volume radio indépendant des effets du jeu.';
  this.root.querySelector('#radioStationName').textContent=this.station.name;this.root.querySelector('#radioStationTag').textContent=this.station.tag;this.root.querySelector('#radioOfficialLink').href=this.station.site;
  this.root.querySelector('#radioSourceNote').textContent=embed?'Lecteur officiel : appuie sur ▶ dans le lecteur. Sa lecture et son volume restent gérés par la station.':'Flux audio officiel. Le volume radio ne modifie pas les voix ni les effets du jeu.';
  this.root.querySelector('#radioVolumeValue').textContent=embed?'LECTEUR':`${Math.round(this.volume*100)} %`;
  const favorite=this.root.querySelector('#radioFavorite');favorite.setAttribute('aria-pressed',String(this.favorites.has(this.station.id)));favorite.textContent=this.favorites.has(this.station.id)?'★ FAVORI':'☆ FAVORI';
  const mute=this.root.querySelector('#radioMute');mute.disabled=embed;mute.setAttribute('aria-pressed',String(this.muted));mute.textContent=this.muted?'SON COUPÉ':'SOURDINE';mute.title=embed?'Utilise la sourdine du lecteur officiel.':'Couper seulement le son de la radio';
  const presets=this.root.querySelector('#radioPresets');presets.replaceChildren();
  const sorted=[...RADIO_STATIONS].sort((a,b)=>Number(this.favorites.has(b.id))-Number(this.favorites.has(a.id)));
  for(const station of sorted){const button=document.createElement('button');button.type='button';button.dataset.station=station.id;button.setAttribute('aria-pressed',String(this.station.id===station.id));const slot=document.createElement('small');slot.textContent=String(RADIO_STATIONS.indexOf(station)+1).padStart(2,'0');const label=document.createElement('span');label.textContent=station.name;const star=document.createElement('span');star.textContent=this.favorites.has(station.id)?'★':'';star.setAttribute('aria-hidden','true');button.append(slot,label,star);button.addEventListener('click',()=>this.choose(station.id));presets.append(button)}
  this.syncPower();
 }
 syncPower(){this.powerButton.setAttribute('aria-pressed',String(this.on));this.powerButton.textContent=this.on?'⏻ COUPER':'⏻ ALLUMER';this.root.classList.toggle('is-on',this.on)}
 setStatus(message,state){
  this.status.textContent=message;this.state=state;this.root.dataset.state=state;this.audible=this.on&&state==='playing'&&!this.muted&&this.volume>0;
  this.root.querySelector('#radioRetry').hidden=!this.on||!['error','blocked','stalled'].includes(state);
  this.root.querySelector('#radioPlaybackState').textContent=({off:'HORS TENSION',ready:'PRÊTE',loading:'CONNEXION',playing:this.muted?'SOURDINE':'EN LECTURE',embed:'LECTEUR EXTERNE',error:'SIGNAL PERDU',blocked:'ACTION REQUISE',stalled:'MISE EN MÉMOIRE'})[state]||'PRÊTE';
  this.onState({on:this.on,audible:this.audible,station:this.station.name,state});
 }
 choose(id){const next=RADIO_STATIONS.find(s=>s.id===id);if(!next)return false;if(next===this.station)return true;this.stopSource();this.station=next;this.persist();this.renderStation();if(this.on)this.startSource();else this.setStatus('Prête · '+next.name,'ready');return true}
 step(direction){const i=RADIO_STATIONS.indexOf(this.station);this.choose(RADIO_STATIONS[(i+direction+RADIO_STATIONS.length)%RADIO_STATIONS.length].id)}
 favorite(){if(this.favorites.has(this.station.id))this.favorites.delete(this.station.id);else this.favorites.add(this.station.id);this.persist();this.renderStation()}
 setVolume(value){this.volume=clamp(value);if(this.volume>0)this.muted=false;this.audio.volume=this.volume;this.audio.muted=this.muted;this.persist();this.renderStation();this.setStatus(this.status.textContent,this.state)}
 setMuted(value){if(this.station.mode==='embed')return;this.muted=!!value;this.audio.muted=this.muted;this.persist();this.renderStation();this.setStatus(this.status.textContent,this.state)}
 stopSource(){this.token++;clearTimeout(this.loadingTimer);this.audio.pause();this.audio.removeAttribute('src');this.audio.load();this.mount.replaceChildren();this.audible=false;this.playStarted=0;this.renderElapsed()}
 fail(message,state='error'){clearTimeout(this.loadingTimer);this.setStatus(message,state)}
 startSource(){
  const token=++this.token,valid=()=>this.on&&this.token===token;
  if(this.station.mode==='embed'){
   const frame=document.createElement('iframe');frame.title='Lecteur officiel '+this.station.name;frame.src=this.station.url;frame.allow='autoplay; encrypted-media';frame.referrerPolicy='strict-origin-when-cross-origin';frame.loading='eager';frame.addEventListener('error',()=>{if(valid())this.fail('Lecteur indisponible. Réessaie ou ouvre le site officiel.')});
   this.mount.replaceChildren(frame);this.setStatus('Appuie sur ▶ dans le lecteur officiel. Son état audio n’est pas accessible au jeu.','embed');return;
  }
  this.audio=new Audio();this.audio.preload='none';this.audio.volume=this.volume;this.audio.muted=this.muted;
  this.audio.addEventListener('playing',()=>{if(!valid())return;clearTimeout(this.loadingTimer);this.playStarted=Date.now();this.setStatus('Flux reçu · '+this.station.name,'playing')});
  this.audio.addEventListener('waiting',()=>{if(valid()){this.playStarted=0;this.setStatus('Mise en mémoire du flux…','stalled')}});
  this.audio.addEventListener('error',()=>{if(valid())this.fail('Flux indisponible. Réessaie ou choisis une autre station.')});
  this.audio.addEventListener('ended',()=>{if(valid())this.fail('La station a interrompu son flux. Réessaie pour te reconnecter.')});
  this.audio.src=this.station.url;this.audio.load();this.setStatus('Connexion à '+this.station.name+'…','loading');
  this.loadingTimer=setTimeout(()=>{if(valid()&&this.state==='loading')this.fail('La station ne répond pas encore. Réessaie ou ouvre son site officiel.')},16000);
  try{Promise.resolve(this.audio.play()).catch(error=>{if(valid())this.fail(error?.name==='NotAllowedError'?'Le navigateur attend un clic : appuie sur RÉESSAYER pour lancer le son.':'Lecture impossible. Réessaie ou ouvre le site officiel.',error?.name==='NotAllowedError'?'blocked':'error')})}catch{this.fail('Lecture indisponible. Ouvre le site officiel de la station.')}
 }
 renderElapsed(){const seconds=this.playStarted?Math.floor((Date.now()-this.playStarted)/1000):0,target=this.root.querySelector('#radioElapsed');if(target)target.textContent=this.state==='embed'?'WEB':`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}
 retry(){if(!this.on){this.toggle();return}this.stopSource();this.startSource()}
 toggle(){this.on=!this.on;this.syncPower();if(this.on)this.startSource();else{this.stopSource();this.setStatus('Radio éteinte. Les effets du jeu restent disponibles.','off')}return this.on}
 shutdown(){this.on=false;this.stopSource();this.syncPower();this.setStatus('Radio éteinte.','off')}
 inspect(){return{on:this.on,audible:this.audible,state:this.state,station:this.station.id,mode:this.station.mode,volume:this.volume,muted:this.muted,favorites:[...this.favorites],iframeCount:this.mount.querySelectorAll('iframe').length}}
}
