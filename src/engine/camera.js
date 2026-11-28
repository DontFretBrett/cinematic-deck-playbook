// Framing a 3D camera so the shot survives every screen shape.
//
// A shot is composed for 16:9. On a phone held upright the same vertical field of view would crop
// the subject's sides away, so the field of view widens as the screen narrows: fully at fit = 1,
// partly at fit ≈ 0.7 (a good default: the subject stays large but does not lose its edges).
//
// The optical centre can also be shifted (a lens shift, not a camera turn) so the subject sits
// beside the headline instead of under it: to the right on wide screens, upwards on tall ones.
//
//   fitCamera(cam, ctx.gfx, { fov: 32, fit: .72, shiftX: .1, shiftY: .09 });
//
// Call it from update() (it is cheap) or from resize().

export function fitCamera(cam, gfx, { fov = cam.fov, fit = 0.72, ref = 16 / 9, shiftX = 0, shiftY = 0, shift = true } = {}) {
  const aspect = gfx.W / gfx.H;
  let t = Math.tan((fov * Math.PI) / 360);
  if (aspect < ref) t *= Math.pow(ref / aspect, fit);
  cam.fov = (Math.atan(t) * 360) / Math.PI;
  cam.aspect = aspect;
  const sx = shift && aspect > 1.2 ? shiftX : 0, sy = shift && aspect < 0.85 ? shiftY : 0;
  if (sx || sy) cam.setViewOffset(gfx.W, gfx.H, -sx * gfx.W, sy * gfx.H, gfx.W, gfx.H);
  else cam.clearViewOffset();
  cam.updateProjectionMatrix();
  return cam;
}

/**
 * Dolly a camera along its own view axis by `d` world units (negative = backwards).
 * With linked transitions: on the way in, start pulled back and arrive; on the way out, keep going.
 *
 *   dolly(cam, -travel * (1 - ease.out3(s.enter)));    // arriving
 *   dolly(cam,  travel * ease.in3(s.exit));             // leaving through the cut
 */
export function dolly(cam, d) {
  if (!d) return;
  const e = cam.matrixWorld.elements; // the camera looks down its local -Z
  cam.position.x -= e[8] * d; cam.position.y -= e[9] * d; cam.position.z -= e[10] * d;
  cam.updateMatrixWorld();
}
