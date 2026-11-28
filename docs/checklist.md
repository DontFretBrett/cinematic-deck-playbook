# Checklist

## Story

- [ ] The talk works read aloud from the notes alone.
- [ ] Each scene: one establishing image, one transformation, one decisive act or scale break.
- [ ] Each scene's geometry encodes its claim, and the note says how.
- [ ] One motif recurs and *does* something in most scenes.
- [ ] Every cut: the outgoing last frame hands something to the incoming first frame.
- [ ] One headline (≤ 10 words) and at most one source line on screen at a time.
- [ ] Caveats and sources are on screen, not only in the notes.
- [ ] There is a callback or false ending, and the last frame is simple.

## Timing

- [ ] 2–4 beats per scene.
- [ ] First beat of each scene has a delay that lets the transition land.
- [ ] Picture moves first; headline arrives 1–3 s in; old headline leaves within 1 s of the next beat.
- [ ] Nothing is frozen during a hold (drift, parallax or creep).
- [ ] Autoplay (`A`) runs the whole deck at a watchable pace.

## Correctness

- [ ] `npm run check` passes with no console errors.
- [ ] Back works from every beat, including across every transition.
- [ ] Clicking fast through the whole deck never gets stuck.
- [ ] Jumping from the overview to any scene looks right.
- [ ] Reloading returns to the same scene and beat.
- [ ] One-shot sounds use `s.cue` and do not fire on Back or during warm-up.
- [ ] Any internal state is reseeded in `enter`.
- [ ] `npm run motion` reports no determinism drift: a frame rendered alone matches the same frame in sequence.
- [ ] Every optional pass and every read of its output are gated by the same function.
- [ ] Every number on screen comes from one `facts` object.

## Motion

- [ ] `npm run motion`: at most three flashes in any second, whole frame and each quarter.
- [ ] Every listed jump and pop has a verdict (intended or bug) and the bugs are fixed at the root.
- [ ] No hold is flagged `STILL`.
- [ ] Nothing switches on in a single frame; cameras have limited slope and acceleration.
- [ ] The film strips in `shots/motion/` read as smooth, and fast things are not smeared.

## Picture

- [ ] HDR scenes go through post; flat scenes deliberately do not.
- [ ] No banding in gradients or fog.
- [ ] Text is legible at thumbnail size on every beat, and against the brightest frame it sits on.
- [ ] Random frames (`npm run motion -- --random 3`) look as good as the settled ones.
- [ ] No frame looks like a default template or a tech demo (unless that is the joke).
- [ ] Looks right at 16:10, 4:3 and ultrawide (backgrounds bleed; nothing important leaves the 16:9 frame).
- [ ] Looks right on a phone held upright (`npm run shoot -- --size 390x844`): 3D scenes use `fitCamera`, headlines are readable.

## Access

- [ ] Every beat has a `caption` for screen readers.
- [ ] With `?reduced`, camera travel is short and nothing zoom-blurs or flashes.
- [ ] The on-screen controls work by tap; swipe right goes back.
- [ ] Text is sharp at the presentation resolution.

## Performance

- [ ] Smooth on the presenting machine, on battery, at the projector's resolution.
- [ ] Expensive passes are at reduced scale and scale with `s.q`.
- [ ] No hitch the first time any beat or transition appears (warm-up covers it).
- [ ] Memory is flat when stepping through the whole deck (parking works).

## Shipping

- [ ] `dist/deck.html` opens from disk with no network.
- [ ] File size is within the host's limit.
- [ ] Fonts are embedded (or the fallback stack is acceptable) and licensed for embedding.
- [ ] Notes panel, second window fallback, overview and help all work where it will be presented.
- [ ] Sound level is modest; `M` mutes.

## Handing over

- [ ] `NOTES.md` lists every check with its numbers, the weak spots, and what could not be judged.
- [ ] If a video is needed: `npm run film` output verified (frame count, decode) and its contact sheet looked at.

## On the day

- [ ] Open the file, wait for the progress bar, press `F`.
- [ ] `N` for notes on a single screen, `P` on two.
- [ ] `.` blacks the screen for discussion.
- [ ] `O` to jump for questions.
