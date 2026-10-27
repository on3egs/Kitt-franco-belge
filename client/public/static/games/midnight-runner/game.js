(() => {
  'use strict';

  const W = 960;
  const BASE_H = 540;
  let H = BASE_H;
  const DURATION = 60;
  let PLAYER_Y = 430;
  const LANES = [0, 1, 2];
  const SECTORS = [
    { name: 'RING ROAD', sky: '#07101f', road: '#202a38', windows: ['#54bccc', '#d19751'] },
    { name: 'DOCKS', sky: '#10101e', road: '#282838', windows: ['#6fd9ec', '#efad58'] },
    { name: 'NORTH LOOP', sky: '#07171a', road: '#203034', windows: ['#62e5c5', '#ffc85b'] },
    { name: 'REDLINE', sky: '#190d19', road: '#30212c', windows: ['#ff738a', '#ffd070'] },
    { name: 'DAWN', sky: '#20131b', road: '#342832', windows: ['#ffb276', '#74eaff'] }
  ];
  const MAX_COMBO = 5;
  const COMBO_WINDOW = 2.7;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  let countdown = 0;
  let pausedFrom = 'playing';
  let sectorIndex = 0;
  let combo = 0;
  let bestCombo = 0;
  let comboTimer = 0;
  let roadScroll = 0;
  let spawnClock = 0;
  let coreClock = 4.5;
  let lane = 1;
  let visualLane = 1;
  let boostHeld = false;
  let boostActive = false;
  let invulnerable = 0;
  let shake = 0;
  let damageFlash = 0;
  let toastClock = 0;
  let audioContext = null;
  let soundEnabled = true;
  let lastFrame = 0;
  let entities = [];
  let stars = [];
  let buildings = [];
  let viewScale = 1;
  let spriteScale = 1;
  let worldHeightScale = 1;

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
    hud.hidden = mode !== 'playing' && mode !== 'countdown' && mode !== 'paused';
    $('pause-chip').hidden = mode !== 'playing' && mode !== 'countdown';
  }

  function updateBestLabel() {
    $('best-score').textContent = formatScore(best);
  }

  function formatScore(value) {
    return Math.max(0, Math.floor(value)).toString().padStart(6, '0');
  }

  function startGame() {
    unlockAudio();
    mode = 'countdown';
    score = 0;
    health = 3;
    energy = 62;
    cores = 0;
    elapsed = 0;
    remaining = DURATION;
    countdown = 3;
    sectorIndex = 0;
    combo = 0;
    bestCombo = 0;
    comboTimer = 0;
    roadScroll = 0;
    spawnClock = 0.9;
    coreClock = 4.5;
    lane = 1;
    visualLane = 1;
    boostHeld = false;
    boostActive = false;
    invulnerable = 0;
    shake = 0;
    damageFlash = 0;
    entities = [];
    updateHud();
    showScreen(null);
    canvas.focus({ preventScroll: true });
    toast('3', .9);
  }

  function pauseGame() {
    if (mode !== 'playing' && mode !== 'countdown') return;
    pausedFrom = mode;
    mode = 'paused';
    boostHeld = false;
    boostActive = false;
    showScreen('pause-screen');
  }

  function resumeGame() {
    if (mode !== 'paused') return;
    mode = pausedFrom;
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
    $('cores-collected').textContent = String(cores);
    $('final-sector').textContent = String(Math.min(5, sectorIndex + 1)).padStart(2, '0');
    $('final-combo').textContent = `×${bestCombo}`;
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
    $('sector').textContent = String(Math.min(5, sectorIndex + 1)).padStart(2, '0');
    $('sector-name').textContent = SECTORS[sectorIndex].name;
    const seconds = Math.max(0, Math.ceil(remaining));
    $('timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    $('energy-meter').style.width = `${Math.max(0, Math.min(100, energy))}%`;
    $('energy-meter').style.background = boostActive ? 'linear-gradient(90deg,#ffc85b,#fff0ae)' : '';
    $('health').textContent = `${'◆ '.repeat(health)}${'◇ '.repeat(3 - health)}`.trim();
    $('combo-stat').hidden = combo < 1;
    $('combo-value').textContent = `×${combo}`;
    $('combo-meter').style.width = `${combo ? Math.max(0, comboTimer / COMBO_WINDOW * 100) : 0}%`;
    $('route-meter').style.width = `${Math.max(0, Math.min(100, elapsed / DURATION * 100))}%`;
  }

  function update(dt) {
    elapsed += dt;
    remaining = Math.max(0, DURATION - elapsed);
    const speed = (205 + Math.min(88, elapsed * 1.45)) * worldHeightScale;
    const previousSector = sectorIndex;
    sectorIndex = Math.min(SECTORS.length - 1, Math.floor(elapsed / (DURATION / SECTORS.length)));
    if (sectorIndex > previousSector) {
      const sectorBonus = 200 * (sectorIndex + 1);
      score += sectorBonus;
      toast(`SECTEUR 0${sectorIndex + 1} · ${SECTORS[sectorIndex].name} · +${sectorBonus}`, 1.5);
      sound(390 + sectorIndex * 85, .2, 'triangle');
    }
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
    damageFlash = Math.max(0, damageFlash - dt * 1.8);
    comboTimer = Math.max(0, comboTimer - dt);
    if (!comboTimer) combo = 0;
    toastClock = Math.max(0, toastClock - dt);
    if (!toastClock) $('toast').classList.remove('show');

    const spawnGap = Math.max(.72, 1.16 - elapsed * .0042);
    if (spawnClock <= 0) {
      spawnHazard(false);
      if (elapsed > 20 && Math.random() < Math.min(.22, (elapsed - 20) * .006)) spawnHazard(true);
      spawnClock = spawnGap * (.82 + Math.random() * .38);
    }
    if (coreClock <= 0) {
      spawnCore();
      coreClock = 5.8 + Math.random() * 2.3;
    }

    for (let index = entities.length - 1; index >= 0; index--) {
      const item = entities[index];
      item.y += speed * (turbo ? 1.23 : 1) * dt * item.speedFactor;
      const lateralDistance = Math.abs(laneX(item.lane, item.y) - laneX(visualLane, PLAYER_Y));
      if (item.kind === 'core' && Math.abs(item.y - PLAYER_Y) < 38 * spriteScale && lateralDistance < 33 * spriteScale) {
        energy = Math.min(100, energy + 31);
        score += 180;
        cores++;
        const repaired = health < 3;
        if (repaired) health++;
        entities.splice(index, 1);
        sound(820, .14, 'triangle');
        toast(repaired ? 'CELLULE : TURBO + BLINDAGE +180' : 'CELLULE ÉNERGIE +180');
        continue;
      }
      if (item.kind === 'hazard' && !item.passed && item.y > PLAYER_Y + 28 * spriteScale) {
        item.passed = true;
        if (!item.hit && lateralDistance > 48 * spriteScale) {
          combo = comboTimer > 0 ? Math.min(MAX_COMBO, combo + 1) : 1;
          bestCombo = Math.max(bestCombo, combo);
          comboTimer = COMBO_WINDOW;
          const passBonus = Math.round((60 + combo * 25) * (boostActive ? 1.35 : 1));
          score += passBonus;
          toast(combo > 1 ? `DÉPASSEMENT ×${combo} · +${passBonus}` : `DÉPASSEMENT PROPRE · +${passBonus}`, .9);
          sound(410 + combo * 65, .075, 'triangle', .035);
        }
      }
      if (item.kind === 'hazard' && invulnerable <= 0 && Math.abs(item.y - PLAYER_Y) < 34 * spriteScale && lateralDistance < 37 * spriteScale) {
        item.hit = true;
        combo = 0;
        comboTimer = 0;
        if (boostActive && energy >= 26) {
          energy = Math.max(0, energy - 26);
          invulnerable = .9;
          sound(660, .12, 'triangle');
          toast('TURBO : IMPACT ABSORBÉ');
        } else {
          health--;
          invulnerable = 1.25;
          shake = .85;
          damageFlash = reduceMotion ? 0 : .55;
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
      if (item.y > H + 80 * spriteScale) entities.splice(index, 1);
    }

    score += dt * (turbo ? 12 : 8);
    updateHud();
    if (remaining <= 0) endGame(true);
  }

  function spawnHazard(secondInWave) {
    const occupied = entities.filter(item => item.kind === 'hazard' && item.y < 135).map(item => item.lane);
    const choices = LANES.filter(candidate => !occupied.includes(candidate));
    if (!choices.length) return;
    const chosenLane = choices[Math.floor(Math.random() * choices.length)];
    entities.push({ kind: 'hazard', lane: chosenLane, y: -80 * spriteScale - (secondInWave ? 34 * spriteScale : 0), speedFactor: 1, color: Math.random() > .5 ? '#ff9d55' : '#ff5879', phase: Math.random() * 10, passed: false, hit: false });
  }

  function spawnCore() {
    const laneChoice = LANES[Math.floor(Math.random() * LANES.length)];
    if (entities.some(item => item.y < 100 && item.lane === laneChoice)) return;
    entities.push({ kind: 'core', lane: laneChoice, y: -42 * spriteScale, speedFactor: .96, phase: Math.random() * 10 });
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
    const sector = SECTORS[sectorIndex];
    bg.addColorStop(0, sector.sky);
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
    asphalt.addColorStop(.5, sector.road);
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
      ctx.globalAlpha = star.alpha * (reduceMotion ? .86 : .72 + Math.sin(elapsed * 2 + star.phase) * .22);
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
        ctx.fillStyle = SECTORS[sectorIndex].windows[window.colorIndex];
        ctx.globalAlpha = reduceMotion ? .55 : .5 + Math.sin(elapsed * .7 + window.phase) * .15;
        ctx.fillRect(x + window.x, y + window.y, 3, 4);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawCar(x, y, color, isPlayer, phase = 0) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(spriteScale, spriteScale);
    if (isPlayer && invulnerable > 0 && (reduceMotion || Math.floor(elapsed * 15) % 2)) ctx.globalAlpha = reduceMotion ? .72 : .48;
    if (isPlayer && boostActive) {
      ctx.fillStyle = '#42eaff9c';
      ctx.fillRect(-7, 34, 5, 22 + (reduceMotion ? 0 : Math.sin(elapsed * 30) * 6));
      ctx.fillRect(2, 36, 5, 24 + (reduceMotion ? 0 : Math.cos(elapsed * 26) * 6));
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
    if (isPlayer) {
      const scannerX = reduceMotion ? 0 : Math.sin(elapsed * 15) * 10;
      ctx.fillStyle = '#3b101b';
      ctx.fillRect(-13, -19, 26, 5);
      ctx.fillStyle = '#ff405a';
      ctx.shadowColor = '#ff304d';
      ctx.shadowBlur = 13;
      ctx.fillRect(scannerX - 3, -19, 6, 5);
      ctx.shadowBlur = 0;
    }
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
    const pulse = reduceMotion ? 1 : 1 + Math.sin(elapsed * 7 + phase) * .11;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(Math.PI / 4);
    ctx.scale(pulse * spriteScale, pulse * spriteScale);
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
    if (damageFlash > 0) {
      ctx.fillStyle = `rgba(255,46,79,${damageFlash * .26})`;
      ctx.fillRect(0, 0, W, H);
    }
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
          colorIndex: Math.random() > .62 ? 0 : 1,
          phase: Math.random() * 9
        }));
        buildings.push({ side, x: 8 + Math.random() * 100, y: Math.random() * (H + 130), width, height, depth: .25 + Math.random() * .75, windows });
      }
    }
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = stage.getBoundingClientRect();
    const previousHeight = H;
    viewScale = rect.width > 0 ? rect.width / W : 1;
    H = rect.height > 0 ? rect.height / viewScale : BASE_H;
    PLAYER_Y = H * .8;
    spriteScale = Math.max(1, 1 / Math.sqrt(viewScale));
    worldHeightScale = H / BASE_H;
    if (previousHeight !== H && previousHeight > 0) {
      const verticalRatio = H / previousHeight;
      roadScroll *= verticalRatio;
      entities.forEach(item => { item.y *= verticalRatio; });
      stars.forEach(star => { star.y *= verticalRatio; });
      buildings.forEach(building => { building.y *= verticalRatio; });
    }
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    ctx.imageSmoothingEnabled = false;
  }

  function frame(timestamp) {
    if (!lastFrame) lastFrame = timestamp;
    const dt = Math.min(.05, Math.max(0, (timestamp - lastFrame) / 1000));
    lastFrame = timestamp;
    if (mode === 'countdown') {
      const oldBeat = Math.ceil(countdown);
      countdown = Math.max(0, countdown - dt);
      const newBeat = Math.ceil(countdown);
      if (newBeat < oldBeat) {
        if (countdown === 0) { mode = 'playing'; toast('GO !', .8); sound(660, .13, 'triangle'); }
        else { toast(String(newBeat), .8); sound(430 + newBeat * 70, .08, 'square', .035); }
      }
      toastClock = Math.max(0, toastClock - dt);
      if (!toastClock) $('toast').classList.remove('show');
    }
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
  window.addEventListener('blur', () => { if (mode === 'playing' || mode === 'countdown') pauseGame(); toggleBoost(false); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && (mode === 'playing' || mode === 'countdown')) pauseGame(); });

  resize();
  makeScenery();
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches) stage.classList.add('touch-enabled');
  updateBestLabel();
  showScreen('title-screen');
  requestAnimationFrame(frame);
})();
