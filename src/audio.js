// Procedural sound: every effect and the music are synthesized with WebAudio,
// so the prototype needs no audio files. Replace with recorded dhol, shankh,
// veena etc. later.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicTimer = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  get t() { return this.ctx.currentTime; }

  _env(gain, t0, a, peak, dur) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  tone(type, f0, f1, dur, peak = 0.3, t0 = this.t, attack = 0.005, dest = this.master) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    this._env(g, t0, attack, peak, dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  noiseHit(dur, ftype, f0, f1, peak = 0.3, t0 = this.t, q = 1, attack = 0.005) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = ftype;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = this.ctx.createGain();
    this._env(g, t0, attack, peak, dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0, Math.random());
    s.stop(t0 + dur + 0.05);
  }

  whoosh(heavy) { this.noiseHit(heavy ? 0.35 : 0.2, 'bandpass', heavy ? 500 : 900, heavy ? 2200 : 3500, heavy ? 0.35 : 0.22, this.t, 1.2, 0.04); }
  hit(heavy) {
    this.tone('sine', heavy ? 160 : 220, 45, heavy ? 0.35 : 0.2, heavy ? 0.9 : 0.6);
    this.noiseHit(heavy ? 0.25 : 0.12, 'lowpass', 2500, 300, heavy ? 0.6 : 0.4);
  }
  block() {
    this.tone('square', 980, 900, 0.18, 0.12);
    this.tone('triangle', 1460, 1400, 0.3, 0.12);
    this.noiseHit(0.08, 'highpass', 3000, 2000, 0.25);
  }
  parry() {
    this.tone('sine', 1760, 1760, 0.9, 0.25);
    this.tone('sine', 2640, 2600, 0.7, 0.15);
    this.noiseHit(0.1, 'highpass', 5000, 3000, 0.3);
  }
  guardBreak() { this.tone('sawtooth', 300, 60, 0.4, 0.3); this.noiseHit(0.3, 'lowpass', 3000, 200, 0.5); }
  twang(power = 0) {
    this.tone('triangle', 330, 240, 0.25, 0.35);
    this.noiseHit(0.25, 'bandpass', 1200 + power * 1500, 4000, 0.25, this.t, 2);
  }
  fire() { this.noiseHit(0.6, 'lowpass', 300, 1800, 0.5, this.t, 1, 0.08); this.tone('sawtooth', 90, 60, 0.6, 0.15); }
  explode() { this.noiseHit(0.8, 'lowpass', 1800, 80, 0.8); this.tone('sine', 90, 30, 0.7, 0.7); }
  charge() { this.tone('sine', 220, 880, 1.0, 0.12, this.t, 0.3); this.tone('sine', 330, 1320, 1.0, 0.08, this.t, 0.3); }
  beam() {
    this.tone('sawtooth', 110, 55, 1.2, 0.35, this.t, 0.02);
    this.tone('sine', 880, 440, 1.2, 0.2);
    this.noiseHit(1.2, 'bandpass', 600, 200, 0.6, this.t, 0.7, 0.02);
  }
  storm() { this.noiseHit(0.4, 'bandpass', 700, 2600, 0.3, this.t, 3, 0.05); }
  ko() { this.tone('sine', 120, 30, 1.6, 0.9); this.noiseHit(1.2, 'lowpass', 1200, 60, 0.6); this.bell(); }
  dodge() { this.noiseHit(0.18, 'highpass', 1500, 4000, 0.15, this.t, 0.8, 0.03); }
  roar() { this.tone('sawtooth', 110, 70, 1.2, 0.35, this.t, 0.1); this.tone('sawtooth', 165, 100, 1.2, 0.2, this.t, 0.1); this.noiseHit(1.0, 'lowpass', 800, 200, 0.4, this.t, 1, 0.1); }

  thunder() {
    if (!this.ctx) return;
    this.noiseHit(2.8, 'lowpass', 400, 40, 0.7, this.t, 0.7, 0.05);
    this.noiseHit(0.4, 'lowpass', 2500, 300, 0.35, this.t, 0.7, 0.01);
  }
  splash() { this.noiseHit(0.9, 'lowpass', 3000, 300, 0.7, this.t, 0.8, 0.01); this.tone('sine', 180, 60, 0.4, 0.4); }

  bell(t0 = this.t) {
    [[523, 0.25, 2.5], [1318, 0.12, 1.8], [2093, 0.06, 1.2], [785, 0.08, 2]].forEach(([f, p, d]) => this.tone('sine', f, f * 0.995, d, p, t0, 0.003));
  }

  // Shankh (conch) blown at round start.
  conch() {
    if (!this.ctx) return;
    const t0 = this.t;
    for (const [mul, p] of [[1, 0.22], [2, 0.08], [3, 0.04]]) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1400;
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(220 * mul, t0);
      o.frequency.linearRampToValueAtTime(233 * mul, t0 + 0.4);
      o.frequency.linearRampToValueAtTime(228 * mul, t0 + 1.6);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(p, t0 + 0.35);
      g.gain.setValueAtTime(p, t0 + 1.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.0);
      o.connect(f).connect(g).connect(this.master);
      o.start(t0); o.stop(t0 + 2.1);
    }
  }

  // Tanpura-style drone + dhol pattern.
  startMusic() {
    if (!this.ctx || this.drone) return;
    const g = this.ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.05, this.t + 2);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 700;
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 0.15; lg.gain.value = 250;
    lfo.connect(lg).connect(f.frequency); lfo.start();
    const oscs = [110, 165, 220, 110.4].map((fr) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(); return o;
    });
    f.connect(g).connect(this.master);
    this.drone = { g, oscs, lfo };

    const bpm = 96, step = 60 / bpm / 2;
    const pattern = [2, 0, 1, 2, 0, 1, 2, 1, 2, 0, 1, 2, 0, 1, 1, 1];
    let i = 0, next = this.t + 0.1;
    this.musicTimer = setInterval(() => {
      while (next < this.t + 0.2) {
        const p = pattern[i % pattern.length];
        if (p === 2) this.tone('sine', 110, 48, 0.3, 0.32, next, 0.002);
        if (p === 1) this.noiseHit(0.07, 'bandpass', 2400, 1800, 0.12, next, 3, 0.002);
        if (i % 16 === 0) this.noiseHit(0.05, 'highpass', 6000, 6000, 0.05, next);
        next += step; i++;
      }
    }, 50);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.drone) {
      const { g, oscs, lfo } = this.drone;
      g.gain.exponentialRampToValueAtTime(0.0001, this.t + 1);
      setTimeout(() => { oscs.forEach((o) => o.stop()); lfo.stop(); }, 1200);
      this.drone = null;
    }
  }
}
