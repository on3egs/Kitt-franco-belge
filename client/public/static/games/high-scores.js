(() => {
  const catalog = [
    'Neon Serpent','Breaker X','Pong Arena','Crossroad 86','Asteroid Shift','Memory Core','Minefield','KITT 2048','Invaders Zero','Missile Command','Circuit Sentinel','Signal Rhythm','Neon Solitaire',
    'Pac-Man','Tetris','TRON','Space Invaders','Space Knight Rider','Astéroïdes Pro','Astéroïdes 3D Ultra','Pac-Man 3D','Tetris 3D Ultra','Invaders 3D','Midnight Runner','KITT — Signal Zéro'
  ];
  const filters = document.getElementById('score-filters');
  const content = document.getElementById('score-content');
  let selected = 'ALL';
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const normalizedName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('fr');
  function legacyRows() {
    const rows = [];
    const arrays = [
      ['kyronext.arcade.scores.pacman','Pac-Man'],['kyronext.arcade.scores.tetris','Tetris'],['kyronext.arcade.scores.tron','TRON'],['kyronext.arcade.scores.spaceinvaders','Space Invaders'],['spaceInvadersProLeaderboard','Space Knight Rider']
    ];
    arrays.forEach(([key,game])=>{try{const value=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(value))value.forEach(row=>rows.push({game,player:row.name||row.player||'PILOTE',score:Number(row.score)||0,level:Number(row.level)||1,duration:0,date:row.date||new Date().toISOString()}));}catch(_){}});
    const numeric = [
      ['asteroids3dUltraHS','Astéroïdes 3D Ultra'],['asteroids3dHighScore','Astéroïdes Pro'],['pacman3dUltraHS','Pac-Man 3D'],['pacman3dHighScore','Pac-Man 3D'],['tetris3dUltraHS','Tetris 3D Ultra'],['tetris3dHighScore','Tetris 3D Ultra'],['spaceInvaders3dUltraHS','Invaders 3D'],['spaceInvadersProHighScore','Space Knight Rider'],['manixMidnightRunnerBest','Midnight Runner']
    ];
    numeric.forEach(([key,game])=>{const score=Number(localStorage.getItem(key))||0;if(score)rows.push({game,player:'RECORD LOCAL',score,level:1,duration:0,date:new Date().toISOString()});});
    try{const row=JSON.parse(localStorage.getItem('kitt.signal-zero.record.v1')||'null');if(row&&Number(row.score))rows.push({game:'KITT — Signal Zéro',player:'RECORD LOCAL',score:Number(row.score),level:1,duration:Number(row.time)||0,date:row.date||new Date().toISOString()});}catch(_){}
    return rows;
  }
  function render() {
    filters.innerHTML = '';
    ['ALL', ...catalog].forEach(name => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = name === 'ALL' ? 'TOUS LES JEUX' : name; button.classList.toggle('active', selected === name); button.setAttribute('aria-pressed', String(selected === name)); button.onclick = () => { selected = name; render(); }; filters.append(button);
    });
    const rows = [...window.ManixScores.all(),...legacyRows()].filter(row => selected === 'ALL' || normalizedName(row.game) === normalizedName(selected)).sort((a,b)=>b.score-a.score||b.level-a.level).slice(0, 100);
    if (!rows.length) { content.innerHTML = '<div class="empty-scores">Aucun record pour le moment. Lance une partie et inscris ton nom dans le classement !</div>'; return; }
    content.innerHTML = `<table class="score-table"><thead><tr><th>RANG</th><th>PILOTE</th><th>JEU</th><th>SCORE</th><th>NIVEAU</th><th>DATE</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${String(i + 1).padStart(2, '0')}</td><td>${esc(r.player)}</td><td>${esc(r.game)}</td><td>${Number(r.score).toLocaleString('fr-FR')}</td><td>${Number(r.level)}/10</td><td>${new Date(r.date).toLocaleDateString('fr-FR')}</td></tr>`).join('')}</tbody></table>`;
  }
  render(); window.addEventListener('manix-scores-updated', render);
  // Plusieurs jeux conservent encore leur meilleur score dans des clés historiques.
  // Toute écriture inter-onglets doit actualiser le classement universel.
  window.addEventListener('storage', render);
})();
