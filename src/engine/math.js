// Small numeric toolkit shared by the engine and every scene.

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const mix = (a, b, t) => a + (b - a) * t;

/** 0..1 as x travels from a to b (clamped). The workhorse for staggering. */
export const remap = (x, a, b) => clamp01((x - a) / (b - a || 1e-6));

/**
 * Frame-rate independent smoothing factor.
 *   value += (target - value) * damp(6, dt)
 * behaves the same at 30, 60 and 144 fps. Higher lambda = snappier.
 */
export const damp = (lambda, dt) => 1 - Math.exp(-lambda * dt);

export const ease = {
  lin: (t) => t,
  in2: (t) => t * t,
  out2: (t) => 1 - (1 - t) * (1 - t),
  io2: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  in3: (t) => t * t * t,
  out3: (t) => 1 - Math.pow(1 - t, 3),
  io3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out4: (t) => 1 - Math.pow(1 - t, 4),
  out5: (t) => 1 - Math.pow(1 - t, 5),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  ioSine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  /** Overshoots then settles. s≈1.7 is gentle, 2.5+ is cartoonish. */
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  /** Damped oscillation that lands exactly on 1. */
  spring: (t, freq = 3.2, decay = 5.5) => 1 - Math.exp(-decay * t) * Math.cos(freq * Math.PI * 2 * t * 0.5),
};

/** Deterministic PRNG (xorshift32). Same seed, same picture — essential for scrubbing and screenshots. */
export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** "#rrggbb" → [r,g,b] in 0..1 (display-referred, i.e. still sRGB encoded). */
export function hex(c) {
  const n = parseInt(c.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** sRGB → linear for a single channel; use when feeding a hex colour to a linear-light shader. */
export const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const hexLin = (c) => hex(c).map(toLin);
