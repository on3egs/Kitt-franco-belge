class KITTAudioSystem {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioCache = new Map();
        this.isEnabled = this.loadPreference();
        this.volume = this.loadVolume();
        this.audioManifest = {};
        this.loadManifest();
    }

    loadPreference() {
        try {
            return localStorage.getItem('kitt_audio_enabled') !== 'false';
        } catch (e) {
            return true;
        }
    }

    savePreference(enabled) {
        try {
            localStorage.setItem('kitt_audio_enabled', enabled ? 'true' : 'false');
            this.isEnabled = enabled;
        } catch (e) {}
    }

    loadVolume() {
        try {
            const v = parseFloat(localStorage.getItem('kitt_audio_volume') || '0.6');
            return Math.max(0, Math.min(1, v));
        } catch (e) {
            return 0.6;
        }
    }

    saveVolume(v) {
        const vol = Math.max(0, Math.min(1, v));
        try {
            localStorage.setItem('kitt_audio_volume', vol);
            this.volume = vol;
        } catch (e) {}
    }

    async loadManifest() {
        try {
            const r = await fetch('audio-assets.json');
            if (r.ok) {
                this.audioManifest = await r.json();
            }
        } catch (e) {
            console.warn('Audio manifest non trouvé');
        }
    }

    getAudioUrl(key) {
        const asset = this.audioManifest[key];
        if (!asset) return null;
        return asset.url || asset.path || null;
    }

    async playAudio(key) {
        if (!this.isEnabled || this.volume === 0) return false;
        try {
            const url = this.getAudioUrl(key);
            if (!url) return false;
            let buffer = this.audioCache.get(url);
            if (!buffer) {
                buffer = await this.fetchAndDecode(url);
                if (buffer) {
                    this.audioCache.set(url, buffer);
                } else {
                    return false;
                }
            }
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = this.volume;
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            source.start(0);
            return true;
        } catch (e) {
            console.warn(`Erreur audio [${key}]:`, e.message);
            return false;
        }
    }

    async fetchAndDecode(url) {
        try {
            const r = await fetch(url);
            if (!r.ok) return null;
            const arrayBuffer = await r.arrayBuffer();
            return await this.audioContext.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.warn('Décodage audio échoué:', e.message);
            return null;
        }
    }

    resume() {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
        }
    }

    createVolumeButton() {
        const btn = document.createElement('button');
        btn.id = 'btn-audio-toggle';
        btn.className = 'btn-audio-toggle';
        btn.title = this.isEnabled ? 'Volume: Mute' : 'Volume: On';
        btn.innerHTML = this.isEnabled ? '🔊' : '🔇';
        btn.style.cssText = 'background: transparent; border: none; color: var(--green); font-size: 14px; cursor: pointer; padding: 4px 8px; transition: all 0.2s;';
        btn.addEventListener('click', () => this.toggleAudio());
        btn.addEventListener('mouseenter', () => this.resume());
        return btn;
    }

    toggleAudio() {
        this.savePreference(!this.isEnabled);
        const btn = document.getElementById('btn-audio-toggle');
        if (btn) {
            btn.innerHTML = this.isEnabled ? '🔊' : '🔇';
            btn.title = this.isEnabled ? 'Volume: Mute' : 'Volume: On';
        }
    }
}

window.KITTAudio = new KITTAudioSystem();