# Working in this repo

This is a playbook and starter kit for cinematic single-file WebGL presentations. `docs/` holds the lessons; `src/` is a working deck engine with a four-scene demo.

## Commands

```bash
npm run build                     # → dist/deck.html
npm run shoot                     # screenshot every beat → shots/*.png, shots/contact.png
npm run shoot -- --scene <id>     # one scene
npm run shoot -- --trans          # plus transitions at p = 0.5
npm run smoke                     # drive the live deck; fails on console errors
npm run check                     # all of the above; run before finishing any change
```

## How to work on a deck

1. Read `docs/11-workflow-with-claude.md` for the process, and `docs/01`, `02`, `03` before writing a scene.
2. After every visual change: build, shoot the scene, and **open the PNGs and look at them**. Do not judge shader work by reading the code.
3. Finish with `npm run check`.

## Rules for scene code

- A scene is a pure function of its state `s` (`s.p`, `s.k(beat, t0, t1, ease)`, `s.at(beat)`, `s.t`, `s.enter`, `s.exit`, `s.mouse`, `s.q`). No timers, no `Date.now()`, no unseeded `Math.random()` in anything that affects the picture.
- `update(s)` computes; `render(target, s)` draws. Both may be called with `dt = 0`, out of order, or several times per frame.
- Any integrator (physics, accumulated speed) is reseeded in `enter(s)`.
- One-shot sounds and events go through `s.cue(name, condition, fn)`.
- Author timelines in seconds inside a beat. Stagger with an offset per item.
- Shade in linear light into a HalfFloat target, finish with `createPost(ctx).render(...)`, draw text overlays after post. Flat graphic scenes may write display colour directly and skip post.
- Hex colours are sRGB: use `hexLin()` for linear shaders, `hex()` for display-referred ones.
- Put expensive passes on reduced-scale targets and scale step or instance counts by `s.q`.
- Allocate window-sized targets synchronously in `create` so they are owned by the scene and can be parked.
- Text: `ctx.text()` blocks in the 1920×1080 design space, added to a `ctx.overlay()`. Keep to one headline (≤ 10 words) and one small source line. Solve legibility inside the picture.
- Transitions are pure functions of `p`; exactly A at 0 and exactly B at 1; they do their own easing.

## Adding things

- **Scene**: copy a file in `src/scenes/`, give it a new `id`, register it in `src/main.js`.
- **Transition**: add a file in `src/transitions/`, register it in `src/main.js`, name it in a scene's `enterWith`.
- **Sound**: add an entry to `BANK` in `src/engine/audio.js`; pitch with `H(n)` so it stays in tune.
- **Font or image**: drop it in `assets/` (fonts as `assets/fonts/<Family>[-<weight>][-italic].woff2`), then `type.font(alias, { family, weight })` or `ctx.asset(name)`.

## Don't

- Don't add DOM over the canvas for content. DOM is for presenter chrome only.
- Don't add network requests; the build must stay one self-contained file.
- Don't recreate the reference deck's scenes. Use its techniques for new pictures.
