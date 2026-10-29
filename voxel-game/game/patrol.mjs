import {truckRoute} from './roads.mjs';
import {OUTPOSTS} from './construction.mjs';

// La progression de patrouille reste locale, distincte du score et des blocs réseau.
export const SECTORS=[
 {id:'flag',name:'POSTE FLAG',xp:0,x:6,z:-43},
 {id:'nevada',name:'NEVADA · RELAIS LIÈGE',xp:120,x:76,z:-23},
 {id:'forest',name:'FORÊT · LIAISON PARIS',xp:300,x:-76,z:-23}
];
export const GARAGE={x:8,z:17};
export const EQUIPMENT=[
 {id:'turbo',name:'CONDENSATEUR TURBO',base:110,description:'Chaque niveau : saut +0,8 et recharge du Turbo accélérée de 18 %.'},
 {id:'scanner',name:'ANALYSEUR D’APRIL',base:90,description:'Chaque niveau : portée +12 m, recharge −1 s et récupération +2 énergie/s.'},
 {id:'traction',name:'PNEUS MOLÉCULAIRES',base:100,description:'Chaque niveau : réponse accélérateur +0,35 et seuil de dérapage +1,5 m/s.'}
];
export const MISSION_TYPES=[
 {id:'rescue',name:'ASSISTANCE ROUTIÈRE',speaker:'BONNIE',description:'Trouve le véhicule en panne, immobilise KITT et répare à pied.',credits:80,xp:65},
 {id:'signal',name:'LES BROUILLEURS DE KARR',speaker:'APRIL',description:'Utilise le scanner de KITT pour révéler trois indices et coupe le brouillage.',credits:100,xp:75},
 {id:'trial',name:'HOMOLOGATION TURBO',speaker:'MICHAEL',description:'Passe cinq balises dans l’ordre avec KITT. La troisième exige un vrai Turbo Boost.',credits:110,xp:85},
 {id:'build',name:'AVANT-POSTE DE LA FONDATION',speaker:'DEVON',description:'Construis le plan de 62 blocs : sol en pierre, quatre piliers métal et toit en bois.',credits:140,xp:100}
];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const finite=(value,fallback=0)=>Number.isFinite(value)?Math.max(0,value):fallback;
export function contracts(){return SECTORS.flatMap((sector,tier)=>MISSION_TYPES.map(type=>({...type,id:type.id+'-'+sector.id,kind:type.id,sector:sector.id,sectorName:sector.name,requiredXP:sector.xp,tier,credits:type.credits+tier*35,xp:type.xp+tier*20})))}
export function rankFor(xp){return xp>=600?'CHEF DE PATROUILLE':xp>=300?'AGENT CONFIRMÉ':xp>=120?'AGENT FLAG':'CADET FLAG'}
function checkpoints(sector){
 if(sector==='flag')return[27,-10,-50,-100,-150].map(d=>{const p=truckRoute(d);return{x:p.x,z:p.z,dx:-p.dx,dz:-p.dz}});
 return(sector==='nevada'?[20,42,64,86,108]:[-12,-34,-56,-78,-100]).map(x=>({x,z:-28,dx:sector==='nevada'?1:-1,dz:0}));
}
export class PatrolCampaign{
 constructor(saved={}){
  this.state={credits:Math.floor(finite(saved.credits)),xp:Math.floor(finite(saved.xp)),completed:Math.floor(finite(saved.completed)),history:Array.isArray(saved.history)?saved.history.slice(-20):[],upgrades:{},active:null};
  this.state.outposts=Array.isArray(saved.outposts)?saved.outposts.filter(s=>Object.hasOwn(OUTPOSTS,s)):[];
  this.events=[];this.energy=100;this.scanCooldown=0;this.dirty=false;this.lastReport=saved.lastReport||null;
  for(const id of ['turbo','scanner','traction'])this.state.upgrades[id]=Math.min(3,Math.floor(finite(saved.upgrades?.[id])));
  const active=saved.active;
  if(active&&contracts().some(c=>c.id===active.id)&&['travel','work','repair','return'].includes(active.stage)&&Number.isFinite(active.elapsed)&&active.elapsed>=0&&Array.isArray(active.found)&&active.found.every(Number.isInteger)&&Number.isInteger(active.index)&&active.index>=0&&active.index<=5){this.state.active={...active,found:[...new Set(active.found)].filter(i=>i>=0&&i<3),revealed:Array.isArray(active.revealed)?active.revealed.filter(i=>Number.isInteger(i)&&i>=0&&i<3):[],repair:Math.min(4,finite(active.repair)),paid:false}}
 }
 emit(type,text,extra={}){this.events.push({type,text,...extra});this.dirty=true}
 get active(){return this.state.active}
 get contract(){return contracts().find(c=>c.id===this.active?.id)||null}
 site(){const c=this.contract;if(!c)return null;if(c.kind==='build')return OUTPOSTS[c.sector];const s=SECTORS.find(s=>s.id===c.sector);return{x:s.x,z:s.z+((this.active.variant||0)-1)*3}}
 clues(){const s=this.site();return s?[{x:s.x,z:s.z-6},{x:s.x+5,z:s.z+3},{x:s.x-4,z:s.z+4}]:[]}
 accept(id){
  if(this.active)return{ok:false,text:'Termine ou annule l’intervention en cours avant d’en choisir une autre.'};
  const c=contracts().find(c=>c.id===id);if(!c)return{ok:false,text:'Intervention inconnue.'};
  if(this.state.xp<c.requiredXP)return{ok:false,text:`Secteur disponible à ${c.requiredXP} points de réputation FLAG.`};
  if(c.kind==='build'&&this.state.outposts.includes(c.sector))return{ok:false,text:'Cet avant-poste est déjà homologué. Les autres interventions restent rejouables.'};
  this.state.active={id,stage:'travel',index:0,found:[],revealed:[],repair:0,elapsed:0,variant:this.state.completed%3,paid:false};
  this.emit('start',c.description,{speaker:c.speaker});return{ok:true,text:c.description};
 }
 cancel(){if(!this.active)return false;this.state.active=null;this.emit('cancel','Intervention annulée. Aucun crédit débité ou versé.');return true}
 price(id){const item=EQUIPMENT.find(i=>i.id===id);return item?item.base*(1+this.state.upgrades[id]):Infinity}
 purchase(id){const item=EQUIPMENT.find(i=>i.id===id);if(!item)return{ok:false,text:'Équipement inconnu.'};const level=this.state.upgrades[id],cost=this.price(id);if(level>=3)return{ok:false,text:'Cet équipement est déjà au niveau maximal.'};if(this.state.credits<cost)return{ok:false,text:`Il manque ${cost-this.state.credits} crédits. Termine une intervention FLAG.`};this.state.credits-=cost;this.state.upgrades[id]++;this.emit('upgrade',`${item.name} installé : niveau ${level+1}/3.`,{speaker:'BONNIE'});return{ok:true,text:item.description}}
 target(){const a=this.active,c=this.contract;if(!a||!c)return null;if(a.stage==='return')return{...GARAGE,label:'RAPPORT · ATELIER FLAG'};if(c.kind==='trial')return{...checkpoints(c.sector)[Math.min(a.index,4)],label:a.index===2?`TURBO BOOST - BALISE 3/5`:`BALISE ${a.index+1}/5`};if(c.kind==='signal'){const i=[0,1,2].find(i=>!a.found.includes(i));return{...this.clues()[i??0],label:`BROUILLAGE · ${a.found.length}/3`}}return{...this.site(),label:'VÉHICULE EN PANNE'}}
 tick(dt,player){
  const step=Math.max(0,Math.min(.1,dt));this.scanCooldown=Math.max(0,this.scanCooldown-step);this.energy=Math.min(100,this.energy+step*(6+this.state.upgrades.scanner*2));
  const a=this.active,c=this.contract;if(!a||!c)return;if(a.stage!=='return')a.elapsed+=step;
  if(c.kind==='rescue'){
   if(a.stage==='travel'&&player.driving&&distance(player,this.site())<9&&Math.abs(player.speed)<2){a.stage='work';this.emit('stage','KITT est immobilisé. Descends, approche le capot et utilise le véhicule pour lancer le diagnostic.',{speaker:'BONNIE'})}
   if(a.stage==='repair'){if(player.driving||distance(player,this.site())>3.3){a.stage='work';a.repair=0;this.emit('stage','Diagnostic interrompu : reste à pied près du véhicule.')}else{a.repair+=step;if(a.repair>=4)this.ready('Circuit réparé. Retourne au camion atelier FLAG pour remettre le rapport.')}}
  }
  if(c.kind==='trial'&&a.stage!=='return'){
   const limit=120-c.tier*15;if(a.elapsed>limit){this.state.active=null;this.emit('failure','Chrono dépassé. Reprends l’homologation depuis le tableau FLAG.');return}
   const p=checkpoints(c.sector)[a.index];if(player.driving&&Math.abs(player.speed)>1&&distance(player,p)<4&&(a.index!==2||player.airborne===true)){a.index++;this.emit('checkpoint',`Balise ${a.index}/5 validée.`);if(a.index===5)this.ready('Homologation réussie. Reviens à l’atelier pour recevoir ta prime.')}
  }
 }
 ready(text){this.active.stage='return';this.emit('stage',text,{speaker:'DEVON'})}
 validateBuild(progress){if(this.contract?.kind!=='build'||this.active.stage==='return')return false;if(progress.total===62&&progress.done===62){this.ready('Sol, piliers et toit conformes. Reviens au camion atelier pour homologuer l’avant-poste.');return true}return false}
 interact(player){
  const a=this.active,c=this.contract;if(!a||!c||player.driving)return false;
  if(a.stage==='return'&&distance(player,GARAGE)<4.7){if(player.driving){this.emit('message','Descends de KITT pour transmettre ton rapport.');return true}this.finish();return true}
  if(c.kind==='rescue'&&distance(player,this.site())<3.3){
   if(a.stage==='travel')this.emit('message','Amène KITT à moins de 9 mètres, arrête-le, puis descends pour réparer.');
   else if(a.stage==='work'&&!player.driving){a.stage='repair';a.repair=0;this.emit('stage','Diagnostic de Bonnie lancé. Reste près du capot pendant quatre secondes.',{speaker:'BONNIE'})}
   return true;
  }
  if(c.kind==='signal'&&a.stage!=='return'&&!player.driving){const i=this.clues().findIndex((p,i)=>distance(player,p)<3&&!a.found.includes(i));if(i<0)return false;if(!a.revealed.includes(i)){this.emit('message','Signal masqué : utilise d’abord le scanner de KITT.');return true}a.found.push(i);this.emit('checkpoint',`Brouilleur neutralisé : ${a.found.length}/3.`,{speaker:'APRIL'});if(a.found.length===3)this.ready('Les trois preuves sont récupérées. Rapporte-les à l’atelier FLAG.');return true}
  return false;
 }
 scan(player){
  if(!player.kittVisible||(!player.driving&&distance(player,player.car)>14))return{ok:false,text:'Appelle KITT et reste à moins de 14 mètres pour utiliser son scanner.'};
  if(this.scanCooldown>0)return{ok:false,text:`Scanner en recharge : ${Math.ceil(this.scanCooldown)} s.`};
  if(this.energy<25)return{ok:false,text:'Énergie scanner insuffisante. Laisse le condensateur se recharger.'};
  this.energy-=25;this.scanCooldown=Math.max(2,5-this.state.upgrades.scanner);const radius=26+this.state.upgrades.scanner*12;let found=0;
  if(this.contract?.kind==='signal'&&this.active.stage!=='return')this.clues().forEach((p,i)=>{if(distance(player,p)<=radius&&!this.active.revealed.includes(i)){this.active.revealed.push(i);found++}});
  this.emit('scan',found?`${found} signature(s) de KARR révélée(s). Approche chaque balise et utilise-la à pied.`:'Aucune nouvelle signature dans le rayon du scanner.',{radius,speaker:'KITT'});return{ok:true,radius,found};
 }
 finish(){const a=this.active,c=this.contract;if(!a||!c||a.paid||a.stage!=='return')return false;a.paid=true;const bonus=c.kind==='trial'?Math.max(0,Math.floor((120-c.tier*15-a.elapsed)/5))*2:0,credits=c.credits+bonus;this.state.credits+=credits;this.state.xp+=c.xp;this.state.completed++;if(c.kind==='build')this.state.outposts.push(c.sector);this.lastReport={id:c.id,name:c.name,credits,xp:c.xp,time:Math.round(a.elapsed),number:this.state.completed};this.state.history.push(this.lastReport);this.state.history=this.state.history.slice(-20);this.state.active=null;this.emit('reward',`Rapport validé : +${credits} crédits et +${c.xp} réputation FLAG.`,{...this.lastReport,speaker:'DEVON'});return true}
 snapshot(){return{...this.state,active:this.active?structuredClone(this.active):null,lastReport:this.lastReport}}
}
