// The design space.
//
// Scenes are authored against a fixed 1920x1080 frame (origin top-left, y down, like CSS).
// On a window that is not 16:9 the frame is centred and the picture *extends* past it —
// no letterbox bars. Keep anything that must be seen inside 0..1920 x 0..1080 and let
// backgrounds bleed. view.x0/x1/y0/y1 tell a scene how far the visible area really goes.

export function createView() {
  const v = {
    W: 1920, H: 1080,
    pw: 2, ph: 2,   // pixel size of the drawing buffer
    ppu: 1,         // pixels per design unit
    x0: 0, y0: 0, x1: 1920, y1: 1080, w: 1920, h: 1080,
    resize(pw, ph) {
      v.pw = pw; v.ph = ph;
      v.ppu = Math.min(pw / v.W, ph / v.H);
      v.w = pw / v.ppu; v.h = ph / v.ppu;
      v.x0 = (v.W - v.w) / 2; v.x1 = v.x0 + v.w;
      v.y0 = (v.H - v.h) / 2; v.y1 = v.y0 + v.h;
    },
  };
  return v;
}
