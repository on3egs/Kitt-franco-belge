'use strict';
/* ============================================
   SPACE INVADERS PRO — MOTEUR AUDIO SYNTHÉTISÉ
   WebAudio natif : lasers, explosions, basse
   « marchande des aliens », jingles, sirène boss.
   Se superpose aux mp3/voix existants.
   ============================================ */

const SFX = (() => {
    let ac = null;                 // AudioContext partagé avec l'engine
    let master = null;             // gain principal
    let enabled = true;            // respecte arcadeSoundEnabled
    let volume = 0.55;             // volume synthétisé (les mp3 gardent leur volume)
    let noiseBuf = null;           // buffer de bruit blanc pré-calculé
    let padNodes = null;           // nœuds de l'ambiance spatiale
    let bassTimer = null;          // minuteur de la basse rythmée
    let bassStep = 0;              // position dans la séquence
    let lastBassAt = 0;            // anti-doublon
    // Séquence « marchande des aliens » (4 notes descendantes)
    const BASS_SEQ = [0, -5, -2, -7];

    function ctx() {
        // Réutilise le contexte de l'engine s'il existe (débloqué par les boutons)
        if (!ac && typeof nebulaAudio !== 'undefined' && nebulaAudio) ac = nebulaAudio;
        if (!ac) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            ac = new AC();
        }
        if (ac.state === 'suspended') ac.resume().catch(() => {});
        if (!master) {
            master = ac.createGain();
            master.gain.value = volume;
            master.connect(ac.destination);
        }
        return ac;
    }

    function getNoise() {
        const a = ctx(); if (!a) return null;
        if (!noiseBuf) {
            noiseBuf = a.createBuffer(1, a.sampleRate * 1, a.sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        return noiseBuf;
    }

    // Bip générique : oscillateur + gain avec enveloppe
    function tone(type, f0, f1, t0, dur, vol, filterF) {
        const a = ctx(); if (!a || !master) return;
        const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
        o.type = type;
        o.frequency.setValueAtTime(Math.max(20, f0), t0);
        if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
        f.type = filterF ? 'bandpass' : 'lowpass';
        f.frequency.value = filterF || 8000;
        if (filterF) f.Q.value = 1.2;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(f); f.connect(g); g.connect(master);
        o.start(t0); o.stop(t0 + dur + 0.03);
    }

    // Bruit filtré (explosions, impacts)
    function noise(t0, dur, vol, fType, f0, f1, q) {
        const a = ctx(); if (!a || !master) return;
        const buf = getNoise(); if (!buf) return;
        const s = a.createBufferSource(); s.buffer = buf; s.loop = true;
        const f = a.createBiquadFilter(); f.type = fType; f.Q.value = q || 0.8;
        f.frequency.setValueAtTime(f0, t0);
        if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        s.connect(f); f.connect(g); g.connect(master);
        s.start(t0); s.stop(t0 + dur + 0.05);
    }

    function ok() { return enabled && typeof arcadeSoundEnabled === 'undefined' || (enabled && arcadeSoundEnabled); }
    function now() { const a = ctx(); return a ? a.currentTime : 0; }
    function throttle(key, gap) {
        const t = performance.now();
        if (SFX._th[key] && t - SFX._th[key] < gap) return true;
        SFX._th[key] = t; return false;
    }

    return {
        _th: {},

        /* Déblocage explicite au premier geste utilisateur */
        unlock() { ctx(); this.startPad(); },

        setEnabled(v) { enabled = v; if (!v) this.stopBass(); else this.startPad(); },
        setVolume(v) { volume = v; if (master) master.gain.value = v; },

        /* --- Lasers --- */
        laserPlayer(kind) {
            if (!ok() || throttle('lp', 45)) return;
            const t = now(), f = kind === 'rail' ? 190 : kind === 'drone' ? 420 : kind === 'spread' ? 560 : 880;
            tone('square', f, f * 0.35, t, 0.09, 0.10, 2600);
            tone('sawtooth', f * 2, f * 0.7, t, 0.05, 0.05, 3600);
        },
        laserEnemy() {
            if (!ok() || throttle('le', 70)) return;
            const t = now();
            tone('sawtooth', 320, 110, t, 0.16, 0.07, 1400);
        },

        /* --- Explosion : taille 0..1 --- */
        explosion(size) {
            if (!ok() || throttle('ex', 60)) return;
            const t = now(), s = Math.min(1, Math.max(0.2, size || 0.5));
            noise(t, 0.25 + 0.45 * s, 0.22 + 0.18 * s, 'lowpass', 3200, 120);
            tone('sine', 90 + 40 * s, 30, t, 0.35 + 0.3 * s, 0.35);       // sub drop
            if (s > 0.7) noise(t + 0.05, 0.6, 0.15, 'bandpass', 900, 250, 1.5);
        },

        /* --- Bouclier touché : ping métallique --- */
        shield() {
            if (!ok() || throttle('sh', 90)) return;
            const t = now();
            tone('triangle', 1250, 900, t, 0.12, 0.12);
            tone('sine', 1870, 1500, t, 0.09, 0.07);
            noise(t, 0.08, 0.05, 'highpass', 5000, 6000);
        },

        /* --- Powerup : arpège montant --- */
        powerup() {
            if (!ok()) return;
            const t = now();
            [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, t + i * 0.07, 0.12, 0.09, 2200));
            tone('sine', 2093, 2093, t + 0.28, 0.18, 0.06);
        },

        /* --- Vague complétée : jingle --- */
        waveClear() {
            if (!ok()) return;
            const t = now();
            [440, 554, 659, 880].forEach((f, i) => tone('triangle', f, f, t + i * 0.11, 0.22, 0.12));
            tone('sine', 1108, 1108, t + 0.44, 0.35, 0.08);
        },

        /* --- Sirène d'alarme boss --- */
        bossAlarm() {
            if (!ok()) return;
            const t = now();
            for (let i = 0; i < 4; i++) {
                tone('sawtooth', 500, 760, t + i * 0.42, 0.2, 0.11, 1600);
                tone('sawtooth', 760, 500, t + i * 0.42 + 0.2, 0.2, 0.11, 1600);
            }
        },

        /* --- Game over : descente dramatique --- */
        gameOver() {
            if (!ok()) return;
            this.stopBass();
            const t = now();
            [392, 330, 262, 196, 131].forEach((f, i) => {
                tone('sawtooth', f, f * 0.97, t + i * 0.22, 0.28, 0.12, 1200);
                tone('sine', f / 2, f / 2, t + i * 0.22, 0.3, 0.12);
            });
            noise(t, 1.2, 0.12, 'lowpass', 800, 60);
        },

        /* --- Pouvoir spécial --- */
        special() {
            if (!ok()) return;
            const t = now();
            tone('sawtooth', 120, 900, t, 0.5, 0.13, 2000);
            [660, 880, 1320].forEach((f, i) => tone('square', f, f, t + 0.1 + i * 0.06, 0.15, 0.08, 3000));
            noise(t, 0.4, 0.1, 'highpass', 3000, 6000);
        },

        /* --- Basse « marchande des aliens » --- */
        // Intervalle lié au nombre d'ennemis restants (comme l'original 1978)
        bassStart() {
            if (!ok()) return;
            if (bassTimer) return;
            this._bassTick();
        },
        bassStop() { this.stopBass(); },
        stopBass() { if (bassTimer) { clearTimeout(bassTimer); bassTimer = null; } },
        _bassTick() {
            bassTimer = null;
            if (!ok()) return;
            const a = ctx(); if (!a) return;
            const count = (typeof enemies !== 'undefined' ? enemies.length : 8) + (typeof boss !== 'undefined' && boss ? 2 : 0);
            const interval = Math.max(220, 1050 - (12 - Math.min(12, count)) * 68); // + rapide quand peu d'ennemis
            const t = a.currentTime;
            const base = 110 * Math.pow(2, BASS_SEQ[bassStep % 4] / 12);
            tone('triangle', base, base * 0.98, t, 0.11, 0.14, 500);
            tone('sine', base / 2, base / 2, t, 0.13, 0.12);
            bassStep++;
            bassTimer = setTimeout(() => this._bassTick(), interval);
        },

        /* --- Ambiance spatiale : pad filtré très bas (optionnel) --- */
        startPad() {
            if (!ok() || padNodes) return;
            const a = ctx(); if (!a || !master) return;
            const g = a.createGain(); g.gain.value = 0.0001;
            g.gain.exponentialRampToValueAtTime(0.028, a.currentTime + 3);
            const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240; f.Q.value = 0.6;
            const lfo = a.createOscillator(), lg = a.createGain();
            lfo.frequency.value = 0.07; lg.gain.value = 120;
            lfo.connect(lg); lg.connect(f.frequency); lfo.start();
            [55, 82.4, 110.3].forEach(fr => {
                const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
                o.connect(f); o.start();
            });
            f.connect(g); g.connect(master);
            padNodes = { g, lfo };
        },
        stopPad() {
            if (!padNodes) return;
            try { padNodes.g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 1); padNodes.lfo.stop(ac.currentTime + 1.2); } catch (_) {}
            padNodes = null;
        }
    };
})();

// Déblocage de l'AudioContext au premier geste utilisateur (pattern du projet)
(function unlockAudio() {
    const unlock = () => { SFX.unlock(); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
        addEventListener(ev, unlock, { once: true, passive: true }));
})();
