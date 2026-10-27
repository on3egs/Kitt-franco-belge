// ============================================
// ASTEROIDS PRO — Moteur de jeu
// Rendu vectoriel néon, particules, parallaxe.
// Ajouts 2026-10-04 : UFO, power-ups, combos,
// astéroïdes durs, screen shake, shockwaves,
// ralenti temporel, bombe, pooling de particules.
// By Manix - KITT FRANCO BELGE
// ============================================
(function () {
'use strict';

const S = window.AstSfx;

// ---------- Constantes ----------
const TAU = Math.PI * 2;
const THRUST = 260;          // px/s²
const MAX_SPEED = 420;
const TURN_RATE = 3.6;       // rad/s
const FRICTION = 0.35;       // amortissement spatial léger
const BULLET_SPEED = 640;
const BULLET_LIFE = 0.85;
const FIRE_COOLDOWN = 0.22;
const EXTRA_LIFE_EVERY = 10000;
const COMBO_WINDOW = 2.5;    // s entre deux destructions pour garder le combo
const UFO_FIRST_WAVE = 3;    // les UFO arrivent à partir de cette vague

// ---------- État ----------
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;
let backgroundGradient, vignetteGradient, lastBonusPaint = 0;

let state = 'loading';       // loading | menu | starting | playing | paused | gameover
let score = 0, wave = 1, lives = 3;
let highScore = 0;
try { highScore = Number(localStorage.getItem('asteroidsProHighScore')) || 0; } catch (e) { /* noop */ }

let ship = null;
let bullets = [];
let enemyBullets = [];
let asteroids = [];
let ufos = [];
let powerups = [];
let particles = [];
const particlePool = [];     // pooling : zéro allocation chaude par frame
let shockwaves = [];
let floatTexts = [];
let stars = [];              // 3 plans de parallaxe
let nebulaCanvas = null;
let lastTime = 0;
let rafId = 0;
let fireTimer = 0;
let invincibleTimer = 0;
let waveTimer = 0;           // délai avant la vague suivante
let deathTimer = 0;          // délai après mort
let nextExtraLife = EXTRA_LIFE_EVERY;
let thrusting = false;
let hyperspaceCooldown = 0;

// Combo / multiplicateur
let comboCount = 0;
let comboTimer = 0;
let comboBest = 0;

// Juice : shake, flash, ralenti
let shakeMag = 0;
let flashTimer = 0;
let slowmoTimer = 0;
const SLOWMO_SCALE = 0.45;

// Bombe (stock gagné via power-up)
let bombs = 0;

// Drapeau "vague parfaite" (aucune mort pendant la vague)
let waveClean = true;

// Bonus actifs du vaisseau (durées restantes)
const bonus = { shield: 0, weapon: 0 };   // weapon : 1 = simple, 2 = double, 3 = triple

// Entrées
const keys = {};
const joy = { active: false, id: null, x: 0, y: 0 };   // joystick vector -1..1
let touchFire = false;

// ============================================================
//  Utilitaires
// ============================================================
function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function wrap(v, max) { return ((v % max) + max) % max; }

// distance avec wrap torique (approximation : distance directe, suffisante pour le jeu)
function dist2(x1, y1, x2, y2) {
    const dx = x1 - x2, dy = y1 - y2;
    return dx * dx + dy * dy;
}

function resize() {
    W = window.innerWidth; H = window.innerHeight;
    // Budget de pixels : évite le suréchantillonnage 4K/Retina inutile.
    DPR = Math.min(window.devicePixelRatio || 1, 2, Math.max(1, Math.sqrt(3000000 / (W * H))));
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    backgroundGradient = ctx.createLinearGradient(0, 0, 0, H);
    backgroundGradient.addColorStop(0, '#070718');
    backgroundGradient.addColorStop(.55, '#050510');
    backgroundGradient.addColorStop(1, '#090614');
    vignetteGradient = ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.42,W/2,H/2,Math.max(W,H)*.72);
    vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGradient.addColorStop(1, 'rgba(0,0,0,.42)');
    buildStarfield();
    buildNebula();
}

// ============================================================
//  Fond : étoiles parallaxe + nébuleuse pré-rendue
// ============================================================
function buildStarfield() {
    stars = [];
    const layers = [
        { n: 70, speed: 0.05, rMin: 0.4, rMax: 0.9, alpha: 0.5 },
        { n: 45, speed: 0.12, rMin: 0.7, rMax: 1.4, alpha: 0.75 },
        { n: 25, speed: 0.24, rMin: 1.0, rMax: 2.0, alpha: 1.0 }
    ];
    for (const L of layers) {
        for (let i = 0; i < L.n; i++) {
            const hue = Math.random();
            stars.push({
                x: Math.random() * W, y: Math.random() * H,
                r: rand(L.rMin, L.rMax),
                speed: L.speed,
                alpha: L.alpha * rand(0.6, 1),
                tw: rand(0.5, 2.4),            // vitesse de scintillement
                twPhase: rand(0, TAU),
                color: hue < 0.7 ? '255,255,255' : hue < 0.85 ? '160,220,255' : '255,200,235'
            });
        }
    }
}

function buildNebula() {
    // Nébuleuse pré-rendue (2 blobs dégradés) — coût unique, pas par frame.
    nebulaCanvas = document.createElement('canvas');
    nebulaCanvas.width = Math.max(2, Math.round(W / 2));
    nebulaCanvas.height = Math.max(2, Math.round(H / 2));
    const nctx = nebulaCanvas.getContext('2d');
    const blobs = [
        { x: 0.24, y: 0.3, r: 0.42, c1: 'rgba(80,40,160,0.20)', c2: 'rgba(80,40,160,0)' },
        { x: 0.78, y: 0.68, r: 0.46, c1: 'rgba(20,110,140,0.16)', c2: 'rgba(20,110,140,0)' },
        { x: 0.55, y: 0.15, r: 0.3,  c1: 'rgba(160,30,110,0.10)', c2: 'rgba(160,30,110,0)' }
    ];
    for(let i=0;i<28;i++)blobs.push({x:Math.random(),y:Math.random(),r:rand(.05,.22),c1:i%2?'rgba(24,132,200,.14)':'rgba(136,55,230,.13)',c2:'rgba(0,0,0,0)'});
    for (const b of blobs) {
        const cx = b.x * nebulaCanvas.width, cy = b.y * nebulaCanvas.height;
        const rad = b.r * Math.max(nebulaCanvas.width, nebulaCanvas.height);
        const g = nctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, b.c1);
        g.addColorStop(1, b.c2);
        nctx.fillStyle = g;
        nctx.fillRect(0, 0, nebulaCanvas.width, nebulaCanvas.height);
    }
    const nx=nebulaCanvas.width*.81,ny=nebulaCanvas.height*.27,nr=Math.min(nebulaCanvas.width,nebulaCanvas.height)*.17;
    nctx.save();nctx.translate(nx,ny);nctx.rotate(-.4);nctx.strokeStyle='rgba(82,185,242,.24)';nctx.lineWidth=nr*.11;
    nctx.beginPath();nctx.ellipse(0,0,nr*1.8,nr*.43,0,0,TAU);nctx.stroke();nctx.restore();
    const planet=nctx.createRadialGradient(nx-nr*.4,ny-nr*.5,nr*.05,nx,ny,nr);
    planet.addColorStop(0,'#447fba');planet.addColorStop(.42,'#234063');planet.addColorStop(.85,'#0b172c');planet.addColorStop(1,'#030b16');
    nctx.fillStyle=planet;nctx.beginPath();nctx.arc(nx,ny,nr,0,TAU);nctx.fill();
    nctx.strokeStyle='rgba(100,214,255,.55)';nctx.lineWidth=1.5;nctx.stroke();
    nctx.save();nctx.beginPath();nctx.arc(nx,ny,nr,0,TAU);nctx.clip();nctx.strokeStyle='rgba(116,191,240,.12)';
    for(let i=0;i<9;i++){nctx.beginPath();nctx.ellipse(nx,ny-nr+i*nr/4,nr*1.15,nr*.14,.1,0,TAU);nctx.stroke()}nctx.restore();

}

function drawBackground(t, shipVel) {
    // fond spatial dégradé
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, W, H);

    if (nebulaCanvas) ctx.drawImage(nebulaCanvas, 0, 0, W, H);

    // étoiles avec parallaxe liée à la vitesse du vaisseau
    const px = shipVel ? -shipVel.vx : 0, py = shipVel ? -shipVel.vy : 0;
    for (const s of stars) {
        s.x = wrap(s.x + px * s.speed * 0.016, W);
        s.y = wrap(s.y + py * s.speed * 0.016, H);
        const tw = 0.55 + 0.45 * Math.sin(t * s.tw + s.twPhase);
        ctx.fillStyle = `rgba(${s.color},${(s.alpha * tw).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fill();
    }
}

// ============================================================
//  Particules (pooling : réutilisation d'objets, swap-pop)
// ============================================================
function getParticle() {
    return particlePool.pop() || {};
}

function freeParticle(i) {
    particlePool.push(particles[i]);
    // swap-pop pour suppression O(1) sans décaler le tableau
    particles[i] = particles[particles.length - 1];
    particles.pop();
}

function spawnParticle(x, y, vx, vy, life, size, color, drag) {
    if (particles.length >= 700) return;
    const p = getParticle();
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life;
    p.size = size; p.color = color; p.drag = drag;
    particles.push(p);
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= p.drag; p.vy *= p.drag;
        p.life -= dt;
        if (p.life <= 0) freeParticle(i);
    }
}

function spawnExplosion(x, y, color, count, power) {
    for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        const sp = rand(power * 0.25, power);
        spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
            rand(0.35, 0.9), rand(1, 3.2), color, 0.9);
    }
}

// Étincelles directionnelles (cône orienté)
function spawnSparks(x, y, dirAngle, spread, count, color, power) {
    for (let i = 0; i < count; i++) {
        const a = dirAngle + rand(-spread, spread);
        const sp = rand(power * 0.4, power);
        spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
            rand(0.15, 0.5), rand(0.8, 2.2), color, 0.88);
    }
}

// Débris d'astéroïde : morceaux plus gros qui s'atténuent et ralentissent
function spawnDebris(x, y, count, color) {
    for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        const sp = rand(40, 160);
        spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
            rand(0.5, 1.2), rand(2, 5), color, 0.94);
    }
}

function spawnThrustParticles() {
    const back = ship.angle + Math.PI;
    const bx = ship.x + Math.cos(back) * 14;
    const by = ship.y + Math.sin(back) * 14;
    for (let i = 0; i < 2; i++) {
        const spread = back + rand(-0.35, 0.35);
        const sp = rand(90, 190);
        spawnParticle(bx + rand(-2, 2), by + rand(-2, 2),
            Math.cos(spread) * sp + ship.vx * 0.3,
            Math.sin(spread) * sp + ship.vy * 0.3,
            rand(0.18, 0.4), rand(1, 2.4),
            Math.random() < 0.6 ? '120,230,255' : '255,170,70', 0.86);
    }
}

// ============================================================
//  Juice : shockwaves, textes flottants, shake, flash
// ============================================================
function addShockwave(x, y, color, maxR, dur) {
    shockwaves.push({ x, y, r: 6, maxR: maxR || 90, life: dur || 0.45, maxLife: dur || 0.45, color });
}

function addFloatText(x, y, text, color, big) {
    floatTexts.push({ x, y, text, color, life: 1.1, maxLife: 1.1, big: !!big });
}

function addShake(mag) {
    shakeMag = Math.min(18, shakeMag + mag);
}

function updateJuice(dt) {
    shakeMag = Math.max(0, shakeMag - dt * 34);
    flashTimer = Math.max(0, flashTimer - dt);

    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const s = shockwaves[i];
        s.life -= dt;
        s.r += (s.maxR - s.r) * dt * 9;
        if (s.life <= 0) shockwaves.splice(i, 1);
    }
    for (let i = floatTexts.length - 1; i >= 0; i--) {
        const f = floatTexts[i];
        f.life -= dt;
        f.y -= 34 * dt;
        if (f.life <= 0) floatTexts.splice(i, 1);
    }
}

function drawShockwaves() {
    for (const s of shockwaves) {
        const k = clamp(s.life / s.maxLife, 0, 1);
        ctx.strokeStyle = `rgba(${s.color},${(k * 0.8).toFixed(3)})`;
        ctx.lineWidth = 2 + k * 2;
        ctx.shadowColor = `rgba(${s.color},1)`;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.stroke();
    }
    ctx.shadowBlur = 0;
}

function drawFloatTexts() {
    ctx.textAlign = 'center';
    for (const f of floatTexts) {
        const k = clamp(f.life / f.maxLife, 0, 1);
        ctx.font = (f.big ? 'bold 26px' : 'bold 15px') + " 'Courier New', monospace";
        ctx.fillStyle = `rgba(${f.color},${k.toFixed(3)})`;
        ctx.shadowColor = `rgba(${f.color},1)`;
        ctx.shadowBlur = 10;
        ctx.fillText(f.text, f.x, f.y);
    }
    ctx.shadowBlur = 0;
    ctx.textAlign = 'start';
}

// ============================================================
//  Entités : vaisseau, astéroïdes (dont DURS), UFO, power-ups
// ============================================================
function createShip() {
    return {
        x: W / 2, y: H / 2,
        vx: 0, vy: 0,
        angle: -Math.PI / 2,
        radius: 12
    };
}

function makeAsteroidShape() {
    // contour irrégulier + arêtes internes pour l'ombrage
    const n = 9 + Math.floor(Math.random() * 5);
    const pts = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const r = rand(0.72, 1.15);
        pts.push({ a, r, x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    // quelques cratères/détails internes
    const craters = [];
    const nc = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < nc; i++) {
        craters.push({ x: rand(-0.5, 0.5), y: rand(-0.5, 0.5), r: rand(0.1, 0.26) });
    }
    return { pts, craters, hue: rand(-14, 20) };
}

function spawnAsteroid(x, y, size, hard) {
    // size : 3 gros, 2 moyen, 1 petit — difficulté croissante par vague
    const diff = 1 + (wave - 1) * 0.07;
    const speedBase = { 3: rand(28, 48), 2: rand(48, 78), 1: rand(78, 118) }[size] * diff;
    const a = rand(0, TAU);
    const isHard = !!hard;
    return {
        x: x != null ? x : rand(0, W),
        y: y != null ? y : rand(0, H),
        vx: Math.cos(a) * speedBase,
        vy: Math.sin(a) * speedBase,
        rot: rand(0, TAU),
        rotSpeed: rand(-1.4, 1.4),
        size,                          // 1..3
        radius: size * 16 + 8,
        hp: isHard ? 2 : 1,            // astéroïde dur = 2 coups
        hard: isHard,
        flash: 0,                      // hit flash quand touché sans être détruit
        shape: makeAsteroidShape()
    };
}

function spawnWaveAsteroids(count) {
    // astéroïdes durs à partir de la vague 2, plus fréquents ensuite
    const hardChance = wave >= 2 ? Math.min(0.08 + (wave - 2) * 0.05, 0.4) : 0;
    for (let i = 0; i < count; i++) {
        // Éloignés du vaisseau pour un spawn équitable
        let x, y, tries = 0;
        do {
            x = rand(0, W); y = rand(0, H);
            tries++;
        } while (ship && Math.hypot(x - ship.x, y - ship.y) < 170 && tries < 24);
        asteroids.push(spawnAsteroid(x, y, 3, Math.random() < hardChance));
    }
}

// ---------- UFO ----------
// Un seul UFO à la fois (sûr et lisible), vagues à partir de UFO_FIRST_WAVE.
let ufoSpawnTimer = 0;

function spawnUfo() {
    const side = Math.random() < 0.5 ? -1 : 1;   // entrée gauche ou droite
    const y = rand(H * 0.15, H * 0.85);
    const pursuit = wave >= 5 && Math.random() < 0.5;   // vague 5+ : parfois poursuite
    ufos.push({
        x: side < 0 ? -30 : W + 30,
        y,
        vx: -side * rand(60, 90),
        vy: 0,
        baseY: y,
        t: 0,
        mode: pursuit ? 'poursuite' : 'sinus',
        fireTimer: rand(0.8, 1.6),
        radius: 14,
        hue: pursuit ? '255,80,120' : '180,120,255'
    });
    play('waveStart');   // petit jingle d'alerte (réutilisé, discret)
    addFloatText(side < 0 ? 70 : W - 70, y - 24, '⚠ UFO', '255,120,160', false);
}

function updateUfos(dt) {
    // apparition périodique
    if (wave >= UFO_FIRST_WAVE && ufos.length === 0) {
        ufoSpawnTimer -= dt;
        if (ufoSpawnTimer <= 0) {
            spawnUfo();
            ufoSpawnTimer = rand(9, 16);
        }
    }

    for (let i = ufos.length - 1; i >= 0; i--) {
        const u = ufos[i];
        u.t += dt;

        if (u.mode === 'sinus') {
            // trajectoire sinusoïdale classique
            u.x += u.vx * dt;
            u.y = u.baseY + Math.sin(u.t * 1.6) * H * 0.18;
        } else {
            // poursuite lente : dérive vers le vaisseau tout en avançant
            if (ship) {
                const dy = ship.y - u.y;
                u.vy = clamp(u.vy + clamp(dy, -1, 1) * 60 * dt, -70, 70);
            }
            u.x += u.vx * dt;
            u.y += u.vy * dt;
            u.y = clamp(u.y, 20, H - 20);
        }

        // sorti de l'écran : disparaît sans récompense
        if (u.x < -50 || u.x > W + 50) {
            ufos.splice(i, 1);
            continue;
        }

        // tir visé sur le joueur
        u.fireTimer -= dt;
        if (u.fireTimer <= 0 && ship && state === 'playing') {
            u.fireTimer = rand(1.1, 1.9) - Math.min(wave * 0.04, 0.4);
            const aim = Math.atan2(ship.y - u.y, ship.x - u.x) + rand(-0.12, 0.12);
            const sp = 260 + wave * 8;
            enemyBullets.push({
                x: u.x, y: u.y,
                vx: Math.cos(aim) * sp, vy: Math.sin(aim) * sp,
                life: 3.2
            });
            play('ufoShoot');
        }
    }
}

function destroyUfo(index) {
    const u = ufos[index];
    ufos.splice(index, 1);
    play('explosion', 0.6);
    spawnExplosion(u.x, u.y, '255,120,200', 30, 240);
    spawnDebris(u.x, u.y, 8, '200,140,255');
    addShockwave(u.x, u.y, '255,120,200', 110, 0.5);
    addShake(5);

    const pts = 500 * comboMultiplier();
    score += pts;
    registerKill(u.x, u.y, pts, '255,120,200');
    addFloatText(u.x, u.y - 20, '+' + pts, '255,220,120', true);

    // lâche presque toujours un power-up
    if (Math.random() < 0.85) spawnPowerup(u.x, u.y);
    checkExtraLife();
    updateHud();
}

// ---------- Power-ups ----------
// Types : bouclier, double tir, triple tir, bombe, vie, ralenti
const POWERUP_TYPES = [
    { id: 'shield', color: '90,200,255', label: 'BOUCLIER' },
    { id: 'double', color: '120,255,160', label: 'TIR DOUBLE' },
    { id: 'triple', color: '255,220,90',  label: 'TIR TRIPLE' },
    { id: 'bomb',   color: '255,120,80',  label: 'BOMBE' },
    { id: 'life',   color: '255,90,140',  label: 'VIE BONUS' },
    { id: 'slow',   color: '170,140,255', label: 'RALENTI' }
];

function spawnPowerup(x, y) {
    if (powerups.length >= 3) return;   // au plus 3 capsules actives
    const t = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    powerups.push({
        x, y,
        vx: rand(-40, 40), vy: rand(-40, 40),
        type: t, t: 0,
        life: 11,          // disparaît si non ramassé
        magnetDelay: 1.2   // délai avant attraction vers le vaisseau
    });
}

function applyPowerup(p) {
    const id = p.type.id;
    play('powerup');
    addFloatText(ship.x, ship.y - 26, p.type.label + ' !', p.type.color, true);
    if (id === 'shield') { bonus.shield = 8; play('shieldUp'); }
    else if (id === 'double') { bonus.weapon = 10; shipWeapon = 2; }
    else if (id === 'triple') { bonus.weapon = 10; shipWeapon = 3; }
    else if (id === 'bomb') { bombs = Math.min(bombs + 1, 3); }
    else if (id === 'life') {
        lives++;
        play('extraLife');
        spawnExplosion(ship.x, ship.y, '255,90,140', 22, 170);
        updateHud();
    }
    else if (id === 'slow') {
        slowmoTimer = 4;
        play('hyperspace');   // whoosh de temps ralenti (réutilisé)
    }
}

// Arme courante du vaisseau (1 simple, 2 double, 3 triple)
let shipWeapon = 1;

function updatePowerups(dt) {
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        p.t += dt;
        p.life -= dt;
        p.x = wrap(p.x + p.vx * dt, W);
        p.y = wrap(p.y + p.vy * dt, H);

        // attraction après un délai (le joueur a le temps de voir la capsule)
        if (ship && p.t > p.magnetDelay) {
            const d = Math.hypot(ship.x - p.x, ship.y - p.y);
            if (d < 170 && d > 1) {
                const pull = 320 * dt / d;
                p.vx += (ship.x - p.x) * pull;
                p.vy += (ship.y - p.y) * pull;
            }
            if (d < ship.radius + 14) {
                applyPowerup(p);
                powerups.splice(i, 1);
                continue;
            }
        }
        if (p.life <= 0) powerups.splice(i, 1);
    }
}

// ---------- Combo / multiplicateur ----------
function comboMultiplier() {
    return 1 + Math.min(Math.floor(comboCount / 3), 4);
}

function registerKill(x, y, pts, color) {
    comboCount++;
    comboTimer = COMBO_WINDOW;
    if (comboCount > comboBest) comboBest = comboCount;
    const mult = comboMultiplier();
    if (comboCount >= 3 && comboCount % 3 === 0) {
        play('combo');
        addFloatText(x, y - 34, 'COMBO x' + mult, '255,200,90', true);
    } else if (pts > 0) {
        addFloatText(x, y - 12, '+' + pts, color || '255,255,255', false);
    }
}

// ============================================================
//  Sons
// ============================================================
function play(name, arg) {
    if (!S || !S.ready()) return;
    try { S.sfx[name](arg); } catch (e) { /* noop */ }
}

// ============================================================
//  Mise à jour
// ============================================================
function inputState() {
    // rotation : clavier ou joystick X
    let turn = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) turn -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) turn += 1;
    if (joy.active) turn += joy.x;
    // poussée : flèche haut / W / joystick Y vers le haut
    let thrust = !!(keys['ArrowUp'] || keys['KeyW']);
    if (joy.active && joy.y < -0.35) thrust = true;
    let fire = !!(keys['Space'] || touchFire);
    return { turn: clamp(turn, -1, 1), thrust, fire };
}

function update(dt, t) {
    const inp = inputState();

    // décrément des durées de bonus (hors ralenti)
    bonus.shield = Math.max(0, bonus.shield - dt);
    if (bonus.weapon > 0) {
        bonus.weapon -= dt;
        if (bonus.weapon <= 0) shipWeapon = 1;
    }
    slowmoTimer = Math.max(0, slowmoTimer - dt);

    // combo : fenêtre de temps entre deux destructions
    if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) comboCount = 0;
    }

    if (state === 'starting' || state === 'playing') {
        fireTimer = Math.max(0, fireTimer - dt);
        invincibleTimer = Math.max(0, invincibleTimer - dt);
        hyperspaceCooldown = Math.max(0, hyperspaceCooldown - dt);

        // vaisseau
        if (ship && state === 'playing') {
            ship.angle += inp.turn * TURN_RATE * dt;
            thrusting = inp.thrust;
            if (inp.thrust) {
                ship.vx += Math.cos(ship.angle) * THRUST * dt;
                ship.vy += Math.sin(ship.angle) * THRUST * dt;
                spawnThrustParticles();
            }
            ship.vx *= (1 - FRICTION * dt);
            ship.vy *= (1 - FRICTION * dt);
            const sp = Math.hypot(ship.vx, ship.vy);
            if (sp > MAX_SPEED) { ship.vx = ship.vx / sp * MAX_SPEED; ship.vy = ship.vy / sp * MAX_SPEED; }
            ship.x = wrap(ship.x + ship.vx * dt, W);
            ship.y = wrap(ship.y + ship.vy * dt, H);
            if (S && S.ready()) S.setThruster(inp.thrust ? 1 : 0);

            // tir (simple / double / triple)
            if (inp.fire && fireTimer <= 0) {
                fireTimer = FIRE_COOLDOWN;
                const nose = 16;
                const angles = shipWeapon === 1 ? [0] : shipWeapon === 2 ? [-0.06, 0.06] : [0, -0.14, 0.14];
                for (const off of angles) {
                    const a = ship.angle + off;
                    bullets.push({
                        x: ship.x + Math.cos(a) * nose,
                        y: ship.y + Math.sin(a) * nose,
                        vx: Math.cos(a) * BULLET_SPEED + ship.vx * 0.35,
                        vy: Math.sin(a) * BULLET_SPEED + ship.vy * 0.35,
                        life: BULLET_LIFE
                    });
                }
                play('shoot');
            }
        } else if (S && S.ready()) {
            S.setThruster(0);
        }

        // balles du joueur
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.x = wrap(b.x + b.vx * dt, W);
            b.y = wrap(b.y + b.vy * dt, H);
            b.life -= dt;
            if (b.life <= 0) bullets.splice(i, 1);
        }

        // balles ennemies (UFO)
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const b = enemyBullets[i];
            b.x = wrap(b.x + b.vx * dt, W);
            b.y = wrap(b.y + b.vy * dt, H);
            b.life -= dt;
            if (b.life <= 0) enemyBullets.splice(i, 1);
        }

        // astéroïdes
        for (const a of asteroids) {
            a.x = wrap(a.x + a.vx * dt, W);
            a.y = wrap(a.y + a.vy * dt, H);
            a.rot += a.rotSpeed * dt;
            a.flash = Math.max(0, a.flash - dt);
        }

        updateUfos(dt);
        updatePowerups(dt);

        // collisions balles joueur ↔ astéroïdes
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            for (let ai = asteroids.length - 1; ai >= 0; ai--) {
                const a = asteroids[ai];
                if (dist2(b.x, b.y, a.x, a.y) < (a.radius + 3) * (a.radius + 3)) {
                    bullets.splice(bi, 1);
                    hitAsteroid(ai, Math.atan2(b.vy, b.vx));
                    break;
                }
            }
        }

        // collisions balles joueur ↔ UFO
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            for (let ui = ufos.length - 1; ui >= 0; ui--) {
                const u = ufos[ui];
                if (dist2(b.x, b.y, u.x, u.y) < (u.radius + 4) * (u.radius + 4)) {
                    bullets.splice(bi, 1);
                    destroyUfo(ui);
                    break;
                }
            }
        }

        // collision vaisseau ↔ astéroïdes
        if (ship && invincibleTimer <= 0 && state === 'playing') {
            for (let i = 0; i < asteroids.length; i++) {
                const a = asteroids[i];
                if (dist2(ship.x, ship.y, a.x, a.y) < (a.radius + ship.radius * 0.75) * (a.radius + ship.radius * 0.75)) {
                    hitPlayer();
                    break;
                }
            }
        }

        // collision vaisseau ↔ balles ennemies (le bouclier absorbe)
        if (ship && state === 'playing') {
            for (let i = enemyBullets.length - 1; i >= 0; i--) {
                const b = enemyBullets[i];
                if (dist2(ship.x, ship.y, b.x, b.y) < (ship.radius + 4) * (ship.radius + 4)) {
                    enemyBullets.splice(i, 1);
                    if (bonus.shield > 0) {
                        play('shieldHit');
                        spawnSparks(b.x, b.y, Math.atan2(b.vy, b.vx) + Math.PI, 1.2, 12, '90,200,255', 220);
                        addShockwave(ship.x, ship.y, '90,200,255', 40, 0.3);
                    } else if (invincibleTimer <= 0) {
                        hitPlayer();
                        if (!ship) break;   // le joueur vient de mourir : fin des collisions
                    }
                }
            }
        }

        // collision vaisseau ↔ UFO (contact)
        if (ship && invincibleTimer <= 0 && state === 'playing') {
            for (let i = 0; i < ufos.length; i++) {
                const u = ufos[i];
                if (dist2(ship.x, ship.y, u.x, u.y) < (u.radius + ship.radius * 0.75) * (u.radius + ship.radius * 0.75)) {
                    destroyUfo(i);
                    hitPlayer();
                    break;
                }
            }
        }

        // vague suivante (astéroïdes ET UFO éliminés)
        if (state === 'playing' && asteroids.length === 0 && ufos.length === 0) {
            waveTimer -= dt;
            if (waveTimer <= 0) {
                if (waveClean) {
                    // bonus de vague parfaitement nettoyée
                    const perfect = 250 + wave * 150;
                    score += perfect;
                    play('extraLife');
                    addFloatText(W / 2, H / 2 - 40, 'VAGUE PARFAITE ! +' + perfect, '120,255,170', true);
                    checkExtraLife();
                    updateHud();
                }
                startWave(wave + 1);
            }
        }

        // respawn après mort
        if (state === 'playing' && !ship) {
            deathTimer -= dt;
            if (deathTimer <= 0) {
                if (lives > 0) {
                    ship = createShip();
                    shipWeapon = 1;
                    bonus.shield = 0;
                    invincibleTimer = 2.2;
                }
            }
        }
    }

    updateParticles(dt);
    updateJuice(dt);
}

// Impact sur un astéroïde : dur (2 coups) ou normal (détruit)
function hitAsteroid(index, bulletAngle) {
    const a = asteroids[index];
    if (a.hp > 1) {
        // astéroïde dur : première touche, il craque mais survit
        a.hp--;
        a.flash = 0.15;
        play('asteroidHit');
        spawnSparks(a.x, a.y, bulletAngle, 0.9, 10, '255,220,220', 200);
        a.vx += Math.cos(bulletAngle) * 18;
        a.vy += Math.sin(bulletAngle) * 18;
        comboCount = 0;   // une touche non fatale casse le combo
        return;
    }
    destroyAsteroid(index);
}

function destroyAsteroid(index) {
    const a = asteroids[index];
    asteroids.splice(index, 1);
    const big = a.size === 3;
    play('explosion', a.size / 3);
    spawnExplosion(a.x, a.y, a.hard ? '255,110,110' : big ? '255,165,70' : '140,235,255', big ? 30 : 16, big ? 240 : 170);
    spawnDebris(a.x, a.y, big ? 10 : 5, a.hard ? '255,140,140' : '200,200,220');
    addShockwave(a.x, a.y, a.hard ? '255,120,120' : '255,180,90', big ? 90 : 55, 0.4);
    addShake(big ? 4 : 2);

    const base = a.size === 3 ? 20 : a.size === 2 ? 50 : 100;
    const pts = base * comboMultiplier();
    score += pts;
    registerKill(a.x, a.y, pts, a.hard ? '255,140,140' : '190,245,255');
    checkExtraLife();

    // les astéroïdes durs lâchent plus souvent un power-up
    const dropChance = a.hard ? 0.3 : 0.13;
    if (Math.random() < dropChance) spawnPowerup(a.x, a.y);

    if (a.size > 1) {
        const child = a.size - 1;
        for (let i = 0; i < 2; i++) {
            const c = spawnAsteroid(a.x, a.y, child, false);
            c.vx += a.vx * 0.4; c.vy += a.vy * 0.4;
            asteroids.push(c);
        }
    }
    updateHud();
}

function checkExtraLife() {
    if (score >= nextExtraLife) {
        nextExtraLife += EXTRA_LIFE_EVERY;
        lives++;
        play('extraLife');
        spawnExplosion(ship ? ship.x : W / 2, ship ? ship.y : H / 2, '90,255,160', 26, 190);
        addFloatText(ship ? ship.x : W / 2, (ship ? ship.y : H / 2) - 30, 'VAISSEAU BONUS', '90,255,160', true);
        updateHud();
    }
}

// Le joueur est touché : bouclier éventuel, sinon mort
function hitPlayer() {
    if (!ship) return;
    if (bonus.shield > 0) {
        play('shieldHit');
        addShake(6);
        flashTimer = 0.12;
        addShockwave(ship.x, ship.y, '90,200,255', 70, 0.4);
        spawnSparks(ship.x, ship.y, rand(0, TAU), TAU, 18, '90,200,255', 260);
        invincibleTimer = Math.max(invincibleTimer, 0.8);
        return;
    }
    playerDie();
}

function playerDie() {
    spawnExplosion(ship.x, ship.y, '120,230,255', 42, 260);
    spawnExplosion(ship.x, ship.y, '255,120,80', 24, 180);
    spawnDebris(ship.x, ship.y, 12, '150,220,255');
    addShockwave(ship.x, ship.y, '255,160,80', 130, 0.6);
    addShake(14);
    flashTimer = 0.25;
    play('playerExplosion');
    ship = null;
    lives--;
    waveClean = false;
    comboCount = 0;
    updateHud();
    if (S && S.ready()) S.setThruster(0);
    if (lives <= 0) {
        endGame();
    } else {
        deathTimer = 1.4;
    }
}

function hyperspace() {
    if (!ship || state !== 'playing' || hyperspaceCooldown > 0) return;
    hyperspaceCooldown = 1.2;
    play('hyperspace');
    spawnExplosion(ship.x, ship.y, '190,140,255', 18, 150);
    ship.x = rand(0, W);
    ship.y = rand(0, H);
    ship.vx = 0; ship.vy = 0;
    spawnExplosion(ship.x, ship.y, '190,140,255', 18, 150);

    // risque d'émergence dangereuse (comme l'original) :
    // si réapparition trop proche d'un astéroïde, dégâts
    let tooClose = null;
    for (const a of asteroids) {
        if (dist2(ship.x, ship.y, a.x, a.y) < (a.radius + 34) * (a.radius + 34)) { tooClose = a; break; }
    }
    if (tooClose) {
        addFloatText(ship.x, ship.y - 26, 'ÉMERGENCE DANGEREUSE !', '255,120,120', false);
        play('asteroidHit');
        if (bonus.shield > 0) {
            hitPlayer();   // le bouclier encaisse
        } else if (Math.random() < 0.5) {
            // 50 % de chance de destruction immédiate (comme l'original)
            playerDie();
        } else {
            invincibleTimer = Math.max(invincibleTimer, 1.0);
        }
    }
}

// Bombe : détruit tout sur l'écran (astéroïdes + UFO)
function useBomb() {
    if (state !== 'playing' || bombs <= 0) return;
    bombs--;
    play('bomb');
    addShake(16);
    flashTimer = 0.3;
    addShockwave(ship ? ship.x : W / 2, ship ? ship.y : H / 2, '255,180,90', Math.max(W, H) * 0.6, 0.8);
    while (asteroids.length > 0) destroyAsteroid(asteroids.length - 1);
    while (ufos.length > 0) destroyUfo(ufos.length - 1);
    enemyBullets.length = 0;
    updateHud();
}

// ============================================================
//  Rendu
// ============================================================
function neonStroke(color, blur, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1.6;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur != null ? blur : 14;
}

function drawShip(t) {
    if (!ship) return;
    // clignotement pendant l'invincibilité (sauf si bouclier actif : anneau visible)

    ctx.save();
    ctx.translate(ship.x, ship.y);
    if(invincibleTimer>0&&bonus.shield<=0)ctx.globalAlpha=.55+.45*Math.sin(t*9)**2;
    ctx.rotate(ship.angle);

    // flamme de propulsion
    if (thrusting && state === 'playing') {
        const flick = rand(0.75, 1.25);
        const flameLen = 16 * flick;
        const fg = ctx.createLinearGradient(-10, 0, -10 - flameLen, 0);
        fg.addColorStop(0, 'rgba(255,240,180,0.95)');
        fg.addColorStop(0.4, 'rgba(255,160,60,0.8)');
        fg.addColorStop(1, 'rgba(255,60,60,0)');
        ctx.fillStyle = fg;
        ctx.shadowColor = '#ff9030';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(-10, -4.5);
        ctx.lineTo(-10 - flameLen, 0);
        ctx.lineTo(-10, 4.5);
        ctx.closePath();
        ctx.fill();
    }

    // coque vectorielle
    neonStroke('#37f5ff', 16, 1.8);
    const hull=ctx.createLinearGradient(-11,-10,12,8);hull.addColorStop(0,'#ecfbff');hull.addColorStop(.28,'#45bddb');hull.addColorStop(.55,'#173b63');hull.addColorStop(1,'#081323');ctx.fillStyle=hull;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-11, -10);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-11, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur=0;ctx.strokeStyle='#8ce9ff';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(-8,-7);ctx.moveTo(13,0);ctx.lineTo(-8,7);ctx.stroke();
    // cockpit
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#bff8ff';
    ctx.beginPath();
    ctx.arc(4, 0, 2.6, 0, TAU);
    ctx.fill();

    ctx.restore();
    ctx.shadowBlur = 0;

    // bouclier actif : anneau cyan continu et vibrant
    if (bonus.shield > 0) {
        const pulse = 1 + Math.sin(t * 10) * 0.06;
        neonStroke('rgba(90,200,255,0.9)', 14, 1.6);
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, 24 * pulse, 0, TAU);
        ctx.stroke();
        // arc secondaire tournant
        neonStroke('rgba(160,230,255,0.55)', 8, 1);
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, 28 * pulse, t * 2.4, t * 2.4 + 2.2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // anneau d'invincibilité (après respawn)
    if (invincibleTimer > 0 && bonus.shield <= 0) {
        neonStroke('rgba(90,255,170,0.8)', 10, 1.2);
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, 22 + Math.sin(t * 8) * 3, 0, TAU);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
}

function asteroidColor(a) {
    if (a.hard) return a.flash > 0 ? '#ffffff' : '#ff5252';   // dur : rouge
    return a.size === 3 ? '#ffa53e' : a.size === 2 ? '#ff3ec8' : '#37f5ff';
}


function asteroidSprite(a){
    const size=Math.ceil(a.radius*2+64),canvasSprite=document.createElement('canvas');
    canvasSprite.width=canvasSprite.height=size;
    const g=canvasSprite.getContext('2d');g.translate(size/2,size/2);g.scale(a.radius,a.radius);
    const path=new Path2D();a.shape.pts.forEach((p,i)=>i?path.lineTo(p.x,p.y):path.moveTo(p.x,p.y));path.closePath();
    g.shadowColor=asteroidColor(a);g.shadowBlur=18;g.strokeStyle=asteroidColor(a);g.lineWidth=1.8/a.radius;g.stroke(path);g.shadowBlur=0;
    const rock=g.createLinearGradient(-1,-1,1,1);
    rock.addColorStop(0,a.hard?'#93605b':'#6782a0');rock.addColorStop(.45,a.hard?'#48353e':'#26364b');rock.addColorStop(1,'#080d1b');
    g.fillStyle=rock;g.fill(path);g.save();g.clip(path);
    a.shape.pts.forEach((p,i)=>{
        const q=a.shape.pts[(i+1)%a.shape.pts.length];
        g.fillStyle=i%3===0?'rgba(168,213,255,.13)':'rgba(0,0,0,.15)';
        g.beginPath();g.moveTo(-.18,-.16);g.lineTo(p.x,p.y);g.lineTo(q.x,q.y);g.closePath();g.fill();
    });
    for(const c of a.shape.craters){
        const shade=g.createRadialGradient(c.x-c.r*.25,c.y-c.r*.3,0,c.x,c.y,c.r);
        shade.addColorStop(0,'#080d17');shade.addColorStop(.74,'#152134');shade.addColorStop(1,'#657589');
        g.fillStyle=shade;g.beginPath();g.arc(c.x,c.y,c.r,0,TAU);g.fill();
    }
    g.restore();g.strokeStyle=a.hard?'#ff7b68':'rgba(140,217,255,.85)';g.lineWidth=1/a.radius;g.stroke(path);
    return canvasSprite;
}
function drawAsteroid(a){
    if(!a.shape.digitalSprite)a.shape.digitalSprite=asteroidSprite(a);
    const sprite=a.shape.digitalSprite;ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.rot);
    ctx.drawImage(sprite,-sprite.width/2,-sprite.height/2);
    if(a.flash>0){ctx.globalCompositeOperation='screen';ctx.globalAlpha=Math.min(.75,a.flash*5);ctx.drawImage(sprite,-sprite.width/2,-sprite.height/2)}
    ctx.restore();
}

function drawUfo(t) {
    for (const u of ufos) {
        const c = `rgba(${u.hue},1)`;
        ctx.save();
        ctx.translate(u.x, u.y);

        // soucoupe : deux ellipses + dôme
        neonStroke(c, 14, 1.6);
        ctx.fillStyle = 'rgba(30,16,44,0.6)';
        ctx.beginPath();
        ctx.ellipse(0, 2, 15, 5.5, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, -3, 6.5, Math.PI, 0);
        ctx.fillStyle = 'rgba(60,40,90,0.6)';
        ctx.fill();
        ctx.stroke();

        // lumières clignotantes
        ctx.shadowBlur = 8;
        ctx.fillStyle = Math.floor(t * 6) % 2 === 0 ? '#ffffff' : c;
        for (const lx of [-8, 0, 8]) {
            ctx.beginPath();
            ctx.arc(lx, 3.5, 1.6, 0, TAU);
            ctx.fill();
        }
        ctx.restore();
        ctx.shadowBlur = 0;
    }
}

function drawPowerups(t) {
    for (const p of powerups) {
        const blink = p.life < 3 && Math.floor(t * 8) % 2 === 0;
        if (blink) continue;   // clignotement avant disparition
        const c = p.type.color;
        const bob = Math.sin(t * 4 + p.x) * 2;
        ctx.save();
        ctx.translate(p.x, p.y + bob);
        ctx.rotate(Math.sin(t * 2 + p.y) * 0.2);

        // capsule
        neonStroke(`rgba(${c},1)`, 14, 1.5);
        ctx.fillStyle = 'rgba(10,14,30,0.75)';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-11, -7, 22, 14, 7) : ctx.rect(-11, -7, 22, 14);
        ctx.fill();
        ctx.stroke();

        // symbole central
        ctx.shadowBlur = 8;
        ctx.fillStyle = `rgba(${c},1)`;
        const sym = { shield: 'S', double: '2', triple: '3', bomb: 'B', life: '+', slow: '⏱' }[p.type.id];
        ctx.font = "bold 11px 'Courier New', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sym, 0, 1);
        ctx.restore();
        ctx.shadowBlur = 0;
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }
}

function drawBullets() {
    neonStroke('#7dffb0', 12, 2.4);
    ctx.fillStyle = '#d8ffe8';
    for (const b of bullets) {
        ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-(b.vx||0)*.022,b.y-(b.vy||0)*.022);ctx.stroke();
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.4, 0, TAU);
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    // tirs UFO : plus gros, rouges
    neonStroke('#ff5a7a', 12, 2.6);
    ctx.fillStyle = '#ffd0da';
    for (const b of enemyBullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, TAU);
        ctx.fill();
    }
    ctx.shadowBlur = 0;
}

function drawParticles() {
    for (const p of particles) {
        const k = clamp(p.life / p.maxLife, 0, 1);
        ctx.fillStyle = `rgba(${p.color},${(k * 0.9).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, TAU);
        ctx.fill();
    }
}

function drawVignette() {
    ctx.fillStyle = vignetteGradient;
    ctx.fillRect(0, 0, W, H);
}

function render(t) {
    ctx.save();
    // screen shake (modéré, décroissant)
    if (shakeMag > 0.1) {
        ctx.translate(rand(-shakeMag, shakeMag) * 0.5, rand(-shakeMag, shakeMag) * 0.5);
    }

    drawBackground(t, ship);
    drawParticles();
    for (const a of asteroids) drawAsteroid(a);
    drawPowerups(t);
    drawUfo(t);
    drawBullets();
    drawShip(t);
    drawShockwaves();
    drawFloatTexts();

    // hit flash plein écran
    if (flashTimer > 0) {
        ctx.fillStyle = `rgba(255,240,220,${(flashTimer * 1.6).toFixed(3)})`;
        ctx.fillRect(-20, -20, W + 40, H + 40);
    }

    ctx.restore();
    drawVignette();
}

// ============================================================
//  HUD
// ============================================================
const el = id => document.getElementById(id);
const scoreEl = el('score-value'), waveEl = el('wave-value'), highEl = el('highscore-value');
const comboEl = el('combo-value');
const bombEl = el('bomb-value');
const shieldBar = el('shield-bar'), weaponBar = el('weapon-bar'), slowBar = el('slow-bar');
const shieldPanel = el('bonus-shield'), weaponPanel = el('bonus-weapon'), slowPanel = el('bonus-slow');
const livesCanvas = el('lives-canvas');
const livesCtx = livesCanvas ? livesCanvas.getContext('2d') : null;

function updateHud() {
    if (scoreEl) scoreEl.textContent = score;
    if (waveEl) waveEl.textContent = wave;
    if (highEl) highEl.textContent = Math.max(highScore, score);
    if (comboEl) {
        const mult = comboMultiplier();
        comboEl.textContent = comboCount >= 2 ? 'x' + mult : '—';
    }
    if (bombEl) bombEl.textContent = bombs;
    const bombBtn = el('btn-bomb-ui');
    if (bombBtn) bombBtn.classList.toggle('disabled', bombs <= 0);
    drawLives();
}

// barres de durée des bonus (appelée chaque frame, DOM minimal)
function updateBonusHud() {
    if (shieldPanel) shieldPanel.classList.toggle('hidden', bonus.shield <= 0);
    if (weaponPanel) weaponPanel.classList.toggle('hidden', bonus.weapon <= 0);
    if (slowPanel) slowPanel.classList.toggle('hidden', slowmoTimer <= 0);
    if (shieldBar) shieldBar.style.width = (bonus.shield / 8 * 100).toFixed(1) + '%';
    if (weaponBar) weaponBar.style.width = (bonus.weapon / 10 * 100).toFixed(1) + '%';
    if (slowBar) slowBar.style.width = (slowmoTimer / 4 * 100).toFixed(1) + '%';
    // combo en temps réel (sans réécriture de score)
    if (comboEl) {
        const mult = comboMultiplier();
        const txt = comboCount >= 2 ? 'x' + mult : '—';
        if (comboEl.textContent !== txt) comboEl.textContent = txt;
    }
}

function drawLives() {
    if (!livesCtx) return;
    const c = livesCanvas;
    livesCtx.clearRect(0, 0, c.width, c.height);
    livesCtx.save();
    livesCtx.strokeStyle = '#37f5ff';
    livesCtx.shadowColor = '#37f5ff';
    livesCtx.shadowBlur = 8;
    livesCtx.lineWidth = 1.4;
    for (let i = 0; i < Math.min(lives, 5); i++) {
        const ox = 14 + i * 26;
        livesCtx.beginPath();
        livesCtx.moveTo(ox + 9, 15);
        livesCtx.lineTo(ox - 6, 6);
        livesCtx.lineTo(ox - 3, 15);
        livesCtx.lineTo(ox - 6, 24);
        livesCtx.closePath();
        livesCtx.stroke();
    }
    if (lives > 5) {
        livesCtx.fillStyle = '#37f5ff';
        livesCtx.font = 'bold 12px monospace';
        livesCtx.fillText('×' + lives, 14 + 5 * 26, 19);
    }
    livesCtx.restore();
}

// ============================================================
//  Flux de jeu
// ============================================================
function setScreen(name) {
    if(name!=='game')S?.setMusic?.(false);
    el('loading-screen').classList.add('hidden');
    el('main-menu').classList.toggle('hidden', name !== 'menu');
    el('game-screen').classList.toggle('hidden', name !== 'game');
    el('gameover-screen').classList.toggle('hidden', name !== 'gameover');
    el('pause-screen').classList.add('hidden');
}

function showMenu() {
    state = 'menu';
    setScreen('menu');
    const mh = el('menu-highscore');
    if (mh) mh.textContent = highScore;
}

function startGame() {
    score = 0; wave = 1; lives = 3;
    nextExtraLife = EXTRA_LIFE_EVERY;
    bullets = []; asteroids = []; particles = [];
    enemyBullets = []; ufos = []; powerups = [];
    shockwaves = []; floatTexts = [];
    comboCount = 0; comboTimer = 0; comboBest = 0;
    bombs = 0;
    shipWeapon = 1;
    bonus.shield = 0; bonus.weapon = 0;
    slowmoTimer = 0;
    shakeMag = 0; flashTimer = 0;
    ufoSpawnTimer = rand(5, 9);
    ship = createShip();
    invincibleTimer = 2.0;
    fireTimer = 0; hyperspaceCooldown = 0;
    setScreen('game');
    updateHud();
    startWave(1);
    S?.setMusic?.(true,wave);
}

function startWave(n) {
    wave = n;
    S?.setMusic?.(true,wave);
    waveTimer = 1.0;
    waveClean = true;
    const banner = el('wave-banner');
    const bannerText = el('wave-banner-text');
    if (bannerText) bannerText.textContent = 'VAGUE ' + n;
    if (banner) {
        banner.classList.remove('hidden');
        // relance l'animation
        bannerText.style.animation = 'none';
        void bannerText.offsetWidth;
        bannerText.style.animation = '';
        setTimeout(() => banner.classList.add('hidden'), 1650);
    }
    spawnWaveAsteroids(Math.min(3 + n, 9));
    play('waveStart');
    state = 'playing';
    updateHud();
}

function endGame() {
    state = 'gameover';
    if (S && S.ready()) S.setThruster(0);
    play('gameOver');
    const isRecord = score > highScore;
    if (isRecord) {
        highScore = score;
        try { localStorage.setItem('asteroidsProHighScore', String(highScore)); } catch (e) { /* noop */ }
        // fanfare de record après le game over dramatique
        setTimeout(() => play('newRecord'), 1400);
    }
    el('gameover-score').textContent = score;
    el('gameover-wave').textContent = wave;
    el('gameover-highscore').textContent = highScore;
    el('gameover-newrecord').style.display = isRecord ? 'block' : 'none';
    setTimeout(() => setScreen('gameover'), 900);
}

function togglePause(force) {
    if (state !== 'playing' && state !== 'paused') return;
    const toPause = force != null ? force : state === 'playing';
    if (toPause) {
        state = 'paused';S?.setMusic?.(false);
        el('pause-screen').classList.remove('hidden');
        if (S && S.ready()) { S.setThruster(0); }
    } else {
        state = 'playing';S?.setMusic?.(true,wave);
        el('pause-screen').classList.add('hidden');
    }
}

// ============================================================
//  Boucle principale
// ============================================================
function frame(ts) {
    rafId = requestAnimationFrame(frame);
    if(document.hidden){lastTime=ts/1000;return}
    const t = ts / 1000;
    let dt = lastTime ? t - lastTime : 0.016;
    lastTime = t;
    if (state === 'menu' || state === 'paused') return;
    dt = Math.min(dt, 0.05);   // clamp anti-saut

    if (state === 'playing' || state === 'starting') {
        // ralenti temporel : on scale le dt du monde, pas l'UI
        const worldDt = slowmoTimer > 0 ? dt * SLOWMO_SCALE : dt;
        update(worldDt, t);
    } else {
        updateParticlesOnly(dt);
    }
    if (ts - lastBonusPaint >= 100) { updateBonusHud(); lastBonusPaint = ts; }

    if (state === 'playing' || state === 'paused' || state === 'starting' || state === 'gameover') {
        if (state !== 'paused') render(t);
    }
}

function updateParticlesOnly(dt) {
    updateParticles(dt);
    updateJuice(dt);
}

// ============================================================
//  Entrées clavier
// ============================================================
document.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (S) S.ensure();

    if (e.code === 'Escape' || e.code === 'KeyP') {
        if (state === 'playing' || state === 'paused') togglePause();
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') hyperspace();
    if (e.code === 'KeyB') useBomb();
    if (e.code === 'Enter') {
        if (state === 'menu') { play('uiClick'); startGame(); }
        else if (state === 'gameover') { play('uiClick'); startGame(); }
    }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur',()=>{
    for(const key of Object.keys(keys))keys[key]=false;
    joy.active=false;touchFire=false;
    if(state==='playing')togglePause(true);
});

// ============================================================
//  Entrées tactiles : joystick + FIRE + BOMBE
// ============================================================
function isTouchDevice() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
}

function setupTouch() {
    if (!isTouchDevice()) return;
    el('touch-joystick').classList.remove('hidden');
    el('touch-fire').classList.remove('hidden');
    el('btn-bomb-ui').classList.remove('hidden');

    const base = el('joystick-base');
    const knob = el('joystick-knob');
    const rectOf = () => base.getBoundingClientRect();
    const R = 44;

    function setKnob(dx, dy) {
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }

    base.addEventListener('touchstart', e => {
        e.preventDefault();
        if (S) S.ensure();
        const t = e.changedTouches[0];
        joy.active = true; joy.id = t.identifier;
    }, { passive: false });
    base.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier !== joy.id) continue;
            const r = rectOf();
            let dx = t.clientX - (r.left + r.width / 2);
            let dy = t.clientY - (r.top + r.height / 2);
            const d = Math.hypot(dx, dy) || 1;
            const cl = Math.min(d, R);
            dx = dx / d * cl; dy = dy / d * cl;
            joy.x = dx / R; joy.y = dy / R;
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

    const fireBtn = el('touch-fire');
    fireBtn.addEventListener('touchstart', e => { e.preventDefault(); if (S) S.ensure(); touchFire = true; }, { passive: false });
    fireBtn.addEventListener('touchend', e => { e.preventDefault(); touchFire = false; }, { passive: false });
    fireBtn.addEventListener('touchcancel', () => { touchFire = false; });
}

// ============================================================
//  Boutons UI
// ============================================================
function bindUi() {
    const on = (id, fn) => { const b = el(id); if (b) b.addEventListener('click', () => { if (S) { S.ensure(); } fn(); }); };

    on('btn-start', () => { play('uiClick'); startGame(); });
    on('btn-restart', () => { play('uiClick'); startGame(); });
    on('btn-menu', () => { play('uiClick'); showMenu(); });
    on('btn-resume', () => { play('uiClick'); togglePause(false); });
    on('btn-quit', () => { play('uiClick'); showMenu(); });
    on('btn-pause-ui', () => togglePause());
    on('btn-hyperspace-ui', () => hyperspace());
    on('btn-bomb-ui', () => useBomb());
    on('btn-restart-ui', () => { play('uiClick'); startGame(); });
    on('btn-pause-restart', () => { play('uiClick'); startGame(); });
    on('btn-sound-ui', () => {
        if (!S) return;
        S.ensure();
        S.setMuted(!S.isMuted());
        const b = el('btn-sound-ui');
        if (b) b.textContent = S.isMuted() ? '🔇' : '🔊';
        play('uiClick');
    });
    on('btn-mute', () => {
        if (!S) return;
        S.setMuted(!S.isMuted());
        const b = el('btn-mute');
        if (b) b.textContent = S.isMuted() ? '🔇 MUET' : '🔊 SON';
    });

    const slider = el('volume-slider');
    if (slider && S) {
        slider.value = String(Math.round(S.getVolume() * 100));
        slider.addEventListener('input', () => S.setVolume(Number(slider.value) / 100));
    }
    const muteBtn = el('btn-mute');
    if (muteBtn && S) muteBtn.textContent = S.isMuted() ? '🔇 MUET' : '🔊 SON';
    const soundUiBtn = el('btn-sound-ui');
    if (soundUiBtn && S) soundUiBtn.textContent = S.isMuted() ? '🔇' : '🔊';

    // Clic n'importe où : réveille l'AudioContext (politique autoplay)
    document.addEventListener('pointerdown', () => { if (S) S.ensure(); });
}

// ============================================================
//  Démarrage
// ============================================================
function boot() {
    resize();
    window.addEventListener('resize', resize);
    bindUi();
    setupTouch();

    // séquence de "chargement" (quasi instantanée, purement cosmétique)
    const fill = el('progress-fill'), ptext = el('progress-text');
    const steps = [
        [18, 'Initialisation des systèmes...'],
        [46, 'Calibration du scanner...'],
        [74, 'Chargement des vecteurs...'],
        [100, 'Prêt.']
    ];
    let i = 0;
    function step() {
        if (i < steps.length) {
            if (fill) fill.style.width = steps[i][0] + '%';
            if (ptext) ptext.textContent = steps[i][1];
            i++;
            setTimeout(step, 130);
        } else {
            showMenu();
        }
    }
    step();

    rafId = requestAnimationFrame(frame);
}

// Nettoyage propre si la page est cachée/fermée (overlay kyronex)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (S && S.ready()) S.stopAll();
        if (state === 'playing') togglePause(true);
    } else {
        if (S) S.resume();
    }
});
window.addEventListener('beforeunload', () => { if (S && S.ready()) S.stopAll(); });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

// Hook de debug / télémétrie (lecture seule, utilisé par les smoke tests headless)
window.AstGame = {
    state: () => state,
    score: () => score,
    wave: () => wave,
    lives: () => lives,
    bombs: () => bombs,
    combo: () => comboCount,
    asteroidCount: () => asteroids.length,
    ufoCount: () => ufos.length,
    powerupCount: () => powerups.length
};

})();
