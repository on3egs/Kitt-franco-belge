(() => {
  const arcade = document.getElementById('arcade');
  const canvas = document.getElementById('arcade-canvas');
  const ctx = canvas && canvas.getContext('2d');
  const title = document.getElementById('arcade-title');
  const help = document.getElementById('arcade-help');
  const scoreDisplay = document.getElementById('arcade-score');
  const levelDisplay = document.getElementById('arcade-level');
  
  let raf = 0;
  let key = {};
  let score = 0;
  let level = 1;
  let gameSpeed = 1;
  let soundEnabled = true;
  
  // Amélioration : Gestion des scores et niveaux
  function updateScore(points) {
    score += points * level;
    if (scoreDisplay) scoreDisplay.textContent = `SCORE: ${score}`;
    // Niveau suivant chaque 1000 points
    if (score >= level * 1000) {
      level++;
      gameSpeed = 1 + (level * 0.1);
      if (levelDisplay) levelDisplay.textContent = `NIVEAU: ${level}`;
      playSound('levelup');
    }
  }
  
  function resetScore() {
    score = 0;
    level = 1;
    gameSpeed = 1;
    if (scoreDisplay) scoreDisplay.textContent = `SCORE: ${score}`;
    if (levelDisplay) levelDisplay.textContent = `NIVEAU: ${level}`;
  }
  
  // Amélioration : Système audio basique
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  function playSound(type) {
    if (!soundEnabled || !audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    switch(type) {
      case 'eat':
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // La4
        oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.05);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
        break;
      case 'collision':
        oscillator.frequency.setValueAtTime(220, audioContext.currentTime); // La3
        oscillator.frequency.exponentialRampToValueAtTime(110, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
        break;
      case 'levelup':
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.05);
        oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
        break;
    }
  }
  
  function toggleSound() {
    soundEnabled = !soundEnabled;
    return soundEnabled;
  }

  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    arcade.classList.add('hidden');
    resetScore();
    key = {};
  };

  document.getElementById('back').onclick = stop;
  
  // Amélioration : Gestion des touches avec prévention des répétitions
  addEventListener('keydown', e => {
    // Empêcher le défilement avec les flèches
    if ([37, 38, 39, 40, 32].includes(e.keyCode)) {
      e.preventDefault();
    }
    key[e.key] = true;
    if (e.key === 'Escape') stop();
  });
  
  addEventListener('keyup', e => {
    key[e.key] = false;
  });

  // Amélioration : Grille plus esthétique
  function frame() {
    ctx.fillStyle = '#020306';
    ctx.fillRect(0, 0, 720, 480);
    
    // Grille subtile
    ctx.strokeStyle = '#17233c';
    ctx.globalAlpha = 0.5;
    for (let x = 0; x < 720; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 480);
      ctx.stroke();
    }
    for (let y = 0; y < 480; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(720, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Amélioration : Pac-Man avec fantômes et points
  function pacman() {
    resetScore();
    help.textContent = 'Flèches pour bouger. Échap ou RETOUR pour sortir.';
    
    let x = 360, y = 240, a = 0;
    const radius = 18;
    const mouthOpen = 0.35;
    
    // Créer des points à collecter
    const points = [];
    const gridSize = 40;
    const offset = 20;
    
    // Générer des points aléatoires
    for (let i = 0; i < 50; i++) {
      points.push({
        x: Math.floor(Math.random() * (720 / gridSize)) * gridSize + offset,
        y: Math.floor(Math.random() * (480 / gridSize)) * gridSize + offset,
        collected: false
      });
    }
    
    // Fantômes
    const ghosts = [
      { x: 100, y: 100, speed: 1.5, direction: { x: 1, y: 0 }, color: '#ff5555' },
      { x: 620, y: 100, speed: 1.2, direction: { x: -1, y: 0 }, color: '#55ffff' },
      { x: 100, y: 380, speed: 1.8, direction: { x: 0, y: -1 }, color: '#ff55ff' },
      { x: 620, y: 380, speed: 1.4, direction: { x: 0, y: -1 }, color: '#ffff55' }
    ];
    
    const loop = () => {
      frame();
      
      // Mouvement de Pac-Man
      if (key.ArrowLeft) x -= 3 * gameSpeed;
      if (key.ArrowRight) x += 3 * gameSpeed;
      if (key.ArrowUp) y -= 3 * gameSpeed;
      if (key.ArrowDown) y += 3 * gameSpeed;
      
      x = Math.max(radius + 2, Math.min(720 - radius - 2, x));
      y = Math.max(radius + 2, Math.min(480 - radius - 2, y));
      
      // Collecter les points
      for (let i = 0; i < points.length; i++) {
        if (!points[i].collected) {
          const dx = x - points[i].x;
          const dy = y - points[i].y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < radius + 5) {
            points[i].collected = true;
            updateScore(10);
            playSound('eat');
          }
        }
      }
      
      // Dessiner les points non collectés
      ctx.fillStyle = '#ffffaa';
      for (let point of points) {
        if (!point.collected) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      // Dessiner les fantômes
      ghosts.forEach(ghost => {
        // Mouvement aléatoire des fantômes
        if (Math.random() < 0.02) {
          const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
          const randomDir = directions[Math.floor(Math.random() * directions.length)];
          ghost.direction = randomDir;
        }
        
        ghost.x += ghost.direction.x * ghost.speed;
        ghost.y += ghost.direction.y * ghost.speed;
        
        // Rebound sur les bords
        if (ghost.x < 10 || ghost.x > 710) ghost.direction.x *= -1;
        if (ghost.y < 10 || ghost.y > 470) ghost.direction.y *= -1;
        
        // Dessiner le fantôme
        ctx.fillStyle = ghost.color;
        ctx.beginPath();
        ctx.arc(ghost.x, ghost.y - 5, 15, 0, Math.PI);
        ctx.lineTo(ghost.x + 15, ghost.y + 5);
        ctx.lineTo(ghost.x + 10, ghost.y + 5);
        ctx.lineTo(ghost.x + 5, ghost.y);
        ctx.lineTo(ghost.x, ghost.y + 5);
        ctx.lineTo(ghost.x - 5, ghost.y);
        ctx.lineTo(ghost.x - 10, ghost.y + 5);
        ctx.lineTo(ghost.x - 15, ghost.y + 5);
        ctx.closePath();
        ctx.fill();
        
        // Yeux
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ghost.x - 5, ghost.y - 3, 3, 0, Math.PI * 2);
        ctx.arc(ghost.x + 5, ghost.y - 3, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Détection de collision avec Pac-Man
        const ghostDx = x - ghost.x;
        const ghostDy = y - ghost.y;
        const ghostDistance = Math.sqrt(ghostDx * ghostDx + ghostDy * ghostDy);
        if (ghostDistance < radius + 15) {
          // Game over
          ctx.fillStyle = '#ff0000';
          ctx.font = '48px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('GAME OVER', 360, 200);
          ctx.font = '24px Arial';
          ctx.fillText(`Score final: ${score}`, 360, 250);
          playSound('collision');
          cancelAnimationFrame(raf);
          setTimeout(() => stop(), 2000);
          return;
        }
      });
      
      // Dessiner Pac-Man
      ctx.fillStyle = '#ffe34d';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, radius, a + mouthOpen, a + Math.PI * 2 - mouthOpen);
      ctx.closePath();
      ctx.fill();
      
      // Bouche de Pac-Man (Animation)
      a += 0.05;
      
      // Afficher le score et le niveau
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`Score: ${score}`, 10, 20);
      ctx.fillText(`Niveau: ${level}`, 10, 40);
      
      raf = requestAnimationFrame(loop);
    };
    
    loop();
  }

  // Amélioration : Tetris avec plus de fonctionnalités
  function tetris() {
    resetScore();
    help.textContent = '← → déplacer, ↑ tourner, ↓ accélérer, Espace = drop. Échap pour quitter.';
    
    let x = 4, y = 0;
    let currentPiece = generatePiece();
    let nextPiece = generatePiece();
    let board = Array.from({ length: 20 }, () => Array(10).fill(0));
    let rotation = 0;
    let gameOver = false;
    let dropCounter = 0;
    let dropInterval = 30; // Frames entre chaque descente automatique
    let lastDrop = 0;
    
    // Couleurs des pièces
    const colors = ['#63e9ff', '#ff6b6b', '#6bff6b', '#ffff6b', '#ff6bff', '#6bffff', '#ff996b'];
    
    // Pièces Tetris (7 classiques)
    const pieces = [
      { shape: [[1, 1, 1, 1]], color: '#63e9ff' }, // I
      { shape: [[1, 1], [1, 1]], color: '#ffff6b' }, // O
      { shape: [[1, 1, 1], [0, 1, 0]], color: '#ff6b6b' }, // T
      { shape: [[1, 1, 1], [1, 0, 0]], color: '#6bff6b' }, // J
      { shape: [[1, 1, 1], [0, 0, 1]], color: '#ff6bff' }, // L
      { shape: [[1, 1], [1, 1]], color: '#6bffff' }, // O (variant)
      { shape: [[0, 1, 1], [1, 1, 0]], color: '#ff996b' }  // S
    ];
    
    function generatePiece() {
      const piece = pieces[Math.floor(Math.random() * pieces.length)];
      return { ...piece, rotation: 0 };
    }
    
    function rotatePiece() {
      // Rotation simple 90 degrés
      const newShape = [];
      for (let i = 0; i < currentPiece.shape[0].length; i++) {
        const row = [];
        for (let j = currentPiece.shape.length - 1; j >= 0; j--) {
          row.push(currentPiece.shape[j][i] || 0);
        }
        newShape.push(row);
      }
      return newShape;
    }
    
    function draw() {
      frame();
      
      if (gameOver) {
        ctx.fillStyle = '#ff0000';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', 360, 200);
        ctx.font = '24px Arial';
        ctx.fillText(`Score final: ${score}`, 360, 250);
        return;
      }
      
      const ox = 220, oy = 40, s = 20;
      
      // Dessiner le plateau
      ctx.strokeStyle = '#27364d';
      for (let j = 0; j < 20; j++) {
        for (let i = 0; i < 10; i++) {
          ctx.strokeRect(ox + i * s, oy + j * s, s, s);
          if (board[j][i]) {
            ctx.fillStyle = board[j][i];
            ctx.fillRect(ox + i * s + 1, oy + j * s + 1, s - 2, s - 2);
          }
        }
      }
      
      // Dessiner la pièce actuelle
      ctx.fillStyle = currentPiece.color;
      for (let j = 0; j < currentPiece.shape.length; j++) {
        for (let i = 0; i < currentPiece.shape[j].length; i++) {
          if (currentPiece.shape[j][i]) {
            ctx.fillRect(
              ox + (x + i) * s + 1,
              oy + (y + j) * s + 1,
              s - 2, s - 2
            );
          }
        }
      }
      
      // Dessiner la pièce suivante (preview)
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Prochaine pièce:', ox + 10 * s + 20, oy + 20);
      
      ctx.fillStyle = nextPiece.color;
      for (let j = 0; j < nextPiece.shape.length; j++) {
        for (let i = 0; i < nextPiece.shape[j].length; i++) {
          if (nextPiece.shape[j][i]) {
            ctx.fillRect(
              ox + 10 * s + 30 + i * s,
              oy + 40 + j * s,
              s - 2, s - 2
            );
          }
        }
      }
      
      // Afficher le score et le niveau
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`Score: ${score}`, 10, 20);
      ctx.fillText(`Niveau: ${level}`, 10, 40);
      
      // Mouvement
      dropCounter++;
      if (dropCounter >= dropInterval / gameSpeed) {
        if (canMove(0, 1)) {
          y++;
        } else {
          // Collision en bas - verrouiller la pièce
          lockPiece();
          currentPiece = nextPiece;
          nextPiece = generatePiece();
          x = 4;
          y = 0;
          rotation = 0;
          
          // Vérifier si c'est game over
          if (!canMove(0, 0)) {
            gameOver = true;
            playSound('collision');
          }
        }
        dropCounter = 0;
      }
      
      // Contrôles
      if (key.ArrowLeft && canMove(-1, 0)) x--;
      if (key.ArrowRight && canMove(1, 0)) x++;
      if (key.ArrowDown) {
        dropCounter = dropInterval / gameSpeed; // Accélérer
      }
      if (key.ArrowUp) {
        const newShape = rotatePiece();
        if (canRotate(newShape)) {
          currentPiece.shape = newShape;
        }
      }
      if (key.Space) {
        // Drop instantané
        while (canMove(0, 1)) {
          y++;
          updateScore(1);
        }
        lockPiece();
        currentPiece = nextPiece;
        nextPiece = generatePiece();
        x = 4;
        y = 0;
        if (!canMove(0, 0)) gameOver = true;
      }
      
      // Vérifier et supprimer les lignes complètes
      checkLines();
      
      raf = requestAnimationFrame(draw);
    }
    
    function canMove(dx, dy) {
      for (let j = 0; j < currentPiece.shape.length; j++) {
        for (let i = 0; i < currentPiece.shape[j].length; i++) {
          if (currentPiece.shape[j][i]) {
            const nx = x + i + dx;
            const ny = y + j + dy;
            if (nx < 0 || nx >= 10 || ny >= 20) return false;
            if (ny >= 0 && board[ny][nx]) return false;
          }
        }
      }
      return true;
    }
    
    function canRotate(newShape) {
      for (let j = 0; j < newShape.length; j++) {
        for (let i = 0; i < newShape[j].length; i++) {
          if (newShape[j][i]) {
            const nx = x + i;
            const ny = y + j;
            if (nx < 0 || nx >= 10 || ny < 0 || ny >= 20) return false;
            if (board[ny][nx]) return false;
          }
        }
      }
      return true;
    }
    
    function lockPiece() {
      for (let j = 0; j < currentPiece.shape.length; j++) {
        for (let i = 0; i < currentPiece.shape[j].length; i++) {
          if (currentPiece.shape[j][i]) {
            if (y + j >= 0) {
              board[y + j][x + i] = currentPiece.color;
            }
          }
        }
      }
      updateScore(10);
    }
    
    function checkLines() {
      let linesCleared = 0;
      for (let j = 19; j >= 0; j--) {
        if (board[j].every(cell => cell !== 0)) {
          linesCleared++;
          // Supprimer la ligne
          board.splice(j, 1);
          board.unshift(Array(10).fill(0));
          j++; // Re-vérifier la même ligne (qui est maintenant j+1)
        }
      }
      
      if (linesCleared > 0) {
        // Score selon le nombre de lignes
        const lineScores = [100, 300, 500, 800];
        updateScore(lineScores[Math.min(linesCleared - 1, 3)] || 100);
        playSound('eat');
      }
    }
    
    draw();
  }

  // Fonction pour ouvrir les jeux
  function open(name) {
    arcade.classList.remove('hidden');
    title.textContent = name.toUpperCase();
    ctx.clearRect(0, 0, 720, 480);
    
    switch(name) {
      case 'pacman':
        pacman();
        break;
      case 'tetris':
        tetris();
        break;
      case 'tron':
        // Placeholder pour Tron (sera géré par games-advanced.js)
        help.textContent = 'Tron sera disponible prochainement.';
        break;
      case 'spaceinvaders':
        help.textContent = 'Space Invaders sera disponible prochainement.';
        break;
      default:
        help.textContent = `Jeu: ${name}`;
    }
  }

  // Ajouter les écouteurs aux boutons
  document.querySelectorAll('[data-game]').forEach(b => {
    // games-advanced.js owns these launches. Keeping the fallback is useful
    // if that file cannot load, but running both engines at once starts two
    // animation loops on the same canvas and makes Pac-Man stutter.
    b.onclick = () => {
      if (!window.KyronextArcade) open(b.dataset.game);
    };
  });

  // Ajouter les écouteurs pour les boutons de l'interface
  document.getElementById('arcade-sound')?.addEventListener('click', () => {
    const newState = toggleSound();
    document.getElementById('arcade-sound').textContent = `SON : ${newState ? 'ON' : 'OFF'}`;
  });

  document.getElementById('arcade-restart')?.addEventListener('click', () => {
    if (activeGame) {
      stop();
      const gameName = title.textContent.toLowerCase();
      open(gameName);
    }
  });

  document.getElementById('arcade-quit')?.addEventListener('click', stop);

  // Initialiser l'affichage du son
  if (document.getElementById('arcade-sound')) {
    document.getElementById('arcade-sound').textContent = `SON : ${soundEnabled ? 'ON' : 'OFF'}`;
  }
})();
