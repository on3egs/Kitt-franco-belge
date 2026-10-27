// ============================================
// PAC-MAN 3D — Moteur de jeu 3D avec Three.js
// Rendu fluide, labyrinthe 3D, fantômes intelligents
// By Manix - KITT FRANCO BELGE - 2026
// ============================================

(function () {
'use strict';

// ============================================
// CONFIGURATION
// ============================================

const TAU = Math.PI * 2;
const CELL_SIZE = 4;
const WALL_HEIGHT = 1.9;
const MAZE_WIDTH = 28;
const MAZE_HEIGHT = 32;
const PACMAN_SPEED = 15;
const GHOST_SPEED = 8;
const POWER_DURATION = 30;
const FRIGHTENED_DURATION = 6;
const INVINCIBLE_DURATION = 3;

// Qualité graphique (0 = bas, 1 = moyen, 2 = élevé)
let GRAPHICS_QUALITY = 2;

// Vitesse du jeu (0 = lent, 1 = normal, 2 = rapide)
let GAME_SPEED = 1;

// ============================================
// MAZE DEFINITION
// ============================================

const MAZE = [
    "############################",
    "#..........................#",
    "#.####.####.#######.####.###",
    "#o####.####.#######.####.o#",
    "#.####.####.#######.####.###",
    "#..........................#",
    "#.####.##.#######.##.####.#",
    "#.####.##.#######.##.####.#",
    "#......##....####....##......#",
    "######.#####    #####.######",
    "     #.#           #.#     ",
    "     #.#           #.#     ",
    "     #.#           #.#     ",
    "######.#####    #####.######",
    "#..............  ..........#",
    "#.####.#####    #####.####.#",
    "#.####.#####    #####.####.#",
    "#......##            ##......#",
    "######.##    ##    ##.######",
    "#............  ..........#",
    "#.####.#####    #####.####.#",
    "#.####.#####    #####.####.#",
    "#......##    o      ##......#",
    "######.#####    #####.######",
    "#..........................#",
    "#.####.####.#######.####.###",
    "#.####.####.#######.####.###",
    "#o......................o#",
    "#.####.####.#######.####.###",
    "#.####.####.#######.####.###",
    "#..........................#",
    "############################"
];

const MAZE_DATA = MAZE.map(row => ('#'+row.padEnd(MAZE_WIDTH,'#').slice(1,MAZE_WIDTH-1)+'#').split(''));
// Raccorder les deux poches de pastilles isolées du labyrinthe d'origine.
MAZE_DATA[8][21]=' ';
MAZE_DATA[9][20]=' ';
MAZE_DATA[23][26]=' ';

// ============================================
// ÉTAT DU JEU
// ============================================

let state = 'loading';
let score = 0, lives = 3, level = 1;
let highScore = 0;
try { highScore = Number(localStorage.getItem('pacman3dHighScore')) || 0; } catch (e) { /* noop */ }

let scene, camera, renderer;
let pacman, ghosts = [];
let mazeMesh, pelletMeshes = [], powerPelletMeshes = [];
let particles = [];
let clock = new THREE.Clock();
let fruit, fruitMesh;
let scanner;

// Game state
let player;
let ghostStates = [];
let powerUntil = 0;
let frightenedUntil = 0;
let invincibleUntil = 0;
let ghostsEatenWithPower = 0;
let pelletsEaten = 0;
let totalPellets = 0;
let won = false;
let paused = false;
let gameOver = false;
let scoreSubmitted = false;
let nextLifeScore=10000,totalGhostsEaten=0,ghostAccumulator=0,fruitStage=0;
let readyUntil=0,deathFreezeUntil=0,runGeneration=0;

// Combo de pastilles (fenêtre de 1,4 s entre chaque pastille)
let comboCount=0,comboUntil=0,comboMult=1;
const COMBO_WINDOW=1400,COMBO_STEP=8,COMBO_MAX=5;

// Screen shake (modéré) : shakeUntil/amp appliqués à la caméra
let shakeUntil=0,shakeAmp=0;
const shakeScratch=new THREE.Vector3();

// Effets de pastilles de puissance (cache, évite un filter par frame)
let powerEffects=[];

// Audio
let audioContext = null;
let masterGain = null;
let soundEnabled = true;
let soundVolume = 0.7;

// Contrôles
const keys = {};
const joy = { active: false, id: null, x: 0, y: 0 };
let turboMode = false;

// Timers
let lastTime = 0;
let deathTimer = 0;
let levelUpTimer = 0;
let pelletSoundTimer = 0;
let pelletSoundTone = false;

// Caméra
let cameraMode = 'dynamic';
let cameraOffset = new THREE.Vector3(0, 42, 34);
let viewZoom=1;
const viewZoomSteps=[1,1.3,1.65];
function toggleViewZoom(){viewZoom=viewZoomSteps[(viewZoomSteps.indexOf(viewZoom)+1)%viewZoomSteps.length];return viewZoom}
let cameraTarget = new THREE.Vector3();
let followCam = true;

// Direction vectors
const DIRECTIONS = [
    { x: 1, y: 0 },   // Right
    { x: -1, y: 0 },  // Left
    { x: 0, y: -1 },  // Up
    { x: 0, y: 1 }    // Down
];

// Colors
const COLORS = {
    background: 0x020305,
    wall: 0x174b89,
    wallLight: 0x2a180c,
    wallDark: 0x0a0604,
    floor: 0x040506,
    pacman: 0xffd15a,
    ghostBlue: 0x00a2ff,
    ghostRed: 0xff2a3a,
    ghostPink: 0xff3b66,
    ghostOrange: 0xffb13b,
    power: 0xff8c00,
    pellet: 0xffd95a,
    fruit: 0xff3154,
    text: 0xffd15a,
    cyano: 0x63e9ff
};

// Ghost names and colors
const GHOST_INFO = [
    { name: 'KARR', color: COLORS.ghostBlue, ai: 'chaser', startX: 13, startY: 9 },
    { name: 'KARR-2', color: COLORS.ghostRed, ai: 'ambusher', startX: 14, startY: 9 },
    { name: 'KARR-3', color: COLORS.ghostPink, ai: 'flanker', startX: 12, startY: 10 },
    { name: 'KARR-4', color: COLORS.ghostOrange, ai: 'patrol', startX: 15, startY: 10 }
];

// Fruits
const FRUITS = [
    { name: 'CERISE', points: 100, color: 0xff3154, leaf: 0x65e46f, stages: [70, 170] },
    { name: 'FRAISE', points: 300, color: 0xff385b, leaf: 0x68ed73, stages: [70, 170, 270] },
    { name: 'ORANGE', points: 500, color: 0xff9d20, leaf: 0x75e16c, stages: [70, 170, 270, 370] },
    { name: 'POMME', points: 700, color: 0xef3349, leaf: 0x75e16c, stages: [70, 170, 270, 370, 470] },
    { name: 'ANANAS', points: 1000, color: 0xe4c64a, leaf: 0x7dde62, stages: [70, 170, 270, 370, 470, 570] },
    { name: 'GALAXIAN', points: 2000, color: 0x61d8ff, leaf: 0xffe55b, stages: [70, 170, 270, 370, 470, 570, 670] },
    { name: 'CLOCHE', points: 3000, color: 0xffd64d, leaf: 0xfff0a1, stages: [70, 170, 270, 370, 470, 570, 670, 770] },
    { name: 'CLÉ', points: 5000, color: 0xffe071, leaf: 0xfff0a1, stages: [70, 170, 270, 370, 470, 570, 670, 770, 870] }
];

const FRUIT_POSITION = { x: 14, y: 15 };

// ============================================
// INITIALIZATION
// ============================================

function initScene() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.background);
    scene.fog = new THREE.FogExp2(COLORS.background, 0.0025);

    // Camera
    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(MAZE_WIDTH*CELL_SIZE/2,42,15*CELL_SIZE+34);
    camera.up.set(0,1,0);
    camera.lookAt(MAZE_WIDTH*CELL_SIZE/2,0,15*CELL_SIZE);
    
    cameraTarget = new THREE.Vector3(MAZE_WIDTH * CELL_SIZE / 2, MAZE_HEIGHT * CELL_SIZE / 2, 0);

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
    const ambientLight = new THREE.AmbientLight(0x7ea7cf, 0.65);
    scene.add(ambientLight);
    
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(100, 100, -50);
    mainLight.castShadow = GRAPHICS_QUALITY >= 2;
    if (mainLight.castShadow) {
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 0.5;
        mainLight.shadow.camera.far = 200;
        mainLight.shadow.camera.left = -100;
        mainLight.shadow.camera.right = 100;
        mainLight.shadow.camera.top = 100;
        mainLight.shadow.camera.bottom = -100;
    }
    scene.add(mainLight);
    
    const pacmanLight = new THREE.PointLight(COLORS.pacman, 1.5, 30);
    pacmanLight.castShadow = false;
    scene.add(pacmanLight);
    
    const ghostLight = new THREE.PointLight(COLORS.ghostBlue, 0.5, 20);
    ghostLight.castShadow = false;
    scene.add(ghostLight);

    // Create maze
    createMaze();
    
    // Create floor
    createFloor();
    
    // Create scanner effect
    createScanner();
    
    // Create background
    createBackground();
    
    // Handle resize
    window.addEventListener('resize', onWindowResize);
    
    // Initialize fruit canvas
    initFruitCanvas();
}

let mazeBatches=[];
const hideScratch=new THREE.Matrix4();
function createMaze() {
    const wallTransforms=[];
    // Count pellets
    totalPellets = 0;
    for (let y = 0; y < MAZE_HEIGHT; y++) {
        for (let x = 0; x < MAZE_WIDTH; x++) {
            if (MAZE_DATA[y][x] === '.' || MAZE_DATA[y][x] === 'o') {
                totalPellets++;
            }
        }
    }
    
    // Create walls
    const wallGeometry = new THREE.BoxGeometry(CELL_SIZE*.96, WALL_HEIGHT, CELL_SIZE*.96);
    
    for (let y = 0; y < MAZE_HEIGHT; y++) {
        for (let x = 0; x < MAZE_WIDTH; x++) {
            if (MAZE_DATA[y][x] === '#') {
                const wallMaterial = new THREE.MeshPhongMaterial({
                    color: COLORS.wall,
                    specular: 0x4466aa,
                    shininess: 10
                });
                
                const wall = new THREE.Mesh(wallGeometry, wallMaterial);
                wall.position.set(
                    x * CELL_SIZE + CELL_SIZE / 2,
                    WALL_HEIGHT / 2,
                    y * CELL_SIZE + CELL_SIZE / 2
                );
                wall.castShadow = GRAPHICS_QUALITY >= 2;
                wall.receiveShadow = true;
                wall.updateMatrix();wallTransforms.push(wall.matrix.clone());wallMaterial.dispose();
            }
        }
    }
    
    const wallBatch=new THREE.InstancedMesh(wallGeometry,new THREE.MeshPhongMaterial({color:COLORS.wall,emissive:0x061a35,specular:0x4466aa,shininess:24}),wallTransforms.length);
    wallTransforms.forEach((matrix,index)=>wallBatch.setMatrixAt(index,matrix));
    wallBatch.castShadow=GRAPHICS_QUALITY>=2;wallBatch.receiveShadow=true;scene.add(wallBatch);mazeBatches.push(wallBatch);
    const rims=[];
    for(const matrix of wallTransforms){
        const x=matrix.elements[12],z=matrix.elements[14],h=CELL_SIZE*.48,y=WALL_HEIGHT+.025;
        rims.push(x-h,y,z-h,x+h,y,z-h,x+h,y,z-h,x+h,y,z+h,x+h,y,z+h,x-h,y,z+h,x-h,y,z+h,x-h,y,z-h);
    }
    const rimGeometry=new THREE.BufferGeometry();rimGeometry.setAttribute('position',new THREE.Float32BufferAttribute(rims,3));
    scene.add(new THREE.LineSegments(rimGeometry,new THREE.LineBasicMaterial({color:0x50cfff,transparent:true,opacity:.7})));
    // Create pellets
    for (let y = 0; y < MAZE_HEIGHT; y++) {
        for (let x = 0; x < MAZE_WIDTH; x++) {
            if (MAZE_DATA[y][x] === '.') {
                createPellet(x, y, false);
            } else if (MAZE_DATA[y][x] === 'o') {
                createPellet(x, y, true);
            }
        }
    }
    
    for(const group of [pelletMeshes,powerPelletMeshes]){
        if(!group.length)continue;
        const batch=new THREE.InstancedMesh(group[0].geometry,group[0].material,group.length);
        group.forEach((pellet,index)=>{pellet.updateMatrix();batch.setMatrixAt(index,pellet.matrix);pellet.userData.batch=batch;pellet.userData.instance=index});
        scene.add(batch);mazeBatches.push(batch);
    }
    // Create power pellet effects
    createPowerEffects();
}

function hidePelletInstance(pellet){
    const batch=pellet.userData.batch;if(!batch)return;
    batch.setMatrixAt(pellet.userData.instance,new THREE.Matrix4().makeScale(0,0,0));batch.instanceMatrix.needsUpdate=true;
}
function createPellet(x, y, isPower) {
    const radius = isPower ? 0.55 : 0.22;
    const existing=(isPower?powerPelletMeshes:pelletMeshes)[0];
    const geometry = existing?.geometry||new THREE.SphereGeometry(radius,16,16);
    
    const material = existing?.material||new THREE.MeshPhongMaterial({
        color: isPower ? COLORS.power : COLORS.pellet,
        emissive: isPower ? COLORS.power : COLORS.pellet,
        emissiveIntensity: isPower ? 0.5 : 0.2,
        specular: 0xffffff,
        shininess: 30
    });
    
    const pellet = new THREE.Mesh(geometry, material);
    pellet.position.set(
        x * CELL_SIZE + CELL_SIZE / 2,
        radius,
        y * CELL_SIZE + CELL_SIZE / 2
    );
    pellet.castShadow = false;
    pellet.receiveShadow = false;
    pellet.userData = { x, y, isPower, eaten: false };
    
    // Proxy de collision ; le rendu est regroupé en instances.
    
    if (isPower) {
        powerPelletMeshes.push(pellet);
    } else {
        pelletMeshes.push(pellet);
    }
}

function createPowerEffects() {
    for (const pellet of powerPelletMeshes) {
        const data = pellet.userData;
        
        // Create animated ring
        const ringGeometry = new THREE.TorusGeometry(0.7, 0.05, 8, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: COLORS.power,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.set(data.x * CELL_SIZE + CELL_SIZE / 2, 0.01, data.y * CELL_SIZE + CELL_SIZE / 2);
        ring.rotation.x = Math.PI / 2;
        ring.userData = { type: 'powerEffect', pelletX: data.x, pelletY: data.y };
        scene.add(ring);
    }
}

function createFloor() {
    const floorGeometry = new THREE.PlaneGeometry(
        MAZE_WIDTH * CELL_SIZE,
        MAZE_HEIGHT * CELL_SIZE
    );
    
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.floor,
        roughness: 0.8,
        metalness: 0.2
    });
    
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(
        MAZE_WIDTH * CELL_SIZE / 2,
        0,
        MAZE_HEIGHT * CELL_SIZE / 2
    );
    floor.receiveShadow = true;
    scene.add(floor);
    
    // Grid lines
    if (GRAPHICS_QUALITY >= 1) {
        const gridGeometry = new THREE.BufferGeometry();
        const vertices = [];
        
        for (let x = 0; x <= MAZE_WIDTH; x++) {
            vertices.push(
                x * CELL_SIZE, 0.01, 0,
                x * CELL_SIZE, 0.01, MAZE_HEIGHT * CELL_SIZE
            );
        }
        
        for (let z = 0; z <= MAZE_HEIGHT; z++) {
            vertices.push(
                0, 0.01, z * CELL_SIZE,
                MAZE_WIDTH * CELL_SIZE, 0.01, z * CELL_SIZE
            );
        }
        
        gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        
        const gridMaterial = new THREE.LineBasicMaterial({
            color: COLORS.wallLight,
            transparent: true,
            opacity: 0.3
        });
        
        const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
        grid.position.set(CELL_SIZE / 2, 0, CELL_SIZE / 2);
        scene.add(grid);
    }
}

function createScanner() {
    const scannerGeometry = new THREE.PlaneGeometry(MAZE_WIDTH * CELL_SIZE, MAZE_HEIGHT * CELL_SIZE);
    const scannerMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.cyano,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide
    });
    
    scanner = new THREE.Mesh(scannerGeometry, scannerMaterial);
    scanner.position.set(
        MAZE_WIDTH * CELL_SIZE / 2,
        WALL_HEIGHT + 0.01,
        MAZE_HEIGHT * CELL_SIZE / 2
    );
    scanner.rotation.x = Math.PI / 2;
    scanner.visible = false;
    scene.add(scanner);
}

function createBackground() {
    // Skybox
    const skyboxGeometry = new THREE.SphereGeometry(200, 32, 32);
    const skyboxMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.background,
        side: THREE.BackSide
    });
    
    const skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
    skybox.position.set(
        MAZE_WIDTH * CELL_SIZE / 2,
        MAZE_HEIGHT * CELL_SIZE / 2,
        0
    );
    scene.add(skybox);
    
    // Ambient particles
    if (GRAPHICS_QUALITY >= 2) {
        createAmbientParticles();
    }
}

function createAmbientParticles() {
    const particleCount = 100;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = Math.random() * MAZE_WIDTH * CELL_SIZE;
        positions[i * 3 + 1] = WALL_HEIGHT + Math.random() * 50;
        positions[i * 3 + 2] = Math.random() * MAZE_HEIGHT * CELL_SIZE;
        
        const color = Math.random() < 0.5 ? COLORS.cyano : COLORS.pacman;
        colors[i * 3] = (color >> 16) / 255;
        colors[i * 3 + 1] = ((color >> 8) & 0xFF) / 255;
        colors[i * 3 + 2] = (color & 0xFF) / 255;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.PointsMaterial({
        size: 0.3,
        vertexColors: true,
        transparent: true,
        opacity: 0.4,
        sizeAttenuation: true
    });
    
    const particlesMesh = new THREE.Points(geometry, material);
    scene.add(particlesMesh);
}

function createPacman() {
    const group = new THREE.Group();
    
    // Deux mâchoires : une vraie ouverture vers +X, pas une calotte noire
    // symétrique qui reste visuellement identique quelle que soit la direction.
    const bodyGeometry = new THREE.SphereGeometry(0.8, 32, 16, 0, Math.PI*2, 0, Math.PI/2);
    const bodyMaterial = new THREE.MeshPhongMaterial({
        color: COLORS.pacman,
        emissive: 0x886600,
        emissiveIntensity: 0.3,
        specular: 0xffffff,
        shininess: 40
    });
    
    const upperJaw = new THREE.Group(), lowerJaw = new THREE.Group();
    upperJaw.add(new THREE.Mesh(bodyGeometry, bodyMaterial));
    lowerJaw.add(new THREE.Mesh(new THREE.SphereGeometry(.8,32,16,0,Math.PI*2,Math.PI/2,Math.PI/2),bodyMaterial));
    group.add(upperJaw,lowerJaw);
    
    // Mouth (will be animated)
    const mouthGeometry = new THREE.CircleGeometry(.79,32);
    const mouthMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.background,
        side: THREE.DoubleSide
    });
    
    [upperJaw,lowerJaw].forEach(jaw=>{const inner=new THREE.Mesh(mouthGeometry,mouthMaterial);inner.rotation.x=-Math.PI/2;jaw.add(inner)});
    
    // Eye
    const eyeGeometry = new THREE.SphereGeometry(0.15, 8, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.3, 0.4, 0.6);
    upperJaw.add(eye);
    
    // Eye highlight
    const highlightGeometry = new THREE.SphereGeometry(0.05, 4, 4);
    const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
    highlight.position.set(0.32, 0.42, 0.65);
    upperJaw.add(highlight);
    
    group.position.set(
        player.x * CELL_SIZE + CELL_SIZE / 2,
        0.8,
        player.y * CELL_SIZE + CELL_SIZE / 2
    );
    
    group.scale.setScalar(1.65);
    group.userData = { type: 'pacman', upperJaw, lowerJaw };
    scene.add(group);
    
    return group;
}

function createGhost(x, y, color, name) {
    const group = new THREE.Group();
    
    // Body
    const bodyGeometry = new THREE.SphereGeometry(0.7, 16, 16, 0, Math.PI * 2, 0, Math.PI);
    const bodyMaterial = new THREE.MeshPhongMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.2,
        specular: 0xffffff,
        shininess: 30
    });
    
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);
    
    // Wavy bottom
    const bottomGeometry = new THREE.CylinderGeometry(0.7, 0.5, 0.8, 16, 1, false, 0, Math.PI * 2);
    const bottomMaterial = new THREE.MeshPhongMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.2,
        specular: 0x222222,
        shininess: 10
    });
    const bottom = new THREE.Mesh(bottomGeometry, bottomMaterial);
    bottom.position.y = -0.8;
    bottom.rotation.x = Math.PI / 2;
    group.add(bottom);
    
    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.15, 8, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.3, 0.4, 0.6);
    group.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.3, 0.4, 0.6);
    group.add(rightEye);
    
    // Pupils
    const pupilGeometry = new THREE.SphereGeometry(0.07, 4, 4);
    const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    
    const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    leftPupil.position.set(-0.28, 0.4, 0.65);
    group.add(leftPupil);
    
    const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    rightPupil.position.set(0.28, 0.4, 0.65);
    group.add(rightPupil);
    
    // Mouth (wavy)
    const mouthGeometry = new THREE.TorusGeometry(0.2, 0.05, 4, 16);
    const mouthMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide
    });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, -0.1, 0.6);
    mouth.rotation.x = Math.PI / 2;
    group.add(mouth);
    
    group.position.set(
        x * CELL_SIZE + CELL_SIZE / 2,
        0.7,
        y * CELL_SIZE + CELL_SIZE / 2
    );
    
    group.scale.setScalar(1.45);
    group.userData = { type: 'ghost', name, color, bottom, mouth };
    scene.add(group);
    
    return group;
}

function createFruitMesh(fruit, x, y) {
    const group = new THREE.Group();
    
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshPhongMaterial({
        color: fruit.color,
        emissive: fruit.color,
        emissiveIntensity: 0.4,
        specular: 0xffffff,
        shininess: 40
    });
    
    const main = new THREE.Mesh(geometry, material);
    group.add(main);
    
    // Leaf/Stem
    const stemGeometry = new THREE.CylinderGeometry(0.05, 0.08, 0.8, 6, 1);
    const stemMaterial = new THREE.MeshPhongMaterial({
        color: fruit.leaf,
        emissive: fruit.leaf,
        emissiveIntensity: 0.2
    });
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.set(0, 0.5, 0);
    stem.rotation.x = Math.PI / 4;
    stem.rotation.z = Math.PI / 6;
    group.add(stem);
    
    group.position.set(
        x * CELL_SIZE + CELL_SIZE / 2,
        0.5,
        y * CELL_SIZE + CELL_SIZE / 2
    );
    
    group.userData = { type: 'fruit', fruit };
    scene.add(group);
    
    return group;
}

function createParticle(x, y, z, color, size, life, velocity) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([x, y, z]);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const colors = new Float32Array([
        (color >> 16) / 255,
        ((color >> 8) & 0xFF) / 255,
        (color & 0xFF) / 255
    ]);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.PointsMaterial({
        size: size,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    const particle = new THREE.Points(geometry, material);
    scene.add(particle);
    
    return {
        mesh: particle,
        x, y, z,
        vx: velocity ? velocity.x : 0,
        vy: velocity ? velocity.y : 0,
        vz: velocity ? velocity.z : 0,
        life: life,
        maxLife: life,
        size: size,
        color: color
    };
}

// ============================================
// INITIALIZATION - continued
// ============================================

function initFruitCanvas() {
    const canvas = document.getElementById('fruit-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = 40;
    canvas.height = 40;
    
    // Draw placeholder fruit
    ctx.fillStyle = '#ff3154';
    ctx.beginPath();
    ctx.arc(20, 18, 8, 0, Math.PI);
    ctx.arc(20, 22, 6, 0, Math.PI);
    ctx.fill();
    
    // Stem
    ctx.fillStyle = '#65e46f';
    ctx.beginPath();
    ctx.moveTo(20, 10);
    ctx.lineTo(22, 18);
    ctx.lineTo(18, 18);
    ctx.closePath();
    ctx.fill();
}

// ============================================
// AUDIO
// ============================================

function initAudio(){
    const audio=window.PacmanSfx;if(!audio){soundEnabled=false;return}
    audioContext=audio.context();masterGain=audio.master();const settings=audio.state();soundVolume=settings.volume;soundEnabled=!settings.muted;
}
function playChomp(){if(soundEnabled)window.PacmanSfx?.chomp(Math.max(-.55,Math.min(.55,(player.x-MAZE_WIDTH/2)/MAZE_WIDTH)))}
function playPower(){if(soundEnabled)window.PacmanSfx?.power()}
function playGhost(){if(soundEnabled)window.PacmanSfx?.ghost(ghostsEatenWithPower)}
function playFruit(){if(soundEnabled)window.PacmanSfx?.fruit()}
function playReady(){if(soundEnabled)window.PacmanSfx?.ready()}
function playClear(){if(soundEnabled)window.PacmanSfx?.clear()}
function playDeath(){if(soundEnabled)window.PacmanSfx?.death()}
function playUIClick(){window.PacmanSfx?.unlock();if(soundEnabled)window.PacmanSfx?.ui()}
// ============================================
// GAME LOGIC
// ============================================

function resetGame() {
    runGeneration++;ghostAccumulator=0;readyUntil=Date.now()+950;deathFreezeUntil=0;
    for(const object of [...scene.children]){
        if(object.isLight||object.isCamera)continue;
        object.traverse(child=>{child.geometry?.dispose();const materials=Array.isArray(child.material)?child.material:[child.material];materials.forEach(material=>{material?.map?.dispose();material?.dispose()})});
        scene.remove(object);
    }
    mazeBatches=[];
    // Clear existing objects
    if (pacman) scene.remove(pacman);
    ghosts.forEach(g => scene.remove(g));
    if (fruitMesh) scene.remove(fruitMesh);
    particles.forEach(p => scene.remove(p.mesh));
    
    // Clear pellets
    pelletMeshes.forEach(p => scene.remove(p));
    powerPelletMeshes.forEach(p => scene.remove(p));
    pelletMeshes = [];
    powerPelletMeshes = [];
    
    // Recreate maze
    createMaze();
    createFloor();createScanner();createBackground();
    
    // Reset player
    player = {
        x: 13,
        y: 15,
        dir: { x: 0, y: 0 },
        want: { x: 0, y: 0 },
        speed: PACMAN_SPEED * (GAME_SPEED === 0 ? 0.8 : GAME_SPEED === 1 ? 1.0 : 1.2)
    };
    
    // Create Pac-Man
    pacman = createPacman();
    
    // Create ghosts
    ghosts = [];
    ghostStates = [];
    
    GHOST_INFO.forEach((info, i) => {
        const ghost = createGhost(info.startX, info.startY, info.color, info.name);
        ghosts.push(ghost);
        
        ghostStates.push({
            x: info.startX,
            y: info.startY,
            dir: { x: i === 0 ? 1 : i === 1 ? -1 : i === 2 ? 0 : 0, y: i === 2 ? -1 : i === 3 ? 1 : 0 },
            target: { x: player.x, y: player.y },
            ai: info.ai,
            name: info.name,
            frightened: false,
            returning: true,
            releaseAt: Date.now()+2000+i*1500
        });
    });
    
    // Reset state
    score = 0;
    nextLifeScore=10000;totalGhostsEaten=0;fruitStage=0;
    lives = 3;
    level = 1;
    pelletsEaten = 0;
    won = false;
    paused = false;
    gameOver = false;
    scoreSubmitted = false;
    powerUntil = 0;
    frightenedUntil = 0;
    invincibleUntil = 0;
    ghostsEatenWithPower = 0;
    fruit = null;
    fruitMesh = null;
    
    // Update UI
    updateHud();
    
    // Show ready banner
    showBanner('READY!', 1000);
}

function startGame() {
    window.PacmanSfx?.unlock();
    gridAccumulator=0;
    Object.keys(keys).forEach(key=>delete keys[key]);
    resetGame();
    showScreen('game');
    state = 'playing';
    playReady();
}

function showScreen(name) {
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('main-menu').classList.toggle('visible', name === 'menu');
    document.getElementById('game-container').style.display = name === 'game' ? 'block' : 'none';
    document.getElementById('gameover-screen').classList.toggle('visible', name === 'gameover');
    document.getElementById('pause-screen').classList.remove('visible');
    document.getElementById('hud').style.display = name === 'game' ? 'flex' : 'none';
    document.getElementById('game-banner').classList.remove('visible');
    document.getElementById('fruit-display').classList.remove('visible');
}

function showMenu() {
    state = 'menu';
    showScreen('menu');
    document.getElementById('menu-highscore').textContent = highScore;
}

function showBanner(text, duration) {
    const banner = document.getElementById('game-banner');
    banner.textContent = text;
    banner.classList.add('visible');
    setTimeout(() => {
        banner.classList.remove('visible');
    }, duration);
}

function isOpen(x, y) {
    if (x < 0 || x >= MAZE_WIDTH || y < 0 || y >= MAZE_HEIGHT) return false;
    return MAZE_DATA[y][x] !== '#';
}

function canMoveTo(x, y, fromX, fromY) {
    if(!isOpen(x,y))return false;
    return true;
}

function movePlayer() {
    let direction = player.dir.x || player.dir.y ? player.dir : player.want;
    if((player.want.x||player.want.y)&&canMoveTo(player.x+player.want.x,player.y+player.want.y,player.x,player.y))direction=player.want;
    const newX = player.x + direction.x;
    const newY = player.y + direction.y;
    
    if (canMoveTo(newX, newY, player.x, player.y)) {
        player.x = newX;
        player.y = newY;
        if(player.dir.x!==direction.x||player.dir.y!==direction.y){if(soundEnabled)window.PacmanSfx?.turn()}
        player.dir = direction;
        
        // Check for pellet
        checkPellet();
        
        // Check for fruit
        checkFruit();
        
        // Check for ghost collision
        checkGhostCollision();
        
        // Check win condition
        checkWin();
        
        return true;
    }
    
    return false;
}

function checkPellet() {
    const x = Math.floor(player.x);
    const y = Math.floor(player.y);
    
    // Find and remove pellet at this position
    for (let i = pelletMeshes.length - 1; i >= 0; i--) {
        const p = pelletMeshes[i];
        if (Math.floor(p.userData.x) === x && Math.floor(p.userData.y) === y && !p.userData.eaten) {
            p.userData.eaten = true;
            hidePelletInstance(p);
            pelletMeshes.splice(i, 1);
            
            score += 10;
            pelletsEaten++;
            
            // Check if this was the last pellet for level up
            if (pelletsEaten % 50 === 0) {
                showBanner('50 PASTILLES · BIEN JOUÉ !',600);
            }
            
            // Play sound
            pelletSoundTone = !pelletSoundTone;
            playChomp();
            
            break;
        }
    }
    
    // Check power pellets
    for (let i = powerPelletMeshes.length - 1; i >= 0; i--) {
        const p = powerPelletMeshes[i];
        if (Math.floor(p.userData.x) === x && Math.floor(p.userData.y) === y && !p.userData.eaten) {
            p.userData.eaten = true;
            hidePelletInstance(p);
            powerPelletMeshes.splice(i, 1);
            
            score += 50;
            pelletsEaten++;
            
            // Power up!
            powerUntil = Date.now() + POWER_DURATION * 1000;
            frightenedUntil = Date.now() + FRIGHTENED_DURATION * 1000;
            ghostsEatenWithPower = 0;
            
            playPower();
            
            // Show power effect on ghosts
            ghosts.forEach(g => {
                if (g.userData) {
                    g.userData.color = COLORS.cyano;
                }
            });
            
            // Spawn fruit if enough pellets eaten
            spawnFruit();
            
            break;
        }
    }
}

function checkFruit() {
    if (!fruit) return;
    
    const x = Math.floor(player.x);
    const y = Math.floor(player.y);
    
    if (x === fruit.x && y === fruit.y) {
        score += fruit.points;
        playFruit();
        
        // Show fruit eaten effect
        spawnFruitParticles();
        
        // Remove fruit
        if (fruitMesh) {
            scene.remove(fruitMesh);
            fruitMesh = null;
        }
        fruit = null;
        
        document.getElementById('fruit-display').classList.remove('visible');
    }
}

function checkGhostCollision() {
    if(invincibleUntil>Date.now()||deathFreezeUntil>Date.now())return;
    if (powerUntil > Date.now()) return; // Pac-Man is powered up
    
    for (let i = 0; i < ghostStates.length; i++) {
        const ghost = ghostStates[i];
        if (ghost.returning) continue;
        
        if (Math.floor(ghost.x) === Math.floor(player.x) && Math.floor(ghost.y) === Math.floor(player.y)) {
            // Ghost collision
            lives--;deathFreezeUntil=Date.now()+800;
            gridAccumulator=0;ghostAccumulator=0;
            Object.keys(keys).forEach(key=>delete keys[key]);
            invincibleUntil = Date.now() + INVINCIBLE_DURATION * 1000;
            
            // Reset player and ghost positions
            player.x = 13;
            player.y = 15;
            player.dir = { x: 0, y: 0 };
            player.want = { x: 0, y: 0 };
            
            // Reset ghosts
            GHOST_INFO.forEach((info, j) => {
                ghostStates[j].x = info.startX;
                ghostStates[j].y = info.startY;
                ghostStates[j].dir = { x: j === 0 ? 1 : j === 1 ? -1 : 0, y: j === 2 ? -1 : j === 3 ? 1 : 0 };
                ghostStates[j].returning = true;
                ghostStates[j].releaseAt = Date.now()+2200+j*1100;
            });
            
            updateHud();
            playDeath();
            
            if (lives <= 0) {
                gameOver = true;
                paused = true;
                endGame();
            }
            
            break;
        }
    }
}

function checkGhostEat() {
    if (powerUntil <= Date.now()) return;
    
    for (let i = 0; i < ghostStates.length; i++) {
        const ghost = ghostStates[i];
        if (ghost.returning) continue;
        
        if (Math.floor(ghost.x) === Math.floor(player.x) && Math.floor(ghost.y) === Math.floor(player.y)) {
            // Eat ghost
            const points = 200 * (2 ** Math.min(ghostsEatenWithPower, 3));
            score += points;
            ghostsEatenWithPower++;totalGhostsEaten++;
            
            // Return ghost to base
            ghost.x = GHOST_INFO[i].startX;
            ghost.y = GHOST_INFO[i].startY;
            ghost.returning = true;
            ghost.releaseAt = Date.now() + 3000;
            
            playGhost();
            
            // Create eat particles
            spawnGhostEatParticles(i);
            
            updateHud();
        }
    }
}

function checkWin() {
    if (pelletMeshes.length === 0 && powerPelletMeshes.length === 0) {
        won = true;
        paused = true;
        showBanner('LABYRINTHE TERMINÉ!', 2000);playClear();
        const completedRun=runGeneration;
        
        // Advance to next level
        level++;
        
        // Show level up
        setTimeout(() => {
            if(state!=='playing'||runGeneration!==completedRun)return;
            const saved={score,lives,level,nextLifeScore,totalGhostsEaten};
            resetGame();
            score=saved.score;lives=saved.lives;level=saved.level;nextLifeScore=saved.nextLifeScore;totalGhostsEaten=saved.totalGhostsEaten;updateHud();playReady();
            showBanner(`NIVEAU ${level}!`, 1000);
        }, 2500);
    }
}

function endGame() {
    state = 'gameover';
    
    const isRecord = score > highScore;
    if (isRecord) {
        highScore = score;
        try { localStorage.setItem('pacman3dHighScore', String(highScore)); } catch (e) { /* noop */ }
    }
    
    document.getElementById('gameover-score').textContent = score;
    document.getElementById('gameover-level').textContent = level;
    document.getElementById('gameover-ghosts').textContent = totalGhostsEaten;
    document.getElementById('gameover-highscore').textContent = highScore;
    document.getElementById('gameover-newrecord').style.display = isRecord ? 'block' : 'none';
    
    setTimeout(() => {
        showScreen('gameover');
    }, 900);
}

function spawnFruit() {
    const fruitRun=runGeneration;
    if (fruit) return; // Already a fruit
    
    // Check if we should spawn based on pellets eaten
    const currentFruitIndex = Math.min(Math.floor(pelletsEaten / 70), FRUITS.length - 1);
    fruit = {...FRUITS[currentFruitIndex],x:FRUIT_POSITION.x,y:FRUIT_POSITION.y};
    
    // Create fruit mesh
    fruitMesh = createFruitMesh(fruit, FRUIT_POSITION.x, FRUIT_POSITION.y);
    
    // Show fruit display
    const fruitDisplay = document.getElementById('fruit-display');
    const fruitName = document.getElementById('fruit-name');
    const fruitPoints = document.getElementById('fruit-points');
    
    fruitName.textContent = fruit.name;
    fruitPoints.textContent = `+${fruit.points}`;
    fruitDisplay.classList.add('visible');
    
    // Set timeout for fruit expiration
    setTimeout(() => {
        if (fruitRun !== runGeneration) return;
        if (fruitMesh) {
            scene.remove(fruitMesh);
            fruitMesh = null;
        }
        fruit = null;
        fruitDisplay.classList.remove('visible');
    }, 10000);
}

function spawnFruitParticles() {
    if (particles.length >= 200) return;
    
    const x = FRUIT_POSITION.x * CELL_SIZE + CELL_SIZE / 2;
    const y = 0.5;
    const z = FRUIT_POSITION.y * CELL_SIZE + CELL_SIZE / 2;
    
    for (let i = 0; i < 20; i++) {
        const angle = Math.random() * TAU;
        const speed = 5 + Math.random() * 5;
        
        const particle = createParticle(
            x, y, z,
            fruit.color,
            0.2 + Math.random() * 0.3,
            1.0,
            new THREE.Vector3(
                Math.cos(angle) * speed,
                Math.random() * speed,
                Math.sin(angle) * speed
            )
        );
        
        particles.push(particle);
    }
}

function spawnGhostEatParticles(ghostIndex) {
    if (particles.length >= 200) return;
    
    const ghost = ghostStates[ghostIndex];
    const x = ghost.x * CELL_SIZE + CELL_SIZE / 2;
    const y = 0.7;
    const z = ghost.y * CELL_SIZE + CELL_SIZE / 2;
    
    for (let i = 0; i < 15; i++) {
        const angle = Math.random() * TAU;
        const speed = 10 + Math.random() * 10;
        
        const particle = createParticle(
            x, y, z,
            COLORS.cyano,
            0.3 + Math.random() * 0.4,
            0.8,
            new THREE.Vector3(
                Math.cos(angle) * speed,
                Math.random() * speed * 2,
                Math.sin(angle) * speed
            )
        );
        
        particles.push(particle);
    }
}

// ============================================
// GHOST AI
// ============================================

function updateGhosts() {
    const now = Date.now();
    
    for (let i = 0; i < ghostStates.length; i++) {
        const ghost = ghostStates[i];
        const ghostMesh = ghosts[i];
        
        if (ghost.returning && now < ghost.releaseAt) {
            // Ghost is in base, waiting to be released
            continue;
        }
        
        if (ghost.returning) {
            ghost.returning = false;
        }
        
        // Choose direction
        const directions = [];
        
        // Can't go backwards
        const avoidX = -ghost.dir.x;
        const avoidY = -ghost.dir.y;
        
        // Test all directions
        for (const dir of DIRECTIONS) {
            if (dir.x === avoidX && dir.y === avoidY) continue;
            
            const newX = Math.floor(ghost.x + dir.x);
            const newY = Math.floor(ghost.y + dir.y);
            
            if (canMoveTo(newX, newY, Math.floor(ghost.x), Math.floor(ghost.y))) {
                directions.push(dir);
            }
        }
        
        if (directions.length === 0) {
            const reverse={x:-ghost.dir.x,y:-ghost.dir.y};
            if(isOpen(ghost.x+reverse.x,ghost.y+reverse.y))directions.push(reverse);
            else continue;
        }
        
        // Choose direction based on AI
        let target;
        
        if (powerUntil > now) {
            // Flee from Pac-Man
            target = {
                x: player.x - (player.dir.x * 4 + (player.dir.x === 0 ? player.want.x * 4 : 0)),
                y: player.y - (player.dir.y * 4 + (player.dir.y === 0 ? player.want.y * 4 : 0))
            };
        } else {
            // Chase Pac-Man or use AI
            target = ghostTarget(ghost, i);
        }
        
        // Find best direction
        let bestDir = directions[0];
        let bestDist = powerUntil>now?-Infinity:Infinity;
        
        for (const dir of directions) {
            const newX = Math.floor(ghost.x + dir.x);
            const newY = Math.floor(ghost.y + dir.y);
            const dist = mazeDistance(newX, newY, Math.floor(target.x), Math.floor(target.y));
            
            const metric=dist===999?Math.abs(newX-target.x)+Math.abs(newY-target.y):dist;
            if (powerUntil>now?metric>bestDist:metric<bestDist) {
                bestDist = metric;
                bestDir = dir;
            }
        }
        
        // Sometimes make random decision
        if (Math.random() < 0.2) {
            bestDir = directions[Math.floor(Math.random() * directions.length)];
        }
        
        // Update ghost
        ghost.dir = bestDir;
        ghost.x += bestDir.x;
        ghost.y += bestDir.y;
        
        // Wrap around
        ghost.x = wrap(ghost.x, MAZE_WIDTH);
        ghost.y = wrap(ghost.y, MAZE_HEIGHT);
        
        // Update mesh
        if (ghostMesh) {
            ghostMesh.position.set(
                ghost.x * CELL_SIZE + CELL_SIZE / 2,
                1.2,
                ghost.y * CELL_SIZE + CELL_SIZE / 2
            );
            
            // Animate ghost
            const time = Date.now() * 0.001;
            const wobble = Math.sin(time * 2 + i) * 0.05;
            ghostMesh.position.y = 1.2 + wobble;
            
            // Update color based on state
            if (powerUntil > now) {
                const remaining = (powerUntil - now) / 1000;
                if (remaining < 5 && Math.floor(Date.now() / 100) % 2 === 0) {
                    ghostMesh.children[0].material.color.setHex(COLORS.cyano);
                } else {
                    ghostMesh.children[0].material.color.setHex(COLORS.cyano);
                }
            } else {
                ghostMesh.children[0].material.color.setHex(GHOST_INFO[i].color);
            }
        }
    }
}

function ghostTarget(ghost, ghostIndex) {
    const ai = ghost.ai;
    
    switch (ai) {
        case 'chaser':
            return { x: player.x, y: player.y };
        
        case 'ambusher': {
            // Target position ahead of Pac-Man
            const ahead = player.dir.x || player.dir.y ? player.dir : player.want;
            return {
                x: player.x + ahead.x * 4,
                y: player.y + ahead.y * 4
            };
        
        }
        case 'flanker': {
            // Target position to the side of Pac-Man
            const ahead = player.dir.x || player.dir.y ? player.dir : player.want;
            return {
                x: player.x + ahead.y * 5,
                y: player.y + ahead.x * 5
            };
        
        }
        case 'patrol':
            // Patrol around the maze
            if (Math.random() < 0.5) {
                return { x: player.x, y: player.y };
            } else {
                return { x: Math.random() * MAZE_WIDTH, y: Math.random() * MAZE_HEIGHT };
            }
        
        default:
            return { x: player.x, y: player.y };
    }
}

const distanceCache=new Map();
function mazeDistance(sx,sy,tx,ty){
    if(!isOpen(sx,sy)||!isOpen(tx,ty))return 999;
    const key=ty*MAZE_WIDTH+tx;
    let distances=distanceCache.get(key);
    if(!distances){
        distances=new Int16Array(MAZE_WIDTH*MAZE_HEIGHT);distances.fill(-1);
        const queue=new Int32Array(distances.length);let head=0,tail=1;queue[0]=key;distances[key]=0;
        while(head<tail){const cell=queue[head++],x=cell%MAZE_WIDTH,y=Math.floor(cell/MAZE_WIDTH);
            for(const dir of DIRECTIONS){const nx=x+dir.x,ny=y+dir.y;if(!isOpen(nx,ny))continue;const next=ny*MAZE_WIDTH+nx;if(distances[next]<0){distances[next]=distances[cell]+1;queue[tail++]=next}}
        }
        if(distanceCache.size>=32)distanceCache.delete(distanceCache.keys().next().value);
        distanceCache.set(key,distances);
    }
    return distances[sy*MAZE_WIDTH+sx]<0?999:distances[sy*MAZE_WIDTH+sx];
}

function wrap(v, max) {
    return ((v % max) + max) % max;
}

// ============================================
// UPDATE & RENDER
// ============================================

let gridAccumulator=0;
const cameraScratch=new THREE.Vector3();
const cameraFocusScratch=new THREE.Vector3();
function update(dt, t) {
    if (paused || gameOver || won) return;
    if(joy.active&&Math.max(Math.abs(joy.x),Math.abs(joy.y))>.3)player.want=Math.abs(joy.x)>Math.abs(joy.y)?{x:Math.sign(joy.x),y:0}:{x:0,y:Math.sign(joy.y)};

    turboMode=!!keys.Space;
    
    // Move player
    gridAccumulator+=Math.min(dt,.05);
    const gridTick=(turboMode ? .105 : .17)/(GAME_SPEED===0 ? .8 : GAME_SPEED===2 ? 1.2 : 1)/Math.min(1.5,1+(level-1)*.05);
    if(Date.now()>=readyUntil&&Date.now()>=deathFreezeUntil&&gridAccumulator>=gridTick){
        gridAccumulator%=gridTick;
        movePlayer();
        checkGhostEat();
    }
    ghostAccumulator+=Math.min(dt,.05);
    const ghostTick=(powerUntil>Date.now()?.28:.205)/Math.min(1.4,1+(level-1)*.045);
    if(Date.now()>=readyUntil&&Date.now()>=deathFreezeUntil&&ghostAccumulator>=ghostTick){ghostAccumulator%=ghostTick;updateGhosts();checkGhostEat();checkGhostCollision();}
    
    // Les décisions de grille ont une cadence indépendante du rendu.
    
    // Update Pac-Man position
    if (pacman) {
        pacman.position.lerp(cameraFocusScratch.set(player.x*CELL_SIZE+CELL_SIZE/2,1.35,player.y*CELL_SIZE+CELL_SIZE/2),1-Math.exp(-24*dt));
        
        // Animate mouth
        const moving=player.dir.x!==0||player.dir.y!==0;
        const mouthAngle=moving ? .10+(Math.sin(t*16)*.5+.5)*.30 : .14;
        pacman.userData.upperJaw.rotation.z=mouthAngle;
        pacman.userData.lowerJaw.rotation.z=-mouthAngle;
        
        // Update rotation based on direction
        if(moving)pacman.rotation.y=Math.atan2(-player.dir.y,player.dir.x);
    }
    
    // Caméra orientée vers le nord : droite écran = +X, haut écran = -Z.
    const focusX=followCam?player.x*CELL_SIZE+CELL_SIZE/2:MAZE_WIDTH*CELL_SIZE/2;
    const focusZ=followCam?player.y*CELL_SIZE+CELL_SIZE/2:MAZE_HEIGHT*CELL_SIZE/2;
    camera.up.set(0,1,0);
    if(cameraMode==='top-down'){
        camera.up.set(0,0,-1);
        cameraScratch.set(focusX,68/viewZoom,focusZ);
    }else if(cameraMode==='side'){
        cameraScratch.set(focusX+24/viewZoom,32/viewZoom,focusZ+38/viewZoom);
    }else{
        cameraScratch.set(focusX+cameraOffset.x,cameraOffset.y/viewZoom,focusZ+cameraOffset.z/viewZoom);
    }
    camera.position.lerp(cameraScratch,1-Math.exp(-8*dt));
    camera.lookAt(focusX,0,focusZ);
    
    // Update scanner
    if (scanner) {
        scanner.rotation.z = t * 0.5;
        scanner.material.opacity = 0.03 + Math.sin(t * 0.5) * 0.02;
    }
    
    // Update power pellet effects
    for (const effect of scene.children.filter(obj => obj.userData && obj.userData.type === 'powerEffect')) {
        effect.rotation.z = t * 2;
        effect.material.opacity = 0.2 + Math.sin(t * 3) * 0.1;
    }
    
    // Update particles
    updateParticles(dt);
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.life -= dt;
        
        // Remove particle if dead
        if (p.life <= 0) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
            continue;
        }
        
        // Update particle position
        const positions = p.mesh.geometry.attributes.position;
        positions.setXYZ(0, p.x, p.y, p.z);
        positions.needsUpdate = true;
        p.mesh.material.opacity = p.life / p.maxLife;
    }
    
    // Limit particles
    while (particles.length > 200) {
        const p = particles.pop();
        scene.remove(p.mesh);
    }
}

function render() {
    requestAnimationFrame(render);
    
    const delta = Math.min(clock.getDelta(),.05);
    if(document.hidden)return;
    const elapsed = clock.getElapsedTime();
    window.PacmanSfx?.update(state==='playing'&&!paused&&!gameOver&&!won,powerUntil>Date.now(),level,turboMode);
    
    if (state === 'playing' && !paused) {
        update(delta, elapsed);
    }
    
    renderer.render(scene, camera);
}

// ============================================
// INPUT HANDLING
// ============================================

let moveKeys = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 };
let moveDirs = {ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},KeyA:{x:-1,y:0},KeyQ:{x:-1,y:0},KeyD:{x:1,y:0},KeyW:{x:0,y:-1},KeyZ:{x:0,y:-1},KeyS:{x:0,y:1}};

function handleKeyDown(e) {
    if(e.repeat&&['Escape','KeyP','KeyG','KeyV','KeyC'].includes(e.code))return;
    const direction=moveDirs[e.code];if(direction)player.want={...direction};
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
    
    if (e.code === 'KeyC') {
        toggleFollowCam();
    }
    
    if (e.code === 'Space' && state === 'playing') {
        turboMode = true;
    }
}

function handleKeyUp(e) {
    keys[e.code] = false;
    
    if (e.code === 'Space') {
        turboMode = false;
    }
}

function setupTouch() {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (!isTouchDevice) return;
    
    document.getElementById('touch-joystick').classList.add('visible');
    document.getElementById('touch-up').classList.add('visible');
    document.getElementById('touch-left').classList.add('visible');
    document.getElementById('touch-right').classList.add('visible');
    const downButton=document.getElementById('touch-down');
    downButton?.classList.add('visible');
    downButton?.addEventListener('pointerdown',e=>{e.preventDefault();downButton.setPointerCapture(e.pointerId);keys.ArrowDown=true;player.want={x:0,y:1}});
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>downButton?.addEventListener(type,()=>keys.ArrowDown=false));
    document.getElementById('touch-fire').classList.add('visible');
    document.getElementById('touch-ui').classList.add('visible');
    
    // Joystick for movement
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
    
    // Direction buttons
    document.getElementById('touch-up').addEventListener('touchstart', e => {
        e.preventDefault();
        keys['ArrowUp'] = true;
        player.want = {x:0,y:-1};
    }, { passive: false });
    document.getElementById('touch-up').addEventListener('touchend', e => {
        e.preventDefault();
        keys['ArrowUp'] = false;
    }, { passive: false });
    
    document.getElementById('touch-left').addEventListener('touchstart', e => {
        e.preventDefault();
        keys['ArrowLeft'] = true;
        player.want = {x:-1,y:0};
    }, { passive: false });
    document.getElementById('touch-left').addEventListener('touchend', e => {
        e.preventDefault();
        keys['ArrowLeft'] = false;
    }, { passive: false });
    
    document.getElementById('touch-right').addEventListener('touchstart', e => {
        e.preventDefault();
        keys['ArrowRight'] = true;
        player.want = {x:1,y:0};
    }, { passive: false });
    document.getElementById('touch-right').addEventListener('touchend', e => {
        e.preventDefault();
        keys['ArrowRight'] = false;
    }, { passive: false });
    
    // Interrupted touch gestures must release their held controls.
    [['touch-up','ArrowUp'],['touch-left','ArrowLeft'],['touch-right','ArrowRight']].forEach(([id,key])=>{
        document.getElementById(id).addEventListener('touchcancel',()=>{keys[key]=false},{passive:true});
    });
    document.getElementById('touch-fire').addEventListener('touchcancel',()=>{turboMode=false;keys.Space=false},{passive:true});

    // Turbo button
    document.getElementById('touch-fire').addEventListener('touchstart', e => {
        e.preventDefault();
        turboMode = true;keys.Space=true;
    }, { passive: false });
    document.getElementById('touch-fire').addEventListener('touchend', e => {
        e.preventDefault();
        turboMode = false;keys.Space=false;
    }, { passive: false });
}

// ============================================
// UI
// ============================================

const el = id => document.getElementById(id);

let hudStamp='';
function updateHud() {
    if(score>=nextLifeScore){nextLifeScore+=10000;lives=Math.min(6,lives+1);if(soundEnabled)window.PacmanSfx?.extraLife();showBanner('VIE SUPPLÉMENTAIRE !',1200)}
    const newFruitStage=pelletsEaten>=170?2:pelletsEaten>=70?1:0;if(newFruitStage>fruitStage&&!fruit){fruitStage=newFruitStage;spawnFruit()}
    const stamp=[score,level,lives,pelletsEaten].join(':');if(stamp===hudStamp)return;hudStamp=stamp;
    el('score-value').textContent = score;
    el('level-value').textContent = level;
    el('lives-value').textContent = '●'.repeat(lives);
    el('pellets-value').textContent = totalPellets - pelletsEaten;
}

let pauseStarted=0;
function togglePause(force) {
    if (state !== 'playing' && state !== 'paused') return;
    const toPause = force != null ? force : state === 'playing';
    window.PacmanSfx?.pause();
    if (toPause) {
        pauseStarted=Date.now();
        state = 'paused';window.PacmanSfx?.stop();
        el('pause-screen').classList.add('visible');
    } else {
        const gap=Date.now()-pauseStarted;if(powerUntil)powerUntil+=gap;if(frightenedUntil)frightenedUntil+=gap;if(invincibleUntil)invincibleUntil+=gap;readyUntil+=gap;deathFreezeUntil+=gap;
        ghostStates.forEach(g=>{if(g.releaseAt)g.releaseAt+=gap});
        state = 'playing';
        el('pause-screen').classList.remove('visible');
    }
}

function toggleMute() {
    soundEnabled = !soundEnabled;window.PacmanSfx?.setMuted(!soundEnabled);
    const btn = el('btn-mute') || el('btn-sound-ui');
    if (btn) btn.textContent = soundEnabled ? '🔊 SON' : '🔇 MUET';
    
    const btn2 = el('btn-pause-mute');
    if (btn2) btn2.textContent = soundEnabled ? '🔊 SON' : '🔇 MUET';
}

function toggleGraphics() {
    GRAPHICS_QUALITY = (GRAPHICS_QUALITY + 1) % 3;
    const value = ['BASSE', 'MOYENNE', 'ÉLEVÉE'][GRAPHICS_QUALITY];
    el('graphics-value').textContent = value;
    
    // Reinitialize scene with new quality
    cleanupScene();
    initScene();
    if (state === 'playing') {
        resetGame();
    }
}

function toggleCamera() {
    const modes = ['dynamic', 'top-down', 'side'];
    cameraMode = modes[(modes.indexOf(cameraMode) + 1) % modes.length];
    const value = ['DYNAMIQUE', 'HAUT', 'CÔTÉ'][modes.indexOf(cameraMode)];
    el('camera-value').textContent = value;
}

function toggleFollowCam() {
    followCam = !followCam;
}

function toggleSpeed() {
    GAME_SPEED = (GAME_SPEED + 1) % 3;
    const value = ['LENTE', 'NORMALE', 'RAPIDE'][GAME_SPEED];
    el('speed-value').textContent = value;
    
    if (player) {
        player.speed = PACMAN_SPEED * (GAME_SPEED === 0 ? 0.8 : GAME_SPEED === 1 ? 1.0 : 1.2);
    }
}

function initSettings() {
    const volumeSlider = el('volume-slider');
    const volumeValue = el('volume-value');
    const graphicsSlider = el('graphics-slider');
    const graphicsValue = el('graphics-value');
    const cameraSlider = el('camera-slider');
    const cameraValue = el('camera-value');
    const speedSlider = el('speed-slider');
    const speedValue = el('speed-value');
    
    if (volumeSlider) {
        volumeSlider.value = soundVolume * 100;
        volumeSlider.addEventListener('input', () => {
            soundVolume = Number(volumeSlider.value) / 100;
            volumeValue.textContent = Math.round(soundVolume * 100) + '%';
            window.PacmanSfx?.setVolume(soundVolume);
        });
    }
    
    if (graphicsSlider) {
        graphicsSlider.value = GRAPHICS_QUALITY;
        graphicsValue.textContent = ['BASSE', 'MOYENNE', 'ÉLEVÉE'][GRAPHICS_QUALITY];
    }
    
    if (cameraSlider) {
        cameraSlider.value = ['dynamic', 'top-down', 'side'].indexOf(cameraMode);
        cameraSlider.addEventListener('input', () => {
            cameraMode = ['dynamic', 'top-down', 'side'][Number(cameraSlider.value)];
            cameraValue.textContent = ['DYNAMIQUE', 'HAUT', 'CÔTÉ'][Number(cameraSlider.value)];
        });
    }
    
    if (speedSlider) {
        speedSlider.value = GAME_SPEED;
        speedValue.textContent = ['LENTE', 'NORMALE', 'RAPIDE'][GAME_SPEED];
        speedSlider.addEventListener('input', () => {
            GAME_SPEED = Number(speedSlider.value);
            speedValue.textContent = ['LENTE', 'NORMALE', 'RAPIDE'][GAME_SPEED];
            toggleSpeed();
        });
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
    pelletMeshes = [];
    powerPelletMeshes = [];
    particles = [];
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// BOOT
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
    
    // Initialize player
    player = {
        x: 13,
        y: 15,
        dir: { x: 0, y: 0 },
        want: { x: 0, y: 0 },
        speed: PACMAN_SPEED
    };
    
    // Initialize UI
    initSettings();
    bindUI();
    setupTouch();
    
    // Loading animation
    const fill = el('progress-fill'), ptext = el('progress-text');
    const steps = [
        [18, 'Construction du labyrinthe...'],
        [36, 'Installation des murs...'],
        [54, 'Placement des pastilles...'],
        [72, 'Création des fantômes...'],
        [90, 'Préparation de Pac-Man...'],
        [100, 'Prêt à chasser!']
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
            Object.keys(keys).forEach(key=>delete keys[key]);turboMode=false;
            if (state === 'playing') togglePause(true);
        }
    });
    
    window.addEventListener('blur',()=>{Object.keys(keys).forEach(key=>delete keys[key]);turboMode=false;if(state==='playing')togglePause(true)});
    // Bind keys
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
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

window.PACMAN_3D={startGame,togglePause,toggleViewZoom,toggleCamera,state:()=>({state,score,lives,level,pelletsEaten,player:{x:player.x,y:player.y,direction:{...player.dir},buffered:{...player.want}},ghosts:ghostStates.map(g=>({x:g.x,y:g.y,returning:g.returning})),powered:powerUntil>Date.now(),camera:cameraMode,zoom:viewZoom,drawCalls:renderer?.info.render.calls})};
})();
