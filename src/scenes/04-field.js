// Scene 4 — ordinary three.js meshes inside the same pipeline.
// Shows: an InstancedMesh posed from a closed-form function of (cell, time, beat) — no simulation
// state, so Back and jumping just work — rendered into an MSAA HDR target with a depth buffer,
// then through the same post pass. Also: text that follows a projected 3D point.

import * as THREE from 'three';
import { createPost } from '../engine/post.js';
import { ease, mix } from '../engine/math.js';

const G = 44; // grid is G x G

export default {
  id: 'field',
  title: 'Meshes still work',
  enterWith: 'shove',
  beats: [{ dur: 2.4, delay: 0.5, hold: 3 }, { dur: 3, hold: 4 }, { dur: 2, hold: 6 }],
  notes: [
    'Regular three.js: one InstancedMesh, two lights, a perspective camera.',
    'Nothing is simulated. Each column height is a formula of its cell, the time and the beat, so the scene can be scrubbed in either direction.',
    'End on the call to action. Keep the last beat long: this is where questions start.',
  ],
  create(ctx) {
    const { gfx } = ctx;
    const hdr = gfx.target({ type: THREE.HalfFloatType, depth: true, samples: 4 });
    const post = createPost(ctx);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x05060a, 34, 78); // far columns sink into the background instead of ending at an edge
    const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);
    const geo = new THREE.BoxGeometry(0.82, 1, 0.82); geo.translate(0, 0.5, 0); // scale from the base
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
    const mesh = new THREE.InstancedMesh(geo, mat, G * G);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    const sun = new THREE.DirectionalLight(0xfff0dd, 3.2); sun.position.set(6, 9, 4); scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a1420, 0.55));
    const m = new THREE.Matrix4(), col = new THREE.Color(), cool = new THREE.Color('#3a5ad0'), warm = new THREE.Color('#ff6a2a'), white = new THREE.Color('#fff4e6');
    const v = new THREE.Vector3();

    const head = ctx.text('…and meshes still work.', { x: 140, y: 150, size: 84, font: 'display', tracking: -0.02 });
    const cta = ctx.text('Now make your own.', { x: 960, y: 540, size: 150, font: 'display', align: 'center', valign: 'middle', tracking: -0.02 });
    const tag = ctx.text('peak', { x: 0, y: 0, size: 26, font: 'mono', align: 'center', valign: 'bottom', color: '#ffd9c2' });
    const layer = ctx.overlay().add(head, cta, tag);
    let dim = 0;

    return {
      resize() { cam.aspect = gfx.W / gfx.H; cam.updateProjectionMatrix(); },
      update(s) {
        const rise = s.k(0, 0, 2.2, ease.out3) * mix(0.25, 1, ease.out3(s.enter));
        const pulse = s.at(1), wave = s.k(1, 0, 1), calm = s.k(2, 0, 1.6);
        let i = 0, peak = 0, px = 0, pz = 0;
        for (let z = 0; z < G; z++) for (let x = 0; x < G; x++, i++) {
          const cx = x - G / 2 + 0.5, cz = z - G / 2 + 0.5, r = Math.hypot(cx, cz);
          const ripple = 0.5 + 0.5 * Math.sin(r * 0.55 - s.t * 1.4);
          // A ring that travels outward during beat 2: a gaussian around radius = speed * time.
          const ring = Math.exp(-Math.pow((r - pulse * 9) * 0.45, 2)) * wave * (1 - calm);
          const hgt = (0.15 + ripple * 0.9 * rise + ring * 5.5) * mix(1, 0.35, calm);
          m.makeScale(1, Math.max(0.02, hgt), 1).setPosition(cx, 0, cz);
          mesh.setMatrixAt(i, m);
          col.copy(cool).lerp(warm, Math.min(1, ring * 1.2)).lerp(white, Math.min(1, ring * ring * 0.8));
          mesh.setColorAt(i, col);
          if (hgt > peak) { peak = hgt; px = cx; pz = cz; }
        }
        mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;

        const a = s.t * 0.06 + 0.7 + s.mouse.x * 0.08, d = mix(46, 38, s.k(1, 0, 3));
        cam.position.set(Math.sin(a) * d, 17 - s.mouse.y * 1.5, Math.cos(a) * d);
        cam.lookAt(0, 1.5, 0);
        cam.aspect = gfx.W / gfx.H; cam.updateProjectionMatrix(); cam.updateMatrixWorld();

        // Pin a label to the tallest column: project the 3D point, convert clip space → design units.
        v.set(px, peak + 0.6, pz).project(cam);
        tag.x = ctx.view.x0 + (v.x * 0.5 + 0.5) * ctx.view.w; tag.y = ctx.view.y0 + (-v.y * 0.5 + 0.5) * ctx.view.h;
        tag.alpha = wave * (1 - calm) * Math.min(1, peak / 3);

        head.animate((g, fx) => { const t = ease.out4(Math.min(1, Math.max(0, (s.at(0) - g.n * 0.025) / 0.8))); fx.dy = (1 - t) * g.size * 1.3; fx.clip = 1; });
        head.alpha = 1 - s.k(2, 0, 0.5);
        cta.animate((g, fx) => { const t = ease.out5(Math.min(1, Math.max(0, (s.at(2) - 0.4 - g.n * 0.035) / 0.9))); fx.dy = (1 - t) * g.size; fx.clip = 1; });
        dim = calm;
        s.cue('ring', s.at(1) > 0.05, () => ctx.sfx('thud', { gain: 0.8 }));
        s.cue('end', s.at(2) > 0.4, () => ctx.sfx('chime', { gain: 0.7, pitch: 0.75 }));
      },
      render(target, s) {
        gfx.clear(hdr, 0x05060a);
        gfx.r.render(scene, cam);
        post.render(hdr, target, { bloom: 0.7, threshold: 1.1, exposure: mix(1, 0.45, dim), vignette: 0.45, grain: 0.04, contrast: 1.08, time: s.t });
        layer.render(target);
      },
    };
  },
};
