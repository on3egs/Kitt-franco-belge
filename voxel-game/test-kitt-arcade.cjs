const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../client/public/static/games/kitt-arcade');
const hub = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pages = [];
const ambience = fs.readFileSync(path.resolve(root, 'arcade-ambience.js'), 'utf8');
new vm.Script(ambience, { filename: 'kitt-arcade/arcade-ambience.js' });
function walk(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name === 'index.html' && file !== path.join(root, 'index.html')) pages.push(file);
  }
}
walk(path.join(root, 'games'));
assert.equal(pages.length, 10, 'Le catalogue doit contenir dix jeux distincts.');
assert.equal((hub.match(/class="game"/g) || []).length, 10, 'Le hub doit afficher les dix jeux.');
assert.match(hub, /id="gameSearch"/, 'Le catalogue doit proposer une recherche.');
assert.match(hub, /id="gameFilter"/, 'Le catalogue doit filtrer par style.');
assert.match(hub, /id="resumeGame"/, 'Le catalogue doit mémoriser le dernier défi lancé.');
assert.match(hub, /kitt-arcade-last-game/, 'Le dernier jeu doit être repris depuis le navigateur.');
assert.match(hub, /kitt-arcade-whack-best/, 'Le carnet du pilote doit lire les records du catalogue.');
const hubScripts = hub.split('<script').slice(1).map(part => part.slice(part.indexOf('>') + 1, part.indexOf('</script>'))).filter(text => text.trim());
assert.ok(hubScripts.length, 'Le catalogue doit initialiser ses outils.');
for (const source of hubScripts) new vm.Script(source, { filename: 'kitt-arcade/index.html' });
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /lang="fr"/i, file + ': interface française attendue.');
  assert.ok(html.includes('../../index.html'), file + ': lien de retour au catalogue absent.');
  assert.match(html, /localStorage/i, file + ': meilleur score local absent.');
  if (!file.includes(path.join('games', 'simon'))) assert.match(html, /arcade-ambience\.js/, file + ': retour audio KITT absent.');
  const scripts = html.split('<script').slice(1).map(part => part.slice(part.indexOf('>') + 1, part.indexOf('</script>'))).filter(text => text.trim());
  assert.ok(scripts.length, file + ': code jouable absent.');
  for (const source of scripts) new vm.Script(source, { filename: file });
}
console.log('OK KITT Neon Arcade : 10 jeux, recherche, filtres, reprise, carnet local, scripts et retours valides');
