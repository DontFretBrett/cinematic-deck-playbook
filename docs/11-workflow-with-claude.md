# 11 — Making a new deck with Claude

A process that works, in order. The reference deck is roughly 40 KB of minified code per scene; that is a lot of careful shader work. It gets built scene by scene with a tight look-at-it loop, not in one prompt.

## Step 0 — Set up

Copy this repo (or just `src/`, `tools/`, `build.mjs`, `package.json`) into the new project. Run `npm install && npm run check` to confirm the demo deck builds and passes.

Point Claude at the repo's `CLAUDE.md` and the docs. In a fresh session:

> Read CLAUDE.md, README.md and docs/02, 03, 05 and 08 before writing anything.

## Step 1 — Story before pixels

Ask for a beat sheet, not a deck.

> I'm giving a 10-minute talk on **[topic]** to **[audience]**. The one thing they should leave believing is **[claim]**.
> Draft a beat sheet using the method in docs/08: 6–9 scenes, 2–4 beats each. For every beat give: what I say (one or two spoken sentences), the on-screen headline (10 words or fewer), and what changes in the picture.
> Don't design visuals yet.

Edit this until the talk works read aloud. Everything later is cheaper to change than this.

## Step 2 — One object per scene

> For each scene, propose two candidate visual metaphors where the *geometry* is the claim (see the table in docs/08 and the recipes in docs/10). For each: the establishing image, the one transformation, and how it ends. Say which rendering approach from docs/03 it needs and roughly how expensive it is.
> Also propose one recurring motif for the whole deck and what it does in each scene.

Pick one per scene. Prefer cheap techniques (2D SDF, instancing from a formula) for most scenes and spend the budget on two or three hero scenes.

## Step 3 — The hand-offs

> For each cut, say what the outgoing scene's last frame hands to the incoming scene's first frame, and which transition from docs/05 fits. If nothing fits, use `fade` or `shove`.

Now you have the storyboard table:

| # | id | Says | Headline | Picture | Technique | Ends on | Transition in |
|---|---|---|---|---|---|---|---|

Commit it as `STORYBOARD.md` in the deck's repo.

## Step 4 — Skeleton deck

> Create one scene file per row with the right `id`, `title`, `beats`, `notes` and `enterWith`. Each scene should render a flat background colour and the headline text for each beat, using the masked-rise reveal. No visuals yet. Register them in `src/main.js`. Run `npm run check`.

You can now rehearse the whole talk with placeholder pictures. Fix pacing here.

## Step 5 — One scene at a time

For each scene, in its own session or clearly separated turn:

> Build scene `[id]` from STORYBOARD.md.
> - Follow the scene contract in docs/01 and the colour convention in docs/03.
> - Everything must be a function of `s` (beat progress and time) so Back and `seek` work. Any integrator is reseeded in `enter`.
> - Use `s.k(beat, t0, t1, ease)` timelines in seconds. Use `s.cue` for sounds.
> - Scale step and instance counts by `s.q`.
> - After each meaningful change run `npm run build && npm run shoot -- --scene [id]` and **look at** `shots/[id]-*.png`. Iterate until each beat reads clearly at thumbnail size.
> - Finish with `npm run check`.

What to ask for when reviewing shots:

- "Is the headline legible? If not, fix it inside the picture (scrim, quiet zone), not with a box."
- "At thumbnail size, can you tell what changed between beat 1 and beat 2?"
- "What moves during the hold?"

## Step 6 — Transitions

> Implement the `[name]` transition from docs/05 for the cut into `[id]`. It must be a pure function of `p`, output exactly A at 0 and B at 1, and work in reverse. Add any `portal` hook the scene needs. Check with `npm run shoot -- --trans`.

## Step 7 — Sound

Add cues last, when timings are stable: `s.cue` for one-shots, a transition cue per custom transition. See docs/06 for what to add beyond the starter's five sounds.

## Step 8 — Polish pass

> Go through docs/checklist.md against this deck and fix what fails.

Then present it to yourself with `A` (autoplay) and watch for dead holds.

## Prompts for common fixes

| Problem | Ask for |
|---|---|
| Looks "rendered", not filmed | "Route it through the post pass: bloom with a threshold, ACES, vignette 0.3, grain 0.03. Make sure highlights exceed 1.0 in linear." |
| Banding in gradients | "Add interleaved-gradient jitter to the march start, and confirm the present pass dithers." |
| Slow | "Move the expensive pass to a 0.5-scale target, scale steps by `s.q`, and add an early-out." |
| Motion feels mechanical | "Stagger by index, use `out4` for entrances, add a small `outBack` overshoot on the one element that should feel physical, and add idle drift." |
| Text fights the picture | "Add a quiet zone behind the text in the shader and shift the subject with an off-axis projection." |
| Back looks wrong | "Find state that is not derived from `s`. Move it to a function of `s.k(...)` or reseed it in `enter`." |
| First click on a scene hitches | "Check warm-up renders that code path. Does a later beat switch on a branch the warm-up never hits?" |

## What not to ask for

- "Make the whole deck" in one go. Each scene needs its own look-at-it loop.
- A recreation of someone else's scenes. Take the techniques; make your own pictures for your own argument.
- More text on screen.
