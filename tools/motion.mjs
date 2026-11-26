// Motion audit: judge animation without watching it.
//
//   npm run build && npm run motion              every scene and every transition
//   npm run motion -- --scene shader             one scene (and the transition into it)
//   npm run motion -- --fps 30 --size 640x360    cheaper (use with --software)
//   npm run motion -- --random 3                 also save 3 full-size frames per scene at random times
//
// A model cannot watch video, and a person reviewing shader work should not have to scrub
// through it either. So this plays every scene deterministically, frame by frame, and
//
//   1. measures each frame: mean brightness, per-quadrant luminance, change from the last frame
//   2. reports every one-frame brightness JUMP and every POP (a jump that comes straight back) —
//      each is either intended (an impact, a cut) or a bug (a stale buffer, a camera snap,
//      a light switching off in one frame). You decide which, and fix the bugs at the root.
//   3. counts FLASHES per second (WCAG 2.3.1 style) on the full frame and each quarter: more than
//      three in any second fails
//   4. measures how much the picture moves during each HOLD: zero means a frozen frame
//   5. checks that a frame rendered on its own matches the same frame rendered after everything
//      else has played (stale state shows up here)
//   6. writes film strips to shots/motion/: per beat, six frames across the beat and six
//      consecutive frames 1/30 s apart at the moment of fastest change
//
// Exit code is non-zero for a flash failure, a determinism failure or a console error. Jumps,
// pops and still holds are listed for judgement.

import fs from 'node:fs';
import path from 'node:path';
import { openDeck, reportErrors, args } from './browser.mjs';

const a = args();
const software = a.has('software');
const fps = +a.get('fps', software ? 30 : 60);
const [W, H] = a.get('size', software ? '640x360' : '1280x720').split('x').map(Number);
const HOLD = +a.get('hold', 2);          // seconds of hold to observe after each beat settles
const only = a.get('scene', null);
const randomCount = +a.get('random', 0);
const seed = +a.get('seed', Date.now() % 100000);
const out = path.resolve('shots/motion');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

const JUMP = 8;        // one-frame change in mean brightness (0..255) worth explaining
const POP = 10;        // excursion that returns within POP_WINDOW seconds
const POP_WINDOW = 0.2;
const STILL = 0.3;     // hold motion below this (0..255, coarse) reads as frozen

const { browser, page, errors, renderer, software: isSoft } = await openDeck({ width: W, height: H, software });
console.log(`renderer: ${renderer}\n${W}x${H} at ${fps} fps${isSoft ? '  (software rendering: slow; consider --fps 30 --size 640x360)' : ''}\n`);

// ── in-page driver ─────────────────────────────────────────────────────────────
await page.evaluate(() => {
  const stage = document.getElementById('stage');
  const small = Object.assign(document.createElement('canvas'), { width: 160, height: 90 });
  const g = small.getContext('2d', { willReadFrequently: true });
  const lin = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  let prev = null;
  const meanAbs = (x, y) => { let s = 0; for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]); return s / x.length; };

  // One measurement of what is on screen: [mean brightness, 4 quadrant luminances, change vs last frame] + a coarse copy.
  function probe() {
    g.drawImage(stage, 0, 0, 160, 90);
    const d = g.getImageData(0, 0, 160, 90).data;
    const fine = new Float32Array(14400), coarse = new Float32Array(144), q = [0, 0, 0, 0];
    let luma = 0;
    for (let y = 0; y < 90; y++) for (let x = 0; x < 160; x++) {
      const i = (y * 160 + x) * 4, l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      fine[y * 160 + x] = l; luma += l;
      coarse[((y / 10) | 0) * 16 + ((x / 10) | 0)] += l / 100; // 16x9 blocks: averages grain and dither away
      q[(y < 45 ? 0 : 2) + (x < 80 ? 0 : 1)] += 0.2126 * lin[d[i]] + 0.7152 * lin[d[i + 1]] + 0.0722 * lin[d[i + 2]];
    }
    const diff = prev ? meanAbs(fine, prev) : 0; prev = fine;
    return { row: [luma / 14400, q[0] / 3600, q[1] / 3600, q[2] / 3600, q[3] / 3600, diff], coarse, fine };
  }

  window.__audit = {
    meanAbs,
    /** Fingerprint of a settled frame, for the determinism check. */
    async still(id, beat) { await window.__deck.seek(id, beat, 6); return Array.from(probe().fine); },

    /**
     * Play one scene (every beat, with `hold` seconds after each settles) or one transition,
     * measuring every frame. `thumbs` is a list of { frame, slot, label } to copy into a strip.
     * `stopAt` ends early (used to land on a chosen frame for a full-size screenshot).
     */
    async run({ kind, id, fps, hold, thumbs = [], cols = 6, cell = [384, 216], stopAt = 0 }) {
      const d = window.__deck, dt = 1 / fps;
      prev = null;
      const info = kind === 'scene' ? (await d.begin(id), {}) : await d.beginTransition(id);
      if (!info) return null;
      const want = new Map(); for (const t of thumbs) (want.get(t.frame) || want.set(t.frame, []).get(t.frame)).push(t);
      let strip = null, sg = null;
      if (thumbs.length) {
        const rows = Math.ceil((Math.max(...thumbs.map((t) => t.slot)) + 1) / cols);
        strip = Object.assign(document.createElement('canvas'), { width: cols * cell[0], height: rows * cell[1] });
        sg = strip.getContext('2d'); sg.font = '13px ui-monospace, Menlo, monospace'; sg.textBaseline = 'top';
      }
      const frames = [], marks = [{ frame: 0, beat: 0, type: 'start' }];
      let f = 0, settledAt = -1, holdRef = null, after = 0;
      for (;;) {
        d.tick(dt); f++;
        const pr = probe(); frames.push(pr.row);
        for (const t of want.get(f) || []) {
          const x = (t.slot % cols) * cell[0], y = Math.floor(t.slot / cols) * cell[1];
          sg.drawImage(stage, x, y, cell[0], cell[1]);
          sg.fillStyle = 'rgba(0,0,0,.6)'; sg.fillRect(x, y, sg.measureText(t.label).width + 10, 19);
          sg.fillStyle = '#fff'; sg.fillText(t.label, x + 5, y + 3);
        }
        if (stopAt && f >= stopAt) break;
        const st = d.state();
        if (kind === 'transition') {
          if (!st.transition && ++after > Math.round(fps * 0.25)) break; // keep going a moment: hand-off pops hide here
        } else {
          if (st.p >= 1 && settledAt < 0) { settledAt = f; holdRef = pr.coarse; marks.push({ frame: f, beat: st.beat, type: 'settled' }); }
          if (settledAt >= 0 && f - settledAt >= hold * fps) {
            marks.push({ frame: f, beat: st.beat, type: 'holdEnd', holdMotion: meanAbs(pr.coarse, holdRef) });
            if (st.beat === st.beats - 1) break;
            d.advance(); settledAt = -1; marks.push({ frame: f, beat: st.beat + 1, type: 'start' });
          }
        }
        if (f > fps * 300) break;
      }
      return { frames, marks, info, strip: strip ? strip.toDataURL('image/png') : null };
    },
  };
});
await page.evaluate(() => window.__deck.prepare());

// ── analysis ───────────────────────────────────────────────────────────────────
const sec = (f) => (f / fps).toFixed(2) + 's';

function jumps(luma) {
  const list = [];
  for (let i = 1; i < luma.length; i++) { const d = luma[i] - luma[i - 1]; if (Math.abs(d) >= JUMP) list.push({ frame: i + 1, from: luma[i - 1], to: luma[i] }); }
  return list;
}

/** A pop leaves its level by POP or more and is back near it within the window. */
function pops(luma) {
  const win = Math.max(2, Math.round(POP_WINDOW * fps)), list = [];
  let last = -99;
  for (let i = 0; i < luma.length - 2; i++) {
    const base = luma[i];
    for (let L = 2; L <= win && i + L < luma.length; L++) {
      let ex = 0;
      for (let k = i + 1; k < i + L; k++) if (Math.abs(luma[k] - base) > Math.abs(ex)) ex = luma[k] - base;
      if (Math.abs(ex) >= POP && Math.abs(luma[i + L] - base) <= 0.35 * Math.abs(ex) && Math.abs(luma[i + 1] - base) >= 0.5 * Math.abs(ex)) {
        if (i - last > 3) list.push({ frame: i + 2, frames: L - 1, by: ex, base });
        last = i; break;
      }
    }
  }
  return list;
}

/**
 * Flashes, WCAG 2.3.1 style: a flash is a pair of opposing changes in relative luminance of 0.10
 * or more where the darker state is below 0.80. Returns the most flashes in any one second.
 */
function flashes(Y) {
  const changes = [];
  let i = 0;
  while (i < Y.length - 1) {
    const dir = Math.sign(Y[i + 1] - Y[i]);
    if (!dir) { i++; continue; }
    let j = i;
    while (j < Y.length - 1 && (Math.sign(Y[j + 1] - Y[j]) === dir || Y[j + 1] === Y[j])) j++;
    const lo = Math.min(Y[i], Y[j]), hi = Math.max(Y[i], Y[j]);
    if (hi - lo >= 0.1 && lo < 0.8) changes.push((i + j) / 2 / fps);
    i = j;
  }
  let worst = 0, at = 0;
  for (const t0 of changes) { const n = Math.floor(changes.filter((t) => t >= t0 && t < t0 + 1).length / 2); if (n > worst) { worst = n; at = t0; } }
  return { worst, at };
}

function analyse(frames) {
  const luma = frames.map((r) => r[0]);
  const full = frames.map((r) => (r[1] + r[2] + r[3] + r[4]) / 4);
  const fl = [flashes(full), ...[1, 2, 3, 4].map((k) => flashes(frames.map((r) => r[k])))];
  const worst = fl.reduce((m, x) => (x.worst > m.worst ? x : m), fl[0]);
  return { luma, jumps: jumps(luma), pops: pops(luma), flashFull: fl[0].worst, flashWorst: worst.worst, flashAt: worst.at };
}

const save = (name, dataUrl) => fs.writeFileSync(path.join(out, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
function rng(s) { let x = (s * 2654435761) >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
const rand = rng(seed);

// ── run ────────────────────────────────────────────────────────────────────────
const scenes = (await page.evaluate(() => window.__deck.scenes.map((s) => ({ id: s.id, beats: s.beats })))).filter((s) => !only || s.id === only);
const allScenes = await page.evaluate(() => window.__deck.scenes.map((s) => ({ id: s.id, beats: s.beats.length })));
const report = { fps, size: [W, H], renderer, seed, scenes: [], transitions: [], determinism: [] };
const findings = [];
let fail = false;

// Reference fingerprints first, before anything has played.
const before = {};
for (const sc of allScenes) for (let b = 0; b < sc.beats; b++) before[`${sc.id}:${b}`] = await page.evaluate(([id, beat]) => window.__audit.still(id, beat), [sc.id, b]);

console.log('scene        beat  dur   peak change  jumps  pops  flashes/s  hold motion');
for (const sc of scenes) {
  const first = await page.evaluate((o) => window.__audit.run(o), { kind: 'scene', id: sc.id, fps, hold: HOLD });
  const an = analyse(first.frames);
  // Choose strip frames per beat from what was measured.
  const thumbs = [], rows = [];
  const starts = first.marks.filter((m) => m.type === 'start');
  starts.forEach((m, b) => {
    const settled = first.marks.find((x) => x.type === 'settled' && x.beat === b), end = first.marks.find((x) => x.type === 'holdEnd' && x.beat === b);
    const f0 = m.frame + 1, f1 = settled ? settled.frame : f0 + 1;
    for (let k = 0; k < 6; k++) { const f = Math.round(f0 + ((f1 - f0) * k) / 5); thumbs.push({ frame: f, slot: b * 12 + k, label: `beat ${b + 1}  ${sec(f - m.frame)}` }); }
    let peak = f0, best = -1;
    for (let f = f0; f <= f1; f++) if (first.frames[f - 1][5] > best) { best = first.frames[f - 1][5]; peak = f; }
    const step = Math.max(1, Math.round(fps / 30)), c0 = Math.max(f0, peak - step * 2);
    for (let k = 0; k < 6; k++) thumbs.push({ frame: c0 + k * step, slot: b * 12 + 6 + k, label: `beat ${b + 1}  ${sec(c0 + k * step - m.frame)}  +1/30s` });
    const inBeat = (x) => x.frame > m.frame && x.frame <= (end ? end.frame : first.frames.length);
    rows.push({ beat: b + 1, dur: sc.beats[b].dur, peak: best, jumps: an.jumps.filter(inBeat), pops: an.pops.filter(inBeat), holdMotion: end ? end.holdMotion : null, start: m.frame });
  });
  const second = await page.evaluate((o) => window.__audit.run(o), { kind: 'scene', id: sc.id, fps, hold: HOLD, thumbs });
  save(`${sc.id}.png`, second.strip);
  // Same input, same picture: the replay's measurements must match the first run.
  const replayDrift = Math.max(...first.frames.map((r, i) => Math.abs(r[0] - second.frames[i][0])));
  if (replayDrift > 0.75) { fail = true; findings.push(`NOT DETERMINISTIC  ${sc.id}: replaying the scene changed mean brightness by up to ${replayDrift.toFixed(2)}`); }

  for (const r of rows) {
    const still = r.holdMotion !== null && r.holdMotion < STILL;
    console.log(`${sc.id.padEnd(12)} ${String(r.beat).padEnd(5)} ${String(r.dur).padEnd(5)} ${r.peak.toFixed(2).padEnd(12)} ${String(r.jumps.length).padEnd(6)} ${String(r.pops.length).padEnd(5)} ${String(an.flashWorst).padEnd(10)} ${r.holdMotion === null ? '-' : r.holdMotion.toFixed(2)}${still ? '  STILL' : ''}`);
    for (const j of r.jumps) findings.push(`JUMP  ${sc.id} beat ${r.beat} at ${sec(j.frame - r.start)}: brightness ${j.from.toFixed(0)} → ${j.to.toFixed(0)} in one frame`);
    for (const p of r.pops) findings.push(`POP   ${sc.id} beat ${r.beat} at ${sec(p.frame - r.start)}: ${p.by > 0 ? '+' : ''}${p.by.toFixed(0)} from ${p.base.toFixed(0)}, back within ${p.frames} frame${p.frames > 1 ? 's' : ''}`);
    if (still) findings.push(`STILL ${sc.id} beat ${r.beat}: the picture barely moves during the hold (${r.holdMotion.toFixed(2)}); add drift, parallax or creep`);
  }
  if (an.flashWorst > 3) { fail = true; findings.push(`FLASH FAIL  ${sc.id}: ${an.flashWorst} flashes within one second near ${an.flashAt.toFixed(2)}s`); }
  report.scenes.push({ id: sc.id, frames: first.frames.length, flashes: an.flashWorst, beats: rows.map((r) => ({ beat: r.beat, peakChange: r.peak, jumps: r.jumps.length, pops: r.pops.length, holdMotion: r.holdMotion })), luma: an.luma.map((v) => +v.toFixed(1)) });

  // Random frames, full size: chosen by a seed, not by taste.
  for (let k = 0; k < randomCount; k++) {
    const f = 1 + Math.floor(rand() * (first.frames.length - 1));
    await page.evaluate((o) => window.__audit.run(o), { kind: 'scene', id: sc.id, fps, hold: HOLD, stopAt: f });
    await page.locator('#stage').screenshot({ path: path.join(out, `${sc.id}-random-${String(f).padStart(4, '0')}.png`) });
  }
}

console.log('\ntransition   into      dur   peak change  jumps  pops  flashes/s');
for (const sc of scenes) {
  const first = await page.evaluate((o) => window.__audit.run(o), { kind: 'transition', id: sc.id, fps, hold: 0 });
  if (!first) continue;
  const an = analyse(first.frames), n = Math.round(first.info.dur * fps);
  const thumbs = Array.from({ length: 12 }, (_, k) => ({ frame: Math.max(1, Math.round((n * (k + 0.5)) / 12)), slot: k, label: `p ${((k + 0.5) / 12).toFixed(2)}` }));
  const second = await page.evaluate((o) => window.__audit.run(o), { kind: 'transition', id: sc.id, fps, hold: 0, thumbs });
  save(`${sc.id}-enter-${first.info.name}.png`, second.strip);
  const peak = Math.max(...first.frames.map((r) => r[5]));
  console.log(`${first.info.name.padEnd(12)} ${sc.id.padEnd(9)} ${String(first.info.dur).padEnd(5)} ${peak.toFixed(2).padEnd(12)} ${String(an.jumps.length).padEnd(6)} ${String(an.pops.length).padEnd(5)} ${an.flashWorst}`);
  for (const j of an.jumps) findings.push(`JUMP  ${first.info.name} → ${sc.id} at ${sec(j.frame)} (p ${(j.frame / n).toFixed(2)}): brightness ${j.from.toFixed(0)} → ${j.to.toFixed(0)} in one frame`);
  for (const p of an.pops) findings.push(`POP   ${first.info.name} → ${sc.id} at ${sec(p.frame)}: ${p.by > 0 ? '+' : ''}${p.by.toFixed(0)} from ${p.base.toFixed(0)}, back within ${p.frames} frames`);
  if (an.flashWorst > 3) { fail = true; findings.push(`FLASH FAIL  ${first.info.name} → ${sc.id}: ${an.flashWorst} flashes within one second`); }
  report.transitions.push({ name: first.info.name, into: sc.id, dur: first.info.dur, peakChange: peak, jumps: an.jumps.length, pops: an.pops.length, flashes: an.flashWorst });
}

// A frame rendered on its own must match the same frame after everything else has played.
let worstDrift = 0;
for (const sc of [...allScenes].reverse()) for (let b = sc.beats - 1; b >= 0; b--) {
  const now = await page.evaluate(([id, beat]) => window.__audit.still(id, beat), [sc.id, b]);
  const ref = before[`${sc.id}:${b}`];
  let d = 0; for (let i = 0; i < ref.length; i++) d += Math.abs(ref[i] - now[i]); d /= ref.length;
  worstDrift = Math.max(worstDrift, d);
  report.determinism.push({ scene: sc.id, beat: b + 1, drift: +d.toFixed(3) });
  if (d > 0.75) { fail = true; findings.push(`NOT DETERMINISTIC  ${sc.id} beat ${b + 1}: the settled frame differs by ${d.toFixed(2)} after other scenes have played (stale buffer or state that is not reseeded)`); }
}

fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report));
await browser.close();

console.log(`\ndeterminism: worst drift of a settled frame after replaying everything = ${worstDrift.toFixed(3)} (limit 0.75)`);
console.log(findings.length ? '\nTo explain (intended, or a bug?):\n' + findings.map((f) => '  ' + f).join('\n') : '\nNo jumps, pops, flashes, still holds or state leaks found.');
console.log(`\nstrips → ${path.relative(process.cwd(), out)}/   (per beat: top row = six frames across the beat, bottom row = six consecutive frames at peak motion)${randomCount ? `\nrandom frames used seed ${seed}` : ''}`);
if (reportErrors(errors) || fail) process.exit(1);
