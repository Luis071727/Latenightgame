/**
 * Ambient sound, synthesised on the fly. Nothing is downloaded, which keeps
 * the scene working offline.
 *
 * Three parts. A drone that is always there, a wash of filtered noise under
 * it, and a stack of *layers* that start silent — one is brought up each time
 * a structure comes awake, so a world that has been explored is audibly
 * fuller than one that has just been arrived in. The layers are built once and
 * retuned when the world changes rather than created and destroyed, because
 * every oscillator start and stop is a chance for a click, and a click is the
 * one thing that could wake someone who is nearly asleep.
 *
 * It only starts on the first touch (browsers block audio before a gesture),
 * fades in over several seconds, and has no transients anywhere: every gain
 * change is a long ramp.
 */
export function createAudio(CONFIG) {
  const A = CONFIG.audio;

  let ctx = null;
  let master = null;
  let musicBus = null;       // the drone and the awakening layers
  let ambienceBus = null;    // the noise wash
  let padFilter = null;
  let muted = false;
  let dim = 1;
  let musicVolume = 1;
  let ambienceVolume = 1;

  const layers = [];         // { oscA, oscB, gain }
  let voicing = A.chord;     // the semitone offsets the current world uses
  let root = A.root;

  // How many layers *should* be sounding. Counted whether or not there is an
  // audio context yet: the first structures are often woken before the first
  // touch, and a world that was explored in silence has to come up already
  // full when the sound is finally allowed to start.
  let lit = 0;

  function start() {
    if (ctx || !A.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    try {
      ctx = new AC();
      ctx.resume?.();                     // Safari can start suspended

      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      master.gain.linearRampToValueAtTime(
        muted ? 0 : A.volume, ctx.currentTime + A.fadeInSeconds);

      // Two buses under the master, so the settings panel can weigh the tonal
      // half against the textural half without touching either synth.
      musicBus = ctx.createGain();
      musicBus.gain.value = musicVolume;
      musicBus.connect(master);
      ambienceBus = ctx.createGain();
      ambienceBus.gain.value = ambienceVolume;
      ambienceBus.connect(master);

      /* ── the drone: a few detuned voices under a soft lowpass ── */
      const padGain = ctx.createGain();
      padGain.gain.value = 0.5;
      padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = A.brightness;
      padFilter.Q.value = 0.4;
      padGain.connect(padFilter).connect(musicBus);

      for (let i = 0; i < A.droneVoices; i++) {
        const osc = ctx.createOscillator();
        osc.type = i % 2 ? 'sine' : 'triangle';
        osc.frequency.value = root * (i === 0 ? 1 : i === 1 ? 1.5 : 2);
        osc.detune.value = (Math.random() - 0.5) * 9;

        const g = ctx.createGain();
        g.gain.value = 0.16 / (i + 1);

        // each voice breathes on its own slow LFO, so the drone never sits still
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.035 + Math.random() * 0.05;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = g.gain.value * 0.7;
        lfo.connect(lfoGain).connect(g.gain);

        osc.connect(g).connect(padGain);
        osc.start(); lfo.start();
      }

      /* ── the layers, silent until something wakes up ── */
      for (let i = 0; i < A.layers; i++) {
        const gain = ctx.createGain();
        gain.gain.value = 0;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = A.brightness * 1.4;
        filter.Q.value = 0.5;
        gain.connect(filter).connect(musicBus);

        // Two oscillators a few cents apart. One is a tone; two beating
        // against each other is a pad, and it costs one more oscillator.
        const oscA = ctx.createOscillator();
        const oscB = ctx.createOscillator();
        oscA.type = 'sine';
        oscB.type = 'triangle';
        oscB.detune.value = 7 + Math.random() * 6;

        // ...and a slow tremolo so a layer that has been up for ten minutes
        // is still moving
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.02 + Math.random() * 0.04;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.35;
        const trem = ctx.createGain();
        trem.gain.value = 0.65;
        lfo.connect(lfoGain).connect(trem.gain);

        oscA.connect(trem);
        oscB.connect(trem);
        trem.connect(gain);

        oscA.start(); oscB.start(); lfo.start();
        layers.push({ oscA, oscB, gain });
      }
      retune();
      applyLayers();          // catch up on anything woken before this moment

      /* ── the wash: looping pink-ish noise, filter opening and closing ── */
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.0555;
        b1 = 0.985 * b1 + w * 0.0750;
        b2 = 0.950 * b2 + w * 0.1538;
        d[i] = (b0 + b1 + b2 + w * 0.02) * 0.28;
      }
      // crossfade the seam so there is no click every four seconds
      const fade = Math.floor(ctx.sampleRate * 0.25);
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        d[i] = d[i] * k + d[len - fade + i] * (1 - k);
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;

      const nf = ctx.createBiquadFilter();
      nf.type = 'lowpass';
      nf.frequency.value = 380;
      nf.Q.value = 0.6;

      const ng = ctx.createGain();
      ng.gain.value = 0.30;

      const swell = ctx.createOscillator();
      swell.frequency.value = 0.045;
      const swellGain = ctx.createGain();
      swellGain.gain.value = 190;
      swell.connect(swellGain).connect(nf.frequency);

      noise.connect(nf).connect(ng).connect(ambienceBus);
      noise.start(); swell.start();
    } catch {
      ctx = null;          // audio is a nicety; the scene carries on without it
    }
  }

  /** Slide every layer onto the current world's voicing, without restarting. */
  function retune() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < layers.length; i++) {
      const semis = voicing[i % voicing.length];
      // octave up every time the voicing wraps, so more layers means a wider
      // chord rather than the same notes doubled
      const octave = Math.floor(i / voicing.length);
      const f = root * Math.pow(2, semis / 12 + octave);
      layers[i].oscA.frequency.setTargetAtTime(f, t, A.glideSeconds);
      layers[i].oscB.frequency.setTargetAtTime(f, t, A.glideSeconds);
    }
    if (padFilter) padFilter.frequency.setTargetAtTime(A.brightness, t, A.glideSeconds);
  }

  /**
   * Bring every layer to where the world says it should be. Layers get quieter
   * the higher up the stack they are, so twenty awake structures is still a
   * pad and not a wall.
   */
  function applyLayers(fade = A.layerFadeSeconds) {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < layers.length; i++) {
      const level = i < lit ? A.layerGain / (1 + (i + 1) * 0.35) : 0;
      layers[i].gain.gain.setTargetAtTime(level, t, fade);
    }
  }

  function applyGain(timeConstant = 1.5) {
    if (!ctx || !master) return;
    const target = muted ? 0 : A.volume * (0.15 + 0.85 * dim);
    master.gain.setTargetAtTime(target, ctx.currentTime, timeConstant);
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend?.(); else ctx.resume?.();
  });

  return {
    start,
    get started() { return !!ctx; },
    get muted() { return muted; },
    get layers() { return lit; },

    toggleMute() { muted = !muted; applyGain(1.2); return muted; },

    /** set mute outright, e.g. restoring a saved preference */
    setMuted(v) {
      if (muted === !!v) return;
      muted = !!v;
      applyGain(1.2);
    },

    /** 0..1 — the drone and the awakening layers, together */
    setMusicVolume(v) {
      musicVolume = Math.max(0, Math.min(1, v));
      if (ctx && musicBus) {
        musicBus.gain.setTargetAtTime(musicVolume, ctx.currentTime, 0.4);
      }
    },

    /** 0..1 — the noise wash under everything */
    setAmbienceVolume(v) {
      ambienceVolume = Math.max(0, Math.min(1, v));
      if (ctx && ambienceBus) {
        ambienceBus.gain.setTargetAtTime(ambienceVolume, ctx.currentTime, 0.4);
      }
    },

    /** follows the sleep fade so the sound goes down with the light */
    setDim(v) {
      if (Math.abs(v - dim) < 0.01) return;
      dim = v;
      applyGain();
    },

    /**
     * Arrive somewhere new: take the world's root and voicing, glide onto it,
     * and put every layer back to silent.
     * @param a a world's `audio` block
     */
    setWorld(a) {
      root = a.root;
      voicing = a.scale;
      A.brightness = a.brightness;
      lit = 0;
      retune();
      applyLayers(A.layerFadeSeconds * 0.6);
    },

    /**
     * One more thing in the world is awake. Brings up the next silent layer;
     * once they are all up, further awakenings are heard as the world simply
     * being full rather than as more notes.
     */
    addLayer() {
      if (lit >= A.layers) return false;
      lit++;
      applyLayers();
      return true;
    },
  };
}
