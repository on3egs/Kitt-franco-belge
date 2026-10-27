(() => {
  'use strict';

  const library = document.querySelector('#gameLibrary .arcadeGrid');
  const menu = document.getElementById('gameLibrary');
  if (!library || !menu || document.getElementById('kxExtraOverlay')) return;

  const cardMarkup = [
    ['BREAKOUT', '▤', 'BREAKOUT · KITT ARCADE', 'Casse les rangées de blindage en gardant la balle dans le jeu.', 'RÉFLEXES · SOURIS, FLÈCHES, TACTILE'],
    ['SIMON', '◉', 'SIMON · SIGNAL KX', 'Mémorise la séquence lumineuse et reproduis-la sans faute.', 'MÉMOIRE · FLÈCHES OU BOUTONS COULEUR']
  ].map(([id, glyph, title, copy, tag]) => `
    <button class="arcadeCard" type="button" data-kx-extra="${id}" aria-label="Lancer ${title}">
      <span class="arcadeArt" aria-hidden="true">${glyph}</span>
      <span><b>${title}</b><small>${copy}</small><em>${tag}</em></span>
    </button>`).join('');
  library.insertAdjacentHTML('beforeend', cardMarkup);

  const overlay = document.createElement('div');
  overlay.id = 'kxExtraOverlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <section class="kxExtraShell" role="dialog" aria-modal="true" aria-labelledby="kxExtraTitle">
      <div class="kxExtraHeader">
        <strong class="kxExtraTitle" id="kxExtraTitle">KYRONEXT ARCADE</strong>
        <div class="kxExtraStats"><span id="kxExtraScore">SCORE 000000</span><span id="kxExtraBest">RECORD 000000</span></div>
        <button id="kxExtraSound" type="button" aria-pressed="true">SON · ON</button>
        <button id="kxExtraPause" type="button" aria-pressed="false">PAUSE</button>
        <button id="kxExtraExit" type="button" aria-label="Fermer le jeu et revenir au menu">FERMER</button>
      </div>
      <canvas id="kxExtraCanvas" width="480" height="480" aria-label="Zone de jeu KYRONEXT"></canvas>
      <p class="kxExtraHelp" id="kxExtraHelp" aria-live="polite"></p>
      <div class="kxExtraControls" id="kxBreakoutControls" aria-label="Commandes de casse-brique">
        <button type="button" data-breakout="left" aria-label="Déplacer la raquette à gauche">◀ GAUCHE</button>
        <button type="button" data-breakout="serve">● SERVIR</button>
        <button type="button" data-breakout="right" aria-label="Déplacer la raquette à droite">DROITE ▶</button>
      </div>
      <div class="kxExtraControls" id="kxSimonControls" aria-label="Boutons du jeu Simon" hidden>
        <button class="kxSimonPad" type="button" data-simon="0">▲ ROUGE</button>
        <button class="kxSimonPad" type="button" data-simon="1">▶ BLEU</button>
        <button class="kxSimonPad" type="button" data-simon="2">▼ JAUNE</button>
        <button class="kxSimonPad" type="button" data-simon="3">◀ VERT</button>
      </div>
      <div class="kxExtraResult" id="kxExtraResult" aria-hidden="true">
        <div class="kxExtraResultCard">
          <h2 id="kxExtraResultTitle">MISSION TERMINÉE</h2>
          <p id="kxExtraResultCopy"></p>
          <div class="kxExtraResultActions"><button id="kxExtraReplay" type="button">REJOUER</button><button id="kxExtraReturn" type="button">RETOUR À L’ARCADE</button></div>
        </div>
      </div>
    </section>`;
  document.body.append(overlay);

  const canvas = document.getElementById('kxExtraCanvas');
  const ctx = canvas.getContext('2d');
  const scoreLabel = document.getElementById('kxExtraScore');
  const bestLabel = document.getElementById('kxExtraBest');
  const helpLabel = document.getElementById('kxExtraHelp');
  const breakoutControls = document.getElementById('kxBreakoutControls');
  const simonControls = document.getElementById('kxSimonControls');
  const result = document.getElementById('kxExtraResult');
  const resultTitle = document.getElementById('kxExtraResultTitle');
  const resultCopy = document.getElementById('kxExtraResultCopy');
  const directionKeys = new Set();
  const colors = ['#ff5146', '#43c8ff', '#ffca4f', '#62f38c'];
  let state = null;
  let frame = 0;
  let audio = null;
  let soundOn = true;

  function tone(indexOrFrequency, length = .09) {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const frequencies = [523.25, 659.25, 783.99, 987.77];
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = indexOrFrequency > 3 ? indexOrFrequency : frequencies[indexOrFrequency];
      gain.gain.setValueAtTime(.0001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.08, audio.currentTime + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + length);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + length + .02);
    } catch (_) { /* Le jeu reste jouable si le navigateur bloque l’audio. */ }
  }

  function bestFor(name) {
    try { return Math.max(0, Number(localStorage.getItem('kx-extra-record-' + name) || 0)); }
    catch (_) { return 0; }
  }

  function setScore(score) {
    if (!state) return;
    state.score = Math.max(0, Math.floor(score));
    if (state.score > state.best) {
      state.best = state.score;
      try { localStorage.setItem('kx-extra-record-' + state.name, String(state.best)); } catch (_) { /* Stockage local facultatif. */ }
    }
    scoreLabel.textContent = 'SCORE ' + String(state.score).padStart(6, '0');
    bestLabel.textContent = 'RECORD ' + String(state.best).padStart(6, '0');
  }

  function makeBricks(level) {
    const bricks = [];
    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < 9; column++) {
        bricks.push({x: 22 + column * 49, y: 59 + row * 26, w: 43, h: 17, hp: row < Math.min(2, Math.floor((level - 1) / 2)) ? 2 : 1, row});
      }
    }
    return bricks;
  }

  function createBreakout() {
    const speed = 285 + (state.level - 1) * 22;
    state.bricks = makeBricks(state.level);
    state.paddle = {x: 198, y: 445, w: 84, h: 10, speed: 430};
    state.ball = {x: 240, y: 433, r: 7, vx: speed * .55, vy: -speed * .84};
    state.serving = true;
    state.keys = {left: false, right: false};
  }

  function begin(name) {
    if (frame) cancelAnimationFrame(frame);
    state = {name, score: 0, best: bestFor(name), paused: false, over: false, won: false, last: performance.now(), keys: {}};
    directionKeys.clear();
    result.classList.remove('show');
    result.setAttribute('aria-hidden', 'true');
    document.getElementById('kxExtraPause').textContent = 'PAUSE';
    document.getElementById('kxExtraPause').setAttribute('aria-pressed', 'false');
    if (name === 'BREAKOUT') {
      canvas.width = 480; canvas.height = 480;
      breakoutControls.hidden = false; simonControls.hidden = true;
      helpLabel.textContent = '← → ou A/D pour guider la raquette · Espace, clic ou ● pour lancer · P pause · Échap retour.';
      state.level = 1; state.lives = 3; createBreakout();
    } else {
      canvas.width = 480; canvas.height = 480;
      breakoutControls.hidden = true; simonControls.hidden = false;
      helpLabel.textContent = 'Observe la séquence, puis reproduis-la avec les flèches ou les quatre boutons. P pause · Échap retour.';
      state.sequence = [Math.floor(Math.random() * 4)];
      state.stage = 'show'; state.inputIndex = 0; state.showStart = performance.now() + 450; state.flashIndex = -1; state.lastToneSlot = -1; state.flashUntil = 0;
    }
    setScore(0);
    frame = requestAnimationFrame(loop);
  }

  function finish(won, message) {
    if (!state || state.over) return;
    state.over = true; state.won = won; state.endReason = message;
    resultTitle.textContent = won ? 'MISSION ACCOMPLIE' : 'PARTIE TERMINÉE';
    resultCopy.textContent = message + ' Score : ' + String(state.score) + '. Record local : ' + String(state.best) + '.';
    result.classList.add('show');
    result.setAttribute('aria-hidden', 'false');
    tone(won ? 784 : 220, .18);
    document.getElementById('kxExtraReplay').focus({preventScroll: true});
  }

  function updateBreakout(dt) {
    const p = state.paddle, b = state.ball;
    if (state.keys.left) p.x -= p.speed * dt;
    if (state.keys.right) p.x += p.speed * dt;
    p.x = Math.max(10, Math.min(canvas.width - p.w - 10, p.x));
    if (state.serving) { b.x = p.x + p.w / 2; b.y = p.y - b.r - 2; return; }
    const oldX = b.x, oldY = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x - b.r < 8) { b.x = 8 + b.r; b.vx = Math.abs(b.vx); tone(420, .035); }
    if (b.x + b.r > canvas.width - 8) { b.x = canvas.width - 8 - b.r; b.vx = -Math.abs(b.vx); tone(420, .035); }
    if (b.y - b.r < 8) { b.y = 8 + b.r; b.vy = Math.abs(b.vy); tone(500, .035); }
    if (b.vy > 0 && b.y + b.r >= p.y && b.y - b.r <= p.y + p.h && b.x >= p.x - b.r && b.x <= p.x + p.w + b.r) {
      const hit = Math.max(-1, Math.min(1, (b.x - (p.x + p.w / 2)) / (p.w / 2)));
      const speed = Math.min(440 + state.level * 16, Math.hypot(b.vx, b.vy) * 1.025);
      b.vx = hit * speed * .88; b.vy = -Math.sqrt(Math.max(110 * 110, speed * speed - b.vx * b.vx)); b.y = p.y - b.r - 1;
      tone(660, .045);
    }
    for (let i = state.bricks.length - 1; i >= 0; i--) {
      const brick = state.bricks[i];
      if (b.x + b.r < brick.x || b.x - b.r > brick.x + brick.w || b.y + b.r < brick.y || b.y - b.r > brick.y + brick.h) continue;
      brick.hp -= 1; setScore(state.score + 50 * state.level);
      if (brick.hp <= 0) state.bricks.splice(i, 1);
      if (oldY + b.r <= brick.y || oldY - b.r >= brick.y + brick.h) b.vy *= -1; else b.vx *= -1;
      tone(720 + brick.row * 30, .06);
      break;
    }
    if (b.y - b.r > canvas.height) {
      state.lives -= 1;
      if (state.lives <= 0) { finish(false, 'La balle a quitté le secteur.'); return; }
      state.serving = true; b.vx = 220; b.vy = -310; tone(235, .14);
    }
    if (state.bricks.length === 0) {
      state.level += 1;
      if (state.level > 4) { finish(true, 'Quatre secteurs de briques neutralisés.'); return; }
      createBreakout(); tone(880, .16);
      helpLabel.textContent = 'Secteur ' + state.level + ' · flèches/A-D, souris, touches ou boutons pour guider la raquette · Espace pour lancer.';
    }
  }

  function drawBreakout(now) {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height); g.addColorStop(0, '#06131b'); g.addColorStop(.55, '#02070b'); g.addColorStop(1, '#100301');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#17313b'; ctx.lineWidth = 1;
    for (let y = 28; y < 470; y += 28) { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(470, y); ctx.stroke(); }
    ctx.fillStyle = '#9fb7b9'; ctx.font = '12px Courier New'; ctx.textAlign = 'left'; ctx.fillText('SECTEUR ' + state.level + ' / 4', 16, 24); ctx.textAlign = 'right'; ctx.fillText('BLINDAGE ' + state.lives, 464, 24);
    state.bricks.forEach(brick => {
      const hue = [0, 8, 28, 150, 190][brick.row];
      const color = brick.hp > 1 ? '#ffc44e' : ['#ff5b4c', '#ff8350', '#ffc44e', '#63f18d', '#48cfff'][brick.row];
      ctx.save(); ctx.shadowBlur = 12; ctx.shadowColor = color; ctx.fillStyle = color; ctx.fillRect(brick.x, brick.y, brick.w, brick.h); ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(brick.x + 3, brick.y + 2, brick.w - 6, 2); ctx.restore();
    });
    const p = state.paddle, b = state.ball;
    ctx.save(); ctx.shadowColor = '#51e8ff'; ctx.shadowBlur = 16; ctx.fillStyle = '#6ceeff'; ctx.fillRect(p.x, p.y, p.w, p.h); ctx.restore();
    ctx.save(); ctx.shadowColor = '#fff0a3'; ctx.shadowBlur = 18; ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    if (state.serving) { ctx.fillStyle = '#c3d5d5'; ctx.textAlign = 'center'; ctx.font = 'bold 15px Courier New'; ctx.fillText('APPUYER SUR ESPACE / ● POUR LANCER', 240, 388); }
    if (state.paused) pauseShade('PAUSE · P POUR REPRENDRE');
  }

  function updateSimon(now) {
    if (state.stage !== 'show') { if (now > state.flashUntil) state.flashIndex = -1; return; }
    const elapsed = now - state.showStart;
    if (elapsed < 0) { state.flashIndex = -1; return; }
    const span = 760, slot = Math.floor(elapsed / span);
    if (slot >= state.sequence.length) { state.stage = 'input'; state.flashIndex = -1; state.inputIndex = 0; helpLabel.textContent = 'À toi · reproduis les ' + state.sequence.length + ' signaux avec les flèches ou les boutons couleur.'; return; }
    const nextFlash = elapsed % span < 500 ? state.sequence[slot] : -1;
    state.flashIndex = nextFlash;
    if (nextFlash >= 0 && state.lastToneSlot !== slot) { state.lastToneSlot = slot; tone(nextFlash, .16); }
  }

  function pressSimon(index) {
    if (!state || state.name !== 'SIMON' || state.over || state.paused || state.stage !== 'input') return;
    state.flashIndex = index; state.flashUntil = performance.now() + 230; tone(index, .1);
    if (state.sequence[state.inputIndex] !== index) { finish(false, 'Le signal ne correspondait pas à la séquence.'); return; }
    state.inputIndex += 1;
    if (state.inputIndex < state.sequence.length) return;
    setScore(state.sequence.length);
    if (state.sequence.length >= 14) { finish(true, 'Quatorze signaux mémorisés sans erreur.'); return; }
    state.sequence.push(Math.floor(Math.random() * 4)); state.stage = 'show'; state.showStart = performance.now() + 620; state.lastToneSlot = -1; state.inputIndex = 0;
    helpLabel.textContent = 'Bien joué · la séquence s’allonge. Écoute le prochain signal.';
  }

  function drawSimon(now) {
    ctx.fillStyle = '#020609'; ctx.fillRect(0, 0, 480, 480);
    const pads = [
      {x: 18, y: 55, w: 214, h: 178, label: 'HAUT · ROUGE'},
      {x: 248, y: 55, w: 214, h: 178, label: 'DROITE · BLEU'},
      {x: 18, y: 247, w: 214, h: 178, label: 'BAS · JAUNE'},
      {x: 248, y: 247, w: 214, h: 178, label: 'GAUCHE · VERT'}
    ];
    ctx.fillStyle = '#d6e9e8'; ctx.font = 'bold 13px Courier New'; ctx.textAlign = 'center'; ctx.fillText(state.stage === 'show' ? 'ÉCOUTE ET OBSERVE LE SIGNAL' : 'REPRODUIS LA SÉQUENCE', 240, 30);
    pads.forEach((pad, index) => {
      const active = state.flashIndex === index && (state.stage === 'show' || now < state.flashUntil);
      ctx.save(); ctx.shadowColor = colors[index]; ctx.shadowBlur = active ? 28 : 7;
      ctx.fillStyle = active ? '#f5fff9' : colors[index]; ctx.globalAlpha = active ? 1 : .48; ctx.beginPath(); ctx.roundRect(pad.x, pad.y, pad.w, pad.h, 22); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = active ? '#ffffff' : '#b9eaff88'; ctx.lineWidth = active ? 3 : 1; ctx.stroke();
      ctx.fillStyle = active ? '#061014' : '#fff5ee'; ctx.font = 'bold 12px Courier New'; ctx.fillText(pad.label, pad.x + pad.w / 2, pad.y + pad.h / 2 + 4); ctx.restore();
    });
    ctx.fillStyle = '#9ab4b6'; ctx.font = '11px Courier New'; ctx.textAlign = 'center';
    const round = Math.max(1, state.sequence.length);
    ctx.fillText('SÉRIE ' + round + ' · ' + (state.stage === 'input' ? state.inputIndex + ' / ' + round + ' REPRODUITS' : 'ÉCOUTE'), 240, 457);
    if (state.paused) pauseShade('PAUSE · P POUR REPRENDRE');
  }

  function pauseShade(label) {
    ctx.fillStyle = 'rgba(0,0,0,.66)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff0cf'; ctx.font = 'bold 20px Courier New'; ctx.textAlign = 'center'; ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  }

  function loop(now) {
    if (!state || !overlay.classList.contains('show')) return;
    const dt = Math.min(.04, Math.max(0, (now - state.last) / 1000)); state.last = now;
    if (!state.paused && !state.over) {
      if (state.name === 'BREAKOUT') updateBreakout(dt);
      else updateSimon(now);
    }
    if (state.name === 'BREAKOUT') drawBreakout(now); else drawSimon(now);
    frame = requestAnimationFrame(loop);
  }

  function launch(name) {
    menu.classList.remove('show'); menu.setAttribute('aria-hidden', 'true');
    overlay.classList.add('show'); overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('kxExtraTitle').textContent = name === 'BREAKOUT' ? 'BREAKOUT · KITT ARCADE' : 'SIMON · SIGNAL KX';
    begin(name);
    document.getElementById('kxExtraExit').focus({preventScroll: true});
  }

  function returnToLibrary() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; state = null; directionKeys.clear();
    overlay.classList.remove('show'); overlay.setAttribute('aria-hidden', 'true');
    menu.classList.add('show'); menu.setAttribute('aria-hidden', 'false');
    menu.querySelector('[data-kx-extra]')?.focus({preventScroll: true});
  }

  function togglePause() {
    if (!state || state.over) return;
    const now = performance.now();
    if (!state.paused) { state.paused = true; state.pauseAt = now; }
    else {
      state.paused = false;
      if (state.name === 'SIMON' && state.stage === 'show') state.showStart += now - state.pauseAt;
      state.last = now;
    }
    const button = document.getElementById('kxExtraPause');
    button.textContent = state.paused ? 'REPRENDRE' : 'PAUSE';
    button.setAttribute('aria-pressed', String(state.paused));
  }

  library.querySelectorAll('[data-kx-extra]').forEach(button => button.addEventListener('click', () => launch(button.dataset.kxExtra)));
  document.getElementById('kxExtraExit').addEventListener('click', returnToLibrary);
  document.getElementById('kxExtraReturn').addEventListener('click', returnToLibrary);
  document.getElementById('kxExtraReplay').addEventListener('click', () => state && launch(state.name));
  document.getElementById('kxExtraPause').addEventListener('click', togglePause);
  document.getElementById('kxExtraSound').addEventListener('click', event => {
    soundOn = !soundOn; event.currentTarget.textContent = 'SON · ' + (soundOn ? 'ON' : 'OFF'); event.currentTarget.setAttribute('aria-pressed', String(soundOn));
    if (soundOn) tone(660, .06);
  });

  document.querySelectorAll('[data-breakout]').forEach(button => {
    const action = button.dataset.breakout;
    button.addEventListener('pointerdown', event => { event.preventDefault(); if (!state || state.name !== 'BREAKOUT' || state.paused) return; if (action === 'serve') state.serving = false; else state.keys[action] = true; button.setPointerCapture?.(event.pointerId); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => { if (state && state.name === 'BREAKOUT' && action !== 'serve') state.keys[action] = false; });
  });
  document.querySelectorAll('[data-simon]').forEach(button => button.addEventListener('pointerdown', event => { event.preventDefault(); pressSimon(Number(button.dataset.simon)); }));
  canvas.addEventListener('pointermove', event => {
    if (!state || state.name !== 'BREAKOUT' || state.paused) return;
    const bounds = canvas.getBoundingClientRect();
    state.paddle.x = (event.clientX - bounds.left) / bounds.width * canvas.width - state.paddle.w / 2;
  });
  canvas.addEventListener('pointerdown', event => {
    if (!state || state.paused) return;
    if (state.name === 'BREAKOUT') state.serving = false;
    else {
      const bounds = canvas.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width * canvas.width;
      const y = (event.clientY - bounds.top) / bounds.height * canvas.height;
      pressSimon((y < 240 ? (x < 240 ? 0 : 1) : (x < 240 ? 3 : 2)));
    }
  });
  document.getElementById('kxExtraOverlay').addEventListener('keydown', event => {
    if (!state || !overlay.classList.contains('show')) return;
    if (event.key === 'Escape') { event.preventDefault(); returnToLibrary(); return; }
    if (event.key.toLowerCase() === 'p') { event.preventDefault(); togglePause(); return; }
    if (state.name === 'BREAKOUT') {
      if (['ArrowLeft', 'ArrowRight', ' ', 'a', 'A', 'd', 'D'].includes(event.key)) event.preventDefault();
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') state.keys.left = true;
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') state.keys.right = true;
      if (event.key === ' ' || event.key === 'Enter') state.serving = false;
    } else {
      const keys = {ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3};
      if (Object.prototype.hasOwnProperty.call(keys, event.key)) { event.preventDefault(); if (!event.repeat) pressSimon(keys[event.key]); }
    }
  });
  document.getElementById('kxExtraOverlay').addEventListener('keyup', event => {
    if (!state || state.name !== 'BREAKOUT') return;
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') state.keys.left = false;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') state.keys.right = false;
  });
  document.getElementById('kxExtraResult').addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); returnToLibrary(); } });
})();
