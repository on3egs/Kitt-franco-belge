// ============================================
// TETRIS 3D ULTRA - Jeu de blocs 3D ultra-fluide
// Avec contrôles DAS/ARR, animations spectaculaires, effets 3D avancés
// By Manix - KITT FRANCO BELGE - 2026
// Version améliorée avec fluidité maximale, graphismes premium et effets 3D avancés
// ============================================

(function () {
'use strict';

// ============================================
// CONFIGURATION AMÉLIORÉE
// ============================================

const WIDTH = 10;
const HEIGHT = 22;
const DEPTH = 10;
const VISIBLE_HEIGHT = 20;
const CELL_SIZE = 1.2;
const GRID_WIDTH = WIDTH * CELL_SIZE;
const GRID_HEIGHT = HEIGHT * CELL_SIZE;
const GRID_DEPTH = DEPTH * CELL_SIZE;
const GRID_CENTER_Z = -GRID_DEPTH / 2;

// Timing amélioré
const FRAME_RATE = 120;
const FRAME_TIME = 1000 / FRAME_RATE;
const DAS_DELAY = 120; // Delayed Auto Shift
const ARR_DELAY = 5;   // Auto Repeat Rate (plus rapide)
const SOFT_DROP_SPEED = 10; // Cells per second
const GRAVITY_SPEED = 0.8; // Seconds per cell
const GRAVITY_ACCELERATION = 0.02; // Accélération par niveau
const LOCK_DELAY = 500; // Délai avant de verrouiller la pièce
const LINE_CLEAR_DELAY = 300; // Délai pour effacer les lignes

// Game state
let scene, camera, renderer, composer;
let clock;
let grid = [];
let currentPiece, nextPiece, heldPiece;
let currentX = 0, currentY = 0, currentZ = 0;
let currentRotation = 0;
let pieceQueue = [];

let state = 'loading';
let score = 0, level = 1, lines = 0, combo = 0;
let highScore = 0;
let gameOver = false, paused = false, won = false;
let runStartedAt = 0, scoreSubmitted = false;

// Controls améliorés
const keys = {};
let dasActive = { left: false, right: false, down: false, forward: false, backward: false };
let dasTimer = { left: 0, right: 0, down: 0, forward: 0, backward: 0 };
let lastMoveTime = 0;
let softDropActive = false;
let hardDropActive = false;
let lastDropTime = 0;
let lastLockTime = 0;
let ghostPiece = null;

// Audio context
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// ============================================
// PIÈCES DE TETRIS (Tetrominoes)
// ============================================

// Définition des pièces en 3D (Shapes)
const SHAPES = {
    I: [
        // Forme de ligne (4 blocs)
        [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]],
        [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0]],
        [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]],
        [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0]]
    ],
    O: [
        // Carré (4 blocs)
        [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]],
        [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]],
        [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]],
        [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]]
    ],
    T: [
        // T (4 blocs)
        [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0]],
        [[0, 0, 0], [0, 1, 0], [0, 2, 0], [1, 1, 0]],
        [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, -1, 0]],
        [[0, 0, 0], [0, 1, 0], [0, 2, 0], [-1, 1, 0]]
    ],
    L: [
        // L (4 blocs)
        [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0]],
        [[0, 0, 0], [0, 1, 0], [0, 2, 0], [1, 0, 0]],
        [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, -1, 0]],
        [[0, 0, 0], [0, 1, 0], [0, 2, 0], [-1, 2, 0]]
    ],
    J: [
        // J (4 blocs)
        [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0]],
        [[0, 0, 0], [0, 1, 0], [0, 2, 0], [-1, 2, 0]],
        [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, -1, 0]],
        [[0, 0, 0], [0, 1, 0], [0, 2, 0], [1, 0, 0]]
    ],
    S: [
        // S (4 blocs)
        [[1, 0, 0], [2, 0, 0], [0, 1, 0], [1, 1, 0]],
        [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 2, 0]],
        [[1, 0, 0], [2, 0, 0], [0, 1, 0], [1, 1, 0]],
        [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 2, 0]]
    ],
    Z: [
        // Z (4 blocs)
        [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0]],
        [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 2, 0]],
        [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0]],
        [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 2, 0]]
    ]
};

// Couleurs des pièces
const PIECE_COLORS = {
    I: 0x63e9ff,    // Cyan
    O: 0xffcc00,    // Jaune
    T: 0xff4488,    // Magenta
    L: 0xff9900,    // Orange
    J: 0x6348ff,    // Bleu
    S: 0x00ff88,    // Vert
    Z: 0xff4444     // Rouge
};

// Couleurs de lueur
const PIECE_GLOW_COLORS = {
    I: 0x88f4ff,
    O: 0xffee66,
    T: 0xff88aa,
    L: 0xffbb66,
    J: 0x8866ff,
    S: 0x44ffaa,
    Z: 0xff6666
};

// ============================================
// EFFETS SONORES
// ============================================

function playMoveSound() {
    const freq = 400 + Math.random() * 50;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.05;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);
    oscillator.stop(audioContext.currentTime + 0.05);
}

function playRotateSound() {
    const freq = 600 + Math.random() * 100;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.08;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
    oscillator.stop(audioContext.currentTime + 0.1);
}

function playDropSound() {
    const freq = 200 + Math.random() * 50;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.06;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
    oscillator.stop(audioContext.currentTime + 0.1);
}

function playClearSound(linesCleared) {
    const freq = 300 + linesCleared * 100;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.08 * linesCleared;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
    oscillator.stop(audioContext.currentTime + 0.3);
    
    // Harmonique
    const oscillator2 = audioContext.createOscillator();
    const gainNode2 = audioContext.createGain();
    oscillator2.type = 'sine';
    oscillator2.frequency.value = freq * 1.5;
    gainNode2.gain.value = 0.04 * linesCleared;
    oscillator2.connect(gainNode2);
    gainNode2.connect(audioContext.destination);
    oscillator2.start();
    gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
    oscillator2.stop(audioContext.currentTime + 0.3);
}

function playHardDropSound() {
    const freq = 100 + Math.random() * 50;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.08;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
    oscillator.stop(audioContext.currentTime + 0.2);
}

function playGameOverSound() {
    const freq = 150;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.1;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);
    oscillator.stop(audioContext.currentTime + 1);
    
    // Second oscillator
    const oscillator2 = audioContext.createOscillator();
    const gainNode2 = audioContext.createGain();
    oscillator2.type = 'sine';
    oscillator2.frequency.value = freq * 0.5;
    gainNode2.gain.value = 0.05;
    oscillator2.connect(gainNode2);
    gainNode2.connect(audioContext.destination);
    oscillator2.start();
    gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);
    oscillator2.stop(audioContext.currentTime + 1);
}

// ============================================
// INITIALIZATION
// ============================================

let initialized = false;
let canHold = true;
function init() {
    if (initialized) return;
    initialized = true;
    initThreeJS();
    initGrid();
    initControls();
    createHud();
    
    // Charger le high score
    try { 
        highScore = Number(localStorage.getItem('tetris3dUltraHS')) || 0; 
    } catch(e){}
    
    state = 'menu';
    document.getElementById('loading-screen').style.display = 'none';
    showMenu();
    // Commencer la boucle de rendu
    requestAnimationFrame(render);
}

function initThreeJS() {
    clock = new THREE.Clock();
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111122);
    scene.fog = new THREE.FogExp2(0x111122, 0.005);
    
    // Camera
    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(GRID_WIDTH / 2, GRID_HEIGHT / 1.5, GRID_DEPTH);
    camera.lookAt(GRID_WIDTH / 2, GRID_HEIGHT / 2, 0);
    
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
    const ambientLight = new THREE.AmbientLight(0x444466, 0.5);
    scene.add(ambientLight);
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH);
    directionalLight1.lookAt(0, 0, 0);
    directionalLight1.castShadow = true;
    directionalLight1.shadow.mapSize.width = 2048;
    directionalLight1.shadow.mapSize.height = 2048;
    scene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0xff8844, 0.3);
    directionalLight2.position.set(-GRID_WIDTH, GRID_HEIGHT, -GRID_DEPTH);
    directionalLight2.lookAt(0, 0, 0);
    scene.add(directionalLight2);
    
    // Background
    createBackground();
    
    // Resize handler
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function createBackground() {
    // Fond étoilé
    const starGeometry = new THREE.BufferGeometry();
    const starVertices = [];
    const starColors = [];
    
    for (let i = 0; i < 1000; i++) {
        const x = (Math.random() - 0.5) * GRID_WIDTH * 3;
        const y = (Math.random() - 0.5) * GRID_HEIGHT * 3;
        const z = (Math.random() - 0.5) * GRID_DEPTH * 3 - 100;
        
        starVertices.push(x, y, z);
        
        const color = Math.random();
        starColors.push(color, color, color);
    }
    
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
    
    const starMaterial = new THREE.PointsMaterial({
        size: 0.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
    
    // Grille de référence
    createGridHelper();
}

function createGridHelper() {
    const gridSize = Math.max(GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH) * 1.5;
    const divisions = 20;
    
    const gridHelperXY = new THREE.GridHelper(gridSize, divisions, 0x224466, 0x112233);
    gridHelperXY.position.y = -10;
    gridHelperXY.rotation.x = Math.PI / 2;
    scene.add(gridHelperXY);
    
    const gridHelperXZ = new THREE.GridHelper(gridSize, divisions, 0x113355, 0x081828);
    gridHelperXZ.position.z = GRID_CENTER_Z - 10;
    scene.add(gridHelperXZ);
    
    const gridHelperYZ = new THREE.GridHelper(gridSize, divisions, 0x223355, 0x111828);
    gridHelperYZ.position.x = GRID_WIDTH / 2;
    gridHelperYZ.rotation.y = Math.PI / 2;
    gridHelperYZ.rotation.x = Math.PI / 2;
    scene.add(gridHelperYZ);
}

function initGrid() {
    // Initialiser la grille
    grid = [];
    for (let y = 0; y < HEIGHT; y++) {
        grid[y] = [];
        for (let x = 0; x < WIDTH; x++) {
            grid[y][x] = [];
            for (let z = 0; z < DEPTH; z++) {
                grid[y][x][z] = null;
            }
        }
    }
}

// ============================================
// PIÈCE LOGIC
// ============================================

// Liste des types de pièces
const PIECE_TYPES = ['I', 'O', 'T', 'L', 'J', 'S', 'Z'];

function getRandomPieceType() {
    return PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
}

function createPiece(type, rotation = 0) {
    const group = new THREE.Group();
    group.name = `piece_${type}`;
    group.userData = {
        type: type,
        rotation: rotation,
        blocks: []
    };
    
    // Get shape for current rotation
    const shape = SHAPES[type][rotation];
    
    // Create blocks
    for (let i = 0; i < shape.length; i++) {
        const [x, y, z] = shape[i];
        const block = createBlock(type);
        block.position.set(x * CELL_SIZE, y * CELL_SIZE, z * CELL_SIZE);
        block.userData = {
            piece: true,
            type: type
        };
        group.add(block);
        group.userData.blocks.push(block);
    }
    
    return group;
}

function createBlock(type, position = null) {
    const geometry = new THREE.BoxGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.9, CELL_SIZE * 0.9);
    
    // Material principal
    const color = PIECE_COLORS[type];
    const glowColor = PIECE_GLOW_COLORS[type];
    
    const material = new THREE.MeshStandardMaterial({
        color: color,
        emissive: glowColor,
        emissiveIntensity: 0.3,
        roughness: 0.2,
        metalness: 0.4,
        envMapIntensity: 0.3
    });
    
    const block = new THREE.Mesh(geometry, material);
    block.castShadow = true;
    block.receiveShadow = true;
    
    // Contour lumineux
    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
        color: glowColor,
        linewidth: 2,
        transparent: true,
        opacity: 0.8
    });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    block.add(edges);
    
    // Effet de brillance
    const shineGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.1, 8, 8);
    const shineMaterial = new THREE.MeshBasicMaterial({
        color: glowColor,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending
    });
    const shine = new THREE.Mesh(shineGeometry, shineMaterial);
    shine.position.y = CELL_SIZE * 0.4;
    shine.name = 'shine';
    block.add(shine);
    
    if (position) {
        block.position.copy(position);
    }
    
    return block;
}

function createGhostPiece(piece, x, y, z) {
    const ghostGroup = new THREE.Group();
    ghostGroup.name = 'ghost_piece';
    
    const shape = SHAPES[piece.userData.type][piece.userData.rotation];
    
    for (let i = 0; i < shape.length; i++) {
        const [px, py, pz] = shape[i];
        const geometry = new THREE.BoxGeometry(CELL_SIZE * 0.92, CELL_SIZE * 0.92, CELL_SIZE * 0.92);
        
        const ghostMaterial = new THREE.MeshBasicMaterial({
            color: PIECE_COLORS[piece.userData.type],
            transparent: true,
            opacity: 0.25,
            wireframe: true
        });
        
        const ghostBlock = new THREE.Mesh(geometry, ghostMaterial);
        ghostBlock.position.set(
            (x + px) * CELL_SIZE,
            (y + py) * CELL_SIZE,
            (z + pz) * CELL_SIZE
        );
        ghostGroup.add(ghostBlock);
    }
    
    return ghostGroup;
}

function canPlacePiece(piece, x, y, z, rotation) {
    if (!piece || !piece.userData) return false;
    
    const type = piece.userData.type;
    const shape = SHAPES[type][rotation ?? piece.userData.rotation];
    
    for (let i = 0; i < shape.length; i++) {
        const [px, py, pz] = shape[i];
        const nx = x + px;
        const ny = y + py;
        const nz = z + pz;
        
        // Check boundaries
        if (nx < 0 || nx >= WIDTH) return false;
        if (nz < 0 || nz >= DEPTH) return false;
        if (ny < 0) return false;
        if (ny >= HEIGHT) return false;
        
        // Check collision with existing blocks
        if (grid[ny] && grid[ny][nx] && grid[ny][nx][nz]) return false;
    }
    
    return true;
}

function placePiece(piece, x, y, z) {
    if (!piece || !piece.userData) return false;
    
    const type = piece.userData.type;
    const shape = SHAPES[type][piece.userData.rotation];
    
    // Check if placement is valid
    if (!canPlacePiece(piece, x, y, z)) return false;
    
    // Place the piece
    for (let i = 0; i < shape.length; i++) {
        const [px, py, pz] = shape[i];
        const nx = x + px;
        const ny = y + py;
        const nz = z + pz;
        
        // Create block at this position
        const block = createBlock(type, new THREE.Vector3(
            nx * CELL_SIZE,
            ny * CELL_SIZE,
            (nz - DEPTH / 2 + currentZ) * CELL_SIZE
        ));
        block.position.set(
            nx * CELL_SIZE,
            ny * CELL_SIZE,
            (nz - DEPTH / 2) * CELL_SIZE
        );
        scene.add(block);
        
        // Add to grid
        grid[ny][nx][nz] = {
            type: type,
            mesh: block
        };
    }
    
    return true;
}

function lockPiece() {
    if (!currentPiece) return;
    canHold = true;
    
    // Place the piece in the grid
    placePiece(currentPiece, currentX, currentY, currentZ);
    
    // Remove piece from scene
    scene.remove(currentPiece);
    currentPiece.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) for (const material of (Array.isArray(obj.material) ? obj.material : [obj.material])) material.dispose();
    });
    currentPiece = null;
    
    // Remove ghost piece
    if (ghostPiece) {
        ghostPiece.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) for (const material of (Array.isArray(obj.material) ? obj.material : [obj.material])) material.dispose();
        });
        scene.remove(ghostPiece);
        ghostPiece = null;
    }
    
    // Check for line clears
    checkLineClears();
    
    // Spawn new piece
    spawnNewPiece();
    
    // Reset lock timer
    lastLockTime = Date.now();
}

function checkLineClears() {
    let linesCleared = 0;
    let clearedLines = [];
    
    // Check all layers (3D)
    for (let y = 0; y < HEIGHT; y++) {
        // Check horizontal lines (X axis)
        let lineComplete = true;
        for (let x = 0; x < WIDTH && lineComplete; x++) {
            for (let z = 0; z < DEPTH && lineComplete; z++) {
                if (!grid[y][x][z]) {
                    lineComplete = false;
                }
            }
        }
        if (lineComplete) {
            clearedLines.push({ axis: 'y', index: y });
            linesCleared++;
        }
    }
    
    // Check vertical lines in Z (depth)
    for (let z = 0; z < DEPTH; z++) {
        let lineComplete = true;
        for (let x = 0; x < WIDTH && lineComplete; x++) {
            for (let y = 0; y < HEIGHT && lineComplete; y++) {
                if (!grid[y][x][z]) {
                    lineComplete = false;
                }
            }
        }
        if (lineComplete) {
            clearedLines.push({ axis: 'z', index: z });
            linesCleared++;
        }
    }
    
    // Check vertical lines in X (width)
    for (let x = 0; x < WIDTH; x++) {
        let lineComplete = true;
        for (let y = 0; y < HEIGHT && lineComplete; y++) {
            for (let z = 0; z < DEPTH && lineComplete; z++) {
                if (!grid[y][x][z]) {
                    lineComplete = false;
                }
            }
        }
        if (lineComplete) {
            clearedLines.push({ axis: 'x', index: x });
            linesCleared++;
        }
    }
    
    // If lines cleared
    if (linesCleared > 0) {
        playClearSound(linesCleared);
        
        // Update score based on lines cleared
        const linePoints = [100, 300, 600, 1000]; // Points for 1, 2, 3, 4+ lines
        const points = linePoints[Math.min(linesCleared - 1, linePoints.length - 1)] * level;
        score += points * (combo + 1);
        combo++;
        
        // Update lines
        lines += linesCleared;
        
        // Check for level up
        if (lines >= level * 10) {
            level++;
            combo = 0; // Reset combo on level up
        }
        
        // Clear the lines
        clearLines(clearedLines);
        
        // Update high score
        if (score > highScore) {
            highScore = score;
            try {
                localStorage.setItem('tetris3dUltraHS', highScore.toString());
            } catch(e){}
        }
    } else {
        combo = 0; // Reset combo if no lines cleared
    }
}

function clearLines(lines) {
    // For each cleared line, remove blocks and animate
    lines.forEach(line => {
        if (line.axis === 'y') {
            // Clear horizontal line
            for (let x = 0; x < WIDTH; x++) {
                for (let z = 0; z < DEPTH; z++) {
                    if (grid[line.index][x][z] && grid[line.index][x][z].mesh) {
                        animateBlockClear(grid[line.index][x][z].mesh);
                    }
                    grid[line.index][x][z] = null;
                }
            }
            
            // Move all lines above down
            for (let y = line.index; y > 0; y--) {
                for (let x = 0; x < WIDTH; x++) {
                    for (let z = 0; z < DEPTH; z++) {
                        grid[y][x][z] = grid[y - 1][x][z];
                        if (grid[y][x][z] && grid[y][x][z].mesh) {
                            animateBlockFall(grid[y][x][z].mesh, y);
                        }
                    }
                }
            }
        }
    });
    
    // Rebuild grid display
    setTimeout(() => {
        rebuildGridDisplay();
    }, LINE_CLEAR_DELAY);
}

function animateBlockClear(block) {
    // Animation de disparition
    const originalMaterial = block.material;
    const originalOpacity = originalMaterial.opacity;
    const originalColor = originalMaterial.color.clone();
    
    block.material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: originalOpacity
    });
    
    // Animation
    const startTime = Date.now();
    const duration = LINE_CLEAR_DELAY;
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;
        
        if (progress < 1) {
            block.material.opacity = originalOpacity * (1 - progress);
            block.scale.setScalar(1 - progress * 0.5);
            requestAnimationFrame(animate);
        } else {
            scene.remove(block);
        }
    }
    
    animate();
}

function animateBlockFall(block, targetY) {
    const startY = block.position.y;
    const targetPositionY = targetY * CELL_SIZE;
    const startTime = Date.now();
    const duration = 200;
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        block.position.y = startY + (targetPositionY - startY) * progress;
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    animate();
}

function rebuildGridDisplay() {
    // Clear all placed blocks
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            for (let z = 0; z < DEPTH; z++) {
                if (grid[y][x][z] && grid[y][x][z].mesh) {
                    // Block is already in scene, just update position
                    grid[y][x][z].mesh.position.set(
                        x * CELL_SIZE,
                        y * CELL_SIZE,
                        (z - DEPTH / 2) * CELL_SIZE
                    );
                }
            }
        }
    }
}

function spawnNewPiece() {
    // Get next piece from queue or generate new one
    if (pieceQueue.length === 0) {
        // Fill queue with random pieces
        for (let i = 0; i < 5; i++) {
            pieceQueue.push(getRandomPieceType());
        }
    }
    
    const pieceType = pieceQueue.shift();
    
    // Create new piece
    currentPiece = createPiece(pieceType);
    currentX = Math.floor(WIDTH / 2) - 1;
    currentY = HEIGHT - 2;
    currentZ = Math.floor(DEPTH / 2);
    currentRotation = 0;
    
    // Position piece
    currentPiece.position.set(
        currentX * CELL_SIZE,
        currentY * CELL_SIZE,
        (currentZ - DEPTH / 2) * CELL_SIZE
    );
    
    scene.add(currentPiece);
    
    // Create ghost piece
    createGhost();
    
    // Spawn next piece preview
    spawnNextPiece();
    
    // Check if game over
    if (!canPlacePiece(currentPiece, currentX, currentY, currentZ)) {
        gameOver = true;
        playGameOverSound();
        showGameOverScreen();
    }
}

function createGhost() {
    if (!currentPiece) return;
    
    // Remove existing ghost
    if (ghostPiece) {
        ghostPiece.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) for (const material of (Array.isArray(obj.material) ? obj.material : [obj.material])) material.dispose();
        });
        scene.remove(ghostPiece);
        ghostPiece = null;
    }
    
    // Find where the piece would land
    let ghostY = currentY;
    while (ghostY >= 0 && canPlacePiece(currentPiece, currentX, ghostY, currentZ)) {
        ghostY--;
    }
    ghostY++; // Move back up to the last valid position
    
    // Create ghost piece
    ghostPiece = createGhostPiece(currentPiece, currentX, ghostY, currentZ);
    scene.add(ghostPiece);
}

function spawnNextPiece() {
    if (pieceQueue.length === 0) {
        pieceQueue.push(getRandomPieceType());
    }
    
    const nextType = pieceQueue[0];
    
    // Remove existing next piece
    const existingNextPiece = scene.getObjectByName('next_piece');
    if (existingNextPiece) {
        scene.remove(existingNextPiece);
    }
    
    // Create next piece preview
    const nextPieceObj = createPiece(nextType);
    nextPieceObj.name = 'next_piece';
    nextPieceObj.position.set(GRID_WIDTH + CELL_SIZE * 4, GRID_HEIGHT / 2, -CELL_SIZE * 2);
    nextPieceObj.scale.setScalar(0.8);
    scene.add(nextPieceObj);
    
    // Update HUD
    updateNextPieceDisplay(nextType);
}

function updateNextPieceDisplay(pieceType) {
    const nextPieceGrid = document.getElementById('next-piece-grid');
    if (!nextPieceGrid) return;
    
    // Clear existing pieces
    nextPieceGrid.innerHTML = '';
    
    const shape = SHAPES[pieceType][0]; // Use first rotation for preview
    const colors = {
        I: '#63e9ff',
        O: '#ffcc00', 
        T: '#ff4488',
        L: '#ff9900',
        J: '#6348ff',
        S: '#00ff88',
        Z: '#ff4444'
    };
    
    // Find the bounding box of the shape
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (let i = 0; i < shape.length; i++) {
        const [x, y] = shape[i];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }
    
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    
    nextPieceGrid.style.gridTemplateColumns = `repeat(${width}, 1fr)`;
    nextPieceGrid.style.gridTemplateRows = `repeat(${height}, 1fr)`;
    
    // Create cells
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = document.createElement('div');
            cell.className = 'next-piece-cell';
            
            // Check if this cell is part of the piece
            const pieceX = x + minX;
            const pieceY = y + minY;
            
            const isFilled = shape.some(([sx, sy]) => sx === pieceX && sy === pieceY);
            
            if (isFilled) {
                cell.style.backgroundColor = colors[pieceType];
                cell.style.borderColor = colors[pieceType];
            } else {
                cell.style.backgroundColor = '#111';
                cell.style.borderColor = '#333';
            }
            
            nextPieceGrid.appendChild(cell);
        }
    }
}

// ============================================
// GAME LOGIC
// ============================================

function startGame() {
    state = 'playing';
    gameOver = false;
    paused = false;
    won = false;
    runStartedAt = Date.now();
    scoreSubmitted = false;
    
    // Reset score
    score = 0;
    level = 1;
    lines = 0;
    combo = 0;
    heldPiece = null; canHold = true;
    const holdGrid = document.getElementById('hold-grid');
    if (holdGrid) holdGrid.textContent = '—';
    hidePauseScreen();
    for (const code in keys) keys[code] = false;
    
    // Clear grid
    initGrid();
    
    // Clear scene
    clearScene();
    
    // Reset queue
    pieceQueue = [];
    
    // Create initial background
    createBackground();
    createGridHelper();
    
    // Spawn first piece
    spawnNewPiece();
    
    // Hide screens
    hideGameOverScreen();
    hideMenu();
    
    // Reset timer
    lastDropTime = Date.now();
    lastLockTime = Date.now();
    lastMoveTime = Date.now();
}

function clearScene() {
    // Conserver les lumières ; libérer les ressources des groupes retirés.
    for (const child of [...scene.children]) {
        if (child.isLight) continue;
        child.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) for (const material of (Array.isArray(obj.material) ? obj.material : [obj.material])) material.dispose();
        });
        scene.remove(child);
    }

}

function update(dt) {
    if (state !== 'playing' || paused) return;
    
    const now = Date.now();
    const gravitySpeed = Math.max(0.05, GRAVITY_SPEED - GRAVITY_ACCELERATION * level);
    const dropInterval = 1000 * gravitySpeed;
    
    // Handle gravity (automatic drop)
    if (currentPiece && now - lastDropTime > dropInterval) {
        movePiece(0, -1, 0);
        lastDropTime = now;
        // Le délai reste indépendant de la gravité.
    }
    
    // Le verrouillage ne commence que lorsque la pièce repose sur la pile.
    if (currentPiece && canPlacePiece(currentPiece, currentX, currentY - 1, currentZ)) lastLockTime = now;
    if (currentPiece && now - lastLockTime > LOCK_DELAY) {
        lockPiece();
    }
    
    // Handle DAS (Delayed Auto Shift)
    handleDAS(now);
    
    // Handle soft drop
    if (softDropActive && currentPiece) {
        if (now - lastMoveTime > 45) { movePiece(0, -1, 0); lastMoveTime = now; }
    }
    
    // Le fantôme est mis à jour uniquement sur déplacement ou rotation.
    
    // Update HUD
    updateHud();
}

function handleDAS(now) {
    const dasKeys = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'KeyA', 'KeyD', 'KeyS', 'KeyF', 'KeyV'];
    
    for (const key of dasKeys) {
        if (keys[key]) {
            const direction = getDirectionFromKey(key);
            if (!direction) continue;
            
            if (!dasActive[key]) {
                // Initial press
                dasActive[key] = true;
                dasTimer[key] = now + DAS_DELAY;
                movePiece(direction.x, direction.y, direction.z);
            } else if (now > dasTimer[key]) {
                // ARR (Auto Repeat Rate)
                dasTimer[key] = now + ARR_DELAY;
                const direction = getDirectionFromKey(key);
                if (direction) {
                    movePiece(direction.x, direction.y, direction.z);
                }
            }
        } else {
            dasActive[key] = false;
        }
    }
}

function getDirectionFromKey(key) {
    switch (key) {
        case 'ArrowLeft':
        case 'KeyA':
            return { x: -1, y: 0, z: 0 };
        case 'ArrowRight':
        case 'KeyD':
            return { x: 1, y: 0, z: 0 };
        case 'ArrowDown':
        case 'KeyS':
            return { x: 0, y: -1, z: 0 };
        case 'KeyF':
            return { x: 0, y: 0, z: 1 };
        case 'KeyV':
            return { x: 0, y: 0, z: -1 };
        case 'KeyE':
            return { x: 0, y: 0, z: 1 };
        default:
            return null;
    }
}

function movePiece(x, y, z) {
    if (state !== 'playing' || paused || !currentPiece || gameOver) return;
    
    const newX = currentX + x;
    const newY = currentY + y;
    const newZ = currentZ + z;
    
    // Check if move is valid
    if (canPlacePiece(currentPiece, newX, newY, newZ)) {
        currentX = newX;
        currentY = newY;
        currentZ = newZ;
        
        // Update piece position
        currentPiece.position.set(
            currentX * CELL_SIZE,
            currentY * CELL_SIZE,
            (currentZ - DEPTH / 2) * CELL_SIZE
        );
        
        // Play sound
        if (y !== 0) {
            playDropSound();
        } else if (x !== 0 || z !== 0) {
            playMoveSound();
        }
        
        // Reset lock timer
        createGhost();
        return true;
    }
    
    return false;
}

function rotatePiece(direction = 1) {
    if (state !== 'playing' || paused || !currentPiece || gameOver) return;
    
    const currentRotation = currentPiece.userData.rotation;
    const newRotation = (currentRotation + direction + 4) % 4;
    
    // Check if rotation is valid
    if (canPlacePiece(currentPiece, currentX, currentY, currentZ, newRotation)) {
        currentPiece.userData.rotation = newRotation;
        
        // Update piece rotation
        const shape = SHAPES[currentPiece.userData.type][newRotation];
        
        for (let i = 0; i < shape.length; i++) {
            const [px, py, pz] = shape[i];
            const block = currentPiece.userData.blocks[i];
            block.position.set(px * CELL_SIZE, py * CELL_SIZE, pz * CELL_SIZE);
        }
        
        createGhost();
        playRotateSound();
        lastLockTime = Date.now(); // Reset lock timer
    }
}

function hardDrop() {
    if (state !== 'playing' || paused || !currentPiece || gameOver) return;
    
    // Find where the piece would land
    let dropY = currentY;
    while (dropY >= 0 && canPlacePiece(currentPiece, currentX, dropY, currentZ)) {
        dropY--;
    }
    dropY++; // Move back up to the last valid position
    
    // Move piece directly to landing position
    score += Math.max(0, currentY - dropY) * 2;
    currentY = dropY;
    currentPiece.position.set(
        currentX * CELL_SIZE,
        currentY * CELL_SIZE,
        (currentZ - DEPTH / 2) * CELL_SIZE
    );
    
    playHardDropSound();
    lockPiece();
}

function holdPiece() {
    if (state !== 'playing' || paused || gameOver || !currentPiece || !canHold) return;
    const type = currentPiece.userData.type;
    scene.remove(currentPiece);
    currentPiece.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) for (const material of (Array.isArray(obj.material) ? obj.material : [obj.material])) material.dispose();
    });
    if (heldPiece !== null && heldPiece !== undefined) pieceQueue.unshift(heldPiece);
    heldPiece = type;
    spawnNewPiece();
    canHold = false;
    lastDropTime = lastLockTime = Date.now();
    const holdGrid = document.getElementById('hold-grid');
    if (holdGrid) { holdGrid.textContent = ['I','O','T','S','Z','J','L'][heldPiece] || String(heldPiece); holdGrid.style.display = 'block'; holdGrid.style.color = '#' + PIECE_COLORS[heldPiece].toString(16).padStart(6,'0'); }

}

// ============================================
// INPUT HANDLING
// ============================================

function initControls() {
    document.addEventListener('keydown', (e) => {
        if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
        if (e.repeat) return;
        keys[e.code] = true;
        // Une pression courte doit agir dès keydown, même si keyup arrive
        // avant la prochaine image (clavier tactile, iframe ou cadence faible).
        const direction = getDirectionFromKey(e.code);
        if (direction && state === 'playing' && !paused && !gameOver) {
            movePiece(direction.x, direction.y, direction.z);
            dasActive[e.code] = true;
            dasTimer[e.code] = Date.now() + DAS_DELAY;
        }
        
        // Handle special keys
        switch(e.code) {
            case 'Space':
                hardDrop();
                break;
            case 'ArrowUp':
            case 'KeyW':
                rotatePiece(1);
                break;
            case 'KeyE':
                rotatePiece(1);
                break;
            case 'KeyQ':
                rotatePiece(-1);
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                holdPiece();
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
        dasActive[e.code] = false;
    });
    for (const id of ['start-button','restart-button']) document.getElementById(id)?.addEventListener('click', startGame);
    document.getElementById('resume-button')?.addEventListener('click', togglePause);
    document.getElementById('pause-button')?.addEventListener('click', togglePause);
    for (const button of document.querySelectorAll('[data-action]')) button.addEventListener('click', () => {
        if (state !== 'playing' || paused || gameOver) return;
        const action = button.dataset.action;
        if (action === 'left') movePiece(-1,0,0);
        if (action === 'right') movePiece(1,0,0);
        if (action === 'depth') movePiece(0,0,currentZ >= DEPTH - 2 ? -currentZ : 1);
        if (action === 'rotate') rotatePiece();
        if (action === 'drop') hardDrop();
        if (action === 'hold') holdPiece();
    });
    const pauseOnLeave = () => { for (const code in keys) keys[code] = false; if (state === 'playing' && !paused && !gameOver) togglePause(); };
    window.addEventListener('blur', pauseOnLeave);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pauseOnLeave(); });
}

function togglePause() {
    if (state !== 'playing' || gameOver) return;
    for (const code in keys) keys[code] = false;
    paused = !paused;
    
    if (paused) {
        showPauseScreen();
    } else {
        hidePauseScreen();
        lastDropTime = Date.now();
        lastLockTime = Date.now();
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
    
    const levelDisplay = document.getElementById('level-display');
    if (levelDisplay) {
        levelDisplay.textContent = `NIVEAU : ${level}`;
    }
    
    const linesDisplay = document.getElementById('lines-display');
    if (linesDisplay) {
        linesDisplay.textContent = `LIGNES : ${lines}`;
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
    if (!scoreSubmitted && window.ManixScores?.save) {
        scoreSubmitted = true;
        let pilot = 'PILOTE';
        try { pilot = localStorage.getItem('manixArcadePlayerName')?.trim().slice(0, 20) || pilot; } catch (e) { /* Classement facultatif. */ }
        window.ManixScores.save('Tetris 3D Ultra', pilot, score, level, runStartedAt ? Math.round((Date.now() - runStartedAt) / 1000) : 0);
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
    update(deltaTime * 1000);
    
    // Update camera
    updateCamera();
    
    // Render scene
    renderer.render(scene, camera);
}

function updateCamera() {
    // Camera animations
    camera.position.x = GRID_WIDTH / 2 + Math.sin(Date.now() * 0.0005) * 20;
    camera.position.y = GRID_HEIGHT / 1.5 + Math.cos(Date.now() * 0.0003) * 10;
    camera.position.z = GRID_DEPTH + Math.cos(Date.now() * 0.0004) * 20;
    camera.lookAt(GRID_WIDTH / 2, GRID_HEIGHT / 2, 0);
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

// Global access for debugging
window.TETRIS_3D_ULTRA = {
    startGame: startGame,
    togglePause: togglePause,
    getScore: () => score,
    getLevel: () => level,
    getLines: () => lines,
    debugState: () => ({ state, paused, gameOver, heldPiece, canHold, currentType: currentPiece?.userData.type, rotation: currentPiece?.userData.rotation, position: [currentX,currentY,currentZ], blocks: grid.reduce((sum,row) => sum + row.reduce((n,col) => n + col.filter(Boolean).length,0),0) })
};
})();
