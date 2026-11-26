// The deck controller: scenes, beats, transitions, the frame loop.
//
// A scene definition:
//
//   export default {
//     id: 'chart', title: 'The chart', enterWith: 'iris',
//     beats: [{ dur: 1.4 }, { dur: 1.0, delay: 0.2, hold: 4 }],   // one entry per click
//     notes: ['Speaker notes for beat 1', 'Notes for beat 2'],
//     create(ctx) {
//       // allocate passes / targets / text here
//       return { update(s) {}, render(target, s) {}, enter(s) {}, exit(s) {}, resize() {} };
//     },
//   };
//
// The state `s` handed to update/render:
//   s.t        seconds since the scene was entered
//   s.dt       frame delta
//   s.beat     index of the current beat
//   s.p[i]     0..1 linear progress of beat i (runs forward when reached, backward when you go Back)
//   s.k(i, t0, t1, easeFn)   eased 0..1 for the window t0..t1 seconds inside beat i
//   s.enter    0..1 while a linked transition brings this scene in (1 once it is in)
//   s.exit     0..1 while a linked transition takes this scene out
//   s.dir      +1 / -1, the direction of the last navigation
//   s.cue(name, cond, fn)    run fn once when cond turns true while playing forward (for sounds)
//   s.mouse    smoothed pointer, x/y in -1..1
//
// Scenes should be *pure functions of s* wherever possible: that is what makes Back,
// jumping, warm-up and deterministic screenshots all work for free.

import * as THREE from 'three';
import { createGfx } from './gfx.js';
import { createView } from './view.js';
import { createType, createOverlay } from './type.js';
import { clamp01, damp, ease } from './math.js';

const MAX_PIXELS = 2560 * 1600; // never shade more than this, whatever the display
const nullAudio = () => ({ unlock() {}, mute() {}, emit() {}, hit() {}, update() {}, quiet: false });

export const fade = {
  dur: 0.7,
  create(ctx) {
    const pass = ctx.gfx.pass('uniform sampler2D tA, tB; uniform float p; void main(){ o = mix(texture(tA, vUv), texture(tB, vUv), smoothstep(0., 1., p)); }', { tA: null, tB: null, p: 0 });
    return { render({ A, B, p, out }) { pass.set({ tA: A.texture, tB: B.texture, p }); pass.render(out); } };
  },
};

export async function createDeck({ canvas, scenes, transitions = {}, headless = false, qs = new URLSearchParams(), makeAudio = null }) {
  const gfx = createGfx(canvas, { headless });
  const view = createView();
  const type = createType(gfx, view);
  const assets = (typeof window !== 'undefined' && window.__ASSETS) || {};
  await type.loadFonts(assets);
  const audio = (makeAudio || nullAudio)();
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  const ctx = {
    THREE, gfx, view, type, audio, mouse, headless, assets, deck: null,
    text: (t, o) => type.block(t, o),
    overlay: () => createOverlay(gfx),
    sfx: (name, opts) => { if (!audio.quiet) audio.hit(name, opts); },
    asset: (name) => assets[name] || 'assets/' + name,
  };

  const A = gfx.target(), B = gfx.target(), OUT = gfx.target();

  // ── one runner per scene ────────────────────────────────────────────────────
  class Runner {
    constructor(def, i) {
      this.def = def; this.i = i; this.inst = null; this.ready = false; this.parked = false; this.warm = false;
      const n = def.beats.length;
      const s = (this.s = {
        t: 0, dt: 0, beat: 0, n, p: new Array(n).fill(0), since: new Array(n).fill(0),
        enter: 1, exit: 0, dir: 1, mouse, view, q: 1,
        at: (i) => s.p[i] * def.beats[i].dur,
        k: (i, t0, t1, fn = ease.io3) => fn(clamp01((s.p[i] * def.beats[i].dur - t0) / Math.max(1e-4, t1 - t0))),
        // Edge trigger for one-shot events (sounds, particle bursts): fires once when `cond` becomes
        // true while playing forward. Scrubbing, Back and warm-up stay silent.
        cue: (name, cond, fn) => { const was = this.flags[name]; this.flags[name] = !!cond; if (cond && !was && s.dt > 1e-3 && s.dir > 0 && !audio.quiet) fn(); },
      });
      this.flags = {};
    }
    async init() {
      if (this.ready) return;
      if (!this._init) this._init = (async () => {
        gfx.owner = this; // everything allocated in create() belongs to this scene
        let inst;
        try { inst = this.def.create(ctx); const pending = inst.init && inst.init(); gfx.owner = null; if (pending) await pending; }
        finally { gfx.owner = null; }
        this.inst = inst; this.ready = true;
      })();
      return this._init;
    }
    park(on) {
      if (!this.ready || headless || this.parked === on) return;
      this.parked = on; gfx.park(this, on);
      if (!on && this.inst.resize) this.inst.resize();
    }
    /** Start at `beat`; beats before `settled` are already complete. */
    reset(beat = 0, settled = beat) {
      const s = this.s; s.t = 0; s.beat = beat; s.enter = 1; s.exit = 0; s.dir = 1; this.flags = {};
      for (let i = 0; i < s.n; i++) { const done = i < settled; s.p[i] = done ? 1 : 0; s.since[i] = done ? 30 : 0; }
    }
    step(dt) {
      const s = this.s, beats = this.def.beats;
      s.dt = dt; s.t += dt;
      for (let i = 0; i < s.n; i++) {
        if (i <= s.beat) {
          s.since[i] += dt;
          // Beats you clicked past finish 3x faster, so a fast presenter is never stuck waiting.
          if (s.since[i] >= (beats[i].delay || 0)) s.p[i] = Math.min(1, s.p[i] + (dt / beats[i].dur) * (i < s.beat ? 3 : 1));
        } else {
          s.since[i] = 0;
          s.p[i] = Math.max(0, s.p[i] - (dt / beats[i].dur) * 2.4); // Back un-plays, quickly
        }
      }
      this.inst.update(s);
    }
    render(target) { this.inst.render(target, this.s); }
  }

  const runners = scenes.map((d, i) => new Runner(d, i));
  const T = {};
  transitions = { fade, ...transitions };
  for (const name in transitions) T[name] = { def: transitions[name], inst: null };
  const transition = (name) => {
    const t = T[name] || T.fade;
    if (!t.inst) { gfx.owner = t; try { t.inst = t.def.create(ctx); } finally { gfx.owner = null; } }
    return t;
  };

  let cur = -1, trans = null, time = 0, auto = false, muted = false, black = 0, blackTarget = 0, queued = false;
  let quality = qs.get('q') ? +qs.get('q') : 1;
  const listeners = {};
  const fire = (evt, data) => (listeners[evt] || []).forEach((fn) => fn(data));
  const thumbs = [];

  // Page number HUD (set `hud: false` on a scene to hide it).
  const hud = createOverlay(gfx);
  const pageText = type.block('1', { x: 1860, y: 1026, size: 22, font: 'mono', align: 'right', valign: 'middle', color: '#ffffff' });
  hud.add(pageText);

  const deck = {
    ctx, gfx, view, type, audio, scenes, runners, thumbs,
    get cur() { return cur; }, get trans() { return trans; }, get auto() { return auto; }, get muted() { return muted; },
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return deck; },

    advance() {
      queued = false;
      if (trans) { trans.speed = 3.5; queued = true; return; } // impatient click: finish fast, then go on
      const r = runners[cur];
      if (r.s.beat < r.s.n - 1) { r.s.beat++; r.s.dir = 1; audio.emit('beat', { scene: r.def.id, beat: r.s.beat }); fire('move'); }
      else if (cur < runners.length - 1) deck.go(cur + 1, { with: scenes[cur + 1].enterWith || 'fade' });
    },

    back() {
      if (trans) { trans.speed = 3.5; return; }
      const r = runners[cur];
      r.s.dir = -1;
      if (r.s.beat > 0) { r.s.beat--; audio.emit('back', {}); fire('move'); }
      // Going back replays the *same* transition in reverse, landing on the previous scene's last beat.
      else if (cur > 0) deck.go(cur - 1, { with: scenes[cur].enterWith || 'fade', reverse: true, beat: scenes[cur - 1].beats.length - 1 });
    },

    async go(index, { with: name = 'fade', reverse = false, beat = 0 } = {}) {
      if (index === cur || index < 0 || index >= runners.length) return;
      const r = runners[index];
      await r.init(); r.park(false);
      r.reset(beat, reverse ? beat + 1 : beat);
      if (r.inst.enter) r.inst.enter(r.s);
      const t = transition(name);
      if (cur < 0) { cur = index; fire('move'); housekeeping(); return; }
      trans = { from: cur, to: index, T: t, name, p: 0, t: 0, dur: t.def.dur * (reverse ? 0.55 : 1), speed: 1, reverse, linked: name !== 'fade' };
      if (t.inst.start) t.inst.start(trans);
      audio.emit('transition', { name, from: scenes[cur].id, to: scenes[index].id, dur: trans.dur, reverse });
      fire('move');
    },

    /** Cut straight to a scene (by id or index) with a plain fade. */
    jump(target, beat = 0) {
      const index = typeof target === 'number' ? target : scenes.findIndex((s) => s.id === target);
      if (index < 0) return;
      if (index === cur && !trans) { const r = runners[index]; r.reset(beat); if (r.inst.enter) r.inst.enter(r.s); fire('move'); return; }
      if (trans) finishTransition();
      return deck.go(index, { with: 'fade', beat });
    },

    setAuto(on) { auto = on; fire('auto'); },
    toggleBlack() { blackTarget = blackTarget ? 0 : 1; },
    mute(on) { muted = on ?? !muted; audio.mute(muted); fire('mute'); },

    info() {
      const r = runners[trans ? trans.to : cur];
      return { scene: r.def.id, index: r.i, count: runners.length, beat: r.s.beat, beats: r.s.n, title: r.def.title, notes: (r.def.notes || [])[r.s.beat] || '' };
    },

    /**
     * Compile every shader and upload every texture *before* the talk starts, so the first
     * time a slide appears is not the first time the GPU has seen it. Also takes thumbnails.
     */
    async warmAll(onProgress) {
      resize();
      for (let i = 0; i < runners.length; i++) {
        await new Promise((r) => setTimeout(r, 0));
        await warm(runners[i]);
        gl.finish();
        if (i > 1) runners[i].park(true);
        if (onProgress) onProgress((i + 1) / runners.length);
        await new Promise((r) => requestAnimationFrame(r));
      }
    },

    async start(id, beat = 0) {
      resize();
      const index = Math.max(0, scenes.findIndex((s) => s.id === id));
      await deck.go(index, { beat });
      if (!headless) { last = performance.now(); requestAnimationFrame(loop); }
      else { update(0); draw(); }
    },

    // ── deterministic control for screenshots and tests ──
    /** Show scene `id` with beats 0..beat fully settled, at scene time `t`. */
    async seek(id, beat = 0, t = 8) {
      const index = scenes.findIndex((s) => s.id === id);
      const r = runners[index];
      await r.init(); r.park(false);
      trans = null; cur = index;
      r.reset(beat, beat + 1); if (r.inst.enter) r.inst.enter(r.s);
      r.s.t = t; update(0); draw();
    },
    /** Freeze the transition *into* scene `id` at progress p (0..1). Returns the transition's name. */
    async seekTransition(id, p = 0.5) {
      const to = scenes.findIndex((s) => s.id === id);
      if (to < 1) return null;
      const a = runners[to - 1], b = runners[to];
      await a.init(); await b.init(); a.park(false); b.park(false);
      a.reset(a.s.n - 1, a.s.n); b.reset(0, 0);
      if (a.inst.enter) a.inst.enter(a.s);
      if (b.inst.enter) b.inst.enter(b.s);
      const name = scenes[to].enterWith || 'fade', t = transition(name);
      cur = to - 1;
      trans = { from: to - 1, to, T: t, name, p, t: p * t.def.dur, dur: t.def.dur, speed: 0, reverse: false, linked: name !== 'fade' };
      if (t.inst.start) t.inst.start(trans);
      a.s.t = 6; b.s.t = p * t.def.dur;
      update(0); draw();
      return name;
    },
    /** Advance time by dt seconds in fixed steps and draw once. */
    tick(dt = 1 / 60, steps = 1) { for (let i = 0; i < steps; i++) update(dt); draw(); },
    resize,
  };
  ctx.deck = deck;
  const gl = gfx.gl;

  function finishTransition() {
    if (!trans) return;
    const { from, to } = trans;
    runners[from].s.exit = 0; runners[to].s.enter = 1;
    if (runners[from].inst.exit) runners[from].inst.exit(runners[from].s);
    cur = to; trans = null;
    fire('move'); housekeeping();
    if (queued) { queued = false; deck.advance(); }
  }

  // Keep only the neighbours hot: park far scenes, pre-warm the next two.
  function housekeeping() {
    runners.forEach((r, i) => r.park(Math.abs(i - cur) > 1));
    const next = scenes[cur + 1];
    if (next) transition(next.enterWith || 'fade');
    if (!headless) for (const d of [1, 2]) { const r = runners[cur + d]; if (r && !r.warm) setTimeout(() => warm(r), 300 * d); }
  }

  async function warm(r) {
    if (r.warm) return;
    r.warm = true; audio.quiet = true;
    try {
      await r.init(); r.park(false);
      const s = r.s;
      // Touch every beat half-way and complete: different beats often switch on different shader paths.
      for (let b = 0; b < s.n; b++) for (const half of [true, false]) {
        r.reset(b, b + 1); if (half) s.p[b] = 0.5;
        if (b === 0 && half && r.inst.enter) r.inst.enter(s);
        r.step(1e-4); r.render(B);
      }
      thumbs[r.i] = gfx.snapshot(B);
      const t = transition(r.def.enterWith || 'fade');
      r.reset(0); s.enter = 0.5; r.step(1e-4);
      if (t.inst.start) t.inst.start({ reverse: false });
      for (const p of [0.2, 0.5, 0.8]) t.inst.render({ A: B, B, p, out: OUT, a: r, b: r, sa: s, sb: s, time: 0 });
    } catch (e) { console.warn('warm', r.def.id, e && e.message); }
    r.reset(0); audio.quiet = false;
  }

  function resize() {
    const cw = canvas.clientWidth || innerWidth, ch = canvas.clientHeight || innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (qs.get('px')) dpr = +qs.get('px');
    let pw = cw * dpr, ph = ch * dpr;
    const cap = Math.min(1, Math.sqrt(MAX_PIXELS / (pw * ph))) * quality;
    pw = Math.max(2, Math.round(pw * cap)); ph = Math.max(2, Math.round(ph * cap));
    view.resize(pw, ph);
    gfx.resize(pw, ph, view.ppu);
    for (const r of runners) if (r.ready && !r.parked && r.inst.resize) r.inst.resize();
  }

  function update(dt) {
    time += dt;
    const m = damp(5, dt);
    mouse.x += (mouse.tx - mouse.x) * m; mouse.y += (mouse.ty - mouse.y) * m;
    black += (blackTarget - black) * damp(6, dt);
    if (trans) {
      trans.t += dt * trans.speed; trans.p = clamp01(trans.t / trans.dur);
      const from = runners[trans.from], to = runners[trans.to];
      // In reverse the roles swap: the scene we are returning to is the transition's "A".
      const e = trans.reverse ? 1 - trans.p : trans.p;
      const a = trans.reverse ? to : from, b = trans.reverse ? from : to;
      a.s.exit = trans.linked ? e : 0; b.s.enter = trans.linked ? e : 1;
      from.s.q = to.s.q = quality;
      from.step(dt); to.step(dt);
      if (trans.p >= 1) finishTransition();
    } else if (cur >= 0) {
      const r = runners[cur]; r.s.q = quality; r.step(dt);
      if (auto) {
        const b = r.def.beats[r.s.beat];
        if (r.s.since[r.s.beat] > (b.delay || 0) + b.dur + (b.hold ?? 3)) {
          if (cur === runners.length - 1 && r.s.beat === r.s.n - 1) deck.setAuto(false); else deck.advance();
        }
      }
    }
    audio.update(dt, { scene: cur >= 0 ? scenes[trans ? trans.to : cur].id : '', beat: cur >= 0 ? runners[trans ? trans.to : cur].s.beat : 0 });
  }

  function draw() {
    if (cur < 0) return;
    let src = A;
    if (trans) {
      const from = runners[trans.from], to = runners[trans.to];
      const a = trans.reverse ? to : from, b = trans.reverse ? from : to;
      a.render(A); b.render(B);
      trans.T.inst.render({ A, B, p: trans.reverse ? 1 - trans.p : trans.p, out: OUT, a, b, sa: a.s, sb: b.s, time });
      src = OUT;
    } else runners[cur].render(A);

    const shown = runners[trans && trans.p > 0.5 ? trans.to : cur];
    const h = shown.def.hud;
    if (h !== false) {
      const label = `${shown.i + 1} / ${runners.length}`;
      pageText.set(label); pageText.x = view.x1 - 60; pageText.y = view.y1 - 54; pageText.alpha = (h && h.alpha) ?? 0.45;
      if (h && h.color && h.color !== pageText.o.color) pageText.style({ color: h.color });
      hud.render(src);
    }
    gfx.present(src, black, time);
  }

  // ── frame loop with a one-way quality governor ───────────────────────────────
  let last = 0, slow = 0, hidden = false;
  function loop(now) {
    requestAnimationFrame(loop);
    const raw = (now - last) / 1000; last = now;
    if (hidden) return;
    const dt = Math.min(raw, 0.05); // a stall must not teleport the animation
    // If we sit below ~40 fps for a while, shade fewer pixels. Never go back up: oscillation is worse than softness.
    if (!qs.get('q') && raw > 1 / 40 && raw < 0.5) { if (++slow > 45 && quality > 0.5) { quality = Math.max(0.5, quality * 0.8); slow = 0; resize(); } }
    else slow = Math.max(0, slow - 1);
    try { update(dt); draw(); } catch (e) { if (!loop.err) { loop.err = e; console.error(e); } }
  }
  if (!headless) {
    document.addEventListener('visibilitychange', () => { hidden = document.hidden; last = performance.now(); });
    new ResizeObserver(resize).observe(canvas);
    window.addEventListener('pointermove', (e) => { mouse.tx = (e.clientX / innerWidth) * 2 - 1; mouse.ty = (e.clientY / innerHeight) * 2 - 1; });
  }

  return deck;
}
