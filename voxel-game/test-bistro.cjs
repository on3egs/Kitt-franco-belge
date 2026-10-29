const assert=require('node:assert/strict');
(async()=>{
 const {generatedBlock}=await import('./game/world.mjs'),{BISTRO_SPAWN,BISTRO_ARCADES,bistroCollision,BISTRO_COLLIDERS}=await import('./game/bistro-layout.mjs');
 for(let z=-4;z>=-17;z-=.25){for(const y of [8,9])assert.equal(generatedBlock(-18,y,Math.floor(z)),null,'Entrée et allée de plain-pied sans blocs');assert.equal(bistroCollision(-18,8,z),false,'Allée centrale libre de meubles')}
 assert.equal(BISTRO_SPAWN.y,8);assert.equal(bistroCollision(BISTRO_SPAWN.x,8,BISTRO_SPAWN.z),false);assert.equal(BISTRO_ARCADES.length,5);
 for(const b of BISTRO_ARCADES){const front=b.front==='west'?-1.1:1.1;assert.equal(bistroCollision(b.x,8,b.z),true,'La borne est un volume solide');assert.equal(bistroCollision(b.x+front,8,b.z),false,'Le joueur peut se placer devant la borne')}
 assert.ok(BISTRO_COLLIDERS.some(b=>b.id==='comptoir'));assert.ok(BISTRO_COLLIDERS.some(b=>b.id==='banquette'));assert.equal(generatedBlock(-18,12,-6),'metal');
 assert.deepEqual(BISTRO_ARCADES.map(b=>b.id),['pacman','tetris','space-invaders','stunt','arcade-hub']);
 console.log('OK bar : entrée plain-pied, allée traversable, collisions mobilier et cinq bornes jouables.');
})().catch(e=>{console.error(e);process.exitCode=1});
