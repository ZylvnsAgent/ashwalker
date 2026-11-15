// Synthesised sound effects: no audio files, no network. Everything is a short
// oscillator or filtered-noise burst through one AudioContext, created lazily on
// the first user gesture. Every call is guarded so audio can never break the game.
export function createAudio() {
  let ctx = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noise(when, dur, filterFreq, gain) {
    if (!ctx || !noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(when);
    src.stop(when + dur);
  }

  function tone(when, freq, dur, gain, type = 'sine') {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + dur);
  }

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    },
    shoot() {
      const c = ensure();
      if (!c) return;
      noise(c.currentTime, 0.12, 2400, 0.5);
      tone(c.currentTime, 110, 0.09, 0.35, 'triangle');
    },
    dry() {
      const c = ensure();
      if (!c) return;
      tone(c.currentTime, 900, 0.04, 0.12, 'square');
    },
    reload() {
      const c = ensure();
      if (!c) return;
      tone(c.currentTime, 1400, 0.04, 0.1, 'square');
      tone(c.currentTime + 0.18, 900, 0.05, 0.12, 'square');
    },
    hit(head) {
      const c = ensure();
      if (!c) return;
      tone(c.currentTime, head ? 2400 : 1700, 0.06, 0.16, 'sine');
    },
    hurt() {
      const c = ensure();
      if (!c) return;
      tone(c.currentTime, 160, 0.18, 0.3, 'sawtooth');
    },
    explode() {
      const c = ensure();
      if (!c) return;
      noise(c.currentTime, 0.9, 500, 0.9);
      tone(c.currentTime, 55, 0.8, 0.7, 'sine');
    },
    beep() {
      const c = ensure();
      if (!c) return;
      tone(c.currentTime, 1250, 0.07, 0.1, 'square');
    },
    plant() {
      const c = ensure();
      if (!c) return;
      tone(c.currentTime, 880, 0.1, 0.15, 'sine');
      tone(c.currentTime + 0.12, 1174, 0.14, 0.15, 'sine');
    },
    roundWin() {
      const c = ensure();
      if (!c) return;
      [523, 659, 784].forEach((f, i) => tone(c.currentTime + i * 0.12, f, 0.22, 0.16, 'triangle'));
    },
    roundLose() {
      const c = ensure();
      if (!c) return;
      [392, 330, 262].forEach((f, i) => tone(c.currentTime + i * 0.12, f, 0.22, 0.14, 'triangle'));
    },
  };
}
