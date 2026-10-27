'use strict';
/* Hook file kept for compatibility with the original UI. The combat loop is in engine.js. */
function nextWave(){currentWave=Math.min(totalWaves,currentWave+1);gameState='playing'}
function startWave(){enemies=[];bullets=[];enemyBullets=[];gameState='playing'}
function endWave(){gameState='waveComplete'}
function showShop(){document.getElementById('shop-screen')?.classList.remove('hidden')}
function closeShop(){document.getElementById('shop-screen')?.classList.add('hidden');gameState='playing'}
