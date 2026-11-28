# 13 — Lessons from a twelve-scene film

A third source: *We Taught Sand to Talk*, a public Claude artifact ([link](https://claude.ai/artifact/U41NU2bGjKBgmzNKGwGdsm)). It is a short film in twelve scenes about how a grain of sand becomes the chip that runs an AI: a beach, a furnace, a crystal puller, wafers, a light source, a cleanroom, the inside of a chip, a data centre, and back to a phone on a desk.

It sits between the other two sources. Like the deck in docs 00–10 it advances on a click and has keys, autoplay and Back; like the film in doc 12 it is meant to be watched, on a phone as much as on a big screen. It is also much smaller than either: one 199 KB HTML file, readable source, three.js r128 loaded from cdnjs, and nothing else.

Nothing was copied. This is a write-up of what it does differently, and what this repo took from it.

## What is in the file

| Part | How |
|---|---|
| Rendering | three.js (`WebGLRenderer`, standard and custom shader materials, `InstancedMesh`, PMREM environments for reflections) |
| Scenes | 16 "shots" built by functions (`shotBeach()`, `shotFurnace()`…), each `{ scene, camera, fov, fit, tgt, pushAt, travelIn, travelOut, post, enter(), update(t, dt) }` |
| Slides | 12 entries in one table: shots with cut times, location label, scale keyframes, headline, subline, caption time, dwell, transition length, flash |
| Post | One bloom pyramid (quarter, eighth and sixteenth resolution), soft-knee threshold, an elliptical depth-of-field mask, chromatic aberration, split-tone grade, vignette, grain |
| Captions | DOM, not WebGL: word-by-word reveal with CSS transitions, in an `aria-live` region |
| Sound | Web Audio only: six detuned voices, a breathing low-pass, a generated reverb, one chord per slide |
| Loading | 18 build steps with storytelling labels ("Heating the furnace"), then a small-target warm-up of every shot |
| Testing | `window.FILM.seek(slide, t)` and `FILM.play(from, t, to, steps, dt)` |

## Ideas worth taking

### 1. A running instrument as the spine

Top left, for the whole film: a location label (`A BEACH`, `ARC FURNACE`, `INSIDE THE CHIP`) and a **scale readout** with a ruler. The scale is keyframed per slide (`[[0, 20], [3.1, .4], [4.9, .5 * MM]]` = 20 m, then 40 cm, then half a millimetre) and interpolated **in log space**, so a zoom from metres to nanometres moves at a steady visual rate. The ruler's tick pattern slides by `-log10(scale) × 90` px. The location label is typed and deleted like a terminal (deleting twice as fast as typing).

That readout does what the selection box does in the deck from docs 00–10: one element, present throughout, that carries the argument. Here the argument is scale, so the motif is a measuring instrument. **Choose a motif that measures the thing your talk is about** ([08](08-narrative-craft.md)).

### 2. Several shots inside one slide

A slide can hold more than one shot, each with a start time: the beach slide cuts to a single grain of quartz at 3.3 s; the chip slide cuts to transistor "canyons" at 2.8 s. The cut uses the same transition as a slide change, the location label retypes on the cut, and the scale readout keeps flowing. One click can contain a camera move *and* a cut, which is how films work.

In this repo's beat model that is a scene with an internal cut on a timer inside a beat (`s.at(i) > 3.3`). Keep each shot a pure function of time so Back still works.

### 3. A transition that feels like moving forward

Every cut is the same simple recipe, and it works for any pair of scenes:

- **both cameras keep moving**: the incoming one starts pulled back and arrives (`travelIn`); the outgoing one keeps going (`travelOut`). Going Back reverses the direction.
- **a radial zoom blur** that peaks mid-cut: `blur = 0.16 · sin(πk)^1.4`.
- **the mix happens in a window**: `smoothstep` over 12–88% of the cut, so neither end lingers half-faded.
- **an optional warm flash** shaped like a Gaussian around the middle (`flash · exp(-((k − .5)/.13)²)`) for cuts that should hit: ignition, a laser, an arc.
- **the grade crossfades too**: each shot has post settings, and they are interpolated across the cut.

Added here as the **`push`** transition (`src/transitions/push.js`) plus `dolly()` in `src/engine/camera.js`; the mesh demo scene uses both.

Two more details from its transition handling:

- **Interrupting a transition freezes it.** A click mid-cut copies the current blended frame into a texture and starts the next transition from that still. This repo speeds the running transition up 3.5× instead; both are valid. Freezing responds instantly; speeding up keeps continuity.
- **One post pass, not two.** It blends the two scenes' HDR images first and runs the finishing pass once, with blended settings. That halves post cost during cuts compared with finishing each scene separately.

### 4. Framing that survives a phone

Every shot is composed for 16:9 and then adapted:

- **Widen the lens as the screen narrows**: `tan(fov/2) × (16/9 ÷ aspect)^fit`, with `fit ≈ 0.72`. The subject stays large without losing its edges.
- **Shift the lens, not the camera**, to make room for the caption: on wide screens the subject moves right by 10% of the width; on tall screens up by 9%. `camera.setViewOffset` does this without changing perspective.
- **The depth-of-field focus ellipse moves with the shift**, so the sharp area stays on the subject.

Added here as `fitCamera()` in `src/engine/camera.js`. On a phone the mesh demo now shows the field filling the lower frame under the headline instead of a sliver in the middle.

### 5. Phones are first-class

- **A smaller pixel budget** on touch devices: 1.0 M pixels instead of 2.3 M, MSAA 2 instead of 4, quality starting at 0.9.
- **Visible controls, never hover-only**: sound, play-by-itself, full screen and keys, as real buttons with `aria-pressed`, always present. A phone has no keyboard.
- **Swipe right goes back; a tap goes forward.** The context menu is suppressed.
- **A first-run hint** ("Tap or press → to advance. A plays it by itself.") that leaves after nine seconds or on the first move.
- **Autoplay shows its progress** as a hairline under the scene counter.
- **Full screen is only offered where it exists** (`document.fullscreenEnabled`); the button is hidden otherwise.

Added here: the control bar, the hint, the progress hairline, the phone pixel budget. `?clean` hides the controls for recording or presenting.

### 6. Captions as accessible text

Headlines and sublines are DOM text in an `aria-live="polite"` region, revealed word by word (each word a span with a staggered `transition-delay`, blurring in from 7 px). A screen reader hears every caption; a sighted viewer sees the same reveal as WebGL type would give.

This repo keeps headlines in WebGL (they need to be masked, lit and hit by transitions), so it adds a **hidden live region instead**: each beat may carry a `caption`, and the scene title plus caption are announced when the beat arrives. All demo beats now have captions.

### 7. Respect reduced motion

With `prefers-reduced-motion: reduce` it shortens camera travel to 30%, turns off the transition blur, and stops the word reveals from moving. Added here as `ctx.reduced` / `s.reduced` (and `?reduced` to test it); `push` drops its blur and flash, and the mesh scene travels 4 units instead of 14.

### 8. Sound that follows the story

A single continuous bed: six voices (a sine or triangle plus a quiet detuned saw each), panned across the stereo field, through a low-pass that breathes on a 20-second LFO, into a generated 4.5 s reverb. Each slide has its own chord. On a cut, every voice **glides** to the new chord (`setTargetAtTime`, τ 1.1 s), the bed swells and brightens for the length of the transition, and a band-passed noise whoosh rises and falls with it. When the tab is hidden the sound stops, and it comes back when the viewer returns.

Added here: the starter's looped drone is replaced by that kind of live bed, with a chord per scene and a swell on each transition, and sound pauses with the tab.

### 9. Loading as part of the film

The loading bar is labelled step by step in the film's own voice: "Building the beach", "Finding one grain of sand", "Heating the furnace", "Sweeping up the sand". Fonts load in parallel with a timeout so a slow font server cannot hold the film. Warm-up renders every shot once into a **64×64** target, which compiles shaders and uploads textures without paying for full-resolution frames.

If sound cannot start (no gesture yet), the loading screen turns into a gate: *tap anywhere, or press a key*. That one gesture unlocks audio and starts the film.

### 10. Errors in plain words

A global `error` / `unhandledrejection` handler shows a sentence instead of a black page, and distinguishes the cases a viewer can act on: WebGL is switched off ("turn on hardware acceleration"), the 3D library didn't load ("check your connection"), or something else (with the message). Added here in `src/main.js`.

### 11. Two-way quality, with hysteresis

Frame time is an exponential moving average. Slow for 1.2 s, quality drops by 18%; fast for 6 s, it rises by 12%. Never during a transition, never in the first 3 seconds. This repo now does the same with fixed levels (1, 0.84, 0.7, 0.58) and gives up on a level after it has failed three times.

## Smaller details

- **One table for the whole script.** Every slide's text, timing, scale and transition is one array literal: the film's facts and pacing can be reviewed in one screen.
- **The end card is staged in steps** (2 s, 5 s, 8.6 s, 10 s, 14 s): line one, line two, line one dims, a quieter third line, then "Tap to watch again".
- **The final scene fades the picture** under the closing words, so the last frame is type on black.
- **The film is dark in both themes**, on purpose, and says so in a CSS comment: it is projected, not printed.
- **Testing hooks run the real path**: `FILM.play()` seeks, then calls the normal `update` and `renderFrame` in fixed steps, so a transition can be checked frame by frame.

## What it does not do

It is a film, not a deck: no speaker notes, no overview, no per-beat timeline inside a slide, no reverse playback of animation (Back replays the previous slide from its start). Text is DOM, so it cannot be hit by transitions or lit by the scene. Those are the parts of this repo to keep.

## What changed in this repo

| Idea | Where |
|---|---|
| `push` transition: zoom-blur crossfade in a window, optional flash | `src/transitions/push.js`, used by the mesh scene |
| Camera dolly on enter/exit | `dolly()` in `src/engine/camera.js` |
| Phone-proof framing: lens widens as the screen narrows, lens shift beside the headline | `fitCamera()` in `src/engine/camera.js` |
| Reduced motion | `ctx.reduced`, `s.reduced`, `?reduced` |
| Phone pixel budget | `MAX_PIXELS_PHONE` in `src/engine/deck.js` |
| Two-way quality governor with lockout | `src/engine/deck.js` |
| Visible controls, first-run hint, autoplay progress, `?clean` | `src/engine/ui.js`, `src/index.html` |
| Captions announced to screen readers | `caption` on each beat, live region in `src/engine/ui.js` |
| Chord per scene, swell on cuts, silent when hidden | `src/engine/audio.js` |
| Plain-words error screen | `src/main.js` |
| Motif that measures the subject; shots within a slide | [08](08-narrative-craft.md), this doc |
