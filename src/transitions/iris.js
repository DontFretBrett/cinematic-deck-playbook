// iris: the next scene opens out of a point in the current one.
//
// The outgoing scene can say where by exposing  portal(s) → { x, y }  in design units
// (for example the tip of the thing the audience is already looking at). That one hook is
// what turns a wipe into "we went *into* that".
//
// Recipe: an SDF circle mask with a noisy edge and a bright rim; the old picture pushes in
// towards the point while the new one settles back from a slight zoom, so both feel like one camera move.

import { NOISE } from '../engine/glsl.js';

export default {
  dur: 1.5,
  create(ctx) {
    const pass = ctx.gfx.pass(NOISE + /* glsl */ `
      uniform sampler2D tA, tB; uniform float p; uniform vec2 uC; uniform float uMaxR; uniform vec3 uRim;
      void main(){
        vec2 d = design() - uC;
        float e = p * p * (3. - 2. * p);
        float ang = atan(d.y, d.x);
        float wobble = (fbm(vec2(ang * 2.5, uTime * .6 + p * 3.)) - .5) * 90. * sin(3.14159 * p);
        float R = pow(e, 1.6) * (uMaxR + 120.);
        float edge = length(d) + wobble - R;
        float m = smoothstep(2., -2., edge * uPpu / 1.5);              // 1 inside the iris
        vec2 c = vec2(uC.x - 960., 540. - uC.y) * uPpu / uRes + .5;   // the point, in uv
        vec3 a = texture(tA, c + (vUv - c) / (1. + .35 * e)).rgb;      // old scene pushes in
        vec3 b = texture(tB, c + (vUv - c) * mix(.82, 1., 1. - pow(1. - p, 3.))).rgb; // new scene settles
        vec3 col = mix(a, b, m);
        col += uRim * exp(-abs(edge) * .035) * sin(3.14159 * p) * .9;   // glow on the edge
        o = vec4(col, 1.);
      }`, { tA: null, tB: null, p: 0, uC: [960, 540], uMaxR: 1200, uRim: [1, 0.55, 0.25] });

    return {
      render({ A, B, p, out, a, sa, time }) {
        const v = ctx.view;
        const c = (a.inst.portal && a.inst.portal(sa)) || { x: 960, y: 540 };
        // Far enough to clear the farthest visible corner.
        const maxR = Math.max(...[[v.x0, v.y0], [v.x1, v.y0], [v.x0, v.y1], [v.x1, v.y1]].map(([x, y]) => Math.hypot(x - c.x, y - c.y)));
        pass.set({ tA: A.texture, tB: B.texture, p, uC: [c.x, c.y], uMaxR: maxR });
        pass.u.uTime.value = time;
        pass.render(out);
      },
    };
  },
};
