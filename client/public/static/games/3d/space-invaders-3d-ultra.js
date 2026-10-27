// ============================================
// SPACE INVADERS 3D ULTRA - Jeu d'invasion spatiale 3D
// Avec vaisseaux spatial, vagues d'ennemis, armes puissantes
// By Manix - KITT FRANCO BELGE - 2026
// Version 3D ultra-fluide avec effets visuels spectaculaires
// ============================================

(function () {
'use strict';

// ============================================
// CONFIGURATION
// ============================================

const GAME_WIDTH = 40;
const GAME_HEIGHT = 30;
const GAME_DEPTH = 20;
const CELL_SIZE = 1.5;

// Game settings
const PLAYER_SPEED = 0.25;
const BULLET_SPEED = 0.5;
const ENEMY_MOVE_SPEED = 0.05;
const ENEMY_DROP_SPEED = 0.15;
const ENEMY_SHOOT_PROBABILITY = 0.005;
const POWERUP_DROP_CHANCE = 0.12;
const POWERUP_DURATION = 10; // secondes pour double/triple tir
const COMBO_WINDOW = 2.2; // secondes entre deux kills pour garder le combo

// Game state
let scene, camera, renderer;
let clock;
let player;
let bullets = [];
let enemies = [];
let enemyBullets = [];
let barriers = [];
let stars = [];

let state = 'loading';
let score = 0, lives = 3, level = 1, highScore = 0;
let gameOver = false, paused = false, won = false;
let currentWave = 1;
let totalWaves = 10;
let enemiesRemaining = 0;
let waveStartTime = 0;
let enemyDirection = 1;
let enemyMoveDown = false;
let enemyMoveTimer = 0;

// Combo / multiplicateur
let combo = 0, comboTimer = 0, maxMultiplier = 1, killsInWave = 0, wavePerfect = true;
// Power-ups actifs
let doubleShotUntil = 0, tripleShotUntil = 0, shieldActive = false, bombStock = 1;
// Juice
let shakeTime = 0, shakeMagnitude = 0, hitFlashUntil = 0, shieldFlashUntil = 0;
// Objets dynamiques
let powerups = [];   // capsules à ramasser
let ufo = null;      // vaisseau bonus doré
let ufoTimer = 12;   // délai avant apparition du prochain bonus

// Controls
const keys = {};
let activeExplosions=0;
let invulnerableUntil=0;
let hudStamp='';
let canShoot = true;
let shootCooldown = 0;

// Audio context
const silentAudio={ensure:()=>false,setMusic:()=>{},output:()=>null,sfx:{playerExplosion:()=>{},powerup:()=>{}}};
const digitalAudio=window.AstSfx||silentAudio;
let audioContext=null;
try{audioContext=digitalAudio.getContext?.()||null}catch(error){console.warn('Audio indisponible, jeu maintenu sans son.',error)}

// ============================================
// COULEURS
// ============================================

const COLORS = {
    bg: 0x000011,
    star: 0xffffff,
    starHot: 0xff8800,
    starCool: 0x4488ff,
    player: 0x00ff88,
    playerGlow: 0x44ffaa,
    bullet: 0x00ff88,
    bulletGlow: 0x44ffaa,
    enemy1: 0xff4444,
    enemy2: 0xff8844,
    enemy3: 0x88ff44,
    enemy4: 0x4488ff,
    enemy5: 0xff44ff,
    enemyGlow: 0xff8888,
    barrier: 0x446688,
    barrierGlow: 0x6688aa,
    explosion: 0xff4444,
    explosionGlow: 0xff8888,
    hud: 0x63e9ff,
    text: 0xffffff,
    gold: 0xffd700,
    warning: 0xff4444
};

// ============================================
// EFFETS SONORES
// ============================================

function playShootSound() {
    if(!audioContext)return;
    const freq = 600 + Math.random() * 200;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.08;
    oscillator.connect(gainNode);
    gainNode.connect(digitalAudio.output());
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
    oscillator.stop(audioContext.currentTime + 0.1);
    
    // Second harmonique
    const freq2 = freq * 1.5;
    const oscillator2 = audioContext.createOscillator();
    const gainNode2 = audioContext.createGain();
    oscillator2.type = 'sine';
    oscillator2.frequency.value = freq2;
    gainNode2.gain.value = 0.04;
    oscillator2.connect(gainNode2);
    gainNode2.connect(digitalAudio.output());
    oscillator2.start();
    gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
    oscillator2.stop(audioContext.currentTime + 0.1);
}

function playExplosionSound() {
    if(!audioContext)return;
    const freq = 200 + Math.random() * 100;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.1;
    oscillator.connect(gainNode);
    gainNode.connect(digitalAudio.output());
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
    oscillator.stop(audioContext.currentTime + 0.3);
    
    // Noise
    const noise = audioContext.createBufferSource();
    const buffer = audioContext.createBuffer(1, Math.ceil(0.3*audioContext.sampleRate), audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    noise.buffer = buffer;
    const noiseGain = audioContext.createGain();
    noiseGain.gain.value = 0.05;
    noise.connect(noiseGain);
    noiseGain.connect(digitalAudio.output());
    noise.start();
    noiseGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
}

function playDeathSound() {
    if(!audioContext)return;
    const freq = 300;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.15;
    oscillator.connect(gainNode);
    gainNode.connect(digitalAudio.output());
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
    oscillator.stop(audioContext.currentTime + 0.5);
    
    // Second oscillator
    const oscillator2 = audioContext.createOscillator();
    const gainNode2 = audioContext.createGain();
    oscillator2.type = 'sine';
    oscillator2.frequency.value = freq * 0.5;
    gainNode2.gain.value = 0.08;
    oscillator2.connect(gainNode2);
    gainNode2.connect(digitalAudio.output());
    oscillator2.start();
    gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
    oscillator2.stop(audioContext.currentTime + 0.5);
}

function playWaveSound() {
    if(!audioContext)return;
    const freq = 100;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.08;
    oscillator.connect(gainNode);
    gainNode.connect(digitalAudio.output());
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
    oscillator.stop(audioContext.currentTime + 0.5);
    
    // Second oscillator
    const freq2 = freq * 1.5;
    const oscillator2 = audioContext.createOscillator();
    const gainNode2 = audioContext.createGain();
    oscillator2.type = 'sine';
    oscillator2.frequency.value = freq2;
    gainNode2.gain.value = 0.04;
    oscillator2.connect(gainNode2);
    gainNode2.connect(digitalAudio.output());
    oscillator2.start();
    gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
    oscillator2.stop(audioContext.currentTime + 0.5);
}

// Arpège joyeux pour power-up ramassé
function playPowerupPickupSound() {
    if(!audioContext)return;
    [440, 554, 659, 880].forEach((freq, i) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.value = freq;
        oscillator.connect(gainNode);
        gainNode.connect(digitalAudio.output());
        const t = audioContext.currentTime + i * 0.06;
        oscillator.start(t);
        gainNode.gain.setValueAtTime(0.08, t);
        gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        oscillator.stop(t + 0.2);
    });
}

// Montée douce pour le bouclier
function playShieldSound() {
    if(!audioContext)return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(220, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(660, audioContext.currentTime + 0.35);
    gainNode.gain.value = 0.08;
    oscillator.connect(gainNode);
    gainNode.connect(digitalAudio.output());
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.4);
    oscillator.stop(audioContext.currentTime + 0.4);
}

// Bouclier touché : choc mat amorti
function playShieldHitSound() {
    if(!audioContext)return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(520, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(190, audioContext.currentTime + 0.15);
    gainNode.gain.value = 0.12;
    oscillator.connect(gainNode);
    gainNode.connect(digitalAudio.output());
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);
    oscillator.stop(audioContext.currentTime + 0.18);
}

// Détonation de bombe
function playBombSound() {
    if(!audioContext)return;
    const noise = audioContext.createBufferSource();
    const buffer = audioContext.createBuffer(1, Math.ceil(0.9*audioContext.sampleRate), audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, audioContext.currentTime);
    filter.frequency.exponentialRampToValueAtTime(60, audioContext.currentTime + 0.9);
    const noiseGain = audioContext.createGain();
    noiseGain.gain.value = 0.28;
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(digitalAudio.output());
    noise.start();
    noiseGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.9);
    const sub = audioContext.createOscillator();
    const subGain = audioContext.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(110, audioContext.currentTime);
    sub.frequency.exponentialRampToValueAtTime(22, audioContext.currentTime + 1);
    subGain.gain.value = 0.3;
    sub.connect(subGain);
    subGain.connect(digitalAudio.output());
    sub.start();
    subGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);
    sub.stop(audioContext.currentTime + 1.05);
}

// Deux notes rapides montantes pour combo
function playComboSound() {
    if(!audioContext)return;
    [[660, 0], [990, 0.09]].forEach(([freq, delay]) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.type = 'square';
        oscillator.frequency.value = freq;
        gainNode.gain.value = 0.06;
        oscillator.connect(gainNode);
        gainNode.connect(digitalAudio.output());
        const t = audioContext.currentTime + delay;
        oscillator.start(t);
        gainNode.gain.setValueAtTime(0.06, t);
        gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        oscillator.stop(t + 0.12);
    });
}

// Bip aigu pour le vaisseau bonus
function playUfoSound() {
    if(!audioContext)return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.3);
    gainNode.gain.value = 0.05;
    oscillator.connect(gainNode);
    gainNode.connect(digitalAudio.output());
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
    oscillator.stop(audioContext.currentTime + 0.3);
}

// Active un screen shake modéré
function addShake(duration, magnitude) {
    shakeTime = Math.max(shakeTime, duration);
    shakeMagnitude = Math.max(shakeMagnitude, magnitude);
}

// ============================================
// INITIALIZATION
// ============================================

function init() {
    if(renderer)return;
    initThreeJS();
    initControls();
    createHud();
    
    // Charger le high score
    try { 
        highScore = Number(localStorage.getItem('spaceInvaders3dUltraHS')) || 0; 
    } catch(e){}
    
    state = 'menu';
    showMenu();
    const loading=document.getElementById('loading-screen');if(loading)loading.style.display='none';
    requestAnimationFrame(render);
    
    const startButton=document.getElementById('start-button');if(startButton)startButton.disabled=false;
}

function initThreeJS() {
    clock = new THREE.Clock();
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.bg);
    scene.fog = new THREE.FogExp2(COLORS.bg, 0.002);
    
    // Camera
    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 34, -42);
    camera.lookAt(0, 0, 0);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        precision: "highp"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputEncoding = THREE.sRGBEncoding;
    
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.appendChild(renderer.domElement);
    } else {
        document.body.appendChild(renderer.domElement);
    }
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0x444466, 0.3);
    scene.add(ambientLight);
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(100, 100, 100);
    directionalLight1.lookAt(0, 0, 0);
    directionalLight1.castShadow = true;
    directionalLight1.shadow.mapSize.width = 2048;
    directionalLight1.shadow.mapSize.height = 2048;
    scene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0xff4488, 0.3);
    directionalLight2.position.set(-100, 100, -100);
    directionalLight2.lookAt(0, 0, 0);
    scene.add(directionalLight2);
    
    // Player light
    const playerLight = new THREE.SpotLight(COLORS.playerGlow, 2, 80, Math.PI / 4, 0.5);
    playerLight.name = 'playerLight';
    playerLight.castShadow = true;
    scene.add(playerLight);
    
    // Create background
    createBackground();
    
    // Create grid
    createGrid();
    
    // Resize handler
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function createBackground() {
    // Les 2 000 étoiles conservent leur volume/couleur en un seul appel GPU.
    const starfield=new THREE.InstancedMesh(new THREE.SphereGeometry(1,4,4),
        new THREE.MeshBasicMaterial({transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}),2000);
    const transform=new THREE.Object3D(),color=new THREE.Color();
    for(let i=0;i<2000;i++){
        transform.position.set((Math.random()-.5)*220,18+Math.random()*110,45+Math.random()*160);
        transform.scale.setScalar(.1+Math.random()*.2);transform.updateMatrix();starfield.setMatrixAt(i,transform.matrix);
        color.setHex(Math.random()<.3?COLORS.starHot:Math.random()<.5?COLORS.starCool:COLORS.star).multiplyScalar(.8+Math.random()*.2);starfield.setColorAt(i,color);
    }
    starfield.instanceMatrix.needsUpdate=true;scene.add(starfield);stars.push(starfield);
    
    // Nebula clouds
    for(let i = 0; i < 5; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        const color = `hsl(${Math.random() * 60 + 240}, 70%, 40%)`;
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.1 + Math.random() * 0.1,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        
        const size = 40 + Math.random() * 60;
        const geometry = new THREE.PlaneGeometry(size, size);
        const nebula = new THREE.Mesh(geometry, material);
        nebula.position.set(
            (Math.random() - 0.5) * GAME_WIDTH * CELL_SIZE,
            0,
            (Math.random() - 0.5) * GAME_DEPTH * CELL_SIZE - 50
        );
        nebula.rotation.x = Math.random() * Math.PI;
        nebula.rotation.y = Math.random() * Math.PI;
        nebula.rotation.z = Math.random() * Math.PI;
        
        scene.add(nebula);
    }
}

function createGrid() {
    // Floor grid
    const gridSize = Math.max(GAME_WIDTH, GAME_DEPTH) * CELL_SIZE * 1.2;
    const divisions = 40;
    
    const gridHelper = new THREE.GridHelper(gridSize, divisions, 0x112244, 0x081220);
    gridHelper.position.y = -1;
    scene.add(gridHelper);
}

// ============================================
// CREATION DES ÉLÉMENTS DE JEU
// ============================================

function createPlayer() {
    const group = new THREE.Group();
    group.name = 'player';
    
    // Player base
    const baseGeometry = new THREE.CylinderGeometry(1.5, 2, 1, 16);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.player,
        emissive: COLORS.playerGlow,
        emissiveIntensity: 0.4,
        roughness: 0.3,
        metalness: 0.4
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.castShadow = true;
    group.add(base);
    
    // Player turret
    const turretGeometry = new THREE.CylinderGeometry(0.8, 1, 2, 16);
    const turretMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.player,
        emissive: COLORS.playerGlow,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.5
    });
    const turret = new THREE.Mesh(turretGeometry, turretMaterial);
    turret.position.y = 1.5;
    turret.castShadow = true;
    turret.name = 'turret';
    group.add(turret);
    
    // Player cannon
    const cannonGeometry = new THREE.CylinderGeometry(0.2, 0.4, 3, 8);
    const cannonMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.playerGlow,
        emissive: COLORS.playerGlow,
        emissiveIntensity: 0.8,
        roughness: 0.1,
        metalness: 0.7
    });
    const cannon = new THREE.Mesh(cannonGeometry, cannonMaterial);
    cannon.position.set(0,1.2,2);cannon.rotation.x=Math.PI/2;
    cannon.name = 'cannon';
    group.add(cannon);
    
    const wingMaterial=new THREE.MeshStandardMaterial({color:0x133552,emissive:0x063145,metalness:.65,roughness:.3});
    for(const side of [-1,1]){
        const wing=new THREE.Mesh(new THREE.BoxGeometry(1.8,.4,3.2),wingMaterial);wing.position.set(side*1.9,.3,-.2);wing.rotation.y=side*.23;group.add(wing);
        const reactor=new THREE.Mesh(new THREE.CylinderGeometry(.4,.6,1.1,12),new THREE.MeshBasicMaterial({color:0x5cecff}));
        reactor.rotation.x=Math.PI/2;reactor.position.set(side*1.8,.3,-2);group.add(reactor);
        const trim=new THREE.LineSegments(new THREE.EdgesGeometry(wing.geometry),new THREE.LineBasicMaterial({color:0x58dfff}));wing.add(trim);
    }
    // Player position
    group.position.set(0, 0, -GAME_DEPTH * CELL_SIZE / 2 + 5);
    
    return group;
}

function createEnemy(type, x, z) {
    const group = new THREE.Group();
    group.name = `enemy_${type}`;
    
    // Enemy body
    const bodyGeometry = new THREE.BoxGeometry(1.8, 1.2, 1.2);
    let bodyColor;
    
    switch(type) {
        case 1: bodyColor = COLORS.enemy1; break;
        case 2: bodyColor = COLORS.enemy2; break;
        case 3: bodyColor = COLORS.enemy3; break;
        case 4: bodyColor = COLORS.enemy4; break;
        case 5: bodyColor = COLORS.enemy5; break;
        default: bodyColor = COLORS.enemy1;
    }
    
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        emissive: bodyColor,
        emissiveIntensity: 0.6,
        roughness: 0.4,
        metalness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    group.add(body);
    
    const rim=new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeometry),new THREE.LineBasicMaterial({color:bodyColor}));body.add(rim);
    // Enemy details
    const detailGeometry = new THREE.BoxGeometry(0.6, 0.4, 0.4);
    const detailMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        emissive: bodyColor,
        emissiveIntensity: 0.5,
        roughness: 0.2,
        metalness: 0.5
    });
    
    const detail1 = new THREE.Mesh(detailGeometry, detailMaterial);
    detail1.position.set(-0.5, 0.4, 0);
    group.add(detail1);
    
    const detail2 = new THREE.Mesh(detailGeometry, detailMaterial);
    detail2.position.set(0.5, 0.4, 0);
    group.add(detail2);
    
    // Enemy eyes
    const eyeGeometry = new THREE.SphereGeometry(0.2, 8, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.4, 0.2, -0.65);
    group.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.4, 0.2, -0.65);
    group.add(rightEye);
    
    // Position
    group.position.set(x,0,z);
    
    group.userData = {
        type: type,
        health: type,
        points: type * 100
    };
    
    return group;
}

function createBullet(x, z, isPlayerBullet = true) {
    const geometry = new THREE.CylinderGeometry(0.15, 0.15, 2, 8);
    
    const material = new THREE.MeshStandardMaterial({
        color: isPlayerBullet ? COLORS.bullet : COLORS.enemy1,
        emissive: isPlayerBullet ? COLORS.bulletGlow : COLORS.enemyGlow,
        emissiveIntensity: 0.8,
        roughness: 0.1,
        metalness: 0.7
    });
    
    const bullet = new THREE.Mesh(geometry, material);
    bullet.rotation.x=Math.PI/2;
    const glow=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,2.8,8),new THREE.MeshBasicMaterial({color:isPlayerBullet?0x52ffff:0xff526c,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false}));
    bullet.add(glow);
    bullet.position.set(x, 0, z);
    bullet.name = isPlayerBullet ? 'playerBullet' : 'enemyBullet';
    bullet.userData.player = isPlayerBullet;
    
    // Add trail
    const trailGeometry = new THREE.ConeGeometry(0.2, 0.8, 8, 1);
    const trailMaterial = new THREE.MeshBasicMaterial({
        color: isPlayerBullet ? COLORS.bulletGlow : COLORS.enemyGlow,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending
    });
    const trail = new THREE.Mesh(trailGeometry, trailMaterial);
    trail.position.y = -1;
    trail.rotation.x = Math.PI;
    bullet.add(trail);
    
    return bullet;
}

// Pool de projectiles : évite geometry/material alloués à chaque tir
const bulletPool = [];
function acquireBullet(x, z, isPlayerBullet) {
    let bullet = null;
    for (let i = bulletPool.length - 1; i >= 0; i--) {
        if (bulletPool[i].userData.player === isPlayerBullet) {
            bullet = bulletPool.splice(i, 1)[0];
            break;
        }
    }
    if (!bullet) bullet = createBullet(0, 0, isPlayerBullet);
    bullet.position.set(x, 0, z);
    return bullet;
}
function releaseBullet(bullet) {
    bullet.visible = true;
    bulletPool.push(bullet);
}

function createBarrier(x, z) {
    const group = new THREE.Group();
    group.name = 'barrier';
    
    // Barrier base
    const baseGeometry = new THREE.BoxGeometry(2, 0.5, 2);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.barrier,
        roughness: 0.7,
        metalness: 0.2
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    group.add(base);
    
    // Barrier blocks
    const blockGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const blockMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.barrier,
        emissive: COLORS.barrierGlow,
        emissiveIntensity: 0.2,
        roughness: 0.5,
        metalness: 0.3
    });
    
    const blocks = [];
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const block = new THREE.Mesh(blockGeometry, blockMaterial);
            block.position.set(
                -1 + i * 0.6,
                1 + j * 0.8,
                -1 + j * 0.3
            );
            block.userData = { health: 3 };
            group.add(block);
            blocks.push(block);
        }
    }
    
    group.userData = {
        blocks: blocks
    };
    
    // Position
    group.position.set(x,0,z);
    
    return group;
}

function createExplosion(x, z, color = COLORS.explosion) {
    if(activeExplosions>=20){playExplosionSound();return}
    activeExplosions++;
    const group = new THREE.Group();
    group.name = 'explosion';
    group.position.set(x, 0, z);
    
    // Main explosion sphere
    const mainGeometry = new THREE.SphereGeometry(1.5, 16, 16);
    const mainMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    const main = new THREE.Mesh(mainGeometry, mainMaterial);
    group.add(main);
    
    // Inner sphere
    const innerGeometry = new THREE.SphereGeometry(1, 16, 16);
    const innerMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending
    });
    const inner = new THREE.Mesh(innerGeometry, innerMaterial);
    group.add(inner);
    
    // Particles
    for (let i = 0; i < 20; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.1 + Math.random() * 0.2, 4, 4);
        const particleMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.position.set(
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 3
        );
        particle.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2
            )
        };
        group.add(particle);
    }
    
    scene.add(group);
    
    // Animation
    const startTime = Date.now();
    const duration = 800;
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;
        
        if (progress < 1) {
            main.scale.setScalar(1 + progress * 0.5);
            main.material.opacity = 0.8 - progress * 0.8;
            
            inner.scale.setScalar(1 - progress * 0.8);
            inner.material.opacity = 1 - progress * 0.8;
            
            // Animate particles
            group.children.forEach(child => {
                if (child.userData && child.userData.velocity) {
                    child.position.addScaledVector(child.userData.velocity,0.05);
                    child.material.opacity -= 0.02;
                }
            });
            
            requestAnimationFrame(animate);
        } else {
            scene.remove(group);disposeObject(group);activeExplosions--;
        }
    }
    
    animate();
    playExplosionSound();
}

// ============================================
// GAME LOGIC
// ============================================

function startGame() {
    digitalAudio.ensure();digitalAudio.setMusic(true,1);
    renderer.domElement.setAttribute('tabindex','0');renderer.domElement.focus({preventScroll:true});
    state = 'playing';
    gameOver = false;
    paused = false;
    won = false;
    
    // Reset score
    score = 0;
    lives = 3;
    level = 1;
    currentWave = 1;
    
    // Clear scene
    clearScene();
    
    // Create background
    createBackground();
    createGrid();
    
    // Create player
    player = createPlayer();
    scene.add(player);
    
    // Update player light
    const playerLight = scene.getObjectByName('playerLight');
    if (playerLight) {
        playerLight.position.set(player.position.x, 10, player.position.z);
    }
    
    // Start first wave
    startWave();
    
    // Hide screens
    hideGameOverScreen();
    hideLevelCompleteScreen();
    hideMenu();
    updateCamera();
    
    // Reset keys
    Object.keys(keys).forEach(key=>delete keys[key]);
    audioContext?.resume().catch(()=>{});
    invulnerableUntil=performance.now()+1800;
    hidePauseScreen();
    canShoot = true;
    shootCooldown = 0;
}

function continueGame() {
    hideLevelCompleteScreen();
    startWave();
}

function removeGameObject(object){scene.remove(object);disposeObject(object)}
function disposeObject(object){
    object.traverse(child=>{
        child.geometry?.dispose();
        const materials=Array.isArray(child.material)?child.material:[child.material];
        materials.forEach(material=>{if(material){material.map?.dispose();material.dispose()}});
    });
}
function clearScene() {
    // Remove all game objects
    for(const child of [...scene.children]){
        if(child.isCamera||child.isLight)continue;
        disposeObject(child);scene.remove(child);
    }
    // Clear arrays
    bullets = [];
    enemies = [];
    enemyBullets = [];
    barriers = [];
    stars = [];
}

function startWave() {
    state='playing';level=currentWave;digitalAudio.setMusic(true,currentWave);
    for(const object of [...bullets,...enemyBullets,...barriers,...enemies]){scene.remove(object);disposeObject(object)}
    bullets=[];enemyBullets=[];barriers=[];enemies=[];
    currentWave = Math.min(currentWave, totalWaves);
    
    // Update wave display
    const waveDisplay = document.getElementById('wave-display');
    if (waveDisplay) {
        waveDisplay.textContent = `WAVE: ${currentWave}/${totalWaves}`;
    }
    
    // Create barriers
    createBarriers();
    
    // Create enemies
    createEnemies();
    
    // Set wave start time
    waveStartTime = Date.now();
    
    // Reset enemy movement
    enemyDirection = 1;
    enemyMoveDown = false;
    enemyMoveTimer = 0;
    
    playWaveSound();
}

function createBarriers() {
    barriers = [];
    
    // Create 4 barriers
    const barrierPositions = [
        { x: -18, z: -2 },
        { x: -6, z: -2 },
        { x: 6, z: -2 },
        { x: 18, z: -2 }
    ];
    
    barrierPositions.forEach(pos => {
        const barrier = createBarrier(pos.x, pos.z);
        scene.add(barrier);
        barriers.push(barrier);
    });
}

function createEnemies() {
    enemies = [];
    
    // Enemy formations
    const rows = 5;
    const cols = 8;
    const enemySpacing = 3;
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            // Skip some positions for different formations
            if (row === 0 && (col === 0 || col === cols - 1)) continue;
            if (row === rows - 1 && (col === 0 || col === cols - 1)) continue;
            
            const type = row + 1; // Different types per row
            const x = (col - cols / 2 + 0.5)*2.5;
            const z = 23 - row * enemySpacing;
            
            const enemy = createEnemy(type, x * CELL_SIZE, z);
            enemy.userData.row = row;
            enemy.userData.col = col;
            scene.add(enemy);
            enemies.push(enemy);
        }
    }
    
    enemiesRemaining = enemies.length;
}

function update(dt) {
    if (state !== 'playing' || paused || gameOver || won) return;
    
    const deltaTime = Math.min(dt,50)/1000;
    
    // Update player
    updatePlayer(deltaTime);
    
    // Update bullets
    updateBullets(deltaTime);
    
    // Update enemies
    updateEnemies(deltaTime);
    
    // Update enemy bullets
    updateEnemyBullets(deltaTime);
    
    // Update HUD
    updateHud();
    
    // Update camera
    updateCamera();
    
    // Check win condition
    checkWinCondition();
    
    // Update cooldown
    shootCooldown -= deltaTime;
    if (shootCooldown <= 0) {
        canShoot = true;
    }
}

function updatePlayer(deltaTime) {
    if (!player) return;
    
    // Move player
    // La caméra regarde depuis -Z : sa droite écran correspond à -X.
    const screenRight=camera.matrixWorld.elements[0]>=0?1:-1;
    if (keys.ArrowLeft || keys.KeyA || keys.KeyQ) {
        player.position.x -= screenRight * PLAYER_SPEED * deltaTime * 100;
    }
    if (keys.ArrowRight || keys.KeyD) {
        player.position.x += screenRight * PLAYER_SPEED * deltaTime * 100;
    }
    
    // Limit player position
    const minX = -GAME_WIDTH * CELL_SIZE / 2 + 2;
    const maxX = GAME_WIDTH * CELL_SIZE / 2 - 2;
    player.position.x = Math.max(minX, Math.min(maxX, player.position.x));
    
    // Update player light position
    const playerLight = scene.getObjectByName('playerLight');
    if (playerLight) {
        playerLight.position.set(player.position.x, 10, player.position.z);
        playerLight.lookAt(player.position.x, 0, player.position.z);
    }
    
    // Shoot
    if ((keys.Space || keys.KeyW || keys.KeyZ || keys.ArrowUp) && canShoot) {
        shoot();
    }
}

function shoot() {
    if (!player || !canShoot) return;
    
    // Create bullet
    const bullet = createBullet(
        player.position.x,
        player.position.z + 5
    );
    bullet.position.y = 1.5;
    
    scene.add(bullet);
    bullets.push(bullet);
    
    // Set cooldown
    canShoot = false;
    shootCooldown = 0.2; // 200ms cooldown
    
    playShootSound();
}

function updateBullets(deltaTime) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        
        // Move bullet
        bullet.position.z += BULLET_SPEED * deltaTime * 100;
        
        // Check if bullet is out of bounds
        if (bullet.position.z > 40) {
            removeGameObject(bullet);
            bullets.splice(i, 1);
            continue;
        }
        
        // Check for collisions with enemies
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            
            // Simple distance check
            const dx = bullet.position.x - enemy.position.x;
            const dz = bullet.position.z - enemy.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < 1.5) {
                // Hit enemy
                enemy.userData.health--;
                
                // Create explosion
                createExplosion(enemy.position.x, enemy.position.z, COLORS.enemy1);
                
                if (enemy.userData.health <= 0) {
                    // Enemy destroyed
                    score += enemy.userData.points * level;
                    enemiesRemaining--;
                    
                    removeGameObject(enemy);
                    enemies.splice(j, 1);
                }
                
                // Remove bullet
                removeGameObject(bullet);
                bullets.splice(i, 1);
                break;
            }
        }
        
        if(!bullets.includes(bullet))continue;
        // Check for collisions with barriers
        for (let k = barriers.length - 1; k >= 0; k--) {
            const barrier = barriers[k];
            
            // Check each block in barrier
            if (barrier.userData && barrier.userData.blocks) {
                for (let l = barrier.userData.blocks.length - 1; l >= 0; l--) {
                    const block = barrier.userData.blocks[l];
                    
                    const dx = bullet.position.x - (barrier.position.x + block.position.x);
                    const dy = bullet.position.y - (barrier.position.y + block.position.y);
                    const dz = bullet.position.z - (barrier.position.z + block.position.z);
                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    
                    if (distance < 1) {
                        // Hit barrier
                        block.userData.health--;
                        
                        if (block.userData.health <= 0) {
                            barrier.remove(block);disposeObject(block);
                            barrier.userData.blocks.splice(l, 1);
                        }
                        
                        removeGameObject(bullet);
                        bullets.splice(i, 1);
                        break;
                    }
                }
            }
        }
    }
}

function updateEnemies(deltaTime) {
    if (enemies.length === 0) return;
    
    // Move enemies
    enemyMoveTimer += deltaTime;
    
    const moveSpeed = ENEMY_MOVE_SPEED * (1 + level * 0.1);
    const moveDistance = enemyDirection * moveSpeed * deltaTime * 100;
    
    // Check if any enemy would go out of bounds
    let canMove = true;
    const minX = -GAME_WIDTH * CELL_SIZE / 2 + 2;
    const maxX = GAME_WIDTH * CELL_SIZE / 2 - 2;
    
    for (const enemy of enemies) {
        const newX = enemy.position.x + moveDistance;
        if (newX < minX || newX > maxX) {
            canMove = false;
            break;
        }
    }
    
    if (canMove) {
        // Move all enemies
        for (const enemy of enemies) {
            enemy.position.x += moveDistance;
        }
        
        if (enemyMoveTimer >= 2) {
            enemyMoveTimer = 0;
        }
    } else {
        // Move down
        enemyMoveDown = true;
        enemyDirection *= -1;
        
        for (const enemy of enemies) {
            enemy.position.z -= ENEMY_DROP_SPEED * deltaTime * 100;
        }
    }
    
    // Check if any enemy has reached the bottom
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        
        if (enemy.position.z <= -GAME_DEPTH * CELL_SIZE / 2 + 10) {
            // Enemy reached bottom - game over
            lives--;
            
            if (lives <= 0) {
                gameOver = true;
                playDeathSound();
                showGameOverScreen();
            }
            
            removeGameObject(enemy);
            enemies.splice(i, 1);enemiesRemaining=enemies.length;
        }
    }
    
    // Random enemy shooting
    if (Math.random() < 1-Math.exp(-ENEMY_SHOOT_PROBABILITY * enemies.length * 60 * deltaTime)) {
        // Find a random enemy that can shoot
        const shootingEnemies = enemies.filter(e => {
            // Only enemies in the front rows can shoot
            return e.userData.row >= 3;
        });
        
        if (shootingEnemies.length > 0) {
            const shooter = shootingEnemies[Math.floor(Math.random() * shootingEnemies.length)];
            
            // Create enemy bullet
            const bullet = createBullet(shooter.position.x, shooter.position.z, false);
            bullet.position.y = -0.5;
            
            scene.add(bullet);
            enemyBullets.push(bullet);
        }
    }
}

function updateEnemyBullets(deltaTime) {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const bullet = enemyBullets[i];
        
        // Move bullet down
        bullet.position.z -= BULLET_SPEED * deltaTime * 100;
        
        // Check if bullet is out of bounds
        if (bullet.position.z < -GAME_DEPTH * CELL_SIZE / 2) {
            removeGameObject(bullet);
            enemyBullets.splice(i, 1);
            continue;
        }
        
        // Check for collision with player
        if (player) {
            const dx = bullet.position.x - player.position.x;
            const dz = bullet.position.z - player.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < 2 && performance.now()>=invulnerableUntil) {
                invulnerableUntil=performance.now()+1800;
                // Player hit
                lives--;
                
                if (lives <= 0) {
                    gameOver = true;
                    playDeathSound();
                    showGameOverScreen();
                }
                
                // Create explosion
                createExplosion(bullet.position.x, bullet.position.z, COLORS.bullet);
                
                removeGameObject(bullet);
                enemyBullets.splice(i, 1);
            }
        }
        
        if(!enemyBullets.includes(bullet))continue;
        // Check for collisions with barriers
        for (let k = barriers.length - 1; k >= 0; k--) {
            const barrier = barriers[k];
            
            if (barrier.userData && barrier.userData.blocks) {
                for (let l = barrier.userData.blocks.length - 1; l >= 0; l--) {
                    const block = barrier.userData.blocks[l];
                    
                    const dx = bullet.position.x - (barrier.position.x + block.position.x);
                    const dy = bullet.position.y - (barrier.position.y + block.position.y);
                    const dz = bullet.position.z - (barrier.position.z + block.position.z);
                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    
                    if (distance < 1) {
                        // Hit barrier
                        block.userData.health--;
                        
                        if (block.userData.health <= 0) {
                            barrier.remove(block);
                            barrier.userData.blocks.splice(l, 1);
                        }
                        
                        removeGameObject(bullet);
                        enemyBullets.splice(i, 1);
                        break;
                    }
                }
            }
        }
    }
}

function checkWinCondition() {
    if (enemiesRemaining <= 0 && currentWave < totalWaves) {
        currentWave++;
        state='wavecomplete';digitalAudio.setMusic(false);digitalAudio.sfx.powerup();
        showLevelCompleteScreen();
    } else if (enemiesRemaining <= 0 && currentWave >= totalWaves) {
        won = true;
        gameOver = true;
        showGameOverScreen();
    }
}

function updateCamera() {
    // Camera follow action
    camera.position.x = 0;
    camera.position.y = 34 + Math.sin(Date.now() * 0.0005) * 1.5;
    camera.position.z = -42 + Math.cos(Date.now() * 0.0003) * 1.5;
    camera.lookAt(0, 0, 8);
}

// ============================================
// INPUT HANDLING
// ============================================

function initControls() {
    const stopInput=()=>{Object.keys(keys).forEach(key=>delete keys[key]);if(state==='playing'&&!paused&&!gameOver)togglePause()};
    window.addEventListener('blur',stopInput);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stopInput()});
    document.addEventListener('keydown', (e) => {
        if(state==='menu'&&['Enter','Space'].includes(e.code)){e.preventDefault();startGame();return;}
        if(['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code))e.preventDefault();
        if(e.repeat&&['Escape','KeyP','KeyR'].includes(e.code))return;
        keys[e.code] = true;
        audioContext?.resume().catch(()=>{});
        
        // Handle special keys
        switch(e.code) {
            case 'Escape':
            case 'KeyP':
                togglePause();
                break;
            case 'KeyR':
                if (gameOver) {
                    startGame();
                }
                break;
            case 'KeyM':
                if (state === 'menu') {
                    startGame();
                }
                break;
        }
    });
    
    document.addEventListener('keyup', (e) => {
        keys[e.code] = false;
    });
}

function togglePause() {
    if(state!=='playing'||gameOver)return;
    paused = !paused;
    digitalAudio.setMusic(!paused,currentWave);
    if (paused) {
        showPauseScreen();
    } else {
        hidePauseScreen();
    }
}

// ============================================
// UI
// ============================================

function createHud() {
    // HUD géré par HTML/CSS
}

function updateHud() {
    const stamp=[score,lives,level].join(':');if(stamp===hudStamp)return;hudStamp=stamp;
    const scoreDisplay = document.getElementById('score-display');
    if (scoreDisplay) {
        scoreDisplay.textContent = `SCORE: ${score.toLocaleString()}`;
    }
    
    const livesDisplay = document.getElementById('lives-display');
    if (livesDisplay) {
        let livesHtml = 'LIVES: ';
        for (let i = 0; i < lives; i++) {
            livesHtml += '<span class="life-icon"></span>';
        }
        livesDisplay.innerHTML = livesHtml;
    }
    
    const levelDisplay = document.getElementById('level-display');
    if (levelDisplay) {
        levelDisplay.textContent = `LEVEL: ${level}`;
    }
    
    // Update high score
    if (score > highScore) {
        highScore = score;
        try {
            localStorage.setItem('spaceInvaders3dUltraHS', highScore.toString());
        } catch(e){}
    }
}

function showMenu() {
    const menu = document.getElementById('menu-screen');
    if (menu) {
        menu.style.display = 'flex';
    }
}

function hideMenu() {
    const menu = document.getElementById('menu-screen');
    if (menu) {
        menu.style.display = 'none';
    }
}

function showGameOverScreen() {
    digitalAudio.setMusic(false);
    digitalAudio.sfx.playerExplosion();
    const gameOverScreen = document.getElementById('game-over-screen');
    if (gameOverScreen) {
        gameOverScreen.style.display = 'flex';
        document.getElementById('final-score').textContent = `SCORE: ${score.toLocaleString()}`;
        document.getElementById('high-score').textContent = `HIGH SCORE: ${highScore.toLocaleString()}`;
        
        if (won) {
            document.getElementById('game-over-title').textContent = 'VICTORY!';
        } else {
            document.getElementById('game-over-title').textContent = 'GAME OVER';
        }
    }
}

function hideGameOverScreen() {
    const gameOverScreen = document.getElementById('game-over-screen');
    if (gameOverScreen) {
        gameOverScreen.style.display = 'none';
    }
}

function showLevelCompleteScreen() {
    const levelCompleteScreen = document.getElementById('level-complete-screen');
    if (levelCompleteScreen) {
        levelCompleteScreen.style.display = 'flex';
        document.getElementById('level-complete-text').textContent = `Wave ${currentWave - 1} terminée! Prêt pour la suivante?`;
    }
}

function hideLevelCompleteScreen() {
    const levelCompleteScreen = document.getElementById('level-complete-screen');
    if (levelCompleteScreen) {
        levelCompleteScreen.style.display = 'none';
    }
}

function showPauseScreen() {
    const pauseScreen = document.getElementById('pause-screen');
    if (pauseScreen) {
        pauseScreen.style.display = 'flex';
    }
}

function hidePauseScreen() {
    const pauseScreen = document.getElementById('pause-screen');
    if (pauseScreen) {
        pauseScreen.style.display = 'none';
    }
}

// ============================================
// RENDER
// ============================================

function render() {
    requestAnimationFrame(render);
    
    const deltaTime = Math.min(clock.getDelta(),.05);
    if(document.hidden)return;
    
    // Update game logic
    update(deltaTime * 1000);
    
    // Render scene
    renderer.render(scene, camera);
}

// ============================================
// START
// ============================================

// Start the game when the script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Fallback start
setTimeout(() => {
    if (state === 'loading') {
        init();
    }
}, 100);

window.SPACE_INVADERS_3D_ULTRA={startGame,continueGame,togglePause,
    getScore:()=>score,getLevel:()=>level,getLives:()=>lives,
    state:()=>({state,paused,score,lives,wave:currentWave,enemies:enemies.length,bullets:bullets.length,player:player?{x:player.position.x,z:player.position.z}:null,screenX:player?player.position.clone().project(camera).x:null,drawCalls:renderer?.info.render.calls})};
})();
