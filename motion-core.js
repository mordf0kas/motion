// motion-core.js — the browser twin of Source/Model (ModuleSpecs.h, Recipe.h, Dice.h).
// Same modules, same parameter ranges, same curated DICE recipes, locks, morph, breeding and taste model.
// Shared by the page (UI) and the AudioWorklet (DSP).

export const DIVS = ['1/32', '1/16T', '1/16', '1/16D', '1/8T', '1/8', '1/8D', '1/4T', '1/4', '1/4D', '1/2', '1 BAR', '2 BARS', '4 BARS'];
export const DIV_BEATS = [0.125, 1 / 6, 0.25, 0.375, 1 / 3, 0.5, 0.75, 2 / 3, 1, 1.5, 2, 4, 8, 16];
export const SHAPES = ['CURVE', 'STEP', 'SINE', 'TRIANGLE', 'RAMP UP', 'RAMP DOWN', 'SQUARE', 'RANDOM', 'ENVELOPE'];
export const STYLES = ['ANY', 'RUMBLE', 'FERRO', 'SIRENE', 'DUB', 'INDUSTRIAL'];
export const NUM_SLOTS = 5, NUM_PARAMS = 8, NUM_LANES = 6, LANE_POINTS = 16;
export const TARGET_MIX_BASE = 1 + NUM_SLOTS * NUM_PARAMS, TARGET_AMOUNT = TARGET_MIX_BASE + NUM_SLOTS;

const DARK = 1, DARKUP = 2, SPACE = 4, CHAOS = 8;
const P = (id, label, kind, lo, hi, def, unit = '', choices = null, roles = 0) => ({ id, label, kind, lo, hi, def, unit, choices, roles });

export const MODULES = [
  { id: 'off', name: 'VAZIO', blurb: 'Slot vazio: o som passa direto.', mix: 1, params: [] },
  { id: 'resonator', name: 'RESONATOR', mix: 0.5, blurb: 'Motor do ResoShift: 4 ressonadores afinados, excitados pelos transientes, em polirritmo com a DAW.', params: [
    P('mode', 'MODE', 'choice', 0, 3, 0, '', ['RUMBLE', 'METAL', 'TUBE', 'TONAL']),
    P('root', 'ROOT', 'choice', 0, 11, 5 / 11, '', ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']),
    P('color', 'COLOR', 'exp', 200, 12000, 0.55, 'Hz', null, DARK),
    P('decay', 'DECAY', 'lin', 0, 0.95, 0.45, '', null, SPACE),
    P('shift', 'SHIFT', 'bi', -1, 1, 0.5, '', null, CHAOS),
    P('drive', 'DRIVE', 'lin', 0, 1, 0.35, '%', null, DARKUP),
    P('density', 'DENSITY', 'lin', 0, 100, 0.55, '%', null, CHAOS),
    P('duck', 'DUCK', 'lin', 0, 1, 0.6, '%')] },
  { id: 'filter', name: 'FILTER', mix: 1, blurb: 'Filtro de 2/4 polos com drive dentro do loop e envolvente que segue os transientes.', params: [
    P('type', 'TYPE', 'choice', 0, 4, 0, '', ['LOW 24', 'LOW 12', 'BAND', 'HIGH', 'ACID']),
    P('cutoff', 'CUTOFF', 'exp', 30, 18000, 0.62, 'Hz', null, DARK),
    P('reso', 'RESO', 'lin', 0, 1, 0.25, '%'),
    P('drive', 'DRIVE', 'lin', 0, 1, 0.2, '%', null, DARKUP),
    P('env', 'ENV', 'bi', -1, 1, 0.5, '', null, CHAOS),
    P('envdecay', 'ENV DECAY', 'exp', 10, 800, 0.4, 'ms'),
    P('spread', 'SPREAD', 'lin', 0, 1, 0, '%', null, SPACE),
    P('lowkeep', 'LOW KEEP', 'exp', 20, 300, 0, 'Hz')] },
  { id: 'drive', name: 'DRIVE / CRUSH', mix: 1, blurb: 'Saturação, bitcrush e redução de sample rate. LOW KEEP deixa o sub limpo.', params: [
    P('mode', 'MODE', 'choice', 0, 4, 0, '', ['TAPE', 'TUBE', 'FOLD', 'CLIP', 'RECT']),
    P('drive', 'DRIVE', 'lin', 0, 36, 0.3, 'dB', null, DARKUP),
    P('tone', 'TONE', 'bi', -1, 1, 0.5, '', null, DARK),
    P('bits', 'BITS', 'lin', 16, 3, 0, 'bit', null, CHAOS),
    P('rate', 'DOWNSAMPLE', 'exp', 1, 40, 0, 'x', null, CHAOS),
    P('bias', 'BIAS', 'lin', 0, 1, 0, '%'),
    P('lowkeep', 'LOW KEEP', 'exp', 20, 300, 0.55, 'Hz'),
    P('trim', 'TRIM', 'lin', -12, 6, 12 / 18, 'dB')] },
  { id: 'gate', name: 'GATE / STUTTER', mix: 1, blurb: 'Trance gate sincronizado com padrões do nicho e stutter que repete fatias do próprio som.', params: [
    P('pattern', 'PATTERN', 'choice', 0, 7, 0, '', ['STRAIGHT', 'OFFBEAT', '3-3-2', 'BROKEN', 'TRIPLET', 'EUCLID 5', 'EUCLID 7', 'RANDOM']),
    P('rate', 'RATE', 'choice', 0, 13, 2 / 13, '', DIVS),
    P('depth', 'DEPTH', 'lin', 0, 1, 0.8, '%'),
    P('shape', 'SHAPE', 'lin', 0, 1, 0.35, '%', null, SPACE),
    P('stutter', 'STUTTER', 'lin', 0, 1, 0, '%', null, CHAOS),
    P('slice', 'SLICE', 'choice', 0, 3, 1 / 3, '', ['1/32', '1/16', '1/8', '1/4']),
    P('swing', 'SWING', 'lin', 0, 0.5, 0, '%')] },
  { id: 'shifter', name: 'FREQ SHIFTER', mix: 0.5, blurb: 'Frequency shifter (Hilbert) com feedback: de torção metálica a sirene barber-pole.', params: [
    P('shift', 'SHIFT', 'bi', -1, 1, 0.55, 'Hz', null, CHAOS),
    P('feedback', 'FEEDBACK', 'lin', 0, 0.92, 0.3, '%', null, SPACE),
    P('delay', 'DELAY', 'exp', 1, 400, 0.35, 'ms', null, SPACE),
    P('spread', 'SPREAD', 'lin', 0, 1, 0.25, '%', null, SPACE),
    P('tone', 'TONE', 'exp', 400, 16000, 0.75, 'Hz', null, DARK),
    P('lowcut', 'LOW CUT', 'exp', 20, 1000, 0.25, 'Hz')] },
  { id: 'delay', name: 'DUB DELAY', mix: 0.35, blurb: 'Delay de fita: saturação e filtros no loop, wow & flutter, ping-pong e difusão.', params: [
    P('time', 'TIME', 'choice', 0, 13, 6 / 13, '', DIVS),
    P('feedback', 'FEEDBACK', 'lin', 0, 1.05, 0.5, '%', null, SPACE),
    P('tone', 'TONE', 'exp', 500, 14000, 0.5, 'Hz', null, DARK),
    P('lowcut', 'LOW CUT', 'exp', 20, 1200, 0.45, 'Hz', null, DARK),
    P('wobble', 'WOBBLE', 'lin', 0, 1, 0.15, '%', null, CHAOS),
    P('pingpong', 'PING-PONG', 'lin', 0, 1, 0.7, '%', null, SPACE),
    P('drive', 'DRIVE', 'lin', 0, 1, 0.3, '%', null, DARKUP),
    P('diffuse', 'DIFFUSE', 'lin', 0, 1, 0.2, '%', null, SPACE)] },
  { id: 'space', name: 'SPACE', mix: 0.3, blurb: 'Reverb FDN de 8 linhas com modulação, pre-delay e ducking pelo sinal seco.', params: [
    P('size', 'SIZE', 'lin', 0, 1, 0.55, '%', null, SPACE),
    P('decay', 'DECAY', 'exp', 0.3, 20, 0.45, 's', null, SPACE),
    P('damp', 'DAMP', 'exp', 1000, 18000, 0.5, 'Hz', null, DARK),
    P('predelay', 'PREDELAY', 'exp', 1, 250, 0.3, 'ms'),
    P('mod', 'MOD', 'lin', 0, 1, 0.3, '%', null, CHAOS),
    P('lowcut', 'LOW CUT', 'exp', 20, 1000, 0.55, 'Hz'),
    P('duck', 'DUCK', 'lin', 0, 1, 0.3, '%'),
    P('width', 'WIDTH', 'lin', 0, 1, 0.9, '%', null, SPACE)] },
];
export const MOD = Object.fromEntries(MODULES.map((m, i) => [m.id, i]));

export const clamp01 = x => (x !== x ? 0 : x < 0 ? 0 : x > 1 ? 1 : x);
export const choiceCount = s => Math.round(s.hi - s.lo) + 1;
export function toReal(s, n) {
  n = clamp01(n);
  if (s.kind === 'exp') return s.lo * Math.pow(s.hi / s.lo, n);
  if (s.kind === 'choice') return Math.round(s.lo + n * (s.hi - s.lo));
  return s.lo + n * (s.hi - s.lo);
}
export const choiceIndex = (s, n) => toReal(s, n);
export const choiceNorm = (s, i) => { const c = choiceCount(s); return c <= 1 ? 0 : clamp01(i / (c - 1)); };
export const shifterHz = b => b * b * b * 2000;
export function fmt(s, n) {
  const v = toReal(s, n);
  if (s.kind === 'choice') return s.choices[v];
  switch (s.unit) {
    case 'Hz': { const hz = s.id === 'shift' ? shifterHz(v) : v; return Math.abs(hz) >= 1000 ? (hz / 1000).toFixed(2) + ' kHz' : Math.abs(hz) >= 100 ? hz.toFixed(0) + ' Hz' : hz.toFixed(1) + ' Hz'; }
    case '%': return (s.hi > 1.5 ? v : v * 100).toFixed(0) + ' %';
    case 'ms': return v.toFixed(v < 10 ? 1 : 0) + ' ms';
    case 's': return v.toFixed(1) + ' s';
    case 'dB': return (v >= 0 ? '+' : '') + v.toFixed(1) + ' dB';
    case 'bit': return v > 15.5 ? 'OFF' : v.toFixed(1) + ' bit';
    case 'x': return v < 1.05 ? 'OFF' : v.toFixed(1) + ' x';
    default: return (s.kind === 'bi' && v >= 0 ? '+' : '') + v.toFixed(2);
  }
}
export const findParam = (type, id) => MODULES[type].params.findIndex(p => p.id === id);

export function applyMacros(s, n, m, noise) {
  if (s.kind === 'choice') return n;
  const dark = (m.dark - 0.5) * 2, space = (m.space - 0.5) * 2;
  if (s.roles & DARK) n -= 0.35 * dark;
  if (s.roles & DARKUP) n += 0.25 * dark;
  if (s.roles & SPACE) n += 0.3 * space;
  if (s.roles & CHAOS) n += 0.3 * m.chaos * noise;
  return clamp01(n);
}

// ------------------------------------------------------------------ recipes
export function defaultSlot(type) {
  const m = MODULES[type];
  return { type, on: true, mix: m.mix, p: Array.from({ length: NUM_PARAMS }, (_, i) => (i < m.params.length ? m.params[i].def : 0)) };
}
export const defaultLane = () => ({ target: 0, shape: 0, rate: 2, steps: 16, depth: 0, pts: new Array(LANE_POINTS).fill(0.5) });
export const initRecipe = () => ({ name: 'Init', style: '', slots: Array.from({ length: NUM_SLOTS }, () => defaultSlot(0)), lanes: Array.from({ length: NUM_LANES }, defaultLane), macros: { dark: 0.5, space: 0.5, chaos: 0, amount: 1 } });
export const clone = r => JSON.parse(JSON.stringify(r));

export function validate(r) {
  for (const s of r.slots) {
    const m = MODULES[s.type];
    s.mix = clamp01(s.mix);
    for (let i = 0; i < NUM_PARAMS; i++) s.p[i] = i < m.params.length ? clamp01(s.p[i]) : 0;
    if (m.id === 'delay') s.p[1] = Math.min(s.p[1], 0.93);
    if (m.id === 'shifter') s.p[1] = Math.min(s.p[1], 0.9);
    if (m.id === 'filter') s.p[2] = Math.min(s.p[2], 0.92);
    if (m.id === 'space') s.p[1] = Math.min(s.p[1], 0.9);
  }
  for (const l of r.lanes) {
    l.depth = Math.max(-1, Math.min(1, l.depth || 0));
    if (l.target > 0 && l.target < TARGET_MIX_BASE) {
      const slot = Math.floor((l.target - 1) / NUM_PARAMS), k = (l.target - 1) % NUM_PARAMS, m = MODULES[r.slots[slot].type];
      if (k >= m.params.length || m.params[k].kind === 'choice') l.target = 0;
    }
  }
  for (const k of ['dark', 'space', 'chaos', 'amount']) r.macros[k] = clamp01(r.macros[k]);
  return r;
}

// JSON form of the plugin (presets, AI recipes) -> internal
export function fromJson(j) {
  const r = initRecipe();
  r.name = j.name || 'Untitled'; r.style = j.style || '';
  (j.chain || []).slice(0, NUM_SLOTS).forEach((c, si) => {
    const type = MOD[c.module] ?? 0;
    const s = defaultSlot(type);
    s.on = c.on !== false; if (c.mix !== undefined) s.mix = +c.mix;
    MODULES[type].params.forEach((ps, i) => {
      const v = c.params && c.params[ps.id];
      if (v === undefined) return;
      if (ps.kind === 'choice') { const idx = ps.choices.indexOf(String(v).toUpperCase()); if (idx >= 0) s.p[i] = choiceNorm(ps, idx); }
      else s.p[i] = +v;
    });
    r.slots[si] = s;
  });
  (j.motion || []).slice(0, NUM_LANES).forEach((m, li) => {
    const l = defaultLane();
    const [a, b] = String(m.target).split('.');
    if (m.target === 'amount') l.target = TARGET_AMOUNT;
    else if (b === 'mix') l.target = TARGET_MIX_BASE + (+a - 1);
    else { const slot = +a - 1, k = findParam(r.slots[slot]?.type ?? 0, b); l.target = k >= 0 ? 1 + slot * NUM_PARAMS + k : 0; }
    l.shape = Math.max(0, SHAPES.indexOf(String(m.shape).toUpperCase()));
    l.rate = Math.max(0, DIVS.indexOf(String(m.rate).toUpperCase()));
    l.steps = m.steps || 16; l.depth = +m.depth || 0;
    if (m.points) l.pts = Array.from({ length: LANE_POINTS }, (_, i) => +m.points[Math.floor(i * m.points.length / LANE_POINTS)]);
    r.lanes[li] = l;
  });
  if (j.macros) Object.assign(r.macros, j.macros);
  return validate(r);
}

export function targetName(r, t) {
  if (t <= 0) return '— desligada —';
  if (t === TARGET_AMOUNT) return 'AMOUNT';
  if (t >= TARGET_MIX_BASE) return `S${t - TARGET_MIX_BASE + 1} MIX`;
  const s = Math.floor((t - 1) / NUM_PARAMS), k = (t - 1) % NUM_PARAMS, m = MODULES[r.slots[s].type];
  return `S${s + 1} ${k < m.params.length ? m.params[k].label : 'P' + (k + 1)}`;
}

// ------------------------------------------------------------------ DICE (curated, per style)
export class Rng {
  constructor(seed = (Math.random() * 2 ** 31) | 0) { this.s = seed >>> 0 || 1; }
  next() { let x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x >>> 0; return this.s / 4294967296; }
  uni(a, b) { return a + this.next() * (b - a); }
  chance(p) { return this.next() < p; }
  pick(a) { return a[Math.floor(this.next() * a.length)]; }
}
const d = { d32: 0, d16T: 1, d16: 2, d16D: 3, d8T: 4, d8: 5, d8D: 6, d4T: 7, d4: 8, d4D: 9, d2: 10, d1bar: 11, d2bar: 12, d4bar: 13 };

function set(s, id, v) { const i = findParam(s.type, id); if (i >= 0) s.p[i] = clamp01(v); }
function setR(s, g, id, a, b) { set(s, id, g.uni(a, b)); }
function setC(s, id, name) { const i = findParam(s.type, id), ps = MODULES[s.type].params[i]; s.p[i] = choiceNorm(ps, ps.choices.indexOf(name)); }
function setCi(s, id, idx) { const i = findParam(s.type, id); s.p[i] = choiceNorm(MODULES[s.type].params[i], idx); }
function motif(l, g) {
  const kind = Math.floor(g.next() * 5);
  for (let i = 0; i < LANE_POINTS; i++) {
    const t = i / LANE_POINTS;
    let v = [t, 0.5 - 0.5 * Math.cos(t * 2 * Math.PI), i % 4 === 0 ? 1 : i % 2 === 0 ? 0.45 : 0.15, i % 3 === 0 ? 1 : 0.2, g.next()][kind];
    l.pts[i] = clamp01(v + g.uni(-0.08, 0.08));
  }
}
export { motif };
function addLane(r, g, slot, id, shape, rate, lo, hi) {
  const k = findParam(r.slots[slot].type, id);
  if (k < 0) return;
  const l = r.lanes.find(x => x.target === 0);
  if (!l) return;
  Object.assign(l, defaultLane(), { target: 1 + slot * NUM_PARAMS + k, shape: SHAPES.indexOf(shape), rate, depth: g.uni(lo, hi) * (g.chance(0.2) ? -1 : 1) });
  motif(l, g);
}
function reso(g, mode, root) { const s = defaultSlot(MOD.resonator); setC(s, 'mode', mode); setCi(s, 'root', root); s.mix = g.uni(0.4, 0.65); return s; }

const STYLE_FNS = {
  RUMBLE(g, root) {
    const r = initRecipe();
    const a = reso(g, 'RUMBLE', root);
    setR(a, g, 'color', 0.18, 0.42); setR(a, g, 'decay', 0.55, 0.85); setR(a, g, 'shift', 0.46, 0.54); setR(a, g, 'drive', 0.3, 0.6); setR(a, g, 'density', 0.45, 0.85); setR(a, g, 'duck', 0.55, 0.85);
    r.slots[0] = a;
    const f = defaultSlot(MOD.filter); setC(f, 'type', g.chance(0.7) ? 'LOW 24' : 'ACID');
    setR(f, g, 'cutoff', 0.34, 0.55); setR(f, g, 'reso', 0.15, 0.45); setR(f, g, 'drive', 0.1, 0.35); setR(f, g, 'env', 0.52, 0.7); setR(f, g, 'envdecay', 0.3, 0.6);
    r.slots[1] = f;
    if (g.chance(0.55)) { const x = defaultSlot(MOD.drive); setC(x, 'mode', g.chance(0.6) ? 'TAPE' : 'TUBE'); setR(x, g, 'drive', 0.15, 0.4); setR(x, g, 'tone', 0.32, 0.5); setR(x, g, 'lowkeep', 0.45, 0.62); r.slots[2] = x; }
    const s = defaultSlot(MOD.space); setR(s, g, 'size', 0.6, 0.85); setR(s, g, 'decay', 0.45, 0.68); setR(s, g, 'damp', 0.12, 0.35); setR(s, g, 'duck', 0.3, 0.6); setR(s, g, 'lowcut', 0.5, 0.68); s.mix = g.uni(0.12, 0.28);
    r.slots[3] = s;
    addLane(r, g, 1, 'cutoff', 'CURVE', g.pick([d.d16, d.d8]), 0.15, 0.35);
    addLane(r, g, 0, 'decay', 'SINE', g.pick([d.d2bar, d.d4bar]), 0.1, 0.2);
    if (g.chance(0.5)) addLane(r, g, 0, 'color', 'RANDOM', g.pick([d.d8, d.d4]), 0.08, 0.18);
    r.macros = { dark: g.uni(0.55, 0.75), space: g.uni(0.45, 0.6), chaos: g.uni(0, 0.2), amount: 1 };
    return r;
  },
  FERRO(g, root) {
    const r = initRecipe();
    const a = reso(g, 'METAL', root);
    setR(a, g, 'color', 0.5, 0.8); setR(a, g, 'decay', 0.3, 0.6); setR(a, g, 'shift', 0.44, 0.6); setR(a, g, 'drive', 0.2, 0.55); setR(a, g, 'density', 0.4, 0.8); setR(a, g, 'duck', 0.4, 0.75);
    r.slots[0] = a;
    const x = defaultSlot(MOD.drive); setC(x, 'mode', g.pick(['FOLD', 'CLIP', 'TUBE'])); setR(x, g, 'drive', 0.3, 0.6); setR(x, g, 'tone', 0.45, 0.65); setR(x, g, 'lowkeep', 0.4, 0.6);
    if (g.chance(0.4)) setR(x, g, 'bits', 0.15, 0.4);
    r.slots[1] = x;
    let n = 2;
    if (g.chance(0.5)) { const ga = defaultSlot(MOD.gate); setC(ga, 'pattern', g.pick(['BROKEN', 'EUCLID 5', 'EUCLID 7', '3-3-2'])); setCi(ga, 'rate', d.d16); setR(ga, g, 'depth', 0.5, 0.85); setR(ga, g, 'shape', 0.15, 0.4); setR(ga, g, 'stutter', 0, 0.25); r.slots[n++] = ga; }
    const dl = defaultSlot(MOD.delay); setCi(dl, 'time', g.pick([d.d16D, d.d8T, d.d8D])); setR(dl, g, 'feedback', 0.3, 0.55); setR(dl, g, 'tone', 0.4, 0.7); setR(dl, g, 'lowcut', 0.5, 0.7); setR(dl, g, 'pingpong', 0.6, 1); dl.mix = g.uni(0.2, 0.35);
    r.slots[n] = dl;
    addLane(r, g, 0, 'color', 'STEP', d.d16, 0.15, 0.35);
    addLane(r, g, 1, 'drive', 'CURVE', g.pick([d.d8, d.d4]), 0.1, 0.25);
    r.macros = { dark: g.uni(0.35, 0.55), space: g.uni(0.4, 0.55), chaos: g.uni(0.1, 0.35), amount: 1 };
    return r;
  },
  SIRENE(g, root) {
    const r = initRecipe();
    const a = reso(g, g.pick(['TUBE', 'TONAL']), root);
    setR(a, g, 'color', 0.4, 0.7); setR(a, g, 'decay', 0.6, 0.88); set(a, 'shift', g.chance(0.5) ? g.uni(0.68, 0.85) : g.uni(0.15, 0.32)); setR(a, g, 'density', 0.35, 0.7); setR(a, g, 'duck', 0.5, 0.8);
    r.slots[0] = a;
    const sh = defaultSlot(MOD.shifter); set(sh, 'shift', g.chance(0.5) ? g.uni(0.56, 0.68) : g.uni(0.32, 0.44)); setR(sh, g, 'feedback', 0.45, 0.78); setR(sh, g, 'delay', 0.3, 0.6); setR(sh, g, 'spread', 0.5, 0.9); setR(sh, g, 'tone', 0.5, 0.8); sh.mix = g.uni(0.3, 0.55);
    r.slots[1] = sh;
    const dl = defaultSlot(MOD.delay); setCi(dl, 'time', g.pick([d.d8D, d.d4, d.d4D])); setR(dl, g, 'feedback', 0.45, 0.7); setR(dl, g, 'tone', 0.3, 0.55); setR(dl, g, 'wobble', 0.1, 0.35); dl.mix = g.uni(0.2, 0.35);
    r.slots[2] = dl;
    const s = defaultSlot(MOD.space); setR(s, g, 'size', 0.65, 0.95); setR(s, g, 'decay', 0.55, 0.75); setR(s, g, 'mod', 0.3, 0.6); s.mix = g.uni(0.15, 0.3);
    r.slots[3] = s;
    addLane(r, g, 1, 'shift', 'RAMP UP', g.pick([d.d2bar, d.d4bar]), 0.08, 0.2);
    addLane(r, g, 2, 'tone', 'SINE', g.pick([d.d1bar, d.d2bar]), 0.15, 0.3);
    r.macros = { dark: g.uni(0.4, 0.6), space: g.uni(0.55, 0.75), chaos: g.uni(0.1, 0.3), amount: 1 };
    return r;
  },
  DUB(g, root) {
    const r = initRecipe();
    const f = defaultSlot(MOD.filter); setC(f, 'type', g.pick(['BAND', 'LOW 12', 'HIGH'])); setR(f, g, 'cutoff', 0.45, 0.7); setR(f, g, 'reso', 0.2, 0.5); setR(f, g, 'env', 0.45, 0.62); setR(f, g, 'lowkeep', 0.45, 0.65);
    r.slots[0] = f;
    let n = 1;
    if (g.chance(0.45)) { const a = reso(g, 'TONAL', root); setR(a, g, 'color', 0.3, 0.55); setR(a, g, 'decay', 0.45, 0.75); setR(a, g, 'density', 0.3, 0.6); a.mix = g.uni(0.25, 0.45); r.slots[n++] = a; }
    const dl = defaultSlot(MOD.delay); setCi(dl, 'time', g.pick([d.d8D, d.d4D, d.d4T, d.d8]));
    setR(dl, g, 'feedback', 0.55, 0.8); setR(dl, g, 'tone', 0.25, 0.5); setR(dl, g, 'lowcut', 0.45, 0.65); setR(dl, g, 'wobble', 0.2, 0.45); setR(dl, g, 'pingpong', 0.7, 1); setR(dl, g, 'drive', 0.25, 0.55); setR(dl, g, 'diffuse', 0.1, 0.45); dl.mix = g.uni(0.3, 0.5);
    const dSlot = n; r.slots[n++] = dl;
    const s = defaultSlot(MOD.space); setR(s, g, 'size', 0.7, 0.95); setR(s, g, 'decay', 0.55, 0.78); setR(s, g, 'damp', 0.15, 0.4); setR(s, g, 'duck', 0.2, 0.5); s.mix = g.uni(0.18, 0.35);
    r.slots[n] = s;
    addLane(r, g, dSlot, 'feedback', 'CURVE', g.pick([d.d8, d.d4]), 0.1, 0.22);
    addLane(r, g, 0, 'cutoff', 'SINE', g.pick([d.d1bar, d.d2bar]), 0.15, 0.3);
    r.macros = { dark: g.uni(0.5, 0.7), space: g.uni(0.55, 0.75), chaos: g.uni(0, 0.2), amount: 1 };
    return r;
  },
  INDUSTRIAL(g, root) {
    const r = initRecipe();
    const x = defaultSlot(MOD.drive); setC(x, 'mode', g.pick(['CLIP', 'RECT', 'FOLD'])); setR(x, g, 'drive', 0.45, 0.8); setR(x, g, 'tone', 0.4, 0.6); setR(x, g, 'lowkeep', 0.35, 0.6); setR(x, g, 'bits', 0.15, 0.5); setR(x, g, 'rate', 0.05, 0.3);
    r.slots[0] = x;
    const ga = defaultSlot(MOD.gate); setC(ga, 'pattern', g.pick(['BROKEN', 'EUCLID 5', 'EUCLID 7', 'RANDOM', 'OFFBEAT'])); setCi(ga, 'rate', g.pick([d.d16, d.d32])); setR(ga, g, 'depth', 0.6, 0.95); setR(ga, g, 'shape', 0.05, 0.3); setR(ga, g, 'stutter', 0.1, 0.35);
    r.slots[1] = ga;
    const f = defaultSlot(MOD.filter); setC(f, 'type', g.pick(['HIGH', 'BAND', 'ACID'])); setR(f, g, 'cutoff', 0.35, 0.65); setR(f, g, 'reso', 0.3, 0.65); setR(f, g, 'drive', 0.2, 0.5); setR(f, g, 'lowkeep', 0.4, 0.6);
    r.slots[2] = f;
    if (g.chance(0.5)) { const a = reso(g, 'METAL', root); setR(a, g, 'color', 0.45, 0.75); setR(a, g, 'decay', 0.25, 0.5); a.mix = g.uni(0.25, 0.45); r.slots[3] = a; }
    const s = defaultSlot(MOD.space); setR(s, g, 'size', 0.2, 0.5); setR(s, g, 'decay', 0.25, 0.45); setR(s, g, 'duck', 0.3, 0.6); s.mix = g.uni(0.1, 0.25);
    r.slots[4] = s;
    addLane(r, g, 0, 'drive', 'STEP', d.d16, 0.15, 0.3);
    addLane(r, g, 2, 'cutoff', 'RANDOM', g.pick([d.d16, d.d8]), 0.15, 0.3);
    addLane(r, g, 1, 'stutter', 'CURVE', d.d1bar, 0.1, 0.25);
    r.macros = { dark: g.uni(0.4, 0.6), space: g.uni(0.35, 0.5), chaos: g.uni(0.2, 0.45), amount: 1 };
    return r;
  },
};

const ADJ = ['Warehouse', 'Concrete', 'Night', 'Hollow', 'Rust', 'Deep', 'Iron', 'Fog', 'Tunnel', 'Static', 'Sodium', 'Basement'];
const NOUN = ['Rumble', 'Pulse', 'Siren', 'Loop', 'Ritual', 'Drone', 'Engine', 'Breath', 'Signal', 'Dub', 'Grid', 'Ghost'];
export function generate(style, g, root = -1) {
  if (style === 'ANY') style = g.pick(STYLES.slice(1));
  if (root < 0) root = g.pick([5, 6, 7, 9, 2, 4, 1]);
  const r = STYLE_FNS[style](g, root);
  r.style = style;
  r.name = g.pick(ADJ) + ' ' + g.pick(NOUN);
  return validate(r);
}

export function applyLocks(cur, fresh, locks) {
  fresh = clone(fresh);
  for (let s = 0; s < NUM_SLOTS; s++) {
    if (locks.slot[s]) { fresh.slots[s] = clone(cur.slots[s]); continue; }
    if (!locks.param[s].some(Boolean)) continue;
    if (fresh.slots[s].type !== cur.slots[s].type) { const mix = fresh.slots[s].mix; fresh.slots[s] = clone(cur.slots[s]); fresh.slots[s].mix = mix; }
    locks.param[s].forEach((on, i) => { if (on) fresh.slots[s].p[i] = cur.slots[s].p[i]; });
  }
  locks.lane.forEach((on, l) => { if (on) fresh.lanes[l] = clone(cur.lanes[l]); });
  if (locks.macros) fresh.macros = { ...cur.macros };
  return validate(fresh);
}

export function breed(a, b, g, mutation = 0.08) {
  const c = initRecipe();
  for (let s = 0; s < NUM_SLOTS; s++) {
    const x = a.slots[s], y = b.slots[s];
    if (x.type === y.type) {
      const t = g.next(), m = MODULES[x.type];
      c.slots[s] = clone(x);
      c.slots[s].mix = x.mix + t * (y.mix - x.mix);
      m.params.forEach((ps, i) => { c.slots[s].p[i] = ps.kind === 'choice' ? (g.chance(0.5) ? x.p[i] : y.p[i]) : x.p[i] + t * (y.p[i] - x.p[i]); });
    } else c.slots[s] = clone(g.chance(0.5) ? x : y);
    MODULES[c.slots[s].type].params.forEach((ps, i) => { if (ps.kind !== 'choice' && g.chance(0.35)) c.slots[s].p[i] = clamp01(c.slots[s].p[i] + g.uni(-1, 1) * mutation); });
  }
  for (let l = 0; l < NUM_LANES; l++) {
    const parent = g.chance(0.5) ? a : b, src = parent.lanes[l];
    c.lanes[l] = clone(src);
    if (src.target > 0 && src.target < TARGET_MIX_BASE) { const slot = Math.floor((src.target - 1) / NUM_PARAMS); if (parent.slots[slot].type !== c.slots[slot].type) c.lanes[l].target = 0; }
  }
  const t = g.next();
  for (const k of ['dark', 'space', 'chaos', 'amount']) c.macros[k] = a.macros[k] + t * (b.macros[k] - a.macros[k]);
  c.name = a.name.split(' ')[0] + ' x ' + b.name.split(' ').pop();
  c.style = 'BREED';
  return validate(c);
}

export function morph(snaps, x, y) {
  const w = [(1 - x) * (1 - y), x * (1 - y), (1 - x) * y, x * y];
  let lead = 0; for (let i = 1; i < 4; i++) if (w[i] > w[lead]) lead = i;
  const out = clone(snaps[lead]);
  for (let s = 0; s < NUM_SLOTS; s++) {
    const type = snaps[lead].slots[s].type, m = MODULES[type];
    let ws = 0, mix = 0; const p = new Array(NUM_PARAMS).fill(0);
    snaps.forEach((sn, i) => { const sl = sn.slots[s]; if (sl.type !== type) return; ws += w[i]; mix += w[i] * sl.mix; sl.p.forEach((v, k) => (p[k] += w[i] * v)); });
    if (ws > 1e-6) { out.slots[s].mix = mix / ws; m.params.forEach((ps, k) => { if (ps.kind !== 'choice') out.slots[s].p[k] = p[k] / ws; }); }
  }
  for (let l = 0; l < NUM_LANES; l++) {
    const target = snaps[lead].lanes[l].target;
    let ws = 0, depth = 0; const pts = new Array(LANE_POINTS).fill(0);
    snaps.forEach((sn, i) => { const ln = sn.lanes[l]; if (ln.target !== target) return; ws += w[i]; depth += w[i] * ln.depth; ln.pts.forEach((v, k) => (pts[k] += w[i] * v)); });
    if (ws > 1e-6) { out.lanes[l].depth = depth / ws; out.lanes[l].pts = pts.map(v => v / ws); }
  }
  for (const k of ['dark', 'space', 'chaos', 'amount']) out.macros[k] = snaps.reduce((a, sn, i) => a + w[i] * sn.macros[k], 0);
  out.name = 'Morph';
  return validate(out);
}

// ------------------------------------------------------------------ taste model (logistic regression)
export function features(r) {
  const f = new Array(24).fill(0); f[0] = 1;
  let dark = 0, dn = 0, space = 0, sn = 0, chaos = 0, cn = 0, wet = 0, wn = 0;
  for (const s of r.slots) {
    if (!s.type || !s.on) continue;
    f[s.type] = 1;
    MODULES[s.type].params.forEach((ps, i) => {
      const v = s.p[i];
      if (ps.roles & DARK) { dark += 1 - v; dn++; }
      if (ps.roles & DARKUP) { dark += v; dn++; }
      if (ps.roles & SPACE) { space += v; sn++; }
      if (ps.roles & CHAOS) { chaos += Math.abs(v - (ps.kind === 'bi' ? 0.5 : 0)); cn++; }
    });
    wet += s.mix; wn++;
    if (s.type === MOD.resonator) f[8 + choiceIndex(MODULES[s.type].params[0], s.p[0])] = 1;
  }
  f[12] = dn ? dark / dn : 0.5; f[13] = sn ? space / sn : 0.5; f[14] = cn ? chaos / cn : 0; f[15] = wn ? wet / wn : 0;
  const lanes = r.lanes.filter(l => l.target > 0);
  f[16] = lanes.length / NUM_LANES; f[17] = lanes.length ? lanes.reduce((a, l) => a + Math.abs(l.depth), 0) / lanes.length : 0;
  f[18] = lanes.length ? lanes.filter(l => l.rate <= 5).length / lanes.length : 0;
  f[19] = r.macros.dark; f[20] = r.macros.space; f[21] = r.macros.chaos; f[22] = r.slots.filter(s => s.type).length / NUM_SLOTS;
  return f;
}
export class Taste {
  constructor(samples = []) { this.samples = samples; this.w = new Array(24).fill(0); this.train(); }
  rate(r, liked) { this.samples.push({ f: features(r), y: liked ? 1 : 0 }); if (this.samples.length > 400) this.samples.shift(); this.train(); }
  train() {
    this.w.fill(0);
    if (!this.samples.length) return;
    for (let e = 0; e < 300; e++) {
      const gr = new Array(24).fill(0);
      for (const s of this.samples) { const z = s.f.reduce((a, v, i) => a + v * this.w[i], 0); const err = 1 / (1 + Math.exp(-z)) - s.y; s.f.forEach((v, i) => (gr[i] += err * v)); }
      for (let i = 0; i < 24; i++) this.w[i] -= 0.5 * (gr[i] / this.samples.length + (i ? 0.05 * this.w[i] : 0));
    }
  }
  logit(r) { return features(r).reduce((a, v, i) => a + v * this.w[i], 0); }
  draw(style, g, root) {
    if (this.samples.length < 3 || g.chance(0.12)) return generate(style, g, root);
    const c = Array.from({ length: 12 }, () => generate(style, g, root));
    const z = c.map(r => this.logit(r)), mx = Math.max(...z), e = z.map(v => Math.exp(v - mx)), sum = e.reduce((a, b) => a + b, 0);
    let x = g.next() * sum;
    for (let i = 0; i < c.length; i++) { x -= e[i]; if (x <= 0) return c[i]; }
    return c[c.length - 1];
  }
}
