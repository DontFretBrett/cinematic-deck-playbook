// Scene 1 — a shader background in HDR, finished by the post pass, with per-glyph text on top.
// Pattern: background → post → text overlay. Text goes on *after* post so it stays sharp and un-bloomed.

import * as THREE from 'three';
import { NOISE, COLOR } from '../engine/glsl.js';
import { createPost } from '../engine/post.js';
import { ease, clamp01 } from '../engine/math.js';

export default {
  id: 'title',
  title: 'Hello, deck',
  enterWith: 'fade',
  beats: [{ dur: 2.2, hold: 3, caption: 'Hello, deck.' }, { dur: 1.4, hold: 4, caption: 'A starter for cinematic, single-file presentations.' }],
  notes: [
    'Open on the title. Say nothing for a second; let the picture breathe.',
    'Every click advances one beat. A beat is a small timeline measured in seconds.',
  ],
  create(ctx) {
    const { gfx } = ctx;
    const hdr = gfx.target({ type: THREE.HalfFloatType });
    const post = createPost(ctx);

    const bg = gfx.pass(NOISE + COLOR + /* glsl */ `
      uniform float uIn; uniform vec2 uMouse;
      void main(){
        vec2 p = centered();
        // Domain-warped fbm: warp the lookup by another fbm to get flowing, non-repeating shapes.
        vec2 q = p * 1.1 + vec2(uTime * .03, 0.);
        vec2 w = vec2(fbm(q + vec2(0., uTime * .05)), fbm(q + vec2(5.2, 1.3) - uTime * .04));
        float n = fbm(q + 1.8 * w + uMouse * .15);
        vec3 deep = vec3(.006, .010, .030), mid = vec3(.03, .08, .22), hot = vec3(1.9, .62, .16);
        vec3 c = mix(deep, mid, smoothstep(.25, .75, n));
        // A warm band that only exists in HDR: values above 1 are what the bloom picks up.
        float band = exp(-pow((p.y + .62 - (n - .5) * .5) * 3.2, 2.));
        c += hot * band * smoothstep(.45, .8, w.x) * uIn;
        c *= 1. - .5 * exp(-dot(p * vec2(.55, 1.5), p * vec2(.55, 1.5)) * 1.4); // quiet zone behind the title
        c *= uIn;
        o = vec4(c, 1.);
      }`, { uIn: 0, uMouse: [0, 0] });

    const title = ctx.text('Hello, deck.', { x: 960, y: 470, size: 190, font: 'display', align: 'center', valign: 'middle', tracking: -0.02 });
    const sub = ctx.text('A starter for cinematic, single-file presentations', { x: 960, y: 640, size: 44, font: 'body', align: 'center', valign: 'middle', color: '#c9d2e6' });
    const hint = ctx.text('→ or click to advance   ·   ? for help', { x: 960, y: 980, size: 24, font: 'mono', align: 'center', valign: 'middle', color: '#8d98b3' });
    const layer = ctx.overlay().add(title, sub, hint);

    return {
      update(s) {
        bg.set({ uIn: s.k(0, 0, 2, ease.out3), uMouse: [s.mouse.x, s.mouse.y] });
        bg.u.uTime.value = s.t;

        // Masked rise: each glyph slides up from behind its own line box, staggered by index.
        const t0 = s.at(0);
        title.animate((g, fx) => {
          const t = ease.out5(clamp01((t0 - 0.35 - g.n * 0.045) / 0.9));
          fx.dy = (1 - t) * g.size * 1.05; fx.clip = 1;
        });
        // Out on exit: when a linked transition takes the scene away, the title lifts off.
        title.alpha = 1 - s.exit;
        const a = s.k(1, 0, 0.9, ease.out3);
        sub.alpha = a; sub.y = 640 + (1 - a) * 24;
        hint.alpha = s.k(1, 0.6, 1.4) * (0.6 + 0.4 * Math.sin(s.t * 2.2));
      },
      render(target, s) {
        bg.render(hdr);
        post.render(hdr, target, { bloom: 0.9, threshold: 0.9, vignette: 0.45, grain: 0.04, time: s.t });
        layer.render(target);
      },
    };
  },
};
