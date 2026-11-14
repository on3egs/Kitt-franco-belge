// ============================================
// KITT STUNT RACING v7 — Hall of fame (scores locaux)
// By Manix - KITT FRANCO BELGE
// ============================================
window.KS = (function () {
    'use strict';

    const RUNS_KEY = 'kittStuntRacingRuns3Lap';
    const BEST_KEY = 'kittStuntRacingBest3Lap';
    const MAX_RUNS = 60;

    function loadRuns() {
        try {
            const raw = localStorage.getItem(RUNS_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }

    function saveRuns(runs) {
        try { localStorage.setItem(RUNS_KEY, JSON.stringify(runs)); } catch (e) { /* plein */ }
    }

    function fmtTime(s) {
        if (isNaN(s) || s === null || s === undefined) return '--:--.--';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        const ms = Math.floor((s % 1) * 100);
        return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0') + '.' + String(ms).padStart(2, '0');
    }

    function fmtDate(ts) {
        const d = new Date(ts);
        return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    }

    // Enregistre une course. Retourne le classement (1 = meilleur) sur ce niveau.
    function addRun(level, time, speed) {
        const runs = loadRuns();
        const before = runs
            .filter(r => r.level === level && r.time < time)
            .length;
        runs.push({ level, time, speed, ts: Date.now() });
        runs.sort((a, b) => a.time - b.time);
        if (runs.length > MAX_RUNS) runs.length = MAX_RUNS;
        saveRuns(runs);
        return before + 1;
    }

    function bestTime(level) {
        try {
            const v = parseFloat(localStorage.getItem(BEST_KEY + level));
            return isNaN(v) ? null : v;
        } catch (e) { return null; }
    }

    const LEVEL_NAMES = { 1: 'NIVEAU 1 — Classique', 2: 'NIVEAU 2 — Nuit rapide', 3: 'NIVEAU 3 — Looping', 4: 'CIRCUIT PERSONNALISÉ' };
    const MEDALS = ['🥇', '🥈', '🥉'];

    function render() {
        const box = document.getElementById('scores-content');
        if (!box) return;
        const runs = loadRuns();
        let html = '';
        for (const lvl of [1, 2, 3, 4]) {
            const lvlRuns = runs.filter(r => r.level === lvl).slice(0, 5);
            const best = bestTime(lvl);
            html += '<div class="scores-level">';
            html += '<h2>' + (LEVEL_NAMES[lvl] || 'NIVEAU ' + lvl) +
                ' <span class="lvl-best">' + (best !== null ? '★ ' + fmtTime(best) : '—') + '</span></h2>';
            if (!lvlRuns.length) {
                html += '<div class="scores-empty">Aucune course enregistrée — lance-toi !</div>';
            } else {
                lvlRuns.forEach((r, i) => {
                    const cls = i < 3 ? ' top' + (i + 1) : '';
                    const medal = MEDALS[i] || (i + 1) + 'e';
                    html += '<div class="scores-row' + cls + '">' +
                        '<span class="scores-rank">' + medal + '</span>' +
                        '<span class="scores-time">' + fmtTime(r.time) + '</span>' +
                        '<span class="scores-detail">' + Math.round(r.speed) + ' km/h max • ' + fmtDate(r.ts) + '</span>' +
                        '</div>';
                });
            }
            html += '</div>';
        }
        box.innerHTML = html;
    }

    let resetArmed = false;
    let resetTimer = null;

    function open() {
        render();
        const scr = document.getElementById('scores-screen');
        if (scr) scr.classList.remove('hidden');
    }

    function close() {
        const scr = document.getElementById('scores-screen');
        if (scr) scr.classList.add('hidden');
        disarmReset();
    }

    function isOpen() {
        const scr = document.getElementById('scores-screen');
        return scr && !scr.classList.contains('hidden');
    }

    function disarmReset() {
        resetArmed = false;
        if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
        const btn = document.getElementById('btn-scores-reset');
        if (btn) btn.textContent = '🗑️ EFFACER LES SCORES';
    }

    function armReset() {
        const btn = document.getElementById('btn-scores-reset');
        if (!resetArmed) {
            resetArmed = true;
            if (btn) btn.textContent = '⚠️ CONFIRMER LA SUPPRESSION ?';
            resetTimer = setTimeout(disarmReset, 3000);
        } else {
            try {
                localStorage.removeItem(RUNS_KEY);
                for (const l of [1, 2, 3, 4]) localStorage.removeItem(BEST_KEY + l);
            } catch (e) { /* noop */ }
            disarmReset();
            render();
            if (window.KITT && window.KITT.refreshMenuBest) window.KITT.refreshMenuBest();
        }
    }

    function bind() {
        const closeBtn = document.getElementById('btn-scores-close');
        if (closeBtn) closeBtn.addEventListener('click', () => { if (window.KA) KA.sfx.click(); close(); });
        const resetBtn = document.getElementById('btn-scores-reset');
        if (resetBtn) resetBtn.addEventListener('click', armReset);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    return { addRun, open, close, isOpen, fmtTime };
})();
