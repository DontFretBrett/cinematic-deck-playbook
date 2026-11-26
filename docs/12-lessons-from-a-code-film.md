# 12 — Lessons from a code-only film

A second source, studied after the deck: [`RezAIT00/agent-demos`, `prompts/creates-everything`](https://github.com/RezAIT00/agent-demos/tree/main/prompts/creates-everything). It is a fixed prompt asking a coding agent for a 55-second film made entirely in code, plus one finished generation with its treatment, build notes, source and QA tools.

It is a different medium from a slide deck, but the same problem: **an agent producing motion and sound it cannot watch or hear.** What is valuable is less the renderer than the brief, the process and the checks. This doc is the write-up; the repo publishes no licence, so nothing was copied, and the tools added here are new code built from the ideas.

The numbers, for scale: one agent session, 152 minutes. A WebGPU path renderer written from scratch (about 2,500 lines of JavaScript and WGSL, no libraries). A score synthesised by a numpy script. 3,300 frames at 1080p60, 32 sub-frames each, 0.2 s per frame.

## 1. The brief

The prompt is about 1,700 words in seven parts. The structure is reusable for any ambitious generated piece.

| Part | What it does |
|---|---|
| **Opening paragraph** | Goal, audience, and the bar, in terms of a viewer's behaviour: a stranger scrolling past stops in the first second, stays to the end, and does not believe it is code. |
| **The film** | A table: time range, the exact text typed, what happens. Timings are fixed to the frame and to the beat of the music. |
| **A contract** | "The code is real": the lines typed on screen are executed, the picture may read only the values they produce, and a check must throw if they did not run. |
| **How to build each world** | One bullet per element naming the technique: an FFT ocean with a named spectrum, instanced tubes, a baked boids flock, a shared point field. |
| **Look and sound** | The quality bar and a ban list. |
| **Rules** | Hard constraints, each one testable: everything is code, deterministic, a render budget, a flash limit, where files may be written. |
| **Process and checks** | How to work, given that the agent cannot watch video. |
| **Delivery** | The files, exact encode settings, and what the final reply must contain. |

What makes it work:

- **It fixes what must be fixed and names techniques where a known-good one exists**, then leaves the craft open. "A storm sea" would get a noise plane; "a multi-cascade FFT ocean with a JONSWAP spectrum set by `sea.wind`" gets an ocean.
- **The bar is a pause test.** Pause on any frame and it should look like a film frame: a clear focal point, depth, atmosphere, and real light (sun and sky, shadows, reflections, volumetrics, emissive light that lights things).
- **A ban list of defaults.** Flat graphics, neon grids, plain particle clouds, node graphs, glowing brains. Naming the clichés is the cheapest way to avoid them.
- **The camera gets a character**: a stunt pilot. Near misses, flying through and under things, banking, weight. Every move has a destination, and motion must be readable once on a phone.
- **A render budget is a design constraint**: at most about one second per final frame, so a full re-render takes under an hour. Iteration speed is protected up front.
- **It tells the agent what it cannot do and how to compensate** (section 3).
- **It demands honesty**: say plainly what you could not judge; list the weak spots.

One more thing from the repo's metadata: the prompt was written *after* a staged session (a proof of the opening, then the full film, then a fix pass) and consolidates those instructions. **Write the brief after you have done it once, and fold the fix list back in.** Several of its most specific sentences are plainly scars: "limit the slope of the climb", "never as a separate mirrored copy", "they must read as birds, never as confetti".

A fill-in version for decks is in [`templates/BRIEF.md`](../templates/BRIEF.md).

## 2. The process

1. **Treatment first.** Before any code, one table: every beat with its transformation, camera, light and sound, and how it will be built. ([`templates/TREATMENT.md`](../templates/TREATMENT.md))
2. **Prove the hardest stretch first**, at final quality, with final sound. Critique it, rebuild what fails, and only then extend the same engine to the rest. The risk is retired while it is still cheap.
3. **Three full critique-and-rebuild passes** on the whole cut, as a bored viewer. Is the first second irresistible? Is any stretch weaker than the best one? Does any frame look like a tech demo? Does the ending land? *Rebuild what fails rather than polishing it.*
4. **Audit every brightness jump** (section 5).
5. **Measure** what can be measured, and **say what could not be judged**.

What the passes actually caught, from the build notes:

| Pass | Looked at | Found |
|---|---|---|
| 1 | First 2 fps sheet of the whole cut | A one-second whiteout at the opening; a sepia cast over a whole section; a full-frame whiteout where a million additive points passed through the camera |
| 2 | Second sheet | A city that was a flat wall of uniformly lit windows; a camera aimed past its subject |
| 3 | Random full-resolution frames | A doubled element in a reflection; jagged silhouettes; shards that read as confetti; motion blur too long on small fast things |

Each pass looks at different evidence. The whole-cut sheet finds structural problems; random full-size frames find the ones that hide at thumbnail size.

## 3. Judging motion without watching it

The prompt's instruction is the most transferable sentence in it: *you can't watch video, so compensate.*

- **Consecutive-frame strips**: 12 or more frames 1/30 s apart. Smoothness, blur length and snaps are visible in a strip.
- **A 2 fps contact sheet of the whole cut**: pacing, palette changes, dead stretches, whiteouts.
- **Frame-difference metrics and screen-space speed**: how fast is the picture changing, and does it change abruptly?
- **Stills at full size and at phone size.**
- **Random frames, not flattering ones.**

And a correction the notes make against themselves: an early check ranked *mean* frame differences and reported no pops. It was wrong; it missed a six-frame pop and a one-frame step. A second tool that looked at **every** frame-to-frame change found both. **Averages hide pops. Check every frame.**

This repo now has the same loop, for decks:

```bash
npm run motion          # strips, jumps, pops, flashes, still holds, state leaks
npm run film            # frame-exact video, with a 2 fps contact sheet of the whole cut
```

See [09](09-build-test-ship.md).

## 4. Determinism: one rule, and the bug that proves it

The film is a pure function of time with seeded randomness. Simulations (a 6,000-bird flock) are baked from code at load. The page exposes `renderAt(t)` and `DURATION`.

The rule that matters:

> A frame rendered on its own must match the same frame rendered in sequence. So no buffer may be read before it has been drawn for that frame: **gate every pass and every read of it with the same function.**

The bug behind that sentence: the sea shader began mixing in a reflection buffer at 0.3 s before a cue, but the pass that *fills* that buffer began at 0.2 s before it. For six frames the shader sampled the buffer as last written, five seconds earlier: a golden sunset reflected in a night sea. Rendered alone, that frame was fine, because the buffer then held something else. It only existed in sequence.

The fix is a pattern:

```js
const on = needsReflection(s);                 // one function decides
if (on) renderReflection(reflTarget);          // the pass runs…
main.set({ tRefl: reflTarget.texture, uRefl: on ? ramp : 0 });   // …and every read is multiplied by the same answer
```

Also: bring it in with a ramp, not a switch.

For decks this is the stale-state bug in another form: an optional pass, a history buffer for temporal accumulation, a blur that is skipped below a threshold. `npm run motion` checks it two ways: it replays each scene and compares, and it re-renders every settled frame after everything else has played and compares with the first render.

Two related details from the film's fix pass:

- **Warm up before a partial re-render.** A segment re-rendered on its own started five frames early, so caches matched the sequential render.
- **Re-render only what changed.** Only the keyframe-aligned ranges containing changed frames were rendered again, then spliced with the untouched ranges by stream copy; unchanged frames were verified against the original.

## 5. The pop audit

Every frame's mean brightness is measured. Two things are listed:

- every one-frame **jump** of 8 or more (on a 0–255 scale);
- every **pop**: an excursion of 10 or more that returns within about 12 frames.

Each one gets a verdict, **intended** or **bug**, and bugs are fixed at the root. The film's audit, condensed:

| What the numbers showed | Verdict | Root cause and fix |
|---|---|---|
| +100 over five frames at the first cue | Intended | The sun igniting |
| +19 in one frame | Bug | A camera term was hard-gated on at a time (`t > 1.6`), snapping pitch 33° in one frame. Faded in over 0.35 s. |
| −56 in two frames | Bug | A whip-pan as a clearance rule flipped from climbing to diving. Smoothed over 0.1 s; pitch follows velocity averaged over ±0.18 s. Peak vertical acceleration fell from 8,883 to 1,230 m/s². |
| −19 in one frame, permanent | Bug | A shadow test treated "the ray misses" as "in shadow", so the clouds lost the sun in one frame. |
| Six bright frames | Bug | The stale buffer above |
| +27 on a cut through a window | Intended | An impact on the beat |

Rules that fall out:

- **Never switch a term on with a step in time.** Ramp it.
- **Limit the camera's slope and acceleration**, and smooth over a tenth of a second or two. A camera that follows geometry should evaluate the *same function* the GPU uses, on the CPU, so it clears what is really there.
- **A light that turns off in one frame is always a bug.**
- **Write the verdict table.** It is the proof that each pop was looked at.

## 6. Flash safety

At most three full-frame flashes in any second. A flash, WCAG 2.3.1 style, is a pair of opposing changes in relative luminance of 0.10 or more where the darker state is below 0.80. Counted on the whole frame and on each quarter of it.

The film's first full render **failed**: the camera dipped in and out of a bright wall of water four to six times a second. It was fixed at the cause (the camera path) and re-rendered.

A deck is shown on a large bright screen in a dark room. This check belongs in the routine.

## 7. One source of truth

"The code is real" is a specific mechanism:

- every line typed on screen lives in one list, with its timing;
- each is executed against a `world` object;
- the picture reads only the resulting values (wind speed sets the ocean spectrum, a height sets a curl radius, an hour sets the sun);
- a check throws at load if the program did not run;
- the key-click sounds are generated from the same strings, so when the last line was reworded the soundtrack followed automatically.

For a deck: **put every fact the deck states in one object, and make the headline, the geometry and the notes all read from it.** If a number changes, the bar, the label and the sentence change together, and a boot-time assertion catches a headline that claims something the data does not say.

## 8. Continuity: each world made from the one before

The film has no cuts, and the prompt lists the disguises it will not accept: crossfade, wipe, whiteout, fog cover, hidden cut. Instead:

- **One surface, three stages.** Sea, barrel wave and cathedral nave are a single parametric cross-section that morphs.
- **The same pieces.** Glass shards from a window unfold into birds; each bird's flat silhouette lies inside its shard.
- **One shared point field** carries city windows, then rising lights, then a spiral galaxy, then a single point.
- **A rhyme.** The cursor becomes the sun in the first second; in the last seconds everything collapses to a point, which is the cursor.

For decks this is a stronger form of the hand-off rule in [05](05-transitions.md): where two scenes can share a primitive (the same instanced field, the same set of points, the same sheet), **re-pose it instead of blending two pictures**.

## 9. Rendering ideas worth borrowing

- **Sub-frame accumulation.** Render many jittered sub-frames per output frame and average. One mechanism buys motion blur, anti-aliasing, soft shadows, converged volumetrics and stochastic transparency. The film uses 32 (96 for the thumbnail) and varies the shutter by section: shorter (0.26 of a frame) where small fast things would smear. The starter kit's `deck.frame(dt, { sub, shutter })` does the motion-blur part for video export.
- **Reflections of text belong in the real reflection pass**, inverted and rippled by the surface, never a mirrored copy.
- **Coloured shadow maps.** Stained glass writes transmittance colour into the shadow map, so the sun throws coloured shafts.
- **Additive points need protection**: depth-test them and dim by density near the camera, or a handover becomes a full-frame whiteout.
- **Lettering without fonts**: stroke letterforms baked to an SDF atlas.
- **Collect GPU errors.** Uncaptured device errors and shader compile messages go into an array the capture tool prints at the end.
- **A capture harness that recovers**: if a frame fails, reload the page and retry it.

## 10. Sound for a timed piece

- **A tempo grid.** 120 BPM; every cue lands on a beat. One hit sits a 16th early on purpose.
- **Mastering targets**: −14 LUFS integrated, true peak at or below −1 dBTP, measured on the final file.
- **Silence is a beat.** 0.93 s of true digital zero before the last line, verified by counting zero samples.
- **The score is offline code**: additive brass and strings, a formant choir, organ ranks, modal glass, synthetic convolution halls, a look-ahead limiter.
- **Keep the score deterministic through edits.** When the final text changed, the script replayed the old random draws into a scratch bus so every later draw was unchanged; the soundtrack stayed identical up to the edit.
- **Admit the limit.** The notes say outright that the agent cannot hear: the mix was balanced by spectrum, per-second loudness and event timing, and may sound synthetic.

## 11. Type for small screens

- Sparse, large, and checked for contrast against the brightest scene it sits on.
- Title-safe margins measured, not eyeballed: the final lines sit at 0.055 of frame height with at least 9% margin either side, about a 9 px x-height on a 390 px-wide phone.
- **Edits are storytelling.** The line arrives as `= 6`; the 6 is deleted and `18` typed. The cursor walks back three places and a minus sign goes in. Watching a value change is more convincing than seeing the new value.

## 12. Notes as a deliverable

The generation's `NOTES.md` is a model worth copying ([`templates/NOTES.md`](../templates/NOTES.md)):

- deliverables with their measured properties;
- the shot list with timestamps;
- what changed after each critique pass;
- **every check, with its numbers**;
- **honest weak spots**, by time range ("the lowest-energy stretch", "about half a second that is hard to read", "towers are two-tier boxes");
- what could not be judged at all;
- the fix pass: root cause, fix, and before/after measurements.

It also corrects an earlier claim in the same document. That is the standard: the notes are a record of what is true, not a pitch.

## What changed in this repo

| Idea | Where it landed |
|---|---|
| Judge motion from strips and per-frame metrics | `tools/motion.mjs` (`npm run motion`), part of `npm run check` |
| Jumps, pops, flashes | Same tool; flash failure breaks the check |
| "Never let a hold freeze", made testable | Same tool measures motion during each hold; it immediately flagged one of the starter's own scenes, which was fixed |
| Frame alone = frame in sequence | Same tool: replay comparison and settled-frame comparison |
| Frame-exact capture, sub-frame motion blur, 2 fps sheet, verified encode | `tools/film.mjs` (`npm run film`), `deck.frame()`, `deck.begin()`, `deck.prepare()` |
| Use the real GPU headlessly | `tools/browser.mjs`; 40× faster here than software rendering |
| Treatment first; hardest part first; three critique passes; honest notes | [11](11-workflow-with-claude.md), [`templates/`](../templates/), [`CLAUDE.md`](../CLAUDE.md) |
| Gate a pass and its reads together; ramp, never switch | [03](03-rendering.md), [`CLAUDE.md`](../CLAUDE.md), [checklist](checklist.md) |
| One source of truth for facts | [08](08-narrative-craft.md), template brief |
