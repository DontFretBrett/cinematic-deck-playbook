// Scene 2 — flat graphics drawn with 2D signed-distance functions, straight to display colour (no post).
// Shows: sub-timelines with s.k(), staggering, a number that counts, a one-shot sound cue,
// a portal() hook so the next transition opens out of the tallest bar, and idle motion so holds are
// never a frozen frame (npm run motion flags a scene whose hold does not move).

import { SDF, HASH } from '../engine/glsl.js';
import { ease, mix, hex } from '../engine/math.js';
import { facts } from '../facts.js';

const N = facts.bars;
const X0 = 520, STEP = 176, BASE = 860, BAR_W = 104, MAX_H = 520;
// Both poses come from the facts, so the picture cannot claim more than the data says.
const linear = Array.from({ length: N }, (_, i) => 0.22 + (0.4 * i) / (N - 1));
const doubling = Array.from({ length: N }, (_, i) => facts.growthPerStep ** i / facts.total);

export default {
  id: 'beats',
  title: 'One click, one beat',
  enterWith: 'shove',
  beats: [{ dur: 2.2, delay: 0.5, hold: 3 }, { dur: 2.6, hold: 4 }, { dur: 1.2, hold: 3 }],
  notes: [
    'Bars grow one after another. That stagger is one line: s.k(0, 0.2 + i * 0.12, …).',
    'Second beat: the same bars re-pose from a straight line to doubling. Scenes are functions of beat progress, so Back simply un-plays this.',
    'The box lands on the tallest bar. The next transition opens out of that exact point.',
  ],
  create(ctx) {
    const { gfx } = ctx;
    const h = new Array(N).fill(0);
    const pass = gfx.pass(SDF + HASH + /* glsl */ `
      uniform float uH[${N}]; uniform float uHot; uniform vec4 uBox; uniform float uBoxA; uniform vec3 uBg, uInk, uAccent;
      void main(){
        vec2 p = design();
        vec3 c = uBg;
        // A soft patch of light drifting across the paper: a flat scene still needs something alive in a hold.
        c *= .955 + .06 * exp(-pow((p.x - 960. - 620. * sin(uTime * .21)) / 780., 2.) - pow((p.y - 420. - 120. * cos(uTime * .17)) / 900., 2.));
        // faint ruled lines
        float gy = abs(fract((p.y - ${BASE}.) / 104.) - .5) * 104.;
        c = mix(c, uInk, .06 * cover(gy - 1.) * step(p.y, ${BASE}. + 2.) * step(${X0 - 90}., p.x) * step(p.x, ${X0 + STEP * N}.));
        for (int i = 0; i < ${N}; i++) {
          float hh = uH[i] * ${MAX_H}.;
          vec2 q = p - vec2(${X0}. + float(i) * ${STEP}. + ${BAR_W / 2}., ${BASE}. - hh * .5);
          float d = sdRound2(q, vec2(${BAR_W / 2}., hh * .5), min(10., hh * .5));
          vec3 ink = mix(uInk, uAccent, i == ${N - 1} ? uHot : 0.);
          c = mix(c, ink, cover(d) * step(.5, hh));
        }
        // baseline
        c = mix(c, uInk, cover(sdBox2(p - vec2(${X0 + (STEP * N) / 2 - 36}., ${BASE + 3}.), vec2(${(STEP * N) / 2 + 30}., 1.5))));
        // selection box (outline + corner handles)
        vec2 b = p - (uBox.xy + uBox.zw * .5);
        float o1 = abs(sdBox2(b, uBox.zw * .5)) - 1.6;
        vec2 hq = abs(b) - uBox.zw * .5;
        float hd = length(hq) - 9.;
        c = mix(c, uAccent, max(cover(o1), cover(hd)) * uBoxA);
        c = mix(c, vec3(1.), cover(hd + 4.) * uBoxA);
        c += (hash12(gl_FragCoord.xy) - .5) / 255.;
        o = vec4(c, 1.);
      }`, { uH: h, uHot: 0, uBox: [0, 0, 10, 10], uBoxA: 0, uBg: hex('#f3efe6'), uInk: hex('#1b1d22'), uAccent: hex('#ff5a1f') });

    const head = ctx.text('One click, one beat.', { x: 430, y: 150, size: 92, font: 'display', color: '#1b1d22', tracking: -0.02 });
    const sub = ctx.text('Each beat is a tiny timeline, in seconds.', { x: 434, y: 262, size: 38, font: 'body', color: '#5b606b' });
    const big = ctx.text('×' + facts.total, { x: X0 + STEP * (N - 1) + BAR_W / 2, y: 250, size: 110, font: 'display', color: '#ff5a1f', align: 'center', valign: 'baseline' });
    const layer = ctx.overlay().add(head, sub, big);
    let top = { x: 0, y: 0 };

    return {
      portal: () => top, // design-space point the iris transition opens from
      update(s) {
        for (let i = 0; i < N; i++) {
          const grow = s.k(0, 0.2 + i * 0.12, 1.0 + i * 0.12, (t) => ease.outBack(t, 1.4));
          const morph = s.k(1, 0.1 + i * 0.08, 1.5 + i * 0.08, ease.io3);
          const breathe = 1 + 0.012 * Math.sin(s.t * 1.3 + i * 0.9); // bars never sit perfectly still
          h[i] = Math.max(0, grow) * mix(linear[i], doubling[i], morph) * breathe;
        }
        const hot = s.k(1, 1.2, 2.2, ease.out3);
        const tall = h[N - 1] * MAX_H;
        top = { x: X0 + STEP * (N - 1) + BAR_W / 2, y: BASE - tall };
        const pop = s.k(2, 0, 0.6, (t) => ease.outBack(t, 2.2));
        const pad = 18 + (1 - pop) * 60 + Math.sin(s.t * 3) * 2;
        pass.set({ uHot: hot, uBox: [top.x - BAR_W / 2 - pad, top.y - pad, BAR_W + pad * 2, tall + pad * 2], uBoxA: s.k(2, 0, 0.25) * (1 - s.exit * 3) });

        pass.u.uTime.value = s.t;
        head.animate((g, fx) => { const t = ease.out4(Math.min(1, Math.max(0, (s.at(0) - g.n * 0.03) / 0.7))); fx.dy = (1 - t) * 40; fx.alpha = t; });
        sub.alpha = s.k(0, 0.9, 1.6);
        // A number that counts with the bars.
        big.set('×' + Math.max(1, Math.round(Math.pow(facts.total, s.k(1, 0.4, 2.2, ease.io3)))));
        big.alpha = hot; big.y = top.y - 34;

        s.cue('pop', s.at(1) > 1.3, () => ctx.sfx('pop', { pitch: 1.3 }));
        s.cue('select', s.at(2) > 0.05, () => ctx.sfx('tick', { pitch: 1.6, gain: 0.8 }));
      },
      render(target) { pass.render(target); layer.render(target); },
    };
  },
};
