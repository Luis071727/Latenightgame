/**
 * The bits around the edges: the title, the opening hints, the corner
 * controls, the settings panel, the sleep fade, and the screen wake lock.
 *
 * The philosophy is that the world is the interface and everything here is
 * margin. The title exists because arriving somewhere deserves a threshold;
 * the settings exist because volume and motion are the player's to decide;
 * everything else fades itself away as soon as it has been understood.
 */
export function createUI({ CONFIG, audio, settings, onMotionChange, onQualityChange, onPaceChange, onReset }) {
  const hintEl = document.getElementById('hint');
  const hint2El = document.getElementById('hint2');
  const worldNameEl = document.getElementById('worldname');
  const stepEl = document.getElementById('step');
  const memoryEl = document.getElementById('memory');
  const soundEl = document.getElementById('sound');
  const gearEl = document.getElementById('gear');
  const panelEl = document.getElementById('panel');
  const panelCardEl = document.getElementById('panel-card');
  const titleEl = document.getElementById('title');
  const beginEl = document.getElementById('begin');
  const tapmarkEl = document.getElementById('tapmark');
  const veilEl = document.getElementById('veil');
  const flashEl = document.getElementById('flash');
  const beatEl = document.getElementById('beat');
  const beat1El = beatEl?.querySelector('.b1');
  const beat2El = beatEl?.querySelector('.b2');

  let began = false;
  let dim = 1;                  // 1 = awake, 0 = fully asleep
  let lastInteraction = performance.now();
  let lastFadeUpdate = performance.now();
  let wakeLock = null;
  let hintTimer = null;
  let hint2Timer = null;
  let movedOnce = false;
  let worldNameTimer = null;

  /* Found things queue rather than interrupt each other: taking the last
     piece of a set can produce a discovery, a set completion and an unlock in
     the same instant, and three notices fighting over one line of the screen
     is exactly the noise this game is trying not to make. */
  const memoryQueue = [];
  let memoryTimer = null;

  function nextMemory() {
    const m = memoryQueue.shift();
    if (!m) { memoryTimer = null; return; }

    memoryEl.querySelector('.kind').textContent = m.kind;
    memoryEl.querySelector('.name').textContent = m.name;
    memoryEl.querySelector('.note').textContent = m.note || '';
    memoryEl.className = m.rarity || '';
    // reflow so the class change and the show land as two separate states
    void memoryEl.offsetWidth;
    memoryEl.classList.add('show');

    memoryTimer = setTimeout(() => {
      memoryEl.classList.remove('show');
      memoryTimer = setTimeout(nextMemory, 1700);
    }, 4600);
  }

  // the walk-through-a-gate fade: up into soft light, swap, back down
  let flash = 0;
  let phase = null;             // 'in' | 'hold' | 'out'
  let held = 0;
  let onSwap = null;

  /* ── wake lock (optional everywhere, present almost nowhere) ───────── */
  async function requestWakeLock() {
    if (!CONFIG.ui.wakeLock || !('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { /* refused or unsupported — the scene doesn't depend on it */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !wakeLock && began) requestWakeLock();
  });

  /* ── mute, from either the corner button or the panel toggle ───────── */
  const setSoundEl = document.getElementById('set-sound');

  function reflectMute() {
    soundEl.classList.toggle('muted', audio.muted);
    setSoundEl.setAttribute('aria-pressed', String(!audio.muted));
  }
  function toggleMute() {
    audio.toggleMute();
    settings.muted = audio.muted;
    reflectMute();
    touch();
    saveSoon();
  }
  soundEl.addEventListener('click', toggleMute);
  soundEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMute(); }
  });

  /* ── the settings panel ────────────────────────────────────────────── */
  const musicEl = document.getElementById('set-music');
  const ambEl = document.getElementById('set-amb');
  const motionEl = document.getElementById('set-motion');
  const qualityEl = document.getElementById('set-quality');
  const paceEl = document.getElementById('set-pace');
  const resetEl = document.getElementById('set-reset');
  const archiveEl = document.getElementById('set-archive');
  const RESET_LABEL = resetEl.textContent;

  let saveTimer = null;
  let onSettingsSave = null;    // installed by main once persistence is up
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => onSettingsSave?.(settings), 400);
  }

  function reflectSettings() {
    reflectMute();
    musicEl.value = String(settings.musicVolume);
    ambEl.value = String(settings.ambienceVolume);
    const reduced = settings.reducedMotion
      ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
    motionEl.setAttribute('aria-pressed', String(reduced));
    for (const b of qualityEl.querySelectorAll('button')) {
      b.classList.toggle('on', b.dataset.q === settings.quality);
    }
    for (const b of paceEl.querySelectorAll('button')) {
      b.classList.toggle('on', b.dataset.p === settings.pace);
    }
  }

  function openPanel() {
    reflectSettings();
    panelEl.classList.add('open');
    panelEl.setAttribute('aria-hidden', 'false');
    touch();
  }
  function closePanel() {
    panelEl.classList.remove('open');
    panelEl.setAttribute('aria-hidden', 'true');
    resetEl.classList.remove('confirm');
    resetEl.textContent = RESET_LABEL;
    touch();
  }

  gearEl.addEventListener('click', () => {
    if (panelEl.classList.contains('open')) closePanel(); else openPanel();
  });
  gearEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPanel(); }
  });
  // a tap on the dimmed world behind the card puts it away
  panelEl.addEventListener('pointerdown', (e) => {
    if (!panelCardEl.contains(e.target)) closePanel();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panelEl.classList.contains('open')) closePanel();
  });

  setSoundEl.addEventListener('click', toggleMute);

  musicEl.addEventListener('input', () => {
    settings.musicVolume = parseFloat(musicEl.value);
    audio.setMusicVolume(settings.musicVolume);
    touch(); saveSoon();
  });
  ambEl.addEventListener('input', () => {
    settings.ambienceVolume = parseFloat(ambEl.value);
    audio.setAmbienceVolume(settings.ambienceVolume);
    touch(); saveSoon();
  });

  motionEl.addEventListener('click', () => {
    const now = !(motionEl.getAttribute('aria-pressed') === 'true');
    settings.reducedMotion = now;
    motionEl.setAttribute('aria-pressed', String(now));
    onMotionChange?.(now);
    touch(); saveSoon();
  });

  qualityEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-q]');
    if (!b || b.dataset.q === settings.quality) return;
    settings.quality = b.dataset.q;
    reflectSettings();
    onQualityChange?.(settings.quality);
    touch(); saveSoon();
  });

  paceEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-p]');
    if (!b || b.dataset.p === settings.pace) return;
    settings.pace = b.dataset.p;
    reflectSettings();
    onPaceChange?.(settings.pace);
    touch(); saveSoon();
  });

  // resetting a journey asks twice, then quietly forgets everything
  let resetArm = null;
  resetEl.addEventListener('click', () => {
    touch();
    if (resetEl.classList.contains('confirm')) {
      clearTimeout(resetArm);
      resetEl.classList.remove('confirm');
      resetEl.textContent = RESET_LABEL;
      closePanel();
      onReset?.();
      return;
    }
    resetEl.classList.add('confirm');
    resetEl.textContent = 'touch again to let it go';
    resetArm = setTimeout(() => {
      resetEl.classList.remove('confirm');
      resetEl.textContent = RESET_LABEL;
    }, 4000);
  });

  /* ── the title ─────────────────────────────────────────────────────── */
  let onBegin = null;
  beginEl.addEventListener('click', () => {
    if (began) return;
    began = true;
    lastInteraction = performance.now();
    titleEl.classList.add('gone');

    // the begin tap is the user gesture the browser wants for audio
    audio.start();
    requestWakeLock();
    soundEl.classList.add('show');
    gearEl.classList.add('show');
    reflectMute();

    // teach by waiting: the movement hint only appears if they haven't moved
    hintTimer = setTimeout(() => {
      if (!movedOnce) hintEl.classList.add('show');
    }, CONFIG.ui.hintDelayMs);
    hint2Timer = setTimeout(() => {
      if (!movedOnce) hint2El.classList.add('show');
      setTimeout(() => hint2El.classList.remove('show'), CONFIG.ui.hint2VisibleMs);
    }, CONFIG.ui.hint2DelayMs);

    onBegin?.();
  });

  /** anything at all happened — keep the sleep fade at bay */
  function touch() {
    lastInteraction = performance.now();
  }

  return {
    /** true once "begin wandering" has been pressed */
    get began() { return began; },
    get dim() { return dim; },

    /** main installs what should happen the moment the title lifts */
    set onBegin(fn) { onBegin = fn; },
    /** ...and how the settings should be written down */
    set onSettingsSave(fn) { onSettingsSave = fn; },

    /**
     * Called on every pointer event on the canvas. Before the title has been
     * dismissed it does nothing; after, it keeps the sleep timer at bay.
     */
    wake() {
      if (!began) return;
      touch();
    },

    /** called the first time the player actually drifts, to drop the hints */
    noteMovement() {
      if (movedOnce) return;
      movedOnce = true;
      clearTimeout(hintTimer);
      clearTimeout(hint2Timer);
      hintEl.classList.remove('show');
      hint2El.classList.remove('show');
    },

    /** a soft breath of light where a tap landed */
    tapAt(x, y) {
      if (!tapmarkEl) return;
      tapmarkEl.style.transform = `translate(${x}px, ${y}px)`;
      // restart the animation even if the last one is still running
      tapmarkEl.classList.remove('ripple');
      void tapmarkEl.offsetWidth;
      tapmarkEl.classList.add('ripple');
    },

    /**
     * Name the world that has just come into view, then let the name go.
     * @param delayMs held back so the name arrives as the gate-light clears
     */
    showWorldName(name, delayMs = 0) {
      clearTimeout(worldNameTimer);
      worldNameEl.classList.remove('show');
      worldNameTimer = setTimeout(() => {
        worldNameEl.textContent = name;
        worldNameEl.classList.add('show');
        worldNameTimer = setTimeout(() => worldNameEl.classList.remove('show'), 5200);
      }, delayMs);
    },

    /** a quiet passing line — "a gate has opened" — in the world-name voice */
    announce(text) {
      this.showWorldName(text, 0);
    },

    /**
     * Something was found, or unlocked. Says what it was and goes away.
     * Nothing pauses, nothing waits to be dismissed, nothing has to be
     * acknowledged — a reward that interrupts the wandering is not a reward.
     *
     * Queued rather than replaced, because completing a set can land three of
     * these at once and they must not overwrite each other mid-sentence.
     */
    showMemory(kind, name, note, rarity = '') {
      memoryQueue.push({ kind, name, note, rarity });
      if (!memoryTimer) nextMemory();
    },

    /** offer or withdraw the "step through" prompt by an open gate */
    setStepPrompt(visible) {
      stepEl.classList.toggle('show', !!visible);
    },

    /**
     * The dream saying something, low in the frame.
     *
     * Deliberately dumber than `showMemory`: no queue, no timer, no rarity.
     * story.js owns when a passage appears, how long it stays and what puts it
     * away, because all three of those are decisions about the *narrative* and
     * they belong next to the writing rather than in here.
     *
     * @param lines one or two short strings
     */
    showBeat(lines) {
      if (!beatEl) return;
      beat1El.textContent = lines[0] || '';
      beat2El.textContent = lines[1] || '';
      beatEl.classList.add('show');
    },

    hideBeat() {
      beatEl?.classList.remove('show');
    },

    /** true while the settings card is up — nothing should narrate over it */
    get panelOpen() { return panelEl.classList.contains('open'); },

    /** main installs what opening the archive does, once the journal exists */
    set onArchive(fn) {
      archiveEl.addEventListener('click', () => { closePanel(); fn?.(); });
    },

    /** the archive is a settled place; the sleep timer should not run there */
    keepAwake() { touch(); },

    /** main installs what stepping through actually does */
    set onStep(fn) {
      stepEl.addEventListener('click', () => { touch(); fn?.(); });
      stepEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); touch(); fn?.(); }
      });
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

      // the sleep timer only starts counting once the title has lifted
      let target = 1;
      if (began && idle > CONFIG.ui.sleepAfterSeconds) {
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
