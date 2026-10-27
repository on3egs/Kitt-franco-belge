// ============================================
// SPACE INVADERS PRO — Interface Utilisateur
// By Manix - KYRONEXT ARCADE SYSTEM
// ============================================

'use strict';

// ============================================
// MISE À JOUR DE L'INTERFACE EN TEMPS RÉEL
// ============================================

/**
 * Met à jour le timer du pouvoir spécial
 */
function updateSpecialTimer() {
    const timerEl = document.getElementById('special-timer');
    if (!timerEl) return;
    // Le moteur Nebula expose la charge et le bonus courant, pas les anciens
    // compteurs specialActive/specialTimer du prototype.
    if (typeof powerModeUntil !== 'undefined' && powerModeUntil > performance.now()) {
        timerEl.textContent = `${Math.ceil((powerModeUntil - performance.now()) / 1000)}s`;
    } else if (typeof specialCharge !== 'undefined') {
        timerEl.textContent = specialCharge >= 100 ? 'PRÊT' : `${Math.ceil(specialCharge)}%`;
    } else {
        timerEl.textContent = '—';
    }
}

// ============================================
// GESTION DES NOTIFICATIONS
// ============================================

/**
 * Affiche une notification améliorée
 */
function showNotification(message, type = 'info', duration = 3000) {
    const container = document.getElementById('notification-container');
    if (!container) return;
    while (container.children.length >= 6) container.firstElementChild?.remove();
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    container.appendChild(notification);
    
    // Animation
    notification.style.animation = 'fadeInOut 2s ease-in-out forwards';
    
    setTimeout(() => {
        notification.remove();
    }, duration);
}

// ============================================
// EFFETS VISUELS
// ============================================

/**
 * Crée un effet de clignotement sur un élément
 */
function blinkElement(elementId, duration = 1000, times = 3) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    let count = 0;
    const interval = setInterval(() => {
        element.style.opacity = element.style.opacity === '0' ? '1' : '0';
        count++;
        if (count >= times * 2) {
            clearInterval(interval);
            element.style.opacity = '1';
        }
    }, duration / (times * 2));
}

/**
 * Anime un élément
 */
function animateElement(elementId, animationName, duration = 1000) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.style.animation = `${animationName} ${duration}ms ease-out`;
    setTimeout(() => {
        element.style.animation = '';
    }, duration);
}

// ============================================
// SONS ET MUSIQUE
// ============================================

/**
 * Joue un son avec une hauteur différente
 */
function playSoundWithPitch(name, pitch = 1) {
    if (soundEffects[name]) {
        const audio = soundEffects[name].cloneNode();
        audio.playbackRate = pitch;
        audio.volume = CONFIG.soundVolume;
        audio.play().catch(() => {});
    }
}

/**
 * Joue une musique de fond
 */
function playBackgroundMusic(trackName) {
    if (musicPlayer) {
        musicPlayer.src = `/static/games/space_invaders_pro/assets/sounds/music/${trackName}.mp3`;
        musicPlayer.play().catch(() => {});
    }
}

// ============================================
// GESTION DES SCORES
// ============================================

/**
 * Met à jour l'affichage des scores
 */
function getLeaderboard() {
    try { return JSON.parse(localStorage.getItem('spaceInvadersProLeaderboard') || '[]'); }
    catch (_) { return []; }
}

function recordLeaderboardScore(finalScore, playerName) {
    const value = Math.max(0, Math.floor(Number(finalScore) || 0));
    if (!value) return false;
    const cleanName = String(playerName || 'PILOTE').trim().replace(/[^0-9A-Za-zÀ-ÿ _-]/g, '').slice(0, 12) || 'PILOTE';
    const scores = getLeaderboard();
    scores.push({ player: cleanName, score: value, date: new Date().toLocaleDateString('fr-BE') });
    scores.sort((a,b) => b.score - a.score);
    localStorage.setItem('spaceInvadersProLeaderboard', JSON.stringify(scores.slice(0, 30)));
    localStorage.setItem('spaceInvadersProPlayerName', cleanName);
    return true;
}

function prepareHighScoreEntry(finalScore) {
    const input = document.getElementById('gameover-player-name');
    const status = document.getElementById('score-save-status');
    const save = document.getElementById('btn-save-score');
    if (!input || !status || !save) return;
    const suggested = localStorage.getItem('spaceInvadersProPlayerName') || selectedPilot?.name || '';
    input.value = String(suggested).slice(0, 12);
    input.disabled = false;
    save.disabled = false;
    status.textContent = 'Enregistre ton score dans le classement local.';
    save.onclick = () => {
        if (typeof scoreSavedRun !== 'undefined' && scoreSavedRun === gameRunId) {
            status.textContent = 'Score déjà enregistré pour cette partie.';
            return;
        }
        if (!recordLeaderboardScore(finalScore, input.value)) return;
        if (typeof scoreSavedRun !== 'undefined') scoreSavedRun = gameRunId;
        input.disabled = true;
        save.disabled = true;
        status.textContent = '✓ SCORE ENREGISTRÉ';
        updateScoresDisplay('top');
        if (typeof playArcadeJingle === 'function') playArcadeJingle('score');
    };
    input.onkeydown = event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            save.click();
        }
    };
}

function updateScoresDisplay(tab = 'top') {
    const container = document.getElementById('scores-content');
    if (!container) return;
    let scores = getLeaderboard();
    if (tab === 'pilots') {
        const best = new Map();
        for (const s of scores) if (!best.has(s.player) || best.get(s.player).score < s.score) best.set(s.player, s);
        scores = [...best.values()].sort((a,b) => b.score - a.score);
    } else {
        scores = scores.slice(0, 10);
    }
    if (!scores.length) {
        const record = getHighScore();
        container.innerHTML = `<div class="score-empty">Aucune partie enregistrée pour l'instant.${record ? ` Record actuel : <strong>${record.toLocaleString()}</strong>` : ''}</div>`;
        return;
    }
    container.innerHTML = scores.map((s, i) => `
        <div class="score-entry">
            <span class="rank">#${i + 1}</span>
            <span class="player">${s.player}</span>
            <span class="score">${Number(s.score).toLocaleString('fr-BE')}</span>
            <span class="date">${s.date || ''}</span>
        </div>
    `).join('');
}

// ============================================
// EFFETS DE COMBOS
// ============================================

let lastComboTime = 0;

/**
 * Affiche un effet de combo
 */
function showComboEffect(comboCount) {
    if (comboCount <= 1) return;
    
    const now = performance.now();
    if (now - lastComboTime < 500) return;
    lastComboTime = now;
    
    document.querySelectorAll('.combo-notification').forEach(el => el.remove());
    const comboEl = document.createElement('div');
    comboEl.className = 'combo-notification';
    comboEl.textContent = `COMBO x${comboCount}!`;
    comboEl.style.cssText = `
        position: fixed;
        top: 30%;
        left: 50%;
        transform: translateX(-50%);
        font-family: 'Orbitron', sans-serif;
        font-size: 2rem;
        color: #ff00aa;
        text-shadow: 0 0 20px #ff00aa;
        animation: comboPulse 1s ease-out;
        z-index: 1000;
        pointer-events: none;
    `;
    
    document.body.appendChild(comboEl);
    
    setTimeout(() => {
        comboEl.remove();
    }, 1000);
}

// ============================================
// ANIMATIONS CSS SUPPLÉMENTAIRES
// ============================================

/**
 * Ajoute des animations CSS dynamiques
 */
function addDynamicAnimations() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes comboPulse {
            0% { transform: translateX(-50%) scale(0.5); opacity: 0; }
            50% { transform: translateX(-50%) scale(1.2); opacity: 1; }
            100% { transform: translateX(-50%) scale(1); opacity: 0; }
        }
        
        @keyframes scorePulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }
        
        @keyframes healthWarning {
            0% { background: #ff4444; }
            50% { background: #ff0000; }
            100% { background: #ff4444; }
        }
    `;
    document.head.appendChild(style);
}

// ============================================
// GESTION DES CHARGEMENTS
// ============================================

/**
 * Affiche des conseils aléatoires pendant le chargement
 */
function showRandomLoadingTips() {
    const tips = [
        '"La Terre compte sur vous, pilote !"',
        '"Détruisez les envahisseurs avant qu\'ils n\'atteignent la surface !"',
        '"Utilisez vos pouvoirs spéciaux pour survivre aux vagues difficiles !"',
        '"Les combos augmentent vos points : enchaînez les éliminations !"',
        '"Achetez des améliorations dans la boutique entre les vagues !"',
        '"Chaque pilote a des forces uniques : trouvez celui qui vous convient !"',
        '"Les boss apparaissent toutes les 3 vagues : soyez prêt !"',
        '"Protégez vos alliés et défendez la Terre !"'
    ];
    
    const tipEl = document.getElementById('loading-tips');
    if (tipEl) {
        tipEl.innerHTML = `<p>${tips[Math.floor(Math.random() * tips.length)]}</p>`;
    }
}

// ============================================
// MISE EN PLACE
// ============================================

// Appeler les initialisations
addDynamicAnimations();

// Mettre à jour les scores quand on ouvre l'écran
const scoresBtn = document.getElementById('btn-scores');
if (scoresBtn) {
    scoresBtn.addEventListener('click', () => updateScoresDisplay('top'));
}
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateScoresDisplay(btn.dataset.tab || 'top');
    });
});

// Afficher les conseils de chargement
showRandomLoadingTips();

// Mettre à jour l'interface périodiquement
setInterval(() => {
    if (gameState === 'playing') {
        updateSpecialTimer();
    }
}, 100);
