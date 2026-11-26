# 10 — Scene recipes

Thirteen case studies from the reference deck. Each one: the idea, how it is built, what drives it, and the rules worth keeping. Use them as a menu of approaches, not as scenes to copy.

---

## 1. The dull template that edits itself

**Idea.** Open on a deliberately boring white slide. Then an invisible editor takes over: selects the title, deletes it, types a complaint, drags the chart line until it bends off the slide, then restyles the slide ten ways in quick succession.

**Build.**
- The "template" is the engine's own text system and a canvas-2D chart: system Arial stack, a blue footer bar, flying bullets, grey gridlines. No DOM.
- One long hands-off beat (25.8 s) is scripted on a timeline in seconds: select at 0.85, delete at 12 characters/s, type at 17, and so on.
- The makeover montage renders variant A and variant B to two targets and mixes them with a wipe pass that has a `mode` switch (checkerboard, blinds, iris, pixel dissolve, ripple…). Each cut's wipe lasts `min(0.62, dur · 0.46)`; cuts accelerate (1.9 s down to ~1 s).
- The last variants escalate: ray-marched extruded type from a canvas-built SDF, liquid chrome, then 7,000 instanced cards that scatter toward the camera.
- A textured quad of the *real* chart tumbles in and lands at exactly the screen-filling distance, `(height / 2) / tan(fov / 2)`. That frame is identical to the first frame of the next scene.

**Rules.**
- Parody by constraint: default font, default palette, one detail slightly wrong.
- Let editor chrome (selection box, caret, delete) be the actor.
- End a scene on the exact first frame of the next.

---

## 2. The chart that leaves the slide

**Idea.** The chart is the bottom sheet of fan-fold paper standing on a salt flat. As the line climbs, the paper unfolds upward through the clouds to the edge of space.

**Build.**
- 47 instanced paper sheets; a CPU function fills a uniform array with each sheet's height, depth, fold angle and flutter. Folds alternate; the open-ease has a damped overshoot.
- The line is a ribbon with `discard` past a `uHead` arclength; dashed past the last real data point. Dots pop in with overshoot.
- Sky and ground are one fullscreen pass (analytic gradients, parabolic curved earth, Voronoi salt, a blurred mirror reflection).
- Clouds are ray-marched at half resolution **twice**, behind and in front of the paper's plane, so the meshes sandwich between them without a depth composite. 30–46 steps × quality.
- A tiny human silhouette and two bird flocks give scale.

**Drive.** One master clock (sum of beat times) feeds a 13-key Hermite camera path and a keyed arclength curve, so the line's head reaches each labelled point on cue. Atmosphere (day factor, stars, sun angle, planet radius) is a function of camera altitude.

**Rules.**
- Make the metaphor literal geometry.
- Drive mood from the camera's position, not from beats.
- Put something human-sized in every big scene.

---

## 3. The boat and the anchor

**Idea.** A paper boat on a calm sea. The sea rises; the anchor chain is as long as it ever was; the bow goes under. Select one link, delete it, and the boat sails.

**Build.**
- Ocean: baked wave textures (28 Gerstner waves on a 46 m tile, 34 detail waves on a 5.7 m tile) sampled by a fullscreen ray-march, ~92 steps × quality plus bisection. Foam from the wave Jacobian. Caustics from a displaced grid.
- A split-level shot: per pixel, compare the lens-plane point with the wave height; bend rays near the waterline; draw a meniscus band.
- The boat is a 14-triangle origami mesh with crease shading and a wet line. Its reflection in the water is ray-traced analytically against those triangles.
- The chain is a 10-segment Verlet rope. Tension `sat((dist − len) / 0.9)` drives the bow dip, a shiver, the creak sound and a uniform.
- The same wave sum runs in JS for buoyancy.

**Rules.**
- One fixed constraint meeting one rising variable is an argument.
- Reuse the deck's motif for the decisive act.
- Place captions inside zones of the picture (the underwater half).

---

## 4. Posters inside posters

**Idea.** Flat printed posters, each containing the next as a small sheet lying on it. Dive in, three times, then endlessly and faster.

**Build.**
- Pure 2D SDF, no lighting, no post. Each poster is a fragment shader with ten named inks and painter's-algorithm compositing.
- Anti-aliasing uses the pixel size passed as a uniform, so it stays correct under zoom and rotation.
- Paper grain blends octaves on `log2(pixelSize)`, so it looks the same at every zoom.
- A poster smaller than a pixel collapses to its mean colour.
- Eight nesting levels are drawn per frame; indices wrap so the sequence can run forever.
- The camera is a similarity transform; log-scale and rotation are interpolated between levels; the centre follows the fixed point of the nesting.
- A 22-tap log-spiral zoom blur uses the same analytic motion as the camera.

**Drive.** A single zoom coordinate. In the last beat it is integrated from a speed that grows exponentially to a cruise; backing out unwinds it with its own decay.

**Rules.**
- Encode each number in the drawing and say so in the notes.
- Infinite zoom = child rectangle per level + log-space camera + mean-colour LOD + modulo.
- The blur should know the camera's motion.

---

## 5. A country of them

**Idea.** One glowing page typing itself in the dark. Pull back: thirty thousand. Fly through. Pull back again: a planet's worth, with a counter of thinking-years running.

**Build.**
- No simulation. `sheetAt(cell)` hashes a lattice cell into position, yaw, brightness, tint. A baked map rejects cells (coastline, density).
- Three levels of detail share that function: 81,600 instanced quads near the camera and three additive point layers beyond, with energy conserved as quads become points.
- Pages come from a canvas atlas of fake documents with reveal time stored in a channel, so each page writes itself.
- Ground on a camera-centred polar mesh with log radius; reflection by mirroring; fake curvature.
- The counter is an odometer made from one text block of digit columns.

**Drive.** One scalar indexes the whole camera path. The lit radius is interpolated in log space from 3 m to 13 km.

**Rules.**
- A crowd is a function of a cell id.
- Store *when* in a texture.
- Log space for anything crossing orders of magnitude.

---

## 6. Thirty steps

**Idea.** A 1 cm domino on a desk knocks over one 1.5× bigger, thirty times. The camera rides the growth from desk to mountain. The last one falls at the lens.

**Build.**
- 30 instanced rounded boxes. Domino *i* has scale `1.5^(i − g)`; the world's props are scaled inversely. Zooming is sliding `g`.
- Props in five scale bands (desk, room, house, street, city) with visibility ranges.
- Toppling is analytic: a time → event-index function, and a contact recurrence that poses every earlier domino from the angle of the next.
- Soft shadows refitted each frame; SSAO at half resolution; depth of field whose aperture shrinks with scale.
- Camera shake per impact grows geometrically.

**Sound.** One click per integer crossing of the event index, stepping down a scale with rising gain; thuds from step 15; booms from 25.

**Rules.**
- For exponential growth, hold the camera and rescale the world.
- Pose a chain from one scalar.
- Tie aperture to scale.

---

## 7. A year in a day

**Idea.** A printed wall calendar. Resize each day by how much happens in it: early months shrink to lint, one summer day swells to fill the frame, and inside it are hours that each contain a year.

**Build.**
- One grid mesh, subdivided more finely in the hero cell. The vertex shader reads a small lookup texture (rebuilt on the CPU each frame) that integrates `exp(λ · logRate(day))`. λ is the slider between "honest grid" and "true scale".
- All type is drawn in the surface's fragment shader from an SDF atlas made by jump flooding; each level of detail is gated on the on-screen size of its cell.
- Paper: a fibre normal map, pillow displacement per day, perforations.
- One key light with a soft shadow and a drifting window gobo. No tone map, no bloom.
- Callouts are paper strips that wipe in; the disclaimer is one of them.

**Rules.**
- Turn a data distortion into one slider.
- Draw type in the surface shader when zoom is unbounded.
- Put the disclaimer on screen as an object.

---

## 8. How far you can see

**Idea.** Night; one lantern lights a small circle of grass. A second, slightly brighter. Rise: every lantern alive, and it is still night. Then sunrise over a landscape far larger than anything the lanterns showed.

**Build.**
- Near world in metres: instanced grass (100k blades), rocks, per-lantern shadow maps, analytic scattering.
- Far world in kilometres: an SDF ray-march at 0.4 scale with a temporal resolve to full resolution (jitter, reproject, variance clamp).
- The two share a camera and cross-fade by altitude.
- 52,000 lanterns as additive points, each kindled when a rising uniform passes its distance-based threshold.
- The landscape repeats at growing scales via a log-scaled coordinate map.

**Rules.**
- Two renderers with different units, one camera.
- Reveal by one threshold against a per-instance attribute.
- March low, resolve temporally, reset history on cuts.

---

## 9. Select all

**Idea.** Factories copy themselves across a night Earth, doubling. The selection box snaps round the Earth; pull back; it grows to enclose the Sun.

**Build.**
- Earth is an analytic sphere in a fullscreen pass. A JPEG is used as data (land, city lights). Factories are grid cells whose birth index is compared with a doubling count.
- The Sun is procedural. The swarm is point sprites that each rasterise an oriented 16:9 quad inside the sprite.
- Half-resolution volumetric shafts.
- Framing by projection shift, not by turning the camera, so the text side stays clean.

**Drive.** The doubling count uses an exponential ease and then creeps asymptotically during the hold. A shimmer fires on each integer doubling with rising pitch.

**Rules.**
- Fire sounds on threshold crossings of the driven quantity.
- Never let a hold freeze.
- Frame with an off-axis projection.

---

## 10. One degree

**Idea.** An archer's room. The arrow misses by 17 cm at 10 m. Follow that line: through the wall, the clouds, past the Moon, to the nearest star. Then an Edit menu drops down and Undo is greyed out.

**Build.**
- A mesh room with procedural shaders and no shadow maps: sun pools by projecting each point along the sun direction to the window plane.
- The ride animates `ln(distance)` from 7 m to 4×10¹⁶ m. All lateral offsets are multiples of `distance · tan(1°)`.
- The renderer swaps by range (room, terrain, sky, Moon, planets); swaps are hidden behind a paper overlay and a cloud whiteout.
- Radial blur scales with the rate of change of log-distance.

**Rules.**
- Animate log-distance; express the rig in units of the thing measured.
- Hide renderer swaps behind a physical occluder.
- UI chrome can deliver a punchline.

---

## 11. Two futures

**Idea.** One bay, two versions, split by a draggable vertical line. Same terrain, same camera, same time of day; only what was built differs.

**Build.**
- Two scene graphs drawn into one target with scissor at the divider. Each has its own planar reflection, also scissored.
- Shadows and ambient occlusion are baked into top-down maps, so a shadow is one texture compare.
- Headlines are scissored to their side and follow the line.
- The divider sways on its own, moves on beats, and can be dragged; after a drag it eases back to the script.

**Rules.**
- For comparisons, share everything except the variable.
- Scissor instead of rendering twice at full size.
- Let interaction override the script, then decay back.

---

## 12. You are here

**Idea.** The whole talk laid out on one exponential curve: a paper ribbon with every earlier slide as a page on it. Ride back down to the flat part. An empty frame, a selection box, today's date.

**Build.**
- Ribbon geometry from an arc-length table of `y = e^(x/6)`.
- Pages are textured with live snapshots the engine took of each scene before its exit transition (falling back to baked thumbnails).
- A second beat simply tilts the camera up at the wall of curve above.

**Rules.**
- Recap by reusing the deck's own frames.
- Parametrise paths by arc length.
- Make the scale point with the camera, not a caption.

---

## 13. The question

**Idea.** The white template returns: "Any questions?" Then a caret types "I have one.", deletes it, types "What do you want?" The selection box grows to the whole slide, and the slide tilts by one degree.

**Build.** Pure 2D overlays. The tilt pass (render to target, rotate, drop shadow) only runs once the tilt begins. No post.

**Rules.**
- End on the cheapest frame.
- Pay off a number established earlier.
- Let the deck's own cursor speak.

---

## Patterns across all thirteen

- `create` allocates; `init` bakes; `enter` reseeds; `update` writes uniforms; `render` runs the chain and ends with post then overlay.
- One shared uniform dictionary per scene.
- Timelines in seconds inside beats.
- One master scalar for the camera.
- Half-resolution for anything volumetric or blurred.
- A selection box, a 16:9 rectangle, or paper somewhere in the frame.
- The first beat waits for the transition; the last beat hands something to the next one.
