// app.js — the Motion web demo: the same workflow as the plugin (DICE, history, locks, taste, breed,
// morph, lanes, macros) driving the DSP port in motion-worklet.js. Also fills the audio examples
// and the module table.
import { MODULES, MOD, DIVS, SHAPES, STYLES, NUM_SLOTS, NUM_PARAMS, NUM_LANES, LANE_POINTS, TARGET_MIX_BASE, TARGET_AMOUNT,
         fmt, toReal, choiceIndex, choiceNorm, clamp01, defaultSlot, defaultLane, initRecipe, clone, validate, fromJson, targetName,
         Rng, generate, applyLocks, breed, morph, motif, Taste } from './motion-core.js';

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const rng = new Rng();
const store = { get(k, d) { try { const v = localStorage.getItem('motion.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
                set(k, v) { try { localStorage.setItem('motion.' + k, JSON.stringify(v)); } catch { /* private mode */ } } };

// ------------------------------------------------------------------ state
const S = {
  recipe: initRecipe(), history: [], hi: -1, style: 'ANY', sel: 0, lane: 0,
  locks: { slot: new Array(NUM_SLOTS).fill(false), param: Array.from({ length: NUM_SLOTS }, () => new Array(NUM_PARAMS).fill(false)), lane: new Array(NUM_LANES).fill(false), macros: false },
  snaps: [null, null, null, null], morph: { on: false, x: 0.5, y: 0.5 },
  taste: new Taste(store.get('taste', [])), presets: [], tele: null, ctx: null, node: null, analyser: null, bypass: false, bpm: 128,
};

function send() {
  if (!S.node) return;
  let r = S.recipe;
  if (S.morph.on) { const cur = S.recipe; r = morph(S.snaps.map(s => s || cur), S.morph.x, S.morph.y); }
  S.node.port.postMessage({ recipe: r });
}
function apply(r, push = true) {
  S.recipe = validate(clone(r));
  if (push) { S.history.splice(S.hi + 1); S.history.push(clone(S.recipe)); if (S.history.length > 100) S.history.shift(); S.hi = S.history.length - 1; }
  send(); renderAll();
}
function edited() { if (S.hi >= 0) S.history[S.hi] = clone(S.recipe); send(); }
function roll(style = S.style) { apply(applyLocks(S.recipe, S.taste.draw(style, rng, -1), S.locks)); }

// ------------------------------------------------------------------ knob
function knob({ label, get, set, format, bipolar = false, def = 0.5, lockable = null, laneable = null }) {
  const w = el('div', 'knob');
  w.innerHTML = `<span class="lab">${label}</span><svg viewBox="0 0 100 100" role="slider" tabindex="0" aria-label="${label}">
    <path class="trk" d="" fill="none" stroke="#2e3a33" stroke-width="7" stroke-linecap="round"/>
    <path class="val" d="" fill="none" stroke="#b7ff3b" stroke-width="7" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="30" fill="url(#kb)" stroke="#4a5a50" stroke-width="1"/>
    <line class="ptr" x1="50" y1="50" x2="50" y2="26" stroke="#b7ff3b" stroke-width="4" stroke-linecap="round"/>
    <circle class="mod" r="4" fill="#d6ff7a" cx="-10" cy="-10"/>
    <defs><radialGradient id="kb" cx=".35" cy=".3"><stop offset="0" stop-color="#2a3330"/><stop offset=".55" stop-color="#10171a"/><stop offset="1" stop-color="#070a0b"/></radialGradient></defs>
  </svg><span class="val"></span><span class="tools"></span>`;
  const svg = w.querySelector('svg'), val = w.querySelector('span.val'), tools = w.querySelector('.tools');
  const A0 = -135, A1 = 135, R = 40;
  const pt = a => { const r = (a - 90) * Math.PI / 180; return [50 + R * Math.cos(r), 50 + R * Math.sin(r)]; };
  const arc = (a, b) => { if (b < a) [a, b] = [b, a]; const [x0, y0] = pt(a), [x1, y1] = pt(b); return `M${x0} ${y0} A${R} ${R} 0 ${b - a > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  svg.querySelector('.trk').setAttribute('d', arc(A0, A1));
  let lockBtn = null;
  if (lockable) { lockBtn = el('button', 'lock'); lockBtn.title = 'Cadeado: o DICE não mexe'; lockBtn.onclick = () => { lockable.toggle(); update(); }; tools.append(lockBtn); }
  if (laneable) { const b = el('button', '', '→ lane'); b.title = 'Mover este parâmetro com a lane selecionada'; b.onclick = laneable; tools.append(b); }
  function update(eff) {
    const v = get(), a = A0 + v * (A1 - A0);
    svg.querySelector('.val').setAttribute('d', bipolar ? arc(0, a) : arc(A0, a));
    const r = (a - 90) * Math.PI / 180;
    svg.querySelector('.ptr').setAttribute('x2', 50 + 24 * Math.cos(r)); svg.querySelector('.ptr').setAttribute('y2', 50 + 24 * Math.sin(r));
    val.textContent = format(v);
    const m = svg.querySelector('.mod');
    if (eff !== undefined && Math.abs(eff - v) > 0.004) { const ea = (A0 + eff * (A1 - A0) - 90) * Math.PI / 180; m.setAttribute('cx', 50 + 47 * Math.cos(ea)); m.setAttribute('cy', 50 + 47 * Math.sin(ea)); }
    else m.setAttribute('cx', -10);
    if (lockable) { const on = lockable.get(); lockBtn.classList.toggle('on', on); w.classList.toggle('locked', on); }
  }
  let y0 = 0, v0 = 0;
  svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); y0 = e.clientY; v0 = get(); });
  svg.addEventListener('pointermove', e => { if (!svg.hasPointerCapture(e.pointerId)) return; set(clamp01(v0 + (y0 - e.clientY) / (e.shiftKey ? 600 : 160))); update(); });
  svg.addEventListener('dblclick', () => { set(def); update(); });
  svg.addEventListener('wheel', e => { e.preventDefault(); set(clamp01(get() - Math.sign(e.deltaY) * 0.02)); update(); }, { passive: false });
  svg.addEventListener('keydown', e => { const d = { ArrowUp: 0.02, ArrowRight: 0.02, ArrowDown: -0.02, ArrowLeft: -0.02 }[e.key]; if (d) { e.preventDefault(); set(clamp01(get() + d)); update(); } });
  update();
  return { el: w, update };
}

// ------------------------------------------------------------------ header
function fillSelect(sel, items, value) { sel.innerHTML = ''; items.forEach((t, i) => { const o = el('option', '', t); o.value = i; sel.append(o); }); if (value !== undefined) sel.value = value; }
fillSelect($('#style'), STYLES, 0);
$('#style').onchange = e => { S.style = STYLES[e.target.value]; };
$('#dice').onclick = () => roll();
$('#back').onclick = () => { if (S.hi > 0) { S.history[S.hi] = clone(S.recipe); S.hi--; apply(S.history[S.hi], false); } };
$('#fwd').onclick = () => { if (S.hi < S.history.length - 1) { S.history[S.hi] = clone(S.recipe); S.hi++; apply(S.history[S.hi], false); } };
$('#like').onclick = () => { S.taste.rate(S.recipe, true); store.set('taste', S.taste.samples); flash($('#like')); };
$('#dislike').onclick = () => { S.taste.rate(S.recipe, false); store.set('taste', S.taste.samples); roll(); };
$('#preset').onchange = e => { const i = +e.target.value; if (i >= 0) apply(S.presets[i]); e.target.value = -1; };
function flash(b) { b.animate([{ background: '#b7ff3b' }, { background: '' }], { duration: 500 }); }
document.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea') || !$('#demo').contains(document.activeElement) && document.activeElement !== document.body) return;
  if (e.key === 'd' || e.key === 'D') roll();
  else if (e.key === 'ArrowLeft' && document.activeElement === document.body) $('#back').click();
  else if (e.key === 'ArrowRight' && document.activeElement === document.body) $('#fwd').click();
});

// breed
$('#breedBtn').onclick = () => { const b = $('#breed'); b.hidden = !b.hidden; $('#breedBtn').classList.toggle('on', !b.hidden); if (!b.hidden) litter(); };
$('#breedAgain').onclick = litter;
function litter() {
  const a = S.recipe, b = S.hi > 0 ? S.history[S.hi - 1] : generate(S.style, rng);
  const kids = $('#kids'); kids.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const c = applyLocks(a, breed(a, b, rng, 0.06 + 0.03 * i), S.locks);
    const btn = el('button', 'btn ghost small', `${i + 1} · ${c.name.toUpperCase()}`);
    btn.onclick = () => { apply(c); kids.querySelectorAll('button').forEach(x => x.classList.remove('on')); btn.classList.add('on'); };
    kids.append(btn);
  }
}

// ------------------------------------------------------------------ chain
const cards = [];
for (let s = 0; s < NUM_SLOTS; s++) {
  const c = el('div', 'card');
  c.innerHTML = `<div class="head"><span class="num">${s + 1}</span><select aria-label="Módulo do slot ${s + 1}"></select><button class="lock" aria-label="Cadeado no slot"></button><button class="dot" aria-label="Ligar / desligar"></button></div>
    <canvas width="400" height="120"></canvas><div class="mixrow"><span>MIX</span><input type="range" min="0" max="1" step="0.005" aria-label="Mix"><span class="mv"></span></div>`;
  const sel = c.querySelector('select');
  fillSelect(sel, MODULES.map(m => m.name));
  sel.onchange = () => {
    S.recipe.slots[s] = defaultSlot(+sel.value);
    S.recipe.lanes.forEach(l => { if (l.target > 0 && l.target < TARGET_MIX_BASE && Math.floor((l.target - 1) / NUM_PARAMS) === s) l.target = 0; });
    S.sel = s; apply(S.recipe);
  };
  c.querySelector('.lock').onclick = e => { e.stopPropagation(); S.locks.slot[s] = !S.locks.slot[s]; renderChain(); };
  c.querySelector('.dot').onclick = e => { e.stopPropagation(); S.recipe.slots[s].on = !S.recipe.slots[s].on; edited(); renderChain(); };
  const mix = c.querySelector('input');
  mix.oninput = () => { S.recipe.slots[s].mix = +mix.value; c.querySelector('.mv').textContent = Math.round(mix.value * 100) + '%'; edited(); };
  c.addEventListener('click', e => { if (e.target.closest('select, input, button')) return; S.sel = s; renderChain(); renderEditor(); });
  $('#chain').append(c);
  cards.push({ c, sel, mix, cv: c.querySelector('canvas'), level: 0, phase: 0 });
}
function renderChain() {
  cards.forEach((k, s) => {
    const sl = S.recipe.slots[s];
    k.sel.value = sl.type; k.mix.value = sl.mix; k.c.querySelector('.mv').textContent = Math.round(sl.mix * 100) + '%';
    k.c.classList.toggle('sel', s === S.sel);
    k.c.querySelector('.lock').classList.toggle('on', S.locks.slot[s]);
    k.c.querySelector('.dot').classList.toggle('on', sl.on && sl.type > 0);
  });
}
function gateOn(p, i) { i &= 15; return [true, i % 4 === 2, [0, 3, 6, 8, 11, 14].includes(i), !![1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0][i], i % 3 !== 2, (i * 5) % 16 < 5, (i * 7) % 16 < 7, i % 4 === 0][p]; }
function drawCards() {
  cards.forEach((k, s) => {
    const g = k.cv.getContext('2d'), W = k.cv.width, H = k.cv.height, type = S.recipe.slots[s].type;
    g.clearRect(0, 0, W, H);
    const lv = S.tele ? Math.min(1, S.tele.levels[s] * 1.4) : 0;
    k.level = Math.max(lv, k.level * 0.85); k.phase += 0.04;
    if (!type) { g.fillStyle = '#8a938e'; g.font = '20px Michroma'; g.textAlign = 'center'; g.fillText('+ escolher módulo', W / 2, H / 2 + 7); return; }
    const e = (S.tele && S.tele.eff[s]) || S.recipe.slots[s].p;
    g.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60; let y = 0;
      switch (MODULES[type].id) {
        case 'resonator': y = Math.sin(t * 30 * (0.3 + e[2]) + k.phase * 3) * Math.exp(-t * (4 - 3.5 * e[3])); break;
        case 'filter': { const dd = t - e[1]; y = Math.max(-1, Math.min(1, (dd < 0 ? 0.6 : 0.6 - dd * 4) + e[2] * 0.8 * Math.exp(-dd * dd * 400))) - 0.2; break; }
        case 'drive': y = Math.tanh(Math.sin(t * 12 + k.phase) * (1 + 6 * e[1])) * 0.8; break;
        case 'gate': y = gateOn(choiceIndex(MODULES[type].params[0], e[0]), Math.floor(t * 16)) ? 0.7 : -0.5; break;
        case 'shifter': y = Math.sin(t * (18 + 40 * Math.abs(e[0] - 0.5) * t) + k.phase * 2) * 0.7; break;
        case 'delay': { const kk = (t * 5) % 1; y = Math.exp(-kk * 18) * Math.pow(e[1], Math.floor(t * 5)) * 1.4 - 0.6; break; }
        default: y = (Math.sin(t * 90 + k.phase * 7) * 0.5 + Math.sin(t * 37 - k.phase * 5) * 0.5) * Math.exp(-t * (1 + 3 * (1 - e[1]))) * 0.8;
      }
      const x = 8 + t * (W - 16), yy = H / 2 - y * H * 0.36 * (0.35 + 0.65 * k.level);
      i ? g.lineTo(x, yy) : g.moveTo(x, yy);
    }
    g.strokeStyle = `rgba(183,255,59,${0.15 + 0.3 * k.level})`; g.lineWidth = 7; g.stroke();
    g.strokeStyle = `rgba(183,255,59,${0.55 + 0.45 * k.level})`; g.lineWidth = 2.5; g.stroke();
  });
}

// ------------------------------------------------------------------ slot editor
let paramKnobs = [];
function renderEditor() {
  const s = S.sel, sl = S.recipe.slots[s], m = MODULES[sl.type];
  $('#slotTitle').textContent = `SLOT ${s + 1} · ${m.name}`;
  $('#slotBlurb').textContent = sl.type ? m.blurb : 'Slot vazio: escolhe um módulo no cartão acima, ou carrega em DICE.';
  const box = $('#params'); box.innerHTML = ''; paramKnobs = [];
  m.params.forEach((ps, i) => {
    if (ps.kind === 'choice') {
      const w = el('div', 'knob'), lab = el('span', 'lab', ps.label), sel = el('select');
      fillSelect(sel, ps.choices, choiceIndex(ps, sl.p[i]));
      sel.onchange = () => { sl.p[i] = choiceNorm(ps, +sel.value); edited(); };
      w.append(lab, sel); box.append(w); paramKnobs.push(null);
      return;
    }
    const k = knob({
      label: ps.label, get: () => S.recipe.slots[s].p[i], set: v => { S.recipe.slots[s].p[i] = v; edited(); }, format: v => fmt(ps, v), bipolar: ps.kind === 'bi', def: ps.def,
      lockable: { get: () => S.locks.param[s][i], toggle: () => { S.locks.param[s][i] = !S.locks.param[s][i]; } },
      laneable: () => { const l = S.recipe.lanes[S.lane]; l.target = 1 + s * NUM_PARAMS + i; if (Math.abs(l.depth) < 0.05) l.depth = 0.3; edited(); renderLane(); },
    });
    box.append(k.el); paramKnobs[i] = k;
  });
}

// ------------------------------------------------------------------ macros + morph
const macroKnobs = ['dark', 'space', 'chaos', 'amount'].map((id, i) => {
  const k = knob({ label: id.toUpperCase(), get: () => S.recipe.macros[id], set: v => { S.recipe.macros[id] = v; edited(); },
    format: v => (i < 2 ? Math.round((v - 0.5) * 200) : Math.round(v * 100) + ' %') + '', bipolar: i < 2, def: [0.5, 0.5, 0, 1][i] });
  $('#macroKnobs').append(k.el); return k;
});
$('#macroLock').onclick = () => { S.locks.macros = !S.locks.macros; $('#macroLock').classList.toggle('on', S.locks.macros); };
const mcv = $('#morph');
function morphCorner(x, y) { const W = mcv.width, H = mcv.height, s = 56; return [[0, 0], [W - s, 0], [0, H - s], [W - s, H - s]].findIndex(([cx, cy]) => x >= cx && x <= cx + s && y >= cy && y <= cy + s); }
mcv.addEventListener('pointerdown', e => {
  const r = mcv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * mcv.width, y = (e.clientY - r.top) / r.height * mcv.height, c = morphCorner(x, y);
  if (c >= 0) {
    if (!S.snaps[c] || e.shiftKey) S.snaps[c] = clone(S.recipe); else if (!S.morph.on) apply(S.snaps[c]);
    return;
  }
  mcv.setPointerCapture(e.pointerId); moveMorph(e);
});
mcv.addEventListener('pointermove', e => { if (mcv.hasPointerCapture(e.pointerId)) moveMorph(e); });
function moveMorph(e) {
  const r = mcv.getBoundingClientRect();
  S.morph.x = clamp01((e.clientX - r.left - r.width * 0.05) / (r.width * 0.9)); S.morph.y = clamp01((e.clientY - r.top - r.height * 0.08) / (r.height * 0.84));
  if (!S.morph.on) setMorph(true); else send();
}
function setMorph(on) {
  if (!on && S.morph.on) { const cur = S.recipe; S.morph.on = false; apply(morph(S.snaps.map(s => s || cur), S.morph.x, S.morph.y)); }
  S.morph.on = on; $('#morphOn').textContent = on ? 'MORPH ON' : 'MORPH OFF'; $('#morphOn').classList.toggle('on', on); send();
}
$('#morphOn').onclick = () => setMorph(!S.morph.on);
$('#morphClear').onclick = () => { S.snaps = [null, null, null, null]; setMorph(false); };
function drawMorph() {
  const g = mcv.getContext('2d'), W = mcv.width, H = mcv.height;
  g.clearRect(0, 0, W, H);
  g.strokeStyle = 'rgba(46,58,51,.6)'; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(W * i / 4, 0); g.lineTo(W * i / 4, H); g.moveTo(0, H * i / 4); g.lineTo(W, H * i / 4); g.stroke(); }
  [[0, 0], [W - 56, 0], [0, H - 56], [W - 56, H - 56]].forEach(([x, y], i) => {
    g.strokeStyle = S.snaps[i] ? '#b7ff3b' : '#2e3a33'; g.fillStyle = S.snaps[i] ? 'rgba(183,255,59,.14)' : 'transparent';
    g.lineWidth = 2; g.beginPath(); g.roundRect(x + 4, y + 4, 48, 48, 8); g.fill(); g.stroke();
    g.fillStyle = S.snaps[i] ? '#b7ff3b' : '#8a938e'; g.font = '20px Michroma'; g.textAlign = 'center'; g.fillText('ABCD'[i], x + 28, y + 36);
  });
  const px = W * (0.05 + 0.9 * S.morph.x), py = H * (0.08 + 0.84 * S.morph.y);
  g.fillStyle = S.morph.on ? 'rgba(183,255,59,.25)' : 'rgba(46,58,51,.5)'; g.beginPath(); g.arc(px, py, 24, 0, Math.PI * 2); g.fill();
  g.fillStyle = S.morph.on ? '#d6ff7a' : '#8a938e'; g.beginPath(); g.arc(px, py, 9, 0, Math.PI * 2); g.fill();
}

// ------------------------------------------------------------------ lanes
for (let l = 0; l < NUM_LANES; l++) { const b = el('button', '', 'L' + (l + 1)); b.onclick = () => { S.lane = l; renderLane(); }; $('#laneTabs').append(b); }
fillSelect($('#laneShape'), SHAPES); fillSelect($('#laneRate'), DIVS);
$('#laneTarget').onchange = e => { const l = S.recipe.lanes[S.lane]; l.target = +e.target.value; if (l.target && Math.abs(l.depth) < 0.05) l.depth = 0.3; edited(); renderLane(); };
$('#laneShape').onchange = e => { S.recipe.lanes[S.lane].shape = +e.target.value; edited(); };
$('#laneRate').onchange = e => { S.recipe.lanes[S.lane].rate = +e.target.value; edited(); };
$('#laneSteps').oninput = e => { S.recipe.lanes[S.lane].steps = +e.target.value; $('#laneStepsOut').textContent = e.target.value; edited(); };
$('#laneLock').onclick = () => { S.locks.lane[S.lane] = !S.locks.lane[S.lane]; renderLane(); };
$('#laneRandom').onclick = () => { motif(S.recipe.lanes[S.lane], rng); edited(); };
const depthKnob = knob({ label: 'DEPTH', get: () => (S.recipe.lanes[S.lane].depth + 1) / 2, set: v => { S.recipe.lanes[S.lane].depth = v * 2 - 1; edited(); },
  format: v => { const d = Math.round((v * 2 - 1) * 100); return (d > 0 ? '+' : '') + d + ' %'; }, bipolar: true, def: 0.5 });
$('#laneDepth').append(depthKnob.el);
function renderLane() {
  const l = S.recipe.lanes[S.lane], t = $('#laneTarget');
  t.innerHTML = '';
  for (let i = 0; i <= TARGET_AMOUNT; i++) {
    const usable = i === 0 || i >= TARGET_MIX_BASE || (() => { const s = Math.floor((i - 1) / NUM_PARAMS), k = (i - 1) % NUM_PARAMS, m = MODULES[S.recipe.slots[s].type]; return k < m.params.length && m.params[k].kind !== 'choice'; })();
    if (!usable) continue;
    const o = el('option', '', targetName(S.recipe, i)); o.value = i; t.append(o);
  }
  t.value = l.target;
  $('#laneShape').value = l.shape; $('#laneRate').value = l.rate; $('#laneSteps').value = l.steps; $('#laneStepsOut').textContent = l.steps;
  $('#laneLock').classList.toggle('on', S.locks.lane[S.lane]);
  [...$('#laneTabs').children].forEach((b, i) => { b.classList.toggle('on', i === S.lane); b.textContent = 'L' + (i + 1) + (S.recipe.lanes[i].target ? ' •' : ''); });
  depthKnob.update();
}
const lcv = $('#lane');
let lastStep = -1, lastVal = 0;
function drawOnLane(e, first) {
  const l = S.recipe.lanes[S.lane]; if (l.shape > 1) return;
  const r = lcv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top - r.height * 0.06) / (r.height * 0.88);
  const i = Math.max(0, Math.min(l.steps - 1, Math.floor(x * l.steps))), v = clamp01(y);
  if (!first && lastStep >= 0 && Math.abs(i - lastStep) > 1) for (let k = Math.min(i, lastStep) + 1; k < Math.max(i, lastStep); k++) l.pts[k] = lastVal + (v - lastVal) * (k - lastStep) / (i - lastStep);
  l.pts[i] = v; lastStep = i; lastVal = v; edited();
}
lcv.addEventListener('pointerdown', e => { lcv.setPointerCapture(e.pointerId); drawOnLane(e, true); });
lcv.addEventListener('pointermove', e => { if (lcv.hasPointerCapture(e.pointerId)) drawOnLane(e, false); });
function drawLane() {
  const g = lcv.getContext('2d'), W = lcv.width, H = lcv.height, l = S.recipe.lanes[S.lane], n = l.steps, top = H * 0.06, h = H * 0.88;
  const Y = v => top + (1 - v) * h;
  g.clearRect(0, 0, W, H);
  for (let i = 0; i <= n; i++) { g.strokeStyle = i % 4 ? 'rgba(46,58,51,.45)' : 'rgba(46,58,51,1)'; g.beginPath(); g.moveTo(i * W / n, 0); g.lineTo(i * W / n, H); g.stroke(); }
  g.beginPath();
  if (l.shape <= 1) {
    for (let i = 0; i < n; i++) {
      const v = l.pts[i], nv = l.pts[(i + 1) % n], x0 = i * W / n, w = W / n;
      if (l.shape === 1) { g.fillStyle = 'rgba(183,255,59,.16)'; g.fillRect(x0 + 3, Y(v), w - 6, H - Y(v)); i ? g.lineTo(x0, Y(v)) : g.moveTo(x0, Y(v)); g.lineTo(x0 + w, Y(v)); }
      else for (let k = 0; k <= 10; k++) { const t = k / 10, s2 = t * t * (3 - 2 * t), x = x0 + t * w, y = Y(v + (nv - v) * s2); i || k ? g.lineTo(x, y) : g.moveTo(x, y); }
    }
  } else if (l.shape === 8) { g.fillStyle = '#8a938e'; g.font = '18px Michroma'; g.textAlign = 'center'; g.fillText('ENVELOPE: segue o nível da entrada', W / 2, H / 2); }
  else for (let k = 0; k <= 200; k++) {
    const t = k / 200, v = [0.5 - 0.5 * Math.cos(t * 2 * Math.PI), t < 0.5 ? t * 2 : 2 - t * 2, t, 1 - t, t < 0.5 ? 1 : 0, 0.5 + 0.4 * Math.sin(t * 37) * Math.cos(t * 13)][l.shape - 2];
    k ? g.lineTo(t * W, Y(v)) : g.moveTo(t * W, Y(v));
  }
  g.strokeStyle = 'rgba(183,255,59,.2)'; g.lineWidth = 8; g.stroke(); g.strokeStyle = '#b7ff3b'; g.lineWidth = 3; g.stroke();
  if (l.shape === 0) for (let i = 0; i < n; i++) { g.fillStyle = '#d6ff7a'; g.beginPath(); g.arc(i * W / n, Y(l.pts[i]), 6, 0, Math.PI * 2); g.fill(); }
  if (S.tele) {
    const pos = S.tele.lanePos[S.lane], frac = l.shape <= 1 ? pos / n : pos, x = frac * W, v = S.tele.lanes[S.lane];
    g.strokeStyle = 'rgba(229,231,235,.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    g.fillStyle = '#d6ff7a'; g.beginPath(); g.arc(x, Y(v), 8, 0, Math.PI * 2); g.fill();
  }
  if (!l.target) { g.fillStyle = 'rgba(14,18,20,.65)'; g.fillRect(0, 0, W, H); g.fillStyle = '#e5e7eb'; g.font = '17px Michroma'; g.textAlign = 'center'; g.fillText('Lane desligada: escolhe um destino (ou → lane num knob)', W / 2, H / 2); }
}

// ------------------------------------------------------------------ output + audio
const scv = $('#spectrum');
function drawSpectrum() {
  const g = scv.getContext('2d'), W = scv.width, H = scv.height;
  g.clearRect(0, 0, W, H);
  if (!S.analyser) { g.fillStyle = '#8a938e'; g.font = '16px Michroma'; g.textAlign = 'center'; g.fillText('carrega em LIGAR SOM', W / 2, H / 2); return; }
  const n = S.analyser.frequencyBinCount, d = new Float32Array(n), fs = S.ctx.sampleRate;
  S.analyser.getFloatFrequencyData(d);
  g.beginPath();
  for (let x = 0; x <= W; x += 2) {
    const f = 25 * Math.pow(18000 / 25, x / W), b = Math.min(n - 1, Math.round(f / (fs / 2) * n)), db = d[b] + 4.5 * Math.log2(f / 1000);
    const y = H - Math.max(0, Math.min(1, (db + 90) / 80)) * H;
    x ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.lineTo(W, H); g.lineTo(0, H); g.closePath();
  g.fillStyle = 'rgba(183,255,59,.14)'; g.fill(); g.strokeStyle = '#b7ff3b'; g.lineWidth = 2; g.stroke();
}
$('#bpm').oninput = e => { S.bpm = +e.target.value; $('#bpmOut').textContent = S.bpm; S.node && S.node.port.postMessage({ bpm: S.bpm }); };
$('#power').onclick = async () => {
  if (!S.ctx) {
    S.ctx = new AudioContext({ latencyHint: 'playback' });
    await S.ctx.audioWorklet.addModule('motion-worklet.js');
    S.node = new AudioWorkletNode(S.ctx, 'motion', { numberOfInputs: 0, outputChannelCount: [2] });
    S.analyser = S.ctx.createAnalyser(); S.analyser.fftSize = 4096; S.analyser.smoothingTimeConstant = 0.8;
    S.node.connect(S.analyser); S.analyser.connect(S.ctx.destination);
    S.node.port.onmessage = e => { S.tele = e.data; };
    S.node.port.postMessage({ bpm: S.bpm }); send();
    $('#power').textContent = '■ PARAR'; $('#power').classList.add('on');
    return;
  }
  if (S.ctx.state === 'running') { await S.ctx.suspend(); $('#power').textContent = '▶ LIGAR SOM'; $('#power').classList.remove('on'); }
  else { await S.ctx.resume(); $('#power').textContent = '■ PARAR'; $('#power').classList.add('on'); }
};
$('#file').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  if (!S.ctx) await $('#power').onclick();
  const buf = await S.ctx.decodeAudioData(await f.arrayBuffer());
  const L = buf.getChannelData(0).slice(), R = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice();
  S.node.port.postMessage({ audio: [L, R] }, [L.buffer, R.buffer]);
};
$('#useLoop').onclick = () => S.node && S.node.port.postMessage({ loop: true });
$('#bypass').onclick = () => { S.bypass = !S.bypass; $('#bypass').classList.toggle('on', S.bypass); $('#bypass').textContent = S.bypass ? 'A/B (A OUVIR SECO)' : 'A/B (SECO)'; S.node && S.node.port.postMessage({ bypass: S.bypass }); };

// ------------------------------------------------------------------ render loop
function renderAll() {
  renderChain(); renderEditor(); renderLane();
  macroKnobs.forEach(k => k.update());
  $('#name').textContent = S.recipe.name.toUpperCase();
  $('#histpos').textContent = `${S.hi + 1} / ${S.history.length}`;
  $('#back').disabled = S.hi <= 0; $('#fwd').disabled = S.hi >= S.history.length - 1;
}
function frame() {
  drawCards(); drawMorph(); drawLane(); drawSpectrum();
  if (S.tele) {
    paramKnobs.forEach((k, i) => k && k.update(S.tele.eff[S.sel] ? S.tele.eff[S.sel][i] : undefined));
    const beat = Math.floor(S.tele.beats) & 3;
    [...$('#beats').children].forEach((d, i) => d.classList.toggle('on', i === beat && S.ctx.state === 'running'));
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ listen + module table
const TRACKS = [
  ['00-dry-loop', 'Loop seco', 'kick, hat, clap, baixo em F'], ['01-warehouse-rumble', 'Warehouse Rumble', 'RUMBLE'], ['02-sub-pressure', 'Sub Pressure', 'RUMBLE'],
  ['03-iron-grid', 'Iron Grid', 'FERRO'], ['04-broken-bells', 'Broken Bells', 'FERRO'], ['05-sodium-siren', 'Sodium Siren', 'SIRENE'], ['06-tunnel-warning', 'Tunnel Warning', 'SIRENE'],
  ['07-dub-ghost', 'Dub Ghost', 'DUB'], ['08-basement-chord', 'Basement Chord', 'DUB'], ['09-concrete-engine', 'Concrete Engine', 'INDUSTRIAL'], ['10-static-ritual', 'Static Ritual', 'INDUSTRIAL'],
  ['11-hypno-gate', 'Hypno Gate', 'INDUSTRIAL'], ['12-night-breath', 'Night Breath', 'RUMBLE'],
  ['dice-rumble-hollow-engine', 'DICE · Hollow Engine', 'roll em RUMBLE'], ['dice-ferro-deep-breath', 'DICE · Deep Breath', 'roll em FERRO'], ['dice-sirene-static-breath', 'DICE · Static Breath', 'roll em SIRENE'],
  ['dice-dub-basement-breath', 'DICE · Basement Breath', 'roll em DUB'], ['dice-industrial-concrete-loop', 'DICE · Concrete Loop', 'roll em INDUSTRIAL'],
];
const player = new Audio(); player.preload = 'none';
let playing = null;
TRACKS.forEach(([file, name, sub]) => {
  const b = el('button', 'track', `<span class="pp">▶</span><span style="flex:1"><b>${name}</b><small>${sub}</small><span class="bar2"><i></i></span></span>`);
  b.onclick = () => {
    if (playing === b) { player.pause(); b.classList.remove('on'); b.querySelector('.pp').textContent = '▶'; playing = null; return; }
    if (playing) { playing.classList.remove('on'); playing.querySelector('.pp').textContent = '▶'; }
    const t = player.currentTime && playing ? player.currentTime : 0;   // A/B at the same position
    player.src = `audio/${file}.mp3`; player.currentTime = t; player.play();
    b.classList.add('on'); b.querySelector('.pp').textContent = '■'; playing = b;
  };
  $('#tracks').append(b);
});
player.ontimeupdate = () => { if (playing) playing.querySelector('.bar2 i').style.width = (100 * player.currentTime / (player.duration || 10)) + '%'; };
player.onended = () => { if (playing) { playing.classList.remove('on'); playing.querySelector('.pp').textContent = '▶'; playing = null; } };

MODULES.slice(1).forEach(m => {
  const tr = el('tr');
  tr.innerHTML = `<td>${m.name}</td><td>${m.blurb}</td><td>${m.params.map(p => p.label).join(' · ')}</td>`;
  $('#modTable').append(tr);
});

// ------------------------------------------------------------------ boot
fetch('presets.json').then(r => r.json()).then(list => {
  S.presets = list.map(fromJson);
  const sel = $('#preset'); sel.innerHTML = '<option value="-1">PRESETS</option>';
  let style = '';
  S.presets.forEach((p, i) => {
    if (p.style !== style) { const og = el('optgroup'); og.label = p.style; sel.append(og); style = p.style; }
    const o = el('option', '', p.name); o.value = i; sel.lastChild.append(o);
  });
  apply(S.presets[0]);
}).catch(() => apply(generate('RUMBLE', rng)));
requestAnimationFrame(frame);
