# Brief template

Fill this in and hand it to the agent (with this repo as the working folder). The structure follows [docs/12](../docs/12-lessons-from-a-code-film.md): fix what must be fixed, name techniques where you know a good one, make every rule testable, and say how to check work the agent cannot watch.

Delete the guidance in *italics* as you go.

---

Build a **[N]-minute presentation** on **[topic]** for **[audience, and where it will be shown: a conference screen, a board room, a phone]**, using the deck engine in this repo. When it works, **[what the audience does or believes afterwards — describe behaviour, not adjectives]**.

Build it yourself, one scene at a time. Read `CLAUDE.md` and `docs/11-workflow-with-claude.md` first.

## The talk

*One row per beat. What is said is the spine; everything else serves it.*

| Scene | Beat | Said aloud | Headline on screen (≤ 10 words) | What changes in the picture |
|---|---|---|---|---|
| | | | | |

Motif: **[the one recurring element, its colour, and what it does in each scene]**.

Hand-offs: *for each cut, what the last frame of one scene gives to the first frame of the next.*

## The facts

*Every number or claim the deck states, with its source and date. These go in one `facts` object that headlines, geometry and notes all read from.*

| Key | Value | Source, date | Caveat to show on screen |
|---|---|---|---|
| | | | |

## How to build each scene

*One bullet per scene: the object whose geometry is the claim, and the technique. Name a technique from `docs/03` or `docs/10` when you know which you want; otherwise say what it must look like and let the agent choose. Mark the two or three hero scenes; keep the rest cheap.*

- **[scene id]:**
- **[scene id]:**

## Look and sound

- **The bar:** pause on any frame and it should **[your bar: e.g. look like a frame from a well-shot documentary / a printed poster / a product film]**: a clear focal point, depth, and light that comes from somewhere.
- **Avoid:** *the defaults you do not want. For example: flat gradients behind centred text, neon grids, plain particle clouds, node graphs, glowing brains, stock-photo metaphors.*
- **Palette and light** change with each scene: *[list, or leave to the agent]*.
- **Camera:** *[its character: a patient observer / a stunt pilot / locked off]*. Every move has a destination and is readable once.
- **Type:** one headline and at most one source line; legible at phone size and against the brightest scene it sits on.
- **Sound:** *[none / the starter's cues / a bed per scene]*, quiet, tuned to one root, fired by `s.cue` on events the audience can see.

## Rules

- Everything is code and data in this repo. No network requests at runtime; the build stays one self-contained file.
- Deterministic: every scene is a pure function of its state. A settled frame rendered on its own matches the same frame after other scenes have played. Gate every optional pass and every read of its output with the same function.
- Nothing switches on in one frame: ramp it.
- No strobing: at most three full-frame flashes in any second.
- Budget: smooth on **[the presenting machine]** at **[resolution]**; expensive passes at reduced scale and scaled by `s.q`.
- Original work: no existing characters, logos or brand marks **[other than …]**.

## Process and checks

You cannot watch the deck, so compensate. Judge motion from `npm run motion` (film strips, jumps, pops, flashes, still holds) and stills from `npm run shoot`; look at shots full-size and at thumbnail size; add `--random 3` and look at those frames too, not only the settled ones.

1. Write `TREATMENT.md` first (template in `templates/`): every beat, its transformation, camera, light, sound, and how it will be built.
2. Build a skeleton deck: all scenes with headlines and notes on flat backgrounds. Confirm pacing.
3. Prove the hardest scene first, at final quality. Critique it and rebuild what fails before starting the others.
4. Build the remaining scenes one at a time, running `npm run check` after each.
5. Do three full critique passes on the whole deck as a bored member of the audience: is the first ten seconds worth staying for, is any scene weaker than the best one, does any frame look like a default template or a tech demo, does the ending land. Rebuild what fails rather than polishing it.
6. For every jump and pop that `npm run motion` lists, decide whether it is intended or a bug, and fix bugs at the root.

## Delivery

1. `dist/deck.html`, passing `npm run check`.
2. *(optional)* `dist/deck.mp4` from `npm run film -- --sub 8`.
3. `NOTES.md` (template in `templates/`): the scene list, the facts and their sources, every check with its numbers, the jump/pop verdict table, honest weak spots, and what you could not judge.

In your final reply give the paths, the check results, and the honest weak spots.
