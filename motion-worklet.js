// motion-worklet.js — Motion's DSP in the browser (AudioWorklet). A port of Source/DSP: the seven modules,
// slot crossfades, motion lanes, macros with CHAOS noise and the output level match. Runs its own
// techno loop (or the audio file you drop on the page) at the page's tempo.
import { MODULES, MOD, DIV_BEATS, NUM_SLOTS, NUM_PARAMS, NUM_LANES, LANE_POINTS, TARGET_MIX_BASE, TARGET_AMOUNT,
         toReal, choiceIndex, clamp01, applyMacros, shifterHz } from './motion-core.js';

const TWO_PI = Math.PI * 2;
const softClip = x => { x = x < -3 ? -3 : x > 3 ? 3 : x; return x * (27 + x * x) / (27 + 9 * x * x); };
const dbg = db => Math.pow(10, db / 20);

class OnePole { constructor() { this.g = 0; this.s = 0; } set(hz, fs) { let g = Math.tan(Math.PI * Math.min(Math.max(hz, 5), fs * 0.49) / fs); this.g = g / (1 + g); }
  lp(x) { const v = (x - this.s) * this.g, y = v + this.s; this.s = y + v; return y; } hp(x) { return x - this.lp(x); } reset() { this.s = 0; } }
class Svf { constructor() { this.ic1 = 0; this.ic2 = 0; this.set(1000, 0.7, 48000); }
  set(hz, q, fs) { const g = Math.tan(Math.PI * Math.min(Math.max(hz, 10), fs * 0.45) / fs); this.k = 1 / Math.max(0.05, q); this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2; }
  run(x) { const v3 = x - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2; this.lpv = v2; this.bpv = v1; this.hpv = x - this.k * v1 - v2; return v2; }
  reset() { this.ic1 = this.ic2 = 0; } }
class Crossover { constructor() { this.f = [new Svf(), new Svf(), new Svf(), new Svf()]; }
  set(hz, fs) { for (const f of this.f) f.set(hz, 0.7071, fs); }
  split(x) { this.f[0].run(x); this.f[1].run(this.f[0].lpv); this.f[2].run(x); this.f[3].run(this.f[2].hpv); return [this.f[1].lpv, this.f[3].hpv]; } }
class Ring { constructor(n) { let s = 1; while (s < n + 4) s <<= 1; this.d = new Float32Array(s); this.m = s - 1; this.w = 0; }
  push(x) { this.d[this.w] = x; this.w = (this.w + 1) & this.m; }
  read(delay) { delay = Math.max(1, Math.min(this.m - 3, delay)); const p = this.w - delay, i = Math.floor(p), f = p - i, a = this.d[i & this.m], b = this.d[(i + 1) & this.m]; return a + (b - a) * f; }
  readInt(delay) { return this.d[(this.w - delay) & this.m]; } clear() { this.d.fill(0); } }
class Allpass { constructor(n) { this.b = new Float32Array(Math.max(1, n)); this.p = 0; } run(x, g) { const d = this.b[this.p], v = x + g * d; this.b[this.p] = v; if (++this.p >= this.b.length) this.p = 0; return d - g * v; } }
class LevelMatch { constructor(fs, t, db) { this.c = 1 - Math.exp(-1 / (t * fs)); this.lo = dbg(-db); this.hi = dbg(db); this.pi = 0; this.po = 0; this.g = 1; }
  run(inP, outP, n) { const k = 1 - Math.pow(1 - this.c, n); this.pi += k * (inP - this.pi); this.po += k * (outP - this.po);
    if (this.po > 1e-7 && this.pi > 1e-8) this.g += k * (Math.min(this.hi, Math.max(this.lo, Math.sqrt(this.pi / this.po))) - this.g); return this.g; } }
const real = (type, i, p) => toReal(MODULES[type].params[i], p[i]);
const choice = (type, i, p) => choiceIndex(MODULES[type].params[i], p[i]);

// Hilbert pair (Olli Niemitalo 4+4 all-pass), as in ResoShift
const H1 = [0.6923878, 0.9360654322959, 0.988229522686, 0.9987488452737].map(a => a * a);
const H2 = [0.4021921162426, 0.856171088242, 0.9722909545651, 0.9952884791278].map(a => a * a);
class Hilbert { constructor() { this.s1 = H1.map(() => [0, 0, 0, 0]); this.s2 = H2.map(() => [0, 0, 0, 0]); this.d = 0; }
  sec(s, c, x) { const y = c * (x + s[3]) - s[1]; s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y; return y; }
  run(x) { let a = x, b = x; for (let i = 0; i < 4; i++) { a = this.sec(this.s1[i], H1[i], a); b = this.sec(this.s2[i], H2[i], b); } const re = this.d; this.d = a; return [re, b]; } }

// ------------------------------------------------------------------ modules (in place, stereo)
class Resonator {
  constructor(fs) {
    this.fs = fs; this.voices = [0, 1, 2, 3].map(() => ({ buf: new Ring(Math.ceil(fs / 25) + 16), lp: 0, grain: null, gp: 0, level: 0 }));
    this.grainLen = Math.round(0.004 * fs); this.grains = [new Float32Array(this.grainLen), new Float32Array(this.grainLen)];
    for (let i = 0; i < this.grainLen; i++) this.grains[0][i] = (Math.random() * 2 - 1) * (0.5 - 0.5 * Math.cos(TWO_PI * i / (this.grainLen - 1)));
    this.active = 0; this.cap = -1; this.env = 0; this.slow = 0; this.armed = true; this.cool = 0; this.pending = [0, 0, 0, 0]; this.last = [-1, -1, -1, -1];
    this.duckE = 0; this.duckH = 0; this.match = new LevelMatch(fs, 0.4, 24); this.hp = [new OnePole(), new OnePole()];
    this.rng = 0x5e50; this.lfo = [0, 1.3, 2.6, 3.9]; this.hpHz = 60;
  }
  rand() { this.rng = (this.rng * 1664525 + 1013904223) >>> 0; return this.rng / 4294967296; }
  set(p) {
    const T = MOD.resonator, mode = choice(T, 0, p), root = choice(T, 1, p);
    this.mode = mode; this.color = real(T, 2, p); this.t60 = 0.06 * Math.pow(4 / 0.06, Math.min(0.95, real(T, 3, p)) / 0.95);
    const sh = real(T, 4, p); this.shiftRate = Math.sign(sh) * sh * sh * 150; this.drive = real(T, 5, p); this.prob = real(T, 6, p); this.duck = real(T, 7, p);
    const base = 36 + root + (mode === 1 ? 12 : 0);
    const semis = [[-12, 0, 0.09, 12], [0, 17.547, 29.207, 37.91], [0, 12, 11.93, 24], [0, 7, 12, 20]][mode];
    this.gain = [[1, 0.85, 0.7, 0.45], [1, 0.8, 0.65, 0.5], [1, 0.85, 0.85, 0.55], [1, 0.9, 0.8, 0.6]][mode];
    this.pan = [[0, -0.25, 0.25, 0], [-0.4, 0.4, -0.2, 0.2], [-0.3, 0.3, -0.3, 0.3], [-0.4, 0.4, -0.4, 0.4]][mode];
    this.colorScale = [0.3, 1, 1, 1][mode]; this.invert = mode === 2; this.loopDrive = [2, 1, 1.2, 1][mode]; this.hpTarget = [30, 150, 90, 150][mode];
    this.notes = semis.map(s => 440 * Math.pow(2, (base + s - 69) / 12));
  }
  process(L, R, n, ctx) {
    const fs = this.fs, driveK = 1 + 6 * this.drive, dn = 1 / Math.sqrt(driveK), loopDrive = 1 + 1.5 * this.drive * this.loopDrive;
    const cut = this.color * this.colorScale, lpg = 1 - Math.exp(-TWO_PI * Math.min(cut, fs * 0.45) / fs);
    this.shiftAcc = (this.shiftAcc || 0) + this.shiftRate * n / fs;   // SHIFT: the whole voicing glides
    const glide = Math.pow(2, Math.max(-2, Math.min(2, this.shiftAcc / 300)));
    if (Math.abs(this.shiftRate) < 1e-3) this.shiftAcc *= 0.995;
    const ent = 0.1 + 0.7 * ctx.chaos;
    const periods = this.notes.map((f, v) => { this.lfo[v] += TWO_PI * [0.07, 0.11, 0.17, 0.23][v] * n / fs; const hz = f * glide * Math.pow(2, ent * 15 * Math.sin(this.lfo[v]) / 1200); return fs / hz * (this.invert ? 0.5 : 1); });
    const fb = this.notes.map((f, v) => { const trips = f * glide * (this.invert ? 2 : 1); let g = Math.min(0.9995, Math.pow(10, -3 / (trips * this.t60))); return this.invert ? -g : g; });
    const comp = this.notes.map(f => Math.min(3, Math.max(0.5, Math.sqrt(220 / f))));
    const att = Math.exp(-1 / (0.0005 * fs)), rel = Math.exp(-1 / (0.01 * fs)), slowC = 1 - Math.exp(-1 / (0.06 * fs));
    const dA = Math.exp(-1 / (0.001 * fs)), dR = Math.exp(-1 / (0.14 * fs));
    const inc16 = ctx.bpm * 4 / (60 * fs);
    let pin = 0, pout = 0;
    this.hpHz += 0.05 * (this.hpTarget - this.hpHz);
    for (const h of this.hp) h.set(this.hpHz, fs);
    for (let i = 0; i < n; i++) {
      const inL = L[i], inR = R[i], mono = 0.5 * (inL + inR), rect = Math.max(Math.abs(inL), Math.abs(inR));
      this.env = rect > this.env ? rect + att * (this.env - rect) : rect + rel * (this.env - rect);
      this.slow += slowC * (this.env - this.slow);
      if (this.cool > 0) this.cool--;
      if (!this.armed && this.env < this.slow * 1.2) this.armed = true;
      if (this.armed && this.cool === 0 && this.env > 0.016 && this.env > this.slow * 2) { this.armed = false; this.cool = Math.round(0.03 * fs); this.pending = [1, 1, 1, 1]; this.duckH = Math.round(0.04 * fs); this.cap = 0; this.capT = 1 - this.active; }
      if (this.cap >= 0) {
        const g = this.grains[this.capT]; g[this.cap] = mono * (0.5 - 0.5 * Math.cos(TWO_PI * this.cap / (this.grainLen - 1)));
        if (++this.cap >= this.grainLen) { let pk = 0; for (const s of g) pk = Math.max(pk, Math.abs(s)); const nn = pk > 1e-6 ? 1 / pk : 0; for (let k = 0; k < g.length; k++) g[k] = g[k] * nn + 0.1 * (Math.random() * 2 - 1) * (0.5 - 0.5 * Math.cos(TWO_PI * k / (g.length - 1))); this.active = this.capT; this.cap = -1; }
      }
      const p16 = ctx.beats * 4 + i * inc16;
      let oL = 0, oR = 0;
      for (let v = 0; v < 4; v++) {
        const vo = this.voices[v], step = Math.floor(p16 / [3, 5, 7, 11][v]);
        if (step !== this.last[v]) { this.last[v] = step; if (this.pending[v]) { this.pending[v] = 0; if (this.rand() * 100 < this.prob) { vo.grain = this.grains[this.active]; vo.gp = 0; } } }
        let ex = 0; if (vo.grain) { ex = vo.grain[vo.gp] * 0.35; if (++vo.gp >= this.grainLen) vo.grain = null; }
        const y = vo.buf.read(periods[v]);
        vo.lp += lpg * (y - vo.lp);
        vo.buf.push(ex + softClip(vo.lp * fb[v] * loopDrive) / loopDrive);
        const s = softClip(driveK * vo.lp) * dn * this.gain[v] * comp[v];
        const a = (this.pan[v] + 1) * Math.PI * 0.25;
        oL += s * Math.cos(a); oR += s * Math.sin(a);
      }
      const dt = this.duckH > 0 ? 1 : 0; if (this.duckH > 0) this.duckH--;
      this.duckE = dt > this.duckE ? dt + dA * (this.duckE - dt) : dt + dR * (this.duckE - dt);
      const dg = 1 - this.duck * this.duckE;
      pin += mono * mono; pout += 0.5 * (oL * oL + oR * oR);
      L[i] = oL * dg; R[i] = oR * dg;
    }
    const g = this.match.run(Math.max(pin / n, 1e-4), pout / n + 1e-12, n);
    for (let i = 0; i < n; i++) { L[i] = Math.tanh(this.hp[0].hp(L[i] * g)); R[i] = Math.tanh(this.hp[1].hp(R[i] * g)); }
  }
}

class Filter {
  constructor(fs) { this.fs = fs; this.a = [new Svf(), new Svf()]; this.b = [new Svf(), new Svf()]; this.lad = [[0, 0, 0, 0], [0, 0, 0, 0]]; this.G = [0.1, 0.1]; this.keep = [new Crossover(), new Crossover()]; this.env = 0; this.lc = null; }
  set(p) { const T = MOD.filter; this.type = choice(T, 0, p); this.cut = real(T, 1, p); this.reso = real(T, 2, p); this.drive = real(T, 3, p); this.envAmt = real(T, 4, p); this.envDec = real(T, 5, p) / 1000; this.spread = real(T, 6, p); this.keepHz = real(T, 7, p);
    if (this.lc === null) this.lc = Math.log(this.cut); for (const k of this.keep) k.set(this.keepHz, this.fs); }
  coefs(hz) {
    const r2 = this.reso * this.reso, fs = this.fs;
    for (let c = 0; c < 2; c++) {
      const f = Math.min(fs * 0.45, Math.max(20, hz * Math.pow(2, (c ? 0.5 : -0.5) * this.spread)));
      if (this.type === 0) { this.a[c].set(f, 0.5412, fs); this.b[c].set(f, 1.3066 + r2 * 16, fs); }
      else if (this.type === 1 || this.type === 3) this.a[c].set(f, 0.7071 + r2 * 17, fs);
      else if (this.type === 2) this.a[c].set(f, 0.8 + r2 * 12, fs);
      else { const g = Math.tan(Math.PI * Math.min(f, fs * 0.42) / fs); this.G[c] = g / (1 + g); }
    }
    this.k = this.reso * 3.9;
  }
  process(L, R, n) {
    const fs = this.fs, sm = 1 - Math.exp(-1 / (0.015 * fs)), target = Math.log(this.cut), rel = Math.exp(-1 / (Math.max(0.005, this.envDec) * fs)), att = Math.exp(-1 / (0.001 * fs));
    const g = 1 + this.drive * 7, comp = 1 / Math.sqrt(g), keep = this.keepHz > 21, ch = [L, R];
    for (let i = 0; i < n; i++) {
      this.lc += sm * (target - this.lc);
      const x0 = Math.abs(0.5 * (L[i] + R[i]));
      this.env = x0 > this.env ? x0 + att * (this.env - x0) : x0 + rel * (this.env - x0);
      if ((i & 3) === 0) this.coefs(Math.exp(this.lc + this.envAmt * Math.min(1, this.env * 2) * 2.77));
      for (let c = 0; c < 2; c++) {
        let low = 0, dry = ch[c][i];
        if (keep) [low, dry] = this.keep[c].split(dry);
        const x = this.drive > 1e-3 ? softClip(dry * g) * comp * 1.2 : dry;
        let y;
        if (this.type === 0) { this.a[c].run(x); y = this.b[c].run(this.a[c].lpv); }
        else if (this.type === 1) y = this.a[c].run(x);
        else if (this.type === 2) { this.a[c].run(x); y = this.a[c].bpv * this.a[c].k; }
        else if (this.type === 3) { this.a[c].run(x); y = this.a[c].hpv; }
        else {
          const s = this.lad[c], G = this.G[c], om = 1 - G, S = G * G * G * om * s[0] + G * G * om * s[1] + G * om * s[2] + om * s[3];
          let u = Math.tanh((x * (1 + this.k * 0.5) - this.k * S) / (1 + this.k * G * G * G * G));
          for (let k = 0; k < 4; k++) { const v = (u - s[k]) * G, o = v + s[k]; s[k] = o + v; u = o; }
          y = u;
        }
        this.a[c].ic1 = 2 * softClip(0.5 * this.a[c].ic1); this.b[c].ic1 = 2 * softClip(0.5 * this.b[c].ic1);
        ch[c][i] = y + low;
      }
    }
  }
}

class Drive {
  constructor(fs) { this.fs = fs; this.split = [new Crossover(), new Crossover()]; this.tilt = [new OnePole(), new OnePole()]; this.dc = [0, 0, 0, 0]; this.held = [0, 0]; this.acc = 0; this.match = new LevelMatch(fs, 0.35, 18); }
  set(p) { const T = MOD.drive; this.mode = choice(T, 0, p); this.g = dbg(real(T, 1, p)); const t = real(T, 2, p); this.hi = dbg(t * 9); this.lo = dbg(-t * 4); this.bits = real(T, 3, p); this.rate = real(T, 4, p);
    this.bias = real(T, 5, p) * 0.6; this.keepHz = real(T, 6, p); this.trim = dbg(real(T, 7, p)); for (const s of this.split) s.set(this.keepHz, this.fs); for (const t2 of this.tilt) t2.set(900, this.fs); }
  shape(x) { switch (this.mode) { case 0: return Math.tanh(x); case 1: return x > 0 ? Math.tanh(x) : 1.6 * Math.tanh(x * 0.625); case 2: return Math.sin(Math.max(-12, Math.min(12, x)) * 1.5707963);
    case 3: { const c = Math.max(-1, Math.min(1, x)); return 1.5 * c - 0.5 * c * c * c; } default: return Math.tanh(0.45 * x + 0.9 * Math.abs(x)); } }
  process(L, R, n) {
    const keep = this.keepHz > 21, q = Math.pow(2, Math.max(2, Math.min(16, this.bits)) - 1), crush = this.bits < 15.5, down = this.rate > 1.05, b0 = this.shape(this.bias), r = 1 - 10 * 6.28 / this.fs;
    const lows = [new Float32Array(n), new Float32Array(n)], ch = [L, R];
    let pin = 0, pout = 0;
    for (let i = 0; i < n; i++) {
      if (down && (this.acc += 1) >= this.rate) this.acc -= this.rate;
      for (let c = 0; c < 2; c++) {
        let lo = 0, hi = ch[c][i];
        if (keep) [lo, hi] = this.split[c].split(hi);
        lows[c][i] = lo; pin += hi * hi;
        let y = this.shape(hi * this.g + this.bias) - b0;
        const l = this.tilt[c].lp(y); y = l * this.lo + (y - l) * this.hi;
        if (crush) y = Math.round(y * q) / q;
        if (down) { if (this.acc < 1) this.held[c] = y; y = this.held[c]; }
        const o = y - this.dc[c * 2] + r * this.dc[c * 2 + 1]; this.dc[c * 2] = y; this.dc[c * 2 + 1] = o;
        ch[c][i] = o; pout += o * o;
      }
    }
    const g = this.match.run(pin / (2 * n), pout / (2 * n) + 1e-12, n);
    for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) ch[c][i] = (ch[c][i] * g + lows[c][i]) * this.trim;
  }
}

const BROKEN = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0];
export function gateStep(pattern, i, rnd) {
  i &= 15;
  switch (pattern) { case 0: return true; case 1: return i % 4 === 2; case 2: return [0, 3, 6, 8, 11, 14].includes(i); case 3: return !!BROKEN[i];
    case 4: return i % 3 !== 2; case 5: return (i * 5) % 16 < 5; case 6: return (i * 7) % 16 < 7; default: return rnd ? rnd[i] : i % 4 === 0; }
}
class Gate {
  constructor(fs) { this.fs = fs; this.buf = [new Ring(fs * 4.5), new Ring(fs * 4.5)]; this.gain = 1; this.sm = 0; this.lastStep = -1; this.lastBar = -1; this.since = 0; this.stut = false; this.rnd = new Array(16).fill(true); }
  set(p) { const T = MOD.gate; this.pattern = choice(T, 0, p); this.rate = choice(T, 1, p); this.depth = real(T, 2, p); this.shape = real(T, 3, p); this.stutter = real(T, 4, p); this.slice = choice(T, 5, p); this.swing = real(T, 6, p); }
  process(L, R, n, ctx) {
    const fs = this.fs, sb = DIV_BEATS[this.rate], inc = ctx.bpm / 60 / fs, sliceLen = Math.max(32, Math.round(0.125 * Math.pow(2, this.slice) * 60 / ctx.bpm * fs));
    const sm = 1 - Math.exp(-1 / (0.0007 * fs)), ss = 1 - Math.exp(-1 / (0.002 * fs)), att = 0.02 + this.shape * 0.4, rel = 0.04 + this.shape * 0.5;
    for (let i = 0; i < n; i++) {
      const pos = (ctx.beats + inc * i) / sb, pair = Math.floor(pos / 2), inPair = pos - pair * 2, fl = 1 + this.swing, first = inPair < fl;
      const t = first ? inPair / fl : (inPair - fl) / (2 - fl), step = pair * 2 + (first ? 0 : 1), bar = Math.floor(step / 16);
      if (bar !== this.lastBar) { this.lastBar = bar; if (this.pattern === 7) this.rnd = this.rnd.map((_, k) => k % 4 === 0 || Math.random() < 0.45); }
      if (step !== this.lastStep) { this.lastStep = step; this.since = 0; this.stut = this.stutter > 0.001 && Math.random() < this.stutter; this.len = sliceLen; }
      const on = gateStep(this.pattern, step, this.rnd);
      const env = on ? Math.max(0, Math.min(1, t / att, (1 - t) / rel)) : 0;
      this.gain += sm * ((1 - this.depth * (1 - env)) - this.gain);
      this.buf[0].push(L[i]); this.buf[1].push(R[i]);
      this.sm += ss * ((this.stut ? 1 : 0) - this.sm);
      let l = L[i], r = R[i];
      if (this.sm > 1e-4) { const p = this.since % this.len, dl = this.since + this.len - p, w = Math.min(1, p / 64, (this.len - p) / 64);
        l += this.sm * (this.buf[0].readInt(dl) * w - l); r += this.sm * (this.buf[1].readInt(dl) * w - r); }
      this.since++;
      L[i] = l * this.gain; R[i] = r * this.gain;
    }
  }
}

class Shifter {
  constructor(fs) { this.fs = fs; this.h = [new Hilbert(), new Hilbert()]; this.d = [new Ring(fs * 0.45), new Ring(fs * 0.45)]; this.tone = [new OnePole(), new OnePole()]; this.low = [new OnePole(), new OnePole()]; this.ph = [0, 0]; this.dsm = -1; this.fbs = 0; }
  set(p) { const T = MOD.shifter; this.hz = shifterHz(real(T, 0, p)); this.fb = real(T, 1, p); this.del = real(T, 2, p) / 1000; this.spread = real(T, 3, p);
    for (const t of this.tone) t.set(real(T, 4, p), this.fs); for (const l of this.low) l.set(real(T, 5, p), this.fs); }
  process(L, R, n) {
    const hz = [this.hz, this.hz * (1 - 2 * this.spread)], target = Math.max(1, this.del * this.fs), ch = [L, R];
    if (this.dsm < 0) { this.dsm = target; this.fbs = this.fb; }
    for (let i = 0; i < n; i++) {
      this.dsm += 0.0015 * (target - this.dsm); this.fbs += 0.002 * (this.fb - this.fbs);
      for (let c = 0; c < 2; c++) {
        const back = this.low[c].hp(this.tone[c].lp(this.d[c].read(this.dsm)));
        const [a, b] = this.h[c].run(ch[c][i] + this.fbs * softClip(back));
        this.ph[c] += TWO_PI * hz[c] / this.fs; if (this.ph[c] > TWO_PI) this.ph[c] -= TWO_PI; else if (this.ph[c] < 0) this.ph[c] += TWO_PI;
        const y = a * Math.cos(this.ph[c]) + b * Math.sin(this.ph[c]);
        this.d[c].push(y); ch[c][i] = y;
      }
    }
  }
}

class Delay {
  constructor(fs) { this.fs = fs; this.buf = [new Ring(fs * 8.2), new Ring(fs * 8.2)]; this.lp = [new OnePole(), new OnePole()]; this.hp = [new OnePole(), new OnePole()];
    this.ap = [[new Allpass(0.0071 * fs), new Allpass(0.0113 * fs)], [new Allpass(0.0079 * fs), new Allpass(0.0127 * fs)]]; this.dsm = -1; this.w1 = 0; this.w2 = 0; }
  additive() { return true; }
  set(p) { const T = MOD.delay; this.div = choice(T, 0, p); this.fb = real(T, 1, p); for (const l of this.lp) l.set(real(T, 2, p), this.fs); for (const h of this.hp) h.set(real(T, 3, p), this.fs);
    this.wob = real(T, 4, p); this.pp = real(T, 5, p); this.drive = real(T, 6, p); this.diff = real(T, 7, p); }
  process(L, R, n, ctx) {
    const fs = this.fs, target = Math.min(fs * 8, DIV_BEATS[this.div] * 60 / ctx.bpm * fs), glide = 1 - Math.exp(-1 / (0.25 * fs)), dg = 1 + this.drive * 5, dc = 1 / Math.sqrt(dg), apg = this.diff * 0.62;
    if (this.dsm < 0) { this.dsm = target; this.fbs = this.fb; this.pps = this.pp; }
    for (let i = 0; i < n; i++) {
      this.dsm += glide * (target - this.dsm); this.fbs += 0.002 * (this.fb - this.fbs); this.pps += 0.002 * (this.pp - this.pps);
      this.w1 += TWO_PI * 0.55 / fs; this.w2 += TWO_PI * 5.7 / fs;
      const mod = this.wob * 0.0035 * fs * (1 + Math.sin(this.w1)) + this.wob * 0.0004 * fs * (1 + Math.sin(this.w2));
      const tap = [0, 1].map(c => { let y = this.buf[c].read(this.dsm + mod * (c ? 0.87 : 1)); y = softClip(y * dg) * dc; y = this.lp[c].lp(this.hp[c].hp(y)); if (apg > 0.001) y = this.ap[c][1].run(this.ap[c][0].run(y, apg), apg); return y; });
      const mono = 0.5 * (L[i] + R[i]), inL = L[i] + this.pps * (mono - L[i]), inR = R[i] * (1 - this.pps);
      this.buf[0].push(softClip(inL + this.fbs * (tap[0] + this.pps * (tap[1] - tap[0]))));
      this.buf[1].push(softClip(inR + this.fbs * (tap[1] + this.pps * (tap[0] - tap[1]))));
      L[i] = tap[0]; R[i] = tap[1];
    }
  }
}

class Space {
  constructor(fs) { this.fs = fs; this.lines = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new Ring(0.2 * fs)); this.pre = [new Ring(0.3 * fs), new Ring(0.3 * fs)];
    this.diff = [[4.7, 3.6, 12.7, 9.3], [4.1, 3.3, 11.9, 8.7]].map(a => a.map(ms => new Allpass(ms * 0.001 * fs)));
    this.damp = this.lines.map(() => new OnePole()); this.low = [new OnePole(), new OnePole()]; this.g = new Float32Array(8); this.lfo = 0; this.sz = -1; this.env = 0; this.dg = 1; }
  additive() { return true; }
  set(p) { const T = MOD.space; this.size = real(T, 0, p); this.t60 = real(T, 1, p); for (const d of this.damp) d.set(real(T, 2, p), this.fs); this.preS = real(T, 3, p) / 1000; this.mod = real(T, 4, p);
    for (const l of this.low) l.set(real(T, 5, p), this.fs); this.duck = real(T, 6, p); this.width = real(T, 7, p); }
  process(L, R, n) {
    const fs = this.fs, base = [31.7, 37.3, 41.9, 47.3, 53.1, 59.9, 67.7, 73.3], pre = Math.max(1, this.preS * fs), er = Math.exp(-1 / (0.25 * fs)), ea = Math.exp(-1 / (0.005 * fs));
    if (this.sz < 0) this.sz = this.size;
    const y = new Float32Array(8), h = new Float32Array(8);
    for (let i = 0; i < n; i++) {
      this.sz += 0.0002 * (this.size - this.sz); const scale = 0.35 + this.sz * 1.15; this.lfo += TWO_PI * 0.31 / fs;
      for (let k = 0; k < 8; k++) { const m = k & 1 ? Math.sin(this.lfo + k) : Math.cos(this.lfo * 1.3 + k); const len = base[k] * 0.001 * fs * scale + this.mod * 12 * m;
        y[k] = this.damp[k].lp(this.lines[k].read(len)); if ((i & 15) === 0) this.g[k] = Math.pow(10, -3 * (len / fs) / Math.max(0.1, this.t60)); }
      const x = Math.abs(0.5 * (L[i] + R[i])); this.env = x > this.env ? x + ea * (this.env - x) : x + er * (this.env - x);
      this.dg += 0.002 * ((1 - this.duck * Math.min(1, this.env * 3)) - this.dg);
      this.pre[0].push(L[i]); this.pre[1].push(R[i]);
      let il = this.pre[0].read(pre), ir = this.pre[1].read(pre);
      for (let k = 0; k < 4; k++) { il = this.diff[0][k].run(il, 0.6); ir = this.diff[1][k].run(ir, 0.6); }
      const oL = y[0] - y[2] + y[4] - y[6] + 0.5 * (y[1] - y[7]), oR = y[1] - y[3] + y[5] - y[7] + 0.5 * (y[0] - y[6]);
      h.set(y);
      for (let len = 1; len < 8; len <<= 1) for (let s = 0; s < 8; s += len << 1) for (let k = s; k < s + len; k++) { const a = h[k], b = h[k + len]; h[k] = a + b; h[k + len] = a - b; }
      for (let k = 0; k < 8; k++) this.lines[k].push(h[k] * 0.35355339 * this.g[k] + (k < 4 ? il : ir) * (k & 1 ? -0.5 : 0.5));
      const wl = this.low[0].hp(oL) * 0.45 * this.dg, wr = this.low[1].hp(oR) * 0.45 * this.dg, mid = 0.5 * (wl + wr), side = 0.5 * (wl - wr) * this.width;
      L[i] = mid + side; R[i] = mid - side;
    }
  }
}

const MAKERS = [null, Resonator, Filter, Drive, Gate, Shifter, Delay, Space];

class Slot {
  constructor(fs) { this.fs = fs; this.mods = []; this.cur = 0; this.pend = 0; this.fade = 0; this.mix = 1; this.mixSm = 1; this.on = true; this.p = new Array(8).fill(0); this.level = 0; this.dl = new Float32Array(128); this.dr = new Float32Array(128); }
  setup(type, on, mix, p) { this.pend = type; this.on = on; this.pmix = mix; this.pp = p; if (type === this.cur) { this.mix = mix; this.p = p; } }
  process(L, R, n, ctx) {
    const tgt = this.pend === this.cur && this.on && this.cur ? 1 : 0;
    if (this.fade <= 0 && this.pend !== this.cur) { this.cur = this.pend; this.mix = this.mixSm = this.pmix; this.p = this.pp; if (this.cur) this.mods[this.cur] = new MAKERS[this.cur](this.fs); }
    if (!this.cur || (this.fade <= 0 && tgt <= 0)) { this.level = 0; return; }
    const m = this.mods[this.cur] || (this.mods[this.cur] = new MAKERS[this.cur](this.fs));
    this.dl.set(L.subarray(0, n)); this.dr.set(R.subarray(0, n));
    m.set(this.p); m.process(L, R, n, ctx);
    const add = !!m.additive, step = 1 / (0.012 * this.fs), mc = 1 - Math.exp(-1 / (0.015 * this.fs));
    let pk = 0;
    for (let i = 0; i < n; i++) {
      this.fade = Math.max(0, Math.min(1, this.fade + (tgt > this.fade ? step : -step)));
      this.mixSm += mc * (this.mix - this.mixSm);
      const a = this.mixSm * this.fade, dl = this.dl[i], dr = this.dr[i];
      L[i] = add ? dl + L[i] * a : dl + (L[i] - dl) * a; R[i] = add ? dr + R[i] * a : dr + (R[i] - dr) * a;
      if (!isFinite(L[i]) || !isFinite(R[i])) { L[i] = dl; R[i] = dr; this.mods[this.cur] = null; }
      pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    }
    this.level = Math.max(pk, this.level);
  }
}

// ------------------------------------------------------------------ loop source
function makeLoop(fs, bpm, bars = 2) {
  const beat = 60 / bpm, n = Math.round(beat * 4 * bars * fs), L = new Float32Array(n);
  let hp = 0, lo = 0, band = 0, seed = 1234;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  for (let i = 0; i < n; i++) {
    const t = i / fs, inB = t % beat, bi = Math.floor(t / beat);
    let s = 0.9 * Math.sin(TWO_PI * (48 * inB + 112 * (1 - Math.exp(-inB * 30)) / 30)) * Math.exp(-inB * 7);
    const nz = rnd(), off = (t + beat * 0.5) % beat;
    hp += 0.6 * (nz - hp); s += 0.22 * (nz - hp) * Math.exp(-off * 60);
    if (bi % 2 === 1) { lo += 0.12 * band; band += 0.12 * (nz - lo - 0.3 * band); s += 0.35 * band * Math.exp(-inB * 25); }
    s += 0.3 * Math.sin(TWO_PI * 87.31 * t) * Math.exp(-off * 9);
    L[i] = s * 0.8;
  }
  return [L, L];
}

class MotionWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fs = sampleRate; this.bpm = 128; this.beats = 0; this.playing = true;
    this.src = makeLoop(this.fs, this.bpm); this.pos = 0;
    this.slots = Array.from({ length: NUM_SLOTS }, () => new Slot(this.fs));
    this.recipe = null; this.bypass = false;
    this.lanes = Array.from({ length: NUM_LANES }, () => ({ smooth: 0, env: 0, held: 0.5, cycle: -1 }));
    this.noise = Array.from({ length: NUM_SLOTS }, () => new Float32Array(NUM_PARAMS)); this.noiseT = Array.from({ length: NUM_SLOTS }, () => new Float32Array(NUM_PARAMS)); this.lastChaos = -1;
    this.match = new LevelMatch(this.fs, 1.2, 12); this.amountSm = 1; this.tick = 0; this.levels = new Float32Array(NUM_SLOTS); this.eff = [];
    this.inPk = 0; this.outPk = 0; this.laneV = new Float32Array(NUM_LANES); this.laneP = new Float32Array(NUM_LANES);
    this.port.onmessage = e => {
      const m = e.data;
      if (m.recipe) this.recipe = m.recipe;
      if (m.bpm) { this.bpm = m.bpm; if (!this.custom) { this.src = makeLoop(this.fs, this.bpm); this.pos = 0; } }
      if (m.audio) { this.src = m.audio; this.pos = 0; this.custom = true; }
      if (m.loop) { this.custom = false; this.src = makeLoop(this.fs, this.bpm); this.pos = 0; }
      if (m.bypass !== undefined) this.bypass = m.bypass;
    };
  }

  laneValue(k, lane, dt, mono) {
    const st = this.lanes[k], len = DIV_BEATS[lane.rate];
    if (lane.shape <= 1) {
      const n = Math.max(1, Math.min(LANE_POINTS, lane.steps)), pos = this.beats / len, cyc = Math.floor(pos / n) * n, i = Math.floor(pos - cyc) % n, frac = pos - Math.floor(pos);
      const a = lane.pts[i], b = lane.pts[(i + 1) % n];
      let v = a;
      if (lane.shape === 0) { const t = frac, s = t * t * (3 - 2 * t); v = a + (b - a) * s; }
      st.smooth += (v - st.smooth) * (1 - Math.exp(-dt / 0.002));
      this.laneP[k] = pos - cyc;
      return st.smooth;
    }
    if (lane.shape === 8) { const x = Math.min(1, mono * 3); st.env += (x - st.env) * (1 - Math.exp(-dt / (x > st.env ? 0.004 : 0.16))); return st.env; }
    const ph = this.beats / len, cyc = Math.floor(ph), t = ph - cyc;
    if (cyc !== st.cycle) { st.cycle = cyc; st.held = Math.random(); }
    const v = [0.5 - 0.5 * Math.cos(t * TWO_PI), t < 0.5 ? t * 2 : 2 - t * 2, t, 1 - t, t < 0.5 ? 1 : 0, st.held][lane.shape - 2];
    st.smooth += (v - st.smooth) * (1 - Math.exp(-dt / 0.003));
    this.laneP[k] = t;
    return st.smooth;
  }

  process(inputs, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length, fs = this.fs;
    for (let i = 0; i < n; i++) { L[i] = this.src[0][this.pos]; R[i] = this.src[1][this.pos]; if (++this.pos >= this.src[0].length) this.pos = 0; }
    const dryL = L.slice(0, n), dryR = R.slice(0, n);
    let inPk = 0, pin = 0; for (let i = 0; i < n; i++) { inPk = Math.max(inPk, Math.abs(L[i])); pin += L[i] * L[i] + R[i] * R[i]; }
    this.inPk = Math.max(this.inPk, inPk);
    const r = this.recipe;
    if (r && !this.bypass) {
      const dt = n / fs, mod = new Float32Array(TARGET_AMOUNT + 1), macros = r.macros;
      for (let k = 0; k < NUM_LANES; k++) {
        const lane = r.lanes[k], v = this.laneValue(k, lane, dt, inPk);
        this.laneV[k] = v;
        if (lane.target > 0) mod[lane.target] += lane.depth * (lane.shape === 8 ? v : 2 * v - 1) * (1 + 0.6 * macros.chaos);
      }
      const cb = Math.floor(this.beats * 2);
      if (cb !== this.lastChaos) { this.lastChaos = cb; for (const t of this.noiseT) for (let k = 0; k < NUM_PARAMS; k++) t[k] = Math.random() * 2 - 1; }
      const ctx = { bpm: this.bpm, beats: this.beats, chaos: macros.chaos };
      for (let s = 0; s < NUM_SLOTS; s++) {
        const sl = r.slots[s], spec = MODULES[sl.type], p = new Array(NUM_PARAMS).fill(0);
        for (let k = 0; k < NUM_PARAMS; k++) {
          this.noise[s][k] += 0.08 * (this.noiseT[s][k] - this.noise[s][k]);
          let v = sl.p[k];
          if (k < spec.params.length && spec.params[k].kind !== 'choice') v = applyMacros(spec.params[k], clamp01(v + mod[1 + s * NUM_PARAMS + k]), macros, this.noise[s][k]);
          p[k] = v;
        }
        this.eff[s] = p;
        this.slots[s].setup(sl.type, sl.on, clamp01(sl.mix + mod[TARGET_MIX_BASE + s]), p);
      }
      for (const s of this.slots) s.process(L, R, n, ctx);
      let pout = 0; for (let i = 0; i < n; i++) pout += L[i] * L[i] + R[i] * R[i];
      const lm = this.match.run(pin / n, pout / n + 1e-12, n), amount = clamp01(macros.amount + mod[TARGET_AMOUNT]);
      for (let i = 0; i < n; i++) {
        this.amountSm += 0.002 * (amount - this.amountSm);
        L[i] = dryL[i] + (L[i] * lm - dryL[i]) * this.amountSm; R[i] = dryR[i] + (R[i] * lm - dryR[i]) * this.amountSm;
        for (const ch of [L, R]) { const a = Math.abs(ch[i]); if (a > 0.89) ch[i] = Math.sign(ch[i]) * (0.89 + 0.11 * Math.tanh((a - 0.89) / 0.11)); if (!isFinite(ch[i])) ch[i] = 0; }
      }
    }
    let op = 0; for (let i = 0; i < n; i++) op = Math.max(op, Math.abs(L[i]));
    this.outPk = Math.max(this.outPk, op);
    this.slots.forEach((s, i) => { this.levels[i] = Math.max(this.levels[i], s.level); s.level = 0; });
    this.beats += n / fs * this.bpm / 60;
    if (++this.tick % 12 === 0) {
      this.port.postMessage({ beats: this.beats, lanes: Array.from(this.laneV), lanePos: Array.from(this.laneP), levels: Array.from(this.levels), eff: this.eff, types: this.slots.map(s => s.cur), inPk: this.inPk, outPk: this.outPk });
      this.levels.fill(0); this.inPk = 0; this.outPk = 0;
    }
    return true;
  }
}
registerProcessor('motion', MotionWorklet);
