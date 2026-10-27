// ============================================
// ASTEROIDS 3D — Moteur de jeu 3D avec Three.js
// Rendu spatial réaliste, particules 3D, effets de lumière
// By Manix - KITT FRANCO BELGE - 2026
// ============================================

(function () {
'use strict';

// ============================================
// CONFIGURATION
// ============================================

const TAU = Math.PI * 2;
const MAX_ASTEROIDS = 50;
const MAX_BULLETS = 20;
const MAX_PARTICLES = 200;

// Paramètres de physique
const THRUST = 300;          // px/s²
const MAX_SPEED = 500;
const TURN_RATE = 4.0;       // rad/s
const FRICTION = 0.15;       // amortissement spatial
const BULLET_SPEED = 700;
const BULLET_LIFE = 1.2;
const FIRE_COOLDOWN = 0.25;
const EXTRA_LIFE_EVERY = 15000;

// Paramètres 3D
const FIELD_SIZE = 2000;
const SHIP_SCALE = 0.3;
const ASTEROID_SCALE = 1.0;
const PARTICLE_SCALE = 0.15;

// Qualité graphique (0 = bas, 1 = moyen, 2 = élevé)
let GRAPHICS_QUALITY = 2;
let RENDER_SCALE = 1.0;

// ============================================
// ÉTAT GLOBAL
// ============================================

let state = 'loading';       // loading | menu | starting | playing | paused | gameover
let score = 0, wave = 1, lives = 3;
let highScore = 0;
try { highScore = Number(localStorage.getItem('asteroids3dHighScore')) || 0; } catch (e) { /* noop */ }

let scene, camera, renderer;
let ship, shipModel, shipThrust;
let asteroids = [];
let bullets = [];
let particles = [];
let stars = [];
let starField;
let nebula;
let light, ambientLight;
let clock = new THREE.Clock();

// Audio
let audioContext = null;
let audioThruster = null;
let audioShoot = null;
let audioExplosion = null;
let masterGain = null;
let soundEnabled = true;
let soundVolume = 0.7;
let thrusterPlaying = false;
let thrusterGain = null;

// Contrôles
const keys = {};
const joy = { active: false, id: null, x: 0, y: 0 };
let touchFire = false;
let sensitivity = 0.5;

// Timers
let fireTimer = 0;
let invincibleTimer = 0;
let waveTimer = 0;
let deathTimer = 0;
let nextExtraLife = EXTRA_LIFE_EVERY;
let thrusting = false;
let hyperspaceCooldown = 0;

// Caméra
let cameraMode = 'dynamic'; // dynamic | fixed | orbit
let cameraDistance = 80;
let cameraOffset = new THREE.Vector3(0, 20, -60);
let cameraTarget = new THREE.Vector3();

// ============================================
// SCENE SETUP
// ============================================

function initScene() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020305);
    scene.fog = new THREE.FogExp2(0x020305, 0.0008);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, FIELD_SIZE * 2);
    camera.position.set(0, 30, 80);
    camera.lookAt(0, 0, 0);
    
    cameraTarget = new THREE.Vector3(0, 0, 0);

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
    renderer.toneMappingExposure = 1.2;
    
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Lights
    ambientLight = new THREE.AmbientLight(0x222244, 0.4);
    scene.add(ambientLight);
    
    // Directional light (simulating starlight)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(100, 100, -100);
    dirLight.castShadow = GRAPHICS_QUALITY >= 2;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.left = -200;
    dirLight.shadow.camera.right = 200;
    dirLight.shadow.camera.top = 200;
    dirLight.shadow.camera.bottom = -200;
    scene.add(dirLight);
    
    // Point light (for ship)
    light = new THREE.PointLight(0x63e9ff, 1.5, 100);
    light.castShadow = false;
    scene.add(light);

    // Star field
    createStarField();
    
    // Nebula background
    createNebula();
    
    // Create ship
    createShip();
    
    // Handle resize
    window.addEventListener('resize', onWindowResize);
}

function createStarField() {
    const starGeometry = new THREE.BufferGeometry();
    const starMaterials = [];
    const starPositions = [];
    const starColors = [];
    const starSizes = [];
    
    const starCount = GRAPHICS_QUALITY >= 2 ? 2000 : GRAPHICS_QUALITY === 1 ? 1000 : 500;
    
    for (let i = 0; i < starCount; i++) {
        const x = (Math.random() - 0.5) * FIELD_SIZE * 1.5;
        const y = (Math.random() - 0.5) * FIELD_SIZE * 1.5;
        const z = (Math.random() - 0.5) * FIELD_SIZE * 1.5;
        
        starPositions.push(x, y, z);
        
        // Color based on temperature (bluer = hotter)
        const temp = Math.random();
        let r, g, b;
        if (temp < 0.3) {
            r = 0.6 + Math.random() * 0.4;
            g = 0.7 + Math.random() * 0.3;
            b = 1.0;
        } else if (temp < 0.6) {
            r = 0.8 + Math.random() * 0.2;
            g = 0.8 + Math.random() * 0.2;
            b = 0.8 + Math.random() * 0.2;
        } else {
            r = 1.0;
            g = 0.6 + Math.random() * 0.4;
            b = 0.4 + Math.random() * 0.2;
        }
        
        starColors.push(r, g, b);
        starSizes.push(0.2 + Math.random() * (GRAPHICS_QUALITY >= 2 ? 1.5 : 0.8));
    }
    
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
    starGeometry.setAttribute('size', new THREE.Float32BufferAttribute(starSizes, 1));
    
    const starMaterial = new THREE.PointsMaterial({
        size: 1,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
        depthWrite: false
    });
    
    starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);
    
    // Store original positions for parallax
    stars = [];
    for (let i = 0; i < starPositions.length; i += 3) {
        stars.push({
            x: starPositions[i],
            y: starPositions[i + 1],
            z: starPositions[i + 2]
        });
    }
}

function createNebula() {
    if (GRAPHICS_QUALITY < 1) return;
    
    // Create a large sphere with nebula texture
    const textureLoader = new THREE.TextureLoader();
    
    // Procedural nebula texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Create nebula pattern
    const gradient1 = ctx.createRadialGradient(128, 128, 0, 128, 128, 256);
    gradient1.addColorStop(0, 'rgba(80,40,160,0.3)');
    gradient1.addColorStop(0.7, 'rgba(80,40,160,0.1)');
    gradient1.addColorStop(1, 'rgba(80,40,160,0)');
    
    const gradient2 = ctx.createRadialGradient(384, 384, 0, 384, 384, 256);
    gradient2.addColorStop(0, 'rgba(20,110,140,0.2)');
    gradient2.addColorStop(0.6, 'rgba(20,110,140,0.05)');
    gradient2.addColorStop(1, 'rgba(20,110,140,0)');
    
    const gradient3 = ctx.createRadialGradient(256, 64, 0, 256, 64, 128);
    gradient3.addColorStop(0, 'rgba(160,30,110,0.15)');
    gradient3.addColorStop(1, 'rgba(160,30,110,0)');
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = gradient1;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = gradient2;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = gradient3;
    ctx.fillRect(0, 0, 512, 512);
    
    // Add some stars
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const brightness = Math.random();
        ctx.fillStyle = `rgba(255,255,255,${brightness * 0.8})`;
        ctx.beginPath();
        ctx.arc(x, y, 1 + Math.random() * 2, 0, TAU);
        ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    
    const geometry = new THREE.SphereGeometry(FIELD_SIZE * 0.4, 32, 32);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.6,
        depthWrite: false
    });
    
    nebula = new THREE.Mesh(geometry, material);
    scene.add(nebula);
}

function createShip() {
    const group = new THREE.Group();
    
    // Main ship body (cone shape)
    const bodyGeometry = new THREE.ConeGeometry(8, 16, 8);
    const bodyMaterial = new THREE.MeshPhongMaterial({
        color: 0x37f5ff,
        specular: 0xffffff,
        shininess: 60,
        emissive: 0x113344,
        emissiveIntensity: 0.3
    });
    
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = Math.PI / 2; // Point along Z axis
    body.position.z = 4;
    group.add(body);
    
    // Cockpit
    const cockpitGeometry = new THREE.SphereGeometry(4, 8, 8);
    const cockpitMaterial = new THREE.MeshPhongMaterial({
        color: 0xbff8ff,
        transparent: true,
        opacity: 0.8,
        emissive: 0x4488aa,
        emissiveIntensity: 0.5
    });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.z = 10;
    group.add(cockpit);
    
    // Thrusters
    const thrusterGeometry = new THREE.ConeGeometry(3, 8, 6);
    const thrusterMaterial = new THREE.MeshPhongMaterial({
        color: 0xff6600,
        emissive: 0xff4400,
        emissiveIntensity: 0.5
    });
    const thruster1 = new THREE.Mesh(thrusterGeometry, thrusterMaterial);
    thruster1.rotation.x = Math.PI / 2;
    thruster1.position.set(-4, 0, -6);
    group.add(thruster1);
    
    const thruster2 = new THREE.Mesh(thrusterGeometry, thrusterMaterial);
    thruster2.rotation.x = Math.PI / 2;
    thruster2.position.set(4, 0, -6);
    group.add(thruster2);
    
    // Wing details
    const wingGeometry = new THREE.BoxGeometry(2, 1, 6);
    const wingMaterial = new THREE.MeshPhongMaterial({
        color: 0x224466,
        emissive: 0x112233,
        emissiveIntensity: 0.2
    });
    
    const wing1 = new THREE.Mesh(wingGeometry, wingMaterial);
    wing1.position.set(-4, 0, 0);
    wing1.rotation.z = Math.PI / 4;
    group.add(wing1);
    
    const wing2 = new THREE.Mesh(wingGeometry, wingMaterial);
    wing2.position.set(4, 0, 0);
    wing2.rotation.z = -Math.PI / 4;
    group.add(wing2);
    
    // Details (antennas, etc.)
    const detailGeometry = new THREE.CylinderGeometry(0.5, 0.5, 4, 4);
    const detailMaterial = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        emissive: 0x444466,
        emissiveIntensity: 0.3
    });
    
    const antenna = new THREE.Mesh(detailGeometry, detailMaterial);
    antenna.position.set(0, 0, 12);
    antenna.rotation.x = Math.PI / 2;
    group.add(antenna);
    
    shipModel = group;
    shipModel.scale.set(SHIP_SCALE, SHIP_SCALE, SHIP_SCALE);
    shipModel.position.set(0, 0, 0);
    shipModel.visible = false;
    scene.add(shipModel);
    
    // Create thrust particle system
    createThrustParticles();
    
    // Ship state
    ship = {
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        angle: 0,
        pitch: 0,
        roll: 0,
        radius: 8 * SHIP_SCALE
    };
    
    shipModel.visible = true;
}

function createThrustParticles() {
    const particleCount = 100;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
        
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.6 + Math.random() * 0.4;
        colors[i * 3 + 2] = 0.0;
        
        sizes[i] = 0.1 + Math.random() * 0.3;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const material = new THREE.PointsMaterial({
        size: 0.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    shipThrust = new THREE.Points(geometry, material);
    shipThrust.visible = false;
    scene.add(shipThrust);
}

function createAsteroid(x, y, z, size) {
    // size: 1 = small, 2 = medium, 3 = large
    const scale = ASTEROID_SCALE * (size === 1 ? 0.5 : size === 2 ? 0.8 : 1.2);
    
    // Create irregular asteroid shape using Icosahedron
    const geometry = new THREE.IcosahedronGeometry(8 * scale, 0);
    
    // Add randomness to vertices
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
        const randomness = 0.2 + Math.random() * 0.3;
        position.setX(i, position.getX(i) * (1 + (Math.random() - 0.5) * randomness));
        position.setY(i, position.getY(i) * (1 + (Math.random() - 0.5) * randomness));
        position.setZ(i, position.getZ(i) * (1 + (Math.random() - 0.5) * randomness));
    }
    
    // Color based on size
    let color;
    switch (size) {
        case 1: color = 0x88aaaa; break; // Small asteroids (ice)
        case 2: color = 0xaa8866; break; // Medium asteroids (rock)
        default: color = 0xaa6644; break; // Large asteroids (iron)
    }
    
    // Material with bump map for texture
    const textureLoader = new THREE.TextureLoader();
    const bumpMap = createAsteroidBumpMap(256, 256);
    
    const material = new THREE.MeshPhongMaterial({
        color: color,
        specular: 0x333333,
        shininess: 10,
        bumpMap: bumpMap,
        bumpScale: 0.1,
        flatShading: true
    });
    
    const asteroid = new THREE.Mesh(geometry, material);
    asteroid.position.set(x, y, z);
    asteroid.castShadow = GRAPHICS_QUALITY >= 2;
    asteroid.receiveShadow = false;
    
    // Add craters using decals
    if (GRAPHICS_QUALITY >= 2) {
        addCraters(asteroid, scale);
    }
    
    scene.add(asteroid);
    
    return {
        mesh: asteroid,
        x, y, z,
        vx: 0, vy: 0, vz: 0,
        rotX: 0, rotY: 0, rotZ: 0,
        rotSpeedX: (Math.random() - 0.5) * 2,
        rotSpeedY: (Math.random() - 0.5) * 2,
        rotSpeedZ: (Math.random() - 0.5) * 2,
        size,
        radius: 8 * scale,
        scale
    };
}

function createAsteroidBumpMap(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Create noise for bump map
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const value = Math.floor((Math.random() * 255));
        data[i] = value;     // R
        data[i + 1] = value; // G
        data[i + 2] = value; // B
        data[i + 3] = 255;    // A
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function addCraters(asteroid, scale) {
    const craters = [];
    const geometry = asteroid.geometry;
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    
    // This is a simplified approach - in a real implementation, 
    // we'd use decals or modify the geometry directly
    for (let i = 0; i < 5; i++) {
        // Find a random face
        const faceIndex = Math.floor(Math.random() * (geometry.index ? geometry.index.count / 3 : position.count / 3));
        
        // Create a dark spot
        const craterSize = 0.1 * scale;
        const craterPosition = new THREE.Vector3(
            position.getX(faceIndex * 3),
            position.getY(faceIndex * 3),
            position.getZ(faceIndex * 3)
        );
        
        craters.push({
            position: craterPosition,
            size: craterSize
        });
    }
    
    // We'll use these positions in the render loop to add dark spots
    asteroid.userData.craters = craters;
}

function createBullet(x, y, z) {
    const geometry = new THREE.CapsuleGeometry(0.3, 2, 4, 8);
    const material = new THREE.MeshPhongMaterial({
        color: 0x7dffb0,
        emissive: 0x44ff88,
        emissiveIntensity: 0.8,
        specular: 0xffffff,
        shininess: 30
    });
    
    const bullet = new THREE.Mesh(geometry, material);
    bullet.position.set(x, y, z);
    bullet.rotation.x = Math.PI / 2; // Point along Z axis
    
    scene.add(bullet);
    
    return {
        mesh: bullet,
        x, y, z,
        vx: 0, vy: 0, vz: 0,
        life: BULLET_LIFE,
        radius: 0.3
    };
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
// AUDIO
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
        return;
    }
    
    // Create thruster sound
    createThrusterSound();
}

function createThrusterSound() {
    if (!audioContext || !soundEnabled) return;
    
    // Use a noise-based thruster sound
    const bufferSize = audioContext.sampleRate * 0.5;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
        // Pink noise (more bass)
        const white = Math.random() * 2 - 1;
        data[i] = white * 0.5;
    }
    
    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0;
    
    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(masterGain);
    
    noise.start();
    
    audioThruster = {
        source: noise,
        gain: gainNode,
        filter: filter
    };
    
    thrusterGain = gainNode;
}

function playShoot() {
    if (!audioContext || !soundEnabled) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1760, audioContext.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.1 * soundVolume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
    
    oscillator.connect(gainNode);
    gainNode.connect(masterGain);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1);
}

function playExplosion(size) {
    if (!audioContext || !soundEnabled) return;
    
    const baseFreq = size === 3 ? 80 : size === 2 ? 120 : 160;
    
    for (let i = 0; i < 3; i++) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(baseFreq * (1.5 + Math.random() * 0.5), audioContext.currentTime);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3000, audioContext.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.5);
        
        gainNode.gain.setValueAtTime(0.05 * soundVolume, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
        
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(masterGain);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
    }
}

function playWaveStart() {
    if (!audioContext || !soundEnabled) return;
    
    const notes = [130.81, 164.81, 196.00, 220.00];
    
    for (let i = 0; i < notes.length; i++) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.value = notes[i] * 2;
        
        gainNode.gain.setValueAtTime(0.03 * soundVolume, audioContext.currentTime + i * 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
        
        oscillator.connect(gainNode);
        gainNode.connect(masterGain);
        
        oscillator.start(audioContext.currentTime + i * 0.05);
        oscillator.stop(audioContext.currentTime + 0.5);
    }
}

function playPlayerExplosion() {
    if (!audioContext || !soundEnabled) return;
    
    for (let i = 0; i < 5; i++) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(200 * Math.pow(1.5, i), audioContext.currentTime);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(5000, audioContext.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.6);
        
        gainNode.gain.setValueAtTime(0.08 * soundVolume, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.6);
        
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(masterGain);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.6);
    }
}

function playExtraLife() {
    if (!audioContext || !soundEnabled) return;
    
    const notes = [523.25, 659.25, 783.99, 1046.50];
    
    for (let i = 0; i < notes.length; i++) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.value = notes[i];
        
        gainNode.gain.setValueAtTime(0.04 * soundVolume, audioContext.currentTime + i * 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
        
        oscillator.connect(gainNode);
        gainNode.connect(masterGain);
        
        oscillator.start(audioContext.currentTime + i * 0.05);
        oscillator.stop(audioContext.currentTime + 0.3);
    }
}

function playHyperspace() {
    if (!audioContext || !soundEnabled) return;
    
    const notes = [440, 550, 660, 880];
    
    for (let i = 0; i < notes.length; i++) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = notes[i];
        
        gainNode.gain.setValueAtTime(0.03 * soundVolume, audioContext.currentTime + i * 0.03);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
        
        oscillator.connect(gainNode);
        gainNode.connect(masterGain);
        
        oscillator.start(audioContext.currentTime + i * 0.03);
        oscillator.stop(audioContext.currentTime + 0.2);
    }
}

function playUIClick() {
    if (!audioContext || !soundEnabled) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    
    gainNode.gain.setValueAtTime(0.05 * soundVolume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);
    
    oscillator.connect(gainNode);
    gainNode.connect(masterGain);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.05);
}

function setThruster(active) {
    if (!audioThruster || !soundEnabled) return;
    
    if (active) {
        if (!thrusterPlaying) {
            audioThruster.source.start();
            thrusterPlaying = true;
        }
        thrusterGain.gain.value = 0.1 * soundVolume;
        audioThruster.filter.frequency.value = 800 + Math.random() * 400;
        shipThrust.visible = true;
    } else {
        thrusterGain.gain.value = 0;
        thrusterPlaying = false;
        shipThrust.visible = false;
    }
}

// ============================================
// GAME LOGIC
// ============================================

function resetGame() {
    // Clear existing objects
    asteroids.forEach(a => scene.remove(a.mesh));
    bullets.forEach(b => scene.remove(b.mesh));
    particles.forEach(p => scene.remove(p.mesh));
    
    asteroids = [];
    bullets = [];
    particles = [];
    
    // Reset ship
    if (shipModel) scene.remove(shipModel);
    createShip();
    
    score = 0;
    wave = 1;
    lives = 3;
    fireTimer = 0;
    invincibleTimer = 0;
    waveTimer = 0;
    deathTimer = 0;
    nextExtraLife = EXTRA_LIFE_EVERY;
    thrusting = false;
    hyperspaceCooldown = 0;
    
    // Spawn first wave
    spawnWaveAsteroids(Math.min(3 + wave, 8));
    
    updateHud();
}

function spawnWaveAsteroids(count) {
    for (let i = 0; i < count; i++) {
        // Spawn away from ship
        let x, y, z, tries = 0;
        const safeDistance = 200;
        
        do {
            x = (Math.random() - 0.5) * FIELD_SIZE * 0.8;
            y = (Math.random() - 0.5) * FIELD_SIZE * 0.8;
            z = (Math.random() - 0.5) * FIELD_SIZE * 0.8;
            tries++;
        } while (tries < 20 && Math.hypot(x - ship.x, y - ship.y, z - ship.z) < safeDistance);
        
        // Size: 1=small, 2=medium, 3=large
        const size = Math.random() < 0.3 ? 3 : Math.random() < 0.6 ? 2 : 1;
        
        const asteroid = createAsteroid(x, y, z, size);
        
        // Random velocity
        const speed = (0.5 + Math.random() * 0.5) * (4 - size) * 100;
        const angle1 = Math.random() * TAU;
        const angle2 = Math.random() * TAU;
        const vx = Math.cos(angle1) * speed;
        const vy = Math.sin(angle1) * speed;
        const vz = Math.cos(angle2) * speed;
        
        asteroid.vx = vx;
        asteroid.vy = vy;
        asteroid.vz = vz;
        
        asteroids.push(asteroid);
    }
}

function spawnAsteroidFragments(x, y, z, size, count) {
    for (let i = 0; i < count; i++) {
        const fragmentSize = size > 1 ? size - 1 : 1;
        const fragment = createAsteroid(x, y, z, fragmentSize);
        
        // Inherit some velocity from parent
        fragment.vx = (Math.random() - 0.5) * 200;
        fragment.vy = (Math.random() - 0.5) * 200;
        fragment.vz = (Math.random() - 0.5) * 200;
        
        asteroids.push(fragment);
    }
}

function spawnExplosion(x, y, z, color, count, power) {
    for (let i = 0; i < count; i++) {
        const a1 = Math.random() * TAU;
        const a2 = Math.random() * TAU;
        const sp = (Math.random() * 0.5 + 0.5) * power;
        
        const vx = Math.cos(a1) * Math.cos(a2) * sp;
        const vy = Math.sin(a1) * Math.cos(a2) * sp;
        const vz = Math.sin(a2) * sp;
        
        const particle = createParticle(
            x, y, z,
            color,
            0.5 + Math.random() * 2,
            0.5 + Math.random() * 0.5,
            new THREE.Vector3(vx, vy, vz)
        );
        
        particles.push(particle);
    }
}

function spawnThrustParticles() {
    if (particles.length >= MAX_PARTICLES) return;
    
    const back = new THREE.Vector3(
        Math.cos(ship.angle) * Math.cos(ship.pitch),
        Math.sin(ship.pitch),
        Math.sin(ship.angle) * Math.cos(ship.pitch)
    ).negate();
    
    for (let i = 0; i < 2; i++) {
        const spreadX = back.x * 0.3 + (Math.random() - 0.5) * 0.2;
        const spreadY = back.y * 0.3 + (Math.random() - 0.5) * 0.2;
        const spreadZ = back.z * 0.3 + (Math.random() - 0.5) * 0.2;
        
        const sp = 100 + Math.random() * 100;
        
        const px = ship.x + back.x * 10 + spreadX * 5;
        const py = ship.y + back.y * 10 + spreadY * 5;
        const pz = ship.z + back.z * 10 + spreadZ * 5;
        
        const color = Math.random() < 0.6 ? 0x78d7ff : 0xffaa44;
        
        const particle = createParticle(
            px, py, pz,
            color,
            0.3 + Math.random() * 0.5,
            0.2 + Math.random() * 0.3,
            new THREE.Vector3(
                back.x * sp + spreadX * sp,
                back.y * sp + spreadY * sp,
                back.z * sp + spreadZ * sp
            )
        );
        
        particles.push(particle);
    }
}

function destroyAsteroid(index) {
    const a = asteroids[index];
    const big = a.size === 3;
    
    // Play explosion sound
    playExplosion(a.size);
    
    // Spawn explosion particles
    spawnExplosion(
        a.x, a.y, a.z,
        big ? 0xffa53e : 0x88e5ff,
        big ? 40 : 25,
        big ? 300 : 200
    );
    
    // Update score
    score += a.size === 3 ? 20 : a.size === 2 ? 50 : 100;
    checkExtraLife();
    
    // Create fragments if large asteroid
    if (a.size > 1) {
        spawnAsteroidFragments(a.x, a.y, a.z, a.size, 2);
    }
    
    // Remove asteroid
    scene.remove(a.mesh);
    asteroids.splice(index, 1);
    
    updateHud();
}

function checkExtraLife() {
    if (score >= nextExtraLife) {
        nextExtraLife += EXTRA_LIFE_EVERY;
        lives++;
        playExtraLife();
        spawnExplosion(
            ship.x + Math.cos(ship.angle) * 20,
            ship.y + Math.sin(ship.pitch) * 20,
            ship.z + Math.sin(ship.angle) * 20,
            0x5affb4,
            35,
            250
        );
        updateHud();
    }
}

function playerDie() {
    playPlayerExplosion();
    
    // Explosion at ship position
    spawnExplosion(ship.x, ship.y, ship.z, 0x78d7ff, 50, 300);
    spawnExplosion(ship.x, ship.y, ship.z, 0xff6644, 30, 200);
    
    // Remove ship
    if (shipModel) shipModel.visible = false;
    
    lives--;
    updateHud();
    
    setThruster(false);
    
    if (lives <= 0) {
        endGame();
    } else {
        deathTimer = 1.5;
    }
}

function hyperspace() {
    if (!shipModel || state !== 'playing' || hyperspaceCooldown > 0) return;
    
    hyperspaceCooldown = 1.5;
    playHyperspace();
    
    // Explosion effect
    spawnExplosion(ship.x, ship.y, ship.z, 0xbe8cff, 25, 200);
    
    // Random position away from asteroids
    let x, y, z, tries = 0;
    do {
        x = (Math.random() - 0.5) * FIELD_SIZE * 0.6;
        y = (Math.random() - 0.5) * FIELD_SIZE * 0.6;
        z = (Math.random() - 0.5) * FIELD_SIZE * 0.6;
        tries++;
    } while (tries < 30 && asteroids.some(a => 
        Math.hypot(a.x - x, a.y - y, a.z - z) < a.radius + 60
    ));
    
    ship.x = x;
    ship.y = y;
    ship.z = z;
    ship.vx = 0;
    ship.vy = 0;
    ship.vz = 0;
    ship.angle = 0;
    ship.pitch = 0;
    ship.roll = 0;
    
    if (shipModel) {
        shipModel.position.set(x, y, z);
        shipModel.rotation.set(0, 0, 0);
        shipModel.visible = true;
    }
    
    // Second explosion at new position
    spawnExplosion(x, y, z, 0xbe8cff, 25, 200);
}

function startWave(n) {
    wave = n;
    waveTimer = 1.0;
    const banner = document.getElementById('wave-banner');
    const bannerText = document.getElementById('wave-banner');
    if (banner) {
        banner.textContent = 'VAGUE ' + n;
        banner.classList.remove('hidden');
        banner.classList.add('visible');
        setTimeout(() => {
            banner.classList.remove('visible');
            banner.classList.add('hidden');
        }, 1500);
    }
    
    spawnWaveAsteroids(Math.min(3 + n, 12));
    playWaveStart();
    state = 'playing';
    updateHud();
}

function endGame() {
    state = 'gameover';
    setThruster(false);
    
    const isRecord = score > highScore;
    if (isRecord) {
        highScore = score;
        try { localStorage.setItem('asteroids3dHighScore', String(highScore)); } catch (e) { /* noop */ }
    }
    
    document.getElementById('gameover-score').textContent = score;
    document.getElementById('gameover-wave').textContent = wave;
    document.getElementById('gameover-highscore').textContent = highScore;
    document.getElementById('gameover-newrecord').style.display = isRecord ? 'block' : 'none';
    
    setTimeout(() => {
        showScreen('gameover');
    }, 900);
}

// ============================================
// INPUT HANDLING
// ============================================

function inputState() {
    let turn = 0;
    let pitch = 0;
    let thrust = false;
    let fire = false;
    
    if (keys['ArrowLeft'] || keys['KeyA']) turn -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) turn += 1;
    if (keys['ArrowUp'] || keys['KeyW']) pitch -= 1;
    if (keys['ArrowDown'] || keys['KeyS']) pitch += 1;
    
    if (joy.active) {
        turn += joy.x * sensitivity;
        pitch += joy.y * sensitivity;
    }
    
    if (keys['ArrowUp'] || keys['KeyW'] || (joy.active && joy.y < -0.35)) thrust = true;
    if (keys['Space'] || touchFire) fire = true;
    
    return { turn: Math.max(-1, Math.min(1, turn)), pitch: Math.max(-1, Math.min(1, pitch)), thrust, fire };
}

function handleKeyDown(e) {
    if (e.repeat && ['Escape','KeyP','KeyM','KeyG','KeyV','Enter','KeyR'].includes(e.code)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    
    if (audioContext && !audioContext.state) {
        audioContext.resume();
    }
    
    if (e.code === 'Escape' || e.code === 'KeyP') {
        if (state === 'playing') togglePause();
        else if (state === 'paused') togglePause(false);
    }
    
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && state === 'playing') {
        hyperspace();
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
}

function handleKeyUp(e) {
    keys[e.code] = false;
}

function setupTouch() {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (!isTouchDevice) return;
    
    document.getElementById('touch-joystick').classList.add('visible');
    document.getElementById('touch-fire').classList.add('visible');
    document.getElementById('touch-ui').classList.add('visible');
    
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    const R = 50;
    
    function setKnob(dx, dy) {
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
    
    base.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.changedTouches[0];
        joy.active = true; joy.id = t.identifier;
        
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
            joy.x = dx / R * 2;
            joy.y = dy / R * 2;
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
    
    const fireBtn = document.getElementById('touch-fire');
    fireBtn.addEventListener('touchstart', e => { 
        e.preventDefault(); 
        touchFire = true; 
    }, { passive: false });
    fireBtn.addEventListener('touchend', e => { 
        e.preventDefault(); 
        touchFire = false; 
    }, { passive: false });
    fireBtn.addEventListener('touchcancel', () => { touchFire = false; });
}

// ============================================
// UPDATE
// ============================================

function update(dt, t) {
    const inp = inputState();
    
    if (state === 'starting' || state === 'playing') {
        fireTimer = Math.max(0, fireTimer - dt);
        invincibleTimer = Math.max(0, invincibleTimer - dt);
        hyperspaceCooldown = Math.max(0, hyperspaceCooldown - dt);
        
        if (shipModel && state === 'playing') {
            // Rotation
            ship.angle += inp.turn * TURN_RATE * dt;
            ship.pitch += inp.pitch * TURN_RATE * dt;
            
            // Limiter les angles
            ship.pitch = Math.max(-Math.PI * 0.4, Math.min(Math.PI * 0.4, ship.pitch));
            ship.roll = Math.sin(ship.angle * 2) * 0.3 + Math.sin(ship.pitch * 2) * 0.2;
            
            thrusting = inp.thrust;
            
            // Apply thrust
            if (inp.thrust) {
                const thrustDirection = new THREE.Vector3(
                    Math.cos(ship.angle) * Math.cos(ship.pitch),
                    Math.sin(ship.pitch),
                    Math.sin(ship.angle) * Math.cos(ship.pitch)
                );
                
                ship.vx += thrustDirection.x * THRUST * dt;
                ship.vy += thrustDirection.y * THRUST * dt;
                ship.vz += thrustDirection.z * THRUST * dt;
                
                // Spawn thrust particles
                if (GRAPHICS_QUALITY >= 1) {
                    spawnThrustParticles();
                }
                
                setThruster(true);
            } else {
                setThruster(false);
            }
            
            // Apply friction
            ship.vx *= (1 - FRICTION * dt);
            ship.vy *= (1 - FRICTION * dt);
            ship.vz *= (1 - FRICTION * dt);
            
            // Limit speed
            const sp = Math.hypot(ship.vx, ship.vy, ship.vz);
            if (sp > MAX_SPEED) {
                ship.vx = ship.vx / sp * MAX_SPEED;
                ship.vy = ship.vy / sp * MAX_SPEED;
                ship.vz = ship.vz / sp * MAX_SPEED;
            }
            
            // Update position with wrap-around
            ship.x += ship.vx * dt;
            ship.y += ship.vy * dt;
            ship.z += ship.vz * dt;
            
            // Wrap around field
            ship.x = wrap(ship.x, FIELD_SIZE);
            ship.y = wrap(ship.y, FIELD_SIZE);
            ship.z = wrap(ship.z, FIELD_SIZE);
            
            // Update ship model
            if (shipModel) {
                shipModel.position.set(ship.x, ship.y, ship.z);
                shipModel.rotation.set(ship.pitch, ship.angle, ship.roll);
                
                // Update light position
                light.position.set(
                    ship.x + Math.cos(ship.angle) * 15,
                    ship.y + Math.sin(ship.pitch) * 15,
                    ship.z + Math.sin(ship.angle) * 15
                );
            }
            
            // Fire
            if (inp.fire && fireTimer <= 0 && bullets.length < MAX_BULLETS) {
                fireTimer = FIRE_COOLDOWN;
                
                const bulletDirection = new THREE.Vector3(
                    Math.cos(ship.angle) * Math.cos(ship.pitch),
                    Math.sin(ship.pitch),
                    Math.sin(ship.angle) * Math.cos(ship.pitch)
                );
                
                const bullet = createBullet(
                    ship.x + bulletDirection.x * 12,
                    ship.y + bulletDirection.y * 12,
                    ship.z + bulletDirection.z * 12
                );
                
                bullet.vx = bulletDirection.x * BULLET_SPEED + ship.vx * 0.35;
                bullet.vy = bulletDirection.y * BULLET_SPEED + ship.vy * 0.35;
                bullet.vz = bulletDirection.z * BULLET_SPEED + ship.vz * 0.35;
                
                bullets.push(bullet);
                playShoot();
            }
        }
        
        // Update bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.z += b.vz * dt;
            b.life -= dt;
            
            // Wrap around
            b.x = wrap(b.x, FIELD_SIZE);
            b.y = wrap(b.y, FIELD_SIZE);
            b.z = wrap(b.z, FIELD_SIZE);
            
            b.mesh.position.set(b.x, b.y, b.z);
            
            if (b.life <= 0) {
                scene.remove(b.mesh);
                bullets.splice(i, 1);
            }
        }
        
        // Update asteroids
        for (let i = 0; i < asteroids.length; i++) {
            const a = asteroids[i];
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            a.z += a.vz * dt;
            
            // Wrap around
            a.x = wrap(a.x, FIELD_SIZE);
            a.y = wrap(a.y, FIELD_SIZE);
            a.z = wrap(a.z, FIELD_SIZE);
            
            a.rotX += a.rotSpeedX * dt;
            a.rotY += a.rotSpeedY * dt;
            a.rotZ += a.rotSpeedZ * dt;
            
            a.mesh.position.set(a.x, a.y, a.z);
            a.mesh.rotation.set(a.rotX, a.rotY, a.rotZ);
        }
        
        // Check collisions
        if (shipModel && invincibleTimer <= 0 && state === 'playing') {
            // Bullet-asteroid collisions
            for (let bi = bullets.length - 1; bi >= 0; bi--) {
                const b = bullets[bi];
                let consumed = false;
                
                for (let ai = asteroids.length - 1; ai >= 0; ai--) {
                    const a = asteroids[ai];
                    if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) < a.radius + b.radius) {
                        bullets.splice(bi, 1);
                        scene.remove(b.mesh);
                        consumed = true;
                        destroyAsteroid(ai);
                        break;
                    }
                }
                if (consumed) continue;
            }
            
            // Ship-asteroid collisions
            for (let i = 0; i < asteroids.length; i++) {
                const a = asteroids[i];
                if (Math.hypot(ship.x - a.x, ship.y - a.y, ship.z - a.z) < a.radius + ship.radius * 0.75) {
                    playerDie();
                    break;
                }
            }
        }
        
        // Next wave
        if (state === 'playing' && asteroids.length === 0) {
            waveTimer -= dt;
            if (waveTimer <= 0) startWave(wave + 1);
        }
        
        // Respawn after death
        if (state === 'playing' && !shipModel.visible) {
            deathTimer -= dt;
            if (deathTimer <= 0) {
                if (lives > 0) {
                    shipModel.position.set(0, 0, 0);
                    shipModel.rotation.set(0, 0, 0);
                    shipModel.visible = true;
                    
                    ship.x = 0; ship.y = 0; ship.z = 0;
                    ship.vx = 0; ship.vy = 0; ship.vz = 0;
                    ship.angle = 0; ship.pitch = 0; ship.roll = 0;
                    
                    invincibleTimer = 2.2;
                }
            }
        }
    }
    
    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.life -= dt;
        
        // Update particle position
        const positions = p.mesh.geometry.attributes.position;
        positions.setXYZ(0, p.x, p.y, p.z);
        positions.needsUpdate = true;
        
        // Fade out
        p.mesh.material.opacity = p.life / p.maxLife;
        
        // Remove dead particles
        if (p.life <= 0) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
        }
    }
    
    // Limit particles
    while (particles.length > MAX_PARTICLES) {
        const p = particles.pop();
        scene.remove(p.mesh);
    }
    
    // Update camera
    if (cameraMode === 'dynamic' && shipModel) {
        const targetX = ship.x + Math.cos(ship.angle) * cameraOffset.x;
        const targetY = ship.y + Math.sin(ship.pitch) * cameraOffset.y + cameraOffset.y;
        const targetZ = ship.z + Math.sin(ship.angle) * cameraOffset.z;
        
        camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.1);
        camera.lookAt(new THREE.Vector3(ship.x, ship.y, ship.z));
    }
    
    // Update star field parallax
    if (GRAPHICS_QUALITY >= 1 && shipModel) {
        const positions = starField.geometry.attributes.position;
        for (let i = 0; i < stars.length; i++) {
            const star = stars[i];
            const distance = Math.hypot(star.x - ship.x, star.y - ship.y, star.z - ship.z) / FIELD_SIZE;
            const parallaxFactor = 0.5 + distance * 0.5;
            
            positions.setXYZ(i, 
                wrap(star.x + ship.vx * dt * parallaxFactor, FIELD_SIZE),
                wrap(star.y + ship.vy * dt * parallaxFactor, FIELD_SIZE),
                wrap(star.z + ship.vz * dt * parallaxFactor, FIELD_SIZE)
            );
        }
        positions.needsUpdate = true;
    }
    
    // Update nebula rotation
    if (nebula) {
        nebula.rotation.y += dt * 0.01;
    }
}

function wrap(v, max) {
    return ((v % max) + max) % max;
}

// ============================================
// RENDER
// ============================================

function render() {
    requestAnimationFrame(render);
    
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();
    
    if (state === 'playing' || state === 'starting') {
        update(delta, elapsed);
    }
    
    // Hide ship during invincibility blink
    if (shipModel && invincibleTimer > 0 && Math.floor(elapsed * 12) % 2 === 0) {
        shipModel.visible = false;
    } else if (shipModel) {
        shipModel.visible = true;
    }
    
    // Flash effect for invincibility
    if (invincibleTimer > 0 && shipModel) {
        const intensity = 0.5 + Math.sin(elapsed * 8) * 0.5;
        shipModel.children[0].material.emissiveIntensity = intensity;
    } else if (shipModel) {
        shipModel.children[0].material.emissiveIntensity = 0.3;
    }
    
    renderer.render(scene, camera);
}

// ============================================
// UI
// ============================================

const el = id => document.getElementById(id);
const scoreEl = el('score-value'), waveEl = el('wave-value'), highEl = el('highscore-value');
const livesContainer = el('lives-container');

function updateHud() {
    if (scoreEl) scoreEl.textContent = score;
    if (waveEl) waveEl.textContent = wave;
    if (highEl) highEl.textContent = Math.max(highScore, score);
    drawLives();
}

function drawLives() {
    if (!livesContainer) return;
    
    livesContainer.innerHTML = '';
    
    for (let i = 0; i < Math.min(lives, 5); i++) {
        const life = document.createElement('div');
        life.className = 'life-icon';
        livesContainer.appendChild(life);
    }
    
    if (lives > 5) {
        const extra = document.createElement('span');
        extra.textContent = ` +${lives - 5}`;
        extra.style.color = '#ffd15a';
        extra.style.marginLeft = '8px';
        livesContainer.appendChild(extra);
    }
}

function showScreen(name) {
    el('loading-screen').classList.add('hidden');
    el('main-menu').classList.toggle('visible', name === 'menu');
    el('game-container').style.display = name === 'game' ? 'block' : 'none';
    el('gameover-screen').classList.toggle('visible', name === 'gameover');
    el('pause-screen').classList.remove('visible');
    el('hud').style.display = name === 'game' ? 'flex' : 'none';
}

function showMenu() {
    state = 'menu';
    showScreen('menu');
    const mh = el('menu-highscore');
    if (mh) mh.textContent = highScore;
}

function startGame() {
    score = 0; wave = 1; lives = 3;
    nextExtraLife = EXTRA_LIFE_EVERY;
    resetGame();
    showScreen('game');
    state = 'starting';
    startWave(1);
}

function togglePause(force) {
    if (state !== 'playing' && state !== 'paused') return;
    const toPause = force != null ? force : state === 'playing';
    if (toPause) {
        state = 'paused';
        el('pause-screen').classList.add('visible');
        setThruster(false);
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
    
    if (audioThruster && audioThruster.gain) {
        audioThruster.gain.gain.value = 0;
    }
}

function toggleGraphics() {
    GRAPHICS_QUALITY = (GRAPHICS_QUALITY + 1) % 3;
    const value = ['BASSE', 'MOYENNE', 'ÉLEVÉE'][GRAPHICS_QUALITY];
    el('graphics-value').textContent = value;
    
    renderer.shadowMap.enabled = GRAPHICS_QUALITY >= 2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GRAPHICS_QUALITY === 0 ? 1 : 2));
    scene.traverse(obj => { if (obj.isMesh) obj.castShadow = GRAPHICS_QUALITY >= 2; });

}

function cleanupScene() {
    // Remove all objects
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
    asteroids = [];
    bullets = [];
    particles = [];
    stars = [];
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
    const sensitivitySlider = el('sensitivity-slider');
    const sensitivityValue = el('sensitivity-value');
    
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
    
    if (sensitivitySlider) {
        sensitivitySlider.value = sensitivity * 100;
        sensitivityValue.textContent = Math.round(sensitivity * 100) + '%';
        sensitivitySlider.addEventListener('input', () => {
            sensitivity = Number(sensitivitySlider.value) / 100;
            sensitivityValue.textContent = Math.round(sensitivity * 100) + '%';
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
    on('btn-hyperspace-ui', () => hyperspace());
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
        [36, 'Création de l\'univers...'],
        [54, 'Chargement des astéroïdes...'],
        [72, 'Préparation du vaisseau...'],
        [90, 'Calibration des systèmes...'],
        [100, 'Prêt pour le décollage.']
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
