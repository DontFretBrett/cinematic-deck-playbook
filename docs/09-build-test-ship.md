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

## The smoke test

`npm run smoke` drives the **live** deck: every beat forward, every beat back, then notes, help, overview, and a jump. It fails on any console error and checks that navigation ended where it should, the notes are populated and every thumbnail exists.

It caught one more bug the screenshots could not: the reverb impulse was generated at 48 kHz but the audio context ran at 44.1 kHz, and the convolver rejected it.

Run `npm run check` (build + shoot + smoke) before every commit.

## Performance testing

- `?px=1` and `?px=2` to compare pixel densities; `?q=0.6` to see the low-quality path.
- The reference exposes a `perf(sceneId, n)` hook and a GPU timer (`gfx.time(fn)`: run `fn` n times, force a sync with a 1×1 `readPixels`, report ms per iteration). Worth adding when a scene is slow.
- Test on the weakest machine you will present from, on battery, at the projector's resolution.
- Software rendering in headless Chrome is 10–50× slower than a GPU. It tests correctness, not speed. The quality governor will kick in during the smoke test; that is expected.

## Version control

`dist/` and `shots/` are git-ignored. If you want a visual history, commit `shots/contact.png` at milestones.

## Rehearsal aids built in

- Reload returns to the same scene and beat (URL hash).
- `?quick` skips warm-up.
- `O` jumps anywhere.
- `A` plays the whole deck; record the tab for a video version.
