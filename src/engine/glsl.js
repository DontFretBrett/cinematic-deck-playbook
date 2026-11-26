// A shared GLSL library. Shaders are plain strings; compose them by concatenation:
//
//   gfx.pass(NOISE + SDF + COLOR + `void main(){ ... o = vec4(col, 1.); }`, { uMyUniform: 0 })
//
// Every fragment shader automatically gets:  vUv, o (output), uRes, uTime, uPpu and design().

export const VERT = /* glsl */ `
precision highp float;
in vec3 position;
out vec2 vUv;
void main(){ vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }
`;

export const FRAG_HEAD = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vUv;
out vec4 o;
uniform vec2 uRes;    // size of the target being drawn, in pixels
uniform float uTime;  // seconds
uniform float uPpu;   // pixels per design unit for this target
// Position of this pixel in the 1920x1080 design space (origin top-left, y down).
// The frame is centred; on non-16:9 windows the picture simply extends past 0..1920 / 0..1080.
vec2 design(){ return vec2(gl_FragCoord.x - .5 * uRes.x, .5 * uRes.y - gl_FragCoord.y) / uPpu + vec2(960., 540.); }
// Aspect-correct coordinates centred on the frame: y in -1..1 over the 1080 design height, y up.
vec2 centered(){ return (gl_FragCoord.xy - .5 * uRes) / (540. * uPpu); }
`;

// Sine-free hashes (stable across GPUs, unlike fract(sin(x)*43758.)).
export const HASH = /* glsl */ `
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
`;

export const NOISE = HASH + /* glsl */ `
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * f * (f * (f * 6. - 15.) + 10.);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * f * (f * (f * 6. - 15.) + 10.);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// Rotating the domain between octaves hides the grid.
float fbm(vec2 p){ float a = .5, s = 0.; mat2 m = mat2(.8, .6, -.6, .8); for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = m * p * 2.03; a *= .5; } return s; }
float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= .5; } return s; }
`;

export const SDF = /* glsl */ `
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
float sdBox2(vec2 p, vec2 b){ vec2 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, q.y), 0.); }
float sdRound2(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
float sdSeg2(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.) / k; return min(a, b) - h * h * k * .25; }
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// Anti-aliased coverage of a 2D SDF measured in design units: one pixel of feather, at any resolution.
float cover(float d){ return clamp(.5 - d * uPpu, 0., 1.); }
`;

export const COLOR = /* glsl */ `
vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(.04045, c)); }
vec3 toSrgb(vec3 c){ c = max(c, 0.); return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
float luma(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
// Narkowicz ACES fit: cheap filmic shoulder so highlights roll off instead of clipping.
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
`;
