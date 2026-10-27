// ============================================
// KITT STUNT RACING — v7
// Style Stunt Car Racer / Knight Rider
// By Manix - Hommage au groupe KITT FRANCO BELGE
// Physique : Cannon.js 0.6.2 RaycastVehicle
// 3D : Three.js r128
// Audio : js/audio.js (WebAudio) — Scores : js/scores.js — Éditeur : js/editor.js
// ============================================

'use strict';

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    gravity: -9.82,
    cameraFOV: 62,
    trackWidth: 11.5,              // chaussée élargie pour le duel KITT/KARR
    trackHeight: 0.4,
    carMass: 500,
    engineForce: 4200,          // accélération normale contrôlable
    maxSpeed: 42,               // vitesse normale (m/s ≈ 151 km/h)
    reverseSpeed: 8,            // vitesse max arrière (m/s)
    steerMax: 0.5,              // braquage max (rad) — optimum de courbure ~0.5 dans cannon 0.6.2
    turnRateMax: 1.4,           // lacet max rad/s (80°/s — virages franches mais pas saccadés)
    turboForceMult: 2.35,       // poussée brutale façon turbine
    turboSpeedMult: 1.55,       // pointe temporaire, plafonnée par le limiteur
    turboDuration: 2.4,         // durée du turbo manuel (s)
    turboCooldown: 2.2,         // recharge turbo (s)
    pickupTurboDuration: 4.5,   // boost offert par une bouteille (s)
    pickupImpulse: 42,          // coup de pied immédiat (m/s)
    spmForceMult: 1.45,         // Super Pursuit Mode : puissance réservée au SPM
    spmSpeedMult: 1.75,
    karrSpeed: 25,              // vitesse de croisière de KARR (m/s)
    karrHealth: 5,
    karrShootInterval: 2.6,
    karrProjectileSpeed: 48,
    karrProjectileLife: 2.6,
    playerShootInterval: 0.48,
    brakeForce: 20,
    rollingBrake: 0.8,          // freinage moteur au relâchement
    colors: {
        kittBody: 0x0a0a0a,
        kittWindow: 0x0a1428,
        scanner: 0xff1a1a,
        road: 0x555555,
        roadEdge: 0x888888,
        ground: 0x0a0a14,
        sky: 0x0d0d1a
    }
};

// ============================================
// ÉTAT DU JEU
// ============================================
// loading → menu → countdown → racing ⇄ paused → finished
let state = 'loading';
let paused = false;

let scene, camera, renderer, clock;
let world, carBody, carMesh, vehicle;
let scannerMesh, scannerLight, tailLeftMat, tailRightMat, turboFlame;
let turboFlames = [];
let wheelMeshes = [];
const wheelBaseQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

let keys = {};
let trackPath = { x: 0, z: 0, y: 0, yaw: 0 };
let trackLine = [];           // ligne de centre (waypoints autodrive)
let currentLevel = 1;
const LEVEL_DATA = {};        // 1: {line, checkpoints, finish, spawn} — construit une fois au démarrage
const LOOP_DATA = {};         // données de boucle par niveau (niveau 3)
const LEVEL_OFFSET_X = 420;   // décalage spatial entre niveaux (les pistes coexistent)
let buildingLevel = 1;
let checkpoints = [];       // {x, y, z, yaw, mesh}
let nextCp = 0;
let respawnPoint = { x: 0, y: 1.0, z: 5, yaw: 0 };
let finishZone = null;      // {x, y, z, yaw}
let finishArch = null;
let turboPickups = [];
let spmActive = false;
let spmProgress = 0;
let spmDemoTimer = 0;
let spmParts = [];
let karrMesh = null;
let karrPathIndex = 0;
let karrPathT = 0;
let karrActive = false;
let karrHealth = 0;
let karrRespawnTimer = 0;
let karrShootTimer = 0;
let playerShootTimer = 0;
let projectiles = [];
let karrStatusEl = null;
let driverSelectEl = null;
let pendingRaceLevel = 1;
let selectedDriverId = localStorage.getItem('kx-racer-driver') || 'manix';
let selectedDriver = null;

// Entrées mobiles : elles alimentent la même boucle physique que le clavier.
const mobileInput = { left:false, right:false, accelerate:false, brake:false };
let mobileControlMode = 'touch';
let gyroGamma = 0;
let gyroNeutral = 0;
let gyroReady = false;

// Profils légers : les portraits sont dessinés en CSS, les voitures réutilisent
// le modèle déjà chargé afin de ne pas ralentir le Jetson.
const DRIVER_PROFILES = [
    { id:'cedric', name:'CÉDRIC MOMO RIDER', region:'France', flag:'🇫🇷', portrait:'cedric', car:'KARR', carClass:'karr-cedric', desc:'KARR noir et bas de caisse gris' },
    { id:'kr95', name:'KR-95', region:'Pontiac / concept', flag:'🇺🇸', portrait:'kr95', car:'Banshee IV', carClass:'kr95', desc:'Silhouette rouge futuriste' },
    { id:'frank', name:'FRANK', region:'France', flag:'🇫🇷', portrait:'frank', car:'K-4000', carClass:'k4000', desc:'Pontiac grise de poursuite' },
    { id:'dadoo', name:'DADOO', region:'Corse / Marseille', flag:'🏴', portrait:'dadoo', car:'KARR', carClass:'karr-black', desc:'KARR entièrement noire' },
    { id:'pascal-ki', name:'Pascal K-Industries', region:'Portugal', flag:'🇵🇹', portrait:'pascal-ki', car:'Trans Am cabriolet', carClass:'convertible', desc:'Pontiac rouge décapotable' },
    { id:'manix', name:'MANIX', region:'Belgique', flag:'🇧🇪', portrait:'manix', car:'KITT', carClass:'manix', desc:'Voiture actuelle conservée' },
    { id:'pascal-ferron', name:'PASCAL FERRON', region:'Belgique', flag:'🇧🇪', portrait:'pascal-ferron', car:'KITT / K2000', carClass:'kitt', desc:'Pontiac Trans Am noire classique' },
    { id:'john', name:'JOHN RIDER', region:'France', flag:'🇫🇷', portrait:'john', car:'Pontiac grise', carClass:'pontiac-grey', desc:'Pontiac grise' },
    { id:'laetitia', name:'LAETITIA', region:'France', flag:'🇫🇷', portrait:'laetitia', car:'KITT', carClass:'kitt', desc:'Pilote précise et déterminée' },
    { id:'elsa', name:'ELSA', region:'France', flag:'🇫🇷', portrait:'elsa', car:'KARR', carClass:'karr-black', desc:'Pilote rapide et élégante' },
    { id:'virginie', name:'VIRGINIE', region:'France', flag:'🇫🇷', portrait:'virginie', car:'K-4000', carClass:'k4000', desc:'Pilote tactique et attentive' },
    { id:'bastien', name:'BASTIEN', region:'France', flag:'🇫🇷', portrait:'bastien', car:'Pontiac grise', carClass:'pontiac-grey', desc:'Pilote offensif et régulier' },
    { id:'lilou', name:'LILOU', region:'France', flag:'🇫🇷', portrait:'lilou', car:'Banshee IV', carClass:'kr95', desc:'Pilote vive et imprévisible' },
    { id:'alexia', name:'ALEXIA', region:'France', flag:'🇫🇷', portrait:'alexia', car:'KITT', carClass:'manix', desc:'Pilote concentrée et audacieuse' },
    { id:'maeva', name:'MAËVA', region:'France', flag:'🇫🇷', portrait:'maeva', car:'Trans Am', carClass:'convertible', desc:'Pilote souple et instinctive' },
    { id:'laura', name:'LAURA', region:'France', flag:'🇫🇷', portrait:'laura', car:'KARR', carClass:'karr-cedric', desc:'Pilote technique et combative' }
];

function getDriver(id) {
    return DRIVER_PROFILES.find(p => p.id === id) || DRIVER_PROFILES.find(p => p.id === 'manix');
}

function portraitMarkup(profile, large = false) {
    return `<div class="driver-portrait ${profile.portrait}${large ? ' large' : ''}" aria-label="Portrait de ${profile.name}">
        <span class="portrait-head"></span><span class="portrait-hair"></span><span class="portrait-hat"></span>
        <span class="portrait-beard"></span><span class="portrait-tooth"></span>
        <span class="portrait-jacket"></span>
    </div>`;
}

function setupDriverSelection() {
    driverSelectEl = document.getElementById('driver-select');
    if (!driverSelectEl) return;
    const back = document.getElementById('driver-back');
    const start = document.getElementById('driver-start');
    if (back) back.addEventListener('click', backToMenu);
    if (start) start.addEventListener('click', () => beginRace(pendingRaceLevel));
    renderDriverSelection();
}

function renderDriverSelection() {
    if (!driverSelectEl) return;
    selectedDriver = getDriver(selectedDriverId);
    const grid = document.getElementById('driver-grid');
    const detail = document.getElementById('driver-detail');
    if (grid) {
        grid.innerHTML = DRIVER_PROFILES.map(p => `<button type="button" class="driver-card ${p.id === selectedDriver.id ? 'selected' : ''}" data-driver="${p.id}">
            ${portraitMarkup(p)}<span class="driver-card-name">${p.name}</span>
            <span class="driver-card-region">${p.flag} ${p.region}</span>
            <span class="driver-card-car">${p.car}</span>
        </button>`).join('');
        grid.querySelectorAll('[data-driver]').forEach(card => card.addEventListener('click', () => selectDriver(card.dataset.driver)));
    }
    if (detail) {
        const oldStage = detail.parentElement && detail.parentElement.querySelector('.driver-car-stage');
        if (oldStage) oldStage.remove();
        detail.innerHTML = `${portraitMarkup(selectedDriver, true)}
            <div class="driver-detail-copy"><div class="driver-detail-kicker">PILOTE SÉLECTIONNÉ</div>
            <h2>${selectedDriver.name}</h2><p>${selectedDriver.flag} ${selectedDriver.region}</p>
            <div class="driver-car-chip">VÉHICULE <b>${selectedDriver.car}</b></div>
            <small>${selectedDriver.desc}</small></div>`;
        detail.insertAdjacentHTML('afterend', `<div class="driver-car-stage"><div class="driver-car-preview ${selectedDriver.carClass}" aria-label="Aperçu de ${selectedDriver.car}">
            <span class="mini-car-roof"></span><span class="mini-car-body"></span><span class="mini-car-scanner"></span>
            <i></i><i></i><i></i><i></i><b>${selectedDriver.car}</b>
        </div></div>`);
    }
    applyDriverVehicle(selectedDriver.id);
}

function renderDriverHud() {
    const badge = document.getElementById('driver-hud-badge');
    if (!badge || !selectedDriver) return;
    badge.innerHTML = `${portraitMarkup(selectedDriver)}<span><b>${selectedDriver.name}</b><small>${selectedDriver.car}</small></span>`;
}

function selectDriver(id) {
    selectedDriverId = getDriver(id).id;
    selectedDriver = getDriver(selectedDriverId);
    localStorage.setItem('kx-racer-driver', selectedDriverId);
    renderDriverSelection();
    initAudio();
    beep(520, .08);
}

function openDriverSelect(level) {
    pendingRaceLevel = Number.isInteger(Number(level)) ? Number(level) : currentLevel;
    selectedDriver = getDriver(selectedDriverId);
    state = 'select';
    paused = false;
    if (driverSelectEl) driverSelectEl.classList.remove('hidden');
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('results-screen').classList.add('hidden');
    if (karrMesh) karrMesh.visible = false;
    clearProjectiles();
    renderDriverSelection();
}

let raceTime = 0;
let raceStartTime = 0;
let countdownT = 0;
let countdownLast = -1;
let topSpeedKmh = 0;
let displayedSpeed = 0;
let flipTimer = 0;

let turboActive = false;
let turboTimer = 0;
let turboCooldown = 0;
let scannerTimer = 0;
let stuckTimer = 0;
let stuckCheckTimer = 0;
let stuckNoMoveCount = 0;
let lastStuckX = 0;
let lastStuckZ = 0;
let lastAutoSteer = 0;
let autoWpIdx = 0;
let endOfLineTimer = 0;
let humanSteer = 0;
let loopData = null;
let inLoop = false;
let loopPhi = 0;
let loopSpeed = 0;
let loopCompleted = false;

let autodrive = false;
let debugMode = false;
let lastDebugLog = 0;
let forceTickMode = false;       // mode test : boucle sur setTimeout (rAF bridé en headless)

// DOM
let speedEl, timerEl, checkpointEl, messagesEl, debugEl, turboFillEl, countdownEl;
let speedLinesEl, damageFlashEl;
let spmIndicatorEl;

// V7 — environnement animé / effets
let sunLight = null;
let groundTexRef = null;
let auroraPlanes = [];
let antennaLights = [];
let neonPulseMats = [];
let camShake = 0;
let prevVelY = 0;
let lastDustT = 0;
let lastShootingStar = 0;

// V7 — routage de la construction vers un groupe / une liste de corps par niveau
// (indispensable pour reconstruire le circuit personnalisé niveau 4)
let currentLevelGroup = null;
let currentLevelBodies = null;

// V7 — particules (pool de sprites)
const PARTICLES = { pool: [], active: [] };

// ============================================
// ASSETS PARTAGÉS (textures/matières créées une fois)
// ============================================
let SHARED = null;
let poleCounter = 0;

function shared() {
    if (SHARED) return SHARED;

    // Texture de route : asphalte + bords rouges
    const rc = document.createElement('canvas');
    rc.width = 128; rc.height = 256;
    const rg = rc.getContext('2d');
    rg.fillStyle = '#151820';
    rg.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 1100; i++) {
        rg.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.09)';
        rg.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
    }
    rg.fillStyle = '#86101d'; rg.fillRect(0, 0, 9, 256); rg.fillRect(119, 0, 9, 256);
    rg.fillStyle = '#aeb3bf'; rg.fillRect(9, 0, 3, 256); rg.fillRect(116, 0, 3, 256);
    const roadTex = new THREE.CanvasTexture(rc);
    roadTex.wrapT = THREE.RepeatWrapping;

    // Dégradé radial (lueurs, lune, flamme)
    function radial(inner, outer) {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
        grad.addColorStop(0, inner);
        grad.addColorStop(1, outer);
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
    }

    // Fenêtres d'immeubles
    const wc = document.createElement('canvas');
    wc.width = 64; wc.height = 128;
    const wg = wc.getContext('2d');
    wg.fillStyle = '#05070f';
    wg.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 124; y += 8) {
        for (let x = 4; x < 60; x += 8) {
            if (Math.random() < 0.38) {
                wg.fillStyle = Math.random() < 0.7 ? '#ffca7a' : '#9fd8ff';
                wg.fillRect(x, y, 4, 5);
            }
        }
    }
    const windowTex = new THREE.CanvasTexture(wc);
    windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;

    SHARED = {
        roadTex: roadTex,
        poleMat: markShared(new THREE.MeshStandardMaterial({ color: 0x2a2a35, roughness: 0.6, metalness: 0.5 })),
        lampMat: markShared(new THREE.MeshBasicMaterial({ color: 0xffc06a })),
        lampGlow: markShared(new THREE.SpriteMaterial({
            map: radial('rgba(255,190,110,0.9)', 'rgba(255,150,50,0)'),
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
        })),
        glowRed: markShared(new THREE.SpriteMaterial({
            map: radial('rgba(255,60,60,0.85)', 'rgba(255,0,0,0)'),
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
        })),
        flameMat: markShared(new THREE.SpriteMaterial({
            map: radial('rgba(255,230,160,1)', 'rgba(255,90,0,0)'),
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
        })),
        boostFlameMat: markShared(new THREE.SpriteMaterial({
            map: radial('rgba(255,255,255,1)', 'rgba(0,170,255,0)'),
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
        })),
        smokeTex: markShared(new THREE.SpriteMaterial({
            map: radial('rgba(100,115,135,0.7)', 'rgba(20,25,35,0)'),
            depthWrite: false, transparent: true, opacity: 0.7
        })),
        moonMat: markShared(new THREE.SpriteMaterial({
            map: radial('rgba(255,250,235,1)', 'rgba(200,210,255,0)'),
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false
        })),
        dustTex: markShared(new THREE.SpriteMaterial({
            map: radial('rgba(160,150,140,0.55)', 'rgba(120,110,100,0)'),
            depthWrite: false, transparent: true, opacity: 0.8
        })),
        sparkTex: markShared(new THREE.SpriteMaterial({
            map: radial('rgba(255,240,180,1)', 'rgba(255,120,0,0)'),
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
        })),
        windowTex: windowTex,
        // Bandes néon des bords de piste (alternance rouge / cyan par niveau)
        neonRed: markShared(new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 0.9, roughness: 0.5 })),
        neonCyan: markShared(new THREE.MeshStandardMaterial({ color: 0x002233, emissive: 0x00e5ff, emissiveIntensity: 0.8, roughness: 0.5 })),
        neonGold: markShared(new THREE.MeshStandardMaterial({ color: 0x332200, emissive: 0xffcc00, emissiveIntensity: 0.8, roughness: 0.5 }))
    };
    return SHARED;
}

// Marque un matériau comme partagé : rebuildCustom ne le détruira pas.
function markShared(mat) {
    mat.userData.shared = true;
    return mat;
}

// ============================================
// INITIALISATION
// ============================================
window.addEventListener('DOMContentLoaded', init);

function init() {
    console.log('🚗 KITT STUNT RACING v7 - Initialisation');
    console.log('%cBy Manix - KITT FRANCO BELGE', 'color:#ff0000');

    speedEl = document.getElementById('speed-value');
    timerEl = document.getElementById('timer');
    checkpointEl = document.getElementById('checkpoint-info');
    messagesEl = document.getElementById('hud-messages');
    debugEl = document.getElementById('hud-debug');
    turboFillEl = document.getElementById('turbo-fill');
    countdownEl = document.getElementById('countdown');
    speedLinesEl = document.getElementById('speed-lines');
    damageFlashEl = document.getElementById('damage-flash');
    spmIndicatorEl = document.getElementById('spm-cinematic');
    karrStatusEl = document.getElementById('karr-status');

    const urlParams = new URLSearchParams(window.location.search);
    autodrive = urlParams.get('autodrive') === '1';
    debugMode = urlParams.get('debug') === '1';
    forceTickMode = urlParams.get('tick') === '1';
    if (debugEl) debugEl.style.display = debugMode ? 'block' : 'none';

    try {
        initThreeJS();
        initPhysics();
        buildTrack();
        createCar();
        createKarr();
        createEnvironment();
        initParticles();
        setupControls();
        setupUI();
        setupDriverSelection();

        // V7 — API publique pour l'éditeur et les scores
        window.KITT = {
            startRace: (lvl) => startRace(lvl),
            backToMenu: () => backToMenu(),
            rebuildCustom: (ops) => rebuildCustom(ops),
            refreshMenuBest: () => updateMenuBest(),
            customOffsetX: LEVEL_OFFSET_X * 3,  // position X du circuit personnalisé
            camera: null,                       // renseignée après création
            getState: () => state,
            get levelData() { return LEVEL_DATA; }
        };

        state = 'menu';
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('main-menu').classList.remove('hidden');
        updateMenuBest();
        if (window.KITT) KITT.camera = camera;

        const lvlParam = Number(urlParams.get('level'));
        if (Number.isInteger(lvlParam) && LEVEL_DATA[lvlParam]) setLevel(lvlParam);
        if (urlParams.get('autorace') === '1') {
            setTimeout(() => startRace(currentLevel), 400);
        }
        if (urlParams.get('select') === '1') {
            setTimeout(() => openDriverSelect(currentLevel), 400);
        }

        // Debug / tests automatisés
    window.__kitt = {
        get state() { return state; },
        get pos() { return carBody ? { x: +carBody.position.x.toFixed(1), y: +carBody.position.y.toFixed(2), z: +carBody.position.z.toFixed(1) } : null; },
        get kmh() { return carBody ? +(carBody.velocity.length() * 3.6).toFixed(0) : 0; },
        get vel() { return carBody ? { x: +carBody.velocity.x.toFixed(2), y: +carBody.velocity.y.toFixed(2), z: +carBody.velocity.z.toFixed(2) } : null; },
        get nextCp() { return nextCp; },
        get raceTime() { return +raceTime.toFixed(2); },
        get level() { return currentLevel; },
        get inLoop() { return inLoop; },
        get loopCompleted() { return loopCompleted; },
        get karr() { return { active: karrActive, health: karrHealth, projectiles: projectiles.length }; },
        get checkpoints() { return checkpoints.map(c => ({ x: +c.x.toFixed(0), y: +c.y.toFixed(1), z: +c.z.toFixed(0) })); },
        get finish() { return finishZone ? { x: +finishZone.x.toFixed(0), y: +finishZone.y.toFixed(1), z: +finishZone.z.toFixed(0) } : null; },
        get heading() {
            if (!carBody) return 0;
            const f = new CANNON.Vec3(0, 0, 1);
            carBody.quaternion.vmult(f, f);
            return +(Math.atan2(f.x, f.z) * 180 / Math.PI).toFixed(1);
        },
        get adbg() { return window.__kittAdbg || null; },
        // Utilitaire de test automatisé : téléporte la voiture avec une vitesse imposée
        teleport(x, y, z, vx, vy, vz) {
            if (!carBody) return;
            carBody.position.set(x, y, z);
            carBody.velocity.set(vx || 0, vy || 0, vz || 0);
            carBody.angularVelocity.set(0, 0, 0);
            carBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.atan2(vx || 0, vz || 0));
        },
        get contacts() {
            if (!world || !carBody) return [];
            const out = [];
            for (const c of world.contacts) {
                if (c.bi === carBody || c.bj === carBody) {
                    const other = c.bi === carBody ? c.bj : c.bi;
                    out.push({
                        x: +other.position.x.toFixed(1),
                        y: +other.position.y.toFixed(1),
                        z: +other.position.z.toFixed(1),
                        hx: other.shapes && other.shapes[0] && other.shapes[0].halfExtents ? +other.shapes[0].halfExtents.x.toFixed(2) : (other.shapes && other.shapes[0] && other.shapes[0].radius !== undefined ? 'sph' : '?'),
                        hy: other.shapes && other.shapes[0] && other.shapes[0].halfExtents ? +other.shapes[0].halfExtents.y.toFixed(2) : '',
                        hz: other.shapes && other.shapes[0] && other.shapes[0].halfExtents ? +other.shapes[0].halfExtents.z.toFixed(2) : ''
                    });
                }
            }
            return out;
        }
    };

    animate();
    } catch (err) {
        console.error('INIT ERROR:', err);
        showError(err.message);
    }
}

function showError(msg) {
    const div = document.createElement('div');
    div.className = 'error-box';
    div.innerHTML = '<h2>ERREUR</h2><p>' + msg + '</p><p>Vérifiez la console (F12)</p>';
    document.body.appendChild(div);
}

// ============================================
// THREE.JS
// ============================================
function initThreeJS() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.sky);
    scene.fog = new THREE.Fog(CONFIG.colors.sky, 60, 380);

    camera = new THREE.PerspectiveCamera(CONFIG.cameraFOV, window.innerWidth / window.innerHeight, 0.1, 8000);
    camera.position.set(0, 6, -12);

    if (!checkWebGL()) {
        throw new Error('WebGL non disponible dans ce navigateur.<br><br>' +
            '<strong>Solutions :</strong><br>' +
            '• Firefox : <code>firefox -P jetson-webgl http://localhost:8123/</code><br>' +
            '• Chromium : <code>./chromium_jetson_launch.sh</code><br>' +
            '(ou <code>chromium-browser --enable-unsafe-swiftshader http://localhost:8123/</code>)');
    }

    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('game-canvas'),
        antialias: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: forceTickMode   // requis pour les captures de test
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    // V7 — rendu cinéma : tone mapping filmique + espace couleur sRGB
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;

    const ambient = new THREE.AmbientLight(0x596a86, 0.36);
    scene.add(ambient);

    // Lumière hémisphérique : ciel bleu nuit / sol sombre — adoucit les normales
    const hemi = new THREE.HemisphereLight(0x3350a0, 0x0a0812, 0.42);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffe9dc, 0.72);
    sun.position.set(80, 150, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 400;
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    scene.add(sun.target);
    sunLight = sun;

    const fill = new THREE.DirectionalLight(0x4455cc, 0.32);
    fill.position.set(-80, 60, -60);
    scene.add(fill);

    window.addEventListener('resize', onWindowResize);
}

function checkWebGL() {
    try {
        const c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
        return false;
    }
}

function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// ENVIRONNEMENT (sol, étoiles, néons)
// ============================================
function createEnvironment() {
    const s = shared();
    const coursePoints = Object.values(LEVEL_DATA).flatMap(level => level.line);
    const nearCourse = (x,z,margin) => coursePoints.some(p => Math.hypot(p.x-x,p.z-z) < margin + 20);

    // Ciel : dôme en dégradé (noir → bleu nuit → pourpre à l'horizon)
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4; skyCanvas.height = 512;
    const skg = skyCanvas.getContext('2d');
    const skyGrad = skg.createLinearGradient(0, 0, 0, 512);
    skyGrad.addColorStop(0, '#010208');
    skyGrad.addColorStop(0.38, '#07132b');
    skyGrad.addColorStop(0.72, '#1a1740');
    skyGrad.addColorStop(0.9, '#42152f');
    skyGrad.addColorStop(1, '#6b1b2e');
    skg.fillStyle = skyGrad;
    skg.fillRect(0, 0, 4, 512);
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(5000, 16, 12),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(skyCanvas), side: THREE.BackSide, fog: false })
    );
    scene.add(sky);

    // Lune + halo
    const moon = new THREE.Sprite(s.moonMat);
    moon.scale.set(170, 170, 1);
    moon.position.set(520, 330, -780);
    scene.add(moon);
    // Lune rouge au-dessus de la ligne de course : repère visuel K2000.
    const kittMoonMat = s.moonMat.clone();
    kittMoonMat.color.setHex(0xff3048);
    kittMoonMat.opacity = .65;
    const kittMoon = new THREE.Sprite(kittMoonMat);
    kittMoon.scale.set(120, 120, 1);
    kittMoon.position.set(-210, 170, 620);
    scene.add(kittMoon);

    // Sol avec grille (texture conservée pour l'animation de défilement)
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 256;
    groundCanvas.height = 256;
    const gctx = groundCanvas.getContext('2d');
    gctx.fillStyle = '#0b0b16';
    gctx.fillRect(0, 0, 256, 256);
    gctx.strokeStyle = '#1d2742';
    gctx.lineWidth = 2;
    gctx.strokeRect(0, 0, 256, 256);
    // points lumineux aléatoires dans les cases (effet ville)
    for (let i = 0; i < 40; i++) {
        gctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,229,255,0.10)' : 'rgba(255,40,80,0.08)';
        gctx.fillRect(Math.floor(Math.random() * 16) * 16 + 6, Math.floor(Math.random() * 16) * 16 + 6, 3, 3);
    }
    const groundTex = new THREE.CanvasTexture(groundCanvas);
    groundTex.wrapS = THREE.RepeatWrapping;
    groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(90, 90);
    groundTexRef = groundTex;
    const groundMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(6000, 6000),
        new THREE.MeshBasicMaterial({ map: groundTex })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.set(630, -2.01, 210); // centré entre toutes les pistes
    scene.add(groundMesh);

    // Étoiles (double couche : fines + grosses scintillantes)
    function starLayer(count, size, color, opacity) {
        const g = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 0.45;
            const r = 1000;
            pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            pos[i * 3 + 1] = r * Math.cos(phi) + 20;
            pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const m = new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity, fog: false });
        const p = new THREE.Points(g, m);
        scene.add(p);
        return m;
    }
    starLayer(500, 1.4, 0xaabbff, 0.8);
    starLayer(120, 2.4, 0xffe0c0, 0.9);
    auroraPlanes.push({ mat: starLayer(60, 3.0, 0xffffff, 0.7), phase: Math.random() * 9 });

    // Aurore boréale : deux grands voiles additifs dérivants
    function aurora(x, y, z, w, h, hue1, hue2, op) {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, 64);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.45, hue1);
        grad.addColorStop(0.75, hue2);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 64);
        const mat = new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(c), transparent: true, opacity: op,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        auroraPlanes.push({ mesh, mat, baseY: y, phase: Math.random() * 9, baseOp: op });
    }
    aurora(-420, 260, -880, 900, 240, 'rgba(0,255,170,0.20)', 'rgba(0,120,255,0.10)', 0.55);
    aurora(300, 300, -950, 1100, 280, 'rgba(150,0,255,0.16)', 'rgba(0,200,255,0.08)', 0.45);

    // Horizon HUD : trois anneaux lointains donnent une signature K2000
    // sans ajouter de textures ou de post-processing coûteux.
    const horizonMats = [
        new THREE.MeshBasicMaterial({color:0xa40b28, transparent:true, opacity:.28}),
        new THREE.MeshBasicMaterial({color:0x153f87, transparent:true, opacity:.2}),
        new THREE.MeshBasicMaterial({color:0x7b164d, transparent:true, opacity:.16})
    ];
    [980, 1160, 1380].forEach((radius, i) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 1.8, 5, 96), horizonMats[i]);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(630, 105 + i * 38, 210);
        ring.userData.hideInEditor = true;
        scene.add(ring);
    });

    // Chaîne de montagnes silhouettées (3 crêtes de cônes)
    const mtnMats = [0x11162a,0x0b1022,0x070b18].map(color => new THREE.MeshBasicMaterial({color}));
    const mountainRings = [{ r: 880, h: 150, n: 26 }, { r: 1020, h: 230, n: 20 }, { r: 1150, h: 320, n: 14 }];
    for (const [ringIndex, ring] of mountainRings.entries()) {
        for (let i = 0; i < ring.n; i++) {
            const a = (i / ring.n) * Math.PI * 2 + ring.r;
            const h = ring.h * (0.55 + Math.random() * 0.9);
            if (nearCourse(Math.cos(a)*ring.r+630, Math.sin(a)*ring.r+210, h*.9)) continue;
            const cone = new THREE.Mesh(new THREE.ConeGeometry(h * 0.9, h, 8), mtnMats[ringIndex]);
            cone.position.set(Math.cos(a) * ring.r + 630, -2 + h / 2, Math.sin(a) * ring.r + 210);
            cone.rotation.y = Math.random() * Math.PI;
            cone.userData.hideInEditor = true;
            cone.userData.courseMargin = h * .9 + 20;
            scene.add(cone);
        }
    }

    // Skyline : buildings éloignés aux fenêtres lumineuses (2 grappes, une par niveau)
    const clusters = [
        { cx: -140, cz: 150 },
        { cx: 500, cz: 60 },
        { cx: 1140, cz: 380 }
    ];
    for (const cl of clusters) {
        for (let i = 0; i < 15; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 130 + Math.random() * 190;
            const bx = cl.cx + Math.cos(a) * r;
            const bz = cl.cz + Math.sin(a) * r * 1.4;
            const w = 14 + Math.random() * 22;
            if (nearCourse(bx,bz,w)) continue;
            const h = 22 + Math.random() * 55;
            const tex = s.windowTex.clone();
            tex.needsUpdate = true;
            tex.repeat.set(Math.max(1, Math.round(w / 14)), Math.max(1, Math.round(h / 22)));
            const b = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, w),
                new THREE.MeshBasicMaterial({ map: tex })
            );
            b.position.set(bx, -2 + h / 2, bz);
            b.userData.courseMargin = w + 20;
            b.rotation.y = Math.random() * Math.PI;
            scene.add(b);
            // Antenne + voyant clignotant sur les plus hauts
            if (h > 55 && antennaLights.length < 8) {
                const beacon = new THREE.Sprite(s.glowRed.clone());
                beacon.scale.set(4, 4, 1);
                beacon.position.set(bx, -2 + h + 4, bz);
                scene.add(beacon);
                antennaLights.push({ sprite: beacon, phase: Math.random() * 6 });
            }
        }
    }

    // Piliers néon décoratifs (hors des pistes)
    const neonColors = [0xff0044, 0x00e5ff, 0xff8800, 0x8800ff, 0xff0044];
    const pillarGeo = new THREE.BoxGeometry(2.5, 1, 2.5);
    let placed = 0, attempts = 0;
    while (placed < 70 && attempts < 900) {
        attempts++;
        const px = (Math.random() - 0.5) * 1600 + 630;
        const pz = (Math.random() - 0.5) * 1000 + 210;
        if (nearCourse(px,pz,12)) continue;
        // exclusion : corridors des pistes 1, 2 et 3
        if (px > -60 && px < 60 && pz > -40 && pz < 280) continue;
        if (px > LEVEL_OFFSET_X - 80 && px < LEVEL_OFFSET_X + 100 && pz > -40 && pz < 380) continue;
        if (px > LEVEL_OFFSET_X * 2 - 80 && px < LEVEL_OFFSET_X * 2 + 100 && pz > -40 && pz < 380) continue;
        const h = 8 + Math.random() * 26;
        const mat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            emissive: neonColors[placed % neonColors.length],
            emissiveIntensity: 0.55,
            roughness: 0.8
        });
        neonPulseMats.push({ mat, phase: Math.random() * 6 });
        const pillar = new THREE.Mesh(pillarGeo, mat);
        pillar.scale.y = h;
        pillar.position.set(px, -2 + h / 2, pz);
        pillar.userData.courseMargin = 25;
        scene.add(pillar);
        placed++;
    }

    // Balises de piste lointaines : elles structurent le paysage sans
    // collisions ni nouveaux calculs physiques.
    const beaconMat = new THREE.MeshBasicMaterial({color:0xb30a28,transparent:true,opacity:.72});
    for (let i = 0; i < 18; i++) {
        const angle = (i / 18) * Math.PI * 2;
        const radius = 420 + (i % 3) * 90;
        const x = 630 + Math.cos(angle) * radius;
        const z = 210 + Math.sin(angle) * radius;
        if (nearCourse(x, z, 22)) continue;
        const beacon = new THREE.Mesh(new THREE.BoxGeometry(1.1, 12 + (i % 4) * 5, 1.1), beaconMat);
        beacon.position.set(x, 5, z);
        beacon.userData.hideInEditor = true;
        scene.add(beacon);
    }
}

// V7 — animation de l'environnement (appelée à chaque frame)
function updateEnvironment(dt) {
    const t = clock.elapsedTime;

    // Grille qui défile lentement (sensation de vitesse au sol)
    if (groundTexRef) {
        groundTexRef.offset.x = (t * 0.004) % 1;
        groundTexRef.offset.y = (t * 0.0025) % 1;
    }

    // Aurores : ondulation verticale + respiration d'opacité
    for (const a of auroraPlanes) {
        if (a.mesh) {
            a.mesh.position.y = a.baseY + Math.sin(t * 0.18 + a.phase) * 18;
            a.mat.opacity = a.baseOp * (0.75 + 0.25 * Math.sin(t * 0.5 + a.phase));
        } else if (a.mat) {
            a.mat.opacity = 0.45 + 0.35 * Math.sin(t * 1.3 + a.phase); // scintillement étoiles
        }
    }

    // Voyants d'antennes : clignotement type tour
    for (const b of antennaLights) {
        const on = Math.sin(t * 2.2 + b.phase) > 0.55;
        b.sprite.material.opacity = on ? 1 : 0.06;
    }

    // Piliers néon : pulsation douce
    for (const p of neonPulseMats) {
        p.mat.emissiveIntensity = 0.45 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.6 + p.phase));
    }

    // Étoiles filantes occasionnelles
    lastShootingStar -= dt;
    if (lastShootingStar <= 0 && carMesh) {
        lastShootingStar = 3 + Math.random() * 5;
        const ang = Math.random() * Math.PI * 2;
        const r = 500;
        spawnParticle(shared().sparkTex,
            carMesh.position.x + Math.cos(ang) * r,
            260 + Math.random() * 160,
            carMesh.position.z + Math.sin(ang) * r,
            Math.cos(ang + 2) * 90, -60, Math.sin(ang + 2) * 90,
            0.9, 7, 0.9, 1.6);
    }
}

// ============================================
// PHYSIQUE (Cannon.js)
// ============================================
function initPhysics() {
    if (typeof CANNON === 'undefined') {
        throw new Error('CANNON.js non chargé. Vérifiez lib/cannon.min.js');
    }

    world = new CANNON.World();
    world.gravity.set(0, CONFIG.gravity, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 10;
    // Friction par défaut nulle : la carrosserie ne grippe pas sur la piste,
    // seules les roues (rayons) fournissent l'adhérence.
    world.defaultContactMaterial.friction = 0;

    // Sol de secours (au-dessous de la grille visuelle)
    const groundBody = new CANNON.Body({ mass: 0 });
    groundBody.addShape(new CANNON.Plane());
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    groundBody.position.set(0, -2, 0);
    world.addBody(groundBody);
}

// ============================================
// PISTE
// ============================================
function trackForward() {
    return { x: Math.sin(trackPath.yaw), z: Math.cos(trackPath.yaw) };
}

// Ajoute un objet 3D au niveau en cours (groupe dédié, ou scène globale)
function lvlAdd(obj) {
    (currentLevelGroup || scene).add(obj);
}

// Ajoute un corps physique au monde et le mémorise pour le niveau en cours
function lvlAddBody(body) {
    world.addBody(body);
    if (currentLevelBodies) currentLevelBodies.push(body);
}

function buildTrack() {
    buildLevel(1, 0);
    buildLevel(2, LEVEL_OFFSET_X);
    buildLevel(3, LEVEL_OFFSET_X * 2);
    buildLevel(4, LEVEL_OFFSET_X * 3);
    setLevel(1);
    console.log('🛣️ Pistes : niveaux 1, 2, 3 et circuit personnalisé construits');
}

function buildLevel(level, offsetX, opsOverride) {
    buildingLevel = level;
    trackPath = { x: offsetX, z: 0, y: 0, yaw: 0 };
    trackLine = [];
    checkpoints = [];
    finishZone = null;

    // V7 — tous les objets du niveau vont dans un groupe dédié (reconstruction
    // propre du niveau 4 par l'éditeur), et les corps physiques sont collectés.
    const lvlGroup = new THREE.Group();
    scene.add(lvlGroup);
    currentLevelGroup = lvlGroup;
    currentLevelBodies = [];

    // Arche de départ
    addArch(trackPath.x, trackPath.y, trackPath.z + 2, trackPath.yaw, 'DÉPART', '#ff0000');

    if (opsOverride) customLayoutFromOps(opsOverride);
    else if (level === 1) level1Layout();
    else if (level === 2) level2Layout();
    else if (level === 3) level3Layout();
    else customLayoutFromOps(defaultCustomOps());

    finishZone = {
        x: trackPath.x,
        y: trackPath.y,
        z: trackPath.z,
        yaw: trackPath.yaw
    };
    addCheckerLine(finishZone.x, finishZone.y, finishZone.z, finishZone.yaw);
    addArch(finishZone.x, finishZone.y, finishZone.z + 1, finishZone.yaw, 'ARRIVÉE', '#ffcc00');

    const levelTurboPickups = createTurboPickups(trackLine, level);

    LEVEL_DATA[level] = {
        line: trackLine,
        checkpoints: checkpoints,
        finish: finishZone,
        spawn: { x: offsetX, y: 1.0, z: 5, yaw: 0 },
        group: lvlGroup,
        bodies: currentLevelBodies,
        turboPickups: levelTurboPickups
    };
    currentLevelGroup = null;
    currentLevelBodies = null;
}

// ---- NIVEAU 4 : circuit personnalisé construit depuis une liste d'opérations ----
function defaultCustomOps() {
    return [
        { type: 'straight', len: 30, dy: 0 },
        { type: 'curve', radius: 45, angle: -45, dy: 0 },
        { type: 'checkpoint' },
        { type: 'straight', len: 22, dy: 1.8 },
        { type: 'jump' },
        { type: 'curve', radius: 50, angle: 90, dy: 0 },
        { type: 'checkpoint' },
        { type: 'straight', len: 30, dy: -1.0 },
        { type: 'loop' },
        { type: 'checkpoint' },
        { type: 'curve', radius: 45, angle: -45, dy: 0 },
        { type: 'straight', len: 30, dy: 0 }
    ];
}

function customLayoutFromOps(ops) {
    let loops = 0;
    let sinceCp = 0;
    let pieces = 0;
    for (const o of ops) {
        if (!o || typeof o !== 'object') continue;
        if (o.type === 'straight') {
            addStraight(o.len || 20, o.dy || 0);
            sinceCp++; pieces++;
        } else if (o.type === 'curve') {
            addCurve(o.radius || 40, o.angle || 45, o.dy || 0);
            sinceCp++; pieces++;
        } else if (o.type === 'gap') {
            addGap(o.len || 10);
            sinceCp++; pieces++;
        } else if (o.type === 'jump') {
            addStraight(10, 2.5);
            addGap(14);
            addStraight(10, -2.5);
            sinceCp++; pieces++;
        } else if (o.type === 'loop') {
            if (loops >= 1) continue;          // une seule boucle supportée
            addLoop(11);
            loops++;
            sinceCp++; pieces++;
        } else if (o.type === 'checkpoint') {
            addCheckpoint();
            sinceCp = 0;
        }
        // Checkpoint automatique toutes les 3 pièces
        if (sinceCp >= 3) {
            addCheckpoint();
            sinceCp = 0;
        }
    }
}

// Reconstruction du circuit personnalisé (appelée par l'éditeur).
function rebuildCustom(ops) {
    if (!Array.isArray(ops)) return { ok: false, error: 'Liste de pièces invalide' };
    if (ops.length > 80) return { ok: false, error: 'Maximum 80 pièces' };
    for (const o of ops) {
        if (!o || !['straight','curve','gap','jump','loop','checkpoint'].includes(o.type)) return {ok:false,error:'Type de pièce invalide'};
        for (const [key,min,max] of [['len',5,100],['radius',15,100],['angle',-180,180],['dy',-5,5]]) {
            if (key in o && (!Number.isFinite(o[key]) || o[key] < min || o[key] > max)) return {ok:false,error:'Valeur hors limites : ' + key};
        }
        if (o.type === 'curve' && (!o.angle || !o.radius)) return {ok:false,error:'Rayon et angle non nuls requis'};
    }
    if (ops.length < 1) return { ok: false, error: 'Circuit vide — ajoute des pièces' };
    if (ops.filter(o => o && o.type === 'loop').length > 1) return { ok: false, error: 'Une seule boucle par circuit' };

    // 1) Détruire l'ancien niveau 4 (meshes + corps physiques)
    const old = LEVEL_DATA[4];
    if (old) {
        if (old.group) {
            scene.remove(old.group);
            disposeLevelGroup(old.group);
        }
        if (old.bodies) {
            for (const b of old.bodies) {
                try { world.removeBody(b); } catch (e) { /* déjà parti */ }
            }
        }
    }
    delete LEVEL_DATA[4];
    delete LOOP_DATA[4];

    // 2) Reconstruire
    try {
        buildLevel(4, LEVEL_OFFSET_X * 3, ops);
    } catch (e) {
        console.error('rebuildCustom:', e);
        return { ok: false, error: 'Erreur de construction : ' + e.message };
    }

    // 3) Si on est sur le niveau 4, resynchroniser
    if (currentLevel === 4) setLevel(4);
    // Les décors déjà présents s'effacent si le nouveau tracé les traverse.
    for (const object of scene.children) {
        if (!object.userData.courseMargin) continue;
        object.userData.hiddenByCourse = LEVEL_DATA[4].line.some(p =>
            Math.hypot(p.x-object.position.x,p.z-object.position.z) < object.userData.courseMargin);
        object.visible = !object.userData.hiddenByCourse;
    }
    return { ok: true };
}

// Libère géométries/matériaux/textures d'un groupe de niveau (sauf assets partagés).
function disposeLevelGroup(group) {
    group.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of mats) {
                if (m.userData && m.userData.shared) continue;
                if (m.map && !(m.map.userData && m.map.userData.shared)) m.map.dispose();
                m.dispose();
            }
        }
    });
}

// Bouteilles de turbo légères placées sur la ligne idéale. La collecte ne crée
// aucun corps physique supplémentaire, pour préserver la fluidité du Jetson.
function createTurboPickups(line, level) {
    const result = [];
    if (!line || line.length < 8) return result;
    const bottleMat = new THREE.MeshPhysicalMaterial({
        color: 0x071525, emissive: 0x0077ff, emissiveIntensity: 1.4,
        metalness: 0.72, roughness: 0.16, clearcoat: 1
    });
    const bandMat = new THREE.MeshBasicMaterial({ color: 0xff1738 });
    const desired = Math.min(6, Math.max(3, Math.floor(line.length / 8)));
    for (let n = 1; n <= desired; n++) {
        const idx = Math.min(line.length - 3, Math.floor(n * line.length / (desired + 1)));
        const p = line[idx];
        const group = new THREE.Group();
        group.position.set(p.x, p.y + 1.15, p.z);
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .72, 12), bottleMat);
        tank.castShadow = true;
        group.add(tank);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(.1, .14, .16, 10), bandMat);
        cap.position.y = .44;
        group.add(cap);
        const band = new THREE.Mesh(new THREE.TorusGeometry(.225, .035, 6, 16), bandMat);
        band.rotation.x = Math.PI / 2;
        group.add(band);
        const glow = new THREE.Sprite(shared().boostFlameMat);
        glow.scale.set(1.45, 1.45, 1);
        group.add(glow);
        group.userData.baseY = group.position.y;
        group.userData.phase = n * 1.73 + level;
        group.userData.collected = false;
        lvlAdd(group);
        result.push(group);
    }
    return result;
}

function setLevel(level) {
    currentLevel = level;
    const d = LEVEL_DATA[level];
    trackLine = d.line;
    checkpoints = d.checkpoints;
    finishZone = d.finish;
    turboPickups = d.turboPickups || [];
    respawnPoint = { x: d.spawn.x, y: d.spawn.y, z: d.spawn.z, yaw: d.spawn.yaw };
    loopData = LOOP_DATA[level] || null;
    inLoop = false;
    loopPhi = 0;
    loopCompleted = false;
}

// ---- NIVEAU 1 : classique (montée, saut, grand virage) ----
function level1Layout() {
    addStraight(20, 0);
    addStraight(35, 0);
    addCurve(45, -45, 0);            // virage droit 45°
    addCheckpoint();                 // CP1
    addStraight(25, 1.5);            // montée
    // Saut : rampe, trou, réception
    addStraight(12, 2.5);            // rampe décollage (y 1.5 → 4)
    addGap(12);                      // trou (y constant 4)
    addStraight(12, -2.5);           // réception (y 4 → 1.5)
    addCheckpoint();                 // CP2
    addStraight(20, 0);              // y 1.5
    addCurve(60, 90, 0);             // grand virage gauche 90°
    addCheckpoint();                 // CP3
    addStraight(20, -1.5);           // descente (y 1.5 → 0)
    addStraight(30, 0);
    addCurve(45, -45, 0);            // virage droit 45° → cap final
    addStraight(28, 0);
}

// ---- NIVEAU 3 : la boucle (saut + looping vertical + chicane) ----
function level3Layout() {
    addStraight(20, 0);
    addStraight(30, 0);
    addCurve(40, -45, 0);            // ouverture
    addCheckpoint();                 // CP1
    addStraight(22, 1.5);            // montée douce vers la boucle (y 1.5)
    addLoop(11);                     // 🔁 BOUCLE VERTICALE (visuel + cinématique)
    addCheckpoint();                 // CP2 (à la sortie de la boucle)
    addStraight(20, -1.5);           // descente (y 1.5 → 0)
    addCurve(50, 90, 0);             // grand virage
    addCheckpoint();                 // CP3
    addStraight(18, 0);
    addStraight(12, 2.5);            // saut
    addGap(12);
    addStraight(12, -2.5);
    addCurve(40, -45, 0);            // dernier virage
    addStraight(26, 0);
}

// ---- Géométrie de la boucle (cercle vertical tangent au sol) ----
function loopPoint(entry, fwd, R, phi) {
    return {
        x: entry.x + fwd.x * R * Math.sin(phi),
        y: entry.y + R * (1 - Math.cos(phi)),
        z: entry.z + fwd.z * R * Math.sin(phi)
    };
}
// normale de la surface (vers l'intérieur de la boucle, là où est la voiture)
function loopNormal(fwd, phi) {
    return { x: -fwd.x * Math.sin(phi), y: Math.cos(phi), z: -fwd.z * Math.sin(phi) };
}
// tangente (sens de la conduite)
function loopTangent(fwd, phi) {
    return { x: fwd.x * Math.cos(phi), y: Math.sin(phi), z: fwd.z * Math.cos(phi) };
}

// Construit la boucle : segments routiers VISUELS uniquement (la conduite
// dans la boucle est cinématique) + deux anneaux latéraux type montagne russe.
function addLoop(radius) {
    const entry = { x: trackPath.x, y: trackPath.y, z: trackPath.z };
    const fwd = { x: Math.sin(trackPath.yaw), z: Math.cos(trackPath.yaw) };
    const segs = 24;
    const s = shared();

    for (let i = 0; i < segs; i++) {
        const phi1 = (i / segs) * Math.PI * 2;
        const phi2 = ((i + 1) / segs) * Math.PI * 2;
        const phiMid = (phi1 + phi2) / 2;
        const p1 = loopPoint(entry, fwd, radius, phi1);
        const p2 = loopPoint(entry, fwd, radius, phi2);
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, z: (p1.z + p2.z) / 2 };
        const chord = Math.sqrt(
            (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2
        );

        const group = new THREE.Group();
        const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), trackPath.yaw);
        const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -phiMid);
        group.quaternion.copy(qYaw).multiply(qPitch);
        group.position.set(mid.x, mid.y, mid.z);

        const roadTex = s.roadTex.clone();
        roadTex.needsUpdate = true;
        roadTex.repeat.set(1, Math.max(1, Math.round(chord / 8)));
        const road = new THREE.Mesh(
            new THREE.BoxGeometry(CONFIG.trackWidth, CONFIG.trackHeight, chord + 0.25),
            new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9, metalness: 0.1 })
        );
        group.add(road);
        // rambardes visuelles (pas de physique dans la boucle)
        const railGeo = new THREE.BoxGeometry(0.12, 0.5, chord + 0.25);
        const railMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0x660000 });
        for (const side of [1, -1]) {
            const rail = new THREE.Mesh(railGeo, railMat);
            rail.position.set(side * (CONFIG.trackWidth / 2 + 0.25), CONFIG.trackHeight / 2 + 0.35, 0);
            group.add(rail);
        }
        lvlAdd(group);

        // waypoints pour la poursuite autodrive / anti-perte
        if (i % 2 === 0) {
            const n = loopNormal(fwd, phiMid);
            const p = loopPoint(entry, fwd, radius, phiMid);
            trackLine.push({ x: p.x + n.x * 0.9, y: p.y + n.y * 0.9, z: p.z + n.z * 0.9 });
        }
    }

    // Anneaux latéraux (structure montagne russe)
    const qYawOnly = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), trackPath.yaw);
    const torusGeo = new THREE.TorusGeometry(radius, 0.22, 6, 40);
    const torusMat = new THREE.MeshStandardMaterial({ color: 0x2c2c3a, emissive: 0x991111, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.6 });
    for (const side of [1, -1]) {
        const holder = new THREE.Group();
        holder.quaternion.copy(qYawOnly);
        holder.position.set(entry.x, entry.y, entry.z);
        const torus = new THREE.Mesh(torusGeo, torusMat);
        torus.rotation.y = Math.PI / 2;      // cercle dans le plan (fwd, up)
        torus.position.set(side * (CONFIG.trackWidth / 2 - 0.1), radius, 0);
        holder.add(torus);
        lvlAdd(holder);
    }

    LOOP_DATA[buildingLevel] = { entry: entry, fwd: fwd, R: radius };
}

// ---- NIVEAU 2 : nuit rapide (double saut, chicane, virages serrés) ----
function level2Layout() {
    addStraight(20, 0);
    addStraight(30, 0);
    addCurve(40, -45, 0);            // ouverture
    addCheckpoint();                 // CP1
    addStraight(20, 1.5);            // montée (y 1.5)
    addStraight(14, 3);              // rampe (y → 4.5)
    addGap(14);                      // trou
    addStraight(14, -3);             // réception (y → 1.5)
    addStraight(16, 0.5);            // y 2
    addCheckpoint();                 // CP2
    addCurve(50, 90, 0);             // grand virage nocturne (y 2)
    addStraight(18, -2);             // descente (y 2 → 0)
    addCurve(35, 45, 0);             // chicane gauche
    addCurve(35, -45, 0);            // chicane droite
    addCheckpoint();                 // CP3
    addStraight(24, 0);
    addStraight(10, 2.5);            // petit saut
    addGap(10);
    addStraight(10, -2.5);
    addCheckpoint();                 // CP4
    addCurve(40, -45, 0);            // dernier virage
    addStraight(26, 0);
}

function addStraight(len, dy) {
    const f = trackForward();
    // waypoints de la ligne de centre tous les ~8 m
    const n = Math.max(1, Math.round(len / 8));
    for (let i = 1; i <= n; i++) {
        trackLine.push({
            x: trackPath.x + f.x * len * i / n,
            y: trackPath.y + dy * i / n,
            z: trackPath.z + f.z * len * i / n
        });
    }
    const cx = trackPath.x + f.x * len / 2;
    const cz = trackPath.z + f.z * len / 2;
    const cy = trackPath.y + dy / 2;
    buildRoadPiece(cx, cy, cz, trackPath.yaw, len, dy);

    trackPath.x += f.x * len;
    trackPath.z += f.z * len;
    trackPath.y += dy;
}

function addGap(len) {
    const f = trackForward();
    trackPath.x += f.x * len;
    trackPath.z += f.z * len;
}

function addCurve(radius, angleDeg, dyTotal) {
    const totalRad = angleDeg * Math.PI / 180;
    const steps = Math.max(4, Math.ceil(Math.abs(angleDeg) / 6));
    const stepAngle = totalRad / steps;
    const stepLen = Math.abs(radius * stepAngle);
    const dyStep = dyTotal / steps;

    for (let i = 0; i < steps; i++) {
        const f = trackForward();
        const cx = trackPath.x + f.x * stepLen / 2;
        const cz = trackPath.z + f.z * stepLen / 2;
        const cy = trackPath.y + dyStep / 2;
        buildRoadPiece(cx, cy, cz, trackPath.yaw, stepLen + 0.3, dyStep); // léger recouvrement

        trackPath.x += f.x * stepLen;
        trackPath.z += f.z * stepLen;
        trackPath.y += dyStep;
        trackPath.yaw += stepAngle;
        trackLine.push({ x: trackPath.x, y: trackPath.y, z: trackPath.z });
    }
}

function buildRoadPiece(cx, cy, cz, yaw, len, dy) {
    const pitch = Math.atan2(dy, len);           // pente le long de la section
    const segLen = Math.sqrt(len * len + dy * dy);

    // --- Visuel ---
    const group = new THREE.Group();

    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch);
    group.quaternion.copy(qYaw).multiply(qPitch);
    group.position.set(cx, cy, cz);

    // Route (asphalte texturé, bords rouges)
    const s = shared();
    const roadTex = s.roadTex.clone();
    roadTex.needsUpdate = true;
    roadTex.repeat.set(1, Math.max(1, Math.round(segLen / 8)));
    const road = new THREE.Mesh(
        new THREE.BoxGeometry(CONFIG.trackWidth, CONFIG.trackHeight, segLen),
        new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9, metalness: 0.1 })
    );
    road.receiveShadow = true;
    road.castShadow = true;
    group.add(road);

    // Bandes néon lumineuses au sol le long des bords (alternance rouge/cyan)
    const neonMat = (buildingLevel % 2 === 0) ? s.neonCyan : s.neonRed;
    const neonGeo = new THREE.BoxGeometry(0.14, 0.06, segLen);
    for (const side of [1, -1]) {
        const strip = new THREE.Mesh(neonGeo, neonMat);
        strip.position.set(side * (CONFIG.trackWidth / 2 - 0.12), CONFIG.trackHeight / 2 + 0.02, 0);
        group.add(strip);
    }

    // Lampadaire tous les ~2 segments (alternance des côtés)
    if (segLen >= 10) {
        poleCounter++;
        if (poleCounter % 2 === 0) {
            const side = (poleCounter % 4 === 0) ? 1 : -1;
            const px = side * (CONFIG.trackWidth / 2 + 1.3);
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.8, 6), s.poleMat);
            pole.position.set(px, CONFIG.trackHeight / 2 + 2.4, 0);
            group.add(pole);
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), s.lampMat);
            lamp.position.set(px, CONFIG.trackHeight / 2 + 4.85, 0);
            group.add(lamp);
            const glow = new THREE.Sprite(s.lampGlow);
            glow.scale.set(3.4, 3.4, 1);
            glow.position.copy(lamp.position);
            group.add(glow);
        }
    }

    // Ligne centrale pointillée
    const dashGeo = new THREE.BoxGeometry(0.3, 0.04, 2.2);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    const dashCount = Math.floor(segLen / 6);
    for (let i = 0; i < dashCount; i++) {
        const dash = new THREE.Mesh(dashGeo, dashMat);
        dash.position.set(0, CONFIG.trackHeight / 2 + 0.01, -segLen / 2 + 3 + i * 6);
        group.add(dash);
    }

    // Barrières rouges lumineuses
    const barrierGeo = new THREE.BoxGeometry(0.15, 0.6, segLen);
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0x550000 });
    const barrierL = new THREE.Mesh(barrierGeo, barrierMat);
    barrierL.position.set(CONFIG.trackWidth / 2 + 0.4, CONFIG.trackHeight / 2 + 0.45, 0);
    group.add(barrierL);
    const barrierR = new THREE.Mesh(barrierGeo, barrierMat);
    barrierR.position.set(-CONFIG.trackWidth / 2 - 0.4, CONFIG.trackHeight / 2 + 0.45, 0);
    group.add(barrierR);

    lvlAdd(group);

    // --- Physique ---
    const qy = new CANNON.Quaternion();
    qy.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
    const qp = new CANNON.Quaternion();
    qp.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -pitch);
    const qt = qy.mult(qp);

    // Dalle de route
    const roadBody = new CANNON.Body({ mass: 0 });
    roadBody.addShape(new CANNON.Box(new CANNON.Vec3(CONFIG.trackWidth / 2, CONFIG.trackHeight / 2, segLen / 2)));
    roadBody.position.set(cx, cy, cz);
    roadBody.quaternion.copy(qt);
    lvlAddBody(roadBody);

    // Mur lisse par côté : face interne juste hors de la route, hauteur
    // inatteignable — le châssis ne peut jamais l'escalader (contrairement
    // aux petites barrières dont le bord supérieur accrochait la caisse).
    const wallHalf = new CANNON.Vec3(0.25, 2.2, segLen / 2);
    for (const side of [1, -1]) {
        const local = new CANNON.Vec3(side * (CONFIG.trackWidth / 2 + 0.35), CONFIG.trackHeight / 2 + 2.2, 0);
        const worldOff = new CANNON.Vec3();
        qt.vmult(local, worldOff);
        const wallBody = new CANNON.Body({ mass: 0 });
        wallBody.addShape(new CANNON.Box(wallHalf));
        wallBody.position.set(cx + worldOff.x, cy + worldOff.y, cz + worldOff.z);
        wallBody.quaternion.copy(qt);
        lvlAddBody(wallBody);
    }

    // Supports visuels si la section est en l'air
    if (cy > 1) {
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a3a4a });
        const count = Math.max(2, Math.floor(segLen / 10));
        const f = { x: Math.sin(yaw), z: Math.cos(yaw) };
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            const px = cx - f.x * segLen * (t - 0.5);
            const pz = cz - f.z * segLen * (t - 0.5);
            const py = cy - dy * (t - 0.5);
            const h = py + 2;
            if (h < 1) continue;
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, h, 0.6), pillarMat);
            pillar.position.set(px + Math.cos(yaw) * (CONFIG.trackWidth / 2 - 0.5), -2 + h / 2, pz - Math.sin(yaw) * (CONFIG.trackWidth / 2 - 0.5));
            pillar.castShadow = true;
            lvlAdd(pillar);
            const pillar2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, h, 0.6), pillarMat);
            pillar2.position.set(px - Math.cos(yaw) * (CONFIG.trackWidth / 2 - 0.5), -2 + h / 2, pz + Math.sin(yaw) * (CONFIG.trackWidth / 2 - 0.5));
            pillar2.castShadow = true;
            lvlAdd(pillar2);
        }
    }
}

function addCheckpoint() {
    const cp = {
        x: trackPath.x,
        y: trackPath.y,
        z: trackPath.z,
        yaw: trackPath.yaw
    };
    checkpoints.push(cp);
    addArch(cp.x, cp.y, cp.z, cp.yaw, 'CHECKPOINT ' + checkpoints.length, '#00e5ff');
}

function addCheckerLine(x, y, z, yaw) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 64);
    const cw = 256 / 8, ch = 64 / 2;
    for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 0) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(c * cw, r * ch, cw, ch);
            }
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    const line = new THREE.Mesh(
        new THREE.PlaneGeometry(CONFIG.trackWidth, 2.5),
        new THREE.MeshBasicMaterial({ map: tex })
    );
    line.rotation.order = 'YXZ';
    line.rotation.y = yaw;
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, y + CONFIG.trackHeight / 2 + 0.03, z);
    lvlAdd(line);
}

function addArch(x, y, z, yaw, text, color) {
    const group = new THREE.Group();
    group.rotation.y = yaw;
    group.position.set(x, y, z);

    const postGeo = new THREE.BoxGeometry(0.4, 5, 0.4);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x222230, emissive: 0x111118 });
    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.set(CONFIG.trackWidth / 2 + 0.8, 2.5, 0);
    group.add(postL);
    const postR = new THREE.Mesh(postGeo, postMat);
    postR.position.set(-CONFIG.trackWidth / 2 - 0.8, 2.5, 0);
    group.add(postR);

    // Panneau texte
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, 0, 512, 96);
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 22;
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 50);
    const tex = new THREE.CanvasTexture(canvas);

    const bannerMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.trackWidth + 1.6, 1.5), bannerMat);
    banner.position.set(0, 4.4, 0);
    group.add(banner);
    const bannerBack = banner.clone();
    bannerBack.rotation.y = Math.PI;
    bannerBack.position.z = -0.01;
    group.add(bannerBack);

    const topGeo = new THREE.BoxGeometry(CONFIG.trackWidth + 1.6, 0.25, 0.25);
    const topMat = new THREE.MeshStandardMaterial({ color: 0x333344, emissive: 0x1a1a24 });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.set(0, 5.15, 0);
    group.add(top);

    // Néons latéraux sur les poteaux
    const postNeon = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 4.6, 0.1),
        buildingLevel % 2 === 0 ? shared().neonCyan : shared().neonRed
    );
    postNeon.position.set(CONFIG.trackWidth / 2 + 1.05, 2.5, 0);
    group.add(postNeon);
    const postNeon2 = postNeon.clone();
    postNeon2.position.x = -CONFIG.trackWidth / 2 - 1.05;
    group.add(postNeon2);

    lvlAdd(group);
}

// ============================================
// VOITURE KITT
// ============================================
function createCar() {
    carMesh = new THREE.Group();
    // Sections effilées : nez bas, épaules larges et pavillon fastback.
    function coachwork(sections, material) {
        const vertices = [], indices = [];
        const ringSize = 6;
        sections.forEach(([z,w,b,t]) => {
            const shoulder = b + (t-b)*.58;
            const crown = w*.82;
            vertices.push(-w,b,z, -w,shoulder,z, -crown,t,z, crown,t,z, w,shoulder,z, w,b,z);
        });
        for (let i=0;i<sections.length-1;i++) for(let j=0;j<ringSize;j++) {
            const a=i*ringSize+j,b=i*ringSize+(j+1)%ringSize;
            indices.push(a,b,b+ringSize,a,b+ringSize,a+ringSize);
        }
        for (let i=1;i<ringSize-1;i++) indices.push(0,i+1,i);
        const n=(sections.length-1)*ringSize;
        for (let i=1;i<ringSize-1;i++) indices.push(n,n+i,n+i+1);
        const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
        geo.setIndex(indices); geo.computeVertexNormals();
        const mesh=new THREE.Mesh(geo,material);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
    }

    // Carrosserie
    const paint = new THREE.MeshPhysicalMaterial({color:0x111820,roughness:0.16,metalness:0.8,clearcoat:1,clearcoatRoughness:0.07,envMapIntensity:1.5});
    const body = coachwork([
        [-2.35,.86,-.25,.14],[-2.08,1.02,-.28,.27],[-1.45,1.13,-.28,.35],
        [-.42,1.16,-.27,.39],[.72,1.12,-.27,.35],[1.46,1.03,-.24,.25],
        [2.18,.84,-.17,.09],[2.4,.62,-.1,.025]
    ],paint);
    body.position.y = 0.1;
    body.castShadow = true;
    carMesh.add(body);

    // Cockpit vitré
    const roof = coachwork([
        [-1.68,.72,.36,.43],[-1.28,.82,.38,.66],[-.76,.79,.4,.92],
        [.12,.77,.4,.95],[.68,.81,.39,.69],[1.04,.86,.36,.43]
    ],new THREE.MeshPhysicalMaterial({color:0x081722,roughness:.07,metalness:.6,clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.35}));
    carMesh.add(roof);
    const trim = new THREE.MeshStandardMaterial({color:0x07090d,metalness:.78,roughness:.24});
    function detail(w,h,d,x,y,z,mat=paint) {
        const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;carMesh.add(m);return m;
    }
    detail(.12,.045,1,0,.93,-.25); // arceau central du toit T-top
    detail(1.62,.055,.12,0,.92,-.68);
    detail(1.62,.055,.10,0,.92,.23);
    for(const side of [-1,1]) {
        detail(.25,.13,.32,side*1.12,.52,.48); // rétroviseurs
        detail(.025,.035,.23,side*1.115,.32,-.42,trim);
        detail(.10,.15,3.5,side*1.07,-.13,-.1,trim);
        detail(.45,.015,.49,side*.68,.39,1.35); // caches de phares
        for(let i=0;i<4;i++) detail(.035,.025,.35,side*(.53+i*.08),.435,.75,trim);
    }
    for(let i=0;i<6;i++) {
        const z=-.85-i*.115, y=.91-(Math.abs(z)-.7)*.55;
        detail(1.55,.035,.045,0,y,z,trim); // persiennes arrière
    }
    detail(.46,.17,.025,0,.08,-2.225,new THREE.MeshStandardMaterial({color:0xcbd4db,roughness:.5}));

    // Scanner rouge avant (bandeau K2000)
    const scannerHousing = new THREE.Mesh(
        new THREE.BoxGeometry(1.78, .13, .075),
        new THREE.MeshPhysicalMaterial({color:0x010204,roughness:.15,metalness:.85,clearcoat:1})
    );
    scannerHousing.position.set(0,.25,2.39);
    carMesh.add(scannerHousing);
    scannerMesh = new THREE.Mesh(
        new THREE.BoxGeometry(.32, .075, .045),
        new THREE.MeshBasicMaterial({ color: CONFIG.colors.scanner, transparent:true, opacity:.96 })
    );
    scannerMesh.position.set(0, 0.25, 2.435);
    carMesh.add(scannerMesh);

    scannerLight = new THREE.PointLight(0xff0000, 0.9, 14);
    scannerLight.position.set(0, 0.7, 2.8);
    carMesh.add(scannerLight);

    // Phares avant
    const lightGeo = new THREE.BoxGeometry(0.38, 0.12, 0.08);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6cc });
    const headL = new THREE.Mesh(lightGeo, headMat);
    headL.position.set(-0.72, 0.05, 2.22);
    carMesh.add(headL);
    const headR = new THREE.Mesh(lightGeo, headMat);
    headR.position.set(0.72, 0.05, 2.22);
    carMesh.add(headR);

    // V7 — Vrais faisceaux de phares (spots) : éclairent la piste de nuit
    for (const sx of [-0.72, 0.72]) {
        const spot = new THREE.SpotLight(0xfff2cc, 1.5, 70, 0.42, 0.45, 1.2);
        spot.position.set(sx, 0.1, 2.2);
        const tgt = new THREE.Object3D();
        tgt.position.set(sx * 1.4, -0.6, 30);
        carMesh.add(tgt);
        spot.target = tgt;
        carMesh.add(spot);
    }

    // Feux arrière (s'intensifient au freinage)
    tailLeftMat = new THREE.MeshBasicMaterial({ color: 0x990000 });
    tailRightMat = new THREE.MeshBasicMaterial({ color: 0x990000 });
    const tailL = new THREE.Mesh(lightGeo, tailLeftMat);
    tailL.position.set(-0.72, 0.1, -2.22);
    carMesh.add(tailL);
    const tailR = new THREE.Mesh(lightGeo, tailRightMat);
    tailR.position.set(0.72, 0.1, -2.22);
    carMesh.add(tailR);
    const rearPanel = new THREE.Mesh(new THREE.BoxGeometry(1.84,.25,.055), new THREE.MeshPhysicalMaterial({color:0x030407,roughness:.2,metalness:.75,clearcoat:1}));
    rearPanel.position.set(0,.12,-2.265);
    carMesh.add(rearPanel);
    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.58,.07,.045), new THREE.MeshBasicMaterial({color:0xd6091d}));
    tailBar.position.set(0,.16,-2.3);
    carMesh.add(tailBar);
    const tailGlow = new THREE.PointLight(0xff1028, .7, 7);
    tailGlow.position.set(0,.18,-2.45);
    carMesh.add(tailGlow);
    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = 192; plateCanvas.height = 56;
    const plateCtx = plateCanvas.getContext('2d');
    plateCtx.fillStyle = '#080b10'; plateCtx.fillRect(0,0,192,56);
    plateCtx.strokeStyle = '#c92134'; plateCtx.lineWidth = 4; plateCtx.strokeRect(2,2,188,52);
    plateCtx.fillStyle = '#f1e5cf'; plateCtx.font = 'bold 30px monospace';
    plateCtx.textAlign = 'center'; plateCtx.textBaseline = 'middle'; plateCtx.fillText('KITT',96,30);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(.58,.17), new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(plateCanvas)}));
    plate.position.set(0,-.02,-2.335); carMesh.add(plate);
    const exhaustMat = new THREE.MeshStandardMaterial({color:0x242a32,metalness:.9,roughness:.25});
    for (const sx of [-1,1]) {
        const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,.24,8), exhaustMat);
        exhaust.rotation.x = Math.PI/2; exhaust.position.set(sx*.62,-.14,-2.42); carMesh.add(exhaust);
        const flare = new THREE.Mesh(new THREE.BoxGeometry(.16,.12,.68), trim);
        flare.position.set(sx*1.1,.1,-1.45); carMesh.add(flare);
    }

    // Aileron
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.5 });
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.07, 0.42), wingMat);
    wing.position.set(0, 0.72, -2.0);
    carMesh.add(wing);
    const wingPostGeo = new THREE.BoxGeometry(0.08, 0.26, 0.24);
    const wingPostL = new THREE.Mesh(wingPostGeo, wingMat);
    wingPostL.position.set(-0.7, 0.5, -2.0);
    carMesh.add(wingPostL);
    const wingPostR = new THREE.Mesh(wingPostGeo, wingMat);
    wingPostR.position.set(0.7, 0.5, -2.0);
    carMesh.add(wingPostR);

    // Scoop de capot + lèvre avant (silhouette Trans Am)
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.76), wingMat);
    scoop.position.set(0, 0.42, 0.9);
    carMesh.add(scoop);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.3), wingMat);
    lip.position.set(0, -0.14, 2.25);
    carMesh.add(lip);

    // Nez bas et fascia avant inspirés de la Trans Am de KITT.
    const fasciaMat = new THREE.MeshPhysicalMaterial({color:0x0b0e13,roughness:.16,metalness:.82,clearcoat:1,clearcoatRoughness:.1});
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(1.94,.24,.18), fasciaMat);
    fascia.position.set(0,.02,2.27); fascia.rotation.x = -.08; carMesh.add(fascia);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.28,.12,.035), new THREE.MeshBasicMaterial({color:0x020305}));
    grille.position.set(0,.1,2.375); carMesh.add(grille);
    const noseTrim = new THREE.Mesh(new THREE.BoxGeometry(1.72,.025,.035), new THREE.MeshBasicMaterial({color:0x8d0715}));
    noseTrim.position.set(0,-.105,2.4); carMesh.add(noseTrim);
    const sideIntakeMat = new THREE.MeshPhysicalMaterial({color:0x020305,roughness:.22,metalness:.72,clearcoat:.7});
    for (const sx of [-1, 1]) {
        const intake = new THREE.Mesh(new THREE.BoxGeometry(.38,.16,.52), sideIntakeMat);
        intake.position.set(sx*1.075,.08,.92);
        intake.rotation.y = sx*.12;
        carMesh.add(intake);
        const sideBadge = new THREE.Mesh(new THREE.BoxGeometry(.025,.035,.68), new THREE.MeshBasicMaterial({color:0x670511}));
        sideBadge.position.set(sx*1.285,.16,.1);
        carMesh.add(sideBadge);
    }
    // Petit emblème lumineux, sans texture externe ni coût de chargement.
    const badge = new THREE.Mesh(new THREE.CircleGeometry(.12,16), new THREE.MeshBasicMaterial({color:0xc51b2f}));
    badge.rotation.x = -Math.PI/2; badge.position.set(0,.34,1.5); carMesh.add(badge);

    // Liseré rouge KITT le long des flancs
    const stripeGeo = new THREE.BoxGeometry(0.03, 0.07, 4.2);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xcc1111 });
    const stripeL = new THREE.Mesh(stripeGeo, stripeMat);
    stripeL.position.set(-1.12, 0.12, 0);
    carMesh.add(stripeL);
    const stripeR = new THREE.Mesh(stripeGeo, stripeMat);
    stripeR.position.set(1.12, 0.12, 0);
    carMesh.add(stripeR);

    // Lueur rouge sous la caisse (underglow K2000)
    const s = shared();
    const underglow = new THREE.Sprite(s.glowRed);
    underglow.scale.set(5.2, 3.2, 1);
    underglow.position.set(0, -0.55, 0);
    carMesh.add(underglow);
    const underLight = new THREE.PointLight(0xff2222, 0.55, 7);
    underLight.position.set(0, -0.3, 0);
    carMesh.add(underLight);

    // Deux grandes flammes, exactement dans l'axe des pots d'échappement.
    turboFlames = [];
    for (const sx of [-1, 1]) {
        const flame = new THREE.Sprite(s.flameMat);
        flame.scale.set(1.25, 2.8, 1);
        flame.position.set(sx * .62, -.14, -3.05);
        flame.visible = false;
        carMesh.add(flame);
        turboFlames.push(flame);
    }
    turboFlame = turboFlames[0];
    createSpmTransformParts(paint, trim);

    carMesh.userData.driverParts = { body, roof, paint, trim, variantGroup: null };

    scene.add(carMesh);

    // --- Physique ---
    carBody = new CANNON.Body({
        mass: CONFIG.carMass,
        shape: new CANNON.Box(new CANNON.Vec3(1.1, 0.4, 2.2))
    });
    carBody.position.set(respawnPoint.x, respawnPoint.y, respawnPoint.z);
    carBody.linearDamping = 0.01;
    carBody.angularDamping = 0.5;
    carBody.allowSleep = false;
    world.addBody(carBody);

    vehicle = new CANNON.RaycastVehicle({
        chassisBody: carBody,
        indexRightAxis: 0,
        indexUpAxis: 1,
        indexForwardAxis: 2
    });

    const wheelOptions = {
        radius: 0.5,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: 35,
        suspensionRestLength: 0.3,
        frictionSlip: 5,
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,
        maxSuspensionForce: 100000,
        rollInfluence: 0.01,
        axleLocal: new CANNON.Vec3(1, 0, 0),   // ⚠ essieu latéral — obligatoire en y-up
        chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
        maxSuspensionTravel: 0.3,
        customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true
    };

    wheelMeshes = [];
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 18);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x090a0c, roughness: 0.72 });
    const hubGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.37, 12);
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x15181d, emissive: 0x030305, roughness: 0.28, metalness: 0.84 });

    const wheelPositions = [
        [-1.0, 0, 1.3],   // 0 avant gauche
        [1.0, 0, 1.3],    // 1 avant droite
        [-1.0, 0, -1.3],  // 2 arrière gauche
        [1.0, 0, -1.3]    // 3 arrière droite
    ];
    for (const pos of wheelPositions) {
        wheelOptions.chassisConnectionPointLocal.set(pos[0], pos[1], pos[2]);
        vehicle.addWheel(wheelOptions);

        const wGroup = new THREE.Group();
        const tire = new THREE.Mesh(wheelGeo, wheelMat);
        const hub = new THREE.Mesh(hubGeo, hubMat);
        wGroup.add(tire);
        wGroup.add(hub);
        for (const side of [-1,1]) {
            const rim = new THREE.Mesh(new THREE.TorusGeometry(.32,.035,6,24),hubMat);
            rim.rotation.x = Math.PI/2; rim.position.y=side*.19; wGroup.add(rim);
            for(let i=0;i<5;i++) {
                const spoke=new THREE.Mesh(new THREE.BoxGeometry(.055,.025,.48),hubMat);
                spoke.position.y=side*.2;spoke.rotation.y=i*Math.PI/5;wGroup.add(spoke);
            }
        }
        scene.add(wGroup);
        wheelMeshes.push(wGroup);
    }

    vehicle.addToWorld(world);
}

function disposeDriverVariant() {
    const parts = carMesh && carMesh.userData.driverParts;
    if (!parts || !parts.variantGroup) return;
    parts.variantGroup.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && !o.material.userData?.shared) o.material.dispose();
    });
    carMesh.remove(parts.variantGroup);
    parts.variantGroup = null;
}

function applyDriverVehicle(driverId) {
    if (!carMesh || !carMesh.userData.driverParts) return;
    const profile = getDriver(driverId);
    const parts = carMesh.userData.driverParts;
    disposeDriverVariant();
    parts.body.visible = true;
    parts.roof.visible = true;
    parts.paint.color.setHex(0x111820);
    parts.roof.material.color.setHex(0x081722);
    scannerMesh.material.color.setHex(CONFIG.colors.scanner);
    scannerLight.color.setHex(0xff0000);

    const variant = new THREE.Group();
    variant.name = 'DRIVER_VARIANT_' + profile.id;
    const basic = color => new THREE.MeshPhysicalMaterial({ color, roughness:.18, metalness:.78, clearcoat:1, clearcoatRoughness:.08 });
    const add = (geo, mat, pos, rot) => {
        const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (rot) m.rotation.set(...rot); m.castShadow = true; variant.add(m); return m;
    };

    switch (profile.carClass) {
        case 'karr-cedric':
            parts.paint.color.setHex(0x11151b);
            parts.roof.material.color.setHex(0x070b12);
            scannerMesh.material.color.setHex(0xffb000); scannerLight.color.setHex(0xffa000);
            add(new THREE.BoxGeometry(1.95,.18,3.55), basic(0x4b535e), [0,-.02,-.18]);
            add(new THREE.BoxGeometry(1.9,.055,.08), new THREE.MeshBasicMaterial({color:0xff9d00}), [0,.2,2.31]);
            break;
        case 'karr-black':
            parts.paint.color.setHex(0x050608);
            parts.roof.material.color.setHex(0x030509);
            scannerMesh.material.color.setHex(0xffb000); scannerLight.color.setHex(0xffa000);
            add(new THREE.BoxGeometry(1.95,.055,3.55), basic(0x050608), [0,-.02,-.18]);
            break;
        case 'kr95':
            // Coque ovoïde rouge : silhouette volontairement différente des
            // carrosseries KITT/KARR anguleuses.
            parts.body.visible = false; parts.roof.visible = false;
            add(new THREE.SphereGeometry(1,24,12), basic(0x9d1721), [0,.5,0]).scale.set(1.18,.48,2.3);
            add(new THREE.SphereGeometry(1,20,10), basic(0x171c27), [0,.86,-.15]).scale.set(.78,.34,.98);
            add(new THREE.BoxGeometry(1.7,.08,.18), new THREE.MeshBasicMaterial({color:0xffb321}), [0,.43,2.15]);
            add(new THREE.BoxGeometry(1.9,.09,.32), basic(0x4d070e), [0,.15,2.05]);
            scannerMesh.material.color.setHex(0xffc229); scannerLight.color.setHex(0xff9d00);
            break;
        case 'k4000':
            parts.paint.color.setHex(0x394452);
            parts.roof.material.color.setHex(0x0b1725);
            scannerMesh.material.color.setHex(0x00cfff); scannerLight.color.setHex(0x00aaff);
            add(new THREE.BoxGeometry(1.9,.06,3.4), new THREE.MeshBasicMaterial({color:0x7d8794}), [0,-.06,.05]);
            break;
        case 'convertible':
            parts.paint.color.setHex(0xb51b24);
            parts.roof.visible = false;
            add(new THREE.BoxGeometry(1.65,.08,.12), basic(0xc9cbd0), [0,.93,.36], [0,0,0]);
            add(new THREE.BoxGeometry(.62,.16,.62), basic(0x17191e), [-.43,.72,-.25]);
            add(new THREE.BoxGeometry(.62,.16,.62), basic(0x17191e), [.43,.72,-.25]);
            scannerMesh.material.color.setHex(0xff283f);
            break;
        case 'pontiac-grey':
            parts.paint.color.setHex(0x858d98);
            parts.roof.material.color.setHex(0x1a2632);
            scannerMesh.material.color.setHex(0xff364c); scannerLight.color.setHex(0xff1830);
            add(new THREE.BoxGeometry(1.95,.06,3.5), new THREE.MeshBasicMaterial({color:0xb9c0c8}), [0,-.04,-.1]);
            break;
        case 'kitt':
            // KITT classique : base noire actuelle, scanner rouge conservé.
            parts.paint.color.setHex(0x0c1017);
            parts.roof.material.color.setHex(0x081722);
            break;
        case 'manix':
        default:
            // La configuration historique de Manix reste strictement celle
            // utilisée avant l'écran de sélection.
            break;
    }
    parts.variantGroup = variant;
    carMesh.add(variant);
    carMesh.userData.driverId = profile.id;
}

// ============================================
// KARR — adversaire IA léger et combat embarqué
// ============================================
function createKarr() {
    karrMesh = new THREE.Group();
    karrMesh.name = 'KARR_AI';

    const bodyMat = new THREE.MeshPhysicalMaterial({
        color: 0x161b24, roughness: .2, metalness: .86,
        clearcoat: 1, clearcoatRoughness: .08, emissive: 0x080b12
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x070d18, roughness: .08, metalness: .72,
        clearcoat: 1, clearcoatRoughness: .05
    });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x05070b, metalness: .85, roughness: .22 });
    const amberMat = new THREE.MeshBasicMaterial({ color: 0xffb000 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.15, .62, 4.25), bodyMat);
    body.position.y = .37; body.castShadow = true; karrMesh.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.52, .5, 1.65), glassMat);
    roof.position.set(0, .88, -.18); roof.rotation.x = -.04; roof.castShadow = true; karrMesh.add(roof);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.82, .09, 1.05), bodyMat);
    hood.position.set(0, .71, 1.28); karrMesh.add(hood);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(2.04, .22, .16), trimMat);
    nose.position.set(0, .16, 2.15); karrMesh.add(nose);
    const scannerHousing = new THREE.Mesh(new THREE.BoxGeometry(1.72, .13, .08), trimMat);
    scannerHousing.position.set(0, .38, 2.23); karrMesh.add(scannerHousing);
    const scanner = new THREE.Mesh(new THREE.BoxGeometry(.34, .075, .05), amberMat);
    scanner.position.set(0, .38, 2.28); karrMesh.add(scanner);
    karrMesh.userData.scanner = scanner;
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.36, .12, .035), new THREE.MeshBasicMaterial({ color: 0x000105 }));
    grille.position.set(0, .25, 2.24); karrMesh.add(grille);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xcbe7ff });
    for (const sx of [-.72, .72]) {
        const light = new THREE.Mesh(new THREE.BoxGeometry(.38, .1, .07), lightMat);
        light.position.set(sx, .33, 2.18); karrMesh.add(light);
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .34, 14), trimMat);
        wheel.rotation.z = Math.PI / 2; wheel.position.set(sx * 1.02, .26, .95); karrMesh.add(wheel);
        const rearWheel = wheel.clone(); rearWheel.position.z = -1.12; karrMesh.add(rearWheel);
    }
    const redTail = new THREE.Mesh(new THREE.BoxGeometry(1.55, .07, .04), new THREE.MeshBasicMaterial({ color: 0x9d0717 }));
    redTail.position.set(0, .43, -2.16); karrMesh.add(redTail);
    const turret = new THREE.Mesh(new THREE.BoxGeometry(.22, .08, .4), amberMat);
    turret.position.set(0, .75, -1.72); karrMesh.add(turret);
    karrMesh.visible = false;
    scene.add(karrMesh);
}

function setKarrStatus(text, danger = false) {
    if (!karrStatusEl) return;
    karrStatusEl.textContent = text;
    karrStatusEl.classList.toggle('danger', danger);
}

function resetKarr() {
    if (!karrMesh || !trackLine || trackLine.length < 3) return;
    karrActive = true;
    karrHealth = CONFIG.karrHealth;
    karrRespawnTimer = 0;
    karrShootTimer = 1.8;
    playerShootTimer = 0;
    // KARR démarre assez près pour être visible dès le lancement, sans
    // apparaître directement dans la voiture du joueur.
    karrPathIndex = Math.min(Math.max(3, 0), Math.max(0, trackLine.length - 2));
    karrPathT = 0;
    karrMesh.visible = true;
    updateKarrPose();
    setKarrStatus('KARR // IA ACTIVE · 5 IMPACTS', false);
}

function updateKarrPose() {
    if (!karrMesh || !trackLine.length || !karrActive) return;
    const a = trackLine[Math.min(karrPathIndex, trackLine.length - 2)];
    const b = trackLine[Math.min(karrPathIndex + 1, trackLine.length - 1)];
    const x = a.x + (b.x - a.x) * karrPathT;
    const y = a.y + (b.y - a.y) * karrPathT;
    const z = a.z + (b.z - a.z) * karrPathT;
    karrMesh.position.set(x, y + .74, z);
    karrMesh.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    const scanner = karrMesh.userData.scanner;
    if (scanner) scanner.material.color.setHex(Math.sin(clock.elapsedTime * 8) > 0 ? 0xffd34d : 0xff7200);
}

function advanceKarr(distance) {
    while (distance > 0 && karrPathIndex < trackLine.length - 2) {
        const a = trackLine[karrPathIndex];
        const b = trackLine[karrPathIndex + 1];
        const segment = Math.max(.01, Math.hypot(b.x - a.x, b.z - a.z));
        const left = segment * (1 - karrPathT);
        if (distance < left) { karrPathT += distance / segment; distance = 0; }
        else { distance -= left; karrPathIndex++; karrPathT = 0; }
    }
    if (karrPathIndex >= trackLine.length - 2) {
        karrPathIndex = Math.min(10, Math.max(0, trackLine.length - 2));
        karrPathT = 0;
    }
}

function spawnCombatProjectile(owner, origin, direction) {
    const mat = new THREE.MeshBasicMaterial({ color: owner === 'player' ? 0xff2548 : 0xffb000 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 8), mat);
    mesh.position.copy(origin);
    scene.add(mesh);
    projectiles.push({ owner, mesh, direction: direction.clone().normalize(), age: 0 });
}

function firePlayerWeapon() {
    if (state !== 'racing' || !carMesh || playerShootTimer > 0) return;
    const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(carMesh.quaternion).normalize();
    const origin = carMesh.position.clone().addScaledVector(direction, 2.45); origin.y += .32;
    spawnCombatProjectile('player', origin, direction);
    playerShootTimer = CONFIG.playerShootInterval;
    showMessage('TIR KITT — IMPACT ROUGE');
    beep(740, .08);
}

function fireKarrWeapon() {
    if (!karrMesh || !carMesh) return;
    const direction = carMesh.position.clone().sub(karrMesh.position).normalize();
    const origin = karrMesh.position.clone().addScaledVector(direction, 2.2); origin.y += .25;
    spawnCombatProjectile('karr', origin, direction);
    beep(180, .1);
}

function removeProjectile(index) {
    const p = projectiles[index];
    if (!p) return;
    scene.remove(p.mesh);
    if (p.mesh.geometry) p.mesh.geometry.dispose();
    if (p.mesh.material) p.mesh.material.dispose();
    projectiles.splice(index, 1);
}

function hitKarr() {
    if (!karrActive) return;
    karrHealth--;
    damageFlash();
    camShake = Math.max(camShake, .2);
    if (karrHealth <= 0) {
        karrActive = false; karrRespawnTimer = 4.5; karrMesh.visible = false;
        setKarrStatus('KARR // NEUTRALISÉ · RÉINITIALISATION', true);
        showMessage('KARR neutralisé — il revient dans quelques secondes');
    } else {
        setKarrStatus('KARR // IA ACTIVE · ' + karrHealth + ' IMPACT' + (karrHealth > 1 ? 'S' : ''), true);
        showMessage('Impact sur KARR — ' + karrHealth + ' restant' + (karrHealth > 1 ? 's' : ''));
    }
}

function hitPlayerByKarr() {
    damageFlash();
    camShake = Math.max(camShake, .35);
    carBody.velocity.x *= .72; carBody.velocity.z *= .72;
    showMessage('TIR DE KARR — VITESSE RÉDUITE');
}

function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.age += dt;
        p.mesh.position.addScaledVector(p.direction, (p.owner === 'player' ? 62 : CONFIG.karrProjectileSpeed) * dt);
        let remove = p.age > CONFIG.karrProjectileLife;
        if (!remove && p.owner === 'player' && karrActive && p.mesh.position.distanceTo(karrMesh.position) < 2.1) { hitKarr(); remove = true; }
        if (!remove && p.owner === 'karr' && carMesh && p.mesh.position.distanceTo(carMesh.position) < 1.75) { hitPlayerByKarr(); remove = true; }
        if (remove) removeProjectile(i);
    }
}

function clearProjectiles() {
    for (let i = projectiles.length - 1; i >= 0; i--) removeProjectile(i);
}

function updateKarrCombat(dt) {
    if (!karrMesh) return;
    if (state !== 'racing') { karrMesh.visible = false; return; }
    karrMesh.visible = karrActive;
    playerShootTimer = Math.max(0, playerShootTimer - dt);
    if (keys['KeyF']) firePlayerWeapon();
    if (!karrActive) {
        karrRespawnTimer -= dt;
        if (karrRespawnTimer <= 0) resetKarr();
        return;
    }
    advanceKarr(CONFIG.karrSpeed * (spmActive ? 1.16 : 1) * dt);
    updateKarrPose();
    karrShootTimer -= dt;
    const distance = karrMesh.position.distanceTo(carMesh.position);
    // KARR engage à moyenne distance : le tir reste atteignable sans rendre
    // l'adversaire collé à la voiture du joueur.
    if (karrShootTimer <= 0 && distance < 150) {
        fireKarrWeapon();
        karrShootTimer = CONFIG.karrShootInterval + Math.random() * .8;
    }
}

// ============================================
// AUDIO — délégué à js/audio.js (window.KA)
// ============================================
function createSpmTransformParts(paint, trim) {
    spmParts = [];
    const aero = new THREE.MeshPhysicalMaterial({
        color: 0x07090d, metalness: .9, roughness: .12,
        clearcoat: 1, clearcoatRoughness: .06
    });
    const edge = new THREE.MeshBasicMaterial({ color: 0xff1838 });
    function part(geometry, material, closed, opened, closedRot, openedRot) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.position.fromArray(closed);
        mesh.rotation.set.apply(mesh.rotation, closedRot || [0,0,0]);
        carMesh.add(mesh);
        spmParts.push({ mesh, closed, opened, closedRot:closedRot||[0,0,0], openedRot:openedRot||[0,0,0] });
        return mesh;
    }
    // Nez télescopique et canards avant.
    part(new THREE.BoxGeometry(2.28,.08,.62),aero,[0,-.17,2.03],[0,-.2,2.62],[0,0,0],[.08,0,0]);
    part(new THREE.BoxGeometry(2.1,.025,.66),edge,[0,-.205,2.0],[0,-.24,2.7],[0,0,0],[.08,0,0]);
    for (const sx of [-1,1]) {
        part(new THREE.BoxGeometry(.52,.055,.92),aero,[sx*.92,-.12,1.5],[sx*1.28,-.08,1.78],[0,0,0],[0,sx*.18,sx*.05]);
        part(new THREE.BoxGeometry(.16,.18,2.5),aero,[sx*1.04,-.15,-.15],[sx*1.28,-.1,-.12],[0,0,0],[0,0,sx*.08]);
        part(new THREE.BoxGeometry(.035,.055,2.28),edge,[sx*1.1,-.08,-.1],[sx*1.37,-.01,-.1],[0,0,0],[0,0,sx*.08]);
        // Stabilisateur arrière qui se déploie vers l'extérieur.
        part(new THREE.BoxGeometry(.55,.06,.78),aero,[sx*.72,.68,-1.82],[sx*1.18,.92,-2.08],[0,0,0],[-.12,sx*.16,sx*.16]);
    }
    // Double aérofrein dorsal et grand aileron relevable.
    part(new THREE.BoxGeometry(.56,.045,.92),aero,[-.34,.89,-.68],[-.48,1.18,-.82],[0,0,0],[-.48,0,-.12]);
    part(new THREE.BoxGeometry(.56,.045,.92),aero,[.34,.89,-.68],[.48,1.18,-.82],[0,0,0],[-.48,0,.12]);
    part(new THREE.BoxGeometry(2.18,.08,.5),aero,[0,.69,-1.96],[0,1.22,-2.18],[0,0,0],[-.12,0,0]);
    part(new THREE.BoxGeometry(2.02,.025,.54),edge,[0,.735,-1.96],[0,1.27,-2.18],[0,0,0],[-.12,0,0]);
}

function toggleSPM() {
    if (state !== 'racing') return;
    spmActive = !spmActive;
    spmDemoTimer = 2.8;
    document.body.classList.toggle('spm-on', spmActive);
    if (spmIndicatorEl) {
        spmIndicatorEl.classList.remove('hidden','spm-off');
        if (!spmActive) spmIndicatorEl.classList.add('spm-off');
        const a = spmIndicatorEl.querySelector('span');
        const b = spmIndicatorEl.querySelector('b');
        if (a) a.textContent = spmActive ? 'SUPER PURSUIT MODE' : 'PURSUIT MODE NORMAL';
        if (b) b.textContent = spmActive ? 'TRANSFORMATION 3D' : 'RÉTRACTION AÉRODYNAMIQUE';
    }
    camShake = Math.max(camShake, .22);
    showMessage(spmActive ? '◆ SPM ACTIVÉ — CONFIGURATION MAXIMALE' : '◇ SPM DÉSACTIVÉ');
    initAudio();
    [220,330,440,660,880].forEach((f,i)=>setTimeout(()=>beep(f,.11),i*120));
}

function updateSPM(dt) {
    const target = spmActive ? 1 : 0;
    spmProgress += clamp(target-spmProgress,-dt*.72,dt*.72);
    const t = spmProgress*spmProgress*(3-2*spmProgress);
    for (const p of spmParts) {
        p.mesh.position.set(
            p.closed[0]+(p.opened[0]-p.closed[0])*t,
            p.closed[1]+(p.opened[1]-p.closed[1])*t,
            p.closed[2]+(p.opened[2]-p.closed[2])*t);
        p.mesh.rotation.set(
            p.closedRot[0]+(p.openedRot[0]-p.closedRot[0])*t,
            p.closedRot[1]+(p.openedRot[1]-p.closedRot[1])*t,
            p.closedRot[2]+(p.openedRot[2]-p.closedRot[2])*t);
    }
    if (scannerLight) scannerLight.intensity = (spmActive ? 1.65 : .9) + Math.sin(clock.elapsedTime*12)*.18;
    if (spmDemoTimer > 0) {
        spmDemoTimer -= dt;
        if (spmDemoTimer <= 0 && spmIndicatorEl) spmIndicatorEl.classList.add('hidden');
    }
}

function initAudio() {
    if (window.KA) KA.ensure();
}

function beep(freq, dur, type, vol, when) {
    if (window.KA) KA.sfx.beep(freq, dur);
}

function playTurboSound() {
    if (window.KA) KA.sfx.turbo();
}

function playScannerSound() {
    if (window.KA) KA.sfx.scanner();
}

// Coupe le son du véhicule (moteur/vent/dérapage) — appelé à chaque sortie de course
function silenceVehicle() {
    if (window.KA) KA.stopVehicle();
}

function updateEngineSound(kmh, throttle) {
    if (!window.KA) return;
    KA.setEngine(kmh, throttle, state === 'racing' && !paused, turboActive || spmActive);
}

// V7 — musique synthwave (touche P / boutons)
function toggleMusic() {
    if (!window.KA) return;
    KA.ensure();
    const on = KA.toggleMusic();
    updateMusicButtons(on);
    showMessage(on ? '🎵 Musique activée' : '🎵 Musique coupée');
}

function updateMusicButtons(on) {
    const label = '🎵 MUSIQUE : ' + (on ? 'ON' : 'OFF');
    const b1 = document.getElementById('btn-music');
    const b2 = document.getElementById('btn-music-pause');
    if (b1) b1.textContent = label;
    if (b2) b2.textContent = label;
}

// ============================================
// CONTRÔLES & UI
// ============================================
function setupControls() {
    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.matches('input, textarea, select') || e.target.isContentEditable)) return;
        keys[e.code] = true;

        if (e.code === 'Space') e.preventDefault();

        // Musique : partout
        if (e.code === 'KeyP' && !e.repeat) toggleMusic();

        if (state === 'racing') {
            if (e.code === 'Space') activateTurbo();
            if (e.code === 'KeyQ' && !e.repeat) toggleSPM();
            if (e.code === 'KeyF') e.preventDefault(); // tir maintenu, cadence limitée dans updateKarrCombat
            if (e.code === 'KeyX') activateScanner();
            if (e.code === 'KeyR') {
                respawnCar();
                showMessage('Retour au checkpoint');
            }
            if (e.code === 'Escape') pauseGame();
        } else if (state === 'paused') {
            if (e.code === 'Escape') resumeGame();
        } else if (state === 'finished') {
            if (e.code === 'KeyR') startRace();
            if (e.code === 'KeyM') backToMenu();
            if (e.code === 'KeyS' && !e.repeat && window.KS) KS.open();
        } else if (state === 'select') {
            if (e.code === 'Escape') backToMenu();
            if (e.code === 'Enter') beginRace(pendingRaceLevel);
            const digit = /^Digit([1-8])$/.exec(e.code);
            if (digit) selectDriver(DRIVER_PROFILES[Number(digit[1]) - 1].id);
        } else if (state === 'menu') {
            if (window.KS && KS.isOpen()) {
                if (e.code === 'KeyM' || e.code === 'Escape' || e.code === 'Enter') KS.close();
                return;
            }
            if (e.code === 'Enter' || e.code === 'Digit1') startRace(1);
            if (e.code === 'Digit2') startRace(2);
            if (e.code === 'Digit3') startRace(3);
            if (e.code === 'Digit4') startRace(4);
            if (e.code === 'KeyS' && !e.repeat && window.KS) KS.open();
            if (e.code === 'KeyE' && !e.repeat) enterEditor();
        } else if (state === 'editor') {
            if (e.code === 'Escape') backToMenu();
            if (e.code === 'KeyT') {
                const ops = window.KE ? KE.getOps() : null;
                if (ops && ops.length >= 2) {
                    exitEditorVisual();
                    startRace(4);
                } else {
                    showMessage('Ajoute au moins 2 pièces !');
                }
            }
        }
    });
    window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
    });
    setupMobileControls();
}

function setMobileControlsVisible(visible) {
    document.body.classList.toggle('race-mobile-controls', !!visible);
    if (!visible) Object.keys(mobileInput).forEach(k => { mobileInput[k] = false; });
}

function setupMobileControls() {
    const panel = document.getElementById('mobile-race-controls');
    if (!panel || panel.dataset.bound) return;
    panel.dataset.bound = '1';
    panel.querySelectorAll('[data-drive]').forEach(button => {
        const key = button.dataset.drive;
        const release = (event) => {
            event.preventDefault();
            mobileInput[key] = false;
            button.classList.remove('pressed');
        };
        button.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            mobileInput[key] = true;
            button.classList.add('pressed');
            button.setPointerCapture?.(event.pointerId);
        }, { passive:false });
        button.addEventListener('pointerup', release, { passive:false });
        button.addEventListener('pointercancel', release, { passive:false });
        button.addEventListener('lostpointercapture', release, { passive:false });
    });
    const modeButton = document.getElementById('mobile-control-mode');
    if (modeButton) modeButton.addEventListener('click', enableMobileGyro, { passive:false });
    window.addEventListener('deviceorientation', (event) => {
        if (Number.isFinite(event.gamma)) {
            gyroGamma = event.gamma;
            if (!gyroReady) { gyroNeutral = gyroGamma; gyroReady = true; }
        }
    }, { passive:true });
}

async function enableMobileGyro(event) {
    event?.preventDefault?.();
    if (mobileControlMode === 'gyro') { disableMobileGyro(); return; }
    const status = document.getElementById('mobile-control-status');
    try {
        if (typeof DeviceOrientationEvent === 'undefined') throw new Error('unsupported');
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission !== 'granted') throw new Error('denied');
        }
        gyroReady = false;
        mobileControlMode = 'gyro';
        document.body.classList.add('mobile-gyro');
        const modeButton = document.getElementById('mobile-control-mode');
        if (modeButton) { modeButton.textContent = 'GYRO · REVENIR TACTILE'; modeButton.setAttribute('aria-pressed', 'true'); }
        if (status) status.textContent = 'GYROSCOPE ACTIF · INCLINEZ LE TÉLÉPHONE';
    } catch (error) {
        mobileControlMode = 'touch';
        const modeButton = document.getElementById('mobile-control-mode');
        if (modeButton) modeButton.textContent = 'GYRO INDISPONIBLE · TACTILE';
        if (status) status.textContent = 'TACTILE ACTIF · GYRO NON AUTORISÉ';
        showMessage('Gyroscope indisponible : utilisez les commandes tactiles');
    }
}

function disableMobileGyro() {
    mobileControlMode = 'touch';
    document.body.classList.remove('mobile-gyro');
    const modeButton = document.getElementById('mobile-control-mode');
    const status = document.getElementById('mobile-control-status');
    if (modeButton) { modeButton.textContent = 'TACTILE · ACTIVER GYRO'; modeButton.setAttribute('aria-pressed', 'false'); }
    if (status) status.textContent = 'TACTILE ACTIF';
}

function setupUI() {
    document.getElementById('btn-level1').addEventListener('click', () => startRace(1));
    document.getElementById('btn-level2').addEventListener('click', () => startRace(2));
    document.getElementById('btn-level3').addEventListener('click', () => startRace(3));
    const bCustom = document.getElementById('btn-custom');
    if (bCustom) bCustom.addEventListener('click', () => startRace(4));
    const bEditor = document.getElementById('btn-editor');
    if (bEditor) bEditor.addEventListener('click', () => enterEditor());
    const bScores = document.getElementById('btn-scores');
    if (bScores) bScores.addEventListener('click', () => { if (window.KS) KS.open(); });
    const bMusic = document.getElementById('btn-music');
    if (bMusic) bMusic.addEventListener('click', () => toggleMusic());
    const bMusicP = document.getElementById('btn-music-pause');
    if (bMusicP) bMusicP.addEventListener('click', () => toggleMusic());
    const bSpm = document.getElementById('spm-toggle');
    if (bSpm) bSpm.addEventListener('click', toggleSPM);
    const bFire = document.getElementById('fire-toggle');
    if (bFire) bFire.addEventListener('click', firePlayerWeapon);
    document.getElementById('btn-resume').addEventListener('click', resumeGame);
    document.getElementById('btn-quit').addEventListener('click', backToMenu);
    document.getElementById('btn-restart').addEventListener('click', startRace);
    document.getElementById('btn-menu').addEventListener('click', backToMenu);
    updateMusicButtons(window.KA ? KA.musicOn() : false);
}

// ---- V7 — constructeur de circuit ----
function enterEditor() {
    if (!window.KE) { showMessage('Éditeur non chargé'); return; }
    initAudio();
    silenceVehicle();
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    setLevel(4);
    resetCarTo(LEVEL_DATA[4] ? LEVEL_DATA[4].spawn : respawnPoint);
    state = 'editor';
    KE.open();
}

function exitEditorVisual() {
    if (window.KE) KE.close();
}

function backToMenu() {
    if (state === 'editor') exitEditorVisual();
    paused = false;
    state = 'menu';
    setMobileControlsVisible(false);
    silenceVehicle();
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('results-screen').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    if (driverSelectEl) driverSelectEl.classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
    countdownEl.classList.add('hidden');
    karrActive = false;
    if (karrMesh) karrMesh.visible = false;
    clearProjectiles();
    setKarrStatus('KARR // EN ATTENTE', false);
    updateMenuBest();
    resetCarTo(LEVEL_DATA[currentLevel].spawn);
}

// Toute entrée « nouvelle course » passe par la sélection du pilote.
function startRace(level) {
    openDriverSelect(level);
}

function beginRace(level) {
    initAudio();
    if (window.KA) KA.ensure();
    silenceVehicle();               // moteur coupé pendant le compte à rebours

    const requestedLevel = Number(level);
    const nextLevel = Number.isInteger(requestedLevel) && LEVEL_DATA[requestedLevel]
        ? requestedLevel
        : currentLevel;
    setLevel(nextLevel);
    applyDriverVehicle(selectedDriverId);
    renderDriverHud();

    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('results-screen').classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    if (driverSelectEl) driverSelectEl.classList.add('hidden');
    // Les commandes mobiles doivent être visibles dès le lancement, y compris
    // pendant le compte à rebours : l'utilisateur ne doit jamais chercher où jouer.
    setMobileControlsVisible(true);
    const mobileStatus = document.getElementById('mobile-control-status');
    if (mobileStatus && mobileControlMode !== 'gyro') mobileStatus.textContent = 'TACTILE PRÊT';
    const lvlEl = document.getElementById('hud-level');
    if (lvlEl) lvlEl.textContent = currentLevel === 4 ? 'CIRCUIT PERSO' : 'NIVEAU ' + currentLevel;

    nextCp = 0;
    raceTime = 0;
    topSpeedKmh = 0;
    turboActive = false;
    turboTimer = 0;
    turboCooldown = 0;
    spmActive = false;
    spmProgress = 0;
    spmDemoTimer = 0;
    document.body.classList.remove('spm-on');
    if (spmIndicatorEl) spmIndicatorEl.classList.add('hidden');
    clearProjectiles();
    resetKarr();
    scannerTimer = 0;
    flipTimer = 0;
    displayedSpeed = 0;
    stuckTimer = 0;
    stuckCheckTimer = 0;
    stuckNoMoveCount = 0;
    lastStuckX = respawnPoint.x;
    lastStuckZ = respawnPoint.z;
    lastAutoSteer = 0;
    autoWpIdx = 0;
    humanSteer = 0;
    paused = false;
    for (const pickup of turboPickups) {
        pickup.userData.collected = false;
        pickup.visible = true;
    }

    resetCarTo(respawnPoint);

    state = 'countdown';
    countdownT = 3.6;
    countdownLast = -1;
    countdownEl.classList.remove('hidden');
    countdownEl.classList.remove('go');

    // Bloque la voiture pendant le compte à rebours
    for (let i = 0; i < 4; i++) vehicle.setBrake(30, i);
}

function beginRacing() {
    state = 'racing';
    setMobileControlsVisible(true);
    raceStartTime = Date.now();
    for (let i = 0; i < 4; i++) vehicle.setBrake(0, i);
    showMessage('C\'EST PARTI !');
}

function pauseGame() {
    if (state !== 'racing') return;
    paused = true;
    state = 'paused';
    setMobileControlsVisible(false);
    silenceVehicle();
    document.getElementById('pause-menu').classList.remove('hidden');
}

function resumeGame() {
    if (state !== 'paused') return;
    paused = false;
    state = 'racing';
    setMobileControlsVisible(true);
    raceStartTime = Date.now() - raceTime * 1000;
    document.getElementById('pause-menu').classList.add('hidden');
}

function updateMenuBest() {
    const el = document.getElementById('menu-best');
    if (!el) return;
    const parts = [];
    for (const lvl of [1, 2, 3, 4]) {
        const best = parseFloat(localStorage.getItem('kittStuntRacingBest' + lvl));
        parts.push((lvl === 4 ? 'PERSO' : 'N' + lvl) + ' : ' + (best ? formatTime(best) : '--:--.--'));
    }
    el.textContent = '🏆 ' + parts.join('   •   ');
    el.classList.remove('hidden');
}

function finishRace() {
    state = 'finished';
    setMobileControlsVisible(false);
    raceTime = (Date.now() - raceStartTime) / 1000;
    silenceVehicle();               // moteur au ralenti à l'arrivée

    const bestKey = 'kittStuntRacingBest' + currentLevel;
    const prevBest = parseFloat(localStorage.getItem(bestKey));
    let record = false;
    if (!prevBest || raceTime < prevBest) {
        localStorage.setItem(bestKey, String(raceTime));
        record = true;
    }

    // V7 — hall of fame : enregistre le run et récupère le classement
    let rank = null;
    if (window.KS) rank = KS.addRun(currentLevel, raceTime, topSpeedKmh);

    document.getElementById('results-time').textContent = formatTime(raceTime);
    document.getElementById('results-record').textContent = record ? '★ NOUVEAU RECORD ' + (currentLevel === 4 ? 'PERSONNALISÉ' : 'NIVEAU ' + currentLevel) + ' ! ★' : '';
    const best = parseFloat(localStorage.getItem(bestKey));
    document.getElementById('results-best').textContent = formatTime(best);
    document.getElementById('results-speed').textContent = Math.round(topSpeedKmh);

    const rankEl = document.getElementById('results-rank');
    if (rankEl) {
        if (rank === 1 && !record) rankEl.innerHTML = '🥇 <span>MEILLEUR TEMPS LOCAL !</span>';
        else if (rank && rank <= 3) rankEl.innerHTML = ['🥇', '🥈', '🥉'][rank - 1] + ' <span>TOP ' + rank + ' local — voir les scores (S)</span>';
        else if (rank) rankEl.innerHTML = '🏁 <span>Rang local : ' + rank + 'e — voir les scores (S)</span>';
        else rankEl.textContent = '';
    }

    document.getElementById('results-screen').classList.remove('hidden');

    if (window.KA) {
        if (record) KA.sfx.record(); else KA.sfx.fanfare();
    }
    spawnConfetti();
}

function activateTurbo() {
    if (turboActive || turboCooldown > 0 || state !== 'racing') return;
    turboActive = true;
    turboTimer = CONFIG.turboDuration;
    turboCooldown = CONFIG.turboCooldown + CONFIG.turboDuration;
    camShake = Math.max(camShake, 0.25);
    showMessage('⚡ TURBO !');
    playTurboSound();
}

function collectTurboPickup(pickup, forward) {
    pickup.userData.collected = true;
    pickup.visible = false;
    turboActive = true;
    turboTimer = Math.max(turboTimer, CONFIG.pickupTurboDuration);
    turboCooldown = 0;
    carBody.velocity.x += forward.x * CONFIG.pickupImpulse;
    carBody.velocity.z += forward.z * CONFIG.pickupImpulse;
    camShake = Math.max(camShake, .62);
    showMessage('⚡ TURBO RAMASSÉ — PLEINE PUISSANCE !');
    playTurboSound();
    const s = shared();
    for (let i = 0; i < 28; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 5 + Math.random() * 11;
        spawnParticle(i % 3 ? s.sparkTex : s.boostFlameMat,
            pickup.position.x, pickup.position.y, pickup.position.z,
            Math.cos(a) * v, 2 + Math.random() * 8, Math.sin(a) * v,
            .55 + Math.random() * .55, .35 + Math.random() * .5, 1.5);
    }
}

function activateScanner() {
    if (scannerTimer > 0) return;
    scannerTimer = 2.0;
    showMessage('🔍 Analyse de la piste...');
    playScannerSound();
}

function resetCarTo(p) {
    if (!carBody || !carMesh) return;
    carBody.position.set(p.x, p.y + 0.8, p.z);
    carBody.velocity.set(0, 0, 0);
    carBody.angularVelocity.set(0, 0, 0);
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), p.yaw);
    carBody.quaternion.set(q.x, q.y, q.z, q.w);
    carMesh.position.copy(carBody.position);
    carMesh.quaternion.copy(carBody.quaternion);

    if (vehicle) {
        for (let i = 0; i < vehicle.wheelInfos.length; i++) {
            vehicle.applyEngineForce(0, i);
            vehicle.setBrake(0, i);
            vehicle.setSteeringValue(0, i);
        }
    }
}

function respawnCar() {
    resetCarTo(respawnPoint);
    lastStuckX = respawnPoint.x;
    lastStuckZ = respawnPoint.z;
    stuckNoMoveCount = 0;
    stuckCheckTimer = 0;
    // Resynchronise la poursuite autodrive sur le waypoint le plus proche
    let best = 0, bd = Infinity;
    for (let i = 0; i < trackLine.length; i++) {
        const d = (trackLine[i].x - respawnPoint.x) ** 2 + (trackLine[i].z - respawnPoint.z) ** 2;
        if (d < bd) { bd = d; best = i; }
    }
    autoWpIdx = best;
    endOfLineTimer = 0;
}

// ============================================
// V7 — PARTICULES (pool de sprites, aucune allocation en vol)
// ============================================
function initParticles() {
    if (PARTICLES.pool.length) return;
    const s = shared();
    for (let i = 0; i < 160; i++) {
        const spr = new THREE.Sprite(s.dustTex.clone());
        spr.visible = false;
        scene.add(spr);
        PARTICLES.pool.push(spr);
    }
}

// Émet une particule. Chaque sprite conserve son matériau propre : modifier son
// opacité ne décolore donc plus toutes les flammes ou fumées à la fois.
function spawnParticle(mat, x, y, z, vx, vy, vz, life, size, grow, spreadSize) {
    let spr = null;
    for (const p of PARTICLES.pool) {
        if (!p.visible) { spr = p; break; }
    }
    if (!spr) return;
    spr.material.copy(mat);
    spr.material.opacity = mat.opacity;
    spr.position.set(x, y, z);
    spr.scale.set(size, size, 1);
    spr.visible = true;
    PARTICLES.active.push({
        spr, vx, vy, vz,
        life, age: 0, grow: grow || 0, size,
        sx: spreadSize || size
    });
}

function updateParticles(dt) {
    for (let i = PARTICLES.active.length - 1; i >= 0; i--) {
        const p = PARTICLES.active[i];
        p.age += dt;
        if (p.age >= p.life) {
            p.spr.visible = false;
            PARTICLES.active.splice(i, 1);
            continue;
        }
        p.vy -= 2.2 * dt;                    // pesanteur légère
        p.spr.position.x += p.vx * dt;
        p.spr.position.y += p.vy * dt;
        p.spr.position.z += p.vz * dt;
        const k = p.age / p.life;
        const sz = p.size * (1 + p.grow * k);
        p.spr.scale.set(sz, sz, 1);
        p.spr.material.opacity = (1 - k) * 0.85;
    }
}

// Gerbe de confettis aux arrivées
function spawnConfetti() {
    if (!carMesh) return;
    const s = shared();
    const colors = ['#ff0044', '#00e5ff', '#ffcc00', '#7CFC00', '#ff8800', '#cc66ff'];
    for (let i = 0; i < 42; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 4 + Math.random() * 8;
        const mat = new THREE.SpriteMaterial({
            color: colors[i % colors.length],
            transparent: true, opacity: 0.95, depthWrite: false
        });
        spawnParticle(mat,
            carMesh.position.x, carMesh.position.y + 1.5, carMesh.position.z,
            Math.cos(a) * v * 0.6, 5 + Math.random() * 6, Math.sin(a) * v * 0.6,
            1.4 + Math.random() * 0.8, 0.55, 0.4);
    }
}

// ============================================
// BOUCLE PRINCIPALE
// ============================================
function animate() {
    if (forceTickMode) setTimeout(animate, 16);
    else requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1);
    if (!clock.running) clock.start();
    window.__lastDt = dt;                    // télémétrie de test

    if (state === 'countdown') {
        updateCountdown(dt);
    }

    if (world && !paused) {
        try {
            world.step(1 / 60, dt, 3);
        } catch (e) {
            console.error('Physics error:', e);
        }
    }

    if (state === 'racing') {
        updateRace(dt);
    } else if (state === 'menu' || state === 'select') {
        updateMenuCamera(dt);
        syncCarVisual();
    } else if (state === 'countdown') {
        syncCarVisual();
        updateChaseCamera(dt);
    } else if (state === 'finished') {
        syncCarVisual();
        updateChaseCamera(dt);
    } else if (state === 'editor') {
        if (window.KE) KE.updateCamera(dt);
        syncCarVisual();
    }

    // Combat indépendant de la physique : il ne bloque ni le rendu ni le son.
    updateKarrCombat(dt);
    if (state === 'racing') updateProjectiles(dt);

    updateScannerVisual(dt);
    updateSPM(dt);
    updateEnvironment(dt);
    updateParticles(dt);

    // Le soleil (et sa caméra d'ombres) suit la voiture
    if (sunLight && carMesh) {
        sunLight.position.set(carMesh.position.x + 45, carMesh.position.y + 80, carMesh.position.z + 35);
        sunLight.target.position.set(carMesh.position.x, carMesh.position.y, carMesh.position.z);
    }

    if (renderer && scene && camera) {
        for (const object of scene.children) if (object.userData.hideInEditor) object.visible = state !== 'editor' && !object.userData.hiddenByCourse;
        scene.fog.near = state === 'editor' ? 1200 : 60;
        scene.fog.far = state === 'editor' ? 7000 : 380;
        renderer.render(scene, camera);
    }
}

function updateCountdown(dt) {
    countdownT -= dt;
    const n = Math.ceil(countdownT - 0.6);
    if (n !== countdownLast) {
        countdownLast = n;
        if (n >= 1 && n <= 3) {
            countdownEl.textContent = n;
            countdownEl.classList.remove('go');
            if (window.KA) KA.sfx.countBeep();
        } else if (n <= 0) {
            countdownEl.textContent = 'GO !';
            countdownEl.classList.add('go');
            if (window.KA) KA.sfx.countGo();
            setTimeout(() => countdownEl.classList.add('hidden'), 700);
            beginRacing();
        }
    }
}

function updateRace(dt) {
    if (!carBody || !carMesh) return;

    // Sécurité anti-NaN
    if (isNaN(carBody.position.x) || isNaN(carBody.position.y) || isNaN(carBody.position.z)) {
        console.warn('Voiture perdue (NaN), reset');
        respawnCar();
        return;
    }

    syncCarVisual();

    // Vecteurs du véhicule
    const forward = new CANNON.Vec3(0, 0, 1);
    carBody.quaternion.vmult(forward, forward);
    const up = new CANNON.Vec3(0, 1, 0);
    carBody.quaternion.vmult(up, up);
    const speed = carBody.velocity.dot(forward);       // vitesse signée avant/arrière
    const speedAbs = Math.abs(speed);
    const kmh = speedAbs * 3.6;
    topSpeedKmh = Math.max(topSpeedKmh, kmh);

    // ================= BOUCLE (niveau 3) =================
    // Engagement : proche du point d'entrée, cap correct, on roule.
    if (loopData && !inLoop && !loopCompleted) {
        const ldx = carBody.position.x - loopData.entry.x;
        const ldz = carBody.position.z - loopData.entry.z;
        if (ldx * ldx + ldz * ldz < 12 && carBody.position.y < loopData.entry.y + 2.5) {
            const fdot = forward.x * loopData.fwd.x + forward.z * loopData.fwd.z;
            if (fdot > 0.75 && speedAbs > 4) {
                inLoop = true;
                loopPhi = 0;
                loopSpeed = Math.max(speedAbs, 15.5);   // vitesse de boucle garantie
                showMessage('🔁 BOUCLE !');
                playTurboSound();
            }
        }
    }
    if (inLoop && loopData) {
        loopPhi += (loopSpeed / loopData.R) * dt;
        if (loopPhi >= Math.PI * 2 - 0.1) {
            // Sortie : reprise normale, cap et vitesse conservés
            inLoop = false;
            loopCompleted = true;
            const f = loopData.fwd;
            // La sortie est légèrement avancée sur la section suivante. Sans
            // cela, le test d'engagement voyait encore la voiture à l'entrée
            // et la relançait immédiatement dans une boucle infinie.
            carBody.position.set(
                loopData.entry.x + f.x * 1.5,
                loopData.entry.y + 0.95,
                loopData.entry.z + f.z * 1.5
            );
            const q = new CANNON.Quaternion();
            q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.atan2(f.x, f.z));
            carBody.quaternion.set(q.x, q.y, q.z, q.w);
            carBody.velocity.set(f.x * loopSpeed, 0, f.z * loopSpeed);
            carBody.angularVelocity.set(0, 0, 0);
            showMessage('✓ Boucle réussie !');
            if (window.KA) KA.sfx.loopSuccess();
            camShake = Math.max(camShake, 0.5);
        } else {
            // Cinématique : la voiture suit le cercle, l'orientation roule avec
            const p = loopPoint(loopData.entry, loopData.fwd, loopData.R, loopPhi);
            const nrm = loopNormal(loopData.fwd, loopPhi);
            const tan = loopTangent(loopData.fwd, loopPhi);
            carBody.position.set(p.x + nrm.x * 0.93, p.y + nrm.y * 0.93, p.z + nrm.z * 0.93);
            const qYaw = new CANNON.Quaternion();
            qYaw.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.atan2(loopData.fwd.x, loopData.fwd.z));
            const qP = new CANNON.Quaternion();
            qP.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -loopPhi);
            const qt = qYaw.mult(qP);
            carBody.quaternion.set(qt.x, qt.y, qt.z, qt.w);
            carBody.velocity.set(tan.x * loopSpeed, tan.y * loopSpeed, tan.z * loopSpeed);
            carBody.angularVelocity.set(0, 0, 0);
        }
        // HUD + caméra + son pendant la boucle, puis on saute les contrôles normaux
        raceTime = (Date.now() - raceStartTime) / 1000;
        timerEl.textContent = formatTime(raceTime);
        speedEl.textContent = Math.round(loopSpeed * 3.6);
        updateChaseCamera(dt);
        updateEngineSound(loopSpeed * 3.6, 1);
        return;
    }
    // ================= fin BOUCLE =================

    // --- Entrées ---
    let throttle = 0;
    let braking = false;
    let hardBrake = false;
    let steer = 0;

    if (autodrive) {
        // Poursuite pure sur la ligne de centre : waypoint le plus proche
        // (index monotone) + point de visée ~15 m plus loin
        const px = carBody.position.x, pz = carBody.position.z;
        let best = autoWpIdx;
        let bestD = Infinity;
        const lo = Math.max(0, autoWpIdx - 2);
        const hi = Math.min(trackLine.length, autoWpIdx + 8);
        for (let i = lo; i < hi; i++) {
            const d = (trackLine[i].x - px) * (trackLine[i].x - px) + (trackLine[i].z - pz) * (trackLine[i].z - pz);
            if (d < bestD) { bestD = d; best = i; }
        }
        autoWpIdx = best;
        // Perdu : trop loin de la ligne de centre → retour au checkpoint
        if (bestD > 625) {
            respawnCar();
            showMessage('Hors piste — retour au checkpoint');
            return;
        }
        // Fin de ligne atteinte sans franchir l'arrivée → on retente depuis le checkpoint
        if (best >= trackLine.length - 1) {
            endOfLineTimer += dt;
            if (endOfLineTimer > 5) {
                endOfLineTimer = 0;
                respawnCar();
                showMessage('Objectif manqué — nouvelle tentative');
                return;
            }
        } else {
            endOfLineTimer = 0;
        }
        const lookIdx = Math.min(best + 3, trackLine.length - 1);
        const nearEnd = best >= trackLine.length - 4;
        const wp = nearEnd ? finishZone : trackLine[lookIdx];
        const dx = wp.x - px;
        const dz = wp.z - pz;
        const desiredYaw = Math.atan2(dx, dz);
        const heading = Math.atan2(forward.x, forward.z);
        const err = wrapAngle(desiredYaw - heading);
        // Correcteur P lissé : gain modéré + rampe de braquage (évite les oscillations)
        const rawSteer = clamp(err * 1.2, -0.45, 0.45);
        const maxDelta = 1.6 * dt;
        steer = lastAutoSteer + clamp(rawSteer - lastAutoSteer, -maxDelta, maxDelta);
        lastAutoSteer = steer;
        window.__kittAdbg = {
            err: +err.toFixed(2),
            steer: +steer.toFixed(2),
            hardBrake: false,
            throttle: 0,
            wp: lookIdx
        };
        // Freine si le virage est serré (seulement si on roule assez vite),
        // sinon accélère doucement pour se réaligner
        const errAbs = Math.abs(err);
        if ((errAbs > 1.0 && kmh > 30) || (errAbs > 0.55 && kmh > 100)) {
            hardBrake = true;
        } else if (errAbs > 0.8) {
            throttle = 0.4;
        } else if (errAbs > 0.4) {
            throttle = 0.75;
        } else {
            throttle = 1;
        }
        window.__kittAdbg.hardBrake = hardBrake;
        window.__kittAdbg.throttle = throttle;
    } else {
        const mobileThrottle = mobileInput.accelerate ? 1 : (mobileInput.brake ? -1 : 0);
        if (keys['ArrowUp'] || keys['KeyW'] || mobileThrottle > 0) throttle = 1;
        if (keys['ArrowDown'] || keys['KeyS'] || mobileThrottle < 0) throttle = -1;
        let steerIn = 0;
        if (keys['ArrowLeft'] || keys['KeyA']) steerIn += 1;
        if (keys['ArrowRight'] || keys['KeyD']) steerIn -= 1;
        if (mobileControlMode === 'gyro') {
            // Inclinaison à droite = braquage à droite; neutralisation au point d'activation.
            const tilt = clamp((gyroGamma - gyroNeutral) / 24, -1, 1);
            steerIn = -tilt;
        } else {
            if (mobileInput.left) steerIn += 1;
            if (mobileInput.right) steerIn -= 1;
        }
        // Braquage adouci : rampe de 4.5 rad/s vers la consigne (plus saccades)
        const speedFactor = 1 - Math.min(speedAbs / (CONFIG.maxSpeed * 1.6), 0.25);
        const targetSteer = steerIn * CONFIG.steerMax * speedFactor;
        const slew = 4.5 * dt;
        humanSteer += clamp(targetSteer - humanSteer, -slew, slew);
        steer = humanSteer;
    }

    // --- Moteur ---
    let maxV = CONFIG.maxSpeed * (turboActive ? CONFIG.turboSpeedMult : 1) * (spmActive ? CONFIG.spmSpeedMult : 1);
    const forceMult = (turboActive ? CONFIG.turboForceMult : 1) * (spmActive ? CONFIG.spmForceMult : 1);

    // Limiteur physique progressif : garde la vitesse x3 contrôlable et évite
    // qu'une force résiduelle fasse croître la vélocité sans limite.
    if (speed > maxV) {
        const excess = speed - maxV;
        carBody.velocity.x -= forward.x * excess * Math.min(1, dt * 8);
        carBody.velocity.z -= forward.z * excess * Math.min(1, dt * 8);
    }

    if (throttle > 0) {
        const ramp = Math.max(0.08, 1 - Math.max(0, speed) / maxV);
        const F = -CONFIG.engineForce * forceMult * ramp * throttle;
        vehicle.applyEngineForce(F, 2);
        vehicle.applyEngineForce(F, 3);
        vehicle.setBrake(0, 2);
        vehicle.setBrake(0, 3);
    } else if (throttle < 0) {
        // Marche arrière : seulement à l'arrêt ou déjà en arrière
        if (speed > 1) {
            vehicle.applyEngineForce(0, 2);
            vehicle.applyEngineForce(0, 3);
            vehicle.setBrake(CONFIG.brakeForce, 2);
            vehicle.setBrake(CONFIG.brakeForce, 3);
            braking = true;
        } else {
            const ramp = Math.max(0.1, 1 - Math.max(0, -speed) / CONFIG.reverseSpeed);
            const F = CONFIG.engineForce * 0.45 * ramp;
            vehicle.applyEngineForce(F, 2);
            vehicle.applyEngineForce(F, 3);
            vehicle.setBrake(0, 2);
            vehicle.setBrake(0, 3);
        }
    } else {
        // Roulage libre : frein moteur léger (ou freinage fort autodrive)
        vehicle.applyEngineForce(0, 2);
        vehicle.applyEngineForce(0, 3);
        const coastBrake = hardBrake ? CONFIG.brakeForce * 0.8 : CONFIG.rollingBrake;
        vehicle.setBrake(coastBrake, 2);
        vehicle.setBrake(coastBrake, 3);
        if (hardBrake) braking = true;
    }

    // --- Direction (roues avant 0 et 1) ---
    vehicle.setSteeringValue(steer, 0);
    vehicle.setSteeringValue(steer, 1);

    // Assistance de braquage arcade : impose le lacet du modèle bicyclette.
    // Le modèle de pneus raycast de cannon oppose un fort contre-couple qui
    // annule une vélocité « suggérée » — on l'affecte donc directement (gain 1,
    // après world.step) et on ajoute une intégration de quaternion en renfort.
    if (speedAbs > 1.2 && state === 'racing') {
        const yawRate = clamp(steer * speedAbs / 2.6, -CONFIG.turnRateMax, CONFIG.turnRateMax);
        carBody.angularVelocity.y = yawRate;
        const dq = new CANNON.Quaternion();
        dq.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yawRate * dt * 0.5);
        carBody.quaternion = dq.mult(carBody.quaternion);
    }

    // --- Glisse le long des murs : la composante « vers le mur » est absorbée,
    // la composante « le long du mur » est conservée → on ne bloque plus en
    // rasant un mur, on continue d'avancer (comportement arcade attendu) ---
    for (let ci = 0; ci < world.contacts.length; ci++) {
        const c = world.contacts[ci];
        if (c.bi !== carBody && c.bj !== carBody) continue;
        const other = c.bi === carBody ? c.bj : c.bi;
        if (!other.shapes || !other.shapes.length) continue;
        const sh = other.shapes[0];
        // murs lisses : seules les boîtes 0.25 × 2.2 de haut
        if (!(sh.halfExtents && sh.halfExtents.y === 2.2 && sh.halfExtents.x === 0.25)) continue;
        const n = new CANNON.Vec3();
        if (c.bi === carBody) c.ni.scale(-1, n); else n.copy(c.ni);
        if (Math.abs(n.y) > 0.5) continue;
        const vInto = carBody.velocity.dot(n);
        if (vInto < 0) {
            carBody.velocity.x -= n.x * vInto;
            carBody.velocity.z -= n.z * vInto;
            // petit rebond pour ne pas rester plaqué
            carBody.velocity.x += n.x * 0.5;
            carBody.velocity.z += n.z * 0.5;
            // Choc notable : secousse + étincelles + son
            if (vInto < -6) {
                camShake = Math.max(camShake, Math.min(0.8, -vInto * 0.06));
                if (window.KA) KA.sfx.thud(-vInto * 0.08);
                if (shared && carMesh) {
                    for (let k = 0; k < 4; k++) {
                        spawnParticle(shared().sparkTex,
                            carBody.position.x + n.x * 1.2, carBody.position.y + 0.2, carBody.position.z + n.z * 1.2,
                            n.x * (2 + Math.random() * 4) + (Math.random() - 0.5) * 3,
                            2 + Math.random() * 3,
                            n.z * (2 + Math.random() * 4) + (Math.random() - 0.5) * 3,
                            0.4, 0.35, 0.6);
                    }
                }
            }
        }
    }

    // Freinage main... (R = reset, pas de frein à main séparé)

    // Feux de freinage
    const brakingLights = braking || throttle < 0 || (throttle === 0 && speedAbs > 2);
    tailLeftMat.color.setHex(brakingLights ? 0xff2222 : 0x990000);
    tailRightMat.color.setHex(brakingLights ? 0xff2222 : 0x990000);

    // Animation et collecte des bouteilles de turbo.
    for (const pickup of turboPickups) {
        if (pickup.userData.collected) continue;
        pickup.rotation.y += dt * 2.4;
        pickup.position.y = pickup.userData.baseY + Math.sin(clock.elapsedTime * 3 + pickup.userData.phase) * .18;
        const pdx = carBody.position.x - pickup.position.x;
        const pdy = carBody.position.y - pickup.position.y;
        const pdz = carBody.position.z - pickup.position.z;
        if (pdx * pdx + pdy * pdy + pdz * pdz < 4.63) collectTurboPickup(pickup, forward);
    }

    // --- Turbo ---
    if (turboActive) {
        turboTimer -= dt;
        if (turboTimer <= 0) turboActive = false;
    }
    if (turboCooldown > 0) turboCooldown -= dt;
    if (turboFillEl) {
        const frac = turboActive ? 1 : clamp(1 - turboCooldown / CONFIG.turboCooldown, 0, 1);
        turboFillEl.style.width = (frac * 100).toFixed(0) + '%';
    }
    // Flamme turbo : scintillement + gerbe d'étincelles arrière
    if (turboFlames.length) {
        for (const flame of turboFlames) flame.visible = turboActive;
        if (turboActive && carMesh) {
            const f = 1.5 + Math.random() * 1.25;
            for (const flame of turboFlames) {
                flame.scale.set(1.15 * f, 2.35 * f, 1);
                flame.material = Math.random() < .35 ? shared().boostFlameMat : shared().flameMat;
            }
            if (Math.random() < 0.75) {
                const back = new THREE.Vector3(0, 0.1, -2.6).applyQuaternion(carMesh.quaternion);
                spawnParticle(shared().sparkTex,
                    carMesh.position.x + back.x, carMesh.position.y + back.y, carMesh.position.z + back.z,
                    back.x * 2 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, back.z * 2 + (Math.random() - 0.5) * 2,
                    0.35, 0.5, 0.8);
            }
            // Panache dense mais plafonné par le pool global de particules.
            if (Math.random() < .82) {
                const smokeBack = new THREE.Vector3(0, .05, -2.9).applyQuaternion(carMesh.quaternion);
                spawnParticle(shared().smokeTex,
                    carMesh.position.x + smokeBack.x + (Math.random() - .5) * 1.2,
                    carMesh.position.y + smokeBack.y,
                    carMesh.position.z + smokeBack.z + (Math.random() - .5) * 1.2,
                    -forward.x * (5 + Math.random() * 5), 1.2 + Math.random() * 2,
                    -forward.z * (5 + Math.random() * 5),
                    1.1 + Math.random() * .8, .65 + Math.random() * .45, 2.5);
            }
        }
    }

    // --- Dérapage : vitesse latérale → son + poussière ---
    const grounded = up.y > 0.5;
    const right = new CANNON.Vec3();
    forward.cross(up, right);
    const latSpeed = Math.abs(carBody.velocity.dot(right));
    const skidAmt = (grounded && speedAbs > 5) ? clamp(latSpeed / 9, 0, 1) : 0;
    if (window.KA) KA.setSkid(skidAmt * clamp(speedAbs / 15, 0, 1));
    lastDustT -= dt;
    if (skidAmt > 0.3 && lastDustT <= 0 && carMesh) {
        lastDustT = 0.05;
        const back = new THREE.Vector3(0, -0.2, -1.6).applyQuaternion(carMesh.quaternion);
        spawnParticle(shared().dustTex,
            carMesh.position.x + back.x + (Math.random() - 0.5), carMesh.position.y + 0.15, carMesh.position.z + back.z + (Math.random() - 0.5),
            -forward.x * 2 + (Math.random() - 0.5) * 2, 1.2, -forward.z * 2 + (Math.random() - 0.5) * 2,
            0.7, 0.9, 2.2);
    }

    // --- Atterrissage : choc vertical → son + secousse + flash + poussière ---
    if (grounded && prevVelY < -5.5) {
        const impact = clamp(-prevVelY / 18, 0.25, 1);
        if (window.KA) KA.sfx.thud(impact);
        camShake = Math.max(camShake, impact);
        if (impact > 0.55) damageFlash();
        for (let k = 0; k < 8; k++) {
            spawnParticle(shared().dustTex,
                carBody.position.x + (Math.random() - 0.5) * 2.2, carBody.position.y - 0.2, carBody.position.z + (Math.random() - 0.5) * 2.2,
                (Math.random() - 0.5) * 7, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 7,
                0.8, 1.1, 2.6);
        }
    }
    prevVelY = carBody.velocity.y;

    // --- Lignes de vitesse à haute vélocité ---
    if (speedLinesEl) {
        const op = clamp((kmh - 85) / 70, 0, 1) * (turboActive ? 1 : 0.65);
        speedLinesEl.style.opacity = op.toFixed(2);
    }

    // --- Chrono ---
    raceTime = (Date.now() - raceStartTime) / 1000;
    displayedSpeed += (kmh - displayedSpeed) * Math.min(1, dt * 8);
    speedEl.textContent = Math.round(displayedSpeed);
    timerEl.textContent = formatTime(raceTime);
    checkpointEl.textContent = Math.min(nextCp, checkpoints.length) + '/' + checkpoints.length;

    // --- Détection chute / retournement / blocage ---
    if (up.y < 0.25) {
        flipTimer += dt;
    } else {
        flipTimer = 0;
    }
    if (carBody.position.y < -3.5 || flipTimer > 1.5 ||
        !Number.isFinite(carBody.position.x) || !Number.isFinite(carBody.position.z)) {
        respawnCar();
        flipTimer = 0;
        showMessage('Remise sur la piste');
    } else {
        stuckTimer = 0;
    }

    // Anti-blocage par déplacement : si la voiture n'avance plus, retour checkpoint
    stuckCheckTimer += dt;
    if (stuckCheckTimer >= 1) {
        stuckCheckTimer = 0;
        const mdx = carBody.position.x - lastStuckX;
        const mdz = carBody.position.z - lastStuckZ;
        const moved = Math.sqrt(mdx * mdx + mdz * mdz);
        lastStuckX = carBody.position.x;
        lastStuckZ = carBody.position.z;
        if (moved < 1.5 && raceTime > 4) {
            stuckNoMoveCount++;
            if (stuckNoMoveCount >= 3) {
                stuckNoMoveCount = 0;
                respawnCar();
                showMessage('Voiture bloquée — retour au checkpoint');
            }
        } else {
            stuckNoMoveCount = 0;
        }
    }

    // --- Checkpoints ---
    const cpTarget = nextCp < checkpoints.length ? checkpoints[nextCp] : null;
    if (cpTarget) {
        const dx = carBody.position.x - cpTarget.x;
        const dz = carBody.position.z - cpTarget.z;
        const dy = carBody.position.y - cpTarget.y;
        if (dx * dx + dz * dz < 81 && Math.abs(dy) < 5) {
            respawnPoint = { x: cpTarget.x, y: cpTarget.y + 0.8, z: cpTarget.z, yaw: cpTarget.yaw };
            nextCp++;
            showMessage('✓ CHECKPOINT ' + nextCp + '/' + checkpoints.length);
            if (window.KA) KA.sfx.checkpoint();
        }
    } else if (finishZone) {
        const dx = carBody.position.x - finishZone.x;
        const dz = carBody.position.z - finishZone.z;
        const dy = carBody.position.y - finishZone.y;
        if (dx * dx + dz * dz < 81 && Math.abs(dy) < 4) {
            finishRace();
            return;
        }
    }

    // Trace circulaire pour diagnostic (60 Hz × ~4 s)
    try {
        if (!window.__kittTrace) window.__kittTrace = [];
        const tr = window.__kittTrace;
        tr.push({
            t: +raceTime.toFixed(2),
            x: +carBody.position.x.toFixed(2),
            z: +carBody.position.z.toFixed(2),
            v: +kmh.toFixed(0),
            head: +(Math.atan2(forward.x, forward.z) * 180 / Math.PI).toFixed(1),
            omegaY: +carBody.angularVelocity.y.toFixed(2),
            steer: +steer.toFixed(2),
            thr: throttle
        });
        if (tr.length > 240) tr.shift();
    } catch (e) { /* jamais bloquant */ }

    updateChaseCamera(dt);
    updateEngineSound(kmh, Math.abs(throttle));

    // Debug
    if (debugMode && debugEl) {
        const contacts = world.contacts.filter(c => c.bi === carBody || c.bj === carBody).length;
        const heading = (Math.atan2(forward.x, forward.z) * 180 / Math.PI).toFixed(0);
        debugEl.textContent = `v=${kmh.toFixed(0)}km/h y=${carBody.position.y.toFixed(2)} cap=${heading}° cp=${nextCp} contacts=${contacts} up=${up.y.toFixed(2)}`;
        if (raceTime - lastDebugLog > 1) {
            lastDebugLog = raceTime;
            console.log('[DEBUG]', debugEl.textContent);
        }
    }
}

function syncCarVisual() {
    if (!carBody || !carMesh) return;
    carMesh.position.copy(carBody.position);
    carMesh.quaternion.copy(carBody.quaternion);

    if (vehicle && wheelMeshes.length) {
        for (let i = 0; i < vehicle.wheelInfos.length; i++) {
            vehicle.updateWheelTransform(i);
            const t = vehicle.wheelInfos[i].worldTransform;
            wheelMeshes[i].position.set(t.position.x, t.position.y, t.position.z);
            wheelMeshes[i].quaternion.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w);
            wheelMeshes[i].quaternion.multiply(wheelBaseQuat);
        }
    }
}

function updateChaseCamera(dt) {
    if (!carMesh) return;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(carMesh.quaternion);
    const pos = carMesh.position;

    // Démonstration 3D courte façon showroom des années 1990 : travelling
    // orbital pendant le déploiement, puis retour souple à la poursuite.
    if (spmDemoTimer > 0) {
        const k = 1 - spmDemoTimer / 2.8;
        const angle = -.95 + k * Math.PI * 1.55;
        const local = new THREE.Vector3(Math.sin(angle) * 7.2, 2.65 + Math.sin(k*Math.PI)*1.15, Math.cos(angle) * 7.2);
        local.applyQuaternion(carMesh.quaternion);
        const cinematicPos = pos.clone().add(local);
        camera.position.lerp(cinematicPos, 1 - Math.exp(-8 * dt));
        const focus = pos.clone(); focus.y += .42;
        camera.up.lerp(new THREE.Vector3(0,1,0), Math.min(1,dt*5)).normalize();
        camera.lookAt(focus);
        camera.fov += (54 - camera.fov) * Math.min(1,dt*7);
        camera.updateProjectionMatrix();
        return;
    }

    const targetPos = pos.clone().addScaledVector(fwd, -8.7);
    targetPos.y += 3.55;
    camera.position.lerp(targetPos, 1 - Math.exp(-5 * dt));

    // V7 — secousse (atterrissages, chocs) : bruit qui s'amortit
    if (camShake > 0.002) {
        camera.position.x += (Math.random() - 0.5) * camShake;
        camera.position.y += (Math.random() - 0.5) * camShake * 0.7;
        camera.position.z += (Math.random() - 0.5) * camShake;
        camShake *= Math.exp(-6 * dt);
    } else {
        camShake = 0;
    }

    const lookAt = pos.clone().addScaledVector(fwd, 4.8);
    lookAt.y += 1.05;
    camera.lookAt(lookAt);

    // La caméra roule avec la voiture (boucle !) : up tend vers le haut local
    const carUp = new THREE.Vector3(0, 1, 0).applyQuaternion(carMesh.quaternion);
    camera.up.lerp(carUp, Math.min(1, dt * 4)).normalize();

    // FOV : élargi avec la vitesse et le turbo
    const targetFov = CONFIG.cameraFOV + (turboActive ? 13 : 0) + (spmActive ? 5 : 0) + Math.min(displayedSpeed * 0.05, 5);
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
    camera.updateProjectionMatrix();
}

function updateMenuCamera(dt) {
    const t = clock.elapsedTime * 0.35;
    const cx = carMesh ? carMesh.position.x : 0;
    const cy = carMesh ? carMesh.position.y : 0;
    const cz = carMesh ? carMesh.position.z : 0;
    camera.position.set(cx + Math.sin(t) * 10, cy + 3.2, cz + Math.cos(t) * 10);
    camera.lookAt(cx, cy + 0.8, cz);
    camera.fov += (CONFIG.cameraFOV - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
}

function updateScannerVisual(dt) {
    if (!scannerMesh || !scannerLight) return;
    if (scannerTimer > 0) {
        scannerTimer -= dt;
        const t = clock.elapsedTime;
        scannerMesh.position.x = Math.sin(t * 7) * 0.66;
        scannerLight.position.x = scannerMesh.position.x;
        scannerLight.intensity = 1.6 + Math.sin(t * 14) * 0.8;
        scannerMesh.material.color.setHex(0xff4444);
    } else {
        scannerMesh.position.x *= 0.9;
        scannerLight.position.x = scannerMesh.position.x;
        scannerLight.intensity = 0.9;
        scannerMesh.material.color.setHex(CONFIG.colors.scanner);
    }
}

// ============================================
// UTILITAIRES
// ============================================
function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

function formatTime(s) {
    if (isNaN(s) || s === null) return '--:--.--';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function showMessage(text) {
    if (!messagesEl) return;
    const el = document.createElement('div');
    el.className = 'hud-message';
    el.textContent = text;
    messagesEl.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

// V7 — flash rouge d'impact sur tout l'écran
function damageFlash() {
    if (!damageFlashEl) return;
    damageFlashEl.classList.remove('flash');
    void damageFlashEl.offsetWidth;             // relance l'animation CSS
    damageFlashEl.classList.add('flash');
}
