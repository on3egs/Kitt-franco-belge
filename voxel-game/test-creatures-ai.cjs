const assert=require('node:assert/strict');
(async()=>{
 const THREE=await import('three'),{CreatureSystem}=await import('./game/creatures.js');
 const flat={get:(_x,y,_z)=>y<=7?'pierre':null};
 function setup(world=flat,x=10,z=0){const system=new CreatureSystem(new THREE.Scene(),world),m=system.members.find(m=>m.type==='demon');system.members=[m];m.x=x;m.z=z;m.phase=0;return{system,m}}
 function advance(system,seconds,player,dt=1/60,onAttack=()=>{}){for(let t=0;t<seconds-.00001;t+=dt)system.update(t,true,player,onAttack,Math.min(dt,seconds-t))}
 const first=setup(),player={x:20,y:8,z:0};advance(first.system,2,player);assert.ok(first.m.model.position.x>12.9,'La poursuite doit cumuler plus de 2,9 m en 2 s.');assert.equal(first.m.mode,'chase');
 const second=setup();advance(second.system,2,player,1/20);assert.ok(Math.abs(first.m.model.position.x-second.m.model.position.x)<.05,'La vitesse doit être indépendante des FPS.');
 const pos=first.m.model.position.clone(),clock=first.system.simTime;first.system.update(1000000,true,player,()=>{},0);assert.equal(first.system.simTime,clock);assert.equal(first.m.model.position.distanceTo(pos),0,'Une mise à jour sans temps joué ne doit pas téléporter.');
 const wall={get:(x,y)=>y<=7||x===12&&y>=8&&y<=11?'pierre':null},blocked=setup(wall);let throughWall=0;advance(blocked.system,6,{x:12.7,y:8,z:0},1/60,()=>throughWall++);assert.ok(blocked.m.model.position.x<11.7,'Le démon ne doit pas traverser le mur.');assert.equal(throughWall,0,'Le démon ne doit pas attaquer au travers du mur.');assert.equal(blocked.m.groundY,8,'Il ne doit pas se téléporter sur le toit.');
 const close=setup();let hits=0;advance(close.system,.5,{x:11.7,y:8,z:0},1/60,()=>hits++);assert.equal(hits,0,'La télégraphie laisse un délai avant le premier coup.');assert.ok(close.m.warning>0);advance(close.system,.3,{x:11.7,y:8,z:0},1/60,()=>hits++);assert.equal(hits,1);advance(close.system,1,{x:11.7,y:8,z:0},1/60,()=>hits++);assert.equal(hits,1,'Le temps de récupération doit empêcher les coups répétés par image.');
 const safe=setup(flat,-7,-10);let safeHits=0;advance(safe.system,8,{x:-10,y:8,z:-10},1/60,()=>safeHits++);assert.equal(safeHits,0);assert.equal(safe.system.safeZone(safe.m.model.position.x,safe.m.model.position.z,.5),false,'Le démon reste hors du bistrot.');
 const returning=setup();advance(returning.system,3,player);const farX=returning.m.model.position.x;advance(returning.system,3,{x:100,y:8,z:100});assert.ok(returning.m.model.position.x<farX-1,'Le démon regagne sa zone quand il perd le joueur.');
 assert.equal(first.system.hitEnemy(first.m,1),false);assert.equal(first.system.hitEnemy(first.m,1),false);assert.equal(first.system.hitEnemy(first.m,1),true);assert.equal(first.system.fragments.length,22);advance(first.system,2,player);assert.equal(first.m.alive,false);assert.equal(first.m.model.visible,false);assert.equal(first.system.fragments.length,0);
 console.log('OK IA créatures : poursuite cumulée, FPS, pause, murs, télégraphie, récupération, bistrot sûr, retour et 22 fragments.');
})().catch(error=>{console.error(error);process.exitCode=1});
