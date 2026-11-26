// Export the deck as a video, frame-exactly.
//
//   npm run build && npm run film                    → dist/deck.mp4  (1920x1080, 60 fps)
//   npm run film -- --sub 8                          8 sub-frames per frame: real motion blur
//   npm run film -- --fps 30 --size 1280x720 --hold 1.5
//   npm run film -- --from shader --to field         part of the deck
//   npm run film -- --max 60                         squeeze under a size limit (MB) with a 2-pass encode
//
// Nothing is screen-recorded. The deck is stepped in fixed time increments in headless Chrome,
// each frame is captured as a lossless PNG and piped to ffmpeg, so the result is identical on
// every run and never drops a frame however slow a scene is to render.
//
// Timing follows the deck's own autoplay rule: each beat plays, holds, then advances. --hold
// caps the hold (default: each beat's own `hold`). Transitions run at their authored length.
//
// The video is silent: the deck's sound is real-time Web Audio and is not rendered offline.
//
// Needs ffmpeg on the PATH.

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { openDeck, reportErrors, args } from './browser.mjs';

const a = args();
const fps = +a.get('fps', 60);
const [W, H] = a.get('size', '1920x1080').split('x').map(Number);
const sub = +a.get('sub', 1);
const shutter = +a.get('shutter', 0.5);
const holdCap = a.get('hold', null) === null ? Infinity : +a.get('hold');
const tail = +a.get('tail', 1);            // extra seconds on the last frame
const crf = a.get('crf', '16');
const outFile = path.resolve(a.get('out', 'dist/deck.mp4'));
const maxMB = a.get('max', null);

if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.error('ffmpeg was not found on the PATH. Install it (e.g. `brew install ffmpeg`) and try again.'); process.exit(1); }

const { browser, page, errors, renderer, software } = await openDeck({ width: W, height: H, software: a.has('software') });
console.log(`renderer: ${renderer}${software ? '  (software rendering: this will be slow)' : ''}`);
await page.evaluate(() => window.__deck.prepare());
const ids = await page.evaluate(() => window.__deck.scenes.map((s) => s.id));
const from = a.get('from', ids[0]), to = a.get('to', ids[ids.length - 1]);
if (!ids.includes(from) || !ids.includes(to)) { console.error(`unknown scene; choose from: ${ids.join(', ')}`); process.exit(1); }
await page.evaluate((id) => window.__deck.begin(id), from);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
// bt709 tags and limited range so players and social platforms show the colours as authored.
const colour = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, ...colour, '-movflags', '+faststart', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
const closed = new Promise((r) => ff.on('close', r));

// Chrome's "optimize for speed" PNG path is still lossless but about four times faster than a normal
// screenshot (≈70 ms instead of ≈280 ms per 1080p frame); capture, not rendering, is the bottleneck.
const cdp = await page.context().newCDPSession(page);
const grab = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })).data, 'base64');
const t0 = Date.now();
let frames = 0, tailLeft = Math.round(tail * fps), done = false;
while (!done) {
  // One frame of deck time, then decide whether to advance, exactly as autoplay would.
  const st = await page.evaluate(({ dt, sub, shutter, holdCap, to }) => {
    const d = window.__deck;
    d.frame(dt, { sub, shutter });
    const s = d.state();
    const settled = !s.transition && s.p >= 1 && s.since >= s.delay + s.dur + Math.min(s.hold, holdCap);
    const end = settled && (s.last || (s.scene === to && s.beat === s.beats - 1));
    if (settled && !end) d.advance();
    return { end, scene: s.scene, beat: s.beat };
  }, { dt: 1 / fps, sub, shutter, holdCap, to });
  const png = await grab();
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  frames++;
  if (frames % (fps * 2) === 0) process.stdout.write(`\r${(frames / fps).toFixed(0)} s  ${st.scene}:${st.beat + 1}  ${((Date.now() - t0) / frames).toFixed(0)} ms/frame   `);
  if (st.end && --tailLeft <= 0) done = true;
  if (frames > fps * 1800) { console.error('\nstopped after 30 minutes of deck time'); done = true; }
}
ff.stdin.end();
const code = await closed;
await browser.close();
process.stdout.write('\r' + ' '.repeat(60) + '\r');
if (code !== 0) { console.error('ffmpeg failed'); process.exit(1); }

// Optional size-capped copy (two-pass), e.g. for a platform upload limit.
let capped = null;
if (maxMB) {
  capped = outFile.replace(/\.mp4$/, `.${maxMB}mb.mp4`);
  const kbps = Math.floor((+maxMB * 8192 * 0.96) / (frames / fps));
  const pass = (n, dest) => spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', outFile, '-c:v', 'libx264', '-preset', 'slow', '-b:v', kbps + 'k', '-maxrate', Math.round(kbps * 1.45) + 'k', '-bufsize', kbps * 2 + 'k', '-pass', String(n), '-passlogfile', outFile + '.2p', '-pix_fmt', 'yuv420p', '-an', ...(n === 1 ? ['-f', 'mp4', process.platform === 'win32' ? 'NUL' : '/dev/null'] : ['-movflags', '+faststart', dest])], { stdio: 'inherit' });
  pass(1); pass(2, capped);
  for (const f of fs.readdirSync(path.dirname(outFile))) if (f.startsWith(path.basename(outFile) + '.2p')) fs.rmSync(path.join(path.dirname(outFile), f));
}

// Contact sheet at 2 frames per second: the whole cut on one page.
const sheet = outFile.replace(/\.mp4$/, '.contact.png');
const cols = 10, rows = Math.ceil((frames / fps) * 2 / cols);
spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', outFile, '-vf', `fps=2,scale=320:-1,tile=${cols}x${rows}`, '-frames:v', '1', sheet], { stdio: 'inherit' });

// Verify rather than assume: stream facts, a full decode, and the frame count.
const probe = (f) => spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_read_frames:format=duration,size', '-of', 'json', f], { encoding: 'utf8' });
let bad = false;
for (const f of [outFile, capped].filter(Boolean)) {
  const j = JSON.parse(probe(f).stdout || '{}'), s = (j.streams || [])[0] || {}, decode = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'null', '-'], { encoding: 'utf8' });
  const ok = +s.nb_read_frames === frames && decode.status === 0 && !decode.stderr.trim();
  bad = bad || !ok;
  console.log(`${path.relative(process.cwd(), f)}  ${s.codec_name} ${s.profile} ${s.pix_fmt} ${s.width}x${s.height} ${s.r_frame_rate} fps  ${(+j.format?.duration || 0).toFixed(2)} s  ${s.nb_read_frames}/${frames} frames  ${((+j.format?.size || 0) / 1048576).toFixed(1)} MB  decode ${decode.status === 0 && !decode.stderr.trim() ? 'ok' : 'FAILED'}`);
}
console.log(`${path.relative(process.cwd(), sheet)}  (2 fps contact sheet)\n${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${((Date.now() - t0) / frames).toFixed(0)} ms/frame${sub > 1 ? `, ${sub} sub-frames, shutter ${shutter}` : ''}. Silent: sound is not rendered.`);
if (reportErrors(errors) || bad) process.exit(1);
