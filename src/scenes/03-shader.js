// Scene 3 — a ray-marched 3D scene in a fullscreen fragment shader.
// Shows: SDF modelling with smooth union, soft shadows, HDR emission → bloom, step count scaled by
// the quality factor s.q, a camera that co-animates with the incoming transition (s.enter),
// and the post stack being dialled in by a beat so you can see what it contributes.

import * as THREE from 'three';
import { NOISE, SDF, COLOR } from '../engine/glsl.js';
import { createPost } from '../engine/post.js';
import { ease, mix } from '../engine/math.js';

export default {
  id: 'shader',
  title: 'Every pixel is a function',
  enterWith: 'iris',
  beats: [{ dur: 2, delay: 0.9, hold: 3 }, { dur: 3, hold: 4 }, { dur: 2.5, hold: 4 }],
  notes: [
    'No models were loaded. This is one fragment shader marching a distance field.',
    'A beat feeds a uniform. Here one number, "spread", pulls a single sphere apart into six.',
    'This beat turns the finishing pass on: bloom, tone map, vignette, grain. Same scene, now it looks filmed.',
  ],
  create(ctx) {
    const { gfx } = ctx;
    // Marching is the expensive part, so it runs at 70% resolution; post and text run at full.
    const hdr = gfx.target({ type: THREE.HalfFloatType, scale: 0.7 });
    const post = createPost(ctx);

    const march = gfx.pass(NOISE + SDF + COLOR + /* glsl */ `
      uniform float uSpread, uSteps, uOrbit, uDolly; uniform vec2 uMouse;
      float map(vec3 p){
        float d = length(p) - mix(1.05, .5, uSpread);
        for (int i = 0; i < 6; i++) {
          float a = float(i) * 1.0472 + uTime * .35;
          vec3 c = vec3(cos(a), sin(a * 1.3 + float(i)) * .35, sin(a)) * 1.55 * uSpread;
          d = smin(d, length(p - c) - mix(.2, .46, uSpread), .55);
        }
        return d;
      }
      vec3 normal(vec3 p){ vec2 e = vec2(.002, 0.); return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx))); }
      float shadow(vec3 ro, vec3 rd){ float t = .05, s = 1.; for (int i = 0; i < 24; i++){ float h = map(ro + rd * t); s = min(s, 10. * h / t); t += clamp(h, .03, .4); if (s < .01 || t > 8.) break; } return clamp(s, 0., 1.); }
      void main(){
        vec2 uv = centered();
        float ang = uOrbit + uMouse.x * .25;
        vec3 ro = vec3(sin(ang), .28 + uMouse.y * -.15, cos(ang)) * uDolly;
        vec3 f = normalize(-ro), r = normalize(cross(f, vec3(0, 1, 0))), u = cross(r, f);
        vec3 rd = normalize(f * 2.3 + r * uv.x + u * uv.y);
        vec3 sun = normalize(vec3(.6, .7, .35));
        // background: dark studio gradient
        vec3 col = mix(vec3(.012, .014, .022), vec3(.05, .06, .09), smoothstep(-.6, .9, rd.y)) ;
        float t = 0.; bool hit = false;
        // Interleaved-gradient jitter trades banding for fine noise that the grain hides.
        t += fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) * .05;
        for (int i = 0; i < 96; i++) {
          if (float(i) >= uSteps) break;
          float d = map(ro + rd * t);
          if (d < .0015 * t) { hit = true; break; }
          t += d; if (t > 14.) break;
        }
        // floor plane y = -1.4
        float tf = (-1.4 - ro.y) / rd.y;
        if (hit) {
          vec3 p = ro + rd * t, n = normal(p);
          float dif = max(dot(n, sun), 0.) * shadow(p + n * .02, sun);
          float fre = pow(1. - max(dot(n, -rd), 0.), 4.);
          vec3 base = mix(vec3(.9, .28, .08), vec3(.95, .75, .5), .5 + .5 * n.y);
          col = base * (.06 + dif * 1.6) + vec3(.35, .55, 1.) * fre * 1.4;
          col += vec3(4., 1.3, .3) * pow(max(dot(reflect(rd, n), sun), 0.), 48.); // HDR highlight → bloom
        } else if (tf > 0. && rd.y < 0.) {
          vec3 p = ro + rd * tf;
          float sh = shadow(p, sun);
          float fade = exp(-dot(p.xz, p.xz) * .035);
          col = mix(col, vec3(.09, .1, .14) * (.25 + .75 * sh), fade);
          col += vec3(.9, .3, .1) * .06 * fade / (.3 + length(p.xz) * .4); // bounce from the object
        }
        o = vec4(col, 1.);
      }`, { uSpread: 0, uSteps: 80, uOrbit: 0, uDolly: 6, uMouse: [0, 0] });

    const head = ctx.text('Every pixel is a function.', { x: 140, y: 150, size: 84, font: 'display', tracking: -0.02 });
    const line2 = ctx.text('Beats drive uniforms.', { x: 144, y: 262, size: 40, font: 'body', color: '#b9c2d6' });
    const line3 = ctx.text('Post makes it film.', { x: 144, y: 262, size: 40, font: 'body', color: '#ffb08a' });
    const layer = ctx.overlay().add(head, line2, line3);
    let finish = 0;

    return {
      update(s) {
        const enter = ease.out3(s.enter);
        march.set({
          uSpread: s.k(1, 0, 3, (t) => ease.spring(t, 1.4, 4.5)),
          uSteps: Math.round(96 * (0.6 + 0.4 * s.q)),
          uOrbit: s.t * 0.12 + 0.6,
          uDolly: mix(3.4, 6.2, enter), // start close and pull back as the iris opens
          uMouse: [s.mouse.x, s.mouse.y],
        });
        march.u.uTime.value = s.t;
        finish = s.k(2, 0, 2);
        head.animate((g, fx) => { const t = ease.out4(Math.min(1, Math.max(0, (s.at(0) - g.n * 0.025) / 0.8))); fx.dy = (1 - t) * g.size * 1.3; fx.clip = 1; });
        const a2 = s.k(1, 0.2, 1), out2 = s.k(2, 0, 0.5);
        line2.alpha = a2 * (1 - out2); line2.y = 262 - out2 * 16;
        line3.alpha = s.k(2, 0.4, 1.2); line3.y = 262 + (1 - line3.alpha) * 16;
        s.cue('split', s.at(1) > 0.1, () => ctx.sfx('pop', { pitch: 0.8 }));
        s.cue('film', s.at(2) > 0.1, () => ctx.sfx('chime', { gain: 0.6 }));
      },
      render(target, s) {
        march.render(hdr);
        // Before beat 3 the pass only tone-maps; the beat fades the rest in.
        post.render(hdr, target, { bloom: 0.02 + finish * 1.1, threshold: 1, vignette: finish * 0.5, grain: finish * 0.05, contrast: 1 + finish * 0.1, ca: finish * 0.006, time: s.t });
        layer.render(target);
      },
    };
  },
};
