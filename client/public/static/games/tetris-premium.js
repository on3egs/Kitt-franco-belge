/**
 * KYRONEXT TETRIS PREMIUM
 * Refonte complète avec effets 3D, animations, fond KYRONEXT, et ambiance sonore immersive
 * Optimisé pour AGX et Nano
 */

(() => {
  'use strict';

  // ============================================
  // CONFIGURATION & CONSTANTES
  // ============================================

  const IS_NANO = window.KYRONEX_ARCADE_LOW_POWER === true || /Jetson|Nano/.test(navigator.userAgent || '') || ((navigator.hardwareConcurrency || 99) <= 4);
  const IS_MOBILE = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 700;
  
  // Couleurs premium KYRONEXT
  const COLORS = {
    // Couleurs des pièces (thème futuriste)
    tetrisCyan: '#00ffff',
    tetrisBlue: '#00a2ff',
    tetrisOrange: '#ff8c35',
    tetrisYellow: '#ffff00',
    tetrisGreen: '#00ff88',
    tetrisPurple: '#ff4d72',
    tetrisRed: '#ff2a3a',
    
    // Couleurs d'accent
    gold: '#ffd15a',
    kittCyan: '#63e9ff',
    kittGold: '#ffd15a',
    kittAmber: '#ffb528',
    kittRed: '#ff2345',
    
    // Couleurs de fond
    bgDark: '#020305',
    bgDarker: '#000000',
    bgPanel: 'rgba(4, 5, 11, 0.85)',
    
    // Effets lumineux
    glowCyan: 'rgba(99, 233, 255, 0.5)',
    glowGold: 'rgba(255, 209, 90, 0.5)',
    glowWhite: 'rgba(255, 255, 255, 0.3)'
  };

  // Formes des pièces (Tetrominoes)
  const SHAPES = [
    [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],  // I
    [[1, 1], [1, 1]],                                          // O
    [[0, 1, 0], [1, 1, 1], [0, 0, 0]],                      // T
    [[1, 0, 0], [1, 1, 1], [0, 0, 0]],                      // L
    [[0, 0, 1], [1, 1, 1], [0, 0, 0]],                      // J
    [[1, 1, 0], [0, 1, 1], [0, 0, 0]],                      // S
    [[0, 1, 1], [1, 1, 0], [0, 0, 0]]                       // Z
  ];

  // Couleurs des pièces (thème premium)
  const PIECE_COLORS = [
    COLORS.tetrisCyan,    // I
    COLORS.tetrisYellow,  // O
    COLORS.tetrisPurple,  // T
    COLORS.tetrisOrange,  // L
    COLORS.tetrisBlue,    // J
    COLORS.tetrisGreen,   // S
    COLORS.tetrisRed      // Z
  ];

  // ============================================
  // ÉTAT DU JEU
  // ============================================

  let canvas, ctx;
  let board = [];
  let currentPiece, nextPiece;
  let bag = [];
  let score = 0;
  let lines = 0;
  let level = 1;
  let fallTime = 0;
  let fallSpeed = 0.5;
  let gameOver = false;
  let paused = false;
  let lastTime = 0;
  let particles = [];
  let impactEffects = [];
  let lineClearEffects = [];
  let boardLayer = null;
  let kyronextBackground = null;
  let soundEnabled = true;
  let audioContext = null;
  
  // Animation KYRONEXT en arrière-plan
  let kyronextLetters = [];
  let kyronextTime = 0;

  // ============================================
  // INITIALISATION
  // ============================================

  function initTetrisPremium() {
    canvas = document.getElementById('arcade-canvas');
    ctx = canvas.getContext('2d');
    
    if (!canvas || !ctx) {
      console.error('Canvas non trouvé pour Tetris Premium');
      return;
    }

    // Initialisation de l'audio
    initAudio();
    
    // Initialisation du fond KYRONEXT
    initKyronextBackground();
    
    // Initialisation du plateau pré-rendu
    initBoardLayer();
    
    // Réinitialisation du jeu
    resetGame();
    
    // Démarrage de la boucle principale
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
    
    // Gestion des touches
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  }

  function initAudio() {
    if (!soundEnabled) return;
    
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Création des oscillateurs pour les effets sonores
      const masterGain = audioContext.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(audioContext.destination);
    } catch (e) {
      console.log('Audio non disponible:', e);
      soundEnabled = false;
    }
  }

  function beep(frequency, duration, type = 'triangle') {
    if (!soundEnabled || !audioContext) return;
    
    try {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gainNode.gain.value = 0.1;
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
      
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    } catch (e) {
      console.log('Erreur son:', e);
    }
  }

  // ============================================
  // FOND ANIMÉ KYRONEXT
  // ============================================

  function initKyronextBackground() {
    // Création des lettres KYRONEXT avec des pièces Tetris
    const word = 'KYRONEXT';
    const letterWidth = 4;
    const letterHeight = 5;
    const spacing = 2;
    
    // Définition des lettres en mode "pixel art" avec des blocs
    const letterDefinitions = {
      'K': [
        [1, 0, 0, 1],
        [1, 0, 1, 0],
        [1, 1, 0, 0],
        [1, 0, 1, 0],
        [1, 0, 0, 1]
      ],
      'Y': [
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [0, 1, 1, 0],
        [0, 0, 1, 0],
        [0, 0, 1, 0]
      ],
      'R': [
        [1, 1, 1, 0],
        [1, 0, 0, 1],
        [1, 1, 1, 0],
        [1, 0, 1, 0],
        [1, 0, 0, 1]
      ],
      'O': [
        [0, 1, 1, 0],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [0, 1, 1, 0]
      ],
      'N': [
        [1, 0, 0, 1],
        [1, 1, 0, 1],
        [1, 0, 1, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1]
      ],
      'E': [
        [1, 1, 1, 1],
        [1, 0, 0, 0],
        [1, 1, 1, 0],
        [1, 0, 0, 0],
        [1, 1, 1, 1]
      ],
      'X': [
        [1, 0, 0, 1],
        [0, 1, 1, 0],
        [0, 0, 1, 0],
        [0, 1, 1, 0],
        [1, 0, 0, 1]
      ],
      'T': [
        [1, 1, 1, 0],
        [0, 1, 0, 0],
        [0, 1, 0, 0],
        [0, 1, 0, 0],
        [0, 1, 0, 0]
      ]
    };
    
    let x = 50;
    for (let i = 0; i < word.length; i++) {
      const letter = word[i];
      const definition = letterDefinitions[letter] || [[1, 1, 1, 1], [1, 0, 0, 1], [1, 0, 0, 1], [1, 0, 0, 1], [1, 1, 1, 1]];
      
      kyronextLetters.push({
        letter: letter,
        definition: definition,
        x: x,
        y: 100,
        width: letterWidth,
        height: letterHeight,
        color: PIECE_COLORS[i % PIECE_COLORS.length],
        rotation: 0,
        driftX: 0,
        driftY: 0,
        wobble: Math.random() * 0.1,
        speed: 0.02 + Math.random() * 0.03
      });
      
      x += letterWidth + spacing;
    }
  }

  function updateKyronextBackground(time) {
    kyronextTime = time;
    
    for (let i = 0; i < kyronextLetters.length; i++) {
      const letter = kyronextLetters[i];
      
      // Mouvement de flottement
      letter.driftX += Math.sin(time * 0.001 + i) * 0.01;
      letter.driftY += Math.cos(time * 0.0015 + i * 0.5) * 0.01;
      
      // Légère rotation
      letter.rotation = Math.sin(time * 0.002 + i * 0.3) * 0.05;
      
      // Wobble (instabilité douce)
      letter.wobble = Math.sin(time * 0.003 + i * 0.7) * 0.02;
    }
  }

  function drawKyronextBackground() {
    if (IS_NANO && !IS_MOBILE) return; // Désactivé sur Nano pour performance
    
    ctx.save();
    ctx.globalAlpha = 0.15 + Math.sin(kyronextTime * 0.001) * 0.02;
    
    for (let i = 0; i < kyronextLetters.length; i++) {
      const letter = kyronextLetters[i];
      const cellSize = 8;
      
      ctx.save();
      ctx.translate(letter.x + letter.driftX, letter.y + letter.driftY);
      ctx.rotate(letter.rotation);
      
      // Dessiner chaque bloc de la lettre
      for (let y = 0; y < letter.definition.length; y++) {
        for (let x = 0; x < letter.definition[y].length; x++) {
          if (letter.definition[y][x]) {
            const px = x * cellSize;
            const py = y * cellSize;
            
            // Effet 3D subtil
            ctx.fillStyle = letter.color;
            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
            
            // Ombre
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
            
            // Reflet
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(px + 1, py + 1, cellSize / 3, cellSize / 3);
          }
        }
      }
      
      ctx.restore();
    }
    
    ctx.restore();
  }

  // ============================================
  // PLATEAU PRÉ-RENDU
  // ============================================

  function initBoardLayer() {
    const layer = document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const layerCtx = layer.getContext('2d');
    
    // Fond du plateau avec effet de profondeur
    const originX = 250;
    const originY = 54;
    const cell = 21;
    const bw = 10 * cell;
    const bh = 20 * cell;
    
    // Dégradé pour l'effet 3D
    const gradient = layerCtx.createLinearGradient(originX - 12, originY - 12, originX + bw + 12, originY + bh + 12);
    gradient.addColorStop(0, '#1a1208');
    gradient.addColorStop(0.5, '#0a0b0f');
    gradient.addColorStop(1, '#1a1208');
    
    layerCtx.fillStyle = gradient;
    layerCtx.fillRect(originX - 12, originY - 12, bw + 24, bh + 24);
    
    // Plateau principal
    layerCtx.fillStyle = '#040506';
    layerCtx.fillRect(originX, originY, bw, bh);
    
    // Grille
    layerCtx.strokeStyle = '#1a1208';
    layerCtx.lineWidth = 1;
    layerCtx.beginPath();
    
    for (let y = 0; y <= 20; y += 1) {
      layerCtx.moveTo(originX, originY + y * cell);
      layerCtx.lineTo(originX + bw, originY + y * cell);
    }
    
    for (let x = 0; x <= 10; x += 1) {
      layerCtx.moveTo(originX + x * cell, originY);
      layerCtx.lineTo(originX + x * cell, originY + bh);
    }
    
    layerCtx.stroke();
    
    // Bordure lumineuse
    layerCtx.strokeStyle = COLORS.kittCyan;
    layerCtx.lineWidth = 2;
    layerCtx.strokeRect(originX - 1, originY - 1, bw + 2, bh + 2);
    
    // Effet miroir en bas
    layerCtx.fillStyle = 'rgba(99, 233, 255, 0.05)';
    layerCtx.fillRect(originX, originY + bh + 2, bw, 4);
    
    boardLayer = layer;
  }

  // ============================================
  // LOGIQUE DU JEU
  // ============================================

  function resetGame() {
    board = Array.from({ length: 20 }, () => Array(10).fill(0));
    bag = [];
    currentPiece = newPiece();
    nextPiece = newPiece();
    score = 0;
    lines = 0;
    level = 1;
    fallTime = 0;
    fallSpeed = 0.5;
    gameOver = false;
    paused = false;
    particles = [];
    impactEffects = [];
    lineClearEffects = [];
    
    // Démarrer la musique
    startMusic();
  }

  function newPiece() {
    if (!bag.length) {
      bag = [0, 1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
    }
    
    const index = bag.pop();
    return {
      shape: SHAPES[index],
      color: PIECE_COLORS[index],
      x: Math.floor(10 / 2) - Math.floor(SHAPES[index][0].length / 2),
      y: 0
    };
  }

  function collides(piece, dx = 0, dy = 0, shape = piece.shape) {
    return shape.some((row, y) =>
      row.some((filled, x) => {
        if (!filled) return false;
        const boardX = piece.x + x + dx;
        const boardY = piece.y + y + dy;
        return boardX < 0 || boardX >= 10 || boardY >= 20 || (boardY >= 0 && board[boardY][boardX]);
      })
    );
  }

  function rotate() {
    const rotated = currentPiece.shape[0].map((_, index) =>
      currentPiece.shape.map((row) => row[index]).reverse()
    );
    
    // Wall kicks
    for (const offset of [0, -1, 1, -2, 2]) {
      if (!collides(currentPiece, offset, 0, rotated)) {
        currentPiece.x += offset;
        currentPiece.shape = rotated;
        beep(500, 0.045, 'triangle');
        return;
      }
    }
  }

  function lockPiece() {
    // Placer la pièce sur le plateau
    currentPiece.shape.forEach((row, y) => {
      row.forEach((filled, x) => {
        if (filled && currentPiece.y + y >= 0) {
          board[currentPiece.y + y][currentPiece.x + x] = currentPiece.color;
        }
      });
    });
    
    // Vérifier les lignes complétées
    let cleared = 0;
    const newBoard = [];
    
    for (let y = 0; y < 20; y++) {
      if (board[y].every(Boolean)) {
        cleared += 1;
        // Animation de suppression
        lineClearEffects.push({
          y: y,
          time: performance.now(),
          color: board[y][0] || COLORS.kittCyan
        });
      } else {
        newBoard.push(board[y]);
      }
    }
    
    // Ajouter les lignes vides en haut
    while (newBoard.length < 20) {
      newBoard.unshift(Array(10).fill(0));
    }
    
    board = newBoard;
    
    // Mettre à jour le score
    if (cleared) {
      lines += cleared;
      score += [0, 100, 300, 500, 800][cleared] * level;
      level = Math.min(10, 1 + Math.floor(lines / 10));
      fallSpeed = Math.max(0.05, 0.5 - level * 0.045);
      
      // Effets sonores
      for (let i = 0; i < cleared; i++) {
        beep(220 + i * 110, 0.1, 'triangle');
      }
      beep(440 + cleared * 110, 0.15, 'square');
      
      // Effet visuel d'impact
      impactEffects.push({
        x: currentPiece.x + Math.floor(currentPiece.shape[0].length / 2),
        y: currentPiece.y + currentPiece.shape.length - 1,
        time: performance.now(),
        strength: cleared * 0.5
      });
      
      // Particules pour les lignes
      for (let i = 0; i < cleared * 10; i++) {
        particles.push({
          x: 250 + Math.random() * 210,
          y: 54 + Math.random() * 420,
          vx: (Math.random() - 0.5) * 2,
          vy: -1 - Math.random() * 2,
          life: 1,
          color: PIECE_COLORS[Math.floor(Math.random() * PIECE_COLORS.length)],
          size: 2 + Math.random() * 3
        });
      }
    }
    
    // Nouvelle pièce
    currentPiece = nextPiece;
    nextPiece = newPiece();
    
    // Vérifier game over
    if (collides(currentPiece)) {
      gameOver = true;
      paused = true;
      beep(150, 0.1, 'sawtooth');
      beep(100, 0.2, 'sawtooth');
      beep(80, 0.25, 'sawtooth');
    }
  }

  // ============================================
  // RENDU
  // ============================================

  function drawBlock(x, y, color, size = 21, isCurrent = false) {
    const px = x;
    const py = y;
    const d = Math.max(3, size * 0.18);
    
    ctx.save();
    
    // Glow (désactivé sur Nano)
    if (!IS_NANO) {
      ctx.shadowColor = color;
      ctx.shadowBlur = isCurrent ? 15 : (IS_MOBILE ? 0 : 12);
    }
    
    // Corps du bloc avec effet 3D
    ctx.fillStyle = color;
    ctx.fillRect(px + 2, py + 2, size - 5, size - 5);
    
    // Bevel supérieur gauche
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.moveTo(px + 2, py + 2);
    ctx.lineTo(px + size - 3, py + 2);
    ctx.lineTo(px + size - d - 3, py + d);
    ctx.lineTo(px + d, py + d);
    ctx.closePath();
    ctx.fill();
    
    // Bevel gauche
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.moveTo(px + 2, py + 2);
    ctx.lineTo(px + d, py + d);
    ctx.lineTo(px + d, py + size - d - 3);
    ctx.lineTo(px + 2, py + size - 3);
    ctx.closePath();
    ctx.fill();
    
    // Ombre inférieure droite
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.moveTo(px + size - 3, py + 2);
    ctx.lineTo(px + size - d - 3, py + d);
    ctx.lineTo(px + size - d - 3, py + size - d - 3);
    ctx.lineTo(px + size - 3, py + size - 3);
    ctx.closePath();
    ctx.fill();
    
    // Ombre inférieure
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(px + d, py + size - d - 3, size - 2 * d - 3, d);
    
    // Reflet (effet miroir subtil)
    if (!IS_NANO) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(px + 3, py + 3, size - 6, 2);
    }
    
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawPiece(piece, offsetX = 0, offsetY = 0, ghost = false) {
    const originX = 250;
    const originY = 54;
    const cell = 21;
    
    ctx.save();
    
    if (ghost) {
      ctx.globalAlpha = 0.25;
    }
    
    piece.shape.forEach((row, y) => {
      row.forEach((filled, x) => {
        if (filled && piece.y + y >= 0) {
          drawBlock(
            originX + (piece.x + x + offsetX) * cell,
            originY + (piece.y + y + offsetY) * cell,
            piece.color,
            cell,
            !ghost
          );
        }
      });
    });
    
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawBoard() {
    const originX = 250;
    const originY = 54;
    const cell = 21;
    
    // Dessiner le plateau pré-rendu
    if (boardLayer) {
      ctx.drawImage(boardLayer, 0, 0);
    }
    
    // Dessiner les blocs posés
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        if (board[y][x]) {
          drawBlock(originX + x * cell, originY + y * cell, board[y][x], cell, false);
        }
      }
    }
  }

  function drawGhostPiece() {
    let ghostY = currentPiece.y;
    
    while (!collides({ ...currentPiece, y: ghostY }, 0, 1)) {
      ghostY += 1;
    }
    
    drawPiece({ ...currentPiece, y: ghostY }, 0, 0, true);
  }

  function drawNextPiece() {
    const originX = 540;
    const originY = 150;
    const cell = 18;
    
    // Panneau SUIVANTE
    ctx.fillStyle = COLORS.bgPanel;
    ctx.fillRect(510, 110, 140, 80);
    
    ctx.strokeStyle = COLORS.kittCyan;
    ctx.lineWidth = 2;
    ctx.strokeRect(512, 112, 136, 76);
    
    label('SUIVANTE', 520, 128, 14, COLORS.kittCyan);
    
    // Dessiner la pièce suivante
    nextPiece.shape.forEach((row, y) => {
      row.forEach((filled, x) => {
        if (filled) {
          const px = originX + x * cell;
          const py = originY + y * cell;
          
          ctx.save();
          
          if (!IS_NANO) {
            ctx.shadowColor = nextPiece.color;
            ctx.shadowBlur = 10;
          }
          
          ctx.fillStyle = nextPiece.color;
          ctx.fillRect(px, py, 16, 16);
          
          // Bevel
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.fillRect(px + 2, py + 2, 12, 3);
          
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.fillRect(px + 12, py + 5, 3, 9);
          
          ctx.shadowBlur = 0;
          ctx.restore();
        }
      });
    });
  }

  function drawHUD() {
    // HUD principal
    ctx.fillStyle = COLORS.bgPanel;
    ctx.fillRect(16, 0, 700, 56);
    
    ctx.strokeStyle = COLORS.kittCyan;
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 2, 696, 52);
    
    label(`SCORE ${String(score).padStart(6, '0')}`, 24, 24, 16, COLORS.kittCyan);
    label(`LIGNES ${lines}`, 24, 48, 14, '#a9b9d7');
    label(`NIVEAU ${level}`, 560, 24, 16, COLORS.kittGold);
  }

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.01;
      
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      
      ctx.save();
      ctx.globalAlpha = p.life * 0.8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawImpactEffects() {
    for (let i = impactEffects.length - 1; i >= 0; i--) {
      const effect = impactEffects[i];
      const time = performance.now() - effect.time;
      
      if (time > 500) {
        impactEffects.splice(i, 1);
        continue;
      }
      
      const progress = time / 500;
      const originX = 250;
      const originY = 54;
      const cell = 21;
      
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      
      // Cercle d'impact
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 2 * (1 - progress);
      ctx.beginPath();
      ctx.arc(
        originX + effect.x * cell + cell / 2,
        originY + effect.y * cell + cell / 2,
        10 * effect.strength * (1 - progress),
        0,
        Math.PI * 2
      );
      ctx.stroke();
      
      // Particules d'impact
      for (let j = 0; j < 5; j++) {
        const angle = (j / 5) * Math.PI * 2;
        const distance = 15 * effect.strength * (1 - progress);
        const px = originX + effect.x * cell + cell / 2 + Math.cos(angle) * distance;
        const py = originY + effect.y * cell + cell / 2 + Math.sin(angle) * distance;
        
        ctx.fillStyle = effect.color;
        ctx.beginPath();
        ctx.arc(px, py, 2 * (1 - progress), 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.restore();
    }
  }

  function drawLineClearEffects() {
    for (let i = lineClearEffects.length - 1; i >= 0; i--) {
      const effect = lineClearEffects[i];
      const time = performance.now() - effect.time;
      
      if (time > 400) {
        lineClearEffects.splice(i, 1);
        continue;
      }
      
      const progress = time / 400;
      const originX = 250;
      const originY = 54;
      const cell = 21;
      
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      
      // Flash de la ligne
      ctx.fillStyle = effect.color;
      ctx.fillRect(
        originX,
        originY + effect.y * cell,
        10 * cell,
        cell
      );
      
      // Effet de particules
      for (let x = 0; x < 10; x++) {
        const px = originX + x * cell + cell / 2;
        const py = originY + effect.y * cell + cell / 2;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5 * (1 - progress))';
        ctx.beginPath();
        ctx.arc(px, py, 3 * (1 - progress), 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.restore();
    }
  }

  function drawGameOver() {
    if (!gameOver) return;
    
    ctx.fillStyle = 'rgba(4, 5, 11, 0.85)';
    ctx.fillRect(170, 205, 380, 70);
    
    ctx.strokeStyle = COLORS.kittRed;
    ctx.lineWidth = 2;
    ctx.strokeRect(172, 207, 376, 66);
    
    label('GAME OVER — R POUR REJOUER', 205, 247, 19, COLORS.kittRed);
    
    // Animation de game over
    ctx.fillStyle = 'rgba(255, 42, 58, 0.2 + Math.sin(performance.now() * 0.005) * 0.1)';
    ctx.beginPath();
    ctx.arc(360, 247, 40, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPause() {
    if (!paused || gameOver) return;
    
    ctx.fillStyle = 'rgba(4, 5, 11, 0.85)';
    ctx.fillRect(240, 205, 240, 70);
    
    ctx.strokeStyle = COLORS.kittCyan;
    ctx.lineWidth = 2;
    ctx.strokeRect(242, 207, 236, 66);
    
    label('PAUSE — P POUR REPRENDRE', 270, 247, 19, COLORS.kittCyan);
  }

  function drawIntro() {
    const introTime = 800;
    const time = performance.now() - (lastTime - introTime);
    
    if (time < introTime && !paused && !gameOver) {
      ctx.fillStyle = 'rgba(4, 5, 11, 0.7)';
      ctx.fillRect(250, 200, 220, 40);
      
      ctx.strokeStyle = COLORS.kittCyan;
      ctx.lineWidth = 2;
      ctx.strokeRect(252, 202, 216, 36);
      
      label('GO!', 320, 225, 20, COLORS.kittCyan);
    }
  }

  // ============================================
  // BOUCLE PRINCIPALE
  // ============================================

  function gameLoop(now) {
    const deltaTime = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    
    // Mise à jour
    if (!paused && !gameOver) {
      updateGame(deltaTime, now);
    }
    
    // Rendu
    drawGame(now);
    
    // Continuer la boucle
    requestAnimationFrame(gameLoop);
  }

  function updateGame(deltaTime, now) {
    // Mise à jour du fond KYRONEXT
    updateKyronextBackground(now);
    
    // Chute de la pièce
    fallTime += deltaTime;
    
    if (fallTime > fallSpeed) {
      fallTime = 0;
      
      if (!collides(currentPiece, 0, 1)) {
        currentPiece.y += 1;
        beep(260 + level * 20, 0.02, 'triangle');
      } else {
        lockPiece();
        
        // Effet d'impact
        impactEffects.push({
          x: currentPiece.x + Math.floor(currentPiece.shape[0].length / 2),
          y: currentPiece.y + currentPiece.shape.length - 1,
          time: now,
          strength: 1
        });
        
        // Particules
        for (let i = 0; i < 5; i++) {
          particles.push({
            x: 250 + (currentPiece.x + Math.floor(currentPiece.shape[0].length / 2)) * 21 + 10,
            y: 54 + (currentPiece.y + currentPiece.shape.length - 1) * 21 + 20,
            vx: (Math.random() - 0.5) * 2,
            vy: -1 - Math.random() * 2,
            life: 0.5,
            color: currentPiece.color,
            size: 2
          });
        }
      }
    }
    
    // Mise à jour des particules
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].x += particles[i].vx;
      particles[i].y += particles[i].vy;
      particles[i].life -= deltaTime * 0.5;
      
      if (particles[i].life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  function drawGame(now) {
    // Fond
    drawBackground();
    
    // Fond KYRONEXT
    drawKyronextBackground();
    
    // Plateau et pièces
    drawBoard();
    drawGhostPiece();
    drawPiece(currentPiece);
    
    // Effets
    drawParticles();
    drawImpactEffects();
    drawLineClearEffects();
    
    // HUD
    drawHUD();
    drawNextPiece();
    
    // Overlays
    drawGameOver();
    drawPause();
    drawIntro();
  }

  function drawBackground() {
    // Fond principal
    ctx.fillStyle = COLORS.bgDark;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Grille de fond (style cahier)
    ctx.strokeStyle = '#17233c';
    ctx.lineWidth = 1;
    
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  // ============================================
  // UTILITAIRES
  // ============================================

  function label(text, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.font = `${size}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function handleKeyDown(event) {
    if (!activeGame || activeGame.name !== 'tetris') return;
    
    if (event.key === 'p' || event.key === 'P') {
      paused = !paused;
      beep(paused ? 220 : 440, 0.08);
      return;
    }
    
    if (event.key === 'r' || event.key === 'R') {
      resetGame();
      beep(660, 0.08);
      return;
    }
    
    if (paused || gameOver) return;
    
    if (event.key === 'ArrowLeft' && !collides(currentPiece, -1)) {
      currentPiece.x -= 1;
      beep(392, 0.035, 'triangle');
    }
    
    if (event.key === 'ArrowRight' && !collides(currentPiece, 1)) {
      currentPiece.x += 1;
      beep(440, 0.035, 'triangle');
    }
    
    if (event.key === 'ArrowDown') {
      if (!collides(currentPiece, 0, 1)) {
        currentPiece.y += 1;
        score += 1;
      } else {
        lockPiece();
      }
    }
    
    if (event.key === 'ArrowUp') {
      rotate();
    }
    
    if (event.code === 'Space' || event.key === ' ') {
      while (!collides(currentPiece, 0, 1)) {
        currentPiece.y += 1;
        score += 2;
      }
      lockPiece();
      beep(330, 0.05, 'triangle');
      event.preventDefault();
    }
    
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
    }
  }

  function handleKeyUp(event) {
    // Peut être utilisé pour des actions spécifiques
  }

  // ============================================
  // MUSIQUE
  // ============================================

  let musicOscillators = [];
  let musicTimer = null;
  let musicStep = 0;
  let musicNotes = [110, 138, 165, 196, 165, 138, 123, 147];
  let musicTempo = 380;

  function startMusic() {
    if (!soundEnabled || !audioContext || musicTimer) return;
    
    musicTimer = setInterval(() => {
      if (!soundEnabled || !audioContext) {
        clearInterval(musicTimer);
        musicTimer = null;
        return;
      }
      
      try {
        const note = musicNotes[musicStep % musicNotes.length];
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.value = note * (1 + level * 0.05);
        gainNode.gain.value = 0.05;
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.2);
        
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
        
        musicStep++;
      } catch (e) {
        console.log('Erreur musique:', e);
      }
    }, musicTempo);
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
    
    musicOscillators.forEach(osc => {
      try {
        osc.stop();
      } catch (e) {}
    });
    musicOscillators = [];
  }

  // ============================================
  // INTÉGRATION AVEC KYRONEXT
  // ============================================

  function startTetrisPremium() {
    // Masquer le menu
    document.getElementById('arcade').classList.remove('hidden');
    document.getElementById('arcade-title').textContent = 'TETRIS PREMIUM';
    document.getElementById('arcade-help').textContent = '← → déplacer • ↑ tourner • ↓ accélérer • Espace chute • P pause • R recommencer';
    
    // Initialiser le jeu
    initTetrisPremium();
  }

  // Exposer la fonction pour l'intégration
  window.startTetrisPremium = startTetrisPremium;

  // Si on est déjà sur la page arcade, initialiser
  if (document.getElementById('arcade') && document.getElementById('arcade').classList.contains('hidden') === false) {
    // Attendre que le DOM soit prêt
    if (document.readyState === 'complete') {
      startTetrisPremium();
    } else {
      window.addEventListener('load', startTetrisPremium);
    }
  }
})();
