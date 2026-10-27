(() => {
  'use strict';

  const W = 960;
  const H = 540;
  const DURATION = 60;
  const PLAYER_Y = 430;
  const LANES = [0, 1, 2];
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const stage = document.getElementById('game-stage');
  const hud = document.getElementById('hud');
  const screens = ['title-screen', 'help-screen', 'pause-screen', 'finish-screen'];
  const $ = id => document.getElementById(id);

  let mode = 'title';
  let score = 0;
  let best = readBest();
  let health = 3;
  let energy = 62;
  let cores = 0;
  let elapsed = 0;
  let remaining = DURATION;
  let roadScroll = 0;
  let spawnClock = 0;
  let coreClock = 4.5;
  let lane = 1;
  let visualLane = 1;
  let boostHeld = false;
  let boostActive = false;
  let invulnerable = 0;
  let shake = 0;
  let toastClock = 0;
  let audioContext = null;
  let soundEnabled = true;
  let lastFrame = 0;
  let entities = [];
  let stars = [];
  let buildings = [];

  function readBest() {
    try { return Number(localStorage.getItem('manixMidnightRunnerBest')) || 0; }
    catch (_) { return 0; }
  }

  function saveBest(value) {
    try { localStorage.setItem('manixMidnightRunnerBest', String(value)); }
    catch (_) { /* local score still works if storage is blocked */ }
  }

  function showScreen(id) {
    screens.forEach(screenId => {
      const screen = $(screenId);
      const visible = screenId === id;
      screen.hidden = !visible;
      screen.classList.toggle('is-visible', visible);
    });
    hud.hidden = mode !== 'playing' && mode !== 'paused';
    $('pause-chip').hidden = mode !== 'playing';
  }

  function updateBestLabel() {
    $('best-score').textContent = formatScore(best);
  }

  function formatScore(value) {
    return Math.max(0, Math.floor(value)).toString().padStart(6, '0');
  }

  function startGame() {
    unlockAudio();
    mode = 'playing';
    score = 0;
    health = 3;
    energy = 62;
    cores = 0;
    elapsed = 0;
    remaining = DURATION;
    roadScroll = 0;
    spawnClock = 0.9;
    coreClock = 4.5;
    lane = 1;
    visualLane = 1;
    boostHeld = false;
    boostActive = false;
    invulnerable = 0;
    shake = 0;
    entities = [];
    updateHud();
    showScreen(null);
    toast('3… 2… 1… GO!', 1.2);
  }

  function pauseGame() {
    if (mode !== 'playing') return;
    mode = 'paused';
    boostHeld = false;
    boostActive = false;
    showScreen('pause-screen');
  }

  function resumeGame() {
    if (mode !== 'paused') return;
    mode = 'playing';
    lastFrame = 0;
    showScreen(null);
  }

  function endGame(completed) {
    mode = completed ? 'complete' : 'over';
    boostHeld = false;
    boostActive = false;
    const isRecord = score > best;
    if (isRecord) {
      best = score;
      saveBest(best);
    }
    $('finish-eyebrow').textContent = completed ? 'TRANSMISSION TERMINÉE' : 'VÉHICULE IMMOBILISÉ';
    $('finish-title').textContent = completed ? 'Arrivée !' : 'Fin de course.';
    $('finish-message').textContent = completed
      ? 'Tu as traversé la nuit. La route est à toi.'
      : 'Le blindage a cédé. Recharge et reprends la route.';
    $('final-score').textContent = formatScore(score);
    $('cores-collected').textContent = `${cores} cellule${cores === 1 ? '' : 's'}`;
    $('final-sector').textContent = String(Math.min(5, Math.floor(elapsed / 12) + 1)).padStart(2, '0');
    $('record-badge').hidden = !isRecord;
    updateBestLabel();
    showScreen('finish-screen');
    sound(completed ? 720 : 130, completed ? .22 : .4, completed ? 'triangle' : 'sawtooth');
  }

  function moveLane(direction) {
    if (mode !== 'playing') return;
    const nextLane = Math.max(0, Math.min(2, lane + direction));
    if (nextLane === lane) return;
    lane = nextLane;
    sound(270 + lane * 70, .055, 'square', .035);
  }

  function toggleBoost(value) {
    boostHeld = value;
    if (value && mode === 'playing' && energy > 1) sound(480, .08, 'sawtooth', .035);
  }

  function unlockAudio() {
    if (!soundEnabled) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
    } catch (_) { audioContext = null; }
  }

  function sound(frequency, duration, type = 'square', volume = .055) {
    if (!soundEnabled) return;
    unlockAudio();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  }

  function toast(message, seconds = 1.15) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    toastClock = seconds;
  }

  function updateHud() {
    $('score').textContent = formatScore(score);
    $('sector').textContent = String(Math.min(5, Math.floor(elapsed / 12) + 1)).padStart(2, '0');
    const seconds = Math.max(0, Math.ceil(remaining));
    $('timer').textContent = `00:${String(seconds).padStart(2, '0')}`;
    $('energy-meter').style.width = `${Math.max(0, Math.min(100, energy))}%`;
    $('energy-meter').style.background = boostActive ? 'linear-gradient(90deg,#ffc85b,#fff0ae)' : '';
    $('health').textContent = `${'◆ '.repeat(health)}${'◇ '.repeat(3 - health)}`.trim();
  }

  function update(dt) {
    elapsed += dt;
    remaining = Math.max(0, DURATION - elapsed);
    const speed = 205 + Math.min(88, elapsed * 1.45);
    const turbo = boostHeld && energy > 0;
    boostActive = turbo;
    if (turbo) energy = Math.max(0, energy - 35 * dt);
    else energy = Math.min(100, energy + 1.6 * dt);
    if (energy <= 0) boostActive = false;

    visualLane += (lane - visualLane) * Math.min(1, dt * 13);
    roadScroll = (roadScroll + speed * (turbo ? 1.23 : 1) * dt) % 10000;
    spawnClock -= dt;
    coreClock -= dt;
    invulnerable = Math.max(0, invulnerable - dt);
    shake = Math.max(0, shake - dt * 2.8);
    toastClock = Math.max(0, toastClock - dt);
    if (!toastClock) $('toast').classList.remove('show');

    const spawnGap = Math.max(.72, 1.16 - elapsed * .0042);
    if (spawnClock <= 0) {
      spawnHazard(speed, false);
      if (elapsed > 20 && Math.random() < Math.min(.22, (elapsed - 20) * .006)) spawnHazard(speed, true);
      spawnClock = spawnGap * (.82 + Math.random() * .38);
    }
    if (coreClock <= 0) {
      spawnCore();
      coreClock = 5.8 + Math.random() * 2.3;
    }

    for (let index = entities.length - 1; index >= 0; index--) {
      const item = entities[index];
      item.y += speed * (turbo ? 1.23 : 1) * dt * item.speedFactor;
      const alignedWithPlayer = Math.abs(laneX(item.lane, item.y) - laneX(visualLane, PLAYER_Y)) < 33;
      if (item.kind === 'core' && Math.abs(item.y - PLAYER_Y) < 38 && alignedWithPlayer) {
        energy = Math.min(100, energy + 31);
        score += 180;
        cores++;
        entities.splice(index, 1);
        sound(820, .14, 'triangle');
        toast('CELLULE ÉNERGIE +180');
        continue;
      }
      if (item.kind === 'hazard' && !item.passed && item.y > PLAYER_Y + 28) {
        item.passed = true;
        if (item.lane !== lane) {
          score += boostActive ? 130 : 85;
          if (Math.random() < .18) toast('DÉPASSEMENT PROPRE');
        }
      }
      if (item.kind === 'hazard' && invulnerable <= 0 && Math.abs(item.y - PLAYER_Y) < 34 && Math.abs(laneX(item.lane, item.y) - laneX(visualLane, PLAYER_Y)) < 37) {
        item.hit = true;
        if (boostActive && energy >= 26) {
          energy = Math.max(0, energy - 26);
          invulnerable = .9;
          sound(660, .12, 'triangle');
          toast('TURBO : IMPACT ABSORBÉ');
        } else {
          health--;
          invulnerable = 1.25;
          shake = .85;
          sound(110, .32, 'sawtooth');
          toast(health > 0 ? 'IMPACT — BLINDAGE ENDOMMAGÉ' : 'BLINDAGE ÉPUISÉ');
        }
        if (health <= 0) {
          entities.splice(index, 1);
          updateHud();
          endGame(false);
          return;
        }
      }
      if (item.y > H + 80) entities.splice(index, 1);
    }

    score += dt * (turbo ? 12 : 8);
    updateHud();
    if (remaining <= 0) endGame(true);
  }

  function spawnHazard(speed, secondInWave) {
    const occupied = entities.filter(item => item.kind === 'hazard' && item.y < 135).map(item => item.lane);
    const choices = LANES.filter(candidate => !occupied.includes(candidate));
    if (!choices.length) return;
    const chosenLane = choices[Math.floor(Math.random() * choices.length)];
    entities.push({ kind: 'hazard', lane: chosenLane, y: -70 - (secondInWave ? 34 : 0), speedFactor: 1, color: Math.random() > .5 ? '#ff9d55' : '#ff5879', phase: Math.random() * 10, passed: false, hit: false });
  }

  function spawnCore() {
    const laneChoice = LANES[Math.floor(Math.random() * LANES.length)];
    if (entities.some(item => item.y < 100 && item.lane === laneChoice)) return;
    entities.push({ kind: 'core', lane: laneChoice, y: -40, speedFactor: .96, phase: Math.random() * 10 });
  }

  function roadPoint(y) {
    const t = Math.max(0, Math.min(1, (y + 15) / (H + 15)));
    const center = W * .5 + Math.sin(roadScroll * .00135 + (1 - t) * 2.5) * 38 * (1 - t * .35);
    const half = 158 + 138 * t;
    return { center, half };
  }

  function laneX(laneValue, y) {
    const point = roadPoint(y);
    return point.center + (laneValue - 1) * point.half * .64;
  }

  function drawRoad() {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#07101f');
    bg.addColorStop(.58, '#0b1422');
    bg.addColorStop(1, '#111729');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    drawStars();
    drawCity();

    ctx.beginPath();
    for (let y = 18; y <= H + 15; y += 18) {
      const p = roadPoint(y);
      if (y === 18) ctx.moveTo(p.center - p.half, y);
      else ctx.lineTo(p.center - p.half, y);
    }
    for (let y = H + 15; y >= 18; y -= 18) {
      const p = roadPoint(y);
      ctx.lineTo(p.center + p.half, y);
    }
    ctx.closePath();
    const asphalt = ctx.createLinearGradient(185, 0, 790, 0);
    asphalt.addColorStop(0, '#161e2d');
    asphalt.addColorStop(.5, '#202a38');
    asphalt.addColorStop(1, '#131c2b');
    ctx.fillStyle = asphalt;
    ctx.fill();

    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let y = 18; y <= H + 15; y += 20) {
        const p = roadPoint(y);
        const x = p.center + p.half * side;
        if (y === 18) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = side < 0 ? '#ff6179' : '#5deaff';
      ctx.lineWidth = 3;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    const dashOffset = roadScroll % 72;
    for (let separator = 0; separator < 2; separator++) {
      for (let y0 = -72 + dashOffset; y0 < H; y0 += 72) {
        const y1 = y0 + 36;
        const p0 = roadPoint(y0);
        const p1 = roadPoint(y1);
        const x0 = p0.center + (separator - .5) * p0.half * .64;
        const x1 = p1.center + (separator - .5) * p1.half * .64;
        ctx.strokeStyle = '#91a8bd8a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#d7e4f009';
    ctx.fillRect(480, 25, 1, H - 25);
  }

  function drawStars() {
    ctx.fillStyle = '#93bbdb';
    for (const star of stars) {
      const y = (star.y + roadScroll * star.speed * .11) % H;
      ctx.globalAlpha = star.alpha * (.72 + Math.sin(elapsed * 2 + star.phase) * .22);
      ctx.fillRect(star.x, y, star.size, star.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawCity() {
    for (const building of buildings) {
      const drift = (roadScroll * .17 * building.depth) % (H + 110);
      const y = (building.y + drift + H + 110) % (H + 110) - 95;
      const x = building.side < 0 ? building.x : W - building.x - building.width;
      ctx.fillStyle = building.depth > .7 ? '#111c30' : '#0c1728';
      ctx.fillRect(x, y, building.width, building.height);
      ctx.fillStyle = '#26334b';
      ctx.fillRect(x, y, building.width, 3);
      for (const window of building.windows) {
        ctx.fillStyle = window.color;
        ctx.globalAlpha = .5 + Math.sin(elapsed * .7 + window.phase) * .15;
        ctx.fillRect(x + window.x, y + window.y, 3, 4);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawCar(x, y, color, isPlayer, phase = 0) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (isPlayer && invulnerable > 0 && Math.floor(elapsed * 15) % 2) ctx.globalAlpha = .48;
    if (isPlayer && boostActive) {
      ctx.fillStyle = '#42eaff9c';
      ctx.fillRect(-7, 34, 5, 22 + Math.sin(elapsed * 30) * 6);
      ctx.fillRect(2, 36, 5, 24 + Math.cos(elapsed * 26) * 6);
    }
    ctx.fillStyle = '#02050b';
    ctx.fillRect(-27, -31, 7, 55);
    ctx.fillRect(20, -31, 7, 55);
    ctx.fillStyle = '#182338';
    ctx.fillRect(-21, -39, 42, 77);
    ctx.fillStyle = color;
    ctx.fillRect(-18, -36, 36, 68);
    ctx.fillStyle = isPlayer ? '#b7f8ff' : '#ffe2bb';
    ctx.fillRect(-13, -34, 26, 7);
    ctx.fillStyle = isPlayer ? '#153a57' : '#372c37';
    ctx.fillRect(-13, -23, 26, 18);
    ctx.fillStyle = '#101827';
    ctx.fillRect(-15, 1, 30, 18);
    ctx.fillStyle = isPlayer ? '#5becff' : '#f3b48c';
    ctx.fillRect(-16, 23, 8, 5);
    ctx.fillRect(8, 23, 8, 5);
    ctx.fillStyle = '#ffc85b';
    ctx.fillRect(-4, 26, 8, 4);
    ctx.fillStyle = '#dae6ec';
    ctx.fillRect(-18, -2, 4, 13);
    ctx.fillRect(14, -2, 4, 13);
    if (!isPlayer) {
      ctx.fillStyle = '#ffffff45';
      ctx.fillRect(-1, -21 + Math.sin(elapsed * 6 + phase) * 2, 2, 14);
    }
    ctx.restore();
  }

  function drawCore(x, y, phase) {
    const pulse = 1 + Math.sin(elapsed * 7 + phase) * .11;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(Math.PI / 4);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = '#64efff';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#46ddf8';
    ctx.fillRect(-12, -12, 24, 24);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#deffff';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();
  }

  function drawEntities() {
    for (const item of entities) {
      const x = laneX(item.lane, item.y);
      if (item.kind === 'core') drawCore(x, item.y, item.phase);
      else drawCar(x, item.y, item.color, false, item.phase);
    }
  }

  function drawPlayer() {
    if (health <= 0) return;
    const x = laneX(visualLane, PLAYER_Y);
    if (shake > 0) ctx.translate((Math.random() - .5) * shake * 11, (Math.random() - .5) * shake * 7);
    drawCar(x, PLAYER_Y, boostActive ? '#4bdaf0' : '#d9e3eb', true);
    if (shake > 0) ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }

  function render() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    drawRoad();
    drawEntities();
    drawPlayer();
    if (mode === 'playing' && elapsed < 3) {
      ctx.fillStyle = '#eaf7ff';
      ctx.textAlign = 'center';
      ctx.font = '700 15px Consolas, monospace';
      ctx.shadowColor = '#4deaff';
      ctx.shadowBlur = 12;
      ctx.fillText('ÉVITE LE TRAFIC · ATTRAPE LES CELLULES CYAN', W / 2, 113);
      ctx.shadowBlur = 0;
    }
  }

  function makeScenery() {
    stars = Array.from({ length: 110 }, () => ({ x: Math.random() * W, y: Math.random() * H, size: Math.random() > .82 ? 2 : 1, alpha: .15 + Math.random() * .48, speed: .3 + Math.random() * 2, phase: Math.random() * 7 }));
    buildings = [];
    for (const side of [-1, 1]) {
      for (let index = 0; index < 20; index++) {
        const width = 24 + Math.random() * 68;
        const height = 55 + Math.random() * 180;
        const windows = Array.from({ length: 6 + Math.floor(Math.random() * 15) }, () => ({
          x: 6 + Math.random() * Math.max(5, width - 11),
          y: 8 + Math.random() * Math.max(5, height - 13),
          color: Math.random() > .62 ? '#54bccc' : '#d19751',
          phase: Math.random() * 9
        }));
        buildings.push({ side, x: 8 + Math.random() * 100, y: Math.random() * (H + 130), width, height, depth: .25 + Math.random() * .75, windows });
      }
    }
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = stage.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    ctx.imageSmoothingEnabled = false;
  }

  function frame(timestamp) {
    if (!lastFrame) lastFrame = timestamp;
    const dt = Math.min(.05, Math.max(0, (timestamp - lastFrame) / 1000));
    lastFrame = timestamp;
    if (mode === 'playing') update(dt);
    else if (mode === 'title') roadScroll += dt * 55;
    render();
    requestAnimationFrame(frame);
  }

  function handleKeyDown(event) {
    const code = event.code;
    const key = event.key.toLowerCase();
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(code)) event.preventDefault();
    if (event.repeat && ['Escape', 'KeyP', 'KeyM', 'Enter'].includes(code)) return;
    if (mode === 'title' && (code === 'Enter' || code === 'Space')) { startGame(); return; }
    if ((mode === 'over' || mode === 'complete') && (code === 'Enter' || code === 'KeyR')) { startGame(); return; }
    if (code === 'Escape') {
      if (mode === 'playing') pauseGame();
      else if (mode === 'paused') resumeGame();
      return;
    }
    if (code === 'KeyP') {
      if (mode === 'playing') pauseGame();
      else if (mode === 'paused') resumeGame();
      return;
    }
    if (code === 'KeyM') {
      soundEnabled = !soundEnabled;
      if (soundEnabled) { unlockAudio(); sound(520, .08, 'triangle'); }
      toast(soundEnabled ? 'SON ACTIVÉ' : 'SON COUPÉ');
      return;
    }
    if (mode !== 'playing') return;
    if (code === 'ArrowLeft' || code === 'KeyA' || code === 'KeyQ' || key === 'q') moveLane(-1);
    if (code === 'ArrowRight' || code === 'KeyD' || key === 'd') moveLane(1);
    if (code === 'Space') toggleBoost(true);
  }

  function handleKeyUp(event) {
    if (event.code === 'Space') toggleBoost(false);
  }

  function bindHoldButton(button, callbackDown, callbackUp) {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      button.classList.add('is-held');
      callbackDown();
    });
    const release = () => {
      button.classList.remove('is-held');
      callbackUp?.();
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => button.addEventListener(type, release));
  }

  $('start-button').addEventListener('click', startGame);
  $('help-button').addEventListener('click', () => { mode = 'help'; showScreen('help-screen'); });
  $('help-back').addEventListener('click', () => { mode = 'title'; showScreen('title-screen'); });
  $('resume-button').addEventListener('click', resumeGame);
  $('pause-restart-button').addEventListener('click', startGame);
  $('replay-button').addEventListener('click', startGame);
  $('title-button').addEventListener('click', () => { mode = 'title'; updateBestLabel(); showScreen('title-screen'); });
  $('pause-chip').addEventListener('click', pauseGame);
  bindHoldButton($('left-button'), () => moveLane(-1));
  bindHoldButton($('right-button'), () => moveLane(1));
  bindHoldButton($('turbo-button'), () => toggleBoost(true), () => toggleBoost(false));

  let swipeStart = null;
  stage.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    try { stage.setPointerCapture(event.pointerId); } catch (_) { /* pointer may not be capturable */ }
  });
  stage.addEventListener('pointerup', event => {
    if (!swipeStart || swipeStart.id !== event.pointerId) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) moveLane(dx < 0 ? -1 : 1);
    swipeStart = null;
  });
  stage.addEventListener('pointercancel', () => { swipeStart = null; });

  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(resize, 120), { passive: true });
  window.addEventListener('blur', () => { if (mode === 'playing') pauseGame(); toggleBoost(false); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') pauseGame(); });

  makeScenery();
  resize();
  updateBestLabel();
  showScreen('title-screen');
  requestAnimationFrame(frame);
})();
