// ============================================
// KITT STUNT RACING v7 — Moteur audio
// 100% WebAudio synthétisé, aucun asset.
// By Manix - KITT FRANCO BELGE
// ============================================
window.KA = (function () {
    'use strict';

    let ctx = null;
    let master = null;
    let comp = null;
    let noiseBuf = null;

    // Moteur
    let eng = null;
    // Vent / dérapage
    let wind = null, skid = null;
    // Ambiance environnementale
    let ambience = null;
    // Musique
    let musicOn = false;
    let musicNodes = null;
    let musicTimer = null;
    let musicStep = 0;
    let musicNextT = 0;
    let musicScene = 'menu';
    let suspendedByHide = false;
    let voiceDucked = false;
    let hardStopped = false;   // arrêt total demandé (quitter/pause/visibilitychange)

    const MUSIC_KEY = 'kittStuntRacingMusic';

    // ---------- utilitaires ----------
    function makeNoise() {
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return buf;
    }

    function ensure() {
        if (ctx) { if (!hardStopped && ctx.state === 'suspended') ctx.resume(); return true; }
        try {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { return false; }

        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 22;
        comp.ratio.value = 8;
        comp.attack.value = 0.004;
        comp.release.value = 0.18;

        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(comp);
        comp.connect(ctx.destination);

        noiseBuf = makeNoise();

        // ---- Moteur : 2 scies désaccordées + sub carré + admission bruitée
        const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
        const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.detune.value = 9;
        const o3 = ctx.createOscillator(); o3.type = 'square';         // sub -1 octave
        const intake = ctx.createBufferSource(); intake.buffer = noiseBuf; intake.loop = true;
        const intakeBP = ctx.createBiquadFilter(); intakeBP.type = 'bandpass';
        intakeBP.frequency.value = 900; intakeBP.Q.value = 0.7;

        const engLP = ctx.createBiquadFilter(); engLP.type = 'lowpass';
        engLP.frequency.value = 520; engLP.Q.value = 1.1;

        const g1 = ctx.createGain(); g1.gain.value = 0.5;
        const g2 = ctx.createGain(); g2.gain.value = 0.42;
        const g3 = ctx.createGain(); g3.gain.value = 0.55;             // sub plus présent
        const gIntake = ctx.createGain(); gIntake.gain.value = 0.05;
        const engGain = ctx.createGain(); engGain.gain.value = 0;

        o1.connect(g1); g1.connect(engLP);
        o2.connect(g2); g2.connect(engLP);
        o3.connect(g3); g3.connect(engLP);
        intake.connect(intakeBP); intakeBP.connect(gIntake); gIntake.connect(engLP);
        engLP.connect(engGain); engGain.connect(master);

        o1.start(); o2.start(); o3.start(); intake.start();
        eng = { o1, o2, o3, intake, intakeBP, lp: engLP, gain: engGain, gear: 0 };

        // ---- Vent (boucle de bruit filtrée)
        const wSrc = ctx.createBufferSource(); wSrc.buffer = noiseBuf; wSrc.loop = true;
        const wLP = ctx.createBiquadFilter(); wLP.type = 'lowpass'; wLP.frequency.value = 380; wLP.Q.value = 0.4;
        const wGain = ctx.createGain(); wGain.gain.value = 0;
        wSrc.connect(wLP); wLP.connect(wGain); wGain.connect(master);
        wSrc.start();
        wind = { lp: wLP, gain: wGain };

        // ---- Dérapage (boucle de bruit passe-bande)
        const sSrc = ctx.createBufferSource(); sSrc.buffer = noiseBuf; sSrc.loop = true;
        const sBP = ctx.createBiquadFilter(); sBP.type = 'bandpass'; sBP.frequency.value = 950; sBP.Q.value = 1.3;
        const sGain = ctx.createGain(); sGain.gain.value = 0;
        sSrc.connect(sBP); sBP.connect(sGain); sGain.connect(master);
        sSrc.start();
        skid = { bp: sBP, gain: sGain };

        // ---- Ambiance environnementale (bruit de ville lointaine + vent léger)
        const aSrc = ctx.createBufferSource(); aSrc.buffer = noiseBuf; aSrc.loop = true;
        const aLP = ctx.createBiquadFilter(); aLP.type = 'lowpass'; aLP.frequency.value = 200; aLP.Q.value = 0.5;
        const aGain = ctx.createGain(); aGain.gain.value = 0.03;
        aSrc.connect(aLP); aLP.connect(aGain); aGain.connect(master);
        aSrc.start();
        ambience = { lp: aLP, gain: aGain };

        // Restaure le choix musique
        try { musicOn = localStorage.getItem(MUSIC_KEY) === '1'; } catch (e) { /* noop */ }
        if (musicOn) startMusic();

        // Quand la page devient invisible (fermeture de l'overlay kyronex,
        // changement d'onglet), on suspend TOUT l'audio — sinon le moteur
        // continue de vibrer en arrière-plan.
        document.addEventListener('visibilitychange', () => {
            if (!ctx) return;
            if (document.hidden) {
                stopAll();
            } else if (suspendedByHide || hardStopped) {
                resumeAll();
            }
        });

        return true;
    }

    // Télémétrie de test : la mécanique audio headless fige currentTime
    // (contexte suspendu), on instrumente donc les appels eux-mêmes.
    const dbg = { engineCalls: 0, stopCalls: 0, lastKmh: 0, lastActive: false };

    // Coupe immédiatement moteur / vent / dérapage (menu, pause, fin, éditeur).
    function stopVehicle() {
        dbg.stopCalls++;
        dbg.lastActive = false;
        if (!ctx || !eng) return;
        const t = ctx.currentTime;
        try {
            eng.gain.gain.setTargetAtTime(0, t, 0.08);
            if (wind) wind.gain.gain.setTargetAtTime(0, t, 0.08);
            if (skid) skid.gain.gain.setTargetAtTime(0, t, 0.06);
            if (ambience) ambience.gain.gain.setTargetAtTime(0, t, 0.15);
        } catch (e) { /* noop */ }
        eng.gear = 0;
    }

    // Télémétrie de test : gains actuels des boucles véhicule.
    function debugGains() {
        if (!ctx || !eng) return null;
        return {
            engine: +eng.gain.gain.value.toFixed(4),
            wind: wind ? +wind.gain.gain.value.toFixed(4) : 0,
            skid: skid ? +skid.gain.gain.value.toFixed(4) : 0
        };
    }

    // Télémétrie de test : compteurs d'appels (fiable en headless).
    function debugState() {
        return { engineCalls: dbg.engineCalls, stopCalls: dbg.stopCalls, lastKmh: +dbg.lastKmh.toFixed(1), lastActive: dbg.lastActive };
    }

    // ---------- moteur ----------
    // Appelé à chaque frame. kmh : vitesse, throttle 0..1, active : en course.
    function setEngine(kmh, throttle, active, turbo) {
        if (!ctx || !eng) return;
        if (!isFinite(kmh)) return;                 // garde-fou physique
        dbg.engineCalls++;
        dbg.lastKmh = kmh;
        dbg.lastActive = !!active;
        const t = ctx.currentTime;
        if (!active) {
            eng.gain.gain.setTargetAtTime(0, t, 0.2);
            wind.gain.gain.setTargetAtTime(0, t, 0.2);
            skid.gain.gain.setTargetAtTime(0, t, 0.15);
            if (ambience) ambience.gain.gain.setTargetAtTime(0, t, 0.15);
            return;
        }
        // Active l'ambiance en course
        if (ambience) ambience.gain.gain.setTargetAtTime(0.03, t, 0.3);
        const v = kmh / 3.6;                        // m/s
        const gears = 4;
        const gearSize = 16;                        // m/s par rapport
        const rawGear = Math.min(gears - 1, Math.floor(v / gearSize));
        const inGear = v - rawGear * gearSize;
        const rpm01 = Math.min(1, inGear / gearSize + 0.12);
        if (rawGear !== eng.gear) {
            const up = rawGear > eng.gear;
            eng.gear = rawGear;
            // Passage de rapport : petit à-coup mécanique procédural
            if (voiceDucked === false) {
                noiseHit(0.05, up ? 1500 : 900, 0.05, 'bandpass');
                tone(up ? 220 : 160, 0.06, 'square', 0.045, 0, up ? 320 : 110);
            }
        }

        const base = 46 * (1 + rawGear * 0.42);
        const freq = base * (1 + rpm01 * 1.75) * (turbo ? 1.12 : 1);
        eng.o1.frequency.setTargetAtTime(freq, t, 0.05);
        eng.o2.frequency.setTargetAtTime(freq * 1.005, t, 0.05);
        eng.o3.frequency.setTargetAtTime(freq * 0.5, t, 0.05);
        eng.lp.frequency.setTargetAtTime(320 + rpm01 * 900 + (turbo ? 500 : 0) + throttle * 250, t, 0.07);
        eng.intakeBP.frequency.setTargetAtTime(700 + rpm01 * 1400, t, 0.08);

        const vol = 0.030 + throttle * 0.030 + rpm01 * 0.012 + (turbo ? 0.018 : 0);
        eng.gain.gain.setTargetAtTime(vol, t, 0.09);

        // Vent : croît avec le carré de la vitesse
        const wn = Math.min(0.14, Math.pow(Math.min(1, v / 62), 2) * 0.14);
        wind.gain.gain.setTargetAtTime(wn, t, 0.25);
        wind.lp.frequency.setTargetAtTime(300 + Math.min(1, v / 62) * 900, t, 0.3);
    }

    function setSkid(amount) {
        if (!ctx || !skid) return;
        if (!isFinite(amount)) amount = 0;
        const a = Math.max(0, Math.min(1, amount));
        skid.gain.gain.setTargetAtTime(a * 0.11, ctx.currentTime, 0.07);
        skid.bp.frequency.setTargetAtTime(800 + a * 500, ctx.currentTime, 0.1);
    }

    // ---------- one-shots ----------
    function tone(freq, dur, type, vol, when, slideTo) {
        if (!ctx) return;
        try {
            const t0 = ctx.currentTime + (when || 0);
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = type || 'square';
            o.frequency.setValueAtTime(freq, t0);
            if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
            g.gain.setValueAtTime(vol || 0.12, t0);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            o.connect(g); g.connect(master);
            o.start(t0); o.stop(t0 + dur + 0.05);
        } catch (e) { /* silencieux */ }
    }

    function noiseHit(dur, filterFreq, vol, type, when) {
        if (!ctx) return;
        try {
            const t0 = ctx.currentTime + (when || 0);
            const src = ctx.createBufferSource(); src.buffer = noiseBuf;
            const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = filterFreq; f.Q.value = 0.9;
            const g = ctx.createGain();
            g.gain.setValueAtTime(vol, t0);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            src.connect(f); f.connect(g); g.connect(master);
            src.start(t0); src.stop(t0 + dur + 0.05);
        } catch (e) { /* silencieux */ }
    }

    const sfx = {
        beep: (f, dur) => tone(f || 440, dur || 0.12, 'square', 0.13),
        countBeep: () => { tone(392, 0.12, 'square', 0.14); },
        countGo: () => { tone(784, 0.35, 'square', 0.16); tone(988, 0.3, 'square', 0.08, 0.02); },
        click: () => tone(1200, 0.05, 'square', 0.06),
        checkpoint: () => { tone(880, 0.09, 'square', 0.12); tone(1318, 0.14, 'square', 0.12, 0.09); },
        loopSuccess: () => { tone(660, 0.12, 'square', 0.12); tone(880, 0.12, 'square', 0.12, 0.1); tone(1320, 0.25, 'square', 0.13, 0.2); },
        turbo: () => {
            tone(105, 0.12, 'square', 0.08, 0, 72);
            tone(80, 0.4, 'sine', 0.12, 0, 40);
            noiseHit(0.65, 900, 0.2, 'bandpass');
            tone(180, 0.5, 'sawtooth', 0.06, 0, 900);
            tone(1200, 0.3, 'square', 0.04, 0, 1800);
            tone(340, 0.22, 'triangle', 0.035, .04, 980);
        },
        scanner: () => tone(220, 0.55, 'sine', 0.09, 0, 1500),
        karrProximity: () => {
            tone(520, .075, 'square', .07);
            tone(760, .09, 'square', .06, .10);
        },
        collision: (i) => {
            const k = Math.max(.15, Math.min(1, i || .4));
            tone(95 - k * 28, .11 + k * .09, 'sine', .12 + k * .16, 0, 42);
            noiseHit(.07 + k * .09, 420 + k * 520, .08 + k * .15, 'bandpass');
            if (k > .68) tone(310, .06, 'square', .035, .025, 170);
        },
        thud: (i) => {
            const k = Math.max(0.2, Math.min(1, i || 0.5));
            tone(70, 0.16, 'sine', 0.3 * k, 0, 38);
            noiseHit(0.12, 260, 0.16 * k, 'lowpass');
        },
        land: () => { tone(85, 0.1, 'sine', 0.14, 0, 55); noiseHit(0.06, 500, 0.05, 'lowpass'); },
        fanfare: () => {
            const seq = [523, 659, 784, 1047];
            seq.forEach((f, i) => tone(f, i === 3 ? 0.5 : 0.14, 'square', 0.13, i * 0.14));
            tone(1568, 0.5, 'triangle', 0.07, 0.6);
        },
        record: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'square', 0.11, i * 0.09)); },
        menuOpen: () => { tone(392, .05, 'square', .055); tone(659, .08, 'triangle', .045, .055); },
        pilotSelect: () => { tone(520, .06, 'square', .06); tone(820, .10, 'triangle', .05, .055); },
        whoosh: (direction = 1) => { const start = direction < 0 ? 980 : 620; const end = direction < 0 ? 420 : 1280; tone(start, .16, 'sawtooth', .035, 0, end); noiseHit(.13, 1500, .035, 'bandpass'); }
    };

    // ---------- musique synthwave ----------
    // Séquenceur minimal : kick 4/4, basse 8ths, pad d'accords, hats offbeat.
    const BPM = 102;
    const SPB = 60 / BPM;                 // secondes par temps
    const BASS_PAT = [0, 0, 12, 0, 0, 7, 12, 10];   // demi-tons relatif à A1
    const CHORDS = [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-7, -4, 0]]; // Am F G... relatif
    const ROOT = 55;                      // A1

    function mt(semi) { return ROOT * Math.pow(2, semi / 12); }

    function schedKick(t) {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
        g.gain.setValueAtTime(0.34, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        o.connect(g); g.connect(musicNodes.bus);
        o.start(t); o.stop(t + 0.2);
    }
    function schedHat(t, open) {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
        const g = ctx.createGain();
        const dur = open ? 0.09 : 0.035;
        g.gain.setValueAtTime(open ? 0.05 : 0.038, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(f); f.connect(g); g.connect(musicNodes.bus);
        src.start(t); src.stop(t + dur + 0.02);
    }
    function schedBass(t, semi) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = mt(semi);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4;
        f.frequency.setValueAtTime(1600, t);
        f.frequency.exponentialRampToValueAtTime(220, t + SPB / 2 * 0.9);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + SPB / 2 * 0.95);
        o.connect(f); f.connect(g); g.connect(musicNodes.bus);
        o.start(t); o.stop(t + SPB / 2);
    }
    function schedPad(t, chord) {
        const dur = SPB * 4;
        for (const semi of chord) {
            for (const det of [-6, 6]) {
                const o = ctx.createOscillator(); o.type = 'sawtooth';
                o.frequency.value = mt(semi + 12) * (1 + det / 1200);
                const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 750;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime(0.028, t + dur * 0.35);
                g.gain.linearRampToValueAtTime(0.0001, t + dur);
                o.connect(f); f.connect(g); g.connect(musicNodes.bus);
                o.start(t); o.stop(t + dur + 0.05);
            }
        }
    }

    function musicTick() {
        if (!musicOn || !ctx || !musicNodes) return;
        const ahead = 0.18;
        while (musicNextT < ctx.currentTime + ahead) {
            const step16 = musicStep % 16;          // 16 doubles-croches par mesure
            const bar = Math.floor(musicStep / 16);
            const t = musicNextT;
            if (step16 % 4 === 0) schedKick(t);                     // 4/4
            if (step16 % 4 === 2) schedHat(t, step16 === 14);       // offbeats
            if (step16 % 2 === 0) schedBass(t, BASS_PAT[(step16 / 2) | 0]);
            if (step16 === 0) schedPad(t, CHORDS[bar % CHORDS.length]);
            musicNextT += SPB / 4;
            musicStep++;
        }
    }

    function startMusic() {
        if (!ctx || musicNodes) return;
        const bus = ctx.createGain(); const sceneGain={menu:.48,pilot:.40,race:.90,victory:.65}[musicScene] ?? .70; bus.gain.value = sceneGain;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
        bus.connect(lp); lp.connect(master);
        musicNodes = { bus };
        musicStep = 0;
        musicNextT = ctx.currentTime + 0.1;
        musicTimer = setInterval(musicTick, 40);
    }

    function stopMusic() {
        if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
        if (musicNodes) {
            try { musicNodes.bus.disconnect(); } catch (e) { /* noop */ }
            musicNodes = null;
        }
    }

    // Arrêt TOTAL du son : véhicule + musique + suspension du contexte WebAudio.
    // Utilisé à la sortie, en pause, sur visibilitychange et beforeunload.
    function stopAll() {
        hardStopped = true;
        suspendedByHide = true;
        try { stopVehicle(); } catch (e) { /* noop */ }
        try { stopMusic(); } catch (e) { /* noop */ }
        if (ctx) { try { ctx.suspend(); } catch (e) { /* noop */ } }
    }

    // Réveil après stopAll() : relance la musique si elle était activée.
    function resumeAll() {
        suspendedByHide = false;
        if (!hardStopped) {
            if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* noop */ } }
            return;
        }
        hardStopped = false;
        if (!ctx) return;
        try { ctx.resume(); } catch (e) { /* noop */ }
        if (musicOn) startMusic();
    }

    function toggleMusic() {
        musicOn = !musicOn;
        try { localStorage.setItem(MUSIC_KEY, musicOn ? '1' : '0'); } catch (e) { /* noop */ }
        if (musicOn && ctx) startMusic();
        if (!musicOn) stopMusic();
        return musicOn;
    }

    function setMusicScene(scene) {
        const allowed = ['menu','pilot','race','victory'];
        musicScene = allowed.includes(scene) ? scene : 'menu';
        if (ctx && musicNodes?.bus) {
            const level = {menu:.48,pilot:.40,race:.90,victory:.65}[musicScene];
            try { musicNodes.bus.gain.setTargetAtTime(level, ctx.currentTime, .12); } catch (_) { musicNodes.bus.gain.value = level; }
        }
        return musicScene;
    }

    // Réduit le son du jeu pendant la reconnaissance vocale afin de limiter
    // la réinjection du moteur et de la musique dans le microphone.
    function setVoiceDucking(active) {
        voiceDucked = Boolean(active);
        if (!ctx || !master) return;
        try {
            master.gain.setTargetAtTime(voiceDucked ? 0.08 : 0.9, ctx.currentTime, 0.06);
        } catch (e) { /* audio optionnel */ }
    }

    return {
        ensure,
        setEngine,
        setSkid,
        stopVehicle,
        stopAll,
        resumeAll,
        debugGains,
        debugState,
        sfx,
        toggleMusic,
        setMusicScene,
        setVoiceDucking,
        musicOn: () => musicOn,
        ready: () => !!ctx
    };
})();
