// Cadence basse fait baisser les effets ; une vraie marge permet de les restaurer.
const assert = require('node:assert/strict');
const {createAdaptiveQuality} = require('./game/adaptive-quality.mjs');

function runWindow(controller, start, duration, step) {
  let result = null;
  const end = start + duration;
  for (let time = start; time <= end; time += step) {
    result = controller.sample(time) || result;
  }
  result = controller.sample(end) || result;
  return result;
}

const adaptive = createAdaptiveQuality({initial:'high',warmupMs:1000,windowMs:1000,cooldownMs:1000});
assert.equal(runWindow(adaptive,0,900,20),null,'La chauffe ne doit pas déclencher de changement prématuré.');
const slow = runWindow(adaptive,1000,1100,20);
assert.equal(slow.mode,'low');
assert.ok(slow.changed);
assert.ok(slow.fps<58);

const steady = runWindow(adaptive,2100,1100,16);
assert.equal(steady.mode,'low','Une cadence proche de 60 FPS garde les effets économiques.');
assert.equal(steady.changed,false);

const fastQuality = createAdaptiveQuality({initial:'low',warmupMs:0,windowMs:1000,cooldownMs:0,upgradeAbove:64});
const fast = runWindow(fastQuality,0,1000,10);
assert.equal(fast.mode,'high','Une cadence durablement supérieure à 64 FPS restaure les effets.');
assert.ok(fast.changed);
assert.ok(fast.fps>64);

console.log('OK qualité automatique : chauffe, baisse sous 58 FPS, hystérésis et restauration au-dessus de 64 FPS.');
