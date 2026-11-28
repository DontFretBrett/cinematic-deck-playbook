// push: the general-purpose "move forward" cut.
//
// A crossfade on its own looks like a slideshow. Three things make it feel like travelling:
//   1. both scenes keep moving (each scene dollies with s.enter / s.exit; see engine/camera.js dolly)
//   2. a radial zoom blur that peaks mid-cut, so the eye reads speed rather than a dissolve
//   3. the mix happens in a window (12%–88%) with a soft ramp, so neither end lingers half-faded
// An optional warm flash at the middle sells a hit (an ignition, an impact); keep it small.
//
// With prefers-reduced-motion the blur and the flash are off and it is a calm dissolve.
// Recipe adapted from a public twelve-scene WebGL film (docs/13).

export default {
  dur: 1.6,
  create(ctx) {
    const pass = ctx.gfx.pass(/* glsl */ `
      uniform sampler2D tA, tB; uniform float uMix, uBlur, uFlash; uniform vec2 uC;
      void main(){
        vec2 d = vUv - uC; vec3 a = vec3(0.), b = vec3(0.);
        if (uBlur < .0008) { a = texture(tA, vUv).rgb; b = texture(tB, vUv).rgb; }
        else {
          for (int i = 0; i < 14; i++) {
            float k = float(i) / 13.;
            vec2 uv = uC + d * (1. - uBlur * k);
            a += texture(tA, uv).rgb; b += texture(tB, uv).rgb;
          }
          a /= 14.; b /= 14.;
        }
        vec3 c = mix(a, b, uMix) + vec3(1., .78, .55) * uFlash;
        o = vec4(c, 1.);
      }`, { tA: null, tB: null, uMix: 0, uBlur: 0, uFlash: 0, uC: [0.5, 0.5] });
    const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
    return {
      render({ A, B, p, out, b }) {
        const strength = (b && b.def.push) || {};
        const blur = ctx.reduced ? 0 : (strength.blur ?? 0.16) * Math.pow(Math.sin(Math.PI * p), 1.4);
        const flash = ctx.reduced ? 0 : (strength.flash ?? 0) * Math.exp(-Math.pow((p - 0.5) / 0.13, 2));
        pass.set({ tA: A.texture, tB: B.texture, uMix: smooth((p - 0.12) / 0.76), uBlur: blur, uFlash: flash });
        pass.render(out);
      },
    };
  },
};
