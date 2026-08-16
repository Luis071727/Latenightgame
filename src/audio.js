/**
 * Ambient sound, synthesised on the fly. Nothing is downloaded, which keeps
 * the scene working offline.
 *
 * Four parts. A drone that is always there, a wash of filtered noise under it,
 * a stack of *layers* that start silent — one is brought up each time a
 * structure comes awake, so a world that has been explored is audibly fuller
 * than one that has just been arrived in — and bells, which are the only thing
 * here that happens rather than continues.
 *
 * Everything continuous is built once and retuned rather than created and
 * destroyed, because every oscillator start and stop is a chance for a click,
 * and a click is the one thing that could wake someone who is nearly asleep.
 * A bell is the exception and has to be: it begins at silence, is stopped only
 * long after its tail has decayed past hearing, and so has no edge to hear
 * either.
 *
 * It only starts on the first touch (browsers block audio before a gesture),
 * fades in over several seconds, and has no transients anywhere: every gain
 * change is a long ramp.
 *
 * ── what makes it feel like a dream rather than a pad ──────────────────────
 *
 * Three things, all of them slow enough that you would have to be listening
 * for them to catch any one happening:
 *
 *   the drift    every `driftSeconds` the chord re-voices — each layer moves
 *                to the next degree of the world's own scale, glided over
 *                `driftGlideSeconds`. The pitches never leave the scale, so it
 *                cannot go anywhere sour; what changes is which note is at the
 *                bottom of the chord, and over ten minutes it will have been
 *                through several arrangements of itself without ever having
 *                *changed* in a way you could point at.
 *
 *   the width    every voice sits somewhere across the stereo field and moves
 *                across it on its own slow cycle, minutes long. Nothing pans
 *                far and nothing pans quickly. The effect is not that sounds
 *                move, it is that the sound stops having a single location.
 *
 *   the settle   as the sleep fade comes down, so does the brightness of the
 *                pad. A thing you are falling asleep to should get darker as
 *                you do, not merely quieter.
 */
export function createAudio(CONFIG) {
  const A = CONFIG.audio;

  let ctx = null;
  let master = null;
  let musicBus = null;       // the drone and the awakening layers
  let ambienceBus = null;    // the noise wash
  let chimeBus = null;       // the bells, so their level is its own knob
  let padFilter = null;
  let muted = false;
  let dim = 1;
  let musicVolume = 1;
  let ambienceVolume = 1;

  const layers = [];         // { oscA, oscB, gain }
  let voicing = A.chord;     // the semitone offsets the current world uses
  let root = A.root;
  /* The live timbre. Held here rather than written back into CONFIG — the old
     code assigned the world's brightness onto `A.brightness`, which meant the
     configured fallback was gone the moment the first world loaded. */
  let brightness = A.brightness;
  let spread = A.spread;
  let shimmer = A.shimmer;

  /* Where the chord currently sits. One integer: how many degrees of the
     world's scale every layer has been rotated by. */
  let drift = 0;
  let driftTimer = null;

  // How many layers *should* be sounding. Counted whether or not there is an
  // audio context yet: the first structures are often woken before the first
  // touch, and a world that was explored in silence has to come up already
  // full when the sound is finally allowed to start.
  let lit = 0;

  /**
   * Put a voice somewhere across the stereo field, and let it wander.
   *
   * `place` is -1..1, scaled by `CONFIG.audio.width` so the whole thing can be
   * collapsed to mono from one number. The wander is a sine an entire minute or
   * more long at a fraction of the same width — enough that the sound has no
   * single location, never enough to be heard as movement.
   *
   * Falls back to a plain connection where StereoPannerNode is missing, which
   * is the one thing here that older Safari does not have. Width is a nicety;
   * losing it silently is much better than losing the pad.
   */
  function pan(from, to, place, cycleSeconds) {
    if (!ctx.createStereoPanner || A.width <= 0) { from.connect(to); return null; }
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, place * A.width));

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1 / Math.max(20, cycleSeconds);
    const depth = ctx.createGain();
    depth.gain.value = A.width * 0.35;
    lfo.connect(depth).connect(p.pan);
    // an oscillator has no phase to set, so stagger them by starting each one
    // a random part of its own cycle late; until then the voice simply sits
    // where it was placed, which is where it was going to be anyway
    lfo.start(ctx.currentTime + Math.random() * cycleSeconds);

    from.connect(p).connect(to);
    return p;
  }

  function start() {
    if (ctx || !A.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    try {
      ctx = new AC();
      // Safari can start suspended. It returns a promise, and a rejected one
      // that nobody is holding is an unhandled rejection in the console.
      ctx.resume?.().catch?.(() => {});

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
      chimeBus = ctx.createGain();
      chimeBus.gain.value = A.chimeGain;
      /* Every bell goes through one soft lowpass on its way out. Bell partials
         are the highest-pitched thing in the whole scene and the only content
         anywhere near the top of hearing; unfiltered, a rare find had a
         sixteen-kilohertz component on it, which is the definition of sharp
         and precisely what this is not for. */
      const chimeTone = ctx.createBiquadFilter();
      chimeTone.type = 'lowpass';
      chimeTone.frequency.value = A.chimeBrightness;
      chimeTone.Q.value = 0.5;
      chimeBus.connect(chimeTone).connect(master);

      /* ── the drone: a few detuned voices under a soft lowpass ── */
      const padGain = ctx.createGain();
      padGain.gain.value = 0.5;
      padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = brightness;
      padFilter.Q.value = 0.4;
      padGain.connect(padFilter).connect(musicBus);

      for (let i = 0; i < A.droneVoices; i++) {
        const osc = ctx.createOscillator();
        osc.type = i % 2 ? 'sine' : 'triangle';
        osc.frequency.value = root * (i === 0 ? 1 : i === 1 ? 1.5 : 2);
        // the world's own chorus width. Two voices a few cents apart beat
        // against each other slowly, which is most of what makes a synthesised
        // pad sound like it is made of more than one thing
        osc.detune.value = (Math.random() - 0.5) * spread * 2;

        const g = ctx.createGain();
        g.gain.value = 0.16 / (i + 1);

        // each voice breathes on its own slow LFO, so the drone never sits still
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.035 + Math.random() * 0.05;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = g.gain.value * 0.7;
        lfo.connect(lfoGain).connect(g.gain);

        // ...and sits somewhere of its own across the stereo field, wandering
        // slowly. The voices are given different cycle lengths so they never
        // sweep together, which would read as the whole sound moving
        osc.connect(g);
        pan(g, padGain, (i % 2 ? 1 : -1) * 0.8, A.panSeconds * (1 + i * 0.37));
        osc.start(); lfo.start();
      }

      /* ── the layers, silent until something wakes up ── */
      for (let i = 0; i < A.layers; i++) {
        const gain = ctx.createGain();
        gain.gain.value = 0;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = brightness * 1.4;
        filter.Q.value = 0.5;
        // each layer takes its own place across the field, alternating sides
        // and spreading further out the higher up the stack it is
        pan(gain, filter, (i % 2 ? 1 : -1) * (0.35 + i * 0.11),
          A.panSeconds * (0.8 + i * 0.23));
        filter.connect(musicBus);

        // Two oscillators a few cents apart. One is a tone; two beating
        // against each other is a pad, and it costs one more oscillator.
        const oscA = ctx.createOscillator();
        const oscB = ctx.createOscillator();
        oscA.type = 'sine';
        oscB.type = 'triangle';
        oscB.detune.value = spread + Math.random() * spread * 0.8;

        // how much of the brighter of the two voices is present — the world's
        // own timbre, the difference between the meadow and the grove
        const shine = ctx.createGain();
        shine.gain.value = shimmer;
        oscB.connect(shine);

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
        shine.connect(trem);
        trem.connect(gain);

        oscA.start(); oscB.start(); lfo.start();
        layers.push({ oscA, oscB, gain, filter, shine });
      }
      retune();
      startDrift();
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

  /** the pitch a layer should be sounding, given where the chord has drifted */
  function noteFor(i) {
    const n = voicing.length;
    // The drift rotates which degree of the scale each layer takes. The octave
    // stays with the layer rather than following the degree, so the chord
    // re-voices in place instead of climbing away over the course of an hour.
    const semis = voicing[(((i + drift) % n) + n) % n];
    const octave = Math.floor(i / n);
    return root * Math.pow(2, semis / 12 + octave);
  }

  /**
   * Slide every layer onto the current voicing, without restarting anything.
   * @param glide seconds; long for a drift, shorter for arriving somewhere new
   */
  function retune(glide = A.glideSeconds) {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < layers.length; i++) {
      const f = noteFor(i);
      layers[i].oscA.frequency.setTargetAtTime(f, t, glide);
      layers[i].oscB.frequency.setTargetAtTime(f, t, glide);
      layers[i].filter.frequency.setTargetAtTime(brightness * 1.4, t, glide);
      layers[i].shine.gain.setTargetAtTime(shimmer, t, glide);
    }
    settle();
  }

  /**
   * The chord, moving on. Once every `driftSeconds`, and taking
   * `driftGlideSeconds` to arrive — which is long enough that there is no
   * moment at which it happened, only a sense on coming back to it that the
   * music is not where you left it.
   *
   * Every pitch comes from the world's own scale, so a drift cannot land
   * anywhere sour however many times it has run.
   */
  function startDrift() {
    clearInterval(driftTimer);
    if (!A.driftSeconds) return;
    driftTimer = setInterval(() => {
      if (!ctx || ctx.state === 'suspended') return;
      drift++;
      retune(A.driftGlideSeconds);
    }, A.driftSeconds * 1000);
  }

  /**
   * How bright the pad is allowed to be, which follows the sleep fade.
   * Something you are falling asleep to should get darker as you do rather
   * than only quieter — a pad at full brightness at one tenth the volume
   * still sounds like it wants your attention.
   */
  function settle() {
    if (!ctx || !padFilter) return;
    const k = A.idleSettle + (1 - A.idleSettle) * dim;
    padFilter.frequency.setTargetAtTime(brightness * k, ctx.currentTime, 3.0);
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

  /* ═══════════════════════════════════════════════════════════════════════
     bells
     ═══════════════════════════════════════════════════════════════════════

     The one thing in here that is an event. Everything else is a continuous
     thing being nudged; a bell is built, rung and thrown away.

     It is safe to start and stop oscillators for this — the rule everywhere
     else in this file — precisely because of how it is enveloped. The gain
     begins at exactly zero, is ramped up over `attack` rather than switched
     on, decays exponentially, and the oscillators are stopped a long way past
     the point where the tail is below hearing. There is no discontinuity at
     either end for a speaker to click on.

     Consonance is not left to chance: the pitch is a degree of the same scale
     the pad is currently voicing, so a bell can only ever land inside the
     chord that is already sounding.
     ═══════════════════════════════════════════════════════════════════════ */

  /* A bell's partials. Real bells are inharmonic and clangy, which is the
     opposite of what this is for — these are the gentle ones, an octave and
     a twelfth, quiet and quieter. */
  const PARTIALS = [[1, 1], [2, 0.34], [3, 0.13], [4.2, 0.05]];

  /**
   * Ring one.
   * @param level 0..4, from RARITY.chime — how high, how bright, how long
   */
  function ring(level) {
    if (!ctx || !chimeBus || muted) return;
    const t = ctx.currentTime + 0.02;

    /* Which note. Higher up the rarity ladder reaches further up the scale
       and up an octave or two, so a mythic is audibly further from the drone
       than a common — while still being a note the drone is already playing. */
    const n = voicing.length;
    const step = Math.min(n - 1, Math.round(level * (n - 1) / 4));
    const semis = voicing[(((step + drift) % n) + n) % n];
    /* Kept inside a range a bell actually lives in — roughly 500 Hz to 2 kHz.
       Rarity is told by how long it rings and how present it is, not by how
       high: pitch climbing with rarity put a mythic up at eight kilohertz,
       which is a whistle. */
    const octave = Math.min(3, 2 + Math.floor(level / 3)) + (Math.random() < 0.25 ? 1 : 0);
    const f = root * Math.pow(2, semis / 12 + octave);

    const tail = A.chimeSeconds * (0.7 + level * 0.12);
    const out = ctx.createGain();
    out.gain.value = 0;
    // the softest thing on the ladder is genuinely soft, not merely smaller
    const peak = 0.18 + level * 0.055;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(peak, t + A.chimeAttack);
    out.gain.setTargetAtTime(0, t + A.chimeAttack, tail * 0.28);

    // somewhere of its own across the field, so two bells close together do
    // not land in the same place
    const place = (Math.random() * 2 - 1) * 0.7;
    if (ctx.createStereoPanner && A.width > 0) {
      const p = ctx.createStereoPanner();
      p.pan.value = place * A.width;
      out.connect(p).connect(chimeBus);
    } else {
      out.connect(chimeBus);
    }

    const oscs = [];
    for (const [ratio, amp] of PARTIALS) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * ratio;
      o.detune.value = (Math.random() - 0.5) * spread;
      const g = ctx.createGain();
      g.gain.value = amp;
      // the upper partials of a bell die away first, which is most of why a
      // bell sounds like it is fading rather than merely getting quieter
      g.gain.setTargetAtTime(0, t + A.chimeAttack, tail * (0.28 / ratio));
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + tail + 2.5);
      oscs.push(o);
    }
    // let go of the graph once it has finished sounding
    oscs[0].onended = () => { try { out.disconnect(); } catch { /* gone */ } };
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
      settle();
    },

    /**
     * Arrive somewhere new: take the world's root, voicing and timbre, glide
     * onto them, and put every layer back to silent.
     *
     * The drift starts again from where the world put it rather than carrying
     * on from wherever the last place had wandered to — arriving somewhere
     * should sound like that place, not like the tail of the one before it.
     *
     * @param a a world's `audio` block
     */
    setWorld(a) {
      root = a.root;
      voicing = a.scale;
      brightness = a.brightness ?? A.brightness;
      spread = a.spread ?? A.spread;
      shimmer = a.shimmer ?? A.shimmer;
      drift = 0;
      lit = 0;
      retune();
      applyLayers(A.layerFadeSeconds * 0.6);
      startDrift();
    },

    /**
     * One more thing in the world is awake. Brings up the next silent layer;
     * once they are all up, further awakenings are heard as the world simply
     * being full rather than as more notes.
     *
     * @param withChime ring the softest bell there is as it arrives. Off by
     *   default on purpose: this is also called in batches — restoring a saved
     *   visit brings up everything that was already awake — and seven bells at
     *   once is the opposite of what any of this is for. Only a structure
     *   waking under the wanderer's own feet asks for it.
     */
    addLayer(withChime = false) {
      if (lit >= A.layers) return false;
      lit++;
      applyLayers();
      if (withChime) ring(0);
      return true;
    },

    /**
     * Something was found. `level` is RARITY.chime, 0..4.
     *
     * Always consonant with whatever the pad is currently voicing, always
     * long-tailed, never sharp — the reward for finding something should feel
     * like the world acknowledging it, not like a coin being collected.
     */
    chime(level = 0) {
      ring(Math.max(0, Math.min(4, level)));
    },

    /** stop everything cleanly, for a page that is going away */
    dispose() {
      clearInterval(driftTimer);
      driftTimer = null;
    },
  };
}
