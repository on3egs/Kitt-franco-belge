// ============================================
// KITT STUNT RACING — v7
// Style Stunt Car Racer / Knight Rider
// By Manix - Hommage au groupe KITT FRANCO BELGE
// Physique : Cannon.js 0.6.2 RaycastVehicle
// 3D : Three.js r128
// Audio : js/audio.js (WebAudio) — Scores : js/scores.js — Éditeur : js/editor.js
// ============================================

'use strict';

// Les téléphones et petits Jetson privilégient la fluidité. La physique reste
// à 60 Hz, mais le rendu est limité à 30 images/s, sans ombres 1024² ni
// sur-échantillonnage d'écran : cela évite le goulet GPU qui faisait laguer
// la course sur GSM sans dégrader le contrôle.
const LOW_POWER_MODE = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 700;
let lowPowerRenderFrame = 0;
let lowPowerVisualTime = 0;
let resizeFrame = 0;

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    gravity: -9.82,
    cameraFOV: 62,
    trackWidth: 11.5,              // chaussée élargie pour le duel KITT/KARR
    trackHeight: 0.4,
    carMass: 500,
    engineForce: 3800,          // accélération réduite pour une conduite plus maîtrisable
    maxSpeed: 38,               // vitesse normale (m/s ≈ 137 km/h)
    reverseSpeed: 8,            // vitesse max arrière (m/s)
    steerMax: 0.34,             // braquage réduit pour éviter les coups de volant
    turnRateMax: 0.82,          // lacet plus lent et plus facile à contrôler
    turboForceMult: 1.55,       // boost plus doux et contrôlable dans les virages
    turboSpeedMult: 1.24,       // pointe raisonnable, plafonnée par le limiteur
    turboDuration: 1.8,         // durée du turbo manuel (s)
    turboCooldown: 2.2,         // recharge turbo (s)
    pickupTurboDuration: 1.45,  // bouteille équilibrée hors longue ligne droite
    pickupStraightDuration: 2.05,// meilleur rendement uniquement sur une longue ligne droite
    pickupImpulse: 8.5,          // petit coup de pied contrôlable
    pickupStraightImpulse: 16,   // puissance réservée à une trajectoire bien alignée
    spmForceMult: 1.45,         // Super Pursuit Mode : puissance réservée au SPM
    spmSpeedMult: 1.75,
    karrSpeed: 23,              // vitesse de croisière de KARR (m/s)
    karrHealth: 5,
    karrReturnFire: false,      // KITT est le seul à tirer ; KARR poursuit sans mitrailler le joueur
    karrShootInterval: 8,
    karrProjectileSpeed: 38,
    karrProjectileLife: 1.65,
    playerShootInterval: 0.48,
    brakeForce: 20,
    rollingBrake: 0.8,          // freinage moteur au relâchement
    // RACER PREMIUM - Configuration des nouveaux effets
    turboFOVBoost: 13,          // élargissement FOV pendant le turbo
    karrWarningDistance: 40,    // alerte KARR (m)
    karrCloseDistance: 15,      // danger proche KARR (m)
    karrProximityCooldown: 1.5, // cooldown bip proximité KARR (s)
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
let scannerGlowSprite = null;
let turboFlames = [];
let wheelMeshes = [];
const wheelBaseQuat = window.THREE ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2) : null;
let legacyCarRuntime = null;

let keys = {};
let trackPath = { x: 0, z: 0, y: 0, yaw: 0 };
let trackLine = [];           // ligne de centre (waypoints autodrive)
let activeTrackScale = 1;     // allonge les circuits intégrés sans déformer les circuits personnalisés
let currentLevel = 1;
const LEVEL_DATA = {};        // 1: {line, checkpoints, finish, spawn} — construit une fois au démarrage
const LOOP_DATA = {};         // données de boucle par niveau (niveau 3)
const LEVEL_OFFSET_X = 420;   // décalage spatial entre niveaux (les pistes coexistent)
const CHALLENGE_THEMES = {
    5: { name: 'FOUDRE', color: 0x58eaff, label: '#58eaff', motif: 'lightning' },
    6: { name: 'NÉON', color: 0xd66aff, label: '#d66aff', motif: 'neon' },
    7: { name: 'PONT SUSPENDU', color: 0xffd277, label: '#ffd277', motif: 'bridge' },
    8: { name: 'INCENDIE', color: 0xff5b36, label: '#ff5b36', motif: 'fire' },
    9: { name: 'ORBITE', color: 0x68aaff, label: '#68aaff', motif: 'orbit' },
    10: { name: 'FINALE', color: 0xffe6a0, label: '#ffe6a0', motif: 'finale' }
};
let buildingLevel = 1;
let checkpoints = [];       // {x, y, z, yaw, mesh}
let nextCp = 0;
let respawnPoint = { x: 0, y: 1.0, z: 5, yaw: 0 };
let finishZone = null;      // {x, y, z, yaw}
let finishArch = null;
let turboPickups = [];
let spmPickups = [];
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
let karrHitProtectionUntil = 0;
let playerShootTimer = 0;
let projectiles = [];
// Trafic de course léger : voitures cinématiques sur la géométrie de piste,
// avec collisions vérifiées contre le joueur (aucun corps Cannon additionnel).
let raceTraffic = [];
let raceTrafficPathDistance = [];
let raceTrafficPathLength = 0;
let raceTrafficPlayerDistance = 0;
let raceTrafficProjectionTimer = 0;
let carDamageParts = Object.create(null);
let detachedCarParts = [];
let karrStatusEl = null;
let driverSelectEl = null;
let pendingRaceLevel = 1;
let selectedDriverId = localStorage.getItem('kx-racer-driver') || 'manix';
let selectedDriver = null;
let careerRunActive = false;
const CAREER_LEVELS = [1, 2, 3, 5, 6, 7, 8, 9, 10];
const CAREER_KEY = 'kxRacerCareerClearedV1';

// Entrées mobiles : elles alimentent la même boucle physique que le clavier.
const mobileInput = { left:false, right:false, accelerate:false, brake:false };
let mobileControlMode = 'touch';
let gyroGamma = 0;
let gyroNeutral = 0;
let gyroReady = false;
let gyroLastEventAt = 0;
let gyroActivationTimer = 0;

// Profils légers : les portraits sont dessinés en CSS, les voitures réutilisent
// le modèle déjà chargé afin de ne pas ralentir le Jetson.
const DRIVER_PROFILES = [
    { id:'cedric', name:'CÉDRIC MOMO RIDER', region:'France', flag:'🇫🇷', portrait:'cedric', photo:'assets/portrait-cedric-uniform.jpg', photoPosition:'50% 42%', car:'KARR', carClass:'karr-cedric', desc:'KARR noir et bas de caisse gris', story:"Dans la légende de Racer, Cédric dirige une société de location de voitures pour le cinéma. Il adore les cascades et, quand il s'échauffe, son frein à main déclenche un tête-à-queue spectaculaire. Garde un virage d'avance !" },
    { id:'kr95', name:'KR-95', region:'Pontiac / concept', flag:'🇺🇸', portrait:'kr95', photo:'assets/portrait-frank-uniform.jpg?v=20261113-frank', photoPosition:'50% 42%', car:'KR-95', carClass:'kr95', desc:'Voiture rouge de la photo de référence', story:'KR-95 reprend la voiture rouge de la photo de référence et son pilote officiel. Une machine spectaculaire, conçue pour les lignes droites et les arrivées lumineuses.' },
    { id:'frank', name:'FRANK', region:'France', flag:'🇫🇷', portrait:'frank', photo:'assets/portrait-frank-uniform.jpg', photoPosition:'50% 42%', car:'K-4000', carClass:'k4000', desc:'Pontiac grise de poursuite', story:'Frank mise sur la puissance de sa Pontiac grise. Avec le K-4000, il aime les poursuites serrées et les arrivées décidées au dernier virage.' },
    { id:'dadoo', name:'DADOO', region:'Corse / Marseille', flag:'🏴', portrait:'dadoo', photo:'assets/portrait-dadoo-uniform.jpg', photoPosition:'50% 42%', car:'KARR', carClass:'karr-black', desc:'KARR entièrement noire', story:'Web designer, Dadoo parcourt le circuit comme une maquette vivante : il vérifie les lumières, les lignes et chaque détail. Il est là pour que tout soit aussi beau en mouvement qu’à l’écran.' },
    { id:'pascal-ki', name:'Pascal K-Industries', region:'Portugal', flag:'🇵🇹', portrait:'pascal-ki', photo:'assets/portrait-pascal-ki-uniform.jpg?v=20261113-correct', photoPosition:'50% 42%', car:'Trans Am cabriolet', carClass:'convertible', desc:'Pontiac rouge décapotable', story:'D’origine portugaise, Pascal dirige un atelier spécialisé dans la réparation des voitures K2000. Sa Pontiac rouge est entretenue aux petits oignons, mais son arme favorite reste le Turbo Boost.' },
    { id:'manix', name:'MANIX', region:'Belgique', flag:'🇧🇪', portrait:'manix', photo:'assets/pilot-manix-racer.jpg', photoPosition:'50% 42%', car:'KITT', carClass:'manix', desc:'Trans Am Legacy, scanner rouge', story:'Manix est le pilote d’essai : il vérifie que chaque fonction répond comme prévu. Dans la fiction de Racer, ses gadgets KARR peuvent brouiller le tableau de bord adverse et semer la pagaille — uniquement dans le jeu !' },
    { id:'pascal-ferron', name:'PASCAL FERRON', region:'Belgique', flag:'🇧🇪', portrait:'pascal-ferron', photo:'assets/portrait-pascal-ferron-uniform.jpg', photoPosition:'50% 42%', car:'KITT / K2000', carClass:'kitt', desc:'Pontiac Trans Am noire classique', story:'Pascal Ferron vient de Belgique et préfère arriver avec une carrosserie intacte. Il anticipe les obstacles, choisit sa trajectoire et fait tout pour éviter les accrochages. À toi de réussir à le suivre !' },
    { id:'john', name:'RIDERS JOHN', region:'France', flag:'🇫🇷', portrait:'john', photo:'assets/portrait-rider-j-uniform.jpg', photoPosition:'50% 42%', car:'Pontiac grise', carClass:'pontiac-grey', desc:'Pontiac grise', story:'Dans le sud de la France, John a toujours un grand cœur et un coup de main à offrir. Le petit problème, c’est qu’il finit souvent une aventure avec une voiture en pièces… et une nouvelle liste de réparations.' },
    { id:'anthony-douman', name:'ANTHONY DOUMENG', region:'Toulouse, France', flag:'🇫🇷', portrait:'anthony-douman', photo:'assets/anthony-douman-uniform.jpg', photoPosition:'50% 38%', car:'KITT / K2000', carClass:'kitt', desc:'Pilote de Toulouse' },
    { id:'guy-chapelier', name:'GUY CHAPELLIER', region:'France', flag:'🇫🇷', portrait:'guy-chapelier', photo:'assets/pilot-guy-chapellier-uniform.webp?v=20261113-guy', photoPosition:'50% 32%', car:'KITT / K2000', carClass:'kitt', desc:'La voix française officielle de KITT', story:'La voix française de KITT prend ici le volant. Guy garde son calme dans les virages et laisse la voiture parler pour lui.' },
    { id:'laetitia', name:'LAETITIA', region:'France', flag:'🇫🇷', portrait:'laetitia', car:'KITT', carClass:'kitt', desc:'Pilote précise et déterminée', story:'Laetitia préfère les trajectoires propres aux gestes inutiles. Précise et déterminée, elle construit sa course virage après virage.' },
    { id:'elsa', name:'ELSA', region:'France', flag:'🇫🇷', portrait:'elsa', photo:'assets/pilot-elsa-racer.jpg', photoPosition:'50% 42%', car:'KARR', carClass:'karr-black', desc:'Pilote rapide et élégante', story:'Elsa allie vitesse et élégance. Son KARR noir semble glisser sur l’asphalte : ne la quitte pas des yeux dans les enchaînements.' },
    { id:'virginie', name:'VIRGINIE', region:'Belgique', flag:'🇧🇪', portrait:'virginie', photo:'assets/portrait-virginie-uniform.jpg', photoPosition:'50% 42%', car:'KARR', carClass:'karr-black', desc:'KARR noir et argent, scanner ambre', story:'Ne te fie pas à son sourire malicieux : Virginie se bat pour chaque virage. Dans la légende du circuit, elle peut te pousser vers le fossé — alors garde une marge et protège ta trajectoire !' },
    { id:'bastien', name:'BASTIEN', region:'Belgique', flag:'🇧🇪', portrait:'bastien', photo:'assets/pilot-bastien-racer.jpg', photoPosition:'50% 42%', car:'Pontiac grise', carClass:'pontiac-grey', desc:'Pilote offensif et régulier', story:'Bastien attaque sans perdre son rythme. Sa Pontiac grise est faite pour les courses régulières où chaque dépassement compte.' },
    { id:'lilou', name:'LILOU', region:'Belgique', flag:'🇧🇪', portrait:'lilou', photo:'assets/pilot-lilou-racer.jpg', photoPosition:'50% 42%', car:'Banshee IV', carClass:'kr95', desc:'Pilote vive et imprévisible', story:'Vive et imprévisible, Lilou adore changer de ligne au dernier instant. Avec la Banshee IV, impossible de deviner son prochain mouvement.' },
    { id:'alexia', name:'ALEXIA', region:'Belgique', flag:'🇧🇪', portrait:'alexia', photo:'assets/pilot-alexia-racer.jpg', photoPosition:'50% 42%', car:'KITT', carClass:'manix', desc:'Pilote concentrée et audacieuse', story:'Alexia reste concentrée même quand la course s’emballe. Audacieuse au bon moment, elle sait quand tenter le dépassement décisif.' },
    { id:'maeva', name:'MAËVA', region:'France', flag:'🇫🇷', portrait:'maeva', car:'Trans Am', carClass:'convertible', desc:'Pilote souple et instinctive', story:'Maëva conduit à l’instinct et adapte sa trajectoire à chaque surprise. Sa Trans Am aime les changements de rythme.' },
    { id:'laura', name:'LAURA', region:'Belgique', flag:'🇧🇪', portrait:'laura', photo:'assets/pilot-laura-racer.jpg', photoPosition:'50% 42%', car:'KARR', carClass:'karr-cedric', desc:'Pilote technique et combative', story:'Laura analyse le circuit et ne lâche rien. Technique et combative, elle transforme chaque virage en occasion de reprendre du terrain.' }
];

function driverCarPreviewMarkup(profile, extraClass = '') {
    const label = `${profile.car} // ${profile.name}`;
    return `<div class="driver-car-preview ${profile.carClass} ${extraClass}" role="img" aria-label="Aperçu stylisé de ${label}"><div class="mini-car-roof" aria-hidden="true"></div><div class="mini-car-body" aria-hidden="true"></div><div class="mini-car-scanner" aria-hidden="true"></div><i aria-hidden="true"></i><i aria-hidden="true"></i><b aria-hidden="true">${profile.car}</b></div>`;
}

// Précharge les portraits et les aperçus de voitures pendant l'écran de menu.
// Les fiches restent lazy dans le DOM, mais une sélection tactile n'attend plus
// le téléchargement de l'image au dernier moment.
function warmDriverAssets() {
    const urls = new Set();
    DRIVER_PROFILES.forEach(profile => {
        if (profile.photo) urls.add(/^(?:\/|https?:|assets\/)/i.test(profile.photo) ? profile.photo : `assets/${profile.photo}`);
    });
    const loadNext = () => {
        const url = urls.values().next().value;
        if (!url) return;
        urls.delete(url);
        const image = new Image();
        image.decoding = 'async';
        image.onload = image.onerror = () => {
            if (window.requestIdleCallback) window.requestIdleCallback(loadNext, { timeout: 120 });
            else window.setTimeout(loadNext, 20);
        };
        image.src = url;
    };
    // Le menu apparaît immédiatement ; le préchargement passe après le premier
    // rendu afin de ne pas ralentir le démarrage WebGL.
    window.setTimeout(loadNext, 450);
}

const DRIVER_POWER = {
    cedric:225, kr95:230, frank:275, dadoo:225, 'pascal-ki':245,
    manix:245, 'pascal-ferron':245, john:220, laetitia:245, elsa:225,
    virginie:275, bastien:220, lilou:230, alexia:245, maeva:245, laura:225, 'guy-chapelier':245
};

let driverFilter = 'all';
let driverSearchTerm = '';

function driverVehicleFamily(profile) {
    if (profile.carClass === 'kitt' || profile.carClass === 'manix') return 'kitt';
    if (profile.carClass === 'karr-black' || profile.carClass === 'karr-cedric') return 'karr';
    return 'other';
}

function normalizeDriverSearch(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
}

function getVisibleDrivers() {
    const query = normalizeDriverSearch(driverSearchTerm);
    return DRIVER_PROFILES.filter(profile => {
        const matchesFamily = driverFilter === 'all' || driverVehicleFamily(profile) === driverFilter;
        const searchable = normalizeDriverSearch(`${profile.name} ${profile.car} ${profile.region} ${profile.desc}`);
        return matchesFamily && (!query || searchable.includes(query));
    });
}

function getDriver(id) {
    return DRIVER_PROFILES.find(p => p.id === id) || DRIVER_PROFILES.find(p => p.id === 'manix');
}

// Les noms sont pré-générés localement avec la voix Manix et restent légers
// pour le tactile : un seul élément Audio est réutilisé par pilote.
const pilotVoiceCache = new Map();
function playPilotVoice(profile, afterPlayback) {
    if (!profile) return;
    if(profile.id==='anthony-douman'){speakLocalFallback(profile.name,afterPlayback);return;}
    let audio = pilotVoiceCache.get(profile.id);
    if (!audio) {
        const cacheVersion = profile.id === 'frank' ? '?v=frank-dadoo-reference-20260921-2055' : (profile.id === 'virginie' ? '?v=virginie-pronunciation1' : '');
        const url = new URL(`audio/pilots/${encodeURIComponent(profile.id)}.wav${cacheVersion}`, document.baseURI).href;
        audio = new Audio(url);
        audio.preload = 'auto';
        audio.volume = 1;
        pilotVoiceCache.set(profile.id, audio);
    }
    audio.currentTime = 0;
    audio.load();
    if (window.KA) KA.setVoiceDucking(true);
    audio.onended = () => {
        audio.onended = null;
        if (window.KA) KA.setVoiceDucking(false);
        if (afterPlayback) afterPlayback();
    };
    audio.play().catch(error => {
        console.warn('[PILOT VOICE]', profile.id, error);
        audio.onended = null;
        if (window.KA) KA.setVoiceDucking(false);
        if (afterPlayback) afterPlayback();
    });
}

function speakDriverScore(profile) {
    if (!profile || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
    const stats = window.KS?.getDriverStats?.(profile.id);
    if (!stats) return;
    let text;
    if (!stats.races) {
        text = `${profile.name} n'a pas encore marqué de points. Aucune course n'est enregistrée pour ce pilote.`;
    } else {
        const female = FEMALE_PILOTS.has(profile.id);
        const rankWords = ['','premier','deuxième','troisième','quatrième','cinquième','sixième','septième','huitième','neuvième','dixième'];
        const place = stats.position === 1 ? (female ? 'première' : 'premier')
            : stats.position === stats.drivers && stats.drivers > 1 ? (female ? 'dernière' : 'dernier')
            : rankWords[stats.position] || `${stats.position}e`;
        const subject = female ? 'Elle est' : 'Il est';
        text = `${stats.points} ${stats.points > 1 ? 'points' : 'point'} en ${stats.races} ${stats.races > 1 ? 'courses' : 'course'}. ${subject} ${place} sur ${stats.drivers} ${stats.drivers > 1 ? 'pilotes' : 'pilote'} au classement.`;
    }
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'fr-FR';
        utterance.rate = 0.94;
        utterance.pitch = FEMALE_PILOTS.has(profile.id) ? 1.08 : 0.96;
        utterance.volume = 0.95;
        const voices = window.speechSynthesis.getVoices() || [];
        const french = voices.filter(voice => /^fr/i.test(voice.lang || ''));
        const preferred = FEMALE_PILOTS.has(profile.id)
            ? french.find(voice => /female|femme|audrey|hortense|amelie|amélie|julie/i.test(voice.name))
            : french.find(voice => /male|homme|thomas|henri|paul/i.test(voice.name));
        if (preferred || french[0]) utterance.voice = preferred || french[0];
        window.speechSynthesis.speak(utterance);
    } catch (error) { console.warn('[DRIVER SCORE VOICE]', error); }
}

const driverStoryAudioCache = new Map();
let activeDriverStoryAudio = null;
function speakDriverStory(profile) {
    if (!profile?.story) return;
    if(['laetitia','maeva'].includes(profile.id)){speakLocalFallback(profile.story);return;}
    const button = document.querySelector('[data-driver-story]');
    let audio = driverStoryAudioCache.get(profile.id);
    if (!audio) {
        const storyVersion = profile.id === 'frank' ? 'guy-hd-frank-pronunciation-20260920-2' : 'guy-hd-20260920-1';
        const url = new URL(`audio/stories/${encodeURIComponent(profile.id)}.wav?v=${storyVersion}`, document.baseURI).href;
        audio = new Audio(url);
        audio.preload = 'none';
        audio.volume = 1;
        audio.onended = () => {
            if (activeDriverStoryAudio === audio) activeDriverStoryAudio = null;
            const currentButton = document.querySelector('[data-driver-story]');
            if (currentButton) currentButton.textContent = '▶ ÉCOUTER SA LÉGENDE';
        };
        audio.onerror = () => {
            if (activeDriverStoryAudio === audio) activeDriverStoryAudio = null;
            const currentButton = document.querySelector('[data-driver-story]');
            if (currentButton) currentButton.textContent = 'SON INDISPONIBLE';
            console.warn('[PILOT STORY AUDIO]', profile.id, audio.error);
        };
        driverStoryAudioCache.set(profile.id, audio);
    }
    if (activeDriverStoryAudio && activeDriverStoryAudio !== audio) {
        activeDriverStoryAudio.pause();
        activeDriverStoryAudio.currentTime = 0;
    }
    if (activeDriverStoryAudio === audio && !audio.paused) {
        audio.pause();
        if (button) button.textContent = '▶ REPRENDRE LA LÉGENDE';
        return;
    }
    activeDriverStoryAudio = audio;
    audio.play().then(() => {
        const currentButton = document.querySelector('[data-driver-story]');
        if (currentButton) currentButton.textContent = '⏸ METTRE EN PAUSE';
    }).catch(error => {
        if (activeDriverStoryAudio === audio) activeDriverStoryAudio = null;
        const currentButton = document.querySelector('[data-driver-story]');
        if (currentButton) currentButton.textContent = '▶ RÉESSAYER LA LÉGENDE';
        console.warn('[PILOT STORY AUDIO]', profile.id, error);
    });
}

function stopDriverStoryAudio() {
    if (!activeDriverStoryAudio) return;
    activeDriverStoryAudio.pause();
    activeDriverStoryAudio.currentTime = 0;
    activeDriverStoryAudio = null;
}

const FEMALE_PILOTS = new Set(['laetitia','elsa','virginie','lilou','alexia','maeva','laura']);
const GUY_PILOT = 'guy-chapelier';
const raceVoiceCache = new Map();
let lastCrashVoiceAt = 0;
let lastCrashVoiceKind = '';
function playRaceVoice(kind) {
    // Il n'existe qu'une annonce SPM masculine et une version Guy : toutes
    // les pilotes utilisent donc une voix disponible au lieu d'un 404 audio.
    const suffix = kind === 'spm'
        ? (selectedDriver?.id === GUY_PILOT ? 'guy' : 'male')
        : (selectedDriver?.id === GUY_PILOT ? 'guy' : (FEMALE_PILOTS.has(selectedDriver?.id) ? 'female' : 'male'));
    const key = `${kind}-${suffix}`;
    let audio = raceVoiceCache.get(key);
    if (!audio) {
        audio = new Audio(new URL(`audio/pilots/${key}.wav`, document.baseURI).href);
        audio.preload = 'auto'; audio.volume = 1;
        raceVoiceCache.set(key, audio);
    }
    audio.currentTime = 0;
    if (window.KA) KA.setVoiceDucking(true);
    audio.onended = () => { audio.onended = null; if (window.KA) KA.setVoiceDucking(false); };
    audio.play().catch(error => {
        console.warn('[RACE VOICE]', key, error);
        audio.onended = null;
        if (window.KA) KA.setVoiceDucking(false);
        if (kind === 'spm' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance('Activation du S.P.M !');
            utterance.lang = 'fr-FR';
            utterance.rate = .88;
            const frenchVoice = window.speechSynthesis.getVoices().find(voice => voice.lang?.toLowerCase().startsWith('fr'));
            if (frenchVoice) utterance.voice = frenchVoice;
            window.speechSynthesis.speak(utterance);
        }
    });
}

function playCrashVoice() {
    const now = Date.now();
    if (now - lastCrashVoiceAt < 4500) return;
    lastCrashVoiceAt = now;
    let variant = 1 + Math.floor(Math.random() * 3);
    if (String(variant) === lastCrashVoiceKind) variant = (variant % 3) + 1;
    lastCrashVoiceKind = String(variant);
    playRaceVoice(`crash-${variant}`);
}

function speakRacerIntro() {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance('KYRONEXT présente ! Knight Racer');
    utterance.lang = 'fr-FR';
    utterance.rate = 0.86;
    utterance.pitch = 0.95;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const frenchVoice = voices.find(voice => voice.lang && voice.lang.toLowerCase().startsWith('fr'));
    if (frenchVoice) utterance.voice = frenchVoice;
    window.speechSynthesis.speak(utterance);
}

function portraitMarkup(profile, large = false) {
    const index = Math.max(0, DRIVER_PROFILES.findIndex(item => item.id === profile.id));
    const column = index % 5, row = Math.floor(index / 5);
    const x = (column / 4) * 100, y = (row / 3) * 100;
    const fallback = profile.photo ? ` onerror="this.onerror=null;this.closest('.driver-portrait')?.classList.remove('has-dossier-art');this.remove();"` : '';
    const image = profile.photo ? `<img src="${profile.photo}" alt="" aria-hidden="true" loading="lazy" decoding="async"${fallback}>` : '';
    const imageClass = profile.photo ? ' has-dossier-art' : '';
    const imagePosition = profile.photoPosition ? `;--driver-photo-position:${profile.photoPosition}` : '';
    const label = profile.photo ? `Illustration du dossier ${profile.name}` : `Portrait fictif de ${profile.name}`;
    return `<div class="driver-portrait ${profile.portrait}${imageClass}${large ? ' large' : ''}" role="img" aria-label="${label}" style="--portrait-x:${x}%;--portrait-y:${y}%${imagePosition}">${image}</div>`;
}

function setupDriverSelection() {
    driverSelectEl = document.getElementById('driver-select');
    if (!driverSelectEl) return;
    const back = document.getElementById('driver-back');
    const start = document.getElementById('driver-start');
    const grid = document.getElementById('driver-grid');
    const search = document.getElementById('driver-search');
    const filters = document.querySelector('.driver-filter-row');
    if (back) back.addEventListener('click', () => { stopDriverStoryAudio(); backToMenu(); });
    if (start) start.addEventListener('click', () => { stopDriverStoryAudio(); showDriverLaunchPresentation(pendingRaceLevel); });
    if (grid) grid.addEventListener('click', event => {
        const card = event.target.closest('[data-driver]');
        if (card && grid.contains(card)) selectDriver(card.dataset.driver);
    });
    driverSelectEl.addEventListener('click', event => {
        if (event.target.closest('[data-driver-story]')) {
            speakDriverStory(selectedDriver);
            return;
        }
        // La photo et la fiche sont des zones vocales explicites. Le bouton
        // « écouter la légende » reste la seule action dédiée à l'histoire.
        if (event.target.closest('.driver-detail-panel .driver-portrait, .driver-detail-copy')) {
            playPilotVoice(selectedDriver);
        }
    });
    if (search) search.addEventListener('input', () => {
        driverSearchTerm = search.value;
        renderDriverSelection();
    });
    if (filters) filters.addEventListener('click', event => {
        const button = event.target.closest('[data-driver-filter]');
        if (!button || !filters.contains(button)) return;
        driverFilter = button.dataset.driverFilter;
        filters.querySelectorAll('[data-driver-filter]').forEach(item => {
            const active = item === button;
            item.classList.toggle('active', active);
            item.setAttribute('aria-pressed', String(active));
        });
        renderDriverSelection();
    });
    renderDriverSelection();
    warmDriverAssets();
}

function renderDriverSelection() {
    if (!driverSelectEl) return;
    selectedDriver = getDriver(selectedDriverId);
    const grid = document.getElementById('driver-grid');
    const detail = document.getElementById('driver-detail');
    if (grid) {
        const visibleDrivers = getVisibleDrivers();
        const count = document.getElementById('driver-result-count');
        const empty = document.getElementById('driver-empty-state');
        if (count) count.textContent = `${visibleDrivers.length} pilote${visibleDrivers.length === 1 ? '' : 's'} sur ${DRIVER_PROFILES.length}`;
        if (empty) empty.classList.toggle('hidden', visibleDrivers.length > 0);
        grid.innerHTML = visibleDrivers.map(p => `<button type="button" class="driver-card ${p.id === selectedDriver.id ? 'selected' : ''}" data-driver="${p.id}" aria-pressed="${p.id === selectedDriver.id}" aria-label="Sélectionner ${p.name}, véhicule ${p.car}">
            ${portraitMarkup(p)}${p.id === selectedDriver.id ? '<span class="driver-card-selected">CHOISI</span>' : ''}<span class="driver-card-name">${p.name}</span>
            <span class="driver-card-region">${p.flag} ${p.region}</span>
            <span class="driver-card-car">${p.car}</span>
        </button>`).join('');
    }
    if (detail) {
        const oldStage = detail.parentElement && detail.parentElement.querySelector('.driver-car-stage');
        if (oldStage) oldStage.remove();
        const power = DRIVER_POWER[selectedDriver.id] || 225;
        const stats = window.KS?.getDriverStats?.(selectedDriver.id);
        const races = Number(stats?.races) || 0;
        const points = Number(stats?.points) || 0;
        const family = driverVehicleFamily(selectedDriver);
        const familyName = family === 'kitt' ? 'ÉQUIPE KITT' : family === 'karr' ? 'ÉQUIPE KARR' : 'AUTRES MACHINES';
        detail.innerHTML = `${portraitMarkup(selectedDriver, true)}
            <div class="driver-detail-copy"><div class="driver-detail-kicker">PILOTE SÉLECTIONNÉ</div>
            <h2>${selectedDriver.name}</h2><p>${selectedDriver.flag} ${selectedDriver.region}</p>
            <span class="driver-family-tag">${familyName}</span>
            <div class="driver-car-chip">VÉHICULE <b>${selectedDriver.car}</b></div>
            <small>${selectedDriver.desc}</small>
            <div class="driver-story-block"><div class="driver-story-kicker">LÉGENDE DU CIRCUIT // FICTION</div><p>${selectedDriver.story || selectedDriver.desc}</p>
            <button type="button" class="driver-story-listen" data-driver-story>▶ ÉCOUTER SA LÉGENDE</button></div></div>`;
        detail.insertAdjacentHTML('beforeend', `<div class="driver-stat-row" aria-label="Statistiques du pilote">
            <div><b>${power} CH</b><span>PUISSANCE</span></div>
            <div><b>${races}</b><span>COURSES</span></div>
            <div><b>${points}</b><span>POINTS</span></div>
        </div>`);
        detail.insertAdjacentHTML('afterend', `<div class="driver-car-stage">${driverCarPreviewMarkup(selectedDriver)}</div>`);
    }
    applyDriverVehicle(selectedDriver.id);
}

function renderDriverHud() {
    const badge = document.getElementById('driver-hud-badge');
    if (!badge || !selectedDriver) return;
    const power = DRIVER_POWER[selectedDriver.id] || 225;
    badge.innerHTML = `${portraitMarkup(selectedDriver)}<span><b>${selectedDriver.name}</b><small>${selectedDriver.car} · ${power} CH</small><em id="driver-distance">0.00 KM</em></span>`;
}

function updateDriverTelemetry() {
    if (!carBody || !odometerReady) return;
    const dx = carBody.position.x - lastOdometerX;
    const dz = carBody.position.z - lastOdometerZ;
    raceDistance += Math.hypot(dx, dz);
    lastOdometerX = carBody.position.x;
    lastOdometerZ = carBody.position.z;
    if (distanceEl) distanceEl.textContent = `${(raceDistance / 1000).toFixed(2)} KM`;
}

function selectDriver(id) {
    stopDriverStoryAudio();
    selectedDriverId = getDriver(id).id;
    selectedDriver = getDriver(selectedDriverId);
    localStorage.setItem('kx-racer-driver', selectedDriverId);
    renderDriverSelection();
    initAudio();
    if (window.KA) KA.sfx.pilotSelect();
    pilotVoiceCache.forEach(audio => { audio.pause(); audio.currentTime = 0; audio.onended = null; });
    if (window.KA) KA.setVoiceDucking(false);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (window.matchMedia('(max-width: 800px)').matches) {
        requestAnimationFrame(() => document.querySelector('.driver-detail-panel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }
    const profile = selectedDriver;
    playPilotVoice(profile);
}

function openDriverSelect(level) {
    stopDriverStoryAudio();
    pendingRaceLevel = Number.isInteger(Number(level)) ? Number(level) : currentLevel;
    selectedDriver = getDriver(selectedDriverId);
    state = 'select';
    paused = false;
    initAudio();
    if (window.KA) { KA.setMusicScene('pilot'); KA.sfx.menuOpen(); }
    if (driverSelectEl) driverSelectEl.classList.remove('hidden');
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('results-screen').classList.add('hidden');
    if (karrMesh) karrMesh.visible = false;
    clearProjectiles();
    renderDriverSelection();
    playPilotVoice(selectedDriver);
}

let raceTime = 0;
let raceStartTime = 0;
let raceLapStartTime = 0;
let raceElapsedBeforeLap = 0;
const RACE_LAPS = 3;
let currentRaceLap = 1;
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
let speedEl, timerEl, checkpointEl, messagesEl, debugEl, turboFillEl, countdownEl, distanceEl;
let hudMessageTimer = 0;
let raceDistance = 0, lastOdometerX = 0, lastOdometerZ = 0, odometerReady = false;
let speedLinesEl, damageFlashEl, turboVignetteEl, impactFlashEl, gameCanvasEl;
let lastTurboPremiumVisual = null;
let raceForwardScratch = null, raceUpScratch = null;
let spmIndicatorEl;
let raceRadarCanvas = null, raceRadarCtx = null, raceRadarGapEl = null, raceRadarLevelEl = null;
let raceRadarNextEl = null, raceRadarProgressBar = null, raceRadarProgressLabel = null;
let raceRadarLineRef = null, raceRadarBounds = null, raceRadarLastDraw = 0;

// V7 — environnement animé / effets
let sunLight = null;
let groundTexRef = null;
let auroraPlanes = [];
let antennaLights = [];
let neonPulseMats = [];
let camShake = 0;
let prevVelY = 0;
let wasGrounded = false;
let landingEffectCooldown = 0;
let trailEmissionTimer = 0;
let turboSparkTimer = 0;
let turboSmokeTimer = 0;
let lastDustT = 0;
let lastShootingStar = 0;

// RACER PREMIUM - état léger
let karrProximityState = 'normal'; // normal | warning | close
let karrProximityCooldown = 0;
let lastCollisionSoundAt = 0;
let lastImpactVisualAt = 0;
let lastPartDamageAt = 0;

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

    // Texture de route : asphalte dégradé + grains + traces de pneus +
    // bordures « kerb » rouges/blanches en damier + liserés blancs.
    // Une seule texture source partagée par tous les segments (clone + repeat).
    const rc = document.createElement('canvas');
    rc.width = 128; rc.height = 256;
    const rg = rc.getContext('2d');
    const aspGrad = rg.createLinearGradient(0, 0, 128, 0);
    aspGrad.addColorStop(0, '#12151d');
    aspGrad.addColorStop(0.5, '#1d212b');
    aspGrad.addColorStop(1, '#12151d');
    rg.fillStyle = aspGrad;
    rg.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 1600; i++) {
        rg.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.11)';
        rg.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
    }
    // usure centrale (traces de pneus)
    rg.fillStyle = 'rgba(0,0,0,0.16)';
    rg.fillRect(40, 0, 14, 256); rg.fillRect(74, 0, 14, 256);
    // bordures kerb rouges/blanches en damier
    for (let y = 0; y < 256; y += 32) {
        rg.fillStyle = (y / 32) % 2 ? '#a01220' : '#c8ccd4';
        rg.fillRect(0, y, 9, 32);
        rg.fillRect(119, y, 9, 32);
    }
    // liserés blancs
    rg.fillStyle = '#c7ccd6'; rg.fillRect(11, 0, 3, 256); rg.fillRect(114, 0, 3, 256);
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

    // Façade urbaine procédurale : plusieurs étages, cadres, corniches et
    // fenêtres éclairées. Une seule texture par façade conserve le coût d'un
    // seul mesh par immeuble tout en donnant une vraie lecture architecturale.
    const wc = document.createElement('canvas');
    wc.width = 256; wc.height = 512;
    const wg = wc.getContext('2d');
    const facade = wg.createLinearGradient(0, 0, 256, 0);
    facade.addColorStop(0, '#111a2a');
    facade.addColorStop(.16, '#263147');
    facade.addColorStop(.5, '#354056');
    facade.addColorStop(.84, '#202a3d');
    facade.addColorStop(1, '#0b1220');
    wg.fillStyle = facade;
    wg.fillRect(0, 0, 256, 512);
    // Pilastres et joints de panneaux : ils donnent une échelle aux volumes.
    for (let x = 0; x <= 256; x += 64) {
        wg.fillStyle = 'rgba(5,9,18,.68)'; wg.fillRect(x, 0, 5, 512);
        wg.fillStyle = 'rgba(150,183,220,.13)'; wg.fillRect(x + 5, 0, 2, 512);
    }
    for (let y = 0; y <= 512; y += 42) {
        wg.fillStyle = 'rgba(3,7,15,.7)'; wg.fillRect(0, y, 256, 5);
        wg.fillStyle = 'rgba(152,174,206,.12)'; wg.fillRect(0, y + 5, 256, 2);
    }
    // Bandeaux de toiture et socle, répétés avec le motif de façade.
    wg.fillStyle = '#65738a'; wg.fillRect(0, 8, 256, 5); wg.fillRect(0, 497, 256, 7);
    wg.fillStyle = 'rgba(0,0,0,.42)'; wg.fillRect(0, 14, 256, 5);
    const windowColors = ['#ffc978', '#a6dcff', '#ff7187', '#c3b5ff'];
    for (let y = 25; y < 488; y += 42) {
        for (let x = 13; x < 250; x += 32) {
            // Profondeur simulée par cadre, embrasure sombre et reflet intérieur.
            wg.fillStyle = 'rgba(3,6,13,.9)'; wg.fillRect(x - 3, y - 3, 23, 29);
            wg.fillStyle = 'rgba(173,194,220,.34)'; wg.fillRect(x - 2, y - 2, 21, 2);
            if (Math.random() < 0.43) {
                const color = windowColors[Math.floor(Math.random() * windowColors.length)];
                wg.fillStyle = color;
                wg.globalAlpha = .58 + Math.random() * .4;
                wg.fillRect(x, y, 15, 20);
                wg.globalAlpha = 1;
                wg.fillStyle = 'rgba(255,255,255,.32)'; wg.fillRect(x + 2, y + 2, 2, 15);
            } else {
                wg.fillStyle = '#101a2a'; wg.fillRect(x, y, 15, 20);
            }
            wg.fillStyle = 'rgba(4,8,16,.8)'; wg.fillRect(x + 7, y, 1, 20); wg.fillRect(x, y + 10, 15, 1);
        }
    }
    // Quelques panneaux lumineux de toit rendent la skyline identifiable.
    wg.fillStyle = 'rgba(255,35,65,.78)'; wg.fillRect(177, 26, 48, 4);
    wg.fillStyle = 'rgba(30,214,255,.66)'; wg.fillRect(23, 473, 38, 3);
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
        trailTex: markShared(new THREE.SpriteMaterial({
            map: radial('rgba(0,229,255,0.8)', 'rgba(0,100,255,0)'),
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
        })),
        // RACER PREMIUM - Nouveaux matériaux
        turboWaveTex: markShared(new THREE.SpriteMaterial({
            map: radial('rgba(255,60,60,0.9)', 'rgba(255,0,0,0)'),
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
        })),
        neonTrailTex: markShared(new THREE.SpriteMaterial({
            map: radial('rgba(255,0,100,0.8)', 'rgba(255,0,0,0)'),
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
        })),
        impactFlashTex: markShared(new THREE.SpriteMaterial({
            map: radial('rgba(255,255,255,1)', 'rgba(255,200,100,0)'),
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
        })),
        windowTex: windowTex,
        // Texture des barrières : bandes hazard rouges/blanches + liseré lumineux
        barrierTex: (function () {
            const c = document.createElement('canvas');
            c.width = 32; c.height = 64;
            const g = c.getContext('2d');
            g.fillStyle = '#8e0f1c'; g.fillRect(0, 0, 32, 64);
            g.fillStyle = '#e8ecf2';
            for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 32, 7);
            g.fillStyle = 'rgba(255,70,70,0.6)'; g.fillRect(0, 0, 32, 4);
            const t = new THREE.CanvasTexture(c);
            t.wrapT = THREE.RepeatWrapping;
            return t;
        })(),
        // Catadioptre rouge bord de piste
        eyeGlow: markShared(new THREE.SpriteMaterial({
            map: radial('rgba(255,70,70,0.95)', 'rgba(255,0,0,0)'),
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
        })),
        // Lueur blanche des phares
        headGlow: markShared(new THREE.SpriteMaterial({
            map: radial('rgba(255,246,210,0.95)', 'rgba(255,230,160,0)'),
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
        })),
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
    if (new URLSearchParams(location.search).get('mode')==='2d' || !window.THREE || !window.CANNON || !checkWebGL()) {initFallback2D();return;}
    console.log('🚗 KITT STUNT RACING v7 - Initialisation');
    console.log('%cBy Manix - KITT FRANCO BELGE', 'color:#ff0000');

    speedEl = document.getElementById('speed-value');
    distanceEl = document.getElementById('driver-distance');
    timerEl = document.getElementById('timer');
    checkpointEl = document.getElementById('checkpoint-info');
    messagesEl = document.getElementById('hud-messages');
    debugEl = document.getElementById('hud-debug');
    turboFillEl = document.getElementById('turbo-fill');
    countdownEl = document.getElementById('countdown');
    speedLinesEl = document.getElementById('speed-lines');
    damageFlashEl = document.getElementById('damage-flash');
    turboVignetteEl = document.getElementById('turbo-vignette');
    gameCanvasEl = document.getElementById('game-canvas');
    impactFlashEl = document.getElementById('impact-flash');
    spmIndicatorEl = document.getElementById('spm-cinematic');
    karrStatusEl = document.getElementById('karr-status');
    raceRadarCanvas = document.getElementById('race-radar-canvas');
    raceRadarCtx = raceRadarCanvas?.getContext('2d') || null;
    raceRadarGapEl = document.getElementById('race-radar-gap');
    raceRadarLevelEl = document.getElementById('race-radar-level');
    raceRadarNextEl = document.getElementById('race-radar-next');
    raceRadarProgressBar = document.getElementById('race-radar-progress-bar');
    raceRadarProgressLabel = document.getElementById('race-radar-progress-label');

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
        createRaceTrafficFleet();
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
        if (/webgl|renderer|context/i.test(String(err.message))) {initFallback2D();return;}
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

    const viewport = getGameViewportSize();
    camera = new THREE.PerspectiveCamera(CONFIG.cameraFOV, viewport.width / viewport.height, 0.1, 8000);
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
    renderer.setSize(viewport.width, viewport.height);
    renderer.setPixelRatio(LOW_POWER_MODE ? 1 : Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.shadowMap.enabled = !LOW_POWER_MODE;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    // V7 — rendu cinéma : tone mapping filmique + espace couleur sRGB
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;

    // Reflets du paysage nocturne sur la carrosserie, calculés une seule fois.
    const reflectionCanvas = document.createElement('canvas');
    reflectionCanvas.width = 512; reflectionCanvas.height = 256;
    const rc = reflectionCanvas.getContext('2d');
    const rg = rc.createLinearGradient(0, 0, 0, 256);
    [[0,'#080d1d'],[.36,'#172843'],[.49,'#a9b5c5'],[.51,'#372028'],[.7,'#10151d'],[1,'#050609']].forEach(([at,color]) => rg.addColorStop(at,color));
    rc.fillStyle = rg; rc.fillRect(0, 0, 512, 256);
    rc.fillStyle = 'rgba(255,75,65,.32)'; rc.fillRect(75, 122, 115, 3);
    rc.fillStyle = 'rgba(139,194,255,.26)'; rc.fillRect(300, 119, 120, 3);
    const reflection = new THREE.CanvasTexture(reflectionCanvas);
    reflection.mapping = THREE.EquirectangularReflectionMapping;
    reflection.encoding = THREE.sRGBEncoding;
    scene.environment = reflection;

    const ambient = new THREE.AmbientLight(0x596a86, 0.36);
    scene.add(ambient);

    // Lumière hémisphérique : ciel bleu nuit / sol sombre — adoucit les normales
    const hemi = new THREE.HemisphereLight(0x3350a0, 0x0a0812, 0.42);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffe9dc, 0.72);
    sun.position.set(80, 150, 60);
    sun.castShadow = !LOW_POWER_MODE;
    sun.shadow.mapSize.width = LOW_POWER_MODE ? 512 : 1024;
    sun.shadow.mapSize.height = LOW_POWER_MODE ? 512 : 1024;
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
    window.addEventListener('orientationchange', onWindowResize, { passive:true });
    window.visualViewport?.addEventListener('resize', onWindowResize, { passive:true });
}

function getGameViewportSize() {
    const canvas = document.getElementById('game-canvas');
    const rect = canvas?.getBoundingClientRect();
    const width = Math.round(rect?.width || document.documentElement.clientWidth || window.innerWidth);
    const height = Math.round(rect?.height || document.documentElement.clientHeight || window.innerHeight);
    return { width:Math.max(1,width), height:Math.max(1,height) };
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
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
        // Sur Safari iOS, visualViewport peut encore avoir ses dimensions
        // portrait au premier frame de rotation. Relire la boîte du canvas au
        // frame suivant évite de garder un rendu à moitié écran.
        resizeFrame = requestAnimationFrame(() => {
            const { width, height } = getGameViewportSize();
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            // Le canvas est dimensionné par CSS : pas d'écriture de style.
            renderer.setSize(width, height, false);
        });
    });
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
    gctx.strokeStyle = '#25354a';
    gctx.lineWidth = 2;
    gctx.strokeRect(0, 0, 256, 256);
    // Relief discret du sol, sans texture externe ni calcul par image.
    gctx.strokeStyle = 'rgba(88,115,150,.16)';
    gctx.lineWidth = 1;
    for (let i = 32; i < 256; i += 32) {
        gctx.beginPath(); gctx.moveTo(i, 0); gctx.lineTo(i, 256);
        gctx.moveTo(0, i); gctx.lineTo(256, i); gctx.stroke();
    }
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
            const facadeColors = [0x9daac2, 0x8998b4, 0xb2a0a0, 0x8297a2];
            const facadeColor = facadeColors[Math.floor(Math.random() * facadeColors.length)];
            // Matériau physique sur les grands écrans ; modèle Lambert plus
            // léger sur GSM/Jetson basse puissance, avec le même aspect peint.
            const buildingMaterial = LOW_POWER_MODE
                ? new THREE.MeshLambertMaterial({
                    map: tex, emissiveMap: tex, emissive: 0xffffff,
                    emissiveIntensity: 0.62, color: facadeColor
                })
                : new THREE.MeshStandardMaterial({
                    map: tex, emissiveMap: tex, emissive: 0xffffff,
                    emissiveIntensity: 0.62, color: facadeColor,
                    roughness: 0.72, metalness: 0.22
                });
            const b = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, w),
                buildingMaterial
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

    // Réutilisés à chaque frame dans updateRace : évite deux objets temporaires/frame.
    raceForwardScratch = new CANNON.Vec3();
    raceUpScratch = new CANNON.Vec3();

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
    for (let level = 5; level <= 10; level++) buildLevel(level, LEVEL_OFFSET_X * (level - 1));
    setLevel(1);
    console.log('🛣️ Pistes : 10 niveaux et circuit personnalisé construits');
}

function buildLevel(level, offsetX, opsOverride) {
    buildingLevel = level;
    // Les tracés livrés étaient très courts. Les pièces intégrées sont étirées
    // en longueur et les virages gagnent du rayon; l'éditeur reste à l'échelle
    // exacte choisie par l'utilisateur.
    activeTrackScale = opsOverride ? 1 : 1.55;
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

    // Arche de départ, teintée au thème du circuit avancé.
    const challengeTheme = CHALLENGE_THEMES[level];
    addArch(trackPath.x, trackPath.y, trackPath.z + 2, trackPath.yaw,
        challengeTheme ? challengeTheme.name : 'DÉPART',
        challengeTheme ? challengeTheme.label : '#ff0000');

    if (opsOverride) customLayoutFromOps(opsOverride);
    else if (level === 1) level1Layout();
    else if (level === 2) level2Layout();
    else if (level === 3) level3Layout();
    else if (level >= 5 && level <= 10) challengeLayout(level);
    else customLayoutFromOps(defaultCustomOps());

    finishZone = {
        x: trackPath.x,
        y: trackPath.y,
        z: trackPath.z,
        yaw: trackPath.yaw
    };
    addCheckerLine(finishZone.x, finishZone.y, finishZone.z, finishZone.yaw);
    addArch(finishZone.x, finishZone.y, finishZone.z + 1, finishZone.yaw,
        challengeTheme ? 'ARRIVÉE // ' + challengeTheme.name : 'ARRIVÉE',
        challengeTheme ? challengeTheme.label : '#ffcc00');

    if (!opsOverride && level !== 4) addCircuitScenery(level, offsetX);

    const levelTurboPickups = createTurboPickups(trackLine, level);
    const levelSpmPickups = createSpmPickups(trackLine, level);

    LEVEL_DATA[level] = {
        line: trackLine,
        checkpoints: checkpoints,
        finish: finishZone,
        spawn: { x: offsetX, y: 1.0, z: 5, yaw: 0 },
        group: lvlGroup,
        bodies: currentLevelBodies,
        turboPickups: levelTurboPickups,
        spmPickups: levelSpmPickups
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

    // 3) Garder le circuit personnalisé dans le monde seulement s'il est
    // sélectionné. buildLevel ajoute ses corps au monde pendant sa création.
    if (currentLevel === 4) {
        setLevel(4);
    } else {
        LEVEL_DATA[4].group.visible = false;
        for (const body of LEVEL_DATA[4].bodies) {
            if (world.bodies.includes(body)) world.removeBody(body);
        }
    }
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

// Bonus SPM : une carte lisible au bord de la chaussée, ramassée au contact.
function createSpmPickups(line, level) {
    if (!line || line.length < 12) return [];
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    const face = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    face.addColorStop(0, '#172334');
    face.addColorStop(.52, '#07101b');
    face.addColorStop(1, '#1d1020');
    ctx.fillStyle = face;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ffbd55';
    ctx.lineWidth = 12;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.strokeStyle = 'rgba(255,55,83,.9)';
    ctx.lineWidth = 4;
    ctx.strokeRect(21, 21, canvas.width - 42, canvas.height - 42);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillStyle = '#ffc76a';
    ctx.fillText('KARR  //  BONUS', 256, 52);
    ctx.font = '900 142px Arial Black, Arial, sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#02060b';
    ctx.strokeText('SPM', 256, 167);
    ctx.shadowColor = '#37eaff';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#d9fbff';
    ctx.fillText('SPM', 256, 167);
    ctx.shadowBlur = 0;
    ctx.font = '700 19px Arial, sans-serif';
    ctx.fillStyle = '#8defff';
    ctx.fillText('SUPER PURSUIT MODE', 256, 254);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const front = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const edge = new THREE.MeshBasicMaterial({ color: 0x27dff4 });
    const result = [];
    const idx = Math.min(line.length - 4, Math.max(8, Math.floor(line.length * .58)));
    const p = line[idx];
    const group = new THREE.Group();
    group.position.set(p.x, p.y + 1.12, p.z);
    group.rotation.y = p.yaw || 0;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.12, 1.34, .12), edge);
    group.add(plate);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.17), front);
    sign.position.z = .08;
    group.add(sign);
    const back = sign.clone();
    back.position.z = -.08;
    back.rotation.y = Math.PI;
    group.add(back);
    group.userData.baseY = group.position.y;
    group.userData.phase = level * .8;
    group.userData.collected = false;
    lvlAdd(group);
    result.push(group);
    return result;
}

function setLevel(level) {
    currentLevel = level;
    const d = LEVEL_DATA[level];
    // Toutes les pistes sont construites au démarrage, mais seule la piste
    // choisie doit rester rendue. Les niveaux voisins, espacés dans le monde,
    // entraient dans le champ de vision au passage des ponts et multipliaient
    // les draw calls (jusqu'à plusieurs milliers par image sur le Jetson).
    for (const [id, levelData] of Object.entries(LEVEL_DATA)) {
        if (levelData.group) levelData.group.visible = Number(id) === Number(level);

        // Les pistes inactives ne doivent pas non plus participer à la
        // broadphase Cannon. Les garder dans `world` laissait plus de 1 000
        // corps statiques à tester alors qu'une seule piste est jouable.
        // On les conserve dans LEVEL_DATA et on les réinscrit au prochain
        // changement de niveau : aucune piste ni collision n'est supprimée.
        if (world && Array.isArray(levelData.bodies)) {
            for (const body of levelData.bodies) {
                const present = world.bodies.includes(body);
                if (Number(id) === Number(level)) {
                    if (!present) world.addBody(body);
                } else if (present) {
                    world.removeBody(body);
                }
            }
        }
    }
    trackLine = d.line;
    checkpoints = d.checkpoints;
    finishZone = d.finish;
    turboPickups = d.turboPickups || [];
    spmPickups = d.spmPickups || [];
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
    addLoop(11);                     // bretelle, voie décalée, looping puis raccord à la chaussée
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

// Variantes procédurales des niveaux avancés : trois checkpoints, une
// difficulté visuelle différente et une géométrie suffisamment légère pour
// rester fluide sur Jetson.
function challengeLayout(level) {
    const phase = level - 5;
    addStraight(22 + phase * 2, 0);
    addCurve(34 + phase * 3, phase % 2 ? 55 : -55, 0);
    addCheckpoint();
    addStraight(16, 1.1 + phase * 0.15);
    if (phase % 2 === 0) addGap(8 + phase);
    else addCurve(42, phase % 3 === 0 ? 90 : -90, 0);
    addCheckpoint();
    addStraight(18 + phase, -1.1 - phase * 0.15);
    addCurve(28 + phase * 2, phase % 2 ? -45 : 45, 0);
    addCheckpoint();
    addStraight(24 + phase * 2, 0);
}

// Décors-signatures des checkpoints avancés. Ils sont contenus dans le groupe
// du niveau, n'ont aucun collider et utilisent des matériaux non éclairés :
// identité immédiatement visible, coût de rendu limité sur le Jetson.
function addChallengeSetPiece(level, checkpoint) {
    const theme = CHALLENGE_THEMES[level];
    if (!theme) return;

    const group = new THREE.Group();
    group.name = 'racer-theme-' + level + '-checkpoint-' + checkpoints.length;
    group.userData.challengeTheme = theme.name;
    group.userData.decorativeOnly = true;
    group.position.set(checkpoint.x, checkpoint.y, checkpoint.z + 5);
    group.rotation.y = checkpoint.yaw;
    const accent = new THREE.MeshBasicMaterial({ color: theme.color, toneMapped: false });
    const dark = new THREE.MeshBasicMaterial({ color: 0x18202b });
    const addBeam = (width, height, depth, x, y, z, material = accent) => {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        beam.position.set(x, y, z);
        group.add(beam);
        return beam;
    };
    const addLine = (points, material = accent) => {
        const geometry = new THREE.BufferGeometry().setFromPoints(
            points.map(point => new THREE.Vector3(point[0], point[1], point[2]))
        );
        group.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: material.color, toneMapped: false })));
    };
    const addStroke = (from, to, thickness = .2) => {
        const dx = to[0] - from[0], dy = to[1] - from[1];
        const stroke = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(dx, dy), thickness, thickness), accent);
        stroke.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
        stroke.rotation.z = Math.atan2(dy, dx);
        group.add(stroke);
    };

    if (theme.motif === 'lightning') {
        for (const side of [-1, 1]) {
            const x = side * (CONFIG.trackWidth / 2 + 1.8);
            const bolt = [[x, .5, 0], [x, 1.8, 0], [x - side * .9, 2.6, 0],
                [x + side * .35, 3.35, 0], [x, 4.9, 0]];
            for (let i = 1; i < bolt.length; i++) addStroke(bolt[i - 1], bolt[i], .22);
        }
        addBeam(.24, .24, 13, 0, 5.4, 0);
    } else if (theme.motif === 'neon') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(4.4, .13, 8, 40), accent);
        ring.position.set(0, 4.7, 0);
        group.add(ring);
        addBeam(.16, .16, 13, 0, 5.4, 0, dark);
    } else if (theme.motif === 'bridge') {
        for (const side of [-1, 1]) {
            const x = side * (CONFIG.trackWidth / 2 + 1.8);
            addBeam(.38, 5.6, .38, x, 2.8, 0, dark);
            addLine([[x, 5.4, 0], [x * .5, 3.4, 0], [0, 5.4, 0]]);
        }
        addBeam(CONFIG.trackWidth + 4.4, .3, .35, 0, 5.5, 0, accent);
    } else if (theme.motif === 'fire') {
        const flame = new THREE.MeshBasicMaterial({ color: 0xffa13b });
        for (const side of [-1, 1]) {
            for (let i = 0; i < 3; i++) {
                const cone = new THREE.Mesh(new THREE.ConeGeometry(.52, 2.4 + (i % 2) * .8, 7), i % 2 ? flame : accent);
                cone.position.set(side * (CONFIG.trackWidth / 2 + 1.8 + (i % 2) * .45), 1.2 + (i % 2) * .4, (i - 1) * 1.25);
                group.add(cone);
            }
        }
        addBeam(CONFIG.trackWidth + 4.4, .2, .25, 0, 5.4, 0, dark);
    } else if (theme.motif === 'orbit') {
        const outer = new THREE.Mesh(new THREE.TorusGeometry(4.35, .12, 8, 40), accent);
        outer.position.set(0, 4.7, 0);
        group.add(outer);
        const inner = new THREE.Mesh(new THREE.TorusGeometry(3.75, .055, 6, 36), dark);
        inner.position.set(0, 4.7, .16);
        group.add(inner);
        const satellite = new THREE.Mesh(new THREE.SphereGeometry(.34, 10, 8), accent);
        satellite.position.set(-5.7, 4.2, 0);
        group.add(satellite);
    } else if (theme.motif === 'finale') {
        for (const z of [-.9, 1.1]) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(4.35, z < 0 ? .16 : .08, 8, 40), z < 0 ? accent : dark);
            ring.position.set(0, 4.7, z);
            group.add(ring);
        }
        addBeam(.2, .2, 15, 0, 5.45, 0);
    }

    lvlAdd(group);
}

// ---- Géométrie de la boucle (entrée et sortie distinctes, tangentes à la piste) ----
function loopPoint(entry, fwd, R, phi, exitSpan = R * 2.2) {
    const angle = Math.max(0, Math.min(Math.PI * 2, phi));
    // Le décalage se fait sur la moitié arrière : entrée/sortie restent
    // tangentes à la ligne droite, mais ne se superposent plus.
    const exitBlend = angle <= Math.PI / 2 ? 0
        : angle >= Math.PI * 1.5 ? 1
        : (1 - Math.sin(angle)) / 2;
    return {
        x: entry.x + fwd.x * (R * Math.sin(phi) + exitSpan * exitBlend),
        y: entry.y + R * (1 - Math.cos(phi)),
        z: entry.z + fwd.z * (R * Math.sin(phi) + exitSpan * exitBlend)
    };
}
// normale de la surface (vers l'intérieur de la boucle, là où est la voiture)
function loopNormal(fwd, phi) {
    return { x: -fwd.x * Math.sin(phi), y: Math.cos(phi), z: -fwd.z * Math.sin(phi) };
}
// tangente (sens de la conduite)
function loopTangent(fwd, phi, R = 11, exitSpan = R * 2.2) {
    const blendRate = phi > Math.PI / 2 && phi < Math.PI * 1.5 ? -0.5 * Math.cos(phi) : 0;
    const along = R * Math.cos(phi) + exitSpan * blendRate;
    const vertical = R * Math.sin(phi);
    const length = Math.hypot(along, vertical) || 1;
    return { x: fwd.x * along / length, y: vertical / length, z: fwd.z * along / length };
}
function loopFrame(fwd, phi, R, exitSpan) {
    const forward = loopTangent(fwd, phi, R, exitSpan);
    const radial = loopNormal(fwd, phi);
    const dot = radial.x * forward.x + radial.y * forward.y + radial.z * forward.z;
    const up = {
        x: radial.x - forward.x * dot,
        y: radial.y - forward.y * dot,
        z: radial.z - forward.z * dot
    };
    const upLength = Math.hypot(up.x, up.y, up.z) || 1;
    up.x /= upLength; up.y /= upLength; up.z /= upLength;
    const right = {
        x: up.y * forward.z - up.z * forward.y,
        y: up.z * forward.x - up.x * forward.z,
        z: up.x * forward.y - up.y * forward.x
    };
    return { right, up, forward };
}

// Construit la boucle : segments routiers VISUELS uniquement (la conduite
// dans la boucle est cinématique) + deux anneaux latéraux type montagne russe.
function addLoop(radius) {
    radius *= activeTrackScale;
    // Déporte tous les loopings (y compris ceux du circuit personnalisé) hors
    // de l'axe principal, puis revient sur la chaussée après l'élément.
    const laneOffset = CONFIG.trackWidth + 4.5;
    addLaneConnector(laneOffset, 34);
    const entry = { x: trackPath.x, y: trackPath.y, z: trackPath.z };
    const fwd = { x: Math.sin(trackPath.yaw), z: Math.cos(trackPath.yaw) };
    const exitSpan = radius * 2.2;
    const segs = 24;
    const s = shared();
    const railCurves = [[], []];
    const right = { x: fwd.z, z: -fwd.x };

    for (let i = 0; i < segs; i++) {
        const phi1 = (i / segs) * Math.PI * 2;
        const phi2 = ((i + 1) / segs) * Math.PI * 2;
        const phiMid = (phi1 + phi2) / 2;
        const p1 = loopPoint(entry, fwd, radius, phi1, exitSpan);
        const p2 = loopPoint(entry, fwd, radius, phi2, exitSpan);
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, z: (p1.z + p2.z) / 2 };
        const chord = Math.sqrt(
            (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2
        );

        const group = new THREE.Group();
        const frame = loopFrame(fwd, phiMid, radius, exitSpan);
        const upAxis = new THREE.Vector3(frame.up.x, frame.up.y, frame.up.z);
        const forwardAxis = new THREE.Vector3(frame.forward.x, frame.forward.y, frame.forward.z);
        const rightAxis = new THREE.Vector3(frame.right.x, frame.right.y, frame.right.z);
        group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rightAxis, upAxis, forwardAxis));
        group.position.set(mid.x, mid.y, mid.z);

        const roadTex = s.roadTex.clone();
        roadTex.needsUpdate = true;
        roadTex.repeat.set(1, Math.max(1, Math.round(chord / 8)));
        const road = new THREE.Mesh(
            new THREE.BoxGeometry(CONFIG.trackWidth, CONFIG.trackHeight, chord + 0.25),
            new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9, metalness: 0.1 })
        );
        group.add(road);
        // Rambardes visuelles ; leurs courbes suivront exactement la sortie.
        const railGeo = new THREE.BoxGeometry(0.12, 0.5, chord + 0.25);
        const railMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0x660000 });
        for (const side of [1, -1]) {
            const rail = new THREE.Mesh(railGeo, railMat);
            rail.position.set(side * (CONFIG.trackWidth / 2 + 0.25), CONFIG.trackHeight / 2 + 0.35, 0);
            group.add(rail);
        }
        lvlAdd(group);

        for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
            const side = sideIndex === 0 ? -1 : 1;
            const railOffset = side * (CONFIG.trackWidth / 2 + 0.25);
            if (i === 0) railCurves[sideIndex].push(new THREE.Vector3(
                p1.x + right.x * railOffset, p1.y + CONFIG.trackHeight / 2 + 0.35,
                p1.z + right.z * railOffset
            ));
            railCurves[sideIndex].push(new THREE.Vector3(
                p2.x + right.x * railOffset, p2.y + CONFIG.trackHeight / 2 + 0.35,
                p2.z + right.z * railOffset
            ));
        }

        // waypoints pour la poursuite autodrive / anti-perte
        if (i % 2 === 0) {
            const n = frame.up;
            const p = loopPoint(entry, fwd, radius, phiMid, exitSpan);
            trackLine.push({ x: p.x + n.x * 0.9, y: p.y + n.y * 0.9, z: p.z + n.z * 0.9 });
        }
    }

    // Cadres latéraux non circulaires : ils épousent le looping allongé au lieu
    // de montrer deux anneaux qui contredisent la vraie trajectoire.
    const railMat = new THREE.MeshStandardMaterial({ color: 0x2c2c3a, emissive: 0x991111, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.6 });
    for (const points of railCurves) {
        const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
        lvlAdd(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.18, 6, false), railMat));
    }

    LOOP_DATA[buildingLevel] = { entry: entry, fwd: fwd, R: radius, exitSpan };
    // Les éléments suivants (checkpoint, descente et arrivée) partent de la
    // sortie réelle, pas du point d'entrée superposé à la boucle.
    trackPath.x = entry.x + fwd.x * exitSpan;
    trackPath.z = entry.z + fwd.z * exitSpan;
    addLaneConnector(-laneOffset, 34);
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
    len *= activeTrackScale;
    // Profil de route plus doux : moins de bosses et d'atterrissages brusques.
    dy *= .58;
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
    // Les petits sauts restent présents, mais les trous sont plus courts.
    len *= activeTrackScale * .72;
    const f = trackForward();
    trackPath.x += f.x * len;
    trackPath.z += f.z * len;
}

function addCurve(radius, angleDeg, dyTotal) {
    radius *= activeTrackScale;
    dyTotal *= .58;
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

// Bretelle en S douce : raccorde la chaussée à une voie latérale parallèle.
// La même géométrie sert au rendu, aux colliders et à la ligne de conduite.
function addLaneConnector(lateralDistance, forwardDistance) {
    lateralDistance *= activeTrackScale;
    forwardDistance *= activeTrackScale;
    const start = { x: trackPath.x, y: trackPath.y, z: trackPath.z };
    const f = trackForward();
    const right = { x: f.z, z: -f.x };
    const end = {
        x: start.x + f.x * forwardDistance + right.x * lateralDistance,
        y: start.y,
        z: start.z + f.z * forwardDistance + right.z * lateralDistance
    };
    const control1 = { x: start.x + f.x * forwardDistance * .34, z: start.z + f.z * forwardDistance * .34 };
    const control2 = { x: end.x - f.x * forwardDistance * .34, z: end.z - f.z * forwardDistance * .34 };
    const samples = 18;
    let previous = start;
    for (let i = 1; i <= samples; i++) {
        const t = i / samples, u = 1 - t;
        const point = {
            x: u*u*u*start.x + 3*u*u*t*control1.x + 3*u*t*t*control2.x + t*t*t*end.x,
            z: u*u*u*start.z + 3*u*u*t*control1.z + 3*u*t*t*control2.z + t*t*t*end.z,
            y: start.y
        };
        const derivative = {
            x: 3*u*u*(control1.x-start.x) + 6*u*t*(control2.x-control1.x) + 3*t*t*(end.x-control2.x),
            z: 3*u*u*(control1.z-start.z) + 6*u*t*(control2.z-control1.z) + 3*t*t*(end.z-control2.z)
        };
        const yaw = Math.atan2(derivative.x, derivative.z);
        const dx = point.x - previous.x, dz = point.z - previous.z;
        const length = Math.hypot(dx, dz);
        const segmentYaw = Math.atan2(dx, dz);
        buildRoadPiece((point.x + previous.x) / 2, point.y, (point.z + previous.z) / 2,
            segmentYaw, length + .12, 0);
        trackLine.push(point);
        previous = point;
        if (i === samples) trackPath.yaw = yaw;
    }
    trackPath.x = end.x;
    trackPath.y = end.y;
    trackPath.z = end.z;
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

    // Trois séparateurs donnent quatre voies. Un seul LineSegments par
    // tronçon évite les dizaines de draw calls des anciens meshes pointillés.
    const laneMarks = [];
    const dashCount = Math.floor(segLen / 6);
    for (let lane = -1; lane <= 1; lane++) {
        const laneX = lane * CONFIG.trackWidth / 4;
        for (let i = 0; i < dashCount; i++) {
            const z0 = -segLen / 2 + 3 + i * 6;
            laneMarks.push(laneX, CONFIG.trackHeight / 2 + 0.025, z0,
                laneX, CONFIG.trackHeight / 2 + 0.025, Math.min(z0 + 2.2, segLen / 2));
        }
    }
    if (laneMarks.length) {
        const laneGeo = new THREE.BufferGeometry();
        laneGeo.setAttribute('position', new THREE.Float32BufferAttribute(laneMarks, 3));
        group.add(new THREE.LineSegments(laneGeo, new THREE.LineBasicMaterial({
            color: 0xe7e8ed, transparent: true, opacity: 0.78
        })));
    }

    // Barrières à bandes hazard (texture partagée + émission pour la nuit)
    const barrierGeo = new THREE.BoxGeometry(0.15, 0.6, segLen);
    const bTex = s.barrierTex.clone();
    bTex.needsUpdate = true;
    bTex.repeat.set(1, Math.max(1, Math.round(segLen / 4)));
    const barrierMat = new THREE.MeshStandardMaterial({
        map: bTex, emissive: 0xff2233, emissiveMap: bTex, emissiveIntensity: 0.5, roughness: 0.55
    });
    const barrierL = new THREE.Mesh(barrierGeo, barrierMat);
    barrierL.position.set(CONFIG.trackWidth / 2 + 0.4, CONFIG.trackHeight / 2 + 0.45, 0);
    group.add(barrierL);
    const barrierR = new THREE.Mesh(barrierGeo, barrierMat);
    barrierR.position.set(-CONFIG.trackWidth / 2 - 0.4, CONFIG.trackHeight / 2 + 0.45, 0);
    group.add(barrierR);

    // Catadioptre rouge clignotant côté opposé au lampadaire
    if (segLen >= 10) {
        const eyeSide = (poleCounter % 4 === 0) ? -1 : 1;
        const eye = new THREE.Sprite(s.eyeGlow);
        eye.scale.set(1.2, 1.2, 1);
        eye.position.set(eyeSide * (CONFIG.trackWidth / 2 + 0.55), CONFIG.trackHeight / 2 + 0.75, 0);
        group.add(eye);
    }

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
    const theme = CHALLENGE_THEMES[buildingLevel];
    addArch(cp.x, cp.y, cp.z, cp.yaw,
        theme ? theme.name + ' // CP ' + checkpoints.length : 'CHECKPOINT ' + checkpoints.length,
        theme ? theme.label : '#00e5ff');
    if (theme) addChallengeSetPiece(buildingLevel, cp);
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
    let bannerFontSize = 60;
    ctx.font = `bold ${bannerFontSize}px Arial`;
    while (ctx.measureText(text).width > 470 && bannerFontSize > 24) {
        bannerFontSize -= 2;
        ctx.font = `bold ${bannerFontSize}px Arial`;
    }
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
    carDamageParts = Object.create(null);
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
    const paint = new THREE.MeshPhysicalMaterial({color:0x111820,roughness:0.22,metalness:0.56,clearcoat:1,clearcoatRoughness:0.07,envMapIntensity:1.5});
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
    // Filets de carrosserie et détails de la Trans Am : géométries légères.
    const highlight = new THREE.MeshBasicMaterial({color:0x8aa7be,transparent:true,opacity:.34});
    const redAccent = new THREE.MeshBasicMaterial({color:0xa91525,transparent:true,opacity:.72});
    const panelLine = new THREE.MeshBasicMaterial({color:0x030507});
    for (const side of [-1, 1]) {
        detail(.012,.018,2.4,side*1.125,.22,-.08,highlight);
        detail(.018,.035,2.65,side*1.11,-.17,-.05,redAccent);
        detail(.014,.25,.025,side*1.13,.16,-.53,panelLine);
        detail(.014,.25,.025,side*1.12,.16,.55,panelLine);
        detail(.025,.025,.25,side*1.13,.28,-.24,highlight);
        for (let i=0;i<4;i++) detail(.018,.025,.065,side*1.105,.08,1.15+i*.08,panelLine);
    }
    detail(.12,.045,1,0,.93,-.25); // arceau central du toit T-top
    detail(1.62,.055,.12,0,.92,-.68);
    detail(1.62,.055,.10,0,.92,.23);
    for(const side of [-1,1]) {
        const mirror = detail(.25,.13,.32,side*1.12,.52,.48); // rétroviseurs détachables
        carDamageParts[side < 0 ? 'mirrorLeft' : 'mirrorRight'] = {
            mesh: mirror, position: mirror.position.clone(), quaternion: mirror.quaternion.clone(), detached: false
        };
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

    // Halo rouge du scanner (suit la LED dans updateScannerVisual)
    scannerGlowSprite = new THREE.Sprite(shared().glowRed);
    scannerGlowSprite.scale.set(2.6, 1.5, 1);
    scannerGlowSprite.position.set(0, 0.25, 2.52);
    carMesh.add(scannerGlowSprite);

    // Phares avant
    const lightGeo = new THREE.BoxGeometry(0.38, 0.12, 0.08);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6cc });
    const headL = new THREE.Mesh(lightGeo, headMat);
    headL.position.set(-0.72, 0.05, 2.22);
    carMesh.add(headL);
    const headR = new THREE.Mesh(lightGeo, headMat);
    headR.position.set(0.72, 0.05, 2.22);
    carMesh.add(headR);
    // Halos lumineux des phares (sprites additifs statiques, coût nul)
    for (const sx of [-0.72, 0.72]) {
        const hg = new THREE.Sprite(shared().headGlow);
        hg.scale.set(1.5, 1.1, 1);
        hg.position.set(sx, 0.05, 2.34);
        carMesh.add(hg);
    }

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
    // Pare-chocs chrome avant/arrière (reflets métalliques)
    const chromeMat = new THREE.MeshStandardMaterial({color:0xd9dee6, metalness:1, roughness:0.18});
    const bumpF = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.09, 0.1), chromeMat);
    bumpF.position.set(0, -0.155, 2.42); carMesh.add(bumpF);
    const bumpR = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.09, 0.1), chromeMat);
    bumpR.position.set(0, -0.14, -2.44); carMesh.add(bumpR);
    carDamageParts.frontBumper = { mesh: bumpF, position: bumpF.position.clone(), quaternion: bumpF.quaternion.clone(), detached: false };
    carDamageParts.rearBumper = { mesh: bumpR, position: bumpR.position.clone(), quaternion: bumpR.quaternion.clone(), detached: false };
    // « Firebird » peint sur le capot, devant la prise d'air (décal canvas local)
    const hb = document.createElement('canvas'); hb.width = 64; hb.height = 96;
    const hgc = hb.getContext('2d');
    hgc.fillStyle = '#7d0a16';
    hgc.beginPath(); hgc.moveTo(32, 6); hgc.quadraticCurveTo(60, 40, 54, 90); hgc.quadraticCurveTo(32, 70, 10, 90); hgc.quadraticCurveTo(4, 40, 32, 6); hgc.fill();
    hgc.fillStyle = '#c22030';
    hgc.beginPath(); hgc.moveTo(32, 16); hgc.quadraticCurveTo(48, 44, 44, 82); hgc.quadraticCurveTo(32, 66, 20, 82); hgc.quadraticCurveTo(16, 44, 32, 16); hgc.fill();
    const hoodBird = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.75),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hb), transparent: true, polygonOffset: true, polygonOffsetFactor: -1 })
    );
    hoodBird.rotation.x = -Math.PI / 2;
    hoodBird.position.set(0, 0.455, 0.42);
    carMesh.add(hoodBird);
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

    // Détails supplémentaires de carrosserie : lignes de capot, poignées,
    // arches de roues et diffuseur. Ils donnent une silhouette Firebird plus
    // lisible sans texture lourde ni modèle externe, donc sans ralentir l'AGX.
    const panelMat = new THREE.MeshStandardMaterial({ color:0x2b3440, metalness:.82, roughness:.22 });
    const seamMat = new THREE.MeshBasicMaterial({ color:0x020307, transparent:true, opacity:.82 });
    for (const sx of [-1, 1]) {
        const hoodLine = new THREE.Mesh(new THREE.BoxGeometry(.018,.012,1.7), seamMat);
        hoodLine.position.set(sx*.16,.47,.74); carMesh.add(hoodLine);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(.2,.025,.035), panelMat);
        handle.position.set(sx*1.16,.39,-.18); carMesh.add(handle);
        const arch = new THREE.Mesh(new THREE.TorusGeometry(.55,.045,6,22), panelMat);
        arch.rotation.y = Math.PI/2; arch.position.set(sx*1.02,.37,1.28); carMesh.add(arch);
        const rearArch = arch.clone(); rearArch.position.z = -1.28; carMesh.add(rearArch);
    }
    const rearDiffuser = new THREE.Mesh(new THREE.BoxGeometry(1.74,.18,.16), panelMat);
    rearDiffuser.position.set(0,-.27,-2.36); carMesh.add(rearDiffuser);
    for (const sx of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(.08,.12,.34), seamMat);
        fin.position.set(sx*.65,-.32,-2.43); fin.rotation.x=.18; carMesh.add(fin);
    }
    const tailSegmentMat = new THREE.MeshBasicMaterial({color:0xff2538, transparent:true, opacity:.9});
    for (let i=0;i<5;i++) {
        const segment = new THREE.Mesh(new THREE.BoxGeometry(.18,.035,.03), tailSegmentMat);
        segment.position.set(-.72+i*.36,.22,-2.34); carMesh.add(segment);
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
    const caliperMat = new THREE.MeshStandardMaterial({ color: 0xb01220, metalness: 0.4, roughness: 0.4 });

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
        const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.18), caliperMat);
        caliper.position.set(0.3, 0.12, 0);
        wGroup.add(caliper);
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
    if(window.RacerCars) legacyCarRuntime = RacerCars.installPlayer(carMesh,wheelMeshes,scene.environment,{scannerMesh,scannerLight,scannerGlowSprite,tailLeftMat,tailRightMat,carDamageParts},vehicle);
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

function applyOriginalDriverVehicle(driverId) {
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
function applyDriverVehicle(driverId) {
    if (legacyCarRuntime) {
        resetCarDamage();
        ({scannerMesh,scannerLight,scannerGlowSprite,tailLeftMat,tailRightMat,carDamageParts}=legacyCarRuntime.restore());
    }
    applyOriginalDriverVehicle(driverId);
    const replacement=legacyCarRuntime?.use(getDriver(driverId));
    if(replacement) ({scannerMesh,scannerLight,scannerGlowSprite,tailLeftMat,tailRightMat,carDamageParts}=replacement);
    carMesh.userData.driverId=getDriver(driverId).id;
}

function createKarr() {
    karrMesh=RacerCars.rival(scene.environment);
    karrMesh.visible=false;
    scene.add(karrMesh);
}

// ============================================
// TRAFIC DE COURSE — véhicules légers, vrais impacts
// ============================================
function createRaceTrafficFleet() {
    if (raceTraffic.length) return;
    const bodyGeo = new THREE.BoxGeometry(1.92, .58, 4.05);
    const roofGeo = new THREE.BoxGeometry(1.48, .48, 1.72);
    const glassGeo = new THREE.BoxGeometry(1.38, .29, .78);
    const wheelGeo = new THREE.CylinderGeometry(.39, .39, .25, 10);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x080a0e, roughness: .82 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x142536, roughness: .2, metalness: .35 });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xe8f4ff });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xf02232 });
    const headGeo = new THREE.BoxGeometry(.24, .1, .06);
    const tailGeo = new THREE.BoxGeometry(.34, .09, .06);
    const colors = [0x1877d2, 0xd77920, 0xe4e8ee, 0x35a77a, 0xa743bd];

    colors.forEach((color, index) => {
        const mesh = new THREE.Group();
        mesh.name = `RACER_TRAFFIC_${index + 1}`;
        const paint = new THREE.MeshStandardMaterial({ color, roughness: .3, metalness: .48 });
        const body = new THREE.Mesh(bodyGeo, paint);
        body.position.y = .49;
        mesh.add(body);
        const roof = new THREE.Mesh(roofGeo, paint);
        roof.position.set(0, .96, -.15);
        mesh.add(roof);
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.set(0, .99, .55);
        mesh.add(glass);
        const wheels = [];
        for (const x of [-.96, .96]) for (const z of [-1.28, 1.28]) {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(x, .36, z);
            mesh.add(wheel);
            wheels.push(wheel);
        }
        for (const x of [-.62, .62]) {
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.set(x, .49, 2.04);
            mesh.add(head);
            const tail = new THREE.Mesh(tailGeo, tailMat);
            tail.position.set(x * .78, .5, -2.04);
            mesh.add(tail);
        }
        mesh.visible = false;
        scene.add(mesh);
        raceTraffic.push({ mesh, wheels, speed: 0, direction: 1, distance: 0, lane: 0, hitCooldown: 0, impactArmed: true, hitTimer: 0, index });
    });
}

function sampleRaceTrafficPath(distance) {
    const points = trackLine;
    if (!points.length || raceTrafficPathDistance.length !== points.length) return null;
    const d = clamp(distance, 0, raceTrafficPathLength);
    let lo = 0, hi = raceTrafficPathDistance.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (raceTrafficPathDistance[mid] <= d) lo = mid;
        else hi = mid;
    }
    const span = Math.max(.001, raceTrafficPathDistance[hi] - raceTrafficPathDistance[lo]);
    const t = clamp((d - raceTrafficPathDistance[lo]) / span, 0, 1);
    const a = points[lo], b = points[hi];
    return { x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, z:a.z+(b.z-a.z)*t, yaw:Math.atan2(b.x-a.x,b.z-a.z) };
}

function setupRaceTraffic() {
    createRaceTrafficFleet();
    raceTrafficPathDistance = [];
    raceTrafficPathLength = 0;
    raceTrafficPlayerDistance = 0;
    raceTrafficProjectionTimer = 0;
    if (trackLine.length < 2) { raceTraffic.forEach(car => { car.mesh.visible = false; }); return; }
    raceTrafficPathDistance.push(0);
    for (let i = 1; i < trackLine.length; i++) {
        const a = trackLine[i - 1], b = trackLine[i];
        raceTrafficPathLength += Math.hypot(b.x-a.x, b.y-a.y, b.z-a.z);
        raceTrafficPathDistance.push(raceTrafficPathLength);
    }
    // Progressions espacées pour des pistes courtes comme longues. La voie
    // centrale porte un rival lent ; les deux voies extérieures donnent des
    // dépassements et deux véhicules arrivent en sens inverse.
    const placements = [
        { direction:1, fraction:.20, speed:22, lane:0 },
        { direction:1, fraction:.39, speed:26, lane:2.75 },
        { direction:-1, fraction:.66, speed:21, lane:-2.75 },
        { direction:-1, fraction:.88, speed:24, lane:-2.75 },
        { direction:1, fraction:.56, speed:30, lane:2.75 }
    ];
    raceTraffic.forEach((car, i) => {
        const config = placements[i];
        car.direction = config.direction;
        car.distance = raceTrafficPathLength * config.fraction;
        car.speed = config.speed + (currentLevel % 3) * .8;
        car.lane = config.lane;
        car.hitCooldown = 0;
        car.hitTimer = 0;
        car.impactArmed = true;
        car.mesh.visible = raceTrafficPathLength > 65 && car.distance < raceTrafficPathLength;
        car.mesh.userData.trafficDirection = config.direction > 0 ? 'MÊME SENS' : 'SENS INVERSE';
    });
}

function hideRaceTraffic() {
    for (const car of raceTraffic) car.mesh.visible = false;
}

function updateRaceTraffic(dt) {
    if (!raceTraffic.length || !raceTrafficPathLength || !carBody || !carMesh) return;
    raceTrafficProjectionTimer -= dt;
    if (raceTrafficProjectionTimer <= 0) {
        raceTrafficProjectionTimer = .18;
        let bestIndex = 0, bestDistanceSq = Infinity;
        for (let i = 0; i < trackLine.length; i++) {
            const dx = carBody.position.x - trackLine[i].x;
            const dz = carBody.position.z - trackLine[i].z;
            const d2 = dx*dx + dz*dz;
            if (d2 < bestDistanceSq) { bestDistanceSq = d2; bestIndex = i; }
        }
        raceTrafficPlayerDistance = raceTrafficPathDistance[bestIndex] || 0;
    }
    for (const traffic of raceTraffic) {
        if (!traffic.mesh.visible) continue;
        traffic.distance += traffic.direction * traffic.speed * dt;
        traffic.hitCooldown = Math.max(0, traffic.hitCooldown - dt);
        traffic.hitTimer = Math.max(0, traffic.hitTimer - dt);
        if (traffic.distance <= 0 || traffic.distance >= raceTrafficPathLength) {
            traffic.mesh.visible = false;
            continue;
        }
        const p = sampleRaceTrafficPath(traffic.distance);
        if (!p) continue;
        const rightX = Math.cos(p.yaw), rightZ = -Math.sin(p.yaw);
        const yaw = p.yaw + (traffic.direction < 0 ? Math.PI : 0);
        const wobble = traffic.hitTimer > 0 ? Math.sin(clock.elapsedTime * 34) * .11 : 0;
        traffic.mesh.position.set(p.x + rightX * traffic.lane, p.y + .04, p.z + rightZ * traffic.lane);
        traffic.mesh.rotation.set(0, yaw, wobble);
        for (const wheel of traffic.wheels) {
            wheel.rotation.x = (wheel.rotation.x + traffic.direction * traffic.speed * dt / .39) % (Math.PI * 2);
        }

        const dx = carBody.position.x - traffic.mesh.position.x;
        const dy = carBody.position.y - traffic.mesh.position.y;
        const dz = carBody.position.z - traffic.mesh.position.z;
        const playerYaw = carMesh.rotation.y;
        const playerForwardX = Math.sin(playerYaw), playerForwardZ = Math.cos(playerYaw);
        const relX = traffic.mesh.position.x - carBody.position.x;
        const relZ = traffic.mesh.position.z - carBody.position.z;
        const longitudinal = relX*playerForwardX + relZ*playerForwardZ;
        const lateral = relX*Math.cos(playerYaw) - relZ*Math.sin(playerYaw);
        // --- Dépassement : franchissement de la position du joueur à vitesse relative élevée ---
        if (raceTrafficPlayerDistance > 0) {
            const rel = traffic.distance - raceTrafficPlayerDistance;
            if (traffic.prevRel !== undefined && rel !== traffic.prevRel &&
                ((traffic.prevRel < 0 && rel >= 0) || (traffic.prevRel > 0 && rel <= 0)) &&
                Math.abs(rel) < 16 && Math.abs(traffic.prevRel) < 16 &&
                Math.abs(lateral) > 1.4 && carBody) {
                const pv = Math.hypot(carBody.velocity.x, carBody.velocity.z);
                if (pv > 12 && window.KA?.sfx?.whoosh) KA.sfx.whoosh(lateral > 0 ? 1 : -1);
            }
            traffic.prevRel = rel;
        }
        const overlapsCars = Math.abs(longitudinal) <= 4.15 && Math.abs(lateral) <= 1.95;
        if (!overlapsCars || Math.abs(dy) > 1.55) traffic.impactArmed = true;
        // Empreinte rectangulaire approximative des deux carrosseries, dans le
        // repère du joueur : un simple rayon déclenchait des chocs entre voies
        // adjacentes, alors que cette boîte laisse 80 cm de marge entre elles.
        // Le filtre longitudinal de piste évite aussi les faux contacts dans un
        // virage serré ou entre la route et un looping superposé.
        if (!overlapsCars || Math.abs(dy) > 1.55 ||
            Math.abs(traffic.distance - raceTrafficPlayerDistance) > 8 ||
            traffic.hitCooldown > 0 || !traffic.impactArmed) continue;

        const distance = Math.hypot(dx, dz);
        const nx = distance > .001 ? dx / distance : Math.cos(p.yaw);
        const nz = distance > .001 ? dz / distance : -Math.sin(p.yaw);
        const tangentX = Math.sin(p.yaw) * traffic.direction;
        const tangentZ = Math.cos(p.yaw) * traffic.direction;
        const relativeX = carBody.velocity.x - tangentX * traffic.speed;
        const relativeZ = carBody.velocity.z - tangentZ * traffic.speed;
        const closingSpeed = Math.hypot(relativeX, relativeZ);
        const severity = clamp((closingSpeed - 3) / 22, .2, 1);
        carBody.velocity.x *= 1 - severity * .26;
        carBody.velocity.z *= 1 - severity * .26;
        carBody.velocity.x += nx * (1.5 + severity * 4.5);
        carBody.velocity.z += nz * (1.5 + severity * 4.5);
        traffic.speed = Math.max(traffic.speed * .68, traffic.speed - 8 * severity);
        traffic.hitTimer = .75;
        traffic.hitCooldown = 1.0;
        traffic.impactArmed = false;
        triggerPremiumImpact(severity, carBody.position.x - nx * .9, carBody.position.y + .25,
            carBody.position.z - nz * .9, nx, nz, true);
        showMessage(severity > .62 ? 'CHOC TRAFIC · CARROSSERIE ENDOMMAGÉE' : 'CONTACT TRAFIC · VITESSE RÉDUITE');
    }
}

function setKarrStatus(text, danger = false) {
    if (!karrStatusEl) return;
    karrStatusEl.textContent = text;
    karrStatusEl.classList.toggle('danger', danger);
    if (danger) karrStatusEl.classList.remove('warning', 'close');
}

function resetKarr() {
    if (!karrMesh || !trackLine || trackLine.length < 3) return;
    karrActive = true;
    karrHealth = CONFIG.karrHealth;
    karrRespawnTimer = 0;
    karrShootTimer = 7.5;
    karrHitProtectionUntil = 0;
    playerShootTimer = 0;
    karrProximityState = 'normal';
    karrProximityCooldown = 0;
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
    karrMesh.position.set(x, y + .66, z);
    karrMesh.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    karrMesh.userData.legacyModel?.userData.animate(clock.elapsedTime,CONFIG.karrSpeed);
    const scanner = karrMesh.userData.scanner;
    if (scanner) {
        const close = karrProximityState === 'close';
        const warning = karrProximityState === 'warning';
        const hz = close ? 18 : warning ? 12 : 8;
        const hot = Math.sin(clock.elapsedTime * hz) > 0;
        scanner.material.color.setHex(close ? (hot ? 0xffff88 : 0xff3a00) : warning ? (hot ? 0xffe05a : 0xff8c00) : (hot ? 0xffd34d : 0xff7200));
        scanner.scale.x = close ? 1.18 + Math.sin(clock.elapsedTime * 18) * .12 : warning ? 1.07 : 1;
    }
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
    if (!clock || clock.elapsedTime < karrHitProtectionUntil) return;
    karrHitProtectionUntil = clock.elapsedTime + 2.5;
    damageFlash();
    triggerPremiumImpact(.65, carBody.position.x, carBody.position.y + .35, carBody.position.z);
    carBody.velocity.x *= .9; carBody.velocity.z *= .9;
    showMessage('IMPACT KARR · protection temporaire 2,5 s');
    playCrashVoice();
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
    karrShootTimer -= dt;
    karrProximityCooldown = Math.max(0, karrProximityCooldown - dt);
    const distance = karrMesh.position.distanceTo(carMesh.position);
    const nextState = distance < CONFIG.karrCloseDistance ? 'close'
        : distance < CONFIG.karrWarningDistance ? 'warning' : 'normal';
    if (nextState !== karrProximityState) {
        karrProximityState = nextState;
        if (nextState === 'close' && karrProximityCooldown <= 0) {
            if (window.KA?.sfx?.karrProximity) KA.sfx.karrProximity();
            karrProximityCooldown = CONFIG.karrProximityCooldown;
        }
    }
    updateKarrPose();
    if (karrStatusEl) {
        karrStatusEl.classList.remove('warning', 'close', 'danger');
        if (karrProximityState !== 'normal') karrStatusEl.classList.add(karrProximityState);
        const metres = Math.max(0, Math.round(distance));
        if (karrProximityState === 'close') {
            karrStatusEl.textContent = '⚠ KARR SE RAPPROCHE · ' + metres + ' M · ' + karrHealth + ' IMPACT' + (karrHealth > 1 ? 'S' : '');
        } else if (karrProximityState === 'warning') {
            karrStatusEl.textContent = 'KARR // PROXIMITÉ · ' + metres + ' M · ' + karrHealth + ' IMPACT' + (karrHealth > 1 ? 'S' : '');
        } else {
            karrStatusEl.textContent = 'KARR // IA ACTIVE · ' + karrHealth + ' IMPACT' + (karrHealth > 1 ? 'S' : '');
        }
    }
    // KARR reste un rival visible, pas une tourelle qui tire à travers le circuit.
    if (CONFIG.karrReturnFire && karrShootTimer <= 0 && distance < 34) {
        fireKarrWeapon();
        karrShootTimer = CONFIG.karrShootInterval + Math.random() * 2.5;
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
    showMessage(spmActive ? '◆ ACTIVATION DU S.P.M !' : '◇ SPM DÉSACTIVÉ');
    initAudio();
    if (spmActive) playRaceVoice('spm');
    [220,330,440,660,880].forEach((f,i)=>setTimeout(()=>beep(f,.11),i*120));
}

function collectSpmPickup(pickup) {
    if (pickup.userData.collected || spmActive) return;
    pickup.userData.collected = true;
    pickup.visible = false;
    showMessage('◆ SPM REPÉRÉ — TRANSFORMATION !');
    toggleSPM();
}

function updateSPM(dt) {
    const target = spmActive ? 1 : 0;
    spmProgress += clamp(target-spmProgress,-dt*.72,dt*.72);
    const t = spmProgress*spmProgress*(3-2*spmProgress);
    for (const p of spmParts) {
        p.mesh.visible = !carMesh.userData.legacyActive || spmProgress > .01;
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

// ============================================
// ANNONCES VOCALES LOCALES — Web Speech API si disponible,
// fallback motifs WebAudio sinon. 100 % local, aucun cloud.
// ============================================
const Announcer = (function () {
    const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    let frVoice = null;
    let cooldownUntil = 0;
    function pickVoice() {
        if (!supported) return;
        try {
            const voices = speechSynthesis.getVoices() || [];
            frVoice = voices.find(v => /^fr/i.test(v.lang)) || voices.find(v => /fr/i.test(v.lang)) || null;
        } catch (e) { frVoice = null; }
    }
    if (supported) {
        pickVoice();
        try { speechSynthesis.onvoiceschanged = pickVoice; } catch (e) { /* noop */ }
    }
    // Fallback 100 % WebAudio quand la synthèse vocale est indisponible.
    function fallback(kind) {
        if (!window.KA) return;
        if (kind === 'depart') KA.sfx.countGo();
        else if (kind === 'checkpoint') KA.sfx.checkpoint();
        else if (kind === 'victoire') KA.sfx.fanfare();
        else KA.sfx.collision(1);
    }
    function speak(text, kind, force) {
        const now = Date.now();
        if (!force && now < cooldownUntil) return;   // évite les annonces qui se chevauchent
        cooldownUntil = now + 900;
        if (!supported) { fallback(kind); return; }
        try {
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'fr-FR';
            if (frVoice) u.voice = frVoice;
            u.rate = 1.04; u.pitch = 0.95; u.volume = 0.95;
            speechSynthesis.speak(u);
        } catch (e) { fallback(kind); }
    }
    function stop() {
        if (supported) { try { speechSynthesis.cancel(); } catch (e) { /* noop */ } }
    }
    return { speak, stop, supported };
})();

// Arrêt TOTAL de tout le son : WebAudio (véhicule + musique + contexte) et voix.
// Utilisé à la sortie, en pause, quand l'onglet passe caché et au beforeunload.
function stopAllAudio() {
    if (window.KA) KA.stopAll();
    Announcer.stop();
    // Les annonces pilotes utilisent HTMLAudio, séparé de WebAudio :
    // les stopper aussi pour garantir un silence absolu en quittant.
    for (const cache of [pilotVoiceCache, raceVoiceCache]) {
        cache.forEach(audio => {
            try { audio.pause(); audio.currentTime = 0; audio.onended = null; } catch (e) { /* noop */ }
        });
    }
    if (window.KA) KA.setVoiceDucking(false);
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) { /* noop */ }
}

// Retour à l'accueil KITT — coupe tout le son puis navigation.
function goHome() {
    stopAllAudio();
    try { if (window.KE) KE.close(); } catch (e) { /* noop */ }
    if(['localhost','127.0.0.1'].includes(location.hostname)||location.protocol==='file:')backToMenu();
    else location.href=location.hostname==='kitt-franco-belge.be'?'/arcade':'/static/index.html';
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
            if (e.code === 'Digit5') startRace(5);
            if (e.code === 'Digit6') startRace(6);
            if (e.code === 'Digit7') startRace(7);
            if (e.code === 'Digit8') startRace(8);
            if (e.code === 'Digit9') startRace(9);
            if (e.code === 'Digit0') startRace(10);
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
    window.addEventListener('blur',()=>{clearDriveInputs();if(state==='racing')pauseGame()});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){clearDriveInputs();if(state==='racing')pauseGame()}});
    setupMobileControls();
}

function setMobileControlsVisible(visible) {
    document.body.classList.toggle('race-mobile-controls', !!visible);
    if (!visible) clearDriveInputs();
}

function setupMobileControls() {
    const panel = document.getElementById('mobile-race-controls');
    if (!panel || panel.dataset.bound) return;
    panel.dataset.bound = '1';
    panel.querySelectorAll('[data-drive]').forEach(button => {
        const key = button.dataset.drive;
        const pointers = new Set();
        button.addEventListener('drive-reset',()=>pointers.clear());
        const release = (event) => {
            event.preventDefault();
            pointers.delete(event.pointerId);
            mobileInput[key] = pointers.size > 0;
            button.classList.toggle('pressed',mobileInput[key]);
        };
        button.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            pointers.add(event.pointerId);
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
            gyroLastEventAt = Date.now();
            if (!gyroReady) { gyroNeutral = gyroGamma; gyroReady = true; }
            if (mobileControlMode === 'gyro-pending') {
                clearTimeout(gyroActivationTimer);
                gyroActivationTimer = 0;
                mobileControlMode = 'gyro';
                document.body.classList.add('mobile-gyro');
                const modeButton = document.getElementById('mobile-control-mode');
                const status = document.getElementById('mobile-control-status');
                if (modeButton) {
                    modeButton.textContent = 'GYRO · REVENIR TACTILE';
                    modeButton.setAttribute('aria-pressed', 'true');
                }
                if (status) status.textContent = 'GYROSCOPE ACTIF · INCLINEZ LE TÉLÉPHONE';
            }
        }
    }, { passive:true });
}

// Sur téléphone, la barre Turbo remplace la touche Espace.
const mobileTurboBar = document.getElementById('mobile-turbo-bar');
if (mobileTurboBar) {
    mobileTurboBar.addEventListener('click', () => activateTurbo(), { passive:true });
    mobileTurboBar.addEventListener('keydown', (event) => {
        if (event.code === 'Enter' || event.code === 'Space') {
            event.preventDefault();
            activateTurbo();
        }
    });
}

async function enableMobileGyro(event) {
    event?.preventDefault?.();
    if (mobileControlMode === 'gyro' || mobileControlMode === 'gyro-pending') { disableMobileGyro(); return; }
    const status = document.getElementById('mobile-control-status');
    try {
        if (typeof DeviceOrientationEvent === 'undefined') throw new Error('unsupported');
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission !== 'granted') throw new Error('denied');
        }
        gyroReady = false;
        gyroLastEventAt = 0;
        mobileControlMode = 'gyro-pending';
        document.body.classList.remove('mobile-gyro');
        const modeButton = document.getElementById('mobile-control-mode');
        if (modeButton) { modeButton.textContent = 'GYRO · ANNULER'; modeButton.setAttribute('aria-pressed', 'false'); }
        if (status) status.textContent = 'VÉRIFICATION DU GYROSCOPE…';
        gyroActivationTimer = window.setTimeout(() => {
            if (mobileControlMode !== 'gyro-pending') return;
            gyroActivationTimer = 0;
            disableMobileGyro();
            if (modeButton) modeButton.textContent = 'GYRO INDISPONIBLE · TACTILE';
            if (status) status.textContent = 'TACTILE ACTIF · AUCUNE MESURE GYRO';
            showMessage('Aucune mesure du gyroscope : commandes tactiles rétablies');
        }, 1800);
    } catch (error) {
        mobileControlMode = 'touch';
        const modeButton = document.getElementById('mobile-control-mode');
        if (modeButton) modeButton.textContent = 'GYRO INDISPONIBLE · TACTILE';
        if (status) status.textContent = 'TACTILE ACTIF · GYRO NON AUTORISÉ';
        showMessage('Gyroscope indisponible : utilisez les commandes tactiles');
    }
}

function disableMobileGyro() {
    clearTimeout(gyroActivationTimer);
    gyroActivationTimer = 0;
    mobileControlMode = 'touch';
    gyroReady = false;
    document.body.classList.remove('mobile-gyro');
    const modeButton = document.getElementById('mobile-control-mode');
    const status = document.getElementById('mobile-control-status');
    if (modeButton) { modeButton.textContent = 'TACTILE · ACTIVER GYRO'; modeButton.setAttribute('aria-pressed', 'false'); }
    if (status) status.textContent = 'TACTILE ACTIF';
}

const RACER_TUTORIAL_STEPS = [
    { title:'1 / ACCÉLÉRER', body:'Sur clavier : flèche ↑ ou W. Sur téléphone : maintiens ▲ ACCÉLÉRER. Relâche pour laisser la voiture rouler.' },
    { title:'2 / TOURNER', body:'Flèches ← → ou A / D. Sur téléphone : maintiens ◀ ou ▶. Le braquage se recentre progressivement quand tu relâches.' },
    { title:'3 / FREINER', body:'Flèche ↓ ou S ; sur téléphone, maintiens ▼. Une petite impulsion suffit avant un virage : évite de braquer à fond à grande vitesse.' },
    { title:'4 / TURBO', body:'Espace au clavier ou touche la jauge TURBO à gauche sur mobile. Garde-le pour une ligne droite ; il se recharge automatiquement.' },
    { title:'5 / OUTILS KITT', body:'F tire sur KARR, Q déploie le SPM, X active le scanner et R te replace au dernier checkpoint. Échap met la course en pause.' },
    { title:'6 / TÉLÉPHONE', body:'Les commandes tactiles sont actives par défaut. GYRO est optionnel : si aucun capteur ne répond, les boutons tactiles reprennent automatiquement.' }
];
let racerTutorialIndex = 0;
let tutorialPractice = false;
let tutorialCoachIndex = 0;
const TUTORIAL_ACTIONS = [
    { label:'Maintiens accélérer', keys:['ArrowUp','KeyW'], targets:['[data-drive="accelerate"]'] },
    { label:'Tourne à gauche ou à droite', keys:['ArrowLeft','ArrowRight','KeyA','KeyD'], targets:['[data-drive="left"]','[data-drive="right"]'] },
    { label:'Freine', keys:['ArrowDown','KeyS'], targets:['[data-drive="brake"]'] },
    { label:'Déclenche le turbo', keys:['Space'], targets:['#mobile-turbo-bar'] },
    { label:'Utilise le tir KITT', keys:['KeyF'], targets:['#fire-toggle'] }
];

function renderRacerTutorial() {
    const step = RACER_TUTORIAL_STEPS[racerTutorialIndex];
    const title = document.getElementById('tutorial-title');
    const content = document.getElementById('tutorial-content');
    const progress = document.getElementById('tutorial-progress');
    const back = document.getElementById('tutorial-back');
    const next = document.getElementById('tutorial-next');
    if (title) title.textContent = step.title;
    if (content) content.textContent = step.body;
    if (progress) progress.textContent = `ÉTAPE ${racerTutorialIndex + 1} / ${RACER_TUTORIAL_STEPS.length}`;
    if (back) back.disabled = racerTutorialIndex === 0;
    if (next) next.textContent = racerTutorialIndex === RACER_TUTORIAL_STEPS.length - 1 ? 'TERMINER' : 'SUIVANT →';
}

function openRacerTutorial() {
    racerTutorialIndex = 0;
    renderRacerTutorial();
    document.getElementById('tutorial-screen')?.classList.remove('hidden');
}

function closeRacerTutorial() {
    document.getElementById('tutorial-screen')?.classList.add('hidden');
}

function moveRacerTutorial(direction) {
    const next = racerTutorialIndex + direction;
    if (next < 0) return;
    if (next >= RACER_TUTORIAL_STEPS.length) { closeRacerTutorial(); return; }
    racerTutorialIndex = next;
    renderRacerTutorial();
}

function showTutorialCoach() {
    if (!tutorialPractice) return;
    const step = TUTORIAL_ACTIONS[tutorialCoachIndex];
    const box = document.getElementById('tutorial-coach');
    const label = document.getElementById('tutorial-coach-text');
    if (!step || !box || !label) {
        tutorialPractice = false;
        box?.classList.add('hidden');
        return;
    }
    label.textContent = `TUTORIEL ${tutorialCoachIndex + 1}/${TUTORIAL_ACTIONS.length} · ${step.label}`;
    box.classList.remove('hidden');
}

function registerTutorialAction(key, target) {
    if (!tutorialPractice || state !== 'racing') return;
    const expected = TUTORIAL_ACTIONS[tutorialCoachIndex];
    if (!expected) return;
    const keyMatch = key && expected.keys.includes(key);
    const targetMatch = target && expected.targets.some(selector => target.matches?.(selector) || target.closest?.(selector));
    if (!keyMatch && !targetMatch) return;
    tutorialCoachIndex++;
    showTutorialCoach();
}

function readCareerCleared() {
    try {
        const raw = JSON.parse(localStorage.getItem(CAREER_KEY) || '[]');
        return new Set(Array.isArray(raw) ? raw.filter(level => CAREER_LEVELS.includes(level)) : []);
    } catch (_) { return new Set(); }
}

function nextCareerLevel() {
    const cleared = readCareerCleared();
    return CAREER_LEVELS.find(level => !cleared.has(level)) || null;
}

function updateCareerButton() {
    const button = document.getElementById('btn-career');
    if (!button) return;
    const cleared = readCareerCleared();
    const next = CAREER_LEVELS.find(level => !cleared.has(level));
    button.textContent = next
        ? `🏁 CARRIÈRE · ${cleared.size}/${CAREER_LEVELS.length} · MISSION ${CAREER_LEVELS.indexOf(next) + 1}`
        : '🏆 CARRIÈRE TERMINÉE · REJOUER NIVEAU 1';
}

function startCareerMission() {
    let level = nextCareerLevel();
    if (level === null) {
        localStorage.removeItem(CAREER_KEY);
        updateCareerButton();
        level = CAREER_LEVELS[0];
    }
    startRace(level, true);
}

function setupUI() {
    document.getElementById('btn-level1').addEventListener('click', () => startRace(1));
    document.getElementById('btn-level2').addEventListener('click', () => startRace(2));
    document.getElementById('btn-level3').addEventListener('click', () => startRace(3));
    document.getElementById('btn-career')?.addEventListener('click', startCareerMission);
    document.getElementById('btn-tutorial')?.addEventListener('click', openRacerTutorial);
    document.getElementById('tutorial-close')?.addEventListener('click', closeRacerTutorial);
    document.getElementById('tutorial-back')?.addEventListener('click', () => moveRacerTutorial(-1));
    document.getElementById('tutorial-next')?.addEventListener('click', () => moveRacerTutorial(1));
    document.getElementById('tutorial-start')?.addEventListener('click', () => {
        tutorialCoachIndex = 0;
        closeRacerTutorial();
        startRace(1, false, true);
    });
    document.getElementById('tutorial-coach-skip')?.addEventListener('click', () => {
        tutorialPractice = false;
        document.getElementById('tutorial-coach')?.classList.add('hidden');
    });
    document.addEventListener('keydown', event => registerTutorialAction(event.code, null), true);
    document.addEventListener('pointerdown', event => registerTutorialAction(null, event.target), true);
    for (let level = 5; level <= 10; level++) {
        document.getElementById('btn-level' + level)?.addEventListener('click', () => startRace(level));
    }
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
    document.getElementById('btn-restart').addEventListener('click', () => startRace(currentLevel, careerRunActive));
    document.getElementById('btn-career-next')?.addEventListener('click', startCareerMission);
    document.getElementById('btn-menu').addEventListener('click', backToMenu);
    // Bouton ACCUEIL flottant : toujours accessible (tactile ou souris).
    const bHome = document.getElementById('btn-home');
    if (bHome) bHome.addEventListener('click', goHome);
    // Arrêt total du son à la fermeture de la page/onglet.
    window.addEventListener('pagehide', stopAllAudio);
    window.addEventListener('beforeunload', stopAllAudio);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopAllAudio();
        else if (state !== 'paused' && state !== 'editor' && window.KA) KA.resumeAll();
    });
    updateMusicButtons(window.KA ? KA.musicOn() : false);
    updateCareerButton();
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
    hideRaceTraffic();
    paused = false;
    careerRunActive = false;
    tutorialPractice = false;
    document.getElementById('tutorial-coach')?.classList.add('hidden');
    state = 'menu';
    if (window.KA) KA.setMusicScene('menu');
    setMobileControlsVisible(false);
    Announcer.stop();
    for (const cache of [pilotVoiceCache, raceVoiceCache]) cache.forEach(audio => { audio.pause(); audio.currentTime = 0; audio.onended = null; });
    if (window.KA) KA.setVoiceDucking(false);
    silenceVehicle();
    if (window.KA) KA.resumeAll();  // le menu peut relancer la musique si activée
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

let kironextIntroTimer = 0;
let driverLaunchTimer = 0;
function showDriverLaunchPresentation(level) {
    const screen = document.getElementById('driver-launch-intro');
    const content = document.getElementById('driver-launch-content');
    const remember = document.getElementById('driver-launch-remember');
    if (localStorage.getItem('kx-skip-driver-presentation') === '1' || !screen || !content) {
        beginRace(level); return;
    }
    selectedDriver = getDriver(selectedDriverId);
    const profile = selectedDriver;
    content.innerHTML = `${portraitMarkup(profile, true)}<div class="driver-launch-copy"><h2>${profile.name}</h2><p>${profile.flag} ${profile.region}</p><strong>${profile.car}</strong><small>${profile.desc}</small></div>${driverCarPreviewMarkup(profile, 'driver-launch-car')}`;
    screen.onclick = event => {
        if (event.target.closest('#driver-launch-skip')) return;
        if (event.target.closest('.driver-portrait, .driver-launch-copy')) playPilotVoice(profile);
    };
    if (remember) remember.checked = false;
    screen.classList.remove('hidden'); screen.setAttribute('aria-hidden', 'false');
    playPilotVoice(profile);
    const finish = () => {
        clearTimeout(driverLaunchTimer);
        if (remember?.checked) localStorage.setItem('kx-skip-driver-presentation', '1');
        screen.classList.add('hidden'); screen.setAttribute('aria-hidden', 'true');
        const skip = document.getElementById('driver-launch-skip');
        if (skip) skip.onclick = null;
        screen.onclick = null;
        beginRace(level);
    };
    const skip = document.getElementById('driver-launch-skip');
    if (skip) skip.onclick = finish;
    driverLaunchTimer = setTimeout(finish, 2800);
}

function showKironextIntro(level) {
    const intro = document.getElementById('kironext-intro');
    if (!intro) { openDriverSelect(level); return; }
    const finish = () => {
        clearTimeout(kironextIntroTimer);
        intro.classList.add('hidden'); intro.setAttribute('aria-hidden', 'true');
        openDriverSelect(level);
    };
    const names = {1:'CLASSIQUE // RAMPE & SAUT',2:'NUIT RAPIDE // COURSE URBAINE',3:'LOOPING // BOUCLE VERTICALE',5:'FOUDRE // DÉFI ÉLECTRIQUE',6:'NÉON // SÉRIE DE VIRAGES',7:'PONT SUSPENDU // ALTITUDE',8:'INCENDIE // ZONE DE DANGER',9:'ORBITE // CIRCUIT COSMIQUE',10:'FINALE // ÉPREUVE ULTIME',4:'CIRCUIT PERSONNALISÉ'};
    let subtitle = document.getElementById('kironext-intro-circuit');
    if (!subtitle) { subtitle = document.createElement('div'); subtitle.id = 'kironext-intro-circuit'; subtitle.className = 'kironext-intro-circuit'; intro.appendChild(subtitle); }
    subtitle.textContent = names[level] || `CIRCUIT ${level}`;
    intro.insertBefore(subtitle, document.getElementById('kironext-intro-skip'));
    let laps = document.getElementById('kironext-intro-laps');
    if (!laps) { laps = document.createElement('div'); laps.id = 'kironext-intro-laps'; laps.className = 'kironext-intro-laps'; intro.appendChild(laps); }
    laps.textContent = `${RACE_LAPS} TOURS // CHECKPOINTS ACTIVÉS // KITT PRÊT`;
    intro.insertBefore(laps, document.getElementById('kironext-intro-skip'));
    intro.classList.remove('hidden'); intro.setAttribute('aria-hidden', 'false');
    const skip = document.getElementById('kironext-intro-skip');
    if (skip) { skip.removeEventListener('click', finish); skip.addEventListener('click', finish, { once:true }); }
    kironextIntroTimer = setTimeout(finish, 4200);
}

// Toute entrée « nouvelle course » passe par l'intro puis la sélection du pilote.
function startRace(level, career = false, tutorial = false) {
    careerRunActive = Boolean(career);
    tutorialPractice = Boolean(tutorial);
    if (window.KA) { KA.setMusicScene('pilot'); KA.ensure(); }
    showKironextIntro(level);
}

function beginRace(level) {
    initAudio();
    if (window.KA) KA.ensure();
    if (window.KA) KA.resumeAll();
    if (window.KA) KA.setMusicScene('race');
    silenceVehicle();               // moteur coupé pendant le compte à rebours
    document.getElementById('btn-career-next')?.classList.add('hidden');

    const requestedLevel = Number(level);
    const nextLevel = Number.isInteger(requestedLevel) && LEVEL_DATA[requestedLevel]
        ? requestedLevel
        : currentLevel;
    setLevel(nextLevel);
    resetCarDamage();
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
    currentRaceLap = 1;
    raceTime = 0;
    raceStartTime = 0;
    raceLapStartTime = 0;
    raceElapsedBeforeLap = 0;
    updateRaceLapHud();
    raceDistance = 0;
    odometerReady = false;
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
    setupRaceTraffic();
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
    wasGrounded = false;
    prevVelY = 0;
    landingEffectCooldown = 0;
    trailEmissionTimer = 0;
    turboSparkTimer = 0;
    turboSmokeTimer = 0;
    paused = false;
    for (const pickup of turboPickups) {
        pickup.userData.collected = false;
        pickup.visible = true;
    }
    for (const pickup of spmPickups) {
        pickup.userData.collected = false;
        pickup.visible = true;
    }

    resetCarTo(respawnPoint);
    lastOdometerX = carBody.position.x;
    lastOdometerZ = carBody.position.z;
    odometerReady = true;

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
    raceLapStartTime = Date.now();
    if (!raceStartTime) raceStartTime = raceLapStartTime;
    for (let i = 0; i < 4; i++) vehicle.setBrake(0, i);
    showMessage('C\'EST PARTI !');
    playRaceVoice('start');
    showTutorialCoach();
}

function pauseGame() {
    if (state !== 'racing') return;
    paused = true;
    state = 'paused';
    setMobileControlsVisible(false);
    stopAllAudio();                 // arrêt total : moteur + musique + WebAudio + voix
    document.getElementById('pause-menu').classList.remove('hidden');
}

function resumeGame() {
    if (state !== 'paused') return;
    paused = false;
    state = 'racing';
    setMobileControlsVisible(true);
    if (window.KA) KA.resumeAll();  // réveil WebAudio (+ musique si activée)
    raceElapsedBeforeLap = raceTime;
    raceLapStartTime = Date.now();
    raceStartTime = raceLapStartTime - raceElapsedBeforeLap * 1000;
    document.getElementById('pause-menu').classList.add('hidden');
}

function updateMenuBest() {
    const el = document.getElementById('menu-best');
    if (!el) return;
    const levels = [1, 2, 3, 5, 6, 7, 8, 9, 10, 4];
    const records = [];
    for (const lvl of levels) {
        const best = parseFloat(localStorage.getItem('kittStuntRacingBest3Lap' + lvl));
        if (Number.isFinite(best) && best > 0) {
            records.push({ label: lvl === 4 ? 'PERSO' : 'N' + lvl, time: formatTime(best) });
        }
    }
    el.replaceChildren();
    const count = document.createElement('span');
    count.className = 'menu-record-count';
    count.textContent = `🏆 RECORDS ${records.length}/10`;
    el.appendChild(count);
    for (const record of records) {
        const chip = document.createElement('span');
        chip.className = 'menu-record-chip';
        chip.textContent = `${record.label} ${record.time}`;
        el.appendChild(chip);
    }
    if (records.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'menu-record-empty';
        empty.textContent = 'Lance un circuit pour inscrire ton temps';
        el.appendChild(empty);
    }
    el.classList.remove('hidden');
}

function updateRaceLapHud() {
    const lapEl = document.getElementById('race-lap');
    if (!lapEl) return;
    lapEl.setAttribute('aria-label', `Tour ${currentRaceLap} sur ${RACE_LAPS}`);
    lapEl.innerHTML = `TOUR ${currentRaceLap} / ${RACE_LAPS}<span class="race-lap-segments" aria-hidden="true">${Array.from({length:RACE_LAPS}, (_,i) => `<i class="${i < currentRaceLap ? 'active' : ''}"></i>`).join('')}</span>`;
}

function completeRaceLap() {
    raceTime = raceElapsedBeforeLap + Math.max(0, Date.now() - raceLapStartTime) / 1000;
    raceElapsedBeforeLap = raceTime;
    currentRaceLap++;
    nextCp = 0;
    const spawn = LEVEL_DATA[currentLevel].spawn;
    respawnPoint = { ...spawn };
    resetCarTo(spawn);
    for (const pickup of [...turboPickups, ...spmPickups]) {
        pickup.userData.collected = false;
        pickup.visible = true;
    }
    resetKarr();
    updateRaceLapHud();
    state = 'countdown';
    countdownT = 3.6;
    countdownLast = -1;
    countdownEl.textContent = '3';
    countdownEl.classList.remove('hidden', 'go');
    for (let i = 0; i < 4; i++) vehicle.setBrake(30, i);
    showMessage(`TOUR ${currentRaceLap}/${RACE_LAPS} — C'EST REPARTI !`);
}

function finishRace() {
    state = 'finished';
    if (window.KA) KA.setMusicScene('victory');
    setMobileControlsVisible(false);
    hideRaceTraffic();
    raceTime = raceElapsedBeforeLap + Math.max(0, Date.now() - raceLapStartTime) / 1000;
    silenceVehicle();               // moteur au ralenti à l'arrivée

    const bestKey = 'kittStuntRacingBest3Lap' + currentLevel;
    const prevBest = parseFloat(localStorage.getItem(bestKey));
    let record = false;
    if (!prevBest || raceTime < prevBest) {
        localStorage.setItem(bestKey, String(raceTime));
        record = true;
    }

    const careerNextButton = document.getElementById('btn-career-next');
    if (careerRunActive && CAREER_LEVELS.includes(currentLevel)) {
        const cleared = readCareerCleared();
        cleared.add(currentLevel);
        localStorage.setItem(CAREER_KEY, JSON.stringify([...cleared]));
        updateCareerButton();
        const next = nextCareerLevel();
        if (careerNextButton) {
            careerNextButton.textContent = next
                ? `▶ MISSION ${CAREER_LEVELS.indexOf(next) + 1} · NIVEAU ${next}`
                : '🏆 REJOUER LA CARRIÈRE';
            careerNextButton.classList.remove('hidden');
        }
    } else {
        careerNextButton?.classList.add('hidden');
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

function setTurboPremiumVisual(active) {
    active = Boolean(active);
    if (lastTurboPremiumVisual === active) return;
    lastTurboPremiumVisual = active;
    if (speedLinesEl) speedLinesEl.classList.toggle('turbo', active);
    if (turboVignetteEl) turboVignetteEl.classList.toggle('active', active);
    if (gameCanvasEl) gameCanvasEl.classList.toggle('turbo-chromatic', active && !LOW_POWER_MODE);
}

function triggerTurboPremium() {
    setTurboPremiumVisual(true);
    if (!carMesh || !PARTICLES.pool.length) return;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(carMesh.quaternion).normalize();
    const origin = carMesh.position.clone().addScaledVector(fwd, 2.7);
    origin.y += .35;
    spawnParticle(shared().turboWaveTex,
        origin.x, origin.y, origin.z,
        fwd.x * (LOW_POWER_MODE ? 13 : 21), .15, fwd.z * (LOW_POWER_MODE ? 13 : 21),
        LOW_POWER_MODE ? .42 : .58, LOW_POWER_MODE ? .9 : 1.35, LOW_POWER_MODE ? 1.6 : 2.8, 1.2);
}

function triggerPremiumImpact(intensity, x, y, z, nx = 0, nz = 0, allowPartDamage = false) {
    const k = clamp(intensity || .35, .15, 1);
    const now = performance.now();
    camShake = Math.max(camShake, .18 + k * .55);
    // Un contact peut persister plusieurs frames. La physique et la secousse
    // restent réactives, mais on limite les flashes et gerbes de
    // particules à une cadence visuelle humaine, au lieu de les recréer à 60 Hz.
    const emitVisualImpact = now - lastImpactVisualAt >= 160;
    if (emitVisualImpact) lastImpactVisualAt = now;
    if (emitVisualImpact && impactFlashEl && k > .35) {
        playOverlayFlash(impactFlashEl, 180, 'rgba(255,244,210,.38)', 'rgba(255,90,25,.16)');
    }
    if (window.KA?.sfx?.collision && now - lastCollisionSoundAt > 130) {
        KA.sfx.collision(k);
        lastCollisionSoundAt = now;
    }
    if (allowPartDamage && k >= .52 && now - lastPartDamageAt > 1400) {
        detachCarPartAtImpact(x, y, z, nx, nz, k);
    }
    if (!emitVisualImpact || !PARTICLES.pool.length) return;
    const count = LOW_POWER_MODE ? Math.max(2, Math.round(2 + k * 2)) : Math.round(4 + k * 5);
    const sp = shared();
    spawnParticle(sp.impactFlashTex, x, y + .15, z, 0, .25, 0, .18, .45 + k * .45, 1.8, 1.1);
    for (let i = 0; i < count; i++) {
        const spread = (Math.random() - .5) * 5;
        spawnParticle(sp.sparkTex, x, y + .1, z,
            nx * (2 + k * 5) + spread, 1.5 + Math.random() * 4 * k,
            nz * (2 + k * 5) + (Math.random() - .5) * 5,
            .22 + Math.random() * .28, .18 + Math.random() * .18, .55, .35);
    }
}

function activateTurbo() {
    if (turboActive || turboCooldown > 0 || state !== 'racing') return;
    turboActive = true;
    turboTimer = CONFIG.turboDuration;
    turboCooldown = CONFIG.turboCooldown + CONFIG.turboDuration;
    camShake = Math.max(camShake, 0.25);
    showMessage('⚡ TURBO !');
    playTurboSound();
    playRaceVoice('turbo');
    triggerTurboPremium();
}

function playOverlayFlash(element, duration, bright, edge) {
    if (!element || typeof element.animate !== 'function') return;
    for (const animation of element.getAnimations()) animation.cancel();
    element.animate([
        { opacity: 1, background: `radial-gradient(ellipse at center, ${bright} 0%, ${edge} 35%, transparent 75%)` },
        { opacity: 0 }
    ], { duration, easing: 'ease-out', fill: 'none' });
}

function detachCarPartAtImpact(x, y, z, nx, nz, severity) {
    if (!carMesh || !scene || !carBody) return;
    const local = carMesh.worldToLocal(new THREE.Vector3(x, y, z));
    const name = Math.abs(local.z) > 1.85
        ? (local.z > 0 ? 'frontBumper' : 'rearBumper')
        : Math.abs(local.x) > .78 ? (local.x < 0 ? 'mirrorLeft' : 'mirrorRight') : null;
    const part = name && carDamageParts[name];
    if (!part || part.detached) return;

    const mesh = part.mesh;
    mesh.updateMatrixWorld(true);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    mesh.matrixWorld.decompose(position, quaternion, scale);
    carMesh.remove(mesh);
    scene.add(mesh);
    mesh.position.copy(position);
    mesh.quaternion.copy(quaternion);
    mesh.scale.copy(scale);
    part.originalMaterial = mesh.material;
    if (mesh.material?.clone) {
        mesh.material = mesh.material.clone();
        if (mesh.material.color) mesh.material.color.multiplyScalar(.68);
        if (mesh.material.emissive) mesh.material.emissive.setHex(0x260509);
    }
    const side = Math.sign(local.x || nx || 1);
    part.detached = true;
    lastPartDamageAt = performance.now();
    detachedCarParts.push({
        part, life: 2.8,
        vx: carBody.velocity.x * .25 + nx * (2 + severity * 3) + side * 1.2,
        vy: 2.5 + severity * 2,
        vz: carBody.velocity.z * .25 + nz * (2 + severity * 3) + Math.sign(local.z || nz || 1),
        rx: (Math.random() - .5) * 7,
        ry: (Math.random() - .5) * 7,
        rz: (Math.random() - .5) * 7
    });
    showMessage(name.includes('Bumper') ? 'DÉGÂTS — PARE-CHOCS DÉTACHÉ' : 'DÉGÂTS — RÉTROVISEUR ARRACHÉ');
}

function updateDetachedCarParts(dt) {
    for (let i = detachedCarParts.length - 1; i >= 0; i--) {
        const debris = detachedCarParts[i];
        const mesh = debris.part.mesh;
        debris.life -= dt;
        debris.vy -= 9.8 * dt;
        mesh.position.x += debris.vx * dt;
        mesh.position.y += debris.vy * dt;
        mesh.position.z += debris.vz * dt;
        mesh.rotation.x += debris.rx * dt;
        mesh.rotation.y += debris.ry * dt;
        mesh.rotation.z += debris.rz * dt;
        debris.vx *= Math.max(0, 1 - dt * .18);
        debris.vz *= Math.max(0, 1 - dt * .18);
        if (debris.life <= 0 || mesh.position.y < -8) {
            scene.remove(mesh);
            if (mesh.material !== debris.part.originalMaterial) mesh.material.dispose?.();
            mesh.material = debris.part.originalMaterial;
            detachedCarParts.splice(i, 1);
        }
    }
}

function resetCarDamage() {
    for (const debris of detachedCarParts) {
        const part = debris.part;
        scene.remove(part.mesh);
        if (part.mesh.material !== part.originalMaterial) part.mesh.material.dispose?.();
        part.mesh.material = part.originalMaterial;
    }
    detachedCarParts = [];
    for (const part of Object.values(carDamageParts)) {
        if (!part.detached) continue;
        part.mesh.position.copy(part.position);
        part.mesh.quaternion.copy(part.quaternion);
        if(part.scale)part.mesh.scale.copy(part.scale);else part.mesh.scale.set(1, 1, 1);
        carMesh.add(part.mesh);
        part.detached = false;
    }
}

function collectTurboPickup(pickup, forward, steer, speedAbs) {
    pickup.userData.collected = true;
    pickup.visible = false;
    // Une bouteille n'est pleinement puissante que si le joueur est lancé et
    // presque droit : cela évite les départs incontrôlables dans les virages.
    const longStraight = Math.abs(steer) <= 0.08 && speedAbs >= 18;
    turboActive = true;
    turboTimer = Math.max(turboTimer, longStraight ? CONFIG.pickupStraightDuration : CONFIG.pickupTurboDuration);
    turboCooldown = 0;
    const impulse = longStraight ? CONFIG.pickupStraightImpulse : CONFIG.pickupImpulse;
    carBody.velocity.x += forward.x * impulse;
    carBody.velocity.z += forward.z * impulse;
    camShake = Math.max(camShake, longStraight ? .42 : .2);
    showMessage(longStraight ? '⚡ TURBO LIGNE DROITE !' : '⚡ TURBO RAMASSÉ');
    playTurboSound();
    playRaceVoice('turbo');
    triggerTurboPremium();
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

// Émet une particule de trail derrière la voiture
function spawnTrailParticle(x, y, z, speedFactor) {
    if (!shared().trailTex || !carMesh) return;
    const s = shared();
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(carMesh.quaternion);
    const premiumTurbo = turboActive && s.neonTrailTex;
    const mat = premiumTurbo ? s.neonTrailTex : s.trailTex;
    const size = premiumTurbo ? (LOW_POWER_MODE ? .20 : .28) : .15 + Math.random() * .1;
    spawnParticle(mat,
        x + back.x * 0.5, y + 0.3, z + back.z * 0.5,
        -back.x * (5 + Math.random() * 3) * speedFactor,
        0.5 + Math.random() * 1,
        -back.z * (5 + Math.random() * 3) * speedFactor,
        premiumTurbo ? .52 : .4 + Math.random() * .3, size, premiumTurbo ? .65 : .4, premiumTurbo ? .45 : .3);
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

    // En menu/sélection, la voiture est seulement mise en scène : ne pas
    // intégrer Cannon à chaque frame tant que la partie n'a pas démarré.
    const physicsActive = state === 'countdown' || state === 'racing' || state === 'finished' || state === 'editor';
    if (world && physicsActive && !paused) {
        try {
            world.step(1 / 60, dt, 3);
        } catch (e) {
            console.error('Physics error:', e);
        }
    }

    if (state === 'racing') {
        updateRace(dt);
        if (state === 'racing') updateRaceTraffic(dt);
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

    if (state === 'racing' || state === 'countdown' || state === 'finished') drawRaceRadar(performance.now());

    // Combat indépendant de la physique : il ne bloque ni le rendu ni le son.
    updateKarrCombat(dt);
    if (state === 'racing') updateProjectiles(dt);

    updateScannerVisual(dt);
    updateSPM(dt);
    updateDetachedCarParts(dt);

    // La physique et les commandes restent à 60 Hz. Sur GSM/Jetson, les
    // animations décoratives et les particules sont regroupées à 30 Hz : cela
    // réduit les boucles CPU et les allocations sans rendre la conduite moins
    // réactive.
    lowPowerVisualTime += dt;
    if (!LOW_POWER_MODE || lowPowerVisualTime >= 1 / 30) {
        const visualDt = LOW_POWER_MODE ? lowPowerVisualTime : dt;
        lowPowerVisualTime = 0;
        updateEnvironment(visualDt);
        updateParticles(visualDt);
    }

    // Le soleil (et sa caméra d'ombres) suit la voiture
    if (sunLight && carMesh) {
        sunLight.position.set(carMesh.position.x + 45, carMesh.position.y + 80, carMesh.position.z + 35);
        sunLight.target.position.set(carMesh.position.x, carMesh.position.y, carMesh.position.z);
    }

    if (renderer && scene && camera && (!LOW_POWER_MODE || (++lowPowerRenderFrame % 2 === 0))) {
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

function drawRaceRadar(now) {
    if (!raceRadarCtx || !raceRadarCanvas || now - raceRadarLastDraw < 120) return;
    raceRadarLastDraw = now;
    const ctx = raceRadarCtx;
    const w = raceRadarCanvas.width, h = raceRadarCanvas.height;
    ctx.clearRect(0, 0, w, h);
    raceRadarLevelEl && (raceRadarLevelEl.textContent = 'LV ' + currentLevel);

    const line = trackLine;
    if (!line?.length) {
        raceRadarGapEl && (raceRadarGapEl.textContent = 'PISTE · INDISPONIBLE');
        return;
    }
    if (raceRadarLineRef !== line || !raceRadarBounds) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const point of line) {
            minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
            minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
        }
        raceRadarBounds = { minX, maxX, minZ, maxZ };
        raceRadarLineRef = line;
    }
    const b = raceRadarBounds, pad = 19;
    const spanX = Math.max(1, b.maxX - b.minX), spanZ = Math.max(1, b.maxZ - b.minZ);
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
    const ox = (w - spanX * scale) / 2, oy = (h - spanZ * scale) / 2;
    const pointOnMap = point => ({
        x: ox + (point.x - b.minX) * scale,
        y: h - oy - (point.z - b.minZ) * scale
    });

    ctx.save();
    ctx.strokeStyle = 'rgba(74,220,255,.12)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        const p = pad + (w - pad * 2) * i / 4;
        ctx.beginPath(); ctx.moveTo(p, 8); ctx.lineTo(p, h - 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(8, p); ctx.lineTo(w - 8, p); ctx.stroke();
    }
    const stride = Math.max(1, Math.ceil(line.length / 220));
    ctx.beginPath();
    for (let i = 0; i < line.length; i += stride) {
        const p = pointOnMap(line[i]);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    const end = pointOnMap(line[line.length - 1]); ctx.lineTo(end.x, end.y);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 11; ctx.stroke();
    ctx.strokeStyle = 'rgba(54,104,126,.9)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = '#63e9ff'; ctx.lineWidth = 2.4; ctx.shadowColor = '#00d9ff'; ctx.shadowBlur = 6; ctx.stroke();
    ctx.shadowBlur = 0;

    checkpoints.forEach((checkpoint, index) => {
        const p = pointOnMap(checkpoint);
        ctx.beginPath(); ctx.arc(p.x, p.y, index < nextCp ? 2.4 : 3.6, 0, Math.PI * 2);
        ctx.fillStyle = index < nextCp ? '#83e5a2' : index === nextCp ? '#ffe072' : '#d4e7ed';
        ctx.fill();
        if (index === nextCp) {
            ctx.beginPath(); ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,224,114,.65)'; ctx.lineWidth = 1; ctx.stroke();
        }
    });
    if (finishZone) {
        const p = pointOnMap(finishZone);
        ctx.fillStyle = '#ff526f'; ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    const drawCar = (mesh, color, radius) => {
        if (!mesh?.position || !Number.isFinite(mesh.position.x) || !Number.isFinite(mesh.position.z)) return;
        const p = pointOnMap(mesh.position);
        ctx.beginPath(); ctx.arc(p.x, p.y, radius + 3, 0, Math.PI * 2);
        ctx.fillStyle = color + '35'; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 9; ctx.fill(); ctx.shadowBlur = 0;
    };
    drawCar(karrActive ? karrMesh : null, '#ffb34f', 3.1);
    drawCar(carMesh, '#ff3557', 4.2);
    ctx.restore();

    if (raceRadarGapEl) {
        const gap = karrActive && karrMesh && carMesh ? karrMesh.position.distanceTo(carMesh.position) : null;
        raceRadarGapEl.textContent = gap === null ? 'KARR · HORS PISTE' : `ÉCART KARR · ${Math.round(gap)} M`;
    }
    if (carMesh?.position) {
        let nearestIndex = 0, nearestDistance = Infinity;
        const progressStride = Math.max(1, Math.ceil(line.length / 420));
        for (let i = 0; i < line.length; i += progressStride) {
            const p = line[i];
            const dx = p.x - carMesh.position.x, dy = p.y - carMesh.position.y, dz = p.z - carMesh.position.z;
            const d = dx * dx + dy * dy + dz * dz * .65;
            if (d < nearestDistance) { nearestDistance = d; nearestIndex = i; }
        }
        const progress = Math.min(100, Math.round(nearestIndex / Math.max(1, line.length - 1) * 100));
        if (raceRadarProgressBar) raceRadarProgressBar.style.width = `${progress}%`;
        if (raceRadarProgressLabel) raceRadarProgressLabel.textContent = `${progress} %`;
        if (raceRadarNextEl) {
            const next = checkpoints[nextCp];
            const target = next || finishZone;
            const targetDistance = target ? Math.round(Math.hypot(target.x - carMesh.position.x, target.y - carMesh.position.y, target.z - carMesh.position.z)) : null;
            raceRadarNextEl.textContent = targetDistance === null ? 'PROCHAIN · —' : `${next ? `CP ${nextCp + 1}` : 'ARRIVÉE'} · ${targetDistance} M`;
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
    const forward = raceForwardScratch || (raceForwardScratch = new CANNON.Vec3());
    forward.set(0, 0, 1);
    carBody.quaternion.vmult(forward, forward);
    const up = raceUpScratch || (raceUpScratch = new CANNON.Vec3());
    up.set(0, 1, 0);
    carBody.quaternion.vmult(up, up);
    const speed = carBody.velocity.dot(forward);       // vitesse signée avant/arrière
    const speedAbs = Math.abs(speed);
    const kmh = speedAbs * 3.6;
    topSpeedKmh = Math.max(topSpeedKmh, kmh);

    // Trail cadencé : son débit ne dépend plus de la fréquence de la boucle.
    trailEmissionTimer -= dt;
    if (kmh > 10 && trailEmissionTimer <= 0) {
        trailEmissionTimer = LOW_POWER_MODE ? .14 : .075;
        const speedFactor = Math.min(1, kmh / 40);
        spawnTrailParticle(carBody.position.x, carBody.position.y, carBody.position.z, speedFactor);
    }

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
        if (loopPhi >= Math.PI * 2) {
            // Sortie : reprise normale, cap et vitesse conservés
            inLoop = false;
            loopCompleted = true;
            const f = loopData.fwd;
            const exit = loopPoint(loopData.entry, f, loopData.R, Math.PI * 2, loopData.exitSpan);
            const exitFrame = loopFrame(f, Math.PI * 2, loopData.R, loopData.exitSpan);
            carBody.position.set(
                exit.x + exitFrame.up.x * 0.93,
                exit.y + exitFrame.up.y * 0.93,
                exit.z + exitFrame.up.z * 0.93
            );
            const qThree = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
                new THREE.Vector3(exitFrame.right.x, exitFrame.right.y, exitFrame.right.z),
                new THREE.Vector3(exitFrame.up.x, exitFrame.up.y, exitFrame.up.z),
                new THREE.Vector3(exitFrame.forward.x, exitFrame.forward.y, exitFrame.forward.z)
            ));
            const q = new CANNON.Quaternion(qThree.x, qThree.y, qThree.z, qThree.w);
            carBody.quaternion.set(q.x, q.y, q.z, q.w);
            carBody.velocity.set(exitFrame.forward.x * loopSpeed, exitFrame.forward.y * loopSpeed, exitFrame.forward.z * loopSpeed);
            carBody.angularVelocity.set(0, 0, 0);
            showMessage('✓ Boucle réussie !');
            if (window.KA) KA.sfx.loopSuccess();
            camShake = Math.max(camShake, 0.5);
        } else {
            // Cinématique : la voiture suit le cercle, l'orientation roule avec
            const p = loopPoint(loopData.entry, loopData.fwd, loopData.R, loopPhi, loopData.exitSpan);
            const frame = loopFrame(loopData.fwd, loopPhi, loopData.R, loopData.exitSpan);
            carBody.position.set(p.x + frame.up.x * 0.93, p.y + frame.up.y * 0.93, p.z + frame.up.z * 0.93);
            const qt = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
                new THREE.Vector3(frame.right.x, frame.right.y, frame.right.z),
                new THREE.Vector3(frame.up.x, frame.up.y, frame.up.z),
                new THREE.Vector3(frame.forward.x, frame.forward.y, frame.forward.z)
            ));
            carBody.quaternion.set(qt.x, qt.y, qt.z, qt.w);
            carBody.velocity.set(frame.forward.x * loopSpeed, frame.forward.y * loopSpeed, frame.forward.z * loopSpeed);
            carBody.angularVelocity.set(0, 0, 0);
        }
        // HUD + caméra + son pendant la boucle, puis on saute les contrôles normaux
        raceTime = raceElapsedBeforeLap + Math.max(0, Date.now() - raceLapStartTime) / 1000;
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
        if (mobileControlMode === 'gyro' && Date.now() - gyroLastEventAt > 1600) {
            disableMobileGyro();
            const status = document.getElementById('mobile-control-status');
            if (status) status.textContent = 'TACTILE ACTIF · SIGNAL GYRO PERDU';
            showMessage('Signal du gyroscope perdu : commandes tactiles rétablies');
        }
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
        const speedFactor = 1 - Math.min(speedAbs / (CONFIG.maxSpeed * 1.15), 0.60);
        const targetSteer = steerIn * CONFIG.steerMax * speedFactor;
        const slew = 3.2 * dt;
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

    // Contrôle de traction léger : limite les glissades latérales irréalistes
    // sans supprimer le comportement arcade dans les virages.
    if (speedAbs > 4 && state === 'racing') {
        const lateral = carBody.velocity.x * forward.z - carBody.velocity.z * forward.x;
        const grip = (Math.abs(steer) < 0.08 ? 2.8 : 1.35) * dt;
        carBody.velocity.x -= forward.z * lateral * grip;
        carBody.velocity.z += forward.x * lateral * grip;
    }

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
            // Choc notable : flash, étincelles poolées, secousse et son gradué.
            if (vInto < -5) {
                const hit = clamp(-vInto / 24, .12, .45);
                // Une sortie de route doit rester récupérable : pas de pièce
                // arrachée ni d'effet d'explosion sur un simple rail latéral.
                triggerPremiumImpact(hit,
                    carBody.position.x + n.x * 1.15, carBody.position.y + .18, carBody.position.z + n.z * 1.15,
                    n.x, n.z, false);
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
        if (pdx * pdx + pdy * pdy + pdz * pdz < 4.63) collectTurboPickup(pickup, forward, steer, speedAbs);
    }

    // La carte SPM reste face au pilote : elle flotte doucement sans tourner.
    for (const pickup of spmPickups) {
        if (pickup.userData.collected) continue;
        pickup.position.y = pickup.userData.baseY + Math.sin(clock.elapsedTime * 1.8 + pickup.userData.phase) * .07;
        const pdx = carBody.position.x - pickup.position.x;
        const pdy = carBody.position.y - pickup.position.y;
        const pdz = carBody.position.z - pickup.position.z;
        if (pdx * pdx + pdy * pdy + pdz * pdz < 4.2) collectSpmPickup(pickup);
    }

    // --- Turbo ---
    if (turboActive) {
        turboTimer -= dt;
        if (turboTimer <= 0) {
            turboActive = false;
            setTurboPremiumVisual(false);
        }
    } else {
        setTurboPremiumVisual(false);
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
            turboSparkTimer -= dt;
            turboSmokeTimer -= dt;
            if (turboSparkTimer <= 0) {
                turboSparkTimer = LOW_POWER_MODE ? .16 : .095;
                const back = new THREE.Vector3(0, 0.1, -2.6).applyQuaternion(carMesh.quaternion);
                spawnParticle(shared().sparkTex,
                    carMesh.position.x + back.x, carMesh.position.y + back.y, carMesh.position.z + back.z,
                    back.x * 2 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, back.z * 2 + (Math.random() - 0.5) * 2,
                    0.35, 0.5, 0.8);
            }
            // Panache dense mais plafonné par le pool global de particules.
            if (turboSmokeTimer <= 0) {
                turboSmokeTimer = LOW_POWER_MODE ? .2 : .12;
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
    // Une voiture droite n'est pas forcément au sol, notamment après un saut.
    const grounded = world.contacts.some(contact =>
        (contact.bi === carBody || contact.bj === carBody) && Math.abs(contact.ni.y) > 0.55
    );
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
    landingEffectCooldown = Math.max(0, landingEffectCooldown - dt);
    const landingEvent = grounded && !wasGrounded && prevVelY < -5.5 && landingEffectCooldown <= 0;
    if (landingEvent) {
        landingEffectCooldown = .38;
        const impact = clamp(-prevVelY / 18, 0.25, 1);
        if (window.KA) KA.sfx.thud(impact);
        camShake = Math.max(camShake, Math.min(impact, .42));
        for (let k = 0, count = LOW_POWER_MODE ? 4 : 8; k < count; k++) {
            spawnParticle(shared().dustTex,
                carBody.position.x + (Math.random() - 0.5) * 2.2, carBody.position.y - 0.2, carBody.position.z + (Math.random() - 0.5) * 2.2,
                (Math.random() - 0.5) * 7, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 7,
                0.8, 1.1, 2.6);
        }
    }
    wasGrounded = grounded;
    prevVelY = carBody.velocity.y;

    // --- Lignes de vitesse à haute vélocité ---
    if (speedLinesEl) {
        const base = clamp((kmh - 62) / 92, 0, 1);
        const normalOp = base * .68;
        const turboOp = Math.max(LOW_POWER_MODE ? .34 : .52, base * (LOW_POWER_MODE ? .78 : 1));
        speedLinesEl.style.opacity = (turboActive ? turboOp : normalOp).toFixed(2);
        setTurboPremiumVisual(turboActive);
    }

    // --- Chrono ---
    raceTime = raceElapsedBeforeLap + Math.max(0, Date.now() - raceLapStartTime) / 1000;
    displayedSpeed += (kmh - displayedSpeed) * Math.min(1, dt * 8);
    speedEl.textContent = Math.round(displayedSpeed);
    updateDriverTelemetry();
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
            // Effet visuel checkpoint : gerbe de particules cyan
            if (shared() && carMesh) {
                const s = shared();
                for (let i = 0; i < 8; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const v = 3 + Math.random() * 5;
                    spawnParticle(s.sparkTex,
                        carMesh.position.x, carMesh.position.y + 0.5, carMesh.position.z,
                        Math.cos(a) * v, 2 + Math.random() * 3, Math.sin(a) * v,
                        0.6, 0.4 + Math.random() * 0.3, 0.8);
                }
            }
        }
    } else if (finishZone) {
        const dx = carBody.position.x - finishZone.x;
        const dz = carBody.position.z - finishZone.z;
        const dy = carBody.position.y - finishZone.y;
        if (dx * dx + dz * dz < 81 && Math.abs(dy) < 4) {
            if (currentRaceLap < RACE_LAPS) completeRaceLap();
            else finishRace();
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

    const compactLandscape = window.matchMedia('(orientation: landscape) and (max-width: 900px) and (max-height: 520px)').matches;
    const targetPos = pos.clone().addScaledVector(fwd, -8.7);
    targetPos.y += compactLandscape ? 3.85 : 3.55;
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
    // En paysage mobile, garder la voiture dans la partie visible plutôt que
    // de laisser le cadrage de poursuite la pousser sous le bord inférieur.
    lookAt.y += compactLandscape ? 0.58 : 1.05;
    camera.lookAt(lookAt);

    // La caméra roule avec la voiture (boucle !) : up tend vers le haut local
    const carUp = new THREE.Vector3(0, 1, 0).applyQuaternion(carMesh.quaternion);
    camera.up.lerp(carUp, Math.min(1, dt * 4)).normalize();

    // FOV : élargi avec la vitesse et le turbo
    const targetFov = CONFIG.cameraFOV + (turboActive ? CONFIG.turboFOVBoost : 0) + (spmActive ? 5 : 0) + Math.min(displayedSpeed * 0.07, 8);
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
    camera.updateProjectionMatrix();
}

function updateMenuCamera(dt) {
    const t = clock.elapsedTime * 0.35;
    const cx = carMesh ? carMesh.position.x : 0;
    const cy = carMesh ? carMesh.position.y : 0;
    const cz = carMesh ? carMesh.position.z : 0;
    // Décale le cadrage à droite pour laisser respirer le menu à gauche.
    const showcaseOffset = 5.2;
    camera.position.set(cx + Math.sin(t) * 10 - showcaseOffset, cy + 3.2, cz + Math.cos(t) * 10);
    camera.lookAt(cx - showcaseOffset, cy + 0.8, cz);
    camera.fov += (CONFIG.cameraFOV - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
}

function updateScannerVisual(dt) {
    if (!scannerMesh || !scannerLight) return;
    const t = clock.elapsedTime;
    legacyCarRuntime?.animate(t);
    if (scannerTimer > 0) {
        scannerTimer -= dt;
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
    // Le halo du scanner suit la LED et pulse (matériau partagé : on ne touche que l'échelle)
    if (scannerGlowSprite) {
        scannerGlowSprite.position.x = scannerMesh.position.x;
        const pulse = scannerTimer > 0 ? 1.25 + Math.sin(t * 14) * 0.28 : 0.92 + Math.sin(t * 2.2) * 0.08;
        scannerGlowSprite.scale.set(2.6 * pulse, 1.5 * pulse, 1);
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
    // Les notifications d'impact peuvent arriver en rafale : remplacer la
    // précédente évite leur empilement au milieu de la piste.
    if (hudMessageTimer) clearTimeout(hudMessageTimer);
    const el = document.createElement('div');
    el.className = 'hud-message';
    el.textContent = text;
    messagesEl.replaceChildren(el);
    hudMessageTimer = setTimeout(() => {
        if (el.isConnected) el.remove();
        hudMessageTimer = 0;
    }, 2500);
}

// V7 — flash rouge d'impact sur tout l'écran
function damageFlash() {
    if (!damageFlashEl) return;
    playOverlayFlash(damageFlashEl, 500, 'rgba(255,42,58,.28)', 'rgba(128,0,0,.4)');
    playCrashVoice();
}

function clearDriveInputs() {
    keys = {};
    Object.keys(mobileInput).forEach(key => { mobileInput[key] = false; });
    document.querySelectorAll('[data-drive]').forEach(button => {
        button.classList.remove('pressed');
        button.dispatchEvent(new Event('drive-reset'));
    });
}


// Voix de secours issue du principe du site, pour les enregistrements absents du Jetson.
function speakLocalFallback(text, afterPlayback) {
    if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){afterPlayback?.();return;}
    try {
        speechSynthesis.cancel();
        const utterance=new SpeechSynthesisUtterance(text);utterance.lang='fr-FR';utterance.rate=.96;
        const voice=speechSynthesis.getVoices().find(v=>/^fr/i.test(v.lang));if(voice)utterance.voice=voice;
        if(window.KA)KA.setVoiceDucking(true);
        const complete=()=>{if(window.KA)KA.setVoiceDucking(false);afterPlayback?.()};
        utterance.onend=complete;utterance.onerror=complete;speechSynthesis.speak(utterance);
    }catch(error){afterPlayback?.()}
}
