# 01 — The engine

The engine's job is to make scenes easy to write and impossible to break live. Starter-kit files are in `src/engine/`.

## The scene contract

```js
export default {
  id: 'chart',                 // also the URL hash
  title: 'The chart',          // overview + notes window
  enterWith: 'iris',           // transition used to arrive here
  beats: [{ dur: 1.4 }, { dur: 1.0, delay: 0.2, hold: 4 }],
  notes: ['…beat 1…', '…beat 2…'],
  hud: { color: '#fff', alpha: 0.5 },   // page-number styling; false hides it
  create(ctx) {
    // allocate targets, passes, text
    return {
      init() {},               // optional, may be async: bake textures
      enter(s) {},             // reset any internal state
      update(s) {},            // write uniforms and layout from the state
      render(target, s) {},    // run the pass chain into `target`
      exit(s) {}, resize() {},
      portal(s) {},            // optional hook for transitions (see 05)
    };
  },
};
```

`ctx` gives a scene everything: `gfx`, `view`, `type`, `text()`, `overlay()`, `sfx()`, `asset()`, `mouse`, `THREE`, and `deck`.

The split matters. **`update` only computes; `render` only draws.** Warm-up, screenshots and transitions all call them in ways a naive scene would not expect (zero `dt`, twice per frame, out of order).

## gfx: targets and passes

Two primitives carry almost everything:

- `gfx.target({ scale, type, depth, samples })` — a render target that tracks the window size. `scale: 0.5` gives a half-resolution buffer that stays half-resolution on resize.
- `gfx.pass(fragmentSource, uniforms)` — a fullscreen shader. One oversized triangle (`(-1,-1) (3,-1) (-1,3)`) instead of a quad, a standard header prepended (`vUv`, `o`, `uRes`, `uTime`), and `render(target)` fills in `uRes` from the target it is drawing to.

Renderer flags, and why:

| Flag | Reason |
|---|---|
| `antialias: false` | Everything is drawn into offscreen targets; MSAA on the backbuffer would be wasted. Scenes that need MSAA ask for `samples: 4` on their own target. |
| `toneMapping: NoToneMapping` | The engine's own post pass tone-maps. |
| `autoClear: false` | Passes are composed by hand. |
| `preserveDrawingBuffer` only when headless | So a screenshot can read the canvas at any moment. |
| float colour-buffer extensions | HDR half-float targets. |

In the reference deck, uniform values that are already `{ value }` objects are passed through untouched, so several materials can share one uniform object: write it once, every shader sees it. Scenes keep one dictionary of shared uniforms and spread it into every material.

## Ownership and parking

Every target remembers who created it. The deck sets `gfx.owner = sceneRunner` around `create(ctx)`, so the tagging is automatic. Then:

- Scenes more than one slide away are **parked**: all their window-sized targets are resized to 2×2. GPU memory stays flat however many scenes the deck has.
- Transitions are parked too unless the current or next scene needs them.
- Fixed-size targets (baked textures) are never parked.

One catch from the reference: ownership is cleared before the first `await` in `init()`, so anything allocated after an await is un-owned and never parked. Allocate window-sized targets synchronously.

## Warm-up

The first time a shader is used the driver compiles it, and that hitch (tens to hundreds of milliseconds) would land mid-sentence. So before the talk starts, behind a progress bar:

1. For every scene: `init()`, then for every beat render once at progress 0.5 and once at 1.0. Different beats switch on different code paths.
2. Render the scene's entry transition at p = 0.2, 0.5, 0.8.
3. `gl.finish()` so the work really happens now.
4. Await one animation frame per scene so the progress bar paints.

Sound is muted during this (`audio.quiet`). After any navigation, the next two scenes are re-warmed 300 and 600 ms later in case they were parked.

`?quick` skips the whole thing for fast reloads while authoring.

## Resolution and the quality governor

- Device-pixel ratio is clamped to 2.
- Total pixels are capped: `k = min(1, sqrt(2560·1600 / (w·h)))`. A 5K display does not get 5K shading.
- A quality factor scales internal resolution when frames are slow. It is exposed to scenes as `s.q` so they can also scale step counts and instance counts (`steps = round(96 · (0.6 + 0.4·q))`).

The reference governor is two-way and careful:

- Levels `[1, 0.84, 0.7, 0.58]`; frame time is an exponential moving average (0.94 / 0.06).
- Step **down** when the average exceeds 21 ms and 1.2 s have passed since the last change.
- Step **up** only after 5 s of accumulated fast frames (a slow frame subtracts 12× its duration), 6 s since the last change, not during a transition, and only if that level has been abandoned fewer than three times.
- Frames over 200 ms and hidden tabs are ignored.
- The backbuffer stays full size; only internal targets shrink.

The starter kit's governor only steps down. Oscillation is more visible than softness.

## The frame

```
dt = min(elapsed, 0.05)            a stall must not teleport the animation
update:  smooth the mouse, step the active scene (or both, during a transition)
draw:    scene → A            (transition: both → A and B, transition → OUT)
         page-number overlay onto the result
         present(result): × (1 − black), + dither
```

Two rules in `present`: add triangular-PDF dither (the sum of two hashes, ±1/255), and skip it where all channels are above 0.9985 so pure white stays pure white.

## Navigation edge cases, all handled in one place

| Situation | Behaviour |
|---|---|
| Click during a transition | Transition speeds up 3.5×; one advance is queued for when it lands |
| Back during a transition | Just the 3.5× speed-up |
| Back at beat 0 | Replays the *current* scene's entry transition in reverse at 0.55× duration; previous scene arrives with all beats complete |
| Jump from the overview | Plain fade; beats before the target are pre-completed |
| Missing transition name | Falls back to fade |
| `init()` called twice (warm-up racing navigation) | It is a memoised promise |
| WebGL 2 unavailable | A plain sentence on screen instead of a blank page |
| A frame throws | Caught; logged once; the loop keeps running |

## Deterministic hooks

`?headless` turns off the frame loop, the UI, parking and warm-up. Then:

- `deck.seek(sceneId, beat, t)` shows a scene with beats up to `beat` settled, at scene time `t`.
- `deck.seekTransition(sceneId, p)` freezes the transition into a scene at progress `p`.
- `window.ready = true` once the first frame exists.

And for playing the deck in fixed time steps (motion audits, video export):

- `deck.prepare()` initialises every scene and transition up front.
- `deck.begin(sceneId, beat)` puts a scene at the very start of a beat; `deck.beginTransition(sceneId)` arms the transition into it.
- `deck.tick(dt)` advances time and draws; `deck.advance()` moves to the next beat.
- `deck.frame(dt, { sub, shutter })` renders one output frame from `sub` sub-frames averaged in linear light while the shutter is open: motion blur for video.
- `deck.state()` reports scene, beat, progress and whether a transition is running.

These exist for screenshots, audits and export (see [09](09-build-test-ship.md)). They are also the reason scenes must be functions of their state.

## URL switches

| Switch | Meaning |
|---|---|
| `?quick` | Skip warm-up |
| `?headless` | No loop, no UI; drive with `seek` |
| `?px=1` | Force device-pixel ratio |
| `?q=0.6` | Pin the quality factor (starter kit) |
| `#scene` / `#scene-3` | Open on a scene, optionally a 1-based beat |
