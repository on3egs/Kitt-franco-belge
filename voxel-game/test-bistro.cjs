const assert = require('node:assert/strict');
const { generatedBlock } = require('./game/world.mjs');

assert.equal(generatedBlock(-12, 8, -12), 'bitume', 'Le sol du bistrot doit être construit.');
for (const y of [9, 10, 11]) assert.equal(generatedBlock(-18, y, -6), null, 'La porte doit laisser entrer le joueur.');
assert.equal(generatedBlock(-18, 12, -6), 'metal', 'Le linteau doit tenir au-dessus de la porte.');
assert.equal(generatedBlock(-11, 9, -10), 'metal', 'Le bar doit avoir une base.');
assert.equal(generatedBlock(-11, 10, -10), 'bois', 'Le comptoir doit être visible.');
assert.equal(generatedBlock(-23, 9, -18), 'metal', 'La borne Pac-Man doit avoir un socle.');
assert.equal(generatedBlock(-23, 10, -18), 'rouge', 'La borne Pac-Man doit avoir son écran rouge.');
assert.equal(generatedBlock(-23, 10, -14), 'bleu', 'La borne Tetris doit avoir son écran bleu.');
assert.equal(generatedBlock(-16, 10, -11), 'bois', 'Les tables doivent avoir un plateau.');
assert.equal(generatedBlock(-15, 9, -11), 'bois', 'Les chaises doivent être présentes.');
console.log('OK bistrot FLAG : accès, mobilier, Pac-Man et Tetris');
