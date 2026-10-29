// ============================================
// ASTEROIDS 3D ULTRA - Jeu spatial 3D avec Three.js
// Vaisseau ultra-réactif, astéroïdes réalistes, explosions spectaculaires
// By Manix - KITT FRANCO BELGE - 2026
// Version améliorée avec effets 3D avancés, fluidité maximale et graphismes premium
// ============================================

(function () {
'use strict';

// Configuration améliorée
const SPACE_SIZE = 1200;
const MAX_ASTEROIDS = 30;
const MAX_BULLETS = 15;
const MAX_PARTICLES = 800;
const MAX_EXPLOSIONS = 20;
const QUALITY_SETTINGS = {
    shadows: true,
    antialias: true,
    bloom: true,
    particleCount: 1.0,
    textureQuality: 'high',
    effects: true
};

// Game state
let scene, camera, renderer, composer, bloomPass;
let ship, asteroids = [], bullets = [], particles = [], explosions = [], powerups = [];
let clock;
let backgroundStars = [];
let nebulae = [];

let state = 'loading';
let score = 0, lives = 3, level = 1, highScore = 0;
let gameOver = false, paused = false, won = false;
let shieldUntil = 0, rapidFireUntil = 0, hitsChain = 0, lastHitAt = 0;

// Ship state
let shipPosition, shipVelocity;
let shipRotation = 0;
let shipTargetRotation = 0;
let shipThrusting = false;
let shipInvulnerable = false;
let invulnerableTimer = 0;
let shipAcceleration = 0;

// Controls
const keys = {};
let mouseX = 0, mouseY = 0;

// Colors améliorées
const COLORS = {
    bg: 0x000000,
    star: 0xffffff,
    starHot: 0xff8800,
    starCool: 0x4488ff,
    ship: 0x63e9ff,
    shipGlow: 0x88f4ff,
    shipThrust: 0x44aaff,
    shipShield: 0x00ff88,
    asteroid: 0x3a281c,
    asteroidGlow: 0x5a483c,
    asteroidRock: 0x5a483c,
    asteroidDark: 0x1a1208,
    bullet: 0xffcc44,
    bulletGlow: 0xffee66,
    explosion: 0xff4444,
    explosionGlow: 0xff8888,
    explosionCore: 0xffffff,
    nebulaBlue: 0x4488ff,
    nebulaPurple: 0x8844ff,
    nebulaPink: 0xff4488,
    hud: 0x63e9ff,
    text: 0xffffff,
    gold: 0xffd700,
    warning: 0xff4444
};

// Ship settings améliorées
const SHIP_SPEED = 8;
const SHIP_ROTATION_SPEED = 4;
const SHIP_THUST_SPEED = 0.5;
const SHIP_FRICTION = 0.97;
const SHIP_MAX_SPEED = 15;

// Asteroid settings améliorées
const ASTEROID_SPEED = { small: 3, medium: 2, large: 1 };
const ASTEROID_SCALE = { small: 0.4, medium: 0.8, large: 1.5 };
const ASTEROID_POINTS = { small: 200, medium: 100, large: 50 };
const ASTEROID_SPIN = { small: 2, medium: 1, large: 0.5 };

// Bullet settings améliorées
const BULLET_SPEED = 20;
const BULLET_LIFETIME = 3;
const BULLET_DAMAGE = 1;

// ============================================
// EFFETS SONORES
// ============================================

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const audioCache = {};

function createOscillator(freq, type, gain) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = type || 'sine';
    oscillator.frequency.value = freq || 440;
    gainNode.gain.value = gain || 0.1;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    return { oscillator, gainNode };
}

function playThrustSound() {
    if (!QUALITY_SETTINGS.effects) return;
    const freq = 100 + Math.random() * 50;
    const { oscillator, gainNode } = createOscillator(freq, 'sawtooth', 0.05);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
    oscillator.stop(audioContext.currentTime + 0.3);
}

function playShootSound() {
    if (!QUALITY_SETTINGS.effects) return;
    const freq = 800 + Math.random() * 200;
    const { oscillator, gainNode } = createOscillator(freq, 'sine', 0.08);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
    oscillator.stop(audioContext.currentTime + 0.1);
    
    // Second harmonique
    const freq2 = freq * 1.5;
    const { oscillator: osc2, gainNode: gain2 } = createOscillator(freq2, 'sine', 0.04);
    osc2.start();
    gain2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
    osc2.stop(audioContext.currentTime + 0.1);
}

function playExplosionSound(size) {
    if (!QUALITY_SETTINGS.effects) return;
    const freq = size === 'large' ? 150 : size === 'medium' ? 200 : 250;
    const { oscillator, gainNode } = createOscillator(freq, 'sine', 0.15);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
    oscillator.stop(audioContext.currentTime + 0.5);
    
    // Noise pour l'explosion
    const noise = audioContext.createBufferSource();
    const buffer = audioContext.createBuffer(1, 0.5, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    noise.buffer = buffer;
    const noiseGain = audioContext.createGain();
    noiseGain.gain.value = 0.05;
    noise.connect(noiseGain);
    noiseGain.connect(audioContext.destination);
    noise.start();
    noiseGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
}

function playCollisionSound() {
    if (!QUALITY_SETTINGS.effects) return;
    const freq = 400 + Math.random() * 200;
    const { oscillator, gainNode } = createOscillator(freq, 'sawtooth', 0.06);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
    oscillator.stop(audioContext.currentTime + 0.2);
}

// ============================================
// INITIALIZATION
// ============================================

let initialized = false;
function init() {
    if (initialized) return;
    initialized = true;
    initThreeJS();
    initControls();
    createHud();
    
    // Charger le high score
    try { 
        highScore = Number(localStorage.getItem('asteroids3dUltraHS')) || 0; 
    } catch(e){}
    
    state = 'loading';
    showLoadingScreen();
    
    // Démarrer le jeu automatiquement après chargement
    setTimeout(() => {
        state = 'menu';
        hideLoadingScreen();
        showMenu();
        render();
    }, 1000);
}

function initThreeJS() {
    // Scene
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.bg);
    scene.fog = new THREE.FogExp2(COLORS.bg, 0.0003);
    
    // Camera améliorée
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, SPACE_SIZE * 3);
    camera.position.set(0, 0, 100);
    camera.lookAt(0, 0, 0);
    
    // Renderer avec antialiasing
    renderer = new THREE.WebGLRenderer({ 
        antialias: QUALITY_SETTINGS.antialias,
        alpha: true, 
        powerPreference: "high-performance",
        precision: "highp"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = QUALITY_SETTINGS.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputEncoding = THREE.sRGBEncoding;
    
    // Bloomer Pass pour des effets lumineux améliorés
    if (QUALITY_SETTINGS.bloom) {
        try {
            const { EffectComposer } = THREE;
            const { UnrealBloomPass } = THREE;
            composer = new EffectComposer(renderer);
            composer.setSize(window.innerWidth, window.innerHeight);
            
            const renderPass = new THREE.RenderPass(scene, camera);
            bloomPass = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth, window.innerHeight),
                1.5,  // strength
                0.4,  // radius
                0.85  // threshold
            );
            
            composer.addPass(renderPass);
            composer.addPass(bloomPass);
        } catch (e) {
            console.log("Bloom effect not available, using standard renderer");
            composer = null;
        }
    }
    
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.appendChild(composer ? composer.domElement : renderer.domElement);
    } else {
        document.body.appendChild(composer ? composer.domElement : renderer.domElement);
    }
    
    // Lights améliorées
    const ambientLight = new THREE.AmbientLight(0x444466, 0.4);
    scene.add(ambientLight);
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(1, 1, 1);
    directionalLight1.castShadow = QUALITY_SETTINGS.shadows;
    directionalLight1.shadow.mapSize.width = 2048;
    directionalLight1.shadow.mapSize.height = 2048;
    scene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0xff8844, 0.3);
    directionalLight2.position.set(-1, -1, -1);
    scene.add(directionalLight2);
    
    // Lumière du vaisseau
    const shipLight = new THREE.PointLight(COLORS.shipGlow, 2, 100);
    shipLight.name = 'shipLight';
    scene.add(shipLight);
    
    // Create space background amélioré
    createBackground();
    
    // Resize handler
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    if (composer) {
        composer.setSize(window.innerWidth, window.innerHeight);
        bloomPass.resolution.set(window.innerWidth, window.innerHeight);
    }
}

function createBackground() {
    // Starfield - multiple layers pour profondeur
    for(let layer = 0; layer < 4; layer++) {
        const starCount = layer === 0 ? 3000 : layer === 1 ? 2000 : layer === 2 ? 1000 : 500;
        const starSize = layer === 0 ? 0.1 : layer === 1 ? 0.15 : layer === 2 ? 0.25 : 0.4;
        const starDistance = layer === 0 ? SPACE_SIZE * 3 : 
                          layer === 1 ? SPACE_SIZE * 2.5 : 
                          layer === 2 ? SPACE_SIZE * 2 : SPACE_SIZE * 1.5;
        
        const starGeometry = new THREE.BufferGeometry();
        const starVertices = [];
        const starColors = [];
        
        for(let i = 0; i < starCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * starDistance;
            const x = Math.cos(angle) * distance;
            const y = (Math.random() - 0.5) * starDistance * 0.8;
            const z = Math.sin(angle) * distance;
            
            starVertices.push(x, y, z);
            
            // Couleur des étoiles avec variation
            const colorVariation = Math.random();
            let r, g, b;
            
            if (colorVariation < 0.3) {
                // Étoiles chaudes (orange/rouge)
                r = 0.8 + Math.random() * 0.2;
                g = 0.4 + Math.random() * 0.3;
                b = 0.1 + Math.random() * 0.2;
            } else if (colorVariation < 0.6) {
                // Étoiles froides (bleu/blanc)
                r = 0.6 + Math.random() * 0.4;
                g = 0.8 + Math.random() * 0.2;
                b = 1.0;
            } else {
                // Étoiles neutres (blanc)
                r = 0.9 + Math.random() * 0.1;
                g = 0.9 + Math.random() * 0.1;
                b = 0.9 + Math.random() * 0.1;
            }
            
            starColors.push(r, g, b);
        }
        
        starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
        starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
        
        const starMaterial = new THREE.PointsMaterial({
            size: starSize,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending
        });
        
        const stars = new THREE.Points(starGeometry, starMaterial);
        stars.name = `stars_${layer}`;
        backgroundStars.push(stars);
        scene.add(stars);
    }
    
    // Nébuleuses améliorées
    createNebulae();
    
    // Grille de référence subtile
    createGrid();
}

function createGrid() {
    const gridSize = SPACE_SIZE * 2;
    const gridDivisions = 20;
    
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x112244, 0x081220);
    gridHelper.name = 'grid';
    gridHelper.position.y = -100;
    scene.add(gridHelper);
}

function createNebulae() {
    // Les textures ont un vrai canal alpha : les anciennes cartes opaques dessinaient des panneaux devant le champ.
    const palettes = [[70, 135, 255], [163, 76, 255], [44, 214, 235], [245, 93, 142]];
    for (let i = 0; i < palettes.length; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext('2d');
        const [r, g, b] = palettes[i];
        for (let cloud = 0; cloud < 18; cloud++) {
            const x = 100 + Math.random() * 312;
            const y = 100 + Math.random() * 312;
            const radius = 45 + Math.random() * 115;
            const alpha = 0.035 + Math.random() * 0.055;
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
            gradient.addColorStop(0.48, `rgba(${r},${g},${b},${alpha * 0.55})`);
            gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
            ctx.fillStyle = gradient;
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.SpriteMaterial({ map: texture, color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
        const nebula = new THREE.Sprite(material);
        const size = SPACE_SIZE * (0.36 + Math.random() * 0.22);
        nebula.scale.set(size, size * (0.62 + Math.random() * 0.5), 1);
        const side = i % 2 ? 1 : -1;
        const offset = new THREE.Vector3(side * (300 + Math.random() * 250), (Math.random() - 0.5) * 470, -900 - i * 175);
        nebula.position.copy(shipPosition || new THREE.Vector3()).add(offset);
        nebula.userData.offset = offset;
        nebula.name = `nebula_${i}`;
        nebulae.push(nebula);
        scene.add(nebula);
    }
}
function createShip() {
    const group = new THREE.Group();
    group.name = 'ship';
    
    // Ship body (triangular) - amélioré
    const bodyGeometry = new THREE.ConeGeometry(2, 4, 4, 1);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.ship,
        emissive: COLORS.shipGlow,
        emissiveIntensity: 0.4,
        roughness: 0.2,
        metalness: 0.5,
        envMapIntensity: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    
    // Ship detail (cockpit) - amélioré
    const cockpitGeometry = new THREE.SphereGeometry(1, 16, 16);
    const cockpitMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.ship,
        emissive: COLORS.shipGlow,
        emissiveIntensity: 0.8,
        roughness: 0.1,
        metalness: 0.6,
        transparent: true,
        opacity: 0.9
    });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.set(0, 0, -1.5);
    cockpit.castShadow = true;
    group.add(cockpit);
    
    // Cockpit glass
    const glassGeometry = new THREE.SphereGeometry(1.1, 16, 16);
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0x88eeff,
        transparent: true,
        opacity: 0.3,
        roughness: 0.05,
        metalness: 0.1,
        transmission: 0.8,
        thickness: 0.2
    });
    const glass = new THREE.Mesh(glassGeometry, glassMaterial);
    glass.position.set(0, 0, -1.5);
    group.add(glass);
    
    // Engine glow amélioré
    const engineGeometry = new THREE.ConeGeometry(0.6, 1.5, 8, 1);
    const engineMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.shipThrust,
        transparent: true,
        opacity: 0
    });
    const engine = new THREE.Mesh(engineGeometry, engineMaterial);
    engine.position.set(0, 0, 2);
    engine.rotation.x = Math.PI;
    engine.name = 'engine';
    group.add(engine);
    
    // Ship wings améliorés
    const wingGeometry = new THREE.BoxGeometry(2.5, 0.3, 0.6);
    const wingMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.ship,
        emissive: COLORS.shipGlow,
        emissiveIntensity: 0.3,
        roughness: 0.3,
        metalness: 0.4,
        envMapIntensity: 0.2
    });
    
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
    leftWing.position.set(-1.2, 0, -0.8);
    leftWing.rotation.z = Math.PI / 4;
    leftWing.castShadow = true;
    group.add(leftWing);
    
    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
    rightWing.position.set(1.2, 0, -0.8);
    rightWing.rotation.z = -Math.PI / 4;
    rightWing.castShadow = true;
    group.add(rightWing);
    
    // Shield effect (invisible par défaut)
    const shieldGeometry = new THREE.SphereGeometry(3, 16, 16);
    const shieldMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.shipShield,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        wireframe: true
    });
    const shield = new THREE.Mesh(shieldGeometry, shieldMaterial);
    shield.name = 'shield';
    shield.position.set(0, 0, -1);
    group.add(shield);
    
    // Light source pour le vaisseau
    const lightSource = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 8, 8),
        new THREE.MeshBasicMaterial({ color: COLORS.shipGlow, emissive: COLORS.shipGlow, emissiveIntensity: 2 })
    );
    lightSource.position.set(0, 0, -2);
    lightSource.name = 'shipLightSource';
    group.add(lightSource);
    
    return group;
}

function createAsteroid(size, position = null, velocity = null) {
    const group = new THREE.Group();
    group.name = 'asteroid';
    
    // Random asteroid shape amélioré
    const radius = 2 * ASTEROID_SCALE[size];
    const segments = size === 'large' ? 32 : size === 'medium' ? 24 : 16;
    
    // Créer une géométrie d'astéroïde irrégulière
    const geometry = new THREE.SphereGeometry(radius, segments, segments);
    
    // Déformer la sphère pour créer une forme irrégulière
    const positionAttribute = geometry.attributes.position;
    for(let i = 0; i < positionAttribute.count; i++) {
        const x = positionAttribute.getX(i);
        const y = positionAttribute.getY(i);
        const z = positionAttribute.getZ(i);
        
        // Calculer la distance du centre
        const distance = Math.sqrt(x * x + y * y + z * z);
        
        // Ajouter du bruit de Perlin-like
        const noiseX = Math.sin(x * 2) * Math.cos(y * 2) * Math.sin(z * 2);
        const noiseY = Math.cos(x * 2) * Math.sin(y * 2) * Math.cos(z * 2);
        const noiseZ = Math.sin(x * 2) * Math.cos(z * 2);
        const noise = (noiseX + noiseY + noiseZ) * 0.3;
        
        // Appliquer la déformation
        const deformFactor = 0.2 + (1 - distance / radius) * 0.3;
        const newX = x * (1 + noise * deformFactor);
        const newY = y * (1 + noise * deformFactor);
        const newZ = z * (1 + noise * deformFactor);
        
        positionAttribute.setXYZ(i, newX, newY, newZ);
    }
    
    // Appliquer les normales après déformation
    geometry.computeVertexNormals();
    
    // Matériau amélioré pour l'astéroïde
    const material = new THREE.MeshStandardMaterial({
        color: COLORS.asteroid,
        roughness: 0.9,
        metalness: 0.05,
        normalMap: createNormalMap(),
        normalMapType: THREE.TangentSpaceNormalMap,
        normalScale: new THREE.Vector2(1.5, 1.5),
        aoMap: createAsteroidAOMap(),
        aoMapIntensity: 0.5
    });
    
    const asteroid = new THREE.Mesh(geometry, material);
    asteroid.castShadow = true;
    asteroid.receiveShadow = true;
    group.add(asteroid);
    
    // Craters améliorés
    const craterCount = size === 'large' ? 8 : size === 'medium' ? 5 : 3;
    for(let i = 0; i < craterCount; i++) {
        const craterGeometry = new THREE.ConeGeometry(
            radius * (0.2 + Math.random() * 0.4),
            radius * (0.3 + Math.random() * 0.4),
            24
        );
        const craterMaterial = new THREE.MeshStandardMaterial({
            color: COLORS.asteroidDark,
            roughness: 1.0,
            metalness: 0.0,
            normalMap: createNormalMap(),
            normalScale: new THREE.Vector2(0.8, 0.8)
        });
        const crater = new THREE.Mesh(craterGeometry, craterMaterial);
        
        // Position aléatoire sur la surface de l'astéroïde
        const angle1 = Math.random() * Math.PI * 2;
        const angle2 = Math.acos(2 * Math.random() - 1);
        const craterRadius = radius * (0.7 + Math.random() * 0.2);
        
        crater.position.set(
            Math.cos(angle1) * Math.sin(angle2) * craterRadius,
            Math.cos(angle2) * craterRadius,
            Math.sin(angle1) * Math.sin(angle2) * craterRadius
        );
        
        // Orientation vers l'extérieur
        const normal = new THREE.Vector3(
            Math.cos(angle1) * Math.sin(angle2),
            Math.cos(angle2),
            Math.sin(angle1) * Math.sin(angle2)
        ).normalize();
        crater.lookAt(normal.multiplyScalar(-1));
        
        group.add(crater);
    }
    
    // Détails de surface (rochers individuels)
    if (size !== 'small') {
        const rockCount = size === 'large' ? 15 : 8;
        for (let i = 0; i < rockCount; i++) {
            const rockSize = radius * (0.05 + Math.random() * 0.15);
            const rockGeometry = new THREE.BoxGeometry(rockSize, rockSize, rockSize * 2);
            const rockMaterial = new THREE.MeshStandardMaterial({
                color: COLORS.asteroidRock,
                roughness: 0.8,
                metalness: 0.05
            });
            const rock = new THREE.Mesh(rockGeometry, rockMaterial);
            
            // Position aléatoire sur la surface
            const angle1 = Math.random() * Math.PI * 2;
            const angle2 = Math.acos(2 * Math.random() - 1);
            const rockRadius = radius * (0.8 + Math.random() * 0.15);
            
            rock.position.set(
                Math.cos(angle1) * Math.sin(angle2) * rockRadius,
                Math.cos(angle2) * rockRadius,
                Math.sin(angle1) * Math.sin(angle2) * rockRadius
            );
            
            // Rotation aléatoire
            rock.rotation.set(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            );
            
            group.add(rock);
        }
    }
    
    // Effet de lueur subtile
    const glowGeometry = new THREE.SphereGeometry(radius * 1.1, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.asteroidGlow,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.name = 'asteroidGlow';
    group.add(glow);
    
    // Set initial position
    if(position) {
        group.position.copy(position);
    } else {
        // Spawn at edge of space
        const angle = Math.random() * Math.PI * 2;
        const distance = SPACE_SIZE * (0.8 + Math.random() * 0.2);
        group.position.set(
            Math.cos(angle) * distance,
            (Math.random() - 0.5) * SPACE_SIZE * 0.2,
            Math.sin(angle) * distance
        );
    }
    
    // Set initial velocity
    if(velocity) {
        group.userData.velocity = velocity.clone();
    } else {
        // Random velocity towards center
        const angle = Math.random() * Math.PI * 2;
        const direction = new THREE.Vector3(
            -Math.cos(angle),
            (Math.random() - 0.5) * 0.3,
            -Math.sin(angle)
        ).normalize();
        const speed = ASTEROID_SPEED[size] * (0.8 + Math.random() * 0.4);
        group.userData.velocity = direction.multiplyScalar(speed);
    }
    
    group.userData = {
        size: size,
        health: size === 'large' ? 3 : size === 'medium' ? 2 : 1,
        rotation: new THREE.Vector3(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        ),
        rotationSpeed: new THREE.Vector3(
            (Math.random() - 0.5) * ASTEROID_SPIN[size],
            (Math.random() - 0.5) * ASTEROID_SPIN[size],
            (Math.random() - 0.5) * ASTEROID_SPIN[size]
        )
    };
    
    return group;
}

function createAsteroidTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Fill with base color
    ctx.fillStyle = '#3a281c';
    ctx.fillRect(0, 0, 512, 512);
    
    // Add random craters and details
    for(let i = 0; i < 30; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = 15 + Math.random() * 40;
        
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
        gradient.addColorStop(0, '#5a483c');
        gradient.addColorStop(0.7, '#4a382c');
        gradient.addColorStop(1, '#2a180c');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Add highlights
    for(let i = 0; i < 15; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = 8 + Math.random() * 20;
        
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Add dark shadows
    for(let i = 0; i < 20; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = 10 + Math.random() * 30;
        
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 16;
    return texture;
}

function createAsteroidAOMap() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    const imageData = ctx.createImageData(256, 256);
    const data = imageData.data;
    
    for(let y = 0; y < 256; y++) {
        for(let x = 0; x < 256; x++) {
            const index = (y * 256 + x) * 4;
            
            // Simple AO based on position
            const cx = x / 256 - 0.5;
            const cy = y / 256 - 0.5;
            const distance = Math.sqrt(cx * cx + cy * cy);
            
            // Darker at edges (more occlusion)
            const ao = 0.3 + (0.7 - distance) * 0.7;
            
            data[index] = ao * 255;
            data[index + 1] = ao * 255;
            data[index + 2] = ao * 255;
            data[index + 3] = 255;
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
    return new THREE.CanvasTexture(canvas);
}

function createNormalMap() {
    // Simple procedural normal map
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    const imageData = ctx.createImageData(256, 256);
    const data = imageData.data;
    
    for(let y = 0; y < 256; y++) {
        for(let x = 0; x < 256; x++) {
            const index = (y * 256 + x) * 4;
            
            // Improved noise-based normals
            const nx = Math.sin(x * 0.2) * Math.cos(y * 0.2) * 0.8;
            const ny = Math.cos(x * 0.15) * Math.sin(y * 0.15) * 0.6;
            const nz = Math.sin(x * 0.1 + y * 0.1) * 0.4;
            
            // Normalize
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            
            // Convert normal to RGB (0-255)
            data[index] = ((nx / len + 1) / 2) * 255;
            data[index + 1] = ((ny / len + 1) / 2) * 255;
            data[index + 2] = ((nz / len + 1) / 2) * 255;
            data[index + 3] = 255;
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
    return new THREE.CanvasTexture(canvas);
}

function createBullet() {
    const group = new THREE.Group();
    group.name = 'bullet';
    
    // Bullet body
    const geometry = new THREE.CylinderGeometry(0.15, 0.1, 1.2, 8);
    const material = new THREE.MeshStandardMaterial({
        color: COLORS.bullet,
        emissive: COLORS.bulletGlow,
        emissiveIntensity: 0.8,
        roughness: 0.1,
        metalness: 0.7,
        envMapIntensity: 0.3
    });
    
    const bullet = new THREE.Mesh(geometry, material);
    bullet.castShadow = false;
    group.add(bullet);
    
    // Trail effect amélioré
    const trailGeometry = new THREE.ConeGeometry(0.25, 0.8, 8, 1);
    const trailMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.bulletGlow,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    const trail = new THREE.Mesh(trailGeometry, trailMaterial);
    trail.position.z = -0.6;
    trail.rotation.x = Math.PI;
    trail.name = 'trail';
    group.add(trail);
    
    // Light effect
    const light = new THREE.PointLight(COLORS.bulletGlow, 1, 10);
    light.position.z = 0.6;
    light.name = 'bulletLight';
    group.add(light);
    
    // Muzzle flash (invisible par défaut)
    const flashGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const flashMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.bulletGlow,
        transparent: true,
        opacity: 0
    });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.z = 0.6;
    flash.name = 'flash';
    group.add(flash);
    
    return group;
}

function createPowerup(position, type) {
    const group = new THREE.Group();
    const color = type === 'shield' ? COLORS.shipShield : COLORS.bulletGlow;
    const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.05, 0),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, metalness: 0.35, roughness: 0.22 })
    );
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.45, 0.1, 8, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(core, ring);
    const light = new THREE.PointLight(color, 1.8, 12);
    group.add(light);
    group.position.copy(position);
    group.userData = { kind: type, life: 12, ring };
    scene.add(group);
    powerups.push(group);
}

function createExplosion(position, size = 'medium') {
    const explosionParticles = [];
    const explosionLights = [];
    const particleCount = size === 'large' ? 40 : size === 'medium' ? 25 : 15;
    
    // Main explosion sphere
    const explosionGeometry = new THREE.SphereGeometry(
        size === 'large' ? 3 : size === 'medium' ? 2 : 1, 
        16, 16
    );
    const explosionMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.explosion,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    
    const explosionMesh = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosionMesh.position.copy(position);
    explosionMesh.name = 'explosion';
    explosionMesh.userData = {
        life: 1,
        maxLife: 1,
        size: size
    };
    scene.add(explosionMesh);
    
    // Light for explosion
    const light = new THREE.PointLight(COLORS.explosionCore, 2, 50);
    light.position.copy(position);
    light.name = 'explosionLight';
    scene.add(light);
    explosionLights.push(light);
    
    // Core flash
    const coreGeometry = new THREE.SphereGeometry(
        size === 'large' ? 1 : size === 'medium' ? 0.7 : 0.5, 
        8, 8
    );
    const coreMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.explosionCore,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.position.copy(position);
    core.name = 'explosionCore';
    scene.add(core);
    
    // Particles
    for(let i = 0; i < particleCount; i++) {
        const particleGeometry = new THREE.SphereGeometry(
            0.15 + Math.random() * 0.25, 
            6, 6
        );
        const particleMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(
                Math.random() * 0.1 + (size === 'large' ? 0 : size === 'medium' ? 0.05 : 0.1),
                1,
                0.5 + Math.random() * 0.3
            ),
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending
        });
        
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.position.copy(position);
        
        // Random velocity
        const angle = Math.random() * Math.PI * 2;
        const height = Math.random() * Math.PI - Math.PI/2;
        const speed = (0.8 + Math.random() * 0.8) * (size === 'large' ? 4 : size === 'medium' ? 2.5 : 1.5);
        
        particle.userData = {
            velocity: new THREE.Vector3(
                Math.cos(angle) * Math.cos(height) * speed,
                Math.sin(height) * speed,
                Math.sin(angle) * Math.cos(height) * speed
            ),
            life: 0.8 + Math.random() * 0.7,
            maxLife: 1 + Math.random() * 0.5,
            rotationSpeed: new THREE.Vector3(
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10
            ),
            scale: 0.15 + Math.random() * 0.25
        };
        
        scene.add(particle);
        explosionParticles.push(particle);
    }
    
    const explosionData = {
        mesh: explosionMesh,
        core: core,
        particles: explosionParticles,
        lights: explosionLights,
        position: position.clone(),
        life: 1,
        maxLife: 1
    };
    
    explosions.push(explosionData);
    
    // Play sound
    playExplosionSound(size);
    
    return explosionData;
}

// ============================================
// GAME LOGIC
// ============================================

function startGame() {
    state = 'playing';
    gameOver = false;
    won = false;
    paused = false;
    score = 0; lives = 3; level = 1;
    shieldUntil = 0; rapidFireUntil = 0; hitsChain = 0; lastHitAt = 0; lastShotTime = 0;
    hidePauseScreen();
    for (const code in keys) keys[code] = false;
    // Initialize ship state
    shipPosition = new THREE.Vector3(0, 0, 0);
    shipVelocity = new THREE.Vector3(0, 0, 0);
    
    // Reset ship
    shipPosition.set(0, 0, 0);
    shipVelocity.set(0, 0, 0);
    shipRotation = 0;
    shipTargetRotation = 0;
    shipThrusting = false;
    shipInvulnerable = true;
    invulnerableTimer = 3;
    shipAcceleration = 0;
    
    // Remove existing ship if it exists
    if(ship) {
        scene.remove(ship);
        // Remove ship light
        const shipLight = scene.getObjectByName('shipLight');
        if (shipLight) scene.remove(shipLight);
    }
    
    ship = createShip();
    ship.position.copy(shipPosition);
    
    // Add ship light
    const shipLight = new THREE.PointLight(COLORS.shipGlow, 2, 100);
    shipLight.name = 'shipLight';
    scene.add(shipLight);
    
    scene.add(ship);
    
    // Reset asteroids
    asteroids.forEach(a => scene.remove(a));
    asteroids = [];
    powerups.forEach(item => scene.remove(item));
    powerups = [];
    
    // Clear bullets and particles
    bullets.forEach(b => scene.remove(b));
    bullets = [];
    particles.forEach(p => scene.remove(p));
    particles = [];
    explosions.forEach(e => {
        scene.remove(e.mesh);
        scene.remove(e.core);
        e.particles.forEach(p => scene.remove(p));
        e.lights.forEach(l => scene.remove(l));
    });
    explosions = [];
    
    // Create initial asteroids
    for(let i = 0; i < Math.min(8 + level * 3, MAX_ASTEROIDS); i++) {
        spawnAsteroid();
    }
    
    // Reset score
    score = 0;
    lives = 3;
    level = 1;
    
    updateHud();
    
    // Hide screens
    hideGameOverScreen();
    hideMenu();
}

function spawnAsteroid() {
    if (asteroids.length >= MAX_ASTEROIDS) return;
    
    // Random position at edge of space
    const angle = Math.random() * Math.PI * 2;
    const distance = SPACE_SIZE * (0.9 + Math.random() * 0.1);
    const position = new THREE.Vector3(
        Math.cos(angle) * distance,
        (Math.random() - 0.5) * SPACE_SIZE * 0.3,
        Math.sin(angle) * distance
    );
    
    // Random size
    const sizes = ['small', 'medium', 'large'];
    const size = sizes[Math.floor(Math.random() * sizes.length)];
    
    // Create asteroid
    const asteroid = createAsteroid(size, position);
    
    // Random velocity towards center
    const direction = new THREE.Vector3(
        -Math.cos(angle),
        (Math.random() - 0.5) * 0.3,
        -Math.sin(angle)
    ).normalize();
    const speed = ASTEROID_SPEED[size] * (0.8 + Math.random() * 0.4);
    asteroid.userData.velocity = direction.multiplyScalar(speed);
    
    // Random spin
    asteroid.userData.rotationSpeed = new THREE.Vector3(
        (Math.random() - 0.5) * ASTEROID_SPIN[size],
        (Math.random() - 0.5) * ASTEROID_SPIN[size],
        (Math.random() - 0.5) * ASTEROID_SPIN[size]
    );
    
    scene.add(asteroid);
    asteroids.push(asteroid);
    
    return asteroid;
}

function splitAsteroid(asteroid) {
    const size = asteroid.userData.size;
    const position = asteroid.position.clone();
    const velocity = asteroid.userData.velocity.clone();
    
    // Don't split small asteroids
    if (size === 'small') return;
    
    // Create 2 smaller asteroids
    const newSize = size === 'large' ? 'medium' : 'small';
    const splitCount = 2;
    
    for (let i = 0; i < splitCount; i++) {
        // New asteroid
        const newAsteroid = createAsteroid(newSize, position);
        
        // Inherit some velocity from parent
        const newVelocity = velocity.clone();
        
        // Add perpendicular velocity
        const perpendicular = new THREE.Vector3(
            -velocity.z,
            0,
            velocity.x
        ).normalize();
        
        // Add random direction
        newVelocity.add(perpendicular.multiplyScalar((Math.random() - 0.5) * 5));
        newVelocity.add(new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        ));
        
        // Normalize and scale
        newVelocity.normalize().multiplyScalar(ASTEROID_SPEED[newSize] * (1 + Math.random() * 0.5));
        
        newAsteroid.userData.velocity = newVelocity;
        newAsteroid.userData.rotationSpeed = new THREE.Vector3(
            (Math.random() - 0.5) * ASTEROID_SPIN[newSize] * 2,
            (Math.random() - 0.5) * ASTEROID_SPIN[newSize] * 2,
            (Math.random() - 0.5) * ASTEROID_SPIN[newSize] * 2
        );
        
        scene.add(newAsteroid);
        asteroids.push(newAsteroid);
    }
}

// ============================================
// UPDATE
// ============================================

let lastShotTime = 0;
function update(dt) {
    if (state !== 'playing' || paused) return;
    
    const deltaTime = dt / 60;
    
    const shotGap = performance.now() < rapidFireUntil ? 80 : 160;
    if (keys.Space && performance.now() - lastShotTime > shotGap) { lastShotTime = performance.now(); fireBullet(); }
    // Update ship
    updateShip(dt, deltaTime);
    
    // Update asteroids
    updateAsteroids(dt, deltaTime);

    // Bonuses de secteur : bouclier temporaire ou cadence de tir renforcée.
    updatePowerups(dt, deltaTime);
    
    // Update bullets
    updateBullets(dt, deltaTime);
    
    // Update particles
    updateParticles(dt, deltaTime);
    
    // Update explosions
    updateExplosions(dt, deltaTime);
    
    // Update background
    updateBackground(dt, deltaTime);
    
    // Update camera
    updateCamera(dt, deltaTime);
    
    // Update ship invulnerability
    updateShipStatus(dt, deltaTime);
    
    // Check win condition
    checkWinCondition();
}

function updateShip(dt, deltaTime) {
    if (!ship) return;
    
    // Rotation
    if (keys.KeyA || keys.KeyQ || keys.ArrowLeft) {
        shipTargetRotation += SHIP_ROTATION_SPEED * dt * 0.1;
    }
    if (keys.KeyD || keys.ArrowRight) {
        shipTargetRotation -= SHIP_ROTATION_SPEED * dt * 0.1;
    }
    
    // Smooth rotation
    shipRotation += (shipTargetRotation - shipRotation) * 0.1;
    
    // Limit rotation
    while (shipRotation < -Math.PI) shipRotation += Math.PI * 2;
    while (shipRotation > Math.PI) shipRotation -= Math.PI * 2;
    
    // Thrust
    shipThrusting = keys.KeyW || keys.ArrowUp || keys.KeyZ;
    
    if (shipThrusting && !gameOver) {
        // Calculate thrust direction
        const thrustDirection = new THREE.Vector3(
            -Math.sin(shipRotation),
            0,
            Math.cos(shipRotation)
        );
        
        // Apply thrust
        shipAcceleration = SHIP_THUST_SPEED;
        shipVelocity.add(thrustDirection.multiplyScalar(shipAcceleration * dt * 0.1));
        
        // Play thrust sound periodically
        if (Math.random() < 0.1) {
            playThrustSound();
        }
        
        // Visual thrust effect
        const engine = ship.getObjectByName('engine');
        if (engine) {
            engine.material.opacity = 0.8 + Math.sin(Date.now() * 0.01) * 0.2;
        }
    } else {
        shipAcceleration = 0;
        const engine = ship.getObjectByName('engine');
        if (engine) {
            engine.material.opacity = 0;
        }
    }
    
    // Apply friction
    shipVelocity.multiplyScalar(Math.pow(SHIP_FRICTION, dt * 0.1));
    
    // Limit speed
    if (shipVelocity.length() > SHIP_MAX_SPEED) {
        shipVelocity.normalize().multiplyScalar(SHIP_MAX_SPEED);
    }
    
    // Update ship position
    shipPosition.add(shipVelocity.clone().multiplyScalar(dt * 0.1));
    
    // Wrap around space
    if (shipPosition.length() > SPACE_SIZE * 0.9) {
        const direction = shipPosition.clone().normalize();
        shipPosition = direction.multiplyScalar(SPACE_SIZE * 0.85);
    }
    
    // Update ship rotation to face direction of travel
    if (shipVelocity.length() > 0.1) {
        const targetRotation = Math.atan2(-shipVelocity.x, shipVelocity.z);
        shipTargetRotation = targetRotation;
    }
    
    // Apply ship rotation and position
    ship.rotation.y = shipRotation;
    ship.position.copy(shipPosition);
    
    // Update ship light position
    const shipLight = scene.getObjectByName('shipLight');
    if (shipLight) {
        shipLight.position.copy(shipPosition);
        shipLight.position.z -= 2;
    }
    
    // Check for collisions with asteroids
    if (shipInvulnerable || performance.now() < shieldUntil) return;
    
    for (let i = 0; i < asteroids.length; i++) {
        const asteroid = asteroids[i];
        const distance = shipPosition.distanceTo(asteroid.position);
        
        // Simple bounding sphere collision
        const shipRadius = 2;
        const asteroidRadius = 2 * ASTEROID_SCALE[asteroid.userData.size];
        
        if (distance < shipRadius + asteroidRadius) {
            // Collision!
            playCollisionSound();
            lives--;
            shipInvulnerable = true;
            invulnerableTimer = 2;
            
            // Visual feedback
            const shield = ship.getObjectByName('shield');
            if (shield) {
                shield.material.opacity = 0.5;
                setTimeout(() => {
                    if (shield) shield.material.opacity = 0;
                }, 500);
            }
            
            if (lives <= 0) {
                gameOver = true;
                showGameOverScreen();
            }
            
            break;
        }
    }
}

function updateAsteroids(dt, deltaTime) {
    for (let i = asteroids.length - 1; i >= 0; i--) {
        const asteroid = asteroids[i];
        
        // Update position
        asteroid.position.add(asteroid.userData.velocity.clone().multiplyScalar(dt * 0.1));
        
        // Update rotation
        asteroid.rotation.x += asteroid.userData.rotationSpeed.x * dt * 0.1;
        asteroid.rotation.y += asteroid.userData.rotationSpeed.y * dt * 0.1;
        asteroid.rotation.z += asteroid.userData.rotationSpeed.z * dt * 0.1;
        
        // Wrap around space
        if (asteroid.position.length() > SPACE_SIZE * 1.5) {
            // Move to opposite side
            const direction = asteroid.position.clone().normalize();
            asteroid.position = direction.multiplyScalar(SPACE_SIZE * 0.9).negate();
        }
        
        // Check if asteroid is too far away (remove if so)
        if (asteroid.position.length() > SPACE_SIZE * 2) {
            scene.remove(asteroid);
            asteroids.splice(i, 1);
            continue;
        }
    }
}

function updateBullets(dt, deltaTime) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        
        // Move bullet forward
        const direction = bullet.userData?.direction || new THREE.Vector3(
            -Math.sin(shipRotation + Math.PI / 2), 0, Math.cos(shipRotation + Math.PI / 2)
        ).normalize();
        bullet.position.add(direction.clone().multiplyScalar(BULLET_SPEED * dt * 0.1));
        
        // Check for collisions with asteroids
        for (let j = asteroids.length - 1; j >= 0; j--) {
            const asteroid = asteroids[j];
            const distance = bullet.position.distanceTo(asteroid.position);
            
            const bulletRadius = 0.5;
            const asteroidRadius = 2 * ASTEROID_SCALE[asteroid.userData.size];
            
            if (distance < bulletRadius + asteroidRadius) {
                // Hit!
                asteroid.userData.health -= BULLET_DAMAGE;
                
                // Create explosion
                createExplosion(bullet.position.clone(), asteroid.userData.size);
                
                if (asteroid.userData.health <= 0) {
                    // Asteroid destroyed
                    const now = performance.now();
                    hitsChain = now - lastHitAt < 3600 ? hitsChain + 1 : 1;
                    lastHitAt = now;
                    const chainBonus = Math.min(750, Math.max(0, hitsChain - 1) * 50);
                    score += ASTEROID_POINTS[asteroid.userData.size] * level + chainBonus;
                    if (Math.random() < 0.14) createPowerup(asteroid.position.clone(), Math.random() < 0.5 ? 'shield' : 'rapid');
                    
                    // Split asteroid
                    splitAsteroid(asteroid);
                    
                    // Remove asteroid
                    scene.remove(asteroid);
                    asteroids.splice(j, 1);
                }
                
                // Remove bullet
                scene.remove(bullet);
                bullets.splice(i, 1);
                
                // Check if all asteroids are destroyed
                if (asteroids.length === 0) {
                    level++;
                    for (let k = 0; k < Math.min(8 + level * 2, MAX_ASTEROIDS); k++) {
                        spawnAsteroid();
                    }
                }
                
                break;
            }
        }
        
        // Remove bullet if it's been around too long
        if (bullet.userData && bullet.userData.life) {
            bullet.userData.life -= deltaTime;
            if (bullet.userData.life <= 0) {
                scene.remove(bullet);
                bullets.splice(i, 1);
            }
        } else {
            // Set initial life if not set
            bullet.userData = bullet.userData || {};
            bullet.userData.life = BULLET_LIFETIME;
        }
        
        // Remove bullet if too far from center
        if (bullet.position.length() > SPACE_SIZE) {
            scene.remove(bullet);
            bullets.splice(i, 1);
        }
    }
}

function updatePowerups(dt, deltaTime) {
    for (let i = powerups.length - 1; i >= 0; i--) {
        const item = powerups[i];
        item.userData.life -= deltaTime;
        item.rotation.y += dt * 0.018;
        item.userData.ring.rotation.z += dt * 0.025;
        item.position.y = Math.sin(performance.now() * 0.002 + i) * 0.35;
        if (item.userData.life <= 0) {
            scene.remove(item);
            powerups.splice(i, 1);
            continue;
        }
        if (!shipPosition || item.position.distanceTo(shipPosition) > 3.2) continue;
        if (item.userData.kind === 'shield') shieldUntil = performance.now() + 8000;
        else rapidFireUntil = performance.now() + 9000;
        score += 250 * level;
        playThrustSound();
        scene.remove(item);
        powerups.splice(i, 1);
    }
}

function updateParticles(dt, deltaTime) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        
        particle.position.add(particle.userData.velocity.clone().multiplyScalar(dt * 0.1));
        particle.userData.life -= deltaTime;
        
        if (particle.userData.life <= 0) {
            scene.remove(particle);
            particles.splice(i, 1);
        }
    }
}

function updateExplosions(dt, deltaTime) {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i];
        
        explosion.life += deltaTime;
        
        // Update explosion mesh
        explosion.mesh.scale.setScalar(1 + explosion.life * 0.5);
        explosion.mesh.material.opacity = Math.max(0, 0.6 - explosion.life * 0.6);
        
        // Update core
        explosion.core.scale.setScalar(1 - explosion.life * 0.8);
        explosion.core.material.opacity = Math.max(0, 1 - explosion.life * 1.5);
        
        // Update particles
        for (let j = explosion.particles.length - 1; j >= 0; j--) {
            const particle = explosion.particles[j];
            particle.position.add(particle.userData.velocity.clone().multiplyScalar(dt * 0.1));
            particle.userData.life -= deltaTime;
            particle.material.opacity = particle.userData.life / particle.userData.maxLife;
            
            if (particle.userData.life <= 0) {
                scene.remove(particle);
                explosion.particles.splice(j, 1);
            }
        }
        
        // Update lights
        for (let j = explosion.lights.length - 1; j >= 0; j--) {
            const light = explosion.lights[j];
            light.intensity *= 0.98;
            
            if (light.intensity < 0.01) {
                scene.remove(light);
                explosion.lights.splice(j, 1);
            }
        }
        
        // Remove explosion if done
        if (explosion.life >= 1 && explosion.particles.length === 0 && explosion.lights.length === 0) {
            scene.remove(explosion.mesh);
            scene.remove(explosion.core);
            explosions.splice(i, 1);
        }
    }
}

function updateBackground(dt, deltaTime) {
    // Animate background stars
    for (let i = 0; i < backgroundStars.length; i++) {
        const stars = backgroundStars[i];
        stars.rotation.y += dt * 0.0001 * (i + 1);
    }
    
    // Animate nebulae
    for (let i = 0; i < nebulae.length; i++) {
        const nebula = nebulae[i];
        if (nebula.userData.offset) nebula.position.copy(shipPosition).add(nebula.userData.offset);
        nebula.material.opacity = 0.25 + Math.sin(Date.now() * 0.0001 + i) * 0.04;
    }
}

function updateCamera(dt, deltaTime) {
    // Camera follow ship with some lag
    const targetPosition = new THREE.Vector3(
        shipPosition.x * 0.1,
        shipPosition.y * 0.1 + 20,
        shipPosition.z + 80
    );
    
    camera.position.lerp(targetPosition, 0.05);
    camera.lookAt(new THREE.Vector3(
        shipPosition.x * 0.3,
        shipPosition.y * 0.3,
        shipPosition.z
    ));
}

function updateShipStatus(dt, deltaTime) {
    const protectedNow = shipInvulnerable || performance.now() < shieldUntil;
    const shield = ship?.getObjectByName('shield');
    if (shield) shield.material.opacity = protectedNow ? (performance.now() < shieldUntil ? 0.32 : 0.18) : 0;
    if (shipInvulnerable) {
        invulnerableTimer -= deltaTime;
        if (invulnerableTimer <= 0) {
            shipInvulnerable = false;
        }
    }
}

function checkWinCondition() {
    // Game never really "wins", but you can advance levels indefinitely
}

// ============================================
// INPUT HANDLING
// ============================================

function initControls() {
    document.addEventListener('keydown', (e) => {
        if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
        if (e.repeat) return;
        keys[e.code] = true;
        
        // Handle special keys
        switch(e.code) {
            case 'Space':
                fireBullet();
                break;
            case 'KeyP':
                togglePause();
                break;
            case 'KeyR':
                if (gameOver) {
                    startGame();
                }
                break;
            case 'Enter':
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
    
    for (const id of ['start-button','restart-button']) document.getElementById(id)?.addEventListener('click', startGame);
    document.getElementById('resume-button')?.addEventListener('click', togglePause);
    document.getElementById('pause-button')?.addEventListener('click', togglePause);
    for (const button of document.querySelectorAll('[data-key]')) {
        const code = button.dataset.key;
        button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); keys[code] = true; if (code === 'Space') fireBullet(); });
        for (const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event, () => { keys[code] = false; });
    }
    const pauseOnLeave = () => { for (const code in keys) keys[code] = false; if (state === 'playing' && !paused && !gameOver) togglePause(); };
    window.addEventListener('blur', pauseOnLeave);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pauseOnLeave(); });
    // Mouse controls
    document.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    });
}

function fireBullet() {
    if (state !== 'playing' || !ship || gameOver || paused) return;
    
    // Check if we have room for more bullets
    if (bullets.length >= MAX_BULLETS) return;
    
    // Create bullet
    const bullet = createBullet();
    
    // Position bullet at ship
    bullet.position.copy(shipPosition);
    bullet.position.y += 0.5;
    bullet.position.z -= 2;
    
    // Set bullet rotation to match ship
    bullet.rotation.y = shipRotation;
    
    // Add bullet
    scene.add(bullet);
    bullets.push(bullet);
    
    // Set bullet life
    bullet.userData = {
        life: BULLET_LIFETIME,
        direction: new THREE.Vector3(
            -Math.sin(shipRotation + Math.PI / 2), 0, Math.cos(shipRotation + Math.PI / 2)
        ).normalize()
    };
    
    // Play sound
    playShootSound();
    
    // Visual feedback
    const flash = bullet.getObjectByName('flash');
    if (flash) {
        flash.material.opacity = 1;
        setTimeout(() => {
            if (flash) flash.material.opacity = 0;
        }, 50);
    }
}

function togglePause() {
    if (state !== 'playing' || gameOver) return;
    for (const code in keys) keys[code] = false;
    paused = !paused;
    
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
    // HUD will be handled by HTML/CSS
}

function updateHud() {
    const scoreDisplay = document.getElementById('score-display');
    if (scoreDisplay) {
        scoreDisplay.textContent = `SCORE : ${score.toLocaleString('fr-FR')}`;
    }
    
    const livesDisplay = document.getElementById('lives-display');
    if (livesDisplay) {
        let livesHtml = 'VIES : ';
        for (let i = 0; i < lives; i++) {
            livesHtml += '<span class="life-icon"></span>';
        }
        livesDisplay.innerHTML = livesHtml;
    }
    
    const levelDisplay = document.getElementById('level-display');
    if (levelDisplay) {
        levelDisplay.textContent = `NIVEAU : ${level}`;
    }
    const bonusDisplay = document.getElementById('bonus-display');
    if (bonusDisplay) {
        const bonuses = [];
        if (hitsChain > 1) bonuses.push(`SÉRIE ×${Math.min(8, hitsChain)}`);
        if (shieldUntil > performance.now()) bonuses.push(`BOUCLIER ${Math.ceil((shieldUntil - performance.now()) / 1000)} s`);
        if (rapidFireUntil > performance.now()) bonuses.push(`TIR RAPIDE ${Math.ceil((rapidFireUntil - performance.now()) / 1000)} s`);
        bonusDisplay.textContent = bonuses.length ? bonuses.join(' · ') : 'BONUS : détruis les rochers lumineux pour en récupérer';
    }
    
    // Save high score
    if (score > highScore) {
        highScore = score;
        try {
            localStorage.setItem('asteroids3dUltraHS', highScore.toString());
        } catch(e){}
    }
}

function showLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
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
    const gameOverScreen = document.getElementById('game-over-screen');
    if (gameOverScreen) {
        gameOverScreen.style.display = 'flex';
        document.getElementById('final-score').textContent = `SCORE: ${score.toLocaleString()}`;
        document.getElementById('high-score').textContent = `RECORD : ${highScore.toLocaleString()}`;
    }
}

function hideGameOverScreen() {
    const gameOverScreen = document.getElementById('game-over-screen');
    if (gameOverScreen) {
        gameOverScreen.style.display = 'none';
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
    
    const deltaTime = Math.min(clock.getDelta(), 0.05);
    
    // Update game logic
    update(deltaTime * 60);
    
    // Update HUD
    updateHud();
    
    // Render scene
    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
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

// Also start game automatically after a delay if nothing else happens
setTimeout(() => {
    if (state === 'loading') {
        init();
    }
}, 100);

// Make functions available globally for debugging
window.ASTEROIDS_ULTRA = {
    startGame: startGame,
    togglePause: togglePause,
    getScore: () => score,
    getLevel: () => level,
    getLives: () => lives,
    state: () => ({ state, paused, score, level, lives, asteroids: asteroids.length, bullets: bullets.length, powerups: powerups.length, shield: Math.max(0, Math.ceil((shieldUntil - performance.now()) / 1000)), rapidFire: Math.max(0, Math.ceil((rapidFireUntil - performance.now()) / 1000)), bulletDirection: bullets[0]?.userData?.direction?.toArray() || null })
};
})();
