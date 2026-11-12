(() => {
  'use strict';
  const soundButton = document.getElementById('fx-sound');
  const motionButton = document.getElementById('fx-motion');
  const progress = document.querySelector('.fx-progress');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let sound = false, context, lastHover = 0, frame = 0;
  function setMotion(on) {
    document.body.classList.toggle('fx-motion', on && !reduced.matches);
    motionButton.setAttribute('aria-pressed', String(on && !reduced.matches));
    motionButton.textContent = on && !reduced.matches ? 'Animations : actives' : 'Animations : arrêtées';
  }
  setMotion(!reduced.matches);
  reduced.addEventListener('change', () => setMotion(!reduced.matches));
  async function tone(kind) {
    if (!sound || document.hidden) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw Error('audio unavailable');
      if (!context) context = new Audio();
      if (context.state !== 'running') await context.resume();
      if (!sound || context.state !== 'running') return;
      const now = context.currentTime;
      const length = kind === 'boot' ? 0.42 : kind === 'click' ? 0.13 : 0.045;
      const osc = context.createOscillator(), gain = context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(kind === 'boot' ? 210 : kind === 'click' ? 740 : 1050, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'boot' ? 920 : 380, now + length);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(kind === 'hover' ? 0.018 : 0.035, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
      osc.connect(gain); gain.connect(context.destination);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      osc.start(now); osc.stop(now + length + 0.02);
    } catch {
      sound = false;
      soundButton.setAttribute('aria-pressed', 'false');
      soundButton.textContent = 'SFX indisponibles';
    }
  }
  soundButton.addEventListener('click', () => {
    sound = !sound;
    soundButton.setAttribute('aria-pressed', String(sound));
    soundButton.textContent = sound ? 'SFX : activés' : 'SFX : coupés';
    if (sound) void tone('boot');
    else if (context) void context.suspend();
  });
  motionButton.addEventListener('click', () => setMotion(!document.body.classList.contains('fx-motion')));
  document.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse') return;
    const target = event.target.closest('a, summary, button');
    if (!target || target.contains(event.relatedTarget) || performance.now() - lastHover < 150) return;
    lastHover = performance.now();
    void tone('hover');
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('a, summary, button');
    if (!target || target === soundButton) return;
    void tone('click');
    if (!reduced.matches && document.body.classList.contains('fx-motion')) {
      target.classList.add('fx-click');
      setTimeout(() => target.classList.remove('fx-click'), 220);
    }
  });
  function updateProgress() {
    frame = 0;
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0})`;
  }
  function scheduleProgress() { if (!frame) frame = requestAnimationFrame(updateProgress); }
  addEventListener('scroll', scheduleProgress, { passive: true });
  addEventListener('resize', scheduleProgress, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && context) void context.suspend(); });
  updateProgress();
})();
