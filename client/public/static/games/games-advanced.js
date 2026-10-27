(() => {
  "use strict";

  // Mode basse consommation pour Jetson Nano
  const LOW_POWER_MODE = window.KYRONEX_ARCADE_LOW_POWER === true || window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 700 || /Jetson|Nano|Orin/.test(navigator.userAgent || '') || ((navigator.hardwareConcurrency || 99) <= 6 && (navigator.deviceMemory || 99) <= 8);

  const arcade = document.getElementById("arcade");
  const canvas = document.getElementById("arcade-canvas");
  const ctx = canvas && canvas.getContext("2d");
  const title = document.getElementById("arcade-title");
  const help = document.getElementById("arcade-help");
  const soundButton = document.getElementById("arcade-sound");
  const dropButton = document.getElementById("arcade-drop");
  const holdButton = document.getElementById("arcade-hold");
  const restartButton = document.getElementById("arcade-restart");
  const quitButton = document.getElementById("arcade-quit");
  const fullscreenButton = document.getElementById("arcade-fullscreen");
  const viewButton = document.getElementById("arcade-view-toggle");
  const zoomButton = document.getElementById("arcade-zoom-toggle");
  const GAME_ZOOM_STEPS = [1, 1.12, 1.24];
  let gameZoomIndex = 0;

  if (!arcade || !canvas || !ctx || !title || !help) return;

  // Ajouter la méthode roundRect au contexte Canvas si elle n'existe pas
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
      this.beginPath();
      this.moveTo(x + radius, y);
      this.lineTo(x + width - radius, y);
      this.quadraticCurveTo(x + width, y, x + width, y + radius);
      this.lineTo(x + width, y + height - radius);
      this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      this.lineTo(x + radius, y + height);
      this.quadraticCurveTo(x, y + height, x, y + height - radius);
      this.lineTo(x, y + radius);
      this.quadraticCurveTo(x, y, x + radius, y);
      this.closePath();
    };
  }

  let activeGame = null;
  let pendingLaunch=false;
  let animationFrame = 0;
  let lowPowerFrameTimer = 0;
  let audioContext = null;
  let arcadeMaster = null;
  let arcadeCompressor = null;
  let arcadeSfxGain = null;
  let arcadeMusicGain = null;
  let musicTimer = 0;
  let musicStep = 0;
  let musicNotes = [110, 138, 165, 196, 165, 138, 123, 147];
  let musicTempo = 380;
  let musicGame = "";
  let soundEnabled = (() => {
    try { return localStorage.getItem("kyronext.arcade.sound") !== "off"; }
    catch (_) { return true; }
  })();
  const readArcadeVolume = (key, fallback) => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null || stored === "") return fallback;
      const value = Number(stored);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
    } catch (_) {
      return fallback;
    }
  };
  let arcadeSfxVolume = readArcadeVolume("kyronext.arcade.sfx-volume", 0.8);
  let arcadeMusicVolume = readArcadeVolume("kyronext.arcade.music-volume", 0.72);
  try {
    if (localStorage.getItem("kyronext.arcade.audio-defaults-v2") !== "1") {
      if (localStorage.getItem("kyronext.arcade.sfx-volume") === null) arcadeSfxVolume = 0.8;
      if (localStorage.getItem("kyronext.arcade.music-volume") === null) arcadeMusicVolume = 0.72;
      localStorage.setItem("kyronext.arcade.audio-defaults-v2", "1");
    }
  } catch (_) {}
  function launchWithKironextIntro(game, launch) {
    // L'intro est un sas visuel commun : le moteur du jeu ne démarre qu'après
    // sa fin, ce qui évite un jeu déjà actif sous l'écran cinéma.
    if (window.KyronextArcadeIntro?.show) {
      window.KyronextArcadeIntro.show(game, launch);
    } else {
      launch();
    }
  }

  function startClassicGame(game) {
    const names={pacman:"pac-man",tetris:"tetris",tron:"tron",spaceinvaders:"space-invaders"};
    if(!names[game]||pendingLaunch||activeGame?.name===names[game])return;
    if(activeGame)stopGame();
    pendingLaunch=true;
    launchWithKironextIntro(game, () => {
      pendingLaunch=false;
      if (game === "spaceinvaders") spaceInvaders();
      if (game === "pacman" && (!activeGame || activeGame.name !== "pac-man")) pacman();
      if (game === "tetris" && (!activeGame || activeGame.name !== "tetris")) tetris();
      if (game === "tron" && (!activeGame || activeGame.name !== "tron")) tron();
    });
  }

  const COLORS = {
    gold: "#ffe34d",
    cyan: "#63e9ff",
    red: "#ff4d72",
    blue: "#101e52",
  };

  function getAudioContext() {
    if (!soundEnabled) return null;
    try {
      if (!audioContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        audioContext = new AudioContext();
        arcadeCompressor = audioContext.createDynamicsCompressor();
        arcadeCompressor.threshold.value = -16;
        arcadeCompressor.knee.value = 18;
        arcadeCompressor.ratio.value = 4;
        arcadeCompressor.attack.value = 0.004;
        arcadeCompressor.release.value = 0.16;
        arcadeMaster = audioContext.createGain();
        arcadeMaster.gain.value = soundEnabled ? 0.90 : 0;
        arcadeMaster.connect(arcadeCompressor);
        arcadeCompressor.connect(audioContext.destination);
        arcadeSfxGain = audioContext.createGain();
        arcadeSfxGain.gain.value = arcadeSfxVolume;
        arcadeSfxGain.connect(arcadeMaster);
        arcadeMusicGain = audioContext.createGain();
        arcadeMusicGain.gain.value = arcadeMusicVolume;
        arcadeMusicGain.connect(arcadeMaster);
      }
      if (audioContext.state === "suspended") {
        const resume = audioContext.resume();
        if (resume && typeof resume.catch === "function") resume.catch(() => {});
      }
      return audioContext;
    } catch (_) {
      return null;
    }
  }

  // Sur mobile, WebAudio peut rester suspendu après une ouverture automatique
  // de la partie. Chaque interaction de jeu devient donc aussi une occasion
  // explicite de réveiller le moteur sonore, sans dépendre d'un autoplay.
  function resumeArcadeAudio() {
    if (!soundEnabled) return;
    const audio = getAudioContext();
    if (!audio) return;
    if (audio.state === "suspended") audio.resume().catch(() => {});
    // Recrée le timer après une suspension de page ou de WebAudio. Un timer
    // existant peut avoir continué à tourner silencieusement pendant l'intro.
    if (activeGame) startMusic();
  }

  function beep(frequency = 440, duration = 0.08, type = "square", volume = 0.035, channel = "sfx") {
    if (!soundEnabled || document.hidden || !activeGame) return;
    const audio = getAudioContext();
    if (!audio) return;
    try {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      const peak = Math.max(0.001, Math.min(0.08, volume));
      const attack = Math.min(0.012, duration * 0.18);
      gain.gain.setValueAtTime(0.001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(peak, audio.currentTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      const bus = channel === "music" ? arcadeMusicGain : arcadeSfxGain;
      if (audio.createStereoPanner) {
        const pan = audio.createStereoPanner();
        pan.pan.value = Math.max(-0.28, Math.min(0.28, ((frequency % 97) / 97 - .5) * .5));
        oscillator.connect(gain).connect(pan).connect(bus || arcadeMaster || audio.destination);
        oscillator.onended = () => {
          try { oscillator.disconnect(); gain.disconnect(); pan.disconnect(); } catch (_) {}
        };
      } else {
        oscillator.connect(gain).connect(bus || arcadeMaster || audio.destination);
        oscillator.onended = () => {
          try { oscillator.disconnect(); gain.disconnect(); } catch (_) {}
        };
      }
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    } catch (_) {
      // Le jeu reste jouable même si Web Audio est indisponible.
    }
  }

  const arcadeSamples = new Map();
  function playSample(name, volume = 0.45) {
    if (!soundEnabled || document.hidden) return;
    try {
      let proto = arcadeSamples.get(name);
      if (!proto) {
        proto = new Audio("audio/" + name + ".wav");
        proto.preload = "auto";
        arcadeSamples.set(name, proto);
      }
      const a = proto.cloneNode();
      a.volume = Math.max(0, Math.min(1, volume * arcadeSfxVolume));
      a.play().catch(() => {});
    } catch (_) {}
  }

  function pacmanDeathSound() {
    [520, 440, 360, 280, 200, 120].forEach((frequency, index) => {
      window.setTimeout(() => beep(frequency, 0.11, "sawtooth"), index * 60);
    });
    // Effet de fin de mort
    window.setTimeout(() => beep(80, 0.2, "sine"), 400);
  }

  // Sons synthétiques originaux : petits cues courts, sans échantillons protégés.
  function pacmanSound(kind, alternate = false) {
    if (kind === "chomp") {
      beep(alternate ? 520 : 410, 0.045, "square", 0.024);
    } else if (kind === "power") {
      [520, 660, 820].forEach((n, i) => setTimeout(() => beep(n, 0.09, "triangle", 0.03), i * 55));
      playSample("pac_power", 0.38);
    } else if (kind === "ghost") {
      [660, 880, 1100].forEach((n, i) => setTimeout(() => beep(n, 0.075, "square", 0.032), i * 48));
    } else if (kind === "fruit") {
      [784, 988, 1175, 1568].forEach((n, i) => setTimeout(() => beep(n, 0.11, "triangle", 0.036), i * 52));
    } else if (kind === "ready") {
      beep(523, 0.1, "triangle", 0.026); setTimeout(() => beep(659, 0.13, "triangle", 0.026), 110);
    } else if (kind === "clear") {
      [523, 659, 784, 1047].forEach((n, i) => setTimeout(() => beep(n, 0.16, "triangle", 0.03), i * 115));
    }
  }

  function startMusic() {
    clearInterval(musicTimer);
    musicTimer = 0;
    if (!soundEnabled) return;
    musicTimer = window.setInterval(() => {
      if (!activeGame || document.hidden || !soundEnabled) return;
      const step = musicStep++;
      const note = musicNotes[step % musicNotes.length];
      if (musicGame === "tetris") {
        // Mix Kyronext original : arpège + basse douce + accent très léger.
        beep(note, 0.10, "triangle", 0.018, "music");
        if (step % 2 === 0) beep(Math.max(55, note * 0.5), 0.17, "sine", 0.010, "music");
        if (!LOW_POWER_MODE && step % 4 === 2) beep(note * 2, 0.045, "square", 0.005, "music");
      } else {
        beep(note, 0.13, "triangle", 0.028, "music");
      }
    }, musicTempo);
  }

  // Motifs originaux : ambiance arcade rétro, sans reprendre une mélodie protégée.
  function setLevelMusic(game, level = 1) {
    musicGame = game;
    const n = Math.max(1, Math.min(10, level));
    const roots = game === "pacman" ? [196, 220, 247, 262, 294, 330, 370, 392, 440, 494] : 
                  game === "tetris" ? [110, 123, 138, 155, 174, 196, 220, 247, 277, 311] :
                  game === "spaceinvaders" ? [88, 110, 132, 165, 196, 220, 262, 330, 392, 440] :
                  [132, 165, 196, 220, 262, 330, 392, 440, 523, 659];
    const root = roots[n - 1];
    
    if (game === "pacman") {
      // Motif plus dynamique pour Pac-Man
      musicNotes = [
        root, root * 1.25, root * 1.5, root * 2,
        root * 1.75, root * 1.5, root * 1.25, root
      ];
      musicTempo = Math.max(120, 350 - (n - 1) * 25);
    } else if (game === "tetris") {
      // Motif pour Tetris
      musicNotes = [
        root, root * 1.125, root * 1.25, root * 1.5,
        root * 1.75, root * 2, root * 1.75, root * 1.5
      ];
      musicTempo = Math.max(140, 380 - (n - 1) * 22);
    } else if (game === "spaceinvaders") {
      // Motif pour Space Invaders - ambiance rétro-futuriste
      musicNotes = [
        root, root * 1.167, root * 1.25, root * 1.5,
        root * 1.333, root * 1.667, root * 1.5, root * 1.25
      ];
      musicTempo = Math.max(100, 300 - (n - 1) * 20);
    } else {
      // Motif pour Tron - ambiance techno
      musicNotes = [
        root, root * 1.25, root * 1.5, root * 1.75,
        root * 2, root * 1.75, root * 1.5, root * 1.25
      ];
      musicTempo = Math.max(130, 320 - (n - 1) * 18);
    }
    startMusic();
  }

  function stopGame() {
    leaveArcadeFullscreen();
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    clearTimeout(lowPowerFrameTimer);
    lowPowerFrameTimer = 0;
    clearInterval(musicTimer);
    musicTimer = 0;
    // Stoppe aussi le contexte pour éviter qu'un cue planifié reste audible
    // pendant la transition vers le menu.
    if (arcadeMaster && audioContext) {
      try { arcadeMaster.gain.setTargetAtTime(0, audioContext.currentTime, 0.018); } catch (_) { /* noop */ }
    }
    if (audioContext && audioContext.state === "running") {
      try { audioContext.suspend().catch(() => {}); } catch (_) { /* noop */ }
    }
    activeGame = null;
    delete document.body.dataset.arcadeGame;
    arcade.classList.remove("pacman-active");
    arcade.classList.remove("tetris-active");
    arcade.classList.remove("space-active");
    arcade.classList.remove("tron-active");
    arcade.classList.remove("tetris-fill-screen");
    if (viewButton) viewButton.hidden = true;
    if (zoomButton) zoomButton.hidden = true;
    arcade.classList.remove("game-zoomed");
    document.body.classList.remove("arcade-zoom-open");
    arcade.style.removeProperty("--arcade-game-zoom");
    gameZoomIndex = 0;
    arcade.classList.add("hidden");
    pendingLaunch=false;window.KyronextArcadeIntro?.cancel?.();
  }

  function startGame(name, instructions, onKey, draw, restart) {
    // Déverrouillage audio au moment exact où le jeu devient actif. Certains
    // navigateurs mobile suspendent le contexte après l’intro plein écran.
    resumeArcadeAudio();
    if (animationFrame) cancelAnimationFrame(animationFrame);
    clearTimeout(lowPowerFrameTimer);
    lowPowerFrameTimer = 0;
    clearInterval(musicTimer);
    activeGame = { name, onKey, restart, getState: null };
    let bonusButton=document.getElementById('arcade-bonus-button');
    if(!bonusButton){bonusButton=document.createElement('button');bonusButton.id='arcade-bonus-button';bonusButton.type='button';bonusButton.addEventListener('click',()=>controlKey('b'));document.querySelector('.arcade-controls')?.appendChild(bonusButton);}
    bonusButton.hidden=!['tetris','space-invaders'].includes(name);
    bonusButton.textContent=name==='tetris'?'B · NOVA':'B · BOMBE';
    document.body.dataset.arcadeGame=name;
    backgroundLayer = null;
    arcade.classList.toggle("pacman-active", name === "pac-man");
    arcade.classList.toggle("tetris-active", name === "tetris");
    arcade.classList.toggle("space-active", name === "space-invaders");
    arcade.classList.toggle("tron-active", name === "tron");
    gameZoomIndex = 0;
    arcade.classList.remove("game-zoomed");
    document.body.classList.remove("arcade-zoom-open");
    arcade.style.setProperty("--arcade-game-zoom", "1");
    if (zoomButton) {
      zoomButton.hidden = false;
      zoomButton.textContent = "⌕ ZOOM ×1,00";
      zoomButton.setAttribute("aria-pressed", "false");
      zoomButton.setAttribute("aria-label", "Agrandir l’affichage du jeu");
    }
    if (viewButton) {
      viewButton.hidden = name !== "pac-man" && name !== "tetris";
      viewButton.textContent = name === "pac-man" ? "◎ ZOOM SUIVEUR : OFF" : "▣ REMPLIR ÉCRAN";
      viewButton.setAttribute("aria-pressed", "false");
    }
    arcade.classList.remove("hidden");
    arcade.scrollIntoView({block:"start",behavior:"instant"});
    canvas.focus({ preventScroll: true });
    title.textContent = name.toUpperCase();
    help.textContent = instructions;
    if (dropButton) dropButton.hidden = name !== "tetris";
    if (holdButton) holdButton.hidden = name !== "tetris";
    musicStep = 0;
    startMusic();
    beep(660, 0.09);
    playSample("arcade_launch", 0.34);

    let lastLoopPaint = 0;
    const nanoFps = name === "space-invaders" || name === "tron" ? 45 : 30;
    const frameBudget = LOW_POWER_MODE ? 1000 / nanoFps : 0;
    const loop = (now) => {
      if(document.hidden){lowPowerFrameTimer=setTimeout(()=>{animationFrame=requestAnimationFrame(loop)},250);return;}
      if (!activeGame || activeGame.name !== name) return;
      if (!frameBudget || !lastLoopPaint || now - lastLoopPaint >= frameBudget) {
        lastLoopPaint = now;
        draw(now);
      }
      // On phones and Jetsons, do not wake the browser at 60 Hz just to skip
      // half the paints. Schedule the next frame at the actual render budget.
      if (frameBudget) {
        lowPowerFrameTimer = window.setTimeout(() => {
          lowPowerFrameTimer = 0;
          if (activeGame?.name === name) animationFrame = requestAnimationFrame(loop);
        }, Math.max(0,frameBudget-(performance.now()-lastLoopPaint)-8));
      } else {
        animationFrame = requestAnimationFrame(loop);
      }
    };
    animationFrame = requestAnimationFrame(loop);
  }

  function handleKey(event) {
    if(event.target?.closest?.("input,textarea,select,[contenteditable]"))return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (arcadeFullscreenActive()) {
        leaveArcadeFullscreen();
        return;
      }
      stopGame();
      return;
    }
    if (!activeGame) return;
    if(event.repeat && ["p","r","c","b"].includes(event.key.toLowerCase()))return;
    resumeArcadeAudio();
    activeGame.onKey(event);
  }

  function controlKey(key) {
    if (!activeGame) return;
    getAudioContext();
    beep(520, 0.05);
    const event = {
      key: key === "p" ? "p" : key === "Space" ? " " : key,
      code: key === "Space" ? "Space" : key,
      preventDefault() {},
    };
    resumeArcadeAudio();
    activeGame.onKey(event);
  }

  restartButton?.addEventListener("click", () => {
    if (!activeGame?.restart) return;
    activeGame.restart();
    canvas.focus({ preventScroll: true });
    beep(660, 0.08);
  });
  quitButton?.addEventListener("click", () => {
    stopGame();
  });

  let backgroundLayer = null;
  let backgroundLayerWidth = 0;
  let backgroundLayerHeight = 0;
  function drawBackground() {
    if (!backgroundLayer || backgroundLayerWidth !== canvas.width || backgroundLayerHeight !== canvas.height) {
      const layer = document.createElement("canvas");
      layer.width = canvas.width; layer.height = canvas.height;
      const bg = layer.getContext("2d");
      const game = activeGame?.name || "arcade";
      const grad = bg.createLinearGradient(0,0,0,layer.height);
      if (game === "pac-man") {
        grad.addColorStop(0,"#07101c"); grad.addColorStop(.55,"#02050b"); grad.addColorStop(1,"#000");
      } else if (game === "tetris") {
        grad.addColorStop(0,"#10102c"); grad.addColorStop(.5,"#040718"); grad.addColorStop(1,"#010205");
      } else if (game === "space-invaders") {
        grad.addColorStop(0,"#07172d"); grad.addColorStop(.5,"#030714"); grad.addColorStop(1,"#000106");
      } else {
        grad.addColorStop(0,"#071d22"); grad.addColorStop(.55,"#031016"); grad.addColorStop(1,"#000");
      }
      bg.fillStyle=grad; bg.fillRect(0,0,layer.width,layer.height);

      let seed = game.length * 971 + layer.width * 3 + layer.height;
      const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
      const count = LOW_POWER_MODE ? 42 : 86;
      for(let i=0;i<count;i++){
        const x=rnd()*layer.width, y=rnd()*layer.height*.82, r=.35+rnd()*1.2;
        bg.fillStyle = i%9===0 ? "rgba(255,78,104,.46)" : "rgba(126,224,255,.38)";
        bg.beginPath(); bg.arc(x,y,r,0,Math.PI*2); bg.fill();
      }

      const horizon=layer.height*.68;
      bg.strokeStyle = game==="tron" ? "rgba(0,255,224,.16)" : "rgba(77,180,255,.11)";
      bg.lineWidth=1;
      for(let i=-8;i<=8;i++){
        bg.beginPath(); bg.moveTo(layer.width/2,horizon); bg.lineTo(layer.width/2+i*90,layer.height); bg.stroke();
      }
      for(let i=0;i<8;i++){
        const p=i/8, y=horizon+(p*p)*(layer.height-horizon);
        bg.beginPath(); bg.moveTo(0,y); bg.lineTo(layer.width,y); bg.stroke();
      }

      const rg=bg.createLinearGradient(0,0,layer.width,0);
      rg.addColorStop(0,"rgba(255,40,60,0)");
      rg.addColorStop(.45,"rgba(255,40,60,.08)");
      rg.addColorStop(.5,"rgba(255,130,145,.26)");
      rg.addColorStop(.55,"rgba(255,40,60,.08)");
      rg.addColorStop(1,"rgba(255,40,60,0)");
      bg.fillStyle=rg; bg.fillRect(0,Math.round(layer.height*.11),layer.width,2);

      bg.fillStyle = "rgba(0,0,0,.23)";
      for (let y = 0; y < layer.height; y += 3) bg.fillRect(0, y, layer.width, 1);
      backgroundLayer = layer; backgroundLayerWidth = layer.width; backgroundLayerHeight = layer.height;
    }
    ctx.drawImage(backgroundLayer, 0, 0);
  }

  function label(text, x, y, size = 16, color = "#fff") {
    ctx.fillStyle = color;
    ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText(text, x, y);
  }

  // Toutes les lignes sont ramenées à la même largeur. L'ancienne carte
  // mélangeait 27, 28 et 29 colonnes, ce qui envoyait les fantômes hors grille.
  const RAW_MAZE = [
    "############################",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#o####.#####.##.#####.####o#",
    "#.####.#####.##.#####.####.#",
    "#..........................#",
    "#.####.##.########.##.####.#",
    "#......##....  ....##......#",
    "######.##.###  ###.##.######",
    "######.##.##    ##.##.######",
    "######.##.##    ##.##.######",
    "######.##.##    ##.##.######",
    "######.##.########.##.######",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#o...#................#...o#",
    "###.##.##.########.##.##.###",
    "#..........................#",
    "############################",
  ];
  const MAZE_WIDTH = 28;
  const MAZE = RAW_MAZE.map((row) => row.padEnd(MAZE_WIDTH, "#").slice(0, MAZE_WIDTH));
  const MAZE_HEIGHT = MAZE.length;
  const PACMAN_CELL = 22;
  const PACMAN_ORIGIN_X = 52;
  const PACMAN_ORIGIN_Y = 35;
  const DIRECTIONS = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
  ];
  
  // Couleurs thème K2000 pour Pac-Man
  const PACMAN_COLORS = {
    kittRed: "#ff2a3a",
    kittAmber: "#ff8c00",
    kittCyan: "#00a2ff",
    kittGold: "#ffd700",
    karrBlue: "#00a2ff",
    background: "#040506",
    wallDark: "#1a1208",
    wallLight: "#2a180c"
  };

  const scoreListEl=document.getElementById("score-list"), scoreEntry=document.getElementById("score-entry"), scoreName=document.getElementById("score-name"), scoreFinal=document.getElementById("score-final"), scoreSave=document.getElementById("score-save");
  let pendingScore=null;
  const scoreKey=g=>`kyronext.arcade.scores.${g}`;
  function scores(g){try{return JSON.parse(localStorage.getItem(scoreKey(g))||"[]")}catch{return []}}
  function renderScores(g){if(!scoreListEl)return;const rows=scores(g).slice(0,10);scoreListEl.innerHTML=rows.length?rows.map((r,i)=>`<div class="score-row"><span>${String(i+1).padStart(2,"0")}</span><span>${r.name}</span><span class="pts">${String(r.score).padStart(7,"0")}</span></div>`).join(""):'<div class="score-row"><span>--</span><span>EN ATTENTE DE CHAMPION</span><span class="pts">0000000</span></div>';}
  function submitScore(g,score){const top=scores(g);if(score<=0||top.length>=10&&score<=top[top.length-1].score)return;pendingScore={game:g,score};scoreFinal.textContent=`SCORE ${String(score).padStart(7,"0")}`;scoreEntry.classList.remove("hidden");scoreName.value=localStorage.getItem("kyronext.arcade.player")||"";setTimeout(()=>scoreName.focus(),50);beep(880,.18,"square");}
  function saveScore(){if(!pendingScore)return;const name=(scoreName.value.trim()||"ANONYME").toUpperCase().slice(0,24).replace(/[<>]/g,"");localStorage.setItem("kyronext.arcade.player",name);const a=scores(pendingScore.game);a.push({name,score:pendingScore.score,date:new Date().toISOString()});a.sort((x,y)=>y.score-x.score);localStorage.setItem(scoreKey(pendingScore.game),JSON.stringify(a.slice(0,10)));renderScores(pendingScore.game);pendingScore=null;scoreEntry.classList.add("hidden");beep(1040,.12,"square");}
  scoreSave?.addEventListener("click",saveScore);scoreName?.addEventListener("keydown",e=>{if(e.key==="Enter")saveScore()});

  function pacman() {
    renderScores("pacman");
    let grid;
    let player;
    let ghosts;
    let score;
    let lives;
    let level;
    let paused;
    let won;
    let scoreSubmitted;
    let powerUntil = 0;
    let invincibleUntil=0,nextLifeScore=10000,pauseAt=0;
    const powerCells=[];
    MAZE.forEach((row,y)=>[...row].forEach((v,x)=>{if(v==='o')powerCells.push({x,y})}));
    let ghostsEatenWithPower = 0;
    let pelletTone = false;
    let pelletsEaten = 0;
    let bonusFruit = null;
    let fruitStages = 0;
    let fruitExpiresAt = 0;
    let fruitAward = null;
    let fruitAwardUntil = 0;
    let ghostAward = null;
    let ghostAwardUntil = 0;
    let followZoom = false;
    let cameraX = 0;
    let cameraY = 0;
    let tick = 0;
    let last = performance.now();

    const isOpen = (x, y) =>
      y >= 0 && y < MAZE_HEIGHT && x >= 0 && x < MAZE_WIDTH && MAZE[y][x] !== "#";

    let scannerAngle = 0;
    let scannerSpeed = 0.02;
    let particles = [];
    let mazeLayer = null;
    let pelletLayer = null;
    let lastRender = 0;
    let introUntil = 0;
    const PACMAN_FRAME_MS = 1000 / (LOW_POWER_MODE ? 30 : 60);
    // Démarrage plus posé, puis accélération graduelle à chaque niveau.
    const PACMAN_START_STEP_SECONDS = 0.21;
    const PACMAN_LEVEL_STEP_SECONDS = 0.009;
    const PACMAN_MIN_STEP_SECONDS = 0.125;
    const BONUS_FRUITS = [
      { name: "CERISE", points: 100, color: "#ff3154", leaf: "#65e46f" },
      { name: "FRAISE", points: 300, color: "#ff385b", leaf: "#68ed73" },
      { name: "ORANGE", points: 500, color: "#ff9d20", leaf: "#75e16c" },
      { name: "POMME", points: 700, color: "#ef3349", leaf: "#75e16c" },
      { name: "ANANAS", points: 1000, color: "#e4c64a", leaf: "#7dde62" },
      { name: "GALAXIAN", points: 2000, color: "#61d8ff", leaf: "#ffe55b" },
      { name: "CLOCHE", points: 3000, color: "#ffd64d", leaf: "#fff0a1" },
      { name: "CLÉ", points: 5000, color: "#ffe071", leaf: "#fff0a1" },
    ];
    const FRUIT_SPAWN = { x: 14, y: 15 };
    const totalPellets = MAZE.reduce((sum, row) => sum + [...row].filter(ch => ch === "." || ch === "o").length, 0);
    const fruitIndexForLevel = n => n === 1 ? 0 : n === 2 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : n <= 8 ? 4 : n <= 10 ? 5 : n <= 12 ? 6 : 7;

    const drawFruit = (fruit, cx, cy, scale = 1) => {
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(scale, scale);
      ctx.shadowColor = fruit.color; ctx.shadowBlur = LOW_POWER_MODE ? 4 : 12;
      ctx.fillStyle = fruit.color;
      if (fruit.name === "CERISE") {
        ctx.beginPath(); ctx.arc(-4, 3, 5, 0, Math.PI * 2); ctx.arc(4, 4, 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = fruit.leaf; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(-2, -10, 3, -8); ctx.moveTo(4, 0); ctx.quadraticCurveTo(4, -7, 3, -8); ctx.stroke();
        ctx.fillStyle = fruit.leaf; ctx.beginPath(); ctx.ellipse(5, -8, 4, 2, -.35, 0, Math.PI * 2); ctx.fill();
      } else if (fruit.name === "FRAISE") {
        ctx.beginPath(); ctx.moveTo(-7, -3); ctx.quadraticCurveTo(-8, -9, 0, -7); ctx.quadraticCurveTo(8, -9, 7, -3); ctx.lineTo(0, 9); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = fruit.leaf; ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(-2, -9); ctx.lineTo(0, -5); ctx.lineTo(3, -10); ctx.lineTo(5, -5); ctx.lineTo(9, -6); ctx.lineTo(5, -2); ctx.lineTo(-6, -2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#ffe58a"; [[-3,0],[3,1],[-1,5]].forEach(([x,y])=>{ctx.beginPath();ctx.ellipse(x,y,0.8,1.4,0,0,Math.PI*2);ctx.fill();});
      } else if (fruit.name === "GALAXIAN") {
        ctx.beginPath(); ctx.moveTo(0,-9);ctx.lineTo(3,-4);ctx.lineTo(8,-5);ctx.lineTo(5,0);ctx.lineTo(8,6);ctx.lineTo(2,5);ctx.lineTo(0,10);ctx.lineTo(-3,5);ctx.lineTo(-8,6);ctx.lineTo(-5,0);ctx.lineTo(-8,-5);ctx.lineTo(-3,-4);ctx.closePath();ctx.fill();
        ctx.fillStyle=fruit.leaf;ctx.fillRect(-1,-13,2,5);
      } else if (fruit.name === "CLOCHE") {
        ctx.beginPath();ctx.arc(0,0,7,Math.PI,0);ctx.lineTo(8,5);ctx.lineTo(-8,5);ctx.closePath();ctx.fill();ctx.fillRect(-9,5,18,2);ctx.beginPath();ctx.arc(0,8,2,0,Math.PI*2);ctx.fill();
      } else if (fruit.name === "CLÉ") {
        ctx.beginPath();ctx.arc(-3,-2,5,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation="destination-out";ctx.beginPath();ctx.arc(-3,-2,2,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation="source-over";ctx.fillStyle=fruit.color;ctx.fillRect(1,-3,10,3);ctx.fillRect(7,-3,2,6);ctx.fillRect(10,-3,2,5);
      } else {
        ctx.beginPath();ctx.ellipse(0,1,7,8,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle=fruit.leaf;ctx.beginPath();ctx.ellipse(3,-8,4,2,-.45,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#5a371e";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(1,-10);ctx.stroke();
      }
      ctx.restore();
    };

    const maybeSpawnFruit = () => {
      const thresholds = [70, 170];
      if (fruitStages < thresholds.length && pelletsEaten >= Math.min(totalPellets - 1, thresholds[fruitStages])) {
        bonusFruit = BONUS_FRUITS[fruitIndexForLevel(level)];
        fruitStages += 1;
        fruitExpiresAt = performance.now() + 9000;
        pacmanSound("ready");
      }
    };

    // Le décor du labyrinthe ne change jamais pendant une partie. Le dessiner
    // une seule fois évite des centaines de gradients/ombres à chaque frame.
    const buildMazeLayer = () => {
      const layer = document.createElement("canvas");
      layer.width = canvas.width;
      layer.height = canvas.height;
      const wallCtx = layer.getContext("2d", { alpha: true });
      if (!wallCtx) return null;
      const left = PACMAN_ORIGIN_X - 4;
      const top = PACMAN_ORIGIN_Y - 4;
      const width = MAZE_WIDTH * PACMAN_CELL + 8;
      const height = MAZE_HEIGHT * PACMAN_CELL + 8;
      const deck = wallCtx.createLinearGradient(left, top, left + width, top + height);
      deck.addColorStop(0, "rgba(2,8,18,.94)");
      deck.addColorStop(.5, "rgba(8,5,16,.90)");
      deck.addColorStop(1, "rgba(18,3,8,.94)");
      wallCtx.fillStyle = deck;
      wallCtx.fillRect(left, top, width, height);
      wallCtx.shadowColor = PACMAN_COLORS.kittCyan;
      wallCtx.shadowBlur = LOW_POWER_MODE ? 0 : 8;
      wallCtx.strokeStyle = PACMAN_COLORS.kittCyan;
      wallCtx.lineWidth = 2;
      wallCtx.strokeRect(left, top, width, height);
      wallCtx.shadowBlur = 0;
      wallCtx.strokeStyle = PACMAN_COLORS.kittRed;
      wallCtx.lineWidth = 3;
      wallCtx.beginPath();
      wallCtx.moveTo(left, top + 26); wallCtx.lineTo(left, top); wallCtx.lineTo(left + 26, top);
      wallCtx.moveTo(left + width - 26, top); wallCtx.lineTo(left + width, top); wallCtx.lineTo(left + width, top + 26);
      wallCtx.moveTo(left, top + height - 26); wallCtx.lineTo(left, top + height); wallCtx.lineTo(left + 26, top + height);
      wallCtx.moveTo(left + width - 26, top + height); wallCtx.lineTo(left + width, top + height); wallCtx.lineTo(left + width, top + height - 26);
      wallCtx.stroke();
      for (let y = 0; y < MAZE_HEIGHT; y += 1) {
        for (let x = 0; x < MAZE_WIDTH; x += 1) {
          if (MAZE[y][x] !== "#") continue;
          const px = PACMAN_ORIGIN_X + x * PACMAN_CELL;
          const py = PACMAN_ORIGIN_Y + y * PACMAN_CELL;
          const wall = wallCtx.createLinearGradient(px, py, px + PACMAN_CELL, py + PACMAN_CELL);
          wall.addColorStop(0, PACMAN_COLORS.wallLight);
          wall.addColorStop(0.5, PACMAN_COLORS.wallDark);
          wall.addColorStop(1, "#0a0604");
          wallCtx.fillStyle = wall;
          wallCtx.fillRect(px, py, PACMAN_CELL, PACMAN_CELL);
          wallCtx.strokeStyle = PACMAN_COLORS.kittCyan;
          wallCtx.lineWidth = 1.25;
          wallCtx.strokeRect(px + 1, py + 1, PACMAN_CELL - 2, PACMAN_CELL - 2);
          wallCtx.fillStyle = "rgba(0,162,255,.22)";
          wallCtx.fillRect(px + 3, py + 3, PACMAN_CELL - 6, 2);
          wallCtx.strokeStyle = "rgba(255,255,255,.12)";
          wallCtx.lineWidth = 1;
          wallCtx.strokeRect(px + 4, py + 4, PACMAN_CELL - 8, PACMAN_CELL - 8);
        }
      }
      return layer;
    };

    const buildPelletLayer = () => {
      const layer = document.createElement("canvas");
      layer.width = canvas.width;
      layer.height = canvas.height;
      const pelletCtx = layer.getContext("2d", { alpha: true });
      if (!pelletCtx) return null;
      for (let y = 0; y < MAZE_HEIGHT; y += 1) {
        for (let x = 0; x < MAZE_WIDTH; x += 1) {
          const pellet = grid[y][x];
          if (pellet !== "." && pellet !== "o") continue;
          const px = PACMAN_ORIGIN_X + x * PACMAN_CELL + 11;
          const py = PACMAN_ORIGIN_Y + y * PACMAN_CELL + 11;
          const power = pellet === "o";
          pelletCtx.fillStyle = power ? PACMAN_COLORS.kittAmber : PACMAN_COLORS.kittGold;
          pelletCtx.beginPath();
          pelletCtx.arc(px, py, power ? 6 : 2.5, 0, Math.PI * 2);
          pelletCtx.fill();
          if (power) {
            pelletCtx.fillStyle = "#fff";
            pelletCtx.beginPath();
            pelletCtx.arc(px, py, 2, 0, Math.PI * 2);
            pelletCtx.fill();
          }
        }
      }
      return layer;
    };
    
    const reset = () => {
      grid = MAZE.map((row) => row.split(""));
      player = { x: 13, y: 15, want: { x: 0, y: 0 }, dir: { x: 0, y: 0 } };
      cameraX = PACMAN_ORIGIN_X + player.x * PACMAN_CELL + PACMAN_CELL / 2;
      cameraY = PACMAN_ORIGIN_Y + player.y * PACMAN_CELL + PACMAN_CELL / 2;
      ghosts = [
        { x: 13, y: 9, color: PACMAN_COLORS.karrBlue, dir: { x: 1, y: 0 }, name: "KARR", ai: "chaser" },
        { x: 12, y: 10, color: PACMAN_COLORS.kittAmber, dir: { x: -1, y: 0 }, name: "KARR-2", ai: "ambusher" },
        { x: 14, y: 10, color: PACMAN_COLORS.kittCyan, dir: { x: 0, y: -1 }, name: "KARR-3", ai: "flanker" },
        { x: 18, y: 9, color: PACMAN_COLORS.kittRed, dir: { x: 0, y: 1 }, name: "KARR-4", ai: "patrol" },
      ];
      score = 0;
      lives = 3;
      level = 1;
      paused = false;
      won = false;
      scoreSubmitted = false;
      powerUntil = 0;
      invincibleUntil=performance.now()+2200;nextLifeScore=10000;pauseAt=0;
      ghosts.forEach((g,i)=>g.releaseAt=performance.now()+1400+i*550);
      ghostsEatenWithPower = 0;
      pelletTone = false;
      pelletsEaten = 0;
      bonusFruit = null;
      fruitStages = 0;
      fruitExpiresAt = 0;
      fruitAward = null;
      fruitAwardUntil = 0;
      tick = 0;
      last = performance.now();
      scannerAngle = 0;
      particles = [];
      lastRender = 0;
      introUntil = performance.now() + 850;
      if (!mazeLayer) mazeLayer = buildMazeLayer();
      pelletLayer = buildPelletLayer();
      setLevelMusic("pacman", level);
    };

    const move = (object, direction) => {
      const x = object.x + direction.x;
      const y = object.y + direction.y;
      if (!isOpen(x, y)) return false;
      object.x = x;
      object.y = y;
      object.dir = direction;
      return true;
    };

    const distanceFields=new Map();
    const pathQueue=new Int16Array(MAZE_WIDTH*MAZE_HEIGHT);
    const mazeDistance=(sx,sy,tx,ty)=>{
      const key=ty*MAZE_WIDTH+tx;
      let field=distanceFields.get(key);
      if(!field){
        field=new Int16Array(MAZE_WIDTH*MAZE_HEIGHT);field.fill(-1);
        let head=0,tail=0;pathQueue[tail++]=key;field[key]=0;
        while(head<tail){
          const cell=pathQueue[head++],x=cell%MAZE_WIDTH,y=Math.floor(cell/MAZE_WIDTH);
          for(const d of DIRECTIONS){
            const nx=x+d.x,ny=y+d.y,index=ny*MAZE_WIDTH+nx;
            if(!isOpen(nx,ny)||field[index]>=0)continue;
            field[index]=field[cell]+1;pathQueue[tail++]=index;
          }
        }
        if(distanceFields.size>=24)distanceFields.delete(distanceFields.keys().next().value);
        distanceFields.set(key,field);
      }
      const distance=field[sy*MAZE_WIDTH+sx];
      return distance<0?999:distance;
    };

    const ghostTarget = (ghost) => {
      const ahead = player.dir.x || player.dir.y ? player.dir : player.want;
      if (ghost.ai === "ambusher") {
        return { x: player.x + ahead.x * 4, y: player.y + ahead.y * 4 };
      }
      if (ghost.ai === "flanker") {
        return { x: player.x - ahead.y * 5 + ahead.x * 2, y: player.y + ahead.x * 5 + ahead.y * 2 };
      }
      if (ghost.ai === "patrol") {
        const far = Math.abs(ghost.x-player.x)+Math.abs(ghost.y-player.y) > 8;
        return far ? {x:player.x,y:player.y} : {x:2,y:2};
      }
      return { x: player.x, y: player.y };
    };

    const chooseGhostDirection = (ghost) => {
      const forwardOptions = DIRECTIONS.filter(
        (direction) =>
          isOpen(ghost.x + direction.x, ghost.y + direction.y) &&
          !(direction.x === -ghost.dir.x && direction.y === -ghost.dir.y),
      );
      const options = forwardOptions.length ? forwardOptions : DIRECTIONS.filter(
        (direction) => isOpen(ghost.x + direction.x, ghost.y + direction.y)
      );
      if (!options.length) return;

      const target = ghostTarget(ghost);
      let tx=Math.max(1,Math.min(MAZE_WIDTH-2,target.x));
      let ty=Math.max(1,Math.min(MAZE_HEIGHT-2,target.y));
      if (!isOpen(tx,ty)) { tx=player.x; ty=player.y; }

      const frightened = performance.now() < powerUntil;
      const ranked = options.map(direction => ({
        direction,
        distance: mazeDistance(ghost.x+direction.x, ghost.y+direction.y, tx, ty)
      })).sort((a,b) => frightened ? b.distance-a.distance : a.distance-b.distance);

      const intelligence = Math.min(.97, .80 + level * .018);
      ghost.dir = Math.random() < intelligence
        ? ranked[0].direction
        : ranked[Math.floor(Math.random()*ranked.length)].direction;
    };

    const onKey = (event) => {
      if (!activeGame || activeGame.name !== "pac-man") return;
      if (event.key === "p" || event.key === "P") {
        paused = !paused;
        if(paused)pauseAt=performance.now();else if(pauseAt){const gap=performance.now()-pauseAt;powerUntil+=powerUntil?gap:0;invincibleUntil+=gap;fruitExpiresAt+=fruitExpiresAt?gap:0;ghosts.forEach(g=>{if(g.releaseAt)g.releaseAt+=gap});pauseAt=0;last=performance.now();}
        beep(paused ? 220 : 440, 0.08);
        return;
      }
      if (event.key === "r" || event.key === "R") {
        reset();
        beep(660, 0.08);
        return;
      }
      const direction = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      }[event.key];
      if (direction) {
        player.want = direction;
        event.preventDefault();
      }
    };

    const draw = (now) => {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      
      // Mettre à jour l'angle du scanner
      scannerAngle += scannerSpeed * delta * 60;
      if (scannerAngle > Math.PI * 2) scannerAngle -= Math.PI * 2;
      
      // Mettre à jour les particules (désactivé en LOW_POWER_MODE pour économiser le CPU)
      if (!LOW_POWER_MODE) {
        particles = particles.filter(p => p.life > 0);
        particles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.life -= delta;
          p.size *= 0.95;
        });
      } else {
        particles = [];
      }
      
      if (!paused && !won) {
        tick += delta;
        const step = Math.max(
          PACMAN_MIN_STEP_SECONDS,
          PACMAN_START_STEP_SECONDS - (level - 1) * PACMAN_LEVEL_STEP_SECONDS,
        );
        while (tick >= step) {
          tick -= step;
          if (!move(player, player.want)) move(player, player.dir);
          const pellet = grid[player.y]?.[player.x];
          if (pellet === "." || pellet === "o") {
            score += pellet === "o" ? 50 : 10;
            pelletsEaten += 1;
            grid[player.y][player.x] = " ";
            if (pelletLayer) pelletLayer.getContext("2d").clearRect(
              PACMAN_ORIGIN_X + player.x * PACMAN_CELL,
              PACMAN_ORIGIN_Y + player.y * PACMAN_CELL,
              PACMAN_CELL, PACMAN_CELL
            );
            pelletTone = !pelletTone;
            if (pellet === "o") { powerUntil = performance.now() + 30000; ghostsEatenWithPower = 0; pacmanSound("power"); }
            else pacmanSound("chomp", pelletTone);
            maybeSpawnFruit();
          }
          if (bonusFruit && performance.now() > fruitExpiresAt) bonusFruit = null;
          if (bonusFruit && player.x === FRUIT_SPAWN.x && player.y === FRUIT_SPAWN.y) {
            score += bonusFruit.points;
            fruitAward = `+${bonusFruit.points}`;
            fruitAwardUntil = performance.now() + 1000;
            bonusFruit = null;
            pacmanSound("fruit");
          }
          const ghostStepTime = performance.now();
          ghosts.forEach((ghost) => {
            if (ghost.releaseAt > ghostStepTime) return;
            if (!isOpen(ghost.x + ghost.dir.x, ghost.y + ghost.dir.y) || Math.random() < 0.45) {
              chooseGhostDirection(ghost);
            }
            if (!move(ghost, ghost.dir)) {
              chooseGhostDirection(ghost);
              move(ghost, ghost.dir);
            }
          });
          for (const ghost of ghosts) {
            if (ghost.releaseAt > performance.now() || performance.now()<invincibleUntil || ghost.x !== player.x || ghost.y !== player.y) continue;
            if (performance.now() < powerUntil) {
              const eatenX = ghost.x;
              const eatenY = ghost.y;
              const ghostPoints = 200 * (2 ** Math.min(ghostsEatenWithPower, 3));
              score += ghostPoints;
              ghostsEatenWithPower += 1;
              ghostAward = { text: `+${ghostPoints}`, x: eatenX, y: eatenY };
              ghostAwardUntil = performance.now() + 900;
              ghost.x = 13; ghost.y = 9; ghost.dir = {x:1,y:0};
              ghost.releaseAt = performance.now() + 1200;
              pacmanSound("ghost");
              for (let i = 0; i < 8; i++) {
                particles.push({
                  x: PACMAN_ORIGIN_X + eatenX * PACMAN_CELL + 11,
                  y: PACMAN_ORIGIN_Y + eatenY * PACMAN_CELL + 11,
                  vx: (Math.random() - 0.5) * 10,
                  vy: (Math.random() - 0.5) * 10,
                  size: Math.random() * 4 + 2,
                  color: PACMAN_COLORS.kittCyan,
                  life: 0.8
                });
              }
            } else {
              lives -= 1; powerUntil = 0; ghostsEatenWithPower = 0; pacmanDeathSound();
              player.x = 13; player.y = 15; player.want = { x: 0, y: 0 }; player.dir = { x: 0, y: 0 };
              player.visualX=13;player.visualY=15;invincibleUntil=performance.now()+2200;tick=0;
              if (lives <= 0) paused = true;
              break; // Un seul contact enlève une seule vie pendant ce pas.
            }
          }
          won = !grid.some((row) => row.includes(".") || row.includes("o"));
          if (won && level < 256) {
            pacmanSound("clear");
            level += 1;
            score += 500 * level;
            pelletsEaten = 0;
            fruitStages = 0;
            bonusFruit = null;
            fruitExpiresAt = 0;
            grid = MAZE.map((row) => row.split(""));
            player = { x: 13, y: 15, want: { x: 0, y: 0 }, dir: { x: 0, y: 0 } };
            ghosts = [
              { x: 13, y: 9, color: "#ff3b66", dir: { x: 1, y: 0 }, name:"KARR", ai:"chaser" },
              { x: 12, y: 10, color: "#ff9bd2", dir: { x: -1, y: 0 }, name:"KARR-2", ai:"ambusher" },
              { x: 14, y: 10, color: "#55d8ff", dir: { x: 0, y: -1 }, name:"KARR-3", ai:"flanker" },
              { x: 18, y: 9, color: "#ffb13b", dir: { x: 0, y: 1 }, name:"KARR-4", ai:"patrol" },
            ];
            powerUntil = 0;
            won = false;
            pelletLayer = buildPelletLayer();
            setLevelMusic("pacman", level);
            beep(620 + level * 22, 0.18, "triangle");
            beep(780 + level * 22, 0.18, "triangle");
          }
        }
      }

      // Rendu interpolé : logique sur grille, déplacements visuels continus.
      if(score>=nextLifeScore){nextLifeScore+=10000;lives=Math.min(6,lives+1);pacmanSound('fruit');fruitAward='VIE +1';fruitAwardUntil=now+1600;}
      if (lastRender && now - lastRender < PACMAN_FRAME_MS) return;
      lastRender = now;

      drawBackground();

      // Géométrie du labyrinthe : définie avant les effets qui l'utilisent.
      const mazeLeft = PACMAN_ORIGIN_X - 4;
      const mazeTop = PACMAN_ORIGIN_Y - 4;
      const mazeWidth = MAZE_WIDTH * PACMAN_CELL + 8;
      const mazeHeight = MAZE_HEIGHT * PACMAN_CELL + 8;
      
      // Effet de scanner KITT en arrière-plan - Optimisé pour Nano
      if (!paused && !won && !LOW_POWER_MODE) {
        ctx.save();
        ctx.globalAlpha = 0.15 + Math.sin(now * 0.002) * 0.05;
        const scannerX = mazeLeft + mazeWidth / 2;
        const scannerY = mazeTop + mazeHeight / 2;
        const scannerLength = mazeWidth * 1.2;
        
        ctx.strokeStyle = PACMAN_COLORS.kittRed;
        ctx.lineWidth = 2;
        ctx.shadowColor = PACMAN_COLORS.kittRed;
        ctx.shadowBlur = LOW_POWER_MODE ? 0 : 12;
        
        ctx.beginPath();
        ctx.moveTo(scannerX - scannerLength * Math.cos(scannerAngle) / 2, scannerY - scannerLength * Math.sin(scannerAngle) / 2);
        ctx.lineTo(scannerX + scannerLength * Math.cos(scannerAngle) / 2, scannerY + scannerLength * Math.sin(scannerAngle) / 2);
        ctx.stroke();
        
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      
      // HUD Arcade amélioré - Thème K2000
      ctx.fillStyle = "rgba(4, 5, 11, 0.85)";
      ctx.fillRect(16, 0, 700, 36);
      ctx.strokeStyle = PACMAN_COLORS.kittCyan;
      ctx.lineWidth = 2;
      ctx.strokeRect(18, 2, 696, 32);
      
      label(`SCORE ${String(score).padStart(5, "0")}`, 24, 24, 16, PACMAN_COLORS.kittGold);
      label(`NIVEAU ${level}`, 300, 24, 16, PACMAN_COLORS.kittCyan);
      if (now < powerUntil) label(`CHASSE ${Math.ceil((powerUntil - now) / 1000)}s`, 405, 24, 12, PACMAN_COLORS.kittCyan);
      label(`VIES ${"●".repeat(Math.max(0, lives))}`, 560, 24, 16, PACMAN_COLORS.kittRed);
      label(`PASTILLES ${Math.max(0, totalPellets - pelletsEaten)}`, 24, 466, 12, "#a9cfff");
      if (bonusFruit) {
        drawFruit(bonusFruit, 360, 465, 1.05);
        label(`${bonusFruit.name} +${bonusFruit.points}`, 378, 469, 12, bonusFruit.color);
      } else {
        label(`BONUS ${"● ".repeat(Math.min(2, fruitStages))}${"○ ".repeat(Math.max(0, 2 - fruitStages))}`, 530, 466, 11, "#91a5bf");
      }

      const zoomFactor = followZoom ? 1.22 : 1;
      if (followZoom) {
        const targetX = PACMAN_ORIGIN_X + player.x * PACMAN_CELL + PACMAN_CELL / 2;
        const targetY = PACMAN_ORIGIN_Y + player.y * PACMAN_CELL + PACMAN_CELL / 2;
        const ease = 1 - Math.exp(-Math.max(0.001, delta) * 8);
        cameraX += (targetX - cameraX) * ease;
        cameraY += (targetY - cameraY) * ease;
        ctx.save();
        ctx.translate(canvas.width / 2 - cameraX * zoomFactor, canvas.height / 2 - cameraY * zoomFactor);
        ctx.scale(zoomFactor, zoomFactor);
      }
      
      // Décor fixe pré-rendu : très gros gain sur Jetson Nano.
      if (mazeLayer) ctx.drawImage(mazeLayer, 0, 0);
      
      // Pellets eux aussi pré-rendus : seule la case mangée est effacée.
      if (pelletLayer) ctx.drawImage(pelletLayer, 0, 0);

      if (bonusFruit && performance.now() <= fruitExpiresAt) {
        const fx = PACMAN_ORIGIN_X + FRUIT_SPAWN.x * PACMAN_CELL + PACMAN_CELL / 2;
        const fy = PACMAN_ORIGIN_Y + FRUIT_SPAWN.y * PACMAN_CELL + PACMAN_CELL / 2;
        if (performance.now() > fruitExpiresAt - 1800 && Math.floor(now / 130) % 2) ctx.globalAlpha = 0.35;
        drawFruit(bonusFruit, fx, fy, 1.05);
        ctx.globalAlpha = 1;
      }
      if (fruitAward && now < fruitAwardUntil) {
        ctx.save(); ctx.globalAlpha = Math.min(1, (fruitAwardUntil - now) / 300);
        label(fruitAward, PACMAN_ORIGIN_X + FRUIT_SPAWN.x * PACMAN_CELL - 10, PACMAN_ORIGIN_Y + FRUIT_SPAWN.y * PACMAN_CELL - 4, 14, "#ffe58a"); ctx.restore();
      } else fruitAward = null;

      // Anneaux d'énergie autour des super-pastilles + balayage de cadre.
      if (!LOW_POWER_MODE) {
        ctx.save();
        const pulse = 0.45 + Math.sin(now * 0.008) * 0.22;
        ctx.strokeStyle = "rgba(255,70,90," + pulse + ")";
        ctx.lineWidth = 2;
        for (const {x:xx,y:yy} of powerCells) {
            if (grid[yy][xx] !== "o") continue;
            const px = PACMAN_ORIGIN_X + xx * PACMAN_CELL + 11;
            const py = PACMAN_ORIGIN_Y + yy * PACMAN_CELL + 11;
            ctx.beginPath();
            ctx.arc(px, py, 8 + Math.sin(now * .01) * 2, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = .25;
        ctx.fillStyle = PACMAN_COLORS.kittCyan;
        const sweepY = mazeTop + ((now * .08) % mazeHeight);
        ctx.fillRect(mazeLeft + 2, sweepY, mazeWidth - 4, 1);
        ctx.restore();
      }
      
      // Dessiner Pac-Man avec animation améliorée - style KITT
      const smoothEntity = entity => { const blend = paused || won ? 0 : 1 - Math.exp(-delta * 24); if(entity.visualX === undefined || Math.abs(entity.x-entity.visualX)>2 || Math.abs(entity.y-entity.visualY)>2){entity.visualX=entity.x;entity.visualY=entity.y;} entity.visualX += (entity.x-entity.visualX)*blend;entity.visualY += (entity.y-entity.visualY)*blend; };
      smoothEntity(player);
      const playerX = PACMAN_ORIGIN_X + player.visualX * PACMAN_CELL + 11;
      const playerY = PACMAN_ORIGIN_Y + player.visualY * PACMAN_CELL + 11;
      const mouth = 0.22 + Math.abs(Math.sin(now * 0.015)) * 0.28;
      const facing = player.dir.x || player.dir.y ? player.dir : player.want;
      const angle = facing.x < 0 ? Math.PI : facing.y < 0 ? -Math.PI / 2 : facing.y > 0 ? Math.PI / 2 : 0;
      
      let pacmanFill = PACMAN_COLORS.kittGold;
      if (!LOW_POWER_MODE) {
        const pacmanGradient = ctx.createRadialGradient(playerX - 6, playerY - 6, 2, playerX, playerY, 14);
        pacmanGradient.addColorStop(0, "#ffffaa");
        pacmanGradient.addColorStop(0.5, "#ffe34d");
        pacmanGradient.addColorStop(1, PACMAN_COLORS.kittAmber);
        pacmanFill = pacmanGradient;
      }
      
      ctx.save();
      ctx.shadowColor = PACMAN_COLORS.kittAmber;
      ctx.shadowBlur = LOW_POWER_MODE ? 3 : 7;
      if(now<invincibleUntil)ctx.globalAlpha=.65+.35*Math.sin(now*.015)**2;
      
      ctx.fillStyle = pacmanFill;
      ctx.beginPath();
      ctx.moveTo(playerX, playerY);
      ctx.arc(playerX, playerY, 12, angle + mouth, angle + Math.PI * 2 - mouth);
      ctx.closePath();
      ctx.fill();
      
      // Bouche plus définie
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(playerX, playerY, 12, angle - mouth, angle + mouth);
      ctx.lineTo(playerX, playerY);
      ctx.closePath();
      ctx.fill();
      
      ctx.shadowBlur = 0;
      ctx.restore();
      
      // Oeil amélioré
      const eyeX = playerX + (facing.x || 0) * 3 - (facing.y || 0) * 3;
      const eyeY = playerY + (facing.y || 0) * 3 + (facing.x || 0) * 3 - 5;
      
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, 2.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Reflet dans l'oeil
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(eyeX + 1, eyeY - 1, 0.8, 0, Math.PI * 2);
      ctx.fill();
      
      // Dessiner les fantômes avec silhouettes améliorées - style K2000
      ghosts.forEach((ghost) => {
        smoothEntity(ghost);
        const ghostX = PACMAN_ORIGIN_X + ghost.visualX * PACMAN_CELL + 11;
        const ghostY = PACMAN_ORIGIN_Y + ghost.visualY * PACMAN_CELL + 11;
        const ghostReturning = ghost.releaseAt > performance.now();
        const frightened = !ghostReturning && performance.now() < powerUntil;
        const frightenedEnding = powerUntil - performance.now() < 5000;
        
        ctx.save();
        if (ghostReturning) ctx.globalAlpha = 0.48;
        
        // Ombre
        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.shadowBlur = 2;
        ctx.shadowOffsetY = 1;
        
        // Corps du fantôme - couleurs K2000
        const ghostColor = frightened ? (frightenedEnding && Math.floor(now/120)%2 ? "#ffffff" : PACMAN_COLORS.kittCyan) : ghost.color;
        let ghostPaint = ghostColor;
        if (!LOW_POWER_MODE) {
          const gg = ctx.createLinearGradient(ghostX - 10, ghostY - 12, ghostX + 10, ghostY + 12);
          gg.addColorStop(0, "#ffffff");
          gg.addColorStop(.16, ghostColor);
          gg.addColorStop(1, "#15151b");
          ghostPaint = gg;
        }
        ctx.fillStyle = ghostPaint;
        
        ctx.beginPath();
        ctx.arc(ghostX, ghostY - 3, 11, Math.PI, 0, false);
        ctx.lineTo(ghostX + 11, ghostY + 8);
        ctx.lineTo(ghostX + 7, ghostY + 11);
        ctx.lineTo(ghostX + 3, ghostY + 11);
        ctx.lineTo(ghostX, ghostY + 8);
        ctx.lineTo(ghostX - 3, ghostY + 11);
        ctx.lineTo(ghostX - 7, ghostY + 11);
        ctx.lineTo(ghostX - 11, ghostY + 8);
        ctx.closePath();
        ctx.fill();

        // Visor/scanner KARR sur le fantôme.
        ctx.strokeStyle = frightened ? "#ffffff" : "rgba(255,255,255,.55)";
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(ghostX - 8, ghostY - 1);
        ctx.lineTo(ghostX + 8, ghostY - 1);
        ctx.stroke();
        
        // Yeux améliorés
        const eyeOffsetX = -4;
        const eyeOffsetY = -8;
        
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(ghostX + eyeOffsetX, ghostY + eyeOffsetY, 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(ghostX - eyeOffsetX, ghostY + eyeOffsetY, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Pupilles
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.arc(ghostX + eyeOffsetX + 1, ghostY + eyeOffsetY + 1, 1.5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(ghostX - eyeOffsetX - 1, ghostY + eyeOffsetY + 1, 1.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Bouche fantôme
        ctx.fillStyle = frightened ? "#0044cc" : "#ffffff";
        ctx.beginPath();
        ctx.arc(ghostX, ghostY + 4, 2, 0, Math.PI);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.restore();
        
        // Glow pour fantômes effrayés
        if (frightened) {
          ctx.save();
          ctx.shadowColor = "#00a2ff";
          ctx.shadowBlur = 7;
          ctx.fillStyle = "rgba(0, 162, 255, 0.25)";
          ctx.beginPath();
          ctx.arc(ghostX, ghostY, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.restore();
        }
      });
      
      // Effets de particules pour les pellets mangés
      if (!LOW_POWER_MODE && Math.random() < 0.10) {
        const particleX = PACMAN_ORIGIN_X + player.x * PACMAN_CELL + 11;
        const particleY = PACMAN_ORIGIN_Y + player.y * PACMAN_CELL + 11;
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = PACMAN_COLORS.kittGold;
        ctx.beginPath();
        ctx.arc(particleX + (Math.random() - 0.5) * 20, particleY + (Math.random() - 0.5) * 20, Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      
      // Dessiner toutes les particules
      particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      if (followZoom) ctx.restore();
      
      if ((won || lives <= 0) && !scoreSubmitted) { 
        scoreSubmitted=true; 
        setTimeout(()=>submitScore("pacman",score),350); 
      }
      
      // Écran de pause/fin amélioré - Thème K2000
      if (paused || won) {
        ctx.fillStyle = "rgba(4, 5, 11, 0.85)";
        ctx.fillRect(140, 190, 440, 100);
        
        ctx.strokeStyle = won ? PACMAN_COLORS.kittCyan : PACMAN_COLORS.kittRed;
        ctx.lineWidth = 2;
        ctx.strokeRect(142, 192, 436, 96);
        
        label(won ? "LABYRINTHE TERMINÉ" : "GAME OVER — R POUR RECOMMENCER", 190, 245, 22, won ? PACMAN_COLORS.kittCyan : PACMAN_COLORS.kittRed);
        
        // Animation de victoire
        if (won) {
          ctx.fillStyle = "rgba(0, 162, 255, 0.2 + Math.sin(now * 0.005) * 0.1)";
          ctx.beginPath();
          ctx.arc(360, 245, 50, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      // READY/GO transitions - Thème K2000
      if (now < introUntil && !paused && !won) {
        ctx.fillStyle = "rgba(4, 5, 11, 0.7)";
        ctx.fillRect(250, 200, 220, 40);
        ctx.strokeStyle = PACMAN_COLORS.kittGold;
        ctx.lineWidth = 2;
        ctx.strokeRect(252, 202, 216, 36);
        label("READY!", 320, 225, 20, PACMAN_COLORS.kittGold);
      }
    };

    reset();
    startGame("pac-man", "Flèches : déplacer • P : pause • R : recommencer • Échap : sortir", onKey, draw, reset);
    activeGame.followZoom = followZoom;
    activeGame.setFollowZoom = enabled => {
      followZoom = !!enabled;
      activeGame.followZoom = followZoom;
      cameraX = PACMAN_ORIGIN_X + player.x * PACMAN_CELL + PACMAN_CELL / 2;
      cameraY = PACMAN_ORIGIN_Y + player.y * PACMAN_CELL + PACMAN_CELL / 2;
    };
    activeGame.getState = () => ({ game:"pacman", grid:grid.map(row=>row.join("")), player:{x:player.x,y:player.y,dir:player.dir}, ghosts:ghosts.map(g=>({x:g.x,y:g.y,color:g.color,dir:g.dir})), score, lives, level, pelletsRemaining:totalPellets-pelletsEaten, bonusFruit:bonusFruit?{name:bonusFruit.name,points:bonusFruit.points,x:FRUIT_SPAWN.x,y:FRUIT_SPAWN.y}:null, status:won?"VICTOIRE":lives<=0?"DÉFAITE":paused?"PAUSE":"EN COURS" });
  }

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
  const blockSpriteCache=new Map();
  let lineCombo=-1,backToBack=false,comboNotice="",comboNoticeUntil=0;
  let novaCharge=0,novaStock=0;
  let held = null;
  let canHold = true;
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
  
  // Screen shake
  let screenShake = 0;
  let screenShakeTime = 0;
  
  // Lock flash
  let lockFlash = 0;
  let lockFlashTime = 0;
  
  // Reflet du plateau
  let reflectionLayer = null;
  
  // Effets de line clear distincts
  let lastCleared = 0;
  let kyronextClearActive = false;
  let kyronextClearTime = 0;
  
  // Animation KYRONEXT en arrière-plan
  let kyronextLetters = [];
  let kyronextLayer = null;
  let kyronextTime = 0;
  
  // Profondeur/parallaxe
  let parallaxOffset = 0;

  // ==========================================
  // INITIALISATION
  // ==========================================

  function initKyronextBackground() {
    const word = "KYRONEXT";
    // Le mot-symbole occupe presque toute la largeur, mais reste pré-rendu une
    // seule fois pour conserver le débit de dessin sur les écrans mobiles.
    const cellSize = IS_NANO ? 11 : IS_MOBILE ? 13 : 16;
    const letterWidth = 4;
    const letterHeight = 5;
    const spacingCells = 1.2;
    const letterDefinitions = {
      "K": [[1,0,0,1],[1,0,1,0],[1,1,0,0],[1,0,1,0],[1,0,0,1]],
      "Y": [[1,0,0,1],[1,0,0,1],[0,1,1,0],[0,0,1,0],[0,0,1,0]],
      "R": [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,1,0],[1,0,0,1]],
      "O": [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
      "N": [[1,0,0,1],[1,1,0,1],[1,0,1,1],[1,0,0,1],[1,0,0,1]],
      "E": [[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,1,1,1]],
      "X": [[1,0,0,1],[0,1,1,0],[0,0,1,0],[0,1,1,0],[1,0,0,1]],
      "T": [[1,1,1,0],[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]
    };

    kyronextLetters = [];
    const letterPx = letterWidth * cellSize;
    const gapPx = spacingCells * cellSize;
    const totalWidth = word.length * letterPx + (word.length - 1) * gapPx;
    const startX = Math.round((canvas.width - totalWidth) / 2);
    const baseY = Math.round((canvas.height - letterHeight * cellSize) / 2);

    const layer = document.createElement("canvas");
    layer.width = canvas.width;
    layer.height = canvas.height;
    const bg = layer.getContext("2d", { alpha: true });

    for (let i = 0; i < word.length; i++) {
      const letter = word[i];
      const definition = letterDefinitions[letter];
      const lx = startX + i * (letterPx + gapPx);
      const color = PIECE_COLORS[i % PIECE_COLORS.length];
      kyronextLetters.push({ letter, definition, x: lx, y: baseY, color });

      for (let y = 0; y < definition.length; y++) {
        for (let x = 0; x < definition[y].length; x++) {
          if (!definition[y][x]) continue;
          const px = lx + x * cellSize;
          const py = baseY + y * cellSize;
          const face = cellSize - 1;
          const depth = IS_NANO ? 2 : 5;
          for (let layer = depth; layer > 0; layer--) {
            bg.fillStyle = `rgba(2,8,24,${0.18 + (depth - layer) * 0.08})`;
            bg.fillRect(px + layer * 1.25, py + layer * 1.25, face, face);
          }
          bg.shadowColor = color;
          bg.shadowBlur = IS_NANO ? 4 : 10;
          const faceGradient = bg.createLinearGradient(px, py, px + cellSize, py + cellSize);
          faceGradient.addColorStop(0, "#ffffff");
          faceGradient.addColorStop(0.16, color);
          faceGradient.addColorStop(0.72, color);
          faceGradient.addColorStop(1, "#071426");
          bg.fillStyle = faceGradient;
          bg.fillRect(px, py, face, face);
          bg.shadowBlur = 0;
          bg.fillStyle = "rgba(255,255,255,.58)";
          bg.fillRect(px + 1, py + 1, Math.max(1, cellSize - 3), 2);
          bg.fillStyle = "rgba(0,0,0,.38)";
          bg.fillRect(px + cellSize - 2, py + 2, 2, Math.max(1, cellSize - 3));
        }
      }
    }
    kyronextLayer = layer;
  }

  function updateKyronextBackground(time) {
    kyronextTime = time;
  }

  function drawKyronextBackground() {
    if (!kyronextLayer) return;
    // Le mot entier dérive comme un appareil qui perd doucement son assiette.
    // Sur Nano il reste visible mais utilise un seul drawImage pré-rendu.
    const driftX = Math.sin(kyronextTime * 0.00043) * (IS_NANO ? 5 : 12);
    const driftY = Math.cos(kyronextTime * 0.00031) * (IS_NANO ? 2 : 5);
    const roll = Math.sin(kyronextTime * 0.00037) * (IS_NANO ? 0.022 : 0.055);
    const pitch = 0.95 + Math.sin(kyronextTime * 0.00029) * (IS_NANO ? 0.012 : 0.026);

    ctx.save();
    ctx.globalAlpha = IS_NANO ? 0.30 : 0.43 + Math.sin(kyronextTime * 0.001) * 0.035;
    ctx.translate(canvas.width / 2 + driftX, canvas.height / 2 + driftY);
    ctx.rotate(roll);
    ctx.scale(IS_NANO ? 1.04 : 1.08, pitch);
    ctx.drawImage(kyronextLayer, -canvas.width / 2, -canvas.height / 2);
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
    boardCtx.fillStyle = IS_NANO ? "rgba(4,5,6,.88)" : "rgba(4,5,6,.72)"; boardCtx.fillRect(originX, originY, bw, bh);
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
  
  function initReflectionLayer() {
    if (IS_NANO) return; // Désactivé sur Nano
    const layer = document.createElement("canvas");
    layer.width = canvas.width; layer.height = canvas.height;
    const refCtx = layer.getContext("2d", { alpha: true });
    
    // Gradient de transparence pour le reflet
    const gradient = refCtx.createLinearGradient(0, 0, 0, 60);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.2)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    
    refCtx.fillStyle = gradient;
    refCtx.fillRect(250, 480, 210, 60);
    
    reflectionLayer = layer;
  }

  const freshBoard = () => Array.from({ length: 20 }, () => Array(10).fill(0));
  const copyShape = (shape) => shape.map((row) => row.slice());
  
  const newPiece = () => {
    if (!bag.length) {
      bag=[0,1,2,3,4,5,6];
      for(let i=bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]]}
    }
    const index = bag.pop();
    return { type:index, shape: copyShape(SHAPES[index]), color: PIECE_COLORS[index], x: 3, y: 0 };
  };

  const reset = () => {
    board = freshBoard();
    bag = [];
    lineCombo=-1;backToBack=false;comboNotice="";
    novaCharge=0;novaStock=0;
    current = newPiece();
    next = newPiece();
    held = null;
    canHold = true;
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
    screenShake = 0;
    screenShakeTime = 0;
    lockFlash = 0;
    lockFlashTime = 0;
    lastCleared = 0;
    kyronextClearActive = false;
    kyronextClearTime = 0;
    parallaxOffset = 0;
    
    // Initialiser le fond KYRONEXT
    if (kyronextLetters.length === 0) initKyronextBackground();
    
    // Initialiser le reflet
    if (!reflectionLayer) initReflectionLayer();
    
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
    // Petit wall-kick vertical : les rotations restent possibles contre le sol
    // ou une pile basse, tout en gardant les décalages horizontaux classiques.
    const kicks = [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[-1,-1],[1,-1],[0,-2]];
    for (const [offsetX, offsetY] of kicks) {
      if (!collides(current, offsetX, offsetY, rotated)) {
        current.x += offsetX;
        current.y += offsetY;
        current.shape = rotated;
        beep(500, 0.045, "triangle");
        return;
      }
    }
  };

  const holdPiece = () => {
    if (!canHold || paused || gameOver) return;
    const outgoing = { type:current.type, shape:copyShape(SHAPES[current.type]), color:current.color, x:3, y:0 };
    if (held) {
      current = { type:held.type, shape:copyShape(SHAPES[held.type]), color:held.color, x:3, y:0 };
      held = outgoing;
    } else {
      held = outgoing;
      current = next;
      next = newPiece();
    }
    canHold = false;
    if (collides(current)) { gameOver = true; paused = true; return; }
    beep(740, 0.07, "triangle");
  };

  const lock = (isHardDrop = false) => {
    const lockX = current.x + Math.floor(current.shape[0].length / 2);
    const lockY = current.y + current.shape.length - 1;
    
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
    
    // Screen shake au verrouillage
    screenShake = isHardDrop ? 4 : 2;
    screenShakeTime = 120;
    
    // Lock flash
    lockFlash = 1;
    lockFlashTime = 80;
    
    // Son d'impact (quilles/briques)
    playLockSound(current.color, isHardDrop);
    
    if(!cleared)lineCombo=-1;
    if (cleared) {
      clearFlashUntil = performance.now() + 300;
      playSample("tetris_clear", Math.min(.52, .26 + cleared * .06));
      lines += cleared;
      novaCharge += cleared;
      if(novaCharge>=4){novaStock=Math.min(2,novaStock+Math.floor(novaCharge/4));novaCharge%=4;}
      lineCombo++;
      const difficult=cleared===4;
      const chainBonus=difficult&&backToBack?400*level:0;
      score += [0, 100, 300, 500, 800][cleared] * level + Math.max(0,lineCombo)*50*level + chainBonus;
      comboNotice=chainBonus?"BACK TO BACK":lineCombo>0?"COMBO ×"+(lineCombo+1):difficult?"TETRIS !":"+"+cleared+" LIGNE"+(cleared>1?"S":"");
      comboNoticeUntil=performance.now()+1400;backToBack=difficult;
      level = Math.min(10, 1 + Math.floor(lines / 10));
      setLevelMusic("tetris", level);
      
      // Effets distincts par nombre de lignes
      triggerLineClearEffects(cleared, lockX, lockY);
      
      // Sons de line clear
      playLineClearSound(cleared);
      
      // Effet visuel d'impact
      impactEffects.push({
        x: lockX,
        y: lockY,
        time: performance.now(),
        strength: cleared * 0.5,
        color: current.color || PACMAN_COLORS.kittCyan
      });
      
      // Particules pour les lignes
      const lineDustCount = IS_NANO ? cleared * 4 : cleared * 10;
      for (let i = 0; i < lineDustCount; i++) {
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
    canHold = true;
    if (collides(current)) {
      gameOver = true;
      paused = true;
      beep(150, 0.1, "sawtooth");
      beep(100, 0.2, "sawtooth");
      beep(80, 0.25, "sawtooth");
    }
  };
  
  // ============ NOUVELLES FONCTIONS D'EFFETS ============
  
  function playLockSound(color, isHardDrop) {
    const colorFreq = {
      "#00ffff": 330,
      "#ffff00": 440,
      "#ff4d72": 550,
      "#00a2ff": 277,
      "#ff8c35": 392,
      "#00ff88": 494,
      "#ff2a3a": 523
    };
    const baseFreq = colorFreq[color] || 440;
    const pitch = isHardDrop ? 1.2 : 0.8;
    const freq = baseFreq * pitch;
    
    // Son d'impact solide (quilles/briques)
    beep(freq, 0.06, "sine");
    beep(freq * 0.5, 0.12, "sine");
  }
  
  function playLineClearSound(cleared) {
    const baseFreqs = [220, 277, 330, 392];
    const durations = [0.1, 0.12, 0.14, 0.16];
    const types = ["triangle", "square", "sawtooth", "sine"];
    
    for (let i = 0; i < cleared; i++) {
      beep(baseFreqs[i] + cleared * 40, durations[i], types[i]);
    }
    
    // Son de fin de clear
    if (cleared === 4) {
      beep(660, 0.2, "square");
      beep(880, 0.15, "triangle");
    }
  }
  
  function triggerLineClearEffects(cleared, lockX, lockY) {
    lastCleared = cleared;
    
    // Screen shake proportionnel
    screenShake = Math.min(8, cleared * 2);
    screenShakeTime = 150 + cleared * 50;
    
    // KYRONEXT CLEAR pour 4 lignes
    if (cleared === 4) {
      kyronextClearActive = true;
      kyronextClearTime = performance.now() + 800;
    }
    
    // Particules supplémentaires
    const particleCount = IS_NANO ? cleared * 3 : cleared * 8;
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = (Math.random() * 4 + 2) * cleared;
      const color = PIECE_COLORS[Math.floor(Math.random() * PIECE_COLORS.length)];
      particles.push({
        x: 250 + lockX * 21 + 10,
        y: 54 + lockY * 21 + 10,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 1,
        color: color,
        size: 2 + Math.random() * 2
      });
    }
    
    // Étincelles pour KYRONEXT CLEAR
    if (cleared === 4) {
      for (let i = 0; i < (IS_NANO ? 5 : 12); i++) {
        particles.push({
          x: 250 + lockX * 21 + 10,
          y: 54 + lockY * 21 + 10,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6,
          life: 0.8,
          color: "#ffffff",
          size: 1.5 + Math.random() * 1
        });
      }
    }
  }

  const onKey = (event) => {
    if (!activeGame || activeGame.name !== "tetris") return;
    if(event.key.toLowerCase()==='b'&&!paused&&!gameOver&&novaStock>0){
      const occupied=board.slice(-3).some(row=>row.some(Boolean));
      if(!occupied)return;
      novaStock--;board.splice(17,3);board.unshift(...Array.from({length:3},()=>Array(10).fill(0)));
      score+=300*level;fall=0;triggerLineClearEffects(4,5,18);playLineClearSound(4);
      [17,18,19].forEach(y=>lineClearEffects.push({y,time:performance.now(),color:COLORS.tetrisCyan}));
      comboNotice='NOVA ! 3 RANGÉES PULVÉRISÉES';comboNoticeUntil=performance.now()+1500;
      return;
    }
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
    if (event.key === "c" || event.key === "C" || event.code === "KeyC") { holdPiece(); return; }
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
      const dropStart=current.y;
      while (!collides(current, 0, 1)) current.y += 1;
      score += (current.y-dropStart)*2;
      lock(true);
      beep(330, 0.05, "triangle", 0.020);
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
      particles[i].x += particles[i].vx*delta*60;
      particles[i].y += particles[i].vy*delta*60;
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

    // Mise à jour des effets temporels
    if (screenShakeTime > 0) {
      screenShakeTime -= delta * 1000;
      if (screenShakeTime <= 0) screenShake = 0;
    }
    
    if (lockFlashTime > 0) {
      lockFlashTime -= delta * 1000;
      if (lockFlashTime <= 0) lockFlash = 0;
    }
    
    if (kyronextClearActive && now > kyronextClearTime) {
      kyronextClearActive = false;
    }
    
    // Parallaxe subtil
    parallaxOffset = Math.sin(now * 0.0003) * 2;
    
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
        }
      }
    }

    // ========================================
    // DESSIN
    // ========================================
    
    drawBackground();
    
    // Plateau pré-rendu
    const originX = 250;
    const originY = 54;
    const cell = 21;
    const bw = 10 * cell, bh = 20 * cell;
    
    if (!tetrisBoardLayer) {
      initBoardLayer();
    }
    
    // Appliquer screen shake
    const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    
    ctx.save();
    ctx.translate(shakeX, shakeY);
    
    ctx.drawImage(tetrisBoardLayer, 0, 0);

    // KYRONEXT passe devant le décor/plateau, mais reste derrière les blocs.
    ctx.save();
    ctx.translate(parallaxOffset * 0.5, 0);
    drawKyronextBackground();
    ctx.restore();
    
    ctx.save();

    // Bloc 3D amélioré avec glow et bevel
    const block3d=(x,y,color,size=cell,isCurrent=false)=>{
      const key=color+':'+size+':'+isCurrent;
      let sprite=blockSpriteCache.get(key);
      const pad=32;
      if(!sprite){
        sprite=document.createElement('canvas');sprite.width=sprite.height=size+pad*2;
        const tile=sprite.getContext('2d');
      const px = pad, py = pad, d = Math.max(3, size * .18);
      tile.save();
      
      // Glow (désactivé sur Nano)
      if (!IS_NANO) {
        tile.shadowColor = color;
        tile.shadowBlur = isCurrent ? 15 : (IS_MOBILE ? 0 : 8);
      }
      
      // Corps du bloc avec gradient pour profondeur
      const bodySize = size - 5;
      const bodyX = px + 2;
      const bodyY = py + 2;
      
      if (!IS_NANO) {
        const bodyGradient = tile.createLinearGradient(bodyX, bodyY, bodyX + bodySize, bodyY + bodySize);
        const baseColor = color;
        const darkColor = shadeColor(baseColor, -20);
        const lightColor = shadeColor(baseColor, isCurrent ? 30 : 15);
        
        bodyGradient.addColorStop(0, lightColor);
        bodyGradient.addColorStop(0.5, baseColor);
        bodyGradient.addColorStop(1, darkColor);
        
        tile.fillStyle = bodyGradient;
      } else {
        tile.fillStyle = color;
      }
      tile.fillRect(bodyX, bodyY, bodySize, bodySize);
      
      // Bevel supérieur gauche
      tile.fillStyle = "rgba(255,255,255,0.45)";
      tile.beginPath();
      tile.moveTo(bodyX, bodyY);
      tile.lineTo(bodyX + bodySize, bodyY);
      tile.lineTo(bodyX + bodySize - d, bodyY + d);
      tile.lineTo(bodyX + d, bodyY + d);
      tile.closePath();
      tile.fill();
      
      // Bevel gauche
      tile.fillStyle = "rgba(255,255,255,0.25)";
      tile.beginPath();
      tile.moveTo(bodyX, bodyY);
      tile.lineTo(bodyX + d, bodyY + d);
      tile.lineTo(bodyX + d, bodyY + bodySize - d);
      tile.lineTo(bodyX, bodyY + bodySize);
      tile.closePath();
      tile.fill();
      
      // Ombre inférieure droite
      tile.fillStyle = "rgba(0,0,0,0.45)";
      tile.beginPath();
      tile.moveTo(bodyX + bodySize, bodyY);
      tile.lineTo(bodyX + bodySize - d, bodyY + d);
      tile.lineTo(bodyX + bodySize - d, bodyY + bodySize - d);
      tile.lineTo(bodyX + bodySize, bodyY + bodySize);
      tile.closePath();
      tile.fill();
      
      // Ombre inférieure
      tile.fillStyle = "rgba(0,0,0,0.35)";
      tile.fillRect(bodyX + d, bodyY + bodySize - d, bodySize - 2 * d, d);
      
      // Reflet spéculaire (bande brillante) pour pièce active
      if (!IS_NANO && isCurrent) {
        const specularGradient = tile.createLinearGradient(
          bodyX + 2, bodyY + 2, 
          bodyX + bodySize - 2, bodyY + bodySize - 2
        );
        specularGradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
        specularGradient.addColorStop(0.3, "rgba(255, 255, 255, 0.2)");
        specularGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
        
        tile.fillStyle = specularGradient;
        tile.beginPath();
        tile.moveTo(bodyX + 2, bodyY + 2);
        tile.lineTo(bodyX + bodySize - 2, bodyY + 2);
        tile.lineTo(bodyX + bodySize - 2, bodyY + 4);
        tile.lineTo(bodyX + 2, bodyY + 4);
        tile.closePath();
        tile.fill();
      }
      
      // Reflet (effet miroir subtil)
      if (!IS_NANO) {
        tile.fillStyle = "rgba(255, 255, 255, 0.1)";
        tile.fillRect(bodyX + 3, bodyY + 3, bodySize - 6, 2);
      }
      
      tile.shadowBlur = 0;
      tile.restore();

        blockSpriteCache.set(key,sprite);
      }
      ctx.save();ctx.shadowBlur=0;ctx.drawImage(sprite,x-pad,y-pad);ctx.restore();
    };

    // Helper pour assombrir/éclaircir une couleur
    function shadeColor(color, percent) {
      let R = parseInt(color.substring(1,3), 16);
      let G = parseInt(color.substring(3,5), 16);
      let B = parseInt(color.substring(5,7), 16);
      
      R = parseInt(R * (100 + percent) / 100);
      G = parseInt(G * (100 + percent) / 100);
      B = parseInt(B * (100 + percent) / 100);
      
      R = (R<255)?R:255;
      G = (G<255)?G:255;
      B = (B<255)?B:255;
      
      R = Math.round(R);
      G = Math.round(G);
      B = Math.round(B);
      
      const RR = ((R.toString(16).length==1)?"0"+R.toString(16):R.toString(16));
      const GG = ((G.toString(16).length==1)?"0"+G.toString(16):G.toString(16));
      const BB = ((B.toString(16).length==1)?"0"+B.toString(16):B.toString(16));
      
      return "#" + RR + GG + BB;
    }

    // Dessiner les blocs posés (plus mats)
    for (let y = 0; y < 20; y += 1) {
      for (let x = 0; x < 10; x += 1) {
        if (board[y][x]) {
          block3d(originX + x * cell, originY + y * cell, board[y][x], cell, false);
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
        block3d(originX + (current.x + x) * cell, originY + (ghostY + y) * cell, current.color, cell, false);
      }
    }));
    ctx.globalAlpha = 1;
    ctx.restore();

    // Pièce courante avec effet spécial (plus brillante)
    current.shape.forEach((row, y) => row.forEach((filled, x) => {
      if (filled && current.y + y >= 0) {
        block3d(originX + (current.x + x) * cell, originY + (current.y + y) * cell, current.color, cell, true);
      }
    }));

    ctx.restore();
    
    // Lock flash
    if (lockFlash > 0) {
      ctx.save();
      ctx.globalAlpha = lockFlash * 0.3;
      ctx.fillStyle = "#ffffff";
      current.shape.forEach((row, y) => row.forEach((filled, x) => {
        if (filled && current.y + y >= 0) {
          ctx.fillRect(
            originX + (current.x + x) * cell + 2,
            originY + (current.y + y) * cell + 2,
            cell - 4, cell - 4
          );
        }
      }));
      ctx.restore();
    }
    
    // Reflet du plateau
    if (!IS_NANO && reflectionLayer) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.translate(0, originY + bh + 10);
      ctx.scale(1, -0.4);
      
      // Dessiner les blocs posés en reflet
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 10; x++) {
          if (board[y][x]) {
            ctx.fillStyle = board[y][x];
            ctx.globalAlpha = 0.15;
            ctx.fillRect(originX + x * cell, originY + y * cell, cell, cell);
          }
        }
      }
      
      // Pièce courante en reflet
      if (!paused && !gameOver) {
        current.shape.forEach((row, y) => row.forEach((filled, x) => {
          if (filled && current.y + y >= 0) {
            ctx.fillStyle = current.color;
            ctx.globalAlpha = 0.1;
            ctx.fillRect(originX + (current.x + x) * cell, originY + (current.y + y) * cell, cell, cell);
          }
        }));
      }
      
      ctx.restore();
    }
    
    ctx.restore(); // Fin screen shake

    // HUD amélioré
    ctx.fillStyle = COLORS.bgPanel;
    ctx.fillRect(16, 0, 700, 56);
    ctx.strokeStyle = PACMAN_COLORS.kittCyan;
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 2, 696, 52);
    
    label(`SCORE ${String(score).padStart(6, "0")}`, 24, 24, 16, PACMAN_COLORS.kittCyan);
    label(`LIGNES ${lines}`, 24, 48, 14, "#a9b9d7");
    if(now<comboNoticeUntil)label(comboNotice,24,82,14,COLORS.tetrisYellow);
    label('NOVA [B] '+ '◆'.repeat(novaStock)+' · '+novaCharge+'/4',24,105,12,COLORS.tetrisCyan);
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

    // Réserve de pièce lisible à côté du puits, façon arcade moderne.
    ctx.fillStyle = COLORS.bgPanel;
    ctx.fillRect(510, 205, 140, 80);
    ctx.strokeStyle = canHold ? PACMAN_COLORS.kittGold : "#657087";
    ctx.lineWidth = 2;
    ctx.strokeRect(512, 207, 136, 76);
    label("RÉSERVE · C", 520, 224, 13, canHold ? PACMAN_COLORS.kittGold : "#9aa4b6");
    if (held) {
      held.shape.forEach((row, y) => row.forEach((filled, x) => {
        if (!filled) return;
        ctx.fillStyle = held.color;
        ctx.fillRect(548 + x * 14, 236 + y * 14, 12, 12);
        ctx.fillStyle = "rgba(255,255,255,.34)";
        ctx.fillRect(550 + x * 14, 238 + y * 14, 8, 2);
      }));
    } else label("VIDE", 558, 260, 12, "#7f8ba2");

    // Flash court après suppression de ligne
    if (now < clearFlashUntil) {
      ctx.save();
      ctx.globalAlpha = 0.18 + 0.16 * Math.abs(Math.sin(now * 0.03));
      ctx.fillStyle = "rgba(0, 162, 255, 0.55)";
      ctx.fillRect(originX, originY, bw, bh);
      ctx.restore();
    }
    
    // Effet KYRONEXT CLEAR
    if (kyronextClearActive) {
      const clearProgress = 1 - (kyronextClearTime - now) / 800;
      const clearAlpha = Math.min(1, clearProgress * 2);
      
      ctx.save();
      ctx.globalAlpha = clearAlpha * 0.8;
      
      // Flash blanc
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fillRect(originX - 20, originY - 20, bw + 40, bh + 40);
      
      // Texte KYRONEXT CLEAR
      ctx.fillStyle = "#63e9ff";
      ctx.font = "bold 28px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("KYRONEXT CLEAR", 360, 250);
      
      // Contour
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeText("KYRONEXT CLEAR", 360, 250);
      
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
  startGame("tetris", "← → déplacer • ↑ tourner • ↓ accélérer • Espace chute • C garder • B nova (4 lignes chargées) • balayage tactile • P pause • R recommencer", onKey, draw, reset);
  activeGame.getState = () => ({ game:"tetris", board:board.map(row=>row.slice()), current:{x:current.x,y:current.y,color:current.color,shape:copyShape(current.shape)}, next:{color:next.color,shape:copyShape(next.shape)}, held:held?{color:held.color,shape:copyShape(held.shape)}:null, canHold, score, lines, level, combo:lineCombo, backToBack, novaStock, novaCharge, status:gameOver?"DÉFAITE":paused?"PAUSE":"EN COURS" });
}


  function arcadeNativeFullscreen() {
    return document.fullscreenElement === arcade || document.webkitFullscreenElement === arcade;
  }

  function arcadeFullscreenActive() {
    return arcadeNativeFullscreen() || arcade.classList.contains("arcade-fallback-fullscreen");
  }

  function syncArcadeFullscreenButton() {
    if (!fullscreenButton) return;
    if (!arcadeFullscreenActive() && arcade.classList.contains("tetris-fill-screen")) {
      arcade.classList.remove("tetris-fill-screen");
      if (viewButton && activeGame?.name === "tetris") { viewButton.textContent = "▣ REMPLIR ÉCRAN"; viewButton.setAttribute("aria-pressed", "false"); }
    }
    const active = arcadeFullscreenActive();
    fullscreenButton.textContent = active ? "× QUITTER PLEIN ÉCRAN" : "⛶ PLEIN ÉCRAN";
    fullscreenButton.setAttribute("aria-pressed", String(active));
    fullscreenButton.title = active ? "Quitter le plein écran" : "Agrandir le jeu à l’écran";
  }

  function notifyParentArcadeFullscreen(active) {
    if (window.parent === window) return;
    try {
      window.parent.postMessage({ type: "KYRONEXT_ARCADE_FULLSCREEN", active: !!active }, window.location.origin);
    } catch (_) {}
  }

  function leaveArcadeFullscreen() {
    const wasFallback = arcade.classList.contains("arcade-fallback-fullscreen");
    arcade.classList.remove("arcade-fallback-fullscreen");
    arcade.classList.remove("tetris-fill-screen");
    document.body.classList.remove("arcade-fallback-open");
    if (viewButton && activeGame?.name === "tetris") { viewButton.textContent = "▣ REMPLIR ÉCRAN"; viewButton.setAttribute("aria-pressed", "false"); }
    if (wasFallback) notifyParentArcadeFullscreen(false);
    if (arcadeNativeFullscreen()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      try { const result = exit?.call(document); result?.catch?.(() => {}); } catch (_) {}
    }
    syncArcadeFullscreenButton();
  }

  async function toggleArcadeFullscreen() {
    if (arcadeFullscreenActive()) {
      leaveArcadeFullscreen();
      return;
    }
    if (activeGame?.name === "tetris") {
      arcade.classList.add("tetris-fill-screen");
      if (viewButton) {
        viewButton.textContent = "▣ VUE NORMALE";
        viewButton.setAttribute("aria-pressed", "true");
      }
    }
    try {
      const request = arcade.requestFullscreen || arcade.webkitRequestFullscreen;
      if (!request) throw new Error("API de plein écran indisponible");
      await request.call(arcade);
      if (!arcadeNativeFullscreen()) {
        arcade.classList.add("arcade-fallback-fullscreen");
        document.body.classList.add("arcade-fallback-open");
        notifyParentArcadeFullscreen(true);
      }
    } catch (_) {
      arcade.classList.add("arcade-fallback-fullscreen");
      document.body.classList.add("arcade-fallback-open");
      notifyParentArcadeFullscreen(true);
    }
    syncArcadeFullscreenButton();
  }

  document.getElementById("back")?.addEventListener("click", stopGame);
  fullscreenButton?.addEventListener("click", toggleArcadeFullscreen);
  zoomButton?.addEventListener("click", () => {
    if (!activeGame) return;
    gameZoomIndex = (gameZoomIndex + 1) % GAME_ZOOM_STEPS.length;
    const zoom = GAME_ZOOM_STEPS[gameZoomIndex];
    arcade.style.setProperty("--arcade-game-zoom", String(zoom));
    arcade.classList.toggle("game-zoomed", zoom > 1);
    document.body.classList.toggle("arcade-zoom-open", zoom > 1);
    zoomButton.textContent = `⌕ ZOOM ×${zoom.toFixed(2).replace(".", ",")}`;
    zoomButton.setAttribute("aria-pressed", String(zoom > 1));
    zoomButton.setAttribute("aria-label", zoom > 1 ? "Réduire l’affichage du jeu" : "Agrandir l’affichage du jeu");
  });
  viewButton?.addEventListener("click", async () => {
    if (activeGame?.name === "pac-man" && activeGame.setFollowZoom) {
      activeGame.setFollowZoom(!activeGame.followZoom);
      viewButton.textContent = `◎ ZOOM SUIVEUR : ${activeGame.followZoom ? "ON" : "OFF"}`;
      viewButton.setAttribute("aria-pressed", String(activeGame.followZoom));
      return;
    }
    if (activeGame?.name === "tetris") {
      if (arcade.classList.contains("tetris-fill-screen")) {
        leaveArcadeFullscreen();
        viewButton.textContent = "▣ REMPLIR ÉCRAN";
        viewButton.setAttribute("aria-pressed", "false");
      } else {
        arcade.classList.add("tetris-fill-screen");
        viewButton.textContent = "▣ VUE NORMALE";
        viewButton.setAttribute("aria-pressed", "true");
        if (!arcadeFullscreenActive()) await toggleArcadeFullscreen();
      }
    }
  });
  document.addEventListener("fullscreenchange", syncArcadeFullscreenButton);
  document.addEventListener("webkitfullscreenchange", syncArcadeFullscreenButton);
  window.addEventListener("keydown", handleKey, { passive: false });
  let touchRepeatTimer=0;
  const stopTouchRepeat=()=>{clearInterval(touchRepeatTimer);touchRepeatTimer=0};
  window.addEventListener("blur",stopTouchRepeat);
  document.addEventListener("visibilitychange",()=>{if(document.hidden){stopTouchRepeat();canvasGesture=null;}});
  document.querySelectorAll(".arcade-controls [data-key]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      resumeArcadeAudio();
      controlKey(button.dataset.key);
      stopTouchRepeat();
      button.setPointerCapture?.(event.pointerId);
      if(activeGame?.name==="tetris"&&["ArrowLeft","ArrowRight","ArrowDown"].includes(button.dataset.key))touchRepeatTimer=setInterval(()=>controlKey(button.dataset.key),110);
    });
    ["pointerup","pointercancel","lostpointercapture"].forEach(type=>button.addEventListener(type,stopTouchRepeat));
    button.addEventListener("click", (event) => {
      // Le clic clavier n'émet pas pointerdown ; le clic tactile/souris y est
      // déjà traité afin d'éviter une double action.
      if (event.detail === 0) controlKey(button.dataset.key);
    });
  });
  // Le clic sur une carte de jeu arrive avant la fin de l'introduction cinéma.
  // On initialise donc WebAudio dans le geste utilisateur initial, au lieu de
  // demander au navigateur de l'autoriser cinq secondes plus tard.
  document.addEventListener("pointerdown", () => resumeArcadeAudio(), { passive: true });
  document.addEventListener("keydown", () => resumeArcadeAudio(), { passive: true });
  // Gestes sur l'aire de jeu : Pac-Man prend une direction, Tetris interprète
  // les balayages comme des commandes, sans interférer avec Invaders/Tron.
  let canvasGesture = null;
  canvas.addEventListener("pointerdown", event => {
    if (!activeGame || !["pac-man", "tetris"].includes(activeGame.name)) return;
    resumeArcadeAudio();
    canvasGesture = { x:event.clientX, y:event.clientY, id:event.pointerId };
  }, { passive:true });
  canvas.addEventListener("pointercancel",()=>{canvasGesture=null});
  canvas.addEventListener("pointerup", event => {
    if (!canvasGesture || !activeGame || !["pac-man", "tetris"].includes(activeGame.name)) return;
    const start = canvasGesture; canvasGesture = null;
    if (event.pointerId !== start.id) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    const distance = Math.hypot(dx, dy);
    const key = distance < 24 ? (activeGame.name === "tetris" ? "ArrowUp" : null)
      : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "ArrowLeft" : "ArrowRight")
      : (dy < 0 ? (activeGame.name === "tetris" ? "Space" : "ArrowUp") : "ArrowDown");
    if (key) { event.preventDefault(); controlKey(key); }
  }, { passive:false });
  soundButton?.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    try { localStorage.setItem("kyronext.arcade.sound", soundEnabled ? "on" : "off"); } catch (_) { /* stockage facultatif */ }
    soundButton.textContent = `SON : ${soundEnabled ? "ON" : "OFF"}`;
    soundButton.setAttribute("aria-pressed", String(!soundEnabled));
    if (soundEnabled) {
      resumeArcadeAudio();
      if (arcadeMaster && audioContext) arcadeMaster.gain.setTargetAtTime(0.90, audioContext.currentTime, 0.035);
      startMusic();
    } else {
      if (arcadeMaster && audioContext) arcadeMaster.gain.setTargetAtTime(0, audioContext.currentTime, 0.025);
      clearInterval(musicTimer);
      musicTimer = 0;
    }
  });
  if (soundButton) {
    soundButton.textContent = `SON : ${soundEnabled ? "ON" : "OFF"}`;
    soundButton.setAttribute("aria-pressed", String(!soundEnabled));
  }
  const bindArcadeVolume = (inputId, outputId, storageKey, initial, gainName) => {
    const input = document.getElementById(inputId);
    const output = document.getElementById(outputId);
    if (!input || !output) return;
    const paint = value => { input.value = String(Math.round(value * 100)); output.value = `${input.value}%`; output.textContent = output.value; };
    paint(initial);
    input.addEventListener("input", () => {
      const value = Math.max(0, Math.min(1, Number(input.value) / 100));
      if (gainName === "music") arcadeMusicVolume = value; else arcadeSfxVolume = value;
      paint(value);
      try { localStorage.setItem(storageKey, String(value)); } catch (_) { /* stockage facultatif */ }
      const bus = gainName === "music" ? arcadeMusicGain : arcadeSfxGain;
      if (audioContext && bus) bus.gain.setTargetAtTime(value, audioContext.currentTime, 0.025);
    });
  };
  bindArcadeVolume("arcade-music-volume", "arcade-music-volume-value", "kyronext.arcade.music-volume", arcadeMusicVolume, "music");
  bindArcadeVolume("arcade-sfx-volume", "arcade-sfx-volume-value", "kyronext.arcade.sfx-volume", arcadeSfxVolume, "sfx");
  const pauseActiveGame=()=>{
    if(activeGame?.getState?.().status==="EN COURS")activeGame.onKey({key:"p",code:"KeyP",preventDefault(){}});
  };
  window.addEventListener("blur",pauseActiveGame);
  document.addEventListener("visibilitychange", () => {
    if(document.hidden)pauseActiveGame();
    if (!activeGame || !audioContext) return;
    if (document.hidden) {
      clearInterval(musicTimer);
      musicTimer = 0;
      if (audioContext.state === "running") audioContext.suspend().catch(() => {});
    } else if (soundEnabled) {
      audioContext.resume().then(() => { if (activeGame && !musicTimer) startMusic(); }).catch(() => {});
    }
  });
  document.querySelectorAll("[data-game]").forEach((button) => {
    button.addEventListener("click", () => {
      startClassicGame(button.dataset.game);
    });
  });
  document.querySelectorAll("[data-external-game]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (pendingLaunch) return;
      const game=link.dataset.externalGame || "ARCADE";
      const href=link.getAttribute("href");
      if (!href) return;
      pendingLaunch=true;
      launchWithKironextIntro(game, () => {
        pendingLaunch=false;
        window.location.assign(href);
      });
    });
  });
  window.KyronextArcade={launch:startClassicGame,stop:stopGame,state:()=>activeGame?.getState?.()||null,game:()=>activeGame?.name||null};

  const requested = new URLSearchParams(window.location.search).get("game");
  if (requested === "pacman") startClassicGame("pacman");
  if (requested === "tetris") startClassicGame("tetris");
  if (requested === "spaceinvaders") startClassicGame("spaceinvaders");
  if (requested === "asteroids") location.replace("/static/games/asteroids_pro/index.html");
  if (requested === "racer") location.replace("/kitt-stunt-racing/?kyronex=1");
  if (requested === "tron") startClassicGame("tron");
// JEU 1 : SPACE INVADERS VERSION K2000
// ============================================================================

function spaceInvaders() {
  renderScores("spaceinvaders");
  
  // Configuration du jeu
  const PLAYER_WIDTH = 54;
  const PLAYER_HEIGHT = 28;
  const ENEMY_WIDTH = 30;
  const ENEMY_HEIGHT = 24;
  const BULLET_WIDTH = 4;
  const BULLET_HEIGHT = 12;
  const BOSS_WIDTH = 60;
  const BOSS_HEIGHT = 40;
  
  // Couleurs style K2000
  const COLORS_K2000 = {
    kitt: "#ff2a3a",      // Rouge KITT
    karr: "#00a2ff",      // Bleu KARR
    goliath: "#ff8c00",   // Orange pour le boss
    laser: "#ff4d72",     // Rose pour les tirs
    explosion: "#ffcc00", // Jaune pour les explosions
    background: "#040506",
    grid: "#1a1208"
  };
  
  let player = { x: canvas.width / 2 - PLAYER_WIDTH / 2, y: canvas.height - 72, width: PLAYER_WIDTH, height: PLAYER_HEIGHT, speed: 8 };
  let enemies = [];
  let enemyDirection = 1;
  let enemySpeed = 0.5;
  let enemyMoveDown = false;
  let bullets = [];
  let enemyBullets = [];
  let weaponPickups = [];
  let weaponLevel = 1;
  let shieldUntil=0,rapidUntil=0,lastPlayerShot=0,bombs=1;
  let digitalExplosions=[];
  const bonusTypes=["weapon","rapid","shield","bomb","life"];
  function explode(x,y,color="#ffbc43",strength=1){
    if(digitalExplosions.length>=18)digitalExplosions.shift();
    digitalExplosions.push({x,y,color,strength,age:0,sparks:Array.from({length:LOW_POWER_MODE?10:24},()=>({a:Math.random()*Math.PI*2,v:40+Math.random()*110}))});
    beep(75,.28,"sine",.065);beep(180,.09,"sawtooth",.04);
  }
  function bomb(){if(paused||gameOver||bombs<=0)return;bombs--;enemyBullets=[];
    enemies.filter(e=>e.alive).forEach(e=>{e.alive=false;score+=75;explode(e.x+e.width/2,e.y+e.height/2,e.color,.8)});
    if(bossActive&&boss){boss.health-=60;if(boss.health<=0){explode(boss.x,boss.y,"#ffffff",2);boss=null;bossActive=false;score+=1000;createEnemies();}}
    else if(enemies.every(e=>!e.alive)){if(level>=10){won=true;gameOver=true;paused=true}else{level++;if([3,6,9].includes(level))createBoss();else createEnemies();setLevelMusic("spaceinvaders",level)}}
    explode(canvas.width/2,canvas.height/2,"#74f9ff",3);invulnerableUntil=performance.now()+1200;
  }
  let score = 0;
  let lives = 3;
  let level = 1;
  let paused = false;
  let gameOver = false;
  let won = false;
  let boss = null;
  let bossActive = false;
  let bossHealth = 100;
  let lastEnemyShot = 0;
  let enemyShotInterval = 2000;
  let scoreSubmitted = false;
  let stars = [];
  let lastPaint=0,frameScale=1,invulnerableUntil=0,combo=0,lastKillAt=0;
  let comet = null;
  let nextCometAt = 0;
  
  // Initialisation des étoiles de fond
  function initStars() {
    stars = [];
    for (let i = 0; i < (LOW_POWER_MODE ? 45 : 100); i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.8 + 0.8,
        speed: Math.random() * (LOW_POWER_MODE ? 1.5 : 2.8) + 0.45,
        opacity: Math.random() * 0.6 + 0.2
      });
    }
  }
  
  // Création des ennemis (KARR, véhicules, etc.)
  function createEnemies() {
    enemies = [];
    const rows = 4;
    const cols = 8;
    const startX = (canvas.width - cols * (ENEMY_WIDTH + 15)) / 2;
    const startY = 50;
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const enemyType = row === 0 ? "karr" : row === 1 ? "vehicle" : row === 2 ? "tank" : "drone";
        enemies.push({
          x: startX + col * (ENEMY_WIDTH + 15),
          y: startY + row * (ENEMY_HEIGHT + 15),
          width: ENEMY_WIDTH,
          height: ENEMY_HEIGHT,
          type: enemyType,
          alive: true,
          color: enemyType === "karr" ? COLORS_K2000.karr : 
                 enemyType === "vehicle" ? "#ff5500" : 
                 enemyType === "tank" ? "#55ff00" : "#aaaaaa"
        });
      }
    }
  }
  
  // Création du boss Goliath
  function createBoss() {
    boss = {
      x: (canvas.width - BOSS_WIDTH) / 2,
      y: 40,
      width: BOSS_WIDTH,
      height: BOSS_HEIGHT,
      speed: 1.5,
      direction: 1,
      color: COLORS_K2000.goliath,
      health: bossHealth
    };
    bossActive = true;
  }
  
  // Réinitialisation du jeu
  function reset() {
    player = { x: canvas.width / 2 - PLAYER_WIDTH / 2, y: canvas.height - 72, width: PLAYER_WIDTH, height: PLAYER_HEIGHT, speed: 8 };
    bullets = [];
    enemyBullets = [];
    weaponPickups = [];
    weaponLevel = 1;shieldUntil=0;rapidUntil=0;lastPlayerShot=0;bombs=1;digitalExplosions=[];
    lastPaint=0;combo=0;lastKillAt=0;invulnerableUntil=performance.now()+1800;
    score = 0;
    lives = 3;
    level = 1;
    paused = false;
    gameOver = false;
    won = false;
    scoreSubmitted = false;
    boss = null;
    bossActive = false;
    bossHealth = 100 + level * 20;
    comet = null;
    nextCometAt = performance.now() + 2200 + Math.random() * 3800;
    enemySpeed = 0.5 + level * 0.1;
    enemyShotInterval = Math.max(1000, 2000 - level * 100);
    
    createEnemies();
    initStars();
    setLevelMusic("spaceinvaders", level);
  }
  
  // Tir du joueur
  function playerShoot() {
    const now=performance.now();if(paused||gameOver||now-lastPlayerShot<(now<rapidUntil?80:160)||bullets.length>60)return;lastPlayerShot=now;
    const offsets = weaponLevel === 1 ? [0] : weaponLevel === 2 ? [-12, 12] : [-18, 0, 18];
    for (const dx of offsets) bullets.push({
      x: player.x + player.width / 2 - BULLET_WIDTH / 2 + dx,
      y: player.y, width: BULLET_WIDTH, height: BULLET_HEIGHT,
      speed: 12, dx: weaponLevel === 3 ? dx * .018 : 0,
      color: COLORS_K2000.laser
    });
    beep(880, 0.05, "square");beep(1700,.055,"sine",.025);
  }

  function dropWeaponPickup(enemy) {
    if (weaponPickups.length >= 4 || Math.random() > .18) return;
    weaponPickups.push({ x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2, size: 18, type:bonusTypes[Math.floor(Math.random()*bonusTypes.length)],speed: 2.25, phase: Math.random() * 6 });
  }
  
  // Tir ennemi
  function enemyShoot() {
    const now = performance.now();
    if (now - lastEnemyShot < enemyShotInterval) return;
    
    const aliveEnemies = enemies.filter(e => e.alive);
    if (aliveEnemies.length === 0) return;
    
    const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
    enemyBullets.push({
      x: shooter.x + shooter.width / 2 - BULLET_WIDTH / 2,
      y: shooter.y + shooter.height,
      width: BULLET_WIDTH,
      height: BULLET_HEIGHT,
      speed: 8,
      color: bossActive ? COLORS_K2000.goliath : COLORS_K2000.karr
    });
    beep(220, 0.08, "sawtooth");
    lastEnemyShot = now;
  }
  
  // Vérification des collisions
  function checkCollisions() {
    // Collisions bullets vs ennemis
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      
      for (let j = enemies.length - 1; j >= 0; j--) {
        const enemy = enemies[j];
        if (!enemy.alive) continue;
        
        if (bullet.x < enemy.x + enemy.width &&
            bullet.x + bullet.width > enemy.x &&
            bullet.y < enemy.y + enemy.height &&
            bullet.y + bullet.height > enemy.y) {
          
          enemy.alive = false;
          explode(enemy.x+enemy.width/2,enemy.y+enemy.height/2,enemy.color);
          dropWeaponPickup(enemy);
          bullets.splice(i, 1);
          const killNow=performance.now();combo=killNow-lastKillAt<1800?Math.min(combo+1,8):1;lastKillAt=killNow;
          score+=25*(combo-1);
          score += enemy.type === "karr" ? 100 : enemy.type === "tank" ? 75 : 50;
          beep(440 + Math.random() * 200, 0.1, "triangle");
          playSample("space_explosion", 0.34);
          
          // Vérifier si tous les ennemis sont détruits
          if (enemies.every(e => !e.alive)) {
            if (level >= 10) {
              won = true; gameOver = true; paused = true; score += 10000;
              beep(880, .18, "triangle"); beep(1175, .25, "triangle");
            } else {
              level++;
              score += 1000 * level;
              if (level === 3 || level === 6 || level === 9 || level === 10) createBoss();
              else createEnemies();
              enemySpeed = 0.5 + level * 0.1;
              enemyShotInterval = Math.max(700, 2000 - level * 115);
              setLevelMusic("spaceinvaders", level);
            }
          }
          break;
        }
      }
      
      if(!bullets.includes(bullet))continue;
      // Collision bullet vs boss
      if (bossActive && boss && 
          bullet.x < boss.x + boss.width &&
          bullet.x + bullet.width > boss.x &&
          bullet.y < boss.y + boss.height &&
          bullet.y + bullet.height > boss.y) {
        
        boss.health -= 10;
        bullets.splice(i, 1);
        beep(660, 0.08, "square");
        
        if (boss.health <= 0) {
          bossActive = false;
          boss = null;
          score += 2000 * level;
          if (weaponLevel < 3 && weaponPickups.length < 4) {
            weaponPickups.push({ x: canvas.width / 2, y: BOSS_HEIGHT + 35, size: 20, speed: 2.5, phase: 0 });
          }
          if (level >= 10) {
            won = true; gameOver = true; paused = true; score += 10000;
            beep(880, .18, "triangle"); beep(1175, .25, "triangle");
          } else createEnemies();
        }
      }
      
      // Supprimer les bullets hors écran
      if (bullet.y < 0) {
        bullets.splice(i, 1);
      }
    }
    
    // Collisions enemy bullets vs joueur
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const bullet = enemyBullets[i];
      
      if (bullet.x < player.x + player.width &&
          bullet.x + bullet.width > player.x &&
          bullet.y < player.y + player.height &&
          bullet.y + bullet.height > player.y && performance.now()>=invulnerableUntil) {
        invulnerableUntil=performance.now()+1400;
        
        enemyBullets.splice(i, 1);
        if(performance.now()<shieldUntil){shieldUntil=0;explode(player.x+27,player.y,"#74f9ff",.6);}else{lives--;explode(player.x+27,player.y,"#ff4068",1.5);}
        beep(110, 0.2, "sawtooth");
        
        if (lives <= 0) {
          gameOver = true;
          paused = true;
        }
        break;
      }
      
      // Supprimer les bullets hors écran
      if (bullet.y > canvas.height) {
        enemyBullets.splice(i, 1);
      }
    }
    
    // Collision joueur vs boss
    if (bossActive && boss && 
        player.x < boss.x + boss.width &&
        player.x + player.width > boss.x &&
        player.y < boss.y + boss.height &&
        player.y + player.height > boss.y && performance.now()>=invulnerableUntil) {
      invulnerableUntil=performance.now()+1400;
      
      lives--;
      beep(110, 0.2, "sawtooth");
      if (lives <= 0) {
        gameOver = true;
        paused = true;
      }
    }
  }
  
  // Déplacement des ennemis
  function moveEnemies() {
    let moveDown = false;
    
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      
      const newX = enemy.x + enemyDirection * enemySpeed * 2 * frameScale;
      
      // Vérifier si un ennemi atteint le bord
      if (newX < 10 || newX + enemy.width > canvas.width - 10) {
        moveDown = true;
        break;
      }
    }
    
    if (moveDown) {
      enemyDirection *= -1;
      for (const enemy of enemies) {
        if (enemy.alive) {
          enemy.y += 20;
          
          // Vérifier si un ennemi atteint le bas (game over)
          if (enemy.y + enemy.height > canvas.height - 72) {
            gameOver = true;
            paused = true;
          }
        }
      }
    } else {
      for (const enemy of enemies) {
        if (enemy.alive) {
          enemy.x += enemyDirection * enemySpeed;
        }
      }
    }
  }
  
  // Déplacement du boss
  function moveBoss() {
    if (!bossActive || !boss) return;
    
    boss.x += boss.speed * boss.direction * frameScale;
    
    if (boss.x < 20 || boss.x + boss.width > canvas.width - 20) {
      boss.direction *= -1;
      boss.y += 30;
    }
    
    // Tir du boss
    if (Math.random() < 0.01) {
      enemyBullets.push({
        x: boss.x + boss.width / 2 - BULLET_WIDTH / 2,
        y: boss.y + boss.height,
        width: BULLET_WIDTH,
        height: BULLET_HEIGHT + 4,
        speed: 10,
        color: COLORS_K2000.goliath
      });
      beep(165, 0.1, "sawtooth");
    }
  }
  
  // Gestion des entrées clavier
  const onKey = (event) => {
    if (!activeGame || activeGame.name !== "space-invaders" || activeGame.onKey!==onKey) return;
    
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
    
    if (gameOver) {
      if (event.key === "r" || event.key === "R") {
        reset();
        beep(660, 0.08);
      }
      return;
    }
    
    if (paused) return;
    
    if(event.key.toLowerCase()==="b"){bomb();return;}
    // Déplacement joueur
    if (event.key === "ArrowLeft" && player.x > 0) {
      player.x -= player.speed;
      event.preventDefault();
    }
    if (event.key === "ArrowRight" && player.x < canvas.width - player.width) {
      player.x += player.speed;
      event.preventDefault();
    }
    if (event.key === " " || event.key === "Space") {
      playerShoot();
      event.preventDefault();
    }
  };
  
  // Support souris pour Space Invaders
  let mouseX = canvas.width / 2;
  let isMouseActive = false;
  
  // Écouteur de mouvement de souris
  canvas.addEventListener("mousemove", (event) => {
    if (!activeGame || activeGame.name !== "space-invaders") return;
    if (paused || gameOver) return;
    
    // Obtenir la position relative de la souris par rapport au canvas
    const rect = canvas.getBoundingClientRect();
    mouseX=(event.clientX-rect.left)*canvas.width/rect.width;
    isMouseActive = true;
    
    // Déplacer le joueur avec la souris
    player.x = mouseX - player.width / 2;
    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
  });
  
  // Écouteur de clic pour tirer
  canvas.addEventListener("click", (event) => {
    if (!activeGame || activeGame.name !== "space-invaders") return;
    if (paused || gameOver) return;
    
    playerShoot();
    event.preventDefault();
  });
  
  // Écouteur de toucher pour mobile
  canvas.addEventListener("touchmove", (event) => {
    if (!activeGame || activeGame.name !== "space-invaders") return;
    if (paused || gameOver) return;
    
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches[0];
    mouseX = touch.clientX - rect.left;
    isMouseActive = true;
    
    player.x = mouseX - player.width / 2;
    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
    event.preventDefault();
  });
  
  canvas.addEventListener("touchstart", (event) => {
    if (!activeGame || activeGame.name !== "space-invaders") return;
    if (paused || gameOver) return;
    
    playerShoot();
    event.preventDefault();
  });
  
  // Dessin du jeu
  const draw = (now) => {
    frameScale=lastPaint?Math.min(3,(now-lastPaint)/(1000/60)):1;lastPaint=now;
    // Fond étoilé
    ctx.fillStyle = COLORS_K2000.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Dessiner les étoiles
    ctx.fillStyle = "#ffffff";
    for (const star of stars) {
      ctx.globalAlpha = star.opacity;
      ctx.fillRect(star.x, star.y, star.size * .75, Math.max(star.size, star.speed * 2.4));
      
      // Faire défiler les étoiles
      star.y += star.speed * frameScale;
      if (star.y > canvas.height) {
        star.y = 0;
        star.x = Math.random() * canvas.width;
      }
    }
    ctx.globalAlpha = 1;

    if (!comet && now >= nextCometAt) {
      comet = { x: canvas.width * (.12 + Math.random() * .76), y: -18, vx: (Math.random() - .5) * 2.2, vy: 5.5, life: 0 };
    }
    if (comet) {
      comet.life++;
      comet.x += comet.vx; comet.y += comet.vy;
      const tail = ctx.createLinearGradient(comet.x, comet.y - 38, comet.x, comet.y + 5);
      tail.addColorStop(0, "rgba(95,210,255,0)"); tail.addColorStop(1, "rgba(220,250,255,.95)");
      ctx.strokeStyle = tail; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(comet.x, comet.y - 38); ctx.lineTo(comet.x, comet.y + 5); ctx.stroke();
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(comet.x, comet.y, 2.5, 0, Math.PI * 2); ctx.fill();
      if (comet.y > canvas.height + 45 || comet.life > 100) {
        comet = null; nextCometAt = now + 3200 + Math.random() * 6500;
      }
    }
    
    // Grille subtile
    ctx.strokeStyle = COLORS_K2000.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    
    // Dessiner les ennemis
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      
      // Effet de glow
      ctx.shadowColor = enemy.color;
      ctx.shadowBlur = LOW_POWER_MODE ? 0 : 10;
      
      // Corps de l'ennemi
      ctx.fillStyle = enemy.color;
      ctx.beginPath();
      ctx.roundRect(enemy.x, enemy.y, enemy.width, enemy.height, 5);
      ctx.fill();
      
      // Détails selon le type
      if (enemy.type === "karr") {
        // KARR - design spécifique
        ctx.fillStyle = "#000000";
        ctx.fillRect(enemy.x + 5, enemy.y + 5, enemy.width - 10, 4);
        ctx.fillRect(enemy.x + 5, enemy.y + 12, enemy.width - 10, 4);
        
        // Phares
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(enemy.x + 3, enemy.y + 2, 4, 3);
        ctx.fillRect(enemy.x + enemy.width - 7, enemy.y + 2, 4, 3);
      } else if (enemy.type === "tank") {
        // Tank - design
        ctx.fillStyle = "#000000";
        ctx.fillRect(enemy.x + 8, enemy.y + 8, enemy.width - 16, 8);
        // Tourelle
        ctx.fillStyle = "#ffaa00";
        ctx.beginPath();
        ctx.arc(enemy.x + enemy.width / 2, enemy.y + 4, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.shadowBlur = 0;
    }
    
    // Dessiner le boss
    if (bossActive && boss) {
      ctx.shadowColor = boss.color;
      ctx.shadowBlur = LOW_POWER_MODE ? 0 : 15;
      
      // Corps du boss (Goliath)
      ctx.fillStyle = boss.color;
      ctx.beginPath();
      ctx.roundRect(boss.x, boss.y, boss.width, boss.height, 8);
      ctx.fill();
      
      // Détails du boss
      ctx.fillStyle = "#000000";
      ctx.fillRect(boss.x + 10, boss.y + 10, boss.width - 20, 6);
      ctx.fillRect(boss.x + 10, boss.y + 20, boss.width - 20, 6);
      
      // Barre de vie du boss
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(boss.x + 5, boss.y - 10, (boss.width - 10) * (boss.health / (100 + level * 20)), 4);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(boss.x + 5, boss.y - 10, boss.width - 10, 4);
      
      ctx.shadowBlur = 0;
    }
    
    // Dessiner les bullets
    ctx.fillStyle = COLORS_K2000.laser;
    for (const bullet of bullets) {
      ctx.beginPath();
      ctx.roundRect(bullet.x, bullet.y, bullet.width, bullet.height, 2);
      ctx.fill();
      
      // Effet de glow
      ctx.shadowColor = COLORS_K2000.laser;
      ctx.shadowBlur = LOW_POWER_MODE ? 0 : 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    
    // Dessiner les bullets ennemis
    for (const bullet of enemyBullets) {
      ctx.fillStyle = bullet.color;
      ctx.beginPath();
      ctx.roundRect(bullet.x, bullet.y, bullet.width, bullet.height, 2);
      ctx.fill();
    }

    for (const pickup of weaponPickups) {
      const pulse = 1 + Math.sin(now / 120 + pickup.phase) * .12;
      ctx.save(); ctx.translate(pickup.x, pickup.y); ctx.scale(pulse, pulse);
      ctx.shadowColor = "#ffd45a"; ctx.shadowBlur = LOW_POWER_MODE ? 0 : 14;
      ctx.fillStyle = "#30240a"; ctx.strokeStyle = "#ffd45a"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(-pickup.size / 2, -pickup.size / 2, pickup.size, pickup.size, 5); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = "#fff1a8"; ctx.font = "bold 15px monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText({weapon:"W",rapid:"R",shield:"S",bomb:"B",life:"♥"}[pickup.type]||"W", 0, 0);
      ctx.restore();
    }
    
    // Dessiner le joueur (KITT)
    // Dessiner le joueur : intercepteur SF Kyronext à quatre ailes.
    const shipX = player.x, shipY = player.y, shipW = player.width, shipH = player.height;
    const shipCX = shipX + shipW / 2;
    ctx.save();
    ctx.shadowColor = COLORS_K2000.kitt;
    ctx.shadowBlur = LOW_POWER_MODE ? 0 : 14;

    // Ailes supérieures / inférieures, silhouette de chasseur.
    ctx.fillStyle = "#8f9aa8";
    ctx.beginPath();
    ctx.moveTo(shipCX, shipY);
    ctx.lineTo(shipCX + 7, shipY + 8);
    ctx.lineTo(shipX + shipW - 2, shipY + 3);
    ctx.lineTo(shipCX + 14, shipY + 14);
    ctx.lineTo(shipX + shipW, shipY + shipH - 2);
    ctx.lineTo(shipCX + 7, shipY + shipH - 7);
    ctx.lineTo(shipCX, shipY + shipH);
    ctx.lineTo(shipCX - 7, shipY + shipH - 7);
    ctx.lineTo(shipX, shipY + shipH - 2);
    ctx.lineTo(shipCX - 14, shipY + 14);
    ctx.lineTo(shipX + 2, shipY + 3);
    ctx.lineTo(shipCX - 7, shipY + 8);
    ctx.closePath();
    ctx.fill();

    // Fuselage central rouge KITT.
    const fuselage = ctx.createLinearGradient(shipCX, shipY, shipCX, shipY + shipH);
    fuselage.addColorStop(0, "#f5f7ff");
    fuselage.addColorStop(.28, COLORS_K2000.kitt);
    fuselage.addColorStop(1, "#4b0710");
    ctx.fillStyle = fuselage;
    ctx.beginPath();
    ctx.moveTo(shipCX, shipY - 2);
    ctx.lineTo(shipCX + 7, shipY + 10);
    ctx.lineTo(shipCX + 5, shipY + shipH - 4);
    ctx.lineTo(shipCX, shipY + shipH + 2);
    ctx.lineTo(shipCX - 5, shipY + shipH - 4);
    ctx.lineTo(shipCX - 7, shipY + 10);
    ctx.closePath();
    ctx.fill();

    // Cockpit + scanner.
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#8fe8ff";
    ctx.beginPath();
    ctx.ellipse(shipCX, shipY + 10, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS_K2000.kitt;
    ctx.fillRect(shipCX - 10, shipY + 16, 20, 2);

    // Réacteurs.
    ctx.fillStyle = "#ffd27a";
    ctx.beginPath();
    ctx.arc(shipCX - 8, shipY + shipH - 1, 2.5, 0, Math.PI * 2);
    ctx.arc(shipCX + 8, shipY + shipH - 1, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();ctx.globalCompositeOperation="lighter";
    for(const ex of digitalExplosions){if(!paused&&!gameOver)ex.age+=frameScale/60;const a=Math.max(0,1-ex.age/.8),r=(8+ex.age*110)*ex.strength;ctx.globalAlpha=a;ctx.strokeStyle=ex.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(ex.x,ex.y,r,0,Math.PI*2);ctx.stroke();ctx.fillStyle=ex.color;for(const spark of ex.sparks){const d=spark.v*ex.age*ex.strength;ctx.fillRect(ex.x+Math.cos(spark.a)*d,ex.y+Math.sin(spark.a)*d,3,3)}ctx.fillStyle="#ffffff";ctx.beginPath();ctx.arc(ex.x,ex.y,Math.max(0,12*(1-ex.age*5))*ex.strength,0,Math.PI*2);ctx.fill();}digitalExplosions=digitalExplosions.filter(ex=>ex.age<.8);ctx.restore();
    if(now<shieldUntil){ctx.save();ctx.strokeStyle="#74f9ff";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(shipCX,shipY+14,38,30,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
    // HUD - Thème K2000
    ctx.fillStyle = "rgba(4, 5, 11, 0.90)";
    ctx.fillRect(11, 0, 430, 38);
    ctx.strokeStyle = COLORS_K2000.kitt;
    ctx.lineWidth = 2;
    ctx.strokeRect(13, 2, 426, 34);
    
    label("SCORE " + String(score).padStart(6, "0"), 24, 25, 16, COLORS_K2000.kitt);
    label("NIVEAU " + level, 190, 25, 16, COLORS_K2000.karr);
    label("VIES " + "●".repeat(Math.max(0, lives)), 330, 25, 16, COLORS_K2000.explosion);
    label("ARMES " + "◆".repeat(weaponLevel), 24, 58, 13, "#ffd45a");
    
    label("BOMBES [B] "+bombs+(now<rapidUntil?" · RAPIDE "+Math.ceil((rapidUntil-now)/1000)+"s":"")+(now<shieldUntil?" · BOUCLIER":""),170,58,12,"#74f9ff");
    // Message de pause/game over - Thème K2000
    if (paused || gameOver) {
      ctx.fillStyle = "rgba(4, 5, 11, 0.85)";
      ctx.fillRect(canvas.width / 2 - 200, canvas.height / 2 - 50, 400, 100);
      
      ctx.strokeStyle = won ? COLORS_K2000.explosion : gameOver ? COLORS_K2000.karr : COLORS_K2000.kitt;
      ctx.lineWidth = 2;
      ctx.strokeRect(canvas.width / 2 - 198, canvas.height / 2 - 48, 396, 96);
      
      label(won ? "SECTEUR 10 TERMINÉ — VICTOIRE !" : gameOver ? "GAME OVER — R POUR RECOMMENCER" : "PAUSE — P POUR CONTINUER", 
           canvas.width / 2 - 180, canvas.height / 2 + 10, 
           20, won ? COLORS_K2000.explosion : gameOver ? COLORS_K2000.karr : COLORS_K2000.kitt);
    }
    
    // Soumission du score
    if (gameOver && !scoreSubmitted) {
      scoreSubmitted = true;
      setTimeout(() => submitScore("spaceinvaders", score), 350);
    }
    
    // Déplacer les bullets
    for (const bullet of bullets) {
      if(!paused&&!gameOver){bullet.y-=bullet.speed*frameScale;bullet.x+=(bullet.dx||0)*frameScale;}
    }
    for (const bullet of enemyBullets) {
      if(!paused&&!gameOver)bullet.y+=bullet.speed*frameScale;
    }
    
    // Déplacer les ennemis et vérifier collisions
    if (!paused && !gameOver) {
      for (let i = weaponPickups.length - 1; i >= 0; i--) {
        const pickup = weaponPickups[i];
        pickup.y += pickup.speed * frameScale;
        pickup.x += Math.sin(now / 180 + pickup.phase) * .35;
        const left = pickup.x - pickup.size / 2;
        const top = pickup.y - pickup.size / 2;
        if (left < player.x + player.width && left + pickup.size > player.x &&
            top < player.y + player.height && top + pickup.size > player.y) {
          if(pickup.type==="shield")shieldUntil=now+8000;
          else if(pickup.type==="rapid")rapidUntil=now+10000;
          else if(pickup.type==="bomb")bombs=Math.min(3,bombs+1);
          else if(pickup.type==="life")lives=Math.min(6,lives+1);
          else if(weaponLevel<3)weaponLevel++;else score+=250;
          explode(pickup.x,pickup.y,"#74f9ff",.5);
          beep(1040, .12, "triangle");
          weaponPickups.splice(i, 1);
        } else if (top > canvas.height + pickup.size) weaponPickups.splice(i, 1);
      }
      moveEnemies();
      moveBoss();
      checkCollisions();
      enemyShoot();
    }
  };
  
  // Reset du jeu
  reset();
  startGame("space-invaders", "Flèches/Souris : déplacer • Clic/Espace : tirer • B : bombe • W/R/S/B/♥ : bonus • P : pause • R : recommencer • Échap : sortir", onKey, draw, reset);
  title.textContent = "SPACE INVADERS";
  
  // Télémétrie locale du jeu
  activeGame.getState = () => ({
    game: "spaceinvaders",
    player: { x: player.x, y: player.y, width: player.width, height: player.height },
    enemies: enemies.map(e => ({ x: e.x, y: e.y, width: e.width, height: e.height, alive: e.alive, type: e.type })),
    boss: bossActive && boss ? { x: boss.x, y: boss.y, health: boss.health } : null,
    bullets: bullets.map(b => ({ x: b.x, y: b.y })),
    pickups: weaponPickups.map(p => ({ x: p.x, y: p.y, type:p.type })),
    weaponLevel, bombs, shield:Math.max(0,shieldUntil-performance.now()),rapid:Math.max(0,rapidUntil-performance.now()),explosions:digitalExplosions.length,combo, score, lives, level,
    status: won ? "VICTOIRE" : gameOver ? "DÉFAITE" : paused ? "PAUSE" : bossActive ? "BOSS" : "EN COURS"
  });
}

// ============================================================================
// JEU 2 : TRON LIGHT CYCLES VERSION K2000
// ============================================================================

function tron() {
  renderScores("tron");
  
  // Configuration du jeu
  const GRID_SIZE = 20;
  const CELL_SIZE = 25;
  const PLAYER_1_COLOR = "#ff2a3a"; // KITT - Rouge
  const PLAYER_2_COLOR = "#00a2ff"; // KARR - Bleu
  const TRAIL_COLOR_1 = "rgba(255, 42, 58, 0.7)";
  const TRAIL_COLOR_2 = "rgba(0, 162, 255, 0.7)";
  const GRID_COLOR = "#1a1208";
  const BACKGROUND_COLOR = "#040506";
  
  let player1 = {
    x: Math.floor(canvas.width / CELL_SIZE / 4),
    y: Math.floor(canvas.height / CELL_SIZE / 2),
    direction: { x: 0, y: -1 },
    nextDirection: { x: 0, y: -1 },
    color: PLAYER_1_COLOR,
    trailColor: TRAIL_COLOR_1,
    alive: true
  };
  
  let player2 = {
    x: Math.floor(canvas.width / CELL_SIZE * 3 / 4),
    y: Math.floor(canvas.height / CELL_SIZE / 2),
    direction: { x: 0, y: 1 },
    nextDirection: { x: 0, y: 1 },
    color: PLAYER_2_COLOR,
    trailColor: TRAIL_COLOR_2,
    alive: true
  };
  
  let grid = [];
  let score1 = 0;
  let score2 = 0;
  let paused = false;
  let gameOver = false;
  let winner = null;
  let scoreSubmitted = false;
  let lastMoveTime = 0;
  let aiVisited=null,aiQueue=null,aiVisitId=0;
  let tronLevel = 0;
  let tronActiveMs = 0;
  let lastLevelTickAt = 0;
  // Départ volontairement lent, puis accélération modérée jusqu'au niveau 10.
  let moveInterval = 360;
  const TRON_LEVEL_DURATION_MS = 8000;
  const TRON_START_INTERVAL_MS = 360;
  const TRON_END_INTERVAL_MS = 220;
  let spawnGraceUntil = performance.now() + 900;
  let particles = [];
  
  // Initialisation de la grille
  function initGrid() {
    const cols = Math.floor(canvas.width / CELL_SIZE);
    const rows = Math.floor(canvas.height / CELL_SIZE);
    
    grid = [];
    for (let y = 0; y < rows; y++) {
      grid[y] = [];
      for (let x = 0; x < cols; x++) {
        grid[y][x] = null;
      }
    }
    
    // Placer les joueurs
    grid[player1.y][player1.x] = 1;
    grid[player2.y][player2.x] = 2;
  }
  
  // Réinitialisation du jeu
  function reset() {
    player1 = {
      x: Math.floor(canvas.width / CELL_SIZE / 4),
      y: Math.floor(canvas.height / CELL_SIZE / 2),
      direction: { x: 0, y: -1 },
      nextDirection: { x: 0, y: -1 },
      color: PLAYER_1_COLOR,
      trailColor: TRAIL_COLOR_1,
      alive: true
    };
    
    player2 = {
      x: Math.floor(canvas.width / CELL_SIZE * 3 / 4),
      y: Math.floor(canvas.height / CELL_SIZE / 2),
      direction: { x: 0, y: 1 },
      nextDirection: { x: 0, y: 1 },
      color: PLAYER_2_COLOR,
      trailColor: TRAIL_COLOR_2,
      alive: true
    };
    
    score1 = 0;
    score2 = 0;
    paused = false;
    gameOver = false;
    winner = null;
    scoreSubmitted = false;
    particles = [];
    tronLevel = 0;
    tronActiveMs = 0;
    lastLevelTickAt = 0;
    moveInterval = TRON_START_INTERVAL_MS;
    arcade.dataset.tronLevel = "0";
    arcade.dataset.tronMoveInterval = String(moveInterval);
    spawnGraceUntil = performance.now() + 900;
    lastMoveTime = performance.now();
    
    initGrid();
    setLevelMusic("tron", 1);
  }
  
  // Vérification des collisions
  function checkCollision(player) {
    const newX = player.x + player.direction.x;
    const newY = player.y + player.direction.y;
    
    // Vérifier les limites
    if (newX < 0 || newX >= grid[0].length || newY < 0 || newY >= grid.length) {
      return true;
    }
    
    // Vérifier les trails
    if (grid[newY][newX] !== null) {
      return true;
    }
    
    return false;
  }

  // KARR roule en pilote automatique jusqu'à ce que quelqu'un prenne les WASD.
  // Il choisit une bifurcation avant le bord ou une traînée, au lieu de foncer
  // tout droit jusqu'à sa collision inévitable.
  function steerPlayer2Ai() {
    if (!player2.alive) return;
    const forward = player2.direction;
    const right = { x: -forward.y, y: forward.x };
    const left = { x: forward.y, y: -forward.x };
    const reverse = { x: -forward.x, y: -forward.y };

    const freeAhead = (direction) => {
      const nx=player2.x+direction.x, ny=player2.y+direction.y;
      return ny>=0 && ny<grid.length && nx>=0 && nx<grid[0].length && grid[ny][nx]===null;
    };
    const corridor = (direction) => {
      let x=player2.x,y=player2.y,d=0;
      while (d<18) {
        x+=direction.x; y+=direction.y;
        if (y<0 || y>=grid.length || x<0 || x>=grid[0].length || grid[y][x]!==null) break;
        d++;
      }
      return d;
    };
    const areaScore = (direction) => {
      if(!freeAhead(direction))return -9999;
      const width=grid[0].length,size=grid.length*width;
      if(!aiVisited||aiVisited.length!==size){aiVisited=new Uint32Array(size);aiQueue=new Int32Array(size)}
      if(++aiVisitId>=4294967295){aiVisited.fill(0);aiVisitId=1}
      const sx=player2.x+direction.x,sy=player2.y+direction.y;
      let head=0,tail=0,score=0;
      aiQueue[tail++]=sy*width+sx;aiVisited[sy*width+sx]=aiVisitId;
      while(head<tail&&score<180){
        const cell=aiQueue[head++],x=cell%width,y=Math.floor(cell/width);score++;
        for(const d of DIRECTIONS){
          const nx=x+d.x,ny=y+d.y,index=ny*width+nx;
          if(ny<0||ny>=grid.length||nx<0||nx>=width||grid[ny][nx]!==null||aiVisited[index]===aiVisitId)continue;
          aiVisited[index]=aiVisitId;aiQueue[tail++]=index;
        }
      }
      const playerDistance=Math.abs(sx-player1.x)+Math.abs(sy-player1.y);
      return score*1.5+corridor(direction)*4+Math.min(playerDistance,12)*.35;
    };

    const choices=[forward,right,left]
      .filter(d=>!(d.x===reverse.x && d.y===reverse.y))
      .map((direction,order)=>({direction,order,score:areaScore(direction)}))
      .filter(c=>c.score>-9000)
      .sort((a,b)=>b.score-a.score || a.order-b.order);

    if (!choices.length) return;
    const mustTurn = corridor(forward) <= 2;
    const tacticalTurn = Math.random() < (0.08 + tronLevel * .012);
    if (mustTurn || tacticalTurn || choices[0].score > (choices.find(c=>c.order===0)?.score??-9999)+12) {
      const before=player2.nextDirection;
      player2.nextDirection=choices[0].direction;
      if (before.x!==player2.nextDirection.x || before.y!==player2.nextDirection.y) playSample("tron_turn", .24);
    }
  }
  
  // Déplacement des joueurs
  function movePlayers() {
    const now = performance.now();
    if (now < spawnGraceUntil) return;
    if (!lastLevelTickAt) lastLevelTickAt = now;
    tronActiveMs += Math.max(0, now - lastLevelTickAt);
    lastLevelTickAt = now;
    const nextLevel = Math.min(10, Math.floor(tronActiveMs / TRON_LEVEL_DURATION_MS));
    if (nextLevel !== tronLevel) {
      tronLevel = nextLevel;
      moveInterval = Math.round(TRON_START_INTERVAL_MS - (TRON_START_INTERVAL_MS - TRON_END_INTERVAL_MS) * tronLevel / 10);
      arcade.dataset.tronLevel = String(tronLevel);
      arcade.dataset.tronMoveInterval = String(moveInterval);
    }
    if (now - lastMoveTime < moveInterval) return;
    lastMoveTime = now;
    
    // Mettre à jour la direction
    player1.direction = { ...player1.nextDirection };
    steerPlayer2Ai();
    player2.direction = { ...player2.nextDirection };
    
    const next1 = { x:player1.x+player1.direction.x, y:player1.y+player1.direction.y };
    const next2 = { x:player2.x+player2.direction.x, y:player2.y+player2.direction.y };
    const headOn = player1.alive && player2.alive && next1.x===next2.x && next1.y===next2.y;
    const collision1 = checkCollision(player1) || headOn;
    const collision2 = checkCollision(player2) || headOn;
    // Déplacer le joueur 1
    if (player1.alive && !collision1) {
      player1.x += player1.direction.x;
      player1.y += player1.direction.y;
      grid[player1.y][player1.x] = 1;
      score1 += 1 + tronLevel;

      // Particules décoratives uniquement hors mode Nano.
      if (!LOW_POWER_MODE) particles.push({
        x: player1.x * CELL_SIZE + CELL_SIZE / 2,
        y: player1.y * CELL_SIZE + CELL_SIZE / 2,
        color: PLAYER_1_COLOR,
        size: 3,
        life: 30
      });
    } else if (player1.alive) {
      player1.alive = false;
      gameOver = true;
      winner = "KARR";
      beep(220, 0.3, "sawtooth");
    }
    
    // Déplacer le joueur 2
    if (player2.alive && !collision2) {
      player2.x += player2.direction.x;
      player2.y += player2.direction.y;
      grid[player2.y][player2.x] = 2;
      score2 += 1 + tronLevel;

      // Particules décoratives uniquement hors mode Nano.
      if (!LOW_POWER_MODE) particles.push({
        x: player2.x * CELL_SIZE + CELL_SIZE / 2,
        y: player2.y * CELL_SIZE + CELL_SIZE / 2,
        color: PLAYER_2_COLOR,
        size: 3,
        life: 30
      });
    } else if (player2.alive) {
      player2.alive = false;
      gameOver = true;
      winner = "KITT";
      beep(440, 0.3, "sawtooth");
    }
    
    // Vérifier si les deux joueurs sont morts (match nul)
    if (!player1.alive && !player2.alive) {
      gameOver = true;
      winner = "ÉGALITÉ";
    }
  }
  
  // Gestion des entrées clavier
  const onKey = (event) => {
    if (!activeGame || activeGame.name !== "tron") return;
    
    if (event.key === "p" || event.key === "P") {
      paused = !paused;
      lastLevelTickAt = performance.now();
      beep(paused ? 220 : 440, 0.08);
      return;
    }
    
    if (event.key === "r" || event.key === "R") {
      reset();
      beep(660, 0.08);
      return;
    }
    
    if (gameOver) {
      if (event.key === "r" || event.key === "R") {
        reset();
        beep(660, 0.08);
      }
      return;
    }
    
    if (paused) return;
    
    // Contrôles Joueur 1 (KITT - Flèches)
    if (player1.alive) {
      const direction = { ArrowUp:{x:0,y:-1}, ArrowDown:{x:0,y:1}, ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0} }[event.key];
      if (direction && !(direction.x===-player1.direction.x && direction.y===-player1.direction.y)) {
        player1.nextDirection = direction;
      }
    }
    
  };
  
  // Dessin du jeu
  const draw = (now) => {
    // Fond
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Grille
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    
    const cols = grid[0] ? grid[0].length : 0;
    const rows = grid.length;
    
    for (let x = 0; x < cols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL_SIZE, 0);
      ctx.lineTo(x * CELL_SIZE, rows * CELL_SIZE);
      ctx.stroke();
    }
    
    for (let y = 0; y < rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL_SIZE);
      ctx.lineTo(cols * CELL_SIZE, y * CELL_SIZE);
      ctx.stroke();
    }
    
    // Dessiner les trails
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const trail = grid[y][x] === 1 ? TRAIL_COLOR_1 : grid[y][x] === 2 ? TRAIL_COLOR_2 : null;
        if (trail) {
          const tx = x * CELL_SIZE + 4, ty = y * CELL_SIZE + 8;
          ctx.save();
          ctx.shadowColor = trail;
          ctx.shadowBlur = LOW_POWER_MODE ? 0 : 7;
          ctx.fillStyle = trail;
          ctx.beginPath();
          ctx.roundRect(tx, ty, CELL_SIZE - 8, CELL_SIZE - 16, 5);
          ctx.fill();
          ctx.globalAlpha = .65;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(tx + 3, ty + 2, Math.max(2, CELL_SIZE - 14), 1.5);
          ctx.restore();
        }
      }
    }
    
    // Dessiner les particules
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      
      p.life--;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
    
    // Dessiner les joueurs
    const drawLightCycle = (p, color) => {
      if (!p.alive) return;
      const cx = p.x * CELL_SIZE + CELL_SIZE / 2;
      const cy = p.y * CELL_SIZE + CELL_SIZE / 2;
      const angle = Math.atan2(p.direction.y, p.direction.x);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.shadowColor = color;
      ctx.shadowBlur = LOW_POWER_MODE ? 0 : 12;

      // Roues/anneaux d'énergie.
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(-7, 0, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(7, 0, 5, 0, Math.PI * 2); ctx.stroke();

      // Carénage profilé.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(4, -6);
      ctx.lineTo(-8, -5);
      ctx.lineTo(-12, 0);
      ctx.lineTo(-6, 5);
      ctx.lineTo(5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#10131a";
      ctx.beginPath();
      ctx.ellipse(1, -1, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#dff8ff";
      ctx.fillRect(6, -1, 5, 2);
      ctx.restore();
    };

    drawLightCycle(player1, PLAYER_1_COLOR);
    drawLightCycle(player2, PLAYER_2_COLOR);
    
    // HUD - Thème K2000
    ctx.fillStyle = "rgba(4, 5, 11, 0.90)";
    ctx.fillRect(11, 0, canvas.width - 22, 36);
    ctx.strokeStyle = PLAYER_1_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(13, 2, canvas.width - 26, 32);
    
    label(`KITT (Flèches) - Score: ${score1}`, 24, 24, 14, PLAYER_1_COLOR);
    label(`KARR (IA) - Score: ${score2}`, canvas.width - 200, 24, 14, PLAYER_2_COLOR);
    label(`NIVEAU ${tronLevel}/10 · ${moveInterval} ms`, canvas.width / 2 - 68, 24, 12, "#d9efff");
    
    // Message de pause/game over - Thème K2000
    if (paused || gameOver) {
      ctx.fillStyle = "rgba(4, 5, 11, 0.85)";
      ctx.fillRect(canvas.width / 2 - 200, canvas.height / 2 - 50, 400, 100);
      
      ctx.strokeStyle = gameOver ? (winner === "KITT" ? PLAYER_1_COLOR : winner === "KARR" ? PLAYER_2_COLOR : "#ffffff") : PLAYER_1_COLOR;
      ctx.lineWidth = 2;
      ctx.strokeRect(canvas.width / 2 - 198, canvas.height / 2 - 48, 396, 96);
      
      if (gameOver) {
        label(winner === "ÉGALITÉ" ? "MATCH NUL" : `VICTOIRE : ${winner}`, 
             canvas.width / 2 - 100, canvas.height / 2 - 10, 
             24, winner === "KITT" ? PLAYER_1_COLOR : winner === "KARR" ? PLAYER_2_COLOR : "#ffffff");
        label("R POUR RECOMMENCER", canvas.width / 2 - 80, canvas.height / 2 + 20, 16, "#ffffff");
      } else {
        label("PAUSE — P POUR CONTINUER", canvas.width / 2 - 120, canvas.height / 2 + 10, 20, PLAYER_1_COLOR);
      }
    }
    
    // Soumission du score
    if (gameOver && !scoreSubmitted) {
      scoreSubmitted = true;
      const finalScore = winner === "KITT" ? score1 : winner === "KARR" ? score2 : Math.max(score1, score2);
      setTimeout(() => submitScore("tron", finalScore), 350);
    }
    
    // Déplacer les joueurs
    if (!paused && !gameOver) {
      movePlayers();
    }
  };
  
  // Reset du jeu
  reset();
  startGame("tron", "KITT : flèches (sans demi-tour) • KARR : adversaire IA • P : pause • R : recommencer • Échap : sortir", onKey, draw, reset);
  
  // Télémétrie locale du jeu
  activeGame.getState = () => ({
    game: "tron", solo:true,
    player1: { x: player1.x, y: player1.y, direction: player1.direction, alive: player1.alive },
    player2: { x: player2.x, y: player2.y, direction: player2.direction, alive: player2.alive },
    grid: grid.map(row => row.slice()),
    score1, score2, level: tronLevel, moveInterval,
    status: gameOver ? (winner || "ÉGALITÉ") : paused ? "PAUSE" : "EN COURS"
  });
}
})();
