(() => {
  const KEY = 'manixArcadeUniversalScores.v1';
  const safeRead = () => { try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
  window.ManixScores = {
    key: KEY,
    all: safeRead,
    save(game, player, score, level, duration) {
      const clean = { game: String(game || 'arcade').slice(0, 48), player: String(player || 'PILOTE').trim().slice(0, 20) || 'PILOTE', score: Math.max(0, Math.floor(Number(score) || 0)), level: Math.max(1, Math.floor(Number(level) || 1)), duration: Math.max(0, Math.floor(Number(duration) || 0)), date: new Date().toISOString() };
      const rows = safeRead();
      rows.push(clean);
      rows.sort((a, b) => b.score - a.score || b.level - a.level || a.duration - b.duration || Date.parse(a.date) - Date.parse(b.date));
      try { localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 500))); } catch { /* Scores remain playable if storage is disabled. */ }
      window.dispatchEvent(new CustomEvent('manix-scores-updated', { detail: clean }));
      return clean;
    },
    best(game) { return Math.max(0, ...safeRead().filter(row => !game || row.game === game).map(row => Number(row.score) || 0)); }
  };
})();
