import * as THREE from 'three';
import {heightAt} from './world.mjs?v=flag-patrol-20261029';
const mat=(color,emissive=0)=>new THREE.MeshStandardMaterial({color,roughness:.92,emissive,emissiveIntensity:1.8});
function box(g,w,h,d,x,y,z,m){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;g.add(o);return o}
export const BESTIARY={
 sheep:{name:'Mouton FLAG',icon:'🐑',text:'Un petit troupeau curieux. E pour les caresser.'},
 ghost:{name:'Spectre des néons',icon:'👻',text:'Un spectre hostile : deux impacts le font éclater en cubes lumineux.'},
 pumpkin:{name:'Garde-citrouille',icon:'🎃',text:'Un garde-citrouille hostile : deux impacts le font éclater en cubes.'},
 bat:{name:'Chauve-souris',icon:'🦇',text:'Une chauve-souris hostile : deux impacts la disperse en cubes.'},
 demon:{name:'Démon des brumes',icon:'👹',text:'Un démon hostile : trois tirs scanner ou deux coups de matraque le font éclater en cubes et libèrent un noyau.'}
};
export function creature(type){
 const g=new THREE.Group(),dark=mat(0x292137),eyes=mat(0xffd273,0xff8e28),limbs=[];
 if(type==='sheep'){const wool=mat(0xe9e4d6),face=mat(0x665a54),hoof=mat(0x302a2d);box(g,.85,.65,1.05,0,.75,0,wool);for(const s of [-1,1])for(const z of [-.34,.34]){const leg=new THREE.Group();leg.position.set(s*.28,.55,z);box(leg,.17,.48,.18,0,-.23,0,hoof);g.add(leg);limbs.push(leg)}box(g,.48,.42,.4,0,.94,-.62,face);for(const s of [-1,1]){box(g,.19,.1,.22,s*.3,1.03,-.62,wool);box(g,.08,.08,.025,s*.13,1,-.83,dark)}for(const x of [-.26,.26])box(g,.36,.22,.75,x,1.12,.03,wool)}
 if(type==='ghost'){const glow=mat(0xd4d2ed,0x353074);box(g,.75,.75,.5,0,1.2,0,glow);box(g,.57,.28,.46,0,1.68,0,glow);for(const s of [-1,1]){box(g,.23,.24,.4,s*.25,.74,0,glow);box(g,.12,.16,.035,s*.17,1.38,-.265,dark);const arm=box(g,.34,.16,.3,s*.52,1.1,0,glow);limbs.push(arm)}box(g,.16,.1,.035,0,1.07,-.265,dark)}
 if(type==='pumpkin'){const orange=mat(0xc96523),jacket=mat(0x392746),stem=mat(0x526b36);box(g,.65,.64,.6,0,1.44,0,orange);box(g,.12,.22,.12,.02,1.86,0,stem);box(g,.48,.48,.32,0,.86,0,jacket);for(const s of [-1,1]){box(g,.14,.14,.04,s*.16,1.54,-.315,eyes);const l=box(g,.19,.45,.22,s*.16,.36,0,dark);limbs.push(l);box(g,.16,.48,.2,s*.39,.85,0,jacket)}box(g,.35,.075,.04,0,1.27,-.315,eyes)}
 if(type==='bat'){const fur=mat(0x382a49);box(g,.25,.4,.28,0,.2,0,fur);for(const s of [-1,1]){box(g,.1,.16,.12,s*.09,.48,0,fur);box(g,.045,.06,.025,s*.07,.28,-.15,eyes);const wing=new THREE.Group();wing.position.set(s*.12,.24,0);box(wing,.55,.07,.38,s*.25,0,0,fur);box(wing,.26,.06,.24,s*.58,0,.05,fur);g.add(wing);limbs.push(wing)}}
 if(type==='demon'){const hide=mat(0x391023,0x870029),horn=mat(0xc23b59,0xff153c);box(g,.68,.8,.5,0,1.02,0,hide);box(g,.6,.48,.48,0,1.62,-.03,hide);for(const s of [-1,1]){box(g,.16,.38,.16,s*.22,2.04,0,horn);box(g,.12,.09,.04,s*.14,1.69,-.28,eyes);const arm=new THREE.Group();arm.position.set(s*.43,1.2,0);box(arm,.18,.58,.18,0,-.2,0,hide);g.add(arm);limbs.push(arm);const leg=new THREE.Group();leg.position.set(s*.16,.52,0);box(leg,.2,.48,.2,0,-.22,0,dark);g.add(leg);limbs.push(leg)}box(g,.26,.08,.04,0,1.42,-.3,horn)}
 g.userData={type,limbs};return g
}
export class CreatureSystem{
 constructor(scene,world){this.scene=scene;this.world=world;this.members=[];this.fragments=[];this.kills=0;this.lastCall=0;this.lastUpdate=0;this.fragmentGeometry=new THREE.BoxGeometry(.22,.22,.22);this.fragmentMaterials={ghost:[0xd6d1ff,0x8b83d6,0x77e9f1],pumpkin:[0xff8a35,0xe2492f,0x779441],bat:[0x58417e,0x9b66c9,0x44345d],demon:[0x9e1d46,0xf83f68,0x4a224f]};for(const[type,colors]of Object.entries(this.fragmentMaterials))this.fragmentMaterials[type]=colors.map(color=>new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.24,roughness:.78}));const specs=[['sheep',-7,5],['sheep',-10,9],['sheep',-7,15],['sheep',7,19],['sheep',-12,-3],['ghost',-12,14],['ghost',6,-11],['ghost',23,14],['pumpkin',-7,21],['pumpkin',23,-7],['bat',-12,7],['bat',7,-5],['bat',2,20],['demon',25,28],['demon',-27,25],['demon',29,-27]];specs.forEach(([type,x,z],i)=>{const model=creature(type);scene.add(model);this.members.push({type,model,x,z,phase:i*2.37,hp:type==='demon'?3:type==='sheep'?0:2,alive:true,visible:true,warning:0,attack:0})})}
 floor(x,z){for(let y=Math.min(47,heightAt(x,z)+10);y>=0;y--)if(this.world.get(Math.floor(x),y,Math.floor(z)))return y+1;return 8}
 // Les éclats partagent géométrie et matériaux, rebondissent puis disparaissent.
 updateFragments(dt){for(let i=this.fragments.length-1;i>=0;i--){const f=this.fragments[i];f.age+=dt;f.velocity.y-=12*dt;f.mesh.position.addScaledVector(f.velocity,dt);if(f.mesh.position.y<f.groundY){f.mesh.position.y=f.groundY;if(f.velocity.y<-.8)f.velocity.y*=-.28;else f.velocity.y=0;f.velocity.x*=.7;f.velocity.z*=.7}f.mesh.rotation.x+=f.spin.x*dt;f.mesh.rotation.y+=f.spin.y*dt;f.mesh.rotation.z+=f.spin.z*dt;const shrink=f.age>1.15?Math.max(.02,(1.5-f.age)/.35):1;f.mesh.scale.setScalar(f.size*shrink);if(f.age>=1.5){this.scene.remove(f.mesh);this.fragments.splice(i,1)}}}
 // La mort est persistante : le monstre ne réapparaît pas au prochain cycle.
 burst(m){const p=m.model.position,groundY=m.groundY??this.floor(p.x,p.z),palette=this.fragmentMaterials[m.type]||this.fragmentMaterials.demon;for(let i=0;i<22;i++){const mesh=new THREE.Mesh(this.fragmentGeometry,palette[i%palette.length]),size=.55+Math.random()*.7,angle=Math.random()*Math.PI*2,speed=1.8+Math.random()*4.2;mesh.position.set(p.x+(Math.random()-.5)*.55,p.y+.3+Math.random()*.9,p.z+(Math.random()-.5)*.55);mesh.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);mesh.scale.setScalar(size);mesh.castShadow=false;mesh.receiveShadow=false;this.scene.add(mesh);this.fragments.push({mesh,size,groundY,age:0,velocity:new THREE.Vector3(Math.cos(angle)*speed,2+Math.random()*4,Math.sin(angle)*speed),spin:new THREE.Vector3((Math.random()-.5)*14,(Math.random()-.5)*14,(Math.random()-.5)*14)})}this.kills++}
 // La salle et son seuil restent une halte sûre, même si le joueur attire un démon.
 safeZone(x,z,margin=0){return x>=-25-margin&&x<=-9+margin&&z>=-22-margin&&z<=-6+margin}
 bodyBlocked(x,y,z,radius=.34,height=1.75){for(let bx=Math.floor(x-radius);bx<=Math.floor(x+radius);bx++)for(let by=Math.floor(y+.04);by<=Math.floor(y+height-.01);by++)for(let bz=Math.floor(z-radius);bz<=Math.floor(z+radius);bz++)if(this.world.get(bx,by,bz))return true;return false}
 // Cherche un appui proche des pieds, jamais le toit situé plusieurs mètres plus haut.
 support(x,z,currentY){for(let y=Math.floor(currentY);y>=Math.floor(currentY-2.05);y--)if(this.world.get(Math.floor(x),y,Math.floor(z)))return y+1;return null}
 lineClear(from,to){const dx=to.x-from.x,dy=(to.y+1)-(from.y+1),dz=to.z-from.z,n=Math.max(1,Math.ceil(Math.hypot(dx,dy,dz)/.18));for(let i=1;i<n;i++){const f=i/n;if(this.world.get(Math.floor(from.x+dx*f),Math.floor(from.y+1+dy*f),Math.floor(from.z+dz*f)))return false}return true}
 moveMember(m,tx,tz,speed,dt){
  const dx=tx-m.walkX,dz=tz-m.walkZ,d=Math.hypot(dx,dz);if(d<.025||!dt)return;
  const length=Math.min(d,speed*dt),sx=dx/d*length,sz=dz/d*length,steps=Math.max(1,Math.ceil(length/.12));
  const accept=(x,z)=>{if(m.type!=='sheep'&&this.safeZone(x,z,.75))return false;const base=this.support(x,z,m.groundY);if(base===null||base>m.groundY+1.01||base<m.groundY-1.05)return false;const fly=m.type==='bat'?2.8:0,radius=m.type==='bat'?.85:m.type==='ghost'?.7:m.type==='demon'?.44:.48,height=m.type==='bat'?.6:m.type==='ghost'?2.2:m.type==='sheep'?1.4:1.8;if(this.bodyBlocked(x,base+fly,z,radius,height))return false;m.walkX=x;m.walkZ=z;m.groundY=base;return true};
  for(let i=0;i<steps;i++){accept(m.walkX+sx/steps,m.walkZ);accept(m.walkX,m.walkZ+sz/steps)}
 }
 // stepSeconds explicite permet de suspendre réellement IA, télégraphie et fragments.
 // Sans cet argument, l'ancienne signature reste valable avec un delta plafonné.
 update(time,halloween,player=null,onAttack=()=>{},stepSeconds=null){
  const dt=Number.isFinite(stepSeconds)?Math.min(.1,Math.max(0,stepSeconds)):this.initialized?Math.min(.05,Math.max(0,time-this.lastUpdate)):.016;
  this.initialized=true;this.lastUpdate=time;this.simTime=(this.simTime||0)+dt;const clock=this.simTime;this.updateFragments(dt);
  for(const m of this.members){
   m.visible=m.alive&&(m.type==='sheep'||m.type==='demon'||halloween);m.model.visible=m.visible;if(!m.visible)continue;
   m.walkX??=m.x;m.walkZ??=m.z;m.groundY??=this.floor(m.x,m.z);m.mode??='patrol';
   if(dt===0&&m.poseReady)continue;
   const t=clock*(m.type==='bat'?.4:.13)+m.phase,r=m.type==='sheep'?1.6:m.type==='bat'?3:2.2;
   let tx=m.x+Math.sin(t)*r,tz=m.z+Math.cos(t*.73)*r,speed=m.type==='bat'?1.9:.7;
   if(m.type==='demon'){
    const near=player?Math.hypot(player.x-m.walkX,player.z-m.walkZ):Infinity,home=Math.hypot(m.walkX-m.x,m.walkZ-m.z),safe=player&&this.safeZone(player.x,player.z);
    if(safe||!player||near>18||home>23){if(m.mode!=='patrol')m.mode='return';m.warning=0}
    else if(near<12&&home<20)m.mode='chase';
    if(m.mode==='return'){tx=m.x;tz=m.z;speed=1.5;if(home<.5)m.mode='patrol'}
    if(m.mode==='chase'||m.mode==='windup'||m.mode==='recover'){tx=player.x;tz=player.z;speed=1.55}
    m.attack=Math.max(0,m.attack-dt);
    const canStrike=player&&!safe&&near<2.1&&Math.abs(player.y-m.groundY)<1.8&&this.lineClear({x:m.walkX,y:m.groundY,z:m.walkZ},player);
    if(canStrike&&m.attack<=0){
     if(!m.warning)m.warning=.65;
     m.mode='windup';speed=0;m.warning=Math.max(.000001,m.warning-dt);
     if(m.warning<=.00001&&dt>0){m.warning=0;m.attack=1.8;m.mode='recover';onAttack(m)}
    }else{m.warning=0;if(m.attack>0&&canStrike){m.mode='recover';speed=0}else if(m.mode==='windup'||m.mode==='recover')m.mode='chase'}
    if(m.mode==='patrol'){tx=m.x+Math.sin(t)*r;tz=m.z+Math.cos(t*.73)*r;speed=.7}
    m.model.scale.setScalar(m.warning?.9:.78);
   }
   const oldX=m.walkX,oldZ=m.walkZ;this.moveMember(m,tx,tz,speed,dt);
   const bob=m.type==='ghost'?.4+Math.sin(t*4)*.2:m.type==='bat'?3+Math.sin(t*2)*.35:m.type==='demon'?Math.sin(clock*3+m.phase)*.05:0;
   m.model.position.set(m.walkX,m.groundY+bob,m.walkZ);
   m.poseReady=true;
   if(m.type==='demon'&&player&&m.mode!=='patrol'&&m.mode!=='return')m.model.rotation.y=Math.atan2(-(player.x-m.walkX),-(player.z-m.walkZ));
   else if(Math.hypot(m.walkX-oldX,m.walkZ-oldZ)>.0001)m.model.rotation.y=Math.atan2(-(m.walkX-oldX),-(m.walkZ-oldZ));
   m.model.userData.limbs.forEach((limb,i)=>{if(m.type==='bat')limb.rotation.z=Math.sin(clock*15+m.phase)*.8*(i?1:-1);else if(m.type==='ghost')limb.rotation.z=Math.sin(clock*2+i)*.15;else limb.rotation.x=Math.sin(clock*5+m.phase+i*Math.PI)*.3*(m.mode==='windup'?.15:1)})
  }
 }
 hitEnemy(m,damage=1){if(!m||!m.alive||m.type==='sheep')return false;m.hp-=damage;if(m.hp<=0){m.alive=false;m.visible=false;m.model.visible=false;this.burst(m);return true}return false}
 nearest(position,range=3){return this.members.filter(m=>m.visible).map(m=>({m,distance:m.model.position.distanceTo(position)})).filter(v=>v.distance<range).sort((a,b)=>a.distance-b.distance)[0]?.m||null}
 ambient(time,position,yaw,sound){if(time<this.lastCall||this.safeZone(position.x,position.z))return;const candidates=this.members.filter(m=>m.visible&&m.model.position.distanceTo(position)<24);if(!candidates.length)return;const m=candidates[Math.floor(time)%candidates.length],distance=m.model.position.distanceTo(position),delta=m.model.position.clone().sub(position),pan=(delta.x*Math.cos(yaw)-delta.z*Math.sin(yaw))/Math.max(1,distance);sound.play(m.type,{gain:1/(1+distance*.17),pan});this.lastCall=time+4.5+(Math.floor(time)%4)}
 inspect(){return this.members.filter(m=>m.visible).map(m=>({type:m.type,x:m.model.position.x,y:m.model.position.y,z:m.model.position.z,hp:m.hp,alive:m.alive,state:m.mode||'patrol',telegraph:m.warning>0}))}
}
