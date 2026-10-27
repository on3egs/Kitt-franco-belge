(() => {
  'use strict';

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const byId = id => document.getElementById(id);
  const ui = {
    sector: byId('sector'),
    score: byId('score'),
    combo: byId('combo'),
    accuracy: byId('accuracy'),
    best: byId('best'),
    progress: byId('progress'),
    start: byId('start'),
    pause: byId('pause'),
    wide: byId('wide-window'),
    motion: byId('motion'),
    message: byId('message'),
    result: byId('result'),
    title: byId('result-title'),
    copy: byId('result-copy'),
    pilot: byId('pilot'),
    save: byId('save'),
    again: byId('again'),
    sound: byId('sound')
  };

  const colors = ['#71c9ff', '#72f0be', '#ffd16b', '#ff6a83'];
  const keys = ['a', 's', 'd', 'f'];
  const state = {
    notes: [],
    started: false,
    paused: false,
    done: false,
    muted: false,
    reduced: false,
    wideWindow: false,
    sector: 0,
    displayedSector: -1,
    score: 0,
    combo: 0,
    bestCombo: 0,
    hits: 0,
    misses: 0,
    perfect: 0,
    good: 0,
    offset: 0,
    pauseAt: 0
  };

  const bpm = 112;
  const beat = 60 / bpm;
  const travel = 2.15;
  const sectorBeats = 16;
  const totalSectors = 6;
  const totalBeats = sectorBeats * totalSectors;
  const bestKey = 'signalRhythmBest.v1';
  const windowNormal = 0.22;
  const windowRelaxed = 0.29;
  let audioContext;

  function readBest() {
    try {
      return Number(localStorage.getItem(bestKey)) || 0;
    } catch {
      return 0;
    }
  }

  function playTone(frequency, duration = 0.08) {
    if (state.muted) return;
    try {
      audioContext ||= new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.07, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch {}
  }

  function accuracy() {
    const judged = state.hits + state.misses;
    return judged ? Math.round(state.hits / judged * 100) + '%' : '—';
  }

  function refreshHud() {
    ui.score.textContent = state.score.toLocaleString('fr-FR');
    ui.combo.textContent = state.combo + '×';
    ui.sector.textContent = state.started
      ? Math.min(totalSectors, state.sector + 1) + ' / ' + totalSectors
      : 'PRÊT';
    ui.best.textContent = readBest().toLocaleString('fr-FR');
    ui.accuracy.textContent = accuracy();
  }

  function createChart() {
    const notes = [];
    let seed = 1947;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let currentBeat = 0; currentBeat < totalBeats; currentBeat++) {
      const sector = Math.floor(currentBeat / sectorBeats);
      const chance = 0.48 + sector * 0.055;
      if (currentBeat % 4 === 0 || random() > 1 - chance) {
        let lane = Math.floor(random() * 4);
        const previous = notes[notes.length - 1];
        if (previous && previous.beat === currentBeat - 1 && previous.lane === lane) {
          lane = (lane + 1 + Math.floor(random() * 2)) % 4;
        }
        notes.push({ beat: currentBeat, lane, judged: false });
      }

      if (currentBeat > 7 && currentBeat % 8 === 6 && random() > 0.48) {
        let lane = Math.floor(random() * 4);
        const previous = notes[notes.length - 1];
        if (previous && previous.beat === currentBeat && previous.lane === lane) lane = (lane + 1) % 4;
        notes.push({ beat: currentBeat + 0.5, lane, judged: false });
      }
    }

    return notes.sort((a, b) => a.beat - b.beat);
  }

  function start() {
    if (state.started && !state.done) return;
    state.notes = createChart();
    state.started = true;
    state.paused = false;
    state.done = false;
    state.sector = 0;
    state.displayedSector = -1;
    state.score = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.hits = 0;
    state.misses = 0;
    state.perfect = 0;
    state.good = 0;
    state.offset = performance.now() + 1700;
    ui.progress.value = 0;
    ui.result.classList.add('hidden');
    ui.start.disabled = true;
    ui.pause.disabled = false;
    ui.pause.textContent = 'PAUSE';
    ui.message.textContent = 'Observe la couleur, puis frappe quand la note touche la ligne. Départ dans 2 secondes.';
    playTone(440);
    refreshHud();
  }

  function judge(lane) {
    if (!state.started || state.paused || state.done) return;

    const elapsed = ((state.paused ? state.pauseAt : performance.now()) - state.offset) / 1000;
    let nearest = null;
    let difference = Infinity;

    for (const note of state.notes) {
      if (note.judged || note.lane !== lane) continue;
      const delta = Math.abs(note.beat * beat - elapsed);
      if (delta < difference) {
        nearest = note;
        difference = delta;
      }
    }

    const tolerance = state.wideWindow ? windowRelaxed : windowNormal;
    if (nearest && difference <= tolerance) {
      nearest.judged = true;
      state.hits++;
      state.combo++;
      state.bestCombo = Math.max(state.bestCombo, state.combo);

      if (difference <= 0.075) {
        state.perfect++;
        state.score += 100 + Math.min(50, state.combo);
        ui.message.textContent = 'PARFAIT · ' + state.combo + '×';
        playTone(660 + lane * 110, 0.07);
        if (navigator.vibrate) navigator.vibrate(10);
      } else {
        state.good++;
        state.score += 55 + Math.min(25, state.combo);
        ui.message.textContent = 'BON TEMPO · continue';
        playTone(490 + lane * 75, 0.05);
      }
    } else if (nearest) {
      const noteTime = nearest.beat * beat;
      ui.message.textContent = noteTime > elapsed
        ? 'TROP TÔT · attends que la note atteigne la ligne'
        : 'TROP TARD · vise la prochaine note';
      playTone(180, 0.05);
    } else {
      ui.message.textContent = 'MAUVAISE PISTE · suis la couleur de la note';
      playTone(180, 0.05);
    }

    const button = document.querySelector('[data-lane="' + lane + '"]');
    button.classList.add('hit');
    setTimeout(() => button.classList.remove('hit'), 90);
    refreshHud();
  }

  function setPaused(value) {
    if (!state.started || state.done || state.paused === value) return;
    const now = performance.now();
    if (value) {
      state.pauseAt = now;
    } else if (state.pauseAt) {
      state.offset += now - state.pauseAt;
      state.pauseAt = 0;
    }
    state.paused = value;
    ui.pause.textContent = value ? 'REPRENDRE' : 'PAUSE';
    ui.message.textContent = value ? 'Session en pause. Reprends quand tu es prêt.' : 'Le tempo repart.';
  }

  function finish() {
    state.done = true;
    ui.start.disabled = false;
    ui.pause.disabled = true;
    ui.sector.textContent = 'FIN';
    ui.progress.value = 100;
    ui.title.textContent = state.perfect >= 35
      ? 'RYTHME IMPECCABLE'
      : state.hits > state.misses ? 'SIGNAL MAÎTRISÉ' : 'SESSION TERMINÉE';
    ui.copy.textContent =
      state.score.toLocaleString('fr-FR') + ' points · ' + state.hits +
      ' notes touchées · ' + state.perfect + ' parfaites · combo max ' +
      state.bestCombo + ' · précision ' + accuracy() + '.';
    ui.result.classList.remove('hidden');
    ui.save.disabled = false;
    ui.save.textContent = 'ENREGISTRER LE SCORE';
    ui.pilot.focus();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const background = ctx.createLinearGradient(0, 0, 800, 600);
    background.addColorStop(0, '#11152a');
    background.addColorStop(1, '#080b13');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 800, 600);

    for (let lane = 0; lane < 4; lane++) {
      const x = 190 + lane * 105;
      ctx.fillStyle = lane % 2 ? '#ffffff06' : '#75d7ff08';
      ctx.fillRect(x, 0, 92, 600);
      ctx.strokeStyle = colors[lane] + '36';
      ctx.beginPath();
      ctx.moveTo(x + 46, 0);
      ctx.lineTo(x + 46, 600);
      ctx.stroke();
      ctx.fillStyle = colors[lane];
      ctx.font = '700 17px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(keys[lane].toUpperCase(), x + 46, 72);
    }

    const targetY = 470;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#9fefff';
    ctx.shadowBlur = state.reduced ? 0 : 22;
    ctx.beginPath();
    ctx.moveTo(156, targetY);
    ctx.lineTo(644, targetY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff22';
    for (let y = 120; y < 600; y += 70) {
      ctx.beginPath();
      ctx.moveTo(150, y);
      ctx.lineTo(650, y);
      ctx.stroke();
    }

    if (state.started) {
      const elapsed = ((state.paused ? state.pauseAt : performance.now()) - state.offset) / 1000;
      state.sector = Math.max(0, Math.min(totalSectors - 1,
        Math.floor(Math.max(0, elapsed) / beat / sectorBeats)));
      ui.progress.value = Math.max(0, Math.min(100, elapsed / (totalBeats * beat) * 100));

      if (state.sector !== state.displayedSector) {
        state.displayedSector = state.sector;
        refreshHud();
        if (elapsed > 0) ui.message.textContent = 'Secteur ' + (state.sector + 1) + ' : nouveau motif.';
      }

      let missed = false;
      for (const note of state.notes) {
        if (note.judged) continue;
        const noteTime = note.beat * beat;
        if (elapsed > noteTime + (state.wideWindow ? windowRelaxed : windowNormal)) {
          note.judged = true;
          state.misses++;
          state.combo = 0;
          missed = true;
          continue;
        }

        const secondsUntilHit = noteTime - elapsed;
        const y = targetY - secondsUntilHit * (targetY - 110) / travel;
        if (y < -25 || y > targetY + 30) continue;
        const x = 190 + note.lane * 105 + 46;
        ctx.fillStyle = colors[note.lane];
        ctx.shadowColor = colors[note.lane];
        ctx.shadowBlur = state.reduced ? 0 : 15;
        ctx.beginPath();
        ctx.roundRect(x - 23, y - 14, 46, 28, 8);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (missed) refreshHud();
      if (!state.paused && elapsed >= totalBeats * beat + travel + 0.25) finish();
    }

    if (!state.started) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#eaf5ff';
      ctx.font = '700 18px Orbitron, sans-serif';
      ctx.fillText('FRAPPE LA NOTE SUR LA LIGNE LUMINEUSE', 400, 295);
      ctx.fillStyle = '#a8bdd2';
      ctx.font = '16px Rajdhani, sans-serif';
      ctx.fillText('La couleur indique la piste. Les touches A · S · D · F suivent les couleurs.', 400, 328);
    }

    if (state.paused) {
      ctx.fillStyle = '#050712b8';
      ctx.fillRect(0, 0, 800, 600);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 29px Orbitron, sans-serif';
      ctx.fillText('PAUSE', 400, 310);
    }

    ctx.textAlign = 'left';
  }

  function frame() {
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', event => {
    if (event.repeat) return;
    const target = event.target;
    if (target && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName))) return;

    const key = event.key.toLowerCase();
    const lane = keys.indexOf(key);
    if (lane >= 0) {
      event.preventDefault();
      judge(lane);
    } else if (['arrowleft', 'arrowdown', 'arrowup', 'arrowright'].includes(key)) {
      event.preventDefault();
      judge({ arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3 }[key]);
    } else if (event.key === 'Escape') {
      setPaused(!state.paused);
    }
  }, { passive: false });

  document.querySelectorAll('[data-lane]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      judge(Number(button.dataset.lane));
    });
  });

  ui.start.addEventListener('click', start);
  ui.pause.addEventListener('click', () => setPaused(!state.paused));
  ui.sound.addEventListener('click', () => {
    state.muted = !state.muted;
    ui.sound.textContent = state.muted ? 'SON COUPÉ' : 'SON ACTIVÉ';
    ui.sound.setAttribute('aria-pressed', String(!state.muted));
  });
  ui.motion.addEventListener('click', () => {
    state.reduced = !state.reduced;
    ui.motion.textContent = state.reduced ? 'LUMIÈRES RÉDUITES' : 'EFFETS LUMINEUX';
    ui.motion.setAttribute('aria-pressed', String(!state.reduced));
  });
  ui.wide.addEventListener('click', () => {
    state.wideWindow = !state.wideWindow;
    ui.wide.setAttribute('aria-pressed', String(state.wideWindow));
    ui.wide.textContent = state.wideWindow ? 'TEMPO SOUPLE ACTIVÉ' : 'TEMPO SOUPLE';
    ui.message.textContent = state.wideWindow
      ? 'Tempo souple : la fenêtre de frappe passe de 220 à 290 millisecondes.'
      : 'Tempo normal : frappe quand le signal atteint la barre.';
  });

  ui.save.addEventListener('click', () => {
    if (!window.ManixScores || ui.save.disabled) return;
    const pilot = ui.pilot.value.trim().slice(0, 20) || 'PILOTE';
    window.ManixScores.save('Signal Rhythm', pilot, state.score, totalSectors, Math.round(totalBeats * beat + travel));
    try {
      localStorage.setItem(bestKey, String(Math.max(readBest(), state.score)));
    } catch {}
    ui.save.disabled = true;
    ui.save.textContent = 'SCORE ENREGISTRÉ';
    refreshHud();
  });

  ui.again.addEventListener('click', start);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.started && !state.done) setPaused(true);
  });

  refreshHud();
  requestAnimationFrame(frame);
})();
