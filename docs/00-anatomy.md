# 00 — Anatomy of the reference deck

The deck studied here is *The Last Boring Slide*, a public Claude artifact: a 13-slide talk about the future of AI that starts as a deliberately dull white template and then breaks out of it. Everything below was read from its source, not from running it.

## What is in the file

One HTML file, about 5 MB.

| Part | Size | Notes |
|---|---|---|
| three.js | ~700 KB | Whole library inlined with its MIT header. No CDN requests. |
| Fonts | 9 files | base64 in `window.__FONTS`: a variable sans, a mono, a serif (roman and italic), a condensed display face, a bold mono, a pixel font, and two weights of a wide display face. |
| Images | 14 JPEGs | base64 in `window.__ASSETS`: 13 overview thumbnails and one Earth map used as *data* (land in red, city lights in green). |
| Custom code | ~600 KB minified | Engine (~38 KB), audio (~63 KB), scenes and transitions (~500 KB). |
| DOM | 2 elements | A `<canvas>` and a `#ui` div for presenter chrome. |

It uses no artifact runtime features: no storage, no network, no model calls. It is a static page. The code shape (a generic engine, a headless mode, per-scene modules) says it was built from separate source files with a bundler and published as one file.

The proportions are the first lesson: **the engine is small; the scenes are where the bytes go.** Roughly 40 KB of minified code per scene.

## The page shell

```html
<title>…</title>
<style>…presenter chrome only…</style>
<canvas id="stage" tabindex="0" aria-label="The presentation"></canvas>
<div id="ui"></div>
<script>window.__FONTS = {…}; window.__ASSETS = {…}</script>
<script>…three.js + app bundle…</script>
```

The canvas is `position:fixed; inset:0; touch-action:none`. The page background matches the first slide (white), so there is no flash before the first frame, and the final dither pass deliberately leaves pure white untouched so the slide and the page are the same colour.

## The thirteen scenes

| # | id | Title | Enters with | Beats | How it is drawn |
|---|---|---|---|---|---|
| 1 | office | The Future of AI | fade | 3 | 2D overlays faking a default slide template; then a 10-style typographic montage; ends on ray-marched extruded type and 7,000 instanced cards |
| 2 | tower | The real chart | portal-in | 4 | Instanced fan-fold paper sheets, a ribbon line, volumetric clouds marched at half resolution, analytic sky |
| 3 | boat | Anchor | fold | 3 | Ray-marched ocean over baked wave textures, a few meshes, a Verlet chain, particles |
| 4 | loop | The loop | wash | 4 | Flat 2D SDF posters nested inside each other; infinite zoom |
| 5 | swarm | A country of them | portal-in | 4 | 81,600 instanced quads plus point layers, all generated from a hashed lattice; no simulation |
| 6 | dominoes | Thirty steps | flaps | 3 | 30 instanced dominoes in a self-similar world; analytic toppling; depth of field |
| 7 | calendar | 2027 | slam | 4 | One deforming grid mesh; all type drawn from an SDF atlas in the surface shader |
| 8 | lamp | How far you can see | portal-out | 3 | A mesh world in metres cross-faded into a ray-marched world in kilometres |
| 9 | selectall | Select all | daybreak | 3 | Analytic Earth and Sun in a fullscreen pass, point-sprite swarm, half-res volumetrics |
| 10 | aim | Aim | line | 4 | A mesh room, then a ride along a line through terrain, clouds, Moon, planets |
| 11 | futures | Two aims | tear | 3 | Two versions of one landscape drawn side by side with scissor; a draggable divider |
| 12 | pile | You are here | portal-in | 2 | A ribbon shaped like an exponential, tiled with snapshots of every earlier slide |
| 13 | questions | Any questions? | portal-out | 3 | Back to the plain white template; pure 2D |

Three or four beats per scene; 43 beats in total. Each scene has its own named transition in; no two adjacent cuts are the same.

## The shape of the code

```
shared GLSL strings    hashes, value noise, fbm, SDF primitives, colour helpers
gfx                    render targets, fullscreen passes, the post stack, present
view                   1920×1080 design space that extends on other aspect ratios
type                   canvas-rasterised glyph atlas, per-glyph animation
overlay / SelectBox    2D layer; the recurring selection-rectangle widget
deck                   scenes, beats, transitions, warm-up, parking, quality, frame loop
ui                     keys, pointer, notes, overview, help, toasts
audio                  DSP primitives → sound bank → Web Audio graph → beds and cues
scenes × 13            each: { id, title, enterWith, beats, notes, hud, create(ctx) }
transitions × 10       each: { dur, create(ctx) → { start, render({A, B, p, out, …}) } }
boot                   create deck → warm all behind a progress bar → start at URL hash
```

The rest of these docs take those pieces one at a time.
