# 09 — Build, test, ship

## One file

The deck ships as a single HTML file. `build.mjs` does three things:

1. **Bundle** `src/main.js` and its imports (three.js included) with esbuild into one IIFE.
2. **Inline assets**: every file under `assets/` becomes a `data:` URI in `window.__ASSETS`, keyed by its path. `ctx.asset('earth.jpg')` returns the data URI, or `assets/earth.jpg` when running un-bundled.
3. **Inject** both into `src/index.html`.

Two traps the script handles:

- A literal `</script` inside the bundle would close the tag early. Escape it.
- `String.replace(str, bundle)` interprets `$&` and friends inside the replacement. Use a function replacer.

Fonts named `assets/fonts/<Family>[-<weight>][-italic].woff2` are registered with the `FontFace` API at boot. The reference deck wraps each font load in its own try/catch and falls back to a system stack, so one bad font cannot stop the show.

### Size budget (reference deck)

| | |
|---|---|
| three.js | ~0.7 MB |
| App code | ~0.6 MB |
| 9 fonts | ~1 MB as base64 |
| 14 JPEGs | ~2.5 MB as base64 |
| Total | ~5 MB |

Base64 adds a third. Subset fonts to the glyphs you use, keep images as JPEG at the size they are sampled, and generate what you can procedurally.

### Publishing as a Claude artifact

- Everything must be inline; the starter build already is.
- `node build.mjs --fragment` also writes `dist/deck.fragment.html` without the `<!doctype>/<html>/<head>` wrapper, for hosts that supply their own page skeleton.
- Keep the file well under the host's size limit.
- Inside a sandboxed frame, pop-ups and full screen may be refused. The starter falls back to inline notes and a toast.
- Do not depend on `localStorage` or `history` working; both are wrapped in try/catch.

## The screenshot loop

Shader work is hard to review by reading code. The fix is to look at every state of the deck after every change.

```bash
npm run build && npm run shoot           # every beat of every scene, settled
npm run shoot -- --trans                 # plus each transition frozen at p = 0.5
npm run shoot -- --scene shader          # one scene
npm run shoot -- --size 1280x720
```

`tools/shoot.mjs` opens `dist/deck.html?headless&px=1`, waits for `window.ready`, calls `__deck.seek(id, beat, t)` for every beat, screenshots the canvas, and assembles `shots/contact.png`. It exits non-zero on any console error or warning.

This works only because:

- headless mode has no frame loop and `preserveDrawingBuffer` is on;
- scenes are functions of their state, so "beat 2, settled, at t = 6 s" is a well-defined picture;
- randomness is seeded.

Bugs this loop caught while building the starter kit:

| Symptom in the contact sheet | Cause |
|---|---|
| Headlines missing on each scene's first frame | Text attributes were updated in `onBeforeRender`, one frame too late |
| Transition frame showed the cards moving the wrong way | A sign error in a UV offset |
| A headline visible mid-transition as a smear | The masked rise travelled less than the mask height |
| A WebGL warning about texture offsets | A canvas texture was resized without disposing the GPU texture |

## The motion audit

Screenshots of settled beats say nothing about how the deck *moves*. `npm run motion` plays every scene and transition in fixed time steps and measures every frame:

```bash
npm run build && npm run motion
npm run motion -- --scene shader          # one scene and the transition into it
npm run motion -- --random 3              # also save 3 full-size frames per scene at random times
npm run motion -- --software              # no GPU: slower, defaults to 640x360 at 30 fps
```

| It reports | Meaning | Result |
|---|---|---|
| **Jumps** | Mean brightness changed by 8+ (of 255) in one frame | Listed: intended, or a bug? |
| **Pops** | A change of 10+ that comes back within 0.2 s | Listed. Usually a stale buffer, a snapped camera, or a light that cut out |
| **Flashes** | WCAG-style count per second, whole frame and each quarter | **Fails** above 3 in any second |
| **Hold motion** | How much the picture changes during 2 s of hold after each beat | Flags `STILL` near zero |
| **Determinism** | Replaying a scene, and re-rendering every settled frame after everything else has played, must give the same picture | **Fails** on drift |
| **Strips** | `shots/motion/<scene>.png`: per beat, six frames across the beat and six consecutive frames 1/30 s apart at peak motion | Look at them |

For each jump and pop, decide whether it is intended (an impact, a cut) or a bug, and fix bugs at the root. Keep the verdicts in `NOTES.md`.

The first time it ran on the starter deck it flagged the bar-chart scene: three beats whose holds were a perfectly frozen frame. The scene now has drifting light and bars that breathe.

To confirm the audit itself works, three bugs were planted in a scene (a three-frame flash, a strobe, and state that leaked between visits). It reported all three.

## Video export

```bash
npm run film                       # dist/deck.mp4, 1920x1080, 60 fps, autoplay timing
npm run film -- --sub 8            # 8 sub-frames per frame: motion blur
npm run film -- --hold 1.5         # cap each hold
npm run film -- --from a --to b    # part of the deck
npm run film -- --max 60           # also a two-pass copy under 60 MB
```

Nothing is screen-recorded. The deck is stepped in fixed increments, each frame is captured losslessly and piped to ffmpeg, so a slow scene cannot drop frames and every run is identical. It then verifies the file (stream facts, frame count, a full decode) and writes a 2 fps contact sheet of the whole cut, which is the quickest way to judge pacing and spot a dead stretch or a whiteout.

On an M3 Ultra the four-scene demo (38.6 s, 2,314 frames, 1080p60, 8 sub-frames) exports in about 2 m 40 s. Capture is the bottleneck (about 70 ms per frame), not rendering. The video is silent.

## Use the real GPU

The tools ask headless Chrome for the machine's GPU and fall back to software rendering. The difference is large: at 1080p the demo scenes take 0.8–2.7 ms per frame on the GPU here against 40–120 ms in SwiftShader. Pass `--software` when you need results that are identical across machines.

## The smoke test

`npm run smoke` drives the **live** deck: every beat forward, every beat back, then notes, help, overview, and a jump. It fails on any console error and checks that navigation ended where it should, the notes are populated and every thumbnail exists.

It caught one more bug the screenshots could not: the reverb impulse was generated at 48 kHz but the audio context ran at 44.1 kHz, and the convolver rejected it.

Run `npm run check` (build + shoot + motion + smoke) before every commit.

## Performance testing

- `?px=1` and `?px=2` to compare pixel densities; `?q=0.6` to see the low-quality path.
- The reference exposes a `perf(sceneId, n)` hook and a GPU timer (`gfx.time(fn)`: run `fn` n times, force a sync with a 1×1 `readPixels`, report ms per iteration). Worth adding when a scene is slow.
- Test on the weakest machine you will present from, on battery, at the projector's resolution.
- With `--software`, headless Chrome is 20–50× slower than a GPU. It tests correctness, not speed, and the quality governor will kick in during the smoke test.

## Version control

`dist/` and `shots/` are git-ignored. If you want a visual history, commit `shots/contact.png` at milestones.

## Rehearsal aids built in

- Reload returns to the same scene and beat (URL hash).
- `?quick` skips warm-up.
- `O` jumps anywhere.
- `A` plays the whole deck; `npm run film` turns that into a video.
