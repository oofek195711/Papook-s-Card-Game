// Procedural sound effects using the Web Audio API — no mp3/wav files
// needed. Every sound here is synthesized from oscillators + noise
// buffers with simple gain envelopes, so it's zero-asset and instant to
// load. If real sound files are added later, only this file needs to
// change — everything else calls the same public functions.
window.GameSound = (() => {
  let audioCtx = null;
  let masterGain = null;
  let muted = false;

  function ensureContext() {
    if (audioCtx) return audioCtx;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(audioCtx.destination);

    return audioCtx;
  }

  // Browsers block audio playback until a real user gesture. This
  // silently "unlocks" the AudioContext on the first tap/click anywhere
  // in the game, so by the time the first real sound is needed it's
  // already allowed to play.
  function unlock() {
    const ctx = ensureContext();
    if (ctx.state === "suspended") ctx.resume();
  }
  document.addEventListener("pointerdown", unlock, { once: true });

  function playTone({
    freq,
    type = "sine",
    duration = 0.2,
    startTime = 0,
    gain = 0.3,
    sweepTo = null,
    attack = 0.005,
    release = 0.12
  }) {
    if (muted) return;
    const ctx = ensureContext();
    const t0 = ctx.currentTime + startTime;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 1), t0 + duration);
    }

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, t0);
    gainNode.gain.linearRampToValueAtTime(gain, t0 + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t0 + duration + release);

    osc.connect(gainNode);
    gainNode.connect(masterGain);

    osc.start(t0);
    osc.stop(t0 + duration + release + 0.05);
  }

  function playNoise({
    duration = 0.15,
    startTime = 0,
    gain = 0.3,
    filterFreq = 1200,
    filterType = "bandpass",
    Q = 1
  }) {
    if (muted) return;
    const ctx = ensureContext();
    const t0 = ctx.currentTime + startTime;

    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // white noise with a built-in linear decay so it doesn't click at the end
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = Q;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gain, t0);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(masterGain);

    noiseSource.start(t0);
    noiseSource.stop(t0 + duration + 0.05);
  }

  // ---- Public sound effects ----

  function playHit() {
    playNoise({ duration: 0.09, gain: 0.35, filterFreq: 1800, filterType: "bandpass", Q: 1.2 });
    playTone({ freq: 160, type: "square", duration: 0.06, gain: 0.16, release: 0.05 });
  }

  function playDirectHit() {
    playNoise({ duration: 0.16, gain: 0.4, filterFreq: 900, filterType: "lowpass", Q: 0.8 });
    playTone({ freq: 110, type: "sawtooth", duration: 0.18, gain: 0.28, sweepTo: 55, release: 0.15 });
  }

  function playFusion() {
    playTone({ freq: 220, type: "sine", duration: 0.35, gain: 0.22, sweepTo: 660, release: 0.2 });
    playTone({ freq: 330, type: "triangle", duration: 0.35, gain: 0.16, sweepTo: 880, startTime: 0.05, release: 0.25 });
    playTone({ freq: 1200, type: "sine", duration: 0.12, gain: 0.12, startTime: 0.28, release: 0.15 });
  }

  function playDeath() {
    playTone({ freq: 300, type: "sawtooth", duration: 0.35, gain: 0.2, sweepTo: 80, release: 0.2 });
  }

  function playSkill() {
    playTone({ freq: 880, type: "sine", duration: 0.1, gain: 0.18, release: 0.12 });
    playTone({ freq: 1320, type: "sine", duration: 0.1, gain: 0.1, startTime: 0.04, release: 0.14 });
  }

  function playVictory() {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      playTone({ freq, type: "triangle", duration: 0.18, gain: 0.22, startTime: i * 0.14, release: 0.2 });
    });
  }

  function playDefeat() {
    playTone({ freq: 440, type: "sawtooth", duration: 0.5, gain: 0.2, sweepTo: 130, release: 0.3 });
  }

  function setMuted(value) {
    muted = value;
  }

  function toggleMuted() {
    muted = !muted;
    return muted;
  }

  function isMuted() {
    return muted;
  }

  return {
    playHit,
    playDirectHit,
    playFusion,
    playDeath,
    playSkill,
    playVictory,
    playDefeat,
    setMuted,
    toggleMuted,
    isMuted
  };
})();
