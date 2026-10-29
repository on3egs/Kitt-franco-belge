const assert=require('node:assert/strict');
const fs=require('node:fs');
const {resolveViewBudget,VIEW_BUDGETS}=require('./game/view-budget.mjs');

assert.deepEqual(VIEW_BUDGETS,{economy:1,standard:2,extended:3,maximum:5});
assert.deepEqual(
  (({radius,chunks,blocksAcross})=>({radius,chunks,blocksAcross}))(resolveViewBudget({viewDistance:2,mapBudget:'standard'},{deviceMemory:8})),
  {radius:2,chunks:25,blocksAcross:80},
  'Le profil standard charge une zone de 80 × 80 blocs.'
);
const economy=resolveViewBudget({viewDistance:5,mapBudget:'economy'},{deviceMemory:8});
assert.equal(economy.radius,1);assert.equal(economy.chunks,9);assert.equal(economy.limitedByBudget,true);
const extended=resolveViewBudget({viewDistance:5,mapBudget:'maximum'},{deviceMemory:4});
assert.equal(extended.radius,3);assert.equal(extended.chunks,49);assert.equal(extended.limitedByHardware,true);
const maximum=resolveViewBudget({viewDistance:5,mapBudget:'maximum'},{deviceMemory:8});
assert.equal(maximum.radius,5);assert.equal(maximum.chunks,121);assert.equal(maximum.blocksAcross,176);
const invalid=resolveViewBudget({viewDistance:99,mapBudget:'inconnu'},{deviceMemory:2});
assert.equal(invalid.profile,'standard');assert.equal(invalid.requestedRadius,5);assert.equal(invalid.radius,2);assert.equal(invalid.chunks,25);
const coarse=resolveViewBudget({viewDistance:5,mapBudget:'maximum'},{coarse:true});
assert.equal(coarse.radius,3,'Un appareil tactile sans mesure mémoire garde un plafond prudent.');

const html=fs.readFileSync(require('node:path').join(__dirname,'block-mode.html'),'utf8');
const client=fs.readFileSync(require('node:path').join(__dirname,'game/client.js'),'utf8');
for(const id of ['viewDistance','viewDistanceValue','mapBudget','mapBudgetReadout'])assert.match(html,new RegExp(`id="${id}"`));
assert.match(client,/save\('kitt\.settings\.v2',settings\)/);
assert.match(client,/if\(\['quality','viewDistance','mapBudget'\]\.includes\(id\)\)quality\(\)/);
console.log('OK paramètres monde : rayon, limite mémoire, distance chargée et sauvegarde validés.');
