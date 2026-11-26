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
// Needs Playwright:  npm i -D playwright   (uses your installed Chrome if the bundled browser is missing)

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i < 0 ? def : argv[i + 1]; };
const [W, H] = opt('size', '1600x900').split('x').map(Number);
const only = opt('scene', null);
const withTrans = argv.includes('--trans');
const file = path.resolve(opt('file', 'dist/deck.html'));
const out = path.resolve('shots');
fs.mkdirSync(out, { recursive: true });

const launch = async () => {
  const flags = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  try { return await chromium.launch({ args: flags }); } catch { return chromium.launch({ channel: 'chrome', args: flags }); }
};

const browser = await launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GPU stall due to ReadPixels/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(file).href + '?headless&px=1');
await page.waitForFunction('window.ready === true', null, { timeout: 120000 });

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
if (errors.length) { console.log('\nConsole problems:\n' + [...new Set(errors)].map((e) => '  ' + e).join('\n')); process.exitCode = 1; }
