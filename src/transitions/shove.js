// shove: the new scene pushes the old one up and out, like two cards on a table.
//
// What makes it read as physical rather than as a CSS slide:
//   • both cards shrink a little mid-move (they are objects, not the screen)
//   • motion blur along the travel, sized by the eased velocity
//   • a soft shadow where the cards meet
//
// The blur is "free": sample the same composite at several nearby values of p and average.

export default {
  dur: 1.1,
  create(ctx) {
    const pass = ctx.gfx.pass(/* glsl */ `
      uniform sampler2D tA, tB; uniform float p; uniform vec3 uBg;
      float ease(float t){ t = clamp(t, 0., 1.); return t < .5 ? 4. * t * t * t : 1. - pow(-2. * t + 2., 3.) / 2.; }
      vec3 frame(float t){
        float e = ease(t);
        float s = 1. - .07 * sin(3.14159 * t);
        vec2 q = (vUv - .5) / s + .5;
        float y = q.y - e;                         // uv y points up and the cards travel up: 0..1 = old card, -1..0 = new card
        if (q.x < 0. || q.x > 1.) return uBg;
        vec3 c = y > 0. ? (y > 1. ? uBg : texture(tA, vec2(q.x, y)).rgb) : (y < -1. ? uBg : texture(tB, vec2(q.x, y + 1.)).rgb);
        float seam = abs(y);
        c *= 1. - .35 * exp(-seam * 40.) * sin(3.14159 * t); // contact shadow
        return c;
      }
      void main(){
        vec3 c = vec3(0.);
        float span = .02 * sin(3.14159 * p);       // widest when moving fastest
        for (int i = 0; i < 9; i++) c += frame(p + (float(i) / 8. - .5) * span);
        o = vec4(c / 9., 1.);
      }`, { tA: null, tB: null, p: 0, uBg: [0.02, 0.02, 0.025] });
    return { render({ A, B, p, out }) { pass.set({ tA: A.texture, tB: B.texture, p }); pass.render(out); } };
  },
};
