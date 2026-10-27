// ============================================
// ASTEROIDS PRO — Couche audio WebAudio
// 100% procédural, aucun asset externe.
// Respecte le ducking global : quand window.cdPlayerDucking
// ou window.kittMicDucking est actif, le volume jeu est réduit.
// By Manix - KITT FRANCO BELGE
// ============================================
window.AstSfx = (function () {
    'use strict';

    let ctx = null;
    let master = null;
    let sfxBus = null;
    let noiseBuf = null;
    let volume = 0.7;
    let muted = false;
    let thruster = null;      // boucle de propulsion
    let thrusterLevel = 0;
    const storagePrefix=/space-invaders-3d/.test(location.pathname)?'spaceInvaders3dUltra':'asteroidsPro';
    let musicTimer=0,musicStep=0,musicWave=1,musicActive=false;

    function readVolume() {
        try {
            const stored=localStorage.getItem(storagePrefix+'Volume');
            const v=stored===null?0.7:Number(stored);
            if (Number.isFinite(v)) volume = Math.max(0, Math.min(1, v));
            muted = localStorage.getItem(storagePrefix+'Muted') === '1';
        } catch (e) { /* stockage facultatif */ }
    }
    readVolume();

    function duckGain() {
        // Baisse le volume si la musique CD / micro est en ducking côté hub Kyronext
        if (window.cdPlayerDucking || window.kittMicDucking || window.setMicDuckingActive) return 0.28;
        return 1;
    }

    function makeNoise() {
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return buf;
    }

    function ensure() {
        if (ctx) {
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            return true;
        }
        try {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { return false; }

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 20;
        comp.ratio.value = 4;
        comp.attack.value = 0.004;
        comp.release.value = 0.2;

        master = ctx.createGain();
        master.gain.value = effectiveGain();
        master.connect(comp);
        comp.connect(ctx.destination);

        sfxBus = ctx.createGain();
        sfxBus.gain.value = 1;
        sfxBus.connect(master);
        const delay=ctx.createDelay(1),feedback=ctx.createGain(),wet=ctx.createGain();
        delay.delayTime.value=.23;feedback.gain.value=.19;wet.gain.value=.12;
        sfxBus.connect(delay);delay.connect(wet);wet.connect(master);delay.connect(feedback);feedback.connect(delay);

        noiseBuf = makeNoise();

        // ---- Boucle thruster : bruit filtré dont l'ouverture suit la poussée
        const tSrc = ctx.createBufferSource(); tSrc.buffer = noiseBuf; tSrc.loop = true;
        const tLP = ctx.createBiquadFilter(); tLP.type = 'lowpass'; tLP.frequency.value = 420; tLP.Q.value = 0.6;
        const tBP = ctx.createBiquadFilter(); tBP.type = 'bandpass'; tBP.frequency.value = 190; tBP.Q.value = 1.4;
        const tG1 = ctx.createGain(); tG1.gain.value = 0;
        const tG2 = ctx.createGain(); tG2.gain.value = 0;
        const tMix = ctx.createGain(); tMix.gain.value = 0.9;
        tSrc.connect(tLP); tLP.connect(tG1); tG1.connect(tMix);
        tSrc.connect(tBP); tBP.connect(tG2); tG2.connect(tMix);
        tMix.connect(sfxBus);
        tSrc.start();
        thruster = { lp: tLP, bp: tBP, g1: tG1, g2: tG2, mix: tMix };

        return true;
    }

    function effectiveGain() {
        return muted ? 0 : 0.55 * volume;
    }
    function applyMaster() {
        if (!ctx || !master) return;
        master.gain.setTargetAtTime(effectiveGain() * duckGain(), ctx.currentTime, 0.05);
    }

    // ---------- briques ----------
    let activeVoices = 0;
    function tone(freq, dur, type, vol, when, slideTo) {
        if (!ctx || activeVoices >= 48) return;
        try {
            const t0 = ctx.currentTime + (when || 0);
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = type || 'square';
            o.frequency.setValueAtTime(freq, t0);
            if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
            g.gain.setValueAtTime(vol, t0);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            o.connect(g); g.connect(sfxBus);
            activeVoices++;
            o.onended=()=>{activeVoices--;o.disconnect();g.disconnect()};
            o.start(t0); o.stop(t0 + dur + 0.05);
        } catch (e) { /* silencieux */ }
    }

    function noiseHit(dur, filterFreq, vol, type, when, slideTo) {
        if (!ctx || activeVoices >= 48) return;
        try {
            const t0 = ctx.currentTime + (when || 0);
            const src = ctx.createBufferSource(); src.buffer = noiseBuf;
            const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.Q.value = 0.8;
            f.frequency.setValueAtTime(filterFreq, t0);
            if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
            const g = ctx.createGain();
            g.gain.setValueAtTime(vol, t0);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            src.connect(f); f.connect(g); g.connect(sfxBus);
            activeVoices++;
            src.onended=()=>{activeVoices--;src.disconnect();f.disconnect();g.disconnect()};
            src.start(t0); src.stop(t0 + dur + 0.05);
        } catch (e) { /* silencieux */ }
    }

    function sub(freq, dur, vol, when, slideTo) {
        if (!ctx || activeVoices >= 48) return;
        try {
            const t0 = ctx.currentTime + (when || 0);
            const o = ctx.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(freq, t0);
            if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(18, slideTo), t0 + dur);
            const g = ctx.createGain();
            g.gain.setValueAtTime(vol, t0);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            o.connect(g); g.connect(sfxBus);
            activeVoices++;
            o.onended=()=>{activeVoices--;o.disconnect();g.disconnect()};
            o.start(t0); o.stop(t0 + dur + 0.05);
        } catch (e) { /* silencieux */ }
    }

    // ---------- API sons ----------
    const sfx = {
        // Tir laser : oscillateur descendant franc + pointe aiguë
        shoot() {
            tone(920, 0.13, 'square', 0.10, 0, 190);
            tone(1800, 0.05, 'sawtooth', 0.03, 0, 700);
            tone(2700, .065, 'sine', .025, .025, 520);
        },
        // Explosion : bruit filtré + sub grave. size 0 (petit) → 1 (gros)
        explosion(size) {
            const k = Math.max(0, Math.min(1, size == null ? 0.5 : size));
            const dur = 0.35 + k * 0.55;
            noiseHit(dur, 2600 - k * 1500, 0.16 + k * 0.16, 'lowpass', 0, 120);
            sub(120 - k * 35, 0.28 + k * 0.4, 0.22 + k * 0.22, 0, 30);
            if (k > 0.55) {
                // gros astéroïde : double détonation + écho de débris
                noiseHit(0.5, 700, 0.12, 'bandpass', 0.12, 160);
                sub(70, 0.5, 0.18, 0.1, 24);
            }
            // crépitement de débris
            for (let i = 0; i < 3 + k * 4; i++) {
                noiseHit(0.05 + Math.random() * 0.06, 1200 + Math.random() * 2200, 0.03 + k * 0.03, 'bandpass', 0.06 + Math.random() * dur * 0.6);
            }
        },
        // Explosion du vaisseau du joueur
        playerExplosion() {
            noiseHit(0.9, 3000, 0.24, 'lowpass', 0, 90);
            sub(140, 0.7, 0.3, 0, 26);
            sub(90, 0.9, 0.22, 0.12, 22);
            for (let i = 0; i < 7; i++) {
                noiseHit(0.07, 900 + Math.random() * 2600, 0.05, 'bandpass', 0.1 + Math.random() * 0.6);
            }
        },
        // Apparition d'une vague : montée synthétique en quintes
        waveStart() {
            [220, 330, 440, 660].forEach((f, i) => tone(f, 0.22, 'triangle', 0.07, i * 0.09));
            tone(880, 0.5, 'sine', 0.05, 0.36, 1320);
            noiseHit(0.4, 600, 0.05, 'bandpass', 0, 2400);
        },
        gameOver() {
            [392, 311, 262, 196].forEach((f, i) => tone(f, 0.42, 'sawtooth', 0.09, i * 0.3));
            sub(98, 1.4, 0.16, 0, 30);
            noiseHit(1.2, 500, 0.08, 'lowpass', 0.1, 60);
        },
        extraLife() {
            [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'triangle', 0.09, i * 0.08));
            tone(1568, 0.4, 'sine', 0.05, 0.42);
        },
        hyperspace() {
            tone(1400, 0.35, 'sine', 0.08, 0, 90);
            noiseHit(0.35, 3000, 0.1, 'bandpass', 0, 200);
        },
        uiClick() {
            tone(1200, 0.05, 'square', 0.05);
            tone(660, 0.08, 'triangle', 0.04, 0.02);
        },
        asteroidHit() {
            // impact non destructeur (petite pierre touchée) — grésillement court
            noiseHit(0.08, 2000, 0.08, 'bandpass', 0, 500);
            sub(180, 0.12, 0.1, 0, 60);
        },
        // Power-up ramassé : arpège joyeux montant
        powerup() {
            [440, 554, 659, 880].forEach((f, i) => tone(f, 0.14, 'triangle', 0.09, i * 0.06));
            tone(1109, 0.3, 'sine', 0.05, 0.26);
        },
        // Bouclier activé : montée douce + halo
        shieldUp() {
            tone(220, 0.4, 'sine', 0.07, 0, 660);
            tone(330, 0.35, 'triangle', 0.05, 0.08, 990);
            noiseHit(0.3, 1200, 0.04, 'highpass', 0, 3600);
        },
        // Bouclier touché : choc mat amorti
        shieldHit() {
            noiseHit(0.12, 900, 0.12, 'bandpass', 0, 300);
            tone(520, 0.16, 'sine', 0.09, 0, 190);
            sub(140, 0.18, 0.12, 0, 60);
        },
        // Bombe : détonation massive + sweep de sinus
        bomb() {
            noiseHit(1.1, 3200, 0.28, 'lowpass', 0, 60);
            sub(110, 1.0, 0.32, 0, 22);
            sub(60, 1.3, 0.24, 0.1, 18);
            tone(1800, 0.5, 'sawtooth', 0.05, 0, 90);
            for (let i = 0; i < 9; i++) {
                noiseHit(0.08, 700 + Math.random() * 2800, 0.05, 'bandpass', 0.15 + Math.random() * 0.8);
            }
        },
        // Tir UFO : laser aigu bref (plus aigu que le joueur)
        ufoShoot() {
            tone(1500, 0.09, 'sawtooth', 0.05, 0, 500);
            tone(2300, 0.04, 'square', 0.025, 0, 900);
        },
        // Alarme combo : deux notes rapides montantes
        combo() {
            tone(660, 0.09, 'square', 0.06);
            tone(990, 0.12, 'square', 0.06, 0.09);
        },
        // Nouveau record : fanfare de fin
        newRecord() {
            [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'triangle', 0.09, i * 0.12));
            tone(1568, 0.6, 'sine', 0.06, 0.9);
        }
    };

    // Niveau 0..1 de propulsion (appelé chaque frame)
    function setThruster(level) {
        if (!ctx || !thruster) return;
        const l = Math.max(0, Math.min(1, level));
        if (l === thrusterLevel) return;
        thrusterLevel = l;
        const t = ctx.currentTime;
        thruster.g1.gain.setTargetAtTime(l * 0.16, t, 0.06);
        thruster.g2.gain.setTargetAtTime(l * 0.10, t, 0.06);
        thruster.lp.frequency.setTargetAtTime(360 + l * 520, t, 0.09);
        thruster.bp.frequency.setTargetAtTime(150 + l * 260, t, 0.09);
    }

    function setVolume(v) {
        volume = Math.max(0, Math.min(1, Number(v) || 0));
        try { localStorage.setItem(storagePrefix+'Volume', String(volume)); } catch (e) { /* noop */ }
        applyMaster();
    }
    function setMuted(m) {
        muted = !!m;
        try { localStorage.setItem(storagePrefix+'Muted', muted ? '1' : '0'); } catch (e) { /* noop */ }
        applyMaster();
    }
    function setMusic(active,wave=1){
        musicWave=Math.max(1,Number(wave)||1);musicActive=!!active;
        clearInterval(musicTimer);musicTimer=0;
        if(!musicActive||!ensure())return;
        const notes=[110,130.81,164.81,196,220,196,164.81,130.81];
        musicTimer=setInterval(()=>{
            if(!ctx||ctx.state!=='running'||muted||document.hidden)return;
            const beat=musicStep++%32,note=notes[beat%8]*(musicWave>=5?1.122:1);
            tone(note*2,.16,'triangle',.032);
            if(beat%4===0){sub(85,.12,.085,0,35);tone(note/2,.4,'sine',.05)}
            if(beat%2===1)noiseHit(.035,6500,.018,'highpass');
            if(beat%8===0){tone(220,.7,'sine',.016);tone(329.63,.7,'sine',.012)}
        },Math.max(125,180-musicWave*3));
    }
    function stopAll() {
        setMusic(false);
        setThruster(0);
        thrusterLevel = 0;
        if (ctx) { try { ctx.suspend(); } catch (e) { /* noop */ } }
    }
    function resume() {
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
        applyMaster();
    }

    // Suivi du ducking externe (musique CD / micro du hub)
    setInterval(() => { if (ctx) applyMaster(); }, 500);

    return {
        ensure, sfx, setThruster, setMusic,
        getContext:()=>{ensure();return ctx},output:()=>sfxBus,
        audioState:()=>({ready:!!ctx,state:ctx?.state,volume,muted,musicActive,activeVoices}),
        setVolume, setMuted,
        getVolume: () => volume,
        isMuted: () => muted,
        stopAll, resume,
        ready: () => !!ctx
    };
})();
