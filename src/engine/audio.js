// Sound without sound files.
//
// Every sound is computed into a Float32Array when the page loads and played through
// Web Audio. This is the smallest useful version of the idea:
//
//   • three building blocks: a decaying sine ("modal"), a swept sine, filtered noise
//   • everything tuned to harmonics of one root, so any two sounds are consonant
//   • seeded randomness: the deck sounds identical on every load
//   • one generated reverb impulse, one compressor on the master
//   • a live bed whose chord glides to a new one for each scene, swelling with the cut
//   • the deck calls emit('beat' | 'back' | 'transition') and scenes call ctx.sfx(name)
//
// See docs/06-audio.md for how to grow this into beds, per-transition cues and a time-sliced bank.

import { rng } from './math.js';

const SR = 48000;
const TAU = Math.PI * 2;
const ROOT = 55; // A1. H(n) is the n-th harmonic; use these for every pitched sound.
export const H = (n) => ROOT * n;

// ── building blocks ───────────────────────────────────────────────────────────

/** Decaying sine as a rotating phasor: two multiplies per sample, no Math.sin in the loop. */
function modal(buf, f, amp, t60, at = 0) {
  const d = Math.exp(-6.91 / (t60 * SR)), w = (TAU * f) / SR, c = Math.cos(w) * d, s = Math.sin(w) * d;
  let x = 0, y = amp;
  const end = Math.min(buf.length, Math.floor(at * SR) + Math.ceil(t60 * SR * 1.5));
  for (let i = Math.floor(at * SR), n = 0; i < end; i++, n++) {
    buf[i] += x * Math.min(1, n / 48); // 1 ms attack avoids a click
    const nx = x * c + y * s; y = y * c - x * s; x = nx;
  }
}

/** Sine whose frequency and amplitude are functions of normalised time u = 0..1. */
function sweep(buf, at, dur, freq, amp) {
  let ph = 0; const n = Math.floor(dur * SR), i0 = Math.floor(at * SR);
  for (let i = 0; i < n && i0 + i < buf.length; i++) { const u = i / n; buf[i0 + i] += Math.sin(ph) * amp(u); ph += (TAU * freq(u)) / SR; }
}

/** White noise through a state-variable filter (mode: 'lp' | 'bp' | 'hp'), cutoff and level as functions of u. */
function noise(buf, rand, at, dur, mode, cutoff, q, amp) {
  let a = 0, b = 0, a1 = 0, a2 = 0, a3 = 0; const k = 1 / q, n = Math.floor(dur * SR), i0 = Math.floor(at * SR);
  for (let i = 0; i < n && i0 + i < buf.length; i++) {
    const u = i / n;
    if ((i & 15) === 0) { const g = Math.tan((Math.PI * Math.min(cutoff(u), SR * 0.45)) / SR); a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2; }
    const x = rand() * 2 - 1, v3 = x - b, v1 = a1 * a + a2 * v3, v2 = b + a2 * a + a3 * v3;
    a = 2 * v1 - a; b = 2 * v2 - b;
    buf[i0 + i] += (mode === 'lp' ? v2 : mode === 'bp' ? v1 * k : x - k * v1 - v2) * amp(u);
  }
}

/** Fade the tail and normalise to a peak. */
function finish(chs, peak) {
  let m = 0;
  for (const c of chs) { const f = Math.floor(0.004 * SR); for (let i = 0; i < f; i++) c[c.length - 1 - i] *= i / f; for (const v of c) m = Math.max(m, Math.abs(v)); }
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= peak / (m || 1);
  return chs;
}

const mono = (sec) => [new Float32Array(Math.ceil(sec * SR))];
const stereo = (sec) => [new Float32Array(Math.ceil(sec * SR)), new Float32Array(Math.ceil(sec * SR))];
const bell = (u) => Math.sin(Math.PI * u) ** 2;

// ── the bank: name → [variants, make(rand, variant)] ──────────────────────────
const BANK = {
  tick: [3, (r, v) => { const b = mono(0.09); modal(b[0], 2200 + v * 310, 1, 0.02); modal(b[0], 3700 + v * 190, 0.5, 0.012); noise(b[0], r, 0, 0.004, 'hp', () => 3000, 0.7, (u) => 1 - u); return finish(b, 0.5); }],
  pop: [3, (r, v) => { const b = mono(0.12); sweep(b[0], 0, 0.07, (u) => 240 + (520 + v * 60) * u, (u) => (1 - u) ** 2); return finish(b, 0.6); }],
  thud: [2, (r, v) => { const b = mono(0.7); sweep(b[0], 0, 0.5, (u) => 90 - 46 * u, (u) => (1 - u) ** 3); modal(b[0], H(2) + v * 4, 0.5, 0.25); noise(b[0], r, 0, 0.03, 'lp', () => 900, 0.8, (u) => 1 - u); return finish(b, 0.9); }],
  chime: [2, (r, v) => { const b = stereo(2.4); [8, 12, 16, 24].forEach((n, i) => { modal(b[0], H(n), 1 / (i + 1), 2 - i * 0.35, i * 0.045 * (v + 1)); modal(b[1], H(n) * 1.0016, 1 / (i + 1), 2 - i * 0.35, i * 0.045 * (v + 1) + 0.006); }); return finish(b, 0.5); }],
  whoosh: [2, (r, v) => { const b = stereo(1.2); for (let c = 0; c < 2; c++) noise(b[c], r, c * 0.015, 1.15, 'bp', (u) => 260 * Math.pow(6.5 + v, bell(u * 0.5 + (u > 0.5 ? 0 : 0))), 1.4, (u) => bell(Math.pow(u, 0.8))); return finish(b, 0.55); }],
};

/** A reverb impulse is just decaying noise whose highs die first. */
function impulse(sec, seed, sr) {
  const chs = [new Float32Array(Math.ceil(sec * sr)), new Float32Array(Math.ceil(sec * sr))];
  chs.forEach((c, ch) => {
    const r = rng(seed + ch * 7); let lp = 0;
    for (let i = 0; i < c.length; i++) { const u = i / c.length, k = 0.6 * Math.exp(-3 * u) + 0.03; lp += (r() * 2 - 1 - lp) * k; c[i] = (lp * Math.exp(-6.2 * u) * Math.min(1, i / 500)) / Math.sqrt(k); }
  });
  return finish(chs, 0.9);
}

// One chord per scene, all built from harmonics of the root so every change is a smooth glide.
// Each entry multiplies the root; the bed's voices glide to the new chord when a scene arrives.
const CHORDS = [
  [2, 3, 4, 5, 6],           // open, major
  [2, 3, 4, 4.8, 6.4],       // a darker colour (minor third, minor sixth)
  [2, 2.67, 4, 5.33, 6],     // suspended: a question
  [1.5, 3, 4.5, 6, 7.5],     // lower, wider
  [2, 3, 4.5, 5, 6],         // brighter
  [2, 3, 4, 5, 6],           // home
];

export function makeAudio() {
  let ac = null, sum, master, hall, bed = null, filt = null, voices = [], muted = false, last = {}, chord = 0, resumeOnShow = false;
  const bufs = {};
  const safe = (fn) => (...a) => { try { return fn(...a); } catch (e) { if (!api.err) { api.err = e; console.warn('audio', e); } } };

  const toBuffer = (chs, sr = SR) => { const b = ac.createBuffer(chs.length, chs[0].length, sr); chs.forEach((c, i) => b.copyToChannel(c, i)); return b; };

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || ac) return;
    ac = new AC({ latencyHint: 'interactive' });
    sum = ac.createGain();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -15; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.5;
    sum.connect(comp).connect(master).connect(ac.destination);
    hall = ac.createConvolver(); hall.connect(sum);
    // Render the bank a sound at a time so the page never stalls.
    // A ConvolverNode refuses a buffer whose sample rate differs from the context's, so the
    // impulse is generated at the context rate. (Ordinary buffers are resampled on playback.)
    const jobs = [() => { hall.buffer = toBuffer(impulse(2.8, 71, ac.sampleRate), ac.sampleRate); }];
    for (const name in BANK) for (let v = 0; v < BANK[name][0]; v++) jobs.push(() => { (bufs[name] = bufs[name] || [])[v] = toBuffer(BANK[name][1](rng(name.length * 131 + v * 17 + 1), v)); });
    jobs.push(buildBed);
    const next = () => { const j = jobs.shift(); if (j) { safe(j)(); setTimeout(next, 4); } };
    setTimeout(next, 0);
  }

  // The bed: five detuned voices (sine + a little saw) through a slowly breathing low-pass and the
  // hall. Live oscillators rather than a loop, so they can glide from chord to chord.
  function buildBed() {
    bed = ac.createGain(); bed.gain.value = 0;
    filt = ac.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 760; filt.Q.value = 0.6;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.05; lg.gain.value = 240; lfo.connect(lg).connect(filt.frequency); lfo.start();
    const send = ac.createGain(); send.gain.value = 0.7;
    bed.connect(filt); filt.connect(sum); filt.connect(send).connect(hall);
    CHORDS[chord].forEach((m, i) => {
      const g = ac.createGain(); g.gain.value = 0.06 - i * 0.006;
      const a = ac.createOscillator(), b = ac.createOscillator(), bg = ac.createGain();
      a.type = i < 2 ? 'sine' : 'triangle'; b.type = 'sawtooth'; bg.gain.value = i ? 0.14 : 0;
      a.frequency.value = b.frequency.value = H(m); a.detune.value = -5; b.detune.value = 7;
      const p = ac.createStereoPanner(); p.pan.value = (i / 4) * 1.2 - 0.6;
      a.connect(g); b.connect(bg).connect(g); g.connect(p).connect(bed);
      a.start(); b.start(); voices.push([a, b]);
    });
    bed.gain.setTargetAtTime(0.5, ac.currentTime, 2.5);
  }
  /** Glide the bed to the chord for scene `i` and swell it with the cut: louder, brighter, a breath of noise. */
  function swell(i, dur) {
    chord = i % CHORDS.length;
    if (!bed) return;
    const t = ac.currentTime;
    voices.forEach(([a, b], k) => { const f = H(CHORDS[chord][k]); a.frequency.setTargetAtTime(f, t, 1.1); b.frequency.setTargetAtTime(f, t, 1.1); });
    bed.gain.cancelScheduledValues(t); bed.gain.setTargetAtTime(0.85, t, 0.35); bed.gain.setTargetAtTime(0.5, t + dur * 0.7, 1.3);
    filt.frequency.cancelScheduledValues(t); filt.frequency.setTargetAtTime(2300, t, 0.4); filt.frequency.setTargetAtTime(760, t + dur * 0.7, 1.4);
  }

  function play(buffer, { gain = 1, rate = 1, pan = 0, wet = 0.15, loop = false, when = 0 } = {}) {
    const src = ac.createBufferSource(); src.buffer = buffer; src.playbackRate.value = rate; src.loop = loop;
    const g = ac.createGain(); g.gain.value = gain;
    const p = ac.createStereoPanner(); p.pan.value = pan;
    const send = ac.createGain(); send.gain.value = wet;
    src.connect(g).connect(p); p.connect(sum); p.connect(send).connect(hall);
    src.start(ac.currentTime + when);
    if (!loop) src.onended = () => { p.disconnect(); send.disconnect(); };
    return { src, g };
  }

  // A hidden tab should be silent; bring the sound back when the viewer returns.
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden && ac.state === 'running') { resumeOnShow = true; ac.suspend().catch(() => {}); }
    else if (!document.hidden && resumeOnShow) { resumeOnShow = false; ac.resume().catch(() => {}); }
  });

  const api = {
    quiet: false, err: null,
    /** Browsers only allow sound after a user gesture; call this from every key / pointer handler. */
    unlock: safe(() => { if (!ac) build(); if (ac && ac.state !== 'running') ac.resume().catch(() => {}); }),
    mute: safe((on) => { muted = on; if (master) master.gain.setTargetAtTime(on ? 0 : 0.5, ac.currentTime, 0.06); }),
    /** One-shot by name. pitch is a playback-rate multiplier. Never repeats the same variant twice in a row. */
    hit: safe((name, { gain = 1, pitch = 1, pan = 0, wet, when = 0 } = {}) => {
      if (api.quiet || !ac || ac.state !== 'running') return;
      const vs = (bufs[name] || []).filter(Boolean); if (!vs.length) return; // not rendered yet: skip silently
      let i = Math.floor(Math.random() * vs.length); if (vs.length > 1 && i === last[name]) i = (i + 1) % vs.length; last[name] = i;
      play(vs[i], { gain: gain * (0.92 + Math.random() * 0.16), rate: pitch, pan, wet, when });
    }),
    emit: safe((evt, d = {}) => {
      if (evt === 'beat') api.hit('tick', { gain: 0.5 });
      if (evt === 'back') api.hit('tick', { gain: 0.4, pitch: 0.7 });
      if (evt === 'transition') {
        swell(d.index ?? 0, d.dur);
        // Stretch the whoosh to the transition so sound and picture end together.
        api.hit('whoosh', { gain: 0.8, pitch: Math.min(2, Math.max(0.5, 1.15 / d.dur)) * (d.reverse ? 0.8 : 1), wet: 0.3 });
        if (!d.reverse && d.name === 'shove') api.hit('thud', { gain: 0.7, when: d.dur * 0.82 });
        if (!d.reverse && d.name === 'iris') api.hit('chime', { gain: 0.5, when: d.dur * 0.35, wet: 0.5 });
      }
    }),
    update() {},
  };
  return api;
}
