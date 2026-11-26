// Screenshot every beat of every scene, deterministically.
//
//   npm run build && npm run shoot                 → shots/<scene>-<beat>.png  + shots/contact.png
//   npm run shoot -- --scene shader                only one scene
//   npm run shoot -- --trans                       also mid-transition frames (p = 0.5)
//   npm run shoot -- --size 1280x720
//
// This is the feedback loop that makes shader work tractable: change code, rebuild, look at
// every state of the deck at once. It relies on ?headless (no frame loop) and deck.seek().
//
//   npm run shoot -- --software                    SwiftShader instead of the GPU
//
// The thumbnails in contact.png are about phone width: if a headline is not readable there,
// it is not readable on a phone or from the back of a room.

import fs from 'node:fs';
import path from 'node:path';
import { openDeck, reportErrors, args } from './browser.mjs';

const a = args();
const [W, H] = a.get('size', '1600x900').split('x').map(Number);
const only = a.get('scene', null);
const withTrans = a.has('trans');
const out = path.resolve('shots');
fs.mkdirSync(out, { recursive: true });

// Uses the real GPU when there is one; --software forces SwiftShader (identical on every machine).
const { browser, page, errors } = await openDeck({ file: a.get('file', 'dist/deck.html'), width: W, height: H, software: a.has('software') });

const scenes = await page.evaluate(() => window.__deck.scenes.map((s) => ({ id: s.id, beats: s.beats.length })));
const shots = [];
for (const sc of scenes) {
  if (only && sc.id !== only) continue;
  for (let b = 0; b < sc.beats; b++) {
    await page.evaluate(([id, beat]) => window.__deck.seek(id, beat, 6), [sc.id, b]);
    const name = `${sc.id}-${b + 1}.png`;
    await page.locator('#stage').screenshot({ path: path.join(out, name) });
    shots.push(name);
  }
  if (withTrans) {
    const name = await page.evaluate((id) => window.__deck.seekTransition && window.__deck.seekTransition(id, 0.5), sc.id);
    if (name) { const f = `${sc.id}-0-enter.png`; await page.locator('#stage').screenshot({ path: path.join(out, f) }); shots.push(f); }
  }
}

// Contact sheet: every shot on one page, so a glance covers the whole deck.
const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 } });
// (data: URIs, because a page made with setContent may not load file:// images)
const cells = shots.map((s) => `<figure><img src="data:image/png;base64,${fs.readFileSync(path.join(out, s)).toString('base64')}"><figcaption>${s.replace('.png', '')}</figcaption></figure>`).join('');
await sheet.setContent(`<style>body{margin:16px;background:#111;color:#aaa;font:12px system-ui;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0}img{width:100%;display:block}figcaption{padding:4px 0}</style>${cells}`);
await sheet.waitForFunction(() => [...document.images].every((i) => i.complete));
await sheet.screenshot({ path: path.join(out, 'contact.png'), fullPage: true });
await browser.close();

console.log(`${shots.length} shots → ${path.relative(process.cwd(), out)}/  (contact.png has them all)`);
if (reportErrors(errors)) process.exitCode = 1;
