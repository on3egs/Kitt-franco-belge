/* Mode compatible repris du site et raccordé aux dix niveaux du Jetson. */
function initFallback2D() {
    let canvas = document.getElementById('game-canvas');
    let ctx = canvas && canvas.getContext('2d');
    if(!ctx && canvas){const replacement=canvas.cloneNode();canvas.replaceWith(replacement);canvas=replacement;ctx=canvas.getContext('2d');}
    if (!ctx) {
        showError('Le rendu 2D de secours ne peut pas être démarré dans ce navigateur.');
        return;
    }

    const fallback = {
        active: false, level: 1, lane: 0, speed: 0, distance: 0,
        elapsed: 0, spawn: 0, score: 0, lives: 3, turbo: 100,
        obstacles: [], keys: new Set(), muted: true, lastTime: 0,
        best: Number(localStorage.getItem('kx-stunt-2d-best') || 0),
        audio: null, hitFlash: 0
    };
    const menu = document.getElementById('main-menu');
    const hud = document.getElementById('hud');
    const pauseMenu = document.getElementById('pause-menu');
    const results = document.getElementById('results-screen');
    const editorButton = document.getElementById('btn-editor');

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(320, window.innerWidth);
        const height = Math.max(240, window.innerHeight);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function beep(freq, duration = 0.11, type = 'square') {
        if (fallback.muted) return;
        try {
            fallback.audio ||= new (window.AudioContext || window.webkitAudioContext)();
            const audio = fallback.audio;
            if (audio.state === 'suspended') audio.resume().catch(() => {});
            const osc = audio.createOscillator();
            const gain = audio.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audio.currentTime);
            gain.gain.setValueAtTime(0.0001, audio.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
            osc.connect(gain).connect(audio.destination);
            osc.start();
            osc.stop(audio.currentTime + duration + 0.02);
        } catch (_) { /* Audio is optional; the game remains playable without it. */ }
    }

    function setScreen(screen) {
        menu.classList.toggle('hidden', screen !== 'menu');
        hud.classList.toggle('hidden', screen !== 'race');
        pauseMenu.classList.toggle('hidden', screen !== 'pause');
        results.classList.toggle('hidden', screen !== 'results');
    }

    function startRace(level = 1) {
        fallback.active = true;
        fallback.level = Math.max(1, Math.min(10, Number(level) || 1));
        fallback.lane = 0;
        fallback.speed = 0;
        fallback.distance = 0;
        fallback.elapsed = 0;
        fallback.spawn = 0;
        fallback.score = 0;
        fallback.lives = 3;
        fallback.turbo = 100;
        fallback.obstacles = [];
        fallback.hitFlash = 0;
        state = 'racing';
        paused = false;
        setScreen('race');
        document.getElementById('hud-level').textContent = `NIVEAU ${fallback.level} · MODE COMPATIBLE`;
        document.getElementById('lives')?.replaceChildren(...Array.from({ length: 3 }, () => {
            const life = document.createElement('span'); life.textContent = '♥'; return life;
        }));
        beep(620, 0.16);
    }

    function endRace(won = false) {
        fallback.active = false;
        state = 'finished';
        const elapsedText = formatTime(fallback.elapsed);
        document.getElementById('results-time').textContent = elapsedText;
        document.getElementById('results-speed').textContent = Math.round(fallback.speed * 3.6);
        document.getElementById('results-rank').textContent = won ? 'MISSION RÉUSSIE · MODE COMPATIBLE' : 'KITT DOIT RETOURNER AU GARAGE';
        document.getElementById('results-best').textContent = `SCORE ${fallback.best.toLocaleString('fr-FR')}`;
        document.getElementById('results-record').textContent = fallback.score >= fallback.best ? 'NOUVEAU RECORD LOCAL !' : '';
        if (fallback.score > fallback.best) {
            fallback.best = fallback.score;
            localStorage.setItem('kx-stunt-2d-best', String(fallback.best));
        }
        setScreen('results');
    }

    function pauseRace() {
        if (!fallback.active) return;
        paused = !paused;
        fallback.keys.clear();
        state = paused ? 'paused' : 'racing';
        setScreen(paused ? 'pause' : 'race');
    }

    function roadCenter(t, width) {
        const bend = Math.sin((fallback.distance * 0.0013) + t * 2.8 + fallback.level) * width * 0.2;
        return width * 0.5 + bend * (1 - t * 0.58);
    }

    function drawCar(x, y, w, h, color = '#10141c', player = false) {
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = '#030508';
        ctx.fillRect(-w * 0.42, h * 0.28, w * 0.2, h * 0.32);
        ctx.fillRect(w * 0.22, h * 0.28, w * 0.2, h * 0.32);
        ctx.beginPath();
        ctx.moveTo(-w * 0.46, h * 0.48); ctx.lineTo(-w * 0.38, -h * 0.12);
        ctx.lineTo(-w * 0.22, -h * 0.48); ctx.lineTo(w * 0.22, -h * 0.48);
        ctx.lineTo(w * 0.38, -h * 0.12); ctx.lineTo(w * 0.46, h * 0.48); ctx.closePath();
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = player ? '#72849b' : '#cc2634'; ctx.lineWidth = Math.max(1, w * 0.025); ctx.stroke();
        ctx.fillStyle = '#152b3b';
        ctx.beginPath(); ctx.moveTo(-w * 0.24, -h * 0.12); ctx.lineTo(-w * 0.12, -h * 0.39);
        ctx.lineTo(w * 0.12, -h * 0.39); ctx.lineTo(w * 0.24, -h * 0.12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = player ? '#ff2636' : '#ffcb69';
        ctx.shadowColor = player ? '#ff1a2d' : '#ffae45'; ctx.shadowBlur = player ? 14 : 5;
        ctx.fillRect(-w * 0.31, -h * 0.03, w * 0.62, Math.max(2, h * 0.045));
        ctx.restore();
    }

    function draw(now) {
        const w = window.innerWidth, h = window.innerHeight;
        const horizon = h * 0.31, roadTop = w * 0.12, roadBottom = w * 0.86;
        const night = fallback.level === 2 || fallback.level === 3;
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, night ? '#07101e' : '#25334b');
        sky.addColorStop(0.45, night ? '#2a1c35' : '#c66b51');
        sky.addColorStop(0.46, '#10151d'); sky.addColorStop(1, '#05070a');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
        if (night) {
            ctx.fillStyle = '#dce6ff';
            for (let i = 0; i < 42; i++) {
                const x = (i * 137.5) % w, y = (i * 41.7) % Math.max(40, horizon * 0.8);
                ctx.globalAlpha = 0.4 + ((i * 7) % 6) / 10; ctx.fillRect(x, y, 2, 2);
            }
            ctx.globalAlpha = 1;
        }
        ctx.fillStyle = '#111722';
        for (let i = 0; i < 22; i++) {
            const bw = w / 19, bh = ((i * 29) % 80) + 20;
            ctx.fillRect(i * bw, horizon - bh, bw - 2, bh);
            ctx.fillStyle = i % 2 ? '#cb3444' : '#34cce2';
            ctx.fillRect(i * bw + 8, horizon - bh + 8, 3, 3); ctx.fillStyle = '#111722';
        }
        const topC = roadCenter(0, w), bottomC = roadCenter(1, w);
        ctx.beginPath(); ctx.moveTo(topC - roadTop / 2, horizon); ctx.lineTo(bottomC - roadBottom / 2, h);
        ctx.lineTo(bottomC + roadBottom / 2, h); ctx.lineTo(topC + roadTop / 2, horizon); ctx.closePath();
        ctx.fillStyle = '#272d35'; ctx.fill();
        ctx.strokeStyle = '#f5c848'; ctx.lineWidth = 5; ctx.beginPath();
        ctx.moveTo(topC - roadTop / 2, horizon); ctx.lineTo(bottomC - roadBottom / 2, h);
        ctx.moveTo(topC + roadTop / 2, horizon); ctx.lineTo(bottomC + roadBottom / 2, h); ctx.stroke();
        const segment = Math.floor(fallback.distance / 12);
        for (let i = 0; i < 18; i++) {
            const z = ((i / 18) + ((fallback.distance / 180) % 1)) % 1;
            const t = z * z, y = horizon + t * (h - horizon), cw = roadTop + (roadBottom - roadTop) * t;
            const cx = roadCenter(t, w), dash = Math.max(2, t * 22), stripeY = (i + segment) % 2 === 0;
            if (stripeY) {
                ctx.fillStyle = '#d7dce2';
                ctx.fillRect(cx - cw / 6 - dash / 2, y, dash, Math.max(2, t * 10));
                ctx.fillRect(cx + cw / 6 - dash / 2, y, dash, Math.max(2, t * 10));
            }
        }
        for (const item of fallback.obstacles) {
            const t = Math.min(1, item.z), y = horizon + t * t * (h - horizon);
            const laneX = roadCenter(t, w) + item.lane * (roadTop + (roadBottom - roadTop) * t) * 0.28;
            const size = 14 + 68 * t;
            if (item.kind === 'pickup') {
                ctx.save(); ctx.translate(laneX, y); ctx.rotate(now / 260);
                ctx.fillStyle = '#43d5ff'; ctx.shadowColor = '#43d5ff'; ctx.shadowBlur = 12;
                ctx.fillRect(-size * .22, -size * .22, size * .44, size * .44); ctx.restore();
            } else drawCar(laneX, y, size * .72, size, item.color, false);
        }
        const carX = roadCenter(1, w) + fallback.lane * roadBottom * 0.26;
        drawCar(carX, h * 0.8, Math.min(118, w * 0.13), Math.min(150, h * 0.22), '#10141c', true);
        if (fallback.hitFlash > 0) {
            ctx.fillStyle = `rgba(255,25,38,${fallback.hitFlash * .2})`; ctx.fillRect(0, 0, w, h);
        }
        ctx.fillStyle = 'rgba(4,7,12,.86)'; ctx.fillRect(16, 16, 260, 62);
        ctx.strokeStyle = '#b52b39'; ctx.strokeRect(16, 16, 260, 62);
        ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#ff3547';
        ctx.fillText(`KITT // ${fallback.level === 3 ? 'LOOPING' : night ? 'NIGHT RUN' : 'RACE'}`, 28, 41);
        ctx.font = '13px monospace'; ctx.fillStyle = '#d7e7f5';
        ctx.fillText(`SCORE ${fallback.score.toString().padStart(6, '0')}   VIES ${fallback.lives}`, 28, 63);
        if (!fallback.active && state === 'menu') {
            ctx.fillStyle = 'rgba(4,7,12,.25)'; ctx.fillRect(0, 0, w, h);
            ctx.font = `bold ${Math.max(18, Math.min(30, w * .035))}px monospace`;
            ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('MODE 2D COMPATIBLE', w / 2, h * .59); ctx.textAlign = 'start';
        }
    }

    function frame(now) {
        const dt = Math.min(0.045, fallback.lastTime ? (now - fallback.lastTime) / 1000 : 0.016);
        fallback.lastTime = now;
        if (fallback.active && !paused) {
            fallback.elapsed += dt;
            fallback.distance += (18 + fallback.speed) * dt;
            const accel = fallback.keys.has('ArrowUp') || fallback.keys.has('KeyW');
            const brake = fallback.keys.has('ArrowDown') || fallback.keys.has('KeyS');
            const turbo = (fallback.keys.has('Space') || fallback.keys.has('ShiftLeft') || fallback.keys.has('ShiftRight')) && fallback.turbo > 0;
            fallback.speed += (accel ? 15 : -8) * dt;
            if (brake) fallback.speed -= 28 * dt;
            if (turbo) { fallback.speed += 24 * dt; fallback.turbo = Math.max(0, fallback.turbo - 25 * dt); }
            else fallback.turbo = Math.min(100, fallback.turbo + 9 * dt);
            fallback.speed = Math.max(0, Math.min(turbo ? 64 : 43, fallback.speed));
            const left = fallback.keys.has('ArrowLeft') || fallback.keys.has('KeyA');
            const right = fallback.keys.has('ArrowRight') || fallback.keys.has('KeyD');
            fallback.lane = Math.max(-1.15, Math.min(1.15, fallback.lane + ((right ? 1 : 0) - (left ? 1 : 0)) * 2.4 * dt));
            fallback.spawn += dt;
            if (fallback.spawn > Math.max(.7, 1.7 - fallback.speed / 60)) {
                fallback.spawn = 0;
                const isPickup = Math.random() < .24;
                fallback.obstacles.push({ lane: Math.floor(Math.random() * 3) - 1, z: 0, kind: isPickup ? 'pickup' : 'car', color: ['#573b96','#21635e','#6e2634'][Math.floor(Math.random()*3)] });
            }
            for (const item of fallback.obstacles) {
                item.z += dt * (.23 + fallback.speed / 80);
                if (!item.hit && item.z > .86 && Math.abs(item.lane - fallback.lane) < .5) {
                    item.hit = true;
                    if (item.kind === 'pickup') { fallback.score += 100; fallback.turbo = Math.min(100, fallback.turbo + 28); beep(880,.13,'triangle'); }
                    else { fallback.lives--; fallback.speed *= .35; fallback.hitFlash = 1; beep(110,.28,'sawtooth'); }
                }
                if (item.z > 1.12 && item.kind === 'car' && !item.hit) fallback.score += 10;
            }
            fallback.obstacles = fallback.obstacles.filter(item => item.z < 1.16);
            fallback.score += Math.floor(fallback.speed * dt * .42);
            fallback.hitFlash = Math.max(0, fallback.hitFlash - dt * 2.7);
            document.getElementById('speed-value').textContent = Math.round(fallback.speed * 3.6);
            document.getElementById('timer').textContent = formatTime(fallback.elapsed);
            document.getElementById('checkpoint-info').textContent = `${Math.floor(fallback.elapsed / 15) % 4}/3`;
            document.getElementById('turbo-fill').style.width = `${fallback.turbo}%`;
            const livesEl = document.getElementById('lives');
            if (livesEl) livesEl.textContent = '♥ '.repeat(Math.max(0, fallback.lives)).trim() || '—';
            if (fallback.elapsed >= 60 || fallback.lives <= 0) endRace(fallback.lives > 0);
        }
        draw(now);
        requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    const isGameInput = e => !!e.target?.matches?.('input, textarea, select, [contenteditable="true"]');
    window.addEventListener('keydown', e => {
        if (isGameInput(e)) return;
        const controlled = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code);
        if (controlled && fallback.active) e.preventDefault();
        fallback.keys.add(e.code);
        if (e.code === 'Escape') pauseRace();
        if (e.code === 'KeyP' && !e.repeat) document.getElementById('btn-music')?.click();
        if (e.code === 'KeyR' && state === 'finished') startRace(fallback.level);
        if ((e.code === 'KeyX' || e.code === 'KeyF') && fallback.active) beep(1040,.12,'sawtooth');
    });
    window.addEventListener('keyup', e => fallback.keys.delete(e.code));
    window.addEventListener('blur', () => fallback.keys.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) fallback.keys.clear(); });
    document.getElementById('btn-level1').addEventListener('click', () => startRace(1));
    document.getElementById('btn-level2').addEventListener('click', () => startRace(2));
    document.getElementById('btn-level3').addEventListener('click', () => startRace(3));
    for(const level of [5,6,7,8,9,10])document.getElementById('btn-level'+level)?.addEventListener('click',()=>startRace(level));
    document.getElementById('btn-home')?.addEventListener('click',()=>{fallback.active=false;paused=false;state='menu';setScreen('menu')});
    document.getElementById('btn-custom')?.addEventListener('click', () => startRace(4));
    editorButton?.addEventListener('click', () => {
        const subtitle = menu.querySelector('.subtitle');
        if (subtitle) subtitle.textContent = 'L’éditeur avancé nécessite WebGL; les courses restent jouables dans ce mode compatible.';
    });
    document.getElementById('btn-scores')?.addEventListener('click', () => {
        const best = localStorage.getItem('kx-stunt-2d-best') || '0';
        const bestEl = document.getElementById('menu-best');
        bestEl.textContent = `RECORD LOCAL 2D : ${Number(best).toLocaleString('fr-FR')} POINTS`;
        bestEl.classList.remove('hidden');
    });
    document.getElementById('btn-music')?.addEventListener('click', e => {
        fallback.muted = !fallback.muted;
        const label = fallback.muted ? '♪ SONS : OFF' : '♪ SONS : ON';
        e.currentTarget.textContent = label;
        e.currentTarget.title = 'Sons arcade (P)';
        const pauseSoundButton = document.getElementById('btn-music-pause');
        if (pauseSoundButton) { pauseSoundButton.textContent = label; pauseSoundButton.title = 'Sons arcade (P)'; }
        beep(660,.1);
    });
    const soundButton = document.getElementById('btn-music');
    if (soundButton) {
        const label = fallback.muted ? '♪ SONS : OFF' : '♪ SONS : ON';
        soundButton.textContent = label;
        soundButton.title = 'Sons arcade (P)';
        const pauseSoundButton = document.getElementById('btn-music-pause');
        if (pauseSoundButton) { pauseSoundButton.textContent = label; pauseSoundButton.title = 'Sons arcade (P)'; }
    }
    document.getElementById('btn-music-pause')?.addEventListener('click', () => document.getElementById('btn-music')?.click());
    document.getElementById('btn-resume')?.addEventListener('click', pauseRace);
    document.getElementById('btn-quit')?.addEventListener('click', () => { paused=false; fallback.active=false; state='menu'; setScreen('menu'); });
    document.getElementById('btn-restart')?.addEventListener('click', () => startRace(fallback.level));
    document.getElementById('btn-menu')?.addEventListener('click', () => { fallback.active=false; state='menu'; setScreen('menu'); });
    document.getElementById('btn-scores-close')?.addEventListener('click', () => setScreen('menu'));
    document.querySelectorAll('[data-drive]').forEach(button => {
        const code = { left:'ArrowLeft', right:'ArrowRight', accelerate:'ArrowUp', brake:'ArrowDown' }[button.dataset.drive];
        button.addEventListener('pointerdown', e => { e.preventDefault(); fallback.keys.add(code); });
        for (const type of ['pointerup','pointercancel','pointerleave']) button.addEventListener(type, () => fallback.keys.delete(code));
    });
    const subtitle = menu.querySelector('.subtitle');
    if (subtitle) subtitle.textContent = 'Course arcade en mode 2D compatible — WebGL désactivé sur cet appareil.';
    const controlsHelp = menu.querySelector('.controls-help');
    if (controlsHelp) controlsHelp.innerHTML = '<p><strong>Départ</strong> : choisis un niveau · <strong>Flèches / WASD</strong> : conduire · <strong>↑ / W</strong> : accélérer · <strong>↓ / S</strong> : freiner</p><p><strong>Espace / Maj</strong> : turbo · <strong>P</strong> : sons activés/coupés · <strong>Échap</strong> : pause</p><p><strong>R</strong> : rejouer après la course · Le bouton <strong>SONS</strong> règle les effets audio.</p>';
    const hint = document.createElement('p');
    hint.className = 'compatibility-note';
    hint.setAttribute('role','status');
    hint.textContent = 'MODE PC COMPATIBLE · Flèches / WASD conduite · ↑ / W accélérer · ↓ / S freiner · Espace / Maj turbo · P sons · Échap pause · R rejouer';
    subtitle?.insertAdjacentElement('afterend', hint);
    if (editorButton) { editorButton.disabled = true; editorButton.title = 'L’éditeur 3D nécessite WebGL'; }
    state = 'menu';
    document.getElementById('loading-screen').classList.add('hidden');
    setScreen('menu');
    resize();
    requestAnimationFrame(frame);
    window.__kittFallback2D = { get state(){return state;}, get score(){return fallback.score;}, get level(){return fallback.level;}, startRace };
}

