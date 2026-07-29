/* K-4000 Voice Display: original canvas equalizer, synchronised with Web Audio. */
class K4000VoiceDisplay extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: "open"});
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; contain:content; width:100%; aspect-ratio:1790/631; min-height:110px; }
        :host([fullscreen]) { width:100%; height:100%; min-height:0; aspect-ratio:auto; }
        canvas { display:block; width:100%; height:100%; background:transparent; image-rendering:pixelated; }
      </style>
      <canvas aria-label="Équaliseur vocal K-4000"></canvas>`;
    this.canvas = this.shadowRoot.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d", {alpha:true, desynchronized:true});
    this.analyser = null;
    this.audioContext = null;
    this.mode = "idle";
    this.level = 0;
    this.bands = {low:0, mid:0, high:0};
    this.freq = new Uint8Array(512);
    this.wave = new Uint8Array(1024);
    this.bars = new Float32Array(62);
    this.raf = 0;
    this.lastFrame = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  connectedCallback() {
    this.resizeObserver.observe(this);
    this.resize();
    this.start();
  }

  disconnectedCallback() {
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  setMode(mode) { this.mode = mode === "speaking" ? "speaking" : "idle"; }

  connectSource(source, audioContext) {
    this.audioContext = audioContext;
    if (!this.analyser || this.analyser.context !== audioContext) {
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.68;
      this.analyser.minDecibels = -82;
      this.analyser.maxDecibels = -18;
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.wave = new Uint8Array(this.analyser.fftSize);
    }
    source.connect(this.analyser);
    source.connect(audioContext.destination);
    this.setMode("speaking");
  }

  releaseSource() { this.setMode("idle"); }

  resize() {
    const box = this.getBoundingClientRect();
    const density = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.max(2, Math.round(box.width * density));
    const height = Math.max(2, Math.round(box.height * density));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.dataset.canvasWidth = String(width);
    this.dataset.canvasHeight = String(height);
  }

  start() {
    if (this.raf) return;
    const frame = now => {
      this.raf = requestAnimationFrame(frame);
      if (document.hidden || now - this.lastFrame < 16) return;
      this.lastFrame = now;
      this.updateSignal();
      this.draw();
    };
    this.raf = requestAnimationFrame(frame);
  }

  updateSignal() {
    if (!this.analyser || this.mode !== "speaking") {
      this.level *= 0.86;
      this.bands.low *= 0.84;
      this.bands.mid *= 0.84;
      this.bands.high *= 0.82;
      return;
    }
    this.analyser.getByteTimeDomainData(this.wave);
    this.analyser.getByteFrequencyData(this.freq);
    let sum = 0;
    for (let i = 0; i < this.wave.length; i++) {
      const sample = (this.wave[i] - 128) / 128;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / this.wave.length);
    const target = Math.min(1, rms * 4.8);
    this.level += (target - this.level) * (target > this.level ? 0.48 : 0.16);
    const nyquist = this.audioContext.sampleRate / 2;
    this.bands.low = this.bandEnergy(70, 280, nyquist);
    this.bands.mid = this.bandEnergy(280, 2400, nyquist);
    this.bands.high = this.bandEnergy(2400, 8000, nyquist);
  }

  bandEnergy(startHz, endHz, nyquist) {
    const from = Math.max(1, Math.floor(startHz / nyquist * this.freq.length));
    const to = Math.min(this.freq.length, Math.ceil(endHz / nyquist * this.freq.length));
    let sum = 0;
    for (let i = from; i < to; i++) sum += this.freq[i] * this.freq[i];
    return Math.min(1, Math.sqrt(sum / Math.max(1, to - from)) / 190);
  }

  draw() {
    const g = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const fullscreen = this.hasAttribute("fullscreen");
    this.dataset.fullscreen = String(fullscreen);
    this.dataset.opacity = fullscreen ? "1" : "0.8";
    g.clearRect(0, 0, width, height);

    const alpha = fullscreen ? 1 : 0.80;
    const background = g.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, `rgba(8,24,78,${alpha})`);
    background.addColorStop(0.52, `rgba(12,48,125,${alpha})`);
    background.addColorStop(1, `rgba(9,34,96,${alpha})`);
    g.fillStyle = background;
    g.fillRect(0, 0, width, height);

    this.drawScale(width, height);

    const speaking = this.level > 0.012;
    const step = width / this.bars.length;
    const base = height * 0.91;
    const blockHeight = Math.max(3, Math.round(height / 46));
    const blockGap = Math.max(1, Math.round(blockHeight * 0.32));
    for (let i = 0; i < this.bars.length; i++) {
      const ratio = i / (this.bars.length - 1);
      const hz = 70 * Math.pow(8000 / 70, ratio);
      const bin = this.audioContext
        ? Math.min(this.freq.length - 1, Math.round(hz / (this.audioContext.sampleRate / 2) * this.freq.length))
        : 0;
      const spectral = this.freq[bin] / 255;
      const shape = 0.32 + this.bands.low * 0.18 + this.bands.mid * 0.55 + this.bands.high * 0.28;
      const target = speaking ? Math.min(1, spectral * 0.82 + this.level * shape) : 0.018;
      this.bars[i] += (target - this.bars[i]) * (target > this.bars[i] ? 0.48 : 0.14);
      const barHeight = height * (0.08 + this.bars[i] * 0.61);
      const barWidth = Math.max(2, Math.round(step * 0.28));
      const x = Math.round(i * step + step * 0.36);
      const blocks = Math.max(1, Math.floor(barHeight / (blockHeight + blockGap)));
      for (let block = 0; block < blocks; block++) {
        const y = Math.round(base - (block + 1) * (blockHeight + blockGap));
        const energy = block / Math.max(1, blocks - 1);
        g.fillStyle = energy > 0.80 ? "rgba(247,253,255,0.98)"
          : energy > 0.55 ? "rgba(103,234,255,0.96)"
          : "rgba(171,250,255,0.94)";
        g.fillRect(x, y, barWidth, blockHeight);
      }
    }

    this.drawTrace(height * 0.22, height * (0.035 + this.bands.mid * 0.14), 0);
    this.drawTrace(height * 0.68, height * (0.025 + this.level * 0.22), 173);
  }

  drawScale(width, height) {
    const g = this.ctx;
    g.save();
    g.lineWidth = 1;
    g.strokeStyle = "rgba(118,205,255,0.24)";
    for (let row = 1; row < 8; row++) {
      const y = Math.round(row * height / 8) + 0.5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(width, y); g.stroke();
    }
    const frequencies = [80, 160, 315, 630, 1250, 2500, 5000, 8000];
    const minHz = 70, maxHz = 8000;
    const fontSize = Math.max(9, Math.round(height * 0.027));
    g.font = `${fontSize}px "Courier New", monospace`;
    g.textAlign = "center";
    g.textBaseline = "bottom";
    for (const hz of frequencies) {
      const x = Math.round(Math.log(hz / minHz) / Math.log(maxHz / minHz) * width) + 0.5;
      g.strokeStyle = "rgba(118,205,255,0.20)";
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, height); g.stroke();
      g.fillStyle = "rgba(225,249,255,0.96)";
      const label = hz >= 1000 ? `${(hz / 1000).toFixed(hz % 1000 ? 2 : 0)}K` : String(hz);
      g.fillText(label, Math.min(width - fontSize, Math.max(fontSize, x)), height - 2);
    }
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(225,249,255,0.90)";
    [0, -12, -24, -36].forEach((db, index) => {
      g.fillText(`${db}`, 4, Math.max(fontSize, height * (0.12 + index * 0.20)));
    });
    g.restore();
  }

  drawTrace(center, amplitude, phase) {
    const g = this.ctx;
    const width = this.canvas.width;
    const points = 74;
    g.beginPath();
    for (let i = 0; i < points; i++) {
      const x = Math.round(i / (points - 1) * width) + 0.5;
      const waveIndex = (Math.floor(i / points * this.wave.length) + phase) % this.wave.length;
      const sample = this.analyser && this.mode === "speaking"
        ? (this.wave[waveIndex] - 128) / 128
        : Math.sin(i * 0.42 + phase) * 0.05;
      const frequencyIndex = Math.min(this.freq.length - 1, 2 + Math.floor(i * 0.38));
      const spectral = this.freq[frequencyIndex] / 255 - 0.25;
      const y = Math.round(center + sample * amplitude * 2.4 + spectral * amplitude * 0.72) + 0.5;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.lineJoin = "miter";
    g.lineCap = "square";
    g.strokeStyle = "rgba(90,203,255,0.48)";
    g.lineWidth = Math.max(3, Math.round(this.canvas.height * 0.012));
    g.stroke();
    g.strokeStyle = "rgba(248,253,255,0.98)";
    g.lineWidth = Math.max(1, Math.round(this.canvas.height * 0.005));
    g.stroke();
  }
}

customElements.define("k4000-voice-display", K4000VoiceDisplay);
