/**
 * Knight Rider: KITT Adventure - Game Engine
 * Version 2.0 - Avec sprites, animations et effets modernes
 */

// ============================================
// CONSTANTES ET CONFIGURATION
// ============================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const particleCanvas = document.getElementById('particleCanvas');
const particleCtx = particleCanvas.getContext('2d');
const loadingScreen = document.getElementById('loadingScreen');
const loadingProgress = document.getElementById('loadingProgress');
const loadingTip = document.getElementById('loadingTip');

// Taille du canvas
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Ajustement pour les écrans
function resizeCanvas() {
  const container = document.querySelector('.canvas-container');
  if (container) {
    const width = Math.min(container.clientWidth - 40, CANVAS_WIDTH);
    const height = Math.min(container.clientHeight - 40, CANVAS_HEIGHT);
    canvas.width = width;
    canvas.height = height;
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
  } else {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    particleCanvas.width = CANVAS_WIDTH;
    particleCanvas.height = CANVAS_HEIGHT;
  }
}

// Appel initial
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ============================================
// ÉTAT DU JEU
// ============================================

const gameState = {
  score: 0,
  lives: 3,
  level: 1,
  gameOver: false,
  paused: false,
  levelUp: false,
  enemiesDodged: 0,
  speedMultiplier: 1,
  lastEnemySpawn: 0,
  lastBonusSpawn: 0,
  enemySpawnRate: 120,
  bonusSpawnRate: 300,
  particles: [],
  settings: {
    musicVolume: 20,
    soundVolume: 30,
    quality: 'medium',
    effectsEnabled: true
  }
};

// ============================================
// KITT (Le héros)
// ============================================

const kitt = {
  x: canvas.width / 2,
  y: canvas.height - 100,
  width: 40,
  height: 80,
  speed: 0,
  maxSpeed: 6,
  acceleration: 0.25,
  deceleration: 0.15,
  turbo: false,
  shield: false,
  invincible: false,
  turboTimer: 0,
  shieldTimer: 0,
  turboCooldown: 0,
  shieldCooldown: 0,
  sprite: null,
  animationFrame: 0,
  animationSpeed: 0.1
};

// ============================================
// SPRITE LOADER
// ============================================

// Sprites en Data URL (solution de secours si les images ne sont pas disponibles)
const spriteData = {
  kitt: {
    data: null,
    width: 40,
    height: 80
  },
  enemy1: {
    data: null,
    width: 30,
    height: 60
  },
  enemy2: {
    data: null,
    width: 40,
    height: 70
  },
  enemy3: {
    data: null,
    width: 35,
    height: 65
  },
  turbo: {
    data: null,
    width: 30,
    height: 30
  },
  shield: {
    data: null,
    width: 30,
    height: 30
  },
  life: {
    data: null,
    width: 30,
    height: 30
  }
};

// Charger les sprites depuis les fichiers
function loadSprites() {
  const spritePaths = {
    kitt: 'assets/sprites/kitt.png',
    enemy1: 'assets/sprites/enemy1.png',
    enemy2: 'assets/sprites/enemy2.png',
    enemy3: 'assets/sprites/enemy3.png',
    turbo: 'assets/sprites/turbo.png',
    shield: 'assets/sprites/shield.png',
    life: 'assets/sprites/life.png'
  };

  let loadedCount = 0;
  const totalSprites = Object.keys(spritePaths).length;

  // Mise à jour de la barre de chargement
  function updateLoading(progress) {
    loadingProgress.style.width = `${progress}%`;
    
    const tips = [
      "Préparez-vous pour l'aventure !",
      "KITT est prêt à rouler...",
      "Les années 80 vous attendent !",
      "Turbo Boost engagé !",
      "Activation du bouclier molecular...",
      "Initialisation des systèmes...",
      "Chargement des cartes...",
      "Prêt à défier Goliath ?"
    ];
    loadingTip.textContent = tips[Math.floor(Math.random() * tips.length)];
  }

  // Charger chaque sprite
  Object.entries(spritePaths).forEach(([name, path]) => {
    const img = new Image();
    img.onload = () => {
      spriteData[name].data = img;
      loadedCount++;
      const progress = Math.round((loadedCount / totalSprites) * 100);
      updateLoading(progress);
      
      if (loadedCount === totalSprites) {
        // Tous les sprites sont chargés
        setTimeout(() => {
          loadingScreen.classList.add('hidden');
          initGame();
        }, 500);
      }
    };
    img.onerror = () => {
      console.log(`Sprite non trouvé: ${path}, utilisation du fallback`);
      loadedCount++;
      const progress = Math.round((loadedCount / totalSprites) * 100);
      updateLoading(progress);
      
      if (loadedCount === totalSprites) {
        setTimeout(() => {
          loadingScreen.classList.add('hidden');
          initGame();
        }, 500);
      }
    };
    img.src = path;
  });
}

// ============================================
// ENNEMIS
// ============================================

const ENEMY_TYPES = [
  {
    name: 'Voiture Normale',
    width: 30,
    height: 60,
    speed: 2,
    points: 10,
    color: '#555555',
    sprite: null,
    probability: 0.7
  },
  {
    name: 'Camion',
    width: 40,
    height: 70,
    speed: 1.5,
    points: 20,
    color: '#333333',
    sprite: null,
    probability: 0.2
  },
  {
    name: 'Goliath',
    width: 35,
    height: 65,
    speed: 2.5,
    points: 30,
    color: '#8B0000',
    sprite: null,
    probability: 0.1
  }
];

let enemies = [];

// ============================================
// BONUS
// ============================================

const BONUS_TYPES = [
  {
    type: 'turbo',
    color: '#ff4500',
    sprite: null,
    effect: () => {
      if (kitt.turboCooldown <= 0) {
        kitt.turbo = true;
        kitt.turboTimer = 120;
        kitt.turboCooldown = 600;
        playSound('turboSound');
        updatePowerStatus();
        createParticleEffect(kitt.x, kitt.y, '#ff4500', 20);
      }
    }
  },
  {
    type: 'shield',
    color: '#00bfff',
    sprite: null,
    effect: () => {
      if (kitt.shieldCooldown <= 0) {
        kitt.shield = true;
        kitt.invincible = true;
        kitt.shieldTimer = 300;
        kitt.shieldCooldown = 900;
        playSound('shieldSound');
        updatePowerStatus();
        createParticleEffect(kitt.x, kitt.y, '#00bfff', 20);
      }
    }
  },
  {
    type: 'life',
    color: '#ff1493',
    sprite: null,
    effect: () => {
      if (gameState.lives < 3) {
        gameState.lives++;
        document.getElementById('lives').textContent = gameState.lives;
        playSound('lifeSound');
        createParticleEffect(kitt.x, kitt.y, '#ff1493', 15);
      }
    }
  }
];

let bonuses = [];

// ============================================
// PARTICULES
// ============================================

class Particle {
  constructor(x, y, color, size, velocity, lifetime) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.size = size || Math.random() * 3 + 1;
    this.velocity = velocity || {
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2 - 1
    };
    this.lifetime = lifetime || Math.random() * 60 + 30;
    this.age = 0;
    this.gravity = 0.01;
    this.opacity = 1;
  }

  update() {
    this.x += this.velocity.x;
    this.y += this.velocity.y;
    this.velocity.y += this.gravity;
    this.age++;
    this.opacity = 1 - (this.age / this.lifetime);
    
    return this.age >= this.lifetime;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function createParticleEffect(x, y, color, count) {
  if (!gameState.settings.effectsEnabled) return;
  
  for (let i = 0; i < count; i++) {
    gameState.particles.push(new Particle(
      x, y, color,
      Math.random() * 4 + 2,
      {
        x: (Math.random() - 0.5) * 4,
        y: (Math.random() - 0.5) * 4 - 1
      },
      Math.random() * 40 + 20
    ));
  }
}

function updateParticles() {
  for (let i = gameState.particles.length - 1; i >= 0; i--) {
    if (gameState.particles[i].update()) {
      gameState.particles.splice(i, 1);
    }
  }
}

function drawParticles() {
  gameState.particles.forEach(particle => {
    particle.draw(particleCtx);
  });
}

// ============================================
// GESTION DES TOUCHES
// ============================================

const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
  Space: false,
  KeyT: false,
  Escape: false
};

window.addEventListener('keydown', (e) => {
  if (gameState.gameOver) {
    if (e.code === 'Space') {
      resetGame();
    }
    return;
  }

  if (gameState.paused && e.code === 'Escape') {
    resumeGame();
    return;
  }

  if (!gameState.paused) {
    switch (e.code) {
      case 'ArrowUp': keys.ArrowUp = true; break;
      case 'ArrowDown': keys.ArrowDown = true; break;
      case 'ArrowLeft': keys.ArrowLeft = true; break;
      case 'ArrowRight': keys.ArrowRight = true; break;
      case 'Space':
        keys.Space = true;
        if (!kitt.turbo && kitt.turboCooldown <= 0) {
          BONUS_TYPES[0].effect();
        }
        break;
      case 'KeyT':
        keys.KeyT = true;
        if (!kitt.shield && kitt.shieldCooldown <= 0) {
          BONUS_TYPES[1].effect();
        }
        break;
      case 'Escape':
        pauseGame();
        break;
    }
  }
});

window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'ArrowUp': keys.ArrowUp = false; break;
    case 'ArrowDown': keys.ArrowDown = false; break;
    case 'ArrowLeft': keys.ArrowLeft = false; break;
    case 'ArrowRight': keys.ArrowRight = false; break;
    case 'Space': keys.Space = false; break;
    case 'KeyT': keys.KeyT = false; break;
    case 'Escape': keys.Escape = false; break;
  }
});

// ============================================
// GESTION DES SONS
// ============================================

const soundElements = {
  engine: document.getElementById('engineSound'),
  turbo: document.getElementById('turboSound'),
  shield: document.getElementById('shieldSound'),
  explosion: document.getElementById('explosionSound'),
  theme: document.getElementById('themeMusic'),
  levelUp: document.getElementById('levelUpSound')
};

let soundsMuted = false;

function playSound(name) {
  if (soundsMuted) return;
  
  const sound = soundElements[name];
  if (sound) {
    const volume = name === 'theme' ? gameState.settings.musicVolume / 100 : gameState.settings.soundVolume / 100;
    sound.volume = volume;
    sound.currentTime = 0;
    sound.play().catch(e => console.log(`Erreur de lecture du son ${name}:`, e));
  }
}

function toggleSound() {
  soundsMuted = !soundsMuted;
  const soundBtn = document.getElementById('soundBtn');
  
  if (soundsMuted) {
    soundBtn.classList.add('muted');
    Object.values(soundElements).forEach(sound => sound.pause());
  } else {
    soundBtn.classList.remove('muted');
    if (!gameState.paused) {
      soundElements.engine.play().catch(() => {});
      soundElements.theme.play().catch(() => {});
    }
  }
}

function updateSoundVolumes() {
  if (soundsMuted) return;
  
  soundElements.engine.volume = gameState.settings.soundVolume / 100;
  soundElements.theme.volume = gameState.settings.musicVolume / 100;
}

// ============================================
// FONCTIONS DE DESSIN
// ============================================

// Dessiner KITT (avec sprite ou forme géométrique)
function drawKITT() {
  ctx.save();
  
  // Position et rotation
  ctx.translate(kitt.x, kitt.y);
  
  // Rotation légère selon le mouvement
  const rotationAngle = kitt.speed * 0.05 * (keys.ArrowLeft ? -1 : keys.ArrowRight ? 1 : 0);
  ctx.rotate(rotationAngle);
  
  // Utiliser le sprite si disponible
  if (kitt.sprite) {
    ctx.drawImage(
      kitt.sprite,
      -kitt.width / 2,
      -kitt.height / 2,
      kitt.width,
      kitt.height
    );
  } else {
    // Dessin géométrique de KITT (fallback)
    drawKITTGeometry();
  }
  
  // Effet de bouclier
  if (kitt.shield) {
    ctx.strokeStyle = 'rgba(0, 191, 255, 0.5)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(-kitt.width / 2 - 8, -kitt.height / 2 - 8, kitt.width + 16, kitt.height + 16, 8);
    ctx.stroke();
    
    // Animation de pulsation
    if (Math.floor(Date.now() / 200) % 2 === 0) {
      ctx.strokeStyle = 'rgba(0, 191, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-kitt.width / 2 - 12, -kitt.height / 2 - 12, kitt.width + 24, kitt.height + 24, 12);
      ctx.stroke();
    }
  }
  
  // Effet de turbo
  if (kitt.turbo) {
    ctx.fillStyle = 'rgba(255, 100, 0, 0.6)';
    ctx.beginPath();
    ctx.moveTo(-kitt.width / 2 - 15, kitt.height / 2 - 5);
    ctx.lineTo(-kitt.width / 2 - 20, kitt.height / 2 + 5);
    ctx.lineTo(-kitt.width / 2 - 15, kitt.height / 2 + 10);
    ctx.closePath();
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(kitt.width / 2 + 15, kitt.height / 2 - 5);
    ctx.lineTo(kitt.width / 2 + 20, kitt.height / 2 + 5);
    ctx.lineTo(kitt.width / 2 + 15, kitt.height / 2 + 10);
    ctx.closePath();
    ctx.fill();
  }
  
  ctx.restore();
}

// Dessin de KITT en géométrique (fallback)
function drawKITTGeometry() {
  // Corps de la voiture
  ctx.fillStyle = '#050505';
  ctx.fillRect(-kitt.width / 2, -kitt.height / 2, kitt.width, kitt.height);

  // Toit
  ctx.fillStyle = '#111111';
  ctx.fillRect(-kitt.width / 2 + 5, -kitt.height / 2 + 10, kitt.width - 10, 20);

  // Vitres
  ctx.fillStyle = '#225588';
  ctx.fillRect(-kitt.width / 2 + 8, -kitt.height / 2 + 15, 10, 10);
  ctx.fillRect(kitt.width / 2 - 18, -kitt.height / 2 + 15, 10, 10);

  // Bande rouge (LED de KITT)
  if (kitt.shield && Math.floor(Date.now() / 200) % 2 === 0) {
    ctx.fillStyle = '#00bfff';
    ctx.fillRect(-kitt.width / 2, -kitt.height / 2, kitt.width, 5);
  } else {
    ctx.fillStyle = '#ff0000';
    const bandWidth = kitt.turbo ? kitt.width : kitt.width * 0.3;
    ctx.fillRect(-bandWidth / 2, -kitt.height / 2, bandWidth, 5);
  }

  // Phares avant
  ctx.fillStyle = '#ffff00';
  ctx.fillRect(-kitt.width / 2 + 5, -kitt.height / 2 + 5, 5, 5);
  ctx.fillRect(kitt.width / 2 - 10, -kitt.height / 2 + 5, 5, 5);

  // Phares arrière
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(-kitt.width / 2 + 5, kitt.height / 2 - 15, 5, 5);
  ctx.fillRect(kitt.width / 2 - 10, kitt.height / 2 - 15, 5, 5);
}

// Dessiner les ennemis
function drawEnemies() {
  enemies.forEach(enemy => {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    
    // Utiliser le sprite si disponible
    if (enemy.sprite) {
      ctx.drawImage(
        enemy.sprite,
        -enemy.width / 2,
        -enemy.height / 2,
        enemy.width,
        enemy.height
      );
    } else {
      // Dessin géométrique
      ctx.fillStyle = enemy.color;
      ctx.fillRect(-enemy.width / 2, -enemy.height / 2, enemy.width, enemy.height);
      
      ctx.fillStyle = darkenColor(enemy.color, 20);
      ctx.fillRect(-enemy.width / 2 + 5, -enemy.height / 2 + 10, enemy.width - 10, 20);
      
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(-enemy.width / 2 + 5, -enemy.height / 2 + 5, 5, 5);
      ctx.fillRect(enemy.width / 2 - 10, -enemy.height / 2 + 5, 5, 5);
    }
    
    ctx.restore();
  });
}

// Dessiner les bonus
function drawBonuses() {
  bonuses.forEach(bonus => {
    ctx.save();
    ctx.translate(bonus.x, bonus.y);
    
    // Utiliser le sprite si disponible
    if (bonus.sprite) {
      ctx.drawImage(
        bonus.sprite,
        -bonus.radius,
        -bonus.radius,
        bonus.radius * 2,
        bonus.radius * 2
      );
    } else {
      // Dessin géométrique
      ctx.fillStyle = bonus.color;
      ctx.beginPath();
      ctx.arc(0, 0, bonus.radius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, bonus.radius, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = `${bonus.radius}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bonus.symbol, 0, 0);
    }
    
    ctx.restore();
  });
}

// ============================================
// ROUTE
// ============================================

const ROAD_WIDTH = canvas.width * 0.7;
const ROAD_COLOR = '#1a1a1a';
const ROAD_MARKINGS_COLOR = '#444444';
const ROAD_EDGE_COLOR = '#2a2a2a';

// Générer la route dynamiquement
function generateRoad() {
  const roadContainer = document.getElementById('roadContainer');
  if (!roadContainer) return;
  
  // Clear existing road
  roadContainer.innerHTML = '';
  
  // Créer une route infinie avec CSS
  const road = document.createElement('div');
  road.style.cssText = `
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: ${ROAD_WIDTH}px;
    height: 100%;
    background: ${ROAD_COLOR};
    overflow: hidden;
  `;
  roadContainer.appendChild(road);
  
  // Ajouter les lignes de la route
  for (let i = 0; i < 50; i++) {
    const line = document.createElement('div');
    line.style.cssText = `
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      width: 100%;
      height: 4px;
      background: ${ROAD_MARKINGS_COLOR};
      top: ${i * 80}px;
    `;
    road.appendChild(line);
  }
  
  // Ajouter les bords
  const leftBorder = document.createElement('div');
  leftBorder.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: calc((100% - ${ROAD_WIDTH}px) / 2);
    height: 100%;
    background: ${ROAD_EDGE_COLOR};
  `;
  roadContainer.appendChild(leftBorder);
  
  const rightBorder = document.createElement('div');
  rightBorder.style.cssText = `
    position: absolute;
    top: 0;
    right: 0;
    width: calc((100% - ${ROAD_WIDTH}px) / 2);
    height: 100%;
    background: ${ROAD_EDGE_COLOR};
  `;
  roadContainer.appendChild(rightBorder);
}

// ============================================
// SKY EFFECT
// ============================================

function createSkyEffect() {
  const sky = document.querySelector('.sky-effect');
  if (!sky) return;
  
  // Ajouter des étoiles aléatoires
  for (let i = 0; i < 100; i++) {
    const star = document.createElement('div');
    star.style.cssText = `
      position: absolute;
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 50}%;
      width: ${Math.random() * 2 + 1}px;
      height: ${Math.random() * 2 + 1}px;
      background: white;
      border-radius: 50%;
      opacity: ${Math.random() * 0.5 + 0.3};
      box-shadow: 0 0 ${Math.random() * 5 + 2}px white;
      animation: twinkle ${Math.random() * 3 + 1}s infinite alternate;
    `;
    sky.appendChild(star);
  }
  
  // Ajouter l'animation CSS
  const style = document.createElement('style');
  style.textContent = `
    @keyframes twinkle {
      0% { opacity: 0.3; }
      100% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

// ============================================
// LOGIQUE DU JEU
// ============================================

function spawnEnemy() {
  if (gameState.lastEnemySpawn >= gameState.enemySpawnRate) {
    // Choisir un type d'ennemi selon la probabilité
    let totalProbability = 0;
    ENEMY_TYPES.forEach(type => totalProbability += type.probability);
    let random = Math.random() * totalProbability;
    
    let enemyType = ENEMY_TYPES[0];
    let cumulative = 0;
    for (const type of ENEMY_TYPES) {
      cumulative += type.probability;
      if (random <= cumulative) {
        enemyType = type;
        break;
      }
    }
    
    const lane = Math.floor(Math.random() * 3);
    const laneWidth = ROAD_WIDTH / 3;
    const roadX = (canvas.width - ROAD_WIDTH) / 2;
    
    const enemy = {
      x: roadX + lane * laneWidth + laneWidth / 2,
      y: -enemyType.height,
      width: enemyType.width,
      height: enemyType.height,
      speed: enemyType.speed * gameState.speedMultiplier,
      color: enemyType.color,
      points: enemyType.points * gameState.level,
      type: enemyType.name,
      sprite: spriteData[`enemy${ENEMY_TYPES.indexOf(enemyType) + 1}`].data
    };
    
    enemies.push(enemy);
    gameState.lastEnemySpawn = 0;
  } else {
    gameState.lastEnemySpawn++;
  }
}

function spawnBonus() {
  if (gameState.lastBonusSpawn >= gameState.bonusSpawnRate) {
    const bonusType = BONUS_TYPES[Math.floor(Math.random() * BONUS_TYPES.length)];
    const x = Math.random() * (canvas.width - 60) + 30;
    
    const bonus = {
      x: x,
      y: -20,
      radius: 15,
      color: bonusType.color,
      symbol: bonusType.type === 'turbo' ? '🔥' : bonusType.type === 'shield' ? '🛡️' : '❤️',
      effect: bonusType.effect,
      sprite: spriteData[bonusType.type].data
    };
    
    bonuses.push(bonus);
    gameState.lastBonusSpawn = 0;
  } else {
    gameState.lastBonusSpawn++;
  }
}

function updateEnemies() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    enemies[i].y += enemies[i].speed * gameState.speedMultiplier;
    
    // Vérifier collision avec KITT
    if (
      !kitt.invincible &&
      checkCollision(
        kitt.x - kitt.width / 2, kitt.y - kitt.height / 2, kitt.width, kitt.height,
        enemies[i].x - enemies[i].width / 2, enemies[i].y - enemies[i].height / 2, enemies[i].width, enemies[i].height
      )
    ) {
      enemies.splice(i, 1);
      gameState.lives--;
      document.getElementById('lives').textContent = gameState.lives;
      playSound('explosion');
      createParticleEffect(kitt.x, kitt.y, '#ff0000', 30);
      
      if (gameState.lives <= 0) {
        gameState.gameOver = true;
        showGameOver();
      }
    }
    
    // Supprimer les ennemis hors écran
    if (enemies[i].y > canvas.height + enemies[i].height) {
      enemies.splice(i, 1);
      gameState.score += enemies[i].points || 10 * gameState.level;
      gameState.enemiesDodged++;
      document.getElementById('score').textContent = gameState.score;
    }
  }
}

function updateBonuses() {
  for (let i = bonuses.length - 1; i >= 0; i--) {
    bonuses[i].y += 2 * gameState.speedMultiplier;
    
    // Vérifier collision avec KITT
    const distance = Math.sqrt(
      Math.pow(kitt.x - bonuses[i].x, 2) +
      Math.pow(kitt.y - kitt.height / 2 - bonuses[i].y, 2)
    );
    
    if (distance < kitt.width / 2 + bonuses[i].radius) {
      bonuses[i].effect();
      bonuses.splice(i, 1);
      playSound('bonusSound');
    }
    
    // Supprimer les bonus hors écran
    if (bonuses[i].y > canvas.height + bonuses[i].radius) {
      bonuses.splice(i, 1);
    }
  }
}

function checkCollision(x1, y1, w1, h1, x2, y2, w2, h2) {
  return x1 < x2 + w2 &&
         x1 + w1 > x2 &&
         y1 < y2 + h2 &&
         y1 + h1 > y2;
}

function updateKITT() {
  // Déplacement latéral
  const roadX = (canvas.width - ROAD_WIDTH) / 2;
  const minX = roadX + kitt.width / 2 + 10;
  const maxX = canvas.width - roadX - kitt.width / 2 - 10;
  
  if (keys.ArrowLeft && kitt.x > minX) {
    kitt.x -= 7 * gameState.speedMultiplier;
  }
  if (keys.ArrowRight && kitt.x < maxX) {
    kitt.x += 7 * gameState.speedMultiplier;
  }
  
  // Accélération/Ralentissement
  if (keys.ArrowUp) {
    kitt.speed = Math.min(kitt.speed + kitt.acceleration, kitt.maxSpeed * (kitt.turbo ? 1.8 : 1) * gameState.speedMultiplier);
  } else {
    kitt.speed = Math.max(kitt.speed - kitt.deceleration, 0);
  }
  
  // Déplacement vers l'avant
  kitt.y -= kitt.speed * gameState.speedMultiplier;
  
  // Garder KITT sur la route (défilement infini)
  if (kitt.y < canvas.height / 3) {
    const diff = canvas.height / 3 - kitt.y;
    kitt.y = canvas.height / 3;
    
    enemies.forEach(enemy => enemy.y += diff);
    bonuses.forEach(bonus => bonus.y += diff);
  }
  
  // Gérer les timers
  if (kitt.turboTimer > 0) {
    kitt.turboTimer--;
    if (kitt.turboTimer === 0) kitt.turbo = false;
  }
  
  if (kitt.shieldTimer > 0) {
    kitt.shieldTimer--;
    if (kitt.shieldTimer === 0) {
      kitt.shield = false;
      kitt.invincible = false;
    }
  }
  
  if (kitt.turboCooldown > 0) kitt.turboCooldown--;
  if (kitt.shieldCooldown > 0) kitt.shieldCooldown--;
  
  // Animation du sprite
  if (kitt.sprite) {
    kitt.animationFrame += kitt.animationSpeed * kitt.speed;
    if (kitt.animationFrame >= 1) kitt.animationFrame = 0;
  }
}

function checkLevelUp() {
  if (gameState.score >= gameState.level * 5000) {
    gameState.level++;
    gameState.levelUp = true;
    gameState.speedMultiplier = 1 + (gameState.level - 1) * 0.1;
    gameState.enemySpawnRate = Math.max(60, 120 - (gameState.level - 1) * 20);
    playSound('levelUp');
    
    document.getElementById('newLevel').textContent = gameState.level;
    document.getElementById('newLevelText').textContent = gameState.level;
    document.getElementById('levelUpModal').classList.add('active');
    pauseGame();
  }
}

// ============================================
// GESTION DES MODALS
// ============================================

function showGameOver() {
  gameState.gameOver = true;
  document.getElementById('finalScore').textContent = gameState.score;
  document.getElementById('finalLevel').textContent = gameState.level;
  document.getElementById('finalEnemies').textContent = gameState.enemiesDodged;
  document.getElementById('gameOverModal').classList.add('active');
  
  Object.values(soundElements).forEach(sound => sound.pause());
}

function pauseGame() {
  if (gameState.gameOver || gameState.levelUp) return;
  
  gameState.paused = true;
  document.getElementById('pauseModal').classList.add('active');
  
  soundElements.engine.volume = gameState.settings.soundVolume / 300;
  soundElements.theme.volume = gameState.settings.musicVolume / 300;
}

function resumeGame() {
  gameState.paused = false;
  document.getElementById('pauseModal').classList.remove('active');
  document.getElementById('levelUpModal').classList.remove('active');
  gameState.levelUp = false;
  
  soundElements.engine.volume = gameState.settings.soundVolume / 100;
  soundElements.theme.volume = gameState.settings.musicVolume / 100;
  
  // Rejouer les sons
  soundElements.engine.play().catch(() => {});
  soundElements.theme.play().catch(() => {});
}

function resetGame() {
  // Réinitialiser KITT
  Object.assign(kitt, {
    x: canvas.width / 2,
    y: canvas.height - 100,
    speed: 0,
    turbo: false,
    shield: false,
    invincible: false,
    turboTimer: 0,
    shieldTimer: 0,
    turboCooldown: 0,
    shieldCooldown: 0
  });
  
  // Réinitialiser l'état du jeu
  Object.assign(gameState, {
    score: 0,
    lives: 3,
    level: 1,
    gameOver: false,
    paused: false,
    levelUp: false,
    enemiesDodged: 0,
    speedMultiplier: 1,
    lastEnemySpawn: 0,
    lastBonusSpawn: 0,
    enemySpawnRate: 120,
    bonusSpawnRate: 300,
    particles: []
  });
  
  enemies = [];
  bonuses = [];
  
  // Réinitialiser l'affichage
  document.getElementById('score').textContent = '0';
  document.getElementById('lives').textContent = '3';
  document.getElementById('level').textContent = '1';
  document.getElementById('gameOverModal').classList.remove('active');
  document.getElementById('pauseModal').classList.remove('active');
  document.getElementById('levelUpModal').classList.remove('active');
  updatePowerStatus();
  
  // Relancer les sons
  Object.values(soundElements).forEach(sound => {
    sound.currentTime = 0;
    sound.volume = 0;
  });
  
  soundElements.engine.volume = gameState.settings.soundVolume / 100;
  soundElements.theme.volume = gameState.settings.musicVolume / 100;
  soundElements.engine.play().catch(() => {});
  soundElements.theme.play().catch(() => {});
  
  // Démarrer le jeu
  requestAnimationFrame(gameLoop);
}

function updatePowerStatus() {
  // Turbo
  const turboStatusEl = document.getElementById('turboStatus');
  const turboTimerEl = document.getElementById('turboTimer');
  
  if (kitt.turbo) {
    turboStatusEl.classList.add('active');
    turboTimerEl.textContent = `ACTIF`;
  } else if (kitt.turboCooldown > 0) {
    turboStatusEl.classList.remove('active');
    turboStatusEl.classList.add('cooldown');
    turboTimerEl.textContent = `${Math.ceil(kitt.turboCooldown / 60)}s`;
  } else {
    turboStatusEl.classList.remove('active', 'cooldown');
    turboTimerEl.textContent = `PRÊT`;
  }
  
  // Bouclier
  const shieldStatusEl = document.getElementById('shieldStatus');
  const shieldTimerEl = document.getElementById('shieldTimer');
  
  if (kitt.shield) {
    shieldStatusEl.classList.add('active');
    shieldTimerEl.textContent = `ACTIF`;
  } else if (kitt.shieldCooldown > 0) {
    shieldStatusEl.classList.remove('active');
    shieldStatusEl.classList.add('cooldown');
    shieldTimerEl.textContent = `${Math.ceil(kitt.shieldCooldown / 60)}s`;
  } else {
    shieldStatusEl.classList.remove('active', 'cooldown');
    shieldTimerEl.textContent = `PRÊT`;
  }
}

// ============================================
// BOUCLE PRINCIPALE
// ============================================

function gameLoop() {
  if (gameState.gameOver || gameState.paused || gameState.levelUp) {
    // Dessiner les particules même en pause
    if (gameState.settings.effectsEnabled) {
      particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
      updateParticles();
      drawParticles();
    }
    return;
  }
  
  // Effacer le canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Mise à jour
  updateKITT();
  spawnEnemy();
  spawnBonus();
  updateEnemies();
  updateBonuses();
  checkLevelUp();
  updatePowerStatus();
  
  // Mise à jour des particules
  if (gameState.settings.effectsEnabled) {
    updateParticles();
  }
  
  // Dessin
  drawEnemies();
  drawBonuses();
  drawKITT();
  
  // Dessiner les particules sur le canvas des particules
  if (gameState.settings.effectsEnabled) {
    particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    drawParticles();
  }
  
  // Continuer la boucle
  requestAnimationFrame(gameLoop);
}

// ============================================
// INITIALISATION
// ============================================

function initGame() {
  // Charger les sprites
  loadSprites();
  
  // Générer la route
  generateRoad();
  
  // Créer l'effet de ciel
  createSkyEffect();
  
  // Initialiser les sons
  soundElements.engine.volume = gameState.settings.soundVolume / 100;
  soundElements.theme.volume = gameState.settings.musicVolume / 100;
  soundElements.engine.play().catch(() => console.log("Impossible de jouer le son du moteur"));
  soundElements.theme.play().catch(() => console.log("Impossible de jouer la musique"));
  
  // Configurer les boutons de l'UI
  setupUI();
  
  // Démarrer le jeu
  requestAnimationFrame(gameLoop);
}

// Configurer les boutons de l'UI
function setupUI() {
  // Bouton Recommencer
  document.getElementById('restartBtn').addEventListener('click', resetGame);
  
  // Bouton Reprendre
  document.getElementById('resumeBtn').addEventListener('click', resumeGame);
  
  // Bouton Quitter (pause)
  document.getElementById('quitPauseBtn').addEventListener('click', () => {
    window.location.href = '/jeux/';
  });
  
  // Bouton Continuer (niveau)
  document.getElementById('continueLevelBtn').addEventListener('click', () => {
    gameState.levelUp = false;
    resumeGame();
  });
  
  // Bouton Son
  document.getElementById('soundBtn').addEventListener('click', toggleSound);
  
  // Bouton Paramètres
  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('active');
  });
  
  // Bouton Fermer Paramètres
  document.getElementById('settingsCloseBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.remove('active');
  });
  
  // Bouton Plein Écran
  document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
  
  // Fermer les modals en cliquant en dehors
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
        if (modal.id === 'pauseModal') resumeGame();
      }
    });
  });
  
  // Fermer avec Échap
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
      });
      if (gameState.paused) resumeGame();
    }
  });
  
  // Paramètres - Sliders
  document.getElementById('musicSlider').addEventListener('input', (e) => {
    gameState.settings.musicVolume = parseInt(e.target.value);
    document.getElementById('musicValue').textContent = `${e.target.value}%`;
    soundElements.theme.volume = gameState.settings.musicVolume / 100;
  });
  
  document.getElementById('soundSlider').addEventListener('input', (e) => {
    gameState.settings.soundVolume = parseInt(e.target.value);
    document.getElementById('soundValue').textContent = `${e.target.value}%`;
    soundElements.engine.volume = gameState.settings.soundVolume / 100;
  });
  
  // Paramètres - Toggle Effets
  document.getElementById('effectsToggle').addEventListener('change', (e) => {
    gameState.settings.effectsEnabled = e.target.checked;
  });
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function darkenColor(color, percent) {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
  const B = Math.max(0, (num & 0x0000FF) - amt);
  
  return "#" + (0x1000000 + (R * 0x10000) + (G * 0x100) + B).toString(16).slice(1);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.error(`Erreur plein écran: ${err.message}`);
    });
    document.body.classList.add('fullscreen');
  } else {
    document.exitFullscreen();
    document.body.classList.remove('fullscreen');
  }
}

// Ajouter la méthode roundRect à Canvas
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

// ============================================
// DÉMARRAGE
// ============================================

// Démarrer le chargement
loadSprites();

// Console Easter Egg
console.log('%c🚗 Knight Rider: KITT Adventure v2.0', 'color: #ff0000; font-size: 20px; font-weight: bold;');
console.log('%cContrôles: ↑↓←→ Espace T Échap', 'color: #00bfff;');
console.log('%cNouveautés: Sprites, Particules, Effets Sonores', 'color: #8e44ad;');
