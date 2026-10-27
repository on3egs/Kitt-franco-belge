// ============================================
// PAC-MAN 3D ULTRA - Jeu de labyrinthe 3D ultra-fluide
// Avec mouvement ultra-fluide, labyrinthe 3D spectaculaire, effets visuels avancés
// By Manix - KITT FRANCO BELGE - 2026
// Version améliorée avec fluidité maximale, graphismes premium et gameplay parfait
// ============================================

(function () {
'use strict';

// ============================================
// CONFIGURATION AMÉLIORÉE
// ============================================

const GRID_WIDTH = 28;
const GRID_HEIGHT = 31;
const GRID_DEPTH = 1;
const CELL_SIZE = 2;
const WALL_HEIGHT = 2.5;
const WALL_THICKNESS = 0.4;

// Timing
const FRAME_RATE = 120;
const FRAME_TIME = 1000 / FRAME_RATE;

// Game state
let scene, camera, renderer;
let clock;
let grid = [];
let pacman;
let ghosts = [];
let pellets = [];
let powerPellets = [];
let fruit;

let state = 'loading';
let score = 0, lives = 3, level = 1;
let highScore = 0;
let gameOver = false, paused = false, won = false;
let ghostMode = 'scatter'; // 'scatter', 'chase', 'frightened'
let ghostModeTimer = 0;
let ghostFrightenedTimer = 0;

// Controls
const keys = {};
let targetDirection = null;
let currentDirection = { x: 1, z: 0 };
let nextDirection = { x: 1, z: 0 };
let pacmanSpeed = 0.15;
let ghostSpeed = 0.1;

// Audio context
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// ============================================
// LABYRINTHE
// ============================================

// Labyrinthe classique Pac-Man (niveau 1)
const MAZE_LEVEL_1 = [
    "1111111111111111111111111111",
    "100000000001000000000000001",
    "10111101110101111011110111",
    "101000000000000000000000001",
    "10111101111111110111101111",
    "100000000001000000000000001",
    "111111011101011110111101111",
    "000000000001000000000000000",
    "111111011101011110111101111",
    "100000000001000000000000001",
    "101111111100000000111111101",
    "100000000111111111000000001",
    "111111111100000000111111111",
    "000000000000000000000000000",
    "111111111100000000111111111",
    "100000000111111111000000001",
    "101111111100000000111111101",
    "100000000001000000000000001",
    "101111011101011110111101111",
    "101000000000000000000000001",
    "10111101111111110111101111",
    "100000000001000000000000001",
    "111111011101011110111101111",
    "000000000001000000000000000",
    "111111011101011110111101111",
    "100000000000000000000000001",
    "101111111111111111111111101",
    "111111111111111111111111111"
];

// ============================================
// COULEURS
// ============================================

const COLORS = {
    bg: 0x000000,
    wall: 0x0066cc,
    wallDark: 0x003366,
    wallLight: 0x4488ff,
    floor: 0x001122,
    pellet: 0xffcc00,
    powerPellet: 0xffffff,
    pacman: 0xffcc00,
    pacmanGlow: 0xffee66,
    ghostRed: 0xff4444,
    ghostPink: 0xff88cc,
    ghostBlue: 0x4488ff,
    ghostOrange: 0xff8844,
    ghostFrightened: 0x4488ff,
    ghostEyes: 0xffffff,
    ghostPupil: 0x000000,
    fruit: 0xff4444,
    text: 0xffffff
};

// ============================================
// EFFETS SONORES
// ============================================

function playChompSound() {
    const freq = 400 + Math.random() * 100;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.08;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);
    oscillator.stop(audioContext.currentTime + 0.05);
    
    // Second harmonique
    const oscillator2 = audioContext.createOscillator();
    const gainNode2 = audioContext.createGain();
    oscillator2.type = 'sawtooth';
    oscillator2.frequency.value = freq * 1.5;
    gainNode2.gain.value = 0.04;
    oscillator2.connect(gainNode2);
    gainNode2.connect(audioContext.destination);
    oscillator2.start();
    gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);
    oscillator2.stop(audioContext.currentTime + 0.05);
}

function playPowerPelletSound() {
    const freq = 800 + Math.random() * 100;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.1;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
    oscillator.stop(audioContext.currentTime + 0.3);
}

function playGhostEatenSound() {
    const freq = 1000 + Math.random() * 200;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.15;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
    oscillator.stop(audioContext.currentTime + 0.2);
    
    // Second oscillator
    const oscillator2 = audioContext.createOscillator();
    const gainNode2 = audioContext.createGain();
    oscillator2.type = 'sine';
    oscillator2.frequency.value = freq * 0.5;
    gainNode2.gain.value = 0.08;
    oscillator2.connect(gainNode2);
    gainNode2.connect(audioContext.destination);
    oscillator2.start();
    gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
    oscillator2.stop(audioContext.currentTime + 0.2);
}

function playDeathSound() {
    const freq = 150;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.15;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.8);
    oscillator.stop(audioContext.currentTime + 0.8);
    
    // Second oscillator
    const oscillator2 = audioContext.createOscillator();
    const gainNode2 = audioContext.createGain();
    oscillator2.type = 'sine';
    oscillator2.frequency.value = freq * 0.5;
    gainNode2.gain.value = 0.08;
    oscillator2.connect(gainNode2);
    gainNode2.connect(audioContext.destination);
    oscillator2.start();
    gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.8);
    oscillator2.stop(audioContext.currentTime + 0.8);
}

function playWinSound() {
    const freq = 400;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.1;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
    oscillator.stop(audioContext.currentTime + 0.5);
    
    // Second oscillator
    const oscillator2 = audioContext.createOscillator();
    const gainNode2 = audioContext.createGain();
    oscillator2.type = 'sine';
    oscillator2.frequency.value = freq * 1.25;
    gainNode2.gain.value = 0.08;
    oscillator2.connect(gainNode2);
    gainNode2.connect(audioContext.destination);
    oscillator2.start();
    gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
    oscillator2.stop(audioContext.currentTime + 0.5);
    
    // Third oscillator
    const oscillator3 = audioContext.createOscillator();
    const gainNode3 = audioContext.createGain();
    oscillator3.type = 'sine';
    oscillator3.frequency.value = freq * 1.5;
    gainNode3.gain.value = 0.06;
    oscillator3.connect(gainNode3);
    gainNode3.connect(audioContext.destination);
    oscillator3.start();
    gainNode3.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
    oscillator3.stop(audioContext.currentTime + 0.5);
}

// ============================================
// INITIALIZATION
// ============================================

function init() {
    initThreeJS();
    initMaze();
    initControls();
    createHud();
    
    // Charger le high score
    try { 
        highScore = Number(localStorage.getItem('pacman3dUltraHS')) || 0; 
    } catch(e){}
    
    state = 'menu';
    showMenu();
    
    // Commencer la boucle de rendu
    requestAnimationFrame(render);
}

function initThreeJS() {
    clock = new THREE.Clock();
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.bg);
    scene.fog = new THREE.FogExp2(COLORS.bg, 0.008);
    
    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(
        GRID_WIDTH * CELL_SIZE / 2,
        GRID_HEIGHT * CELL_SIZE / 1.5,
        GRID_WIDTH * CELL_SIZE / 1.5
    );
    camera.lookAt(
        GRID_WIDTH * CELL_SIZE / 2,
        0,
        GRID_WIDTH * CELL_SIZE / 2
    );
    
    // Renderer
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        precision: "highp"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    const ambientLight = new THREE.AmbientLight(0x444466, 0.4);
    scene.add(ambientLight);
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(GRID_WIDTH, GRID_HEIGHT, GRID_WIDTH);
    directionalLight1.lookAt(0, 0, 0);
    directionalLight1.castShadow = true;
    directionalLight1.shadow.mapSize.width = 2048;
    directionalLight1.shadow.mapSize.height = 2048;
    scene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0x4488ff, 0.3);
    directionalLight2.position.set(-GRID_WIDTH, GRID_HEIGHT, -GRID_WIDTH);
    directionalLight2.lookAt(0, 0, 0);
    scene.add(directionalLight2);
    
    // Spot light pour Pac-Man
    const pacmanLight = new THREE.SpotLight(COLORS.pacmanGlow, 2, 50, Math.PI / 3, 0.5);
    pacmanLight.name = 'pacmanLight';
    pacmanLight.castShadow = true;
    scene.add(pacmanLight);
    
    // Resize handler
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function initMaze() {
    // Initialiser la grille
    for (let y = 0; y < GRID_HEIGHT; y++) {
        grid[y] = [];
        for (let x = 0; x < GRID_WIDTH; x++) {
            grid[y][x] = MAZE_LEVEL_1[y][x] || '0';
        }
    }
    
    // Créer le labyrinthe
    createMaze();
}

function createMaze() {
    // Create floor
    const floorGeometry = new THREE.PlaneGeometry(
        GRID_WIDTH * CELL_SIZE * 1.1,
        GRID_HEIGHT * CELL_SIZE * 1.1
    );
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.floor,
        roughness: 0.9,
        metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    scene.add(floor);
    
    // Create walls
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x =  ̀0; x < GRID_WIDTH; x++) {
            if (grid[y][x] === '1') {
                createWall(x, y);
            }
        }
    }
    
    // Create pellets
    createPellets();
    
    // Create power pellets
    createPowerPellets();
}

function createWall(x, y) {
    const wallGeometry = new THREE.BoxGeometry(
        CELL_SIZE * WALL_THICKNESS,
        WALL_HEIGHT,
        CELL_SIZE * WALL_THICKNESS
    );
    
    // Material with texture effect
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.wall,
        roughness: 0.6,
        metalness: 0.2,
        envMapIntensity: 0.3
    });
    
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(
        (x - GRID_WIDTH / 2) * CELL_SIZE + CELL_SIZE / 2,
        WALL_HEIGHT / 2,
        (GRID_HEIGHT / 2 - y) * CELL_SIZE - CELL_SIZE / 2
    );
    wall.castShadow = true;
    wall.receiveShadow = true;
    
    // Add edge highlights
    const edgeGeometry = new THREE.EdgesGeometry(wallGeometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
        color: COLORS.wallLight,
        linewidth: 1
    });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    wall.add(edges);
    
    scene.add(wall);
}

function createPellets() {
    pellets = [];
    
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            if (grid[y][x] === '0') {
                // Don't place pellet in ghost house area (middle)
                const isGhostHouse = (
                    x >= 8 && x <= 19 && 
                    y >= 10 && y <= 18 &&
                    !((x === 9 || x === 18) && y === 14)
                );
                
                if (!isGhostHouse) {
                    createPellet(x, y);
                }
            }
        }
    }
}

function createPellet(x, y) {
    const pelletGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.12, 8, 8);
    const pelletMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.pellet,
        emissive: COLORS.pellet,
        emissiveIntensity: 0.2,
        roughness: 0.1,
        metalness: 0.3
    });
    const pellet = new THREE.Mesh(pelletGeometry, pelletMaterial);
    pellet.position.set(
        (x - GRID_WIDTH / 2) * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE * 0.2,
        (GRID_HEIGHT / 2 - y) * CELL_SIZE - CELL_SIZE / 2
    );
    pellet.name = 'pellet';
    pellet.userData = {
        x: x,
        y: y,
        type: 'pellet'
    };
    
    scene.add(pellet);
    pellets.push(pellet);
}

function createPowerPellets() {
    powerPellets = [];
    
    // Power pellets at specific locations (like original Pac-Man)
    const powerPelletLocations = [
        { x: 1, y: 3 },
        { x: 26, y: 3 },
        { x: 1, y: 26 },
        { x: 26, y: 26 }
    ];
    
    powerPelletLocations.forEach(loc => {
        createPowerPellet(loc.x, loc.y);
    });
}

function createPowerPellet(x, y) {
    const pelletGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.18, 16, 16);
    const pelletMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.powerPellet,
        emissive: COLORS.powerPellet,
        emissiveIntensity: 0.5,
        roughness: 0.1,
        metalness: 0.3
    });
    const pellet = new THREE.Mesh(pelletGeometry, pelletMaterial);
    pellet.position.set(
        (x - GRID_WIDTH / 2) * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE * 0.2,
        (GRID_HEIGHT / 2 - y) * CELL_SIZE - CELL_SIZE / 2
    );
    pellet.name = 'powerPellet';
    pellet.userData = {
        x: x,
        y: y,
        type: 'powerPellet'
    };
    
    // Add glow effect
    const glowGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.25, 8, 8);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.powerPellet,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.y = CELL_SIZE * 0.2;
    pellet.add(glow);
    
    scene.add(pellet);
    powerPellets.push(pellet);
}

function createPacman() {
    const group = new THREE.Group();
    group.name = 'pacman';
    
    // Pacman body
    const bodyGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.45, 16, 16, 0, Math.PI * 2, 0, Math.PI);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.pacman,
        emissive: COLORS.pacmanGlow,
        emissiveIntensity: 0.4,
        roughness: 0.2,
        metalness: 0.5
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = Math.PI / 2;
    body.name = 'pacmanBody';
    group.add(body);
    
    // Pacman mouth (will be animated)
    const mouthGeometry = new THREE.ConeGeometry(
        CELL_SIZE * 0.45,
        CELL_SIZE * 0.45,
        8,
        1,
        0,
        Math.PI
    );
    const mouthMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide
    });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.z = CELL_SIZE * 0.25;
    mouth.rotation.x = Math.PI / 2;
    mouth.name = 'pacmanMouth';
    group.add(mouth);
    
    // Pacman eye
    const eyeGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.08, 8, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(CELL_SIZE * 0.25, CELL_SIZE * 0.35, CELL_SIZE * 0.2);
    eye.name = 'pacmanEye';
    group.add(eye);
    
    // Pacman highlight
    const highlightGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.15, 8, 8);
    const highlightMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.pacmanGlow,
        transparent: true,
        opacity: 0.3
    });
    const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
    highlight.position.set(CELL_SIZE * 0.15, CELL_SIZE * 0.3, CELL_SIZE * 0.2);
    highlight.name = 'pacmanHighlight';
    group.add(highlight);
    
    // Update light position
    const pacmanLight = scene.getObjectByName('pacmanLight');
    if (pacmanLight) {
        pacmanLight.target = group;
    }
    
    return group;
}

function createGhost(type, x, y, direction) {
    const group = new THREE.Group();
    group.name = `ghost_${type}`;
    group.userData = {
        type: type,
        direction: direction || { x: 1, z: 0 },
        target: null,
        scared: false,
        eyesDirection: { x: 1, z: 0 }
    };
    
    // Ghost body
    const bodyGeometry = new THREE.BoxGeometry(
        CELL_SIZE * 0.8,
        CELL_SIZE * 0.8,
        CELL_SIZE * 0.6
    );
    
    let bodyColor, eyeColor;
    switch(type) {
        case 'blinky':
            bodyColor = COLORS.ghostRed;
            break;
        case 'pinky':
            bodyColor = COLORS.ghostPink;
            break;
        case 'inky':
            bodyColor = COLORS.ghostBlue;
            break;
        case 'clyde':
            bodyColor = COLORS.ghostOrange;
            break;
        default:
            bodyColor = COLORS.ghostRed;
    }
    
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        roughness: 0.4,
        metalness: 0.2,
        transparent: true,
        opacity: 1
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = CELL_SIZE * 0.3;
    body.name = 'ghostBody';
    group.add(body);
    
    // Ghost skirt (wavy part)
    const skirtGeometry = new THREE.ConeGeometry(
        CELL_SIZE * 0.8,
        CELL_SIZE * 0.4,
        16,
        1,
        0,
        Math.PI
    );
    const skirtMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        roughness: 0.4,
        metalness: 0.2,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
    });
    const skirt = new THREE.Mesh(skirtGeometry, skirtMaterial);
    skirt.position.y = -CELL_SIZE * 0.1;
    skirt.rotation.x = Math.PI;
    skirt.name = 'ghostSkirt';
    group.add(skirt);
    
    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.15, 8, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({ 
        color: COLORS.ghostEyes,
        transparent: true,
        opacity: 1
    });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-CELL_SIZE * 0.2, CELL_SIZE * 0.5, CELL_SIZE * 0.2);
    leftEye.name = 'ghostLeftEye';
    group.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(CELL_SIZE * 0.2, CELL_SIZE * 0.5, CELL_SIZE * 0.2);
    rightEye.name = 'ghostRightEye';
    group.add(rightEye);
    
    // Pupils
    const pupilGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.07, 4, 4);
    const pupilMaterial = new THREE.MeshBasicMaterial({ 
        color: COLORS.ghostPupil,
        transparent: true,
        opacity: 1
    });
    
    const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    leftPupil.position.set(-CELL_SIZE * 0.25, CELL_SIZE * 0.5, CELL_SIZE * 0.3);
    leftPupil.name = 'ghostLeftPupil';
    group.add(leftPupil);
    
    const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    rightPupil.position.set(CELL_SIZE * 0.25, CELL_SIZE * 0.5, CELL_SIZE * 0.3);
    rightPupil.name = 'ghostRightPupil';
    group.add(rightPupil);
    
    // Position
    group.position.set(
        (x - GRID_WIDTH / 2) * CELL_SIZE + CELL_SIZE / 2,
        0,
        (GRID_HEIGHT / 2 - y) * CELL_SIZE - CELL_SIZE / 2
    );
    
    return group;
}

function createFruit() {
    const fruitGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.3, 12, 12);
    const fruitMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.fruit,
        emissive: 0xff6666,
        emissiveIntensity: 0.3,
        roughness: 0.2,
        metalness: 0.4
    });
    const fruitObj = new THREE.Mesh(fruitGeometry, fruitMaterial);
    fruitObj.position.set(
        (9 - GRID_WIDTH / 2) * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE * 0.2,
        (GRID_HEIGHT / 2 - 17) * CELL_SIZE - CELL_SIZE / 2
    );
    fruitObj.name = 'fruit';
    
    // Add leaf
    const leafGeometry = new THREE.ConeGeometry(CELL_SIZE * 0.1, CELL_SIZE * 0.2, 8, 1);
    const leafMaterial = new THREE.MeshBasicMaterial({ color: 0x00aa00 });
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    leaf.position.set(0, CELL_SIZE * 0.4, 0);
    leaf.rotation.x = Math.PI / 4;
    fruitObj.add(leaf);
    
    scene.add(fruitObj);
    return fruitObj;
}

// ============================================
// GAME LOGIC
// ============================================

function startGame() {
    state = 'playing';
    gameOver = false;
    paused = false;
    won = false;
    
    // Reset score
    score = 0;
    lives = 3;
    level = 1;
    
    // Clear scene
    clearScene();
    
    // Recreate maze
    initMaze();
    
    // Create Pac-Man
    pacman = createPacman();
    pacman.position.set(
        (14 - GRID_WIDTH / 2) * CELL_SIZE + CELL_SIZE / 2,
        0,
        (GRID_HEIGHT / 2 - 23) * CELL_SIZE - CELL_SIZE / 2
    );
    currentDirection = { x: 1, z: 0 };
    nextDirection = { x: 1, z: 0 };
    targetDirection = null;
    scene.add(pacman);
    
    // Create ghosts
    createGhosts();
    
    // Create fruit (appears later)
    fruit = null;
    
    // Hide screens
    hideGameOverScreen();
    hideMenu();
    
    // Reset timers
    ghostMode = 'scatter';
    ghostModeTimer = 0;
    ghostFrightenedTimer = 0;
}

function clearScene() {
    // Remove all objects except lights and camera
    while(scene.children.length > 0) {
        const child = scene.children[0];
        if (child.type !== 'Camera' && child.type !== 'Light' && !child.name.includes('Light')) {
            scene.remove(child);
        }
    }
    
    // Clear arrays
    pellets = [];
    powerPellets = [];
    ghosts = [];
}

function createGhosts() {
    ghosts = [];
    
    // Ghost starting positions
    const ghostStartPositions = [
        { x: 14, y: 14, type: 'blinky', direction: { x: 1, z: 0 } },
        { x: 14, y: 14, type: 'pinky', direction: { x: 0, z: -1 } },
        { x: 13, y: 14, type: 'inky', direction: { x: 0, z: 1 } },
        { x: 15, y: 14, type: 'clyde', direction: { x: 0, z: -1 } }
    ];
    
    ghostStartPositions.forEach(pos => {
        const ghost = createGhost(pos.type, pos.x, pos.y, pos.direction);
        ghost.position.set(
            (pos.x - GRID_WIDTH / 2) * CELL_SIZE + CELL_SIZE / 2,
            0,
            (GRID_HEIGHT / 2 - pos.y) * CELL_SIZE - CELL_SIZE / 2
        );
        scene.add(ghost);
        ghosts.push(ghost);
    });
    
    // Ghost house exit
    setTimeout(() => {
        ghosts.forEach(ghost => {
            ghost.userData.exitingHouse = true;
        });
    }, 2000);
}

function update(dt) {
    if (state !== 'playing' || paused) return;
    
    const deltaTime = dt * 0.01; // Scale down for smoother movement
    
    // Update Pac-Man
    updatePacman(deltaTime);
    
    // Update ghosts
    updateGhosts(deltaTime);
    
    // Update timers
    updateTimers(deltaTime);
    
    // Check for win condition
    checkWinCondition();
    
    // Update HUD
    updateHud();
    
    // Update camera
    updateCamera();
}

function updatePacman(deltaTime) {
    if (!pacman) return;
    
    // Handle direction changes
    if (targetDirection) {
        // Check if we can change direction
        const newX = Math.round(pacman.position.x / CELL_SIZE) + targetDirection.x;
        const newZ = Math.round((pacman.position.z + GRID_HEIGHT * CELL_SIZE / 2) / CELL_SIZE) - targetDirection.z;
        
        // Convert to grid coordinates
        const gridX = Math.round((pacman.position.x + GRID_WIDTH * CELL_SIZE / 2) / CELL_SIZE);
        const gridZ = Math.round((GRID_HEIGHT * CELL_SIZE / 2 - pacman.position.z) / CELL_SIZE);
        
        const newGridX = gridX + targetDirection.x;
        const newGridZ = gridZ + targetDirection.z;
        
        // Check if new direction is valid
        if (isValidPosition(newGridX, newGridZ)) {
            currentDirection = targetDirection;
            targetDirection = null;
        }
    }
    
    // Move Pac-Man
    const gridX = Math.round((pacman.position.x + GRID_WIDTH * CELL_SIZE / 2) / CELL_SIZE);
    const gridZ = Math.round((GRID_HEIGHT * CELL_SIZE / 2 - pacman.position.z) / CELL_SIZE);
    
    // Check if next position in current direction is valid
    const nextGridX = gridX + currentDirection.x;
    const nextGridZ = gridZ + currentDirection.z;
    
    // Check if we can move in current direction
    const canMove = isValidPosition(nextGridX, nextGridZ);
    
    if (canMove) {
        pacman.position.x += currentDirection.x * pacmanSpeed * deltaTime * GRID_WIDTH * 10;
        pacman.position.z -= currentDirection.z * pacmanSpeed * deltaTime * GRID_HEIGHT * 10;
    }
    
    // Animate mouth
    animateMouth(deltaTime);
    
    // Check for collisions with pellets
    checkPelletCollision();
    
    // Check for collisions with ghosts
    checkGhostCollision();
    
    // Check for collisions with power pellets
    checkPowerPelletCollision();
    
    // Wrap around screen
    wrapPacman();
}

function isValidPosition(x, z) {
    // Check boundaries
    if (x < 0 || x >= GRID_WIDTH) return false;
    if (z < 0 || z >= GRID_HEIGHT) return false;
    
    // Check wall collision
    return grid[z][x] !== '1';
}

function animateMouth(deltaTime) {
    if (!pacman) return;
    
    const mouth = pacman.getObjectByName('pacmanMouth');
    if (!mouth) return;
    
    // Convert direction to angle
    let angle = 0;
    if (currentDirection.x === 1) angle = 0;      // Right
    else if (currentDirection.x === -1) angle = Math.PI; // Left
    else if (currentDirection.z === -1) angle = Math.PI / 2; // Down
    else if (currentDirection.z === 1) angle = -Math.PI / 2; // Up
    
    mouth.rotation.y = angle;
    
    // Animate mouth open/close
    const mouthOpen = 0.2 + Math.sin(Date.now() * 0.001) * 0.15;
    mouth.scale.set(mouthOpen, mouthOpen, 1);
}

function checkPelletCollision() {
    if (!pacman) return;
    
    const gridX = Math.round((pacman.position.x + GRID_WIDTH * CELL_SIZE / 2) / CELL_SIZE);
    const gridZ = Math.round((GRID_HEIGHT * CELL_SIZE / 2 - pacman.position.z) / CELL_SIZE);
    
    // Check if there's a pellet at this position
    for (let i = pellets.length - 1; i >= 0; i--) {
        const pellet = pellets[i];
        const pelletX = pellet.userData.x;
        const pelletY = pellet.userData.y;
        
        // Grid positions
        const pelletGridX = pelletX;
        const pelletGridZ = pelletY;
        
        // Check if positions match
        if (Math.abs(gridX - pelletGridX) < 0.5 && Math.abs(gridZ - pelletGridZ) < 0.5) {
            // Remove pellet
            scene.remove(pellet);
            pellets.splice(i, 1);
            
            // Add to score
            score += 10;
            
            // Play sound
            playChompSound();
            
            break;
        }
    }
}

function checkPowerPelletCollision() {
    if (!pacman) return;
    
    const gridX = Math.round((pacman.position.x + GRID_WIDTH * CELL_SIZE / 2) / CELL_SIZE);
    const gridZ = Math.round((GRID_HEIGHT * CELL_SIZE / 2 - pacman.position.z) / CELL_SIZE);
    
    // Check if there's a power pellet at this position
    for (let i = powerPellets.length - 1; i >= 0; i--) {
        const pellet = powerPellets[i];
        const pelletX = pellet.userData.x;
        const pelletY = pellet.userData.y;
        
        if (Math.abs(gridX - pelletX) < 0.5 && Math.abs(gridZ - pelletY) < 0.5) {
            // Remove power pellet
            scene.remove(pellet);
            powerPellets.splice(i, 1);
            
            // Set ghost mode to frightened
            ghostMode = 'frightened';
            ghostFrightenedTimer = 10; // 10 seconds
            
            // Add to score
            score += 50;
            
            // Play sound
            playPowerPelletSound();
            
            break;
        }
    }
}

function checkGhostCollision() {
    if (!pacman) return;
    
    ghosts.forEach(ghost => {
        if (!ghost.userData.scared) {
            // Normal ghost collision
            const distance = pacman.position.distanceTo(ghost.position);
            if (distance < CELL_SIZE * 0.8) {
                // Pac-Man dies
                lives--;
                
                if (lives <= 0) {
                    gameOver = true;
                    playDeathSound();
                    showGameOverScreen();
                } else {
                    // Reset Pac-Man position
                    pacman.position.set(
                        (14 - GRID_WIDTH / 2) * CELL_SIZE + CELL_SIZE / 2,
                        0,
                        (GRID_HEIGHT / 2 - 23) * CELL_SIZE - CELL_SIZE / 2
                    );
                    currentDirection = { x: 1, z: 0 };
                    targetDirection = null;
                    
                    // Reset ghosts
                    ghosts.forEach(g => {
                        g.userData.scared = false;
                        // Return to house
                        g.position.set(
                            (14 - GRID_WIDTH / 2) * CELL_SIZE + CELL_SIZE / 2,
                            0,
                            (GRID_HEIGHT / 2 - 14) * CELL_SIZE - CELL_SIZE / 2
                        );
                        g.userData.direction = { x: 1, z: 0 };
                        g.userData.target = null;
                    });
                    
                    playDeathSound();
                }
            }
        } else {
            // Frightened ghost collision - Pac-Man can eat ghost
            const distance = pacman.position.distanceTo(ghost.position);
            if (distance < CELL_SIZE * 0.8) {
                // Pac-Man eats ghost
                scene.remove(ghost);
                ghosts = ghosts.filter(g => g !== ghost);
                
                // Add to score
                score += 200 * level;
                
                // Play sound
                playGhostEatenSound();
                
                // Spawn new ghost after delay
                setTimeout(() => {
                    const newGhost = createGhost(ghost.userData.type, 14, 14);
                    scene.add(newGhost);
                    ghosts.push(newGhost);
                }, 5000);
            }
        }
    });
}

function updateGhosts(deltaTime) {
    ghosts.forEach(ghost => {
        if (!ghost.userData.exitingHouse) {
            // Normal ghost movement
            moveGhost(ghost, deltaTime);
        } else {
            // Ghost exiting house
            exitGhostHouse(ghost, deltaTime);
        }
    });
}

function moveGhost(ghost, deltaTime) {
    const ghostData = ghost.userData;
    
    // Set speed based on mode
    const speed = ghostMode === 'frightened' ? ghostSpeed * 0.8 : ghostSpeed;
    
    // Get target position based on mode and ghost type
    let targetX, targetZ;
    
    const gridX = Math.round((ghost.position.x + GRID_WIDTH * CELL_SIZE / 2) / CELL_SIZE);
    const gridZ = Math.round((GRID_HEIGHT * CELL_SIZE / 2 - ghost.position.z) / CELL_SIZE);
    
    if (ghostMode === 'frightened') {
        // Flee from Pac-Man
        const pacmanGridX = Math.round((pacman.position.x + GRID_WIDTH * CELL_SIZE / 2) / CELL_SIZE);
        const pacmanGridZ = Math.round((GRID_HEIGHT * CELL_SIZE / 2 - pacman.position.z) / CELL_SIZE);
        
        targetX = pacmanGridX - (ghostData.type === 'blinky' ? 4 : 
                          ghostData.type === 'pinky' ? 3 : 
                          ghostData.type === 'inky' ? 2 : 1);
        targetZ = pacmanGridZ;
    } else if (ghostMode === 'chase') {
        // Chase Pac-Man with different strategies per ghost
        const pacmanGridX = Math.round((pacman.position.x + GRID_WIDTH * CELL_SIZE / 2) / CELL_SIZE);
        const pacmanGridZ = Math.round((GRID_HEIGHT * CELL_SIZE / 2 - pacman.position.z) / CELL_SIZE);
        
        switch(ghostData.type) {
            case 'blinky': // Red - Direct chase
                targetX = pacmanGridX;
                targetZ = pacmanGridZ;
                break;
            case 'pinky': // Pink - Ambush from front
                targetX = pacmanGridX + (currentDirection.x === 1 ? 4 : currentDirection.x === -1 ? -4 : 0);
                targetZ = pacmanGridZ + (currentDirection.z === 1 ? -4 : currentDirection.z === -1 ? 4 : 0);
                break;
            case 'inky': // Blue - Ambush from behind
                targetX = pacmanGridX - (currentDirection.x === 1 ? 2 : currentDirection.x === -1 ? -2 : 0);
                targetZ = pacmanGridZ - (currentDirection.z === 1 ? 2 : currentDirection.z === -1 ? -2 : 0);
                break;
            case 'clyde': // Orange - Random
                targetX = pacmanGridX + Math.floor(Math.random() * 5) - 2;
                targetZ = pacmanGridZ + Math.floor(Math.random() * 5) - 2;
                break;
        }
    } else {
        // Scatter mode - Go to corner
        switch(ghostData.type) {
            case 'blinky':
                targetX = 0;
                targetZ = 0;
                break;
            case 'pinky':
                targetX = GRID_WIDTH - 1;
                targetZ = 0;
                break;
            case 'inky':
                targetX = 0;
                targetZ = GRID_HEIGHT - 1;
                break;
            case 'clyde':
                targetX = GRID_WIDTH - 1;
                targetZ = GRID_HEIGHT - 1;
                break;
        }
    }
    
    // Store target
    ghostData.target = { x: targetX, z: targetZ };
    
    // Find path to target using simple A*
    const path = findPath(gridX, gridZ, targetX, targetZ);
    
    if (path && path.length > 1) {
        // Move towards next point in path
        const nextX = path[1].x;
        const nextZ = path[1].z;
        
        const dirX = Math.sign(nextX - gridX);
        const dirZ = Math.sign(nextZ - gridZ);
        
        // Check if direction is valid
        if (isValidGhostPosition(gridX + dirX, gridZ + dirZ)) {
            ghostData.direction = { x: dirX, z: dirZ };
        }
    }
    
    // Move ghost
    const gridXNew = Math.round((ghost.position.x + GRID_WIDTH * CELL_SIZE / 2) / CELL_SIZE);
    const gridZNew = Math.round((GRID_HEIGHT * CELL_SIZE / 2 - ghost.position.z) / CELL_SIZE);
    
    if (isValidGhostPosition(gridXNew + ghostData.direction.x, gridZNew + ghostData.direction.z)) {
        ghost.position.x += ghostData.direction.x * speed * deltaTime * GRID_WIDTH * 10;
        ghost.position.z -= ghostData.direction.z * speed * deltaTime * GRID_HEIGHT * 10;
    }
    
    // Animate ghost
    animateGhost(ghost, deltaTime);
}

function isValidGhostPosition(x, z) {
    // Ghosts can move through ghost house gates
    const isGhostHouseGate = (
        (x === 9 || x === 18) && z === 14
    );
    
    if (isGhostHouseGate) return true;
    
    // Check boundaries
    if (x < 0 || x >= GRID_WIDTH) return false;
    if (z < 0 || z >= GRID_HEIGHT) return false;
    
    // Check wall collision
    return grid[z][x] !== '1';
}

function animateGhost(ghost, deltaTime) {
    const ghostData = ghost.userData;
    
    // Color based on mode
    const body = ghost.getObjectByName('ghostBody');
    if (body) {
        if (ghostData.scared && ghostMode === 'frightened') {
            body.material.color.setHex(COLORS.ghostFrightened);
            body.material.opacity = 0.6 + Math.sin(Date.now() * 0.01) * 0.2;
        } else {
            // Restore original color
            switch(ghostData.type) {
                case 'blinky':
                    body.material.color.setHex(COLORS.ghostRed);
                    break;
                case 'pinky':
                    body.material.color.setHex(COLORS.ghostPink);
                    break;
                case 'inky':
                    body.material.color.setHex(COLORS.ghostBlue);
                    break;
                case 'clyde':
                    body.material.color.setHex(COLORS.ghostOrange);
                    break;
            }
            body.material.opacity = 1;
        }
    }
    
    // Skirt wave animation
    const skirt = ghost.getObjectByName('ghostSkirt');
    if (skirt) {
        skirt.position.y = -CELL_SIZE * 0.1 + Math.sin(Date.now() * 0.001 + ghostData.type.charCodeAt(0)) * 0.05;
    }
    
    // Eye direction
    const leftEye = ghost.getObjectByName('ghostLeftEye');
    const rightEye = ghost.getObjectByName('ghostRightEye');
    const leftPupil = ghost.getObjectByName('ghostLeftPupil');
    const rightPupil = ghost.getObjectByName('ghostRightPupil');
    
    if (ghostData.direction) {
        // Convert direction to angle
        const angle = Math.atan2(-ghostData.direction.z, ghostData.direction.x);
        
        // Move pupils based on direction
        const pupilOffset = 0.1;
        leftPupil.position.x = -CELL_SIZE * 0.2 + Math.cos(angle) * pupilOffset * CELL_SIZE;
        leftPupil.position.z = CELL_SIZE * 0.2 + Math.sin(angle) * pupilOffset * CELL_SIZE;
        rightPupil.position.x = CELL_SIZE * 0.2 + Math.cos(angle) * pupilOffset * CELL_SIZE;
        rightPupil.position.z = CELL_SIZE * 0.2 + Math.sin(angle) * pupilOffset * CELL_SIZE;
    }
}

function exitGhostHouse(ghost, deltaTime) {
    const ghostData = ghost.userData;
    
    // Move ghost to house exit
    const exitX = 14;
    const exitZ = 14;
    
    const gridX = Math.round((ghost.position.x + GRID_WIDTH * CELL_SIZE / 2) / CELL_SIZE);
    const gridZ = Math.round((GRID_HEIGHT * CELL_SIZE / 2 - ghost.position.z) / CELL_SIZE);
    
    if (gridX === exitX && gridZ === exitZ) {
        ghostData.exitingHouse = false;
        ghostData.direction = { x: 0, z: -1 }; // Start moving up
    } else {
        // Move towards exit
        if (gridX < exitX) {
            ghostData.direction = { x: 1, z: 0 };
        } else if (gridX > exitX) {
            ghostData.direction = { x: -1, z: 0 };
        } else if (gridZ < exitZ) {
            ghostData.direction = { x: 0, z: -1 };
        } else if (gridZ > exitZ) {
            ghostData.direction = { x: 0, z: 1 };
        }
        
        // Move ghost
        ghost.position.x += ghostData.direction.x * ghostSpeed * 0.5 * deltaTime * GRID_WIDTH * 10;
        ghost.position.z -= ghostData.direction.z * ghostSpeed * 0.5 * deltaTime * GRID_HEIGHT * 10;
    }
}

function findPath(startX, startZ, targetX, targetZ) {
    // Simple A* pathfinding implementation
    // For performance, we'll use a basic implementation
    
    // Check if target is valid
    if (!isValidGhostPosition(targetX, targetZ)) {
        return null;
    }
    
    // If we're already at target, return empty path
    if (startX === targetX && startZ === targetZ) {
        return [{ x: startX, z: startZ }];
    }
    
    // For now, use simple direction finding
    const directions = [
        { x: 1, z: 0 },
        { x: -1, z: 0 },
        { x: 0, z: 1 },
        { x: 0, z: -1 }
    ];
    
    // Try each direction to see which gets us closer
    const dx = targetX - startX;
    const dz = targetZ - startZ;
    
    // Prefer horizontal movement first
    let bestDir = null;
    let bestDist = Infinity;
    
    for (const dir of directions) {
        const newX = startX + dir.x;
        const newZ = startZ + dir.z;
        
        if (isValidGhostPosition(newX, newZ)) {
            const dist = Math.abs(newX - targetX) + Math.abs(newZ - targetZ);
            if (dist < bestDist) {
                bestDist = dist;
                bestDir = dir;
            }
        }
    }
    
    if (bestDir) {
        return [{ x: startX, z: startZ }, { x: startX + bestDir.x, z: startZ + bestDir.z }];
    }
    
    return null;
}

function updateTimers(deltaTime) {
    // Update ghost mode timer
    ghostModeTimer += deltaTime;
    
    // Mode changes
    if (ghostMode === 'scatter' && ghostModeTimer >= 7) {
        ghostMode = 'chase';
        ghostModeTimer = 0;
    } else if (ghostMode === 'chase' && ghostModeTimer >= 20) {
        ghostMode = 'scatter';
        ghostModeTimer = 0;
    }
    
    // Frightened timer
    if (ghostMode === 'frightened') {
        ghostFrightenedTimer -= deltaTime;
        if (ghostFrightenedTimer <= 0) {
            ghostMode = 'chase';
            ghostModeTimer = 0;
            ghosts.forEach(ghost => {
                ghost.userData.scared = false;
            });
        }
    }
    
    // Update ghost scared status based on mode
    ghosts.forEach(ghost => {
        ghost.userData.scared = ghostMode === 'frightened';
    });
}

function checkWinCondition() {
    if (!pacman) return;
    
    // Check if all pellets are eaten
    if (pellets.length === 0 && powerPellets.length === 0) {
        won = true;
        playWinSound();
        showLevelCompleteScreen();
    }
}

function wrapPacman() {
    if (!pacman) return;
    
    // Wrap horizontally
    if (pacman.position.x < -GRID_WIDTH * CELL_SIZE / 2) {
        pacman.position.x = GRID_WIDTH * CELL_SIZE / 2 - CELL_SIZE / 2;
    } else if (pacman.position.x > GRID_WIDTH * CELL_SIZE / 2) {
        pacman.position.x = -GRID_WIDTH * CELL_SIZE / 2 + CELL_SIZE / 2;
    }
    
    // Wrap vertically
    if (pacman.position.z < -GRID_HEIGHT * CELL_SIZE / 2) {
        pacman.position.z = GRID_HEIGHT * CELL_SIZE / 2 - CELL_SIZE / 2;
    } else if (pacman.position.z > GRID_HEIGHT * CELL_SIZE / 2) {
        pacman.position.z = -GRID_HEIGHT * CELL_SIZE / 2 + CELL_SIZE / 2;
    }
}

function updateCamera() {
    // Camera follow Pac-Man
    if (pacman) {
        camera.position.x = pacman.position.x + Math.sin(Date.now() * 0.0005) * 40;
        camera.position.z = pacman.position.z - 50 + Math.cos(Date.now() * 0.0003) * 30;
        camera.position.y = GRID_HEIGHT * CELL_SIZE / 1.2 + Math.cos(Date.now() * 0.0004) * 20;
        camera.lookAt(
            pacman.position.x,
            0,
            pacman.position.z
        );
    }
}

// ============================================
// INPUT HANDLING
// ============================================

function initControls() {
    document.addEventListener('keydown', (e) => {
        keys[e.code] = true;
        
        // Handle direction changes
        switch(e.code) {
            case 'ArrowUp':
            case 'KeyW':
                targetDirection = { x: 0, z: 1 };
                break;
            case 'ArrowDown':
            case 'KeyS':
                targetDirection = { x: 0, z: -1 };
                break;
            case 'ArrowLeft':
            case 'KeyA':
                targetDirection = { x: -1, z: 0 };
                break;
            case 'ArrowRight':
            case 'KeyD':
                targetDirection = { x: 1, z: 0 };
                break;
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
    // HUD géré par HTML/CSS
}

function updateHud() {
    const scoreDisplay = document.getElementById('score-display');
    if (scoreDisplay) {
        scoreDisplay.textContent = `SCORE: ${score.toLocaleString()}`;
    }
    
    const livesDisplay = document.getElementById('lives-display');
    if (livesDisplay) {
        let livesHtml = 'LIVES: ';
        for (let i = 0; i < lives; i++) {
            livesHtml += '<div class="pacman-icon"></div>';
        }
        livesDisplay.innerHTML = livesHtml;
    }
    
    const levelDisplay = document.getElementById('level-display');
    if (levelDisplay) {
        levelDisplay.textContent = `LEVEL: ${level}`;
    }
    
    const pelletsDisplay = document.getElementById('pellets-count');
    if (pelletsDisplay) {
        pelletsDisplay.textContent = `${pellets.length + powerPellets.length}`;
    }
    
    // Update high score
    if (score > highScore) {
        highScore = score;
        try {
            localStorage.setItem('pacman3dUltraHS', highScore.toString());
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
    const gameOverScreen = document.getElementById('game-over-screen');
    if (gameOverScreen) {
        gameOverScreen.style.display = 'flex';
        document.getElementById('final-score').textContent = `SCORE: ${score.toLocaleString()}`;
        document.getElementById('high-score').textContent = `HIGH SCORE: ${highScore.toLocaleString()}`;
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
    
    const deltaTime = clock.getDelta();
    
    // Update game logic
    update(deltaTime);
    
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

})();

// Global access for debugging
window.PACMAN_3D_ULTRA = {
    startGame: startGame,
    togglePause: togglePause,
    getScore: () => score,
    getLevel: () => level,
    getLives: () => lives
};