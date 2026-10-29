import * as THREE from 'three';
import {PatrolCampaign,SECTORS,EQUIPMENT,GARAGE,contracts,rankFor} from './patrol.mjs';
import {blueprintFor,blueprintProgress} from './construction.mjs';
import {heightAt} from './world.mjs?v=flag-patrol-20261029';

const near=(a,b,r)=>Math.hypot(a.x-b.x,a.z-b.z)<r;
const BOARD={x:-14.5,z:-8.4};
const $=id=>document.getElementById(id);
function plaque(text,color='#70e5ed'){
 const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#08121bea';ctx.fillRect(0,0,512,96);ctx.strokeStyle=color;ctx.lineWidth=4;ctx.strokeRect(2,2,508,92);ctx.fillStyle=color;ctx.font='bold 26px monospace';ctx.textAlign='center';ctx.fillText(text,256,58);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:true}));label.scale.set(3.8,.72,1);return label;
}
function box(group,w,h,d,x,y,z,material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);group.add(mesh);return mesh}

// Contrôleur séparé du moteur FPS : les interactions passent par les vraies
// positions, les vrais blocs et les mêmes callbacks réseau que le joueur.
export class PatrolDirector{
 constructor(api){
  this.api=api;let saved={};try{saved=JSON.parse(localStorage.getItem('kitt.patrol.v1')||'{}')||{}}catch{}
  this.campaign=new PatrolCampaign(saved);this.visual=new THREE.Group();api.scene.add(this.visual);this.key='';this.panel=null;this.sector='flag';this.uiAt=0;this.savedAt=0;this.scanAge=-1;this.scanRadius=0;this.building=false;this.buildProgress=null;
  this.pulse=new THREE.Mesh(new THREE.RingGeometry(.985,1,80),new THREE.MeshBasicMaterial({color:0x5ee8ff,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));this.pulse.rotation.x=-Math.PI/2;this.pulse.visible=false;api.scene.add(this.pulse);
  this.tracker=document.createElement('aside');this.tracker.id='patrolTracker';this.tracker.hidden=true;this.tracker.innerHTML='<button id="patrolTrackerDetails" type="button"><span id="patrolArrow" aria-hidden="true">↑</span><span><small id="patrolTrackerType"></small><strong id="patrolTrackerGoal"></strong><span id="patrolTrackerAction"></span></span><b id="patrolTrackerDistance"></b></button><div class="patrol-energy"><span id="patrolEnergyText">SCANNER 100</span><i><em id="patrolEnergyFill"></em></i><button id="patrolScan" type="button">SCANNER</button></div>';
  $('hud').append(this.tracker);$('patrolTrackerDetails').onclick=()=>this.open('dispatch');$('patrolScan').onclick=()=>this.scan();
  this.modal=document.createElement('section');this.modal.id='patrolPanel';this.modal.className='patrol-panel hidden';this.modal.setAttribute('role','dialog');this.modal.setAttribute('aria-modal','true');this.modal.setAttribute('aria-labelledby','patrolPanelTitle');this.modal.innerHTML='<div class="patrol-dialog"><header><div><small>FONDATION FLAG · RÉSEAU D’INTERVENTION</small><h2 id="patrolPanelTitle">CENTRE DE PATROUILLE</h2></div><button id="patrolClose" type="button">RETOUR AU JEU</button></header><nav aria-label="Services FLAG"><button data-patrol-tab="dispatch">INTERVENTIONS</button><button data-patrol-tab="garage">GARAGE BONNIE</button><button data-patrol-tab="report">CARNET DE SERVICE</button></nav><div id="patrolBalance"></div><p id="patrolNotice" role="status"></p><div id="patrolPanelContent"></div><footer>Réputation, crédits et interventions sauvegardés sur cet appareil. En salle : les joueurs et constructions sont partagés ; tes contrats restent personnels.</footer></div>';
  document.body.append(this.modal);$('patrolClose').onclick=()=>this.close();this.modal.querySelectorAll('[data-patrol-tab]').forEach(b=>b.onclick=()=>this.open(b.dataset.patrolTab));
  this.modal.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const items=[...this.modal.querySelectorAll('button:not(:disabled),a,input')].filter(el=>el.getClientRects().length);if(!items.length)return;const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}});
  const board=plaque('INTERVENTIONS FLAG');board.position.set(BOARD.x,10.5,-6.08);board.scale.set(2.65,.5,1);api.scene.add(board);
  const garageLabel=plaque('GARAGE BONNIE');garageLabel.position.set(11,11.1,17);garageLabel.scale.set(2.6,.5,1);api.scene.add(garageLabel);
 }
 save(){try{localStorage.setItem('kitt.patrol.v1',JSON.stringify(this.campaign.snapshot()))}catch{}this.campaign.dirty=false}
 effects(){const u=this.campaign.state.upgrades;return{turboHeight:u.turbo*.8,turboCooldown:4/(1+u.turbo*.18),acceleration:1.6+u.traction*.35,skidThreshold:9+u.traction*1.5}}
 player(){return this.api.state()}
 open(tab='dispatch'){
  if(!this.panel){this.api.pausePanel(true);this.modal.classList.remove('hidden')}
  this.panel=tab;this.renderPanel();$('patrolClose').focus({preventScroll:true});
 }
 close(){if(!this.panel)return false;this.panel=null;this.modal.classList.add('hidden');this.api.pausePanel(false);return true}
 renderPanel(){
  const c=this.campaign,s=c.state,host=$('patrolPanelContent');$('patrolPanelTitle').textContent=this.panel==='garage'?'L’ATELIER DE BONNIE':this.panel==='report'?'CARNET DE SERVICE':'CENTRE DE PATROUILLE';
  $('patrolBalance').textContent=`${s.credits} CRÉDITS · ${s.xp} RÉPUTATION · ${rankFor(s.xp)} · ${s.completed} INTERVENTION(S)`;
  this.modal.querySelectorAll('[data-patrol-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.patrolTab===this.panel)));host.replaceChildren();
  if(this.panel==='garage'){
   const intro=document.createElement('p');intro.className='patrol-intro';intro.textContent='Bonnie installe trois équipements complémentaires. Les crédits viennent des rapports validés au camion FLAG. Les niveaux sont conservés après une recharge du jeu.';host.append(intro);
   const grid=document.createElement('div');grid.className='patrol-card-grid';host.append(grid);
   for(const item of EQUIPMENT){const level=s.upgrades[item.id],card=document.createElement('article');card.className='patrol-card';card.innerHTML=`<small>ÉQUIPEMENT ${level}/3</small><h3>${item.name}</h3><p>${item.description}</p><div class="patrol-levels">${[1,2,3].map(i=>`<i class="${i<=level?'installed':''}"></i>`).join('')}</div>`;const button=document.createElement('button');button.dataset.buy=item.id;button.textContent=level>=3?'INSTALLATION MAXIMALE':`INSTALLER · ${c.price(item.id)} CRÉDITS`;button.disabled=level>=3||s.credits<c.price(item.id);button.onclick=()=>{const r=c.purchase(item.id);$('patrolNotice').textContent=r.text;this.drain();this.save();this.renderPanel()};card.append(button);grid.append(card)}
   return;
  }
  if(this.panel==='report'){
   const intro=document.createElement('p');intro.className='patrol-intro';intro.textContent='Une intervention se termine en revenant à pied au camion atelier. Les performances et les primes ci-dessous proviennent de tes rapports validés.';host.append(intro);
   if(!s.history.length){const p=document.createElement('p');p.textContent='Aucun rapport validé. Le poste FLAG propose quatre types d’intervention dès le début.';host.append(p)}
   for(const row of [...s.history].reverse()){const item=document.createElement('article');item.className='patrol-report';item.textContent=`#${row.number} · ${row.name} · +${row.credits} crédits · +${row.xp} réputation · ${row.time} s`;host.append(item)}return;
  }
  if(c.active){const active=document.createElement('article'),brief=this.briefing();active.className='patrol-current';const title=document.createElement('h3');title.textContent=brief.title;const text=document.createElement('p');text.textContent=brief.summary;const list=document.createElement('ol');for(const step of brief.steps){const li=document.createElement('li');li.textContent=step;list.append(li)}active.append(title,text,list);const resume=document.createElement('button');resume.id='patrolContinue';resume.textContent='POURSUIVRE L’INTERVENTION';resume.onclick=()=>this.close();const cancel=document.createElement('button');cancel.id='patrolCancel';cancel.textContent='ANNULER SANS PRIME';cancel.onclick=()=>{c.cancel();this.save();this.drain();this.renderPanel()};active.append(resume,cancel);
   if(c.contract.kind==='build'&&c.active.stage!=='return'){const build=document.createElement('button');build.id='patrolBuild';build.textContent='POSER LA PROCHAINE COUCHE · MATÉRIEL FLAG';build.disabled=this.building||!near(this.player(),c.site(),6);build.onclick=()=>this.buildLayer();active.append(build)}host.append(active);
  }
  const intro=document.createElement('p');intro.className='patrol-intro';intro.textContent='Choisis une mission, rejoins le repère cyan, accomplis l’intervention et remets le rapport à l’atelier. Chaque secteur propose un dépannage, une enquête, une homologation et un avant-poste.';host.append(intro);
  const tabs=document.createElement('div');tabs.className='patrol-sector-tabs';for(const sector of SECTORS){const button=document.createElement('button');button.textContent=sector.name+(s.xp<sector.xp?` · ${sector.xp} RÉP.`:'');button.disabled=s.xp<sector.xp;button.setAttribute('aria-pressed',String(this.sector===sector.id));button.onclick=()=>{this.sector=sector.id;this.renderPanel()};tabs.append(button)}host.append(tabs);
  const grid=document.createElement('div');grid.className='patrol-card-grid';host.append(grid);
  for(const item of contracts().filter(i=>i.sector===this.sector)){const done=item.kind==='build'&&s.outposts.includes(item.sector),card=document.createElement('article');card.className='patrol-card';card.innerHTML=`<small>${item.kind==='trial'?(120-item.tier*15)+' SECONDES':item.kind==='build'?'STRUCTURE VÉRIFIÉE · 62 BLOCS':'REJOUABLE · VARIANTES DE POSITION'}</small><h3>${item.name}</h3><p>${item.description}</p><strong>+${item.credits} CRÉDITS · +${item.xp} RÉPUTATION</strong>`;const button=document.createElement('button');button.dataset.contract=item.id;button.textContent=done?'AVANT-POSTE HOMOLOGUÉ':'ACCEPTER L’INTERVENTION';button.disabled=!!c.active||done||s.xp<item.requiredXP;button.onclick=()=>{const result=c.accept(item.id);$('patrolNotice').textContent=result.text;if(result.ok){this.key='';this.save();this.drain();this.close()}else this.renderPanel()};card.append(button);grid.append(card)}
 }
 briefing(){
  const c=this.campaign,a=c.active,item=c.contract;if(!a||!item)return null;const use=this.api.key('drive'),scan=this.api.key('scan');
  if(a.stage==='return')return{title:'RAPPORT FLAG · PRIME À RÉCUPÉRER',summary:'L’intervention est réussie. Ta prime attend la validation de Devon au camion atelier.',steps:['Reviens au camion FLAG : repère cyan sur le radar.','Descends de KITT et approche le camion.','Utilise '+use+' pour transmettre le rapport.'],result:`Prime : ${item.credits} crédits minimum et ${item.xp} réputation.`,control:'Le garage Bonnie permet de dépenser tes crédits.'};
  if(item.kind==='rescue')return{title:'DÉPANNAGE · '+item.sectorName,summary:a.stage==='repair'?`Diagnostic en cours : ${Math.min(4,a.repair).toFixed(1)} / 4 secondes.`:a.stage==='work'?'KITT est arrêté. Interviens à pied sur le véhicule signalé.':'Un pilote est immobilisé. Rejoins le véhicule signalé avec KITT.',steps:['Appelle KITT, monte et rejoins le repère cyan.','Arrête KITT à moins de 9 mètres du véhicule.','Descends et utilise '+use+' près du capot ; reste quatre secondes.','Retourne à l’atelier pour recevoir la prime.'],result:`+${item.credits} crédits · +${item.xp} réputation`,control:'Un diagnostic interrompu doit être recommencé.'};
  if(item.kind==='signal')return{title:'ENQUÊTE KARR · '+a.found.length+'/3',summary:'Trois brouilleurs masquent les communications d’April. Le scanner révèle leur signature.',steps:['Rejoins le secteur avec KITT.','Utilise '+scan+' ou SCANNER pour lancer une impulsion.','Approche les balises révélées et utilise '+use+' à pied.','Neutralise les trois, puis rapporte les preuves au camion FLAG.'],result:`+${item.credits} crédits · +${item.xp} réputation`,control:`Scanner : ${Math.round(c.energy)}/100 · portée ${26+c.state.upgrades.scanner*12} m · coût 25 énergie.`};
  if(item.kind==='build'){const p=this.progress();return{title:'AVANT-POSTE FLAG · '+p.done+'/'+p.total,summary:'Un abri utile doit avoir un sol, quatre piliers et un toit conformes au plan.',steps:['Rejoins le chantier cyan à pied.','Pose les blocs selon les volumes fantômes ou utilise '+use+' près du chantier.','Le matériel de chantier FLAG permet de poser une couche à la fois.','Sol pierre, piliers métal, toit bois : le plan est vérifié bloc par bloc.'],result:`+${item.credits} crédits · +${item.xp} réputation · avant-poste permanent`,control:'Reste hors du cadre pendant la pose automatique pour éviter de te coincer.'}}
  return{title:'HOMOLOGATION · BALISE '+(a.index+1)+'/5',summary:`Il reste ${Math.max(0,Math.ceil(120-item.tier*15-a.elapsed))} secondes.`,steps:['Monte dans KITT et rejoins le portique cyan.','Passe les cinq portiques dans l’ordre, au volant et en mouvement.','Relâche l’accélérateur avant les virages. À la troisième balise, saute avec le Turbo Boost.','Retourne au camion FLAG pour valider ta prime.'],result:`+${item.credits} crédits minimum · bonus de rapidité`,control:'Turbo Boost : '+this.api.key('jump')+' · chrono suspendu en pause.'};
 }
 progress(){return this.campaign.contract?.kind==='build'?blueprintProgress(this.campaign.contract.sector,(x,y,z)=>this.api.world.get(x,y,z)):{total:0,done:0,missing:[]}}
 async buildLayer(){
  const c=this.campaign;if(this.building||c.contract?.kind!=='build'||c.active.stage==='return')return;
  if(!near(this.player(),c.site(),6)){this.api.tell('Approche-toi à moins de 6 mètres du chantier.','DEVON');return}
  const missing=this.progress().missing;if(!missing.length)return;const layer=missing[0].y,cells=missing.filter(b=>b.y===layer),p=this.player();
  if(cells.some(b=>Math.abs(b.x+.5-p.x)<.8&&Math.abs(b.z+.5-p.z)<.8&&b.y+1>p.y&&b.y<p.y+1.72)){this.api.tell('Sors du cadre du chantier avant de poser cette couche.','DEVON');return}
  this.building=true;this.close();const id=c.active.id;
  try{for(const block of cells){if(c.active?.id!==id||this.player().paused||!near(this.player(),c.site(),7))break;if(!await this.api.edit(block))break;this.api.sound.play('place');await new Promise(resolve=>setTimeout(resolve,135))}this.api.tell(`Couche posée. Plan conforme : ${this.progress().done}/62 blocs.`,'DEVON')}finally{this.building=false;this.key='';this.save()}
 }
 interact(){
  const c=this.campaign,p=this.player();
  if(c.contract?.kind==='build'&&c.active.stage==='return'&&near(p,GARAGE,4.7)&&this.progress().done!==62){c.active.stage='travel';c.emit('message','Le plan a été modifié. Rétablis les pièces manquantes avant l’homologation.');this.drain();return true}
  if(c.interact(p)){this.drain();this.save();return true}
  if(c.contract?.kind==='build'&&c.active.stage!=='return'&&near(p,c.site(),6)){this.open('dispatch');return true}
  if(near(p,BOARD,2.2)&&!p.driving){this.open('dispatch');return true}
  if(near(p,{x:11,z:17},2.5)&&!p.driving&&!this.api.legacyWorkshopPending()){this.open('garage');return true}
  return false;
 }
 hint(){const c=this.campaign,p=this.player();if(c.active&&(c.active.stage==='return'||c.contract.kind!=='trial')&&near(p,c.target(),c.active.stage==='return'?4.7:3))return this.api.key('drive')+' · '+(c.active.stage==='return'?'TRANSMETTRE LE RAPPORT':c.contract.kind==='build'?'OUVRIR LE PLAN':c.contract.kind==='signal'?'NEUTRALISER LE SIGNAL':'DIAGNOSTIC BONNIE');if(near(p,BOARD,2.2))return this.api.key('drive')+' · TABLEAU DES INTERVENTIONS FLAG';return null}
 scan(){const result=this.campaign.scan(this.player());if(!result.ok)this.api.tell(result.text,'KITT');this.drain();this.save();return result}
 drain(){for(const e of this.campaign.events.splice(0)){this.api.tell(e.text,e.speaker||'KITT');this.api.sound.play(e.type==='reward'?'reward':e.type==='upgrade'?'upgrade':e.type==='scan'?'scanner':e.type==='failure'?'demon':'click');if(e.type==='scan'){const p=this.player();this.pulse.position.set(p.x,p.y+.08,p.z);this.scanAge=0;this.scanRadius=e.radius;this.pulse.visible=true;this.key=''}if(e.type==='reward'){this.api.score(e.xp);this.showReward(e)}if(['start','cancel','stage','checkpoint'].includes(e.type))this.key=''}if(this.campaign.dirty)this.save()}
 showReward(e){const overlay=document.createElement('div');overlay.className='patrol-reward';overlay.setAttribute('role','status');const title=document.createElement('strong');title.textContent='INTERVENTION VALIDÉE';const value=document.createElement('b');value.textContent=`+${e.credits} CRÉDITS`;const text=document.createElement('span');text.textContent=`+${e.xp} réputation · ${rankFor(this.campaign.state.xp)}`;overlay.append(title,value,text);$('hud').append(overlay);setTimeout(()=>overlay.remove(),5200)}
 clearVisual(){this.visual.traverse(o=>{if(o.isMesh||o.isLineSegments){o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose()}}if(o.isSprite){o.material.map?.dispose();o.material.dispose()}});this.visual.clear();this.hood=null;this.goalRing=null}
 rebuild(){
  this.clearVisual();const c=this.campaign,a=c.active,item=c.contract;if(!a||!item)return;const target=c.target(),ground=heightAt(target.x,target.z)+1,cyan=new THREE.MeshBasicMaterial({color:0x69eced,transparent:true,opacity:.9}),ring=new THREE.Mesh(new THREE.TorusGeometry(item.kind==='trial'&&a.stage!=='return'?2.6:1.15,.055,6,40),cyan);
  ring.position.set(target.x,ground+(item.kind==='trial'&&a.stage!=='return'?2.6:.08),target.z);if(item.kind!=='trial'||a.stage==='return')ring.rotation.x=-Math.PI/2;else ring.rotation.y=Math.atan2(target.dx||0,target.dz??1);this.visual.add(ring);this.goalRing=ring;const label=plaque(target.label);label.position.set(target.x,ground+4,target.z);this.visual.add(label);
  if(item.kind==='rescue'&&a.stage!=='return'){
   const site=c.site(),group=new THREE.Group();group.position.set(site.x,heightAt(site.x,site.z)+1,site.z);const body=new THREE.MeshStandardMaterial({color:0xdf9a32,roughness:.48,metalness:.35}),dark=new THREE.MeshStandardMaterial({color:0x1b2230,roughness:.8}),glass=new THREE.MeshStandardMaterial({color:0x487d88,roughness:.2,metalness:.3});box(group,1.65,.45,3.4,0,.64,0,body);box(group,1.45,.65,1.6,0,1.13,.25,glass);box(group,1.5,.12,1.7,0,1.51,.25,body);this.hood=box(group,1.45,.09,1.1,0,.91,-1.1,body);for(const x of [-.85,.85])for(const z of [-1.05,1.05]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.2,10),dark);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.32,z);group.add(wheel)}for(const x of [-.55,.55])box(group,.24,.12,.04,x,.75,-1.73,new THREE.MeshBasicMaterial({color:0xffb43a}));this.visual.add(group);
  }
  if(item.kind==='signal'&&a.stage!=='return')c.clues().forEach((p,i)=>{if(!a.revealed.includes(i)||a.found.includes(i))return;const y=heightAt(p.x,p.z)+1,material=new THREE.MeshStandardMaterial({color:0x281b36,emissive:0xb533b4,emissiveIntensity:.8});box(this.visual,.65,.85,.65,p.x,y+.43,p.z,material);box(this.visual,.08,1.7,.08,p.x,y+1.2,p.z,material);const text=plaque('SIGNATURE KARR '+(i+1),'#ff90e0');text.position.set(p.x,y+2.6,p.z);this.visual.add(text)});
  if(item.kind==='build'&&a.stage!=='return'){const missing=this.progress().missing,geometry=new THREE.BoxGeometry(.96,.96,.96),material=new THREE.MeshBasicMaterial({color:0x64e3ff,transparent:true,opacity:.16,depthWrite:false}),ghost=new THREE.InstancedMesh(geometry,material,missing.length),matrix=new THREE.Matrix4();missing.forEach((b,i)=>{matrix.makeTranslation(b.x+.5,b.y+.5,b.z+.5);ghost.setMatrixAt(i,matrix)});ghost.instanceMatrix.needsUpdate=true;this.visual.add(ghost)}
 }
 tick(dt,time,active){
  const p=this.player(),c=this.campaign;if(active){c.tick(dt,p);if(c.contract?.kind==='build'&&time-this.uiAt>.2){this.buildProgress=this.progress();c.validateBuild(this.buildProgress)}this.drain()}
  const key=JSON.stringify([c.active?.id,c.active?.stage,c.active?.index,c.active?.revealed,c.active?.found,this.buildProgress?.done]);if(key!==this.key){this.key=key;this.rebuild()}
  if(this.hood)this.hood.rotation.x=c.active?.stage==='repair'?-.75:0;if(this.goalRing)this.goalRing.material.opacity=.75+Math.sin(time*3)*.25;
  if(this.scanAge>=0&&active){this.scanAge+=dt;const ratio=Math.min(1,this.scanAge/1.3);this.pulse.scale.setScalar(Math.max(.1,this.scanRadius*ratio));this.pulse.material.opacity=(1-ratio)*.8;if(ratio===1){this.pulse.visible=false;this.scanAge=-1}}
  this.tracker.hidden=!c.active;document.body.classList.toggle('is-patrol-active',!!c.active);
  if(time-this.uiAt>.2){this.uiAt=time;if(c.active){const goal=c.target(),brief=this.briefing();$('patrolTrackerType').textContent=brief.title;$('patrolTrackerGoal').textContent=goal.label;$('patrolTrackerAction').textContent=c.active.stage==='repair'?`Diagnostic ${Math.round(c.active.repair/4*100)} %`:c.contract.kind==='trial'&&c.active.stage!=='return'?`${Math.max(0,Math.ceil(120-c.contract.tier*15-c.active.elapsed))} s · au volant`:'DÉTAILS ET CONSIGNES';$('patrolTrackerDistance').textContent=Math.round(Math.hypot(goal.x-p.x,goal.z-p.z))+' m';$('patrolArrow').style.transform=`rotate(${(Math.atan2(-(goal.x-p.x),-(goal.z-p.z))-p.yaw)*180/Math.PI}deg)`;$('patrolEnergyText').textContent=`SCANNER ${Math.round(c.energy)}/100`;$('patrolEnergyFill').style.width=c.energy+'%';$('patrolScan').textContent=this.api.key('scan')+' · SCANNER';$('patrolScan').disabled=c.energy<25||c.scanCooldown>0}if(this.panel&&c.active?.stage==='repair')this.renderPanel()}
  if(active&&time-this.savedAt>2){this.savedAt=time;this.save()}
 }
 collides(x,y,z,w,h){if(this.campaign.contract?.kind!=='rescue'||this.campaign.active.stage==='return')return false;const p=this.campaign.site(),base=heightAt(p.x,p.z)+1;return y+h>base&&y<base+1.6&&Math.abs(x-p.x)<w+.88&&Math.abs(z-p.z)<w+1.7}
 radar(){const p=this.campaign.target();return p?{...p,color:'#69edf2',label:'OBJECTIF'}:null}
 inspect(){return{...this.campaign.snapshot(),energy:this.campaign.energy,scanCooldown:this.campaign.scanCooldown,target:this.campaign.target(),panel:this.panel,building:this.building,blueprint:this.campaign.contract?.kind==='build'?{done:this.progress().done,total:62}:null,effects:this.effects()}}
}
