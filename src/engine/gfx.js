// gfx: the thin layer between scenes and three.js.
//
//   gfx.target(opts)            → a render target that follows the window size (and can be "parked")
//   gfx.pass(fragment, uniforms) → a fullscreen shader you can .render(target)
//   gfx.copy(src, dst)          → blit
//   gfx.present(target, black)  → draw to the screen
//
// Everything a scene allocates while it is being created is tagged with that scene as its
// owner, so the deck can shrink ("park") the GPU memory of scenes that are far away.

import * as THREE from 'three';
import { VERT, FRAG_HEAD } from './glsl.js';

export function createGfx(canvas, { headless = false } = {}) {
  const r = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // we draw into our own targets; MSAA on the canvas would be wasted
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: headless, // lets a screenshot tool read the canvas at any time
  });
  if (!r.capabilities.isWebGL2) throw new Error('WebGL 2 required');
  r.autoClear = false;
  r.toneMapping = THREE.NoToneMapping; // tone mapping happens in our own post pass
  const gl = r.getContext();
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');

  // One oversized triangle covers the screen with no diagonal seam.
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const cam = new THREE.Camera();
  const targets = new Set();

  const gfx = {
    THREE, r, gl,
    W: 2, H: 2, ppu: 1,
    owner: null,

    target({ scale = 1, w = 0, h = 0, type = THREE.UnsignedByteType, depth = false, samples = 0, filter = THREE.LinearFilter, wrap = THREE.ClampToEdgeWrapping } = {}) {
      const t = new THREE.WebGLRenderTarget(w || Math.max(1, Math.round(gfx.W * scale)), h || Math.max(1, Math.round(gfx.H * scale)), {
        type, depthBuffer: depth, samples, minFilter: filter, magFilter: filter, wrapS: wrap, wrapT: wrap, generateMipmaps: false,
      });
      t._scale = scale; t._fixed = !!w; t._owner = gfx.owner; t._parked = false;
      targets.add(t);
      return t;
    },

    free(t) { targets.delete(t); t.dispose(); },

    /** Shrink (or restore) every window-sized target owned by `owner`. */
    park(owner, on) {
      for (const t of targets) {
        if (t._owner !== owner || t._fixed || t._parked === on) continue;
        t._parked = on;
        if (on) t.setSize(2, 2);
        else t.setSize(Math.max(1, Math.round(gfx.W * t._scale)), Math.max(1, Math.round(gfx.H * t._scale)));
      }
    },

    resize(W, H, ppu) {
      gfx.W = W; gfx.H = H; gfx.ppu = ppu;
      r.setPixelRatio(1);
      r.setSize(W, H, false); // CSS size is left to the stylesheet
      for (const t of targets) if (!t._fixed && !t._parked) t.setSize(Math.max(1, Math.round(W * t._scale)), Math.max(1, Math.round(H * t._scale)));
    },

    /**
     * A fullscreen fragment shader. `fragment` is the body (helpers + void main);
     * the standard header is prepended. Uniform values can be plain numbers, arrays
     * (→ vectors by length), three.js objects or textures; read/write them through pass.u.name.value.
     */
    pass(fragment, uniforms = {}, { blending = THREE.NoBlending, transparent = false, blendSrc = THREE.OneFactor, blendDst = THREE.OneFactor } = {}) {
      const u = { uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uPpu: { value: 1 } };
      for (const k in uniforms) u[k] = { value: wrap(uniforms[k]) };
      const mat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG_HEAD + fragment,
        uniforms: u, depthTest: false, depthWrite: false, blending, transparent, blendSrc, blendDst, // blendSrc/Dst apply with THREE.CustomBlending
      });
      const mesh = new THREE.Mesh(tri, mat);
      mesh.frustumCulled = false;
      return {
        u, mat,
        /** Assign several uniforms at once: pass.set({ uA: 1, uColor: [1, 0, 0] }) */
        set(values) {
          for (const k in values) {
            const cur = u[k].value, v = values[k];
            if (Array.isArray(v) && cur && cur.fromArray) cur.fromArray(v); else u[k].value = v;
          }
          return this;
        },
        render(target = null) {
          const w = target ? target.width : gfx.W, h = target ? target.height : gfx.H;
          u.uRes.value.set(w, h);
          u.uPpu.value = gfx.ppu * (w / gfx.W);
          r.setRenderTarget(target);
          r.render(mesh, cam);
        },
      };
    },

    clear(target, color = 0x000000, alpha = 1) {
      r.setRenderTarget(target);
      r.setClearColor(color, alpha);
      r.clear(true, true, false);
    },

    copy(src, dst) {
      blit.u.tA.value = src.texture; blit.u.uGain.value = 1;
      blit.render(dst);
    },

    /** Final blit to the screen. `black` (0..1) fades to black for the presenter's "." key. */
    present(src, black = 0, time = 0) {
      show.u.tA.value = src.texture; show.u.uGain.value = 1 - black; show.u.uTime.value = time;
      show.render(null);
    },

    /** Read a target back as a data URL (used for overview thumbnails). */
    snapshot(src, w = 320, h = 180) {
      const t = snapTarget || (snapTarget = new THREE.WebGLRenderTarget(w, h));
      gfx.copy(src, t);
      const px = new Uint8Array(w * h * 4);
      r.readRenderTargetPixels(t, 0, 0, w, h, px);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'), img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // flip Y
      g.putImageData(img, 0, 0);
      return c.toDataURL('image/jpeg', 0.8);
    },
  };

  let snapTarget = null;
  const blit = gfx.pass('uniform sampler2D tA; uniform float uGain; void main(){ o = vec4(texture(tA, vUv).rgb * uGain, 1.); }', { tA: null, uGain: 1 });
  // The only draw to the screen. Triangular-PDF dither (two hashes, ±1/255) breaks up the
  // banding that 8-bit output puts into every smooth gradient. Pure white is left untouched
  // so a white slide still matches a white page behind it exactly.
  const show = gfx.pass(/* glsl */ `
    uniform sampler2D tA; uniform float uGain;
    float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec3 c = texture(tA, vUv).rgb * uGain;
      float n = h(gl_FragCoord.xy + fract(uTime) * 61.) + h(gl_FragCoord.xy * 1.37 + 17. + fract(uTime) * 37.) - 1.;
      if (min(c.r, min(c.g, c.b)) < .9985) c += n / 255.;
      o = vec4(c, 1.);
    }`, { tA: null, uGain: 1 });
  return gfx;
}

function wrap(v) {
  if (!Array.isArray(v)) return v;
  if (v.length === 2) return new THREE.Vector2(...v);
  if (v.length === 3) return new THREE.Vector3(...v);
  if (v.length === 4) return new THREE.Vector4(...v);
  return v;
}
