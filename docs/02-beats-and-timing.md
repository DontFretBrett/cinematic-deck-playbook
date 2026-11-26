# 02 — Beats and timing

## The model

A scene has a list of beats. Each click moves to the next beat. Each beat has:

| Field | Meaning | Typical |
|---|---|---|
| `dur` | Length of the beat's timeline, seconds | 4–7 for a reveal, 12–14 for a "ride", under 1 for a cut |
| `delay` | Wait before it starts | 0, or 1–3 s on a scene's first beat so the transition can land |
| `hold` | Extra seconds autoplay waits after it finishes | 2.5–8; longest on a scene's last beat |

The engine keeps one number per beat, `s.p[i]`, **linear** from 0 to 1. Each frame:

- beats at or before the current one move forward by `dt / dur` once their delay has passed;
- beats you clicked past move **3× faster**, so a quick presenter never waits;
- beats after the current one move **backward at 2.4×**, so Back un-plays what it undoes.

Easing is the scene's business, not the engine's.

## Sub-timelines in seconds

The key helper:

```js
s.k(beat, t0, t1, ease)   // eased 0..1 while the beat's clock goes from t0 to t1 seconds
s.at(beat)                // the beat's clock in seconds
```

A beat is then a little script:

```js
uRise  = s.k(2, 0.1, 2.2, ease.out3);
uCrack = s.k(2, 2.7, 3.9, ease.in2);
uOpen  = s.k(2, 3.5, 6.0);
```

Staggering is the same call with an offset per item:

```js
h[i] = s.k(0, 0.2 + i * 0.12, 1.0 + i * 0.12, ease.outBack);
```

Authoring in seconds, not fractions, means you can change a beat's `dur` without rescaling everything inside it.

## One master clock per scene

Several reference scenes fold all beats into one scalar and drive a whole camera path from it:

```js
const U = ease.io3(s.enter) + k0 + k1 + k2 + k3;   // 0..5 across the scene
camera = hermitePath(U);
```

A 10–13 key spline with zero tangents at the "stop" keys gives a camera that rests at each beat and travels between them. Because it is one function of one number, it scrubs.

## Reversibility rules

Scenes should compute everything from `s`. When that is impossible:

1. **Small integrators are allowed** (a rope, a drift, a speed that accelerates) but must be reseeded in `enter(s)`, including fast-forwarding when the scene is entered at its last beat.
2. **One-shot events use an edge trigger** that fires on the rising edge only when time is moving forward:

   ```js
   s.cue('snap', s.at(2) > 1.19, () => ctx.sfx('snap'));
   // fires once when the condition turns true, only if dt > 0 and dir > 0
   ```

   Scrubbing, Back and warm-up stay silent.
3. **Backing out of an accumulated value needs its own decay**, e.g. `G -= dt * (1.2 + 3.2·G)` for a zoom that built up over time.

## Holds must not freeze

A paused picture looks broken. The reference deck layers three things under every hold:

- **Idle drift**: slow sines on camera position, a few pixels.
- **Mouse parallax**: the smoothed pointer nudges the camera (a degree or two), fading in once the scene has settled.
- **Asymptotic creep**: quantities that keep inching forward after the beat finishes, e.g. `1 − exp(−(since − 8.4) / 32)`.

Time since beat *i* started, including the delay and still counting after it completes (`s.since(i)` in the reference; the array `s.since[i]` in the starter kit), drives counters and other things that should run while the presenter talks.

## Pacing numbers from the reference deck

| | |
|---|---|
| Beats per scene | 2–4 |
| Scenes | 13 (43 beats) |
| Reveal beat | 4–7 s |
| Long "ride" beat | 10–14 s, once per act; always the payoff |
| Hands-off set piece | one 25.8 s beat in the opening scene |
| First-beat delay | 0.9–3.1 s |
| Hold before autoplay advances | 2.5–8 s (default 3) |
| Transition | 1.9–3.4 s; fade 0.7 s |
| Reverse transition | 0.55× forward duration |

Within a beat the order is consistent: **the picture moves first; the headline arrives 1–3 s in; the previous headline leaves in the first second of the next beat.**

## Easing set

Polynomial in/out/in-out (`out3`, `out4`, `io3`…), exponential, `outBack(t, s)` for overshoot (s ≈ 1.1–1.4 for motion, 2.2 for a UI pop), and `spring(t, freq, decay) = 1 − e^(−d·t)·cos(2π·f·t)`.

Also a few specialised shapes:

- `(e^(k·t) − 1) / (e^k − 1)` — an exponential ease for things that *are* exponential.
- A 7th-order smoothstep for very soft starts and stops on long moves.
- `1 + 0.085·sin(2.3t)·e^(−0.9t)` — a damped overshoot on things that unfold.

For per-frame smoothing use `value += (target − value) · (1 − e^(−rate·dt))`, never a fixed fraction; it behaves the same at any frame rate.
