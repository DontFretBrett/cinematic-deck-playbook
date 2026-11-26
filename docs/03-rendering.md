# 03 — Rendering

## One colour convention

```
scene shading      linear light, HalfFloat target, values above 1 allowed
        ↓
post pass          bloom → exposure → tone map → sRGB → contrast → saturation → lift/gain → vignette → grain
        ↓
display-referred   text overlays, transitions, page number
        ↓
present            × (1 − black) → dither → screen
```

Rules that follow from it:

- Hex colours are sRGB. Convert them (`toLin`) before using them in a linear shader. Canvas textures are tagged sRGB or converted on read.
- Text goes on **after** post so it stays crisp and does not bloom, unless you want glowing text, in which case draw it into the HDR target with a gain above 1.
- Flat graphic scenes skip post entirely. The reference deck's poster scene, the white template and the calendar use no tone map at all.
- Transitions that blend two images decode to linear, mix, and re-encode.

## The post stack

Order, as in the reference `gfx.post(src, dst, opts)`:

1. **Chromatic aberration**, radial, growing with the cube of distance from centre: `k = d · dot(d, d) · amount`. Invisible mid-frame.
2. **Bloom.** Six-level downsample chain (½ … 1⁄64).
   - First level applies a soft threshold on the max channel, `c *= max(0, l − thr) / l`, which keeps hue.
   - Anti-firefly on the same level: `c /= 1 + luma · 0.12`.
   - Downsample with a 13-tap filter; upsample with a 3×3 tent, adding each level back.
   - **Halation** tints the bloom: `× (1 + h·0.35, 1, 1 − h·0.35)`.
3. **Exposure**, then **tone map**: AgX, ACES, or none.
4. **sRGB encode**, then contrast about 0.5, saturation, and `c·gain + lift·(1 − c)`.
5. **Vignette**, optional fade to a colour.
6. **Grain**, weighted to the midtones: `(n − 0.5) · g · (1 − |luma − 0.5|)`.

Settings the reference scenes actually use:

| Scene mood | Tone | Bloom / threshold | Contrast | Saturation | Vignette | Grain | Extras |
|---|---|---|---|---|---|---|---|
| Dawn sky, climbing | ACES | 0.3 / 1.6 | 1.05–1.1 | 1.08 | 0.1 | 0.022 | exposure 0.8→0.88 |
| Stormy sea | AgX | 0.28–0.36 | 1.28–1.36 | 1.22–1.28 | 0.34 | 0.03 | halation 0.5, CA 0.004 |
| Night city of lights | ACES | 0.5→0.85 / 0.6 | 1.06 | 1.1 | 0.3 | 0.028 | halation 0.4, blue lift |
| Macro with depth of field | AgX | 0.22 / 3 | 1.3 | 1.18 | — | 0.022 | warm gain |
| Night to sunrise | ACES | 0.75→0.42 / 0.55→1.2 | 1.06→1.22 | — | 0.35→0.22 | 0.028 | halation 0.6 |
| Printed paper | none | none | 1.06 | — | yes | 0.022 | |

Pattern: **grain 0.02–0.03 always; bloom threshold low at night and high in daylight; post values animate with the beats**, so the grade follows the story.

## A pass and its readers share one gate

If a pass only runs some of the time (a reflection, a blur that is skipped below a threshold, a history buffer), then every shader that reads its output must be gated by **the same function**:

```js
const on = needsReflection(s);
if (on) reflection.render(reflTarget);
main.set({ tRefl: reflTarget.texture, uRefl: on ? ramp : 0 });
```

Otherwise there will be frames where a shader samples the buffer as it was last written, possibly scenes ago. That bug is invisible when a frame is rendered on its own and only appears in sequence. And bring the effect in with a ramp: **nothing switches on in one frame.** The full story is in [12](12-lessons-from-a-code-film.md); `npm run motion` checks for it.

## Banding

- Final ±1/255 triangular dither in `present`.
- Interleaved-gradient noise to jitter ray-march starts and rotate sample kernels: `fract(52.9829189 · fract(dot(fragCoord, vec2(0.06711056, 0.00583715))))`.
- Grain hides what is left.

## The shader library

Small strings concatenated at the call site (`NOISE + SDF + COLOR + body`):

- **Hashes** without `sin` (`fract(p · 0.1031)` style), so they match across GPUs.
- **Value noise** with a quintic fade, and **fbm**: 5 octaves, gain 0.5, lacunarity 2.03, domain rotated between octaves (`mat2(0.8, 0.6, −0.6, 0.8)`) to hide the grid.
- **SDF primitives**: box, rounded box, segment, capsule, torus; polynomial `smin`; `rot2`.
- **Colour**: exact sRGB transfer both ways, Rec.709 luma, a blackbody fit.

## Technique catalogue

Each entry: what it is, and the rule to remember.

### Generating things

- **Crowds from a hashed lattice.** `thingAt(cell)` hashes a grid cell into position, angle, brightness. Instanced quads near the camera and point sprites far away both call it, so they agree, and nothing is stored. *Rule: if a formula can produce it, do not simulate it.*
- **Reveal by threshold.** Give every instance a random or distance-based threshold and raise one uniform past it. 52,000 lanterns "kindle outward" this way; an ignition flash is `1 + 2.2·exp(−k·22)`.
- **Reveal time in a texture channel.** Draw a document into a canvas with ink in red and *when each stroke appears* in green. One `smoothstep(t.g − 0.006, t.g + 0.004, progress)` makes it write itself.
- **Bake at init.** Wave heightfields, tiling noise, a 96³ cloud volume, SDF atlases, shadow/AO maps. Sample with `textureLod` in loops.
- **Analytic physics.** A domino chain posed from one scalar by a contact recurrence; particles as closed-form functions of their spawn time. Scrubbable.
- **CPU mirror of GPU maths.** The same wave sum is evaluated in JS for buoyancy that matches the shader.

### Scale

- **Log-space interpolation** for anything crossing orders of magnitude: camera distance, fog density, lit radius. `exp(mix(ln a, ln b, t))`.
- **Rescale the world, not the camera.** For exponential growth, make object *i* have scale `r^(i − g)` and slide `g`. The camera rig never changes.
- **Units of the subject.** On a ride from 7 m to 4×10¹⁶ m, express every lateral offset as a multiple of `distance · tan(1°)` and the picture reads identically at every scale.
- **Self-similarity in the coordinate map.** Map space into log-scaled coordinates so one SDF repeats at 3×, 6×, 12×.
- **Two renderers, one camera.** A mesh world in metres and a ray-marched world in kilometres share a camera and cross-fade by altitude.
- **Fake curvature**: `y −= dot(xz, xz) / (2R)`. Shrink R as you climb.
- **Level of detail by pixel size.** Pass the pixel footprint as a uniform; blend detail to its mean colour as it goes sub-pixel; gate fine print on on-screen cell size.

### Light and atmosphere

- **Drive mood from the camera, not the beat.** Day factor, star visibility, sun angle as functions of altitude. The grade always matches the framing.
- **Planar reflection by mirroring** the scene (`y → −y`) into a half-res target, then smear vertically.
- **Volumetrics at half or quarter resolution**, 14–46 steps, jittered. Split a cloud march at a known plane to sandwich opaque meshes without a depth composite.
- **Low-res march + temporal resolve**: Halton jitter, reproject from the previous camera, clamp to the 3×3 neighbourhood variance; reset the history after a cut.
- **Depth of field tied to scale.** Wide aperture at desk scale, tiny at city scale; the blur alone says "miniature" or "monumental".
- **Gobos.** Project a window-pane or leaf pattern through the key light for instant realism on flat surfaces.
- **Motion blur from the camera's derivative**: reproject, or radially blur by `d(ln distance)/dt`.
- **Sub-frame accumulation** (offline only): render many sub-frames per output frame at slightly different times and average them in linear light. One mechanism gives motion blur, and with per-sub-frame jitter also anti-aliasing, soft shadows and converged volumetrics. Shorten the shutter where small fast things would smear. `deck.frame(dt, { sub, shutter })` does the motion-blur part for `npm run film`.
- **Additive points need protection**: depth-test them and dim by density near the camera, or flying through a cloud of lights becomes a full-frame whiteout.

### 2D

- **SDF drawing in design units** with one pixel of feather: `coverage = clamp(0.5 − d · pixelsPerUnit, 0, 1)`.
- **Painter's algorithm in a fragment shader**: `c = mix(c, ink, cover(d))` per shape, back to front.
- **Canvas-2D as an asset factory.** Charts, label atlases, fake documents and digit strips are drawn with the 2D canvas API at init and used as textures.
- **Canvas → SDF** by jump flooding or an exact distance transform, for type that survives unbounded zoom.

## Staying cheap

| Lever | Typical use |
|---|---|
| Internal resolution × `q` | Everything |
| Half/quarter-res side buffers | Volumetrics, reflections, god rays, SSAO, blur |
| Step counts × `q` | `round(92 · q)` for a main march, `16 · q` for shafts |
| Instance counts × `q` | Grass, particles |
| MSAA 4 → 2 above ~2.6 M pixels | Mesh scenes |
| Vertex-shader culling | `gl_Position = vec4(2.)` when a sprite is sub-pixel |
| Early-outs | Skip pixels a transition has not touched; stop marching at low transmittance |
| Skip passes | No DoF when aperture is tiny; no blur under 0.4 px |
| Visibility bands | Props exist only within a range of scale |
| Parking | Scenes more than one away |

## Scene skeleton

```js
create(ctx) {
  const hdr  = ctx.gfx.target({ type: HalfFloat });      // or samples: 4, depth: true for meshes
  const post = createPost(ctx);
  const main = ctx.gfx.pass(LIB + FRAGMENT, { uA: 0 });
  const layer = ctx.overlay().add(ctx.text('…', {…}));
  return {
    update(s) { main.set({ uA: s.k(0, 0, 2) }); },
    render(target, s) {
      main.render(hdr);
      post.render(hdr, target, { bloom: 0.5, grain: 0.03, time: s.t });
      layer.render(target);
    },
  };
}
```
