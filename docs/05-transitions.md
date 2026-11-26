# 05 — Transitions

## The contract

```js
export default {
  dur: 2.6,
  create(ctx) {
    return {
      start(trans) {},
      render({ A, B, p, out, a, b, sa, sb, time }) {}
    };
  },
};
```

- `A` and `B` are render targets holding the outgoing and incoming scene, both live and animating.
- `p` is **linear** 0..1. The transition does its own easing, usually with windows: `w(p, a, b)` = clamped progress between two points, then smoothstep.
- `a`, `b` are the scene runners, so the transition can call hooks on the scene instances.
- At `p ≤ 0` output exactly A; at `p ≥ 1` exactly B. Snap to the exact image over the last ~10% so no residue is left when the engine switches to drawing the scene directly.

## Scenes take part

For every transition except the plain fade the engine sets `sa.exit = p` on the outgoing scene and `sb.enter = p` on the incoming one. Scenes use them:

- the incoming camera starts close and pulls back as an iris opens;
- the outgoing object falls an extra 5° into the lens;
- the outgoing sheet darkens to night because the next scene is a night scene.

And scenes can hand geometry to the transition:

| Hook on the scene | Returns | Used by |
|---|---|---|
| `portal.in(s)` / `portal.out(s)` | four clip-space corners, alpha, shade | portal transitions |
| `anchor(s)` | x, y, size, angle | a folded object landing in the next scene |
| `portal(s)` (starter kit) | a design-space point | iris |

**The scene owns the rectangle; the transition only warps.** The scene must force exact full-screen corners at the end point, so the hand-off is seamless.

## Reverse for free

Back replays the same transition with `p → 1 − p` at 0.55× duration. A and B keep their roles (the earlier scene is always A). So a transition must be a pure function of `p`, with no internal clock. Cached state is rebuilt in `start()`.

## Nine recipes

Durations are from the reference deck.

### portal-in (3.2 s) / portal-out (2.8 s)
*The previous slide turns out to be a rectangle inside the next world; or the camera dives into a rectangle of this one.*

- One compositor draws a "top" image into an arbitrary quad over a "base" using a 3×3 homography solved on the CPU; in the shader `q = H · vec3(ndc, 1); uv = q.xy / q.z`.
- Edge anti-aliasing from screen-space derivatives of `uv`; when the top image is minified past ~1 texel per pixel, blend to a mip.
- The scene matches the zoom: its camera starts at the distance where the page exactly fills the frame, `min(h/2 / tan(fov/2), w/2 / (tan(fov/2) · aspect))`, and pulls back on a log curve.
- **Rule: to make scene B feel like it was inside scene A, put a real 16:9 object in one scene and report its corners.**

### fold (3.4 s)
*The slide is folded, origami-style, into a paper boat that lands where the next scene's boat floats.*

- Build the crease pattern once by clipping the sheet polygon with each crease line; each piece records its chain of reflections and a layer index.
- Rigid phase: each crease is a rotation about its axis; layers offset by a hair to avoid z-fighting.
- Where paper must deform, switch to a small rig of control points with barycentric skinning.
- Overshoot on the pull-apart: `1 − e^(−6.2J) · cos(8.5J) · (1 − J)`.
- A real shadow map on the folding paper, and a blurred two-offset shadow cast onto scene B.
- Ink fades to blank paper near the end so the object matches the one waiting in the next scene.
- **Rule: exact folds come from a reflection chain per polygon, not from bending a grid.**

### wash (2.6 s)
*A wave runs up the glass; the picture changes under the water; it drains leaving drops.*

- Pass 1 (⅔ res) writes a height field: sheet, lip distance, drain distance.
- Pass 2 refracts through its normals, blurs by thickness, splits channels slightly, absorbs red first.
- The actual A→B swap happens where the water is thickest.
- Rivulets and drying beads carry the tail.
- **Rule: cut where the medium is thickest; let residue finish the transition.**

### flaps (2.6 s)
*A split-flap board of slide-shaped tiles.*

- 12 rows; columns chosen so each tile is 16:9.
- Start time per tile: `0.17 + diagonal · 1.30 + hash · 0.16`. Two or three flips each; the last one bounces.
- Intermediate faces show a procedural grey "boring slide" thumbnail.
- Tile state is a pure function of `(id, time)`, evaluated identically in vertex and fragment shaders.
- **Rule: a sweep of many small units needs a start-time function, not per-unit state.**

### slam (1.9 s)
*A sheet slams onto the lens and the next slide is letter-pressed into it.*

- 28% anticipation: A zooms `1 + 0.16K² + 0.62K⁴` with radial blur while a shadowed paper quad grows over it.
- Impact: shake `sin(34u) · 0.0085 · e^(−6.5u)`, a roll, a zoom bounce.
- B appears through a radial pressure front thresholded against paper-tooth noise; dark ink takes differently from light.
- A ring ripple, one dust ring, flying fibres.
- The incoming scene continues the impact as a decaying shudder.
- **Rule: anticipation, then a release that decays exponentially.**

### daybreak (3.4 s)
*A racks out of focus into bokeh; B racks in.*

- 40-tap spiral disc blur at half resolution; highlights weighted `1 + k · l³` so they survive.
- Instanced additive bokeh discs where A is locally bright.
- Additive mix in linear light with offset windows (A out 0.24–0.64, B in 0.4–0.82), then a soft clip.
- **Rule: cross-fade while both are blurred; let highlights outlast everything.**

### line (2.4 s)
*The picture collapses to a glowing horizontal string, which twangs and opens into the next.*

- Column height goes 1 → 0.0022, centre first.
- Sampling a squashed image uses pre-averaged vertical mips, with a gain so energy is conserved.
- The string vibrates as three harmonics; a hot core plus exponential halos, coloured by A's then B's column average.
- The next scene opens with a bright beam on that same axis.
- **Rule: when squashing an image, sample pre-integrated versions and conserve brightness.**

### tear (2.8 s)
*The slide is ripped top to bottom and the halves curl away.*

- Two half-sheet meshes; a tear front moving down; each half wraps a cylinder.
- The torn edge: noise jitter, a white fibrous core, a dark back face. Both halves derive their edge from **one** function, so what one keeps the other has lost.
- The tear line becomes the divider in the next scene.
- **Rule: complementary edges from a single source.**

### fade (0.7 s)
`mix(A, B, smoothstep(0, 1, p))`. Used for the first scene and for jumps. Not "linked": scenes do not co-animate.

## Choosing a transition

Each one in the reference deck is picked for what the two scenes mean:

| Cut | Why this transition |
|---|---|
| chart slide → the real chart | The slide *is* the bottom sheet of the tower: portal-in |
| paper tower → paper boat | Paper folds into a boat |
| sea → posters | The sea pulls you under: water |
| swarm → dominoes | Many small units toppling pre-echo the dominoes |
| falling domino → calendar | The slab that was falling at the lens lands as printed paper |
| night → sunrise | Rack focus through the dawn |
| solar system → archer | Collapse to a line; the next scene is about a line |
| aim → two futures | The rip becomes the divider |

**The transition is the last gesture of one idea and the first of the next.** If you cannot say why a transition fits, use the fade.

## Sound

Each transition has a cue whose envelopes are written in normalised time and scaled by the duration, so the audio stretches with the animation (see [06](06-audio.md)). A sample with a built-in attack is started early by exactly that attack time so its peak lands on the visual hit.
