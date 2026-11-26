# 06 — Audio

The reference deck ships no audio files. Every sound is computed in JavaScript into sample buffers at load and played through Web Audio. The result is tiny, deterministic, and can be stretched and pitched to match the animation exactly.

## Tune everything to one root

All pitches are integer harmonics of a single low note (`H(n) = root · n`). Any two sounds are then consonant by construction.

- The reference root is a low D near 36.7 Hz; its 12th harmonic is concert A.
- Melodic material uses a just-intonation scale: `1, 9/8, 5/4, 11/8, 3/2, 27/16, 15/8`. The 11/8 step gives a recognisable "question" colour.
- Callers can pass a pitch; tonal hits snap it to the nearest scale ratio.
- Dissonance is chosen deliberately for tension (16/15, 6/5, a 6% detune).
- A nice detail: the "office hum" starts at mains pitch (100 Hz) and glides to a harmonic of the root when music enters.

## Three building blocks

| Block | What it does | Why it is good |
|---|---|---|
| **Modal resonator** | A decaying sine written as a rotating phasor: `d = e^(−6.91 / (T60·sr))`, `c = cos(ω)·d`, `s = sin(ω)·d`; per sample `x' = x·c + y·s; y' = y·c − x·s`. | No trig in the loop. Three or four of these make any tick, bell, thud or domino. |
| **Swept sine** | Phase accumulator with frequency and amplitude as functions of normalised time. | Pops, drips, kicks, risers. |
| **Filtered noise** | White noise through a state-variable filter (trapezoidal form: `g = tan(π·fc/sr)`, `k = 1/Q`), cutoff updated every 16 samples. | Whooshes, wind, paper, impacts. Stable under fast modulation; low-, band- and high-pass from one filter. |

Plus a finisher (DC blocker, short tail fade, peak normalise) and a seeded PRNG so every load sounds identical.

Two more that the reference uses heavily:

- **Grain scatter**: many short noise bursts with random amplitude (`rand^3.2`) placed by a distribution, then band-passed. Paper, creases, debris.
- **Spectral pad synthesis**: draw a magnitude spectrum (a Gaussian per partial), assign random phases, run one inverse FFT. The result is a seamless loop by construction. One complex FFT yields a stereo pair (real part left, imaginary part right); bins below a cutoff share phase to keep bass centred. The same path makes coloured noise: pink `1/√f`, brown `1/f`.

## The sound bank

Entry shape: `name → [variants, gain, { reverb sends, jitter, priority, min gap }, make(rng, variant)]`. The reference has 28 one-shots rendered as 93 buffers, 20 pad loops and 30 multisampled instrument notes.

Recipes worth knowing:

| Sound | Recipe |
|---|---|
| tick | Modes at ~2.3 / 3.9 / 1.0 kHz lasting 14–30 ms, plus a 3 ms noise click |
| type (key) | 165–215 Hz body, an inharmonic partial at ×2.63, band-passed noise; a second "release" click 60–75 ms later |
| select | Two-note chime a small interval apart, 72 ms between notes, right channel detuned ×1.0016 |
| delete | Sine falling 165 → 62 Hz in 85 ms plus low-passed noise |
| pop | Sine rising 230 → 750 Hz in 70 ms |
| thud | Sine 84 → 44 Hz with two low modes |
| boom | 2.4 s stereo: two falling sines, low harmonics, rumble, soft-clipped with `tanh` |
| whoosh | Band-pass sweep 260 → 1760 Hz peaking around the middle, right channel 15 ms late |
| bell | A harmonic of the root × `[0.5, 1, 1.5, 2, 2.76, 4.07, 5.43]`, decay shortening with partial number |
| shimmer | ~46 random high-harmonic pings |
| riser | Shepard stack: five sines an octave apart gliding up under a sin² window |
| pluck / marimba / glass | Karplus–Strong; modes `1, 3.93, 9.24`; modes `1, 2.0, 2.76, 5.4`. Reversed copies cost one array reverse. |

Variants are seeded from the name and index. Playback never repeats the last variant and adds ±8% gain jitter and a small detune.

## Rendering without blocking

- Rendering starts ~250 ms after load, **before** any user gesture (creating an `AudioBuffer` does not need a running context).
- Long recipes are generators that `yield`; a runner works ~3 ms per 16 ms tick, more when something is urgently needed.
- Priority order follows the deck: the opening scene's sounds first.
- If a sound is not ready: use any finished variant, else skip silently and bump its priority. Pads retry and fade in late. **Never block, never throw.**

## Reverb from noise

An impulse response is decaying noise whose highs die first:

- white noise through two one-pole low-passes whose coefficient shrinks over time;
- envelope `e^(−6.2·t/len)`, a short onset ramp after a pre-delay;
- optional discrete early reflections (4–54 ms, random sign).

Two spaces: a 4.6 s hall and a 0.55 s room with 14 early taps. Each feeds a `ConvolverNode`.

> A `ConvolverNode` rejects a buffer whose sample rate differs from the context's. Generate impulses at `context.sampleRate`. (The starter kit's smoke test caught exactly this.)

## The graph

```
hits ─┐
beds ─┼─► sum ─► compressor (−15 dB, 5:1, 4 ms / 220 ms) ─► gain ─► soft clip ─► master ─► out
trans ┘     ▲
reverb returns
```

- A **group** exposes three inputs that differ only in reverb send: dry 0, mid 0.25, wet 0.6.
- Voices are throwaway node chains (source → filters → gain → panner), disconnected on `ended`. No pool.
- Parameters move with `setTargetAtTime`; never set `.value` on something audible.
- Hit limiting: a per-sound minimum gap (18 ms) and a global cap (26 hits per 120 ms).
- Output is deliberately quiet (ceiling about −8 dBFS).

## Beds

Two systems run together.

**Parametric beds** are driven by the visuals: `audio.param('wind', 0..1)` each frame. Each is three looping pads (filtered noise or tones) whose gains and cutoffs follow the value:

| Bed | Driven by |
|---|---|
| wind | camera altitude |
| speed | camera velocity or zoom rate |
| water | sea level / submersion |
| tension | chain tautness, countdowns |
| hum | number of lights on |

Smoothing is asymmetric (fast attack ~0.12 s, slower release ~0.4 s), and a **dead-man's switch** silences a bed when the scene stops calling it.

**Scene beds** are small generative pieces keyed by scene id, each with a look-ahead scheduler (`while (next < now + 0.28) schedule(next)`), per-beat gain tables, and its own idea: a Shepard–Risset scale that never stops rising, a canon at five speeds, a Poisson swarm of voices, a clock whose interval dilates.

On a scene change the old bed fades over ~0.85× the transition and the new one over ~1.1×. A hard-impact transition cuts the old bed at the impact and holds the new one silent until just after.

## Wiring sound to the deck

| Source | What it triggers |
|---|---|
| `emit('beat')` | Fades any transition cue still running |
| `emit('back')` | A soft page sound, pitched down |
| `emit('transition', { name, dur, reverse })` | That transition's cue; envelopes are breakpoint lists in normalised time × `dur`. Reverse plays a generic falling swish, not the cue backwards. |
| `ctx.sfx(name, { gain, pitch, pan })` from a scene | One-shots, guarded by an edge trigger |
| `audio.param(name, v)` from a scene | Parametric beds |

**Fire on threshold crossings of the thing being animated**, not on timers: a domino click per integer crossing of the fall index, a shimmer per doubling, a key sound per character change. Pitch and gain rise with the count.

## Lifecycle

- Create the context shortly after load; call `resume()` from every key and pointer handler.
- While the context is not running, every call returns early, so nothing queues up and bursts out later.
- Mute is a smoothed master gain, remembered if set before the engine exists.
- `quiet` suppresses hits during warm-up.
- Every public method is wrapped in try/catch; the first error is stored, and the deck carries on without sound.
- A watchdog timer keeps beds ticking if the frame loop stalls.

## When the piece has a fixed timeline

For a video or a deck on autoplay, a few more rules from the film in [12](12-lessons-from-a-code-film.md):

- **Put cues on a tempo grid.** Its score runs at 120 BPM and every on-screen event lands on a beat.
- **Master to a target**: −14 LUFS integrated, true peak at or below −1 dBTP, measured on the final file (`ffmpeg -af ebur128=peak=true`).
- **Silence is a beat.** Just under a second of true digital zero before the last line; verified by counting zero samples.
- **Render the score offline** in code, so it is sample-exact and reproducible.
- **Generate sounds from the same data as the picture** (key clicks from the typed strings), so an edit to one updates the other.

The starter kit's sound is real-time only; `npm run film` exports a silent video.

## Smallest viable version

This is what the starter kit implements (`src/engine/audio.js`):

1. Seeded RNG, modal writer, swept sine, noise-through-filter, normaliser.
2. Five sounds: tick, pop, thud, chime, whoosh.
3. One generated impulse on a convolver.
4. `sum → compressor → master`, with unlock and mute.
5. `hit()`, and a transition cue that stretches the whoosh to the transition's length.
6. One seamless drone (every partial completes a whole number of cycles in the loop).

Next steps in order: a pink-noise pad with `set` and `cut`; `param()` beds; per-transition cues; the time-sliced bank.
