// Ajuste les effets visuels à partir de la cadence réellement rendue.
export function createAdaptiveQuality({
  initial = 'high',
  warmupMs = 10000,
  windowMs = 6000,
  cooldownMs = 12000,
  downgradeBelow = 58,
  upgradeAbove = 64
} = {}) {
  let mode = initial === 'low' ? 'low' : 'high';
  let warmupStarted = null;
  let windowStarted = null;
  let frameCount = 0;
  let changedAt = -Infinity;

  function reset(nextMode = mode, now = 0) {
    mode = nextMode === 'low' ? 'low' : 'high';
    warmupStarted = now;
    windowStarted = null;
    frameCount = 0;
    changedAt = now - cooldownMs;
  }

  function sample(now) {
    if (!Number.isFinite(now)) return null;
    if (warmupStarted === null) warmupStarted = now;
    if (now - warmupStarted < warmupMs) return null;
    if (windowStarted === null) {
      windowStarted = now;
      frameCount = 1;
      return null;
    }

    frameCount++;
    const elapsed = now - windowStarted;
    if (elapsed < windowMs) return null;

    const fps = frameCount * 1000 / elapsed;
    let nextMode = mode;
    if (now - changedAt >= cooldownMs) {
      if (mode === 'high' && fps < downgradeBelow) nextMode = 'low';
      else if (mode === 'low' && fps > upgradeAbove) nextMode = 'high';
    }

    windowStarted = now;
    frameCount = 0;
    const changed = nextMode !== mode;
    if (changed) {
      mode = nextMode;
      changedAt = now;
    }
    return {mode, fps, changed};
  }

  return {
    get mode() { return mode; },
    reset,
    sample
  };
}
