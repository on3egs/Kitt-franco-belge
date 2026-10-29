// Vérifie les nouveaux secteurs et les points de repère historiques du monde.
const assert=require('node:assert/strict');
(async()=>{
const world=await import('./game/world.mjs');
const construction=await import('./game/construction.mjs');

assert.equal(world.CHUNK,16,'La taille des chunks doit rester stable.');
assert.equal(world.WORLD_LIMIT,16384,'La limite jouable doit couvrir 16 384 blocs dans chaque direction.');
assert.equal(world.WORLD_LIMIT%world.CHUNK,0,'La frontière doit être alignée sur les chunks.');

// Les trois avant-postes et les biomes historiques gardent leurs coordonnées.
for(const [name,point] of Object.entries(construction.OUTPOSTS)){
  assert.equal(world.column(point.x,point.z).height,7,`Le terrain de l’avant-poste ${name} doit rester plat.`);
  assert.ok(construction.blueprintFor(name).length>0,`Le plan de l’avant-poste ${name} doit être conservé.`);
}
assert.equal(world.column(0,0).biome,'FLAG');
assert.equal(world.column(77,-19).biome,'NEVADA');
assert.equal(world.column(-77,-19).biome,'FORÊT');
assert.equal(world.column(0,-120).biome,'MONTAGNES');
assert.equal(world.generatedBlock(-5,8,-4),'frite','Le bloc frites de la base FLAG doit rester en place.');

// Nouveaux biomes, villes raccordées aux routes, et façades générées.
assert.equal(world.column(100,-60).biome,'INDUSTRIE');
assert.equal(world.column(-100,60).biome,'LITTORAL');
assert.equal(world.column(0,120).biome,'CAMPAGNE');
for(const city of world.WORLD_CITIES){
  const center=world.column(city.x,city.z);
  assert.equal(center.biome,city.name,`Le centre de ${city.name} doit exister.`);
  assert.ok(center.road,`${city.name} doit rejoindre une route existante.`);
  assert.ok(['bitume','marquage'].includes(world.generatedBlock(city.x,center.height,city.z)),`La chaussée de ${city.name} doit être générée.`);
}
assert.equal(world.generatedBlock(-16,11,272),'verre','Une façade de Liège doit être générée.');
assert.equal(world.generatedBlock(248,10,-40),'verre','Une façade de Bruxelles doit être générée.');
assert.equal(world.generatedBlock(-328,12,-40),'metal','Une façade de Paris doit être générée.');
assert.equal(world.generatedBlock(107,10,-60),'metal','La zone industrielle doit contenir une usine.');
assert.equal(world.generatedBlock(100,9,-69),null,'La façade de l’usine doit garder son entrée ouverte.');

// Le terrain reste déterministe et générable bien au-delà de l’ancienne portée réseau.
for(const [x,z] of [[8192,8192],[-8192,4096],[world.WORLD_LIMIT,0],[-world.WORLD_LIMIT,world.WORLD_LIMIT]]){
  const column=world.column(x,z);
  assert.ok(Number.isInteger(column.height)&&column.height>=0&&column.height<world.HEIGHT,`Hauteur invalide en ${x},${z}.`);
  assert.ok(world.generatedBlock(x,column.height,z),`Surface manquante en ${x},${z}.`);
}

console.log('OK monde : limites étendues, villes et biomes ajoutés, avant-postes historiques préservés.');
})().catch(error=>{console.error(error);process.exitCode=1});
