# 04 — Text

Text is drawn inside the WebGL picture, not as DOM on top. That is what lets it be masked, lit, zoomed with a poster, hit by a transition, or selected by the deck's own cursor.

## How a text block works

1. **Layout with the browser's metrics.** A hidden 2D canvas measures the string. Each glyph's x comes from the width of the *prefix* up to it, not from adding single-character widths, so the font's kerning survives. Tracking adds a fixed amount per glyph. Wrapping is greedy by word.
2. **Rasterise to a private atlas.** Every glyph instance gets its own cell (no sharing), padded by about 0.3 em so offsets, blur and italics never clip. Drawn white; only alpha is read.
3. **One quad per glyph**, positioned in design units.
4. **Re-rasterise when pixel density changes**, so type is always sharp at the real resolution. Density is capped (the reference uses 6 px per unit).

Block options: `x, y, size, font, color, align, valign ('top' | 'middle' | 'bottom' | 'baseline'), leading, tracking, maxWidth, raster`.

The reference system also accepts an array of runs (`[{ t, size, font, color }]`) for mixed styles in one block, and can place a block in 3D (`in3D()`), e.g. parented to a moving poster with `raster: 1.6` so it survives being zoomed.

## Per-glyph animation

```js
block.animate((g, fx) => {
  // g:  { ch, n (index), count, line, x, y, w, size }
  // fx: { dx, dy, alpha, scale, rot, clip }        reset before each call
});
```

The reference adds `blur`, `skew`, `sx/sy` and per-glyph colour, packed as 24 floats per glyph in one instanced buffer.

### Reveal recipes

| Name | Recipe |
|---|---|
| **Masked rise** | `dy = (1 − t) · size · 1.2`, `clip = 1`. The glyph slides up from behind its own line box. The default, and the most "editorial". |
| **Blur in** | per-glyph disc blur from wide to 0 with alpha. In the shader: a 28-tap golden-angle disc, weights `exp(−2.2f)`, sampling clamped to the glyph's own atlas cell so neighbours never bleed in. |
| **Type** | reveal glyph *n* when `n < chars(t)`; add a blinking caret block. 9–17 characters per second reads as typing; deleting is faster (12–22). |
| **Track** | start with wide tracking and close it. |
| **Scatter / drop** | random offsets and rotation converging to rest. |

Stagger: `t = ease(clamp((time − n · step) / dur))` with `step` ≈ 0.025–0.05 s per glyph, or by word or line. In uses an ease-out (`out4`); out uses an ease-in (`in3`).

**Out is not in reversed.** Old headlines leave quickly in the first second of the next beat (fade plus a small upward drift), so two never compete.

## Text that does more

- **Counting numbers.** Simple: call `block.set()` each frame with the rounded value (it only re-rasterises when the string changes). Odometer: one block containing columns of `0123456789`, roll each column with `dy`, carry between columns, blur the fastest digit.
- **Labels pinned to 3D.** Project the world point through the scene camera and convert clip space to design units: `x = view.x0 + (ndc.x·0.5 + 0.5)·view.w`.
- **Type inside the surface.** For unbounded zoom (a calendar whose cells contain hours that contain minutes), draw text from an SDF atlas in the surface's own fragment shader and gate each level of detail on the on-screen size of its cell.
- **HDR text.** Convert colour to linear and multiply by a gain above 1 to make a headline bloom.
- **The page number as a joke.** The reference deck's HUD numbers run 1, 2, 3, then Fibonacci, then powers of ten, then ∞, then back to 1. A scene can supply its own `page(s)` string and HUD font and colour.

## Legibility is solved inside the picture

Never a translucent DOM box over the canvas. Instead:

- a soft dark Gaussian **scrim** drawn by the shader behind the text region;
- a **quiet zone**: dim or thin the busy content where text will sit (`uCalm`);
- a **paper strip** that wipes in under a label, as an object in the scene;
- a **neutral-density gradient** across the bottom under a closing title;
- **off-axis framing**: shift the projection so the subject sits to one side and the text side stays empty, rather than turning the camera.

## Amount of text

One headline of ten words or fewer at 80–112 px (on a 1080-high frame), plus at most one source line at 28–34 px. Numbers first. Caveats and sources go on screen as small labels ("illustration", a date and a source), not into the notes only.

## The fake-template trick

The reference opens by imitating a default slide: system Arial stack, a blue footer bar, flying bullets, a default-looking line chart drawn with canvas 2D. The engine's text system renders it; nothing is DOM. Because it is the same system as everything else, the deck can then *edit* it on screen: select the title, delete it, retype it.
