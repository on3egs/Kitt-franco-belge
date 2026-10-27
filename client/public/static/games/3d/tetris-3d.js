// ============================================
// TETRIS 3D — Moteur de jeu 3D avec Three.js
// Rendu de blocs 3D, effets de lumière, animations fluides
// By Manix - KITT FRANCO BELGE - 2026
// ============================================

(function () {
'use strict';

// ============================================
// CONFIGURATION
// ============================================

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const BOARD_DEPTH = 1;  // Profondeur du plateau (pour l'effet 3D)
const CELL_SIZE = 2.5;
const FALL_SPEED = 0.5;
const LOCK_DELAY = 0.5;
const LINE_CLEAR_DELAY = 0.4;
const DAS_DELAY = 0.15;  // Delayed Auto Shift
const DAS_SPEED = 0.05;  // Auto Repeat Rate
const ARE_DELAY = 0.02; // Auto Repeat Every

// Qualité graphique (0 = bas, 1 = moyen, 2 = élevé)
let GRAPHICS_QUALITY = 2;

// ============================================
// ÉTAT DU JEU
// ============================================

let state = 'loading';
let score = 0, lines = 0, level = 1;
let highScore = 0;
try { highScore = Number(localStorage.getItem('tetris3dHighScore')) || 0; } catch (e) { /* noop */ }

let scene, camera, renderer;
let board = [];
let currentPiece, nextPiece, heldPiece;
let bag = [];
let fallTime = 0;
let fallSpeed = FALL_SPEED;
let lockTimer = 0;
let lastFallTime = 0;
let gameOver = false;
let paused = false;
let scoreSubmitted = false;
let canHold = true;

// Audio
let audioContext = null;
let masterGain = null;
let soundEnabled = true;
let soundVolume = 0.7;

// Contrôles
const keys = {};
let autoShiftTimer = 0;
let autoShiftDirection = 0;
let autoShiftSpeed = DAS_SPEED;
let lastShiftTime = 0;
let softDropSpeed = 0.05;
let lastSoftDropTime = 0;

// Caméra
let cameraMode = 'dynamic'; // dynamic, fixed, top-down
let cameraTarget = new THREE.Vector3();
let cameraOffset = new THREE.Vector3(0, 25, 15);
let cameraLookAt = new THREE.Vector3();

// Animation
let lastTime = 0;
let clock = new THREE.Clock();

// DOM Elements
let nextCanvas, nextCtx;

// Colors
const COLORS = {
    background: 0x020305,
    board: 0x1a1208,
    grid: 0x2a180c,
    border: 0x63e9ff,
    cyan: 0x00ffff,
    blue: 0x00a2ff,
    orange: 0xff8c35,
    yellow: 0xffff00,
    green: 0x00ff88,
    purple: 0xff4d72,
    red: 0xff2a3a,
    gold: 0xffd15a
};

// Piece definitions
const SHAPES = [
    [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],  // I
    [[1, 1], [1, 1]],                                          // O
    [[0, 1, 0], [1, 1, 1], [0, 0, 0]],                      // T
    [[1, 0, 0], [1, 1, 1], [0, 0, 0]],                      // L
    [[0, 0, 1], [1, 1, 1], [0, 0, 0]],                      // J
    [[1, 1, 0], [0, 1, 1], [0, 0, 0]],                      // S
    [[0, 1, 1], [1, 1, 0], [0, 0, 0]]                       // Z
];

const PIECE_COLORS = [
    COLORS.cyan,    // I
    COLORS.yellow,  // O
    COLORS.purple,  // T
    COLORS.orange,  // L
    COLORS.blue,    // J
    COLORS.green,   // S
    COLORS.red      // Z
];

const PIECE_NAMES = ['I', 'O', 'T', 'L', 'J', 'S', 'Z'];

// Board objects (for 3D rendering)
let boardMeshes = [];
let currentMeshes = [];
let ghostMeshes = [];
let nextMeshes = [];
let heldMeshes = [];

// Effects
let particles = [];
let MAX_PARTICLES = 150;

// ============================================
// INITIALIZATION
// ============================================

function initScene() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.background);
    scene.fog = new THREE.FogExp2(COLORS.background, 0.05);

    // Camera
    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 30, 25);
    camera.lookAt(0, 10, 0);
    
    cameraTarget = new THREE.Vector3(0, 10, 0);
    cameraLookAt = new THREE.Vector3(0, 10, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ 
        antialias: GRAPHICS_QUALITY > 0,
        alpha: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = GRAPHICS_QUALITY >= 2;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x444466, 0.5);
    scene.add(ambientLight);
    
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(50, 80, 30);
    mainLight.castShadow = GRAPHICS_QUALITY >= 2;
    if (mainLight.castShadow) {
        mainLight.shadow.mapSize.width = 1024;
        mainLight.shadow.mapSize.height = 1024;
        mainLight.shadow.camera.near = 0.5;
        mainLight.shadow.camera.far = 100;
        mainLight.shadow.camera.left = -40;
        mainLight.shadow.camera.right = 40;
        mainLight.shadow.camera.top = 40;
        mainLight.shadow.camera.bottom = -40;
    }
    scene.add(mainLight);
    
    const pointLight = new THREE.PointLight(0x63e9ff, 1.0, 50);
    pointLight.position.set(0, 30, 0);
    scene.add(pointLight);
    
    const pointLight2 = new THREE.PointLight(0xffd15a, 0.8, 50);
    pointLight2.position.set(20, 20, 20);
    scene.add(pointLight2);

    // Grid helper (for debugging in low quality)
    if (GRAPHICS_QUALITY >= 2) {
        const gridHelper = new THREE.GridHelper(40, 20, COLORS.grid, COLORS.grid);
        gridHelper.position.set(-10, -1, -5);
        scene.add(gridHelper);
    }
    
    // Create board
    createBoard();
    
    // Create background
    createBackground();
    
    // Create KYRONEXT logo
    createKyronextLogo();
    
    // Handle resize
    window.addEventListener('resize', onWindowResize);
}

function createBoard() {
    // Clear existing board
    boardMeshes.forEach(mesh => scene.remove(mesh));
    boardMeshes = [];
    
    // Board dimensions
    const width = BOARD_WIDTH * CELL_SIZE;
    const height = BOARD_HEIGHT * CELL_SIZE;
    const depth = BOARD_DEPTH * CELL_SIZE;
    
    // Board base
    const boardGeometry = new THREE.BoxGeometry(width + 0.2, height + 0.2, depth + 0.2);
    const boardMaterial = new THREE.MeshPhongMaterial({
        color: COLORS.board,
        emissive: 0x111122,
        emissiveIntensity: 0.1,
        specular: 0x333344,
        shininess: 10
    });
    
    const boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);
    boardMesh.position.set(width / 2 - CELL_SIZE / 2, height / 2 - CELL_SIZE / 2, depth / 2);
    boardMesh.castShadow = false;
    boardMesh.receiveShadow = true;
    scene.add(boardMesh);
    boardMeshes.push(boardMesh);
    
    // Board border
    const borderGeometry = new THREE.BoxGeometry(width + 0.4, height + 0.4, depth + 0.4);
    const borderMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.border,
        transparent: true,
        opacity: 0.8,
        wireframe: true
    });
    
    const borderMesh = new THREE.Mesh(borderGeometry, borderMaterial);
    borderMesh.position.set(width / 2 - CELL_SIZE / 2, height / 2 - CELL_SIZE / 2, depth / 2);
    scene.add(borderMesh);
    boardMeshes.push(borderMesh);
    
    // Create cells
    for (let y = 0; y < BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
            const cellGeometry = new THREE.BoxGeometry(CELL_SIZE * 0.95, CELL_SIZE * 0.95, CELL_SIZE * 0.95);
            const cellMaterial = new THREE.MeshPhongMaterial({
                color: COLORS.background,
                transparent: true,
                opacity: 0.1,
                specular: 0x222233,
                shininess: 5
            });
            
            const cell = new THREE.Mesh(cellGeometry, cellMaterial);
            cell.position.set(
                x * CELL_SIZE + CELL_SIZE / 2,
                y * CELL_SIZE + CELL_SIZE / 2,
                0
            );
            cell.visible = false; // Will be shown when occupied
            scene.add(cell);
            boardMeshes.push(cell);
        }
    }
    
    // Initialize board array
    board = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));
}

function createBackground() {
    // Skybox
    const skyboxGeometry = new THREE.SphereGeometry(50, 32, 32);
    const skyboxMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.background,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.1
    });
    
    const skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
    skybox.position.set(0, 10, 0);
    scene.add(skybox);
    
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.8,
        metalness: 0.2
    });
    
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1, 0);
    floor.receiveShadow = true;
    scene.add(floor);
    
    // Decorative elements
    if (GRAPHICS_QUALITY >= 2) {
        createDecorativeElements();
    }
}

function createDecorativeElements() {
    // Spotlights
    const spotLight1 = new THREE.SpotLight(0x63e9ff, 0.5, 50, Math.PI / 6, 0.1);
    spotLight1.position.set(-15, 30, -10);
    spotLight1.target.position.set(0, 0, 0);
    spotLight1.castShadow = true;
    scene.add(spotLight1);
    scene.add(spotLight1.target);
    
    const spotLight2 = new THREE.SpotLight(0xffd15a, 0.5, 50, Math.PI / 6, 0.1);
    spotLight2.position.set(15, 30, 10);
    spotLight2.target.position.set(0, 0, 0);
    spotLight2.castShadow = true;
    scene.add(spotLight2);
    scene.add(spotLight2.target);
    
    // Animated particles
    createAmbientParticles();
}

function createAmbientParticles() {
    const particleCount = 50;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 30;
        positions[i * 3 + 1] = 10 + Math.random() * 30;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
        
        const colorIndex = Math.floor(Math.random() * PIECE_COLORS.length);
        const color = PIECE_COLORS[colorIndex];
        colors[i * 3] = (color >> 16) / 255;
        colors[i * 3 + 1] = ((color >> 8) & 0xFF) / 255;
        colors[i * 3 + 2] = (color & 0xFF) / 255;
        
        sizes[i] = 0.1 + Math.random() * 0.3;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const material = new THREE.PointsMaterial({
        size: 0.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending
    });
    
    const particlesMesh = new THREE.Points(geometry, material);
    scene.add(particlesMesh);
}

function createKyronextLogo() {
    if (GRAPHICS_QUALITY < 1) return;
    
    const word = 'KYRONEXT';
    const letters = [];
    const colors = [COLORS.cyan, COLORS.yellow, COLORS.purple, COLORS.orange, 
                    COLORS.blue, COLORS.green, COLORS.red, COLORS.gold];
    
    for (let i = 0; i < word.length; i++) {
        const letter = createLetter(word[i], colors[i % colors.length]);
        letter.position.x = (i - (word.length - 1) / 2) * 3;
        letter.position.y = 25;
        letter.position.z = -15;
        letters.push(letter);
    }
}

function createLetter(char, color) {
    const group = new THREE.Group();
    
    // Letter definitions (simplified)
    const definitions = {
        'K': [[1,0,0,1],[1,0,1,0],[1,1,0,0],[1,0,1,0],[1,0,0,1]],
        'Y': [[1,0,0,1],[1,0,0,1],[0,1,1,0],[0,0,1,0],[0,0,1,0]],
        'R': [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,1,0],[1,0,0,1]],
        'O': [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
        'N': [[1,0,0,1],[1,1,0,1],[1,0,1,1],[1,0,0,1],[1,0,0,1]],
        'E': [[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,1,1,1]],
        'X': [[1,0,0,1],[0,1,1,0],[0,0,1,0],[0,1,1,0],[1,0,0,1]],
        'T': [[1,1,1,0],[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]
    };
    
    const def = definitions[char] || definitions['X'];
    
    for (let y = 0; y < def.length; y++) {
        for (let x = 0; x < def[y].length; x++) {
            if (def[y][x]) {
                const boxGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
                const boxMaterial = new THREE.MeshPhongMaterial({
                    color: color,
                    emissive: color,
                    emissiveIntensity: 0.3,
                    specular: 0xffffff,
                    shininess: 30
                });
                const box = new THREE.Mesh(boxGeometry, boxMaterial);
                box.position.set(
                    (x - (def[y].length - 1) / 2) * 0.9,
                    (def.length - 1 - y) * 0.9,
                    0
                );
                group.add(box);
            }
        }
    }
    
    return group;
}

function createPieceMeshes(piece, x, y, z, isGhost) {
    const meshes = [];
    const color = isGhost ? 0x333333 : PIECE_COLORS[piece.type];
    const opacity = isGhost ? 0.3 : 1.0;
    
    for (let py = 0; py < piece.shape.length; py++) {
        for (let px = 0; px < piece.shape[py].length; px++) {
            if (piece.shape[py][px]) {
                const boxGeometry = new THREE.BoxGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.9, CELL_SIZE * 0.9);
                const boxMaterial = new THREE.MeshPhongMaterial({
                    color: color,
                    transparent: isGhost,
                    opacity: opacity,
                    specular: 0xffffff,
                    shininess: 40,
                    emissive: color,
                    emissiveIntensity: isGhost ? 0 : 0.1
                });
                
                const box = new THREE.Mesh(boxGeometry, boxMaterial);
                box.position.set(
                    (x + px) * CELL_SIZE + CELL_SIZE / 2,
                    (y - py) * CELL_SIZE + CELL_SIZE / 2,
                    z || 0
                );
                box.castShadow = !isGhost && GRAPHICS_QUALITY >= 2;
                box.receiveShadow = !isGhost;
                scene.add(box);
                meshes.push(box);
            }
        }
    }
    
    return meshes;
}

// ============================================
// PIECES
// ============================================

function newPiece() {
    if (bag.length === 0) {
        bag = [0, 1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
    }
    
    const type = bag.pop();
    return {
        type: type,
        shape: JSON.parse(JSON.stringify(SHAPES[type])),
        color: PIECE_COLORS[type],
        x: Math.floor(BOARD_WIDTH / 2) - Math.floor(SHAPES[type][0].length / 2),
        y: BOARD_HEIGHT - 1,
        z: 0
    };
}

function collides(piece, dx = 0, dy = 0, shape = piece.shape) {
    return shape.some((row, py) =>
        row.some((filled, px) => {
            if (!filled) return false;
            const boardX = piece.x + px + dx;
            const boardY = piece.y - py + dy;
            return boardX < 0 || boardX >= BOARD_WIDTH || 
                   boardY < 0 || boardY >= BOARD_HEIGHT ||
                   (boardY >= 0 && board[boardY][boardX]);
        })
    );
}

function rotate(piece) {
    const rotated = piece.shape[0].map((_, index) =>
        piece.shape.map((row) => row[index]).reverse()
    );
    
    // Wall kicks
    const kicks = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [0, 1]];
    
    for (const [offsetX, offsetY] of kicks) {
        if (!collides(piece, offsetX, offsetY, rotated)) {
            piece.x += offsetX;
            piece.y += offsetY;
            piece.shape = rotated;
            updatePieceMeshes();
            playSound('rotate');
            return;
        }
    }
}

function hold() {
    if (!canHold || paused || gameOver) return;
    
    if (!heldPiece) {
        heldPiece = {
            type: currentPiece.type,
            shape: JSON.parse(JSON.stringify(SHAPES[currentPiece.type])),
            color: currentPiece.color,
            x: 0,
            y: 0
        };
        currentPiece = nextPiece;
        nextPiece = newPiece();
    } else {
        const temp = {
            type: heldPiece.type,
            shape: JSON.parse(JSON.stringify(SHAPES[heldPiece.type])),
            color: heldPiece.color,
            x: Math.floor((BOARD_WIDTH - SHAPES[heldPiece.type][0].length) / 2),
            y: BOARD_HEIGHT - 1
        };
        heldPiece = {
            type: currentPiece.type,
            shape: JSON.parse(JSON.stringify(SHAPES[currentPiece.type])),
            color: currentPiece.color,
            x: 0,
            y: 0
        };
        currentPiece = temp;
    }
    
    canHold = false;
    lockTimer = 0; fallTime = 0;
    updateHud();
    
    if (collides(currentPiece)) {
        endGame();
        return;
    }
    
    updatePieceMeshes();
    playSound('hold');
}

function lock() {
    // Place piece on board
    currentPiece.shape.forEach((row, py) => {
        row.forEach((filled, px) => {
            if (filled && currentPiece.y - py >= 0) {
                board[currentPiece.y - py][currentPiece.x + px] = currentPiece.type + 1;
            }
        });
    });
    
    // Check for line clears
    const clearedLines = [];
    for (let y = 0; y < BOARD_HEIGHT; y++) {
        if (board[y].every(cell => cell !== 0)) {
            clearedLines.push(y);
        }
    }
    
    // Clear lines
    if (clearedLines.length > 0) {
        clearLines(clearedLines);
    }
    
    // Get next piece
    currentPiece = nextPiece;
    nextPiece = newPiece();
    canHold = true;
    
    // Check for game over
    if (collides(currentPiece)) {
        gameOver = true;
        paused = true;
        playSound('gameOver');
    }
    
    lockTimer = 0;
}

function clearLines(clearedLines) {
    lines += clearedLines.length;
    score += [0, 100, 300, 500, 800][clearedLines.length] * level;
    level = Math.min(10, 1 + Math.floor(lines / 10));
    fallSpeed = FALL_SPEED - (level - 1) * 0.05;
    
    // Update speed
    if (clearedLines.length === 4) {
        // Tetris!
        showLevelUp(`TETRIS ${level}!`);
    } else if (clearedLines.length > 0) {
        showLevelUp(`+${[0, 100, 300, 500, 800][clearedLines.length] * level}!`);
    }
    
    // Create clear effect
    showClearEffect(clearedLines.length);
    playClearSound(clearedLines.length);
    
    // Remove cleared lines from board
    for (const line of clearedLines) {
        board.splice(line, 1);
    }
    
    // Add empty lines at top
    for (let i = 0; i < clearedLines.length; i++) {
        board.unshift(Array(BOARD_WIDTH).fill(0));
    }
    
    // Update board visualization
    updateBoard();
    
    // Create falling blocks effect
    createClearParticles(clearedLines);
}

function createClearParticles(clearedLines) {
    const color = PIECE_COLORS[level % PIECE_COLORS.length];
    
    for (const line of clearedLines) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
            if (board[line][x] !== 0) {
                for (let i = 0; i < 3; i++) {
                    if (particles.length >= MAX_PARTICLES) break;
                    
                    const particle = {
                        x: x * CELL_SIZE + CELL_SIZE / 2,
                        y: line * CELL_SIZE + CELL_SIZE / 2,
                        z: 0,
                        vx: (Math.random() - 0.5) * 10,
                        vy: 5 + Math.random() * 5,
                        vz: (Math.random() - 0.5) * 5,
                        life: 1.0,
                        maxLife: 1.0,
                        size: 0.3 + Math.random() * 0.2,
                        color: color,
                        mesh: null
                    };
                    
                    particles.push(particle);
                }
            }
        }
    }
}

// ============================================
// RENDERING
// ============================================

function updateBoard() {
    // Remove old board cells
    const oldMeshes = boardMeshes.filter(mesh => !mesh.userData || mesh.userData.type !== 'cell');
    boardMeshes.forEach(mesh => {
        if (mesh.userData && mesh.userData.type === 'cell') {
            scene.remove(mesh);
        }
    });
    boardMeshes = oldMeshes;
    
    // Create new cells
    for (let y = 0; y < BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
            if (board[y][x] !== 0) {
                const cellGeometry = new THREE.BoxGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.9, CELL_SIZE * 0.9);
                const cellMaterial = new THREE.MeshPhongMaterial({
                    color: PIECE_COLORS[board[y][x] - 1],
                    specular: 0xffffff,
                    shininess: 40,
                    emissive: PIECE_COLORS[board[y][x] - 1],
                    emissiveIntensity: 0.1
                });
                
                const cell = new THREE.Mesh(cellGeometry, cellMaterial);
                cell.position.set(
                    x * CELL_SIZE + CELL_SIZE / 2,
                    y * CELL_SIZE + CELL_SIZE / 2,
                    0
                );
                cell.castShadow = GRAPHICS_QUALITY >= 2;
                cell.receiveShadow = true;
                cell.userData = { type: 'cell' };
                scene.add(cell);
                boardMeshes.push(cell);
            }
        }
    }
}

function updatePieceMeshes() {
    // Libérer les anciennes ressources GPU des pièces et du fantôme.
    [...currentMeshes, ...ghostMeshes].forEach(mesh => {
        scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
    });
    
    currentMeshes = createPieceMeshes(currentPiece, currentPiece.x, currentPiece.y, 0, false);
    
    // Create ghost piece
    let ghostY = currentPiece.y;
    while (!collides({ ...currentPiece, y: ghostY }, 0, -1)) {
        ghostY--;
    }
    ghostMeshes = createPieceMeshes({ ...currentPiece, y: ghostY }, currentPiece.x, ghostY, 0, true);
    
    // Update next piece preview
    updateNextPreview();
    
    // Update held piece preview
    updateHeldPreview();
}

function updateNextPreview() {
    if (!nextCanvas || !nextCtx) return;
    
    // Clear canvas
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    
    // Draw next piece
    const cellSize = nextCanvas.width / 4;
    const offsetX = nextCanvas.width / 2 - (nextPiece.shape[0].length * cellSize) / 2;
    const offsetY = nextCanvas.height / 2 - (nextPiece.shape.length * cellSize) / 2;
    
    nextPiece.shape.forEach((row, y) => {
        row.forEach((filled, x) => {
            if (filled) {
                nextCtx.fillStyle = '#' + PIECE_COLORS[nextPiece.type].toString(16).padStart(6, '0');
                nextCtx.fillRect(
                    offsetX + x * cellSize,
                    offsetY + y * cellSize,
                    cellSize - 2,
                    cellSize - 2
                );
                
                // Add highlight
                nextCtx.fillStyle = 'rgba(255,255,255,0.4)';
                nextCtx.fillRect(
                    offsetX + x * cellSize + 1,
                    offsetY + y * cellSize + 1,
                    cellSize / 3,
                    cellSize / 4
                );
            }
        });
    });
}

function updateHeldPreview() {
    el('hold-value').textContent = heldPiece ? PIECE_NAMES[heldPiece.type] + (canHold ? '' : ' 🔒') : '—';
}

function render() {
    requestAnimationFrame(render);
    
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();
    
    if (state === 'playing' && !paused && !gameOver) {
        updateGame(delta, elapsed);
    }
    
    // Update camera
    updateCamera(delta);
    
    // Render scene
    renderer.render(scene, camera);
}

function updateGame(delta, elapsed) {
    if (gameOver) return;
    
    // Gravité et délai de verrouillage mesurés à chaque image.
    fallTime += delta;
    if (fallTime >= fallSpeed) {
        fallTime = 0;
        if (!collides(currentPiece, 0, -1)) {
            currentPiece.y--;
            updatePieceMeshes();
        }
    }
    if (collides(currentPiece, 0, -1)) {
        lockTimer += delta;
        if (lockTimer >= LOCK_DELAY) { lock(); updatePieceMeshes(); }
    } else { lockTimer = 0; }
    if (gameOver) return;
    // Handle automatic falling (soft drop)
    if (keys['ArrowDown'] || keys['KeyS']) {
        if (!softDropPressed) {
            softDropPressed = true;
            softDropTime = 0;
        }
        
        softDropTime += delta;
        if (softDropTime >= softDropSpeed) {
            softDropTime = 0;
            if (!collides(currentPiece, 0, -1)) {
                currentPiece.y--;
                updatePieceMeshes();
                score += 1; // Soft drop scoring
                lockTimer = 0;
            }
        }
    } else {
        softDropPressed = false;
    }
    
    // Handle DAS (Delayed Auto Shift)
    if ((keys['ArrowLeft'] || keys['KeyA'] || (joy.active && joy.x < -0.3)) && !keys['ArrowRight'] && !keys['KeyD']) {
        if (!leftPressed) {
            leftPressed = true;
            autoShiftDirection = -1;
            autoShiftTimer = DAS_DELAY;
            movePiece(-1, 0);
        }
        
        autoShiftTimer -= delta;
        if (autoShiftTimer <= 0) {
            autoShiftTimer = ARE_DELAY;
            if (!collides(currentPiece, autoShiftDirection, 0)) {
                movePiece(autoShiftDirection, 0);
            }
        }
    } else if ((keys['ArrowRight'] || keys['KeyD'] || (joy.active && joy.x > 0.3)) && !keys['ArrowLeft'] && !keys['KeyA']) {
        if (!rightPressed) {
            rightPressed = true;
            autoShiftDirection = 1;
            autoShiftTimer = DAS_DELAY;
            movePiece(1, 0);
        }
        
        autoShiftTimer -= delta;
        if (autoShiftTimer <= 0) {
            autoShiftTimer = ARE_DELAY;
            if (!collides(currentPiece, autoShiftDirection, 0)) {
                movePiece(autoShiftDirection, 0);
            }
        }
    } else {
        leftPressed = false;
        rightPressed = false;
        autoShiftTimer = 0;
    }
    
    // Handle rotation
    if ((keys['ArrowUp'] || keys['KeyW']) && !rotatePressed) {
        rotatePressed = true;
        rotate(currentPiece);
    } else if (!keys['ArrowUp'] && !keys['KeyW']) {
        rotatePressed = false;
    }
    
    // Handle hold
    if ((keys['KeyC'] || (keys['ShiftLeft'] || keys['ShiftRight'])) && !holdPressed) {
        holdPressed = true;
        hold();
    } else if (!keys['KeyC'] && !(keys['ShiftLeft'] || keys['ShiftRight'])) {
        holdPressed = false;
    }
    
    // Handle hard drop
    if (keys['Space'] && !hardDropPressed) {
        hardDropPressed = true;
        hardDrop();
    } else if (!keys['Space']) {
        hardDropPressed = false;
    }
    
    updateHud();
    // Update particles
    updateParticles(delta);
}

function updateCamera(delta) {
    if (cameraMode === 'dynamic') {
        const targetX = BOARD_WIDTH * CELL_SIZE / 2;
        const targetY = BOARD_HEIGHT * CELL_SIZE / 2;
        const targetZ = 0;
        
        camera.position.lerp(new THREE.Vector3(targetX, targetY + 15, targetZ + 20), 0.05);
        camera.lookAt(new THREE.Vector3(targetX, targetY, targetZ));
    } else if (cameraMode === 'top-down') {
        camera.position.set(
            BOARD_WIDTH * CELL_SIZE / 2,
            BOARD_HEIGHT * CELL_SIZE + 10,
            0
        );
        camera.lookAt(
            BOARD_WIDTH * CELL_SIZE / 2,
            BOARD_HEIGHT * CELL_SIZE / 2,
            0
        );
    } else if (cameraMode === 'side') {
        camera.position.set(
            -15,
            BOARD_HEIGHT * CELL_SIZE / 2,
            20
        );
        camera.lookAt(
            BOARD_WIDTH * CELL_SIZE / 2,
            BOARD_HEIGHT * CELL_SIZE / 2,
            0
        );
    }
}

function updateParticles(delta) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.z += p.vz * delta;
        p.life -= delta;
        
        // Remove particle if dead
        if (p.life <= 0) {
            if (p.mesh) scene.remove(p.mesh);
            particles.splice(i, 1);
            continue;
        }
        
        // Update particle position
        if (p.mesh) {
            const positions = p.mesh.geometry.attributes.position;
            positions.setXYZ(0, p.x, p.y, p.z);
            positions.needsUpdate = true;
            p.mesh.material.opacity = p.life / p.maxLife;
        }
    }
    
    // Limit particles
    while (particles.length > MAX_PARTICLES) {
        const p = particles.pop();
        if (p.mesh) scene.remove(p.mesh);
    }
}

function movePiece(dx, dy) {
    if (!collides(currentPiece, dx, dy)) {
        currentPiece.x += dx;
        currentPiece.y += dy;
        updatePieceMeshes();
        playSound('move');
    }
}

function hardDrop() {
    while (!collides(currentPiece, 0, -1)) {
        currentPiece.y--;
        score += 2; // Hard drop scoring
    }
    lock();
    updatePieceMeshes();
    playSound('drop');
}

// ============================================
// EFFECTS
// ============================================

function showClearEffect(lines) {
    const clearEffect = document.getElementById('clear-effect');
    const clearText = document.getElementById('clear-text');
    
    clearText.textContent = lines === 1 ? 'LIGNE !' : lines === 2 ? 'DOUBLE!' : lines === 3 ? 'TRIPLE!' : 'TETRIS!';
    clearText.style.color = ['#ffffff', '#ffff00', '#00ffff', '#ff00ff'][Math.min(lines, 3)];
    
    clearEffect.classList.add('visible');
    setTimeout(() => {
        clearEffect.classList.remove('visible');
    }, 500);
}

function showLevelUp(text) {
    const levelUp = document.getElementById('level-up-notification');
    levelUp.textContent = text;
    levelUp.classList.add('visible');
    setTimeout(() => {
        levelUp.classList.remove('visible');
    }, 800);
}

// ============================================
// SOUND
// ============================================

function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioContext.createGain();
        masterGain.gain.value = soundVolume;
        masterGain.connect(audioContext.destination);
    } catch (e) {
        console.log('Audio non disponible:', e);
        soundEnabled = false;
    }
}

function playSound(type) {
    if (!audioContext || !soundEnabled) return;
    
    let frequency, duration, waveType;
    
    switch (type) {
        case 'move':
            frequency = 260 + level * 20;
            duration = 0.025;
            waveType = 'triangle';
            break;
        case 'rotate':
            frequency = 392;
            duration = 0.035;
            waveType = 'triangle';
            break;
        case 'drop':
            frequency = 220 + level * 10;
            duration = 0.05;
            waveType = 'triangle';
            break;
        case 'hold':
            frequency = 440;
            duration = 0.04;
            waveType = 'square';
            break;
        case 'gameOver':
            frequency = 100;
            duration = 0.2;
            waveType = 'sawtooth';
            for (let i = 0; i < 3; i++) {
                playNote(frequency * Math.pow(1.5, i), duration, waveType, 0.08 + i * 0.05);
            }
            return;
        case 'clear':
            return; // Handled by playClearSound
        default:
            return;
    }
    
    playNote(frequency, duration, waveType, 0.05);
}

function playNote(frequency, duration, type, gain) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gainNode.gain.value = gain * soundVolume;
    
    oscillator.connect(gainNode);
    gainNode.connect(masterGain);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
    
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
}

function playClearSound(lines) {
    if (!audioContext || !soundEnabled) return;
    
    const notes = [220, 277, 330, 392];
    const durations = [0.1, 0.12, 0.14, 0.16];
    const types = ['triangle', 'square', 'sawtooth', 'sine'];
    
    for (let i = 0; i < lines; i++) {
        playNote(notes[i] + lines * 20, durations[i], types[i], 0.07);
    }
    
    if (lines === 4) {
        playNote(660, 0.2, 'square', 0.08);
        playNote(880, 0.15, 'triangle', 0.06);
    }
}

// ============================================
// INPUT HANDLING
// ============================================

let leftPressed = false, rightPressed = false, rotatePressed = false;
let holdPressed = false, hardDropPressed = false, softDropPressed = false;
let softDropTime = 0;
const joy = { active: false, id: null, x: 0, y: 0 };

function handleKeyDown(e) {
    if (e.repeat && ['Escape','KeyP','KeyM','KeyG','KeyV','Enter','KeyR'].includes(e.code)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    if (e.code === 'Escape' || e.code === 'KeyP') {
        if (state === 'playing') togglePause();
        else if (state === 'paused') togglePause(false);
    }
    
    if (e.code === 'Enter' || e.code === 'KeyR') {
        if (state === 'menu') { 
            playUIClick(); 
            startGame(); 
        } else if (state === 'gameover') { 
            playUIClick(); 
            startGame(); 
        }
    }
    
    if (e.code === 'KeyM') {
        toggleMute();
    }
    
    if (e.code === 'KeyG') {
        toggleGraphics();
    }
    
    if (e.code === 'KeyV') {
        toggleCamera();
    }
}

function handleKeyUp(e) {
    keys[e.code] = false;
}

function setupTouch() {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (!isTouchDevice) return;
    
    document.getElementById('touch-joystick').classList.add('visible');
    document.getElementById('touch-fire').classList.add('visible');
    document.getElementById('touch-rotate').classList.add('visible');
    document.getElementById('touch-hold').classList.add('visible');
    document.getElementById('touch-ui').classList.add('visible');
    
    // Joystick for left/right movement
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    const R = 50;
    
    function setKnob(dx, dy) {
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
    
    base.addEventListener('touchstart', e => {
        e.preventDefault();
        joy.active = true; joy.id = e.changedTouches[0].identifier;
        
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }, { passive: false });
    
    base.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier !== joy.id) continue;
            const r = base.getBoundingClientRect();
            let dx = t.clientX - (r.left + r.width / 2);
            let dy = t.clientY - (r.top + r.height / 2);
            const d = Math.hypot(dx, dy) || 1;
            const cl = Math.min(d, R);
            dx = dx / d * cl;
            dy = dy / d * cl;
            joy.x = dx / R;
            joy.y = dy / R;
            setKnob(dx, dy);
        }
    }, { passive: false });
    
    function joyEnd(e) {
        for (const t of e.changedTouches) {
            if (t.identifier !== joy.id) continue;
            joy.active = false; joy.id = null; joy.x = 0; joy.y = 0;
            setKnob(0, 0);
        }
    }
    
    base.addEventListener('touchend', joyEnd);
    base.addEventListener('touchcancel', joyEnd);
    
    // Buttons
    const fireBtn = document.getElementById('touch-fire');
    fireBtn.addEventListener('touchcancel', () => { keys['ArrowDown'] = false; });
    fireBtn.addEventListener('touchstart', e => { 
        e.preventDefault(); 
        keys['ArrowDown'] = true;
    }, { passive: false });
    fireBtn.addEventListener('touchend', e => { 
        e.preventDefault(); 
        keys['ArrowDown'] = false;
    }, { passive: false });
    
    const rotateBtn = document.getElementById('touch-rotate');
    rotateBtn.addEventListener('touchcancel', () => { keys['ArrowUp'] = false; });
    rotateBtn.addEventListener('touchstart', e => { 
        e.preventDefault(); 
        keys['ArrowUp'] = true;
    }, { passive: false });
    rotateBtn.addEventListener('touchend', e => { 
        e.preventDefault(); 
        keys['ArrowUp'] = false;
    }, { passive: false });
    
    const holdBtn = document.getElementById('touch-hold');
    holdBtn.addEventListener('touchcancel', () => { keys['KeyC'] = false; });
    holdBtn.addEventListener('touchstart', e => { 
        e.preventDefault(); 
        keys['KeyC'] = true;
    }, { passive: false });
    holdBtn.addEventListener('touchend', e => { 
        e.preventDefault(); 
        keys['KeyC'] = false;
    }, { passive: false });
}

// ============================================
// UI
// ============================================

const el = id => document.getElementById(id);

function updateHud() {
    el('score-value').textContent = score;
    el('lines-value').textContent = lines;
    el('level-value').textContent = level;
    el('highscore-value').textContent = Math.max(highScore, score);
    
    updateHeldPreview();
}

function showScreen(name) {
    el('loading-screen').classList.add('hidden');
    el('main-menu').classList.toggle('visible', name === 'menu');
    el('game-container').style.display = name === 'game' ? 'block' : 'none';
    el('gameover-screen').classList.toggle('visible', name === 'gameover');
    el('pause-screen').classList.remove('visible');
    el('hud').style.display = name === 'game' ? 'flex' : 'none';
    el('next-preview').classList.toggle('hidden', name !== 'game');
}

function showMenu() {
    state = 'menu';
    showScreen('menu');
    el('menu-highscore').textContent = highScore;
}

function startGame() {
    score = 0; lines = 0; level = 1;
    fallTime = 0; lockTimer = 0; bag = [];
    for (const code in keys) keys[code] = false;
    leftPressed = rightPressed = rotatePressed = holdPressed = hardDropPressed = softDropPressed = false;
    fallSpeed = FALL_SPEED;
    gameOver = false;
    paused = false;
    scoreSubmitted = false;
    
    resetGame();
    showScreen('game');
    state = 'playing';
    
    // Spawn first piece
    currentPiece = newPiece();
    nextPiece = newPiece();
    heldPiece = null;
    canHold = true;
    
    updatePieceMeshes();
    updateHud();
    
    // Initialize next canvas
    initNextCanvas();
}

function resetGame() {
    // Clear board
    board = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));
    
    // Clear all meshes
    boardMeshes.forEach(mesh => scene.remove(mesh));
    currentMeshes.forEach(mesh => scene.remove(mesh));
    ghostMeshes.forEach(mesh => scene.remove(mesh));
    nextMeshes.forEach(mesh => scene.remove(mesh));
    heldMeshes.forEach(mesh => scene.remove(mesh));
    particles.forEach(p => { if (p.mesh) scene.remove(p.mesh); });
    
    boardMeshes = [];
    currentMeshes = [];
    ghostMeshes = [];
    nextMeshes = [];
    heldMeshes = [];
    particles = [];
    
    // Recreate board
    createBoard();
}

function initNextCanvas() {
    nextCanvas = document.getElementById('next-canvas');
    if (!nextCanvas) return;
    
    nextCtx = nextCanvas.getContext('2d');
    nextCanvas.width = 100;
    nextCanvas.height = 100;
    
    // Dark background
    nextCtx.fillStyle = 'rgba(4,5,11,0.85)';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    
    // Border
    nextCtx.strokeStyle = '#63e9ff';
    nextCtx.lineWidth = 2;
    nextCtx.strokeRect(2, 2, nextCanvas.width - 4, nextCanvas.height - 4);
    
    updateNextPreview();
}

function togglePause(force) {
    if (state !== 'playing' && state !== 'paused') return;
    const toPause = force != null ? force : state === 'playing';
    for (const code in keys) keys[code] = false;
    joy.active = false; joy.x = joy.y = 0;
    if (toPause) {
        state = 'paused';
        el('pause-screen').classList.add('visible');
    } else {
        state = 'playing';
        el('pause-screen').classList.remove('visible');
    }
}

function toggleMute() {
    soundEnabled = !soundEnabled;
    const btn = el('btn-mute') || el('btn-sound-ui');
    if (btn) btn.textContent = soundEnabled ? '🔊 SON' : '🔇 MUET';
    
    const btn2 = el('btn-pause-mute');
    if (btn2) btn2.textContent = soundEnabled ? '🔊 SON' : '🔇 MUET';
}

function toggleGraphics() {
    GRAPHICS_QUALITY = (GRAPHICS_QUALITY + 1) % 3;
    const value = ['BASSE', 'MOYENNE', 'ÉLEVÉE'][GRAPHICS_QUALITY];
    el('graphics-value').textContent = value;
    
    renderer.shadowMap.enabled = GRAPHICS_QUALITY >= 2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GRAPHICS_QUALITY === 0 ? 1 : 2));
    scene.traverse(obj => { if (obj.isMesh) obj.castShadow = GRAPHICS_QUALITY >= 2; });

}

function toggleCamera() {
    const modes = ['dynamic', 'top-down', 'side'];
    cameraMode = modes[(modes.indexOf(cameraMode) + 1) % modes.length];
    const value = ['DYNAMIQUE', 'HAUT', 'CÔTÉ'][modes.indexOf(cameraMode)];
    el('camera-value').textContent = value;
}

function playUIClick() {
    if (!audioContext || !soundEnabled) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gainNode.gain.value = 0.05 * soundVolume;
    
    oscillator.connect(gainNode);
    gainNode.connect(masterGain);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.05);
    
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);
}

function endGame() {
    state = 'gameover';
    gameOver = true;
    paused = true;
    playSound('gameOver');
    
    const isRecord = score > highScore;
    if (isRecord) {
        highScore = score;
        try { localStorage.setItem('tetris3dHighScore', String(highScore)); } catch (e) { /* noop */ }
    }
    
    el('gameover-score').textContent = score;
    el('gameover-lines').textContent = lines;
    el('gameover-level').textContent = level;
    el('gameover-highscore').textContent = highScore;
    el('gameover-newrecord').style.display = isRecord ? 'block' : 'none';
    
    setTimeout(() => {
        showScreen('gameover');
    }, 900);
}

function cleanupScene() {
    // Remove all objects from scene
    while (scene.children.length > 0) {
        const obj = scene.children[0];
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (obj.material instanceof Array) {
                obj.material.forEach(m => m.dispose());
            } else {
                obj.material.dispose();
            }
        }
        scene.remove(obj);
    }
    
    // Clear arrays
    boardMeshes = [];
    currentMeshes = [];
    ghostMeshes = [];
    nextMeshes = [];
    heldMeshes = [];
    particles = [];
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// SETTINGS
// ============================================

function initSettings() {
    const volumeSlider = el('volume-slider');
    const volumeValue = el('volume-value');
    const graphicsSlider = el('graphics-slider');
    const graphicsValue = el('graphics-value');
    const cameraSlider = el('camera-slider');
    const cameraValue = el('camera-value');
    
    if (volumeSlider) {
        volumeSlider.value = soundVolume * 100;
        volumeSlider.addEventListener('input', () => {
            soundVolume = Number(volumeSlider.value) / 100;
            volumeValue.textContent = Math.round(soundVolume * 100) + '%';
            if (masterGain) masterGain.gain.value = soundVolume;
        });
    }
    
    if (graphicsSlider) {
        graphicsSlider.value = GRAPHICS_QUALITY;
        graphicsValue.textContent = ['BASSE', 'MOYENNE', 'ÉLEVÉE'][GRAPHICS_QUALITY];
    }
    
    if (cameraSlider) {
        cameraSlider.value = ['dynamic', 'top-down', 'side'].indexOf(cameraMode);
        cameraValue.textContent = ['DYNAMIQUE', 'HAUT', 'CÔTÉ'][cameraSlider.value];
    }
    
    // Settings panel
    const btnSettings = el('btn-settings');
    const settingsPanel = el('settings-panel');
    const btnSettingsClose = el('btn-settings-close');
    
    if (btnSettings && settingsPanel) {
        btnSettings.addEventListener('click', () => {
            playUIClick();
            settingsPanel.classList.add('visible');
        });
    }
    
    if (btnSettingsClose && settingsPanel) {
        btnSettingsClose.addEventListener('click', () => {
            playUIClick();
            settingsPanel.classList.remove('visible');
        });
    }
    
    // Volume in pause screen
    const pauseVolumeSlider = el('pause-volume-slider');
    const btnPauseMute = el('btn-pause-mute');
    
    if (pauseVolumeSlider) {
        pauseVolumeSlider.value = soundVolume * 100;
        pauseVolumeSlider.addEventListener('input', () => {
            soundVolume = Number(pauseVolumeSlider.value) / 100;
            volumeValue.textContent = Math.round(soundVolume * 100) + '%';
            if (masterGain) masterGain.gain.value = soundVolume;
        });
    }
    
    if (btnPauseMute) {
        btnPauseMute.textContent = soundEnabled ? '🔊 SON' : '🔇 MUET';
        btnPauseMute.addEventListener('click', toggleMute);
    }
}

function bindUI() {
    const on = (id, fn) => { const b = el(id); if (b) b.addEventListener('click', () => { fn(); }); };
    
    on('btn-start', () => { playUIClick(); startGame(); });
    on('btn-restart', () => { playUIClick(); startGame(); });
    on('btn-menu', () => { playUIClick(); showMenu(); });
    on('btn-resume', () => { playUIClick(); togglePause(false); });
    on('btn-quit', () => { playUIClick(); showMenu(); });
    on('btn-pause-ui', () => togglePause());
    on('btn-sound-ui', toggleMute);
    on('btn-restart-ui', () => { playUIClick(); startGame(); });
    on('btn-mute', toggleMute);
    on('btn-pause-mute', toggleMute);
}

// ============================================
// LOADING
// ============================================

function boot() {
    // Check WebGL support
    if (!detectWebGL()) {
        alert('WebGL est requis pour ce jeu. Veuillez mettre à jour votre navigateur.');
        return;
    }
    
    // Initialize audio
    initAudio();
    
    // Initialize Three.js scene
    initScene();
    
    // Initialize UI
    initSettings();
    bindUI();
    setupTouch();
    
    // Loading animation
    const fill = el('progress-fill'), ptext = el('progress-text');
    const steps = [
        [18, 'Initialisation du moteur 3D...'],
        [36, 'Construction du plateau...'],
        [54, 'Chargement des pièces...'],
        [72, 'Création des effets...'],
        [90, 'Calibration des systèmes...'],
        [100, 'Prêt à jouer!']
    ];
    
    let i = 0;
    function step() {
        if (i < steps.length) {
            if (fill) fill.style.width = steps[i][0] + '%';
            if (ptext) ptext.textContent = steps[i][1];
            i++;
            setTimeout(step, 150);
        } else {
            showMenu();
            // Start rendering
            render();
        }
    }
    step();
    
    // Handle visibility change
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (state === 'playing') togglePause(true);
        }
    });
    
    // Bind keys
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', () => {
        for (const code in keys) keys[code] = false;
        joy.active = false; joy.x = joy.y = 0;
        if (state === 'playing') togglePause(true);
    });
}

function detectWebGL() {
    try {
        const canvas = document.createElement('canvas');
        return !!(
            window.WebGLRenderingContext &&
            (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
        );
    } catch (e) {
        return false;
    }
}

// ============================================
// START
// ============================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

})();
