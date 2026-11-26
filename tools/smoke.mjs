// Drive the real, live deck like a presenter would and fail on any console error.
//
//   npm run build && npm run smoke
//
// Walks forward through every beat, back to the start, then opens the overview, notes and help.
// Catches the class of bug screenshots miss: warm-up, transitions, reverse navigation, the UI.

import fs from 'node:fs';
import path from 'node:path';
import { openDeck, args } from './browser.mjs';

const a = args();
const out = path.resolve('shots'); fs.mkdirSync(out, { recursive: true });
// The live deck (no ?headless): warm-up, frame loop, UI and audio all run.
const { browser, page, errors } = await openDeck({ width: 1280, height: 720, query: '?px=1', software: a.has('software'), extraArgs: ['--autoplay-policy=no-user-gesture-required'] });
const info = () => page.evaluate(() => { const d = window.__deck, i = d.info(); return { ...i, busy: !!d.trans }; });
const settle = async () => { for (let i = 0; i < 200; i++) { if (!(await info()).busy) return; await page.waitForTimeout(100); } throw new Error('transition never finished'); };

const total = await page.evaluate(() => window.__deck.scenes.reduce((n, s) => n + s.beats.length, 0));
const seen = [];
for (let i = 0; i < total - 1; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250); await settle(); const s = await info(); seen.push(`${s.scene}:${s.beat + 1}`); }
const end = await info();
if (end.index !== end.count - 1 || end.beat !== end.beats - 1) errors.push(`forward walk ended at ${end.scene}:${end.beat + 1}`);
await page.screenshot({ path: path.join(out, 'smoke-end.png') });

for (let i = 0; i < total - 1; i++) { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(250); await settle(); }
const start = await info();
if (start.index !== 0 || start.beat !== 0) errors.push(`backward walk ended at ${start.scene}:${start.beat + 1}`);

await page.keyboard.press('n'); await page.keyboard.press('?'); await page.waitForTimeout(200);
const notes = await page.locator('.notes p').textContent();
if (!notes) errors.push('notes panel is empty');
await page.screenshot({ path: path.join(out, 'smoke-notes.png') });
await page.keyboard.press('?'); await page.keyboard.press('n');
await page.keyboard.press('o'); await page.waitForTimeout(200);
const thumbs = await page.locator('.over .th').evaluateAll((els) => els.filter((e) => e.style.backgroundImage.startsWith('url("data:image')).length);
const count = await page.locator('.over button').count();
if (thumbs !== count) errors.push(`overview has ${thumbs}/${count} thumbnails`);
await page.screenshot({ path: path.join(out, 'smoke-overview.png') });
await page.locator('.over button').nth(count - 1).click(); await page.waitForTimeout(300); await settle();
if ((await info()).index !== count - 1) errors.push('overview jump did not land');
const hash = await page.evaluate(() => location.hash);
await browser.close();

console.log(`walked ${seen.length + 1} beats forward and back: ${seen.join(' ')}\noverview ${thumbs}/${count} thumbnails, hash after jump "${hash}"`);
if (errors.length) { console.log('\nProblems:\n' + [...new Set(errors)].map((e) => '  ' + e).join('\n')); process.exit(1); }
console.log('smoke test passed');
