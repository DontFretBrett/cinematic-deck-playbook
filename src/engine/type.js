// Text that lives inside the WebGL picture.
//
// A block is laid out one glyph at a time with the browser's own text metrics (so kerning
// and any installed/embedded font just work), rasterised into a small private atlas, and
// drawn as one quad per glyph. Because each glyph is its own quad, a per-glyph callback
// can offset / fade / scale / rotate / clip it every frame:
//
//   const title = ctx.text('Hello', { x: 960, y: 500, size: 160, align: 'center' });
//   title.animate((g, fx) => {
//     const t = ease.out4(clamp01(p * 1.6 - g.n * 0.05));   // stagger by glyph index
//     fx.dy = (1 - t) * g.size;                              // rise…
//     fx.clip = 1;                                           // …from behind the line's own box
//   });
//
// Blocks are positioned in design units (see view.js). The atlas is re-rasterised whenever
// the pixel density changes, so text stays crisp at any window size.

import * as THREE from 'three';
import { hex } from './math.js';

const VS = /* glsl */ `
precision highp float;
in vec3 position; in vec2 uv; in vec2 aC; in vec4 aFx; in vec2 aFx2; in vec2 aBox;
uniform vec4 uView;  // visible design rect: x0, y0, w, h
uniform vec4 uXf;    // block x, y, scale, rotation
out vec2 vUv; out float vA; out vec4 vClip;
vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main(){
  vec2 p = aC + rot((position.xy - aC) * aFx.w, aFx2.y) + aFx.xy;
  vClip = vec4(p.y, aBox, aFx2.x);
  vec2 q = uXf.xy + rot(p, uXf.w) * uXf.z;
  vec2 n = (q - uView.xy) / uView.zw * 2. - 1.;
  vUv = uv; vA = aFx.z;
  gl_Position = vec4(n.x, -n.y, 0., 1.);
}`;

const FS = /* glsl */ `
precision highp float;
uniform sampler2D tA; uniform vec3 uColor; uniform float uAlpha;
in vec2 vUv; in float vA; in vec4 vClip;
out vec4 o;
void main(){
  float a = texture(tA, vUv).a * vA * uAlpha;
  if (vClip.w > .5) a *= step(vClip.y, vClip.x) * step(vClip.x, vClip.z);
  o = vec4(uColor * a, a); // premultiplied
}`;

export function createType(gfx, view) {
  const blocks = new Set();
  const mctx = document.createElement('canvas').getContext('2d');
  const REF = 100; // layout is measured at 100px and scaled

  // Font aliases. Replace or extend with type.font('display', { family: '"My Font"', weight: 800 }).
  const fonts = {
    display: { family: '"Inter Tight", "Helvetica Neue", Helvetica, Arial, sans-serif', weight: 700, style: 'normal' },
    body: { family: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif', weight: 400, style: 'normal' },
    serif: { family: 'Georgia, "Times New Roman", serif', weight: 400, style: 'italic' },
    mono: { family: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', weight: 500, style: 'normal' },
  };
  const css = (f, px) => `${f.style} ${f.weight} ${px}px ${f.family}`;

  class Block {
    constructor(text, opts = {}) {
      this.o = { x: 0, y: 0, size: 48, font: 'display', color: '#ffffff', align: 'left', valign: 'top', leading: 1.12, tracking: 0, maxWidth: 0, raster: 1, ...opts };
      this.x = this.o.x; this.y = this.o.y; this.scale = 1; this.rotation = 0; this.alpha = 1;
      this.glyphs = []; this.box = { x: 0, y: 0, w: 0, h: 0 };
      this._density = 0; this._fn = null;
      this.canvas = document.createElement('canvas');
      this.tex = new THREE.CanvasTexture(this.canvas);
      this.tex.colorSpace = THREE.NoColorSpace; // we only read alpha; no sRGB decode wanted
      this.tex.generateMipmaps = false; this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter; this.tex.flipY = false;
      this.mat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: FS, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
        uniforms: { tA: { value: this.tex }, uColor: { value: new THREE.Vector3(1, 1, 1) }, uAlpha: { value: 1 }, uView: { value: new THREE.Vector4() }, uXf: { value: new THREE.Vector4() } },
      });
      this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
      this.mesh.frustumCulled = false;
      blocks.add(this);
      this.set(text);
    }

    set(text) {
      text = String(text);
      if (text === this.text) return this;
      this.text = text;
      this._layout();
      this._density = 0; // force a re-raster on next draw
      return this;
    }

    style(opts) {
      Object.assign(this.o, opts);
      if ('x' in opts) this.x = opts.x;
      if ('y' in opts) this.y = opts.y;
      const t = this.text; this.text = null; this.set(t);
      return this;
    }

    /** fn(glyph, fx) runs for every glyph before each draw. fx: dx, dy (design units), alpha, scale, rot, clip. */
    animate(fn) { this._fn = fn; return this; }

    _layout() {
      const o = this.o, f = fonts[o.font] || fonts.display, k = o.size / REF;
      mctx.font = css(f, REF);
      const m = mctx.measureText('Hg');
      const asc = (m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent) * k;
      const desc = (m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent) * k;
      const width = (s) => mctx.measureText(s).width * k;

      // Wrap.
      const lines = [];
      for (const para of this.text.split('\n')) {
        if (!o.maxWidth) { lines.push(para); continue; }
        let line = '';
        for (const word of para.split(' ')) {
          const next = line ? line + ' ' + word : word;
          if (line && width(next) > o.maxWidth) { lines.push(line); line = word; } else line = next;
        }
        lines.push(line);
      }

      const lh = o.size * o.leading;
      const H = (lines.length - 1) * lh + asc + desc;
      const top = o.valign === 'middle' ? -H / 2 : o.valign === 'bottom' ? -H : o.valign === 'baseline' ? -asc : 0;
      const glyphs = [];
      let n = 0, i = 0, minX = 1e9, maxX = -1e9;
      lines.forEach((line, li) => {
        const chars = Array.from(line);
        const track = o.tracking * o.size;
        // Measuring prefixes (not single characters) keeps the font's kerning.
        const xs = chars.map((_, c) => width(chars.slice(0, c).join('')) + c * track);
        const W = width(line) + Math.max(0, chars.length - 1) * track;
        const x0 = o.align === 'center' ? -W / 2 : o.align === 'right' ? -W : 0;
        minX = Math.min(minX, x0); maxX = Math.max(maxX, x0 + W);
        chars.forEach((ch, c) => {
          const w = (c + 1 < chars.length ? xs[c + 1] - track : W) - xs[c];
          if (ch.trim()) glyphs.push({ ch, i, n: n++, line: li, lines: lines.length, x: x0 + xs[c], y: top + li * lh, w, size: o.size, count: 0 });
          i++;
        });
      });
      for (const g of glyphs) g.count = n;
      this.glyphs = glyphs; this._asc = asc; this._desc = desc;
      this.box = { x: lines.length ? minX : 0, y: top, w: lines.length ? maxX - minX : 0, h: H };
      this.mat.uniforms.uColor.value.fromArray(hex(o.color));
    }

    _raster(density) {
      const o = this.o, f = fonts[o.font] || fonts.display, gl = this.glyphs;
      const pad = o.size * 0.3, lineH = this._asc + this._desc;
      let d = density * o.raster;
      // Shelf-pack one cell per glyph. If the atlas would be too tall, drop density and retry.
      let cells, cw, chh;
      for (;;) {
        const maxW = 2048; let x = 0, y = 0; const rowH = Math.ceil((lineH + pad * 2) * d);
        cells = gl.map((g) => {
          const w = Math.ceil((g.w + pad * 2) * d);
          if (x + w > maxW) { x = 0; y += rowH; }
          const c = { x, y, w, h: rowH }; x += w; return c;
        });
        cw = Math.min(maxW, Math.max(2, ...cells.map((c) => c.x + c.w))); chh = y + rowH;
        if (chh <= 4096 || d < 0.25) break;
        d *= 0.7;
      }
      const cv = this.canvas, ch2 = Math.max(2, chh);
      if (cv.width !== cw || cv.height !== ch2) this.tex.dispose(); // GPU storage is immutable: a resized canvas needs a fresh texture
      cv.width = cw; cv.height = ch2;
      const c2 = cv.getContext('2d');
      c2.clearRect(0, 0, cv.width, cv.height);
      c2.font = css(f, o.size * d); c2.textBaseline = 'alphabetic'; c2.fillStyle = '#fff';
      gl.forEach((g, k) => c2.fillText(g.ch, cells[k].x + pad * d, cells[k].y + (pad + this._asc) * d));
      this.tex.needsUpdate = true;

      // Geometry: 4 vertices per glyph.
      const N = gl.length, pos = new Float32Array(N * 12), uv = new Float32Array(N * 8), aC = new Float32Array(N * 8), aBox = new Float32Array(N * 8), idx = new Uint16Array(N * 6);
      gl.forEach((g, k) => {
        const c = cells[k], x0 = g.x - pad, x1 = g.x + g.w + pad, y0 = g.y - pad, y1 = g.y + lineH + pad;
        const u0 = c.x / cv.width, u1 = (c.x + c.w) / cv.width, v0 = c.y / cv.height, v1 = (c.y + c.h) / cv.height;
        pos.set([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0], k * 12);
        uv.set([u0, v0, u1, v0, u1, v1, u0, v1], k * 8);
        for (let v = 0; v < 4; v++) { aC.set([g.x + g.w / 2, g.y + lineH / 2], k * 8 + v * 2); aBox.set([g.y, g.y + lineH], k * 8 + v * 2); }
        idx.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('aC', new THREE.BufferAttribute(aC, 2));
      geo.setAttribute('aBox', new THREE.BufferAttribute(aBox, 2));
      this._fx = new THREE.BufferAttribute(new Float32Array(N * 16), 4); this._fx.setUsage(THREE.DynamicDrawUsage);
      this._fx2 = new THREE.BufferAttribute(new Float32Array(N * 8), 2); this._fx2.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFx', this._fx); geo.setAttribute('aFx2', this._fx2);
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      this.mesh.geometry.dispose(); this.mesh.geometry = geo;
    }

    _sync() {
      const density = Math.min(gfx.ppu * Math.max(1, this.scale), 512 / this.o.size);
      if (Math.abs(density - this._density) > 0.01 * density) { this._density = density; this._raster(density); }
      const u = this.mat.uniforms;
      u.uView.value.set(view.x0, view.y0, view.w, view.h);
      u.uXf.value.set(this.x, this.y, this.scale, this.rotation);
      u.uAlpha.value = this.alpha;
      const a = this._fx.array, b = this._fx2.array, fx = { dx: 0, dy: 0, alpha: 1, scale: 1, rot: 0, clip: 0 };
      this.glyphs.forEach((g, k) => {
        fx.dx = 0; fx.dy = 0; fx.alpha = 1; fx.scale = 1; fx.rot = 0; fx.clip = 0;
        if (this._fn) this._fn(g, fx);
        for (let v = 0; v < 4; v++) {
          a.set([fx.dx, fx.dy, fx.alpha, fx.scale], k * 16 + v * 4);
          b.set([fx.clip, fx.rot], k * 8 + v * 2);
        }
      });
      this._fx.needsUpdate = true; this._fx2.needsUpdate = true;
    }

    dispose() { blocks.delete(this); this.mesh.geometry.dispose(); this.mat.dispose(); this.tex.dispose(); }
  }

  /** Register @font-face data (from the embedded asset map) so canvas text can use it. */
  async function loadFonts(assets) {
    const jobs = [];
    for (const name in assets) {
      const m = /^fonts\/(.+?)(?:-(\d{3}))?(-italic)?\.(woff2?|ttf|otf)$/.exec(name);
      if (!m) continue;
      const face = new FontFace(m[1], `url(${assets[name]})`, { weight: m[2] || '400', style: m[3] ? 'italic' : 'normal' });
      jobs.push(face.load().then((f) => document.fonts.add(f)).catch((e) => console.warn('font', name, e)));
    }
    await Promise.all(jobs);
    if (document.fonts.ready) await document.fonts.ready;
  }

  return {
    fonts,
    font(alias, def) { fonts[alias] = { weight: 400, style: 'normal', ...def }; return this; },
    block: (text, opts) => new Block(text, opts),
    loadFonts,
    /** Force every block to re-rasterise (after fonts arrive or the window changes). */
    refresh() { for (const b of blocks) { const t = b.text; b.text = null; b.set(t); } },
  };
}

/** A 2D layer of text blocks drawn over whatever is already in a target. */
export function createOverlay(gfx) {
  const scene = new THREE.Scene(), cam = new THREE.Camera(), blocks = [];
  return {
    scene,
    add(...items) { for (const b of items) { scene.add(b.mesh); blocks.push(b); } return this; },
    render(target) {
      // Sync *before* the draw call: three.js uploads changed vertex attributes while it walks the
      // scene, so updating them from onBeforeRender would show up one frame late.
      for (const b of blocks) { b.mesh.visible = b.alpha > 0.002; if (b.mesh.visible) b._sync(); }
      gfx.r.setRenderTarget(target); gfx.r.render(scene, cam);
    },
  };
}
