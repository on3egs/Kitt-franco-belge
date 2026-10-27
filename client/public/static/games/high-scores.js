(() => {
  'use strict';
  const filters = document.getElementById('score-filters');
  const content = document.getElementById('score-content');
  const search = document.getElementById('score-search');
  const gameFilter = document.getElementById('score-game-filter');
  const sortSelect = document.getElementById('score-sort');
  const pagination = document.getElementById('score-pagination');
  const note = document.getElementById('score-note');
  const pageSize = 25;
  const state = { query: '', game: 'ALL', sort: 'score', page: 1 };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('fr');
  const number = value => { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; };
  const dateValue = value => { const n = Date.parse(value); return Number.isFinite(n) ? n : 0; };
  const fmt = value => number(value).toLocaleString('fr-FR');
  const dateLabel = value => dateValue(value) ? new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const durationLabel = value => { const seconds = number(value); return seconds ? `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s` : '—'; };

  function legacyRows() {
    const rows = [];
    const arrays = [
      ['kyronext.arcade.scores.pacman', 'Pac-Man'], ['kyronext.arcade.scores.tetris', 'Tetris'], ['kyronext.arcade.scores.tron', 'TRON'],
      ['kyronext.arcade.scores.spaceinvaders', 'Space Invaders'], ['spaceInvadersProLeaderboard', 'Space Knight Rider']
    ];
    arrays.forEach(([key, game]) => {
      try { const value = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(value)) value.forEach(row => rows.push({ game, player: row.name || row.player || 'PILOTE', score: row.score, level: row.level || 1, duration: 0, date: row.date || '' })); } catch (_) { /* Ancien stockage facultatif. */ }
    });
    const numeric = [
      ['asteroids3dUltraHS', 'Astéroïdes 3D Ultra'], ['asteroids3dHighScore', 'Astéroïdes Pro'], ['pacman3dUltraHS', 'Pac-Man 3D'],
      ['pacman3dHighScore', 'Pac-Man 3D'], ['tetris3dUltraHS', 'Tetris 3D Ultra'], ['tetris3dHighScore', 'Tetris 3D Ultra'],
      ['spaceInvaders3dUltraHS', 'Invaders 3D'], ['spaceInvadersProHighScore', 'Space Knight Rider'], ['manixMidnightRunnerBest', 'Midnight Runner']
    ];
    numeric.forEach(([key, game]) => { const score = number(localStorage.getItem(key)); if (score) rows.push({ game, player: 'RECORD LOCAL', score, level: 1, duration: 0, date: '' }); });
    try { const row = JSON.parse(localStorage.getItem('kitt.signal-zero.record.v1') || 'null'); if (row && number(row.score)) rows.push({ game: 'KITT — Signal Zéro', player: 'RECORD LOCAL', score: row.score, level: 1, duration: row.time, date: row.date || '' }); } catch (_) { /* Ancien stockage facultatif. */ }
    return rows;
  }

  function allRows() {
    let modern = [];
    try { modern = window.ManixScores?.all?.() || []; } catch (_) { /* Le tableau reste utilisable avec les anciens scores. */ }
    const rows = [...modern, ...legacyRows()].map(row => ({
      game: String(row.game || 'Arcade').trim().slice(0, 48) || 'Arcade',
      player: String(row.player || 'PILOTE').trim().slice(0, 20) || 'PILOTE',
      score: number(row.score), level: Math.max(1, number(row.level) || 1), duration: number(row.duration),
      date: dateValue(row.date) ? new Date(row.date).toISOString() : ''
    })).filter(row => row.score >= 0);
    const seen = new Set();
    return rows.filter(row => {
      const key = [normalized(row.game), normalized(row.player), row.score, row.level, row.date].join('|');
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  function filteredRows() {
    const query = normalized(state.query);
    return allRows().filter(row => (state.game === 'ALL' || normalized(row.game) === normalized(state.game)) && (!query || normalized(`${row.player} ${row.game}`).includes(query)))
      .sort((a, b) => state.sort === 'recent' ? dateValue(b.date) - dateValue(a.date) || b.score - a.score : b.score - a.score || b.level - a.level || dateValue(b.date) - dateValue(a.date));
  }

  function updateGameOptions(rows) {
    const games = [...new Set(rows.map(row => row.game))].sort((a, b) => a.localeCompare(b, 'fr'));
    const selected = state.game;
    gameFilter.innerHTML = '<option value="ALL">Tous les jeux</option>' + games.map(game => `<option value="${esc(game)}">${esc(game)}</option>`).join('');
    gameFilter.value = games.some(game => game === selected) ? selected : 'ALL';
    state.game = gameFilter.value;
  }

  function exportCsv(rows) {
    if (!rows.length) { note.textContent = 'Aucun résultat à exporter. Modifie les filtres puis réessaie.'; return; }
    const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [['Rang', 'Pilote', 'Jeu', 'Score', 'Niveau', 'Durée (secondes)', 'Date'], ...rows.map((row, index) => [index + 1, row.player, row.game, row.score, row.level, row.duration, row.date])];
    const csv = '\ufeff' + lines.map(line => line.map(quote).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'manix-arcade-hall-of-fame.csv'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    note.textContent = `${rows.length} record${rows.length > 1 ? 's' : ''} exporté${rows.length > 1 ? 's' : ''} en CSV.`;
  }

  function drawPagination(totalPages) {
    pagination.replaceChildren();
    if (totalPages <= 1) return;
    const addButton = (label, page, text, disabled = false) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.setAttribute('aria-label', text); button.disabled = disabled;
      if (page === state.page) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => { state.page = page; render(); document.querySelector('.score-tools')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }); pagination.append(button);
    };
    addButton('←', Math.max(1, state.page - 1), 'Page précédente', state.page === 1);
    const start = Math.max(1, Math.min(state.page - 2, totalPages - 4));
    for (let page = start; page <= Math.min(totalPages, start + 4); page++) addButton(String(page), page, `Page ${page}`);
    addButton('→', Math.min(totalPages, state.page + 1), 'Page suivante', state.page === totalPages);
    const label = document.createElement('span'); label.className = 'score-page-label'; label.textContent = `${state.page} / ${totalPages}`; pagination.append(label);
  }

  function render() {
    const all = allRows(); updateGameOptions(all);
    const rows = filteredRows();
    state.page = Math.max(1, Math.min(state.page, Math.max(1, Math.ceil(rows.length / pageSize))));
    const start = (state.page - 1) * pageSize;
    const visible = rows.slice(start, start + pageSize);
    document.getElementById('score-total').textContent = fmt(rows.length);
    document.getElementById('score-games').textContent = fmt(new Set(rows.map(row => row.game)).size);
    document.getElementById('score-champion').textContent = [...rows].sort((a, b) => b.score - a.score || b.level - a.level)[0]?.player || '—';
    note.textContent = rows.length ? `Affichage ${fmt(start + 1)}–${fmt(Math.min(start + pageSize, rows.length))} sur ${fmt(rows.length)} résultat${rows.length > 1 ? 's' : ''}. Les scores sont triés ${state.sort === 'recent' ? 'du plus récent au plus ancien' : 'du meilleur au plus faible'}.` : '';
    if (!visible.length) {
      content.innerHTML = `<div class="empty-scores">${all.length ? 'Aucun résultat avec ces filtres. Essaie un autre nom ou choisis « Tous les jeux ».' : 'Aucun record pour le moment. Lance une partie puis inscris ton nom au Hall of Fame !'}</div>`;
      pagination.replaceChildren(); return;
    }
    content.innerHTML = `<div class="score-table-wrap"><table class="score-table"><thead><tr><th>ORDRE</th><th>PILOTE</th><th>JEU</th><th>SCORE</th><th>NIVEAU</th><th>DURÉE</th><th>DATE</th></tr></thead><tbody>${visible.map((row, index) => `<tr><td>${String(start + index + 1).padStart(2, '0')}</td><td>${esc(row.player)}</td><td>${esc(row.game)}</td><td>${fmt(row.score)}</td><td>${fmt(row.level)}</td><td class="score-duration">${durationLabel(row.duration)}</td><td>${dateLabel(row.date)}</td></tr>`).join('')}</tbody></table></div>`;
    drawPagination(Math.ceil(rows.length / pageSize));
  }

  search.addEventListener('input', () => { state.query = search.value; state.page = 1; render(); });
  gameFilter.addEventListener('change', () => { state.game = gameFilter.value; state.page = 1; render(); });
  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; state.page = 1; render(); });
  document.getElementById('score-export').addEventListener('click', () => exportCsv(filteredRows()));
  document.getElementById('score-reset').addEventListener('click', () => { state.query = ''; state.game = 'ALL'; state.sort = 'score'; state.page = 1; search.value = ''; sortSelect.value = 'score'; render(); });
  window.addEventListener('manix-scores-updated', render);
  window.addEventListener('storage', render);
  render();
})();
