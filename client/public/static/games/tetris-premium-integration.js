/**
 * TETRIS PREMIUM - Intégration pour Kyronext
 * Version refondue avec effets 3D, animations, fond KYRONEXT animé
 * Optimisé pour AGX et Nano
 * 
 * Cette fonction remplace la fonction tetris() originale dans games-advanced.js
 */

// ============================================
// NOUVELLE FONCTION TETRIS PREMIUM
// ============================================

function tetris() {
  renderScores("tetris");
  
  // ==========================================
  // CONFIGURATION PREMIUM
  // ==========================================
  
  const IS_NANO = LOW_POWER_MODE;
  const IS_MOBILE = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 700;
  
  // Couleurs premium KYRONEXT
  const COLORS = {
    tetrisCyan: '#00ffff',
    tetrisBlue: '#00a2ff',
    tetrisOrange: '#ff8c35',
    tetrisYellow: '#ffff00',
    tetrisGreen: '#00ff88',
    tetrisPurple: '#ff4d72',
    tetrisRed: '#ff2a3a',
    bgPanel: 'rgba(4, 5, 11, 0.85)',
    kittCyan: PACMAN_COLORS.kittCyan,
    kittGold: PACMAN_COLORS.kittGold
  };

  // Formes des pièces (Tetrominoes) - Version étendue pour meilleur rendu
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

  // ==========================================
  // ÉTAT DU JEU
  // ==========================================
  
  let board;
  let bag = [];
  let current;
  let next;
  let score = 0;
  let lines = 0;
  let level = 1;
  let fall = 0;
  let paused = false;
  let gameOver = false;
  let scoreSubmitted = false;
  let clearFlashUntil = 0;
  let introUntil = 0;
  let tetrisBoardLayer = null;
  let last = performance.now();
  
  // Effets visuels
  let particles = [];
  let impactEffects = [];
  let lineClearEffects = [];
  
  // Animation KYRONEXT en arrière-plan
  let kyronextLetters = [];
  let kyronextTime = 0;

  // ==========================================
  // INITIALISATION
  // ==========================================

  function initKyronextBackground() {
    const word = 'KYRONEXT';
    const letterWidth = 4;
    const letterHeight = 5;
    const spacing = 2;
    
    // Définition des lettres en pixel art
    const letterDefinitions = {
      'K': [[1,0,0,1],[1,0,1,0],[1,1,0,0],[1,0,1,0],[1,0,0,1]],
      'Y': [[1,0,0,1],[1,0,0,1],[0,1,1,0],[0,0,1,0],[0,0,1,0]],
      'R': [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,1,0],[1,0,0,1]],
      'O': [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
      'N': [[1,0,0,1],[1,1,0,1],[1,0,1,1],[1,0,0,1],[1,0,0,1]],
      'E': [[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,1,1,1]],
      'X': [[1,0,0,1],[0,1,1,0],[0,0,1,0],[0,1,1,0],[1,0,0,1]],
      'T': [[1,1,1,0],[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]
    };
    
    let x = 50;
    for (let i = 0; i < word.length; i++) {
      const letter = word[i];
      const definition = letterDefinitions[letter] || [[1,1,1,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,1]];
      
      kyronextLetters.push({
        letter: letter,
        definition: definition,
        x: x,
        y: 100,
        color: PIECE_COLORS[i % PIECE_COLORS.length]
      });
      
      x += letterWidth + spacing;
    }
  }

  function updateKyronextBackground(time) {
    kyronextTime = time;
    
    for (let i = 0; i < kyronextLetters.length; i++) {
      const letter = kyronextLetters[i];
      letter.driftX = Math.sin(time * 0.001 + i) * 2;
      letter.driftY = Math.cos(time * 0.0015 + i * 0.5) * 2;
      letter.rotation = Math.sin(time * 0.002 + i * 0.3) * 0.05;
    }
  }

  function drawKyronextBackground() {
    if (IS_NANO) return; // Désactivé sur Nano pour performance
    
    ctx.save();
    ctx.globalAlpha = 0.15 + Math.sin(kyronextTime * 0.001) * 0.02;
    
    for (let i = 0; i < kyronextLetters.length; i++) {
      const letter = kyronextLetters[i];
      const cellSize = 8;
      
      ctx.save();
      ctx.translate(letter.x + letter.driftX, letter.y + letter.driftY);
      ctx.rotate(letter.rotation);
      
      for (let y = 0; y < letter.definition.length; y++) {
        for (let x = 0; x < letter.definition[y].length; x++) {
          if (letter.definition[y][x]) {
            const px = x * cellSize;
            const py = y * cellSize;
            
            ctx.fillStyle = letter.color;
            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(px + 1, py + 1, cellSize / 3, cellSize / 3);
          }
        }
      }
      
      ctx.restore();
    }
    
    ctx.restore();
  }

  function initBoardLayer() {
    const layer = document.createElement("canvas");
    layer.width = canvas.width; layer.height = canvas.height;
    const boardCtx = layer.getContext("2d", { alpha: true });
    const originX = 250, originY = 54, cell = 21;
    const bw = 10 * cell, bh = 20 * cell;
    
    const frame = boardCtx.createLinearGradient(originX - 12, originY - 12, originX + bw + 12, originY + bh + 12);
    frame.addColorStop(0, "#2a180c"); frame.addColorStop(0.5, "#1a1208"); frame.addColorStop(1, "#2a180c");
    boardCtx.fillStyle = frame; boardCtx.fillRect(originX - 12, originY - 12, bw + 24, bh + 24);
    boardCtx.fillStyle = "#040506"; boardCtx.fillRect(originX, originY, bw, bh);
    boardCtx.strokeStyle = "#1a1208"; boardCtx.lineWidth = 1; boardCtx.beginPath();
    for (let y = 0; y <= 20; y += 1) { boardCtx.moveTo(originX, originY + y * cell); boardCtx.lineTo(originX + bw, originY + y * cell); }
    for (let x = 0; x <= 10; x += 1) { boardCtx.moveTo(originX + x * cell, originY); boardCtx.lineTo(originX + x * cell, originY + bh); }
    boardCtx.stroke();
    
    // Bordure lumineuse
    boardCtx.strokeStyle = PACMAN_COLORS.kittCyan;
    boardCtx.lineWidth = 2;
    boardCtx.strokeRect(originX - 1, originY - 1, bw + 2, bh + 2);
    
    // Effet miroir en bas
    boardCtx.fillStyle = 'rgba(99, 233, 255, 0.05)';
    boardCtx.fillRect(originX, originY + bh + 2, bw, 4);
    
    tetrisBoardLayer = layer;
  }

  const freshBoard = () => Array.from({ length: 20 }, () => Array(10).fill(0));
  const copyShape = (shape) => shape.map((row) => row.slice());
  
  const newPiece = () => {
    if (!bag.length) bag = [0, 1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
    const index = bag.pop();
    return { shape: copyShape(SHAPES[index]), color: PIECE_COLORS[index], x: 3, y: 0 };
  };

  const reset = () => {
    board = freshBoard();
    bag = [];
    current = newPiece();
    next = newPiece();
    score = 0;
    lines = 0;
    level = 1;
    fall = 0;
    paused = false;
    gameOver = false;
    scoreSubmitted = false;
    clearFlashUntil = 0;
    introUntil = performance.now() + 800;
    last = performance.now();
    particles = [];
    impactEffects = [];
    lineClearEffects = [];
    
    // Initialiser le fond KYRONEXT
    if (kyronextLetters.length === 0) initKyronextBackground();
    
    setLevelMusic("tetris", level);
  };

  const collides = (piece, dx = 0, dy = 0, shape = piece.shape) =>
    shape.some((row, y) =>
      row.some((filled, x) => {
        if (!filled) return false;
        const boardX = piece.x + x + dx;
        const boardY = piece.y + y + dy;
        return boardX < 0 || boardX >= 10 || boardY >= 20 || (boardY >= 0 && board[boardY][boardX]);
      })
    );

  const rotate = () => {
    const rotated = current.shape[0].map((_, index) => current.shape.map((row) => row[index]).reverse());
    for (const offset of [0, -1, 1, -2, 2]) {
      if (!collides(current, offset, 0, rotated)) {
        current.x += offset;
        current.shape = rotated;
        beep(500, 0.045, "triangle");
        return;
      }
    }
  };

  const lock = () => {
    current.shape.forEach((row, y) => row.forEach((filled, x) => {
      if (filled && current.y + y >= 0) board[current.y + y][current.x + x] = current.color;
    }));
    
    let cleared = 0;
    const newBoard = [];
    
    for (let y = 0; y < 20; y++) {
      if (board[y].every(Boolean)) {
        cleared += 1;
        lineClearEffects.push({ y: y, time: performance.now(), color: board[y][0] || PACMAN_COLORS.kittCyan });
      } else {
        newBoard.push(board[y]);
      }
    }
    
    while (newBoard.length < 20) newBoard.unshift(Array(10).fill(0));
    board = newBoard;
    
    if (cleared) {
      clearFlashUntil = performance.now() + 220;
      lines += cleared;
      score += [0, 100, 300, 500, 800][cleared] * level;
      level = Math.min(10, 1 + Math.floor(lines / 10));
      setLevelMusic("tetris", level);
      
      // Sons de line clear
      for (let i = 0; i < cleared; i++) {
        beep(220 + i * 110, 0.1, "triangle");
      }
      beep(440 + cleared * 110, 0.15, "square");
      
      // Effet visuel d'impact
      impactEffects.push({
        x: current.x + Math.floor(current.shape[0].length / 2),
        y: current.y + current.shape.length - 1,
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
    
    current = next;
    next = newPiece();
    if (collides(current)) {
      gameOver = true;
      paused = true;
      beep(150, 0.1, "sawtooth");
      beep(100, 0.2, "sawtooth");
      beep(80, 0.25, "sawtooth");
    }
  };

  const onKey = (event) => {
    if (!activeGame || activeGame.name !== "tetris") return;
    if (event.key === "p" || event.key === "P") {
      paused = !paused;
      beep(paused ? 220 : 440, 0.08);
      return;
    }
    if (event.key === "r" || event.key === "R") {
      reset();
      beep(660, 0.08);
      return;
    }
    if (paused || gameOver) return;
    if (event.key === "ArrowLeft" && !collides(current, -1)) {
      current.x -= 1;
      beep(392, 0.035, "triangle");
    }
    if (event.key === "ArrowRight" && !collides(current, 1)) {
      current.x += 1;
      beep(440, 0.035, "triangle");
    }
    if (event.key === "ArrowDown") {
      if (!collides(current, 0, 1)) {
        current.y += 1;
        score += 1;
      } else {
        lock();
      }
    }
    if (event.key === "ArrowUp") { rotate(); }
    if (event.code === "Space" || event.key === " ") {
      while (!collides(current, 0, 1)) current.y += 1;
      score += 2;
      lock();
      beep(330, 0.05, "triangle");
      event.preventDefault();
    }
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(event.key)) event.preventDefault();
  };

  // ==========================================
  // RENDU PREMIUM
  // ==========================================

  const draw = (now) => {
    const delta = Math.min(0.05, (now - last) / 1000);
    last = now;
    
    // Mise à jour du fond KYRONEXT
    updateKyronextBackground(now);
    
    // Mise à jour des particules
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].x += particles[i].vx;
      particles[i].y += particles[i].vy;
      particles[i].life -= delta * 0.5;
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
    
    // Mise à jour des effets d'impact
    for (let i = impactEffects.length - 1; i >= 0; i--) {
      const effect = impactEffects[i];
      if (now - effect.time > 500) {
        impactEffects.splice(i, 1);
        continue;
      }
    }
    
    // Mise à jour des effets de ligne
    for (let i = lineClearEffects.length - 1; i >= 0; i--) {
      if (now - lineClearEffects[i].time > 400) {
        lineClearEffects.splice(i, 1);
        continue;
      }
    }

    // Logique du jeu
    if (!paused && !gameOver) {
      fall += delta;
      if (fall > Math.max(0.055, 0.72 - level * 0.066)) {
        fall = 0;
        if (!collides(current, 0, 1)) {
          current.y += 1;
          beep(260 + level * 20, 0.02, "triangle");
        } else {
          lock();
          
          // Effet d'impact
          impactEffects.push({
            x: current.x + Math.floor(current.shape[0].length / 2),
            y: current.y + current.shape.length - 1,
            time: now,
            strength: 1
          });
          
          // Particules
          for (let i = 0; i < 5; i++) {
            particles.push({
              x: 250 + (current.x + Math.floor(current.shape[0].length / 2)) * 21 + 10,
              y: 54 + (current.y + current.shape.length - 1) * 21 + 20,
              vx: (Math.random() - 0.5) * 2,
              vy: -1 - Math.random() * 2,
              life: 0.5,
              color: current.color,
              size: 2
            });
          }
        }
      }
    }

    // ========================================
    // DESSIN
    // ========================================
    
    drawBackground();
    
    // Fond KYRONEXT
    drawKyronextBackground();

    // Plateau pré-rendu
    const originX = 250;
    const originY = 54;
    const cell = 21;
    const bw = 10 * cell, bh = 20 * cell;
    
    if (!tetrisBoardLayer) {
      initBoardLayer();
    }
    ctx.drawImage(tetrisBoardLayer, 0, 0);
    
    ctx.save();

    // Bloc 3D amélioré avec glow et bevel
    const block3d = (x, y, color, size = cell, isCurrent = false) => {
      const px = x, py = y, d = Math.max(3, size * .18);
      ctx.save();
      
      // Glow (désactivé sur Nano)
      if (!IS_NANO) {
        ctx.shadowColor = color;
        ctx.shadowBlur = isCurrent ? 15 : (IS_MOBILE ? 0 : 12);
      }
      
      // Corps du bloc
      ctx.fillStyle = color;
      ctx.fillRect(px + 2, py + 2, size - 5, size - 5);
      
      // Bevel supérieur gauche
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath();
      ctx.moveTo(px + 2, py + 2);
      ctx.lineTo(px + size - 3, py + 2);
      ctx.lineTo(px + size - d - 3, py + d);
      ctx.lineTo(px + d, py + d);
      ctx.closePath();
      ctx.fill();
      
      // Bevel gauche
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.moveTo(px + 2, py + 2);
      ctx.lineTo(px + d, py + d);
      ctx.lineTo(px + d, py + size - d - 3);
      ctx.lineTo(px + 2, py + size - 3);
      ctx.closePath();
      ctx.fill();
      
      // Ombre inférieure droite
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.moveTo(px + size - 3, py + 2);
      ctx.lineTo(px + size - d - 3, py + d);
      ctx.lineTo(px + size - d - 3, py + size - d - 3);
      ctx.lineTo(px + size - 3, py + size - 3);
      ctx.closePath();
      ctx.fill();
      
      // Ombre inférieure
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(px + d, py + size - d - 3, size - 2 * d - 3, d);
      
      // Reflet (effet miroir subtil)
      if (!IS_NANO) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.fillRect(px + 3, py + 3, size - 6, 2);
      }
      
      ctx.shadowBlur = 0;
      ctx.restore();
    };

    // Dessiner les blocs posés
    for (let y = 0; y < 20; y += 1) {
      for (let x = 0; x < 10; x += 1) {
        if (board[y][x]) {
          block3d(originX + x * cell, originY + y * cell, board[y][x]);
        }
      }
    }

    // Ghost piece amélioré
    let ghostY = current.y;
    while (!collides({ ...current, y: ghostY }, 0, 1)) ghostY += 1;
    
    ctx.save();
    ctx.globalAlpha = 0.25;
    current.shape.forEach((row, y) => row.forEach((filled, x) => {
      if (filled && ghostY + y >= 0) {
        block3d(originX + (current.x + x) * cell, originY + (ghostY + y) * cell, current.color);
      }
    }));
    ctx.globalAlpha = 1;
    ctx.restore();

    // Pièce courante avec effet spécial
    current.shape.forEach((row, y) => row.forEach((filled, x) => {
      if (filled && current.y + y >= 0) {
        ctx.save();
        if (!IS_NANO) {
          ctx.shadowColor = current.color;
          ctx.shadowBlur = 15;
        }
        block3d(originX + (current.x + x) * cell, originY + (current.y + y) * cell, current.color);
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }));

    ctx.restore();

    // HUD amélioré
    ctx.fillStyle = COLORS.bgPanel;
    ctx.fillRect(16, 0, 700, 56);
    ctx.strokeStyle = PACMAN_COLORS.kittCyan;
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 2, 696, 52);
    
    label(`SCORE ${String(score).padStart(6, "0")}`, 24, 24, 16, PACMAN_COLORS.kittCyan);
    label(`LIGNES ${lines}`, 24, 48, 14, "#a9b9d7");
    label(`NIVEAU ${level}`, 560, 24, 16, PACMAN_COLORS.kittGold);

    // Panneau SUIVANTE amélioré
    ctx.fillStyle = COLORS.bgPanel;
    ctx.fillRect(510, 110, 140, 80);
    ctx.strokeStyle = PACMAN_COLORS.kittCyan;
    ctx.lineWidth = 2;
    ctx.strokeRect(512, 112, 136, 76);
    
    label("SUIVANTE", 520, 128, 14, PACMAN_COLORS.kittCyan);
    
    // Dessiner la pièce suivante avec relief
    next.shape.forEach((row, y) => row.forEach((filled, x) => {
      if (filled) {
        const px = 540 + x * 18, py = 150 + y * 18;
        ctx.save();
        if (!IS_NANO) {
          ctx.shadowColor = next.color;
          ctx.shadowBlur = 10;
        }
        ctx.fillStyle = next.color;
        ctx.fillRect(px, py, 16, 16);
        
        // Bevel
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillRect(px + 2, py + 2, 12, 3);
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(px + 12, py + 5, 3, 9);
        
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }));

    // Flash court après suppression de ligne
    if (now < clearFlashUntil) {
      ctx.save();
      ctx.globalAlpha = 0.18 + 0.16 * Math.abs(Math.sin(now * 0.03));
      ctx.fillStyle = "rgba(0, 162, 255, 0.55)";
      ctx.fillRect(originX, originY, bw, bh);
      ctx.restore();
    }

    // Particules pour drop
    if (Math.random() < 0.2 && !paused && !gameOver) {
      const particleX = originX + (current.x + Math.floor(current.shape[0].length / 2)) * cell + 10;
      const particleY = originY + (current.y + current.shape.length - 1) * cell + 20;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = current.color;
      ctx.beginPath();
      ctx.arc(particleX + (Math.random() - 0.5) * 10, particleY, Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Dessiner les particules
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.save();
      ctx.globalAlpha = p.life * 0.8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Dessiner les effets d'impact
    for (let i = 0; i < impactEffects.length; i++) {
      const effect = impactEffects[i];
      const time = now - effect.time;
      const progress = time / 500;
      
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

    // Dessiner les effets de ligne
    for (let i = 0; i < lineClearEffects.length; i++) {
      const effect = lineClearEffects[i];
      const time = now - effect.time;
      const progress = time / 400;
      
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

    if (gameOver && !scoreSubmitted) { 
      scoreSubmitted = true; 
      setTimeout(() => submitScore("tetris", score), 350); 
    }

    // Écran de pause/fin amélioré
    if (paused) {
      ctx.fillStyle = "rgba(4, 5, 11, 0.85)";
      ctx.fillRect(170, 205, 380, 70);
      
      ctx.strokeStyle = gameOver ? PACMAN_COLORS.kittRed : PACMAN_COLORS.kittCyan;
      ctx.lineWidth = 2;
      ctx.strokeRect(172, 207, 376, 66);
      
      label(
        gameOver ? "GAME OVER — R POUR REJOUER" : "PAUSE — P POUR REPRENDRE",
        gameOver ? 205 : 245,
        247,
        19,
        gameOver ? PACMAN_COLORS.kittRed : PACMAN_COLORS.kittCyan
      );
      
      // Animation de game over
      if (gameOver) {
        ctx.fillStyle = "rgba(255, 42, 58, 0.2 + Math.sin(now * 0.005) * 0.1)";
        ctx.beginPath();
        ctx.arc(360, 247, 40, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // READY/GO transitions
    if (now < introUntil && !paused && !gameOver) {
      ctx.fillStyle = "rgba(4, 5, 11, 0.7)";
      ctx.fillRect(250, 200, 220, 40);
      ctx.strokeStyle = PACMAN_COLORS.kittCyan;
      ctx.lineWidth = 2;
      ctx.strokeRect(252, 202, 216, 36);
      label("GO!", 320, 225, 20, PACMAN_COLORS.kittCyan);
    }
  };

  reset();
  startGame("tetris", "← → déplacer • ↑ tourner • ↓ accélérer • Espace chute • P pause • R recommencer", onKey, draw, reset);
  activeGame.getState = () => ({ game:"tetris", board:board.map(row=>row.slice()), current:{x:current.x,y:current.y,color:current.color,shape:copyShape(current.shape)}, next:{color:next.color,shape:copyShape(next.shape)}, score, lines, level, status:gameOver?"DÉFAITE":paused?"PAUSE":"EN COURS" });
}
