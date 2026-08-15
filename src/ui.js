/**
 * The bits around the edges: the opening hint, the mute button, the sleep
 * fade, and the screen wake lock.
 */
export function createUI({ CONFIG, audio }) {
  const hintEl = document.getElementById('hint');
  const hint2El = document.getElementById('hint2');
  const soundEl = document.getElementById('sound');
  const veilEl = document.getElementById('veil');
  const flashEl = document.getElementById('flash');

  let touched = false;
  let dim = 1;                  // 1 = awake, 0 = fully asleep
  let lastInteraction = performance.now();
  let lastFadeUpdate = performance.now();
  let wakeLock = null;
  let hint2Timer = null;
  let movedOnce = false;

  // the walk-through-a-gate fade: up into soft light, swap, back down
  let flash = 0;
  let phase = null;             // 'in' | 'hold' | 'out'
  let held = 0;
  let onSwap = null;

  /* ── hint ──────────────────────────────────────────────────────────── */
  const hintTimer = setTimeout(() => {
    if (!touched) hintEl.classList.add('show');
  }, CONFIG.ui.hintDelayMs);

  /* ── wake lock (optional everywhere, present almost nowhere) ───────── */
  async function requestWakeLock() {
    if (!CONFIG.ui.wakeLock || !('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { /* refused or unsupported — the scene doesn't depend on it */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !wakeLock && touched) requestWakeLock();
  });

  /* ── mute ──────────────────────────────────────────────────────────── */
  function toggleMute() {
    soundEl.classList.toggle('muted', audio.toggleMute());
    lastInteraction = performance.now();
  }
  soundEl.addEventListener('click', toggleMute);
  soundEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMute(); }
  });

  return {
    /** true once the first touch has landed */
    get touched() { return touched; },
    get dim() { return dim; },

    /**
     * Called on every pointer event. The first one starts audio and clears
     * the hint; the rest just keep the sleep timer at bay.
     */
    wake() {
      lastInteraction = performance.now();

      if (!touched) {
        touched = true;
        clearTimeout(hintTimer);
        hintEl.classList.remove('show');
        soundEl.classList.add('show');
        audio.start();
        requestWakeLock();

        // if they still haven't gone anywhere, mention that they can
        hint2Timer = setTimeout(() => {
          if (!movedOnce) hint2El.classList.add('show');
          setTimeout(() => hint2El.classList.remove('show'), CONFIG.ui.hint2VisibleMs);
        }, CONFIG.ui.hint2DelayMs);
      }
    },

    /** called the first time the player actually drifts, to drop the hint */
    noteMovement() {
      if (movedOnce) return;
      movedOnce = true;
      clearTimeout(hint2Timer);
      hint2El.classList.remove('show');
    },

    /** true while a gate transition is running */
    get transitioning() { return phase !== null; },

    /** the colour the world fades through on the way to the next one */
    setFlashColor(hex) {
      flashEl.style.background = `#${hex.toString(16).padStart(6, '0')}`;
    },

    /**
     * Walk through a gate. Fades up into soft light, calls `swap` at the top
     * where nothing is visible, then fades back down into wherever that put
     * us. Ignored if one is already running.
     */
    transition(swap) {
      if (phase) return false;
      phase = 'in';
      held = 0;
      onSwap = swap;
      return true;
    },

    update(_dt, renderer) {
      const now = performance.now();
      const idle = (now - lastInteraction) / 1000;

      // The fade runs on wall-clock time, not the render loop's clamped delta.
      // "Dims after ten minutes, over about a minute" should mean the same
      // thing on a phone struggling at 20fps as on one holding 60 — and a
      // clamped dt would quietly stretch it out on exactly the slow devices
      // where the screen is most likely to be left glowing all night.
      const realDt = Math.min((now - lastFadeUpdate) / 1000, 1);
      lastFadeUpdate = now;

      /* ── the gate fade ────────────────────────────────────────────────
       * Also on wall-clock time. The swap itself happens at the top of the
       * fade, where the screen is full of light and the frame it costs to
       * build a world cannot be seen.
       */
      if (phase === 'in') {
        flash += realDt / CONFIG.ui.gateInSeconds;
        if (flash >= 1) {
          flash = 1;
          phase = 'hold';
          const swap = onSwap; onSwap = null;
          swap?.();
          lastInteraction = now;    // arriving somewhere is not being idle
        }
      } else if (phase === 'hold') {
        held += realDt;
        if (held > CONFIG.ui.gateHoldSeconds) phase = 'out';
      } else if (phase === 'out') {
        flash -= realDt / CONFIG.ui.gateOutSeconds;
        if (flash <= 0) { flash = 0; phase = null; }
      }
      if (flashEl) {
        // eased so it blooms open rather than ramping linearly
        flashEl.style.opacity = (flash * flash * (3 - 2 * flash)).toFixed(3);
      }

      let target = 1;
      if (idle > CONFIG.ui.sleepAfterSeconds) {
        target = 1 - (idle - CONFIG.ui.sleepAfterSeconds) / CONFIG.ui.sleepFadeSeconds;
        target = Math.max(0, Math.min(1, target));
      }

      // waking is quick and gentle; falling asleep takes its time
      const rate = target > dim
        ? 1 / CONFIG.ui.wakeFadeSeconds
        : 1.4 / CONFIG.ui.sleepFadeSeconds;
      dim += Math.max(-rate * realDt, Math.min(rate * realDt, target - dim));
      dim = Math.max(0, Math.min(1, dim));

      // One number carries the fade: OutputPass reads the renderer's exposure
      // every frame, so this dims the lake, the lanterns and the bloom at once.
      renderer.toneMappingExposure = CONFIG.render.exposure * (0.18 + 0.82 * dim);
      // ...and the veil takes it the last of the way to true black
      veilEl.style.opacity = (1 - dim).toFixed(3);

      audio.setDim(dim);
      return dim;
    },
  };
}
