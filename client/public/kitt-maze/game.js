(() => {
  'use strict';

  const COLS = 21;
  const ROWS = 15;
  const CELL = 30;
  const POWER_MS = 7000;
  const STEP_MS = 135;
  const DIRS = {
    up: [0, -1],
    right: [1, 0],
    down: [0, 1],
    left: [-1, 0],
  };
  const TURN = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
  const $ = (id) => document.getElementById(id);
  const canvas = $('maze');
  const ctx = canvas.getContext('2d');
  const overlay = $('overlay');
  const startButton = $('start');
  const overlayTitle = overlay.querySelector('h2');
  const overlayMessage = overlay.querySelector('p');
  const overlayHint = overlay.querySelector('small');
  const soundButton = $('sound');
  const spawn = { x: 1, y: 1 };
  const droneSpawns = [
    { x: 19, y: 13 },
    { x: 19, y: 1 },
    { x: 1, y: 13 },
  ];
  const droneColors = ['#ff435c', '#55d9ff', '#c477ff'];
  const POWER = 2;
  const WALL = 1;

  let maze = [];
  let player = null;
  let drones = [];
  let phase = 'ready';
  let score = 0;
  let lives = 3;
  let level = 1;
  let cellsCollected = 0;
  let cellsRemaining = 0;
  let poweredUntil = 0;
  let soundEnabled = false;
  let audio = null;
  let best = 0;
  let tickCount = 0;
  let previousFrame = 0;
  let accumulator = 0;
  let particles = [];
  let lastNow = 0;

  try { best = Math.max(0, Number(localStorage.getItem('kitt-maze-best')) || 0); } catch { best = 0; }
  $('best').textContent = String(best).padStart(6, '0');

  function isOpen(x, y) {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS && maze[y][x] !== WALL;
  }

  function carveMaze() {
    maze = Array.from({ length: ROWS }, () => Array(COLS).fill(WALL));
    const stack = [spawn];
    maze[spawn.y][spawn.x] = 0;

    while (stack.length) {
      const current = stack[stack.length - 1];
      const choices = Object.values(DIRS)
        .map(([dx, dy]) => ({ x: current.x + dx * 2, y: current.y + dy * 2, dx, dy }))
        .filter((next) => next.x > 0 && next.x < COLS - 1 && next.y > 0 && next.y < ROWS - 1 && maze[next.y][next.x] === WALL);

      if (!choices.length) {
        stack.pop();
        continue;
      }

      const next = choices[Math.floor(Math.random() * choices.length)];
      maze[current.y + next.dy][current.x + next.dx] = 0;
      maze[next.y][next.x] = 0;
      stack.push({ x: next.x, y: next.y });
    }

    // Braid a few dead ends so a chase has alternate routes and the maze feels less mechanical.
    const candidates = [];
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (maze[y][x] !== WALL) continue;
        const horizontal = isOpen(x - 1, y) && isOpen(x + 1, y);
        const vertical = isOpen(x, y - 1) && isOpen(x, y + 1);
        if (horizontal || vertical) candidates.push({ x, y });
      }
    }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    candidates.slice(0, 16 + Math.min(level, 8)).forEach(({ x, y }) => { maze[y][x] = 0; });

    // Ordinary cells and three overdrive crystals are placed only on walkable tiles.
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (isOpen(x, y)) maze[y][x] = 3;
      }
    }
    maze[spawn.y][spawn.x] = 0;
    droneSpawns.forEach(({ x, y }) => { maze[y][x] = 0; });
    droneSpawns.forEach(({ x, y }) => { maze[y][x] = POWER; });
    cellsRemaining = maze.flat().filter((tile) => tile === 3 || tile === POWER).length;
  }

  function resetActors() {
    player = { x: spawn.x, y: spawn.y, direction: 'right', queued: 'right' };
    drones = droneSpawns.map((point, i) => ({
      x: point.x,
      y: point.y,
      homeX: point.x,
      homeY: point.y,
      color: droneColors[i],
      delay: i * 4,
      lastX: point.x,
      lastY: point.y,
      blink: Math.random() * Math.PI * 2,
    }));
    poweredUntil = 0;
    particles = [];
  }

  function tone(frequency = 440, duration = 0.06, type = 'sine') {
    if (!soundEnabled) return;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audio ||= new AudioCtor();
      if (audio.state === 'suspended') audio.resume();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
      gain.gain.setValueAtTime(0.025, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    } catch { /* Audio is optional; gameplay must still work when muted or unsupported. */ }
  }

  function saveBest() {
    if (score <= best) return;
    best = score;
    try { localStorage.setItem('kitt-maze-best', String(best)); } catch { /* Local records are optional. */ }
    $('best').textContent = String(best).padStart(6, '0');
  }

  function showOverlay(title, message, buttonLabel, hint = 'FLÈCHES · WASD · ZQSD · P PAUSE') {
    overlayTitle.textContent = title;
    overlayMessage.textContent = message;
    startButton.textContent = buttonLabel;
    overlayHint.textContent = hint;
    overlay.classList.remove('hidden');
  }

  function hideOverlay() { overlay.classList.add('hidden'); }

  function updateHud(now = performance.now()) {
    $('score').textContent = String(score).padStart(6, '0');
    $('best').textContent = String(best).padStart(6, '0');
    $('lives').textContent = `${'♥ '.repeat(lives)}${'♡ '.repeat(3 - lives)}`.trim();
    $('cells').textContent = String(cellsCollected).padStart(2, '0');
    $('level').textContent = String(level).padStart(2, '0');

    const timeLeft = Math.max(0, poweredUntil - now);
    const percent = Math.ceil((timeLeft / POWER_MS) * 100);
    $('energy').textContent = `${percent}%`;
    $('energy-bar').style.width = `${percent}%`;
    $('energy-bar').classList.toggle('powered', percent > 0);
    $('power-status').textContent = percent > 0 ? `SURCHARGE · ${Math.ceil(timeLeft / 1000)} S` : 'IMPULSION : EN ATTENTE';
    $('sector-status').textContent = percent > 0 ? 'DRONES DÉSACTIVÉS' : cellsRemaining === 0 ? 'SECTEUR NETTOYÉ' : 'SECTEUR ACTIF';
  }

  function burst(x, y, color, amount = 12) {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 24 + Math.random() * 82;
      particles.push({
        x: (x + 0.5) * CELL,
        y: (y + 0.5) * CELL,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.28 + Math.random() * 0.38,
        size: 1.5 + Math.random() * 3,
        color,
      });
    }
  }

  function distancesFromPlayer() {
    const distances = Array.from({ length: ROWS }, () => Array(COLS).fill(Infinity));
    const queue = [{ x: player.x, y: player.y }];
    distances[player.y][player.x] = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const point = queue[cursor];
      for (const [dx, dy] of Object.values(DIRS)) {
        const x = point.x + dx;
        const y = point.y + dy;
        if (!isOpen(x, y) || distances[y][x] !== Infinity) continue;
        distances[y][x] = distances[point.y][point.x] + 1;
        queue.push({ x, y });
      }
    }
    return distances;
  }

  function moveDrone(drone, distances, now) {
    if (drone.delay > 0) { drone.delay--; return; }
    const options = Object.values(DIRS)
      .map(([dx, dy]) => ({ x: drone.x + dx, y: drone.y + dy, distance: distances[drone.y + dy]?.[drone.x + dx] ?? Infinity }))
      .filter((point) => isOpen(point.x, point.y) && Number.isFinite(point.distance));
    if (!options.length) return;
    const frightened = poweredUntil > now;
    options.sort((a, b) => frightened ? b.distance - a.distance : a.distance - b.distance);
    const bestDistance = options[0].distance;
    const equal = options.filter((point) => point.distance === bestDistance);
    const choice = equal[Math.floor(Math.random() * equal.length)];
    drone.lastX = drone.x;
    drone.lastY = drone.y;
    drone.x = choice.x;
    drone.y = choice.y;
  }

  function restoreActors() {
    player = { x: spawn.x, y: spawn.y, direction: 'right', queued: 'right' };
    drones.forEach((drone, i) => {
      drone.x = drone.homeX;
      drone.y = drone.homeY;
      drone.lastX = drone.x;
      drone.lastY = drone.y;
      drone.delay = 2 + i * 3;
    });
    poweredUntil = 0;
  }

  function checkCollision(now) {
    const drone = drones.find((enemy) => enemy.x === player.x && enemy.y === player.y);
    if (!drone) return false;
    if (poweredUntil > now) {
      score += 200;
      burst(drone.x, drone.y, '#62dfff', 24);
      drone.x = drone.homeX;
      drone.y = drone.homeY;
      drone.delay = 10;
      tone(960, 0.1, 'triangle');
      saveBest();
      return false;
    }

    lives--;
    tone(115, 0.28, 'sawtooth');
    if (lives <= 0) {
      phase = 'gameover';
      saveBest();
      showOverlay('MISSION TERMINÉE', `Score : ${score.toLocaleString('fr-BE')} · cellules récupérées : ${cellsCollected}`, 'RECOMMENCER');
      return true;
    }
    restoreActors();
    return true;
  }

  function finishSector() {
    phase = 'cleared';
    saveBest();
    showOverlay(`SECTEUR ${String(level).padStart(2, '0')} NETTOYÉ`, `Excellent pilotage. ${cellsCollected} cellules et ${score.toLocaleString('fr-BE')} points.`, 'SECTEUR SUIVANT', 'APPUIE SUR ENTRÉE OU LANCE LE SECTEUR SUIVANT');
    tone(740, 0.16, 'triangle');
    window.setTimeout(() => tone(980, 0.2, 'triangle'), 160);
  }

  function advance(now) {
    if (phase !== 'playing') return;
    tickCount++;
    const [wantX, wantY] = DIRS[player.queued];
    if (isOpen(player.x + wantX, player.y + wantY)) player.direction = player.queued;
    const [dx, dy] = DIRS[player.direction];
    if (isOpen(player.x + dx, player.y + dy)) {
      player.x += dx;
      player.y += dy;
    }

    const tile = maze[player.y][player.x];
    if (tile === 3) {
      maze[player.y][player.x] = 0;
      cellsRemaining--;
      cellsCollected++;
      score += 10;
      burst(player.x, player.y, '#91f7ff', 5);
      if (cellsCollected % 4 === 0) tone(540 + (cellsCollected % 5) * 45, 0.035, 'triangle');
      saveBest();
    } else if (tile === POWER) {
      maze[player.y][player.x] = 0;
      cellsRemaining--;
      cellsCollected++;
      score += 60;
      poweredUntil = now + POWER_MS;
      burst(player.x, player.y, '#ff5370', 24);
      tone(860, 0.18, 'sawtooth');
      saveBest();
    }

    if (checkCollision(now)) {
      updateHud(now);
      draw(now);
      return;
    }

    if (tickCount % Math.max(1, 3 - Math.floor((level - 1) / 3)) === 0) {
      const distances = distancesFromPlayer();
      drones.forEach((drone) => moveDrone(drone, distances, now));
      if (checkCollision(now)) {
        updateHud(now);
        draw(now);
        return;
      }
    }

    if (cellsRemaining <= 0) finishSector();
    updateHud(now);
    draw(now);
  }

  function drawWall(x, y) {
    const px = x * CELL;
    const py = y * CELL;
    ctx.fillStyle = '#0a1123';
    ctx.fillRect(px, py, CELL, CELL);
    ctx.fillStyle = '#172442';
    ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
    ctx.fillStyle = '#263d6e';
    ctx.fillRect(px + 4, py + 4, CELL - 8, 2);
    ctx.fillRect(px + 4, py + 4, 2, CELL - 8);
    ctx.fillStyle = '#101a33';
    ctx.fillRect(px + 6, py + 7, CELL - 12, CELL - 12);
    ctx.fillStyle = '#344c7a';
    ctx.fillRect(px + CELL - 6, py + 6, 2, CELL - 12);
    ctx.fillRect(px + 6, py + CELL - 6, CELL - 12, 2);
  }

  function drawPlayer(now) {
    ctx.save();
    ctx.translate((player.x + 0.5) * CELL, (player.y + 0.5) * CELL);
    ctx.rotate(TURN[player.direction]);
    ctx.shadowColor = '#ff3149';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#a91d32';
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(8, -9);
    ctx.lineTo(-7, -9);
    ctx.lineTo(-12, -6);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-12, 6);
    ctx.lineTo(-7, 9);
    ctx.lineTo(8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e94054';
    ctx.fillRect(-4, -6, 11, 12);
    ctx.fillStyle = '#111827';
    ctx.fillRect(-3, -5, 7, 10);
    ctx.fillStyle = '#ffe6ad';
    ctx.fillRect(10, -5, 2, 3);
    ctx.fillRect(10, 2, 2, 3);
    ctx.fillStyle = '#14131b';
    ctx.fillRect(-9, -11, 5, 3);
    ctx.fillRect(3, -11, 5, 3);
    ctx.fillRect(-9, 8, 5, 3);
    ctx.fillRect(3, 8, 5, 3);
    const scanner = 0.55 + 0.45 * Math.sin(now / 90);
    ctx.fillStyle = `rgba(255,35,55,${scanner})`;
    ctx.shadowColor = '#ff1d39';
    ctx.shadowBlur = 10;
    ctx.fillRect(7, -7, 2, 14);
    ctx.restore();
  }

  function drawDrone(drone, index, now) {
    const px = (drone.x + 0.5) * CELL;
    const py = (drone.y + 0.5) * CELL;
    const frightened = poweredUntil > now;
    const color = frightened ? '#69cfff' : drone.color;
    const wobble = Math.sin(now / 135 + drone.blink + index) * 1.4;
    ctx.save();
    ctx.translate(px, py + wobble);
    ctx.rotate(Math.PI / 4);
    ctx.shadowColor = color;
    ctx.shadowBlur = frightened ? 18 : 11;
    ctx.fillStyle = frightened ? '#235b8c' : '#151826';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-9, -9, 18, 18, 4);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(-Math.PI / 4);
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.fillRect(-12, -2, 4, 4);
    ctx.fillRect(8, -2, 4, 4);
    ctx.fillStyle = frightened ? '#e8ffff' : '#ffebd9';
    ctx.fillRect(-4, -3, 3, 4);
    ctx.fillRect(2, -3, 3, 4);
    ctx.fillStyle = frightened ? '#62dfff' : '#ff304d';
    ctx.fillRect(-3, 5, 6, 2);
    ctx.restore();
  }

  function draw(now = performance.now()) {
    if (!ctx || !maze.length) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    background.addColorStop(0, '#070b16');
    background.addColorStop(0.52, '#09101c');
    background.addColorStop(1, '#100d1a');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const px = x * CELL;
        const py = y * CELL;
        if (maze[y][x] === WALL) {
          drawWall(x, y);
          continue;
        }
        ctx.fillStyle = (x + y) % 2 ? '#0b101a' : '#0d111b';
        ctx.fillRect(px, py, CELL, CELL);
        ctx.fillStyle = '#b4c9f006';
        ctx.fillRect(px + 2, py + 2, CELL - 4, 1);
        if (maze[y][x] === 3) {
          const glow = 0.62 + 0.38 * Math.sin(now / 180 + x * 0.8 + y);
          ctx.globalAlpha = glow;
          ctx.fillStyle = '#c6f8ff';
          ctx.shadowColor = '#64eaff';
          ctx.shadowBlur = 7;
          ctx.beginPath();
          ctx.arc(px + CELL / 2, py + CELL / 2, 2.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.shadowBlur = 0;
        } else if (maze[y][x] === POWER) {
          const pulse = 0.84 + 0.16 * Math.sin(now / 110);
          ctx.save();
          ctx.translate(px + CELL / 2, py + CELL / 2);
          ctx.rotate(Math.PI / 4);
          ctx.globalAlpha = pulse;
          ctx.fillStyle = '#ff4058';
          ctx.shadowColor = '#ff304c';
          ctx.shadowBlur = 18;
          ctx.fillRect(-6, -6, 12, 12);
          ctx.fillStyle = '#ffe3c0';
          ctx.shadowBlur = 5;
          ctx.fillRect(-2, -2, 4, 4);
          ctx.restore();
        }
      }
    }

    particles = particles.filter((particle) => particle.life > 0);
    particles.forEach((particle) => {
      particle.x += particle.vx / 60;
      particle.y += particle.vy / 60;
      particle.life -= 1 / 60;
      ctx.globalAlpha = Math.max(0, particle.life * 2);
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 8;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    drones.forEach((drone, index) => drawDrone(drone, index, now));
    drawPlayer(now);

    if (phase === 'paused') {
      ctx.fillStyle = '#05081288';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function frame(now) {
    if (phase !== 'playing') return;
    if (!previousFrame) {
      previousFrame = now;
      draw(now);
      requestAnimationFrame(frame);
      return;
    }
    accumulator += Math.min(250, now - previousFrame);
    previousFrame = now;
    while (accumulator >= STEP_MS && phase === 'playing') {
      advance(now);
      accumulator -= STEP_MS;
    }
    updateHud(now);
    draw(now);
    if (phase === 'playing') requestAnimationFrame(frame);
  }

  function beginSector() {
    carveMaze();
    resetActors();
    cellsCollected = 0;
    tickCount = 0;
    accumulator = 0;
    previousFrame = 0;
    phase = 'playing';
    hideOverlay();
    updateHud();
    draw();
    requestAnimationFrame(frame);
  }

  function newGame() {
    score = 0;
    lives = 3;
    level = 1;
    beginSector();
  }

  function pauseGame() {
    if (phase !== 'playing') return;
    phase = 'paused';
    showOverlay('MISSION EN PAUSE', 'Le secteur attend tes prochaines commandes.', 'REPRENDRE');
    draw();
  }

  function resumeGame() {
    phase = 'playing';
    hideOverlay();
    previousFrame = 0;
    requestAnimationFrame(frame);
  }

  function primaryAction() {
    if (phase === 'ready' || phase === 'gameover') {
      newGame();
    } else if (phase === 'paused') {
      resumeGame();
    } else if (phase === 'cleared') {
      level++;
      beginSector();
    }
  }

  function setDirection(direction) {
    if (phase === 'playing' && DIRS[direction]) player.queued = direction;
  }

  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const direction = {
      arrowup: 'up', w: 'up', z: 'up',
      arrowright: 'right', d: 'right',
      arrowdown: 'down', s: 'down',
      arrowleft: 'left', a: 'left', q: 'left',
    }[key];
    if (direction) {
      event.preventDefault();
      setDirection(direction);
    }
    if (key === 'p' || key === 'escape') {
      if (phase === 'playing') pauseGame();
      else if (phase === 'paused') resumeGame();
    }
    if ((key === 'enter' || key === ' ') && phase !== 'playing') {
      event.preventDefault();
      primaryAction();
    }
  });

  document.querySelectorAll('[data-dir]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      setDirection(button.dataset.dir);
    });
  });

  startButton.addEventListener('click', primaryAction);
  $('sound').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
    soundButton.querySelector('span').textContent = soundEnabled ? 'SON ON' : 'SON OFF';
    tone(620, 0.08, 'triangle');
  });

  carveMaze();
  resetActors();
  updateHud();
  draw(0);
})();
