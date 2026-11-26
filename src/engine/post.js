// The finishing pass: HDR linear light in, display-ready picture out.
//
//   const post = createPost(ctx);
//   post.render(hdrTarget, outTarget, { bloom: 0.6, exposure: 1, vignette: 0.35, grain: 0.04, time: s.t });
//
// Convention used throughout the kit:
//   • scenes shade in LINEAR light into a HalfFloat target (values above 1 are welcome — they bloom)
//   • this pass blooms, tone-maps, converts to sRGB, grades, vignettes and grains
//   • everything after it (text overlays, transitions, the screen) is display-referred 8-bit
//
// The one finishing pass is most of what makes shader work look "filmed" instead of "rendered".

import * as THREE from 'three';
import { COLOR, HASH } from './glsl.js';

const DOWN = /* glsl */ `
uniform sampler2D tA; uniform float uThreshold; uniform float uFirst;
void main(){
  vec2 px = 1. / vec2(textureSize(tA, 0));
  // 4 bilinear taps on the diagonals = a 4x4 box, cheap and stable.
  vec3 c = (texture(tA, vUv + px * vec2(-1, -1)).rgb + texture(tA, vUv + px * vec2(1, -1)).rgb
          + texture(tA, vUv + px * vec2(-1, 1)).rgb + texture(tA, vUv + px * vec2(1, 1)).rgb) * .25;
  c = min(c, vec3(64.));
  if (uFirst > .5) {
    float l = max(c.r, max(c.g, c.b));
    c *= max(0., l - uThreshold) / max(l, 1e-4);   // soft threshold keeps hue
    c /= 1. + dot(c, vec3(.2126, .7152, .0722)) * .1; // tame single hot pixels ("fireflies")
  }
  o = vec4(c, 1.);
}`;

const UP = /* glsl */ `
uniform sampler2D tA, tB; uniform float uRadius;
void main(){
  vec2 px = 1. / vec2(textureSize(tA, 0));
  vec3 c = vec3(0.);
  // 3x3 tent
  c += texture(tA, vUv + px * vec2(-1, -1)).rgb + texture(tA, vUv + px * vec2(1, -1)).rgb + texture(tA, vUv + px * vec2(-1, 1)).rgb + texture(tA, vUv + px * vec2(1, 1)).rgb;
  c += 2. * (texture(tA, vUv + px * vec2(-1, 0)).rgb + texture(tA, vUv + px * vec2(1, 0)).rgb + texture(tA, vUv + px * vec2(0, -1)).rgb + texture(tA, vUv + px * vec2(0, 1)).rgb);
  c += 4. * texture(tA, vUv).rgb;
  o = vec4(c / 16. * uRadius + texture(tB, vUv).rgb, 1.);
}`;

const FINAL = COLOR + HASH + /* glsl */ `
uniform sampler2D tA, tBloom;
uniform float uBloom, uExposure, uVignette, uGrain, uContrast, uSaturation, uCA, uFade;
uniform vec3 uFadeColor;
void main(){
  vec2 d = vUv - .5;
  // Chromatic aberration grows with the cube of the distance from centre: invisible mid-frame, lens-like at the edge.
  vec2 k = d * dot(d, d) * uCA;
  vec3 c = vec3(texture(tA, vUv + k).r, texture(tA, vUv).g, texture(tA, vUv - k).b);
  c += texture(tBloom, vUv).rgb * uBloom;
  c = aces(c * uExposure);
  c = toSrgb(c);
  c = (c - .5) * uContrast + .5;
  c = mix(vec3(luma(c)), c, uSaturation);
  c *= 1. - uVignette * smoothstep(.25, 1.1, length(d * vec2(uRes.x / uRes.y, 1.)) * 1.1);
  c = mix(c, uFadeColor, uFade);
  // Grain is strongest in the midtones and vanishes in pure black / white.
  float n = hash12(gl_FragCoord.xy + fract(uTime) * 91.7);
  c += (n - .5) * uGrain * (1. - abs(luma(c) - .5) * 1.6);
  o = vec4(clamp(c, 0., 1.), 1.);
}`;

export function createPost(ctx, { levels = 5 } = {}) {
  const { gfx } = ctx;
  const chain = [];
  for (let i = 0; i < levels; i++) chain.push({
    down: gfx.target({ scale: 1 / (2 << i), type: THREE.HalfFloatType }),
    up: gfx.target({ scale: 1 / (2 << i), type: THREE.HalfFloatType }),
  });
  const down = gfx.pass(DOWN, { tA: null, uThreshold: 1, uFirst: 0 });
  const up = gfx.pass(UP, { tA: null, tB: null, uRadius: 0.85 });
  const fin = gfx.pass(FINAL, { tA: null, tBloom: null, uBloom: 0, uExposure: 1, uVignette: 0, uGrain: 0, uContrast: 1, uSaturation: 1, uCA: 0, uFade: 0, uFadeColor: [0, 0, 0] });

  return {
    render(src, dst, { bloom = 0.5, threshold = 1, radius = 0.85, exposure = 1, vignette = 0.3, grain = 0.035, contrast = 1.04, saturation = 1, ca = 0, fade = 0, fadeColor = [0, 0, 0], time = 0 } = {}) {
      if (bloom > 0) {
        let from = src;
        chain.forEach((l, i) => { down.set({ tA: from.texture, uThreshold: threshold, uFirst: i === 0 ? 1 : 0 }); down.render(l.down); from = l.down; });
        let acc = chain[levels - 1].down;
        for (let i = levels - 2; i >= 0; i--) { up.set({ tA: acc.texture, tB: chain[i].down.texture, uRadius: radius }); up.render(chain[i].up); acc = chain[i].up; }
        fin.u.tBloom.value = acc.texture;
      } else fin.u.tBloom.value = null;
      fin.set({ tA: src.texture, uBloom: (bloom / levels) * 1.6, uExposure: exposure, uVignette: vignette, uGrain: grain, uContrast: contrast, uSaturation: saturation, uCA: ca, uFade: fade, uFadeColor: fadeColor });
      fin.u.uTime.value = time;
      fin.render(dst);
    },
  };
}
