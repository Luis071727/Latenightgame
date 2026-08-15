/**
 * Ambient sound, synthesised on the fly — a slow pad and a filtered-noise
 * water wash. Nothing is downloaded, which keeps the scene working offline.
 *
 * It only starts on the first touch (browsers block audio before a gesture),
 * fades in over several seconds, and has no transients anywhere: every gain
 * change is a long ramp, so there is nothing that could startle someone who
 * is most of the way to sleep.
 */
export function createAudio(CONFIG) {
  let ctx = null;
  let master = null;
  let muted = false;
  let dim = 1;

  function start() {
    if (ctx || !CONFIG.audio.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    try {
      ctx = new AC();
      ctx.resume?.();                     // Safari can start suspended

      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      master.gain.linearRampToValueAtTime(
        CONFIG.audio.volume, ctx.currentTime + CONFIG.audio.fadeInSeconds);

      /* ── pad: a few detuned voices under a soft lowpass ── */
      const padGain = ctx.createGain();
      padGain.gain.value = 0.5;
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 420;
      padFilter.Q.value = 0.4;
      padGain.connect(padFilter).connect(master);

      for (const [i, f] of CONFIG.audio.chord.entries()) {
        const osc = ctx.createOscillator();
        osc.type = i % 2 ? 'sine' : 'triangle';
        osc.frequency.value = f;
        osc.detune.value = (Math.random() - 0.5) * 9;

        const g = ctx.createGain();
        g.gain.value = 0.16 / (i + 1);

        // each voice breathes on its own slow LFO, so the chord never sits still
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.035 + Math.random() * 0.05;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = g.gain.value * 0.7;
        lfo.connect(lfoGain).connect(g.gain);

        osc.connect(g).connect(padGain);
        osc.start(); lfo.start();
      }

      /* ── water: looping pink-ish noise, filter opening and closing ── */
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

      noise.connect(nf).connect(ng).connect(master);
      noise.start(); swell.start();
    } catch {
      ctx = null;          // audio is a nicety; the scene carries on without it
    }
  }

  function applyGain(timeConstant = 1.5) {
    if (!ctx || !master) return;
    const target = muted ? 0 : CONFIG.audio.volume * (0.15 + 0.85 * dim);
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
    toggleMute() { muted = !muted; applyGain(1.2); return muted; },
    /** follows the sleep fade so the sound goes down with the light */
    setDim(v) {
      if (Math.abs(v - dim) < 0.01) return;
      dim = v;
      applyGain();
    },
  };
}
